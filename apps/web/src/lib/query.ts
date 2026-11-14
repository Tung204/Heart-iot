import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError, isUnauthorizedError } from './api';
import { redirectToLogin } from './session';

/** Query keys tập trung — dễ truy vết và invalidate đúng phạm vi. */
export const queryKeys = {
  me: ['auth', 'me'] as const,
  subjects: ['subjects'] as const,
  subject: (id: string) => ['subjects', id] as const,
  subjectStatus: (id: string) => ['subjects', id, 'status'] as const,
  subjectDevices: (id: string) => ['subjects', id, 'devices'] as const,
  subjectAlerts: (id: string, state: 'open' | 'closed') =>
    ['subjects', id, 'alerts', state] as const,
  /** Danh sách ngắn trên dashboard — key riêng để không đụng bộ đệm trang cảnh báo. */
  dashboardOpenAlerts: (id: string) => ['subjects', id, 'alerts', 'dashboard'] as const,
  alert: (id: string) => ['alerts', id] as const,
  measurements: (id: string, params: { from: string; to: string }) =>
    ['subjects', id, 'measurements', params.from, params.to] as const,
  dailySummary: (id: string, date: string) => ['subjects', id, 'daily-summary', date] as const,
  notifications: ['notifications'] as const,
  invitation: (token: string) => ['invitations', token] as const,
  subjectInvitations: (id: string) => ['subjects', id, 'invitations'] as const,
  subjectCareLinks: (id: string) => ['subjects', id, 'care-links'] as const,
};

/**
 * Xử lý 401 tập trung cho query + mutation: phiên hết hạn ở bất kỳ truy vấn
 * nghiệp vụ nào cũng đưa về /login?next=... — không lặp lại logic mỗi trang.
 * Ngoại lệ: query `['auth','me']` là truy vấn KIỂM TRA phiên của trang công khai
 * (header, trang lời mời) — 401 ở đó là tín hiệu "chưa đăng nhập" bình thường,
 * không phải phiên đột ngột hết hạn, nên KHÔNG chuyển hướng.
 */
function handleUnauthorized(error: unknown, query?: { queryKey: readonly unknown[] }): void {
  if (!isUnauthorizedError(error)) return;
  if (query && query.queryKey[0] === 'auth' && query.queryKey[1] === 'me') return;
  const path = window.location.pathname + window.location.search;
  if (path.startsWith('/login') || path.startsWith('/register')) return;
  redirectToLogin(path);
}

/**
 * Chính sách cache mặc định.
 * Dữ liệu sức khỏe KHÔNG được cache quá 30 giây (staleTime ≤ 30_000).
 * Đặt rõ ở từng query nghiệp vụ, không tăng mặc định này.
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => handleUnauthorized(error, query),
  }),
  mutationCache: new MutationCache({
    onError: (error) => handleUnauthorized(error),
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Không tự retry lỗi 4xx (sai mật khẩu, thiếu quyền...).
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 1;
      },
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: false,
    },
  },
});
