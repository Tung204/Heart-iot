import { z } from 'zod';
import { idSchema, incidentStateSchema, incidentTypeSchema, isoDateTimeSchema } from './core';

/** Alert/update có incident; care_digest/care_rule là thông báo theo hồ sơ. */
export const notificationKindSchema = z.enum([
  'alert',
  'update',
  'escalation',
  'care_digest',
  'care_rule',
]);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const notificationItemSchema = z
  .object({
    id: idSchema,
    /** NULL với care_digest/care_rule — không có incident. */
    incidentId: idSchema.nullable(),
    subjectId: idSchema,
    subjectName: z.string(),
    incidentType: incidentTypeSchema.nullable(),
    state: incidentStateSchema.nullable(),
    revision: z.number().int().positive().nullable(),
    kind: notificationKindSchema,
    /** Snapshot cho care_*; alert/update để null và UI suy từ incident. */
    title: z.string().nullable().optional(),
    body: z.string().nullable().optional(),
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
