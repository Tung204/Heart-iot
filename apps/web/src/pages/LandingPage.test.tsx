import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { me401Response, renderApp } from '../test/utils';

// FR-01 (phần công khai) — trang giới thiệu có tên sản phẩm, nhãn demo,
// 3 bước hoạt động và ranh giới an toàn rõ ràng.
describe('LandingPage', () => {
  it('hiển thị tên sản phẩm, nhãn dữ liệu mô phỏng và CTA đăng nhập/đăng ký', async () => {
    renderApp('/', () => me401Response());

    expect(screen.getByRole('heading', { level: 1, name: 'An Nhiên' })).toBeInTheDocument();
    expect(screen.getByText(/dữ liệu mô phỏng/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Đăng nhập' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Tạo tài khoản' }).length).toBeGreaterThan(0);
  });

  it('mô tả đủ 3 bước hoạt động', async () => {
    renderApp('/', () => me401Response());

    expect(await screen.findByText('Gắn thiết bị đeo')).toBeInTheDocument();
    expect(screen.getByText('Dữ liệu về hệ thống')).toBeInTheDocument();
    expect(screen.getByText('Người thân nắm tình hình')).toBeInTheDocument();
  });

  it('nêu rõ ranh giới: không tự gọi cấp cứu, không push khi đóng trình duyệt', async () => {
    renderApp('/', () => me401Response());

    expect(screen.getAllByText(/không tự gọi cấp cứu/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/khi trình duyệt đã đóng/i).length).toBeGreaterThan(0);
  });
});
