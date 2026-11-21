import type {
  CareDigestRuleConfig,
  CareRulePreview,
  InactivityRuleConfig,
} from '@heart-iot/contracts/care-rules';
import type { TelemetryRow } from '../database/schema';
import { addDays, isoWeekday } from '../common/local-date';
import { localDateKey } from '../measurements/insights';
import { isValidTimezone, zonedToUtc } from '../measurements/time-utils';

/** HH:MM → số phút từ nửa đêm; ném lỗi nếu chuỗi sai (contract đã chặn). */
export function timeOfDayMinutes(time: string): number {
  const [hourRaw, minuteRaw] = time.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(`Giờ không hợp lệ: ${time}`);
  }
  return hour * 60 + minute;
}

/** Giờ địa phương HH:MM của một mốc UTC theo timezone hồ sơ. */
export function localTimeKey(instant: Date, timezone: string): string {
  const tz = isValidTimezone(timezone) ? timezone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const read = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00';
  return `${read('hour')}:${read('minute')}`;
}

export function localTimeMinutes(instant: Date, timezone: string): number {
  return timeOfDayMinutes(localTimeKey(instant, timezone));
}

/** Mốc UTC của một giờ địa phương trong ngày `date` (YYYY-MM-DD). */
export function localDateTimeToUtc(date: string, time: string, timezone: string): Date {
  const [year, month, day] = date.split('-').map((value) => Number(value));
  const [hour, minute] = time.split(':').map((value) => Number(value));
  if (!year || !month || !day || hour === undefined || minute === undefined) {
    throw new Error(`Ngày/giờ không hợp lệ: ${date} ${time}`);
  }
  return zonedToUtc(year, month - 1, day, hour, minute, 0, timezone);
}

/**
 * Quy tắc sinh hoạt đã tới lúc kiểm tra chưa?
 *
 * Chỉ kiểm trong `[windowEnd, windowEnd + graceMinutes]` cùng ngày địa phương;
 * `windowEnd + grace` buộc ≤ 24:00 bởi contract để không tràn sang ngày khác.
 */
export function isInactivityDue(
  config: InactivityRuleConfig,
  now: Date,
  timezone: string,
): boolean {
  if (!config.enabled) return false;
  const date = localDateKey(now, timezone);
  if (!config.weekdays.includes(isoWeekday(date))) return false;
  const minutes = localTimeMinutes(now, timezone);
  const end = timeOfDayMinutes(config.windowEnd);
  return minutes >= end && minutes <= end + config.graceMinutes;
}

/** Bản tin cuối ngày: gửi khi đã tới giờ cấu hình, tối đa một lần/ngày nhờ dedupe. */
export function isDigestDue(
  config: CareDigestRuleConfig,
  now: Date,
  timezone: string,
): boolean {
  if (!config.enabled) return false;
  return localTimeMinutes(now, timezone) >= timeOfDayMinutes(config.time);
}

/** Cửa sổ UTC của khung giờ sinh hoạt trong ngày địa phương. */
export function inactivityWindowUtc(
  config: InactivityRuleConfig,
  date: string,
  timezone: string,
): { from: Date; to: Date } {
  return {
    from: localDateTimeToUtc(date, config.windowStart, timezone),
    to: localDateTimeToUtc(date, config.windowEnd, timezone),
  };
}

/**
 * Tổng bước trong một tập mẫu đã lọc theo khung giờ.
 * Cùng nguyên tắc với daily summary: cộng delta dương theo từng boot, bỏ delta
 * âm (counter reset) và bỏ delta bắc qua khoảng mất mẫu dài.
 */
export function sumStepsInRows(
  rows: Array<Pick<TelemetryRow, 'bootId' | 'measuredAt' | 'metrics' | 'quality'>>,
  gapMs: number,
): number {
  const sorted = [...rows]
    .filter((row) => row.measuredAt !== null && row.quality.motion !== 'sensor_error')
    .sort((a, b) => (a.measuredAt?.getTime() ?? 0) - (b.measuredAt?.getTime() ?? 0));
  const lastByBoot = new Map<string, { steps: number; measuredAt: Date }>();
  let total = 0;
  for (const row of sorted) {
    if (!row.measuredAt) continue;
    const previous = lastByBoot.get(row.bootId);
    if (previous) {
      const delta = row.metrics.steps_since_boot - previous.steps;
      const elapsed = row.measuredAt.getTime() - previous.measuredAt.getTime();
      if (delta > 0 && elapsed <= gapMs) total += delta;
    }
    lastByBoot.set(row.bootId, {
      steps: row.metrics.steps_since_boot,
      measuredAt: row.measuredAt,
    });
  }
  return total;
}

function previewDays(
  kind: 'inactivity' | 'care_digest',
  now: Date,
  timezone: string,
  applies: (date: string) => { applies: boolean; time: string; note: string },
): CareRulePreview {
  const today = localDateKey(now, timezone);
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(today, offset);
    const value = applies(date);
    return { date, ...value };
  });
  return {
    kind,
    generatedAt: now.toISOString(),
    days,
    disclaimer:
      'Đây chỉ là lịch kiểm tra theo cài đặt của bạn; không phải dự đoán sức khỏe hay cảnh báo khẩn.',
  };
}

export function buildInactivityPreview(
  config: InactivityRuleConfig,
  now: Date,
  timezone: string,
): CareRulePreview {
  return previewDays('inactivity', now, timezone, (date) => {
    const inWeek = config.weekdays.includes(isoWeekday(date));
    return {
      applies: config.enabled && inWeek,
      time: config.windowEnd,
      note: !config.enabled
        ? 'Quy tắc đang tắt.'
        : inWeek
          ? `Sẽ kiểm tra cuối khung ${config.windowStart}–${config.windowEnd} và chỉ nhắc nhẹ nếu chưa ghi nhận đủ vận động.`
          : 'Không thuộc ngày đã chọn.',
    };
  });
}

export function buildDigestPreview(
  config: CareDigestRuleConfig,
  now: Date,
  timezone: string,
): CareRulePreview {
  return previewDays('care_digest', now, timezone, () => ({
    applies: config.enabled,
    time: config.time,
    note: config.enabled
      ? 'Sẽ tổng hợp việc chăm sóc và dữ liệu đã ghi nhận trong ngày.'
      : 'Bản tin đang tắt.',
  }));
}
