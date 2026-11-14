import type {
  PublicationStatus,
  ViewScope,
  ViewStatus,
  WidgetType,
} from '@annhien/contracts/studio';

/** Nhãn tiếng Việt cho enum hợp đồng — chữ là tín hiệu, màu chỉ hỗ trợ. */
export const SCOPE_LABELS: Record<ViewScope, string> = {
  user: 'Cá nhân',
  subject: 'Theo hồ sơ',
  global: 'Toàn hệ thống',
};

export const VIEW_STATUS_LABELS: Record<ViewStatus, string> = {
  draft: 'Bản nháp',
  published: 'Đã công bố',
  archived: 'Lưu trữ',
};

export const VIEW_STATUS_TONES: Record<ViewStatus, 'sand' | 'teal' | 'neutral'> = {
  draft: 'sand',
  published: 'teal',
  archived: 'neutral',
};

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  active: 'Đang hoạt động',
  superseded: 'Đã thay thế',
  rolled_back: 'Đã rollback',
};

export const PUBLICATION_STATUS_TONES: Record<PublicationStatus, 'teal' | 'neutral' | 'sand'> = {
  active: 'teal',
  superseded: 'neutral',
  rolled_back: 'sand',
};

export const WIDGET_TYPE_LABELS: Record<WidgetType, string> = {
  metric: 'Chỉ số',
  chart: 'Biểu đồ',
  alerts: 'Cảnh báo',
  summary: 'Tổng hợp',
  tasks: 'Công việc',
};

export const FRESHNESS_LABELS = {
  live: 'Trực tuyến',
  stale: 'Chưa cập nhật gần đây',
  offline: 'Ngoại tuyến',
  never: 'Chưa từng kết nối',
} as const;

export const QUALITY_LABELS = {
  valid: 'Tín hiệu tốt',
  poor_signal: 'Tín hiệu kém',
  not_worn: 'Không đeo thiết bị',
  sensor_error: 'Lỗi cảm biến',
} as const;

export const TASK_STATUS_LABELS = {
  open: 'Mở',
  in_progress: 'Đang làm',
  done: 'Xong',
  cancelled: 'Đã hủy',
} as const;

/** Rút gọn digest để hiển thị (8 ký tự đầu, không cắt giữa chừng khi ngắn). */
export function shortDigest(digest: string): string {
  return digest.length > 8 ? `${digest.slice(0, 8)}…` : digest;
}
