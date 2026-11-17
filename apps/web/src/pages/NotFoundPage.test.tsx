import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { me401Response, renderApp } from '../test/utils';

// §5.14 — 404 công khai: layout phẳng, một H1, về trang chủ + gợi ý kiểm link mời.
describe('NotFoundPage', () => {
  it('một H1, nhãn 404 phụ, đường về trang chủ và hướng dẫn kiểm link lời mời', () => {
    renderApp('/khong-ton-tai', () => me401Response());

    expect(
      screen.getByRole('heading', { level: 1, name: 'Không tìm thấy trang' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('Lỗi 404')).toBeInTheDocument();
    expect(screen.getByText(/link lời mời/i)).toBeInTheDocument();

    const home = screen.getByRole('link', { name: 'Về trang chủ' });
    expect(home).toHaveAttribute('href', '/');
    expect(home).toHaveClass('button');

    // Không tái dùng thẻ auth cũ; header/footer công khai vẫn có brand trung tính.
    expect(document.querySelector('.auth-card')).toBeNull();
    expect(document.querySelector('.auth-page')).toBeNull();
    expect(screen.getByRole('link', { name: 'Theo dõi sức khỏe' })).toHaveAttribute('href', '/');
    expect(screen.getAllByText('Dữ liệu mô phỏng · không thay thế cấp cứu.')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Chuyển tới nội dung chính' })).toHaveAttribute(
      'href',
      '#main',
    );
  });
});
