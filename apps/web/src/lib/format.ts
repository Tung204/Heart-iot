/** Định dạng thời gian ISO-8601 UTC theo múi giờ địa phương, tiếng Việt. */

function toDate(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(iso: string): string {
  const date = toDate(iso);
  if (!date) return iso;
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}


/** Ngày dạng 14/11/2026 — dùng trong bảng để không phải xuống dòng. */
export function formatShortDate(iso: string): string {
  const date = toDate(iso);
  if (!date) return iso;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/** Ngày + giờ ngắn (14/11 04:56) cho bảng dữ liệu dày đặc. */
export function formatCompactDateTime(iso: string): string {
  const date = toDate(iso);
  if (!date) return iso;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const time = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return `${day}/${month} ${time}`;
}

export function formatDate(iso: string): string {
  const date = toDate(iso);
  if (!date) return iso;
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(date);
}

export function formatTime(iso: string): string {
  const date = toDate(iso);
  if (!date) return iso;
  return new Intl.DateTimeFormat('vi-VN', { timeStyle: 'short' }).format(date);
}

/**
 * Thời gian tương đối ("3 phút trước"). Trả null khi không có mốc —
 * người gọi hiển thị "chưa có dữ liệu", không bịa số.
 */
export function formatRelativeTime(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const then = toDate(iso)?.getTime();
  if (then === undefined || then === null) return null;
  const diffMs = Math.max(0, now - then);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}

/**
 * Ngày hôm nay (YYYY-MM-DD) theo timezone IANA của hồ sơ — không dùng
 * getFullYear/getMonth theo giờ máy để tránh lệch ngày khi khác múi giờ.
 */
export function todayInTimeZone(timeZone: string, now = new Date()): string {
  let formatted: string;
  try {
    formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    // Timezone không hợp lệ — rơi về giờ địa phương, vẫn đúng định dạng.
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  // en-CA trả YYYY-MM-DD trong mọi locale dữ liệu; thay '-' đề phòng định dạng khác.
  return formatted.replaceAll('/', '-');
}

/** Giới hạn khoảng lịch sử theo quyền: không hỏi quá `historyDays` ngày. */
export function clampRangeToHistoryDays(
  fromMs: number,
  toMs: number,
  historyDays: number,
): { from: string; to: string } {
  const maxFromMs = toMs - historyDays * 24 * 3600 * 1000;
  const clampedFrom = Math.max(fromMs, maxFromMs);
  return {
    from: new Date(clampedFrom).toISOString(),
    to: new Date(toMs).toISOString(),
  };
}
