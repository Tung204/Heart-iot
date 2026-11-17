import {
  createSubjectSchema,
  subjectDetailSchema,
  subjectListSchema,
  updateSubjectSchema,
  type CreateSubjectInput,
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
