import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SESSION, errorEnvelope, me401Response, mockResponse, renderApp } from '../../test/utils';

// FR-01 — form đăng nhập: nhãn thật, lỗi field, lỗi API, điều hướng /app khi thành công.
describe('LoginPage', () => {
  it('thiếu email/password thì hiển thị lỗi field và không gọi API login', async () => {
    const fetchMock = renderApp('/login', () => me401Response()).fetchMock;
    const user = userEvent.setup();

    // Chờ kiểm phiên xong (GET /me → 401) rồi bấm đăng nhập với form trống.
    await screen.findByRole('heading', { level: 1, name: 'Đăng nhập' });
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByText('Vui lòng nhập email.')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập mật khẩu.')).toBeInTheDocument();

    const loginCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/auth/login'),
    );
    expect(loginCalls).toHaveLength(0);
  });

  it('hiển thị thông báo lỗi API cụ thể khi sai mật khẩu', async () => {
    renderApp('/login', (url) => {
      if (String(url).endsWith('/me')) return me401Response();
      return mockResponse(
        errorEnvelope('Email hoặc mật khẩu không đúng.', 'UNAUTHENTICATED'),
        401,
      );
    });
    const user = userEvent.setup();

    await screen.findByRole('heading', { level: 1, name: 'Đăng nhập' });
    await user.type(screen.getByLabelText(/^Email/), 'con@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/), 'sai-mat-khau');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByText('Email hoặc mật khẩu không đúng.')).toBeInTheDocument();
  });

  it('đăng nhập thành công thì điều hướng /app và hiển thị tên người dùng trong shell', async () => {
    let meCount = 0;
    renderApp('/login', (url) => {
      const u = String(url);
      if (u.endsWith('/me')) {
        meCount += 1;
        // Lần gọi đầu (kiểm phiên) → 401; sau khi login set cache thì không gọi lại.
        return meCount === 1 ? me401Response() : mockResponse({ user: SESSION.user });
      }
      if (u.endsWith('/auth/login')) {
        return mockResponse(SESSION);
      }
      if (u.endsWith('/subjects')) {
        return mockResponse({ items: [], nextCursor: null });
      }
      return mockResponse({ code: 'NOT_FOUND', message: 'Không tìm thấy.', requestId: 't' }, 404);
    });
    const user = userEvent.setup();

    await screen.findByRole('heading', { level: 1, name: 'Đăng nhập' });
    await user.type(screen.getByLabelText(/^Email/), 'con@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/), 'mat-khau-dai');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    // Wave 2: /app là dashboard + shell; shell hiển thị tên người dùng.
    expect(await screen.findByText('Ngọc')).toBeInTheDocument();
  });

  it('có link chéo sang trang đăng ký', async () => {
    renderApp('/login', () => me401Response());

    expect(
      await screen.findByRole('link', { name: 'Tạo tài khoản mới' }),
    ).toHaveAttribute('href', '/register');
  });

  it('giữ khung tối giản: một câu dẫn và đúng một dòng dữ liệu mô phỏng', async () => {
    renderApp('/login', () => me401Response());

    expect(
      await screen.findByText('Xem tình hình người thân và cảnh báo.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Dữ liệu mô phỏng · không thay thế cấp cứu.')).toHaveLength(1);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
  });

  it('chọn vai trò ở “Tài khoản trải nghiệm” thì điền email/mật khẩu, nút không hiện email', async () => {
    renderApp('/login', () => me401Response());
    const user = userEvent.setup();

    await screen.findByRole('heading', { level: 1, name: 'Đăng nhập' });
    expect(screen.getByText('Tài khoản trải nghiệm')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Chủ hồ sơ' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Người thân' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quản trị' })).toBeInTheDocument();
    expect(screen.queryByText(/@demo\.annhien\.local/)).toBeNull();

    // jsdom không tự mở <details> khi bấm summary: mở trực tiếp rồi bấm nút vai trò.
    const details = screen.getByText('Tài khoản trải nghiệm').closest('details');
    expect(details).not.toBeNull();
    if (details) details.open = true;

    await user.click(screen.getByRole('button', { name: 'Chủ hồ sơ' }));

    expect(screen.getByLabelText(/^Email/)).toHaveValue('ba-an@demo.annhien.local');
    expect(screen.getByLabelText(/^Mật khẩu/)).toHaveValue('demo-an-nhien-2026');
  });
});
