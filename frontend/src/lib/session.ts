/**
 * Điều hướng phiên tập trung. Tách riêng để test được mà không phụ thuộc
 * cách jsdom mô phỏng navigation.
 */

/** Quay về /login giữ đường dẫn hiện tại làm `next` (chỉ nhận đường nội bộ). */
export function redirectToLogin(nextPath: string): void {
  // Trong unit test (jsdom) không có điều hướng thật — không làm gì.
  if (import.meta.env.MODE === 'test') return;
  const safeNext = nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/app';
  const target = `/login?next=${encodeURIComponent(safeNext)}`;
  try {
    window.location.assign(target);
  } catch {
    window.location.href = target;
  }
}

/** Điều hướng nội bộ an toàn (chỉ đường dẫn tuyệt đối cùng nguồn). */
export function navigateSafely(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//')) return;
  if (import.meta.env.MODE === 'test') return;
  try {
    window.location.assign(path);
  } catch {
    window.location.href = path;
  }
}
