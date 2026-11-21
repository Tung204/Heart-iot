/**
 * Một nguồn duy nhất quyết định:
 * - mục điều hướng nào đang active (kể cả subroute như /app/history → Sức khỏe),
 * - shell có render dòng ngữ cảnh `selected` hay không,
 * - trang nào là chế độ hộp thông báo (không có select hồ sơ).
 *
 * Không page nào tự regex pathname để chọn nav/context; mọi nơi import hàm này.
 */

export type NavSection = 'today' | 'alerts' | 'health' | 'people' | 'admin' | 'none';

/**
 * - `selected`: shell render dòng chọn hồ sơ (các trang subject-scoped).
 * - `pinned`: trang ghim đối tượng từ URL/API và tự render dòng nhận diện.
 * - `collection`: danh sách nhiều hồ sơ ("Các hồ sơ bạn có quyền xem").
 * - `none`: không có ngữ cảnh hồ sơ trên trang.
 */
export type ContextScope = 'selected' | 'pinned' | 'collection' | 'none';

export interface RouteScope {
  section: NavSection;
  context: ContextScope;
  /** Đang ở inbox `?view=notifications` của Cảnh báo. */
  inbox: boolean;
  /** Hôm nay (kể cả alias /app/assistant) — vùng nội dung hẹp. */
  today: boolean;
}

const TODAY_PATHS = new Set(['/app', '/app/assistant']);
const HEALTH_PATHS = new Set(['/app/overview', '/app/history', '/app/history/report']);

export function resolveRouteScope(pathname: string, search = ''): RouteScope {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const inbox = pathname === '/app/alerts' && params.get('view') === 'notifications';

  if (TODAY_PATHS.has(pathname)) {
    return { section: 'today', context: 'selected', inbox: false, today: true };
  }

  if (pathname === '/app/alerts' || pathname.startsWith('/app/alerts/')) {
    const isDetail = pathname !== '/app/alerts' && pathname !== '/app/alerts/';
    return {
      section: 'alerts',
      context: inbox ? 'none' : isDetail ? 'pinned' : 'selected',
      inbox,
      today: false,
    };
  }

  if (HEALTH_PATHS.has(pathname)) {
    return { section: 'health', context: 'selected', inbox: false, today: false };
  }

  if (pathname === '/app/devices') {
    return { section: 'people', context: 'selected', inbox: false, today: false };
  }

  // Nhắc chăm sóc là việc của người/hồ sơ, không phải mục Sức khỏe: giữ nav
  // Người thân và dòng ngữ cảnh hồ sơ đang chọn. Không thêm mục nav thứ năm.
  if (pathname === '/app/care' || pathname === '/app/care/') {
    return { section: 'people', context: 'selected', inbox: false, today: false };
  }

  if (pathname === '/app/subjects' || pathname === '/app/subjects/') {
    return { section: 'people', context: 'collection', inbox: false, today: false };
  }

  if (pathname.startsWith('/app/subjects/')) {
    // Chia sẻ / liên hệ: ghim theo id trong URL, trang tự render dòng nhận diện.
    return { section: 'people', context: 'pinned', inbox: false, today: false };
  }

  if (pathname === '/app/tasks') {
    return { section: 'none', context: 'collection', inbox: false, today: false };
  }

  if (pathname.startsWith('/app/studio/')) {
    return { section: 'none', context: 'pinned', inbox: false, today: false };
  }

  if (pathname === '/app/admin') {
    return { section: 'admin', context: 'none', inbox: false, today: false };
  }

  // /app/settings, /app/studio, route 404 trong khung: không có ngữ cảnh hồ sơ.
  return { section: 'none', context: 'none', inbox: false, today: false };
}

/** Nhãn mục điều hướng chính — dùng chung cho rail/thanh dưới/tests. */
export const NAV_SECTIONS: ReadonlyArray<{ section: NavSection; label: string; to: string }> = [
  { section: 'today', label: 'Hôm nay', to: '/app' },
  { section: 'alerts', label: 'Cảnh báo', to: '/app/alerts' },
  { section: 'health', label: 'Sức khỏe', to: '/app/overview' },
  { section: 'people', label: 'Người thân', to: '/app/subjects' },
];
