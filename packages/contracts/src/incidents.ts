import { z } from 'zod';
import {
  idSchema,
  isoDateTimeSchema,
  incidentStateSchema,
  incidentTypeSchema,
} from './core';
import { incidentEventTypeSchema } from './telemetry';

// Re-export để API/web dùng một nguồn state machine duy nhất.
export { incidentStateSchema, incidentTypeSchema, incidentEventTypeSchema };

/**
 * Chính sách demo đề xuất ở docs/03 (mục "Mạng, đồng hồ và dữ liệu cũ"):
 * sự kiện đến sau khi phát hiện quá ngưỡng này bị gắn cờ cần kiểm tra.
 * CHƯA CHỐT; đánh giá lại trước dữ liệu thật.
 */
export const LATE_EVENT_MINUTES = 5;

export const deviceRefSchema = z
  .object({
    id: idSchema,
    label: z.string(),
    serial: z.string(),
  })
  .strict();
export type DeviceRef = z.infer<typeof deviceRefSchema>;

export const acknowledgedBySchema = z
  .object({
    userId: idSchema,
    displayName: z.string(),
  })
  .strict();

export const incidentSummarySchema = z
  .object({
    id: idSchema,
    subjectId: idSchema,
    device: deviceRefSchema,
    type: incidentTypeSchema,
    state: incidentStateSchema,
    lastRevision: z.number().int().positive(),
    detectedAt: isoDateTimeSchema,
    lastEventAt: isoDateTimeSchema,
    createdAt: isoDateTimeSchema,
    cancelledAt: isoDateTimeSchema.nullable(),
    resolvedAt: isoDateTimeSchema.nullable(),
    resolutionReason: z.string().nullable(),
    resolutionOutcome: z.string().nullable(),
    version: z.number().int().positive(),
    late: z.boolean(),
    acknowledgedBy: acknowledgedBySchema.nullable(),
    /**
     * Cảnh báo đang hoạt động nhưng phát hiện trước mốc chia sẻ của người xem.
     * Chỉ xuất hiện với caregiver; UI phải ghi rõ đây là trạng thái an toàn hiện tại,
     * không phải lịch sử được chia sẻ. Cảnh báo đã đóng trước mốc không trả về.
     */
    startedBeforeShare: z.boolean().optional(),
  })
  .strict();
export type IncidentSummary = z.infer<typeof incidentSummarySchema>;

export const incidentEventViewSchema = z
  .object({
    eventRevision: z.number().int().positive(),
    eventType: incidentEventTypeSchema,
    measuredAt: isoDateTimeSchema.nullable(),
    receivedAt: isoDateTimeSchema,
    applied: z.boolean(),
    conflictReason: z.string().nullable(),
  })
  .strict();
export type IncidentEventView = z.infer<typeof incidentEventViewSchema>;

export const alertActionViewSchema = z
  .object({
    id: idSchema,
    action: z.enum(['acknowledge', 'resolve']),
    outcome: z.enum(['applied', 'conflict', 'forbidden']),
    reason: z.string().nullable(),
    actor: z
      .object({
        id: idSchema,
        displayName: z.string(),
      })
      .nullable(),
    stateBefore: incidentStateSchema,
    stateAfter: incidentStateSchema,
    createdAt: isoDateTimeSchema,
  })
  .strict();
export type AlertActionView = z.infer<typeof alertActionViewSchema>;

export const incidentRecipientSchema = z
  .object({
    userId: idSchema,
    displayName: z.string(),
    permissions: z
      .object({
        historyDays: z.number().int().min(1).max(3650),
        canReceiveAlerts: z.boolean(),
        canAcknowledge: z.boolean(),
        canResolve: z.boolean(),
        canViewAi: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type IncidentRecipient = z.infer<typeof incidentRecipientSchema>;

export const incidentDetailSchema = incidentSummarySchema.extend({
  events: z.array(incidentEventViewSchema),
  actions: z.array(alertActionViewSchema),
  recipients: z.array(incidentRecipientSchema),
});
export type IncidentDetail = z.infer<typeof incidentDetailSchema>;

export const incidentListSchema = z.object({
  items: z.array(incidentSummarySchema),
  nextCursor: z.string().nullable(),
});
export type IncidentList = z.infer<typeof incidentListSchema>;

export const alertsQuerySchema = z.object({
  state: z.enum(['open', 'closed']).optional().default('open'),
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AlertsQuery = z.infer<typeof alertsQuerySchema>;

export const acknowledgeAlertSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
export type AcknowledgeAlert = z.infer<typeof acknowledgeAlertSchema>;

export const resolveAlertSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    reason: z.string().trim().min(3).max(500),
    outcome: z.enum(['supported', 'no_action', 'false_alarm', 'other']),
  })
  .strict();
export type ResolveAlert = z.infer<typeof resolveAlertSchema>;

export const RESOLUTION_OUTCOMES = ['supported', 'no_action', 'false_alarm', 'other'] as const;

/** Payload sự kiện realtime `alert.updated` (ghi bảng realtime_events). */
export const alertUpdatedEventSchema = z
  .object({
    incidentId: idSchema,
    subjectId: idSchema,
    state: incidentStateSchema,
    version: z.number().int().positive(),
    lastRevision: z.number().int().positive(),
    occurredAt: isoDateTimeSchema,
  })
  .strict();
export type AlertUpdatedEvent = z.infer<typeof alertUpdatedEventSchema>;
