import {
  insightsResponseSchema,
  type InsightsResponse,
} from '@annhien/contracts/insights';
import { apiRequest, parseResponse } from '../../lib/api';

/**
 * GET /subjects/:id/insights?days=7|14|30
 * Server tự cắt cửa sổ theo quyền chia sẻ; UI không gửi from/to.
 */
export async function fetchInsights(
  subjectId: string,
  days: number,
  signal?: AbortSignal,
): Promise<InsightsResponse> {
  const search = new URLSearchParams({ days: String(days) });
  const data = await apiRequest<unknown>(
    `/subjects/${subjectId}/insights?${search.toString()}`,
    { signal },
  );
  return parseResponse(insightsResponseSchema, data);
}
