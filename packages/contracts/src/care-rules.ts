import { z } from 'zod';
import { idSchema, isoDateSchema, isoDateTimeSchema } from './core';

/**
 * Quy tắc chăm sóc chủ động (V9.2).
 *
 * Đây là cấu hình do chủ hồ sơ bật/tắt; mặc định tắt và không phải ngưỡng y khoa.
 * `inactivity` chỉ nhắc nhẹ khi chưa ghi nhận đủ vận động trong khung giờ đã đặt.
 * `care_digest` tổng hợp cuối ngày bằng template xác định, chưa dùng AI.
 */
export const careRuleKindSchema = z.enum(['inactivity', 'care_digest']);
export type CareRuleKind = z.infer<typeof careRuleKindSchema>;

/** Giờ địa phương dạng HH:MM (00:00–23:59). */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Giờ phải có dạng HH:MM.');

const weekdaysSchema = z
  .array(z.int().min(1).max(7))
  .min(1)
  .max(7)
  .refine((days) => new Set(days).size === days.length, 'Ngày trong tuần không được lặp.');

export const DEFAULT_INACTIVITY_RULE_CONFIG = {
  enabled: false,
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  windowStart: '09:00',
  windowEnd: '18:00',
  minSteps: 50,
  graceMinutes: 30,
} as const;

export const inactivityRuleConfigSchema = z
  .object({
    enabled: z.boolean(),
    weekdays: weekdaysSchema,
    windowStart: timeOfDaySchema,
    windowEnd: timeOfDaySchema,
    minSteps: z.int().min(0).max(100_000),
    graceMinutes: z.int().min(0).max(240),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.windowStart >= value.windowEnd) {
      ctx.addIssue({
        code: 'custom',
        path: ['windowEnd'],
        message: 'Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày.',
      });
    }
    const [endHour = 0, endMinute = 0] = value.windowEnd.split(':').map(Number);
    if (endHour * 60 + endMinute + value.graceMinutes > 24 * 60) {
      ctx.addIssue({
        code: 'custom',
        path: ['graceMinutes'],
        message: 'Giờ kết thúc cộng thời gian chờ không được vượt quá 24:00.',
      });
    }
  });
export type InactivityRuleConfig = z.infer<typeof inactivityRuleConfigSchema>;

export const DEFAULT_CARE_DIGEST_RULE_CONFIG = {
  enabled: false,
  time: '20:00',
} as const;

export const careDigestRuleConfigSchema = z
  .object({
    enabled: z.boolean(),
    time: timeOfDaySchema,
  })
  .strict();
export type CareDigestRuleConfig = z.infer<typeof careDigestRuleConfigSchema>;

export const careRuleConfigSchema = z.union([
  inactivityRuleConfigSchema,
  careDigestRuleConfigSchema,
]);
export type CareRuleConfig = z.infer<typeof careRuleConfigSchema>;

const careRuleViewBase = {
  subjectId: idSchema,
  version: z.int().nonnegative(),
  source: z.enum(['default', 'database']),
  updatedAt: isoDateTimeSchema.nullable(),
};

export const careRuleViewSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('inactivity'),
      config: inactivityRuleConfigSchema,
      ...careRuleViewBase,
    })
    .strict(),
  z
    .object({
      kind: z.literal('care_digest'),
      config: careDigestRuleConfigSchema,
      ...careRuleViewBase,
    })
    .strict(),
]);
export type CareRuleView = z.infer<typeof careRuleViewSchema>;

export const careRulePreviewDaySchema = z
  .object({
    date: isoDateSchema,
    time: timeOfDaySchema,
    applies: z.boolean(),
    /** Giải thích ngắn, không phải dự đoán dữ liệu sức khỏe. */
    note: z.string().min(1).max(240),
  })
  .strict();
export type CareRulePreviewDay = z.infer<typeof careRulePreviewDaySchema>;

export const careRulePreviewSchema = z
  .object({
    kind: careRuleKindSchema,
    generatedAt: isoDateTimeSchema,
    days: z.array(careRulePreviewDaySchema).length(7),
    disclaimer: z.string().min(1),
  })
  .strict();
export type CareRulePreview = z.infer<typeof careRulePreviewSchema>;
