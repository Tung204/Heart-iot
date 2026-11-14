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
            <div className="hero__copy">
              <StatusPill tone="sand">Bản demo · dữ liệu mô phỏng</StatusPill>
              <h1 id="hero-title" className="hero__title">
                Người thân ở nhà, mình vẫn an tâm
              </h1>
              <p className="hero__lead">
                An Nhiên theo dõi nhịp tim, vận động và gửi cảnh báo khi có dấu hiệu bất thường —
                để người thân biết tình hình mà không cần gọi hỏi liên tục.
              </p>
              <div className="hero__actions">
                <ButtonLink to="/login">Đăng nhập</ButtonLink>
                <ButtonLink to="/register" variant="secondary">
                  Tạo tài khoản
                </ButtonLink>
              </div>
              <p className="hero__note">
                Miễn phí dùng thử trong bản demo. Không thay thế thiết bị y tế hoặc cấp cứu.
              </p>
            </div>
            <div className="hero-preview" aria-hidden="true">
              <div className="hero-preview__top">
                <span className="hero-preview__brand">An Nhiên</span>
                <span className="hero-preview__tag">Minh hoạ giao diện</span>
              </div>
              <div className="hero-preview__screen">
                <p className="hero-preview__eyebrow">Đang theo dõi</p>
                <p className="hero-preview__name">Bà Trần Thị An</p>
                <svg
                  className="hero-preview__wave"
                  viewBox="0 0 260 70"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M0 45h28l8-18 9 34 9-25 8 9h30l8-14 10 28 8-20 7 6h35l9-22 9 37 8-24 7 9h30l8-12 9 23 8-18 7 7h25"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <ul className="hero-preview__rows">
                  <li>
                    <span className="hero-preview__dot" /> Nhịp tim và vận động
                  </li>
                  <li>
                    <span className="hero-preview__dot" /> Trạng thái kết nối thiết bị
                  </li>
                  <li>
                    <span className="hero-preview__dot hero-preview__dot--alert" /> Cảnh báo cho
                    người thân
                  </li>
                </ul>
              </div>
              <p className="hero-preview__foot">
                Hình minh hoạ · không phải số đo thật
              </p>
            </div>
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
