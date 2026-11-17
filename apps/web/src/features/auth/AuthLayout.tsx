import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SkipLink } from '../../components/SkipLink';
import '../../styles/auth.css';

interface AuthLayoutProps {
  title: string;
  intro?: string;
  children: ReactNode;
  /** Hàng chuyển đổi đăng nhập/đăng ký, đặt ngay dưới form trong cùng cột. */
  footer?: ReactNode;
}

/**
 * Khung đăng nhập/đăng ký: cột form gọn canh trên (tối đa 32rem) + dải phụ
 * xanh nhạt trên desktop (một câu về quyền và cảnh báo). Mobile bỏ dải phụ.
 * Dòng nguồn/giới hạn chỉ xuất hiện một lần ở cuối cột form.
 */
export function AuthLayout({ title, intro, children, footer }: AuthLayoutProps) {
  return (
    <div className="auth-page">
      <SkipLink />
      <header className="auth-topbar">
        <div className="auth-topbar__inner">
          <Link to="/" className="brand">
            Theo dõi sức khỏe
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="auth-body">
        <div className="auth-columns">
          <section className="auth-panel" aria-labelledby="auth-title">
            <h1 id="auth-title" className="auth-panel__title">
              {title}
            </h1>
            {intro ? <p className="auth-panel__intro">{intro}</p> : null}
            {children}
            {footer}
            <p className="auth-footnote">Dữ liệu mô phỏng · không thay thế cấp cứu.</p>
          </section>
          <aside className="auth-aside" aria-label="Quyền truy cập dữ liệu">
            <p className="auth-aside__text">
              Chỉ người được chủ hồ sơ mời mới xem được số đo và nhận cảnh báo.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}
