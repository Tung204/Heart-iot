import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
            <Route index element={<p>nội dung trang</p>} />
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

  it('caregiver không có canViewAi/canReceiveAlerts → không có menu phụ "Thêm"', async () => {
    renderShell({ user: OWNER_USER }, CAREGIVER_ONLY);

    await screen.findByText('nội dung trang');
    expect(screen.queryByRole('button', { name: 'Thêm' })).not.toBeInTheDocument();
  });
});
