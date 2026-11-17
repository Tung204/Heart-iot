import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Me } from '@heart-iot/contracts/auth';
import { queryKeys } from '../../lib/query';
import { fetchMe, login, logout, register } from './api';

/** Phiên hiện tại. 401 → chưa đăng nhập; lỗi mạng → phân biệt, không coi là đã đăng xuất. */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => fetchMe(signal),
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: (session) => {
      const me: Me = { user: session.user };
      queryClient.setQueryData(queryKeys.me, me);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: register,
    onSuccess: (session) => {
      const me: Me = { user: session.user };
      queryClient.setQueryData(queryKeys.me, me);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      // Xóa toàn bộ cache sau khi server đã xóa phiên.
      queryClient.removeQueries();
    },
  });
}
