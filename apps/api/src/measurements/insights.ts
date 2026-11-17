import { isSyntheticDataSource, type IncidentState } from '@heart-iot/contracts';
import type { DailyInsight, InsightsResponse } from '@heart-iot/contracts/insights';
import type { TelemetryRow } from '../database/schema';
import { isValidTimezone, zonedDayToUtcRange } from './time-utils';

/**
 * Gom xu hướng nhiều ngày — helper thuần, không truy cập DB.
 *
 * Nguồn quy tắc: docs/02 (FR-04/FR-05), docs/04 (bước theo delta từng boot,
 * coverage theo heartbeat của policy), packages/contracts/src/insights.ts.
 *
 * Bất biến:
 * - Mỗi ngày xuất hiện đúng một lần, cũ→mới, kể cả ngày không có mẫu.
 * - Ngày không có mẫu: `heartRate: null`, bước `unavailable`, coverage 0/0 —
 *   không thay bằng 0 hoặc nội suy.
 * - Chỉ dùng mẫu đã đồng bộ (caller đã lọc `measured_at` khác null, không
 *   quarantine) và đã cắt theo mốc chia sẻ (`effectiveFrom`); mẫu tương lai bị
 *   loại lần nữa ở `buildDailyInsights` để không đẩy thống kê vượt hiện tại.
 * - Không suy diễn sức khỏe; `notes` chỉ mô tả dữ liệu thiếu/nguồn mô phỏng.
 */

export type InsightDayWindow = { date: string; from: Date; to: Date };

export type InsightIncidentRow = { detectedAt: Date; state: IncidentState };

/** Chỉ các cột cần cho tổng hợp — tránh kéo toàn bộ payload telemetry. */
export type InsightTelemetryRow = Pick<
  TelemetryRow,
  'measuredAt' | 'bootId' | 'metrics' | 'quality' | 'source'
>;

export type DailyStepsAggregate = DailyInsight['steps'] & {
  /** Có mẫu bước dùng được trong ngày (motion quality không phải sensor_error). */
  observed: boolean;
  /** Counter giảm trong cùng boot — nghi reset. */
  reset: boolean;
  /** Khoảng mất mẫu dài hơn ngưỡng — không dồn toàn bộ chênh lệch vào ngày nhận. */
  gap: boolean;
};

/** Số khoảng heartbeat liên tiếp tối đa còn coi là đủ tin cậy để cộng delta bước. */
export const STEPS_GAP_INTERVALS = 4;

const MAX_NOTES = 3;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Ngày địa phương YYYY-MM-DD của một mốc UTC theo timezone hồ sơ. */
export function localDateKey(instant: Date, timezone: string): string {
  const tz = isValidTimezone(timezone) ? timezone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const read = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

/**
 * `days` ngày gần nhất kết thúc hôm nay theo timezone hồ sơ, cũ→mới.
 * Mỗi phần tử kèm khoảng UTC của ngày địa phương tương ứng.
 */
export function buildInsightDayWindows(
  days: number,
  now: Date,
  timezone: string,
): InsightDayWindow[] {
  const [year, month, day] = localDateKey(now, timezone)
    .split('-')
    .map((value) => Number(value));
  if (!year || !month || !day) {
    throw new Error('Không xác định được ngày hiện tại theo timezone hồ sơ.');
  }
  const windows: InsightDayWindow[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    // Số học lịch trên UTC: chỉ dùng để lùi ngày, không phụ thuộc múi giờ máy chạy.
    const date = new Date(Date.UTC(year, month - 1, day - offset)).toISOString().slice(0, 10);
    const { from, to } = zonedDayToUtcRange(date, timezone);
    windows.push({ date, from, to });
  }
  return windows;
}

/** Ngày chứa mốc `instant` trong danh sách cửa sổ đã sắp xếp cũ→mới. */
export function findInsightWindow(
  windows: InsightDayWindow[],
  instant: Date,
): InsightDayWindow | null {
  const time = instant.getTime();
  let low = 0;
  let high = windows.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const window = windows[middle];
    if (!window) return null;
    if (time < window.from.getTime()) high = middle - 1;
    else if (time >= window.to.getTime()) low = middle + 1;
    else return window;
  }
  return null;
}

/**
 * Coverage theo đúng công thức của policy hiện hành (dùng chung với
 * measurements/daily-summary): 1 snapshot mỗi `expectedIntervalSeconds`,
 * tối thiểu 1 mẫu kỳ vọng, phần trăm làm tròn 1 chữ số thập phân.
 */
export function coverageCounts(
  from: Date,
  to: Date,
  intervalSeconds: number,
  observedCount: number,
): { percent: number; observedCount: number; expectedCount: number } {
  const expectedCount = Math.max(
    1,
    Math.floor((to.getTime() - from.getTime()) / (intervalSeconds * 1000)),
  );
  const percent = Math.min(100, round1((observedCount / expectedCount) * 100));
  return { percent, observedCount, expectedCount };
}

/** Nhịp tim chỉ từ mẫu `valid` và có giá trị; không có → null. */
export function insightHeartRate(rows: InsightTelemetryRow[]): DailyInsight['heartRate'] {
  let count = 0;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    if (row.quality.heart_rate !== 'valid' || row.metrics.heart_rate_bpm === null) continue;
    const value = row.metrics.heart_rate_bpm;
    count += 1;
    sum += value;
    // Không dùng Math.min(...values): cửa sổ 30 ngày có thể vượt giới hạn tham số.
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (count === 0) return null;
  return {
    avg: round1(sum / count),
    min,
    max,
    validSamples: count,
  };
}

/**
 * Bước theo delta `steps_since_boot` trong từng boot, gán cho ngày địa phương
 * của mẫu mới hơn. Không đủ tin cậy thì `partial`:
 * - counter giảm trong cùng boot (reset),
 * - khoảng mất mẫu dài hơn `STEPS_GAP_INTERVALS` nhịp tim (không dồn cả đoạn),
 * - chỉ có một mốc của boot trong ngày (không suy ra delta dương).
 * Không có mẫu tin cậy (hoặc motion sensor_error) → `unavailable`.
 */
export function aggregateStepsByWindow(
  windows: InsightDayWindow[],
  rows: InsightTelemetryRow[],
  intervalSeconds: number,
): Map<string, DailyStepsAggregate> {
  type Accumulator = {
    total: number;
    observed: boolean;
    reset: boolean;
    gap: boolean;
    positive: boolean;
  };
  const accumulators = new Map<string, Accumulator>();
  const lastByBoot = new Map<string, { steps: number; measuredAt: Date }>();
  const gapMs = intervalSeconds * STEPS_GAP_INTERVALS * 1000;

  for (const row of rows) {
    if (!row.measuredAt) continue;
    // Lỗi cảm biến chuyển động không được hiểu thành "ít vận động".
    if (row.quality.motion === 'sensor_error') continue;
    const window = findInsightWindow(windows, row.measuredAt);
    if (!window) continue;
    const accumulator =
      accumulators.get(window.date) ??
      ({ total: 0, observed: false, reset: false, gap: false, positive: false } as Accumulator);
    accumulator.observed = true;
    accumulators.set(window.date, accumulator);

    const previous = lastByBoot.get(row.bootId);
    if (previous) {
      const elapsedMs = row.measuredAt.getTime() - previous.measuredAt.getTime();
      const delta = row.metrics.steps_since_boot - previous.steps;
      if (elapsedMs > gapMs) {
        // Mất mẫu dài: bỏ đoạn chênh lệch thay vì cộng toàn bộ vào ngày nhận mẫu.
        accumulator.gap = true;
      } else if (delta < 0) {
        accumulator.reset = true;
      } else if (delta > 0) {
        accumulator.total += delta;
        accumulator.positive = true;
      }
    }
    lastByBoot.set(row.bootId, {
      steps: row.metrics.steps_since_boot,
      measuredAt: row.measuredAt,
    });
  }

  const result = new Map<string, DailyStepsAggregate>();
  for (const [date, accumulator] of accumulators) {
    result.set(date, {
      total: accumulator.total,
      completeness:
        accumulator.reset || accumulator.gap || !accumulator.positive ? 'partial' : 'complete',
      observed: accumulator.observed,
      reset: accumulator.reset,
      gap: accumulator.gap,
    });
  }
  return result;
}

function emptyDay(date: string): DailyInsight {
  return {
    date,
    hasData: false,
    source: 'device',
    heartRate: null,
    steps: { total: 0, completeness: 'unavailable' },
    coverage: { percent: 0, observedCount: 0, expectedCount: 0 },
    incidents: { total: 0, resolved: 0 },
  };
}

export type InsightBuildInput = {
  windows: InsightDayWindow[];
  /** Mẫu đã lọc `measured_at` khác null, đã cắt theo quyền, sắp xếp cũ→mới. */
  telemetryRows: InsightTelemetryRow[];
  /** Incident đã cắt theo quyền, bất kể trạng thái. */
  incidentRows: InsightIncidentRow[];
  effectiveFrom: Date;
  now: Date;
  intervalSeconds: number;
};

/**
 * Gom ngày: mỗi ngày chỉ tính phần sau mốc chia sẻ và không vượt quá hiện tại.
 * Ngày hoàn toàn trước mốc chia sẻ vẫn xuất hiện nhưng rỗng (0/0), không 403.
 */
export function buildDailyInsights(input: InsightBuildInput): DailyInsight[] {
  const { windows, telemetryRows, incidentRows, effectiveFrom, now, intervalSeconds } = input;
  // Phòng thủ nhiều lớp: dù caller quên kẹp, mẫu `measured_at > now` không được
  // đóng góp vào bất kỳ ngày nào (không làm coverage/bước/lastSeen vượt hiện tại).
  const boundedRows = telemetryRows.filter(
    (row) => row.measuredAt !== null && row.measuredAt.getTime() <= now.getTime(),
  );
  const rowsByDate = new Map<string, InsightTelemetryRow[]>();
  for (const row of boundedRows) {
    if (!row.measuredAt) continue;
    const window = findInsightWindow(windows, row.measuredAt);
    if (!window) continue;
    const list = rowsByDate.get(window.date) ?? [];
    list.push(row);
    rowsByDate.set(window.date, list);
  }
  const stepsByDate = aggregateStepsByWindow(windows, boundedRows, intervalSeconds);

  return windows.map((window) => {
    const windowFrom = new Date(Math.max(window.from.getTime(), effectiveFrom.getTime()));
    const windowTo = new Date(Math.min(window.to.getTime(), now.getTime()));
    if (windowTo.getTime() <= windowFrom.getTime()) return emptyDay(window.date);

    const rows = (rowsByDate.get(window.date) ?? []).filter((row) => {
      const measuredAt = row.measuredAt;
      return (
        measuredAt !== null &&
        measuredAt.getTime() >= windowFrom.getTime() &&
        measuredAt.getTime() <= windowTo.getTime()
      );
    });
    const steps = stepsByDate.get(window.date);
    const dayIncidents = incidentRows.filter((incident) => {
      const time = incident.detectedAt.getTime();
      return time >= windowFrom.getTime() && time <= windowTo.getTime();
    });

    return {
      date: window.date,
      hasData: rows.length > 0,
      source: rows.some((row) => isSyntheticDataSource(row.source)) ? 'synthetic' : 'device',
      heartRate: insightHeartRate(rows),
      steps: steps
        ? { total: steps.total, completeness: steps.completeness }
        : { total: 0, completeness: 'unavailable' },
      coverage: coverageCounts(windowFrom, windowTo, intervalSeconds, rows.length),
      incidents: {
        total: dayIncidents.length,
        resolved: dayIncidents.filter((incident) => incident.state === 'resolved').length,
      },
    };
  });
}

export function summarizeInsights(days: DailyInsight[]): InsightsResponse['summary'] {
  let dataDays = 0;
  let validSamples = 0;
  let weightedHeartRate = 0;
  let totalSteps = 0;
  let coverageSum = 0;
  let coverageDays = 0;
  let incidentsTotal = 0;
  let incidentsResolved = 0;
  let syntheticDays = 0;

  for (const day of days) {
    if (day.hasData) dataDays += 1;
    if (day.source === 'synthetic') syntheticDays += 1;
    if (day.heartRate) {
      validSamples += day.heartRate.validSamples;
      weightedHeartRate += day.heartRate.avg * day.heartRate.validSamples;
    }
    totalSteps += day.steps.total;
    if (day.coverage.expectedCount > 0) {
      coverageSum += day.coverage.percent;
      coverageDays += 1;
    }
    incidentsTotal += day.incidents.total;
    incidentsResolved += day.incidents.resolved;
  }

  return {
    dataDays,
    avgHeartRate: validSamples > 0 ? round1(weightedHeartRate / validSamples) : null,
    totalSteps,
    avgCoveragePercent: coverageDays > 0 ? round1(coverageSum / coverageDays) : 0,
    incidentsTotal,
    incidentsResolved,
    syntheticDays,
  };
}

/** Tối đa 3 câu ngắn về dữ liệu thiếu/nguồn mô phỏng; không suy diễn sức khỏe. */
export function buildInsightNotes(
  days: DailyInsight[],
  summary: InsightsResponse['summary'],
): string[] {
  const notes: string[] = [];
  const missingDays = days.length - summary.dataDays;
  if (missingDays > 0) {
    notes.push(
      `Có ${missingDays}/${days.length} ngày không có mẫu đo; các ngày đó hiển thị "—" thay vì số 0.`,
    );
  }
  if (summary.syntheticDays > 0) {
    notes.push(`Có ${summary.syntheticDays} ngày chứa dữ liệu mô phỏng; chỉ dùng để kiểm thử.`);
  }
  const partialStepDays = days.filter((day) => day.steps.completeness === 'partial').length;
  if (partialStepDays > 0 && notes.length < MAX_NOTES) {
    notes.push(
      `Số bước của ${partialStepDays} ngày là ước tính một phần do thiếu mốc thời gian hoặc counter bị đặt lại.`,
    );
  }
  const daysWithoutValidHeartRate = days.filter(
    (day) => day.hasData && day.heartRate === null,
  ).length;
  if (daysWithoutValidHeartRate > 0 && notes.length < MAX_NOTES) {
    notes.push(`Có ${daysWithoutValidHeartRate} ngày có mẫu đo nhưng không có nhịp tim hợp lệ.`);
  }
  return notes.slice(0, MAX_NOTES);
}

