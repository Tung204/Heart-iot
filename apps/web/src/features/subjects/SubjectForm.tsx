import { useState } from 'react';
import type { FormEvent } from 'react';
import { createSubjectSchema, updateSubjectSchema } from '@heart-iot/contracts/subjects';
import { Button } from '../../components/Button';
import { TextField } from '../../components/Field';
import { zodFieldErrorMap } from '../../lib/validation';

export interface SubjectFormValues {
  displayName: string;
  timezone: string;
}

interface SubjectFormProps {
  mode: 'create' | 'edit';
  /** Giá trị khởi tạo khi sửa. */
  initial?: SubjectFormValues;
  pending?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
  onSubmit: (values: SubjectFormValues) => void;
}

const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
const TIMEZONE_ID = 'subject-timezone';
const NAME_ID = 'subject-display-name';

/**
 * Form tạo/sửa hồ sơ — một cột, lỗi nằm ngay cạnh field. Validate bằng đúng
 * schema hợp đồng (`createSubjectSchema`/`updateSubjectSchema` từ
 * @heart-iot/contracts/subjects). Nhãn là “Tên người được theo dõi” vì form
 * còn đổi cả múi giờ, không chỉ đổi tên.
 */
export function SubjectForm({
  mode,
  initial,
  pending = false,
  submitLabel,
  onCancel,
  onSubmit,
}: SubjectFormProps) {
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [timezone, setTimezone] = useState(initial?.timezone ?? DEFAULT_TIMEZONE);
  const [errors, setErrors] = useState<{ fields: Record<string, string>; general: string[] }>({
    fields: {},
    general: [],
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const values = { displayName, timezone };
    const schema = mode === 'create' ? createSubjectSchema : updateSubjectSchema;
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const nextErrors = zodFieldErrorMap(parsed.error, values, {
        displayName: (issue, value) => {
          if (String(value ?? '').trim() === '') return 'Vui lòng nhập tên người được theo dõi.';
          if (issue.code === 'too_big') return `Tên quá dài (tối đa ${issue.maximum} ký tự).`;
          return 'Tên người được theo dõi chưa hợp lệ.';
        },
        timezone: (issue, value) => {
          if (String(value ?? '').trim() === '') return 'Vui lòng nhập múi giờ.';
          if (issue.code === 'too_big') return `Múi giờ quá dài (tối đa ${issue.maximum} ký tự).`;
          return 'Múi giờ chưa hợp lệ (dùng tên IANA, ví dụ Asia/Ho_Chi_Minh).';
        },
      });
      setErrors(nextErrors);
      // Đưa focus về field lỗi đầu tiên để bàn phím/trình đọc màn hình thấy ngay.
      const firstErrorField = nextErrors.fields.displayName ? NAME_ID : TIMEZONE_ID;
      document.getElementById(firstErrorField)?.focus();
      return;
    }
    setErrors({ fields: {}, general: [] });
    // parsed.data đã qua validate — dùng chính giá trị form để giữ kiểu đầy đủ.
    onSubmit(values);
  };

  return (
    <form className="subject-form" onSubmit={handleSubmit} noValidate>
      <TextField
        id={NAME_ID}
        label="Tên người được theo dõi"
        required
        value={displayName}
        error={errors.fields.displayName}
        hint="Tên này hiển thị cho bạn và người thân cùng xem hồ sơ."
        onChange={(event) => setDisplayName(event.target.value)}
        autoComplete="off"
        maxLength={120}
      />
      <div className="field">
        <label className="field__label" htmlFor={TIMEZONE_ID}>
          Múi giờ <span className="field__required" aria-hidden="true"> *</span>
        </label>
        <p className="field__hint">Dùng để tính ngày tổng hợp. Mặc định theo Việt Nam.</p>
        <select
          id={TIMEZONE_ID}
          className={`field__input${errors.fields.timezone ? ' field__input--error' : ''}`}
          value={timezone}
          aria-invalid={errors.fields.timezone ? true : undefined}
          onChange={(event) => setTimezone(event.target.value)}
        >
          {['Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Tokyo', 'UTC'].includes(
            timezone,
          ) ? null : <option value={timezone}>{timezone}</option>}
          <option value="Asia/Ho_Chi_Minh">Việt Nam — Asia/Ho_Chi_Minh</option>
          <option value="Asia/Bangkok">Thái Lan — Asia/Bangkok</option>
          <option value="Asia/Singapore">Singapore — Asia/Singapore</option>
          <option value="Asia/Tokyo">Nhật Bản — Asia/Tokyo</option>
          <option value="UTC">Giờ quốc tế — UTC</option>
        </select>
        {errors.fields.timezone ? (
          <p className="field__error" role="alert">
            {errors.fields.timezone}
          </p>
        ) : null}
      </div>
      {errors.general.length > 0 ? (
        <p className="subject-form__error" role="alert">
          {errors.general.join(' ')}
        </p>
      ) : null}
      <div className="subject-form__actions">
        <Button type="submit" disabled={pending}>
          {pending ? 'Đang lưu…' : (submitLabel ?? (mode === 'create' ? 'Tạo hồ sơ' : 'Lưu'))}
        </Button>
        {onCancel ? (
          <Button variant="secondary" type="button" onClick={onCancel} disabled={pending}>
            Hủy
          </Button>
        ) : null}
      </div>
    </form>
  );
}
