import { createElement, type ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  /** H1 mặc định; trang lồng trong vùng khác có thể dùng H2. */
  headingLevel?: 1 | 2;
  /** Tối đa một câu ngữ cảnh hữu ích (hoặc dòng ngữ cảnh hồ sơ). */
  context?: ReactNode;
  /** Action chính: bên phải desktop, dưới H1 mobile. */
  actions?: ReactNode;
  /** Breadcrumb đã là target 44px ở nơi render. */
  breadcrumb?: ReactNode;
  id?: string;
  className?: string;
}

/** Tiêu đề trang: đúng một H1, tối đa một câu ngữ cảnh, action cùng hàng khi đủ chỗ. */
export function PageHeader({
  title,
  headingLevel = 1,
  context,
  actions,
  breadcrumb,
  id,
  className,
}: PageHeaderProps) {
  return (
    <header className={`page-header${className ? ` ${className}` : ''}`}>
      {breadcrumb}
      <div className="page-header__main">
        {context ? <div className="page-header__context">{context}</div> : null}
        {createElement(
          `h${headingLevel}`,
          { className: 'page-header__heading', id },
          title,
        )}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}
