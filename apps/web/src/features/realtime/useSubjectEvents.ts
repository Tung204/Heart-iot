import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { purgeSubjectData, queryKeys } from '../../lib/query';
import { handleRealtimeEvent, nextBackoffMs, parseSseData } from './sse';

/** Base URL API — giữ đồng bộ với lib/api (không export trực tiếp để tránh vòng phụ thuộc). */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/+$/, '');

export type SubjectEventsStatus = 'idle' | 'connecting' | 'open' | 'revoked' | 'closed';

export interface SubjectEventsState {
  status: SubjectEventsStatus;
  /** Đếm lần mất kết nối liên tiếp (reset khi mở lại thành công). */
  retryAttempt: number;
}

interface UseSubjectEventsOptions {
  /** Gọi khi stream báo `revoked` (mất quyền) — hook đã tự đóng stream và xóa cache. */
  onRevoked?: (subjectId: string) => void;
}

/**
 * Mở stream SSE `GET /subjects/:id/events` cho hồ sơ đang xem.
 *
 * - Đọc dữ liệu bằng EventSource cùng cookie phiên (`withCredentials`).
 * - Mất kết nối → tự mở lại với backoff; gửi `cursor=<lastEventId>`
 *   (tương đương Last-Event-ID) để server bù sự kiện đã bỏ lỡ.
 * - `alert.updated` → invalidate danh sách/chi tiết cảnh báo + trạng thái.
 * - `notification.sent` → invalidate hộp thư.
 * - `revoked` → đóng stream, xóa cache hồ sơ, báo cho người gọi.
 * - Tab ẩn → đóng stream; hiện lại → mở lại (tiết kiệm kết nối khi không nhìn thấy).
 * - Môi trường không có EventSource (jsdom) → trạng thái idle, không lỗi.
 */
export function useSubjectEvents(
  subjectId: string | null,
  options: UseSubjectEventsOptions = {},
): SubjectEventsState {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SubjectEventsStatus>('idle');
  const [retryAttempt, setRetryAttempt] = useState(0);
  const sourceRef = useRef<EventSource | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastEventIdRef = useRef<string | null>(null);
  const attemptRef = useRef(0);
  const revokedRef = useRef(false);
  const onRevokedRef = useRef(options.onRevoked);
  onRevokedRef.current = options.onRevoked;

  useEffect(() => {
    const closeSource = () => {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const applyEffect = (raw: { event: string | null; data: unknown }) => {
      const effect = handleRealtimeEvent(raw);
      switch (effect.kind) {
        case 'refetch-alerts':
          if (subjectId) {
            void queryClient.invalidateQueries({
              queryKey: ['subjects', subjectId, 'alerts'],
            });
            void queryClient.invalidateQueries({ queryKey: queryKeys.alert(effect.alert.incidentId) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.subjectStatus(subjectId) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.subjectDevices(subjectId) });
          }
          break;
        case 'refetch-notifications':
          void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
          break;
        case 'revoked': {
          revokedRef.current = true;
          closeSource();
          if (subjectId) {
            // Thu hồi có hiệu lực ngay: dọn đúng dữ liệu của hồ sơ này theo
            // registry (không xoá toàn bộ hộp thư/cảnh báo của hồ sơ khác).
            purgeSubjectData(queryClient, subjectId);
            onRevokedRef.current?.(subjectId);
          }
          setStatus('revoked');
          break;
        }
        case 'none':
          break;
      }
    };

    const open = (cursor: string | null) => {
      if (revokedRef.current) return;
      if (typeof EventSource === 'undefined') return; // môi trường test
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const source = new EventSource(`${API_BASE}/subjects/${encodeURIComponent(subjectId ?? '')}/events${query}`, {
        withCredentials: true,
      });
      sourceRef.current = source;
      setStatus('connecting');

      source.onopen = () => {
        attemptRef.current = 0;
        setRetryAttempt(0);
        setStatus('open');
      };

      source.onmessage = (message: MessageEvent) => {
        if (message.lastEventId) lastEventIdRef.current = message.lastEventId;
        // EventSource đã tách field `event:`; data ở đây là JSON thuần.
        applyEffect({ event: null, data: parseSseData(String(message.data ?? '')) });
      };

      const bindNamed = (type: string) => {
        source.addEventListener(type, (message) => {
          const eventMessage = message as MessageEvent;
          if (eventMessage.lastEventId) lastEventIdRef.current = eventMessage.lastEventId;
          applyEffect({ event: type, data: parseSseData(String(eventMessage.data ?? '')) });
        });
      };
      bindNamed('alert.updated');
      bindNamed('notification.sent');
      bindNamed('revoked');

      source.onerror = () => {
        if (revokedRef.current) return;
        const cursor = lastEventIdRef.current;
        source.close();
        sourceRef.current = null;
        setStatus('closed');
        // Mở lại với backoff; server bù sự kiện từ cursor (Last-Event-ID).
        const delay = nextBackoffMs(attemptRef.current);
        attemptRef.current += 1;
        setRetryAttempt(attemptRef.current);
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          open(cursor);
        }, delay);
      };
    };

    closeSource();
    revokedRef.current = false;
    lastEventIdRef.current = null;
    attemptRef.current = 0;
    setRetryAttempt(0);
    if (subjectId) {
      open(null);
      setStatus((current) => (current === 'revoked' ? current : 'connecting'));
    } else {
      setStatus('idle');
    }

    const handleVisibility = () => {
      if (!subjectId) return;
      if (document.hidden) {
        // Tab ẩn: đóng stream; hiện lại sẽ mở mới (EventSource tự bù cursor).
        closeSource();
        setStatus('closed');
      } else if (!sourceRef.current && !revokedRef.current) {
        open(lastEventIdRef.current);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      closeSource();
    };
  }, [subjectId, queryClient]);

  return { status, retryAttempt };
}
