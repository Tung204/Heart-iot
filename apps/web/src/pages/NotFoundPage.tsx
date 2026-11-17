import { ButtonLink } from '../components/Button';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';
import { SkipLink } from '../components/SkipLink';
import '../styles/public.css';

/**
 * 404 công khai (route `*` ngoài `/app`): layout phẳng, một H1, một đường về.
 * 404 trong khung ứng dụng do `AppNotFoundPage` + shell đảm nhiệm.
 */
export function NotFoundPage() {
  return (
    <div className="public">
      <SkipLink />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="public-main">
        <div className="container">
          <div className="not-found">
            <p className="not-found__code">Lỗi 404</p>
            <h1 id="nf-title" className="not-found__title">
              Không tìm thấy trang
            </h1>
            <p className="not-found__text">
              Đường dẫn này không tồn tại hoặc đã được chuyển đi. Nếu bạn mở từ link lời mời, hãy
              kiểm tra link còn đủ ký tự hoặc nhờ người mời gửi lại.
            </p>
            <ButtonLink to="/">Về trang chủ</ButtonLink>
            <p className="not-found__note">Dữ liệu mô phỏng · không thay thế cấp cứu.</p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
