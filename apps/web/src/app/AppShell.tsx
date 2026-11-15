import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { AppErrorBoundary } from '../components/AppErrorBoundary';
import { Button } from '../components/Button';
import { SkipLink } from '../components/SkipLink';
import { StatusPill } from '../components/StatusPill';
import { TextSizeToggle } from '../components/TextSizeToggle';
import { useLogout, useMe } from '../features/auth/useAuth';
import { useSubjectEvents } from '../features/realtime/useSubjectEvents';
import { getActiveSubjectId, setActiveSubjectId, useActiveSubject } from '../features/subjects/selection';
import { useSubjects } from '../features/subjects/useSubjects';
import { SubjectSwitcher } from '../features/subjects/SubjectSwitcher';
import { queryKeys } from '../lib/query';

type NavIconName = 'home' | 'history' | 'alert' | 'device' | 'bell' | 'person' | 'more' | 'admin';

function NavIcon({ name }: { name: NavIconName }) {
  const paths: Record<NavIconName, ReactNode> = {
    home: <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />,
    history: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </>
    ),
    alert: (
      <>
        <path d="M12 3.5 3.5 19h17z" />
        <path d="M12 9v4.5M12 16.5v.1" />
      </>
    ),
    device: (
      <>
        <rect x="7" y="5" width="10" height="14" rx="3" />
        <path d="M9 2.5h6M9 21.5h6M12 9v2.5l1.5 1" />
      </>
    ),
    bell: (
      <>
        <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
        <path d="M10 19a2 2 0 0 0 4 0" />
      </>
    ),
    person: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
      </>
    ),
    admin: (
      <>
        <path d="M12 3 4.5 6v5c0 5 3 8 7.5 10 4.5-2 7.5-5 7.5-10V6z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  };
  return (
    <svg
      className="shell__nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

/**
 * Khung ứng dụng /app:
 * - Mobile (<1024px): topbar + nav dưới.
 * - Desktop (≥1024px): sidebar bên trái.
 * - Mở SSE cho hồ sơ đang xem (cảnh báo cập nhật ngay cả khi ở màn hình khác).
 * - Bị thu hồi quyền (`revoked`) → thông báo rõ + điều hướng về /app an toàn.
 */
export function AppShell() {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [revokedInfo, setRevokedInfo] = useState<{ subjectId: string; name: string } | null>(null);

  const subjects = useSubjects();
  const activeSubject = useActiveSubject(subjects.data);

  useSubjectEvents(activeSubject?.id ?? null, {
    onRevoked: (subjectId) => {
      const name =
        subjects.data?.find((item) => item.id === subjectId)?.displayName ??
        activeSubject?.displayName ??
        'hồ sơ này';
      setRevokedInfo({ subjectId, name });
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjects });
      if (getActiveSubjectId() === subjectId) setActiveSubjectId(null);
      navigate('/app', { replace: true });
    },
  });

  const user = me.data?.user;
  const [moreOpen, setMoreOpen] = useState(false);

  // Quyền hiển thị mục nav phụ (backend vẫn là nơi kiểm quyền thật):
  // Trợ lý: chủ hồ sơ hoặc caregiver có canViewAi. Công việc: chủ/caregiver có
  // canReceiveAlerts, hoặc admin (thấy task không gắn hồ sơ). Studio: chủ hồ sơ/admin.
  // Quản trị: chỉ admin.
  const isAdmin = user?.role === 'admin';
  const subjectsData = subjects.data ?? [];
  const hasAiPermission = subjectsData.some(
    (subject) => subject.role === 'owner' || subject.permissions.canViewAi,
  );
  const hasTasksPermission =
    isAdmin ||
    subjectsData.some((subject) => subject.role === 'owner' || subject.permissions.canReceiveAlerts);
  const isStudioUser = isAdmin || subjectsData.some((subject) => subject.role === 'owner');

  const handleLogout = () => {
    setLogoutError(null);
    logout.mutate(undefined, {
      onSuccess: () => navigate('/', { replace: true }),
      onError: () => {
        setLogoutError('Không đăng xuất được — kiểm tra kết nối và thử lại.');
      },
    });
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `shell__nav-link${isActive ? ' is-active' : ''}`;

  // Bottom-nav trên mobile không quá 6 mục: 6 mục chính + menu phụ "Thêm".
  // Admin không có hồ sơ chỉ thấy Quản trị; tránh các trang sức khỏe sẽ 404.
  const adminOnly = isAdmin && subjectsData.length === 0;
  const navItems = adminOnly ? (
    <>
      <NavLink to="/app/admin" className={navLinkClass}>
        <NavIcon name="admin" />
        <span>Quản trị</span>
      </NavLink>
      <NavLink to="/app/settings" className={navLinkClass}>
        <NavIcon name="person" />
        <span>Cài đặt</span>
      </NavLink>
    </>
  ) : (
    <>
      <NavLink to="/app" end className={navLinkClass}>
        <NavIcon name="home" />
        <span>Tổng quan</span>
      </NavLink>
      <NavLink to="/app/history" className={navLinkClass}>
        <NavIcon name="history" />
        <span>Lịch sử</span>
      </NavLink>
      <NavLink to="/app/alerts" className={navLinkClass}>
        <NavIcon name="alert" />
        <span>Cảnh báo</span>
      </NavLink>
      <NavLink to="/app/devices" className={({ isActive }) => `${navLinkClass({ isActive })} shell__nav-optional`}>
        <NavIcon name="device" />
        <span>Thiết bị</span>
      </NavLink>
      <NavLink to="/app/notifications" className={({ isActive }) => `${navLinkClass({ isActive })} shell__nav-optional`}>
        <NavIcon name="bell" />
        <span>Thông báo</span>
      </NavLink>
      <NavLink to="/app/subjects" className={navLinkClass}>
        <NavIcon name="person" />
        <span>Hồ sơ</span>
      </NavLink>
    </>
  );

  const moreItems: { to: string; label: string; mobileOnly?: boolean }[] = [];
  if (!adminOnly) {
    moreItems.push({ to: '/app/devices', label: 'Thiết bị', mobileOnly: true });
    moreItems.push({ to: '/app/notifications', label: 'Thông báo', mobileOnly: true });
  }
  if (hasAiPermission) moreItems.push({ to: '/app/assistant', label: 'Trợ lý' });
  if (hasTasksPermission) moreItems.push({ to: '/app/tasks', label: 'Công việc' });
  moreItems.push({ to: '/app/settings', label: 'Cài đặt tài khoản' });
  if (isStudioUser) moreItems.push({ to: '/app/studio', label: 'Studio' });
  if (isAdmin) moreItems.push({ to: '/app/admin', label: 'Quản trị' });

  const moreMenu =
    moreItems.length > 0 && !adminOnly ? (
      <div className={`shell__more${moreOpen ? ' is-open' : ''}`}>
        <button
          type="button"
          className="shell__more-toggle"
          aria-expanded={moreOpen}
          aria-haspopup="true"
          onClick={() => setMoreOpen((value) => !value)}
        >
          <NavIcon name="more" />
          <span>Thêm</span>
        </button>
        {moreOpen ? (
          <div className="shell__more-menu">
            {moreItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `${navLinkClass({ isActive })}${item.mobileOnly ? ' shell__more-mobile' : ''}`
                }
                onClick={() => setMoreOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        ) : null}
      </div>
    ) : null;

  return (
    <div className="shell">
      <SkipLink />

      <aside className="shell__sidebar">
        <div className="shell__brand">
          <Link to="/app" className="brand">
            An Nhiên
          </Link>
          <p className="shell__tagline">Theo dõi người thân</p>
        </div>
        <StatusPill tone="sand">Bản demo · dữ liệu mô phỏng</StatusPill>
        <nav className="shell__nav" aria-label="Điều hướng ứng dụng">
          {navItems}
          {moreMenu}
        </nav>
        <div className="shell__user">
          <p className="shell__user-name">{user?.displayName}</p>
          <p className="shell__user-email">{user?.email}</p>
          <Button
            variant="subtle"
            size="sm"
            className="shell__logout"
            onClick={handleLogout}
            disabled={logout.isPending}
          >
            {logout.isPending ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </Button>
          {logoutError ? (
            <p className="shell__error" role="alert">
              {logoutError}
            </p>
          ) : null}
          <TextSizeToggle />
        </div>
        <p className="shell__safety-note">
          Cảnh báo chỉ hiển thị khi trang đang mở. Bản demo không tự gọi cấp cứu.
        </p>
      </aside>

      <div className="shell__body">
        <header className="shell__topbar">
          <div className="shell__topbar-row">
            <div className="shell__mobile-brand">
              <Link to="/app" className="brand">
                An Nhiên
              </Link>
              <span className="shell__mobile-demo">Bản demo</span>
            </div>
            <div className="shell__topbar-actions">
              <TextSizeToggle />
              <Button
                variant="subtle"
                size="sm"
                className="shell__topbar-logout"
                onClick={handleLogout}
                disabled={logout.isPending}
              >
                {logout.isPending ? 'Đang…' : 'Đăng xuất'}
              </Button>
            </div>
          </div>
          {logoutError ? (
            <p className="shell__error" role="alert">
              {logoutError}
            </p>
          ) : null}
        </header>

        <main id="main" tabIndex={-1} className="shell__main">
          <div className="shell__content">
            {revokedInfo ? (
              <Alert tone="warning" title="Bạn đã mất quyền xem hồ sơ">
                Quyền xem hồ sơ <strong>{revokedInfo.name}</strong> đã bị thu hồi. Dữ liệu của
                hồ sơ này đã được xóa khỏi màn hình và các luồng đang mở đã đóng.
                <div style={{ marginTop: '0.75rem' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setRevokedInfo(null)}
                  >
                    Đã hiểu
                  </Button>
                </div>
              </Alert>
            ) : null}
            {adminOnly ? null : <SubjectSwitcher />}
            {/* Key theo pathname để lỗi của trang trước không dính sang trang mới. */}
            <AppErrorBoundary key={location.pathname}>
              <Outlet />
            </AppErrorBoundary>
          </div>
        </main>

        <nav className="shell__bottomnav" aria-label="Điều hướng ứng dụng">
          {navItems}
          {moreMenu}
        </nav>
      </div>
    </div>
  );
}
