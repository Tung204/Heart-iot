import { useCallback, useEffect, useState } from 'react';

/**
 * Chế độ "chữ lớn" — lưu localStorage, áp dụng `<html data-text-size="large">`.
 * Thay đổi font-size gốc nên toàn bộ kích thước rem co giãn theo.
 * Nhiều bản sao của nút toggle (sidebar + topbar) đồng bộ qua sự kiện window.
 */
export type TextSize = 'default' | 'large';

const STORAGE_KEY = 'an:text-size';
const CHANGE_EVENT = 'an:text-size-change';

export function readStoredTextSize(): TextSize {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'large' ? 'large' : 'default';
  } catch {
    return 'default';
  }
}

export function applyTextSize(size: TextSize): void {
  if (size === 'large') {
    document.documentElement.setAttribute('data-text-size', 'large');
  } else {
    document.documentElement.removeAttribute('data-text-size');
  }
}

export function storeTextSize(size: TextSize): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, size);
  } catch {
    // Không ghi được localStorage thì chỉ áp dụng cho phiên hiện tại.
  }
  applyTextSize(size);
  window.dispatchEvent(new CustomEvent<TextSize>(CHANGE_EVENT, { detail: size }));
}

/** Áp dụng lựa chọn đã lưu trước khi render lần đầu (tránh nhấp nháy). */
export function applyInitialTextSize(): void {
  applyTextSize(readStoredTextSize());
}

export function useTextSize(): { size: TextSize; setSize: (next: TextSize) => void } {
  const [size, setSizeState] = useState<TextSize>(() => readStoredTextSize());

  // Đồng bộ DOM mỗi khi size đổi (kể cả lần mount đầu).
  useEffect(() => {
    applyTextSize(size);
  }, [size]);

  // Đồng bộ giữa các bản sao của nút toggle trong cùng trang.
  useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<TextSize>).detail;
      if (detail === 'large' || detail === 'default') {
        setSizeState(detail);
      }
    };
    window.addEventListener(CHANGE_EVENT, sync);
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);

  const setSize = useCallback((next: TextSize) => {
    setSizeState(next);
    storeTextSize(next);
  }, []);

  return { size, setSize };
}
