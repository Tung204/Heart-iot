import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { me401Response, renderApp } from '../test/utils';

// FR-01 (phần công khai) — trang giới thiệu có tên sản phẩm, nhãn dữ liệu mô phỏng,
// 3 bước hoạt động, trợ lý ở trung tâm và ranh giới an toàn rõ ràng.
describe('LandingPage', () => {
  it('hiển thị tên sản phẩm, nhãn dữ liệu mô phỏng và CTA trợ lý/đăng ký', async () => {
    renderApp('/', () => me401Response());

    expect(
      screen.getByRole('heading', { level: 1, name: 'Người thân ở nhà, mình vẫn an tâm' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('An Nhiên').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/dữ liệu mô phỏng/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Mở trợ lý' })).toHaveAttribute('href', '/app');
    expect(screen.getAllByRole('link', { name: 'Đăng nhập' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Tạo tài khoản' }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/bản demo|đồ án/i)).not.toBeInTheDocument();
  });

  it('mô tả đủ 3 bước hoạt động và vai trò của trợ lý', async () => {
    renderApp('/', () => me401Response());

    expect(await screen.findByText('Gắn thiết bị đeo')).toBeInTheDocument();
    expect(screen.getByText('Dữ liệu về hệ thống')).toBeInTheDocument();
    expect(screen.getByText('Trợ lý tóm tắt, người thân quyết định')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trợ lý ở trung tâm' })).toBeInTheDocument();
    expect(screen.getByText('Cảnh báo không phụ thuộc AI')).toBeInTheDocument();
  });

  it('nêu rõ ranh giới: không tự gọi cấp cứu, không push khi đóng trình duyệt', async () => {
    renderApp('/', () => me401Response());

    expect(screen.getAllByText(/không tự gọi cấp cứu/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/khi trình duyệt đã đóng/i).length).toBeGreaterThan(0);
  });
});
