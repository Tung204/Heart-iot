import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './core';

/**
 * Tuỳ chọn kênh thông báo của một tài khoản.
 *
 * `inApp` cố định `true`: cảnh báo và nhắc chăm sóc luôn còn trong hộp thư;
 * Web Push chỉ là kênh phụ, không thay thế. `webPushAvailable` phản ánh cờ
 * server `WEB_PUSH_ENABLED`, không phải quyền của người dùng.
 */
export const notificationPreferencesSchema = z
  .object({
    inApp: z.literal(true),
    webPush: z.boolean(),
    webPushAvailable: z.boolean(),
    /** Khóa công khai để trình duyệt gọi pushManager.subscribe; null khi cờ tắt. */
    webPushPublicKey: z.string().min(1).max(500).nullable(),
  })
  .strict();
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

/** Chỉ cho bật/tắt Web Push; in-app không tắt được trong phạm vi V10. */
export const notificationPreferencesUpdateSchema = z
  .object({ webPush: z.boolean() })
  .strict();
export type NotificationPreferencesUpdate = z.infer<typeof notificationPreferencesUpdateSchema>;

const base64UrlSchema = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+$/, 'Khóa phải là base64url.');

/**
 * Cùng cấu trúc `PushSubscription.toJSON()` của trình duyệt; chỉ nhận endpoint
 * HTTPS. `expirationTime` được chấp nhận nhưng không lưu vì trình duyệt tự quản lý.
 */
export const pushSubscriptionInputSchema = z
  .object({
    endpoint: z
      .string()
      .url()
      .max(2048)
      .refine((value) => value.startsWith('https://'), 'Endpoint phải dùng HTTPS.'),
    expirationTime: z.number().int().nonnegative().nullable().optional(),
    keys: z
      .object({
        p256dh: base64UrlSchema(20, 200),
        auth: base64UrlSchema(8, 100),
      })
      .strict(),
  })
  .strict();
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

/** Không trả endpoint/khóa: endpoint là capability URL, chỉ trả id + host để quản lý. */
export const pushSubscriptionViewSchema = z
  .object({
    id: idSchema,
    endpointHost: z.string().min(1).max(255),
    createdAt: isoDateTimeSchema,
    lastUsedAt: isoDateTimeSchema.nullable(),
  })
  .strict();
export type PushSubscriptionView = z.infer<typeof pushSubscriptionViewSchema>;

export const pushSubscriptionListSchema = z
  .object({
    available: z.boolean(),
    items: z.array(pushSubscriptionViewSchema).max(20),
  })
  .strict();
export type PushSubscriptionList = z.infer<typeof pushSubscriptionListSchema>;
