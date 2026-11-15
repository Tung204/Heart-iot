import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom';
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
import {
  getActiveSubjectId,
  setActiveSubjectId,
  useActiveSubject,
} from '../features/subjects/selection';
import { useSubjects } from '../features/subjects/useSubjects';
import { queryKeys } from '../lib/query';

type NavIconName = 'home' | 'alert' | 'health' | 'person' | 'admin';

type AccountPlacement = 'sidebar' | 'topbar';

/** Một nguồn duy nhất cho menu tài khoản: desktop ở cuối sidebar, mobile ở topbar. */
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
    health: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
    person: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" />
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

/** Chữ cái đầu cho avatar; không hiện email hay mã định danh. */
function accountInitials(displayName: string | undefined): string {
  const parts = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '•';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

/**
 * Hộp hỏi lại đăng xuất đặt trong menu tài khoản.
 * Escape hủy như một dialog nhỏ; focus vào lựa chọn an toàn (Hủy).
 */
function LogoutConfirm({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      className="shell__logout-confirm"
      role="group"
      aria-label="Xác nhận đăng xuất"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onCancel();
      }}
    >
      <p className="shell__logout-confirm-text">Đăng xuất khỏi tài khoản?</p>
      <div className="shell__logout-confirm-actions">
        <Button variant="danger" size="sm" disabled={pending} onClick={onConfirm}>
          {pending ? 'Đang đăng xuất…' : 'Đăng xuất'}
        </Button>
        <Button ref={cancelRef} variant="subtle" size="sm" disabled={pending} onClick={onCancel}>
          Hủy
        </Button>
      </div>
    </div>
  );
}

/**
 * Menu tài khoản gọn thay cho khối Đăng xuất/Aa trần ở sidebar.
 * - Chỉ render một bản: sidebar ở desktop, topbar ở mobile.
 * - Tên + vai trò, không email; Tài khoản mở /app/settings.
 * - Studio chỉ chủ hồ sơ/admin; Quản trị chỉ admin.
 * - Đóng bằng Escape/click ngoài; Escape trả focus về trigger.
 */
function AccountMenu({
  user,
  roleLabel,
  isAdmin,
  isStudioUser,
  placement,
  pending,
  logoutError,
  onLogout,
}: {
  user: { displayName: string } | undefined;
  roleLabel: string | null;
  isAdmin: boolean;
  isStudioUser: boolean;
  placement: AccountPlacement;
  pending: boolean;
  logoutError: string | null;
  onLogout: () => void;
}) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const logoutRef = useRef<HTMLButtonElement>(null);

  const displayName = user?.displayName || 'Tài khoản';

  const closeMenu = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setConfirming(false);
    if (returnFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  // Đổi trang thì menu không được dính lại trên màn mới.
  useEffect(() => {
    setOpen(false);
    setConfirming(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      closeMenu(true);
    };
    const closeOnOutside = (event: Event) => {
      if (!(event.target instanceof Node)) return;
      if (containerRef.current?.contains(event.target)) return;
      closeMenu(false);
    };
    // Tab ra khỏi menu (hoặc focus bị chuyển đi nơi khác) thì đóng, không để
    // popup mở che nội dung trong khi focus đã ở ngoài (R-18).
    const closeOnFocusOut = (event: FocusEvent) => {
      if (!(event.target instanceof Node)) return;
      if (containerRef.current?.contains(event.target)) return;
      closeMenu(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('focusin', closeOnFocusOut);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('focusin', closeOnFocusOut);
    };
  }, [open, closeMenu]);

  // Điều hướng bằng mũi tên/Home/End cho role="menu" (ARIA APG); Tab vẫn đi
  // qua từng mục và focusout ở trên sẽ đóng menu khi rời khỏi.
  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (confirming) return;
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"], button:not([disabled])',
      ) ?? [],
    );
    if (items.length === 0) return;
    const activeIndex = items.indexOf(document.activeElement as HTMLElement);
    let nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    else if (event.key === 'ArrowDown') nextIndex = activeIndex < 0 ? 0 : (activeIndex + 1) % items.length;
    else if (event.key === 'ArrowUp') {
      nextIndex = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
    }
    event.preventDefault();
    items[nextIndex]?.focus();
  };

  const accountLinkClass = ({ isActive }: { isActive: boolean }) =>
    `shell__account-item${isActive ? ' is-active' : ''}`;

  const closeAfterNavigate = () => closeMenu(false);

  return (
    <div
      className={`shell__account shell__account--${placement}`}
      ref={containerRef}
    >
      <button
        ref={triggerRef}
        type="button"
        className="shell__account-trigger"
        aria-label={`Tài khoản của ${displayName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="shell-account-menu"
        onClick={() => {
          if (open) {
            closeMenu(true);
            return;
          }
          setOpen(true);
          setConfirming(false);
        }}
      >
        <span className="shell__account-avatar" aria-hidden="true">
          {accountInitials(user?.displayName)}
        </span>
        <span className="shell__account-trigger-text">
          <span className="shell__account-trigger-name">{displayName}</span>
          {roleLabel ? (
            <span className="shell__account-trigger-role">{roleLabel}</span>
          ) : null}
        </span>
        <span className="shell__account-chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div
          ref={menuRef}
          className="shell__account-menu"
          id="shell-account-menu"
          role="menu"
          aria-label="Tài khoản"
          onKeyDown={handleMenuKeyDown}
        >
          <div className="shell__account-head">
            <p className="shell__account-name">{displayName}</p>
            {roleLabel ? <p className="shell__account-role">{roleLabel}</p> : null}
          </div>

          <NavLink
            to="/app/settings"
            role="menuitem"
            className={accountLinkClass}
            onClick={closeAfterNavigate}
          >
            Tài khoản
          </NavLink>
          {isStudioUser ? (
            <NavLink
              to="/app/studio"
              role="menuitem"
              className={accountLinkClass}
              onClick={closeAfterNavigate}
            >
              Studio
            </NavLink>
          ) : null}
          {isAdmin ? (
            <NavLink
              to="/app/admin"
              role="menuitem"
              className={accountLinkClass}
              onClick={closeAfterNavigate}
            >
              Quản trị
            </NavLink>
          ) : null}

          <div className="shell__account-row" role="none">
            <TextSizeToggle />
          </div>

          {confirming ? (
            <LogoutConfirm
              pending={pending}
              onConfirm={() => {
                setConfirming(false);
                onLogout();
              }}
              onCancel={() => {
                setConfirming(false);
                requestAnimationFrame(() => logoutRef.current?.focus());
              }}
            />
          ) : (
            <button
              ref={logoutRef}
              type="button"
              role="menuitem"
              className="shell__account-item shell__account-logout"
              disabled={pending}
              onClick={() => setConfirming(true)}
            >
              Đăng xuất
            </button>
          )}

          {logoutError ? (
            <p className="shell__error shell__account-error" role="alert">
              {logoutError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Khung ứng dụng /app — bốn mục chính: Hôm nay, Cảnh báo, Sức khỏe, Người thân.
 * - Mobile (<1024px): topbar (brand + menu tài khoản) + bottom-nav 4 mục.
 * - Desktop (≥1024px): sidebar bên trái, menu tài khoản ở cuối sidebar.
 * - Admin không có hồ sơ: nav chỉ Quản trị; Tài khoản nằm trong menu.
 * - Mở SSE cho hồ sơ đang xem (cảnh báo cập nhật ngay cả khi ở màn hình khác).
 * - Badge cảnh báo đang mở trên mục Cảnh báo.
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
  const isDesktop = useIsDesktop();

  const isAdmin = user?.role === 'admin';
  const subjectsData = subjects.data ?? [];
  // Admin không có hồ sơ chỉ thấy Quản trị; tránh các trang sức khỏe sẽ 404.
  const adminOnly = isAdmin && subjectsData.length === 0;

  // Banner thông báo toàn tài khoản: tải 20 giây/lần (tab ẩn thì dừng)
  // hoặc ngay khi SSE `notification.sent` invalidate cùng query key.
  const notifications = useUnreadNotifications(
    me.isSuccess && subjects.isSuccess && !adminOnly,
  );
  // Cảnh báo đã gộp thông báo; đang ở đó thì danh sách đã hiển thị — không cần banner.
  const onAlertsPage = location.pathname.startsWith('/app/alerts');
  const dismissNewNotification = notifications.dismiss;
  useEffect(() => {
    // Xóa ngay khi đang ở trang cảnh báo (kể cả thông báo tới lúc đang mở trang đó)
    // để không hiện lại banner cũ khi người dùng rời trang.
    if (onAlertsPage) dismissNewNotification();
  }, [onAlertsPage, notifications.newNotification, dismissNewNotification]);

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

  // Quyền hiển thị mục menu (backend vẫn là nơi kiểm quyền thật):
  // Studio: chủ hồ sơ/admin. Quản trị: chỉ admin.
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

  // Vai trò hiển thị dưới tên người dùng — không hiện email thô trong shell.
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

  // Admin không có hồ sơ: chỉ Quản trị; Tài khoản nằm trong menu.
  // Người dùng có hồ sơ: đúng bốn mục, không có mục thứ năm.
  const navItems = adminOnly ? (
    <NavLink to="/app/admin" className={navLinkClass}>
      <NavIcon name="admin" />
      <span>Quản trị</span>
    </NavLink>
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
      <NavLink to="/app/overview" className={navLinkClass}>
        <NavIcon name="health" />
        <span>Sức khỏe</span>
      </NavLink>
      <NavLink to="/app/subjects" className={navLinkClass}>
        <NavIcon name="person" />
        <span>Người thân</span>
      </NavLink>
    </>
  );

  const accountMenu = (
    <AccountMenu
      user={user}
      roleLabel={roleLabel}
      isAdmin={isAdmin}
      isStudioUser={isStudioUser}
      placement={isDesktop ? 'sidebar' : 'topbar'}
      pending={logout.isPending}
      logoutError={logoutError}
      onLogout={handleLogout}
    />
  );

  return (
    <div className="shell">
      <SkipLink />

      <aside className="shell__sidebar">
        <div className="shell__brand">
          <Link to="/app" className="brand">
            Theo dõi sức khỏe
          </Link>
        </div>
        <nav className="shell__nav" aria-label="Điều hướng ứng dụng">
          {navItems}
        </nav>
        {isDesktop ? accountMenu : null}
      </aside>

      <div className="shell__body">
        <header className="shell__topbar">
          <div className="shell__topbar-row">
            <div className="shell__mobile-brand">
              <Link to="/app" className="brand">
                Theo dõi sức khỏe
              </Link>
            </div>
            <div className="shell__topbar-actions">
              {isDesktop ? null : accountMenu}
            </div>
          </div>
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
            {notifications.newNotification && !onAlertsPage ? (
              <div className="shell__banner shell__banner--notice" role="status">
                <p className="shell__banner-text">
                  Có thông báo mới cho hồ sơ{' '}
                  <strong>{notifications.newNotification.subjectName}</strong>
                </p>
                <div className="shell__banner-actions">
                  <ButtonLink to="/app/alerts" variant="secondary" size="sm">
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
        </nav>
      </div>
    </div>
  );
}
