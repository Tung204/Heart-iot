import {
  notificationListSchema,
  type NotificationList,
} from '@heart-iot/contracts/notifications';
import { apiRequest, parseResponse } from '../../lib/api';

/** GET /notifications — hộp thư trong ứng dụng + số chưa đọc. */
export async function fetchNotifications(signal?: AbortSignal): Promise<NotificationList> {
  const data = await apiRequest<unknown>('/notifications', { signal });
  return parseResponse(notificationListSchema, data);
}

/** POST /notifications/:id/read — đánh dấu đã đọc (204). */
export async function markNotificationRead(id: string): Promise<void> {
  await apiRequest<void>(`/notifications/${id}/read`, { method: 'POST' });
}
