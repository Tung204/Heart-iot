import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminPage } from './AdminPage';
import { errorEnvelope, mockResponse, renderPage } from '../../test/utils';
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

const POLICY_PREVIEW = {
  valid: true,
  value: { ...POLICY_VALUE, heartbeatIntervalSeconds: 20 },
  digest: null,
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
      id: '4f5d6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b',
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
  await user.click(await screen.findByRole('button', { name: 'Thiết bị' }));
  const list = await screen.findByRole('list', { name: 'Danh sách thiết bị' });
  return { user, list, firstItem: within(list).getAllByRole('listitem')[0] as HTMLElement };
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

  it('admin → tổng quan hiển thị số liệu đúng', async () => {
    renderPage(<AdminPage />, (url) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes('/admin/overview')) return mockResponse(OVERVIEW);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByText('Người dùng đang hoạt động')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Thiết bị ngoại tuyến')).toBeInTheDocument();
    expect(screen.getByText('Thông báo đang chờ gửi')).toBeInTheDocument();
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
    await user.click(await screen.findByRole('button', { name: 'Chính sách thiết bị' }));
    expect(await screen.findByDisplayValue('15')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Chu kỳ gửi nhịp tim (giây)'));
    await user.type(screen.getByLabelText('Chu kỳ gửi nhịp tim (giây)'), '20');
    await user.type(screen.getByLabelText('Ghi chú phát hành (tùy chọn)'), 'Điều chỉnh chu kỳ gửi');

    await user.click(screen.getByRole('button', { name: 'Xem trước' }));
    expect(
      await screen.findByText('Chu kỳ gửi 20 giây làm tăng lưu lượng telemetry khoảng 33%.'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        (_, element) => element?.tagName === 'LI' && element.textContent === 'heartbeatIntervalSeconds: 15 → 20',
      ).length,
    ).toBe(1);
    expect(previewBodies[0]).toEqual({ value: { ...POLICY_VALUE, heartbeatIntervalSeconds: 20 } });

    await user.click(screen.getByRole('button', { name: 'Phát hành' }));
    await waitFor(() => expect(publishBodies).toHaveLength(1));
    expect(publishBodies[0]).toEqual({
      value: { ...POLICY_VALUE, heartbeatIntervalSeconds: 20 },
      expectedVersion: 2,
      note: 'Điều chỉnh chu kỳ gửi',
    });
    expect(await screen.findByText(/Đã phát hành policy phiên bản 3/)).toBeInTheDocument();
  });

  it('policy publish 409 APPROVAL_STALE → hiện version hiện tại + nút tải lại', async () => {
    let publishCalls = 0;
    renderPage(<AdminPage />, (url, init) => {
      const u = url;
      const method = init?.method ?? 'GET';
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes('/admin/policies/device_runtime') && method === 'PUT') {
        publishCalls += 1;
        return mockResponse(
          {
            code: 'APPROVAL_STALE',
            message: 'Phiên bản policy đã thay đổi, hãy tải lại trước khi công bố.',
            requestId: 'test-req-stale',
            details: { currentVersion: 3, currentDigest: 'digest-v3-abcdef' },
          },
          409,
        );
      }
      if (u.includes('/admin/policies/device_runtime')) return mockResponse(POLICY_STATE);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Chính sách thiết bị' }));
    await screen.findByDisplayValue('15');

    await user.click(screen.getByRole('button', { name: 'Phát hành' }));

    expect(
      await screen.findByText('Phiên bản policy đã thay đổi (hiện tại: v3). Hãy tải lại trước khi công bố.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải lại' })).toBeInTheDocument();
    expect(publishCalls).toBe(1);
  });

  it('audit: hiển thị bản ghi với metadata trong details (text)', async () => {
    renderPage(<AdminPage />, (url) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: ADMIN });
      if (u.includes('/admin/users?')) return mockResponse({ items: [], nextCursor: null });
      if (u.includes('/admin/audit')) {
        return mockResponse({
          items: [
            {
              id: 1,
              actorUserId: ADMIN.id,
              actorKind: 'user',
              action: 'admin.user.disable',
              targetType: 'user',
              targetId: '1f2d3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b',
              outcome: 'success',
              requestId: null,
              metadata: { reason: 'Tài khoản spam' },
              createdAt: '2026-11-14T09:30:00.000Z',
            },
          ],
          nextCursor: null,
        });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Audit' }));
    expect(await screen.findByText('admin.user.disable')).toBeInTheDocument();
    expect(screen.getByText('Thành công')).toBeInTheDocument();
    await user.click(screen.getByText('Chi tiết kỹ thuật'));
    expect(screen.getByText(/"reason": "Tài khoản spam"/)).toBeInTheDocument();
  });

  it('tab Thiết bị: tải GET /admin/devices, hiển thị serial/hồ sơ/firmware/lần thấy cuối, không có dữ liệu sức khỏe', async () => {
    const calls: DeviceCall[] = [];
    renderPage(<AdminPage />, deviceHandler({ calls }));

    // 4 tab cũ vẫn còn, tab mặc định vẫn là Tổng quan.
    expect(await screen.findByRole('button', { name: 'Tổng quan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Người dùng' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chính sách thiết bị' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Audit' })).toBeInTheDocument();

    const { list, firstItem } = await openDevicesTab();
    expect(await within(firstItem).findByText('SN-ADMIN-001')).toBeInTheDocument();
    expect(within(firstItem).getByText('Vòng tay Bà Năm')).toBeInTheDocument();
    expect(within(firstItem).getByText(ASSIGNED_SUBJECT_ID)).toBeInTheDocument();
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
    const { user, firstItem } = await openDevicesTab();

    await user.click(within(firstItem).getByRole('button', { name: 'Tạo mã gắn thiết bị' }));

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
          call.url.endsWith(`/admin/devices/${FIRST_DEVICE_ID}/claim-code`),
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
    await user.click(await screen.findByRole('button', { name: 'Thiết bị' }));

    expect(await screen.findByText('Không tải được danh sách thiết bị')).toBeInTheDocument();
    expect(screen.getByText('Máy chủ quản trị đang lỗi.')).toBeInTheDocument();
  });

  it('tab Thiết bị: lỗi tạo claim code hiện thông báo, không hiện mã giả', async () => {
    renderPage(
      <AdminPage />,
      deviceHandler({
        claimResponse: () =>
          mockResponse(errorEnvelope('Không tạo được mã lúc này.', 'INTERNAL'), 500),
      }),
    );
    const { user, firstItem } = await openDevicesTab();

    await user.click(within(firstItem).getByRole('button', { name: 'Tạo mã gắn thiết bị' }));

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
    await user.click(await screen.findByRole('button', { name: 'Thiết bị' }));

    expect(await screen.findByText('Chưa có thiết bị nào')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Danh sách thiết bị' })).not.toBeInTheDocument();
  });
});
