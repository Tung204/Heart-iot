import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ErrorState } from '../components/ErrorState';
import { PageLoader } from '../components/PageLoader';
import { isUnauthorizedError } from '../lib/api';
import { useMe } from '../features/auth/useAuth';

/**
 * Bảo vệ /app/*:
 * - Đang kiểm phiên → loader.
 * - 401 → chuyển /login và giữ tham số `next` để quay lại sau khi đăng nhập.
 * - Lỗi mạng/lỗi khác → hiển thị lỗi kèm nút thử lại, KHÔNG suy đoán đã đăng xuất.
 */
export function ProtectedRoute() {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) {
    return <PageLoader label="Đang kiểm tra phiên đăng nhập…" />;
  }

  if (me.isError) {
    if (isUnauthorizedError(me.error)) {
      const next = encodeURIComponent(location.pathname + location.search);
      return <Navigate to={`/login?next=${next}`} replace />;
    }
    return (
      <ErrorState
        title="Không xác nhận được phiên đăng nhập"
        message="Không kết nối được máy chủ hoặc phiên đang gặp lỗi. Hãy thử lại."
        onRetry={() => void me.refetch()}
      />
    );
  }

  return <Outlet />;
}
