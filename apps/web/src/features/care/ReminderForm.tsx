import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ZodError, ZodIssue } from 'zod';
import {
  MAX_REMINDER_TIMES,
  createReminderSchema,
  type CreateReminderInput,
  type ReminderKind,
  type ReminderSummary,
} from '@heart-iot/contracts/reminders';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { TextField } from '../../components/Field';
import { todayInTimeZone } from '../../lib/format';
import {
  REMINDER_KIND_OPTIONS,
  REMINDER_NOTE_MAX_LENGTH,
  REMINDER_TITLE_MAX_LENGTH,
  WEEKDAY_OPTIONS,
} from './labels';

export interface ReminderFormErrors {
  fields: Record<string, string>;
  general: string[];
}

export const EMPTY_REMINDER_FORM_ERRORS: ReminderFormErrors = { fields: {}, general: [] };

interface ReminderFormProps {
  mode: 'create' | 'edit';
  subjectTimezone: string;
  initial?: ReminderSummary;
  pending: boolean;
  /** Lỗi 422 từ API — gắn theo trường khi đường dẫn khớp. */
  serverErrors?: ReminderFormErrors | null;
  onSubmit: (input: CreateReminderInput) => void;
  onCancel: () => void;
  onEdit?: () => void;
}

interface FormValues {
  kind: ReminderKind;
  title: string;
  note: string;
  times: string[];
  weekdays: number[];
  startsOn: string;
  endsOn: string;
  active: boolean;
}

function initialValues(
  initial: ReminderSummary | undefined,
  timezone: string,
): FormValues {
  if (initial) {
    return {
      kind: initial.kind,
      title: initial.title,
      note: initial.note ?? '',
      times: initial.times.length > 0 ? [...initial.times] : ['08:00'],
      weekdays: [...initial.weekdays],
      startsOn: initial.startsOn,
      endsOn: initial.endsOn ?? '',
      active: initial.active,
    };
  }
  return {
    kind: 'medication',
    title: '',
    note: '',
    times: ['08:00'],
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    startsOn: todayInTimeZone(timezone),
    endsOn: '',
    active: true,
  };
}

/** Thông điệp tiếng Việt theo trường; giới hạn đọc từ issue, không hard-code luật. */
function messageForReminderField(
  field: string,
  issue: ZodIssue,
  values: Record<string, unknown>,
): string {
  switch (field) {
    case 'title': {
      if (String(values.title ?? '').trim() === '') return 'Vui lòng nhập tiêu đề lịch nhắc.';
      if (issue.code === 'too_small') return 'Tiêu đề cần ít nhất 2 ký tự.';
      if (issue.code === 'too_big')
        return `Tiêu đề quá dài (tối đa ${String(issue.maximum)} ký tự).`;
      return 'Tiêu đề chưa hợp lệ.';
    }
    case 'note':
      if (issue.code === 'too_big')
        return `Ghi chú quá dài (tối đa ${String(issue.maximum)} ký tự).`;
      return 'Ghi chú chưa hợp lệ.';
    case 'times': {
      if (Array.isArray(values.times) && values.times.length === 0) {
        return 'Cần ít nhất một giờ nhắc.';
      }
      if (Array.isArray(values.times) && values.times.length > MAX_REMINDER_TIMES) {
        return `Tối đa ${MAX_REMINDER_TIMES} giờ nhắc cho một lịch.`;
      }
      if (issue.code === 'too_small') return 'Cần ít nhất một giờ nhắc.';
      if (issue.code === 'too_big') return `Tối đa ${MAX_REMINDER_TIMES} giờ nhắc cho một lịch.`;
      return 'Giờ nhắc phải có dạng HH:MM và tăng dần, không trùng nhau.';
    }
    case 'weekdays': {
      if (Array.isArray(values.weekdays) && values.weekdays.length === 0) {
        return 'Cần chọn ít nhất một ngày trong tuần.';
      }
      if (issue.code === 'too_big') return 'Tối đa 7 ngày trong tuần.';
      return 'Ngày trong tuần chưa hợp lệ.';
    }
    case 'startsOn':
      return 'Ngày bắt đầu phải có dạng YYYY-MM-DD.';
    case 'endsOn':
      return issue.message || 'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.';
    case 'kind':
      return 'Loại lịch nhắc chưa hợp lệ.';
    default:
      return issue.message;
  }
}

function mapZodErrors(error: ZodError, values: Record<string, unknown>): ReminderFormErrors {
  const fields: Record<string, string> = {};
  const general: string[] = [];
  for (const issue of error.issues) {
    const path = issue.path.map(String).join('.');
    // `times.0`, `times.1`... cùng thuộc vùng giờ nhắc; tương tự weekdays.
    const field = path.startsWith('times') ? 'times' : path.startsWith('weekdays') ? 'weekdays' : path;
    const message = messageForReminderField(field, issue, values);
    if (field) fields[field] ??= message;
    else general.push(message);
  }
  return { fields, general };
}

/**
 * Form tạo/sửa lịch nhắc tại chỗ.
 * - Chỉ chủ hồ sơ thấy form (quyết định ở trang).
 * - Validate đúng `createReminderSchema` của hợp đồng, tự sắp giờ/thứ tăng dần
 *   trước khi gửi (API không tự sắp xếp lại).
 * - Không có trường liều lượng/chẩn đoán; nội dung do người dùng tự đặt.
 */
export function ReminderForm({
  mode,
  subjectTimezone,
  initial,
  pending,
  serverErrors,
  onSubmit,
  onCancel,
  onEdit,
}: ReminderFormProps) {
  const [values, setValues] = useState<FormValues>(() =>
    initialValues(initial, subjectTimezone),
  );
  const [errors, setErrors] = useState<ReminderFormErrors>(EMPTY_REMINDER_FORM_ERRORS);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const fieldError = (field: string) => errors.fields[field] ?? serverErrors?.fields[field];

  const update = (patch: Partial<FormValues>): void => {
    setValues((previous) => ({ ...previous, ...patch }));
    setErrors((previous) => {
      if (Object.keys(previous.fields).length === 0 && previous.general.length === 0) {
        return previous;
      }
      return EMPTY_REMINDER_FORM_ERRORS;
    });
    onEdit?.();
  };

  const setTime = (index: number, value: string): void => {
    update({ times: values.times.map((time, i) => (i === index ? value : time)) });
  };

  const addTime = (): void => {
    if (values.times.length >= MAX_REMINDER_TIMES) return;
    update({ times: [...values.times, '08:00'] });
  };

  const removeTime = (index: number): void => {
    if (values.times.length <= 1) return;
    update({ times: values.times.filter((_time, i) => i !== index) });
  };

  const toggleWeekday = (weekday: number): void => {
    update({
      weekdays: values.weekdays.includes(weekday)
        ? values.weekdays.filter((value) => value !== weekday)
        : [...values.weekdays, weekday].sort((a, b) => a - b),
    });
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (pending) return;

    const input = {
      kind: values.kind,
      title: values.title.trim(),
      note: values.note.trim() === '' ? null : values.note.trim(),
      times: values.times
        .map((time) => time.trim())
        .filter(Boolean)
        .sort(),
      weekdays: [...values.weekdays].sort((a, b) => a - b),
      startsOn: values.startsOn,
      endsOn: values.endsOn.trim() === '' ? null : values.endsOn,
      active: values.active,
    };

    const parsed = createReminderSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(mapZodErrors(parsed.error, input as unknown as Record<string, unknown>));
      return;
    }
    setErrors(EMPTY_REMINDER_FORM_ERRORS);
    onSubmit(parsed.data);
  };

  const prefix = mode === 'create' ? 'reminder-create' : `reminder-edit-${initial?.id ?? ''}`;

  return (
    <form className="care-form" onSubmit={handleSubmit} noValidate aria-label={
      mode === 'create' ? 'Tạo lịch nhắc' : 'Sửa lịch nhắc'
    }>
      <div className="care-form__grid">
        <div className="field">
          <label className="field__label" htmlFor={`${prefix}-kind`}>
            Loại
          </label>
          <select
            id={`${prefix}-kind`}
            className={`field__input${fieldError('kind') ? ' field__input--error' : ''}`}
            value={values.kind}
            onChange={(event) => update({ kind: event.target.value as ReminderKind })}
          >
            {REMINDER_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {fieldError('kind') ? (
            <p className="field__error" role="alert">
              {fieldError('kind')}
            </p>
          ) : null}
        </div>

        <TextField
          id={`${prefix}-title`}
          ref={titleRef}
          label="Tiêu đề"
          required
          hint="2–120 ký tự. Ví dụ: Uống thuốc huyết áp."
          value={values.title}
          error={fieldError('title')}
          maxLength={REMINDER_TITLE_MAX_LENGTH}
          onChange={(event) => update({ title: event.target.value })}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor={`${prefix}-note`}>
          Ghi chú
        </label>
        <p className="field__hint" id={`${prefix}-note-hint`}>
          Tối đa {REMINDER_NOTE_MAX_LENGTH} ký tự. Không nhập liều hoặc chỉ định y khoa tại đây.
        </p>
        <textarea
          id={`${prefix}-note`}
          className={`field__input${fieldError('note') ? ' field__input--error' : ''}`}
          aria-invalid={fieldError('note') ? true : undefined}
          aria-describedby={`${prefix}-note-hint`}
          rows={2}
          value={values.note}
          maxLength={REMINDER_NOTE_MAX_LENGTH}
          onChange={(event) => update({ note: event.target.value })}
        />
        {fieldError('note') ? (
          <p className="field__error" role="alert">
            {fieldError('note')}
          </p>
        ) : null}
      </div>

      <fieldset className="care-form__group">
        <legend className="field__label">Giờ nhắc</legend>
        <p className="field__hint">
          Theo giờ của hồ sơ ({subjectTimezone}); 1–{MAX_REMINDER_TIMES} giờ, tự sắp tăng dần.
        </p>
        <ul className="care-form__times">
          {values.times.map((time, index) => (
            <li key={index} className="care-form__time-row">
              <label className="visually-hidden" htmlFor={`${prefix}-time-${index}`}>
                Giờ nhắc {index + 1}
              </label>
              <input
                id={`${prefix}-time-${index}`}
                type="time"
                className={`field__input care-form__time${fieldError('times') ? ' field__input--error' : ''}`}
                value={time}
                required
                onChange={(event) => setTime(index, event.target.value)}
              />
              <Button
                variant="subtle"
                size="sm"
                onClick={() => removeTime(index)}
                disabled={values.times.length <= 1}
                aria-label={`Xoá giờ nhắc ${index + 1}`}
              >
                Xoá giờ
              </Button>
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          size="sm"
          onClick={addTime}
          disabled={values.times.length >= MAX_REMINDER_TIMES}
        >
          Thêm giờ
        </Button>
        {fieldError('times') ? (
          <p className="field__error" role="alert">
            {fieldError('times')}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="care-form__group">
        <legend className="field__label">Ngày trong tuần</legend>
        <div className="care-form__weekdays">
          {WEEKDAY_OPTIONS.map((option) => (
            <label key={option.value} className="care-form__weekday">
              <input
                type="checkbox"
                checked={values.weekdays.includes(option.value)}
                onChange={() => toggleWeekday(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        {fieldError('weekdays') ? (
          <p className="field__error" role="alert">
            {fieldError('weekdays')}
          </p>
        ) : null}
      </fieldset>

      <div className="care-form__grid">
        <TextField
          id={`${prefix}-starts-on`}
          label="Từ ngày"
          required
          hint="Ngày bắt đầu nhắc, theo ngày địa phương của hồ sơ."
          type="date"
          value={values.startsOn}
          error={fieldError('startsOn')}
          onChange={(event) => update({ startsOn: event.target.value })}
        />
        <TextField
          id={`${prefix}-ends-on`}
          label="Đến ngày (tuỳ chọn)"
          hint="Để trống nếu nhắc không có ngày kết thúc."
          type="date"
          value={values.endsOn}
          error={fieldError('endsOn')}
          onChange={(event) => update({ endsOn: event.target.value })}
        />
      </div>

      <label className="care-form__check">
        <input
          type="checkbox"
          checked={values.active}
          onChange={(event) => update({ active: event.target.checked })}
        />
        <span>Đang bật lịch nhắc này</span>
      </label>

      {errors.general.length > 0 || serverErrors?.general.length ? (
        <Alert tone="error" title="Chưa lưu được lịch nhắc">
          <ul className="care-form__general">
            {(errors.general.length > 0 ? errors.general : serverErrors?.general ?? []).map(
              (message) => (
                <li key={message}>{message}</li>
              ),
            )}
          </ul>
        </Alert>
      ) : null}

      <div className="care-form__actions">
        <Button type="submit" disabled={pending}>
          {pending ? 'Đang lưu…' : mode === 'create' ? 'Lưu lịch nhắc' : 'Lưu thay đổi'}
        </Button>
        <Button variant="subtle" onClick={onCancel} disabled={pending}>
          Huỷ
        </Button>
      </div>
    </form>
  );
}
