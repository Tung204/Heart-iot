import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './core';

/**
 * Hợp đồng trợ lý AI — wave 2 be-ai.
 *
 * Trợ lý chỉ tổng hợp số liệu đo đã được kiểm quyền. Không có trường chẩn đoán,
 * kê đơn hay dự đoán nguy cơ y khoa trong schema. `disclaimer` cố định để mọi
 * nơi hiển thị đều mang cùng một ranh giới trách nhiệm.
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
  degradedReason: z.string().min(1).max(500).optional(),
});
export type AssistantAnswer = z.infer<typeof assistantAnswerSchema>;

/** GET /subjects/:id/assistant/summary — mặc định 7 ngày, tối đa 31 ngày. */
export const assistantSummaryQuerySchema = z.object({
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
});
export type AssistantSummaryQuery = z.infer<typeof assistantSummaryQuerySchema>;
