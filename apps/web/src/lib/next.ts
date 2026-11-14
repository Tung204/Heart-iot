import { useSearchParams } from 'react-router-dom';

/**
 * Đọc tham số `next` từ query string một cách an toàn:
 * chỉ chấp nhận đường dẫn nội bộ bắt đầu bằng `/` (chặn open redirect).
 */
export function useSafeNext(): string {
  const [params] = useSearchParams();
  const next = params.get('next');
  if (next && next.startsWith('/') && !next.startsWith('//')) {
    return next;
  }
  return '/app';
}
