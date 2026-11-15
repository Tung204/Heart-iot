import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertsPage } from './AlertsPage';
import {
  errorEnvelope,
  INCIDENT,
  mockResponse,
  renderPage,
  SUBJECT,
  USER,
} from '../../test/utils';

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

// FR-06 / vòng đời suspected → unconfirmed — cảnh báo "Chưa xác định" phải mở được.
describe('AlertsPage — cảnh báo chưa xác định', () => {
  it('tab Đã đóng hiện ứng viên quá hạn với nhãn "Chưa xác định" + ghi chú thiếu kết quả cuối, có link chi tiết', async () => {
    renderPage(<AlertsPage />, (url) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.includes(`/subjects/${SUBJECT.id}/alerts`)) {
        return mockResponse({
          items: [{ ...INCIDENT, state: 'unconfirmed', version: 2 }],
          nextCursor: null,
        });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Đã đóng' }));

    expect(await screen.findByText('Chưa xác định')).toBeInTheDocument();
    expect(screen.getByText(/thiết bị không gửi kết quả cuối/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Chi tiết' })).toHaveAttribute(
      'href',
      `/app/alerts/${INCIDENT.id}`,
    );
    // Không phải trạng thái cần xử lý: không hiện nút Xác nhận.
    expect(screen.queryByRole('button', { name: 'Xác nhận' })).not.toBeInTheDocument();
  });
});

// F-P1-2 / xác nhận thất bại không phải 409 phải hiện lỗi thân thiện, có thể thử lại,
// và giữ nguyên trạng thái cảnh báo (không im lặng, không tự đổi danh sách).
describe('AlertsPage — xác nhận thất bại', () => {
  it('lỗi 500 → alert thân thiện + nút Thử lại, danh sách giữ trạng thái Đang mở', async () => {
    renderPage(<AlertsPage />, (url, reqInit) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.includes('/alerts/') && u.endsWith('/acknowledge') && reqInit?.method === 'POST') {
        return mockResponse(errorEnvelope('Máy chủ đang bận.', 'INTERNAL'), 500);
      }
      if (u.includes(`/subjects/${SUBJECT.id}/alerts`)) {
        return mockResponse({ items: [INCIDENT], nextCursor: null });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Xác nhận' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Chưa xác nhận được cảnh báo');
    expect(alert).toHaveTextContent('Máy chủ đang bận.');
    expect(within(alert).getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    // Không im lặng và không tự đổi trạng thái: vẫn còn cảnh báo đang mở + nút xác nhận.
    expect(screen.getByText(/chưa có người xác nhận/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeEnabled();
  });

  it('cảnh báo đã acknowledged → không hiện nút Xác nhận', async () => {
    renderPage(<AlertsPage />, (url) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.includes(`/subjects/${SUBJECT.id}/alerts`)) {
        return mockResponse({
          items: [
            {
              ...INCIDENT,
              state: 'acknowledged',
              acknowledgedBy: { userId: USER.id, displayName: 'Trần Thị An' },
            },
          ],
          nextCursor: null,
        });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByText(/Đã xác nhận bởi Trần Thị An/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Chi tiết' })).toBeInTheDocument();
  });

  it('409 khi người khác đã xác nhận → thông điệp đúng, không báo "dữ liệu cũ"', async () => {
    let listCalls = 0;
    renderPage(<AlertsPage />, (url, reqInit) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.includes('/alerts/') && u.endsWith('/acknowledge') && reqInit?.method === 'POST') {
        return mockResponse(errorEnvelope('Phiên bản cảnh báo đã thay đổi.', 'CONFLICT'), 409);
      }
      if (u.includes(`/subjects/${SUBJECT.id}/alerts`)) {
        listCalls += 1;
        return mockResponse({
          items: [
            listCalls === 1
              ? INCIDENT
              : {
                  ...INCIDENT,
                  state: 'acknowledged',
                  acknowledgedBy: { userId: USER.id, displayName: 'Trần Thị An' },
                },
          ],
          nextCursor: null,
        });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Xác nhận' }));

    expect(await screen.findByText('Cảnh báo đã có người xác nhận')).toBeInTheDocument();
    expect(screen.getByText(/Trần Thị An đã xác nhận đang hỗ trợ/)).toBeInTheDocument();
    expect(screen.queryByText(/Danh sách dưới đây có thể cũ/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận' })).not.toBeInTheDocument();
  });
});
