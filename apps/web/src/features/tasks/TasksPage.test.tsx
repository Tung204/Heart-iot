import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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

const DEVICE = {
  deviceId: DEVICE_ID,
  subjectId: OWNER_SUBJECT.id,
  serial: 'SN-001',
  label: 'Vòng tay',
  online: true,
  lastSeenAt: '2026-11-14T09:00:00.000Z',
  freshness: 'live',
  lastHeartRateBpm: 72,
  lastHeartRateQuality: 'valid',
  lastMeasuredAt: '2026-11-14T08:59:45.000Z',
  batteryPercent: 85,
  firmwareVersion: '0.9.0',
  clockStatus: 'synced',
};

const SECOND_SUBJECT = {
  ...OWNER_SUBJECT,
  id: '2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d',
  displayName: 'Ông Bình',
};

const SECOND_DEVICE = {
  ...DEVICE,
  deviceId: '3b4c5d6e-7f8a-4b9c-8d0e-1f2a3b4c5d6e',
  subjectId: SECOND_SUBJECT.id,
  serial: 'SN-002',
  label: 'Vòng tay hai',
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
    // Ưu tiên hiển thị dạng cặp nhãn/giá trị (hàng label-value cho mobile).
    expect(screen.getByText('Ưu tiên')).toBeInTheDocument();
    expect(screen.getByText('80/100')).toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: 'Tạo việc' })).not.toBeInTheDocument();
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

// V2 — chủ hồ sơ tạo việc bảo trì cho thiết bị đang gắn.
describe('TasksPage — tạo việc bảo trì', () => {
  function baseHandler(overrides: {
    subjects?: unknown[];
    devices?: unknown[] | 'error';
    onCreate?: (body: unknown) => Response | Promise<Response>;
  }) {
    return (url: string, init?: RequestInit) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: USER });
      if (u.endsWith('/subjects')) {
        return mockResponse({ items: overrides.subjects ?? [OWNER_SUBJECT] });
      }
      if (u.includes('/devices')) {
        if (overrides.devices === 'error') {
          return mockResponse(errorEnvelope('Máy chủ lỗi.', 'INTERNAL'), 500);
        }
        return mockResponse({ items: overrides.devices ?? [DEVICE] });
      }
      if (u.endsWith('/maintenance-tasks') && init?.method === 'POST') {
        if (overrides.onCreate) return overrides.onCreate(init.body ? JSON.parse(String(init.body)) : null);
        return mockResponse({ ...OPEN_TASK, title: 'Việc mới' }, 201);
      }
      if (u.includes('/maintenance-tasks')) return mockResponse({ items: [], nextCursor: null });
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    };
  }

  async function openCreateForm() {
    const user = userEvent.setup();
    const trigger = await screen.findByRole('button', { name: 'Tạo việc' });
    await user.click(trigger);
    await screen.findByLabelText(/^Tiêu đề/);
    return { user, trigger };
  }

  it('owner thấy nút, mở/đóng form: label đủ, focus vào tiêu đề và trả về nút', async () => {
    const deviceUrls: string[] = [];
    renderPage(<TasksPage />, (url) => {
      if (url.includes('/devices')) deviceUrls.push(url);
      return baseHandler({})(url);
    });
    const { user, trigger } = await openCreateForm();

    await waitFor(() => expect(screen.getByLabelText(/^Tiêu đề/)).toHaveFocus());
    expect(screen.getByLabelText(/^Loại việc/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Thiết bị/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Ưu tiên \(0–100\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Hạn xử lý/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Ghi chú/)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Kiểm tra pin' })).toBeInTheDocument();
    expect(deviceUrls.some((u) => u.includes(`/subjects/${OWNER_SUBJECT.id}/devices`))).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByLabelText(/^Tiêu đề/)).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('hồ sơ chưa gắn thiết bị → hint rõ và disable submit', async () => {
    renderPage(<TasksPage />, baseHandler({ devices: [] }));
    await openCreateForm();

    expect(await screen.findByText('Hồ sơ chưa gắn thiết bị')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo việc' })).toBeDisabled();
  });

  it('nhiều hồ sơ: đổi hồ sơ thì tải lại thiết bị đang gắn của hồ sơ mới', async () => {
    const deviceUrls: string[] = [];
    renderPage(<TasksPage />, (url) => {
      if (url.includes('/devices')) {
        deviceUrls.push(url);
        return mockResponse({
          items: url.includes(SECOND_SUBJECT.id) ? [SECOND_DEVICE] : [DEVICE],
        });
      }
      return baseHandler({ subjects: [OWNER_SUBJECT, SECOND_SUBJECT] })(url);
    });
    const { user } = await openCreateForm();

    await waitFor(() => expect(screen.getByLabelText(/^Thiết bị/)).toHaveValue(DEVICE.deviceId));
    await user.selectOptions(screen.getByLabelText(/^Hồ sơ/), SECOND_SUBJECT.id);

    await waitFor(() =>
      expect(deviceUrls.some((u) => u.includes(`/subjects/${SECOND_SUBJECT.id}/devices`))).toBe(
        true,
      ),
    );
    await waitFor(() =>
      expect(screen.getByLabelText(/^Thiết bị/)).toHaveValue(SECOND_DEVICE.deviceId),
    );
  });

  it('validate tại chỗ bằng contract: tiêu đề trống/ngắn không gọi API', async () => {
    const createBodies: unknown[] = [];
    renderPage(
      <TasksPage />,
      baseHandler({
        onCreate: (body) => {
          createBodies.push(body);
          return mockResponse({ ...OPEN_TASK, title: String((body as { title?: string }).title ?? '') }, 201);
        },
      }),
    );
    const { user } = await openCreateForm();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo việc' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Tạo việc' }));
    expect(await screen.findByText('Vui lòng nhập tiêu đề công việc.')).toBeInTheDocument();
    expect(createBodies).toHaveLength(0);

    await user.type(screen.getByLabelText(/^Tiêu đề/), 'Pin');
    await user.click(screen.getByRole('button', { name: 'Tạo việc' }));
    expect(await screen.findByText('Tiêu đề quá ngắn (tối thiểu 4 ký tự).')).toBeInTheDocument();
    expect(createBodies).toHaveLength(0);
  });

  it('submit thành công: gửi đúng body, đóng form, thông báo và invalidate danh sách', async () => {
    const createBodies: unknown[] = [];
    let listCalls = 0;
    renderPage(<TasksPage />, (url, init) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: USER });
      if (u.endsWith('/subjects')) return mockResponse({ items: [OWNER_SUBJECT] });
      if (u.includes('/devices')) return mockResponse({ items: [DEVICE] });
      if (u.endsWith('/maintenance-tasks') && init?.method === 'POST') {
        const body = init.body ? JSON.parse(String(init.body)) : null;
        createBodies.push(body);
        return mockResponse({ ...OPEN_TASK, title: body.title }, 201);
      }
      if (u.includes('/maintenance-tasks')) {
        listCalls += 1;
        return mockResponse({ items: [], nextCursor: null });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const { user } = await openCreateForm();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo việc' })).toBeEnabled());
    const callsBeforeSubmit = listCalls;

    await user.type(screen.getByLabelText(/^Tiêu đề/), 'Kiểm tra pin tháng 11');
    await user.click(screen.getByRole('button', { name: 'Tạo việc' }));

    await waitFor(() => expect(createBodies).toHaveLength(1));
    expect(createBodies[0]).toEqual({
      subjectId: OWNER_SUBJECT.id,
      deviceId: DEVICE_ID,
      kind: 'maintenance',
      title: 'Kiểm tra pin tháng 11',
      priority: 50,
      notes: '',
    });
    expect(await screen.findByText(/Đã tạo công việc "Kiểm tra pin tháng 11"/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Tiêu đề/)).not.toBeInTheDocument();
    await waitFor(() => expect(listCalls).toBeGreaterThan(callsBeforeSubmit));
  });

  it('lỗi server 400/403 hiển thị thân thiện và giữ dữ liệu form', async () => {
    const statuses = [400, 403];
    let createCalls = 0;
    renderPage(
      <TasksPage />,
      baseHandler({
        onCreate: () => {
          const status = statuses[createCalls] ?? 500;
          createCalls += 1;
          if (status === 400) {
            return mockResponse(
              errorEnvelope('Thiết bị chưa được gắn với hồ sơ này.', 'VALIDATION_FAILED'),
              400,
            );
          }
          return mockResponse(errorEnvelope('Bị cấm.', 'FORBIDDEN'), 403);
        },
      }),
    );
    const { user } = await openCreateForm();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo việc' })).toBeEnabled());
    await user.type(screen.getByLabelText(/^Tiêu đề/), 'Kiểm tra pin');

    await user.click(screen.getByRole('button', { name: 'Tạo việc' }));
    expect(await screen.findByText('Thiết bị chưa được gắn với hồ sơ này.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Tiêu đề/)).toHaveValue('Kiểm tra pin');

    await user.click(screen.getByRole('button', { name: 'Tạo việc' }));
    expect(
      await screen.findByText(
        'Bạn không có quyền tạo việc cho hồ sơ này. Chỉ chủ hồ sơ mới có thể tạo.',
      ),
    ).toBeInTheDocument();
    expect(createCalls).toBe(2);
    expect(screen.getByLabelText(/^Tiêu đề/)).toHaveValue('Kiểm tra pin');
  });
});

// W2 lane R — lối vào theo ngữ cảnh, phạm vi account-wide, task không hồ sơ.
describe('TasksPage — phạm vi và lối vào theo ngữ cảnh', () => {
  function baseListHandler(items: unknown[], me: unknown = USER) {
    return (url: string, init?: RequestInit) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: me });
      if (u.endsWith('/subjects')) return mockResponse({ items: [OWNER_SUBJECT] });
      if (u.includes('/devices')) return mockResponse({ items: [DEVICE] });
      if (u.endsWith('/maintenance-tasks') && init?.method === 'POST') {
        return mockResponse({ ...OPEN_TASK, title: 'Việc mới' }, 201);
      }
      if (u.includes('/maintenance-tasks')) return mockResponse({ items, nextCursor: null });
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    };
  }

  it('H1 Công việc bảo trì + dòng phạm vi “Tất cả hồ sơ có quyền” + lối về Người thân', async () => {
    renderPage(<TasksPage />, baseListHandler([]));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Công việc bảo trì' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Tất cả hồ sơ có quyền')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Người thân' })).toHaveAttribute(
      'href',
      '/app/subjects',
    );
  });

  it('task không gắn hồ sơ được tách nhóm riêng và admin đóng được', async () => {
    const technicalTask = { ...OPEN_TASK, id: '5f6d7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b', subjectId: null, title: 'Kiểm tra gateway' };
    renderPage(
      <TasksPage />,
      baseListHandler([OPEN_TASK, technicalTask], { ...USER, role: 'admin' }),
    );

    expect(await screen.findByText('Thay pin vòng tay')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Việc kỹ thuật không gắn hồ sơ' }),
    ).toBeInTheDocument();
    const technicalList = screen.getByRole('list', {
      name: 'Việc kỹ thuật không gắn hồ sơ',
    });
    expect(within(technicalList).getByText('Kiểm tra gateway')).toBeInTheDocument();
    expect(within(technicalList).getByText('Việc kỹ thuật không gắn hồ sơ', { selector: 'dd' })).toBeInTheDocument();
    expect(
      within(technicalList).getByRole('button', { name: 'Đóng công việc' }),
    ).toBeInTheDocument();
  });

  it('hồ sơ chưa gắn thiết bị → có đường Gắn thiết bị tới /app/devices', async () => {
    renderPage(<TasksPage />, (url) => {
      if (url.endsWith('/me')) return mockResponse({ user: USER });
      if (url.endsWith('/subjects')) return mockResponse({ items: [OWNER_SUBJECT] });
      if (url.includes('/devices')) return mockResponse({ items: [] });
      if (url.includes('/maintenance-tasks')) return mockResponse({ items: [], nextCursor: null });
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tạo việc' }));

    expect(await screen.findByText('Hồ sơ chưa gắn thiết bị')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gắn thiết bị' })).toHaveAttribute(
      'href',
      '/app/devices',
    );
  });

  it('Escape huỷ xác nhận đóng, không gửi API và focus trả về nút đóng', async () => {
    let closeCalls = 0;
    renderPage(<TasksPage />, (url) => {
      if (url.endsWith('/me')) return mockResponse({ user: USER });
      if (url.endsWith('/subjects')) return mockResponse({ items: [OWNER_SUBJECT] });
      if (url.includes('/close')) {
        closeCalls += 1;
        return mockResponse({});
      }
      if (url.includes('/maintenance-tasks')) {
        return mockResponse({ items: [OPEN_TASK], nextCursor: null });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    const trigger = await screen.findByRole('button', { name: 'Đóng công việc' });
    await user.click(trigger);
    await screen.findByLabelText(/Lý do đóng/);
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByLabelText(/Lý do đóng/)).not.toBeInTheDocument());
    expect(closeCalls).toBe(0);
    // Nút được mount lại sau khi huỷ; focus phải trở về đúng hành động đó.
    expect(screen.getByRole('button', { name: 'Đóng công việc' })).toHaveFocus();
  });
});
