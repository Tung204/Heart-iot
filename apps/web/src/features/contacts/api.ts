import {
  emergencyContactListSchema,
  emergencyContactSchema,
  type EmergencyContact,
  type EmergencyContactInput,
  type EmergencyContactList,
} from '@heart-iot/contracts/contacts';
import { apiRequest, parseResponse } from '../../lib/api';

/**
 * Query key của liên hệ khẩn cấp. Đặt tại feature thay vì `lib/query.ts` để
 * không sửa file dùng chung khi lead còn đang nối các phần v2.
 * Cùng tiền tố `['subjects', id, ...]` để invalidate theo hồ sơ vẫn đúng.
 */
export const emergencyContactsQueryKey = (subjectId: string) =>
  ['subjects', subjectId, 'emergency-contacts'] as const;

/** GET /subjects/:id/emergency-contacts — tối đa 5, primary đứng trước. */
export async function fetchEmergencyContacts(
  subjectId: string,
  signal?: AbortSignal,
): Promise<EmergencyContactList> {
  const data = await apiRequest<unknown>(`/subjects/${subjectId}/emergency-contacts`, { signal });
  return parseResponse(emergencyContactListSchema, data);
}

/** POST /subjects/:id/emergency-contacts — chỉ chủ hồ sơ; 409 khi đã đủ 5. */
export async function createEmergencyContact(
  subjectId: string,
  input: EmergencyContactInput,
): Promise<EmergencyContact> {
  const data = await apiRequest<unknown>(`/subjects/${subjectId}/emergency-contacts`, {
    method: 'POST',
    body: input,
  });
  return parseResponse(emergencyContactSchema, data);
}

/** PATCH /subjects/:id/emergency-contacts/:contactId — 400 nếu bỏ primary khi còn liên hệ khác. */
export async function updateEmergencyContact(
  subjectId: string,
  contactId: string,
  input: EmergencyContactInput,
): Promise<EmergencyContact> {
  const data = await apiRequest<unknown>(
    `/subjects/${subjectId}/emergency-contacts/${contactId}`,
    { method: 'PATCH', body: input },
  );
  return parseResponse(emergencyContactSchema, data);
}

/** DELETE /subjects/:id/emergency-contacts/:contactId — 204; xóa primary sẽ tự chọn người kế tiếp. */
export async function deleteEmergencyContact(
  subjectId: string,
  contactId: string,
): Promise<void> {
  await apiRequest<void>(`/subjects/${subjectId}/emergency-contacts/${contactId}`, {
    method: 'DELETE',
  });
}

export { emergencyContactInputSchema } from '@heart-iot/contracts/contacts';
