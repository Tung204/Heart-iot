import {
  DEFAULT_INACTIVITY_RULE_CONFIG,
  DEFAULT_CARE_DIGEST_RULE_CONFIG,
  type InactivityRuleConfig,
} from '@heart-iot/contracts/care-rules';
import {
  buildDigestPreview,
  buildInactivityPreview,
  inactivityWindowUtc,
  isDigestDue,
  isInactivityDue,
  localDateTimeToUtc,
  localTimeKey,
  sumStepsInRows,
  timeOfDayMinutes,
} from '../src/care-rules/care-rule-schedule';

const TZ = 'Asia/Ho_Chi_Minh';
const NOW = new Date('2026-11-20T11:10:00.000Z'); // 18:10 thứ Sáu

function config(overrides: Partial<InactivityRuleConfig> = {}): InactivityRuleConfig {
  return {
    ...DEFAULT_INACTIVITY_RULE_CONFIG,
    weekdays: [...DEFAULT_INACTIVITY_RULE_CONFIG.weekdays],
    enabled: true,
    ...overrides,
  };
}

function sample(
  measuredAt: string,
  steps: number,
  bootId = 'boot-1',
  motion: 'valid' | 'sensor_error' = 'valid',
) {
  return {
    bootId,
    measuredAt: new Date(measuredAt),
    metrics: { heart_rate_bpm: 70, steps_since_boot: steps },
    quality: { heart_rate: 'valid' as const, motion },
  };
}

describe('Lịch quy tắc chăm sóc — hàm thuần', () => {
  it('tính giờ/khung theo timezone và cửa sổ grace', () => {
    expect(localTimeKey(NOW, TZ)).toBe('18:10');
    expect(timeOfDayMinutes('09:30')).toBe(570);
    expect(localDateTimeToUtc('2026-11-20', '18:00', TZ).toISOString()).toBe(
      '2026-11-20T11:00:00.000Z',
    );
    const window = inactivityWindowUtc(config(), '2026-11-20', TZ);
    expect(window.from.toISOString()).toBe('2026-11-20T02:00:00.000Z');
    expect(window.to.toISOString()).toBe('2026-11-20T11:00:00.000Z');

    expect(isInactivityDue(config({ weekdays: [5] }), NOW, TZ)).toBe(true);
    expect(
      isInactivityDue(config({ weekdays: [5] }), new Date('2026-11-20T11:30:00Z'), TZ),
    ).toBe(true); // đúng biên 18:30
    expect(
      isInactivityDue(config({ weekdays: [5] }), new Date('2026-11-20T11:31:00Z'), TZ),
    ).toBe(false);
    expect(
      isInactivityDue(config({ weekdays: [6] }), NOW, TZ),
    ).toBe(false);
    expect(isInactivityDue(config({ enabled: false }), NOW, TZ)).toBe(false);
  });

  it('bản tin chỉ tới giờ cấu hình, không phụ thuộc ngày', () => {
    expect(isDigestDue({ ...DEFAULT_CARE_DIGEST_RULE_CONFIG, enabled: true }, NOW, TZ)).toBe(
      false,
    );
    expect(
      isDigestDue(
        { ...DEFAULT_CARE_DIGEST_RULE_CONFIG, enabled: true },
        new Date('2026-11-20T13:00:00Z'),
        TZ,
      ),
    ).toBe(true);
  });

  it('cộng bước theo delta, bỏ reset và khoảng mất mẫu', () => {
    const rows = [
      sample('2026-11-20T09:58:00Z', 0),
      sample('2026-11-20T09:59:00Z', 20),
      sample('2026-11-20T10:00:00Z', 15), // reset → bỏ
      sample('2026-11-20T10:01:00Z', 40), // +25
    ];
    expect(sumStepsInRows(rows, 60_000)).toBe(45);
    const gap = [
      sample('2026-11-20T09:00:00Z', 0),
      sample('2026-11-20T10:00:00Z', 100),
    ];
    expect(sumStepsInRows(gap, 60_000)).toBe(0);
    expect(sumStepsInRows([sample('2026-11-20T09:00:00Z', 10, 'b', 'sensor_error')], 60_000)).toBe(0);
  });

  it('preview đủ 7 ngày và phản ánh trạng thái tắt/bật, không dự đoán dữ liệu', () => {
    const inactivity = buildInactivityPreview(config({ weekdays: [5] }), NOW, TZ);
    expect(inactivity.days).toHaveLength(7);
    expect(inactivity.days[0]).toMatchObject({ date: '2026-11-20', time: '18:00', applies: true });
    expect(inactivity.days[1]).toMatchObject({ date: '2026-11-21', applies: false });
    expect(inactivity.disclaimer).toContain('không phải dự đoán sức khỏe');

    const digest = buildDigestPreview(
      { enabled: false, time: '20:00' },
      NOW,
      TZ,
    );
    expect(digest.days.every((day) => day.applies === false && day.time === '20:00')).toBe(true);
  });
});
