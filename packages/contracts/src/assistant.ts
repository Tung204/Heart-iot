import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './core';
import { measurementGapReasonSchema } from './measurements';
import { createReminderSchema } from './reminders';

/**
 * Hợp đồng trợ lý AI — wave 2 be-ai.
 *
 * Trợ lý chỉ tổng hợp số liệu đo đã được kiểm quyền. Không có trường chẩn đoán,
 * kê đơn hay dự đoán nguy cơ y khoa trong schema. `disclaimer` cố định để mọi
 * nơi hiển thị đều mang cùng một ranh giới trách nhiệm.
 *
 * `dataQuality` mô tả độ phủ/khoảng thiếu/lần nhận cuối/nguồn mô phỏng để người
 * đọc biết câu tóm tắt dựa trên bao nhiêu mẫu. Khối này chỉ có số đếm, phần trăm,
 * thời điểm và mã lý do — không chứa giá trị đo thô hay nội dung chẩn đoán.
 */

export const ASSISTANT_DISCLAIMER =
  'Thông tin tổng hợp từ dữ liệu thiết bị, không phải chẩn đoán y khoa.';

export const assistantSummaryStatusSchema = z.enum(['ready', 'degraded']);
export type AssistantSummaryStatus = z.infer<typeof assistantSummaryStatusSchema>;

export const assistantProviderSchema = z.enum(['template', 'openai-compatible']);
export type AssistantProvider = z.infer<typeof assistantProviderSchema>;

export const assistantSectionKindSchema = z.enum(['measurements', 'alerts', 'tasks', 'note']);
export type AssistantSectionKind = z.infer<typeof assistantSectionKindSchema>;

export const assistantFactSchema = z.object({
  label: z.string().min(1).max(200),
  value: z.union([z.string(), z.number()]),
  unit: z.string().min(1).max(20).optional(),
  sourceRef: z.string().min(1).max(40).optional(),
});
export type AssistantFact = z.infer<typeof assistantFactSchema>;

export const assistantSectionSchema = z.object({
  kind: assistantSectionKindSchema,
  title: z.string().min(1).max(140),
  body: z.string().min(1).max(3000),
  facts: z.array(assistantFactSchema).max(30),
});
export type AssistantSection = z.infer<typeof assistantSectionSchema>;

export const assistantSourceSchema = z.object({
  type: z.enum(['measurements', 'incidents', 'maintenance_tasks']),
  id: idSchema.optional(),
  label: z.string().min(1).max(120),
  at: isoDateTimeSchema.optional(),
});
export type AssistantSource = z.infer<typeof assistantSourceSchema>;

export const assistantDataQualitySchema = z.object({
  /** Phần trăm mẫu đã nhận trên số mẫu kỳ vọng theo nhịp tim của policy. */
  coveragePercent: z.number().min(0).max(100),
  observedCount: z.number().int().nonnegative(),
  expectedCount: z.number().int().positive(),
  /** Số khoảng thiếu và mã lý do (không chứa giá trị đo thô). */
  gaps: z.object({
    count: z.number().int().nonnegative(),
    reasons: z.array(measurementGapReasonSchema).max(3),
  }),
  /** Thời điểm đo cuối của mẫu hợp lệ trong khoảng; null khi không có mẫu. */
  lastSeenAt: isoDateTimeSchema.nullable(),
  /** Có ít nhất một mẫu nguồn simulator/synthetic trong khoảng. */
  synthetic: z.boolean(),
  limitations: z.array(z.string().min(1).max(300)).max(10),
});
export type AssistantDataQuality = z.infer<typeof assistantDataQualitySchema>;

export const assistantSummarySchema = z.object({
  subjectId: idSchema,
  periodStart: isoDateTimeSchema,
  periodEnd: isoDateTimeSchema,
  generatedAt: isoDateTimeSchema,
  status: assistantSummaryStatusSchema,
  provider: assistantProviderSchema,
  model: z.string().min(1).max(200).nullable(),
  headline: z.string().min(1).max(300),
  sections: z.array(assistantSectionSchema).min(1).max(8),
  disclaimer: z.literal(ASSISTANT_DISCLAIMER),
  sources: z.array(assistantSourceSchema).max(20),
  /** Chất lượng dữ liệu đã dùng để sinh bản tóm tắt — luôn có trong response mới. */
  dataQuality: assistantDataQualitySchema,
  /** Lý do bản tóm tắt ở trạng thái degraded (fallback template); null khi ready. */
  degradedReason: z.string().min(1).max(500).nullable(),
});
export type AssistantSummary = z.infer<typeof assistantSummarySchema>;

/** POST /subjects/:id/assistant/ask — câu hỏi 3..500 ký tự. */
export const assistantAskSchema = z
  .object({ question: z.string().trim().min(3).max(500) })
  .strict();
export type AssistantAsk = z.infer<typeof assistantAskSchema>;

export const assistantAnswerSchema = z.object({
  answer: z.string().min(1).max(4000),
  status: assistantSummaryStatusSchema,
  provider: assistantProviderSchema,
  model: z.string().min(1).max(200).nullable(),
  disclaimer: z.literal(ASSISTANT_DISCLAIMER),
  sources: z.array(assistantSourceSchema).max(20),
  /** Có khi câu trả lời dựa trên aggregate; câu hỏi bị từ chối trước khi đọc dữ liệu thì bỏ trống. */
  dataQuality: assistantDataQualitySchema.optional(),
  degradedReason: z.string().min(1).max(500).optional(),
});
export type AssistantAnswer = z.infer<typeof assistantAnswerSchema>;

/** GET /subjects/:id/assistant/summary — mặc định 7 ngày, tối đa 31 ngày. */
export const assistantSummaryQuerySchema = z.object({
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
});
export type AssistantSummaryQuery = z.infer<typeof assistantSummaryQuerySchema>;

// ---------------------------------------------------------------------------
// Hành động có kiểm soát (FR-21) — trợ lý chỉ tạo nháp, người dùng xác nhận.
// ---------------------------------------------------------------------------

/** Nháp hết hạn sau 15 phút; xác nhận sau hạn trả 409 và không ghi nghiệp vụ. */
export const ASSISTANT_DRAFT_TTL_MINUTES = 15;

/**
 * Capability trợ lý được phép đề xuất. Danh sách này cố ý hẹp: chỉ thao tác
 * nghiệp vụ có preview/confirm, không phải quyền tự đóng cảnh báo hay chẩn đoán.
 */
export const assistantActionCapabilityIdSchema = z.enum(['care_reminder.create']);
export type AssistantActionCapabilityId = z.infer<typeof assistantActionCapabilityIdSchema>;

export const assistantActionCapabilitySchema = z.object({
  id: assistantActionCapabilityIdSchema,
  label: z.string().min(1).max(120),
  description: z.string().min(1).max(400),
  requiresConfirmation: z.literal(true),
  /** `false` khi người xem không phải chủ hồ sơ; vẫn hiển thị để giải thích. */
  available: z.boolean(),
  unavailableReason: z.string().min(1).max(300).nullable(),
});
export type AssistantActionCapability = z.infer<typeof assistantActionCapabilitySchema>;

export const assistantBlockedActionSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  reason: z.string().min(1).max(400),
});
export type AssistantBlockedAction = z.infer<typeof assistantBlockedActionSchema>;

export const assistantCapabilitiesSchema = z.object({
  subjectId: idSchema,
  can: z.array(assistantActionCapabilitySchema).max(20),
  cannot: z.array(assistantBlockedActionSchema).max(20),
});
export type AssistantCapabilities = z.infer<typeof assistantCapabilitiesSchema>;

export const assistantDraftStatusSchema = z.enum(['draft', 'confirmed', 'cancelled', 'expired']);
export type AssistantDraftStatus = z.infer<typeof assistantDraftStatusSchema>;

export const assistantDraftResultSchema = z.object({
  type: z.literal('care_reminder'),
  id: idSchema,
});
export type AssistantDraftResult = z.infer<typeof assistantDraftResultSchema>;

export const assistantDraftSchema = z.object({
  id: idSchema,
  subjectId: idSchema,
  capability: assistantActionCapabilityIdSchema,
  status: assistantDraftStatusSchema,
  /** Nội dung đã chuẩn hoá; chỉ trả cho người tạo nháp. */
  preview: createReminderSchema,
  previewDigest: z.string().regex(/^[0-9a-f]{64}$/),
  expiresAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  confirmedAt: isoDateTimeSchema.nullable(),
  result: assistantDraftResultSchema.nullable(),
});
export type AssistantDraft = z.infer<typeof assistantDraftSchema>;

/** POST /subjects/:id/assistant/drafts — chỉ chủ hồ sơ, không ghi care_reminders. */
export const createAssistantDraftSchema = z
  .object({
    capability: z.literal('care_reminder.create'),
    input: createReminderSchema,
    /** Khóa idempotency do client sinh; retry cùng khóa không tạo nháp trùng. */
    requestKey: idSchema.optional(),
  })
  .strict();
export type CreateAssistantDraftInput = z.infer<typeof createAssistantDraftSchema>;

/** PATCH /assistant/drafts/:id — sửa preview trước khi xác nhận; vẫn chỉ là nháp. */
export const updateAssistantDraftSchema = z
  .object({
    input: createReminderSchema,
  })
  .strict();
export type UpdateAssistantDraftInput = z.infer<typeof updateAssistantDraftSchema>;

/** GET /subjects/:id/assistant/drafts — danh sách nháp đang chờ của chủ hồ sơ. */
export const assistantDraftListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export type AssistantDraftListQuery = z.infer<typeof assistantDraftListQuerySchema>;

/**
 * Câu lệnh đơn giản do người dùng gõ. Server parse bằng rule-based parser,
 * **không gọi LLM**, rồi vẫn trả nháp để xem trước/xác nhận. Raw text không
 * được lưu vào audit; chỉ nội dung đã parse nằm trong draft.
 */
export const assistantDraftFromTextSchema = z
  .object({
    text: z.string().trim().min(3).max(500),
    /** Cùng requestKey + cùng nội dung parse → trả lại nháp đã tạo. */
    requestKey: idSchema.optional(),
  })
  .strict();
export type AssistantDraftFromTextInput = z.infer<typeof assistantDraftFromTextSchema>;
