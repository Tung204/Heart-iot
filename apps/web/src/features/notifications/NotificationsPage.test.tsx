import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NotificationItem } from '@heart-iot/contracts/notifications';
import { NotificationsPage } from './NotificationsPage';
import { formatDateTime, formatRelativeTime } from '../../lib/format';
import { errorEnvelope, mockResponse, renderPage } from '../../test/utils';

const SUBJECT_ID = '1f2d3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b';
const INCIDENT_ID = '2f3d4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b';
const CREATED_AT = '2026-11-14T08:00:30.000Z';
/** Mốc "bây giờ" cố định để câu thời gian tương đối không phụ thuộc đồng hồ máy. */
const NOW = Date.parse('2026-11-14T08:05:30.000Z');

const UNREAD: NotificationItem = {
  id: '4f5d6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b',
  incidentId: INCIDENT_ID,
  subjectId: SUBJECT_ID,
  subjectName: 'Bà Năm',
  incidentType: 'fall',
  state: 'open',
  revision: 1,
  kind: 'alert',
  sentAt: CREATED_AT,
  readAt: null,
  createdAt: CREATED_AT,
};

const READ: NotificationItem = {
  ...UNREAD,
  id: '5f6d7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
  subjectName: 'Ông Bình',
  incidentType: 'sos',
  state: 'resolved',
  revision: 2,
  kind: 'update',
  sentAt: '2026-11-14T08:01:00.000Z',
  readAt: '2026-11-14T09:00:00.000Z',
  createdAt: '2026-11-14T08:01:00.000Z',
};

type Server = { items: NotificationItem[]; unreadCount: number };

/** Server giả có trạng thái đọc thật: reload sau khi đánh dấu vẫn thấy "Đã đọc". */
function notificationsHandler(server: Server, postStatus = 204) {
  return (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/notifications/') && u.endsWith('/read') && init?.method === 'POST') {
      if (postStatus >= 400) {
        return mockResponse(errorEnvelope('Máy chủ đang bận.', 'INTERNAL'), postStatus);
      }
      const id = u.split('/notifications/')[1]?.replace('/read', '');
      const target = server.items.find((item) => item.id === id);
      if (target && target.readAt === null) {
        target.readAt = new Date().toISOString();
        server.unreadCount = Math.max(0, server.unreadCount - 1);
      }
      return mockResponse(undefined, 204);
    }
    if (u.endsWith('/notifications')) {
      return mockResponse({ items: server.items, unreadCount: server.unreadCount });
    }
    return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
  };
}

// F-P2-5 / chấm "chưa đọc" không được đặt aria-label trên span không role.
describe('NotificationsPage — ngữ nghĩa chấm chưa đọc', () => {
  it('chấm là trang trí, trạng thái chưa đọc được đọc bằng chữ ẩn', async () => {
    renderPage(<NotificationsPage />, (url) => {
      const u = String(url);
      if (u.endsWith('/notifications')) {
        return mockResponse({ items: [UNREAD, READ], unreadCount: 1 });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    const unreadLabel = await screen.findByText('Chưa đọc');
    expect(unreadLabel).toHaveClass('visually-hidden');

    const dot = unreadLabel.previousElementSibling;
    expect(dot).toHaveClass('inbox-item__dot');
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    expect(dot).not.toHaveAttribute('aria-label');
    // Chỉ mục chưa đọc có nhãn; mục đã đọc không lặp lại.
    expect(screen.getAllByText('Chưa đọc')).toHaveLength(1);
    expect(screen.queryByLabelText('Chưa đọc')).not.toBeInTheDocument();
  });
});

describe('NotificationsPage — hộp thông báo toàn tài khoản', () => {
  it('H1 + phạm vi tất cả hồ sơ; hàng có giờ tương đối và tuyệt đối, đã đọc/chưa đọc bằng chữ', async () => {
    renderPage(<NotificationsPage now={NOW} />, notificationsHandler({
      items: [UNREAD, READ],
      unreadCount: 1,
    }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Thông báo đã nhận' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Tất cả hồ sơ bạn có quyền xem.')).toBeInTheDocument();
    expect(
      await screen.findByText('Bạn có 1 thông báo chưa đọc.'),
    ).toBeInTheDocument();

    const relative = formatRelativeTime(CREATED_AT, NOW);
    const absolute = formatDateTime(CREATED_AT);
    expect(screen.getByText(relative as string)).toBeInTheDocument();
    expect(screen.getByText(`(${absolute})`)).toBeInTheDocument();
    // Tên hồ sơ + loại cảnh báo là nội dung hàng, không phải hồ sơ đang chọn.
    expect(screen.getByText('Nghi ngã — Bà Năm')).toBeInTheDocument();
    // Hộp gộp nhiều hồ sơ: hàng thứ hai thuộc hồ sơ khác.
    expect(screen.getByText('Yêu cầu trợ giúp — Ông Bình')).toBeInTheDocument();
    expect(screen.getByText('Đã đọc', { selector: '.pill' })).toBeInTheDocument();
  });

  it('mỗi hàng mở đúng incidentId của thông báo', async () => {
    renderPage(<NotificationsPage />, notificationsHandler({
      items: [{ ...UNREAD }],
      unreadCount: 1,
    }));

    const link = await screen.findByRole('link', {
      name: 'Xem cảnh báo Nghi ngã của Bà Năm',
    });
    expect(link).toHaveAttribute('href', `/app/alerts/${INCIDENT_ID}`);
  });

  it('đánh dấu đã đọc: đổi ngay (optimistic), giữ đúng sau khi tải lại', async () => {
    const server: Server = { items: [{ ...UNREAD }], unreadCount: 1 };
    const first = renderPage(<NotificationsPage />, notificationsHandler(server));
    const user = userEvent.setup();

    const button = await screen.findByRole('button', { name: /Đánh dấu đã đọc/ });
    await user.click(button);

    // Optimistic: trạng thái đọc đổi trước khi server phản hồi xong.
    expect(await screen.findByText('Đã đọc', { selector: '.pill' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('Bạn đã đọc hết thông báo.')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /Đánh dấu đã đọc/ })).not.toBeInTheDocument();

    // "Tải lại": unmount rồi mount lại với cache mới — server đã ghi nhận đọc.
    first.unmount();
    renderPage(<NotificationsPage />, notificationsHandler(server));
    expect(
      await screen.findByText('Đã đọc', { selector: '.pill' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Bạn đã đọc hết thông báo.')).toBeInTheDocument();
  });

  it('đánh dấu thất bại → rollback về chưa đọc + thông báo lỗi có Thử lại', async () => {
    const server: Server = { items: [{ ...UNREAD }], unreadCount: 1 };
    renderPage(<NotificationsPage />, notificationsHandler(server, 500));
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Đánh dấu đã đọc/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Chưa đánh dấu được');
    expect(alert).toHaveTextContent('Máy chủ đang bận.');
    expect(screen.getByRole('button', { name: /Đánh dấu đã đọc/ })).toBeInTheDocument();
    expect(screen.getByText('Bạn có 1 thông báo chưa đọc.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it('không có hành động xác nhận/đóng cảnh báo trong hộp thông báo', async () => {
    renderPage(<NotificationsPage />, notificationsHandler({
      items: [{ ...UNREAD }],
      unreadCount: 1,
    }));

    await screen.findByRole('link', { name: 'Xem cảnh báo Nghi ngã của Bà Năm' });
    expect(screen.queryByRole('button', { name: 'Tôi đang hỗ trợ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Đóng cảnh báo/ })).not.toBeInTheDocument();
    expect(screen.getByText('Đánh dấu đã đọc không xác nhận hay đóng cảnh báo.')).toBeInTheDocument();
  });

  it('lỗi tải hộp thông báo → ErrorState có Thử lại, không hiện số 0 giả', async () => {
    renderPage(<NotificationsPage />, () =>
      mockResponse(errorEnvelope('Lỗi máy chủ.', 'INTERNAL'), 500),
    );

    expect(await screen.findByText('Không tải được thông báo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.queryByText('Bạn đã đọc hết thông báo.')).not.toBeInTheDocument();
  });
});
