import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import {
  SUBJECT,
  errorEnvelope,
  me401Response,
  mockResponse,
  renderApp,
} from '../../test/utils';

const INVITATION = {
  subjectName: SUBJECT.displayName,
  inviterName: 'Ngọc',
  permissions: SUBJECT.permissions,
  expiresAt: '2026-11-20T09:00:00.000Z',
  status: 'pending',
};

// FR-05 — xem lời mời công khai: lỗi rõ ràng, quyền dạng danh sách, có đường thoát.
describe('InvitePage', () => {
  it('lời mời không dùng được: nêu đã hết hạn/đã dùng, nhắc kiểm tra link và có nút về trang chủ', async () => {
    renderApp('/invite/token-khong-hop-le', (url) => {
      if (String(url).endsWith('/me')) return me401Response();
      return mockResponse(errorEnvelope('Không tìm thấy lời mời.', 'NOT_FOUND'), 404);
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lời mời không hợp lệ' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Lời mời này không tồn tại, đã hết hạn hoặc đã được dùng. Hãy kiểm tra lại link hoặc nhờ người mời gửi lời mời mới.',
      ),
    ).toBeInTheDocument();

    const home = screen.getByRole('link', { name: 'Về trang chủ' });
    expect(home).toHaveAttribute('href', '/');
    expect(home).toHaveClass('button');
    // Header công khai dùng tên trung tính, không còn tên tự đặt.
    expect(screen.getByRole('link', { name: 'Theo dõi sức khỏe' })).toHaveAttribute('href', '/');
    expect(screen.queryByText(/An Nhiên/)).toBeNull();
    expect(screen.getAllByText('Dữ liệu mô phỏng · không thay thế cấp cứu.')).toHaveLength(1);
  });

  it('lời mời hợp lệ: quyền là danh sách ngắn, dùng thuật ngữ “trợ lý AI”', async () => {
    renderApp('/invite/token-hop-le', (url) => {
      if (String(url).endsWith('/me')) return me401Response();
      return mockResponse(INVITATION);
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lời mời theo dõi' }),
    ).toBeInTheDocument();

    const items = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(items).toEqual([
      'Xem lịch sử tối đa 30 ngày',
      'Nhận cảnh báo',
      'Xác nhận hỗ trợ',
      'Đóng cảnh báo',
      'Không xem tóm tắt từ trợ lý AI',
    ]);
    expect(screen.queryByText(/không xem AI/i)).toBeNull();
    expect(screen.getByRole('link', { name: 'Đăng nhập để tiếp tục' })).toHaveClass('button');
  });

  it('lỗi máy chủ khi tải lời mời: còn đường thử lại và dòng dữ liệu mô phỏng', async () => {
    renderApp('/invite/token-loi-may-chu', (url) => {
      if (String(url).endsWith('/me')) return me401Response();
      return mockResponse(errorEnvelope('Máy chủ đang gặp lỗi.', 'INTERNAL'), 500);
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Không kiểm tra được lời mời' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.getAllByText('Dữ liệu mô phỏng · không thay thế cấp cứu.')).toHaveLength(1);
  });
});
