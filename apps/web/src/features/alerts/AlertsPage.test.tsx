import { describe, expect, it } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertsPage } from './AlertsPage';
import { queryKeys } from '../../lib/query';
import {
  errorEnvelope,
  INCIDENT,
  mockResponse,
  renderApp,
  renderPage,
  SESSION,
  stubFetch,
  SUBJECT,
  USER,
} from '../../test/utils';

/** Hộp thông báo mẫu đúng hợp đồng @heart-iot/contracts/notifications. */
const NOTIFICATION = {
  id: '4f5d6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b',
  incidentId: INCIDENT.id,
  subjectId: SUBJECT.id,
  subjectName: 'Bà Năm',
  incidentType: 'fall',
  state: 'open',
  revision: 1,
  kind: 'alert',
  sentAt: '2026-11-14T08:00:30.000Z',
  readAt: null,
  createdAt: '2026-11-14T08:00:30.000Z',
};

function alertsHandler() {
  return (url: string, reqInit?: RequestInit) => {
    const u = url;
    if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
    if (u.endsWith('/notifications')) {
      return mockResponse({ items: [], unreadCount: 0 });
    }
    if (u.includes('/alerts/') && u.endsWith('/acknowledge') && reqInit?.method === 'POST') {
      // Xác nhận nhanh trên danh sách — mô phỏng cạnh tranh phiên bản.
      return mockResponse(errorEnvelope('Cảnh báo đã thay đổi ở nơi khác.', 'CONFLICT'), 409);
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
      if (u.endsWith('/notifications')) {
        return mockResponse({ items: [], unreadCount: 0 });
      }
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
      if (u.endsWith('/notifications')) {
        return mockResponse({ items: [], unreadCount: 0 });
      }
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

    const acknowledgeButton = await screen.findByRole('button', { name: 'Tôi đang hỗ trợ' });
    await user.click(acknowledgeButton);
    // Bước hỏi lại rõ ràng, chưa gọi API ở lần bấm đầu.
    expect(screen.getByText('Bạn đã liên hệ và đang hỗ trợ?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Có, tôi đang hỗ trợ' }));

    expect(await screen.findByText('Danh sách có thể chưa cập nhật')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải lại danh sách' })).toBeInTheDocument();
  });
});

// Tab Cảnh báo / Thông báo là URL, không phải state ẩn: reload/back giữ đúng chế độ.
describe('AlertsPage — tab Cảnh báo / Thông báo', () => {
  it('ở danh sách: tab Cảnh báo đang active, tab Thông báo trỏ ?view=notifications', async () => {
    renderPage(<AlertsPage />, alertsHandler());

    await screen.findByRole('link', { name: /Nghi ngã/ });
    const alertsTab = screen.getByRole('link', { name: 'Cảnh báo' });
    const inboxTab = screen.getByRole('link', { name: /Thông báo đã nhận/ });
    expect(alertsTab).toHaveAttribute('aria-current', 'page');
    expect(alertsTab).toHaveAttribute('href', '/app/alerts');
    expect(inboxTab).not.toHaveAttribute('aria-current');
    expect(inboxTab).toHaveAttribute('href', '/app/alerts?view=notifications');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('?view=notifications mount hộp thông báo trong cùng trang: H1 Cảnh báo + H2 Thông báo đã nhận', async () => {
    renderApp('/app/alerts?view=notifications', (url) => {
      const u = String(url);
      if (u.endsWith('/me')) return mockResponse(SESSION);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.endsWith('/notifications')) {
        return mockResponse({ items: [NOTIFICATION], unreadCount: 1 });
      }
      if (u.includes(`/subjects/${SUBJECT.id}/alerts?`)) {
        return mockResponse({ items: [INCIDENT], nextCursor: null });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Thông báo đã nhận' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Cảnh báo' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    const inboxTab = screen.getByRole('link', { name: /Thông báo đã nhận/ });
    expect(inboxTab).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Cảnh báo' })).not.toHaveAttribute('aria-current');

    // Mỗi hàng mở đúng incident của thông báo, không phải hồ sơ đang chọn.
    expect(
      screen.getByRole('link', { name: /Xem cảnh báo Nghi ngã của Bà Năm/ }),
    ).toHaveAttribute('href', `/app/alerts/${NOTIFICATION.incidentId}`);

    // Hộp thông báo không xác nhận/đóng cảnh báo.
    expect(screen.queryByRole('button', { name: 'Tôi đang hỗ trợ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Đóng cảnh báo/ })).not.toBeInTheDocument();
    expect(screen.getByText('Đánh dấu đã đọc không xác nhận hay đóng cảnh báo.')).toBeInTheDocument();
  });
});

// FR-06 / vòng đời suspected → unconfirmed — cảnh báo "Chưa xác định" phải mở được.
describe('AlertsPage — cảnh báo chưa xác định', () => {
  it('tab Đã đóng hiện ứng viên quá hạn với nhãn "Chưa xác định" + ghi chú thiếu kết quả cuối, có link chi tiết', async () => {
    renderPage(<AlertsPage />, (url) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.endsWith('/notifications')) return mockResponse({ items: [], unreadCount: 0 });
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
    expect(screen.getByRole('link', { name: 'Xem chi tiết' })).toHaveAttribute(
      'href',
      `/app/alerts/${INCIDENT.id}`,
    );
    // Không phải trạng thái cần xử lý: không hiện nút xác nhận hỗ trợ.
    expect(
      screen.queryByRole('button', { name: 'Tôi đang hỗ trợ' }),
    ).not.toBeInTheDocument();
  });
});

// F-P1-2 / xác nhận thất bại không phải 409 phải hiện lỗi thân thiện, có thể thử lại,
// và giữ nguyên trạng thái cảnh báo (không im lặng, không tự đổi danh sách).
describe('AlertsPage — xác nhận thất bại', () => {
  it('lỗi 500 → alert thân thiện + nút Thử lại, danh sách giữ trạng thái Đang mở', async () => {
    renderPage(<AlertsPage />, (url, reqInit) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.endsWith('/notifications')) return mockResponse({ items: [], unreadCount: 0 });
      if (u.includes('/alerts/') && u.endsWith('/acknowledge') && reqInit?.method === 'POST') {
        return mockResponse(errorEnvelope('Máy chủ đang bận.', 'INTERNAL'), 500);
      }
      if (u.includes(`/subjects/${SUBJECT.id}/alerts`)) {
        return mockResponse({ items: [INCIDENT], nextCursor: null });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Tôi đang hỗ trợ' }));
    await user.click(screen.getByRole('button', { name: 'Có, tôi đang hỗ trợ' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Chưa xác nhận được cảnh báo');
    expect(alert).toHaveTextContent('Máy chủ đang bận.');
    expect(within(alert).getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    // Không im lặng và không tự đổi trạng thái: vẫn còn cảnh báo đang mở + nút xác nhận.
    expect(screen.getByText(/chưa có người xác nhận/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tôi đang hỗ trợ' })).toBeEnabled();
  });

  it('cảnh báo đã acknowledged → không hiện nút xác nhận hỗ trợ', async () => {
    renderPage(<AlertsPage />, (url) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.endsWith('/notifications')) return mockResponse({ items: [], unreadCount: 0 });
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
    expect(
      screen.queryByRole('button', { name: 'Tôi đang hỗ trợ' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem chi tiết' })).toBeInTheDocument();
  });

  it('409 khi người khác đã xác nhận → thông điệp đúng, không báo "dữ liệu cũ"', async () => {
    let listCalls = 0;
    renderPage(<AlertsPage />, (url, reqInit) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.endsWith('/notifications')) return mockResponse({ items: [], unreadCount: 0 });
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

    await user.click(await screen.findByRole('button', { name: 'Tôi đang hỗ trợ' }));
    await user.click(screen.getByRole('button', { name: 'Có, tôi đang hỗ trợ' }));

    expect(await screen.findByText('Cảnh báo đã có người xác nhận')).toBeInTheDocument();
    expect(screen.getByText(/Trần Thị An đã xác nhận đang hỗ trợ/)).toBeInTheDocument();
    expect(screen.queryByText(/Danh sách dưới đây có thể cũ/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Tôi đang hỗ trợ' }),
    ).not.toBeInTheDocument();
  });
});

// Mất kết nối/SSE hỏng khi đã có danh sách: giữ cảnh báo cũ kèm mốc cập nhật, không
// biến thành "không có cảnh báo" hay ErrorState toàn trang.
describe('AlertsPage — dữ liệu cũ khi tải lại lỗi', () => {
  it('refetch lỗi sau khi đã có danh sách → vẫn thấy cảnh báo + notice giữ mốc cập nhật', async () => {
    let listCalls = 0;
    const { queryClient } = renderPage(<AlertsPage />, (url) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.endsWith('/notifications')) return mockResponse({ items: [], unreadCount: 0 });
      if (u.includes(`/subjects/${SUBJECT.id}/alerts`)) {
        listCalls += 1;
        if (listCalls === 1) {
          return mockResponse({ items: [INCIDENT], nextCursor: null });
        }
        return mockResponse(errorEnvelope('Mất kết nối.', 'INTERNAL'), 500);
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByRole('link', { name: /Nghi ngã/ })).toBeInTheDocument();
    expect(screen.getByText(/^Cập nhật lúc /)).toBeInTheDocument();

    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.subjectAlerts(SUBJECT.id, 'open'),
      });
    });

    expect(await screen.findByText('Không cập nhật được danh sách')).toBeInTheDocument();
    // Danh sách cũ vẫn còn, kèm mốc đã tải — không thay bằng empty/ErrorState.
    expect(screen.getByRole('link', { name: /Nghi ngã/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});

// P1-2 / quyền ghi cảnh báo: xác nhận nhanh cần cả canReceiveAlerts lẫn canAcknowledge.
function caregiverSubject(permissions: Partial<typeof SUBJECT.permissions>) {
  return {
    ...SUBJECT,
    role: 'caregiver',
    permissions: { ...SUBJECT.permissions, ...permissions },
  };
}

describe('AlertsPage — quyền ghi cảnh báo', () => {
  it('thiếu canReceiveAlerts → giải thích quyền và không gọi API danh sách', async () => {
    const alertCalls: string[] = [];
    stubFetch((url) => {
      const target = String(url);
      if (target.endsWith('/subjects')) {
        return mockResponse({
          items: [caregiverSubject({ canReceiveAlerts: false, canAcknowledge: true })],
        });
      }
      if (target.includes(`/subjects/${SUBJECT.id}/alerts`)) {
        alertCalls.push(target);
        return mockResponse({ items: [INCIDENT], nextCursor: null });
      }
      return mockResponse({ items: [], unreadCount: 0 });
    });
    renderPage(<AlertsPage />);

    expect(
      await screen.findByText(/Bạn không có quyền xem cảnh báo của hồ sơ này/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Xem chi tiết' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Tôi đang hỗ trợ' }),
    ).not.toBeInTheDocument();
    expect(alertCalls).toHaveLength(0);
  });

  it('thiếu canAcknowledge nhưng có canReceiveAlerts → ẩn nút và nói rõ thiếu quyền xác nhận', async () => {
    stubFetch((url) => {
      const target = String(url);
      if (target.endsWith('/subjects')) {
        return mockResponse({
          items: [caregiverSubject({ canReceiveAlerts: true, canAcknowledge: false })],
        });
      }
      if (target.includes(`/subjects/${SUBJECT.id}/alerts`)) {
        return mockResponse({ items: [INCIDENT], nextCursor: null });
      }
      return mockResponse({ items: [], unreadCount: 0 });
    });
    renderPage(<AlertsPage />);

    expect(await screen.findByRole('link', { name: 'Xem chi tiết' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Tôi đang hỗ trợ' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Bạn không có quyền xác nhận cảnh báo này.')).toBeInTheDocument();
    expect(screen.getByText('Đang mở', { selector: '.pill' })).toBeInTheDocument();
  });

  it('đủ canReceiveAlerts + canAcknowledge → nút xác nhận hiện và gọi API', async () => {
    const fetchMock = stubFetch((url, init) => {
      const target = String(url);
      if (target.endsWith('/subjects')) {
        return mockResponse({
          items: [caregiverSubject({ canReceiveAlerts: true, canAcknowledge: true })],
        });
      }
      if (target.includes(`/alerts/${INCIDENT.id}/acknowledge`) && init?.method === 'POST') {
        return mockResponse({
          ...INCIDENT,
          state: 'acknowledged',
          version: 3,
          acknowledgedBy: { userId: USER.id, displayName: 'Trần Thị An' },
        });
      }
      if (target.includes(`/subjects/${SUBJECT.id}/alerts`)) {
        return mockResponse({ items: [INCIDENT], nextCursor: null });
      }
      return mockResponse({ items: [], unreadCount: 0 });
    });
    renderPage(<AlertsPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Tôi đang hỗ trợ' }));

    // Lần bấm đầu chỉ mở câu hỏi xác nhận, chưa gửi POST.
    expect(screen.getByText('Bạn đã liên hệ và đang hỗ trợ?')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).includes(`/alerts/${INCIDENT.id}/acknowledge`) &&
          (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Có, tôi đang hỗ trợ' }));

    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).includes(`/alerts/${INCIDENT.id}/acknowledge`) &&
          (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(true);
    expect(screen.queryByText(/không chia sẻ quyền nhận cảnh báo/)).not.toBeInTheDocument();
  });
});
