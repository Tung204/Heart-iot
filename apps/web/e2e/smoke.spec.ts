import { expect, test, type Page } from '@playwright/test';

const HERO_NOTE =
  'Dữ liệu mô phỏng · cảnh báo chỉ hiện khi web đang kết nối · không tự gọi cấp cứu · không thay thế cấp cứu.';
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
  await expect(page.getByText('Theo dõi sức khỏe', { exact: true }).first()).toBeVisible();
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
  await expect(note).toContainText('đang kết nối');
  await expect(note).toContainText('không thay thế cấp cứu');
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

// R-01: đúng các viewport thực tế của iPhone SE/8 và Android nhỏ. Chữ lớn phải
// giữ được CTA chính và dòng an toàn trong màn đầu, không cắt/ẩn chữ.
const COMPACT_VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 390, height: 667 },
  { width: 360, height: 640 },
  { width: 360, height: 740 },
  { width: 390, height: 700 },
  { width: 390, height: 844 },
  { width: 320, height: 640 },
] as const;

for (const viewport of COMPACT_VIEWPORTS) {
  test.describe(`landing ${viewport.width}×${viewport.height} chữ lớn`, () => {
    test.use({ viewport });

    test('CTA chính và dòng an toàn nằm trong màn đầu', async ({ page }) => {
      await page.addInitScript(() => window.localStorage.setItem('an:text-size', 'large'));
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
        expect(ctaBox.y + ctaBox.height).toBeLessThanOrEqual(viewport.height);
        expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(viewport.height);
        expect(noteBox.y).toBeGreaterThan(ctaBox.y + ctaBox.height);
      }

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  });
}

test('landing 320×640 cỡ chữ thường: dòng an toàn vẫn trong màn đầu', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  const note = page.getByText(HERO_NOTE);
  await expect(note).toHaveCount(1);
  const box = await note.boundingBox();
  expect(box).not.toBeNull();
  if (box) expect(box.y + box.height).toBeLessThanOrEqual(640);
});

test.describe('/me chậm hoặc lỗi', () => {
  test('đang kiểm phiên: chỉ báo tải có aria-busy, chưa hiện CTA khách', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/v1/me', async (route) => {
      await gate;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify(UNAUTHENTICATED),
      });
    });

    await page.goto('/');
    const loading = page.locator('.hero__session[aria-busy="true"]');
    await expect(loading).toContainText('Đang kiểm tra phiên đăng nhập…');
    await expect(page.getByRole('link', { name: 'Tạo tài khoản' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Đăng nhập' })).toHaveCount(0);

    release();
    await expect(page.getByRole('link', { name: 'Tạo tài khoản' })).toHaveCount(1);
    await expect(loading).toHaveCount(0);
  });

  test('lỗi máy chủ: giữ đăng nhập, tạo tài khoản và thử lại được', async ({ page }) => {
    // StrictMode có thể gọi /me lần nữa khi remount: giữ 500 cho tới khi bấm Thử lại.
    let allowRecovery = false;
    await page.route('**/api/v1/me', async (route) => {
      if (!allowRecovery) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'INTERNAL', message: 'Lỗi máy chủ.', requestId: 'e2e' }),
        });
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify(UNAUTHENTICATED),
      });
    });

    await page.goto('/');
    await expect(page.getByText('Không kiểm tra được phiên đăng nhập.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Đăng nhập' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Tạo tài khoản' })).toHaveCount(1);
    await expect(page.locator('.hero__session').getByRole('button', { name: 'Thử lại' })).toBeVisible();
    await expect(page.locator('.hero__actions a')).toHaveCount(0);

    allowRecovery = true;
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.getByText('Không kiểm tra được phiên đăng nhập.')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Tạo tài khoản' })).toHaveCount(1);
  });
});

test('lỗi API đăng nhập: focus vào hộp lỗi, không rơi về BODY', async ({ page }) => {
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'UNAUTHENTICATED',
        message: 'Email hoặc mật khẩu không đúng.',
        requestId: 'e2e-smoke',
      }),
    }),
  );

  await page.goto('/login');
  await page.getByLabel(/^Email/).fill('con@example.com');
  await page.getByLabel(/^Mật khẩu/).fill('sai-mat-khau');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Email hoặc mật khẩu không đúng.');
  await expect(async () => {
    const state = await page.evaluate(() => ({
      isBody: document.activeElement === document.body,
      containsAlert: Boolean(document.activeElement?.querySelector('[role="alert"]')),
    }));
    expect(state.isBody).toBe(false);
    expect(state.containsAlert).toBe(true);
  }).toPass();
});

test('404 giữ hướng dẫn link lời mời và đường về trang chủ', async ({ page }) => {
  await page.goto('/khong-ton-tai');
  await expect(page.getByRole('heading', { level: 1, name: 'Không tìm thấy trang' })).toBeVisible();
  await expect(page.getByText(/link lời mời/i)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/');
});
