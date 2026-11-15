import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Me } from '@annhien/contracts/auth';
import { queryKeys } from '../../lib/query';
import {
  changePassword,
  fetchSessions,
  revokeOtherSessions,
  revokeSession,
  updateProfile,
} from '../auth/api';

/**
 * Key riêng của feature cài đặt: nằm dưới nhánh `auth/me` để invalidate phiên
 * cũng làm mới danh sách, nhưng không đụng `queryKeys.me` của useMe.
 */
export const sessionsQueryKey = ['auth', 'me', 'sessions'] as const;

/** Các phiên còn hiệu lực của chính mình (server đánh dấu `current`). */
export function useSessions() {
  return useQuery({
    queryKey: sessionsQueryKey,
    queryFn: ({ signal }) => fetchSessions(signal),
    staleTime: 15_000,
  });
}

/** Đổi tên hiển thị — cập nhật ngay query `me` để mọi màn hình dùng chung thấy tên mới. */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateProfile,
    onSuccess: (me: Me) => {
      queryClient.setQueryData(queryKeys.me, me);
    },
  });
}

/** Đổi mật khẩu — server giữ phiên hiện tại; danh sách phiên khác cần tải lại. */
export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
    },
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeSession,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
    },
  });
}

export function useRevokeOtherSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeOtherSessions,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
    },
  });
}
