import { describe, expect, it } from 'vitest';
import { handleRealtimeEvent, nextBackoffMs, parseSseBlock, parseSseData } from './sse';

// FR-13 / SSE — parser khối sự kiện, reducer ánh xạ hiệu ứng cache, backoff.
describe('parseSseBlock', () => {
  it('parse khối data một dòng kèm id và event', () => {
    const parsed = parseSseBlock('id: 42\nevent: alert.updated\ndata: {"state":"open"}\n');
    expect(parsed).toEqual({ id: '42', event: 'alert.updated', data: { state: 'open' } });
  });

  it('bỏ dòng comment và parse JSON một dòng; JSON nhiều dòng sai thì null', () => {
    expect(parseSseBlock(': ping\ndata: {"ok":true}\n').data).toEqual({ ok: true });
    const multi = parseSseBlock('data: dòng một\ndata: dòng hai\n');
    // Nối dữ liệu đa dòng rồi JSON.parse — payload API luôn JSON một dòng.
    expect(multi.data).toBeNull();
  });

  it('JSON sai → data null, không ném lỗi', () => {
    expect(parseSseBlock('data: {không phải json}\n').data).toBeNull();
  });

  it('không có dòng data → data null', () => {
    expect(parseSseBlock('event: revoked\n').data).toBeNull();
  });
});

describe('parseSseData', () => {
  it('parse JSON data của MessageEvent (không có tiền tố data:)', () => {
    expect(parseSseData('{"state":"open"}')).toEqual({ state: 'open' });
    expect(parseSseData('{}')).toEqual({});
    expect(parseSseData('')).toBeNull();
    expect(parseSseData('không phải json')).toBeNull();
  });
});

describe('handleRealtimeEvent', () => {
  const alertPayload = {
    incidentId: '2f3d4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b',
    subjectId: '1f2d3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b',
    state: 'acknowledged',
    version: 4,
    lastRevision: 2,
    occurredAt: '2026-11-14T09:00:00.000Z',
  };

  it('alert.updated hợp lệ → refetch cảnh báo với payload đã parse', () => {
    const effect = handleRealtimeEvent({ event: 'alert.updated', data: alertPayload });
    expect(effect).toEqual({ kind: 'refetch-alerts', alert: alertPayload });
  });

  it('alert.updated lệch hợp đồng → bỏ qua, không phá stream', () => {
    expect(handleRealtimeEvent({ event: 'alert.updated', data: { nope: true } })).toEqual({
      kind: 'none',
    });
  });

  it('notification.sent → làm mới thông báo', () => {
    expect(handleRealtimeEvent({ event: 'notification.sent', data: {} })).toEqual({
      kind: 'refetch-notifications',
    });
  });

  it('revoked → đóng stream và xóa dữ liệu', () => {
    expect(handleRealtimeEvent({ event: 'revoked', data: null })).toEqual({ kind: 'revoked' });
  });

  it('sự kiện không biết → none', () => {
    expect(handleRealtimeEvent({ event: 'lạ', data: {} })).toEqual({ kind: 'none' });
  });
});

describe('nextBackoffMs', () => {
  it('tăng theo cấp số nhân và chặn trần 30s', () => {
    expect(nextBackoffMs(0)).toBe(1000);
    expect(nextBackoffMs(1)).toBe(2000);
    expect(nextBackoffMs(2)).toBe(4000);
    expect(nextBackoffMs(10)).toBe(30_000);
    expect(nextBackoffMs(1000)).toBe(30_000);
  });

  it('attempt âm coi như 0', () => {
    expect(nextBackoffMs(-3)).toBe(1000);
  });
});
