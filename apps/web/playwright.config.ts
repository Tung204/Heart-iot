import { defineConfig, devices } from '@playwright/test';

/**
 * E2E smoke cho web. Wave 1: chưa chạy (API chưa đủ endpoint), chỉ khai báo cấu hình.
 * webServer tự bật `pnpm dev` (Vite, cổng 5173); không dùng trong test unit Vitest.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
