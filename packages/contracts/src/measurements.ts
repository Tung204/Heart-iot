import { z } from 'zod';
import { heartRateQualitySchema, idSchema, isoDateTimeSchema, motionQualitySchema } from './core';
import { policySchema } from './policies';
import { deviceStatusSchema } from './telemetry';

/**
 * Hợp đồng đo lường — wave 1 be-data.
 *
 * Semantics v1 (đối chiếu docs/04, R-04 review v0.1): mỗi envelope telemetry là
 * một **snapshot** tại `measured_at`. Timeline chỉ chứa snapshot có `measured_at`
 * hợp lệ; không gộp/trung bình các mẫu trong endpoint measurements.
 * Bản ghi `measured_at: null` / `clock_status: unsynced` không đặt được lên trục
 * thời gian nên bị loại khỏi timeline, được đếm vào `excludedUnsyncedCount`; nếu
 * cả khoảng không có mốc tin cậy thì gap có lý do `clock_unsynced`. Không bịa mẫu.
 */

export const measurementPointSchema = z.object({
  measuredAt: isoDateTimeSchema.nullable(),
  receivedAt: isoDateTimeSchema,
  heartRateBpm: z.number().int().min(20).max(300).nullable(),
  heartRateQuality: heartRateQualitySchema,
  motionQuality: motionQualitySchema,
  stepsSinceBoot: z.number().int().nonnegative(),
  batteryPercent: z.number().int().min(0).max(100).nullable(),
  isLate: z.boolean(),
  isQuarantined: z.boolean(),
});
export type MeasurementPoint = z.infer<typeof measurementPointSchema>;

export const measurementGapReasonSchema = z.enum(['no_data', 'clock_unsynced', 'quarantined']);
export type MeasurementGapReason = z.infer<typeof measurementGapReasonSchema>;

export const measurementGapSchema = z.object({
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
  reason: measurementGapReasonSchema,
});
export type MeasurementGap = z.infer<typeof measurementGapSchema>;

export const coverageSchema = z.object({
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
  expectedIntervalSeconds: z.number().int().positive(),
  observedCount: z.number().int().nonnegative(),
  expectedCount: z.number().int().nonnegative(),
  percent: z.number().min(0).max(100),
});
export type Coverage = z.infer<typeof coverageSchema>;

export const measurementsResponseSchema = z.object({
  items: z.array(measurementPointSchema),
  nextCursor: z.string().nullable(),
  coverage: coverageSchema,
  gaps: z.array(measurementGapSchema),
  excludedUnsyncedCount: z.number().int().nonnegative(),
  nextCursorMeta: z
    .object({
      measuredAt: isoDateTimeSchema,
      id: idSchema,
    })
    .optional(),
});
export type MeasurementsResponse = z.infer<typeof measurementsResponseSchema>;

export const dailySummarySchema = z.object({
  /** Ngày theo timezone hồ sơ (YYYY-MM-DD). */
  date: z.iso.date(),
  timezone: z.string().min(1),
  /**
   * Chỉ tính mẫu `quality.heart_rate === 'valid'` và `heart_rate_bpm != null`.
   * Không có mẫu hợp lệ → null, không trả 0 giả.
   */
  heartRate: z
    .object({
      avg: z.number(),
      min: z.number(),
      max: z.number(),
      validSamples: z.number().int().nonnegative(),
      invalidSamples: z.number().int().nonnegative(),
    })
    .nullable(),
  steps: z.object({
    total: z.number().int().nonnegative(),
    completeness: z.enum(['complete', 'partial', 'unavailable']),
    notes: z.array(z.string()),
  }),
  coverage: coverageSchema,
  gaps: z.array(measurementGapSchema),
  incidents: z.object({
    total: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
  }),
  lastSeenAt: isoDateTimeSchema.nullable(),
  batteryPercent: z.number().int().min(0).max(100).nullable(),
  source: z.enum(['synthetic', 'device']),
});
export type DailySummary = z.infer<typeof dailySummarySchema>;

/** GET /subjects/:id/status — trạng thái thiết bị + policy đang áp dụng. */
export const subjectStatusResponseSchema = z.object({
  devices: z.array(deviceStatusSchema),
  policy: policySchema,
  asOf: isoDateTimeSchema,
});
export type SubjectStatusResponse = z.infer<typeof subjectStatusResponseSchema>;

/** GET /subjects/:id/devices — danh sách thiết bị đang gán kèm trạng thái. */
export const subjectDevicesResponseSchema = z.object({
  items: z.array(deviceStatusSchema),
});
export type SubjectDevicesResponse = z.infer<typeof subjectDevicesResponseSchema>;

export const measurementsQuerySchema = z.object({
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
  cursor: z.string().max(1024).optional(),
});
export type MeasurementsQuery = z.infer<typeof measurementsQuerySchema>;

export const dailySummaryQuerySchema = z.object({
  date: z.iso.date(),
});
export type DailySummaryQuery = z.infer<typeof dailySummaryQuerySchema>;

export const exportQuerySchema = z.object({
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
});
export type ExportQuery = z.infer<typeof exportQuerySchema>;
