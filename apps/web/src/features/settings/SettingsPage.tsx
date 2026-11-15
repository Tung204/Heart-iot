import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { getApiErrorMessage } from '../../lib/api';
import { useMe } from '../auth/useAuth';
import { PasswordCard } from './PasswordCard';
import { ProfileCard } from './ProfileCard';
import { SessionsCard } from './SessionsCard';
import './settings.css';

/**
 * /app/settings — Cài đặt tài khoản (FR-01): hồ sơ, mật khẩu, phiên đăng nhập.
 * Trang không tự thêm route/nav; lead nối vào router và AppShell.
 * Không hiển thị dữ liệu sức khỏe — chỉ dữ liệu tài khoản của chính người dùng.
 */
export function SettingsPage() {
  const me = useMe();

  if (me.isPending) {
    return <PageLoader label="Đang tải thông tin tài khoản…" />;
  }

  if (me.isError) {
    return (
      <ErrorState
        title="Không tải được thông tin tài khoản"
        message={getApiErrorMessage(
          me.error,
          'Không kết nối được máy chủ. Kiểm tra kết nối và thử lại.',
        )}
        onRetry={() => void me.refetch()}
      />
    );
  }

  return (
    <div className="stack">
      <header>
        <h1 className="page-title">Cài đặt tài khoản</h1>
        <p className="page-lead">
          Đổi tên hiển thị, mật khẩu và kiểm soát những thiết bị đang đăng nhập vào tài khoản
          của bạn.
        </p>
      </header>

      <ProfileCard user={me.data.user} />
      <PasswordCard />
      <SessionsCard />
    </div>
  );
}
