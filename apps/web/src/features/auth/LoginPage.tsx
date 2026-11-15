import { useState, type FormEvent } from 'react';
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
import { useFocusFirstError } from './useFocusFirstError';

const FIELD_ORDER = [
  ['email', 'login-email'],
  ['password', 'login-password'],
] as const;

export function LoginPage() {
  const me = useMe();
  const loginMutation = useLogin();
  const navigate = useNavigate();
  const next = useSafeNext();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useFocusFirstError(fieldErrors, FIELD_ORDER);

  if (me.isSuccess) {
    return <Navigate to={next} replace />;
  }
  if (me.isPending) {
    return <PageLoader label="Đang kiểm tra phiên đăng nhập…" />;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const values = { email, password };
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setFieldErrors(fieldErrorMap(parsed.error, values).fields);
      return;
    }
    setFieldErrors({});
    loginMutation.mutate(parsed.data, {
      onSuccess: () => navigate(next, { replace: true }),
      onError: (error) => {
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
      intro="Xem tình hình người thân và cảnh báo."
      footer={
        <p className="auth-footer">
          Chưa có tài khoản?{' '}
          <Link to={next === '/app' ? '/register' : `/register?next=${encodeURIComponent(next)}`}>
            Tạo tài khoản mới
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        {formError ? (
          <div className="auth-card__form-error">
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
