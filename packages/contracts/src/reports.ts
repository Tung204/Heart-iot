import { z } from 'zod';
import {
  idSchema,
  incidentStateSchema,
  incidentTypeSchema,
  isoDateSchema,
  isoDateTimeSchema,
} from './core';

/**
 * Phiếu đi khám 1 trang (FR-16) + điểm chú ý (FR-22) — dữ liệu tổng hợp đã
 * kiểm quyền `canViewMeasurements` và cửa sổ `sharedFrom`/`historyDays`.
 *
 * Nguyên tắc nội dung:
 * - Chỉ nêu số liệu + ngày, KHÔNG kết luận bệnh, không dùng từ mang nghĩa
 *   chẩn đoán (nguy hiểm/suy tim/bất thường...).
 * - Không có dữ liệu thì trả `null` (nhịp tim/bước) hoặc 0, không nội suy.
 * - Luôn kèm `disclaimer` cố định và nhãn `simulated` khi dữ liệu là mô phỏng.
 */

/** Số ngày tối đa của một phiếu (3 tháng) — vượt sẽ bị cắt bớt theo `to`. */
export const VISIT_REPORT_MAX_DAYS = 92;
/** Mặc định 30 ngày gần nhất (tính cả hôm nay) khi client không truyền from/to. */
export const VISIT_REPORT_DEFAULT_DAYS = 30;
/** Khoảng thiếu từ 6 giờ trở lên được liệt kê và có thể thành điểm chú ý. */
export const VISIT_REPORT_GAP_HOURS = 6;
/** Độ phủ dưới 80% sinh điểm chú ý "độ phủ dữ liệu". */
export const VISIT_REPORT_LOW_COVERAGE_PERCENT = 80;
export const VISIT_REPORT_MAX_ATTENTION_POINTS = 5;
/** Câu cố định — web in nguyên văn, không tự diễn giải. */
export const VISIT_REPORT_DISCLAIMER =
  'Phiếu chỉ tổng hợp số liệu tham khảo từ dữ liệu thiết bị, không thay thế việc khám hoặc chẩn đoán của bác sĩ.';

export const visitReportQuerySchema = z
  .object({
    /** Ngày địa phương YYYY-MM-DD theo timezone hồ sơ. */
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
  })
  .strict();
export type VisitReportQuery = z.infer<typeof visitReportQuerySchema>;

export const visitReportSubjectSchema = z.object({
  id: idSchema,
  displayName: z.string().min(1).max(120),
  timezone: z.string().min(1).max(100),
});
export type VisitReportSubject = z.infer<typeof visitReportSubjectSchema>;

export const visitReportPeriodSchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  days: z.number().int().min(1).max(VISIT_REPORT_MAX_DAYS),
});
export type VisitReportPeriod = z.infer<typeof visitReportPeriodSchema>;

export const visitReportGapSchema = z.object({
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
  /** Số giờ thiếu, làm tròn 1 chữ số thập phân. */
  hours: z.number().positive(),
});
export type VisitReportGap = z.infer<typeof visitReportGapSchema>;

export const visitReportSummarySchema = z.object({
  /** Số mẫu đo hợp lệ (đã đồng bộ, không cách ly, không vượt hiện tại). */
  measurementCount: z.number().int().min(0),
  /** Số ngày địa phương có ít nhất một mẫu đo. */
  daysWithData: z.number().int().min(0),
  /** Tỉ lệ ngày có dữ liệu trên tổng số ngày của kỳ, 1 chữ số thập phân. */
  coveragePercent: z.number().min(0).max(100),
  heartRate: z
    .object({
      avg: z.number().min(0).max(300),
      min: z.number().min(0).max(300),
      max: z.number().min(0).max(300),
    })
    .nullable(),
  steps: z
    .object({
      total: z.number().int().min(0),
      avgPerDay: z.number().min(0),
    })
    .nullable(),
  gaps: z.array(visitReportGapSchema),
});
export type VisitReportSummary = z.infer<typeof visitReportSummarySchema>;

export const visitReportIncidentItemSchema = z.object({
  id: idSchema,
  type: incidentTypeSchema,
  state: incidentStateSchema,
  detectedAt: isoDateTimeSchema,
});
export type VisitReportIncidentItem = z.infer<typeof visitReportIncidentItemSchema>;

export const visitReportIncidentsSchema = z.object({
  total: z.number().int().min(0),
  falls: z.number().int().min(0),
  sos: z.number().int().min(0),
  /** Số sự cố còn mở theo `INCIDENT_OPEN_STATES` (suspected/open/acknowledged). */
  open: z.number().int().min(0),
  items: z.array(visitReportIncidentItemSchema),
});
export type VisitReportIncidents = z.infer<typeof visitReportIncidentsSchema>;

/**
 * Điểm chú ý sinh tự động, tất định, tối đa 5. `label` ngắn để in đậm trên
 * phiếu; `detail` chỉ chứa số liệu + ngày, không kết luận y khoa.
 */
export const visitReportAttentionPointSchema = z.object({
  date: isoDateSchema,
  label: z.string().min(1).max(80),
  detail: z.string().min(1).max(300),
});
export type VisitReportAttentionPoint = z.infer<typeof visitReportAttentionPointSchema>;

export const visitReportSchema = z.object({
  subject: visitReportSubjectSchema,
  period: visitReportPeriodSchema,
  generatedAt: isoDateTimeSchema,
  summary: visitReportSummarySchema,
  incidents: visitReportIncidentsSchema,
  attentionPoints: z.array(visitReportAttentionPointSchema).max(VISIT_REPORT_MAX_ATTENTION_POINTS),
  /** Có ít nhất một mẫu từ nguồn mô phỏng (`simulator`/`synthetic`) trong kỳ. */
  simulated: z.boolean(),
  disclaimer: z.string().min(1).max(500),
});
export type VisitReport = z.infer<typeof visitReportSchema>;
