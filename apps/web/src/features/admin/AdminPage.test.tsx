import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminPage } from './AdminPage';
import { errorEnvelope, mockResponse, renderPage } from '../../test/utils';

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
    expect(await screen.findByText(/Đã phát hành policy phiên bản 3/)).toBeInTheDocument();
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

    await user.click(await screen.findByRole('button', { name: 'Chính sách thiết bị' }));
    await screen.findByDisplayValue('15');

    // Phải preview trước — nút Phát hành bị khóa nếu chưa có preview đúng nội dung.
    expect(screen.getByRole('button', { name: 'Phát hành' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Xem trước' }));
    expect(await screen.findByText(/Giá trị hợp lệ/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Phát hành' }));

    expect(
      await screen.findByText('Phiên bản policy đã thay đổi (hiện tại: v3). Hãy tải lại trước khi công bố.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải lại' })).toBeInTheDocument();
    expect(publishCalls).toBe(1);
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

    await user.click(await screen.findByRole('button', { name: 'Chính sách thiết bị' }));
    await screen.findByDisplayValue('15');

    // Publish không preview → bị khóa, không gọi API.
    const publishButton = screen.getByRole('button', { name: 'Phát hành' });
    expect(publishButton).toBeDisabled();
    await user.click(publishButton);
    expect(publishBodies).toHaveLength(0);
    expect(previewBodies).toHaveLength(0);

    const heartbeatField = screen.getByLabelText('Chu kỳ gửi nhịp tim (giây)');
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

    await user.click(await screen.findByRole('button', { name: 'Chính sách thiết bị' }));
    await screen.findByDisplayValue('15');

    const heartbeatField = screen.getByLabelText('Chu kỳ gửi nhịp tim (giây)');
    await user.clear(heartbeatField);
    await user.type(heartbeatField, '20');
    await user.type(screen.getByLabelText('Ghi chú phát hành (tùy chọn)'), 'Điều chỉnh chu kỳ gửi');
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
    expect(await screen.findByText(/Đã phát hành policy phiên bản 3/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Giá trị hợp lệ/)).not.toBeInTheDocument());
    expect(screen.getByLabelText('Ghi chú phát hành (tùy chọn)')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Phát hành' })).toBeDisabled();
    expect(publishCalls).toBe(2);
    expect(publishBodies[0]).toEqual({
      value: { ...POLICY_VALUE, heartbeatIntervalSeconds: 20 },
      expectedVersion: 2,
      previewDigest: PREVIEW_DIGEST,
      note: 'Điều chỉnh chu kỳ gửi',
    });
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
});
