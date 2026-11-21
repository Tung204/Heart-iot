import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

// jsdom chưa cài đặt window.scrollTo; AppShell gọi khi đổi route trong /app.
// Stub mặc định để test không in cảnh báo "Not implemented"; test cụ thể có thể
// stub lại để kiểm tra tham số cuộn.
beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-text-size');
});
