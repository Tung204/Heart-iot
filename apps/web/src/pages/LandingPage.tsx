import { ButtonLink } from '../components/Button';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';
import { SkipLink } from '../components/SkipLink';
import { StatusPill } from '../components/StatusPill';
import { Alert } from '../components/Alert';

const STEPS = [
  {
    title: 'Gắn thiết bị đeo',
    description:
      'Người thân đeo một thiết bị nhỏ gọn ghi nhịp tim và vận động, phát hiện dấu hiệu nghi ngờ té ngã.',
  },
  {
    title: 'Dữ liệu về hệ thống',
    description:
      'Thiết bị gửi dữ liệu về máy chủ An Nhiên. Hệ thống lưu lịch sử và phát hiện bất thường theo quy tắc đã cấu hình.',
  },
  {
    title: 'Người thân nắm tình hình',
    description:
      'Người thân được mời xem trạng thái hằng ngày và nhận cảnh báo trên trang web để phối hợp hỗ trợ kịp thời.',
  },
];

const BOUNDARIES = [
  'Bản demo dùng dữ liệu tổng hợp từ thiết bị mô phỏng — không dùng cho quyết định y tế.',
  'Cảnh báo chỉ hiển thị khi trang web đang mở và kết nối với máy chủ.',
  'Hệ thống không tự gọi cấp cứu và không gửi thông báo khi trình duyệt đã đóng.',
  'Phát hiện té ngã là phần đang hoàn thiện; độ chính xác chưa được đo trên dữ liệu thật.',
];

export function LandingPage() {
  return (
    <div className="public">
      <SkipLink />
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        <section className="hero" aria-labelledby="hero-title">
          <div className="container hero__inner">
            <StatusPill tone="sand">Bản demo · dữ liệu mô phỏng</StatusPill>
            <h1 id="hero-title" className="hero__title">
              An Nhiên
            </h1>
            <p className="hero__lead">
              Yên tâm hơn khi người thân ở một mình: theo dõi trạng thái hằng ngày và nhận cảnh
              báo khi có dấu hiệu bất thường — ngay trên trình duyệt.
            </p>
            <div className="hero__actions">
              <ButtonLink to="/login">Đăng nhập</ButtonLink>
              <ButtonLink to="/register" variant="secondary">
                Tạo tài khoản
              </ButtonLink>
            </div>
            <p className="hero__note">Miễn phí dùng thử trong bản demo.</p>
          </div>
        </section>

        <section className="section" aria-labelledby="problem-heading">
          <div className="container">
            <h2 id="problem-heading" className="section-title">
              Vì sao An Nhiên?
            </h2>
            <p className="section__lead">
              Người lớn tuổi thường ở nhà một mình trong lúc con cháu đi làm. Một cú ngã hoặc
              một dấu hiệu sức khỏe bất thường có thể không được phát hiện kịp. An Nhiên kết nối
              thiết bị đeo với trang web để người thân nắm được tình hình hằng ngày.
            </p>
          </div>
        </section>

        <section className="section section--tinted" aria-labelledby="how-heading">
          <div className="container">
            <h2 id="how-heading" className="section-title">
              Cách hoạt động
            </h2>
            <ol className="steps">
              {STEPS.map((step, index) => (
                <li className="step" key={step.title}>
                  <span className="step__number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3 className="step__title">{step.title}</h3>
                  <p className="step__desc">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section" aria-labelledby="limits-heading">
          <div className="container">
            <h2 id="limits-heading" className="section-title">
              Ranh giới an toàn của bản demo
            </h2>
            <p className="section__lead">
              Chúng tôi nói rõ những gì hệ thống KHÔNG làm, để bạn không chờ đợi sai:
            </p>
            <ul className="boundaries">
              {BOUNDARIES.map((item) => (
                <li key={item}>
                  <Alert tone="warning">{item}</Alert>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="section section--tinted" aria-labelledby="cta-heading">
          <div className="container cta-band">
            <h2 id="cta-heading" className="section-title">
              Bắt đầu theo dõi người thân
            </h2>
            <p className="section__lead">
              Tạo tài khoản, lập hồ sơ và gắn thiết bị mô phỏng trong vài bước.
            </p>
            <div className="cta-band__actions">
              <ButtonLink to="/register">Tạo tài khoản</ButtonLink>
              <ButtonLink to="/login" variant="secondary">
                Đăng nhập
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
