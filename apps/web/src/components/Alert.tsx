import type { ReactNode } from 'react';

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  tone?: AlertTone;
  title?: string;
  className?: string;
  children: ReactNode;
}

function Icon({ path }: { path: string }) {
  return (
    <svg
      className="alert__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
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

/** Hộp thông báo có biểu tượng + chữ (màu không phải tín hiệu duy nhất). */
export function Alert({ tone = 'info', title, className, children }: AlertProps) {
  const role = tone === 'error' || tone === 'warning' ? 'alert' : 'status';
  return (
    <div role={role} className={`alert alert--${tone}${className ? ` ${className}` : ''}`}>
      <Icon path={ICON_PATHS[tone]} />
      <div>
        {title ? <p className="alert__title">{title}</p> : null}
        <div className="alert__text">{children}</div>
      </div>
    </div>
  );
}
