import { localDateKey } from '../src/measurements/insights';
import {
  isValidTimezone,
  timezoneOffsetMs,
  zonedDayToUtcRange,
  zonedToUtc,
} from '../src/measurements/time-utils';

/**
 * Q-09: kiểm trực tiếp helper thời gian theo timezone. Không dùng mốc "bom hẹn giờ"
 * (ví dụ 2027-01-01); mọi mốc tương lai đều tính tương đối từ Date.now().
 */
describe('Tiện ích thời gian theo timezone hồ sơ', () => {
  it('isValidTimezone nhận IANA hợp lệ, từ chối chuỗi rỗng/không tồn tại', () => {
    expect(isValidTimezone('Asia/Ho_Chi_Minh')).toBe(true);
    expect(isValidTimezone('America/New_York')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('Not/A_Timezone')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
  });

  it('timezoneOffsetMs trả offset đúng, kể cả DST của America/New_York', () => {
    expect(timezoneOffsetMs(Date.UTC(2026, 10, 13, 0, 0, 0), 'Asia/Ho_Chi_Minh')).toBe(
      7 * 3600 * 1000,
    );
    // Mùa đông EST = UTC-5; mùa hè EDT = UTC-4.
    expect(timezoneOffsetMs(Date.UTC(2026, 0, 15, 12, 0, 0), 'America/New_York')).toBe(
      -5 * 3600 * 1000,
    );
    expect(timezoneOffsetMs(Date.UTC(2026, 6, 15, 12, 0, 0), 'America/New_York')).toBe(
      -4 * 3600 * 1000,
    );
  });

  it('zonedToUtc xử lý nửa đêm và chuyển DST, không phụ thuộc TZ máy chạy', () => {
    // 2026-11-13 00:00 tại Asia/Ho_Chi_Minh = 2026-11-12T17:00Z.
    expect(zonedToUtc(2026, 10, 13, 0, 0, 0, 'Asia/Ho_Chi_Minh').toISOString()).toBe(
      '2026-11-12T17:00:00.000Z',
    );

    // 2026-03-08 là ngày bắt đầu DST ở Mỹ: 12:00 EST (07/03) = 17:00Z,
    // 12:00 EDT (08/03) = 16:00Z. Kiểm cả hai phía để lặp offset không sai.
    expect(zonedToUtc(2026, 2, 7, 12, 0, 0, 'America/New_York').toISOString()).toBe(
      '2026-03-07T17:00:00.000Z',
    );
    expect(zonedToUtc(2026, 2, 8, 12, 0, 0, 'America/New_York').toISOString()).toBe(
      '2026-03-08T16:00:00.000Z',
    );

    // 2026-11-01 kết thúc DST: 12:00 EDT (31/10) = 16:00Z, 12:00 EST (01/11) = 17:00Z.
    expect(zonedToUtc(2026, 9, 31, 12, 0, 0, 'America/New_York').toISOString()).toBe(
      '2026-10-31T16:00:00.000Z',
    );
    expect(zonedToUtc(2026, 10, 1, 12, 0, 0, 'America/New_York').toISOString()).toBe(
      '2026-11-01T17:00:00.000Z',
    );
  });

  it('zonedDayToUtcRange trả đúng khoảng nửa đêm → nửa đêm ngày kế; timezone sai fallback UTC', () => {
    const hcm = zonedDayToUtcRange('2026-11-13', 'Asia/Ho_Chi_Minh');
    expect(hcm.from.toISOString()).toBe('2026-11-12T17:00:00.000Z');
    expect(hcm.to.toISOString()).toBe('2026-11-13T17:00:00.000Z');

    const fallback = zonedDayToUtcRange('2026-11-13', 'Not/A_Timezone');
    expect(fallback.from.toISOString()).toBe('2026-11-13T00:00:00.000Z');
    expect(fallback.to.toISOString()).toBe('2026-11-14T00:00:00.000Z');

    expect(() => zonedDayToUtcRange('2026-02-30', 'Asia/Ho_Chi_Minh')).toThrow(/date không hợp lệ/);
    expect(() => zonedDayToUtcRange('13-11-2026', 'Asia/Ho_Chi_Minh')).toThrow(/YYYY-MM-DD/);
  });

  it('localDateKey đổi ngày đúng tại biên 17:00Z của Asia/Ho_Chi_Minh', () => {
    expect(localDateKey(new Date('2026-11-12T16:59:59.999Z'), 'Asia/Ho_Chi_Minh')).toBe(
      '2026-11-12',
    );
    expect(localDateKey(new Date('2026-11-12T17:00:00.000Z'), 'Asia/Ho_Chi_Minh')).toBe(
      '2026-11-13',
    );
  });

  it('ngày tương lai tính tương đối luôn nằm sau hiện tại (không bom hẹn giờ)', () => {
    const now = new Date();
    const futureInstant = new Date(now.getTime() + 2 * 24 * 3600 * 1000);
    const futureDate = localDateKey(futureInstant, 'Asia/Ho_Chi_Minh');
    const range = zonedDayToUtcRange(futureDate, 'Asia/Ho_Chi_Minh');
    expect(range.from.getTime()).toBeGreaterThan(now.getTime());
    expect(range.to.getTime()).toBeGreaterThan(range.from.getTime());

    // Ngược lại, ngày hôm qua tính tương đối luôn bắt đầu trước hiện tại.
    const pastDate = localDateKey(new Date(now.getTime() - 2 * 24 * 3600 * 1000), 'Asia/Ho_Chi_Minh');
    expect(zonedDayToUtcRange(pastDate, 'Asia/Ho_Chi_Minh').from.getTime()).toBeLessThan(
      now.getTime(),
    );
  });
});
