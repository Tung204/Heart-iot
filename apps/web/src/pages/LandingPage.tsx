import { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { Button, ButtonLink } from '../components/Button';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';
import { SkipLink } from '../components/SkipLink';
import { useMe } from '../features/auth/useAuth';
import { isUnauthorizedError } from '../lib/api';
import '../styles/public.css';

gsap.registerPlugin(useGSAP);

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
        <rect x="7" y="2.5" width="10" height="19" rx="3" />
        <path d="M9.5 12h1.6l1.1-2.4 1.6 4.6 1.1-2.2h1.6" />
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

function BentoArt({ name }: { name: InfoIcon }) {
  if (name === 'device') {
    return (
      <div className="landing-row__art landing-row__art--vitals" aria-hidden="true">
        <div className="landing-mini-stat">
          <span className="landing-mini-stat__tag">Nhịp tim</span>
          <strong className="landing-mini-stat__val">74 bpm</strong>
          <span className="landing-mini-stat__badge landing-mini-stat__badge--ok">Đang đeo</span>
        </div>
        <div className="landing-mini-bars">
          <span style={{ height: '48%' }} />
          <span style={{ height: '64%' }} />
          <span style={{ height: '58%' }} />
          <span style={{ height: '82%' }} className="is-peak" />
          <span style={{ height: '70%' }} />
          <span style={{ height: '76%' }} />
          <span style={{ height: '88%' }} className="is-peak" />
        </div>
      </div>
    );
  }
  if (name === 'alert') {
    return (
      <div className="landing-row__art landing-row__art--alert" aria-hidden="true">
        <div className="landing-alert-track">
          <span className="landing-alert-node">Nghi ngã</span>
          <span className="landing-alert-line" />
          <span className="landing-alert-node landing-alert-node--window">20s chờ hủy</span>
          <span className="landing-alert-line" />
          <span className="landing-alert-node landing-alert-node--urgent">Báo người thân</span>
        </div>
      </div>
    );
  }
  return (
    <div className="landing-row__art landing-row__art--ai" aria-hidden="true">
      <div className="landing-ai-preview">
        <span className="landing-ai-chip">Xem trước · Xác nhận</span>
        <p className="landing-ai-line">Tóm tắt 7 ngày, tạo lịch nhắc &amp; xuất phiếu PDF 1 trang.</p>
      </div>
    </div>
  );
}

const FLOW_STEPS = [
  {
    label: 'Thiết bị',
    hint: 'Nhịp tim, vận động, kết nối',
    liveDetail: 'Ghi nhận nhịp tim, bước đi và cờ chất lượng tín hiệu trung thực.',
  },
  {
    label: 'Dữ liệu · Cảnh báo',
    hint: 'Theo người được chọn',
    liveDetail: 'Cửa sổ hủy báo nhầm tại chỗ; cảnh báo khẩn hoạt động độc lập với AI.',
  },
  {
    label: 'Người hỗ trợ · Trợ lý AI',
    hint: 'Cùng xem và phối hợp',
    liveDetail: 'Phân quyền người thân rõ ràng, xuất phiếu PDF 1 trang và hỏi đáp có nguồn.',
  },
] as const;

const SIGNAL_STORY = [
  {
    number: '01',
    title: 'Thiết bị',
    text: FLOW_STEPS[0].liveDetail,
  },
  {
    number: '02',
    title: 'Dữ liệu và cảnh báo',
    text: FLOW_STEPS[1].liveDetail,
  },
  {
    number: '03',
    title: 'Người hỗ trợ và trợ lý AI',
    text: FLOW_STEPS[2].liveDetail,
  },
] as const;

const CARE_HIGHLIGHTS = [
  {
    badge: 'PDF 1 trang',
    title: 'Phiếu theo dõi mang đi khám',
    text: 'Tổng hợp gọn nhịp tim, mức đi lại, khoảng thiếu dữ liệu và các điểm đáng chú ý trong kỳ.',
  },
  {
    badge: 'Nhắc lịch 2 chiều',
    title: 'Lịch sinh hoạt hằng ngày',
    text: 'Đặt giờ nhắc theo múi giờ hồ sơ, đồng bộ xuống thiết bị và ghi nhận phản hồi đã thực hiện.',
  },
  {
    badge: 'Thiết bị tại nhà',
    title: 'Tìm máy & nhắc quên đeo',
    text: 'Phát tiếng bíp ngắn khi để quên thiết bị trong nhà và nhắc nhẹ nếu ban ngày quên đeo lâu.',
  },
  {
    badge: 'Trợ lý kiểm chứng',
    title: 'Bản tin cuối ngày & hỏi đáp có nguồn',
    text: 'Tự động gửi bản tin tổng hợp cuối ngày và giải đáp hướng dẫn chăm sóc kèm nguồn chính thống.',
  },
] as const;

export function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);
  const me = useMe();
  const user = me.data?.user ?? null;
  const sessionFailed = me.isError && !isUnauthorizedError(me.error);
  const guest = !user && !me.isPending && !sessionFailed;

  useGSAP(
    () => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return;
      }

      gsap.registerPlugin(ScrollTrigger);
      const mm = gsap.matchMedia();

      mm.add(
        {
          reduceMotion: '(prefers-reduced-motion: reduce)',
          isDesktop: '(prefers-reduced-motion: no-preference) and (min-width: 900px)',
          isMobile: '(prefers-reduced-motion: no-preference) and (max-width: 899px)',
        },
        (context) => {
          const { reduceMotion, isDesktop } = context.conditions ?? {};

          if (reduceMotion) {
            gsap.set(
              [
                '.landing-hero__title',
                '.landing-hero__lead',
                '.landing-hero__note',
                '.landing-map',
                '.landing-map__step',
                '.landing-signal-story__head',
                '.landing-signal-story__visual',
                '.landing-signal-story__step',
                '.landing-signal-story__path',
                '.landing-rows__title',
                '.landing-row',
                '.landing-eco__head',
                '.landing-eco__tile',
              ],
              { clearProps: 'all' },
            );
            return;
          }

          const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });

          heroTl
            .from('.landing-hero__title', {
              y: isDesktop ? 24 : 10,
              opacity: 0,
              duration: 0.5,
              clearProps: 'transform,opacity',
            })
            .from(
              '.landing-hero__lead',
              {
                y: isDesktop ? 18 : 6,
                opacity: 0,
                duration: 0.42,
                clearProps: 'transform,opacity',
              },
              '-=0.32',
            )
            .from(
              '.landing-hero__note',
              {
                opacity: 0,
                duration: 0.3,
                clearProps: 'opacity',
              },
              '-=0.24',
            )
            .from(
              '.landing-map',
              {
                x: isDesktop ? 28 : 0,
                y: isDesktop ? 8 : 14,
                scale: 0.975,
                opacity: 0,
                duration: 0.55,
                clearProps: 'transform,opacity',
              },
              '-=0.4',
            )
            .from(
              '.landing-map__step',
              {
                y: 14,
                opacity: 0,
                duration: 0.36,
                stagger: 0.07,
                clearProps: 'transform,opacity',
              },
              '-=0.32',
            );

          // Nhịp sóng sinh tồn chạy mượt trên màn mô phỏng (GPU-safe strokeDashoffset).
          gsap.fromTo(
            '.landing-ecg__trace',
            { strokeDashoffset: 260 },
            {
              strokeDashoffset: 0,
              duration: 2.6,
              ease: 'none',
              repeat: -1,
            },
          );

          // Section 2 Bento reveal: tách opacity (<=200ms) để kiểm thử cuộn 350ms luôn đạt opacity = 1.
          const rowsTl = gsap.timeline({
            scrollTrigger: {
              trigger: '.landing-rows',
              start: 'top 92%',
              once: true,
            },
          });

          rowsTl
            .from(
              '.landing-rows__title',
              { opacity: 0, duration: 0.18, clearProps: 'opacity' },
              0,
            )
            .from(
              '.landing-rows__title',
              { y: 18, duration: 0.45, ease: 'power3.out', clearProps: 'transform' },
              0,
            )
            .from(
              '.landing-row',
              { opacity: 0, duration: 0.18, stagger: 0.04, clearProps: 'opacity' },
              0.03,
            )
            .from(
              '.landing-row',
              {
                y: 24,
                scale: 0.985,
                duration: 0.5,
                stagger: 0.07,
                ease: 'power3.out',
                clearProps: 'transform',
              },
              0.03,
            );

          // Section 3 Care Ecosystem reveal
          const ecoTl = gsap.timeline({
            scrollTrigger: {
              trigger: '.landing-eco',
              start: 'top 92%',
              once: true,
            },
          });

          ecoTl
            .from(
              '.landing-eco__head',
              { opacity: 0, duration: 0.18, clearProps: 'opacity' },
              0,
            )
            .from(
              '.landing-eco__head',
              { y: 18, duration: 0.45, ease: 'power3.out', clearProps: 'transform' },
              0,
            )
            .from(
              '.landing-eco__tile',
              { opacity: 0, duration: 0.18, stagger: 0.03, clearProps: 'opacity' },
              0.04,
            )
            .from(
              '.landing-eco__tile',
              {
                y: 22,
                duration: 0.48,
                stagger: 0.06,
                ease: 'power3.out',
                clearProps: 'transform',
              },
              0.04,
            );

          // Mạch tín hiệu kể chuyện theo scroll: chỉ dùng transform/opacity, dừng khi rời viewport.
          const storyPulse = gsap.to('.landing-signal-story__pulse', {
            x: 230,
            duration: 2.1,
            ease: 'none',
            repeat: -1,
            paused: true,
          });

          const storyTl = gsap.timeline({
            scrollTrigger: {
              trigger: '.landing-signal-story',
              start: 'top 78%',
              onEnter: () => storyPulse.play(),
              onLeave: () => storyPulse.pause(),
              onEnterBack: () => storyPulse.play(),
              onLeaveBack: () => storyPulse.pause(),
            },
          });

          storyTl
            .from('.landing-signal-story__head', {
              y: 18,
              opacity: 0,
              duration: 0.25,
              ease: 'power3.out',
              clearProps: 'transform,opacity',
            })
            .from(
              '.landing-signal-story__visual',
              {
                y: 18,
                scale: 0.98,
                opacity: 0,
                duration: 0.18,
                ease: 'power3.out',
                clearProps: 'transform,opacity',
              },
              '-=0.22',
            )
            .fromTo(
              '.landing-signal-story__path',
              { strokeDashoffset: 760 },
              {
                strokeDashoffset: 0,
                duration: 0.5,
                ease: 'power2.out',
                clearProps: 'strokeDashoffset',
              },
              '-=0.3',
            )
            .from(
              '.landing-signal-story__step',
              {
                y: 20,
                opacity: 0,
                duration: 0.34,
                stagger: 0.08,
                ease: 'power3.out',
                clearProps: 'transform,opacity',
              },
              '-=0.55',
            );
        },
      );
    },
    { scope: rootRef },
  );

  return (
    <div className="public" ref={rootRef}>
      <SkipLink />
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        <section className="landing-hero" aria-labelledby="hero-title">
          <div className="container landing-hero__inner">
            <div className="landing-hero__copy">
              <p className="landing-hero__kicker">
                Chăm sóc sức khỏe tại nhà · Phân quyền gia đình rõ ràng
              </p>
              <h1 id="hero-title" className="landing-hero__title">
                Theo dõi sức khỏe người thân
              </h1>
              <p className="landing-hero__lead">
                Xem dữ liệu thiết bị, xử lý cảnh báo và hỏi trợ lý AI.
              </p>

              {me.isPending ? (
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
              <div className="landing-map__core">
                <div className="landing-monitor" aria-hidden="true">
                  <div className="landing-monitor__top">
                    <div className="landing-monitor__metric">
                      <span className="landing-monitor__label">Nhịp tim trực tiếp</span>
                      <span className="landing-monitor__bpm">
                        74 <small>bpm</small>
                      </span>
                    </div>
                    <div className="landing-monitor__pills">
                      <span className="landing-monitor__pill landing-monitor__pill--live">
                        Tín hiệu tốt
                      </span>
                      <span className="landing-monitor__pill">Pin 84%</span>
                    </div>
                  </div>
                  <svg
                    className="landing-ecg"
                    viewBox="0 0 320 56"
                    fill="none"
                    preserveAspectRatio="none"
                  >
                    <path
                      className="landing-ecg__track"
                      d="M0 34 H58 L70 34 L78 20 L86 44 L96 8 L106 48 L115 28 L126 34 H198 L206 22 L214 43 L224 10 L234 47 L243 29 L254 34 H320"
                    />
                    <path
                      className="landing-ecg__trace"
                      d="M0 34 H58 L70 34 L78 20 L86 44 L96 8 L106 48 L115 28 L126 34 H198 L206 22 L214 43 L224 10 L234 47 L243 29 L254 34 H320"
                    />
                  </svg>
                </div>

                <ol className="landing-map__flow" role="list">
                  {FLOW_STEPS.map((step, index) => (
                    <li key={step.label}>
                      <button
                        type="button"
                        className={`landing-map__step${activeStep === index ? ' is-highlighted' : ''}`}
                        onMouseEnter={() => setActiveStep(index)}
                        onFocus={() => setActiveStep(index)}
                        onClick={() => setActiveStep(index)}
                        aria-pressed={activeStep === index}
                      >
                        <span className="landing-map__index" aria-hidden="true">
                          0{index + 1}
                        </span>
                        <span className="landing-map__step-body">
                          <span className="landing-map__label">{step.label}</span>
                          <span className="landing-map__hint">{step.hint}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>

                <p className="landing-map__live-detail" aria-hidden="true">
                  {FLOW_STEPS[activeStep]?.liveDetail}
                </p>

                <figcaption id="landing-map-caption" className="landing-map__caption">
                  Dữ liệu từ thiết bị tới người hỗ trợ và trợ lý AI.
                </figcaption>
              </div>
            </figure>
          </div>
        </section>

        <section className="landing-rows" aria-labelledby="landing-rows-title">
          <div className="container">
            <div className="landing-section-head">
              <h2 id="landing-rows-title" className="landing-rows__title">
                Theo dõi, cảnh báo và hỏi đáp
              </h2>
              <p className="landing-rows__sub">
                Ba trụ cột hoạt động độc lập, rõ ràng quyền xem và không làm rối mắt người lớn tuổi.
              </p>
            </div>
            <ul className="landing-rows__list" role="list">
              {INFO_ROWS.map((row) => (
                <li className="landing-row" key={row.title}>
                  <BentoArt name={row.icon} />
                  <div className="landing-row__head">
                    <span className="landing-row__icon">
                      <RowIcon name={row.icon} />
                    </span>
                    <h3 className="landing-row__title">{row.title}</h3>
                  </div>
                  <p className="landing-row__text">{row.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="landing-signal-story" aria-labelledby="landing-signal-story-title">
          <div className="container landing-signal-story__inner">
            <div className="landing-signal-story__head">
              <p className="landing-signal-story__kicker">Một mạch dữ liệu rõ ràng</p>
              <h2 id="landing-signal-story-title" className="landing-signal-story__title">
                Tín hiệu đi đúng người, đúng lúc
              </h2>
              <p className="landing-signal-story__lead">
                Từ thiết bị đến người hỗ trợ, mỗi bước đều có ngữ cảnh và quyền xem rõ ràng.
              </p>
            </div>

            <figure className="landing-signal-story__visual" aria-labelledby="landing-signal-story-caption">
              <svg viewBox="0 0 520 160" fill="none" role="img" aria-label="Đường tín hiệu qua ba điểm kết nối">
                <path
                  className="landing-signal-story__track"
                  d="M24 96C88 96 92 48 156 48s68 64 132 64 68-64 132-64 58 42 76 42"
                />
                <path
                  className="landing-signal-story__path"
                  d="M24 96C88 96 92 48 156 48s68 64 132 64 68-64 132-64 58 42 76 42"
                />
                <circle className="landing-signal-story__node" cx="24" cy="96" r="8" />
                <circle className="landing-signal-story__node" cx="156" cy="48" r="8" />
                <circle className="landing-signal-story__node" cx="288" cy="112" r="8" />
                <circle className="landing-signal-story__node" cx="420" cy="48" r="8" />
                <circle className="landing-signal-story__pulse" cx="24" cy="96" r="5" />
              </svg>
              <figcaption id="landing-signal-story-caption">
                Sơ đồ minh họa luồng dữ liệu; cảnh báo được tạo độc lập với trợ lý AI.
              </figcaption>
            </figure>

            <div className="landing-signal-story__steps" role="list">
              {SIGNAL_STORY.map((step) => (
                <article className="landing-signal-story__step" key={step.number} role="listitem">
                  <span className="landing-signal-story__number" aria-hidden="true">
                    {step.number}
                  </span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-eco" aria-labelledby="landing-eco-title">
          <div className="container">
            <div className="landing-eco__head">
              <h2 id="landing-eco-title" className="landing-eco__title">
                Tiện ích đồng hành cùng gia đình mỗi ngày
              </h2>
              <p className="landing-eco__lead">
                Mọi thao tác quan trọng đều có bước xem trước và tôn trọng quyền riêng tư của từng hồ sơ.
              </p>
            </div>
            <div className="landing-eco__grid">
              {CARE_HIGHLIGHTS.map((item) => (
                <article className="landing-eco__tile" key={item.title}>
                  <span className="landing-eco__badge">{item.badge}</span>
                  <h3 className="landing-eco__tile-title">{item.title}</h3>
                  <p className="landing-eco__tile-text">{item.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
