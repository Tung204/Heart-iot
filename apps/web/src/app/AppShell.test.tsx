import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  RouterProvider,
  createMemoryRouter,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './AppShell';
import { errorEnvelope, INCIDENT, mockResponse, stubFetch } from '../test/utils';

const ADMIN = {
  id: '0f1d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b',
  email: 'admin@example.com',
  displayName: 'Quản trị viên',
  role: 'admin',
  status: 'active',
  createdAt: '2026-11-01T00:00:00.000Z',
};

const OWNER_USER = {
  ...ADMIN,
  email: 'ba@example.com',
  displayName: 'Bà An',
  role: 'user',
};

const SUBJECTS = [
  {
    id: '1f2d3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b',
    ownerUserId: OWNER_USER.id,
    displayName: 'Bà Năm',
    timezone: 'Asia/Ho_Chi_Minh',
    role: 'owner',
    permissions: {
      historyDays: 30,
      canReceiveAlerts: true,
      canAcknowledge: true,
      canResolve: true,
      canViewAi: true,
    },
    sharedFrom: null,
    createdAt: '2026-11-01T00:00:00.000Z',
  },
];

const CAREGIVER_ONLY = [
  {
    ...SUBJECTS[0],
    role: 'caregiver',
    permissions: {
      historyDays: 7,
      canReceiveAlerts: false,
      canAcknowledge: false,
      canResolve: false,
      canViewAi: false,
    },
  },
];

/** Thông báo mẫu đúng hợp đồng @heart-iot/contracts/notifications. */
function notification(overrides: Record<string, unknown> = {}) {
  return {
    id: '5f6d7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
    incidentId: '2f3d4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b',
    subjectId: SUBJECTS[0]!.id,
    subjectName: 'Bà Năm',
    incidentType: 'sos',
    state: 'open',
    revision: 1,
    kind: 'alert',
    sentAt: '2026-11-15T02:00:00.000Z',
    readAt: null,
    createdAt: '2026-11-15T02:00:00.000Z',
    ...overrides,
  };
}

// Motion v2 — hiệu ứng chuyển trang chỉ chạy khi pathname đổi, tắt hoàn toàn
// khi người dùng giảm chuyển động; hover chỉ áp dụng trên thiết bị có con trỏ.
// CSS được đọc trực tiếp từ file nguồn (không snapshot) vì hành vi nằm ở CSS.
const STYLES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../styles');

function readStyle(name: 'layout.css' | 'tokens.css'): string {
  return readFileSync(resolve(STYLES_DIR, name), 'utf8');
}

/** Nội dung các khối @media đúng điều kiện, khớp ngoặc nhọn nên không phụ thuộc format. */
function mediaBlocks(css: string, condition: string): string[] {
  const blocks: string[] = [];
  const marker = `@media ${condition}`;
  let from = 0;
  while (from < css.length) {
    const start = css.indexOf(marker, from);
    if (start === -1) break;
    const open = css.indexOf('{', start);
    if (open === -1) break;
    let depth = 0;
    let end = -1;
    for (let i = open; i < css.length; i += 1) {
      const ch = css.charAt(i);
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) break;
    blocks.push(css.slice(open + 1, end));
    from = end + 1;
  }
  return blocks;
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

interface NotificationPayload {
  items: ReturnType<typeof notification>[];
  unreadCount: number;
}

interface ShellOptions {
  /** Payload `/notifications`; dùng hàm để đổi dữ liệu giữa các lần refetch. */
  notifications?: NotificationPayload | (() => NotificationPayload);
  /** Số cảnh báo đang mở trả cho badge điều hướng. */
  openAlerts?: unknown[];
  /** Trang bắt đầu; mặc định /app. */
  initialEntries?: string[];
}

/** EventSource giả: kiểm tra onopen/onerror/listener SSE mà không cần máy chủ. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  private readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown, lastEventId = '') {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: JSON.stringify(data), lastEventId } as MessageEvent);
    }
  }
}

function resetFakeEventSource() {
  FakeEventSource.instances = [];
}

function renderShell(me: unknown, subjects: unknown[], options: ShellOptions = {}) {
  const fetchMock = stubFetch((url) => {
    const u = url;
    if (u.endsWith('/me')) return mockResponse(me);
    if (u.endsWith('/subjects')) return mockResponse({ items: subjects });
    if (u.endsWith('/notifications')) {
      const payload =
        typeof options.notifications === 'function'
          ? options.notifications()
          : options.notifications;
      return mockResponse(payload ?? { items: [], unreadCount: 0 });
    }
    if (u.includes('/alerts?')) {
      return mockResponse({ items: options.openAlerts ?? [], nextCursor: null });
    }
    return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={options.initialEntries ?? ['/app']}>
        <Routes>
          <Route path="/app" element={<AppShell />}>
            <Route
              index
              element={
                <div>
                  <p>nội dung trang</p>
                  <Link to="/app?tab=2">đổi tham số</Link>
                </div>
              }
            />
            <Route path="overview" element={<p>trang sức khỏe</p>} />
            <Route path="history" element={<p>trang lịch sử</p>} />
            <Route path="alerts" element={<p>trang cảnh báo</p>} />
            <Route path="settings" element={<p>trang tài khoản</p>} />
            <Route path="studio" element={<p>trang studio</p>} />
            <Route path="admin" element={<p>trang quản trị</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { queryClient, fetchMock };
}

async function openAccountMenu(user: ReturnType<typeof userEvent.setup>) {
  const trigger = await screen.findByRole('button', { name: /^Tài khoản của / });
  await user.click(trigger);
  return trigger;
}

function accountMenu(): HTMLElement {
  const menu = document.querySelector<HTMLElement>('.shell__account-menu');
  if (!menu) throw new Error('Menu tài khoản chưa mở');
  return menu;
}

// v6 — điều hướng bốn mục: Hôm nay, Cảnh báo, Sức khỏe, Người thân.
// Tài khoản nằm trong menu ở avatar; không còn mục “Thêm” hay mục thứ năm.
describe('AppShell — điều hướng bốn mục', () => {
  function mainNavLinks(): HTMLAnchorElement[] {
    const nav = document.querySelector('.shell__sidebar .shell__nav');
    return Array.from(nav?.querySelectorAll('a') ?? []) as HTMLAnchorElement[];
  }

  it('admin có hồ sơ → nav đúng bốn mục; menu tài khoản có Quản trị/Tài khoản, không có Studio', async () => {
    renderShell({ user: ADMIN }, SUBJECTS);
    const user = userEvent.setup();

    await screen.findByText('nội dung trang');
    expect(screen.getAllByRole('link', { name: 'Hôm nay' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Cảnh báo' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Sức khỏe' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Người thân' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Tổng quan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Lịch sử' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm' })).not.toBeInTheDocument();

    await openAccountMenu(user);
    const menu = accountMenu();
    expect(within(menu).getByRole('menuitem', { name: 'Tài khoản' })).toHaveAttribute(
      'href',
      '/app/settings',
    );
    expect(within(menu).getByRole('menuitem', { name: 'Quản trị' })).toHaveAttribute(
      'href',
      '/app/admin',
    );
    expect(within(menu).queryByRole('menuitem', { name: 'Studio' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Thông báo' })).not.toBeInTheDocument();
  });

  it('chủ hồ sơ → menu chỉ có Tài khoản, KHÔNG có Studio/Quản trị', async () => {
    renderShell({ user: OWNER_USER }, SUBJECTS);
    const user = userEvent.setup();

    await screen.findByText('nội dung trang');
    await openAccountMenu(user);
    const menu = accountMenu();
    expect(within(menu).getByRole('menuitem', { name: 'Tài khoản' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Studio' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Quản trị' })).not.toBeInTheDocument();
  });

  it('không còn link Studio trong shell; /app/studio vẫn mở trực tiếp', async () => {
    renderShell({ user: OWNER_USER }, SUBJECTS, { initialEntries: ['/app/studio'] });

    expect(await screen.findByText('trang studio')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Studio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Studio' })).not.toBeInTheDocument();
  });

  it('caregiver không phải chủ hồ sơ → menu chỉ còn Tài khoản', async () => {
    renderShell({ user: OWNER_USER }, CAREGIVER_ONLY);
    const user = userEvent.setup();

    await screen.findByText('nội dung trang');
    await openAccountMenu(user);
    const menu = accountMenu();
    expect(within(menu).getByRole('menuitem', { name: 'Tài khoản' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Studio' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Quản trị' })).not.toBeInTheDocument();
  });

  it('desktop: bốn liên kết đúng thứ tự/route, không có nút Thêm', async () => {
    renderShell({ user: OWNER_USER }, SUBJECTS);
    await screen.findByText('nội dung trang');

    const links = mainNavLinks();
    expect(links).toHaveLength(4);
    expect(links[0]).toHaveTextContent('Hôm nay');
    expect(links[0]).toHaveAttribute('href', '/app');
    expect(links[1]).toHaveTextContent('Cảnh báo');
    expect(links[1]).toHaveAttribute('href', '/app/alerts');
    expect(links[2]).toHaveTextContent('Sức khỏe');
    expect(links[2]).toHaveAttribute('href', '/app/overview');
    expect(links[3]).toHaveTextContent('Người thân');
    expect(links[3]).toHaveAttribute('href', '/app/subjects');

    expect(document.querySelector('.shell__more')).toBeNull();
    expect(document.querySelector('.shell__more-toggle')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thêm' })).not.toBeInTheDocument();
  });

  it('bottom-nav có đúng bốn mục, không nhét Tổng quan/Lịch sử/Trợ lý vào nav chính', async () => {
    renderShell({ user: OWNER_USER }, SUBJECTS);
    await screen.findByText('nội dung trang');

    const bottomNav = document.querySelector('.shell__bottomnav');
    expect(bottomNav).not.toBeNull();
    expect(bottomNav?.querySelectorAll(':scope > a')).toHaveLength(4);
    expect(bottomNav?.querySelector('.shell__more')).toBeNull();
    expect(bottomNav?.querySelectorAll(':scope > a')).toHaveLength(4);
    expect(screen.queryByRole('link', { name: 'Tổng quan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Lịch sử' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Trợ lý' })).not.toBeInTheDocument();
  });

  it('khu tài khoản: tên + vai trò trong menu, không hiện email thô', async () => {
    renderShell({ user: OWNER_USER }, SUBJECTS);
    const user = userEvent.setup();
    await screen.findByText('nội dung trang');
    await openAccountMenu(user);

    const menu = accountMenu();
    expect(within(menu).getByText('Bà An')).toBeInTheDocument();
    expect(within(menu).getByText('Chủ hồ sơ')).toBeInTheDocument();
    expect(screen.queryByText(OWNER_USER.email)).not.toBeInTheDocument();
    expect(document.querySelector('.shell__user-email')).toBeNull();
  });

  it('caregiver → vai trò “Người thân”', async () => {
    renderShell({ user: OWNER_USER }, CAREGIVER_ONLY);
    const user = userEvent.setup();
    await screen.findByText('nội dung trang');
    await openAccountMenu(user);

    expect(within(accountMenu()).getByText('Người thân')).toBeInTheDocument();
  });

  it('admin → vai trò “Quản trị”', async () => {
    renderShell({ user: ADMIN }, SUBJECTS);
    const user = userEvent.setup();
    await screen.findByText('nội dung trang');
    await openAccountMenu(user);

    expect(within(accountMenu()).getByText('Quản trị', { selector: '.shell__account-role' })).toBeInTheDocument();
  });

  it('admin không có hồ sơ → nav chỉ Quản trị, Tài khoản trong menu, không hiện mục rỗng', async () => {
    renderShell({ user: ADMIN }, []);
    const user = userEvent.setup();
    await screen.findByText('nội dung trang');
    await waitFor(() => expect(mainNavLinks()).toHaveLength(1));

    const links = mainNavLinks();
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent('Quản trị');
    expect(links[0]).toHaveAttribute('href', '/app/admin');
    expect(screen.queryByRole('link', { name: 'Hôm nay' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cảnh báo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Người thân' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm' })).not.toBeInTheDocument();
    expect(document.querySelector('.shell__sidebar .brand')).toHaveAttribute('href', '/app');
    expect(screen.queryByText(ADMIN.email)).not.toBeInTheDocument();

    await openAccountMenu(user);
    expect(
      within(accountMenu()).getByRole('menuitem', { name: 'Tài khoản' }),
    ).toHaveAttribute('href', '/app/settings');
  });

  it('badge Cảnh báo hiện số đang mở ở cả sidebar lẫn bottom-nav', async () => {
    renderShell({ user: OWNER_USER }, SUBJECTS, {
      openAlerts: [INCIDENT, { ...INCIDENT, id: '2f3d4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6c' }],
    });
    await screen.findByText('nội dung trang');

    const links = await screen.findAllByRole('link', { name: /2 cảnh báo đang mở/ });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/app/alerts');
      expect(link.querySelector('.shell__nav-badge')).not.toBeNull();
    }
  });

  it('caregiver thiếu canReceiveAlerts → không tải cảnh báo, không có badge', async () => {
    const { fetchMock } = renderShell({ user: OWNER_USER }, CAREGIVER_ONLY);
    await screen.findByText('nội dung trang');

    expect(document.querySelector('.shell__nav-badge')).toBeNull();
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/alerts?')),
    ).toBe(false);
  });
});

// F09/F11 — menu tài khoản chỉ một bản trong DOM, đóng được bằng Escape/click ngoài,
// aria-expanded khớp trạng thái và focus trả về trigger.
describe('AppShell — menu tài khoản một bản, đóng được', () => {
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  function desktopMatchMedia() {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query === '(min-width: 1024px)',
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }

  it('mở menu → đúng một .shell__account-menu, aria-expanded, focus mục đầu; Escape đóng và trả focus', async () => {
    renderShell({ user: OWNER_USER }, SUBJECTS);
    await screen.findByText('nội dung trang');
    const user = userEvent.setup();

    const trigger = await screen.findByRole('button', { name: 'Tài khoản của Bà An' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelectorAll('.shell__account-menu')).toHaveLength(1);
    const menu = screen.getByRole('menu', { name: 'Tài khoản' });
    expect(within(menu).getAllByRole('menuitem').length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(within(menu).getByRole('menuitem', { name: 'Tài khoản' })).toHaveFocus(),
    );

    await user.keyboard('{Escape}');
    expect(document.querySelector('.shell__account-menu')).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('bấm ra ngoài đóng menu', async () => {
    renderShell({ user: OWNER_USER }, SUBJECTS);
    await screen.findByText('nội dung trang');
    const user = userEvent.setup();

    await openAccountMenu(user);
    expect(document.querySelector('.shell__account-menu')).not.toBeNull();

    await user.click(document.body);
    expect(document.querySelector('.shell__account-menu')).toBeNull();
  });

  it('mũi tên/Home/End di chuyển focus trong menu', async () => {
    renderShell({ user: OWNER_USER }, SUBJECTS);
    await screen.findByText('nội dung trang');
    const user = userEvent.setup();

    await openAccountMenu(user);
    const menu = accountMenu();
    const account = within(menu).getByRole('menuitem', { name: 'Tài khoản' });
    const largeText = within(menu).getByRole('button', { name: 'Bật chữ lớn' });
    const logout = within(menu).getByRole('menuitem', { name: 'Đăng xuất' });

    await waitFor(() => expect(account).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(largeText).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(account).toHaveFocus();
    await user.keyboard('{End}');
    expect(logout).toHaveFocus();
    await user.keyboard('{Home}');
    expect(account).toHaveFocus();
  });

  it('desktop ≥1024px → menu nằm trong sidebar, bottom-nav không có bản thứ hai', async () => {
    desktopMatchMedia();
    renderShell({ user: OWNER_USER }, SUBJECTS);
    await screen.findByText('nội dung trang');
    const user = userEvent.setup();

    await openAccountMenu(user);

    expect(document.querySelector('.shell__sidebar .shell__account-menu')).not.toBeNull();
    expect(document.querySelector('.shell__bottomnav .shell__account')).toBeNull();
    expect(document.querySelectorAll('.shell__account')).toHaveLength(1);
    expect(document.querySelectorAll('.shell__account-menu')).toHaveLength(1);
  });

  it('đổi trang → menu đóng, không dính lại trên màn mới', async () => {
    renderShell({ user: OWNER_USER }, SUBJECTS);
    await screen.findByText('nội dung trang');
    const user = userEvent.setup();

    await openAccountMenu(user);
    await user.click(within(accountMenu()).getByRole('menuitem', { name: 'Tài khoản' }));

    expect(await screen.findByText('trang tài khoản')).toBeInTheDocument();
    expect(document.querySelector('.shell__account-menu')).toBeNull();
  });

  it('Aa chữ lớn nằm trong menu, không phải nút trần ở sidebar/topbar', async () => {
    renderShell({ user: OWNER_USER }, SUBJECTS);
    await screen.findByText('nội dung trang');
    const user = userEvent.setup();

    expect(document.querySelector('.shell__sidebar > .text-size-toggle')).toBeNull();
    expect(document.querySelector('.shell__topbar > .text-size-toggle')).toBeNull();

    await openAccountMenu(user);
    const menu = accountMenu();
    const toggle = within(menu).getByRole('button', { name: 'Bật chữ lớn' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);
    expect(document.documentElement).toHaveAttribute('data-text-size', 'large');
    expect(within(menu).getByRole('button', { name: 'Tắt chữ lớn' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

// F15 — đăng xuất phải hỏi lại, không kết thúc phiên từ một chạm.
describe('AppShell — đăng xuất hỏi lại', () => {
  function logoutCalls(fetchMock: ReturnType<typeof stubFetch>) {
    return fetchMock.mock.calls.filter(([input]) => String(input).includes('/auth/logout'));
  }

  it('lần bấm đầu chỉ hỏi lại; Hủy giữ phiên và trả focus; xác nhận mới gọi API', async () => {
    const { fetchMock } = renderShell({ user: OWNER_USER }, SUBJECTS);
    await screen.findByText('nội dung trang');
    const user = userEvent.setup();

    await openAccountMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
    expect(screen.getByText('Đăng xuất khỏi tài khoản?')).toBeInTheDocument();
    expect(logoutCalls(fetchMock)).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByText('Đăng xuất khỏi tài khoản?')).not.toBeInTheDocument();
    expect(logoutCalls(fetchMock)).toHaveLength(0);
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Đăng xuất' })).toHaveFocus(),
    );

    await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
    const group = screen.getByRole('group', { name: 'Xác nhận đăng xuất' });
    await user.click(within(group).getByRole('button', { name: 'Đăng xuất' }));

    await waitFor(() => expect(logoutCalls(fetchMock).length).toBeGreaterThan(0));
  });
});

// P1-1 (review UX v2) — đổi pathname trong /app phải đưa người dùng về đầu nội
// dung, nhưng không phá back/forward và không cuộn khi chỉ đổi query param.
describe('AppShell — điều hướng đưa về đầu nội dung', () => {
  it('đổi pathname → cuộn lên đầu và focus main để trình đọc màn hình đọc từ đầu', async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    renderShell({ user: OWNER_USER }, SUBJECTS);
    const user = userEvent.setup();
    await screen.findByText('nội dung trang');

    await user.click(screen.getAllByRole('link', { name: 'Cảnh báo' })[0]!);

    expect(await screen.findByText('trang cảnh báo')).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('chỉ đổi query param cùng trang → không cuộn, không đổi focus', async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    renderShell({ user: OWNER_USER }, SUBJECTS);
    const user = userEvent.setup();
    await screen.findByText('nội dung trang');

    await user.click(screen.getByRole('link', { name: 'đổi tham số' }));

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'đổi tham số' })).toHaveAttribute(
        'href',
        '/app?tab=2',
      ),
    );
    expect(scrollTo).not.toHaveBeenCalled();
    expect(screen.getByRole('main')).not.toHaveFocus();
  });

  it('back/forward (POP) không bị ép cuộn lại đầu trang', async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    stubFetch((url) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: OWNER_USER });
      if (u.endsWith('/subjects')) return mockResponse({ items: SUBJECTS });
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const router = createMemoryRouter(
      [
        {
          path: '/app',
          element: <AppShell />,
          children: [
            { index: true, element: <p>nội dung trang</p> },
            { path: 'history', element: <p>trang lịch sử</p> },
          ],
        },
      ],
      { initialEntries: ['/app', '/app/history'], initialIndex: 1 },
    );
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('trang lịch sử')).toBeInTheDocument();
    await router.navigate(-1);

    expect(await screen.findByText('nội dung trang')).toBeInTheDocument();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

// P1-5 (review UX v2) — câu giới hạn cảnh báo phải có ở mọi breakpoint
// nhưng không lặp nhãn "Bản demo · dữ liệu mô phỏng" toàn trang (v3).
// F12 v4-fix: chỉ giữ một nơi ở màn Cảnh báo; khung không lặp ở sidebar/mobile.
describe('AppShell — không lặp câu giới hạn cảnh báo', () => {
  it('khung không lặp câu giới hạn cảnh báo và không có nhãn demo', async () => {
    renderShell({ user: OWNER_USER }, SUBJECTS);
    await screen.findByText('nội dung trang');

    expect(screen.queryByText(/bản demo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dữ liệu mô phỏng/i)).not.toBeInTheDocument();
    // Màn Cảnh báo (AlertsPage) là nơi duy nhất còn câu này.
    expect(
      screen.queryAllByText('Cảnh báo chỉ cập nhật khi ứng dụng đang mở.'),
    ).toHaveLength(0);
  });
});

// v6 — brand trung tính, bỏ card “Hồ sơ đang xem” khỏi mọi trang.
describe('AppShell — brand trung tính, bỏ bộ chọn hồ sơ khỏi khung', () => {
  it('brand “Theo dõi sức khỏe” dẫn /app, không còn “An Nhiên” trong khung', async () => {
    renderShell({ user: OWNER_USER }, SUBJECTS);
    await screen.findByText('nội dung trang');

    const brands = screen.getAllByRole('link', { name: 'Theo dõi sức khỏe' });
    expect(brands).toHaveLength(2);
    for (const brand of brands) {
      expect(brand).toHaveAttribute('href', '/app');
    }
    expect(screen.queryByText('An Nhiên')).not.toBeInTheDocument();
  });

  it('không còn card “Hồ sơ đang xem” (SubjectSwitcher) trên khung', async () => {
    renderShell({ user: OWNER_USER }, SUBJECTS);
    await screen.findByText('nội dung trang');

    expect(document.querySelector('.subject-switcher')).toBeNull();
    expect(screen.queryByText(/hồ sơ đang xem/i)).not.toBeInTheDocument();
  });
});

// P1-4 (product gaps v2) — tín hiệu thông báo toàn tài khoản vẫn còn banner;
// thông báo đã gộp vào Cảnh báo nên không còn mục nav/menu riêng.
describe('AppShell — thông báo gộp vào Cảnh báo', () => {
  beforeEach(resetFakeEventSource);

  it('không còn mục Thông báo trong nav hay menu tài khoản', async () => {
    renderShell({ user: OWNER_USER }, SUBJECTS, {
      notifications: { items: [notification()], unreadCount: 1 },
    });
    await screen.findByText('nội dung trang');
    const user = userEvent.setup();

    expect(screen.queryByRole('link', { name: 'Thông báo' })).not.toBeInTheDocument();
    await openAccountMenu(user);
    expect(
      within(accountMenu()).queryByRole('menuitem', { name: /Thông báo/ }),
    ).not.toBeInTheDocument();
  });

  it('thông báo mới khi ở trang khác → banner role=status, không chi tiết sức khỏe, không tự điều hướng, đóng được', async () => {
    let payload: NotificationPayload = { items: [], unreadCount: 0 };
    const { queryClient } = renderShell({ user: OWNER_USER }, SUBJECTS, {
      notifications: () => payload,
    });
    await screen.findByText('nội dung trang');
    await waitFor(() => expect(queryClient.getQueryData(['notifications'])).toBeDefined());

    payload = { items: [notification()], unreadCount: 1 };
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['notifications'] });
    });

    const text = await screen.findByText(/Có thông báo mới cho hồ sơ/);
    const banner = text.closest('[role="status"]');
    expect(banner).not.toBeNull();
    expect(banner).toHaveTextContent('Bà Năm');
    // Không đưa loại cảnh báo/chi tiết sức khỏe vào banner.
    expect(banner).not.toHaveTextContent(/sos|té ngã|nhịp tim|spo2|huyết áp/i);
    // Không tự điều hướng.
    expect(screen.getByText('nội dung trang')).toBeInTheDocument();
    expect(screen.queryByText('trang cảnh báo')).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Đóng thông báo mới' }));
    await waitFor(() =>
      expect(screen.queryByText(/Có thông báo mới cho hồ sơ/)).not.toBeInTheDocument(),
    );

    // Tải lại cùng dữ liệu → không bật banner lặp vô hạn cho một thông báo.
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['notifications'] });
    });
    expect(screen.queryByText(/Có thông báo mới cho hồ sơ/)).not.toBeInTheDocument();
  });

  it('bấm “Xem thông báo” → mở Cảnh báo, banner biến mất', async () => {
    let payload: NotificationPayload = { items: [], unreadCount: 0 };
    const { queryClient } = renderShell({ user: OWNER_USER }, SUBJECTS, {
      notifications: () => payload,
    });
    await screen.findByText('nội dung trang');
    await waitFor(() => expect(queryClient.getQueryData(['notifications'])).toBeDefined());

    payload = { items: [notification()], unreadCount: 1 };
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['notifications'] });
    });
    const user = userEvent.setup();
    const link = await screen.findByRole('link', { name: 'Xem thông báo' });
    expect(link).toHaveAttribute('href', '/app/alerts');
    await user.click(link);

    expect(await screen.findByText('trang cảnh báo')).toBeInTheDocument();
    expect(screen.queryByText(/Có thông báo mới cho hồ sơ/)).not.toBeInTheDocument();
  });

  it('SSE notification.sent → banner cập nhật ngay, không chờ 20 giây', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    let payload: NotificationPayload = { items: [], unreadCount: 0 };
    const { queryClient } = renderShell({ user: OWNER_USER }, SUBJECTS, {
      notifications: () => payload,
    });
    await screen.findByText('nội dung trang');
    await waitFor(() => expect(queryClient.getQueryData(['notifications'])).toBeDefined());
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));

    payload = { items: [notification()], unreadCount: 1 };
    act(() => FakeEventSource.instances[0]!.emit('notification.sent', { revision: 1 }, '7'));

    expect(await screen.findByText(/Có thông báo mới cho hồ sơ/)).toBeInTheDocument();
  });

  it('mất SSE → banner “Mất cập nhật trực tiếp — đang thử lại”; nối lại → ẩn', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    renderShell({ user: OWNER_USER }, SUBJECTS);
    await screen.findByText('nội dung trang');
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));

    act(() => FakeEventSource.instances[0]!.onerror?.());
    expect(
      await screen.findByText(/Mất cập nhật trực tiếp — đang thử lại/),
    ).toBeInTheDocument();

    // Backoff 1 giây mở kết nối mới; banner phải còn cho tới khi kết nối mở.
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(1), {
      timeout: 3000,
    });
    expect(screen.getByText(/Mất cập nhật trực tiếp — đang thử lại/)).toBeInTheDocument();

    act(() => FakeEventSource.instances[1]!.onopen?.());
    await waitFor(() =>
      expect(
        screen.queryByText(/Mất cập nhật trực tiếp — đang thử lại/),
      ).not.toBeInTheDocument(),
    );
  });
});

// Motion v2 — nội dung route mới fade + dịch lên khi đổi pathname; phản hồi
// khi bấm nút/link; banner thông báo mới trượt vào; tôn trọng giảm chuyển động.
describe('AppShell — chuyển động nhẹ, có mục đích', () => {
  it('lần tải đầu không chạy hiệu ứng; đổi pathname → phần tử route mới có lớp enter', async () => {
    renderShell({ user: OWNER_USER }, SUBJECTS);
    const user = userEvent.setup();
    await screen.findByText('nội dung trang');

    // Lần tải đầu: có phần tử bọc nội dung nhưng chưa có lớp animation.
    const first = document.querySelector<HTMLElement>('.shell__route');
    expect(first).not.toBeNull();
    expect(first).not.toHaveClass('shell__route--enter');

    await user.click(screen.getAllByRole('link', { name: 'Cảnh báo' })[0]!);
    expect(await screen.findByText('trang cảnh báo')).toBeInTheDocument();

    // Đổi pathname → phần tử mới (key mới) mang lớp animation.
    const next = document.querySelector<HTMLElement>('.shell__route');
    expect(next).not.toBeNull();
    expect(next).not.toBe(first);
    expect(next).toHaveClass('shell__route');
    expect(next).toHaveClass('shell__route--enter');
    expect(next).toContainElement(screen.getByText('trang cảnh báo'));

    // Hiệu ứng chỉ bọc nội dung trang; nav nằm ngoài nên không bị che/mờ.
    expect(document.querySelector('.shell__route .shell__sidebar')).toBeNull();
    expect(document.querySelector('.shell__route .shell__bottomnav')).toBeNull();
    expect(document.querySelector('.shell__sidebar .shell__route')).toBeNull();
    expect(document.querySelector('.shell__bottomnav .shell__route')).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Hôm nay' }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole('link', { name: 'Cảnh báo' }).length).toBeGreaterThanOrEqual(2);
  });

  it('refetch dữ liệu và đổi query param không tạo lại phần tử route (không nháy nội dung)', async () => {
    let payload: NotificationPayload = { items: [], unreadCount: 0 };
    const { queryClient } = renderShell({ user: OWNER_USER }, SUBJECTS, {
      notifications: () => payload,
    });
    await screen.findByText('nội dung trang');
    await waitFor(() => expect(queryClient.getQueryData(['notifications'])).toBeDefined());

    const first = document.querySelector<HTMLElement>('.shell__route');
    expect(first).not.toBeNull();

    // Refetch (kể cả có thông báo mới làm banner hiện) không mount lại nội dung.
    payload = { items: [notification()], unreadCount: 1 };
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['notifications'] });
    });
    expect(document.querySelector('.shell__route')).toBe(first);
    expect(first).not.toHaveClass('shell__route--enter');

    // Đổi query param cùng trang cũng không chạy hiệu ứng chuyển trang.
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'đổi tham số' }));
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'đổi tham số' })).toHaveAttribute(
        'href',
        '/app?tab=2',
      ),
    );
    expect(document.querySelector('.shell__route')).toBe(first);
    expect(first).not.toHaveClass('shell__route--enter');
  });

  it('CSS: @media (prefers-reduced-motion: reduce) tắt animation mới', () => {
    const tokens = mediaBlocks(readStyle('tokens.css'), '(prefers-reduced-motion: reduce)').join(
      '\n',
    );
    // Global hiện có: mọi animation/transition về 0.01ms, chạy đúng một lần.
    expect(tokens).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(tokens).toMatch(/animation-iteration-count:\s*1\s*!important/);

    const layout = mediaBlocks(readStyle('layout.css'), '(prefers-reduced-motion: reduce)').join(
      '\n',
    );
    // Khối riêng cho thành phần mới: tắt hẳn thay vì rút ngắn.
    expect(layout).toContain('.shell__route--enter');
    expect(layout).toContain('.shell__banner--notice');
    expect(layout).toContain('.shell__account-trigger');
    expect(layout).toMatch(/animation:\s*none/);
  });

  it('CSS: hover của nút/link chỉ nằm trong @media (hover: hover)', () => {
    const layout = readStyle('layout.css');
    const hover = mediaBlocks(layout, '(hover: hover)').join('\n');
    for (const selector of [
      '.button:hover:not(:disabled)',
      '.shell__nav-link:hover',
      '.shell__account-trigger:hover',
      '.shell__account-item:hover',
    ]) {
      expect(hover).toContain(selector);
      // Không còn bản hover nào ngoài khối @media (hover: hover).
      expect(countOccurrences(layout, selector)).toBe(countOccurrences(hover, selector));
    }
  });
});
