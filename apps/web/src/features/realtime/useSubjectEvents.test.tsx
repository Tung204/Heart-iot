import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSubjectEvents } from './useSubjectEvents';

const SUBJECT_ID = '1f2d3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b';

/** EventSource giả — kiểm tra vòng đời stream mà không cần máy chủ thật. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  private readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown, lastEventId = '') {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: JSON.stringify(data), lastEventId } as MessageEvent);
    }
  }
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { queryClient, Wrapper };
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});

// P2-6 (hiệu năng/ổn định v2) — hook phải phơi trạng thái mất kết nối để
// AppShell hiện banner “Mất cập nhật trực tiếp — đang thử lại” và ẩn khi nối lại.
describe('useSubjectEvents — trạng thái kết nối', () => {
  it('mở stream của đúng hồ sơ; onopen → open và retryAttempt = 0', () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useSubjectEvents(SUBJECT_ID), { wrapper: Wrapper });

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]!.url).toContain(`/subjects/${SUBJECT_ID}/events`);
    expect(result.current.status).toBe('connecting');

    act(() => FakeEventSource.instances[0]!.onopen?.());
    expect(result.current.status).toBe('open');
    expect(result.current.retryAttempt).toBe(0);
  });

  it('onerror → closed + retryAttempt; nối lại sau 1 giây kèm cursor, onopen reset', () => {
    vi.useFakeTimers();
    try {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useSubjectEvents(SUBJECT_ID), { wrapper: Wrapper });
      const first = FakeEventSource.instances[0]!;
      act(() => first.onopen?.());

      // Ghi nhận lastEventId để lần nối lại bù sự kiện đã bỏ lỡ.
      act(() => first.emit('alert.updated', {}, '11'));
      act(() => first.onerror?.());

      expect(result.current.status).toBe('closed');
      expect(result.current.retryAttempt).toBe(1);
      expect(first.closed).toBe(true);

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(FakeEventSource.instances).toHaveLength(2);
      expect(FakeEventSource.instances[1]!.url).toContain('cursor=11');
      // Đang thử lại: vẫn còn retryAttempt > 0 để banner chưa biến mất.
      expect(result.current.status).toBe('connecting');
      expect(result.current.retryAttempt).toBe(1);

      act(() => FakeEventSource.instances[1]!.onopen?.());
      expect(result.current.status).toBe('open');
      expect(result.current.retryAttempt).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('không có hồ sơ đang xem → idle, không mở kết nối', () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useSubjectEvents(null), { wrapper: Wrapper });

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(result.current.status).toBe('idle');
  });

  it('notification.sent → invalidate hộp thư (badge đọc lại ngay, không chờ poll)', () => {
    const { queryClient, Wrapper } = createWrapper();
    queryClient.setQueryData(['notifications'], { items: [], unreadCount: 0 });
    renderHook(() => useSubjectEvents(SUBJECT_ID), { wrapper: Wrapper });

    act(() => FakeEventSource.instances[0]!.emit('notification.sent', {}, '12'));

    expect(queryClient.getQueryState(['notifications'])?.isInvalidated).toBe(true);
  });

  it('revoked → đóng stream và báo trạng thái revoked (không hiện banner mất kết nối)', () => {
    const onRevoked = vi.fn();
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useSubjectEvents(SUBJECT_ID, { onRevoked }), {
      wrapper: Wrapper,
    });
    const source = FakeEventSource.instances[0]!;

    act(() => source.emit('revoked', {}));

    expect(result.current.status).toBe('revoked');
    expect(source.closed).toBe(true);
    expect(onRevoked).toHaveBeenCalledWith(SUBJECT_ID);
  });

  it('revoked B khi cache còn A → chỉ dọn B, không remove toàn bộ alerts/hộp thư A', () => {
    const OTHER = '2f3d4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b';
    const onRevoked = vi.fn();
    const { queryClient, Wrapper } = createWrapper();
    // Cache của A (hồ sơ khác) còn sống trong lúc stream của B bị thu hồi.
    queryClient.setQueryData(['subjects', OTHER, 'status'], { asOf: 'a' });
    queryClient.setQueryData(['alerts', 'incident-a'], { id: 'incident-a', subjectId: OTHER });
    queryClient.setQueryData(['subjects', SUBJECT_ID, 'status'], { asOf: 'b' });
    queryClient.setQueryData(['alerts', 'incident-b'], {
      id: 'incident-b',
      subjectId: SUBJECT_ID,
    });
    queryClient.setQueryData(['notifications'], {
      items: [
        { id: 'n-a', subjectId: OTHER, readAt: null },
        { id: 'n-b', subjectId: SUBJECT_ID, readAt: null },
      ],
      unreadCount: 2,
    });

    const { result } = renderHook(() => useSubjectEvents(SUBJECT_ID, { onRevoked }), {
      wrapper: Wrapper,
    });
    act(() => FakeEventSource.instances[0]!.emit('revoked', {}));

    expect(result.current.status).toBe('revoked');
    expect(queryClient.getQueryData(['subjects', SUBJECT_ID, 'status'])).toBeUndefined();
    expect(queryClient.getQueryData(['alerts', 'incident-b'])).toBeUndefined();

    // A còn nguyên.
    expect(queryClient.getQueryData(['subjects', OTHER, 'status'])).toEqual({ asOf: 'a' });
    expect(queryClient.getQueryData(['alerts', 'incident-a'])).toEqual({
      id: 'incident-a',
      subjectId: OTHER,
    });
    const inbox = queryClient.getQueryData<{
      items: Array<{ id: string }>;
      unreadCount: number;
    }>(['notifications']);
    expect(inbox?.items.map((item) => item.id)).toEqual(['n-a']);
    expect(inbox?.unreadCount).toBe(1);
  });
});
