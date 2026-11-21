import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './core';

/**
 * Chính sách leo thang cảnh báo (V10, chỉ kênh trong ứng dụng).
 *
 * Giá trị 10/20/30 phút là **đề xuất**, chưa phải quyết định nghiệp vụ; vì vậy
 * cấu hình mặc định đang tắt. Chủ hồ sơ bật và sửa sau khi xem preview.
 * Không có "giờ yên tĩnh" cho cảnh báo khẩn; không gọi điện/SMS/Web Push.
 */
export const DEFAULT_ALERT_ESCALATION_CONFIG = {
  enabled: false,
  steps: [{ afterMinutes: 10 }, { afterMinutes: 20 }, { afterMinutes: 30 }],
} as const;

export const alertEscalationStepSchema = z
  .object({
    afterMinutes: z.int().min(1).max(24 * 60),
  })
  .strict();
export type AlertEscalationStep = z.infer<typeof alertEscalationStepSchema>;

export const alertEscalationConfigSchema = z
  .object({
    enabled: z.boolean(),
    steps: z.array(alertEscalationStepSchema).min(1).max(3),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<number>();
    for (let index = 0; index < value.steps.length; index += 1) {
      const current = value.steps[index]!;
      if (seen.has(current.afterMinutes)) {
        ctx.addIssue({
          code: 'custom',
          path: ['steps', index, 'afterMinutes'],
          message: 'Các mốc thời gian phải khác nhau.',
        });
      }
      seen.add(current.afterMinutes);
      const previous = value.steps[index - 1];
      if (previous && current.afterMinutes <= previous.afterMinutes) {
        ctx.addIssue({
          code: 'custom',
          path: ['steps', index, 'afterMinutes'],
          message: 'Mốc thời gian phải tăng dần.',
        });
      }
    }
  });
export type AlertEscalationConfig = z.infer<typeof alertEscalationConfigSchema>;

const alertPolicyViewBase = {
  subjectId: idSchema,
  version: z.int().nonnegative(),
  source: z.enum(['default', 'database']),
  updatedAt: isoDateTimeSchema.nullable(),
};

export const alertPolicyViewSchema = z
  .object({
    ...alertPolicyViewBase,
    config: alertEscalationConfigSchema,
  })
  .strict();
export type AlertPolicyView = z.infer<typeof alertPolicyViewSchema>;

export const alertPolicyPreviewStepSchema = z
  .object({
    level: z.int().min(1).max(3),
    afterMinutes: z.int().min(1).max(24 * 60),
    channel: z.literal('in_app'),
    note: z.string().min(1).max(240),
  })
  .strict();
export type AlertPolicyPreviewStep = z.infer<typeof alertPolicyPreviewStepSchema>;

export const alertPolicyPreviewRecipientSchema = z
  .object({
    userId: idSchema,
    displayName: z.string().min(1).max(120),
  })
  .strict();
export type AlertPolicyPreviewRecipient = z.infer<typeof alertPolicyPreviewRecipientSchema>;

export const alertPolicyPreviewSchema = z
  .object({
    generatedAt: isoDateTimeSchema,
    enabled: z.boolean(),
    steps: z.array(alertPolicyPreviewStepSchema).max(3),
    /** Người sẽ nhận tại thời điểm xem preview; scheduler còn kiểm lại quyền khi gửi. */
    recipients: z.array(alertPolicyPreviewRecipientSchema).max(100),
    recipientCount: z.int().nonnegative().max(100),
    warnings: z.array(z.string().min(1).max(240)).max(3),
    disclaimer: z.string().min(1).max(240),
  })
  .strict();
export type AlertPolicyPreview = z.infer<typeof alertPolicyPreviewSchema>;
