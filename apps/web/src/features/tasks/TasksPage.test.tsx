import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TasksPage } from './TasksPage';
import { errorEnvelope, mockResponse, renderPage, USER } from '../../test/utils';

const TASK_ID = '3f4d5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b';
const DEVICE_ID = '4f5d6a7b-8c9d-4e0f-9a2b-3c4d5e6f7a8b';

const OPEN_TASK = {
  id: TASK_ID,
  deviceId: DEVICE_ID,
  subjectId: '1f2d3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b',
  kind: 'maintenance',
  title: 'Thay pin vòng tay',
  status: 'open',
  priority: 80,
  dueAt: '2026-11-20T09:00:00.000Z',
  notes: 'Pin còn 15%, cần thay trong tuần.',
  createdAt: '2026-11-14T08:00:00.000Z',
  closedAt: null,
  closeReason: null,
};

const OWNER_SUBJECT = {
  id: '1f2d3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b',
  ownerUserId: USER.id,
  displayName: 'Bà Năm',
  timezone: 'Asia/Ho_Chi_Minh',
  role: 'owner',
  permissions: {
    historyDays: 30,
    canReceiveAlerts: true,
    canAcknowledge: true,
    canResolve: true,
    canViewAi: false,
  },
  sharedFrom: null,
  createdAt: '2026-11-01T00:00:00.000Z',
};

const CAREGIVER_READ_ONLY = {
  ...OWNER_SUBJECT,
  ownerUserId: '9f8d7a6b-5c4d-4e3f-8a9b-0c1d2e3f4a5b',
  role: 'caregiver',
  permissions: { ...OWNER_SUBJECT.permissions, canReceiveAlerts: true },
};

// Wave 4 — công việc: lọc open/closed, đóng cần lý do, 409, caregiver chỉ xem.
describe('TasksPage', () => {
  it('danh sách rỗng + chuyển bộ lọc open/closed gọi đúng query', async () => {
    const listUrls: string[] = [];
    renderPage(<TasksPage />, (url) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: USER });
      if (u.endsWith('/subjects')) return mockResponse({ items: [OWNER_SUBJECT] });
      if (u.includes('/maintenance-tasks')) {
        listUrls.push(u);
        return mockResponse({ items: [], nextCursor: null });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    expect(await screen.findByText('Không có công việc đang mở')).toBeInTheDocument();
    expect(listUrls[0]).toContain('status=open');

    await user.click(screen.getByRole('button', { name: 'Đã đóng' }));
    expect(await screen.findByText('Không có công việc đã đóng')).toBeInTheDocument();
    expect(listUrls.at(-1)).toContain('status=closed');
  });

  it('đóng thiếu lý do → lỗi field, không gọi API; có lý do → gửi đúng body', async () => {
    const closeBodies: unknown[] = [];
    renderPage(<TasksPage />, (url, init) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: USER });
      if (u.endsWith('/subjects')) return mockResponse({ items: [OWNER_SUBJECT] });
      if (u.includes('/close')) {
        closeBodies.push(init?.body ? JSON.parse(String(init.body)) : null);
        return mockResponse({ ...OPEN_TASK, status: 'done', closedAt: '2026-11-14T12:00:00.000Z' });
      }
      if (u.includes('/maintenance-tasks')) return mockResponse({ items: [OPEN_TASK], nextCursor: null });
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    expect(await screen.findByText('Thay pin vòng tay')).toBeInTheDocument();
    expect(screen.getByText('Ưu tiên 80/100', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Pin còn 15%/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Đóng công việc' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận đóng' }));

    expect(await screen.findByText('Vui lòng nhập lý do đóng công việc.')).toBeInTheDocument();
    expect(closeBodies).toHaveLength(0);

    await user.type(screen.getByLabelText(/Lý do đóng/), 'Đã thay pin và kiểm tra lại thiết bị.');
    await user.click(screen.getByRole('button', { name: 'Xác nhận đóng' }));

    await waitFor(() => expect(closeBodies).toHaveLength(1));
    expect(closeBodies[0]).toEqual({ reason: 'Đã thay pin và kiểm tra lại thiết bị.' });
    expect(await screen.findByText(/Đã đóng công việc/)).toBeInTheDocument();
  });

  it('caregiver chỉ xem — không có nút đóng', async () => {
    renderPage(<TasksPage />, (url) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: USER });
      if (u.endsWith('/subjects')) return mockResponse({ items: [CAREGIVER_READ_ONLY] });
      if (u.includes('/maintenance-tasks')) return mockResponse({ items: [OPEN_TASK], nextCursor: null });
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByText('Thay pin vòng tay')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đóng công việc' })).not.toBeInTheDocument();
    expect(screen.getByText('Chỉ xem')).toBeInTheDocument();
  });

  it('409 khi đóng → thông báo đã thay đổi + nút tải lại, không tự gửi lại', async () => {
    let closeCalls = 0;
    renderPage(<TasksPage />, (url) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: USER });
      if (u.endsWith('/subjects')) return mockResponse({ items: [OWNER_SUBJECT] });
      if (u.includes('/close')) {
        closeCalls += 1;
        return mockResponse(errorEnvelope('Công việc đã được đóng trước đó.', 'CONFLICT'), 409);
      }
      if (u.includes('/maintenance-tasks')) return mockResponse({ items: [OPEN_TASK], nextCursor: null });
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await screen.findByText('Thay pin vòng tay');
    await user.click(screen.getByRole('button', { name: 'Đóng công việc' }));
    await user.type(screen.getByLabelText(/Lý do đóng/), 'Đã thay pin và kiểm tra lại thiết bị.');
    await user.click(screen.getByRole('button', { name: 'Xác nhận đóng' }));

    expect(await screen.findByText('Công việc đã được đóng trước đó.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải lại' })).toBeInTheDocument();
    expect(closeCalls).toBe(1);
  });
});
