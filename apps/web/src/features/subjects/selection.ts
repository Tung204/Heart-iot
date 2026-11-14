import { useSyncExternalStore } from 'react';
import type { SubjectSummary } from '@annhien/contracts/subjects';

/**
 * Lựa chọn hồ sơ đang xem — dùng chung giữa SubjectSwitcher (nơi chọn)
 * và các trang nghiệp vụ (dashboard, lịch sử, cảnh báo, thiết bị, chia sẻ).
 * Lưu localStorage để giữ sau khi tải lại trang.
 */
const SELECTION_KEY = 'an:active-subject-id';

function readStoredSelection(): string | null {
  try {
    return window.localStorage.getItem(SELECTION_KEY);
  } catch {
    return null;
  }
}

function persistSelection(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(SELECTION_KEY);
    else window.localStorage.setItem(SELECTION_KEY, id);
  } catch {
    // Không ghi được localStorage thì lựa chọn chỉ dùng trong phiên.
  }
}

let currentId: string | null = readStoredSelection();
const listeners = new Set<() => void>();

export function getActiveSubjectId(): string | null {
  return currentId;
}

export function setActiveSubjectId(id: string | null): void {
  if (currentId === id) return;
  currentId = id;
  persistSelection(id);
  for (const listener of listeners) listener();
}

function subscribeActiveSubjectId(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useActiveSubjectId(): string | null {
  return useSyncExternalStore(subscribeActiveSubjectId, getActiveSubjectId, getActiveSubjectId);
}

/**
 * Hồ sơ đang xem hiệu lực: lựa chọn đã lưu nếu còn trong danh sách,
 * ngược lại tự dùng hồ sơ đầu tiên (KHÔNG ghi đè lựa chọn của người dùng).
 */
export function useActiveSubject(subjects: SubjectSummary[] | undefined): SubjectSummary | null {
  const storedId = useActiveSubjectId();
  if (!subjects || subjects.length === 0) return null;
  return subjects.find((item) => item.id === storedId) ?? subjects[0] ?? null;
}
