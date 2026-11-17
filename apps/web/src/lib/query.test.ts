import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { purgeSubjectData, queryKeys } from './query';

const A = '1f2d3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b';
const B = '2f3d4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b';

function notification(id: string, subjectId: string, readAt: string | null = null) {
  return {
    id,
    incidentId: `incident-${id}`,
    subjectId,
    subjectName: subjectId === A ? 'Bà Năm' : 'Ông Bình',
    incidentType: 'fall',
    state: 'open',
    revision: 1,
    kind: 'alert',
    sentAt: '2026-11-15T02:00:00.000Z',
    readAt,
    createdAt: '2026-11-15T02:00:00.000Z',
  };
}

function seed(client: QueryClient) {
  client.setQueryData(queryKeys.subjectStatus(A), { asOf: 'a' });
  client.setQueryData(queryKeys.subjectDevices(A), { items: [] });
  client.setQueryData(queryKeys.subjectStatus(B), { asOf: 'b' });
  client.setQueryData(queryKeys.alert('incident-a'), { id: 'incident-a', subjectId: A });
  client.setQueryData(queryKeys.alert('incident-b'), { id: 'incident-b', subjectId: B });
  client.setQueryData(queryKeys.notifications, {
    items: [notification('n-a', A), notification('n-b', B), notification('n-b2', B, '2026-11-15T03:00:00.000Z')],
    unreadCount: 2,
  });
}

describe('purgeSubjectData — dọn đúng phạm vi một hồ sơ', () => {
  it('xóa dữ liệu + cảnh báo + thông báo của A, giữ nguyên B (kể cả khi A đang mở)', () => {
    const client = new QueryClient();
    seed(client);

    purgeSubjectData(client, A);

    expect(client.getQueryData(queryKeys.subjectStatus(A))).toBeUndefined();
    expect(client.getQueryData(queryKeys.subjectDevices(A))).toBeUndefined();
    expect(client.getQueryData(queryKeys.alert('incident-a'))).toBeUndefined();

    // B còn nguyên: không removeQueries(['alerts']) toàn bộ, không xóa hộp thư người khác.
    expect(client.getQueryData(queryKeys.subjectStatus(B))).toEqual({ asOf: 'b' });
    expect(client.getQueryData(queryKeys.alert('incident-b'))).toEqual({
      id: 'incident-b',
      subjectId: B,
    });
    const inbox = client.getQueryData<{
      items: Array<{ id: string }>;
      unreadCount: number;
    }>(queryKeys.notifications);
    expect(inbox?.items.map((item) => item.id)).toEqual(['n-b', 'n-b2']);
    // Chỉ trừ số chưa đọc của item bị loại (n-a), item đã đọc của B không bị tính.
    expect(inbox?.unreadCount).toBe(1);
  });

  it('không có cache → không lỗi, hộp thư giữ nguyên khi không có item của hồ sơ', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.notifications, {
      items: [notification('n-b', B)],
      unreadCount: 1,
    });

    expect(() => purgeSubjectData(client, A)).not.toThrow();
    expect(
      client.getQueryData<{ items: Array<{ id: string }> }>(queryKeys.notifications)?.items,
    ).toHaveLength(1);
  });
});
