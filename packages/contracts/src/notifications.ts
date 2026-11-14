import { z } from 'zod';
import { idSchema, incidentStateSchema, incidentTypeSchema, isoDateTimeSchema } from './core';

export const notificationKindSchema = z.enum(['alert', 'update']);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const notificationItemSchema = z
  .object({
    id: idSchema,
    incidentId: idSchema,
    subjectId: idSchema,
    subjectName: z.string(),
    incidentType: incidentTypeSchema,
    state: incidentStateSchema,
    revision: z.number().int().positive(),
    kind: notificationKindSchema,
    sentAt: isoDateTimeSchema.nullable(),
    readAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
  })
  .strict();
export type NotificationItem = z.infer<typeof notificationItemSchema>;

export const notificationListSchema = z.object({
  items: z.array(notificationItemSchema),
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationList = z.infer<typeof notificationListSchema>;
