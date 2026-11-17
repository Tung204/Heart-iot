import { AppError } from '../common/app-error';

/**
 * Tiện ích thời gian theo timezone hồ sơ (docs/04: lưu UTC, hiển thị theo timezone).
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Offset (ms) giữa UTC và giờ địa phương tại thời điểm utcMs theo timezone. */
export function timezoneOffsetMs(utcMs: number, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(new Date(utcMs));
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '0';
  const asUtc = Date.UTC(
    Number(get('year')),
    Number(get('month')) - 1,
    Number(get('day')),
    Number(get('hour')) % 24,
    Number(get('minute')),
    Number(get('second')),
  );
  return asUtc - utcMs;
}

/** Chuyển một mốc giờ địa phương (Y/M/D h:m:s) sang UTC, lặp để xử lý DST. */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timezone: string,
): Date {
  // Giờ địa phương mục tiêu biểu diễn như một mốc UTC (wall clock).
  const localAsUtc = Date.UTC(year, month, day, hour, minute, second);
  let guess = localAsUtc;
  for (let i = 0; i < 4; i += 1) {
    const offset = timezoneOffsetMs(guess, timezone);
    const next = localAsUtc - offset;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

/**
 * Khoảng UTC tương ứng với một ngày địa phương (YYYY-MM-DD) theo timezone.
 * `from` = nửa đêm đầu ngày, `to` = nửa đêm ngày kế tiếp (không gồm điểm to).
 */
export function zonedDayToUtcRange(
  date: string,
  timezone: string,
): { from: Date; to: Date } {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw AppError.validation('date phải có định dạng YYYY-MM-DD.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw AppError.validation('date không hợp lệ.');
  }
  const tz = isValidTimezone(timezone) ? timezone : 'UTC';
  const from = zonedToUtc(year, month - 1, day, 0, 0, 0, tz);
  const nextLocalDay = new Date(Date.UTC(year, month - 1, day + 1));
  const to = zonedToUtc(
    nextLocalDay.getUTCFullYear(),
    nextLocalDay.getUTCMonth(),
    nextLocalDay.getUTCDate(),
    0,
    0,
    0,
    tz,
  );
  return { from, to };
}
