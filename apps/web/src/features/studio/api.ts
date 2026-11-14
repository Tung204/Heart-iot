import {
  createViewSchema,
  publicationListSchema,
  previewRequestSchema,
  previewResultSchema,
  publishResultSchema,
  publishViewSchema,
  rollbackResultSchema,
  rollbackViewSchema,
  updateDraftSchema,
  viewDataSchema,
  viewListSchema,
  viewSummarySchema,
  type CreateViewInput,
  type PreviewRequestInput,
  type PreviewResult,
  type PublishViewInput,
  type PublicationList,
  type PublishResult,
  type RollbackViewInput,
  type UpdateDraftInput,
  type ViewData,
  type ViewList,
  type ViewSummary,
} from '@annhien/contracts/studio';
import { apiRequest, parseResponse } from '../../lib/api';

/**
 * API client cho workspace views (wave 3 fe-studio).
 * Schema/type đều lấy từ @annhien/contracts/studio — không có schema tạm.
 * Query keys đặt ở đây vì lib/query.ts thuộc vùng ghi của worker khác.
 */
export const studioQueryKeys = {
  views: ['studio', 'views'] as const,
  view: (id: string) => ['studio', 'views', id] as const,
  publications: (id: string) => ['studio', 'views', id, 'publications'] as const,
  viewData: (id: string, subjectId: string | null) =>
    ['studio', 'views', id, 'data', subjectId ?? ''] as const,
};

/** GET /workspace-views — danh sách view user có quyền thấy. */
export async function fetchWorkspaceViews(signal?: AbortSignal): Promise<ViewList> {
  const data = await apiRequest<unknown>('/workspace-views', { signal });
  return parseResponse(viewListSchema, data);
}

/** GET /workspace-views/:id — tóm tắt view (không có config; config lấy qua preview/data). */
export async function fetchWorkspaceView(id: string, signal?: AbortSignal): Promise<ViewSummary> {
  const data = await apiRequest<unknown>(`/workspace-views/${id}`, { signal });
  return parseResponse(viewSummarySchema, data);
}

/** POST /workspace-views — tạo view với config ban đầu (scope subject bắt buộc subjectId). */
export async function createWorkspaceView(input: CreateViewInput): Promise<ViewSummary> {
  const data = await apiRequest<unknown>('/workspace-views', { method: 'POST', body: input });
  return parseResponse(viewSummarySchema, data);
}

/** PUT /workspace-views/:id/draft — compare-and-set theo baseRevision; 409 khi nền đã đổi. */
export async function updateViewDraft(id: string, input: UpdateDraftInput): Promise<ViewSummary> {
  const data = await apiRequest<unknown>(`/workspace-views/${id}/draft`, {
    method: 'PUT',
    body: input,
  });
  return parseResponse(viewSummarySchema, data);
}

/** POST /workspace-views/:id/previews — preview chỉ đọc; không có previewSubjectId → dữ liệu mẫu. */
export async function createPreview(
  id: string,
  input: PreviewRequestInput,
  signal?: AbortSignal,
): Promise<PreviewResult> {
  const data = await apiRequest<unknown>(`/workspace-views/${id}/previews`, {
    method: 'POST',
    body: input,
    signal,
  });
  return parseResponse(previewResultSchema, data);
}

/** POST /workspace-views/:id/publications — publish CAS; 409 APPROVAL_STALE khi lệch. */
export async function publishView(id: string, input: PublishViewInput): Promise<PublishResult> {
  const data = await apiRequest<unknown>(`/workspace-views/${id}/publications`, {
    method: 'POST',
    body: input,
  });
  return parseResponse(publishResultSchema, data);
}

/** POST /workspace-views/:id/rollback — rollback tạo publication mới, không xóa lịch sử. */
export async function rollbackView(id: string, input: RollbackViewInput): Promise<PublishResult> {
  const data = await apiRequest<unknown>(`/workspace-views/${id}/rollback`, {
    method: 'POST',
    body: input,
  });
  return parseResponse(rollbackResultSchema, data);
}

/** GET /workspace-views/:id/publications — lịch sử công bố. */
export async function fetchPublications(id: string, signal?: AbortSignal): Promise<PublicationList> {
  const data = await apiRequest<unknown>(`/workspace-views/${id}/publications`, { signal });
  return parseResponse(publicationListSchema, data);
}

/** GET /workspace-views/:id/data — dữ liệu thật để render view đã công bố. */
export async function fetchViewData(
  id: string,
  subjectId: string | null,
  signal?: AbortSignal,
): Promise<ViewData> {
  const query = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : '';
  const data = await apiRequest<unknown>(`/workspace-views/${id}/data${query}`, { signal });
  return parseResponse(viewDataSchema, data);
}

export { createViewSchema, previewRequestSchema, publishViewSchema, updateDraftSchema };
