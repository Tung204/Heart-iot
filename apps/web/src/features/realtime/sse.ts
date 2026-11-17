import { alertUpdatedEventSchema, type AlertUpdatedEvent } from '@heart-iot/contracts/incidents';

/**
 * Logic thuần cho SSE — tách khỏi hook để test được không cần EventSource.
 * Nguồn sự kiện: GET /subjects/:id/events (xem apps/api/src/realtime).
 * - `alert.updated`: cảnh báo đổi trạng thái → làm mới cache cảnh báo.
 * - `notification.sent`: có thông báo mới trong ứng dụng → làm mới hộp thư.
 * - `revoked`: mất quyền xem hồ sơ → đóng stream, xóa dữ liệu nhạy cảm.
 */

export interface ParsedSseEvent {
  id: string | null;
  event: string | null;
  data: unknown;
}

/**
 * Parse một khối sự kiện SSE (nhiều dòng kết thúc bằng dòng trống).
 * Bỏ qua dòng comment `:`; nhiều dòng data nối bằng ký tự xuống dòng.
 * Dữ liệu không hợp lệ trả `data: null` — người gọi quyết định bỏ qua.
 */
export function parseSseBlock(block: string): ParsedSseEvent {
  let id: string | null = null;
  let event: string | null = null;
  const dataLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line === '' || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    switch (field) {
      case 'id':
        id = value || null;
        break;
      case 'event':
        event = value || null;
        break;
      case 'data':
        dataLines.push(value);
        break;
      default:
        break;
    }
  }
  if (dataLines.length === 0) return { id, event, data: null };
  const raw = dataLines.join('\n');
  try {
    return { id, event, data: JSON.parse(raw) as unknown };
  } catch {
    return { id, event, data: null };
  }
}

/** Parse riêng `MessageEvent.data` (EventSource đã tách field `event:`).

 * Payload không phải JSON → null; người gọi bỏ qua thay vì làm hỏng stream.
 */
export function parseSseData(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export type StreamEffect =
  | { kind: 'refetch-alerts'; alert: AlertUpdatedEvent }
  | { kind: 'refetch-notifications' }
  | { kind: 'revoked' }
  | { kind: 'none' };

/**
 * Ánh xạ một sự kiện SSE đã parse thành hiệu ứng cache.
 * Payload lệch hợp đồng (zod fail) → bỏ qua, không làm hỏng stream.
 */
export function handleRealtimeEvent(raw: {
  event: string | null;
  data: unknown;
}): StreamEffect {
  switch (raw.event) {
    case 'alert.updated': {
      const parsed = alertUpdatedEventSchema.safeParse(raw.data);
      return parsed.success ? { kind: 'refetch-alerts', alert: parsed.data } : { kind: 'none' };
    }
    case 'notification.sent':
      return { kind: 'refetch-notifications' };
    case 'revoked':
      return { kind: 'revoked' };
    default:
      return { kind: 'none' };
  }
}

/**
 * Chính sách backoff khi mất kết nối: 1s → 2s → 4s → … tối đa 30s.
 * Sau mỗi lần kết nối thành công, bộ đếm về 0.
 */
export function nextBackoffMs(attempt: number, maxMs = 30_000): number {
  return Math.min(1000 * 2 ** Math.min(Math.max(0, attempt), 5), maxMs);
}
