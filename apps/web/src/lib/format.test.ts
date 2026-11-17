import { describe, expect, it, vi } from 'vitest';
import {
  formatCompactDateTime,
  formatDate,
  formatDateTime,
  formatShortDate,
  formatTime,
} from './format';

/**
 * QA v2 P1-2: mỗi ô trong bảng từng dựng một `Intl.DateTimeFormat` mới (~52 µs/lần),
 * chiếm khoảng một nửa thời gian render 1.681 dòng. Formatter bất biến nay được
 * tạo một lần ở phạm vi module — test này giữ đúng bất biến đó.
 */
describe('lib/format — dùng lại Intl.DateTimeFormat', () => {
  it('không tạo formatter mới cho mỗi lần định dạng', () => {
    const constructorSpy = vi.spyOn(Intl, 'DateTimeFormat');

    for (let index = 0; index < 200; index += 1) {
      const iso = new Date(Date.UTC(2026, 10, 14, 9, 0, 0) - index * 15_000).toISOString();
      formatCompactDateTime(iso);
      formatDateTime(iso);
      formatShortDate(iso);
      formatDate(iso);
      formatTime(iso);
    }

    expect(constructorSpy).not.toHaveBeenCalled();
  });

  it('giữ nguyên định dạng hiển thị và trả lại chuỗi gốc khi không phải ngày hợp lệ', () => {
    const iso = '2026-11-14T09:05:00.000Z';
    expect(formatCompactDateTime(iso)).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
    expect(formatShortDate(iso)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(formatDateTime(iso).length).toBeGreaterThan(0);
    expect(formatDate(iso).length).toBeGreaterThan(0);
    expect(formatTime(iso).length).toBeGreaterThan(0);

    expect(formatCompactDateTime('không phải ngày')).toBe('không phải ngày');
    expect(formatDateTime('không phải ngày')).toBe('không phải ngày');
    expect(formatShortDate('không phải ngày')).toBe('không phải ngày');
    expect(formatDate('không phải ngày')).toBe('không phải ngày');
    expect(formatTime('không phải ngày')).toBe('không phải ngày');
  });
});
