import type { ReactNode } from 'react';

export type AlertTone = 'info' | 'success' | 'warning' | 'error';
export type AlertAnnounce = 'alert' | 'status' | 'none';

interface AlertProps {
  tone?: AlertTone;
  title?: string;
  className?: string;
  /**
   * Mức thông báo cho trình đọc màn hình.
   * Mặc định: error/warning → `alert`, còn lại → `status`.
   * Banner stale/offline lặp lại nên truyền `status` hoặc `none` để không đọc lại liên tục.
   */
  announce?: AlertAnnounce;
  children: ReactNode;
}

function Icon({ path }: { path: string }) {
  return (
    <svg
      className="alert__icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}

const ICON_PATHS: Record<AlertTone, string> = {
  info: 'M12 16v-4M12 8h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
  success: 'M20 6 9 17l-5-5',
  warning: 'M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  error: 'M12 8v4m0 4h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
};

const TONE_LABELS: Record<AlertTone, string> = {
  info: 'Thông tin',
  success: 'Đã xong',
  warning: 'Cần chú ý',
  error: 'Lỗi',
};

/** Hộp thông báo có biểu tượng + nhãn mức bằng chữ (màu không phải tín hiệu duy nhất). */
export function Alert({
  tone = 'info',
  title,
  className,
  announce,
  children,
}: AlertProps) {
  const role =
    announce === 'none'
      ? undefined
      : (announce ?? (tone === 'error' || tone === 'warning' ? 'alert' : 'status'));
  return (
    <div role={role} className={`alert alert--${tone}${className ? ` ${className}` : ''}`}>
      <Icon path={ICON_PATHS[tone]} />
      <div>
        {title ? (
          <p className="alert__title">
            <span className="visually-hidden">{TONE_LABELS[tone]}: </span>
            {title}
          </p>
        ) : (
          <span className="visually-hidden">{TONE_LABELS[tone]}</span>
        )}
        <div className="alert__text">{children}</div>
      </div>
    </div>
  );
}
