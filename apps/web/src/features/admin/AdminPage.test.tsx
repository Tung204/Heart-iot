import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { AdminPage } from './AdminPage';
import { errorEnvelope, mockResponse, renderPage, stubFetch } from '../../test/utils';
import type { FetchHandler } from '../../test/utils';

const ADMIN = {
  id: '0f1d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b',
  email: 'admin@example.com',
  displayName: 'Quản trị viên',
  role: 'admin',
  status: 'active',
  createdAt: '2026-11-01T00:00:00.000Z',
};

const PLAIN_USER = {
  ...ADMIN,
  id: '1f2d3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b',
  email: 'user@example.com',
  displayName: 'Ngọc',
  role: 'user',
};

const OVERVIEW = {
  users: { active: 12, disabled: 2 },
  subjects: { total: 5 },
  devices: { online: 7, offline: 3 },
  alerts: { open: 1 },
  tasks: { open: 4 },
  outbox: { pending: 6, failed: 0 },
};

const POLICY_VALUE = {
  heartbeatIntervalSeconds: 15,
  offlineAfterSeconds: 45,
  dataFreshAfterSeconds: 30,
  lateEventMinutes: 5,
  maxTelemetryPerMinute: 240,
};

const POLICY_STATE = {
  key: 'device_runtime',
  active: {
    version: 2,
    value: POLICY_VALUE,
    digest: 'digest-v2-abcdef',
    source: 'database',
    updatedAt: '2026-11-14T09:00:00.000Z',
    updatedBy: { id: ADMIN.id, displayName: ADMIN.displayName },
  },
  defaults: POLICY_VALUE,
  history: [
    {
      version: 2,
      status: 'active',
      digest: 'digest-v2-abcdef',
      updatedAt: '2026-11-14T09:00:00.000Z',
      updatedBy: { id: ADMIN.id, displayName: ADMIN.displayName },
    },
    {
      version: 1,
      status: 'retired',
      digest: 'digest-v1-abcdef',
      updatedAt: '2026-11-10T09:00:00.000Z',
      updatedBy: null,
    },
  ],
};

const PREVIEW_DIGEST = 'a'.repeat(64);

const POLICY_PREVIEW = {
  valid: true,
  value: { ...POLICY_VALUE, heartbeatIntervalSeconds: 20 },
  digest: PREVIEW_DIGEST,
  expectedVersion: 2,
  warnings: ['Chu kỳ gửi 20 giây làm tăng lưu lượng telemetry khoảng 33%.'],
  effectiveDiff: [{ field: 'heartbeatIntervalSeconds', from: 15, to: 20 }],
};

const POLICY_PUBLISH = {
  key: 'device_runtime',
  version: 3,
  digest: 'digest-v3-abcdef',
  status: 'active',
  publishedAt: '2026-11-14T10:00:00.000Z',
  note: 'Điều chỉnh chu kỳ gửi',
};

const ASSIGNED_SUBJECT_ID = '2f3d4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b';
const FIRST_DEVICE_ID = '3f4d5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b';
const SECOND_DEVICE_ID = '4f5d6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b';

const DEVICE_LIST = {
  items: [
    {
      id: FIRST_DEVICE_ID,
      serial: 'SN-ADMIN-001',
      label: 'Vòng tay Bà Năm',
      status: 'active',
      firmwareVersion: '1.4.2',
      lastSeenAt: new Date(Date.now() - 30_000).toISOString(),
      createdAt: '2026-11-01T00:00:00.000Z',
      assignedSubjectId: ASSIGNED_SUBJECT_ID,
    },
    {
      id: SECOND_DEVICE_ID,
      serial: 'SN-ADMIN-002',
      label: 'Thiết bị dự phòng',
      status: 'active',
      firmwareVersion: null,
      lastSeenAt: null,
      createdAt: '2026-11-02T00:00:00.000Z',
      assignedSubjectId: null,
    },
  ],
};

const CLAIM_CODE = {
  claimCode: 'ABC234567',
  expiresAt: '2026-11-15T10:15:00.000Z',
};

const ROTATED_KEY = { deviceKey: 'devkey_test_abcdefghijklmnop' };

type DeviceCall = { url: string; method: string };

/** Một bản ghi nhật ký mẫu — chỉ dùng dữ liệu tổng hợp. */
function auditEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    actorUserId: ADMIN.id,
    actorKind: 'user',
    action: 'auth.login',
    targetType: 'session',
    targetId: null,
    outcome: 'success',
    requestId: null,
    metadata: {},
    createdAt: '2026-11-14T09:30:00.000Z',
    ...overrides,
  };
}

/** Handler cho tab Nhật ký: /me + danh sách actor + audit items. */
function auditHandler(items: ReturnType<typeof auditEntry>[]): FetchHandler {
  return (url) => {
    if (url.endsWith('/me')) return mockResponse({ user: ADMIN });
    if (url.includes('/admin/users?')) return mockResponse({ items: [ADMIN], nextCursor: null });
    if (url.includes('/admin/audit')) return mockResponse({ items, nextCursor: null });
    return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
  };
}

/** Handler cho tab Thiết bị: mặc định trả danh sách + policy + mã/khóa thành công. */
function deviceHandler(options: {
  devicesResponse?: () => Response;
  claimResponse?: () => Response;
  rotateResponse?: () => Response;
  calls?: DeviceCall[];
} = {}): FetchHandler {
  return (url, init) => {
    const method = init?.method ?? 'GET';
    if (url.endsWith('/me')) return mockResponse({ user: ADMIN });
    if (url.includes('/admin/policies/device_runtime')) return mockResponse(POLICY_STATE);
    if (url.includes('/claim-code')) {
      options.calls?.push({ url, method });
      return options.claimResponse ? options.claimResponse() : mockResponse(CLAIM_CODE);
    }
    if (url.includes('/rotate-key')) {
      options.calls?.push({ url, method });
      return options.rotateResponse ? options.rotateResponse() : mockResponse(ROTATED_KEY);
    }
    if (url.includes('/admin/devices')) {
      options.calls?.push({ url, method });
      return options.devicesResponse ? options.devicesResponse() : mockResponse(DEVICE_LIST);
    }
    return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
  };
}

async function openDevicesTab() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('tab', { name: 'Thiết bị' }));
  const list = await screen.findByRole('list', { name: 'Danh sách thiết bị' });
  return { user, list, firstItem: within(list).getAllByRole('listitem')[0] as HTMLElement };
}

/** Vị trí URL hiện tại — dùng cho test deep link ?tab=...&view=... */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

/** Render /app/admin tại một URL cụ thể (kiểm tra tab/subtab lưu trong query string). */
function renderAdminAt(entry: string, handler: FetchHandler) {
  stubFetch(handler);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: '/app/admin',
        element: (
          <>
            <AdminPage />
            <LocationProbe />
          </>
        ),
      },
    ],
    { initialEntries: [entry] },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

// Wave 4 — admin: chặn non-admin, tổng quan, policy preview/publish CAS.
describe('AdminPage', () => {
  it('người dùng thường → "Không có quyền", không gọi bất kỳ API admin nào', async () => {
    const adminCalls: string[] = [];
    renderPage(<AdminPage />, (url) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: PLAIN_USER });
      if (u.includes('/admin/')) {
        adminCalls.push(u);
        return mockResponse(OVERVIEW);
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
    expect(
      screen.getByText(/Trang quản trị chỉ dành cho tài khoản quản trị viên/),
    ).toBeInTheDocument();
    expect(adminCalls).toHaveLength(0);
  });

  it('admin → tổng quan chỉ bốn số chính và khối cần chú ý', async () => {
    renderPage(<AdminPage />, (url) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes('/admin/overview')) return mockResponse(OVERVIEW);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    const kpiList = await screen.findByLabelText('Số liệu tổng quan');
    expect(within(kpiList).getByText('Người dùng hoạt động')).toBeInTheDocument();
    expect(within(kpiList).getByText('12')).toBeInTheDocument();
    expect(within(kpiList).getByText('Thiết bị trực tuyến')).toBeInTheDocument();
    expect(within(kpiList).getByText('7')).toBeInTheDocument();
    expect(within(kpiList).getByText('Cảnh báo đang mở')).toBeInTheDocument();
    expect(within(kpiList).getByText('1')).toBeInTheDocument();
    expect(within(kpiList).getByText('Thông báo lỗi')).toBeInTheDocument();
    expect(within(kpiList).getByText('0')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Cần chú ý' })).toBeInTheDocument();
    // Cần chú ý không lặp KPI khi còn tín hiệu vận hành chưa có ô riêng:
    // outbox.pending, tasks.open và thiết bị ngoại tuyến đứng trước cảnh báo.
    expect(screen.getByText('6 thông báo đang chờ gửi')).toBeInTheDocument();
    expect(screen.getByText('4 công việc đang mở')).toBeInTheDocument();
    // R01/R09: thiết bị ngoại tuyến không có ô KPI nên phải hiện, không bị cắt.
    expect(screen.getByText('3 thiết bị ngoại tuyến')).toBeInTheDocument();

    // Số chưa có ô KPI vẫn xem được trong “Chi tiết vận hành”.
    const opsDetails = screen.getByText('Chi tiết vận hành').closest('details') as HTMLElement;
    expect(opsDetails).not.toBeNull();
    expect(within(opsDetails).getByText('Hồ sơ').nextElementSibling).toHaveTextContent('5');
    expect(within(opsDetails).getByText('Người dùng đã khóa').nextElementSibling).toHaveTextContent(
      '2',
    );
    expect(within(opsDetails).getByText('Thiết bị ngoại tuyến').nextElementSibling).toHaveTextContent(
      '3',
    );

    // Bốn ô KPI vẫn chỉ bốn nhãn; số còn lại nằm gọn trong “Chi tiết vận hành”,
    // không lặp thành 9 nhóm số ở màn chính.
    expect(within(kpiList).getAllByRole('term')).toHaveLength(4);
  });

  it('tổng quan: Cần chú ý tối đa 3 dòng và ưu tiên tín hiệu chưa có KPI', async () => {
    renderPage(<AdminPage />, (url) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes('/admin/overview')) {
        return mockResponse({
          ...OVERVIEW,
          users: { active: 3, disabled: 0 },
          alerts: { open: 2 },
          devices: { online: 0, offline: 4 },
          tasks: { open: 1 },
          outbox: { pending: 5, failed: 0 },
        });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByRole('heading', { name: 'Cần chú ý' })).toBeInTheDocument();
    const list = screen.getByRole('heading', { name: 'Cần chú ý' }).parentElement?.querySelector('ul');
    expect(list).not.toBeNull();
    const lines = within(list as HTMLElement).getAllByRole('listitem');
    expect(lines).toHaveLength(3);
    expect(lines.map((line) => line.textContent)).toEqual([
      '5 thông báo đang chờ gửi',
      '1 công việc đang mở',
      '4 thiết bị ngoại tuyến',
    ]);
  });

  it('tổng quan: outbox.failed > 0 hiện dòng thông báo gửi lỗi và thiết bị ngoại tuyến vẫn có chỗ', async () => {
    renderPage(<AdminPage />, (url) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes('/admin/overview')) {
        return mockResponse({
          ...OVERVIEW,
          alerts: { open: 0 },
          tasks: { open: 0 },
          outbox: { pending: 0, failed: 1 },
          devices: { online: 2, offline: 3 },
        });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByText('1 thông báo gửi lỗi')).toBeInTheDocument();
    expect(screen.getByText('3 thiết bị ngoại tuyến')).toBeInTheDocument();
  });

  it('tổng quan: không có bất thường thì không hiện Cần chú ý', async () => {
    renderPage(<AdminPage />, (url) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes('/admin/overview')) {
        return mockResponse({
          ...OVERVIEW,
          devices: { online: 4, offline: 0 },
          alerts: { open: 0 },
          tasks: { open: 0 },
          outbox: { pending: 0, failed: 0 },
        });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByText('Người dùng hoạt động')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cần chú ý' })).not.toBeInTheDocument();
  });

  it('người dùng: khóa tài khoản phải nhập lý do, gửi đúng body và báo ngắn', async () => {
    const patchBodies: unknown[] = [];
    let status = 'active';
    renderPage(<AdminPage />, (url, init) => {
      const u = url;
      const method = init?.method ?? 'GET';
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes(`/admin/users/${PLAIN_USER.id}/status`) && method === 'PATCH') {
        patchBodies.push(init?.body ? JSON.parse(String(init.body)) : null);
        status = 'disabled';
        return mockResponse({ ...PLAIN_USER, status });
      }
      if (u.includes('/admin/users?')) {
        return mockResponse({
          items: [ADMIN, { ...PLAIN_USER, status }],
          nextCursor: null,
        });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Người dùng' }));
    await user.click(await screen.findByRole('button', { name: 'Tạm khóa' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận tạm khóa' }));

    expect(
      await screen.findByText('Vui lòng nhập lý do thay đổi trạng thái.'),
    ).toBeInTheDocument();
    expect(patchBodies).toHaveLength(0);

    await user.type(screen.getByLabelText(/Lý do/), 'Vi phạm quy định sử dụng');
    await user.click(screen.getByRole('button', { name: 'Xác nhận tạm khóa' }));

    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]).toEqual({
      status: 'disabled',
      reason: 'Vi phạm quy định sử dụng',
    });
    // Thông báo thành công đặt ngoài bảng (đầu tab), không phụ thuộc dòng.
    const notice = await screen.findByText('Đã tạm khóa tài khoản Ngọc.');
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice.closest('.adm-table-wrap')).toBeNull();
    expect(notice.closest('.adm-user-feedback')).not.toBeNull();
    // Vẫn trả focus về nút của dòng vì dòng còn trong danh sách.
    expect(await screen.findByRole('button', { name: 'Kích hoạt' })).toHaveFocus();
    // Bảng tải lại với trạng thái mới và nút đổi thành Kích hoạt.
    const table = screen.getByRole('table');
    await waitFor(() => expect(within(table).getByText('Đã khóa')).toBeInTheDocument());
  });

  it('người dùng: mở form focus ô lý do, hủy trả focus về nút, lý do bắt buộc + mô tả lỗi', async () => {
    renderPage(<AdminPage />, (url) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes('/admin/users?')) {
        return mockResponse({ items: [ADMIN, PLAIN_USER], nextCursor: null });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Người dùng' }));
    const trigger = await screen.findByRole('button', { name: 'Tạm khóa' });
    await user.click(trigger);

    const reason = screen.getByLabelText(/Lý do/);
    expect(reason).toHaveFocus();
    expect(reason).toBeRequired();
    expect(reason).toHaveAttribute('aria-required', 'true');
    expect(reason).toHaveAttribute('aria-describedby', expect.stringContaining('status-reason-hint'));

    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.getByRole('button', { name: 'Tạm khóa' })).toHaveFocus();
    expect(screen.queryByLabelText(/Lý do/)).not.toBeInTheDocument();

    // Lỗi lý do được mô tả bằng aria-describedby và giới hạn 500 ký tự (không phải 600).
    await user.click(screen.getByRole('button', { name: 'Tạm khóa' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận tạm khóa' }));
    const errorText = await screen.findByText('Vui lòng nhập lý do thay đổi trạng thái.');
    const textarea = screen.getByLabelText(/Lý do/);
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining(errorText.id),
    );
    expect(textarea).toHaveAttribute('maxLength', '500');
  });

  it('người dùng: thông báo vẫn còn khi bộ lọc làm dòng vừa đổi rời danh sách', async () => {
    let patched = false;
    renderPage(<AdminPage />, (url, init) => {
      const u = url;
      const method = init?.method ?? 'GET';
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes(`/admin/users/${PLAIN_USER.id}/status`) && method === 'PATCH') {
        patched = true;
        return mockResponse({ ...PLAIN_USER, status: 'disabled' });
      }
      if (u.includes('/admin/users?')) {
        const onlyActive = u.includes('status=active');
        const items = patched
          ? onlyActive
            ? [ADMIN]
            : [ADMIN, { ...PLAIN_USER, status: 'disabled' }]
          : [ADMIN, PLAIN_USER];
        return mockResponse({ items, nextCursor: null });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Người dùng' }));
    await screen.findByText('Ngọc');
    await user.selectOptions(screen.getByLabelText('Trạng thái'), 'active');
    await user.click(screen.getByRole('button', { name: 'Lọc' }));

    await user.click(await screen.findByRole('button', { name: 'Tạm khóa' }));
    await user.type(screen.getByLabelText(/Lý do/), 'Vi phạm quy định sử dụng');
    await user.click(screen.getByRole('button', { name: 'Xác nhận tạm khóa' }));

    const notice = await screen.findByText('Đã tạm khóa tài khoản Ngọc.');
    expect(notice).toHaveAttribute('role', 'status');
    // Bộ lọc “Hoạt động” loại dòng vừa khóa khỏi danh sách, nhưng thông báo vẫn ở đầu tab.
    await waitFor(() => expect(screen.queryByText('Ngọc')).not.toBeInTheDocument());
    expect(notice).toBeInTheDocument();
    expect(notice.closest('.adm-table-wrap')).toBeNull();
    // Không còn nút của dòng để trả focus → focus vùng thông báo, không phải BODY.
    expect(document.activeElement).toBe(document.querySelector('.adm-user-feedback'));
  });

  it('người dùng: lỗi PATCH hiện khối lỗi ngoài bảng, nhận focus và giữ form để thử lại', async () => {
    const patchBodies: unknown[] = [];
    renderPage(<AdminPage />, (url, init) => {
      const u = url;
      const method = init?.method ?? 'GET';
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes(`/admin/users/${PLAIN_USER.id}/status`) && method === 'PATCH') {
        patchBodies.push(init?.body ? JSON.parse(String(init.body)) : null);
        return mockResponse(errorEnvelope('Máy chủ quản trị đang lỗi.', 'INTERNAL'), 500);
      }
      if (u.includes('/admin/users?')) {
        return mockResponse({ items: [ADMIN, PLAIN_USER], nextCursor: null });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Người dùng' }));
    await user.click(await screen.findByRole('button', { name: 'Tạm khóa' }));
    await user.type(screen.getByLabelText(/Lý do/), 'Vi phạm quy định sử dụng');
    await user.click(screen.getByRole('button', { name: 'Xác nhận tạm khóa' }));

    await waitFor(() => expect(patchBodies).toHaveLength(1));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Không đổi được trạng thái')).toBeInTheDocument();
    expect(within(alert).getByText('Máy chủ quản trị đang lỗi.')).toBeInTheDocument();
    // Lỗi không bị nhồi trong cột hành động (114px) và focus không rơi về BODY.
    expect(alert.closest('.adm-table-wrap')).toBeNull();
    expect(alert.closest('.adm-user-feedback')).not.toBeNull();
    expect(document.activeElement).toBe(document.querySelector('.adm-user-feedback'));
    // Giữ form + lý do đã gõ để người dùng thử lại.
    expect(screen.getByLabelText(/Lý do/)).toHaveValue('Vi phạm quy định sử dụng');
    expect(screen.getByRole('button', { name: 'Xác nhận tạm khóa' })).toBeEnabled();
  });

  it('khung trang: bốn tab chính và hai mục Nâng cao', async () => {
    renderPage(<AdminPage />, (url) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes('/admin/overview')) return mockResponse(OVERVIEW);
      if (u.includes('/admin/policies/device_runtime')) return mockResponse(POLICY_STATE);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Quản trị', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Theo dõi hệ thống và xử lý tài khoản.')).toBeInTheDocument();
    const tablist = screen.getByRole('tablist', { name: 'Các mục quản trị' });
    expect(within(tablist).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Tổng quan',
      'Người dùng',
      'Thiết bị',
      'Nâng cao',
    ]);
    expect(screen.getByRole('tab', { name: 'Tổng quan' })).toHaveAttribute('aria-selected', 'true');
    // R10: chỉ tab đang chọn trỏ aria-controls tới panel có thật.
    expect(screen.getByRole('tab', { name: 'Tổng quan' })).toHaveAttribute(
      'aria-controls',
      'adm-panel-overview',
    );
    expect(screen.getByRole('tab', { name: 'Người dùng' })).not.toHaveAttribute('aria-controls');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'adm-tab-overview');
    // Mỗi màn có H2 (heading ẩn cho screen reader khi màn không có H2 hiển thị).
    expect(screen.getByRole('heading', { name: 'Tổng quan', level: 2 })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Nâng cao' }));
    expect(screen.getByRole('tab', { name: 'Chính sách' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Nhật ký' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Chính sách' })).toHaveAttribute(
      'aria-controls',
      'adm-subpanel-policy',
    );
    expect(screen.getByRole('tab', { name: 'Nhật ký' })).not.toHaveAttribute('aria-controls');
    expect(screen.getByRole('tabpanel', { name: 'Chính sách' })).toHaveAttribute(
      'aria-labelledby',
      'adm-subtab-policy',
    );
    expect(screen.getByRole('heading', { name: 'Chính sách thiết bị', level: 2 })).toBeInTheDocument();
  });

  it('khung trang: ArrowRight đổi tab và focus theo tab mới', async () => {
    renderPage(<AdminPage />, (url) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes('/admin/overview')) return mockResponse(OVERVIEW);
      if (u.includes('/admin/users?')) {
        return mockResponse({ items: [ADMIN, PLAIN_USER], nextCursor: null });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    const overviewTab = await screen.findByRole('tab', { name: 'Tổng quan' });
    overviewTab.focus();
    await user.keyboard('{ArrowRight}');

    const usersTab = screen.getByRole('tab', { name: 'Người dùng' });
    expect(usersTab).toHaveAttribute('aria-selected', 'true');
    expect(usersTab).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Tổng quan' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'adm-tab-users');

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Tổng quan' })).toHaveAttribute('aria-selected', 'true');
  });

  it('khung trang: tab và mục con lưu trong URL, mở lại link không mất', async () => {
    const handler: FetchHandler = (url) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes('/admin/overview')) return mockResponse(OVERVIEW);
      if (u.includes('/admin/policies/device_runtime')) return mockResponse(POLICY_STATE);
      if (u.includes('/admin/users?')) return mockResponse({ items: [], nextCursor: null });
      if (u.includes('/admin/audit')) return mockResponse({ items: [], nextCursor: null });
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    };
    const first = renderAdminAt('/app/admin', handler);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Nâng cao' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/app/admin?tab=advanced');
    await user.click(screen.getByRole('tab', { name: 'Nhật ký' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/app/admin?tab=advanced&view=audit');
    first.unmount();

    // Mở lại đúng URL (tương đương reload) → vẫn ở đúng tab con.
    renderAdminAt('/app/admin?tab=advanced&view=audit', handler);
    expect(await screen.findByRole('tab', { name: 'Nhật ký' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('heading', { name: 'Nhật ký hoạt động', level: 2 })).toBeInTheDocument();
  });

  it('policy: Xem trước hiện warnings + diff; Phát hành gửi expectedVersion + note', async () => {
    const previewBodies: unknown[] = [];
    const publishBodies: unknown[] = [];
    renderPage(<AdminPage />, (url, init) => {
      const u = url;
      const method = init?.method ?? 'GET';
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes('/admin/policies/device_runtime/previews')) {
        previewBodies.push(init?.body ? JSON.parse(String(init.body)) : null);
        return mockResponse(POLICY_PREVIEW);
      }
      if (u.includes('/admin/policies/device_runtime') && method === 'PUT') {
        publishBodies.push(init?.body ? JSON.parse(String(init.body)) : null);
        return mockResponse(POLICY_PUBLISH);
      }
      if (u.includes('/admin/policies/device_runtime')) return mockResponse(POLICY_STATE);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    // Chuyển tab policy rồi đợi form nạp giá trị active.
    await user.click(await screen.findByRole('tab', { name: 'Nâng cao' }));
    await user.click(screen.getByRole('tab', { name: 'Chính sách' }));
    expect(await screen.findByDisplayValue('15')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Gửi nhịp tim mỗi (giây)'));
    await user.type(screen.getByLabelText('Gửi nhịp tim mỗi (giây)'), '20');
    await user.type(screen.getByLabelText('Ghi chú phát hành'), 'Điều chỉnh chu kỳ gửi');

    await user.click(screen.getByRole('button', { name: 'Xem trước' }));
    expect(
      await screen.findByText('Chu kỳ gửi 20 giây làm tăng lưu lượng telemetry khoảng 33%.'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        (_, element) => element?.tagName === 'LI' && element.textContent === 'heartbeatIntervalSeconds: 15 → 20',
      ).length,
    ).toBe(1);
    expect(previewBodies[0]).toEqual({
      value: { ...POLICY_VALUE, heartbeatIntervalSeconds: 20 },
      expectedVersion: 2,
    });

    await user.click(screen.getByRole('button', { name: 'Phát hành' }));
    await waitFor(() => expect(publishBodies).toHaveLength(1));
    expect(publishBodies[0]).toEqual({
      value: { ...POLICY_VALUE, heartbeatIntervalSeconds: 20 },
      expectedVersion: 2,
      previewDigest: PREVIEW_DIGEST,
      note: 'Điều chỉnh chu kỳ gửi',
    });
    expect(await screen.findByText(/Đã phát hành chính sách phiên bản 3/)).toBeInTheDocument();
  });

  it('policy publish 409 APPROVAL_STALE → hiện version hiện tại + nút tải lại', async () => {
    let publishCalls = 0;
    renderPage(<AdminPage />, (url, init) => {
      const u = url;
      const method = init?.method ?? 'GET';
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes('/admin/policies/device_runtime/previews')) {
        return mockResponse(POLICY_PREVIEW);
      }
      if (u.includes('/admin/policies/device_runtime') && method === 'PUT') {
        publishCalls += 1;
        return mockResponse(
          {
            code: 'APPROVAL_STALE',
            message: 'Phiên bản policy đã thay đổi, hãy tải lại trước khi công bố.',
            requestId: 'test-req-stale',
            details: { reason: 'version_mismatch', currentVersion: 3, currentDigest: 'digest-v3-abcdef' },
          },
          409,
        );
      }
      if (u.includes('/admin/policies/device_runtime')) return mockResponse(POLICY_STATE);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Nâng cao' }));
    await user.click(screen.getByRole('tab', { name: 'Chính sách' }));
    await screen.findByDisplayValue('15');

    // Phải preview trước — nút Phát hành bị khóa nếu chưa có preview đúng nội dung.
    expect(screen.getByRole('button', { name: 'Phát hành' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Xem trước' }));
    expect(await screen.findByText(/Giá trị hợp lệ/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Phát hành' }));

    expect(
      await screen.findByText('Phiên bản chính sách đã thay đổi (hiện tại: v3). Hãy tải lại trước khi phát hành.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải lại' })).toBeInTheDocument();
    expect(publishCalls).toBe(1);
    // R12: cảnh báo 409 nhận focus (không rơi về BODY); “Tải lại” xong focus về
    // tiêu đề panel thay vì mất hút khi nút biến mất.
    const staleStatus = document.querySelector('.adm-policy-status');
    await waitFor(() => expect(document.activeElement).toBe(staleStatus));
    await user.click(screen.getByRole('button', { name: 'Tải lại' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'Chính sách thiết bị', level: 2 }),
      ),
    );
    // Preview/digest đã bị bỏ sau 409: Phát hành khóa lại.
    expect(screen.getByRole('button', { name: 'Phát hành' })).toBeDisabled();
  });

  it('policy: sửa field sau preview → hủy preview + digest, khóa Phát hành, không gửi PUT', async () => {
    const previewBodies: unknown[] = [];
    const publishBodies: unknown[] = [];
    renderPage(<AdminPage />, (url, init) => {
      const u = url;
      const method = init?.method ?? 'GET';
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes('/admin/policies/device_runtime/previews')) {
        previewBodies.push(init?.body ? JSON.parse(String(init.body)) : null);
        return mockResponse(POLICY_PREVIEW);
      }
      if (u.includes('/admin/policies/device_runtime') && method === 'PUT') {
        publishBodies.push(init?.body ? JSON.parse(String(init.body)) : null);
        return mockResponse(POLICY_PUBLISH);
      }
      if (u.includes('/admin/policies/device_runtime')) return mockResponse(POLICY_STATE);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Nâng cao' }));
    await user.click(screen.getByRole('tab', { name: 'Chính sách' }));
    await screen.findByDisplayValue('15');

    // Publish không preview → bị khóa, không gọi API.
    const publishButton = screen.getByRole('button', { name: 'Phát hành' });
    expect(publishButton).toBeDisabled();
    await user.click(publishButton);
    expect(publishBodies).toHaveLength(0);
    expect(previewBodies).toHaveLength(0);

    const heartbeatField = screen.getByLabelText('Gửi nhịp tim mỗi (giây)');
    await user.clear(heartbeatField);
    await user.type(heartbeatField, '20');
    await user.click(screen.getByRole('button', { name: 'Xem trước' }));
    expect(await screen.findByText(/Giá trị hợp lệ/)).toBeInTheDocument();
    expect(previewBodies[0]).toEqual({
      value: { ...POLICY_VALUE, heartbeatIntervalSeconds: 20 },
      expectedVersion: 2,
    });
    expect(screen.getByRole('button', { name: 'Phát hành' })).toBeEnabled();

    // Sửa tiếp sau preview → preview cũ (đang hiện 20) hết hiệu lực, Phát hành khóa.
    await user.clear(heartbeatField);
    await user.type(heartbeatField, '55');
    await waitFor(() => expect(screen.queryByText(/Giá trị hợp lệ/)).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Phát hành' })).toBeDisabled();
    expect(publishBodies).toHaveLength(0);
  });

  it('policy: 409 digest lệch → giữ form, báo nội dung đã thay đổi, preview lại rồi publish thành công', async () => {
    const publishBodies: unknown[] = [];
    let publishCalls = 0;
    renderPage(<AdminPage />, (url, init) => {
      const u = url;
      const method = init?.method ?? 'GET';
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes('/admin/policies/device_runtime/previews')) {
        return mockResponse(POLICY_PREVIEW);
      }
      if (u.includes('/admin/policies/device_runtime') && method === 'PUT') {
        publishCalls += 1;
        publishBodies.push(init?.body ? JSON.parse(String(init.body)) : null);
        if (publishCalls === 1) {
          return mockResponse(
            {
              code: 'APPROVAL_STALE',
              message: 'Nội dung đã thay đổi so với bản xem trước, hãy xem lại preview trước khi công bố.',
              requestId: 'test-req-content',
              details: { reason: 'preview_mismatch', expectedVersion: 2 },
            },
            409,
          );
        }
        return mockResponse(POLICY_PUBLISH);
      }
      if (u.includes('/admin/policies/device_runtime')) return mockResponse(POLICY_STATE);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Nâng cao' }));
    await user.click(screen.getByRole('tab', { name: 'Chính sách' }));
    await screen.findByDisplayValue('15');

    const heartbeatField = screen.getByLabelText('Gửi nhịp tim mỗi (giây)');
    await user.clear(heartbeatField);
    await user.type(heartbeatField, '20');
    await user.type(screen.getByLabelText('Ghi chú phát hành'), 'Điều chỉnh chu kỳ gửi');
    await user.click(screen.getByRole('button', { name: 'Xem trước' }));
    expect(await screen.findByText(/Giá trị hợp lệ/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Phát hành' }));
    expect(
      await screen.findByText(
        'Nội dung đã thay đổi so với bản xem trước, hãy xem lại preview trước khi công bố.',
      ),
    ).toBeInTheDocument();
    // Giữ nguyên nội dung đang sửa, chỉ bỏ preview/digest cũ.
    expect(screen.getByDisplayValue('20')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Phát hành' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Xem trước' })).toBeEnabled();

    // Preview lại rồi publish lần hai → thành công và reset form preview/note.
    await user.click(screen.getByRole('button', { name: 'Xem trước' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Phát hành' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Phát hành' }));
    expect(await screen.findByText(/Đã phát hành chính sách phiên bản 3/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Giá trị hợp lệ/)).not.toBeInTheDocument());
    expect(screen.getByLabelText('Ghi chú phát hành')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Phát hành' })).toBeDisabled();
    expect(publishCalls).toBe(2);
    expect(publishBodies[0]).toEqual({
      value: { ...POLICY_VALUE, heartbeatIntervalSeconds: 20 },
      expectedVersion: 2,
      previewDigest: PREVIEW_DIGEST,
      note: 'Điều chỉnh chu kỳ gửi',
    });
  });

  it('policy: lỗi field → focus ô sai đầu tiên và summary lỗi ngay cạnh nút', async () => {
    let previewCalls = 0;
    renderPage(<AdminPage />, (url) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes('/admin/policies/device_runtime/previews')) {
        previewCalls += 1;
        return mockResponse(POLICY_PREVIEW);
      }
      if (u.includes('/admin/policies/device_runtime')) return mockResponse(POLICY_STATE);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Nâng cao' }));
    await user.click(screen.getByRole('tab', { name: 'Chính sách' }));
    await screen.findByDisplayValue('15');

    const heartbeat = screen.getByLabelText('Gửi nhịp tim mỗi (giây)');
    await user.clear(heartbeat);
    await user.type(heartbeat, '0');
    await user.click(screen.getByRole('button', { name: 'Xem trước' }));

    // Không gọi API khi dữ liệu sai; focus + cuộn tới ô lỗi đầu tiên.
    expect(previewCalls).toBe(0);
    expect(heartbeat).toHaveFocus();
    expect(heartbeat).toHaveAttribute('aria-invalid', 'true');

    const summary = document.querySelector('.adm-policy-errors');
    expect(summary).not.toBeNull();
    // R11: chỉ ô lỗi là role=alert; tóm tắt không lặp thành alert thứ hai.
    expect(summary).toHaveAttribute('role', 'group');
    expect(summary).toHaveAttribute('aria-labelledby', 'policy-errors-title');
    expect(summary?.textContent).toContain('giá trị chưa hợp lệ');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    // Summary nằm ngay sau hàng nút (cạnh chỗ vừa bấm), không ở đầu panel.
    const actions = screen
      .getByRole('button', { name: 'Xem trước' })
      .closest('.adm-policy-actions');
    expect(actions?.nextElementSibling).toBe(summary);
    // Liên kết trong summary focus lại đúng ô.
    const link = within(summary as HTMLElement).getByRole('link');
    expect(link.textContent).toContain('Gửi nhịp tim mỗi (giây)');
    await user.click(link);
    expect(heartbeat).toHaveFocus();

    // R04/R11: sửa giá trị hợp lệ thì lỗi cũ + aria-invalid tự xoá, không đợi
    // bấm “Xem trước” lần nữa và không còn alert cũ.
    await user.clear(heartbeat);
    await user.type(heartbeat, '20');
    await waitFor(() => expect(screen.queryByText(/giá trị chưa hợp lệ/)).not.toBeInTheDocument());
    expect(heartbeat).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('policy: preview hiện bằng chứng version nền, digest ngắn và “không ghi dữ liệu”', async () => {
    renderPage(<AdminPage />, (url, init) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes('/admin/policies/device_runtime/previews')) {
        return mockResponse(POLICY_PREVIEW);
      }
      if (u.includes('/admin/policies/device_runtime')) return mockResponse(POLICY_STATE);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Nâng cao' }));
    await user.click(screen.getByRole('tab', { name: 'Chính sách' }));
    await screen.findByDisplayValue('15');
    await user.click(screen.getByRole('button', { name: 'Xem trước' }));
    await screen.findByText(/Giá trị hợp lệ/);

    const evidence = document.querySelector('.adm-policy-preview__evidence');
    expect(evidence).not.toBeNull();
    expect(evidence?.textContent).toContain('Bản xem trước cho v2');
    expect(evidence?.textContent).toContain(PREVIEW_DIGEST.slice(0, 12));
    expect(evidence?.textContent).toContain('không ghi dữ liệu');
  });

  it('policy: lịch sử có bản phát hành thì nhãn là “Giá trị mặc định”, không nói “Chưa có bản phát hành:”', async () => {
    renderPage(<AdminPage />, (url) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes('/admin/policies/device_runtime')) return mockResponse(POLICY_STATE);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Nâng cao' }));
    await user.click(screen.getByRole('tab', { name: 'Chính sách' }));
    await screen.findByDisplayValue('15');

    await user.click(screen.getByText('Lịch sử phiên bản (2)'));
    expect(
      screen.getByText('Giá trị mặc định (dùng khi chưa có bản phát hành)'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Chưa có bản phát hành:/)).not.toBeInTheDocument();
    expect(screen.getByText('v2 · đang hoạt động')).toBeInTheDocument();
    expect(screen.getByText('v1 · đã thay thế')).toBeInTheDocument();
  });

  it('audit: hiển thị bản ghi với metadata trong details (text)', async () => {
    renderPage(
      <AdminPage />,
      auditHandler([
        auditEntry({
          id: 1,
          action: 'admin.user.disable',
          targetType: 'user',
          targetId: PLAIN_USER.id,
          metadata: { reason: 'Tài khoản spam' },
        }),
      ]),
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Nâng cao' }));
    await user.click(screen.getByRole('tab', { name: 'Nhật ký' }));
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Khóa tài khoản')).toHaveAttribute(
      'title',
      'admin.user.disable',
    );
    expect(screen.getByText('Thành công')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Xem chi tiết' }));
    expect(screen.getByText(/"reason": "Tài khoản spam"/)).toBeInTheDocument();
  });

  it('audit: Xem chi tiết mở panel full-width dưới bảng (không colspan), JSON cuộn trong panel', async () => {
    renderPage(
      <AdminPage />,
      auditHandler([
        auditEntry({ id: 1, action: 'assistant.summary', targetType: 'subject', targetId: ASSIGNED_SUBJECT_ID, metadata: { status: 'degraded', provider: 'demo' } }),
      ]),
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Nâng cao' }));
    await user.click(screen.getByRole('tab', { name: 'Nhật ký' }));
    const toggle = await screen.findByRole('button', { name: 'Xem chi tiết' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // R10: nút đóng không trỏ aria-controls tới phần tử chưa tồn tại.
    expect(toggle).not.toHaveAttribute('aria-controls');
    await user.click(toggle);

    // R02: panel nằm NGOÀI khung cuộn ngang của bảng và không dùng colspan/td.
    const panel = document.getElementById('audit-detail-panel');
    expect(panel).not.toBeNull();
    expect(panel?.tagName).toBe('SECTION');
    expect(panel?.closest('.adm-table-wrap')).toBeNull();
    expect(panel?.querySelector('td')).toBeNull();
    expect(panel?.querySelector('[colspan]')).toBeNull();
    const tableWrap = document.querySelector('.adm-table-wrap');
    expect(tableWrap?.nextElementSibling).toBe(panel);
    expect(panel?.getAttribute('aria-labelledby')).toBe('audit-detail-title');
    expect(screen.getByRole('heading', { name: 'Chi tiết nhật ký', level: 3 })).toBeInTheDocument();
    // Mở panel thì focus vào panel để đọc ngay, không kẹt ở nút trong bảng cuộn.
    expect(panel).toHaveFocus();
    expect(panel?.textContent).toContain('assistant.summary');
    const pre = panel?.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toContain('"status": "degraded"');
    expect(pre?.textContent).toContain('"provider": "demo"');
    expect(pre).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('button', { name: 'Ẩn chi tiết' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    // Đóng rõ ràng và trả focus về đúng nút của dòng.
    await user.click(screen.getByRole('button', { name: 'Đóng chi tiết' }));
    expect(document.getElementById('audit-detail-panel')).toBeNull();
    expect(screen.getByRole('button', { name: 'Xem chi tiết' })).toHaveFocus();
  });

  it('audit: nhãn tiếng Việt cho action phổ biến, actor và target dễ đọc', async () => {
    renderPage(
      <AdminPage />,
      auditHandler([
        auditEntry({ id: 1, action: 'auth.login' }),
        auditEntry({
          id: 2,
          action: 'assistant.summary',
          actorKind: 'ai',
          actorUserId: null,
          targetType: 'subject',
          targetId: ASSIGNED_SUBJECT_ID,
        }),
        auditEntry({
          id: 3,
          action: 'incident.acknowledge',
          actorKind: 'device',
          actorUserId: null,
          targetType: 'incident',
          targetId: 'ffffffff-1111-4111-8111-111111111111',
        }),
        auditEntry({
          id: 4,
          action: 'admin.user.disable',
          actorKind: 'system',
          actorUserId: null,
          targetType: 'user',
          targetId: PLAIN_USER.id,
        }),
        auditEntry({
          id: 6,
          action: 'subject.update',
          targetType: 'subject',
          targetId: ASSIGNED_SUBJECT_ID,
          metadata: { subjectName: 'Bà Năm' },
        }),
        auditEntry({
          id: 5,
          action: 'custom.unknown',
          actorUserId: '99999999-1111-4111-8111-111111111111',
          targetType: 'session',
          targetId: null,
        }),
      ]),
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Nâng cao' }));
    await user.click(screen.getByRole('tab', { name: 'Nhật ký' }));
    const table = await screen.findByRole('table');

    // Nhãn người đọc + mã gốc trong title.
    expect(within(table).getByText('Đăng nhập')).toHaveAttribute('title', 'auth.login');
    expect(within(table).getByText('Tóm tắt bằng trợ lý')).toHaveAttribute(
      'title',
      'assistant.summary',
    );
    expect(within(table).getByText('Xác nhận cảnh báo')).toBeInTheDocument();
    expect(within(table).getByText('Khóa tài khoản')).toBeInTheDocument();
    // Actor theo loại.
    expect(within(table).getByText('Trợ lý')).toBeInTheDocument();
    expect(within(table).getByText('Thiết bị')).toBeInTheDocument();
    expect(within(table).getByText('Hệ thống')).toBeInTheDocument();
    // Target có nhãn loại, id ngắn hiển thị và id đầy đủ trong title.
    const subjectTarget = within(table).getByText(`Hồ sơ ${ASSIGNED_SUBJECT_ID.slice(0, 8)}`);
    expect(subjectTarget).toHaveAttribute('title', ASSIGNED_SUBJECT_ID);
    expect(within(table).getByText('Cảnh báo ffffffff')).toHaveAttribute(
      'title',
      'ffffffff-1111-4111-8111-111111111111',
    );
    expect(within(table).getByText(`Tài khoản ${PLAIN_USER.id.slice(0, 8)}`)).toBeInTheDocument();
    // R14: hồ sơ dùng tên khi metadata có tên, còn không thì giữ id ngắn.
    expect(within(table).getByText('Hồ sơ Bà Năm')).toBeInTheDocument();
    // Action lạ vẫn hiện mã gốc; actor lạ fallback id ngắn.
    expect(within(table).getByText('custom.unknown')).toBeInTheDocument();
    expect(within(table).getByText('Người dùng 99999999')).toBeInTheDocument();
  });

  it('audit: bảng rộng hơn khung thì hiện hint cuộn ngang', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(782);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(335);
    renderPage(<AdminPage />, auditHandler([auditEntry({ id: 1 })]));
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Nâng cao' }));
    await user.click(screen.getByRole('tab', { name: 'Nhật ký' }));
    expect(await screen.findByText(/Bảng rộng hơn khung/)).toBeInTheDocument();
  });

  it('audit: bảng vừa khung thì không có hint', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(335);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(335);
    renderPage(<AdminPage />, auditHandler([auditEntry({ id: 1 })]));
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Nâng cao' }));
    await user.click(screen.getByRole('tab', { name: 'Nhật ký' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByText(/Bảng rộng hơn khung/)).not.toBeInTheDocument();
  });

  it('audit: nhãn cột mobile là aria-hidden trong cell, không dùng pseudo-element data-label', async () => {
    renderPage(<AdminPage />, auditHandler([auditEntry({ id: 1 })]));
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Nâng cao' }));
    await user.click(screen.getByRole('tab', { name: 'Nhật ký' }));
    const table = await screen.findByRole('table');
    const row = within(table).getAllByRole('row')[1] as HTMLElement;

    for (const label of ['Hành động', 'Người thực hiện', 'Kết quả', 'Thời gian', 'Chi tiết']) {
      const element = within(row).getByText(label);
      expect(element).toHaveClass('adm-cell-label');
      expect(element).toHaveAttribute('aria-hidden', 'true');
    }
    // Không còn nhãn lặp qua data-label/::before.
    expect(row.querySelector('[data-label]')).toBeNull();
  });

  it('người dùng: thẻ mobile dùng nhãn aria-hidden, giữ ngày tạo và hint tìm/lọc', async () => {
    renderPage(<AdminPage />, (url) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes('/admin/users?')) {
        return mockResponse({ items: [ADMIN, PLAIN_USER], nextCursor: null });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Người dùng' }));
    const name = await screen.findByText('Ngọc');
    const row = name.closest('tr') as HTMLElement;

    expect(row.querySelector('[data-label]')).toBeNull();
    const roleLabel = within(row).getByText('Vai trò');
    expect(roleLabel).toHaveClass('adm-cell-label');
    expect(roleLabel).toHaveAttribute('aria-hidden', 'true');
    // Ngày tạo vẫn hiện thay vì bị bỏ hẳn.
    expect(within(row).getByText(/^Tạo /)).toBeInTheDocument();
    // Hint ngắn cho tìm kiếm/lọc.
    expect(screen.getByText('Tìm theo email hoặc tên hiển thị.')).toBeInTheDocument();
    expect(screen.getByText('“Tất cả” gồm cả tài khoản đã khóa.')).toBeInTheDocument();
  });

  it('tab Thiết bị: tải GET /admin/devices, hiển thị serial/hồ sơ/firmware/lần thấy cuối, không có dữ liệu sức khỏe', async () => {
    const calls: DeviceCall[] = [];
    renderPage(<AdminPage />, deviceHandler({ calls }));

    // Bốn tab chính vẫn còn, tab mặc định vẫn là Tổng quan.
    expect(await screen.findByRole('tab', { name: 'Tổng quan' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Người dùng' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Nâng cao' })).toBeInTheDocument();

    const { list, firstItem } = await openDevicesTab();
    expect(await within(firstItem).findByText('SN-ADMIN-001')).toBeInTheDocument();
    expect(within(firstItem).getByText('Vòng tay Bà Năm')).toBeInTheDocument();
    // Không in UUID trần: hiện “Mã” + id ngắn, id đầy đủ trong title (không lặp nhãn).
    const subject = within(firstItem).getByTitle(ASSIGNED_SUBJECT_ID);
    expect(subject.textContent).toContain('Mã');
    expect(subject.textContent).not.toContain('Mã hồ sơ');
    expect(subject.textContent).toContain(ASSIGNED_SUBJECT_ID.slice(0, 8));
    expect(within(firstItem).queryByText(ASSIGNED_SUBJECT_ID)).not.toBeInTheDocument();
    expect(within(firstItem).getByText('1.4.2')).toBeInTheDocument();
    expect(within(firstItem).getAllByText(/Chưa có thông tin pin/).length).toBeGreaterThan(0);
    expect(within(firstItem).getByText('Trực tuyến')).toBeInTheDocument();

    const secondItem = within(list).getAllByRole('listitem')[1] as HTMLElement;
    expect(within(secondItem).getByText('Chưa gắn hồ sơ')).toBeInTheDocument();
    expect(within(secondItem).getByText('Chưa báo cáo')).toBeInTheDocument();
    expect(within(secondItem).getAllByText('Chưa từng kết nối').length).toBeGreaterThan(0);

    // Không hiển thị nhịp tim/BPM hay trường sức khỏe nào.
    expect(screen.queryByText(/bpm/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nhịp tim/i)).not.toBeInTheDocument();

    // Chỉ gọi list + policy; không gọi endpoint sức khỏe.
    expect(
      calls.some(
        (call) => call.method === 'GET' && call.url.endsWith('/admin/devices'),
      ),
    ).toBe(true);
    expect(calls.every((call) => !call.url.includes('/subjects/'))).toBe(true);
  });

  it('tab Thiết bị: tạo claim code qua endpoint admin, hiện mã một lần, copy có phản hồi và ẩn được', async () => {
    const calls: DeviceCall[] = [];
    renderPage(<AdminPage />, deviceHandler({ calls }));
    const { user, list } = await openDevicesTab();
    const unassignedItem = within(list).getAllByRole('listitem')[1] as HTMLElement;

    await user.click(within(unassignedItem).getByRole('button', { name: 'Tạo mã gắn thiết bị' }));

    expect(await screen.findByText('ABC234567')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mã gắn thiết bị mới' })).toHaveFocus();
    expect(screen.getByText('Chỉ hiển thị một lần')).toBeInTheDocument();
    expect(
      screen.getByText('Không chia sẻ mã này qua email, tin nhắn hay ảnh chụp màn hình.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Mã hết hạn lúc/)).toBeInTheDocument();
    expect(
      calls.some(
        (call) =>
          call.method === 'POST' &&
          call.url.endsWith(`/admin/devices/${SECOND_DEVICE_ID}/claim-code`),
      ),
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Sao chép mã' }));
    expect(await screen.findByText(/Đã sao chép vào bộ nhớ tạm/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đã sao chép' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tôi đã lưu, ẩn đi' }));
    expect(screen.queryByText('ABC234567')).not.toBeInTheDocument();
  });

  it('tab Thiết bị: rotate key phải xác nhận trước, sau đó hiện khóa mới một lần', async () => {
    const calls: DeviceCall[] = [];
    renderPage(<AdminPage />, deviceHandler({ calls }));
    const { user, firstItem } = await openDevicesTab();

    await user.click(within(firstItem).getByRole('button', { name: 'Đổi khóa thiết bị' }));
    expect(calls.some((call) => call.url.includes('/rotate-key'))).toBe(false);
    expect(
      screen.getByRole('group', { name: `Xác nhận đổi khóa cho thiết bị SN-ADMIN-001` }),
    ).toBeInTheDocument();
    expect(screen.getByText(/không gửi được dữ liệu cho đến khi cấu hình khóa mới/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Xác nhận đổi khóa' }));

    expect(await screen.findByText(ROTATED_KEY.deviceKey)).toBeInTheDocument();
    expect(screen.getByText('Khóa thiết bị mới')).toBeInTheDocument();
    expect(
      screen.getByText('Không chia sẻ khóa này qua email, tin nhắn hay ảnh chụp màn hình.'),
    ).toBeInTheDocument();
    expect(
      calls.filter(
        (call) =>
          call.method === 'POST' &&
          call.url.endsWith(`/admin/devices/${FIRST_DEVICE_ID}/rotate-key`),
      ),
    ).toHaveLength(1);
  });

  it('tab Thiết bị: lỗi tải danh sách hiện ErrorState có thông báo', async () => {
    renderPage(
      <AdminPage />,
      deviceHandler({
        devicesResponse: () =>
          mockResponse(errorEnvelope('Máy chủ quản trị đang lỗi.', 'INTERNAL'), 500),
      }),
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Thiết bị' }));

    expect(await screen.findByText('Không tải được danh sách thiết bị')).toBeInTheDocument();
    expect(screen.getByText('Máy chủ quản trị đang lỗi.')).toBeInTheDocument();
  });

  it('tab Thiết bị: thiết bị đang gắn khóa nút tạo mã kèm lý do; tải lại sau khi gỡ thì mở lại', async () => {
    let assigned = true;
    let deviceGets = 0;
    const calls: DeviceCall[] = [];
    renderPage(<AdminPage />, (url, init) => {
      const method = init?.method ?? 'GET';
      if (url.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (url.includes('/admin/policies/device_runtime')) return mockResponse(POLICY_STATE);
      if (url.includes('/claim-code')) {
        calls.push({ url, method });
        return mockResponse(CLAIM_CODE);
      }
      if (url.includes('/admin/devices')) {
        deviceGets += 1;
        calls.push({ url, method });
        return mockResponse({
          items: [
            {
              ...DEVICE_LIST.items[0],
              assignedSubjectId: assigned ? ASSIGNED_SUBJECT_ID : null,
            },
            DEVICE_LIST.items[1],
          ],
        });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    const { user, firstItem } = await openDevicesTab();
    const claimButton = within(firstItem).getByRole('button', { name: 'Tạo mã gắn thiết bị' });
    expect(claimButton).toBeDisabled();
    const hint = within(firstItem).getByText(
      'Thiết bị đang gắn hồ sơ; hãy gỡ trước khi tạo mã.',
    );
    expect(claimButton).toHaveAttribute('aria-describedby', hint.id);

    // Nút bị khóa thì không gọi API cấp mã.
    await user.click(claimButton);
    expect(calls.some((call) => call.url.includes('/claim-code'))).toBe(false);
    expect(deviceGets).toBe(1);

    // Thiết bị được gỡ (ví dụ chủ hồ sơ release ở tab khác) → tải lại danh sách
    // thì nút mở và lý do biến mất.
    assigned = false;
    await user.click(screen.getByRole('button', { name: 'Tải lại danh sách' }));
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Danh sách thiết bị' })).getAllByRole('listitem')[0],
      ).not.toHaveTextContent('Thiết bị đang gắn hồ sơ; hãy gỡ trước khi tạo mã.'),
    );
    const refreshedList = screen.getByRole('list', { name: 'Danh sách thiết bị' });
    const refreshedFirst = within(refreshedList).getAllByRole('listitem')[0] as HTMLElement;
    expect(within(refreshedFirst).getByRole('button', { name: 'Tạo mã gắn thiết bị' })).toBeEnabled();
    expect(within(refreshedFirst).queryByText(/hãy gỡ trước khi tạo mã/)).not.toBeInTheDocument();

    await user.click(within(refreshedFirst).getByRole('button', { name: 'Tạo mã gắn thiết bị' }));
    expect(await screen.findByText(CLAIM_CODE.claimCode)).toBeInTheDocument();
    expect(deviceGets).toBeGreaterThanOrEqual(2);
  });

  it('tab Thiết bị: server 409 vì thiết bị vừa được gắn thì báo lý do và tải lại danh sách', async () => {
    let deviceGets = 0;
    renderPage(<AdminPage />, (url, init) => {
      const method = init?.method ?? 'GET';
      if (url.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (url.includes('/admin/policies/device_runtime')) return mockResponse(POLICY_STATE);
      if (url.includes('/claim-code')) {
        return mockResponse(
          {
            code: 'CONFLICT',
            message: 'Thiết bị đang gắn hồ sơ; hãy gỡ trước khi tạo mã.',
            requestId: 'test-req-claim-guard',
            details: { code: 'DEVICE_ALREADY_ASSIGNED' },
          },
          409,
        );
      }
      if (url.includes('/admin/devices')) {
        deviceGets += 1;
        return mockResponse(DEVICE_LIST);
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    const { user, list } = await openDevicesTab();
    const unassignedItem = within(list).getAllByRole('listitem')[1] as HTMLElement;
    await user.click(within(unassignedItem).getByRole('button', { name: 'Tạo mã gắn thiết bị' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Không tạo được mã gắn thiết bị')).toBeInTheDocument();
    expect(
      within(alert).getByText('Thiết bị đang gắn hồ sơ; hãy gỡ trước khi tạo mã.'),
    ).toBeInTheDocument();
    // 409 làm danh sách tải lại để nút khóa đúng trạng thái mới.
    await waitFor(() => expect(deviceGets).toBeGreaterThanOrEqual(2));
  });

  it('tab Thiết bị: lỗi tạo claim code hiện thông báo, không hiện mã giả', async () => {
    renderPage(
      <AdminPage />,
      deviceHandler({
        claimResponse: () =>
          mockResponse(errorEnvelope('Không tạo được mã lúc này.', 'INTERNAL'), 500),
      }),
    );
    const { user, list } = await openDevicesTab();
    const unassignedItem = within(list).getAllByRole('listitem')[1] as HTMLElement;

    await user.click(within(unassignedItem).getByRole('button', { name: 'Tạo mã gắn thiết bị' }));

    expect(await screen.findByText('Không tạo được mã gắn thiết bị')).toBeInTheDocument();
    expect(screen.getByText('Không tạo được mã lúc này.')).toBeInTheDocument();
    expect(screen.queryByText('Chỉ hiển thị một lần')).not.toBeInTheDocument();
  });

  it('tab Thiết bị: danh sách rỗng hiện EmptyState', async () => {
    renderPage(
      <AdminPage />,
      deviceHandler({
        devicesResponse: () => mockResponse({ items: [] }),
      }),
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Thiết bị' }));

    expect(await screen.findByText('Chưa có thiết bị nào')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Danh sách thiết bị' })).not.toBeInTheDocument();
  });
});
