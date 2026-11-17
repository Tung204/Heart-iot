/** Giới hạn hợp đồng `emergencyContactListSchema.items.max(5)` — dùng chung UI + thông báo. */
export const MAX_EMERGENCY_CONTACTS = 5;

/**
 * Chuyển số điện thoại hiển thị thành giá trị cho `tel:`.
 * Giữ số và đúng một dấu `+` ở đầu, bỏ khoảng trắng/ngoặc/chấm/gạch.
 * Không tự thêm mã quốc gia — giữ đúng số chủ hồ sơ đã nhập.
 */
export function toTelHref(phone: string): string {
  const compact = phone.replace(/[^0-9+]/g, '');
  const hasPlus = compact.startsWith('+');
  return `tel:${hasPlus ? '+' : ''}${compact.replace(/\+/g, '')}`;
}
