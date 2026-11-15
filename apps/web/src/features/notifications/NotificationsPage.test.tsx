import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { NotificationsPage } from './NotificationsPage';
import { errorEnvelope, mockResponse, renderPage } from '../../test/utils';

const SUBJECT_ID = '1f2d3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b';
const INCIDENT_ID = '2f3d4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b';

const UNREAD = {
  id: '4f5d6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b',
  incidentId: INCIDENT_ID,
  subjectId: SUBJECT_ID,
  subjectName: 'Bà Năm',
  incidentType: 'fall',
  state: 'open',
  revision: 1,
  kind: 'alert',
  sentAt: '2026-11-14T08:00:30.000Z',
  readAt: null,
  createdAt: '2026-11-14T08:00:30.000Z',
};

const READ = {
  ...UNREAD,
  id: '5f6d7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
  revision: 2,
  kind: 'update',
  readAt: '2026-11-14T09:00:00.000Z',
  createdAt: '2026-11-14T08:30:00.000Z',
};

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
    expect(dot).toHaveClass('notification-item__dot');
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    expect(dot).not.toHaveAttribute('aria-label');
    // Chỉ mục chưa đọc có nhãn; mục đã đọc không lặp lại.
    expect(screen.getAllByText('Chưa đọc')).toHaveLength(1);
    expect(screen.queryByLabelText('Chưa đọc')).not.toBeInTheDocument();
  });
});
