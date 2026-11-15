import { expect, test, type Page } from '@playwright/test';

const HERO_NOTE = 'Dữ liệu mô phỏng · cảnh báo chỉ hiện khi web mở · không tự gọi cấp cứu.';
const UNAUTHENTICATED = {
  code: 'UNAUTHENTICATED',
  message: 'Chưa đăng nhập.',
  requestId: 'e2e-smoke',
};

// E2E smoke — landing công khai và vào trang đăng nhập.
// Chạy: pnpm --filter @annhien/web test:e2e (cần dev server; trạng thái phiên
// được giả lập 401 để smoke không phụ thuộc API/DB cục bộ).
test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify(UNAUTHENTICATED),
    }),
  );
});

test('landing hiển thị tên sản phẩm, trợ lý AI và dữ liệu mô phỏng trong màn đầu', async ({
  page,
}) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { level: 1, name: /Người thân ở nhà/ }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/trợ lý AI/i);
  await expect(page.getByText('An Nhiên', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText('Trợ lý AI trả lời câu hỏi về số liệu của người thân.'),
  ).toBeVisible();

  // Header chỉ logo; hero là nơi duy nhất có CTA, mỗi đích đúng một link.
  const header = page.locator('header.site-header');
  await expect(header.getByRole('link')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Tạo tài khoản' })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Đăng nhập' })).toHaveCount(1);

  // Disclaimer nằm dưới CTA và vẫn thấy trong viewport đầu (mặc định 1280×720).
  const note = page.getByText(HERO_NOTE);
  await expect(note).toHaveCount(1);
  const noteBox = await note.boundingBox();
  const viewport = page.viewportSize();
  expect(noteBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (noteBox && viewport) {
    expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(viewport.height);
  }

  await expect(page.getByText(/bản demo|đồ án/i)).toHaveCount(0);
});

test('điều hướng tới trang đăng nhập từ landing', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Đăng nhập' })).toHaveCount(1);
  await page.getByRole('link', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeVisible();
  // P1-5: trang đăng nhập công khai không còn khối tự điền tài khoản.
  await expect(page.getByText('Tài khoản trải nghiệm')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Quản trị' })).toHaveCount(0);
  await expect(page.getByLabel(/^Email/)).toHaveValue('');
});

test.describe('landing 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('CTA và dòng cảnh báo nằm trong màn đầu, không tràn ngang', async ({ page }) => {
    await page.goto('/');

    const cta = page.getByRole('link', { name: 'Tạo tài khoản' });
    const note = page.getByText(HERO_NOTE);
    await expect(cta).toHaveCount(1);
    await expect(note).toHaveCount(1);

    const ctaBox = await cta.boundingBox();
    const noteBox = await note.boundingBox();
    expect(ctaBox).not.toBeNull();
    expect(noteBox).not.toBeNull();
    if (ctaBox && noteBox) {
      expect(ctaBox.y + ctaBox.height).toBeLessThanOrEqual(844);
      expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(844);
      expect(noteBox.y).toBeGreaterThan(ctaBox.y + ctaBox.height);
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});

test.describe('register 390×844 chữ lớn', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('nút tạo tài khoản nằm trong màn đầu, không tràn ngang', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('an:text-size', 'large'));
    await page.goto('/register');
    await expectRegisterSubmitInFirstViewport(page, 844);
  });
});

test.describe('register 360×740 chữ lớn', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('nút tạo tài khoản vẫn nằm trong màn đầu', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('an:text-size', 'large'));
    await page.goto('/register');
    await expectRegisterSubmitInFirstViewport(page, 740);
  });

  test('nút tạo tài khoản nằm trong màn đầu ở cỡ thường', async ({ page }) => {
    await page.goto('/register');
    await expectRegisterSubmitInFirstViewport(page, 740);
  });
});

async function expectRegisterSubmitInFirstViewport(page: Page, height: number) {
  await expect(page.getByRole('heading', { level: 1, name: 'Tạo tài khoản' })).toBeVisible();
  const submit = page.getByRole('button', { name: 'Tạo tài khoản' });
  await expect(submit).toBeVisible();
  const box = await submit.boundingBox();
  expect(box).not.toBeNull();
  if (box) expect(box.y + box.height).toBeLessThanOrEqual(height);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
}
