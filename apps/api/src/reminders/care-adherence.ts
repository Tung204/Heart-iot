import type { CareAdherence, CareAdherenceDay, CareAdherenceReminder } from '@heart-iot/contracts/reminders';
import type { CareReminderCompletionRow, CareReminderPeriodRow, CareReminderRow } from '../database/schema';
import { addDays, isoWeekday } from '../common/local-date';
import { localDateKey } from '../measurements/insights';
import { isValidTimezone, zonedToUtc } from '../measurements/time-utils';

export type AdherenceCompletion = Pick<
  CareReminderCompletionRow,
  'reminderId' | 'occurrenceDate' | 'scheduledTime' | 'status'
>;

export type CareAdherenceInput = {
  subjectId: string;
  timezone: string;
  days: number;
  now: Date;
  reminders: CareReminderRow[];
  periods: CareReminderPeriodRow[];
  completions: AdherenceCompletion[];
};

type Period = Pick<CareReminderPeriodRow, 'activeFrom' | 'activeTo'>;

type Counter = {
  scheduled: number;
  done: number;
  skipped: number;
  pending: number;
};

function emptyCounter(): Counter {
  return { scheduled: 0, done: 0, skipped: 0, pending: 0 };
}

function addCounter(target: Counter, source: Counter): void {
  target.scheduled += source.scheduled;
  target.done += source.done;
  target.skipped += source.skipped;
  target.pending += source.pending;
}

/** Số nguyên 0..100; `null` khi mẫu số 0 — không biến "không có dữ liệu" thành 0%. */
function percent(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((100 * numerator) / denominator);
}

function toRates(counter: Counter): {
  recordedPercent: number | null;
  completionPercent: number | null;
} {
  const recorded = counter.done + counter.skipped;
  return {
    recordedPercent: percent(recorded, counter.scheduled),
    completionPercent: percent(counter.done, recorded),
  };
}

function completionKey(reminderId: string, date: string, time: string): string {
  return `${reminderId}|${date}|${time}`;
}

/**
 * Quy tắc cho một reminder:
 * - ngày nằm trong `[startsOn, endsOn]` toàn cục;
 * - đúng thứ trong `weekdays`;
 * - ngày nằm trong một khoảng hiệu lực (tắt/bật lại).
 *
 * Dữ liệu cũ chưa có khoảng: chỉ fallback cho reminder đang active, dùng
 * `[startsOn, null]` để không mất lịch sử. Reminder đã archive/không có khoảng
 * thì không sinh occurrence mới.
 */
function periodsFor(reminder: CareReminderRow, byReminder: Map<string, Period[]>): Period[] {
  const periods = byReminder.get(reminder.id) ?? [];
  if (periods.length > 0) return periods;
  if (reminder.active && !reminder.archivedAt) {
    return [{ activeFrom: reminder.startsOn, activeTo: null }];
  }
  return [];
}

function covers(period: Period, date: string): boolean {
  return period.activeFrom <= date && (period.activeTo === null || date <= period.activeTo);
}

/**
 * Tổng hợp tuân thủ trong `days` ngày gần nhất (kết thúc hôm nay theo timezone
 * hồ sơ). Chỉ tính occurrence **đã qua** — mốc giờ địa phương ≤ `now`.
 *
 * Hàm thuần: không đụng DB/đồng hồ hệ thống; service truyền `now` và dữ liệu đã
 * tải. Nhờ vậy test được múi giờ/DST và chạy lại tất định.
 */
export function buildCareAdherence(input: CareAdherenceInput): CareAdherence {
  const timezone = isValidTimezone(input.timezone) ? input.timezone : 'UTC';
  const today = localDateKey(input.now, timezone);
  const from = addDays(today, -(input.days - 1));
  const to = today;

  const periodsByReminder = new Map<string, Period[]>();
  for (const period of input.periods) {
    const list = periodsByReminder.get(period.reminderId) ?? [];
    list.push({ activeFrom: period.activeFrom, activeTo: period.activeTo });
    periodsByReminder.set(period.reminderId, list);
  }

  const completionStatus = new Map<string, 'done' | 'skipped'>();
  for (const completion of input.completions) {
    if (completion.status !== 'done' && completion.status !== 'skipped') continue;
    completionStatus.set(
      completionKey(completion.reminderId, completion.occurrenceDate, completion.scheduledTime),
      completion.status,
    );
  }

  const series: CareAdherenceDay[] = [];
  const totals = emptyCounter();
  const perReminder = new Map<string, Counter>();

  for (let offset = 0; offset < input.days; offset += 1) {
    const date = addDays(from, offset);
    const weekday = isoWeekday(date);
    const dayCounter = emptyCounter();
    const [year, month, day] = date.split('-').map((value) => Number(value));
    if (!year || !month || !day) throw new Error(`Ngày không hợp lệ: ${date}`);

    for (const reminder of input.reminders) {
      if (reminder.endsOn !== null && date > reminder.endsOn) continue;
      if (date < reminder.startsOn) continue;
      if (!reminder.weekdays.includes(weekday)) continue;
      const periods = periodsFor(reminder, periodsByReminder);
      if (!periods.some((period) => covers(period, date))) continue;

      for (const time of [...reminder.times].sort()) {
        const [hour = -1, minute = -1] = time.split(':').map((value) => Number(value));
        if (
          !Number.isInteger(hour) ||
          !Number.isInteger(minute) ||
          hour < 0 ||
          hour > 23 ||
          minute < 0 ||
          minute > 59
        ) {
          continue;
        }
        const scheduledAt = zonedToUtc(year, month - 1, day, hour, minute, 0, timezone);
        // Mốc tương lai trong hôm nay chưa được tính là "chưa ghi nhận".
        if (scheduledAt.getTime() > input.now.getTime()) continue;

        dayCounter.scheduled += 1;
        const status = completionStatus.get(completionKey(reminder.id, date, time));
        if (status === 'done') dayCounter.done += 1;
        else if (status === 'skipped') dayCounter.skipped += 1;
        else dayCounter.pending += 1;

        const counter = perReminder.get(reminder.id) ?? emptyCounter();
        if (status === 'done') counter.done += 1;
        else if (status === 'skipped') counter.skipped += 1;
        else counter.pending += 1;
        counter.scheduled += 1;
        perReminder.set(reminder.id, counter);
      }
    }

    addCounter(totals, dayCounter);
    series.push({ date, ...dayCounter });
  }

  const createdAtById = new Map(
    input.reminders.map((reminder) => [reminder.id, reminder.createdAt.getTime()]),
  );
  const reminders: CareAdherenceReminder[] = input.reminders
    .map((reminder): CareAdherenceReminder | null => {
      const counter = perReminder.get(reminder.id);
      if (!counter || counter.scheduled === 0) return null;
      return {
        reminderId: reminder.id,
        title: reminder.title,
        kind: reminder.kind as CareAdherenceReminder['kind'],
        active: reminder.active,
        archived: reminder.archivedAt !== null,
        ...counter,
        ...toRates(counter),
      };
    })
    .filter((row): row is CareAdherenceReminder => row !== null)
    .sort(
      (a, b) =>
        (createdAtById.get(a.reminderId) ?? 0) - (createdAtById.get(b.reminderId) ?? 0) ||
        a.reminderId.localeCompare(b.reminderId),
    );

  return {
    subjectId: input.subjectId,
    timezone,
    from,
    to,
    days: input.days,
    totals: { ...totals, ...toRates(totals) },
    series,
    reminders,
  };
}
