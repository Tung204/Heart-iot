import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from './SettingsPage';
import { errorEnvelope, mockResponse, renderPage, USER, type FetchHandler } from '../../test/utils';

const CURRENT_SESSION = {
  id: '1f4d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b',
  createdAt: '2026-11-15T09:00:00.000Z',
  expiresAt: '2026-11-22T09:00:00.000Z',
  current: true,
};

const OTHER_SESSION = {
  id: '2f4d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5c',
  createdAt: '2026-11-14T08:30:00.000Z',
  expiresAt: '2026-11-21T08:30:00.000Z',
  current: false,
};

type RecordedCall = { path: string; method: string; body: unknown };

/**
 * API giả cho toàn bộ trang cài đặt. `revoked` mô phỏng server đã thu hồi phiên
 * khác để lần tải danh sách tiếp theo phản ánh trạng thái mới.
 */
function createHandler() {
  const calls: RecordedCall[] = [];
  let revoked = false;

  const handler: FetchHandler = (url, init) => {
    const method = init?.method ?? 'GET';
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    const path = url.replace('/api/v1', '');
    calls.push({ path, method, body });

    if (path === '/me' && method === 'GET') return mockResponse({ user: USER });
    if (path === '/me' && method === 'PATCH') {
      const input = body as { displayName: string };
      return mockResponse({ user: { ...USER, displayName: input.displayName } });
    }
    if (path === '/me/sessions' && method === 'GET') {
      return mockResponse({ items: revoked ? [CURRENT_SESSION] : [CURRENT_SESSION, OTHER_SESSION] });
    }
    if (path === '/me/password' && method === 'POST') return mockResponse(undefined, 204);
    if (path === `/me/sessions/${OTHER_SESSION.id}` && method === 'DELETE') {
      revoked = true;
      return mockResponse(undefined, 204);
    }
    if (path === '/me/sessions/revoke-others' && method === 'POST') {
      revoked = true;
      return mockResponse(undefined, 204);
    }
    return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
  };

  return { handler, calls };
}

async function renderSettings() {
  const { handler, calls } = createHandler();
  const utils = renderPage(<SettingsPage />, handler);
  await screen.findByRole('list', { name: 'Các phiên đăng nhập' });
  return { ...utils, calls };
}

describe('SettingsPage — cài đặt tài khoản', () => {
  it('hiển thị 3 phần Hồ sơ/Mật khẩu/Phiên đăng nhập với danh sách phiên có nhãn truy cập', async () => {
    await renderSettings();

    expect(screen.getByRole('heading', { name: 'Hồ sơ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mật khẩu' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Phiên đăng nhập' })).toBeInTheDocument();

    const list = await screen.findByRole('list', { name: 'Các phiên đăng nhập' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Thiết bị này')).toBeInTheDocument();
    expect(within(list).getByText('Thiết bị khác')).toBeInTheDocument();

    // Chỉ phiên khác mới có nút thu hồi; phiên hiện tại được giải thích bằng chữ.
    expect(within(list).getAllByRole('button', { name: /Thu hồi/ })).toHaveLength(1);
    expect(
      within(list).getByRole('button', { name: /Thu hồi phiên đăng nhập lúc/ }),
    ).toBeInTheDocument();
  });

  it('có nhãn và mô tả cho từng trường; phiên hiện tại không thu hồi được', async () => {
    await renderSettings();

    expect(screen.getByLabelText(/^Tên hiển thị/)).toHaveAccessibleDescription(
      'Tối đa 120 ký tự.',
    );
    expect(screen.getByLabelText(/^Mật khẩu hiện tại/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Mật khẩu mới/)).toHaveAccessibleDescription(
      /Tối thiểu 10 ký tự/,
    );
    expect(screen.getByLabelText(/^Nhập lại mật khẩu mới/)).toBeInTheDocument();

    const currentRow = screen
      .getByText('Thiết bị này')
      .closest('li') as HTMLElement;
    expect(within(currentRow).queryByRole('button')).not.toBeInTheDocument();
    expect(within(currentRow).getByText(/Phiên bạn đang dùng/)).toBeInTheDocument();
  });

  it('tên hiển thị rỗng → lỗi tại chỗ, không gọi PATCH', async () => {
    const { calls } = await renderSettings();
    const user = userEvent.setup();

    const input = screen.getByLabelText(/^Tên hiển thị/);
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'Lưu tên hiển thị' }));

    expect(await screen.findByText('Vui lòng nhập tên hiển thị.')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);
  });

  it('mật khẩu mới quá ngắn hoặc nhập lại không khớp → lỗi tại chỗ, không gọi API', async () => {
    const { calls } = await renderSettings();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^Mật khẩu hiện tại/), 'mat-khau-demo-123');
    await user.type(screen.getByLabelText(/^Mật khẩu mới/), 'ngan');
    await user.type(screen.getByLabelText(/^Nhập lại mật khẩu mới/), 'ngan');
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    expect(await screen.findByText('Mật khẩu mới cần ít nhất 10 ký tự.')).toBeInTheDocument();
    expect(calls.filter((call) => call.path === '/me/password')).toHaveLength(0);

    await user.clear(screen.getByLabelText(/^Mật khẩu mới/));
    await user.type(screen.getByLabelText(/^Mật khẩu mới/), 'mat-khau-moi-456');
    await user.clear(screen.getByLabelText(/^Nhập lại mật khẩu mới/));
    await user.type(screen.getByLabelText(/^Nhập lại mật khẩu mới/), 'mat-khau-moi-457');
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    expect(await screen.findByText('Mật khẩu nhập lại không khớp.')).toBeInTheDocument();
    expect(calls.filter((call) => call.path === '/me/password')).toHaveLength(0);
  });

  it('đổi tên thành công → gọi PATCH đúng body và hiện thông báo', async () => {
    const { calls } = await renderSettings();
    const user = userEvent.setup();

    const input = screen.getByLabelText(/^Tên hiển thị/);
    await user.clear(input);
    await user.type(input, 'Bà Ngọc Mới');
    await user.click(screen.getByRole('button', { name: 'Lưu tên hiển thị' }));

    expect(await screen.findByText('Đã lưu tên hiển thị')).toBeInTheDocument();
    const patch = calls.find((call) => call.method === 'PATCH');
    expect(patch?.path).toBe('/me');
    expect(patch?.body).toEqual({ displayName: 'Bà Ngọc Mới' });
    expect(input).toHaveValue('Bà Ngọc Mới');
  });

  it('đổi mật khẩu thành công → gọi POST đúng body, không đăng xuất', async () => {
    const { calls } = await renderSettings();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^Mật khẩu hiện tại/), 'mat-khau-demo-123');
    await user.type(screen.getByLabelText(/^Mật khẩu mới/), 'mat-khau-moi-456');
    await user.type(screen.getByLabelText(/^Nhập lại mật khẩu mới/), 'mat-khau-moi-456');
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    expect(await screen.findByText('Đã đổi mật khẩu')).toBeInTheDocument();
    const post = calls.find((call) => call.path === '/me/password');
    expect(post?.method).toBe('POST');
    expect(post?.body).toEqual({
      currentPassword: 'mat-khau-demo-123',
      newPassword: 'mat-khau-moi-456',
    });
    expect(calls.some((call) => call.path === '/auth/logout')).toBe(false);
    expect(screen.getByLabelText(/^Mật khẩu hiện tại/)).toHaveValue('');
  });

  it('lỗi từ server → gắn lỗi tại trường/banner, không làm mất dữ liệu đã nhập', async () => {
    const handler: FetchHandler = (url, init) => {
      const method = init?.method ?? 'GET';
      const path = url.replace('/api/v1', '');
      if (path === '/me' && method === 'GET') return mockResponse({ user: USER });
      if (path === '/me/sessions') return mockResponse({ items: [CURRENT_SESSION] });
      if (path === '/me' && method === 'PATCH') {
        return mockResponse(
          {
            code: 'VALIDATION_FAILED',
            message: 'Dữ liệu gửi lên không hợp lệ.',
            requestId: 'req-422',
            details: [{ path: 'displayName', message: 'Tên hiển thị chưa hợp lệ.' }],
          },
          422,
        );
      }
      if (path === '/me/password') {
        return mockResponse(
          errorEnvelope('Mật khẩu hiện tại không đúng.', 'VALIDATION_FAILED'),
          400,
        );
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    };
    renderPage(<SettingsPage />, handler);
    await screen.findByRole('list', { name: 'Các phiên đăng nhập' });
    const user = userEvent.setup();

    const input = screen.getByLabelText(/^Tên hiển thị/);
    await user.clear(input);
    await user.type(input, 'Tên khác');
    await user.click(screen.getByRole('button', { name: 'Lưu tên hiển thị' }));

    expect(await screen.findByText('Tên hiển thị chưa hợp lệ.')).toBeInTheDocument();
    expect(input).toHaveValue('Tên khác');

    await user.type(screen.getByLabelText(/^Mật khẩu hiện tại/), 'sai-mat-khau');
    await user.type(screen.getByLabelText(/^Mật khẩu mới/), 'mat-khau-moi-456');
    await user.type(screen.getByLabelText(/^Nhập lại mật khẩu mới/), 'mat-khau-moi-456');
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    expect(await screen.findByText('Mật khẩu hiện tại không đúng.')).toBeInTheDocument();
  });

  it('thu hồi phiên khác → xác nhận trong dòng rồi gọi DELETE, giữ phiên hiện tại', async () => {
    const { calls } = await renderSettings();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Thu hồi phiên đăng nhập lúc/ }));

    const group = screen.getByRole('group', { name: 'Xác nhận thu hồi phiên' });
    expect(within(group).getByText(/Thiết bị đó sẽ phải đăng nhập lại/)).toBeInTheDocument();
    await user.click(within(group).getByRole('button', { name: 'Xác nhận thu hồi' }));

    expect(await screen.findByText('Đã thu hồi phiên đăng nhập đã chọn. Thiết bị đó cần đăng nhập lại.'))
      .toBeInTheDocument();
    const remove = calls.find((call) => call.method === 'DELETE');
    expect(remove?.path).toBe(`/me/sessions/${OTHER_SESSION.id}`);

    await waitFor(() => {
      const list = screen.getByRole('list', { name: 'Các phiên đăng nhập' });
      expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    });
    expect(screen.queryByText('Thiết bị khác')).not.toBeInTheDocument();
  });

  it('hủy trong dòng xác nhận → không gọi DELETE', async () => {
    const { calls } = await renderSettings();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Thu hồi phiên đăng nhập lúc/ }));
    const group = screen.getByRole('group', { name: 'Xác nhận thu hồi phiên' });
    await user.click(within(group).getByRole('button', { name: 'Hủy' }));

    expect(screen.queryByRole('group', { name: 'Xác nhận thu hồi phiên' })).not.toBeInTheDocument();
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
  });

  it('thu hồi tất cả phiên khác → gọi POST revoke-others sau khi xác nhận', async () => {
    const { calls } = await renderSettings();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Thu hồi tất cả phiên khác' }));
    const group = screen.getByRole('group', { name: 'Xác nhận thu hồi tất cả phiên khác' });
    expect(within(group).getByText(/1 phiên khác/)).toBeInTheDocument();
    await user.click(within(group).getByRole('button', { name: 'Xác nhận thu hồi tất cả' }));

    expect(
      await screen.findByText('Đã thu hồi tất cả phiên đăng nhập khác. Chỉ thiết bị này còn đăng nhập.'),
    ).toBeInTheDocument();
    expect(
      calls.some((call) => call.path === '/me/sessions/revoke-others' && call.method === 'POST'),
    ).toBe(true);
    await waitFor(() => {
      const list = screen.getByRole('list', { name: 'Các phiên đăng nhập' });
      expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    });
  });
});
