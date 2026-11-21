import { createElement, type ReactNode } from 'react';
import type { HeadingLevel } from './Card';

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Hành động chính (nút/link) — có thể disabled khi chưa có ở wave hiện tại. */
  action?: ReactNode;
  /** Ghi chú nhỏ dưới hành động (ví dụ "sẽ có ở wave sau"). */
  actionNote?: string;
  /** Trang đã có H1 thì dùng H2 (mặc định); trong section dùng H3. */
  headingLevel?: HeadingLevel;
  className?: string;
}

/**
 * Trạng thái "chưa có dữ liệu" — luôn diễn đạt bằng chữ,
 * KHÔNG hiển thị số 0 giả thay cho dữ liệu chưa từng có.
 * Không icon minh hoạ lớn; một bước có thể làm là đủ.
 */
export function EmptyState({
  title,
  description,
  action,
  actionNote,
  headingLevel = 2,
  className,
}: EmptyStateProps) {
  return (
    <div className={`empty-state${className ? ` ${className}` : ''}`}>
      {createElement(`h${headingLevel}`, { className: 'empty-state__title' }, title)}
      {description ? <p className="empty-state__desc">{description}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
      {actionNote ? <p className="empty-state__note">{actionNote}</p> : null}
    </div>
  );
}
