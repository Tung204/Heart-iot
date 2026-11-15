import { expect, test } from '@playwright/test';

// E2E smoke — landing công khai và vào trang đăng nhập.
// Chạy: pnpm --filter @annhien/web test:e2e (cần dev server + API theo docs/14).
test('landing hiển thị tên sản phẩm và nhãn dữ liệu mô phỏng', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: /Người thân ở nhà/ }),
  ).toBeVisible();
  await expect(page.getByText('An Nhiên', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/dữ liệu mô phỏng/i).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mở trợ lý' })).toBeVisible();
  await expect(page.getByText(/bản demo|đồ án/i)).toHaveCount(0);
});

test('điều hướng tới trang đăng nhập từ landing', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Đăng nhập' }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Đăng nhập' }),
  ).toBeVisible();
});
