import { ButtonLink } from '../components/Button';
import { SkipLink } from '../components/SkipLink';
import { SiteHeader } from '../components/SiteHeader';
import { SiteFooter } from '../components/SiteFooter';

export function NotFoundPage() {
  return (
    <div className="public">
      <SkipLink />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="auth-main">
        <section className="auth-card" aria-labelledby="nf-title">
          <h1 id="nf-title" className="auth-card__title">
            Không tìm thấy trang
          </h1>
          <p className="auth-card__intro">
            Đường dẫn bạn mở không tồn tại hoặc đã được chuyển đi. Nếu bạn mở một đường dẫn lời
            mời, hãy kiểm tra lại xem có thiếu ký tự nào không.
          </p>
          <ButtonLink to="/">Về trang chủ</ButtonLink>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
