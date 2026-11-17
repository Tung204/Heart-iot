import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  description?: string;
  className?: string;
  children: ReactNode;
}

export function Card({ title, description, className, children }: CardProps) {
  return (
    <section className={`card${className ? ` ${className}` : ''}`}>
      {title ? <h3 className="card__title">{title}</h3> : null}
      {description ? <p className="card__desc">{description}</p> : null}
      {children}
    </section>
  );
}
