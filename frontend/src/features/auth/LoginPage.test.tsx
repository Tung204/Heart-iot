import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SESSION,
  SUBJECT,
  errorEnvelope,
  me401Response,
  mockResponse,
  renderApp,
} from '../../test/utils';

// FR-01 — form đăng nhập: nhãn thật, lỗi field, lỗi API đúng loại, điều hướng /app.
describe('LoginPage', () => {
  it('thiếu email/password thì hiển thị lỗi field và không gọi API login', async () => {
    const fetchMock = renderApp('/login', () => me401Response()).fetchMock;
    const user = userEvent.setup();

    // Chờ kiểm phiên xong (GET /me → 401) rồi bấm đăng nhập với form trống.
    await screen.findByLabelText(/^Email/);
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByText('Vui lòng nhập email.')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập mật khẩu.')).toBeInTheDocument();
    // P2-10: focus vào field lỗi đầu tiên, không chỉ thông báo role=alert.
    expect(screen.getByLabelText(/^Email/)).toHaveFocus();
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute(
      'aria-describedby',
      'login-email-error',
    );

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

    await screen.findByLabelText(/^Email/);
    await user.type(screen.getByLabelText(/^Email/), 'con@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/), 'sai-mat-khau');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByText('Email hoặc mật khẩu không đúng.')).toBeInTheDocument();
    expect(screen.queryByText(/Không kết nối được máy chủ/)).toBeNull();
  });

  it('mất mạng là lỗi kết nối, không bị báo thành sai mật khẩu', async () => {
    renderApp('/login', (url) => {
      if (String(url).endsWith('/me')) return me401Response();
      throw new TypeError('Failed to fetch');
    });
    const user = userEvent.setup();

    await screen.findByLabelText(/^Email/);
    await user.type(screen.getByLabelText(/^Email/), 'con@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/), 'mat-khau-dai');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(
      await screen.findByText('Không kết nối được máy chủ. Kiểm tra kết nối mạng và thử lại.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Email hoặc mật khẩu không đúng.')).toBeNull();
  });

  it('lỗi API khi đăng nhập: focus vào hộp lỗi, không rơi về BODY', async () => {
    renderApp('/login', (url) => {
      if (String(url).endsWith('/me')) return me401Response();
      return mockResponse(
        errorEnvelope('Email hoặc mật khẩu không đúng.', 'UNAUTHENTICATED'),
        401,
      );
    });
    const user = userEvent.setup();

    await screen.findByLabelText(/^Email/);
    await user.type(screen.getByLabelText(/^Email/), 'con@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/), 'sai-mat-khau');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    // Giữ role=alert và đưa focus vào chính hộp lỗi (R-05).
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Email hoặc mật khẩu không đúng.');
    const active = document.activeElement as HTMLElement | null;
    expect(active).not.toBeNull();
    expect(active).not.toBe(document.body);
    expect(active).toContainElement(alert);
  });

  it('chống gửi hai lần: hai lần submit liên tiếp chỉ tạo một yêu cầu đăng nhập', async () => {
    let loginCalls = 0;
    const fetchMock = renderApp('/login', (url) => {
      if (String(url).endsWith('/me')) return me401Response();
      loginCalls += 1;
      return new Promise<Response>(() => {
        // Giữ request pending để nút chưa kịp chuyển trạng thái giữa hai lần submit.
      });
    }).fetchMock;
    const user = userEvent.setup();

    await screen.findByLabelText(/^Email/);
    await user.type(screen.getByLabelText(/^Email/), 'con@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/), 'mat-khau-dai');
    const form = document.querySelector('form');
    expect(form).not.toBeNull();
    if (!form) return;

    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(loginCalls).toBe(1));
    const loginRequests = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/auth/login'),
    );
    expect(loginRequests).toHaveLength(1);
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
        return mockResponse({ items: [] });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await screen.findByLabelText(/^Email/);
    await user.type(screen.getByLabelText(/^Email/), 'con@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/), 'mat-khau-dai');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByText('Ngọc')).toBeInTheDocument();
  });

  it('giữ next nội bộ sang trang đăng ký', async () => {
    renderApp('/login?next=%2Fapp%2Fsettings', () => me401Response());

    expect(
      await screen.findByRole('link', { name: 'Tạo tài khoản mới' }),
    ).toHaveAttribute('href', '/register?next=%2Fapp%2Fsettings');
  });

  it('next bên ngoài không được dùng làm đích sau khi đăng nhập', async () => {
    const { router } = renderApp('/login?next=https%3A%2F%2Fevil.example', (url) => {
      const u = String(url);
      if (u.endsWith('/me')) return me401Response();
      if (u.endsWith('/auth/login')) return mockResponse(SESSION);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await screen.findByLabelText(/^Email/);
    // next ngoài bị bỏ: link đăng ký không mang tham số độc hại.
    expect(screen.getByRole('link', { name: 'Tạo tài khoản mới' })).toHaveAttribute(
      'href',
      '/register',
    );
    await user.type(screen.getByLabelText(/^Email/), 'con@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/), 'mat-khau-dai');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/app'));
  });

  it('next dạng //host cũng không được dùng làm đích', async () => {
    const { router } = renderApp('/login?next=%2F%2Fevil.example', (url) => {
      const u = String(url);
      if (u.endsWith('/me')) return me401Response();
      if (u.endsWith('/auth/login')) return mockResponse(SESSION);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await screen.findByLabelText(/^Email/);
    await user.type(screen.getByLabelText(/^Email/), 'con@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/), 'mat-khau-dai');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/app'));
  });

  it('giữ khung tối giản: một câu dẫn và đúng một dòng dữ liệu mô phỏng', async () => {
    renderApp('/login', () => me401Response());

    expect(
      await screen.findByText('Xem tình hình người thân và cảnh báo.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Dữ liệu mô phỏng · không thay thế cấp cứu.')).toHaveLength(1);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
  });

  it('không còn khối “Tài khoản trải nghiệm” hay nút tự điền tài khoản', async () => {
    renderApp('/login', () => me401Response());

    await screen.findByLabelText(/^Email/);

    expect(screen.queryByText('Tài khoản trải nghiệm')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Chủ hồ sơ' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Người thân' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quản trị' })).toBeNull();
    expect(document.querySelector('details')).toBeNull();

    // Không có nút tự điền, và form công khai bắt đầu trống.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByLabelText(/^Email/)).toHaveValue('');
    expect(screen.getByLabelText(/^Mật khẩu/)).toHaveValue('');
    expect(screen.queryByDisplayValue(/@demo\.heart-iot\.local/)).toBeNull();
    expect(document.body.textContent).not.toContain('demo-admin-2026');
  });
});
