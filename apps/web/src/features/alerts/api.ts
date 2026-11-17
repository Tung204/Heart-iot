import {
  acknowledgeAlertSchema,
  incidentDetailSchema,
  incidentListSchema,
  resolveAlertSchema,
  type AcknowledgeAlert,
  type IncidentDetail,
  type IncidentList,
  type ResolveAlert,
} from '@heart-iot/contracts/incidents';
import { apiRequest, parseResponse } from '../../lib/api';

export interface AlertsListParams {
  state: 'open' | 'closed';
  cursor?: string;
  limit?: number;
}

/** GET /subjects/:id/alerts — danh sách cảnh báo (phân trang cursor, lọc trạng thái). */
export async function fetchAlerts(
  subjectId: string,
  params: AlertsListParams,
  signal?: AbortSignal,
): Promise<IncidentList> {
  const search = new URLSearchParams({ state: params.state });
  if (params.cursor) search.set('cursor', params.cursor);
  if (params.limit) search.set('limit', String(params.limit));
  const data = await apiRequest<unknown>(`/subjects/${subjectId}/alerts?${search.toString()}`, {
    signal,
  });
  return parseResponse(incidentListSchema, data);
}

/** GET /alerts/:id — chi tiết cảnh báo: timeline, hành động, người nhận. */
export async function fetchAlert(alertId: string, signal?: AbortSignal): Promise<IncidentDetail> {
  const data = await apiRequest<unknown>(`/alerts/${alertId}`, { signal });
  return parseResponse(incidentDetailSchema, data);
}

/**
 * POST /alerts/:id/acknowledge — xác nhận đang hỗ trợ.
 * Lỗi CONFLICT (409) khi `expectedVersion` cũ hơn phiên bản hiện tại.
 */
export async function acknowledgeAlert(
  alertId: string,
  input: AcknowledgeAlert,
): Promise<IncidentDetail> {
  const data = await apiRequest<unknown>(`/alerts/${alertId}/acknowledge`, {
    method: 'POST',
    body: input,
  });
  return parseResponse(incidentDetailSchema, data);
}

/** POST /alerts/:id/resolve — đóng cảnh báo; reason bắt buộc, dễ 409 khi có cạnh tranh. */
export async function resolveAlert(
  alertId: string,
  input: ResolveAlert,
): Promise<IncidentDetail> {
  const data = await apiRequest<unknown>(`/alerts/${alertId}/resolve`, {
    method: 'POST',
    body: input,
  });
  return parseResponse(incidentDetailSchema, data);
}

export { acknowledgeAlertSchema, resolveAlertSchema };
