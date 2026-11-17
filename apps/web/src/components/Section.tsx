import { createElement, type ReactNode } from 'react';

interface SectionProps {
  title?: string;
  headingLevel?: 2 | 3;
  lead?: ReactNode;
  actions?: ReactNode;
  /** Chỉ bật cho form đang mở, khối hành động khẩn cấp hoặc preview. */
  surface?: boolean;
  id?: string;
  className?: string;
  children?: ReactNode;
}

/** Section phẳng mặc định: H2/H3 + nội dung; không bọc lồng thẻ. */
export function Section({
  title,
  headingLevel = 2,
  lead,
  actions,
  surface = false,
  id,
  className,
  children,
}: SectionProps) {
  const classes = ['page-section'];
  if (surface) classes.push('page-section--surface');
  if (className) classes.push(className);

  return (
    <section className={classes.join(' ')} id={id}>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
      {title
        ? createElement(`h${headingLevel}`, { className: 'page-section__title' }, title)
        : null}
      {lead ? <p className="page-section__lead">{lead}</p> : null}
      {children}
    </section>
  );
}
