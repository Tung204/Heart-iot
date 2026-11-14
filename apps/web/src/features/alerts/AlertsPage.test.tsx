import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertsPage } from './AlertsPage';
import { errorEnvelope, INCIDENT, mockResponse, renderPage, SUBJECT } from '../../test/utils';

function alertsHandler() {
  return (url: string, reqInit?: RequestInit) => {
    const u = url;
    if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
    if (u.includes('/alerts/') && u.endsWith('/acknowledge') && reqInit?.method === 'POST') {
      // Xác nhận nhanh trên danh sách — mô phỏng cạnh tranh phiên bản.
      return mockResponse(
        errorEnvelope('Cảnh báo đã thay đổi ở nơi khác.', 'CONFLICT'),
        409,
      );
    }
    if (u.includes(`/subjects/${SUBJECT.id}/alerts`)) {
      return mockResponse({ items: [INCIDENT], nextCursor: null });
    }
    return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
  };
}

// FR-13 / danh sách cảnh báo — empty, error, và cạnh tranh 409 khi xác nhận nhanh.
describe('AlertsPage', () => {
  it('không có cảnh báo mở → EmptyState rõ ràng, không hiện số 0 giả', async () => {
    renderPage(<AlertsPage />, (url) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.includes(`/subjects/${SUBJECT.id}/alerts`)) {
        return mockResponse({ items: [], nextCursor: null });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByText('Không có cảnh báo đang mở')).toBeInTheDocument();
    expect(screen.queryByText(/\b0\b/)).not.toBeInTheDocument();
  });

  it('lỗi tải danh sách → ErrorState có nút thử lại', async () => {
    renderPage(<AlertsPage />, (url) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.includes(`/subjects/${SUBJECT.id}/alerts`)) {
        return mockResponse(errorEnvelope('Lỗi máy chủ.', 'INTERNAL'), 500);
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByText('Không tải được cảnh báo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it('xác nhận nhanh gặp 409 → thông báo phiên bản cũ kèm nút tải lại, không tự đoán', async () => {
    renderPage(<AlertsPage />, alertsHandler());
    const user = userEvent.setup();

    const acknowledgeButton = await screen.findByRole('button', { name: 'Xác nhận' });
    await user.click(acknowledgeButton);

    expect(
      await screen.findByText('Danh sách có thể chưa cập nhật'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải lại danh sách' })).toBeInTheDocument();
  });
});
