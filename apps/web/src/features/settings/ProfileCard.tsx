import { useState, type FormEvent } from 'react';
import type { UserSummary } from '@annhien/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { TextField } from '../../components/Field';
import { getApiErrorMessage } from '../../lib/api';
import { apiValidationFieldErrors, fieldErrorMap } from '../../lib/validation';
import { updateProfileSchema } from '../auth/api';
import { useUpdateProfile } from './useAccountSettings';

interface ProfileCardProps {
  user: UserSummary;
}

/** Giới hạn đọc từ hợp đồng, không hard-code lần thứ hai. */
const DISPLAY_NAME_MAX = updateProfileSchema.shape.displayName.maxLength ?? 120;

/** Hồ sơ: đổi tên hiển thị. Id người dùng luôn do server lấy từ phiên. */
export function ProfileCard({ user }: ProfileCardProps) {
  const update = useUpdateProfile();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSaved(false);
    const values = { displayName };
    const parsed = updateProfileSchema.safeParse(values);
    if (!parsed.success) {
      const errors = fieldErrorMap(parsed.error, values).fields;
      setFieldError(errors.displayName ?? 'Tên hiển thị chưa hợp lệ.');
      return;
    }
    if (parsed.data.displayName === user.displayName) {
      // Không gọi API khi không có gì thay đổi; vẫn đưa ô nhập về dạng đã trim.
      setDisplayName(parsed.data.displayName);
      setFieldError(undefined);
      setSaved(true);
      return;
    }
    setFieldError(undefined);
    update.mutate(parsed.data, {
      onSuccess: (me) => {
        setDisplayName(me.user.displayName);
        setSaved(true);
      },
      onError: (error) => {
        const apiFields = apiValidationFieldErrors(error);
        if (apiFields?.fields.displayName) {
          setFieldError(apiFields.fields.displayName);
          return;
        }
        setFormError(apiFields?.general[0] ?? getApiErrorMessage(error));
      },
    });
  };

  return (
    <Card title="Hồ sơ" description="Tên hiển thị với người thân trong ứng dụng.">
      <form onSubmit={handleSubmit} noValidate>
        {formError ? (
          <Alert tone="error" title="Chưa lưu được tên hiển thị">
            {formError}
          </Alert>
        ) : null}
        {saved ? (
          <Alert tone="success" title="Đã lưu tên hiển thị">
            Tên mới được dùng ngay trên các màn hình của bạn.
          </Alert>
        ) : null}
        <TextField
          id="settings-display-name"
          label="Tên hiển thị"
          type="text"
          autoComplete="name"
          required
          hint={`Tối đa ${DISPLAY_NAME_MAX} ký tự.`}
          value={displayName}
          onChange={(event) => {
            setDisplayName(event.target.value);
            setSaved(false);
          }}
          error={fieldError}
        />
        <p className="settings-meta">
          Email đăng nhập: <strong>{user.email}</strong>. Bản demo chưa hỗ trợ đổi email.
        </p>
        <div className="settings-actions-row">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? 'Đang lưu…' : 'Lưu tên hiển thị'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
