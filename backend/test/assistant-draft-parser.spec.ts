import { AppError } from '../src/common/app-error';
import { parseAssistantDraftText } from '../src/assistant/assistant-draft-parser';

/**
 * Parser câu lệnh nhắc — chỉ kiểm grammar hẹp đã cam kết. Không gọi model,
 * không đọc DB; kết quả vẫn là nháp cần confirm.
 */

// 17:30Z = 00:30 ngày 21/11/2026 tại Asia/Ho_Chi_Minh.
const NOW = new Date('2026-11-20T17:30:00.000Z');
const TZ = 'Asia/Ho_Chi_Minh';

function parse(text: string) {
  return parseAssistantDraftText(text, { now: NOW, timezone: TZ });
}

function expectError(text: string, reason: string): void {
  try {
    parse(text);
    throw new Error('Parser phải từ chối câu này.');
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.status).toBe(422);
    expect(appError.details).toMatchObject({ reason });
  }
}

describe('Parser câu lệnh nháp lịch nhắc', () => {
  it('hiểu câu nhắc uống thuốc hằng ngày, giữ tiêu đề có dấu', () => {
    const input = parse('nhắc tôi uống thuốc lúc 8h sáng hằng ngày');
    expect(input).toMatchObject({
      kind: 'medication',
      title: 'uống thuốc',
      times: ['08:00'],
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      startsOn: '2026-11-21',
      endsOn: null,
      active: true,
    });
    expect(input.note).toBeNull();
  });

  it('hiểu khoảng thứ 2 đến thứ 6 và giờ có phút', () => {
    const input = parse('nhắc tôi đi bộ 6h30 thứ 2 đến thứ 6');
    expect(input).toMatchObject({
      kind: 'activity',
      title: 'đi bộ',
      times: ['06:30'],
      weekdays: [2, 3, 4, 5, 6],
      startsOn: '2026-11-21',
    });
  });

  it('hiểu nhiều giờ trong ngày và “ngày mai”', () => {
    const input = parse('nhắc tôi uống nước 8h sáng và 8h tối ngày mai');
    expect(input).toMatchObject({
      kind: 'activity',
      title: 'uống nước',
      times: ['08:00', '20:00'],
      startsOn: '2026-11-22',
    });
  });

  it('phân loại đo huyết áp là measurement, không phải medication', () => {
    const input = parse('nhắc tôi đo huyết áp lúc 7h');
    expect(input).toMatchObject({
      kind: 'measurement',
      title: 'đo huyết áp',
      times: ['07:00'],
    });
  });

  it('nếu mọi giờ hôm nay đã qua thì bắt đầu từ mai', () => {
    // Hiện tại 00:30; 00:10 đã qua nên occurrence đầu là ngày mai.
    const input = parse('nhắc tôi uống thuốc lúc 00:10');
    expect(input.startsOn).toBe('2026-11-22');
    expect(input.times).toEqual(['00:10']);
  });

  it('từ chối liều lượng, thiếu giờ, thiếu tiền tố hoặc ngày không hỗ trợ', () => {
    expectError('nhắc tôi uống thuốc 2 viên lúc 8h', 'medical_dosage');
    expectError('nhắc tôi uống thuốc', 'missing_time');
    expectError('uống thuốc lúc 8h', 'missing_request');
    expectError('nhắc tôi uống thuốc lúc 8h ngày 25/11', 'unsupported_date');
    expectError('nhắc tôi uống thuốc lúc 8h trong 7 ngày', 'unsupported_end');
    expectError('nhắc tôi uống thuốc lúc 25h', 'invalid_time');
  });

  it('hiểu ngày kết thúc dạng ngày/tháng và bỏ cụm ngày khỏi tiêu đề', () => {
    const input = parse('nhắc tôi uống thuốc lúc 8h đến 30/11');
    expect(input).toMatchObject({
      title: 'uống thuốc',
      times: ['08:00'],
      startsOn: '2026-11-21',
      endsOn: '2026-11-30',
    });
  });

  it('hiểu ngày kết thúc có năm và “đến hết ngày”', () => {
    const input = parse('nhắc tôi đo huyết áp 7h sáng đến hết ngày 31/12/2026');
    expect(input).toMatchObject({
      kind: 'measurement',
      title: 'đo huyết áp',
      startsOn: '2026-11-21',
      endsOn: '2026-12-31',
    });
  });

  it('cho phép ngày kết thúc qua năm mới khi ghi rõ năm', () => {
    const input = parse('nhắc tôi uống nước 8h đến 05/01/2027');
    expect(input.endsOn).toBe('2027-01-05');
  });

  it('từ chối ngày kết thúc không hợp lệ, trước ngày bắt đầu hoặc bị lặp', () => {
    expectError('nhắc tôi uống thuốc lúc 8h đến 31/02', 'invalid_end_date');
    expectError('nhắc tôi uống thuốc lúc 8h đến 20/11', 'end_before_start');
    expectError('nhắc tôi uống thuốc lúc 8h đến 30/11 và đến 31/12', 'ambiguous_end_date');
  });

  it('từ chối câu không có tiêu đề sau khi bỏ phần nhắc giờ', () => {
    expectError('nhắc tôi lúc 8h', 'missing_title');
  });
});
