import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NotificationItem } from '@annhien/contracts/notifications';
import { queryKeys } from '../../lib/query';
import { fetchNotifications } from './api';

/**
 * Số chưa đọc toàn tài khoản cho badge điều hướng và banner thông báo mới.
 *
 * - Dùng chung query `queryKeys.notifications` với trang Thông báo: một bộ đệm,
 *   không gọi API trùng. SSE `notification.sent` invalidate key này nên badge
 *   cập nhật ngay khi stream của hồ sơ đang xem báo có thông báo.
 * - Tải lại định kỳ 20 giây khi tab đang hiện; tab ẩn thì dừng hẳn (tiết kiệm
 *   pin/mạng — React Query cũng không chạy interval khi cửa sổ không focus).
 * - Chỉ báo "mới" khi id chưa từng thấy hoặc số chưa đọc tăng so với lần tải
 *   trước; lần tải đầu tiên chỉ lập mốc nên không bật banner cho thông báo cũ.
 */

/** Chu kỳ tải số chưa đọc (20 giây) — trong khoảng 20–30 giây theo yêu cầu. */
export const UNREAD_POLL_INTERVAL_MS = 20_000;

/**
 * Khoảng nghỉ giữa hai lần tải số chưa đọc; tab ẩn → `false` để không hẹn giờ.
 * Tách hàm thuần để test được chính sách mà không cần chờ 20 giây.
 */
export function unreadPollInterval(hidden: boolean): number | false {
  return hidden ? false : UNREAD_POLL_INTERVAL_MS;
}

export interface UnreadNotificationsState {
  /** Tổng số thông báo chưa đọc của tài khoản (mọi hồ sơ được chia sẻ). */
  unreadCount: number;
  /** Thông báo mới nhất vừa xuất hiện sau lần tải đầu tiên; `null` khi không có. */
  newNotification: NotificationItem | null;
  /** Ẩn banner thông báo mới; cùng thông báo đó không bật lại ở lần tải sau. */
  dismiss: () => void;
}

interface Baseline {
  ids: Set<string>;
  unreadCount: number;
}

export function useUnreadNotifications(enabled = true): UnreadNotificationsState {
  const query = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: ({ signal }) => fetchNotifications(signal),
    enabled,
    staleTime: 15_000,
    refetchInterval: () =>
      unreadPollInterval(typeof document !== 'undefined' && document.hidden),
    // Mặc định React Query chỉ chạy interval khi cửa sổ đang focus; khai báo rõ
    // để không tải nền khi người dùng đã rời tab.
    refetchIntervalInBackground: false,
  });

  const baselineRef = useRef<Baseline | null>(null);
  const [newNotification, setNewNotification] = useState<NotificationItem | null>(null);
  const dismiss = useCallback(() => setNewNotification(null), []);

  useEffect(() => {
    if (!query.data) return;
    const { items, unreadCount } = query.data;
    const previous = baselineRef.current;
    baselineRef.current = {
      ids: new Set(items.map((item) => item.id)),
      unreadCount,
    };
    // Lần tải đầu tiên: chỉ lập mốc, không coi thông báo cũ là mới.
    if (!previous) return;

    const fresh = items
      .filter((item) => !previous.ids.has(item.id))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const candidate =
      fresh[0] ??
      (unreadCount > previous.unreadCount
        ? (items.find((item) => item.readAt === null) ?? items[0])
        : undefined);
    if (candidate) setNewNotification(candidate);
  }, [query.data]);

  return { unreadCount: query.data?.unreadCount ?? 0, newNotification, dismiss };
}
