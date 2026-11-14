import { useState } from 'react';
import type { FormEvent } from 'react';
import { createSubjectSchema, updateSubjectSchema } from '@annhien/contracts/subjects';
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

/**
 * Form tạo/sửa hồ sơ. Validate bằng đúng schema hợp đồng
 * (`createSubjectSchema`/`updateSubjectSchema` từ @annhien/contracts/subjects),
 * lỗi hiển thị theo trường bằng aria-describedby.
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
      setErrors(
        zodFieldErrorMap(parsed.error, values, {
          displayName: (issue, value) => {
            if (String(value ?? '').trim() === '') return 'Vui lòng nhập tên hiển thị.';
            if (issue.code === 'too_big') return `Tên quá dài (tối đa ${issue.maximum} ký tự).`;
            return 'Tên hiển thị chưa hợp lệ.';
          },
          timezone: (issue, value) => {
            if (String(value ?? '').trim() === '') return 'Vui lòng nhập múi giờ.';
            if (issue.code === 'too_big') return `Múi giờ quá dài (tối đa ${issue.maximum} ký tự).`;
            return 'Múi giờ chưa hợp lệ (dùng tên IANA, ví dụ Asia/Ho_Chi_Minh).';
          },
        }),
      );
      return;
    }
    setErrors({ fields: {}, general: [] });
    // parsed.data đã qua validate — dùng chính giá trị form để giữ kiểu đầy đủ.
    onSubmit(values);
  };

  return (
    <form className="subject-form" onSubmit={handleSubmit} noValidate>
      <TextField
        id="subject-display-name"
        label="Tên hiển thị"
        required
        value={displayName}
        error={errors.fields.displayName}
        hint="Tên người được theo dõi mà bạn và người thân sẽ nhìn thấy."
        onChange={(event) => setDisplayName(event.target.value)}
        autoComplete="off"
        maxLength={120}
      />
      <TextField
        id="subject-timezone"
        label="Múi giờ"
        required
        value={timezone}
        error={errors.fields.timezone}
        hint="Múi giờ dùng để tính ngày tổng hợp. Mặc định Asia/Ho_Chi_Minh."
        onChange={(event) => setTimezone(event.target.value)}
        autoComplete="off"
        maxLength={64}
      />
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
