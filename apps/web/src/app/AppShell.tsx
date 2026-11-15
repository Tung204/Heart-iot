import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../components/Alert';
import { AppErrorBoundary } from '../components/AppErrorBoundary';
import { Button, ButtonLink } from '../components/Button';
import { SkipLink } from '../components/SkipLink';
import { TextSizeToggle } from '../components/TextSizeToggle';
import { useLogout, useMe } from '../features/auth/useAuth';
import { fetchOpenAlerts } from '../features/dashboard/api';
import { useUnreadNotifications } from '../features/notifications/useUnreadNotifications';
import { useSubjectEvents } from '../features/realtime/useSubjectEvents';
import { getActiveSubjectId, setActiveSubjectId, useActiveSubject } from '../features/subjects/selection';
import { useSubjects } from '../features/subjects/useSubjects';
import { SubjectSwitcher } from '../features/subjects/SubjectSwitcher';
import { queryKeys } from '../lib/query';

type NavIconName = 'home' | 'alert' | 'person' | 'more' | 'admin';

type MoreItem = { to: string; label: string; badge?: number };

/** Một nguồn duy nhất cho menu "Thêm": desktop đặt ở sidebar, mobile ở bottom-nav. */
function useIsDesktop(): boolean {
  const supportsMediaQuery = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [isDesktop, setIsDesktop] = useState(
    () => supportsMediaQuery() && window.matchMedia('(min-width: 1024px)').matches,
  );

  useEffect(() => {
    if (!supportsMediaQuery()) return;
    const list = window.matchMedia('(min-width: 1024px)');
    const update = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    setIsDesktop(list.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, []);

  return isDesktop;
}

/** Số cảnh báo đang mở tải cho badge điều hướng; cùng cỡ với danh sách trên Hôm nay. */
const OPEN_ALERTS_LIMIT = 20;

/**
 * Đưa người dùng về đầu nội dung khi đổi trang trong /app.
 * - Chỉ chạy khi `pathname` đổi; đổi query param cùng trang không cuộn.
 * - POP (tải lần đầu/reload, back/forward) và URL có `#hash`: không can thiệp,
 *   để trình duyệt tự khôi phục vị trí hoặc cuộn tới đúng mục được chỉ định.
 */
function useResetScrollOnNavigate() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (navigationType === 'POP' || hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    // focus main để trình đọc màn hình đọc từ đầu trang; preventScroll giữ cuộn ở đầu.
    mainRef.current?.focus({ preventScroll: true });
    // Cố ý chỉ phụ thuộc `pathname`: đổi query param/hash không được tự cuộn.
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return mainRef;
}

/**
 * Chuyển trang mềm, có mục đích: chỉ khi `pathname` đổi.
 * - Lần tải đầu (POP/reload) không chạy hiệu ứng nên không làm chậm first paint.
 * - Render lại do query/refetch/Sse hay đổi query param, hash giữ nguyên pathname
 *   nên không tạo lại phần tử và không nhấp nháy nội dung.
 * - `key` theo pathname buộc trang mới mount lại, nhờ đó CSS animation
 *   (fade + dịch lên, xem `.shell__route--enter`) chạy đúng một lần. Hiệu ứng
 *   chỉ dùng opacity/transform nên không gây layout shift, không che nav.
 */
function useRouteTransition(pathname: string): { path: string; animate: boolean } {
  const [route, setRoute] = useState({ path: pathname, animate: false });
  if (route.path !== pathname) {
    setRoute({ path: pathname, animate: true });
  }
  return route;
}

function NavIcon({ name }: { name: NavIconName }) {
  const paths: Record<NavIconName, ReactNode> = {
    home: <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />,
    alert: (
      <>
        <path d="M12 3.5 3.5 19h17z" />
        <path d="M12 9v4.5M12 16.5v.1" />
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
 * Badge số trên mục điều hướng. Con số chỉ là phần nhìn (aria-hidden);
 * trình đọc màn hình đọc câu đầy đủ nên không phụ thuộc màu sắc.
 */
function NavBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <>
      <span className="shell__nav-badge" aria-hidden="true">
        {count > 99 ? '99+' : count}
      </span>
      <span className="visually-hidden">{label}</span>
    </>
  );
}

/**
 * Nút đăng xuất có bước hỏi lại: một chạm không kết thúc phiên.
 * Hai vị trí (sidebar desktop, topbar mobile) dùng cùng hành vi nhưng mỗi nơi
 * giữ trạng thái xác nhận riêng; chỉ một vị trí hiển thị theo breakpoint.
 */
function LogoutControl({
  pending,
  className,
  onLogout,
}: {
  pending: boolean;
  className?: string;
  onLogout: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        variant="subtle"
        size="sm"
        className={className}
        onClick={() => setConfirming(true)}
        disabled={pending}
      >
        Đăng xuất
      </Button>
    );
  }

  return (
    <div className="shell__logout-confirm" role="group" aria-label="Xác nhận đăng xuất">
      <p className="shell__logout-confirm-text">Đăng xuất khỏi tài khoản?</p>
      <div className="shell__logout-confirm-actions">
        <Button
          variant="danger"
          size="sm"
          disabled={pending}
          onClick={() => {
            setConfirming(false);
            onLogout();
          }}
        >
          {pending ? 'Đang đăng xuất…' : 'Đăng xuất'}
        </Button>
        <Button variant="subtle" size="sm" disabled={pending} onClick={() => setConfirming(false)}>
          Hủy
        </Button>
      </div>
    </div>
  );
}

function MoreMenu({
  items,
  open,
  unreadCount,
  moreRef,
  linkClass,
  onToggle,
  onClose,
}: {
  items: MoreItem[];
  open: boolean;
  unreadCount: number;
  moreRef: RefObject<HTMLDivElement | null>;
  linkClass: (args: { isActive: boolean }) => string;
  onToggle: () => void;
  onClose: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className={`shell__more${open ? ' is-open' : ''}`} ref={moreRef}>
      <button
        type="button"
        className="shell__more-toggle"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="shell-more-menu"
        onClick={onToggle}
      >
        <NavIcon name="more" />
        <span>Thêm</span>
        {unreadCount > 0 ? <span className="shell__more-dot" aria-hidden="true" /> : null}
      </button>
      {open ? (
        <div className="shell__more-menu" id="shell-more-menu" role="menu" aria-label="Mục khác">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={linkClass}
              role="menuitem"
              onClick={onClose}
            >
              {item.label}
              <NavBadge
                count={item.badge ?? 0}
                label={`${item.badge ?? 0} thông báo chưa đọc`}
              />
            </NavLink>
          ))}
        </div>
      ) : null}
    </div>
  );
}
/**
 * Khung ứng dụng /app — bốn mục chính: Hôm nay, Cảnh báo, Người thân, Thêm.
 * - Mobile (<1024px): topbar + bottom-nav 4 mục.
 * - Desktop (≥1024px): sidebar bên trái.
 * - Mở SSE cho hồ sơ đang xem (cảnh báo cập nhật ngay cả khi ở màn hình khác).
 * - Badge cảnh báo đang mở + badge thông báo chưa đọc (trong menu Thêm).
 * - Mất SSE → banner “Mất cập nhật trực tiếp — đang thử lại” cho tới khi nối lại.
 * - Bị thu hồi quyền (`revoked`) → thông báo rõ + điều hướng về không gian an toàn.
 */
export function AppShell() {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const mainRef = useResetScrollOnNavigate();
  const routeTransition = useRouteTransition(location.pathname);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [revokedInfo, setRevokedInfo] = useState<{ subjectId: string; name: string } | null>(null);

  const subjects = useSubjects();
  const activeSubject = useActiveSubject(subjects.data);
  const user = me.data?.user;
  const [moreOpen, setMoreOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const moreRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === 'admin';
  const subjectsData = subjects.data ?? [];
  // Admin không có hồ sơ chỉ thấy Quản trị; tránh các trang sức khỏe sẽ 404.
  const adminOnly = isAdmin && subjectsData.length === 0;

  // Badge/banner thông báo toàn tài khoản: tải 20 giây/lần (tab ẩn thì dừng)
  // hoặc ngay khi SSE `notification.sent` invalidate cùng query key.
  const notifications = useUnreadNotifications(
    me.isSuccess && subjects.isSuccess && !adminOnly,
  );
  // Đang ở hộp thư thì danh sách đã hiển thị thông báo — không cần banner.
  const onNotificationsPage = location.pathname.startsWith('/app/notifications');
  const dismissNewNotification = notifications.dismiss;
  useEffect(() => {
    // Xóa ngay khi đang ở hộp thư (kể cả thông báo tới lúc đang mở trang đó)
    // để không hiện lại banner cũ khi người dùng rời trang.
    if (onNotificationsPage) dismissNewNotification();
  }, [onNotificationsPage, notifications.newNotification, dismissNewNotification]);

  const subjectEvents = useSubjectEvents(activeSubject?.id ?? null, {
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
  // Còn lần thử lại > 0 nghĩa là stream đã mất kết nối và chưa mở lại được;
  // giữ banner trong lúc chờ (status “connecting”) tới khi onopen reset về 0.
  const realtimeLost = subjectEvents.retryAttempt > 0 && subjectEvents.status !== 'revoked';

  // Quyền hiển thị mục nav phụ (backend vẫn là nơi kiểm quyền thật):
  // Công việc: chủ/caregiver có canReceiveAlerts, hoặc admin (task không gắn hồ sơ).
  // Studio: chủ hồ sơ/admin. Quản trị: chỉ admin.
  const hasTasksPermission =
    isAdmin ||
    subjectsData.some((subject) => subject.role === 'owner' || subject.permissions.canReceiveAlerts);
  const isStudioUser = isAdmin || subjectsData.some((subject) => subject.role === 'owner');

  // Badge cảnh báo đang mở của hồ sơ đang xem: cùng query key với danh sách ngắn
  // trên Hôm nay nên hai nơi dùng chung một lần tải.
  const canSeeAlerts = Boolean(
    activeSubject &&
      !adminOnly &&
      (activeSubject.role === 'owner' || activeSubject.permissions.canReceiveAlerts),
  );
  const openAlerts = useQuery({
    queryKey: activeSubject
      ? queryKeys.dashboardOpenAlerts(activeSubject.id)
      : (['subjects', 'none', 'alerts', 'shell'] as const),
    queryFn: ({ signal }) =>
      activeSubject ? fetchOpenAlerts(activeSubject.id, OPEN_ALERTS_LIMIT, signal) : null,
    enabled: canSeeAlerts,
    staleTime: 15_000,
  });
  const openAlertCount = openAlerts.data?.items.length ?? 0;
  const openAlertLabel = `${openAlertCount} cảnh báo đang mở`;

  // Vai trò hiển thị dưới tên người dùng — không hiện email thô trong sidebar.
  const roleLabel = isAdmin
    ? 'Quản trị'
    : subjectsData.some((subject) => subject.role === 'owner')
      ? 'Chủ hồ sơ'
      : subjectsData.length > 0
        ? 'Người thân'
        : null;

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

  // Đóng menu Thêm khi đổi trang, khi bấm Escape hoặc bấm ra ngoài.
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMoreOpen(false);
      moreRef.current?.querySelector<HTMLButtonElement>('.shell__more-toggle')?.focus();
    };
    const closeOnOutside = (event: Event) => {
      if (!(event.target instanceof Node)) return;
      if (moreRef.current?.contains(event.target)) return;
      setMoreOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('mousedown', closeOnOutside);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('mousedown', closeOnOutside);
    };
  }, [moreOpen]);

  // Admin không có hồ sơ: chỉ Quản trị + Cài đặt; logo dẫn /app (router tự chuyển
  // sang /app/admin). Người dùng thường: Hôm nay, Cảnh báo, Người thân, Thêm.
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
        <span>Hôm nay</span>
      </NavLink>
      <NavLink to="/app/alerts" className={navLinkClass}>
        <NavIcon name="alert" />
        <span>Cảnh báo</span>
        <NavBadge count={openAlertCount} label={openAlertLabel} />
      </NavLink>
      <NavLink to="/app/subjects" className={navLinkClass}>
        <NavIcon name="person" />
        <span>Người thân</span>
      </NavLink>
    </>
  );

  const moreItems: { to: string; label: string; badge?: number }[] = [];
  if (!adminOnly) {
    moreItems.push({ to: '/app/devices', label: 'Thiết bị' });
    moreItems.push({
      to: '/app/notifications',
      label: 'Thông báo',
      badge: notifications.unreadCount,
    });
  }
  if (hasTasksPermission) moreItems.push({ to: '/app/tasks', label: 'Công việc' });
  if (!adminOnly) moreItems.push({ to: '/app/settings', label: 'Cài đặt' });
  if (isStudioUser) moreItems.push({ to: '/app/studio', label: 'Studio' });
  if (isAdmin) moreItems.push({ to: '/app/admin', label: 'Quản trị' });

  const moreMenu = adminOnly ? null : (
    <MoreMenu
      items={moreItems}
      open={moreOpen}
      unreadCount={notifications.unreadCount}
      moreRef={moreRef}
      linkClass={navLinkClass}
      onToggle={() => setMoreOpen((value) => !value)}
      onClose={() => setMoreOpen(false)}
    />
  );

  // Trang Hôm nay tự đặt bộ chuyển hồ sơ ngay dưới tiêu đề; các trang khác dùng
  // bộ chuyển chung của khung để giữ một thanh ngữ cảnh duy nhất.
  const onTodayPage =
    location.pathname === '/app' || location.pathname === '/app/assistant';

  return (
    <div className="shell">
      <SkipLink />

      <aside className="shell__sidebar">
        <div className="shell__brand">
          <Link to="/app" className="brand">
            An Nhiên
          </Link>
        </div>
        <nav className="shell__nav" aria-label="Điều hướng ứng dụng">
          {navItems}
          {isDesktop ? moreMenu : null}
        </nav>
        <div className="shell__user">
          <p className="shell__user-name">{user?.displayName}</p>
          {roleLabel ? <p className="shell__user-role">{roleLabel}</p> : null}
          <LogoutControl
            pending={logout.isPending}
            className="shell__logout"
            onLogout={handleLogout}
          />
          {logoutError ? (
            <p className="shell__error" role="alert">
              {logoutError}
            </p>
          ) : null}
          <TextSizeToggle />
        </div>
      </aside>

      <div className="shell__body">
        <header className="shell__topbar">
          <div className="shell__topbar-row">
            <div className="shell__mobile-brand">
              <Link to="/app" className="brand">
                An Nhiên
              </Link>
            </div>
            <div className="shell__topbar-actions">
              <TextSizeToggle />
              <LogoutControl
                pending={logout.isPending}
                className="shell__topbar-logout"
                onLogout={handleLogout}
              />
            </div>
          </div>
          {logoutError ? (
            <p className="shell__error" role="alert">
              {logoutError}
            </p>
          ) : null}
        </header>

        <main id="main" ref={mainRef} tabIndex={-1} className="shell__main">
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
            {notifications.newNotification && !onNotificationsPage ? (
              <div className="shell__banner shell__banner--notice" role="status">
                <p className="shell__banner-text">
                  Có thông báo mới cho hồ sơ <strong>{notifications.newNotification.subjectName}</strong>
                </p>
                <div className="shell__banner-actions">
                  <ButtonLink to="/app/notifications" variant="secondary" size="sm">
                    Xem thông báo
                  </ButtonLink>
                  <Button
                    variant="subtle"
                    size="sm"
                    aria-label="Đóng thông báo mới"
                    onClick={dismissNewNotification}
                  >
                    Đóng
                  </Button>
                </div>
              </div>
            ) : null}
            {realtimeLost ? (
              <div className="shell__banner shell__banner--warning" role="status">
                <p className="shell__banner-text">
                  Mất cập nhật trực tiếp — đang thử lại
                  <span className="shell__banner-hint">
                    Cảnh báo đã tải vẫn giữ nguyên; hệ thống tự kết nối lại khi có mạng.
                  </span>
                </p>
              </div>
            ) : null}
            {adminOnly || onTodayPage ? null : <SubjectSwitcher />}
            {/* Key theo pathname: lỗi của trang trước không dính sang trang mới và
                hiệu ứng chuyển trang chạy lại đúng một lần cho nội dung mới. */}
            <div
              key={routeTransition.path}
              className={`shell__route${routeTransition.animate ? ' shell__route--enter' : ''}`}
            >
              <AppErrorBoundary>
                <Outlet />
              </AppErrorBoundary>
            </div>
          </div>
        </main>

        <nav className="shell__bottomnav" aria-label="Điều hướng ứng dụng">
          {navItems}
          {isDesktop ? null : moreMenu}
        </nav>
      </div>
    </div>
  );
}
