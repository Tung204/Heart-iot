import { Button, ButtonLink } from '../components/Button';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';
import { SkipLink } from '../components/SkipLink';
import { useMe } from '../features/auth/useAuth';
import { isUnauthorizedError } from '../lib/api';

/**
 * Dòng an toàn ngay dưới CTA. Phải giữ đủ bốn ý: dữ liệu mô phỏng, cảnh báo chỉ
 * có khi web đang kết nối, không tự gọi cấp cứu và không thay thế cấp cứu.
 */
export const HERO_SAFETY_NOTE =
  'Dữ liệu mô phỏng · cảnh báo chỉ hiện khi web đang kết nối · không tự gọi cấp cứu · không thay thế cấp cứu.';

const CAPABILITIES = [
  {
    title: 'Theo dõi',
    text: 'Nhịp tim, vận động và kết nối thiết bị của người thân.',
  },
  {
    title: 'Báo khi cần',
    text: 'Cảnh báo do hệ thống tạo, không phụ thuộc trợ lý.',
  },
  {
    title: 'Hỏi trợ lý',
    text: 'Hỏi trợ lý AI về số liệu của người thân.',
  },
] as const;

/** Biểu tượng nét mảnh cho 3 thẻ — chỉ để phân biệt nhanh, không mang thông tin. */
function CapabilityIcon({ index }: { index: number }) {
  const common = {
    width: 26,
    height: 26,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (index === 0) {
    return (
      <svg {...common}>
        <path d="M20.4 5.6a5.2 5.2 0 0 0-7.4 0L12 6.6l-1-1a5.2 5.2 0 0 0-7.4 7.4l1 1L12 21l7.4-7 1-1a5.2 5.2 0 0 0 0-7.4Z" />
      </svg>
    );
  }
  if (index === 1) {
    return (
      <svg {...common}>
        <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5Z" />
        <path d="M10.3 19.5a2.1 2.1 0 0 0 3.4 0" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M21 11.6a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.7-.8L3 21l1.8-5A8.3 8.3 0 0 1 3 11.6 8.4 8.4 0 0 1 12 3.2a8.4 8.4 0 0 1 9 8.4Z" />
      <path d="M8.5 11.6h.01M12 11.6h.01M15.5 11.6h.01" strokeWidth="2.4" />
    </svg>
  );
}

/** Hình minh hoạ thuần trang trí: một nhịp tim đi qua vòng tín hiệu. */
function HeroArt() {
  return (
    <div className="hero-art" aria-hidden="true">
      <svg viewBox="0 0 360 360" focusable="false">
        <circle
          cx="180"
          cy="180"
          r="164"
          fill="none"
          stroke="var(--color-line-strong)"
          strokeWidth="1.5"
          strokeDasharray="2 10"
          strokeLinecap="round"
        />
        <circle cx="180" cy="180" r="122" fill="var(--color-surface)" />
        <circle
          cx="180"
          cy="180"
          r="122"
          fill="none"
          stroke="var(--color-teal)"
          strokeOpacity="0.2"
          strokeWidth="10"
        />
        <path
          d="M70 180h56l16-44 22 88 18-58 12 26h26l14-26 20 48 14-34h32"
          fill="none"
          stroke="var(--color-teal)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="300" cy="180" r="7" fill="var(--color-brick)" />
      </svg>
    </div>
  );
}

export function LandingPage() {
  const me = useMe();
  const user = me.data?.user ?? null;
  // Chưa biết phiên (đang tải) hoặc lỗi máy chủ: không hiện CTA khách để tránh
  // người đã đăng nhập bấm nhầm "Tạo tài khoản".
  const sessionFailed = me.isError && !isUnauthorizedError(me.error);
  const guest = !user && !me.isPending && !sessionFailed;

  return (
    <div className="public">
      <SkipLink />
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        <section className="hero" aria-labelledby="hero-title">
          <div className="container hero__inner">
            <div className="hero__copy">
              <h1 id="hero-title" className="hero__title">
                Người thân ở nhà, mình vẫn an tâm
              </h1>
              <p className="hero__lead">
                Theo dõi sức khỏe người thân từ xa: nhịp tim và vận động từ thiết bị đeo,
                báo bạn khi có bất thường. Trợ lý AI trả lời câu hỏi về số liệu của người thân.
              </p>
              {me.isPending ? (
                // Đang kiểm phiên: chỉ báo tải, không render CTA để CTA không nhấp nháy.
                <p className="hero__session hero__loading" role="status" aria-busy="true">
                  <span className="hero__spinner" aria-hidden="true" />
                  Đang kiểm tra phiên đăng nhập…
                </p>
              ) : null}
              <div className="hero__actions">
                {user ? <ButtonLink to="/app">Mở ứng dụng</ButtonLink> : null}
                {guest ? (
                  <>
                    <ButtonLink to="/register">Tạo tài khoản</ButtonLink>
                    <ButtonLink to="/login" variant="secondary">
                      Đăng nhập
                    </ButtonLink>
                  </>
                ) : null}
              </div>
              {sessionFailed ? (
                // Không kiểm tra được phiên ≠ khách: giữ đường vào và cho thử lại.
                // Nếu đã có người dùng trong bộ đệm thì không mời đăng nhập/đăng ký lại.
                <div className="hero__session">
                  <p role="status">Không kiểm tra được phiên đăng nhập.</p>
                  <div className="hero__session-actions">
                    {!user ? (
                      <>
                        <ButtonLink to="/login" variant="secondary">
                          Đăng nhập
                        </ButtonLink>
                        <ButtonLink to="/register" variant="secondary">
                          Tạo tài khoản
                        </ButtonLink>
                      </>
                    ) : null}
                    <Button
                      variant="subtle"
                      onClick={() => void me.refetch()}
                      disabled={me.isFetching}
                    >
                      {me.isFetching ? 'Đang thử lại…' : 'Thử lại'}
                    </Button>
                  </div>
                </div>
              ) : null}
              <p className="hero__note">{HERO_SAFETY_NOTE}</p>
            </div>
            <HeroArt />
          </div>
        </section>

        <section className="section landing-section" aria-labelledby="capabilities-heading">
          <div className="container">
            <h2 id="capabilities-heading" className="section-title">
              Theo dõi sức khỏe làm gì
            </h2>
            <ul className="capabilities" role="list">
              {CAPABILITIES.map((item, index) => (
                <li className="capability" key={item.title}>
                  <span className="capability__icon">
                    <CapabilityIcon index={index} />
                  </span>
                  <h3 className="capability__title">{item.title}</h3>
                  <p className="capability__text">{item.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
