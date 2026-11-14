import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Hành động chính (nút/link) — có thể disabled khi chưa có ở wave hiện tại. */
  action?: ReactNode;
  /** Ghi chú nhỏ dưới hành động (ví dụ "sẽ có ở wave sau"). */
  actionNote?: string;
}

/**
 * Trạng thái "chưa có dữ liệu" — luôn diễn đạt bằng chữ,
 * KHÔNG hiển thị số 0 giả thay cho dữ liệu chưa từng có.
 */
export function EmptyState({ title, description, action, actionNote }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <svg
        className="empty-state__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      </svg>
      <h3 className="empty-state__title">{title}</h3>
      {description ? <p className="empty-state__desc">{description}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
      {actionNote ? <p className="empty-state__note">{actionNote}</p> : null}
    </div>
  );
}
