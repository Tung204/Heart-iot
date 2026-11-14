import {
  assistantAnswerSchema,
  assistantAskSchema,
  assistantSummarySchema,
  type AssistantAnswer,
  type AssistantAsk,
  type AssistantSummary,
} from '@annhien/contracts/assistant';
import { apiRequest, parseResponse } from '../../lib/api';

/**
 * API client trợ lý AI (wave 4 fe-admin-ai).
 * Trợ lý chỉ tổng hợp số liệu đo đã kiểm quyền — không có trường chẩn đoán/kê đơn.
 * Query keys đặt ở đây vì lib/query.ts thuộc vùng ghi của worker khác.
 */
export const assistantQueryKeys = {
  summary: (subjectId: string) => ['assistant', subjectId, 'summary'] as const,
};

/** GET /subjects/:id/assistant/summary — mặc định 7 ngày, tối đa 31 ngày. */
export async function fetchAssistantSummary(
  subjectId: string,
  signal?: AbortSignal,
): Promise<AssistantSummary> {
  const data = await apiRequest<unknown>(`/subjects/${subjectId}/assistant/summary`, { signal });
  return parseResponse(assistantSummarySchema, data);
}

/** POST /subjects/:id/assistant/ask — câu hỏi 3..500 ký tự; 429 khi vượt giới hạn. */
export async function askAssistant(
  subjectId: string,
  input: AssistantAsk,
): Promise<AssistantAnswer> {
  const data = await apiRequest<unknown>(`/subjects/${subjectId}/assistant/ask`, {
    method: 'POST',
    body: input,
  });
  return parseResponse(assistantAnswerSchema, data);
}

export { assistantAskSchema };
