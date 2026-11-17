import { useState, type FormEvent } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { TextField } from '../../components/Field';
import { getApiErrorMessage } from '../../lib/api';
import { apiValidationFieldErrors, zodFieldErrorMap } from '../../lib/validation';
import { changePasswordSchema } from '../auth/api';
import { useChangePassword } from './useAccountSettings';

/** Giới hạn lấy từ hợp đồng `changePasswordSchema`, không hard-code lần hai. */
const NEW_PASSWORD_MIN = changePasswordSchema.shape.newPassword.minLength ?? 10;

/**
 * Mật khẩu: xác minh mật khẩu hiện tại, mật khẩu mới ≥10 và khác mật khẩu cũ.
 * Đổi xong KHÔNG đăng xuất: server giữ phiên hiện tại, chỉ thu hồi phiên khác.
 */
export function PasswordCard() {
  const change = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const clearSecretFields = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const focusField = (id: string) => {
    document.getElementById(id)?.focus();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSaved(false);
    const values = { currentPassword, newPassword };
    const parsed = changePasswordSchema.safeParse(values);
    if (!parsed.success) {
      const { fields } = zodFieldErrorMap(parsed.error, values, {
        currentPassword: (_issue, value) =>
          String(value ?? '').trim() === ''
            ? 'Vui lòng nhập mật khẩu hiện tại.'
            : 'Mật khẩu hiện tại chưa hợp lệ.',
        newPassword: (issue, value) => {
          if (String(value ?? '').trim() === '') return 'Vui lòng nhập mật khẩu mới.';
          if (issue.code === 'too_small') {
            return `Mật khẩu mới cần ít nhất ${NEW_PASSWORD_MIN} ký tự.`;
          }
          if (issue.code === 'too_big') return 'Mật khẩu mới quá dài.';
          return 'Mật khẩu mới chưa hợp lệ.';
        },
      });
      setFieldErrors(fields);
      focusField(fields.currentPassword ? 'settings-current-password' : 'settings-new-password');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Mật khẩu nhập lại không khớp.' });
      focusField('settings-confirm-password');
      return;
    }
    if (parsed.data.newPassword === parsed.data.currentPassword) {
      setFieldErrors({ newPassword: 'Mật khẩu mới phải khác mật khẩu hiện tại.' });
      focusField('settings-new-password');
      return;
    }
    setFieldErrors({});
    change.mutate(parsed.data, {
      onSuccess: () => {
        clearSecretFields();
        setSaved(true);
      },
      onError: (error) => {
        const apiFields = apiValidationFieldErrors(error);
        if (apiFields && Object.keys(apiFields.fields).length > 0) {
          setFieldErrors(apiFields.fields);
        }
        setFormError(apiFields?.general[0] ?? getApiErrorMessage(error));
      },
    });
  };

  return (
    <section className="people-settings-section" aria-labelledby="settings-password-heading">
      <div className="people-settings-section__head">
        <h2 id="settings-password-heading" className="people-settings-section__title">
          Mật khẩu
        </h2>
        <p className="people-settings-section__lead">
          Đổi khi bạn nghi ngờ có người biết mật khẩu cũ. Phiên trên thiết bị này vẫn giữ nguyên.
        </p>
      </div>
      <div className="people-settings-section__body">
        <form className="people-form" onSubmit={handleSubmit} noValidate>
          {formError ? (
            <Alert tone="error" title="Chưa đổi được mật khẩu">
              {formError}
            </Alert>
          ) : null}
          {saved ? (
            <Alert tone="success" title="Đã đổi mật khẩu">
              Bạn vẫn đang đăng nhập trên thiết bị này. Các phiên đăng nhập khác đã bị thu hồi.
            </Alert>
          ) : null}
          <TextField
            id="settings-current-password"
            label="Mật khẩu hiện tại"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => {
              setCurrentPassword(event.target.value);
              setSaved(false);
            }}
            error={fieldErrors.currentPassword}
          />
          <TextField
            id="settings-new-password"
            label="Mật khẩu mới"
            type="password"
            autoComplete="new-password"
            required
            hint={`Tối thiểu ${NEW_PASSWORD_MIN} ký tự và khác mật khẩu hiện tại.`}
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              setSaved(false);
            }}
            error={fieldErrors.newPassword}
          />
          <TextField
            id="settings-confirm-password"
            label="Nhập lại mật khẩu mới"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setSaved(false);
            }}
            error={fieldErrors.confirmPassword}
          />
          <div className="people-form__actions">
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? 'Đang đổi mật khẩu…' : 'Đổi mật khẩu'}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
