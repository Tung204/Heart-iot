import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { SESSION, me401Response, mockResponse, renderApp } from '../test/utils';

// FR-01 (phần công khai) — trang giới thiệu tối giản: một màn giới thiệu,
// một section 3 thẻ, một dòng dữ liệu mô phỏng; không còn các khối giải thích dài.
describe('LandingPage', () => {
  it('một màn giới thiệu: h1, CTA thật và đúng một dòng dữ liệu mô phỏng', () => {
    renderApp('/', () => me401Response());

    expect(
      screen.getByRole('heading', { level: 1, name: 'Người thân ở nhà, mình vẫn an tâm' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('An Nhiên').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Tạo tài khoản' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(screen.getAllByRole('link', { name: 'Đăng nhập' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dữ liệu mô phỏng · không thay thế cấp cứu.')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByText(/bản demo|đồ án|giảng viên|nghiệm thu|chưa được duyệt/i)).toBeNull();
  });

  it('chỉ còn section "An Nhiên làm gì" với đúng 3 thẻ một câu', () => {
    renderApp('/', () => me401Response());

    expect(
      screen.getByRole('heading', { level: 2, name: 'An Nhiên làm gì' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
    expect(screen.getByRole('heading', { level: 3, name: 'Theo dõi' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Báo khi cần' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Hỏi đáp' })).toBeInTheDocument();
    expect(
      screen.getByText('Nhịp tim, vận động và kết nối thiết bị của người thân.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Cảnh báo do hệ thống tạo, không phụ thuộc trợ lý.')).toBeInTheDocument();
    expect(screen.getByText('Hỏi về số liệu của người thân bằng câu ngắn.')).toBeInTheDocument();

    // Các khối copy dài của bản cũ đã bỏ hẳn.
    expect(screen.queryByRole('heading', { name: 'Vì sao An Nhiên?' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Cách hoạt động' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Trợ lý ở trung tâm' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Ranh giới an toàn' })).toBeNull();
  });

  it('đã đăng nhập thì CTA chính mở ứng dụng, không còn CTA tạo tài khoản', async () => {
    renderApp('/', () => mockResponse({ user: SESSION.user }));

    const openAppLinks = await screen.findAllByRole('link', { name: 'Mở ứng dụng' });
    expect(openAppLinks.length).toBeGreaterThan(0);
    for (const link of openAppLinks) {
      expect(link).toHaveAttribute('href', '/app');
    }
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Tạo tài khoản' })).toBeNull();
    });
  });
});
