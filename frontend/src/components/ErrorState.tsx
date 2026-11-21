import { createElement } from 'react';
import type { HeadingLevel } from './Card';
import { Button } from './Button';

interface ErrorStateProps {
  title: string;
  message: string;
  onRetry?: () => void;
  /** Mặc định H1 khi đứng riêng; trang đã có H1 thì truyền 2 để không lồng H1. */
  headingLevel?: HeadingLevel | 1;
  className?: string;
}

/** Trạng thái lỗi toàn trang có nút thử lại; không hiển thị lỗi kỹ thuật thô. */
export function ErrorState({
  title,
  message,
  onRetry,
  headingLevel = 1,
  className,
}: ErrorStateProps) {
  return (
    <div className={`error-state${className ? ` ${className}` : ''}`} role="alert">
      {createElement(`h${headingLevel}`, { className: 'error-state__title' }, title)}
      <p>{message}</p>
      {onRetry ? (
        <div className="error-state__actions">
          <Button variant="secondary" onClick={onRetry}>
            Thử lại
          </Button>
        </div>
      ) : null}
    </div>
  );
}
