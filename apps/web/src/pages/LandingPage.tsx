import { Button, ButtonLink } from '../components/Button';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';
import { SkipLink } from '../components/SkipLink';
import { useMe } from '../features/auth/useAuth';
import { isUnauthorizedError } from '../lib/api';
import '../styles/public.css';

/**
 * Dòng giới hạn ngay dưới CTA. Phải giữ đủ bốn ý: dữ liệu mô phỏng, cảnh báo chỉ
 * có khi web đang kết nối, không tự gọi cấp cứu và không thay thế cấp cứu.
 */
export const HERO_SAFETY_NOTE =
  'Dữ liệu mô phỏng · cảnh báo chỉ hiện khi web đang kết nối · không tự gọi cấp cứu · không thay thế cấp cứu.';

const INFO_ROWS = [
  {
    icon: 'device',
    title: 'Theo dõi',
    text: 'Nhịp tim, vận động và kết nối thiết bị của người thân.',
  },
  {
    icon: 'alert',
    title: 'Cảnh báo',
    text: 'Cảnh báo do hệ thống tạo, không phụ thuộc trợ lý.',
  },
  {
    icon: 'assistant',
    title: 'Trợ lý AI',
    text: 'Hỏi trợ lý AI về số liệu của người thân.',
  },
] as const;

type InfoIcon = (typeof INFO_ROWS)[number]['icon'];

/** Biểu tượng nét mảnh cho ba hàng thông tin — chỉ để phân biệt nhanh. */
function RowIcon({ name }: { name: InfoIcon }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (name === 'device') {
    return (
      <svg {...common}>
        <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
        <path d="M10.5 18.5h3" />
      </svg>
    );
  }
  if (name === 'alert') {
    return (
      <svg {...common}>
        <path d="M12 3.5 2.8 19a1.6 1.6 0 0 0 1.4 2.4h15.6A1.6 1.6 0 0 0 21.2 19L12 3.5Z" />
        <path d="M12 9v4.5M12 17h.01" />
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

/** Sơ đồ chữ: thiết bị → dữ liệu/cảnh báo → người hỗ trợ và trợ lý AI. */
const FLOW_STEPS = [
  { label: 'Thiết bị', hint: 'Nhịp tim, vận động, kết nối' },
  { label: 'Dữ liệu · Cảnh báo', hint: 'Theo người được chọn' },
  { label: 'Người hỗ trợ · Trợ lý AI', hint: 'Cùng xem và phối hợp' },
] as const;

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
        <section className="landing-hero" aria-labelledby="hero-title">
          <div className="container landing-hero__inner">
            <div className="landing-hero__copy">
              <h1 id="hero-title" className="landing-hero__title">
                Theo dõi sức khỏe người thân
              </h1>
              <p className="landing-hero__lead">
                Xem dữ liệu thiết bị, xử lý cảnh báo và hỏi trợ lý AI.
              </p>

              {me.isPending ? (
                // Đang kiểm phiên: chỉ báo tải, không render CTA để CTA không nhấp nháy.
                <p className="landing-session" role="status" aria-busy="true">
                  Đang kiểm tra phiên đăng nhập…
                </p>
              ) : null}

              <div className="landing-hero__actions">
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
                <div className="landing-session">
                  <p role="status">Không kiểm tra được phiên đăng nhập.</p>
                  <div className="landing-session__actions">
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

              <p className="landing-hero__note">{HERO_SAFETY_NOTE}</p>
            </div>

            <figure className="landing-map" aria-labelledby="landing-map-caption">
              <ol className="landing-map__flow" role="list">
                {FLOW_STEPS.map((step) => (
                  <li className="landing-map__step" key={step.label}>
                    <span className="landing-map__label">{step.label}</span>
                    <span className="landing-map__hint">{step.hint}</span>
                  </li>
                ))}
              </ol>
              <figcaption id="landing-map-caption" className="landing-map__caption">
                Dữ liệu từ thiết bị tới người hỗ trợ và trợ lý AI.
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="landing-rows" aria-labelledby="landing-rows-title">
          <div className="container">
            <h2 id="landing-rows-title" className="landing-rows__title">
              Theo dõi, cảnh báo và hỏi đáp
            </h2>
            <ul className="landing-rows__list" role="list">
              {INFO_ROWS.map((row) => (
                <li className="landing-row" key={row.title}>
                  <span className="landing-row__icon">
                    <RowIcon name={row.icon} />
                  </span>
                  <h3 className="landing-row__title">{row.title}</h3>
                  <p className="landing-row__text">{row.text}</p>
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
