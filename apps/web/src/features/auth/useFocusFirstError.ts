import { useEffect, useRef } from 'react';

/**
 * Sau khi submit lỗi, đưa focus tới field lỗi đầu tiên theo thứ tự form.
 * role=alert chỉ giúp screen reader; người dùng bàn phím cần con trỏ ở đúng field.
 */
export function useFocusFirstError(
  fieldErrors: Record<string, string>,
  order: ReadonlyArray<readonly [field: string, inputId: string]>,
) {
  useEffect(() => {
    const first = order.find(([field]) => fieldErrors[field]);
    if (!first) return;
    document.getElementById(first[1])?.focus();
  }, [fieldErrors, order]);
}

/**
 * Lỗi máy chủ (401/5xx) không gắn với field nào. Đưa focus vào hộp lỗi để người
 * dùng bàn phím/screen reader nghe ngay thông báo thay vì bị trả về BODY.
 * Không chạy khi đã có lỗi field — lúc đó field lỗi đầu tiên được ưu tiên.
 */
export function useFocusErrorAlert(message: string | null) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!message) return;
    ref.current?.focus();
  }, [message]);
  return ref;
}
