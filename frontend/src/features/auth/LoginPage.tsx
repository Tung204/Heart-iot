import { useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { TextField } from '../../components/Field';
import { PageLoader } from '../../components/PageLoader';
import { getApiErrorMessage } from '../../lib/api';
import { useSafeNext } from '../../lib/next';
import { apiValidationFieldErrors, fieldErrorMap } from '../../lib/validation';
import { loginSchema } from './api';
import { useLogin, useMe } from './useAuth';
import { AuthLayout } from './AuthLayout';
import { useFocusErrorAlert, useFocusFirstError } from './useFocusFirstError';

const FIELD_ORDER = [
  ['email', 'login-email'],
  ['password', 'login-password'],
] as const;

const INTRO = 'Xem tình hình người thân và cảnh báo.';

/** Giữ `next` nội bộ, tránh open-redirect; `/app` là mặc định nên bỏ tham số. */
function withNext(path: string, next: string): string {
  return next === '/app' ? path : `${path}?next=${encodeURIComponent(next)}`;
}

export function LoginPage() {
  const me = useMe();
  const loginMutation = useLogin();
  const navigate = useNavigate();
  const next = useSafeNext();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // Chặn gửi hai lần ngay trong cùng một nhịp: trạng thái disabled của nút chỉ
  // có sau lần render kế tiếp, còn khoá ref có hiệu lực tức thì.
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
    // Kiểm tra phiên là bước chặn trước khi biết đây là form hay chuyển hướng;
    // dùng loader toàn trang giống ProtectedRoute để không nháy form/CTA.
    return <PageLoader label="Đang kiểm tra phiên đăng nhập…" />;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current) return;
    setFormError(null);
    const values = { email, password };
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setFieldErrors(fieldErrorMap(parsed.error, values).fields);
      return;
    }
    setFieldErrors({});
    submitLock.current = true;
    loginMutation.mutate(parsed.data, {
      onSuccess: () => navigate(next, { replace: true }),
      onError: (error) => {
        submitLock.current = false;
        const apiFields = apiValidationFieldErrors(error);
        if (apiFields) {
          setFieldErrors(apiFields.fields);
          if (apiFields.general.length > 0) setFormError(apiFields.general[0] ?? null);
        } else {
          setFormError(getApiErrorMessage(error));
        }
      },
    });
  };

  return (
    <AuthLayout
      title="Đăng nhập"
      intro={INTRO}
      footer={
        <p className="auth-switch">
          Chưa có tài khoản?{' '}
          <Link to={withNext('/register', next)}>Tạo tài khoản mới</Link>
        </p>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {formError ? (
          <div className="auth-form__error" ref={formErrorRef} tabIndex={-1}>
            <Alert tone="error" title="Không đăng nhập được">
              {formError}
            </Alert>
          </div>
        ) : null}
        <TextField
          id="login-email"
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
          id="login-password"
          label="Mật khẩu"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
        />
        <Button type="submit" fullWidth disabled={loginMutation.isPending}>
          {loginMutation.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </Button>
      </form>
    </AuthLayout>
  );
}
