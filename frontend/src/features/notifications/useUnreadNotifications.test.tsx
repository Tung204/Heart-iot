import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { errorEnvelope, mockResponse, stubFetch } from '../../test/utils';
import {
  UNREAD_POLL_INTERVAL_MS,
  unreadPollInterval,
  useUnreadNotifications,
} from './useUnreadNotifications';

function notification(id: string, createdAt = '2026-11-15T02:00:00.000Z') {
  return {
    id,
    incidentId: '2f3d4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b',
    subjectId: '1f2d3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b',
    subjectName: 'Bà Năm',
    incidentType: 'sos',
    state: 'open',
    revision: 1,
    kind: 'alert',
    sentAt: createdAt,
    readAt: null as string | null,
    createdAt,
  };
}

type Payload = { items: ReturnType<typeof notification>[]; unreadCount: number };

function setup(initial: Payload) {
  let payload = initial;
  const fetchMock = stubFetch((url) => {
    if (url.endsWith('/notifications')) return mockResponse(payload);
    return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  const rendered = renderHook(() => useUnreadNotifications(true), { wrapper: Wrapper });
  return {
    ...rendered,
    fetchMock,
    queryClient,
    setPayload: (next: Payload) => {
      payload = next;
    },
    refetch: () =>
      act(async () => {
        await queryClient.refetchQueries({ queryKey: ['notifications'] });
      }),
  };
}

const NEW_ID = '5f6d7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b';

describe('useUnreadNotifications — chính sách tải', () => {
  it('20–30 giây khi tab hiện; tab ẩn thì dừng hẳn interval', () => {
    expect(UNREAD_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(20_000);
    expect(UNREAD_POLL_INTERVAL_MS).toBeLessThanOrEqual(30_000);
    expect(unreadPollInterval(false)).toBe(UNREAD_POLL_INTERVAL_MS);
    expect(unreadPollInterval(true)).toBe(false);
  });
});

describe('useUnreadNotifications — phát hiện thông báo mới', () => {
  it('lần tải đầu chỉ lập mốc: có 2 chưa đọc nhưng không báo “mới”', async () => {
    const { result } = setup({
      items: [notification(NEW_ID), notification('6f7d8a9b-0c1d-4e2f-8a3b-4c5d6e7f8a9b')],
      unreadCount: 2,
    });

    await waitFor(() => expect(result.current.unreadCount).toBe(2));
    expect(result.current.newNotification).toBeNull();
  });

  it('id mới → báo một lần; dismiss rồi tải lại cùng dữ liệu không bật lại', async () => {
    const { result, setPayload, refetch, queryClient } = setup({ items: [], unreadCount: 0 });
    await waitFor(() => expect(queryClient.getQueryData(['notifications'])).toBeDefined());

    setPayload({ items: [notification(NEW_ID)], unreadCount: 1 });
    await refetch();

    await waitFor(() => expect(result.current.unreadCount).toBe(1));
    await waitFor(() => expect(result.current.newNotification?.id).toBe(NEW_ID));
    expect(result.current.newNotification?.subjectName).toBe('Bà Năm');

    act(() => result.current.dismiss());
    expect(result.current.newNotification).toBeNull();

    await refetch();
    await waitFor(() => expect(result.current.unreadCount).toBe(1));
    expect(result.current.newNotification).toBeNull();
  });

  it('số chưa đọc tăng dù chưa thấy id mới → vẫn báo bằng thông báo chưa đọc', async () => {
    const { result, setPayload, refetch, queryClient } = setup({
      items: [{ ...notification(NEW_ID), readAt: '2026-11-15T03:00:00.000Z' }],
      unreadCount: 0,
    });
    await waitFor(() => expect(queryClient.getQueryData(['notifications'])).toBeDefined());

    // Cùng id nhưng chuyển từ đã đọc sang chưa đọc (ví dụ dữ liệu tải lại lệch).
    setPayload({
      items: [{ ...notification(NEW_ID), readAt: null }],
      unreadCount: 1,
    });
    await refetch();

    await waitFor(() => expect(result.current.unreadCount).toBe(1));
    await waitFor(() => expect(result.current.newNotification?.id).toBe(NEW_ID));
  });
});
