import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { NotificationItem } from '@annhien/contracts/notifications';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { formatDateTime } from '../../lib/format';
import { getApiErrorMessage } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { ALERT_STATE_LABELS, ALERT_TYPE_LABELS } from '../alerts/labels';
import { fetchNotifications, markNotificationRead } from './api';

/**
 * /app/notifications — hộp thư trong ứng dụng:
 * - Thông báo gắn với cảnh báo của các hồ sơ được chia sẻ.
 * - Đánh dấu đã đọc; không có nội dung sức khỏe chi tiết ngoài loại cảnh báo.
 */
export function NotificationsPage() {
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: ({ signal }) => fetchNotifications(signal),
    staleTime: 15_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onMutate: async (id) => {
      // Optimistic: cập nhật ngay, rollback nếu API lỗi (lỗi mạng có nút thử lại).
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications });
      const previous = queryClient.getQueryData(queryKeys.notifications);
      queryClient.setQueryData(
        queryKeys.notifications,
        (data: { items: NotificationItem[]; unreadCount: number } | undefined) =>
          data
            ? {
                items: data.items.map((item) =>
                  item.id === id && item.readAt === null
                    ? { ...item, readAt: new Date().toISOString() }
                    : item,
                ),
                unreadCount: Math.max(0, data.unreadCount - 1),
              }
            : data,
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.notifications, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });

  return (
    <div className="stack">
      <header>
        <h1 className="page-title">Thông báo</h1>
        <p className="page-lead">
          {notifications.data
            ? notifications.data.unreadCount > 0
              ? `Bạn có ${notifications.data.unreadCount} thông báo chưa đọc.`
              : 'Bạn đã đọc hết thông báo.'
            : 'Thông báo về cảnh báo của các hồ sơ bạn theo dõi.'}
        </p>
      </header>

      {notifications.isPending ? (
        <PageLoader label="Đang tải thông báo…" />
      ) : notifications.isError ? (
        <ErrorState
          title="Không tải được thông báo"
          message={getApiErrorMessage(notifications.error)}
          onRetry={() => void notifications.refetch()}
        />
      ) : notifications.data.items.length === 0 ? (
        <EmptyState
          title="Chưa có thông báo"
          description="Khi có cảnh báo mới liên quan tới hồ sơ bạn theo dõi, thông báo sẽ xuất hiện tại đây."
        />
      ) : (
        <ul className="notification-list" aria-label="Danh sách thông báo">
          {notifications.data.items.map((item) => (
            <li
              key={item.id}
              className={`notification-item${item.readAt === null ? ' notification-item--unread' : ''}`}
            >
              <div className="notification-item__main">
                <p className="notification-item__title">
                  {item.readAt === null ? (
                    <span className="notification-item__dot" aria-label="Chưa đọc" />
                  ) : null}
                  {ALERT_TYPE_LABELS[item.incidentType]} — {item.subjectName}
                </p>
                <p className="notification-item__meta">
                  {formatDateTime(item.createdAt)} · trạng thái{' '}
                  {ALERT_STATE_LABELS[item.state]}
                  {item.kind === 'update' ? ' · cập nhật' : ''}
                </p>
                <p className="notification-item__link">
                  <Link to={`/app/alerts/${item.incidentId}`}>Xem cảnh báo</Link>
                </p>
              </div>
              <div className="notification-item__side">
                {item.readAt === null ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={markRead.isPending}
                    onClick={() => markRead.mutate(item.id)}
                    aria-label={`Đánh dấu đã đọc thông báo về ${ALERT_TYPE_LABELS[item.incidentType]} của ${item.subjectName}`}
                  >
                    Đánh dấu đã đọc
                  </Button>
                ) : (
                  <StatusPill tone="neutral">Đã đọc</StatusPill>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {markRead.isError ? (
        <Alert tone="error" title="Chưa đánh dấu được">
          {getApiErrorMessage(markRead.error)} Hãy thử lại.
        </Alert>
      ) : null}
    </div>
  );
}
