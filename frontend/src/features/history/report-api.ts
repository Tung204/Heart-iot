import {
  visitReportSchema,
  type VisitReport,
  type VisitReportQuery,
} from '@heart-iot/contracts/reports';
import { apiRequest, parseResponse } from '../../lib/api';

/**
 * GET /subjects/:id/visit-report — phiếu tổng hợp số liệu đã kiểm quyền.
 *
 * `from`/`to` là ngày địa phương `YYYY-MM-DD` theo timezone hồ sơ. Bỏ trống để
 * server dùng 30 ngày gần nhất; server vẫn là nơi chốt cửa sổ sharedFrom/
 * historyDays và trả 403/422 kèm câu nghiệp vụ.
 */
export async function fetchVisitReport(
  subjectId: string,
  params: VisitReportQuery = {},
  signal?: AbortSignal,
): Promise<VisitReport> {
  const search = new URLSearchParams();
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  const suffix = search.toString();
  const data = await apiRequest<unknown>(
    `/subjects/${subjectId}/visit-report${suffix ? `?${suffix}` : ''}`,
    { signal },
  );
  return parseResponse(visitReportSchema, data);
}
