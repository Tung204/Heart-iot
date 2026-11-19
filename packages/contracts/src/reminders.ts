import { z } from 'zod';
import { idSchema, isoDateSchema, isoDateTimeSchema } from './core';

/**
 * Lịch nhắc chăm sóc (FR-15, phần web).
 *
 * Người dùng tự đặt tiêu đề + giờ nhắc cho một hồ sơ; hệ thống KHÔNG gợi ý
 * liều, không kê thuốc và không thay tư vấn y tế — hợp đồng vì thế không có
 * trường liều lượng.
 *
 * Bất biến dữ liệu:
 * - `times` theo giờ địa phương của hồ sơ (`subject.timezone`), dạng `HH:MM`,
 *   1..6 phần tử, tăng dần và không trùng.
 * - `weekdays` dùng ISO 8601: 1 = thứ Hai .. 7 = Chủ nhật, 1..7 phần tử,
 *   tăng dần và không trùng.
 * - `endsOn` null nghĩa là nhắc không có ngày kết thúc; nếu có phải >= `startsOn`.
 * - Occurrence được khoá theo `(reminderId, date, time)` — xem
 *   `care_reminder_completions` trong DB.
 */

export const reminderKindSchema = z.enum(['medication', 'activity', 'measurement', 'other']);
export type ReminderKind = z.infer<typeof reminderKindSchema>;

/** Giờ nhắc `HH:MM` 24 giờ, theo timezone hồ sơ. */
export const REMINDER_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const reminderTimeSchema = z
  .string()
  .regex(REMINDER_TIME_PATTERN, 'Giờ nhắc phải có dạng HH:MM (00:00–23:59).');

function isStrictlyAscending(values: ReadonlyArray<string | number>): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

export const MAX_REMINDER_TIMES = 6;
export const reminderTimesSchema = z
  .array(reminderTimeSchema)
  .min(1, 'Cần ít nhất một giờ nhắc.')
  .max(MAX_REMINDER_TIMES, `Tối đa ${MAX_REMINDER_TIMES} giờ nhắc cho một lịch.`)
  .refine(isStrictlyAscending, 'times phải tăng dần và không trùng nhau.');

/** ISO 8601: 1 = thứ Hai, 7 = Chủ nhật. */
export const reminderWeekdaySchema = z.number().int().min(1).max(7);
export const WEEKDAY_LABELS_VI: Readonly<Record<number, string>> = {
  1: 'T2',
  2: 'T3',
  3: 'T4',
  4: 'T5',
  5: 'T6',
  6: 'T7',
  7: 'CN',
};
export const reminderWeekdaysSchema = z
  .array(reminderWeekdaySchema)
  .min(1, 'Cần chọn ít nhất một ngày trong tuần.')
  .max(7, 'Tối đa 7 ngày trong tuần.')
  .refine(isStrictlyAscending, 'weekdays phải tăng dần và không trùng nhau.');

export const reminderSchema = z.object({
  id: idSchema,
  subjectId: idSchema,
  kind: reminderKindSchema,
  /** Tiêu đề người dùng tự đặt (không phải chỉ định y khoa). */
  title: z.string().min(2).max(120),
  note: z.string().max(500).nullable(),
  times: reminderTimesSchema,
  weekdays: reminderWeekdaysSchema,
  startsOn: isoDateSchema,
  endsOn: isoDateSchema.nullable(),
  active: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type ReminderSummary = z.infer<typeof reminderSchema>;

export const reminderListSchema = z.object({
  items: z.array(reminderSchema),
});
export type ReminderList = z.infer<typeof reminderListSchema>;

/** POST /subjects/:id/reminders — chỉ chủ hồ sơ. */
export const createReminderSchema = z
  .object({
    kind: reminderKindSchema,
    title: z.string().trim().min(2).max(120),
    note: z.string().trim().max(500).nullable().optional(),
    times: reminderTimesSchema,
    weekdays: reminderWeekdaysSchema,
    startsOn: isoDateSchema,
    endsOn: isoDateSchema.nullable().optional(),
    active: z.boolean().default(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.endsOn && value.endsOn < value.startsOn) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsOn'],
        message: 'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.',
      });
    }
  });
export type CreateReminderInput = z.infer<typeof createReminderSchema>;

/**
 * PATCH /subjects/:id/reminders/:reminderId — cùng trường với create, tất cả
 * tùy chọn. Ràng buộc `endsOn >= startsOn` được kiểm sau khi gộp với bản ghi
 * hiện có (service), vì PATCH có thể chỉ gửi một trong hai mốc.
 */
export const updateReminderSchema = z
  .object({
    kind: reminderKindSchema.optional(),
    title: z.string().trim().min(2).max(120).optional(),
    note: z.string().trim().max(500).nullable().optional(),
    times: reminderTimesSchema.optional(),
    weekdays: reminderWeekdaysSchema.optional(),
    startsOn: isoDateSchema.optional(),
    endsOn: isoDateSchema.nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Cần ít nhất một trường để cập nhật.');
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;

// ---------------------------------------------------------------------------
// Occurrence hôm nay + đánh dấu đã thực hiện
// ---------------------------------------------------------------------------

export const reminderCompletionStatusSchema = z.enum(['done', 'skipped']);
export type ReminderCompletionStatus = z.infer<typeof reminderCompletionStatusSchema>;

/** Trạng thái hiển thị của một occurrence: chưa đánh dấu / đã làm / đã bỏ qua. */
export const reminderOccurrenceStatusSchema = z.enum(['pending', 'done', 'skipped']);
export type ReminderOccurrenceStatus = z.infer<typeof reminderOccurrenceStatusSchema>;

export const reminderCompletionSchema = z.object({
  status: reminderCompletionStatusSchema,
  completedAt: isoDateTimeSchema,
  /**
   * Người bấm đánh dấu (chủ hồ sơ hoặc người thân có quyền xem số đo).
   * Null khi tài khoản đã bị xoá (FK `set null`) — không suy ra người khác.
   */
  completedBy: z
    .object({
      userId: idSchema,
      displayName: z.string().min(1),
    })
    .nullable(),
});
export type ReminderCompletion = z.infer<typeof reminderCompletionSchema>;

export const reminderOccurrenceSchema = z.object({
  reminder: reminderSchema,
  time: reminderTimeSchema,
  status: reminderOccurrenceStatusSchema,
  completion: reminderCompletionSchema.nullable(),
});
export type ReminderOccurrence = z.infer<typeof reminderOccurrenceSchema>;

/** GET /subjects/:id/reminders/today — occurrence của một ngày theo timezone hồ sơ. */
export const reminderDaySchema = z.object({
  date: isoDateSchema,
  timezone: z.string().min(1),
  items: z.array(reminderOccurrenceSchema),
});
export type ReminderDay = z.infer<typeof reminderDaySchema>;

export const reminderTodayQuerySchema = z
  .object({
    date: isoDateSchema.optional(),
  })
  .strict();
export type ReminderTodayQuery = z.infer<typeof reminderTodayQuerySchema>;

/** POST /subjects/:id/reminders/:reminderId/completions */
export const reminderCompletionWriteSchema = z
  .object({
    date: isoDateSchema,
    time: reminderTimeSchema,
    status: reminderCompletionStatusSchema,
  })
  .strict();
export type ReminderCompletionWrite = z.infer<typeof reminderCompletionWriteSchema>;

/** DELETE /subjects/:id/reminders/:reminderId/completions?date=&time= */
export const reminderCompletionQuerySchema = z
  .object({
    date: isoDateSchema,
    time: reminderTimeSchema,
  })
  .strict();
export type ReminderCompletionQuery = z.infer<typeof reminderCompletionQuerySchema>;

/** Kết quả ghi đánh dấu — cùng khoá occurrence `(reminderId, date, time)`. */
export const reminderCompletionResultSchema = z.object({
  reminderId: idSchema,
  date: isoDateSchema,
  time: reminderTimeSchema,
  status: reminderCompletionStatusSchema,
  completedAt: isoDateTimeSchema,
  completedBy: z
    .object({
      userId: idSchema,
      displayName: z.string().min(1),
    })
    .nullable(),
});
export type ReminderCompletionResult = z.infer<typeof reminderCompletionResultSchema>;
