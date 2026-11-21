import type { IncidentState, IncidentType } from '@heart-iot/contracts';
import type { IncidentEventType } from '@heart-iot/contracts/telemetry';
import type { AlertActionView } from '@heart-iot/contracts/incidents';
import { formatDateTime } from '../../lib/format';

/** Nhãn tiếng Việt cho state machine — màu/icon chỉ hỗ trợ, chữ là tín hiệu chính. */
export const ALERT_STATE_LABELS: Record<IncidentState, string> = {
  suspected: 'Nghi ngờ (chờ xác nhận)',
  open: 'Đang mở',
  acknowledged: 'Đã xác nhận',
  resolved: 'Đã đóng',
  cancelled: 'Đã hủy',
  unconfirmed: 'Chưa xác định',
};

export const ALERT_TYPE_LABELS: Record<IncidentType, string> = {
  fall: 'Nghi ngã',
  sos: 'Yêu cầu trợ giúp',
};

export const INCIDENT_EVENT_LABELS: Record<IncidentEventType, string> = {
  'fall.candidate': 'Phát hiện nghi ngã (ứng viên)',
  'fall.cancelled': 'Hủy nghi ngã',
  'fall.confirmed': 'Xác nhận ngã',
  'user.cancel_requested': 'Yêu cầu hủy từ người đeo',
  'sos.confirmed': 'Xác nhận yêu cầu trợ giúp',
};

/** Trạng thái còn cần hành động (có thể xác nhận/đóng). */
export function isActionableState(state: IncidentState): boolean {
  return state === 'open' || state === 'acknowledged';
}

/** Cảnh báo mức cao = chưa ai xác nhận (open) hoặc loại sos. */
export function isHighSeverity(alert: { state: IncidentState; type: IncidentType }): boolean {
  return alert.type === 'sos' || alert.state === 'open';
}

export function describeAlertAction(action: AlertActionView): string {
  const verb = action.action === 'acknowledge' ? 'Xác nhận' : 'Đóng cảnh báo';
  const actor = action.actor ? ` bởi ${action.actor.displayName}` : '';
  const at = action.createdAt ? ` lúc ${formatDateTime(action.createdAt)}` : '';
  const transition = ` (${ALERT_STATE_LABELS[action.stateBefore]} → ${ALERT_STATE_LABELS[action.stateAfter]})`;
  const conflict =
    action.outcome === 'conflict'
      ? ' — không áp dụng do phiên bản cũ'
      : action.outcome === 'forbidden'
        ? ' — không được phép'
        : '';
  return `${verb}${actor}${at}${transition}${conflict}`;
}
