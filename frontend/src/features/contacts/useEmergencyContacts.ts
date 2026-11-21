import { useQuery } from '@tanstack/react-query';
import { fetchEmergencyContacts, emergencyContactsQueryKey } from './api';

/**
 * Danh sách liên hệ khẩn cấp của một hồ sơ.
 * `enabled` cho phép trang cảnh báo chỉ tải khi người xem có quyền nhận cảnh báo,
 * tránh gọi API rồi nhận 403 vô ích.
 */
export function useEmergencyContacts(subjectId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: emergencyContactsQueryKey(subjectId),
    queryFn: ({ signal }) => fetchEmergencyContacts(subjectId, signal),
    enabled: subjectId.length > 0 && (options.enabled ?? true),
    staleTime: 15_000,
  });
}
