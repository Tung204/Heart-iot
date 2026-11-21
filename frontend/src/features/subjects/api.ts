import {
  archiveSubjectSchema,
  createSubjectSchema,
  deletionRequestRecordedSchema,
  deletionRequestSchema,
  subjectDetailSchema,
  subjectListSchema,
  updateSubjectSchema,
  type ArchiveSubjectInput,
  type CreateSubjectInput,
  type DeletionRequestInput,
  type DeletionRequestRecorded,
  type SubjectDetail,
  type SubjectSummary,
  type UpdateSubjectInput,
} from '@heart-iot/contracts/subjects';
import { apiRequest, parseResponse } from '../../lib/api';

/** GET /subjects — danh sách hồ sơ người dùng hiện tại (vai trò + quyền theo người xem). */
export async function fetchSubjects(signal?: AbortSignal): Promise<SubjectSummary[]> {
  const data = await apiRequest<unknown>('/subjects', { signal });
  return parseResponse(subjectListSchema, data).items;
}

/** POST /subjects — tạo hồ sơ; timezone mặc định Asia/Ho_Chi_Minh (theo hợp đồng). */
export async function createSubject(input: CreateSubjectInput): Promise<SubjectDetail> {
  const data = await apiRequest<unknown>('/subjects', { method: 'POST', body: input });
  return parseResponse(subjectDetailSchema, data);
}

/** PATCH /subjects/:id — chỉ chủ hồ sơ; ít nhất một trường. */
export async function updateSubject(
  id: string,
  input: UpdateSubjectInput,
): Promise<SubjectDetail> {
  const data = await apiRequest<unknown>(`/subjects/${id}`, { method: 'PATCH', body: input });
  return parseResponse(subjectDetailSchema, data);
}

export { createSubjectSchema, updateSubjectSchema };

/**
 * POST /subjects/:id/archive — lưu trữ hồ sơ (FR-14). Không xóa dữ liệu: chỉ
 * ẩn hồ sơ, thu hồi care link và đóng stream; server trả 204.
 */
export async function archiveSubject(
  id: string,
  input: ArchiveSubjectInput,
): Promise<void> {
  await apiRequest<unknown>(`/subjects/${id}/archive`, { method: 'POST', body: input });
}

/**
 * POST /subjects/:id/deletion-requests — ghi nhận yêu cầu xóa dữ liệu.
 * Server trả 202 với `status: 'recorded'`: đây là ghi nhận thủ công, **chưa xóa**
 * dữ liệu. Parse theo schema để UI không hiển thị trạng thái khác hợp đồng.
 */
export async function requestSubjectDeletion(
  id: string,
  input: DeletionRequestInput,
): Promise<DeletionRequestRecorded> {
  const data = await apiRequest<unknown>(`/subjects/${id}/deletion-requests`, {
    method: 'POST',
    body: input,
  });
  return parseResponse(deletionRequestRecordedSchema, data);
}

export { archiveSubjectSchema, deletionRequestSchema };
