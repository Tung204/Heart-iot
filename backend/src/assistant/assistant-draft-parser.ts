import { createReminderSchema, type CreateReminderInput } from '@heart-iot/contracts/reminders';
import { AppError } from '../common/app-error';
import { addDays } from '../common/local-date';
import { localDateKey } from '../measurements/insights';
import { isValidTimezone } from '../measurements/time-utils';

/**
 * Parser câu lệnh lịch nhắc — **rule-based, phạm vi hẹp**, không phải LLM.
 *
 * Chỉ nhận câu bắt đầu bằng “nhắc tôi”/“đặt lịch”…, có ít nhất một giờ nhắc.
 * Kết quả vẫn chỉ là **nháp**; người dùng phải xem preview và xác nhận qua
 * AssistantActionsService.confirm mới ghi `care_reminders`.
 *
 * Không suy luận liều lượng hoặc chẩn đoán. Câu có số viên/mg/ml bị từ chối để
 * tránh biến câu nói thành chỉ định y khoa. Ngày kết thúc chỉ nhận khi người
 * dùng nêu rõ ngày/tháng(/năm); khoảng thời gian tương đối vẫn bị từ chối.
 */

export const PARSER_VERSION = 2;

const PREFIX_RE =
  /^\s*(?:hãy\s+)?(?:nhắc(?:\s+(?:tôi|mình|em|cháu|bạn|anh|chị))?|tạo\s+lịch|đặt\s+lịch|lên\s+lịch)\s*/iu;

const TIME_PATTERN =
  '(?<!\\d)(\\d{1,2})\\s*(?::\\s*(\\d{1,2})|(?:h|giờ)\\s*(\\d{1,2})?)(?:\\s*(sáng|chiều|tối|đêm))?(?!\\d)';

const RECURRENCE_RE =
  /(?:hằng|hàng|mỗi|hang|moi)\s+ngày|\bthứ\s*(?:[2-7]|hai|ba|tư|tu|năm|nam|sáu|sau|bảy|bay)\b|\bthu\s*(?:[2-7]|hai|ba|tu|nam|sau|bay)\b|\bchủ\s+nhật\b|\bchu\s+nhat\b|\bt[2-7]\b/iu;

const END_DATE_FOLDED_RE =
  /\b(?:den|toi)\s+(?:het\s+)?(?:ngay\s+)?(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{4}))?\b/g;

const END_DATE_DISPLAY_RE =
  /(?:đến|tới|den|toi)\s+(?:hết\s+)?(?:ngày\s+)?\d{1,2}\s*[/-]\s*\d{1,2}(?:\s*[/-]\s*\d{4})?/giu;

const WEEKDAY_WORDS: Record<string, number> = {
  '2': 2,
  hai: 2,
  '3': 3,
  ba: 3,
  '4': 4,
  tu: 4,
  '5': 5,
  nam: 5,
  '6': 6,
  sau: 6,
  '7': 7,
  bay: 7,
};

function timeRegex(): RegExp {
  return new RegExp(TIME_PATTERN, 'giu');
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function validation(reason: string, message: string): never {
  throw AppError.validation(message, { reason });
}

function readPeriod(raw: string | undefined): string {
  return raw ? fold(raw) : '';
}

function parseTime(match: RegExpMatchArray): string {
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? match[3] ?? 0);
  const period = readPeriod(match[4]);
  if (period === 'chieu' || period === 'toi' || period === 'dem') {
    if (hour < 12) hour += 12;
  }
  if (period === 'sang' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) {
    validation('invalid_time', 'Giờ nhắc không hợp lệ; hãy dùng giờ từ 00:00 đến 23:59.');
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function localTimeKey(instant: Date, timezone: string): string {
  const zone = isValidTimezone(timezone) ? timezone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const read = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return `${read('hour')}:${read('minute')}`;
}

function weekdayFromToken(token: string | undefined): number | null {
  if (!token) return null;
  return WEEKDAY_WORDS[token] ?? null;
}

/** Bỏ cụm ngày kết thúc khỏi phần tiêu đề; giữ lại câu gốc để báo lỗi. */
function stripEndDate(source: string): string {
  const matches = [...source.matchAll(new RegExp(END_DATE_DISPLAY_RE.source, 'giu'))];
  if (matches.length > 1) {
    validation('ambiguous_end_date', 'Câu có nhiều ngày kết thúc; hãy chọn một ngày.');
  }
  return source.replace(new RegExp(END_DATE_DISPLAY_RE.source, 'giu'), ' ');
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Ngày kết thúc dạng `đến/tới [hết] [ngày] dd/mm[/yyyy]`.
 * Không có năm thì dùng năm của ngày bắt đầu; không tự đoán năm kế tiếp.
 */
function parseEndDate(folded: string, startsOn: string): string | null {
  const matches = [...folded.matchAll(new RegExp(END_DATE_FOLDED_RE.source, 'g'))];
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    validation('ambiguous_end_date', 'Câu có nhiều ngày kết thúc; hãy chọn một ngày.');
  }
  const match = matches[0]!;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3] ? Number(match[3]) : Number(startsOn.slice(0, 4));
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    validation(
      'invalid_end_date',
      'Ngày kết thúc không hợp lệ; hãy dùng dạng ngày/tháng hoặc ngày/tháng/năm.',
    );
  }
  const endsOn = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (endsOn < startsOn) {
    validation(
      'end_before_start',
      'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu; nếu qua năm mới hãy ghi rõ năm.',
    );
  }
  return endsOn;
}

/** Ngày bắt đầu: hôm nay, mai, hoặc ngày mai nếu mọi giờ đã qua. */
function resolveStartDate(
  folded: string,
  times: string[],
  now: Date,
  timezone: string,
): string {
  const hasTomorrow = /\b(?:ngay\s+)?mai\b/.test(folded);
  const hasToday = /\bhom\s+nay\b/.test(folded);
  if (hasTomorrow && hasToday) {
    validation('ambiguous_date', 'Câu có cả “hôm nay” và “mai”; hãy chọn một ngày bắt đầu.');
  }
  if (
    /\b(?:trong|den)\s+\d+\s*(?:ngay|tuan)\b/.test(folded) ||
    /\bden\s+(?:het|ngay)\b/.test(folded)
  ) {
    validation(
      'unsupported_end',
      'Trợ lý chưa hỗ trợ khoảng thời gian như “trong 7 ngày”; hãy nêu ngày kết thúc cụ thể hoặc dùng biểu mẫu.',
    );
  }
  if (
    /\b(?:ngay\s+)?\d{1,2}\s*[/-]\s*\d{1,2}\b/.test(folded) ||
    /\bngay\s+\d{1,2}\b/.test(folded) ||
    /\btuan\s+(?:sau|toi)\b/.test(folded)
  ) {
    validation(
      'unsupported_date',
      'Trợ lý chỉ hiểu “hôm nay” hoặc “mai”; hãy dùng biểu mẫu cho ngày khác.',
    );
  }

  const today = localDateKey(now, timezone);
  if (hasTomorrow) return addDays(today, 1);
  if (hasToday) return today;

  const current = localTimeKey(now, timezone);
  const allPast = times.every((time) => time <= current);
  return allPast ? addDays(today, 1) : today;
}

/** Ngày trong tuần: mặc định cả tuần; hỗ trợ “hằng ngày”, khoảng và ngày lẻ. */
function parseWeekdays(folded: string): number[] {
  if (/\b(?:hang|moi)\s+tuan\b/.test(folded) || /\bweekly\b/.test(folded)) {
    validation(
      'unsupported_recurrence',
      'Trợ lý chưa hỗ trợ lặp theo tuần; hãy chọn ngày trong biểu mẫu.',
    );
  }

  const weekdays = new Set<number>();
  const rangePattern =
    /\bthu\s*([2-7]|hai|ba|tu|nam|sau|bay)\s*(?:den|->|-|toi)\s*(?:thu\s*)?([2-7]|hai|ba|tu|nam|sau|bay)\b/g;
  for (const match of folded.matchAll(rangePattern)) {
    const from = weekdayFromToken(match[1]);
    const to = weekdayFromToken(match[2]);
    if (!from || !to || from > to) {
      validation('invalid_weekdays', 'Khoảng ngày trong tuần không hợp lệ.');
    }
    for (let day = from; day <= to; day += 1) weekdays.add(day);
  }

  const dayPattern = /\b(?:thu\s*([2-7]|hai|ba|tu|nam|sau|bay)|t([2-7])|chu\s*nhat|cn)\b/g;
  for (const match of folded.matchAll(dayPattern)) {
    if (match[0].startsWith('chu') || match[0] === 'cn') {
      weekdays.add(7);
    } else {
      const day = weekdayFromToken(match[1] ?? match[2]);
      if (day) weekdays.add(day);
    }
  }

  if (/\b(?:hang|moi)\s+ngay\b/.test(folded) || /\bdaily\b/.test(folded)) {
    return [1, 2, 3, 4, 5, 6, 7];
  }
  return weekdays.size > 0 ? [...weekdays].sort((a, b) => a - b) : [1, 2, 3, 4, 5, 6, 7];
}

function parseTitle(raw: string, firstTimeIndex: number): string {
  let source = raw.replace(PREFIX_RE, '');
  const recurrence = source.match(RECURRENCE_RE);
  let cut = firstTimeIndex;
  // Từ lặp ngay đầu câu (sau “nhắc tôi”) không phải tiêu đề; sẽ được cắt riêng.
  if (recurrence?.index !== undefined && recurrence.index > 0) {
    cut = Math.min(cut, recurrence.index);
  }
  let title = source.slice(0, cut);
  title = title.replace(/^(?:hằng|hàng|mỗi|hang|moi)\s+ngày\s*/iu, '');
  title = title.replace(
    /^(?:thứ|thu)\s*(?:[2-7]|hai|ba|tư|tu|năm|nam|sáu|sau|bảy|bay)\s*/iu,
    '',
  );
  title = title.replace(/^(?:(?:lúc|vào)\s+)+/iu, '');
  title = title.replace(/(?:\s+(?:lúc|vào))+\s*$/iu, '');
  title = title.replace(/^[\s,.;:+-]+|[\s,.;:+-]+$/gu, '');
  title = title.replace(/\s+/gu, ' ').trim();
  if (title.length < 2) {
    validation(
      'missing_title',
      'Cần nêu việc cần nhắc, ví dụ “uống thuốc” hoặc “đi bộ”.',
    );
  }
  if (title.length > 120) {
    validation('title_too_long', 'Nội dung nhắc tối đa 120 ký tự.');
  }
  return title;
}

function inferKind(title: string): CreateReminderInput['kind'] {
  const value = fold(title);
  if (/\bthuoc\b/.test(value)) return 'medication';
  if (/\b(?:do|kiem tra)\s+(?:huyet ap|nhip tim|duong huyet|nhiet do)\b/.test(value)) {
    return 'measurement';
  }
  if (/\b(?:di bo|van dong|tap the duc|the duc|uong nuoc|an sang|an trua|an toi)\b/.test(value)) {
    return 'activity';
  }
  return 'other';
}

export type ParseDraftTextOptions = {
  now: Date;
  timezone: string;
};

/**
 * Chuyển câu lệnh đơn giản thành input lịch nhắc. Hàm thuần, không đọc DB;
 * caller đã kiểm quyền chủ hồ sơ. Lỗi hiểu câu → `AppError` 422 với `reason`.
 */
export function parseAssistantDraftText(
  text: string,
  options: ParseDraftTextOptions,
): CreateReminderInput {
  const raw = text.trim();
  if (!PREFIX_RE.test(raw)) {
    validation(
      'missing_request',
      'Hãy bắt đầu bằng “nhắc tôi” hoặc “đặt lịch” để trợ lý hiểu yêu cầu.',
    );
  }

  const folded = fold(raw);
  if (
    /\b\d+(?:[.,/]\d+)?\s*(?:mg|ml|gam|g|vien)\b/.test(folded) ||
    /\bliều\b/iu.test(raw) ||
    /\b\d+\s*lieu\b/.test(folded)
  ) {
    validation(
      'medical_dosage',
      'Trợ lý không tự diễn giải liều lượng; hãy tạo lịch bằng biểu mẫu và tự nhập nội dung.',
    );
  }

  const source = raw.replace(PREFIX_RE, '');
  const dateSource = stripEndDate(source);
  const dateFolded = fold(dateSource);
  const matches = [...dateSource.matchAll(timeRegex())];
  if (matches.length === 0) {
    validation(
      'missing_time',
      'Cần nêu giờ nhắc, ví dụ “8h” hoặc “20:30”.',
    );
  }
  if (matches.length > 6) {
    validation('too_many_times', 'Tối đa 6 giờ nhắc trong một yêu cầu.');
  }

  const times = [...new Set(matches.map(parseTime))].sort();
  const firstTimeIndex = matches[0]?.index ?? source.length;
  const title = parseTitle(dateSource, firstTimeIndex);
  const weekdays = parseWeekdays(dateFolded);
  const startsOn = resolveStartDate(dateFolded, times, options.now, options.timezone);
  const endsOn = parseEndDate(folded, startsOn);

  const parsed = createReminderSchema.safeParse({
    kind: inferKind(title),
    title,
    note: null,
    times,
    weekdays,
    startsOn,
    endsOn,
    active: true,
  });
  if (!parsed.success) {
    validation('invalid_draft', 'Yêu cầu chưa đủ rõ để tạo nháp lịch nhắc.');
  }
  return parsed.data;
}
