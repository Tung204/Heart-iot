import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { errorEnvelope, me401Response, mockResponse, renderApp } from '../../test/utils';

// FR-01 — form đăng ký: nhãn thật, lỗi field và focus đúng field lỗi đầu tiên.
describe('RegisterPage', () => {
  it('submit rỗng: báo lỗi từng field và focus vào field lỗi đầu tiên', async () => {
    const fetchMock = renderApp('/register', () => me401Response()).fetchMock;
    const user = userEvent.setup();

    await screen.findByLabelText(/^Tên của bạn/);
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    expect(await screen.findByText('Vui lòng nhập tên của bạn.')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập email.')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập mật khẩu.')).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/^Tên của bạn/);
    expect(nameInput).toHaveFocus();
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput).toHaveAttribute('aria-describedby', 'register-name-error');

    const registerCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/auth/register'),
    );
    expect(registerCalls).toHaveLength(0);
  });

  it('mật khẩu nhập lại không khớp: báo lỗi tại field và không gọi API', async () => {
    const fetchMock = renderApp('/register', () => me401Response()).fetchMock;
    const user = userEvent.setup();

    await screen.findByLabelText(/^Tên của bạn/);
    await user.type(screen.getByLabelText(/^Tên của bạn/), 'Ngọc');
    await user.type(screen.getByLabelText(/^Email/), 'con@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/), 'mat-khau-du-dai');
    await user.type(screen.getByLabelText(/^Nhập lại mật khẩu/), 'mat-khau-khac');
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    expect(await screen.findByText('Mật khẩu nhập lại không khớp.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nhập lại mật khẩu/)).toHaveFocus();
    const registerCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/auth/register'),
    );
    expect(registerCalls).toHaveLength(0);
  });

  it('lỗi máy chủ khi tạo tài khoản: báo rõ và giữ nguyên dữ liệu đã nhập', async () => {
    renderApp('/register', (url) => {
      if (String(url).endsWith('/me')) return me401Response();
      return mockResponse(errorEnvelope('Máy chủ đang gặp lỗi.', 'INTERNAL'), 500);
    });
    const user = userEvent.setup();

    await screen.findByLabelText(/^Tên của bạn/);
    await user.type(screen.getByLabelText(/^Tên của bạn/), 'Ngọc');
    await user.type(screen.getByLabelText(/^Email/), 'con@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/), 'mat-khau-du-dai');
    await user.type(screen.getByLabelText(/^Nhập lại mật khẩu/), 'mat-khau-du-dai');
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    expect(await screen.findByText('Máy chủ đang gặp lỗi.')).toBeInTheDocument();
    // Không xóa input khi lỗi mạng/5xx.
    expect(screen.getByLabelText(/^Tên của bạn/)).toHaveValue('Ngọc');
    expect(screen.getByLabelText(/^Email/)).toHaveValue('con@example.com');
  });

  it('chống gửi hai lần: hai lần submit liên tiếp chỉ tạo một yêu cầu đăng ký', async () => {
    let registerCalls = 0;
    const fetchMock = renderApp('/register', (url) => {
      if (String(url).endsWith('/me')) return me401Response();
      registerCalls += 1;
      return new Promise<Response>(() => {
        // Pending cố ý: nút chưa kịp disabled giữa hai lần submit.
      });
    }).fetchMock;
    const user = userEvent.setup();

    await screen.findByLabelText(/^Tên của bạn/);
    await user.type(screen.getByLabelText(/^Tên của bạn/), 'Ngọc');
    await user.type(screen.getByLabelText(/^Email/), 'con@example.com');
    await user.type(screen.getByLabelText(/^Mật khẩu/), 'mat-khau-du-dai');
    await user.type(screen.getByLabelText(/^Nhập lại mật khẩu/), 'mat-khau-du-dai');
    const form = document.querySelector('form');
    expect(form).not.toBeNull();
    if (!form) return;

    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(registerCalls).toBe(1));
    const requests = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/auth/register'),
    );
    expect(requests).toHaveLength(1);
  });

  it('giữ next nội bộ sang trang đăng nhập', async () => {
    renderApp('/register?next=%2Finvite%2Ftoken-hop-le-day-du-ky-tu', () => me401Response());

    expect(await screen.findByRole('link', { name: 'Đăng nhập' })).toHaveAttribute(
      'href',
      '/login?next=%2Finvite%2Ftoken-hop-le-day-du-ky-tu',
    );
  });

  it('khung đăng ký gọn: một H1, một dòng dữ liệu mô phỏng, không intro lặp', async () => {
    renderApp('/register', () => me401Response());

    await screen.findByLabelText(/^Tên của bạn/);
    expect(screen.getAllByText('Dữ liệu mô phỏng · không thay thế cấp cứu.')).toHaveLength(1);
    expect(screen.queryByText('Theo dõi sức khỏe người thân cùng trợ lý AI.')).toBeNull();
    expect(screen.queryByText(/An Nhiên/)).toBeNull();
    expect(document.querySelectorAll('h1')).toHaveLength(1);
  });
});
