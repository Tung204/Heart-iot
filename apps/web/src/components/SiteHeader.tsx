import { Link } from 'react-router-dom';
import { useMe } from '../features/auth/useAuth';
import { ButtonLink } from './Button';

/** Header công khai tối giản: logo và một điểm vào duy nhất. */
export function SiteHeader() {
  const me = useMe();
  const user = me.data?.user ?? null;

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link to="/" className="brand">
          An Nhiên
        </Link>
        <nav className="site-header__nav" aria-label="Điều hướng công khai">
          {user ? (
            <ButtonLink to="/app" variant="secondary" size="sm">
              Mở ứng dụng
            </ButtonLink>
          ) : (
            <Link to="/login" className="site-header__login">
              Đăng nhập
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
