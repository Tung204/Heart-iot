import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, gt, inArray, isNotNull, isNull, lte, lt, or, sql } from 'drizzle-orm';
import { idSchema, isoDateTimeSchema, isSyntheticDataSource } from '@heart-iot/contracts';
import type {
  Coverage,
  DailySummary,
  MeasurementGap,
  MeasurementPoint,
  MeasurementsResponse,
} from '@heart-iot/contracts/measurements';
import type { InsightsQuery, InsightsResponse } from '@heart-iot/contracts/insights';
import { DB, type AppDb } from '../database/database';
import {
  deviceAssignments,
  incidents,
  telemetry,
  type TelemetryRow,
} from '../database/schema';
import { AccessService } from '../access/access.service';
import { AuditService } from '../access/audit.service';
import { AppError } from '../common/app-error';
import { decodeCursor } from '../common/pagination';
import { PolicyService } from '../policy/policy.service';
import {
  buildDailyInsights,
  buildInsightDayWindows,
  buildInsightNotes,
  coverageCounts,
  summarizeInsights,
  STEPS_GAP_INTERVALS,
  type InsightIncidentRow,
  type InsightTelemetryRow,
} from './insights';
import { zonedDayToUtcRange } from './time-utils';

/**
 * Truy vấn đo lường — semantics v1 (R-04, docs/04):
 * - Mỗi envelope là một snapshot tại `measured_at`; coverage đếm snapshot hợp lệ
 *   theo `expectedIntervalSeconds` (heartbeatIntervalSeconds của policy), không
 *   gộp/trung bình mẫu ở endpoint measurements.
 * - Bản ghi `measured_at: null` / `clock_status: unsynced` không vào timeline,
 *   đếm `excludedUnsyncedCount`; nếu cả khoảng không có mốc tin cậy thì gap có
 *   lý do `clock_unsynced`. Không bịa mẫu.
 * - Bản ghi `is_quarantined = true` (giờ đo lệch quá dung sai hoặc ngoài
 *   assignment) bị loại khỏi **mọi** đường đọc telemetry; mẫu có
 *   `measured_at > now` cũng không được tính cho tới khi thời gian thật đi qua.
 * - Cursor ổn định theo (measuredAt, id).
 */

const MAX_WINDOW_MS = 31 * 24 * 3600 * 1000;
const DEFAULT_WINDOW_MS = 24 * 3600 * 1000;

export const CSV_HEADER = [
  'measured_at',
  'received_at',
  'heart_rate_bpm',
  'heart_rate_quality',
  'motion_quality',
  'steps_since_boot',
  'battery_percent',
  'clock_status',
  'is_late',
  'is_quarantined',
  'source',
  'is_synthetic',
];

@Injectable()
export class MeasurementsService {
  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly policy: PolicyService,
  ) {}

  // ---------------------------------------------------------------------------
  // GET /subjects/:id/measurements
  // ---------------------------------------------------------------------------

  async list(
    userId: string,
    subjectId: string,
    query: { from?: string; to?: string; limit: number; cursor?: string },
  ): Promise<MeasurementsResponse> {
    const requestedFrom = query.from ? new Date(query.from) : null;
    // Thiếu quyền xem số đo → 403 nghiệp vụ; cửa sổ mặc định kẹp theo mốc chia sẻ
    // (không 403 khi caregiver vừa được accept) còn `from` chỉ định sớm hơn quyền vẫn bị từ chối.
    const { effectiveFrom } = await this.access.requireMeasurementsHistory(
      userId,
      subjectId,
      requestedFrom ?? undefined,
    );
    const { from, to } = resolveWindow(query.from, query.to);
    const windowFrom = from < effectiveFrom ? effectiveFrom : from;
    // Trần cửa sổ telemetry là hiện tại: mẫu `measured_at` tương lai không được
    // đếm vào coverage/gap dù client xin `to` xa hơn.
    const coverageTo = new Date(
      Math.max(windowFrom.getTime(), Math.min(to.getTime(), Date.now())),
    );
    const policy = await this.policy.getActive();
    const intervalSeconds = policy.value.heartbeatIntervalSeconds;
    const assignmentIds = await this.assignmentIdsForSubject(subjectId);

    const syncedBase = and(
      inArray(telemetry.assignmentId, assignmentIds),
      eq(telemetry.isQuarantined, false),
      isNotNull(telemetry.measuredAt),
      gte(telemetry.measuredAt, windowFrom),
      lte(telemetry.measuredAt, coverageTo),
    );

    let pageWhere: ReturnType<typeof and> | undefined = syncedBase;
    if (query.cursor) {
      const cursor = decodeMeasurementCursor(query.cursor);
      pageWhere = and(
        syncedBase,
        or(
          gt(telemetry.measuredAt, cursor.measuredAt),
          and(eq(telemetry.measuredAt, cursor.measuredAt), gt(telemetry.id, cursor.id)),
        ),
      );
    }

    const [pageRows, windowRows, unsyncedCount] = await Promise.all([
      this.db
        .select()
        .from(telemetry)
        .where(pageWhere)
        .orderBy(asc(telemetry.measuredAt), asc(telemetry.id))
        .limit(query.limit + 1),
      this.db
        .select({ measuredAt: telemetry.measuredAt })
        .from(telemetry)
        .where(syncedBase)
        .orderBy(asc(telemetry.measuredAt)),
      this.countUnsyncedInWindow(assignmentIds, windowFrom, coverageTo),
    ]);

    const hasMore = pageRows.length > query.limit;
    const items = pageRows.slice(0, query.limit);
    const lastItem = items[items.length - 1];
    const measuredAts = windowRows
      .map((row) => row.measuredAt)
      .filter((value): value is Date => value !== null);

    return {
      items: items.map(toMeasurementPoint),
      nextCursor: hasMore && lastItem?.measuredAt
        ? encodeMeasurementCursor(lastItem.measuredAt, lastItem.id)
        : null,
      coverage: computeCoverage(windowFrom, coverageTo, intervalSeconds, measuredAts.length),
      gaps: computeGaps(windowFrom, coverageTo, intervalSeconds, measuredAts, unsyncedCount),
      excludedUnsyncedCount: unsyncedCount,
      nextCursorMeta:
        hasMore && lastItem?.measuredAt
          ? { measuredAt: lastItem.measuredAt.toISOString(), id: lastItem.id }
          : undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // GET /subjects/:id/daily-summary
  // ---------------------------------------------------------------------------

  async dailySummary(
    userId: string,
    subjectId: string,
    date: string,
    /** Cho scheduler/test: mốc "hiện tại" cố định thay vì đồng hồ hệ thống. */
    now: Date = new Date(),
  ): Promise<DailySummary> {
    const { access, effectiveFrom } = await this.access.requireMeasurementsHistory(
      userId,
      subjectId,
      undefined,
    );
    const { from, to } = zonedDayToUtcRange(date, access.subject.timezone);
    if (from.getTime() > now.getTime()) {
      throw AppError.validation('Ngày yêu cầu nằm trong tương lai.');
    }
    if (to.getTime() <= effectiveFrom.getTime()) {
      throw AppError.forbidden('Ngày yêu cầu nằm trước mốc chia sẻ dữ liệu.', {
        effectiveFrom: effectiveFrom.toISOString(),
      });
    }
    // Ngày có mốc chia sẻ ở giữa (thường là hôm nay): chỉ tính phần sau khi được chia sẻ.
    const windowFrom = from < effectiveFrom ? effectiveFrom : from;
    // Ngày đang diễn ra: mọi phép tính telemetry chỉ tới hiện tại, không tới cuối
    // ngày; mẫu tương lai không được kéo coverage/lastSeenAt về tương lai.
    const coverageTo = to.getTime() > now.getTime() ? now : to;

    const policy = await this.policy.getActive();
    const intervalSeconds = policy.value.heartbeatIntervalSeconds;
    const assignmentIds = await this.assignmentIdsForSubject(subjectId);

    const dayRows = await this.db
      .select()
      .from(telemetry)
      .where(
        and(
          inArray(telemetry.assignmentId, assignmentIds),
          eq(telemetry.isQuarantined, false),
          isNotNull(telemetry.measuredAt),
          gte(telemetry.measuredAt, windowFrom),
          lt(telemetry.measuredAt, coverageTo),
        ),
      )
      .orderBy(asc(telemetry.measuredAt), asc(telemetry.id));

    const [unsyncedCount, incidentRows] = await Promise.all([
      this.countUnsyncedInWindow(assignmentIds, windowFrom, coverageTo),
      this.db
        .select({ state: incidents.state })
        .from(incidents)
        .where(
          and(
            eq(incidents.subjectId, subjectId),
            gte(incidents.detectedAt, from),
            lt(incidents.detectedAt, to),
          ),
        ),
    ]);

    const measuredAts = dayRows
      .map((row) => row.measuredAt)
      .filter((value): value is Date => value !== null);
    const lastMeasured = measuredAts.length > 0 ? measuredAts[measuredAts.length - 1] : null;
    const synthetic = dayRows.some((row) => isSyntheticDataSource(row.source));

    return {
      date,
      timezone: access.subject.timezone,
      heartRate: computeHeartRate(dayRows),
      steps: computeSteps(dayRows, intervalSeconds),
      coverage: computeCoverage(windowFrom, coverageTo, intervalSeconds, measuredAts.length),
      gaps: computeGaps(windowFrom, coverageTo, intervalSeconds, measuredAts, unsyncedCount),
      incidents: {
        total: incidentRows.length,
        resolved: incidentRows.filter((row) => row.state === 'resolved').length,
      },
      lastSeenAt: lastMeasured ? lastMeasured.toISOString() : null,
      batteryPercent: dayRows.length > 0 ? (dayRows[dayRows.length - 1]?.batteryPercent ?? null) : null,
      source: synthetic ? 'synthetic' : 'device',
    };
  }

  // ---------------------------------------------------------------------------
  // GET /subjects/:id/insights
  // ---------------------------------------------------------------------------

  /**
   * Xu hướng 7..30 ngày (FR-05). Một query telemetry + một query incidents cho cả
   * cửa sổ; không gọi dailySummary nhiều lần.
   *
   * Quyền: `requireMeasurementsHistory` chặn hẳn caregiver không được xem số đo (403),
   * và không truyền `from` nên cửa sổ sớm hơn mốc chia sẻ bị **cắt** thay vì 403;
   * ngày hoàn toàn trước mốc chia sẻ vẫn trả về dạng rỗng.
   * Ngày đang diễn ra chỉ tính tới hiện tại.
   */
  async insights(
    userId: string,
    subjectId: string,
    query: InsightsQuery,
  ): Promise<InsightsResponse> {
    const now = new Date();
    const { access, effectiveFrom } = await this.access.requireMeasurementsHistory(
      userId,
      subjectId,
      null,
    );
    const timezone = access.subject.timezone;
    const windows = buildInsightDayWindows(query.days, now, timezone);
    const firstWindow = windows[0];
    if (!firstWindow) throw AppError.validation('Khoảng ngày không hợp lệ.');

    // Cắt cả truy vấn theo mốc chia sẻ: dữ liệu trước đó không rời khỏi DB.
    const queryFrom = new Date(Math.max(firstWindow.from.getTime(), effectiveFrom.getTime()));
    const assignmentIds = await this.assignmentIdsForSubject(subjectId);
    const policy = await this.policy.getActive();
    const intervalSeconds = policy.value.heartbeatIntervalSeconds;
    const hasWindow = queryFrom.getTime() <= now.getTime();

    const [telemetryRows, incidentRows] = await Promise.all([
      assignmentIds.length === 0 || !hasWindow
        ? Promise.resolve([] as InsightTelemetryRow[])
        : this.db
            .select({
              measuredAt: telemetry.measuredAt,
              bootId: telemetry.bootId,
              metrics: telemetry.metrics,
              quality: telemetry.quality,
              source: telemetry.source,
            })
            .from(telemetry)
            .where(
              and(
                inArray(telemetry.assignmentId, assignmentIds),
                eq(telemetry.isQuarantined, false),
                isNotNull(telemetry.measuredAt),
                gte(telemetry.measuredAt, queryFrom),
                lte(telemetry.measuredAt, now),
              ),
            )
            .orderBy(asc(telemetry.measuredAt), asc(telemetry.id)),
      !hasWindow
        ? Promise.resolve([] as InsightIncidentRow[])
        : this.db
            .select({ detectedAt: incidents.detectedAt, state: incidents.state })
            .from(incidents)
            .where(
              and(
                eq(incidents.subjectId, subjectId),
                gte(incidents.detectedAt, queryFrom),
                lte(incidents.detectedAt, now),
              ),
            )
            .orderBy(asc(incidents.detectedAt)),
    ]);

    const days = buildDailyInsights({
      windows,
      telemetryRows,
      incidentRows,
      effectiveFrom,
      now,
      intervalSeconds,
    });
    const summary = summarizeInsights(days);

    return {
      subjectId,
      timezone,
      from: firstWindow.from.toISOString(),
      to: now.toISOString(),
      days,
      summary,
      notes: buildInsightNotes(days, summary),
    };
  }

  // ---------------------------------------------------------------------------
  // GET /subjects/:id/export.csv
  // ---------------------------------------------------------------------------

  async exportCsv(
    userId: string,
    subjectId: string,
    query: { from?: string; to?: string },
  ): Promise<{ csv: string; filename: string }> {
    const { from, to } = resolveWindow(query.from, query.to);
    await this.access.requireMeasurementsHistory(userId, subjectId, from);
    const assignmentIds = await this.assignmentIdsForSubject(subjectId);
    // CSV cũng là đường đọc: không xuất mẫu cách ly hoặc mẫu tương lai.
    const windowTo = to.getTime() > Date.now() ? new Date() : to;

    const rows = await this.db
      .select()
      .from(telemetry)
      .where(
        and(
          inArray(telemetry.assignmentId, assignmentIds),
          eq(telemetry.isQuarantined, false),
          or(
            and(
              isNotNull(telemetry.measuredAt),
              gte(telemetry.measuredAt, from),
              lte(telemetry.measuredAt, windowTo),
            ),
            and(
              isNull(telemetry.measuredAt),
              gte(telemetry.receivedAt, from),
              lte(telemetry.receivedAt, windowTo),
            ),
          ),
        ),
      )
      .orderBy(
        sql`${telemetry.measuredAt} asc nulls last, ${telemetry.receivedAt} asc, ${telemetry.id} asc`,
      );

    const lines = [CSV_HEADER.join(',')];
    for (const row of rows) {
      lines.push(
        toCsvRow([
          row.measuredAt ? row.measuredAt.toISOString() : null,
          row.receivedAt.toISOString(),
          row.metrics.heart_rate_bpm,
          row.quality.heart_rate,
          row.quality.motion,
          row.metrics.steps_since_boot,
          row.batteryPercent,
          row.clockStatus,
          row.isLate,
          row.isQuarantined,
          row.source,
          isSyntheticDataSource(row.source),
        ]),
      );
    }

    await this.audit.record({
      actorUserId: userId,
      actorKind: 'user',
      action: 'measurement.export',
      targetType: 'subject',
      targetId: subjectId,
      outcome: 'success',
      metadata: { from: from.toISOString(), to: to.toISOString(), rowCount: rows.length },
    });

    const datePart = (d: Date): string => d.toISOString().slice(0, 10);
    return {
      csv: lines.join('\r\n'),
      filename: `subject-${subjectId}-${datePart(from)}-${datePart(to)}.csv`,
    };
  }

  // ---------------------------------------------------------------------------
  // Nội bộ
  // ---------------------------------------------------------------------------

  private async assignmentIdsForSubject(subjectId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: deviceAssignments.id })
      .from(deviceAssignments)
      .where(eq(deviceAssignments.subjectId, subjectId));
    return rows.map((row) => row.id);
  }

  private async countUnsyncedInWindow(
    assignmentIds: string[],
    from: Date,
    to: Date,
  ): Promise<number> {
    if (assignmentIds.length === 0) return 0;
    const rows = await this.db
      .select({ id: telemetry.id })
      .from(telemetry)
      .where(
        and(
          inArray(telemetry.assignmentId, assignmentIds),
          eq(telemetry.isQuarantined, false),
          or(isNull(telemetry.measuredAt), eq(telemetry.clockStatus, 'unsynced')),
          gte(telemetry.receivedAt, from),
          lte(telemetry.receivedAt, to),
        ),
      );
    return rows.length;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveWindow(fromRaw?: string, toRaw?: string): { from: Date; to: Date } {
  const now = new Date();
  const from = fromRaw ? new Date(fromRaw) : new Date(now.getTime() - DEFAULT_WINDOW_MS);
  const to = toRaw ? new Date(toRaw) : now;
  if (from.getTime() >= to.getTime()) {
    throw AppError.validation('from phải sớm hơn to.');
  }
  if (to.getTime() - from.getTime() > MAX_WINDOW_MS) {
    throw AppError.validation('Khoảng thời gian tối đa là 31 ngày.');
  }
  return { from, to };
}

function encodeMeasurementCursor(measuredAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ m: measuredAt.toISOString(), i: id }), 'utf8').toString(
    'base64url',
  );
}

function decodeMeasurementCursor(cursor: string): { measuredAt: Date; id: string } {
  const value = decodeCursor(cursor);
  const measuredAtRaw = value.m;
  const idRaw = value.i;
  if (typeof measuredAtRaw !== 'string' || typeof idRaw !== 'string') {
    throw AppError.validation('Cursor phân trang không hợp lệ.');
  }
  const measuredAt = isoDateTimeSchema.safeParse(measuredAtRaw);
  if (!measuredAt.success || !idSchema.safeParse(idRaw).success) {
    throw AppError.validation('Cursor phân trang không hợp lệ.');
  }
  return { measuredAt: new Date(measuredAt.data), id: idRaw };
}

function toMeasurementPoint(row: TelemetryRow): MeasurementPoint {
  return {
    measuredAt: row.measuredAt ? row.measuredAt.toISOString() : null,
    receivedAt: row.receivedAt.toISOString(),
    heartRateBpm: row.metrics.heart_rate_bpm,
    heartRateQuality: row.quality.heart_rate,
    motionQuality: row.quality.motion,
    stepsSinceBoot: row.metrics.steps_since_boot,
    batteryPercent: row.batteryPercent,
    isLate: row.isLate,
    isQuarantined: row.isQuarantined,
  };
}

function computeCoverage(
  from: Date,
  to: Date,
  intervalSeconds: number,
  observedCount: number,
): Coverage {
  // Một công thức duy nhất với insights (coverageCounts), tránh lệch cách tính.
  const { percent, expectedCount } = coverageCounts(from, to, intervalSeconds, observedCount);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    expectedIntervalSeconds: intervalSeconds,
    observedCount,
    expectedCount,
    percent,
  };
}

function computeGaps(
  from: Date,
  to: Date,
  intervalSeconds: number,
  measuredAts: Date[],
  excludedUnsyncedCount: number,
): MeasurementGap[] {
  const gaps: MeasurementGap[] = [];
  if (to.getTime() <= from.getTime()) return gaps;
  const thresholdMs = intervalSeconds * 1.5 * 1000;
  if (measuredAts.length === 0) {
    gaps.push({
      from: from.toISOString(),
      to: to.toISOString(),
      reason: excludedUnsyncedCount > 0 ? 'clock_unsynced' : 'no_data',
    });
    return gaps;
  }
  const first = measuredAts[0];
  if (!first) return gaps;
  if (first.getTime() - from.getTime() > thresholdMs) {
    gaps.push({ from: from.toISOString(), to: first.toISOString(), reason: 'no_data' });
  }
  for (let i = 1; i < measuredAts.length; i += 1) {
    const current = measuredAts[i];
    const previous = measuredAts[i - 1];
    if (!current || !previous) continue;
    const delta = current.getTime() - previous.getTime();
    if (delta > thresholdMs) {
      gaps.push({
        from: previous.toISOString(),
        to: current.toISOString(),
        reason: 'no_data',
      });
    }
  }
  const last = measuredAts[measuredAts.length - 1];
  if (!last) return gaps;
  if (to.getTime() - last.getTime() > thresholdMs) {
    gaps.push({ from: last.toISOString(), to: to.toISOString(), reason: 'no_data' });
  }
  return gaps;
}

function computeHeartRate(rows: TelemetryRow[]): DailySummary['heartRate'] {
  const values: number[] = [];
  for (const row of rows) {
    if (row.quality.heart_rate === 'valid' && row.metrics.heart_rate_bpm !== null) {
      values.push(row.metrics.heart_rate_bpm);
    }
  }
  if (values.length === 0) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return {
    avg: Math.round((sum / values.length) * 10) / 10,
    min: Math.min(...values),
    max: Math.max(...values),
    validSamples: values.length,
    invalidSamples: rows.length - values.length,
  };
}

function computeSteps(
  rows: TelemetryRow[],
  intervalSeconds: number,
): DailySummary['steps'] {
  if (rows.length === 0) {
    return {
      total: 0,
      completeness: 'unavailable',
      notes: ['Không có dữ liệu đo trong ngày.'],
    };
  }
  let total = 0;
  let completeness: 'complete' | 'partial' = 'complete';
  let positiveDelta = false;
  const notes: string[] = [];
  const gapMs = intervalSeconds * STEPS_GAP_INTERVALS * 1000;
  const lastByBoot = new Map<string, { steps: number; measuredAt: Date }>();
  for (const row of rows) {
    if (!row.measuredAt) continue;
    // Cảm biến chuyển động lỗi không có nghĩa là người ít vận động.
    if (row.quality.motion === 'sensor_error') continue;
    const previous = lastByBoot.get(row.bootId);
    if (previous) {
      const delta = row.metrics.steps_since_boot - previous.steps;
      const elapsedMs = row.measuredAt.getTime() - previous.measuredAt.getTime();
      if (elapsedMs > gapMs) {
        // Mất mẫu dài: bỏ đoạn chênh lệch thay vì cộng toàn bộ vào ngày nhận mẫu.
        completeness = 'partial';
        notes.push(
          `Có khoảng mất dữ liệu dài hơn ${STEPS_GAP_INTERVALS} nhịp tim; bỏ bước bắc qua khoảng này.`,
        );
      } else if (delta < 0) {
        completeness = 'partial';
        notes.push(
          `Counter steps giảm trong boot ${row.bootId.slice(0, 8)} (${previous.steps} → ${row.metrics.steps_since_boot}); bỏ delta âm, có thể đã reset.`,
        );
      } else if (delta > 0) {
        total += delta;
        positiveDelta = true;
      }
    }
    lastByBoot.set(row.bootId, {
      steps: row.metrics.steps_since_boot,
      measuredAt: row.measuredAt,
    });
  }
  // Chỉ một mốc của boot hoặc toàn delta 0: không đủ căn cứ để nói "đủ dữ liệu".
  if (!positiveDelta) completeness = 'partial';
  return { total, completeness, notes: [...new Set(notes)] };
}

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function toCsvRow(values: Array<string | number | boolean | null>): string {
  return values.map((value) => csvCell(value === null || value === undefined ? '' : String(value))).join(',');
}
