import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SESSION,
  errorEnvelope,
  me401Response,
  mockResponse,
  renderApp,
} from '../test/utils';

// FR-01 / route bảo vệ — /app chưa đăng nhập phải chuyển /login (giữ next),
// và lỗi mạng không được suy đoán thành "đã đăng xuất".
describe('ProtectedRoute', () => {
  it('401 khi tải /app → chuyển /login và giữ next để quay lại sau đăng nhập', async () => {
    renderApp('/app', (url) => {
      const u = String(url);
      if (u.endsWith('/me')) return me401Response();
      if (u.endsWith('/auth/login')) return mockResponse(SESSION);
      if (u.endsWith('/subjects')) return mockResponse({ items: [], nextCursor: null });
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    // Bị chuyển hướng sang form đăng nhập.
    expect(await screen.findByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeInTheDocument();

    // Đăng nhập → quay lại đúng /app nhờ tham số next; shell hiển thị tên người dùng.
    await user.type(screen.getByLabelText(/^Email/), 'con@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/), 'mat-khau-dai');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByText('Ngọc')).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Điều hướng ứng dụng' }).length).toBeGreaterThan(0);
  });

  it('lỗi mạng khi kiểm phiên → hiển thị lỗi + nút thử lại, không chuyển /login', async () => {
    let meCalls = 0;
    renderApp('/app', (url) => {
      if (String(url).endsWith('/me')) {
        meCalls += 1;
        // Lần đầu lỗi mạng; lần thử lại trả 401 (hoặc thành công đều được —
        // mục đích: lỗi mạng ban đầu không tự chuyển hướng).
        if (meCalls === 1) {
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        return me401Response();
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    expect(
      await screen.findByText('Không xác nhận được phiên đăng nhập'),
    ).toBeInTheDocument();

    // Không bị đẩy sang trang đăng nhập.
    expect(screen.queryByRole('heading', { level: 1, name: 'Đăng nhập' })).not.toBeInTheDocument();

    // Nút thử lại → gọi lại /me → 401 → lúc này mới chuyển /login.
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeInTheDocument();
  });
});
