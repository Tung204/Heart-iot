import { z } from 'zod';
import {
  heartRateQualitySchema,
  idSchema,
  isoDateTimeSchema,
  motionQualitySchema,
  incidentTypeSchema,
} from './core';

/**
 * Envelope telemetry v1.0 — nguồn: docs/04-du-lieu-va-giao-tiep.md.
 * Firmware không được khai subject_id; server gán assignment.
 */
export const telemetryEnvelopeSchema = z
  .object({
    schema_version: z.literal('1.0'),
    message_id: z.string().min(1).max(128),
    device_id: z.string().min(1).max(128),
    boot_id: z.string().min(1).max(128),
    sequence: z.number().int().nonnegative(),
    measured_at: isoDateTimeSchema.nullable(),
    clock_status: z.enum(['synced', 'unsynced']),
    uptime_ms: z.number().int().nonnegative(),
    metrics: z
      .object({
        heart_rate_bpm: z.number().int().min(20).max(300).nullable(),
        steps_since_boot: z.number().int().nonnegative(),
      })
      .strict(),
    quality: z
      .object({
        heart_rate: heartRateQualitySchema,
        motion: motionQualitySchema,
      })
      .strict(),
    battery_percent: z.number().int().min(0).max(100).nullable(),
    firmware_version: z.string().min(1).max(64),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.clock_status === 'unsynced' && value.measured_at !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['measured_at'],
        message: 'measured_at phải là null khi clock_status là unsynced',
      });
    }
    if (value.quality.heart_rate !== 'valid' && value.metrics.heart_rate_bpm !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['metrics', 'heart_rate_bpm'],
        message: 'Chỉ số nhịp tim không hợp lệ phải là null, không dùng 0 hoặc giá trị cũ',
      });
    }
  });
export type TelemetryEnvelope = z.infer<typeof telemetryEnvelopeSchema>;

export const incidentEventTypeSchema = z.enum([
  'fall.candidate',
  'fall.cancelled',
  'fall.confirmed',
  'user.cancel_requested',
  'sos.confirmed',
]);
export type IncidentEventType = z.infer<typeof incidentEventTypeSchema>;

/**
 * `incident_id` do thiết bị sinh, chỉ duy nhất trong namespace của thiết bị.
 * Server khóa incident theo (device_id, incident_id), không dùng nó như ID toàn cục.
 */
export const incidentEnvelopeSchema = z
  .object({
    schema_version: z.literal('1.0'),
    message_id: z.string().min(1).max(128),
    device_id: z.string().min(1).max(128),
    boot_id: z.string().min(1).max(128),
    sequence: z.number().int().nonnegative(),
    measured_at: isoDateTimeSchema.nullable(),
    clock_status: z.enum(['synced', 'unsynced']),
    uptime_ms: z.number().int().nonnegative(),
    firmware_version: z.string().min(1).max(64),
    incident_id: z.string().min(1).max(128),
    event_revision: z.number().int().positive(),
    event_type: incidentEventTypeSchema,
    incident_type: incidentTypeSchema,
    evidence: z
      .object({
        algorithm_version: z.string().min(1).max(64),
        wear_location: z.string().max(64).nullable(),
        motion_quality: motionQualitySchema,
        heart_rate_quality: heartRateQualitySchema,
        heart_rate_bpm: z.number().int().min(20).max(300).nullable(),
        notes: z.string().max(500).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.clock_status === 'unsynced' && value.measured_at !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['measured_at'],
        message: 'measured_at phải là null khi clock_status là unsynced',
      });
    }
  });
export type IncidentEnvelope = z.infer<typeof incidentEnvelopeSchema>;

export const ingestAckSchema = z.object({
  status: z.enum(['accepted', 'duplicate', 'rejected']),
  sourceMessageId: z.string(),
  receivedAt: isoDateTimeSchema,
  incidentId: idSchema.nullable(),
  acceptedRevision: z.number().int().positive().nullable(),
  code: z.string().nullable(),
  message: z.string().nullable(),
});
export type IngestAck = z.infer<typeof ingestAckSchema>;

export const ingestHeadersSchema = z.object({
  'x-device-id': z.string().min(1).max(128),
  'x-device-key': z.string().min(16).max(256),
});

export const deviceStatusSchema = z.object({
  deviceId: idSchema,
  subjectId: idSchema,
  serial: z.string(),
  label: z.string(),
  online: z.boolean(),
  lastSeenAt: isoDateTimeSchema.nullable(),
  freshness: z.enum(['live', 'stale', 'offline', 'never']),
  lastHeartRateBpm: z.number().int().nullable(),
  lastHeartRateQuality: heartRateQualitySchema.nullable(),
  lastMeasuredAt: isoDateTimeSchema.nullable(),
  batteryPercent: z.number().int().nullable(),
  firmwareVersion: z.string().nullable(),
  clockStatus: z.enum(['synced', 'unsynced', 'unknown']),
});
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;
