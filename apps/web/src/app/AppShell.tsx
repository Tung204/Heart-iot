import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
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
        Quản trị
      </NavLink>
    </>
  ) : (
    <>
      <NavLink to="/app" end className={navLinkClass}>
        Tổng quan
      </NavLink>
      <NavLink to="/app/history" className={navLinkClass}>
        Lịch sử
      </NavLink>
      <NavLink to="/app/alerts" className={navLinkClass}>
        Cảnh báo
      </NavLink>
      <NavLink to="/app/devices" className={navLinkClass}>
        Thiết bị
      </NavLink>
      <NavLink to="/app/notifications" className={navLinkClass}>
        Thông báo
      </NavLink>
      <NavLink to="/app/subjects" className={navLinkClass}>
        Hồ sơ
      </NavLink>
    </>
  );

  const moreItems: { to: string; label: string }[] = [];
  if (hasAiPermission) moreItems.push({ to: '/app/assistant', label: 'Trợ lý' });
  if (hasTasksPermission) moreItems.push({ to: '/app/tasks', label: 'Công việc' });
  if (isStudioUser) moreItems.push({ to: '/app/studio', label: 'Studio' });
  if (isAdmin) moreItems.push({ to: '/app/admin', label: 'Quản trị' });

  const moreMenu =
    moreItems.length > 0 ? (
      <div className={`shell__more${moreOpen ? ' is-open' : ''}`}>
        <button
          type="button"
          className="shell__more-toggle"
          aria-expanded={moreOpen}
          aria-haspopup="true"
          onClick={() => setMoreOpen((value) => !value)}
        >
          Thêm
        </button>
        {moreOpen ? (
          <div className="shell__more-menu">
            {moreItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={navLinkClass}
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
            <Link to="/app" className="brand">
              An Nhiên
            </Link>
            <div className="shell__topbar-actions">
              <TextSizeToggle />
              <Button
                variant="subtle"
                size="sm"
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
            <Outlet />
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
