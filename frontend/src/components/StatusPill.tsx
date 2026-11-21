import type { ReactNode } from 'react';

/**
 * Tone tương thích (teal/brick/sand) trỏ cùng nghĩa v7:
 * teal → kết nối đã xác nhận, brick → cảnh báo/lỗi, sand → dữ liệu cũ/chưa rõ.
 * Tone mới dùng tên nghĩa: success | danger | warning | info | neutral.
 */
export type PillTone =
  | 'teal'
  | 'brick'
  | 'sand'
  | 'neutral'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info';

interface StatusPillProps {
  tone?: PillTone;
  className?: string;
  children: ReactNode;
}

/** Nhãn trạng thái — luôn có chữ, màu chỉ hỗ trợ; góc 4px, không pill tròn. */
export function StatusPill({ tone = 'neutral', className, children }: StatusPillProps) {
  return <span className={`pill pill--${tone}${className ? ` ${className}` : ''}`}>{children}</span>;
}
