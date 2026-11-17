import { useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { TextField } from '../../components/Field';
import { PageLoader } from '../../components/PageLoader';
import { getApiErrorMessage } from '../../lib/api';
import { useSafeNext } from '../../lib/next';
import { apiValidationFieldErrors, fieldErrorMap } from '../../lib/validation';
import { registerSchema } from './api';
import { useMe, useRegister } from './useAuth';
import { AuthLayout } from './AuthLayout';
import { useFocusErrorAlert, useFocusFirstError } from './useFocusFirstError';

const FIELD_ORDER = [
  ['displayName', 'register-name'],
  ['email', 'register-email'],
  ['password', 'register-password'],
  ['confirmPassword', 'register-confirm'],
] as const;

/** Giữ `next` nội bộ, tránh open-redirect; `/app` là mặc định nên bỏ tham số. */
function withNext(path: string, next: string): string {
  return next === '/app' ? path : `${path}?next=${encodeURIComponent(next)}`;
}

/**
 * Nhãn màn hình là “Tên của bạn” (không phải tên người được theo dõi), nên
 * thông điệp lỗi lấy từ helper dùng chung được đổi cụm từ tương ứng.
 */
function normalizeNameError(errors: Record<string, string>): Record<string, string> {
  const message = errors.displayName;
  if (!message) return errors;
  return { ...errors, displayName: message.replace(/tên hiển thị/gi, 'tên của bạn') };
}

export function RegisterPage() {
  const me = useMe();
  const registerMutation = useRegister();
  const navigate = useNavigate();
  const next = useSafeNext();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // Xem LoginPage: khoá ref chặn gửi hai lần trước khi nút kịp disabled.
  const submitLock = useRef(false);

  useFocusFirstError(fieldErrors, FIELD_ORDER);
  // Lỗi máy chủ không gắn field: focus hộp lỗi; nếu có lỗi field thì field được ưu tiên.
  const formErrorRef = useFocusErrorAlert(
    formError && Object.keys(fieldErrors).length === 0 ? formError : null,
  );

  if (me.isSuccess) {
    return <Navigate to={next} replace />;
  }
  if (me.isPending) {
    // Xem LoginPage: loader toàn trang trong lúc kiểm phiên.
    return <PageLoader label="Đang kiểm tra phiên đăng nhập…" />;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current) return;
    setFormError(null);
    const values = { displayName, email, password };
    const parsed = registerSchema.safeParse(values);
    const errors: Record<string, string> = parsed.success
      ? {}
      : fieldErrorMap(parsed.error, values).fields;
    if (password !== confirmPassword) {
      errors.confirmPassword = 'Mật khẩu nhập lại không khớp.';
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(normalizeNameError(errors));
      return;
    }
    if (!parsed.success) return;
    setFieldErrors({});
    submitLock.current = true;
    registerMutation.mutate(parsed.data, {
      onSuccess: () => navigate(next, { replace: true }),
      onError: (error) => {
        submitLock.current = false;
        const apiFields = apiValidationFieldErrors(error);
        if (apiFields) {
          setFieldErrors(normalizeNameError(apiFields.fields));
          if (apiFields.general.length > 0) setFormError(apiFields.general[0] ?? null);
        } else {
          setFormError(getApiErrorMessage(error));
        }
      },
    });
  };

  return (
    <AuthLayout
      title="Tạo tài khoản"
      footer={
        <p className="auth-switch">
          Đã có tài khoản? <Link to={withNext('/login', next)}>Đăng nhập</Link>
        </p>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {formError ? (
          <div className="auth-form__error" ref={formErrorRef} tabIndex={-1}>
            <Alert tone="error" title="Không tạo được tài khoản">
              {formError}
            </Alert>
          </div>
        ) : null}
        <TextField
          id="register-name"
          label="Tên của bạn"
          type="text"
          autoComplete="name"
          required
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          error={fieldErrors.displayName}
        />
        <TextField
          id="register-email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldErrors.email}
        />
        <TextField
          id="register-password"
          label="Mật khẩu"
          type="password"
          autoComplete="new-password"
          required
          hint="Tối thiểu 10 ký tự."
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
        />
        <TextField
          id="register-confirm"
          label="Nhập lại mật khẩu"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          error={fieldErrors.confirmPassword}
        />
        <Button type="submit" fullWidth disabled={registerMutation.isPending}>
          {registerMutation.isPending ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}
        </Button>
      </form>
    </AuthLayout>
  );
}
