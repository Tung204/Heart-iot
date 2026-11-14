import { measurementsResponseSchema, type MeasurementsResponse } from '@annhien/contracts/measurements';
import { API_BASE, apiRequest, parseResponse } from '../../lib/api';

export interface MeasurementsParams {
  from: string;
  to: string;
  cursor?: string;
  limit?: number;
}

/** GET /subjects/:id/measurements — đo lường trong khoảng (phân trang cursor). */
export async function fetchMeasurements(
  subjectId: string,
  params: MeasurementsParams,
  signal?: AbortSignal,
): Promise<MeasurementsResponse> {
  const search = new URLSearchParams({ from: params.from, to: params.to });
  if (params.cursor) search.set('cursor', params.cursor);
  if (params.limit) search.set('limit', String(params.limit));
  const data = await apiRequest<unknown>(
    `/subjects/${subjectId}/measurements?${search.toString()}`,
    { signal },
  );
  return parseResponse(measurementsResponseSchema, data);
}

/**
 * URL tải CSV — dùng thẻ <a> cùng nguồn nên cookie phiên được gửi theo.
 * Server kiểm quyền history như endpoint JSON.
 */
export function exportCsvUrl(subjectId: string, from: string, to: string): string {
  const search = new URLSearchParams({ from, to });
  return `${API_BASE}/subjects/${subjectId}/export.csv?${search.toString()}`;
}
