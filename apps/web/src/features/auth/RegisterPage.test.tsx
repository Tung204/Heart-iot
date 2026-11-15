import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { me401Response, renderApp } from '../../test/utils';

// FR-01 — form đăng ký: nhãn thật, lỗi field và focus đúng field lỗi đầu tiên.
describe('RegisterPage', () => {
  it('submit rỗng: báo lỗi từng field và focus vào field lỗi đầu tiên', async () => {
    const fetchMock = renderApp('/register', () => me401Response()).fetchMock;
    const user = userEvent.setup();

    await screen.findByRole('heading', { level: 1, name: 'Tạo tài khoản' });
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    expect(await screen.findByText('Vui lòng nhập tên hiển thị.')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập email.')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập mật khẩu.')).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/^Tên hiển thị/);
    expect(nameInput).toHaveFocus();
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput).toHaveAttribute('aria-describedby', 'register-name-error');

    const registerCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/auth/register'),
    );
    expect(registerCalls).toHaveLength(0);
  });

  it('giữ khung tối giản: một câu dẫn và đúng một dòng dữ liệu mô phỏng', async () => {
    renderApp('/register', () => me401Response());

    expect(
      await screen.findByText('Theo dõi người thân cùng An Nhiên.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Dữ liệu mô phỏng · không thay thế cấp cứu.')).toHaveLength(1);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
  });
});
