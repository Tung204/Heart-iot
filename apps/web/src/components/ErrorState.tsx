import { Button } from './Button';

interface ErrorStateProps {
  title: string;
  message: string;
  onRetry?: () => void;
}

/** Trạng thái lỗi toàn trang có nút thử lại; không hiển thị lỗi kỹ thuật thô. */
export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <h1 className="error-state__title">{title}</h1>
      <p>{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Thử lại
        </Button>
      ) : null}
    </div>
  );
}
