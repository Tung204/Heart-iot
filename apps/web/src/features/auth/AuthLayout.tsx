import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SkipLink } from '../../components/SkipLink';

interface AuthLayoutProps {
  title: string;
  intro?: string;
  children: ReactNode;
  /** Nội dung đặt dưới thẻ (link chéo giữa đăng nhập/đăng ký). */
  footer?: ReactNode;
}

/** Khung trang đăng nhập/đăng ký: thẻ giữa màn hình + giới hạn dữ liệu hiển thị. */
export function AuthLayout({ title, intro, children, footer }: AuthLayoutProps) {
  return (
    <div className="public">
      <SkipLink />
      <header className="auth-header">
        <Link to="/" className="brand">
          An Nhiên
        </Link>
      </header>
      <main id="main" tabIndex={-1} className="auth-main">
        <section className="auth-card" aria-labelledby="auth-title">
          <h1 id="auth-title" className="auth-card__title">
            {title}
          </h1>
          {intro ? <p className="auth-card__intro">{intro}</p> : null}
          {children}
        </section>
        <p className="demo-notice">
          Dữ liệu hiển thị trong ứng dụng là dữ liệu mô phỏng. Thông tin không dùng để chẩn đoán
          hay thay lời khuyên y tế.
        </p>
        {footer}
      </main>
    </div>
  );
}
