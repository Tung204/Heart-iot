import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

function renderShell(me: unknown, subjects: unknown[]) {
  stubFetch((url) => {
    const u = url;
    if (u.endsWith('/me')) return mockResponse(me);
    if (u.endsWith('/subjects')) return mockResponse({ items: subjects });
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
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
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
