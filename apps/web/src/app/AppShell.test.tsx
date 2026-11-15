import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
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
import { errorEnvelope, mockResponse, stubFetch } from '../test/utils';

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

/** Thông báo mẫu đúng hợp đồng @annhien/contracts/notifications. */
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

interface NotificationPayload {
  items: ReturnType<typeof notification>[];
  unreadCount: number;
}

interface ShellOptions {
  /** Payload `/notifications`; dùng hàm để đổi dữ liệu giữa các lần refetch. */
  notifications?: NotificationPayload | (() => NotificationPayload);
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
    return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app']}>
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
            <Route path="history" element={<p>trang lịch sử</p>} />
            <Route path="notifications" element={<p>trang thông báo</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { queryClient, fetchMock };
}

async function openMoreMenu(user: ReturnType<typeof userEvent.setup>) {
  const toggles = await screen.findAllByRole('button', { name: 'Thêm' });
  await user.click(toggles[0]!);
}

// Wave 4 — nav ẩn/hiện theo role và quyền hồ sơ (menu phụ "Thêm").
describe('AppShell — menu điều hướng theo quyền', () => {
  it('admin → menu phụ có Trợ lý, Công việc, Studio, Quản trị', async () => {
    renderShell({ user: ADMIN }, SUBJECTS);
    const user = userEvent.setup();

    await screen.findByText('nội dung trang');
    await openMoreMenu(user);

    expect(screen.getAllByRole('link', { name: 'Quản trị' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Trợ lý' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Công việc' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Studio' }).length).toBeGreaterThan(0);
  });

  it('chủ hồ sơ → có Trợ lý, Công việc, Studio nhưng KHÔNG có Quản trị', async () => {
    renderShell({ user: OWNER_USER }, SUBJECTS);
    const user = userEvent.setup();

    await screen.findByText('nội dung trang');
    await openMoreMenu(user);

    expect(screen.getAllByRole('link', { name: 'Trợ lý' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Công việc' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Studio' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Quản trị' })).not.toBeInTheDocument();
  });

  it('caregiver không có canViewAi/canReceiveAlerts → menu Thêm chỉ còn Thiết bị/Thông báo', async () => {
    renderShell({ user: OWNER_USER }, CAREGIVER_ONLY);
    const user = userEvent.setup();

    await screen.findByText('nội dung trang');
    await openMoreMenu(user);

    expect(screen.getAllByRole('link', { name: 'Thiết bị' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Thông báo' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Trợ lý' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Công việc' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Studio' })).not.toBeInTheDocument();
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

    await user.click(screen.getAllByRole('link', { name: 'Lịch sử' })[0]!);

    expect(await screen.findByText('trang lịch sử')).toBeInTheDocument();
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

// P1-5 (review UX v2) — nhãn "dữ liệu mô phỏng" và giới hạn cảnh báo phải có
// ở mọi breakpoint: sidebar (desktop), topbar + cuối nội dung (mobile).
describe('AppShell — nhãn demo và giới hạn cảnh báo', () => {
  it('luôn có nhãn mô phỏng và câu giới hạn cảnh báo cho mobile lẫn desktop', async () => {
    renderShell({ user: OWNER_USER }, SUBJECTS);
    await screen.findByText('nội dung trang');

    expect(screen.getAllByText('Bản demo · dữ liệu mô phỏng').length).toBeGreaterThan(0);

    const safetyNotes = screen.getAllByText(/Cảnh báo chỉ hiển thị khi trang đang mở/);
    expect(safetyNotes.length).toBeGreaterThanOrEqual(2);
    // Một bản nằm trong sidebar (desktop), một bản nằm cuối nội dung (mobile).
    expect(safetyNotes.some((note) => note.className.includes('shell__safety-note'))).toBe(true);
    expect(safetyNotes.some((note) => note.className.includes('shell__mobile-safety-note'))).toBe(
      true,
    );
  });
});

// P1-4 (product gaps v2) — tín hiệu thông báo toàn tài khoản: badge số chưa đọc
// và banner khi thông báo mới tới lúc đang ở trang khác.
describe('AppShell — badge thông báo chưa đọc', () => {
  beforeEach(resetFakeEventSource);

  it('2 chưa đọc → badge ở sidebar và bottom-nav, tên đầy đủ cho trình đọc màn hình', async () => {
    const items = [
      notification(),
      notification({
        id: '6f7d8a9b-0c1d-4e2f-8a3b-4c5d6e7f8a9b',
        createdAt: '2026-11-15T03:00:00.000Z',
      }),
    ];
    renderShell({ user: OWNER_USER }, SUBJECTS, { notifications: { items, unreadCount: 2 } });
    await screen.findByText('nội dung trang');

    const links = await screen.findAllByRole('link', { name: /2 thông báo chưa đọc/ });
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) {
      expect(link).toHaveAccessibleName(/Thông báo/);
      expect(link).toHaveTextContent('2 thông báo chưa đọc');
      expect(link.querySelector('.shell__nav-badge')).not.toBeNull();
    }

    // Cả hai bản nav (desktop sidebar + mobile bottom-nav) đều có badge.
    expect(
      document.querySelector('.shell__sidebar a[href="/app/notifications"] .shell__nav-badge'),
    ).not.toBeNull();
    expect(
      document.querySelector('.shell__bottomnav a[href="/app/notifications"] .shell__nav-badge'),
    ).not.toBeNull();
    // Nút “Thêm” đang đóng vẫn có chấm báo để không mất tín hiệu trên mobile.
    expect(document.querySelector('.shell__more-toggle .shell__more-dot')).not.toBeNull();
  });

  it('0 chưa đọc → không có badge nhưng vẫn giữ liên kết Thông báo', async () => {
    renderShell({ user: OWNER_USER }, SUBJECTS, {
      notifications: {
        items: [notification({ readAt: '2026-11-15T04:00:00.000Z' })],
        unreadCount: 0,
      },
    });
    await screen.findByText('nội dung trang');

    expect((await screen.findAllByRole('link', { name: 'Thông báo' })).length).toBeGreaterThanOrEqual(
      2,
    );
    expect(document.querySelector('.shell__nav-badge')).toBeNull();
  });

  it('menu “Thêm” (mobile) có badge ở mục Thông báo; tên nút vẫn là “Thêm”', async () => {
    const user = userEvent.setup();
    renderShell({ user: OWNER_USER }, SUBJECTS, {
      notifications: { items: [notification()], unreadCount: 1 },
    });
    await screen.findByText('nội dung trang');

    const toggles = await screen.findAllByRole('button', { name: 'Thêm' });
    expect(toggles[0]).toHaveAccessibleName('Thêm');

    await openMoreMenu(user);
    const menuLinks = screen
      .getAllByRole('link', { name: /1 thông báo chưa đọc/ })
      .filter((link) => link.closest('.shell__more-menu'));
    expect(menuLinks.length).toBeGreaterThan(0);
  });
});

// P1-6 (UX v2) — banner thông báo mới + trạng thái mất SSE.
describe('AppShell — banner thông báo mới và mất SSE', () => {
  beforeEach(resetFakeEventSource);

  function refetchNotifications(queryClient: QueryClient) {
    return act(async () => {
      await queryClient.refetchQueries({ queryKey: ['notifications'] });
    });
  }

  /** Chờ lần tải đầu hoàn tất để hook lập mốc trước khi thêm thông báo mới. */
  async function waitForNotificationsLoaded(queryClient: QueryClient) {
    await waitFor(() => expect(queryClient.getQueryData(['notifications'])).toBeDefined());
  }

  it('thông báo mới khi ở trang khác → banner role=status, không chi tiết sức khỏe, không tự điều hướng, đóng được', async () => {
    let payload: NotificationPayload = { items: [], unreadCount: 0 };
    const { queryClient } = renderShell({ user: OWNER_USER }, SUBJECTS, {
      notifications: () => payload,
    });
    await screen.findByText('nội dung trang');
    await waitForNotificationsLoaded(queryClient);

    payload = { items: [notification()], unreadCount: 1 };
    await refetchNotifications(queryClient);

    const text = await screen.findByText(/Có thông báo mới cho hồ sơ/);
    const banner = text.closest('[role="status"]');
    expect(banner).not.toBeNull();
    expect(banner).toHaveTextContent('Bà Năm');
    // Không đưa loại cảnh báo/chi tiết sức khỏe vào banner.
    expect(banner).not.toHaveTextContent(/sos|té ngã|nhịp tim|spo2|huyết áp/i);
    // Không tự điều hướng.
    expect(screen.getByText('nội dung trang')).toBeInTheDocument();
    expect(screen.queryByText('trang thông báo')).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Đóng thông báo mới' }));
    await waitFor(() =>
      expect(screen.queryByText(/Có thông báo mới cho hồ sơ/)).not.toBeInTheDocument(),
    );

    // Tải lại cùng dữ liệu → không bật banner lặp vô hạn cho một thông báo.
    await refetchNotifications(queryClient);
    expect(screen.queryByText(/Có thông báo mới cho hồ sơ/)).not.toBeInTheDocument();
  });

  it('bấm “Xem thông báo” → mở hộp thư, banner biến mất', async () => {
    let payload: NotificationPayload = { items: [], unreadCount: 0 };
    const { queryClient } = renderShell({ user: OWNER_USER }, SUBJECTS, {
      notifications: () => payload,
    });
    await screen.findByText('nội dung trang');
    await waitForNotificationsLoaded(queryClient);

    payload = { items: [notification()], unreadCount: 1 };
    await refetchNotifications(queryClient);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('link', { name: 'Xem thông báo' }));

    expect(await screen.findByText('trang thông báo')).toBeInTheDocument();
    expect(screen.queryByText(/Có thông báo mới cho hồ sơ/)).not.toBeInTheDocument();
  });

  it('SSE notification.sent → badge và banner cập nhật ngay, không chờ 20 giây', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    let payload: NotificationPayload = { items: [], unreadCount: 0 };
    const { queryClient } = renderShell({ user: OWNER_USER }, SUBJECTS, {
      notifications: () => payload,
    });
    await screen.findByText('nội dung trang');
    await waitForNotificationsLoaded(queryClient);
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));

    payload = { items: [notification()], unreadCount: 1 };
    act(() => FakeEventSource.instances[0]!.emit('notification.sent', { revision: 1 }, '7'));

    expect(await screen.findByText(/Có thông báo mới cho hồ sơ/)).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: /1 thông báo chưa đọc/ }).length,
    ).toBeGreaterThan(0);
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
