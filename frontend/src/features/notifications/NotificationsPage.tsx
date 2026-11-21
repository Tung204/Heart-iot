import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createElement } from 'react';
import type { NotificationItem } from '@heart-iot/contracts/notifications';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { formatDateTime, formatRelativeTime } from '../../lib/format';
import { getApiErrorMessage } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { ALERT_STATE_LABELS, ALERT_TYPE_LABELS } from '../alerts/labels';
import { fetchNotifications, markNotificationRead } from './api';
import './notifications.css';

interface NotificationListData {
  items: NotificationItem[];
  unreadCount: number;
}

interface NotificationsPageProps {
  /**
   * `1` khi đứng riêng; `2` khi mount dưới trang Cảnh báo (`?view=notifications`)
   * để không lặp H1 của trang.
   */
  headingLevel?: 1 | 2;
  /** Ngày/giờ "bây giờ" cho thời gian tương đối — chỉ để test ổn định. */
  now?: number;
}

function notificationTime(item: NotificationItem): string {
  return item.sentAt ?? item.createdAt;
}

/**
 * Hộp thông báo trong ứng dụng — phạm vi **toàn tài khoản**, gộp mọi hồ sơ
 * người xem có quyền nhận cảnh báo:
 * - Đánh dấu đã đọc là thao tác duy nhất ở đây (optimistic + rollback);
 *   KHÔNG xác nhận/đóng cảnh báo, không phải tab "Đã đóng".
 * - Mỗi hàng mở đúng `incidentId` của thông báo, không dùng hồ sơ đang chọn.
 * - Chưa đọc/đã đọc phân biệt bằng chữ, không chỉ chấm màu.
 */
export function NotificationsPage({ headingLevel = 1, now }: NotificationsPageProps) {
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: ({ signal }) => fetchNotifications(signal),
    staleTime: 15_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onMutate: async (id) => {
      // Optimistic: đổi ngay trong cache, rollback đúng ảnh chụp trước đó nếu lỗi.
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications });
      const previous = queryClient.getQueryData<NotificationListData>(queryKeys.notifications);
      queryClient.setQueryData<NotificationListData | undefined>(
        queryKeys.notifications,
        (data) => {
          if (!data) return data;
          const target = data.items.find((item) => item.id === id);
          if (!target) return data;
          // Thông báo đã đọc sẵn: không giảm số chưa đọc lần nữa.
          const wasUnread = target.readAt === null;
          return {
            items: data.items.map((item) =>
              item.id === id && item.readAt === null
                ? { ...item, readAt: new Date().toISOString() }
                : item,
            ),
            unreadCount: wasUnread ? Math.max(0, data.unreadCount - 1) : data.unreadCount,
          };
        },
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

  const items = notifications.data?.items ?? [];
  const unreadCount = notifications.data?.unreadCount ?? 0;
  const failedId = markRead.isError ? markRead.variables : undefined;
  const failedItem = failedId ? items.find((item) => item.id === failedId) : undefined;

  return (
    <section className="inbox" aria-labelledby="inbox-heading">
      <header className="inbox__head">
        {createElement(
          `h${headingLevel}`,
          { className: 'inbox__title', id: 'inbox-heading' },
          'Thông báo đã nhận',
        )}
        <p className="inbox__scope">Tất cả hồ sơ bạn có quyền xem.</p>
        {notifications.data ? (
          <p className="inbox__summary">
            {unreadCount > 0
              ? `Bạn có ${unreadCount} thông báo chưa đọc.`
              : 'Bạn đã đọc hết thông báo.'}
          </p>
        ) : null}
      </header>

      {notifications.isPending ? (
        <PageLoader label="Đang tải thông báo…" />
      ) : notifications.isError && items.length === 0 ? (
        <ErrorState
          title="Không tải được thông báo"
          headingLevel={headingLevel === 1 ? 1 : 2}
          message={getApiErrorMessage(notifications.error)}
          onRetry={() => void notifications.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có thông báo"
          headingLevel={headingLevel === 1 ? 2 : 3}
          description="Khi có cảnh báo hoặc nhắc chăm sóc mới liên quan tới hồ sơ bạn theo dõi, thông báo sẽ xuất hiện tại đây."
        />
      ) : (
        <>
          {notifications.isError ? (
            <Alert
              tone="warning"
              announce="status"
              title="Không cập nhật được hộp thông báo"
            >
              Đang hiển thị thông báo đã tải. {getApiErrorMessage(notifications.error)}{' '}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void notifications.refetch()}
              >
                Thử lại
              </Button>
            </Alert>
          ) : null}

          <ul className="inbox__list" aria-label="Danh sách thông báo">
            {items.map((item) => {
              const unread = item.readAt === null;
              const receivedAt = notificationTime(item);
              const relative = formatRelativeTime(receivedAt, now);
              const absolute = formatDateTime(receivedAt);
              const pendingThis = markRead.isPending && markRead.variables === item.id;
              const care = item.kind === 'care_digest' || item.kind === 'care_rule';
              const careLabel =
                item.kind === 'care_digest' ? 'Bản tin chăm sóc' : 'Nhắc chăm sóc';
              const alertType = item.incidentType
                ? ALERT_TYPE_LABELS[item.incidentType]
                : null;
              const stateLabel = item.state ? ALERT_STATE_LABELS[item.state] : null;
              const title = care
                ? (item.title ?? careLabel)
                : `${alertType ?? 'Cảnh báo'} — ${item.subjectName}`;
              const canOpenAlert = item.incidentId !== null && alertType !== null;
              return (
                <li
                  key={item.id}
                  className={`inbox-item${unread ? ' inbox-item--unread' : ''}`}
                >
                  <div className="inbox-item__main">
                    <p className="inbox-item__title">
                      {unread ? (
                        <>
                          <span className="inbox-item__dot" aria-hidden="true" />
                          <span className="visually-hidden">Chưa đọc</span>
                        </>
                      ) : null}
                      <span>{title}</span>
                    </p>
                    {care && item.body ? (
                      <p className="inbox-item__body">{item.body}</p>
                    ) : null}
                    <p className="inbox-item__meta">
                      <time className="inbox-item__time" dateTime={receivedAt}>
                        {relative ?? absolute}
                      </time>
                      <span className="inbox-item__abs">({absolute})</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {care
                          ? `${careLabel} · ${item.subjectName}`
                          : `trạng thái ${stateLabel ?? 'không xác định'}${
                              item.kind === 'update' ? ' · cập nhật' : ''
                            }`}
                      </span>
                    </p>
                  </div>
                  <div className="inbox-item__actions">
                    {canOpenAlert ? (
                      <Link
                        className="inbox-item__link"
                        to={`/app/alerts/${item.incidentId}`}
                        // Giữ ngữ cảnh để nút quay lại ở trang chi tiết về đúng tab hộp thư.
                        state={{ alertsView: 'notifications' }}
                        aria-label={`Xem cảnh báo ${alertType} của ${item.subjectName}`}
                      >
                        Xem cảnh báo
                      </Link>
                    ) : null}
                    {unread ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={pendingThis}
                        onClick={() => markRead.mutate(item.id)}
                        aria-label={`Đánh dấu đã đọc ${
                          care ? careLabel : `cảnh báo ${alertType ?? ''}`
                        } của ${item.subjectName}`}
                      >
                        {pendingThis ? 'Đang lưu…' : 'Đánh dấu đã đọc'}
                      </Button>
                    ) : (
                      <StatusPill tone="neutral">Đã đọc</StatusPill>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="inbox__summary">
            Đánh dấu đã đọc không xác nhận hay đóng cảnh báo.
          </p>
        </>
      )}

      {markRead.isError ? (
        <div className="inbox__error">
          <Alert tone="error" title="Chưa đánh dấu được">
            {getApiErrorMessage(markRead.error)} Thông báo vẫn giữ trạng thái chưa đọc.
          </Alert>
          {failedItem ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={markRead.isPending}
              onClick={() => markRead.mutate(failedItem.id)}
            >
              Thử lại
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
