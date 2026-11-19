/**
 * Số học lịch trên chuỗi `YYYY-MM-DD` (ngày địa phương theo timezone hồ sơ).
 *
 * Không dùng `new Date('YYYY-MM-DD')` trực tiếp vì mốc đó là UTC nửa đêm; mọi
 * phép cộng/trừ ngày ở đây chạy trên `Date.UTC` để kết quả không phụ thuộc
 * timezone của máy chủ. Việc quy đổi ngày địa phương ↔ khoảng UTC vẫn dùng
 * `measurements/time-utils`.
 */

/** Cộng/trừ ngày trên chuỗi ngày, giữ định dạng `YYYY-MM-DD`. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map((value) => Number(value));
  if (!year || !month || !day) throw new Error(`Ngày không hợp lệ: ${date}`);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** ISO weekday: 1 = thứ Hai .. 7 = Chủ nhật. */
export function isoWeekday(date: string): number {
  const [year, month, day] = date.split('-').map((value) => Number(value));
  if (!year || !month || !day) throw new Error(`Ngày không hợp lệ: ${date}`);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  // getUTCDay: 0 = Chủ nhật; hợp đồng nhắc lịch dùng 7 = Chủ nhật.
  return weekday === 0 ? 7 : weekday;
}

/** Số ngày bao gồm cả hai đầu; `to` trước `from` trả số âm hoặc 0. */
export function daysBetweenInclusive(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00.000Z`);
  const toMs = Date.parse(`${to}T00:00:00.000Z`);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    throw new Error(`Ngày không hợp lệ: ${from} → ${to}`);
  }
  return Math.round((toMs - fromMs) / 86_400_000) + 1;
}

/** `YYYY-MM-DD` → `DD/MM/YYYY` để in trên phiếu; giữ nguyên nếu chuỗi lạ. */
export function formatDateVi(date: string): string {
  const [year, month, day] = date.split('-');
  return year && month && day ? `${day}/${month}/${year}` : date;
}
