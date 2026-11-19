import {
  WEEKDAY_LABELS_VI,
  type ReminderKind,
  type ReminderSummary,
} from '@heart-iot/contracts/reminders';
import { formatDayKey } from '../../lib/format';

/** Nhãn loại lịch nhắc — người dùng tự đặt, không phải chỉ định y khoa. */
export const REMINDER_KIND_LABELS: Readonly<Record<ReminderKind, string>> = {
  medication: 'Thuốc',
  activity: 'Sinh hoạt',
  measurement: 'Đo chỉ số',
  other: 'Khác',
};

export const REMINDER_KIND_OPTIONS: ReadonlyArray<{
  value: ReminderKind;
  label: string;
}> = (['medication', 'activity', 'measurement', 'other'] as const).map((value) => ({
  value,
  label: REMINDER_KIND_LABELS[value],
}));

/** T2..CN theo đúng ISO weekday của hợp đồng. */
export const WEEKDAY_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: WEEKDAY_LABELS_VI[1]! },
  { value: 2, label: WEEKDAY_LABELS_VI[2]! },
  { value: 3, label: WEEKDAY_LABELS_VI[3]! },
  { value: 4, label: WEEKDAY_LABELS_VI[4]! },
  { value: 5, label: WEEKDAY_LABELS_VI[5]! },
  { value: 6, label: WEEKDAY_LABELS_VI[6]! },
  { value: 7, label: WEEKDAY_LABELS_VI[7]! },
];

/** "T2, T3, T4, T5, T6, T7, CN" hoặc gọn "Hằng ngày" khi đủ 7 ngày. */
export function formatWeekdays(weekdays: readonly number[]): string {
  const labels = WEEKDAY_OPTIONS.filter((option) => weekdays.includes(option.value)).map(
    (option) => option.label,
  );
  if (labels.length === 7) return 'Hằng ngày';
  return labels.join(', ');
}

/** "08:00, 16:00" — giữ nguyên thứ tự hợp đồng (đã tăng dần). */
export function formatReminderTimes(times: readonly string[]): string {
  return times.join(', ');
}

/** Khoảng ngày của lịch nhắc; ngày kết thúc trống = không đặt. */
export function formatReminderRange(reminder: Pick<ReminderSummary, 'startsOn' | 'endsOn'>): string {
  const start = `Từ ${formatDayKey(reminder.startsOn)}`;
  if (!reminder.endsOn) return `${start} · không đặt ngày kết thúc`;
  return `${start} đến ${formatDayKey(reminder.endsOn)}`;
}

/** Số ký tự tối đa của ghi chú — đọc từ hợp đồng ở nơi validate, đây chỉ là giới hạn UI. */
export const REMINDER_NOTE_MAX_LENGTH = 500;
export const REMINDER_TITLE_MAX_LENGTH = 120;
