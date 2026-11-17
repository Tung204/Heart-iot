import { createElement, type ReactNode } from 'react';

export type HeadingLevel = 2 | 3 | 4;

interface CardProps {
  title?: string;
  description?: string;
  className?: string;
  /** Cấp heading cho tiêu đề thẻ — mặc định H3 để không lồng dưới H1/H2 sai cây. */
  headingLevel?: HeadingLevel;
  children: ReactNode;
}

/**
 * Vùng tác vụ độc lập (surface) — dùng cho form đang mở, khối hành động khẩn
 * cấp hoặc preview; không dùng để bọc mỗi đoạn văn/số liệu.
 */
export function Card({ title, description, className, headingLevel = 3, children }: CardProps) {
  return (
    <section className={`card${className ? ` ${className}` : ''}`}>
      {title
        ? createElement(
            `h${headingLevel}`,
            { className: 'card__title' },
            title,
          )
        : null}
      {description ? <p className="card__desc">{description}</p> : null}
      {children}
    </section>
  );
}
