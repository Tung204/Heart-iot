import {
  dailySummarySchema,
  subjectStatusResponseSchema,
  type DailySummary,
  type SubjectStatusResponse,
} from '@heart-iot/contracts/measurements';
import { incidentListSchema, type IncidentList } from '@heart-iot/contracts/incidents';
import { apiRequest, parseResponse } from '../../lib/api';

/** GET /subjects/:id/status — thiết bị + policy + asOf. */
export async function fetchSubjectStatus(
  subjectId: string,
  signal?: AbortSignal,
): Promise<SubjectStatusResponse> {
  const data = await apiRequest<unknown>(`/subjects/${subjectId}/status`, { signal });
  return parseResponse(subjectStatusResponseSchema, data);
}

/** GET /subjects/:id/daily-summary?date=YYYY-MM-DD — tổng hợp ngày theo timezone hồ sơ. */
export async function fetchDailySummary(
  subjectId: string,
  date: string,
  signal?: AbortSignal,
): Promise<DailySummary> {
  const search = new URLSearchParams({ date });
  const data = await apiRequest<unknown>(
    `/subjects/${subjectId}/daily-summary?${search.toString()}`,
    { signal },
  );
  return parseResponse(dailySummarySchema, data);
}

/**
 * GET /subjects/:id/alerts — cảnh báo đang mở (số ít cho dashboard).
 * Dùng chung hợp đồng incidents.
 */
export async function fetchOpenAlerts(
  subjectId: string,
  limit: number,
  signal?: AbortSignal,
): Promise<IncidentList> {
  const search = new URLSearchParams({ state: 'open', limit: String(limit) });
  const data = await apiRequest<unknown>(
    `/subjects/${subjectId}/alerts?${search.toString()}`,
    { signal },
  );
  return parseResponse(incidentListSchema, data);
}
