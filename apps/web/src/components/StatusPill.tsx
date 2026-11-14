import type { ReactNode } from 'react';

export type PillTone = 'teal' | 'brick' | 'sand' | 'neutral';

interface StatusPillProps {
  tone?: PillTone;
  className?: string;
  children: ReactNode;
}

/** Nhãn trạng thái — luôn có chữ, màu chỉ hỗ trợ. */
export function StatusPill({ tone = 'neutral', className, children }: StatusPillProps) {
  return <span className={`pill pill--${tone}${className ? ` ${className}` : ''}`}>{children}</span>;
}
