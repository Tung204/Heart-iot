import { expect, test } from '@playwright/test';

// E2E smoke — wave 1 chưa chạy (API chưa đủ endpoint); chỉ để sẵn kịch bản tối thiểu.
// Chạy: pnpm --filter @annhien/web test:e2e (cần dev server + API theo docs/14).
test('landing hiển thị tên sản phẩm và nhãn demo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'An Nhiên' })).toBeVisible();
  await expect(page.getByText(/dữ liệu mô phỏng/i).first()).toBeVisible();
});

test('điều hướng tới trang đăng nhập từ landing', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Đăng nhập' }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Đăng nhập' }),
  ).toBeVisible();
});
