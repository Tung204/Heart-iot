import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import {
  INCIDENT_OPEN_STATES,
  isSyntheticDataSource,
  type UserSummary,
} from '@heart-iot/contracts';
import {
  VISIT_REPORT_DEFAULT_DAYS,
  VISIT_REPORT_DISCLAIMER,
  VISIT_REPORT_GAP_HOURS,
  VISIT_REPORT_LOW_COVERAGE_PERCENT,
  VISIT_REPORT_MAX_ATTENTION_POINTS,
  VISIT_REPORT_MAX_DAYS,
  visitReportSchema,
  type VisitReport,
  type VisitReportAttentionPoint,
  type VisitReportGap,
  type VisitReportIncidentItem,
  type VisitReportIncidents,
  type VisitReportQuery,
  type VisitReportSummary,
} from '@heart-iot/contracts/reports';
import { DB, type AppDb } from '../database/database';
import { deviceAssignments, incidents, telemetry } from '../database/schema';
import { AccessService } from '../access/access.service';
import { AppError } from '../common/app-error';
import { addDays, daysBetweenInclusive, formatDateVi } from '../common/local-date';
import { PolicyService } from '../policy/policy.service';
import {
  aggregateStepsByWindow,
  findInsightWindow,
  insightHeartRate,
  localDateKey,
  type DailyStepsAggregate,
  type InsightDayWindow,
  type InsightTelemetryRow,
} from '../measurements/insights';
import { isValidTimezone, zonedDayToUtcRange } from '../measurements/time-utils';

/**
 * Phiếu đi khám 1 trang (FR-16) + điểm chú ý (FR-22).
 *
 * Quyền: dùng `requireMeasurementsHistory` như mọi API đọc số đo — chủ hồ sơ
 * luôn được; người thân thiếu `canViewMeasurements` → 403; admin/người ngoài
 * không có link → 404. Cửa sổ dữ liệu bị cắt theo `sharedFrom`/`historyDays`
 * thay vì 403 khi kỳ chỉ vượt mốc chia sẻ một phần; kỳ hoàn toàn trước mốc
 * chia sẻ → 422 (không có ngày hợp lệ).
 *
 * Số liệu:
 * - Chỉ mẫu đã đồng bộ (`measured_at` khác null), không cách ly, không vượt
 *   hiện tại; không bịa mẫu cho ngày trống.
 * - Nhịp tim chỉ từ mẫu `quality.heart_rate === 'valid'`.
 * - Bước dùng delta `steps_since_boot` theo từng boot (cùng helper insights).
 * - Khoảng thiếu >= 6 giờ trong kỳ, kể cả phần đầu/cuối kỳ.
 * - Điểm chú ý tất định, tối đa 5, chỉ nêu số liệu + ngày; không kết luận bệnh.
 */
@Injectable()
export class VisitReportService {
  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly access: AccessService,
    private readonly policy: PolicyService,
  ) {}

  async build(
    user: UserSummary,
    subjectId: string,
    query: VisitReportQuery,
  ): Promise<VisitReport> {
    const now = new Date();
    const { access, effectiveFrom } = await this.access.requireMeasurementsHistory(
      user.id,
      subjectId,
      null,
    );
    const timezone = access.subject.timezone;
    const today = localDateKey(now, timezone);

    const period = resolvePeriod(query, today, effectiveFrom, timezone);
    const windows = buildDayWindows(period.from, period.to, timezone);
    const days = windows.length;
    const firstWindow = windows[0];
    const lastWindow = windows[windows.length - 1];
    if (!firstWindow || !lastWindow) {
      throw AppError.validation('Kỳ báo cáo không có ngày hợp lệ.');
    }

    // Trần thời gian là hiện tại: mẫu/incident tương lai không vào phiếu.
    const queryStart = new Date(Math.max(firstWindow.from.getTime(), effectiveFrom.getTime()));
    const queryEnd = new Date(Math.min(lastWindow.to.getTime(), now.getTime()));
    const hasWindow = queryStart.getTime() < queryEnd.getTime();
    const assignmentIds = hasWindow ? await this.assignmentIdsForSubject(subjectId) : [];

    const [telemetryRows, incidentRows] = await Promise.all([
      assignmentIds.length === 0
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
                gte(telemetry.measuredAt, queryStart),
                lte(telemetry.measuredAt, queryEnd),
              ),
            )
            .orderBy(asc(telemetry.measuredAt), asc(telemetry.id)),
      !hasWindow
        ? Promise.resolve([])
        : this.db
            .select()
            .from(incidents)
            .where(
              and(
                eq(incidents.subjectId, subjectId),
                gte(incidents.detectedAt, queryStart),
                lte(incidents.detectedAt, queryEnd),
              ),
            )
            .orderBy(asc(incidents.detectedAt), asc(incidents.id)),
    ]);

    // InsightTelemetryRow cho phép `measuredAt: null`; ở đây query đã lọc NOT NULL.
    const rows = telemetryRows.filter(
      (row): row is InsightTelemetryRow & { measuredAt: Date } => row.measuredAt !== null,
    );
    const policy = await this.policy.getActive();
    const stepsByDate = aggregateStepsByWindow(windows, rows, policy.value.heartbeatIntervalSeconds);

    const rowsByDate = groupByDay(windows, rows);
    const daysWithData = rowsByDate.size;
    const coveragePercent = round1((daysWithData / days) * 100);
    const heartRate = insightHeartRate(rows);
    const gaps = computeGaps(
      queryStart,
      queryEnd,
      rows.map((row) => row.measuredAt),
    );
    const incidentItems = incidentRows
      .map((row) => ({
        id: row.id,
        type: row.type,
        state: row.state,
        detectedAt: row.detectedAt.toISOString(),
      }))
      .sort((a, b) => (a.detectedAt < b.detectedAt ? 1 : a.detectedAt > b.detectedAt ? -1 : a.id.localeCompare(b.id)));

    const summary: VisitReportSummary = {
      measurementCount: rows.length,
      daysWithData,
      coveragePercent,
      heartRate: heartRate ? { avg: heartRate.avg, min: heartRate.min, max: heartRate.max } : null,
      steps: stepsSummary(stepsByDate, days),
      gaps,
    };

    const incidentsSummary: VisitReportIncidents = {
      total: incidentItems.length,
      falls: incidentItems.filter((item) => item.type === 'fall').length,
      sos: incidentItems.filter((item) => item.type === 'sos').length,
      open: incidentItems.filter((item) => INCIDENT_OPEN_STATES.includes(item.state)).length,
      items: incidentItems,
    };

    return visitReportSchema.parse({
      subject: {
        id: access.subject.id,
        displayName: access.subject.displayName,
        timezone,
      },
      period: { from: period.from, to: period.to, days },
      generatedAt: now.toISOString(),
      summary,
      incidents: incidentsSummary,
      attentionPoints: buildAttentionPoints({
        timezone,
        periodTo: period.to,
        days,
        daysWithData,
        coveragePercent,
        gaps,
        incidents: incidentItems,
        rowsByDate,
        stepsByDate,
      }),
      simulated: rows.some((row) => isSyntheticDataSource(row.source)),
      disclaimer: VISIT_REPORT_DISCLAIMER,
    });
  }

  private async assignmentIdsForSubject(subjectId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: deviceAssignments.id })
      .from(deviceAssignments)
      .where(eq(deviceAssignments.subjectId, subjectId));
    return rows.map((row) => row.id);
  }
}

// ---------------------------------------------------------------------------
// Kỳ báo cáo
// ---------------------------------------------------------------------------

/**
 * `from`/`to` là ngày địa phương. Mặc định 30 ngày gần nhất tính cả hôm nay;
 * `to` tương lai bị kéo về hôm nay; kỳ dài hơn 92 ngày bị cắt bớt phần đầu
 * (giữ nguyên `to`). Kỳ không còn ngày nào sau mốc chia sẻ → 422.
 */
function resolvePeriod(
  query: VisitReportQuery,
  today: string,
  effectiveFrom: Date,
  timezone: string,
): { from: string; to: string } {
  const to = query.to && query.to < today ? query.to : today;
  let from = query.from ?? addDays(to, -(VISIT_REPORT_DEFAULT_DAYS - 1));
  if (from > to) {
    throw AppError.validation('from phải trước hoặc bằng to.', { from, to });
  }
  if (daysBetweenInclusive(from, to) > VISIT_REPORT_MAX_DAYS) {
    from = addDays(to, -(VISIT_REPORT_MAX_DAYS - 1));
  }

  const effectiveDate = localDateKey(effectiveFrom, timezone);
  if (to < effectiveDate) {
    throw AppError.validation(
      'Kỳ báo cáo không có ngày nào trong phạm vi dữ liệu được chia sẻ.',
      { effectiveFrom: effectiveFrom.toISOString() },
    );
  }
  if (from < effectiveDate) from = effectiveDate;
  return { from, to };
}

function buildDayWindows(from: string, to: string, timezone: string): InsightDayWindow[] {
  const tz = isValidTimezone(timezone) ? timezone : 'UTC';
  const windows: InsightDayWindow[] = [];
  let date = from;
  // Đã clamp ở resolvePeriod; giới hạn này chỉ để phòng thủ vòng lặp vô hạn.
  while (date <= to && windows.length < VISIT_REPORT_MAX_DAYS) {
    const range = zonedDayToUtcRange(date, tz);
    windows.push({ date, from: range.from, to: range.to });
    date = addDays(date, 1);
  }
  return windows;
}

// ---------------------------------------------------------------------------
// Tổng hợp số liệu
// ---------------------------------------------------------------------------

type DayAggregate = { count: number; min: number | null; max: number | null };

function groupByDay(
  windows: InsightDayWindow[],
  rows: Array<InsightTelemetryRow & { measuredAt: Date }>,
): Map<string, DayAggregate> {
  const result = new Map<string, DayAggregate>();
  for (const row of rows) {
    const window = findInsightWindow(windows, row.measuredAt);
    if (!window) continue;
    const aggregate = result.get(window.date) ?? { count: 0, min: null, max: null };
    aggregate.count += 1;
    if (row.quality.heart_rate === 'valid' && row.metrics.heart_rate_bpm !== null) {
      const value = row.metrics.heart_rate_bpm;
      aggregate.min = aggregate.min === null ? value : Math.min(aggregate.min, value);
      aggregate.max = aggregate.max === null ? value : Math.max(aggregate.max, value);
    }
    result.set(window.date, aggregate);
  }
  return result;
}

/** `null` khi không có ngày nào có bước dùng được (kể cả cảm biến chuyển động lỗi). */
function stepsSummary(
  stepsByDate: Map<string, DailyStepsAggregate>,
  days: number,
): VisitReportSummary['steps'] {
  const observed = [...stepsByDate.values()].filter((day) => day.observed);
  if (observed.length === 0) return null;
  const total = observed.reduce((sum, day) => sum + day.total, 0);
  return { total, avgPerDay: round1(total / days) };
}

/**
 * Khoảng thiếu >= 6 giờ trong `[from, to]`, kể cả phần trước mẫu đầu tiên và
 * sau mẫu cuối cùng. Không mẫu nào trong kỳ → một khoảng phủ toàn kỳ (nếu đủ dài).
 */
function computeGaps(from: Date, to: Date, measuredAts: Date[]): VisitReportGap[] {
  const gaps: VisitReportGap[] = [];
  if (to.getTime() <= from.getTime()) return gaps;
  const thresholdMs = VISIT_REPORT_GAP_HOURS * 3_600_000;
  const push = (start: Date, end: Date): void => {
    const delta = end.getTime() - start.getTime();
    if (delta < thresholdMs) return;
    gaps.push({
      from: start.toISOString(),
      to: end.toISOString(),
      hours: round1(delta / 3_600_000),
    });
  };

  const first = measuredAts[0];
  const last = measuredAts[measuredAts.length - 1];
  if (!first || !last) {
    push(from, to);
    return gaps;
  }
  push(from, first);
  for (let index = 1; index < measuredAts.length; index += 1) {
    const previous = measuredAts[index - 1];
    const current = measuredAts[index];
    if (previous && current) push(previous, current);
  }
  push(last, to);
  return gaps;
}

// ---------------------------------------------------------------------------
// Điểm chú ý (FR-22)
// ---------------------------------------------------------------------------

type AttentionInput = {
  timezone: string;
  periodTo: string;
  days: number;
  daysWithData: number;
  coveragePercent: number;
  gaps: VisitReportGap[];
  incidents: VisitReportIncidentItem[];
  rowsByDate: Map<string, DayAggregate>;
  stepsByDate: Map<string, DailyStepsAggregate>;
};

/**
 * Thứ tự ưu tiên cố định, tối đa 5: ngã → khoảng thiếu dài nhất → nhịp tim
 * thấp nhất/cao nhất theo ngày → ngày ít bước nhất → độ phủ < 80%.
 * Câu chữ trung tính, chỉ số liệu + ngày; không kết luận bệnh.
 */
function buildAttentionPoints(input: AttentionInput): VisitReportAttentionPoint[] {
  const points: VisitReportAttentionPoint[] = [];

  // 1. Số lần ngã (ngày gần nhất) — items đã sắp mới → cũ.
  const falls = input.incidents.filter((item) => item.type === 'fall');
  const latestFall = falls[0];
  if (latestFall) {
    const date = localDateKey(new Date(latestFall.detectedAt), input.timezone);
    points.push({
      date,
      label: 'Sự kiện ngã',
      detail: `Ghi nhận ${falls.length} lần ngã trong kỳ; lần gần nhất ngày ${formatDateVi(date)}.`,
    });
  }

  // 2. Khoảng thiếu dài nhất (>= 6 giờ).
  // Không có mẫu nào trong kỳ thì "khoảng thiếu" chỉ là toàn kỳ — đã được
  // phản ánh ở điểm độ phủ, không lặp lại thành điểm riêng.
  const longestGap =
    input.daysWithData > 0
      ? input.gaps.reduce<VisitReportGap | null>(
          (best, gap) => (best === null || gap.hours > best.hours ? gap : best),
          null,
        )
      : null;
  if (longestGap) {
    const start = new Date(longestGap.from);
    const end = new Date(longestGap.to);
    points.push({
      date: localDateKey(start, input.timezone),
      label: 'Khoảng thiếu dữ liệu dài nhất',
      detail:
        `Thiếu mẫu đo ${formatHours(longestGap.hours)} giờ, từ ` +
        `${formatLocalDateTime(start, input.timezone)} đến ${formatLocalDateTime(end, input.timezone)}.`,
    });
  }

  // 3. Ngày có nhịp tim thấp nhất / cao nhất trong các mẫu hợp lệ.
  const { low, high } = heartRateExtremeDays(input.rowsByDate);
  if (low && high && low.date === high.date) {
    points.push({
      date: low.date,
      label: 'Nhịp tim thấp nhất và cao nhất theo ngày',
      detail:
        `Ngày ${formatDateVi(low.date)} ghi nhận nhịp tim thấp nhất ${low.value} bpm ` +
        `và cao nhất ${high.value} bpm trong các mẫu hợp lệ.`,
    });
  } else {
    if (low) {
      points.push({
        date: low.date,
        label: 'Nhịp tim thấp nhất theo ngày',
        detail: `Ngày ${formatDateVi(low.date)} ghi nhận nhịp tim thấp nhất ${low.value} bpm trong các mẫu hợp lệ.`,
      });
    }
    if (high) {
      points.push({
        date: high.date,
        label: 'Nhịp tim cao nhất theo ngày',
        detail: `Ngày ${formatDateVi(high.date)} ghi nhận nhịp tim cao nhất ${high.value} bpm trong các mẫu hợp lệ.`,
      });
    }
  }

  // 4. Ngày ít bước nhất trong các ngày có dữ liệu bước.
  const stepDays = [...input.stepsByDate.entries()].filter(([, day]) => day.observed);
  let fewest: { date: string; total: number } | null = null;
  for (const [date, day] of stepDays) {
    if (
      fewest === null ||
      day.total < fewest.total ||
      (day.total === fewest.total && date < fewest.date)
    ) {
      fewest = { date, total: day.total };
    }
  }
  if (fewest) {
    points.push({
      date: fewest.date,
      label: 'Ngày ít bước nhất',
      detail:
        `Ngày ${formatDateVi(fewest.date)} ghi nhận ${fewest.total} bước — ` +
        `thấp nhất trong ${stepDays.length} ngày có dữ liệu bước.`,
    });
  }

  // 5. Độ phủ dữ liệu dưới 80%.
  if (input.coveragePercent < VISIT_REPORT_LOW_COVERAGE_PERCENT) {
    const missingDays = input.days - input.daysWithData;
    points.push({
      date: input.periodTo,
      label: 'Độ phủ dữ liệu',
      detail:
        `Dữ liệu có ở ${input.daysWithData}/${input.days} ngày ` +
        `(${formatHours(input.coveragePercent)}%); ${missingDays} ngày không có mẫu đo.`,
    });
  }

  return points.slice(0, VISIT_REPORT_MAX_ATTENTION_POINTS);
}

function heartRateExtremeDays(rowsByDate: Map<string, DayAggregate>): {
  low: { date: string; value: number } | null;
  high: { date: string; value: number } | null;
} {
  let low: { date: string; value: number } | null = null;
  let high: { date: string; value: number } | null = null;
  for (const [date, aggregate] of rowsByDate) {
    if (
      aggregate.min !== null &&
      (low === null || aggregate.min < low.value || (aggregate.min === low.value && date < low.date))
    ) {
      low = { date, value: aggregate.min };
    }
    if (
      aggregate.max !== null &&
      (high === null ||
        aggregate.max > high.value ||
        (aggregate.max === high.value && date < high.date))
    ) {
      high = { date, value: aggregate.max };
    }
  }
  return { low, high };
}

// ---------------------------------------------------------------------------
// Định dạng
// ---------------------------------------------------------------------------

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 8.5 → "8,5" (dấu phẩy thập phân tiếng Việt trên phiếu in). */
function formatHours(value: number): string {
  return String(round1(value)).replace('.', ',');
}

/** `YYYY-MM-DD HH:mm` theo timezone hồ sơ (không phụ thuộc TZ máy chủ). */
function formatLocalDateTime(instant: Date, timezone: string): string {
  const tz = isValidTimezone(timezone) ? timezone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const read = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00';
  return `${read('year')}-${read('month')}-${read('day')} ${read('hour')}:${read('minute')}`;
}
