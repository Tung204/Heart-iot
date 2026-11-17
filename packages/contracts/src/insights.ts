import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './core';

/**
 * Xu hướng nhiều ngày cho một hồ sơ.
 *
 * Chỉ trả số liệu tổng hợp từ các mẫu đã qua kiểm tra quyền và cửa sổ chia sẻ.
 * Ngày không có mẫu vẫn xuất hiện với `hasData: false` và `heartRate: null` —
 * không thay bằng 0 hoặc nội suy.
 */
export const insightsQuerySchema = z
  .object({
    days: z.coerce.number().int().min(7).max(30).default(7),
  })
  .strict();
export type InsightsQuery = z.infer<typeof insightsQuerySchema>;

export const insightHeartRateSchema = z.object({
  avg: z.number().min(0).max(300),
  min: z.number().min(0).max(300),
  max: z.number().min(0).max(300),
  validSamples: z.number().int().min(0),
});

export const insightStepsSchema = z.object({
  total: z.number().int().min(0),
  completeness: z.enum(['complete', 'partial', 'unavailable']),
});

export const insightCoverageSchema = z.object({
  percent: z.number().min(0).max(100),
  observedCount: z.number().int().min(0),
  expectedCount: z.number().int().min(0),
});

export const dailyInsightSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasData: z.boolean(),
  source: z.enum(['device', 'synthetic']),
  heartRate: insightHeartRateSchema.nullable(),
  steps: insightStepsSchema,
  coverage: insightCoverageSchema,
  incidents: z.object({
    total: z.number().int().min(0),
    resolved: z.number().int().min(0),
  }),
});
export type DailyInsight = z.infer<typeof dailyInsightSchema>;

export const insightsSummarySchema = z.object({
  dataDays: z.number().int().min(0),
  avgHeartRate: z.number().min(0).max(300).nullable(),
  totalSteps: z.number().int().min(0),
  avgCoveragePercent: z.number().min(0).max(100),
  incidentsTotal: z.number().int().min(0),
  incidentsResolved: z.number().int().min(0),
  syntheticDays: z.number().int().min(0),
});

export const insightsResponseSchema = z.object({
  subjectId: idSchema,
  timezone: z.string().min(1).max(100),
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
  days: z.array(dailyInsightSchema).min(1).max(31),
  summary: insightsSummarySchema,
  notes: z.array(z.string().max(300)).max(10),
});
export type InsightsResponse = z.infer<typeof insightsResponseSchema>;
