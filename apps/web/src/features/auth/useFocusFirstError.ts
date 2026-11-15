import { useEffect } from 'react';

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
