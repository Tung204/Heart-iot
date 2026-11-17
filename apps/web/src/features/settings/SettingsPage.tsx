import { PageHeader } from '../../components/PageHeader';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { getApiErrorMessage } from '../../lib/api';
import { useMe } from '../auth/useAuth';
import { PasswordCard } from './PasswordCard';
import { ProfileCard } from './ProfileCard';
import { SessionsCard } from './SessionsCard';
import '../../styles/people.css';
import './settings.css';

/**
 * /app/settings — Tài khoản (FR-01): tên của bạn, mật khẩu, phiên đăng nhập.
 * Không có subject context: tài khoản đăng nhập và người được theo dõi là hai
 * thực thể khác nhau. Không hiển thị dữ liệu sức khỏe ở đây.
 */
export function SettingsPage() {
  const me = useMe();

  if (me.isPending) {
    return (
      <div className="stack people-page">
        <PageHeader title="Tài khoản" />
        <PageLoader label="Đang tải thông tin tài khoản…" />
      </div>
    );
  }

  if (me.isError) {
    return (
      <div className="stack people-page">
        <PageHeader title="Tài khoản" />
        <ErrorState
          headingLevel={2}
          title="Không tải được thông tin tài khoản"
          message={getApiErrorMessage(
            me.error,
            'Không kết nối được máy chủ. Kiểm tra kết nối và thử lại.',
          )}
          onRetry={() => void me.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="stack people-page">
      <PageHeader
        title="Tài khoản"
        context={
          <>
            Tài khoản của <strong>{me.data.user.displayName}</strong>
          </>
        }
      />

      <div className="settings-sections">
        <ProfileCard user={me.data.user} />
        <PasswordCard />
        <SessionsCard />
      </div>
    </div>
  );
}
