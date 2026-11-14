import { Link } from 'react-router-dom';
import { useMe } from '../features/auth/useAuth';
import { ButtonLink } from './Button';

/** Header dùng chung cho trang công khai; khi đã đăng nhập thì hiện "Mở ứng dụng". */
export function SiteHeader() {
  const me = useMe();
  const user = me.isSuccess ? me.data.user : null;

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link to="/" className="brand">
          An Nhiên
        </Link>
        <nav className="site-header__nav" aria-label="Điều hướng công khai">
          {user ? (
            <ButtonLink to="/app" size="sm">
              Mở ứng dụng
            </ButtonLink>
          ) : (
            <>
              <ButtonLink to="/login" variant="subtle" size="sm">
                Đăng nhập
              </ButtonLink>
              <ButtonLink to="/register" size="sm">
                Tạo tài khoản
              </ButtonLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
