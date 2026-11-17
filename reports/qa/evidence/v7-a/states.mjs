// Trạng thái tương tác của lane A — chạy sau measure.mjs.
// Ghi states.json + ảnh trạng thái (preview/digest, secret một lần, chi tiết nhật ký,
// khóa tài khoản, preview có hồ sơ + reset khi đổi nguồn).
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire('file:///C:/Users/nguye/orca/workspaces/DATN/v7-a/apps/web/package.json');
const { chromium } = require('@playwright/test');

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://127.0.0.1:4355';
const API = 'http://127.0.0.1:3400/api/v1';
const VID = process.env.V7A_PUBLISHED_ID ?? '4ec05596-6bd4-4bb4-ac67-164ab019cc93';
const SUBJ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const out = {
  generatedAt: new Date().toISOString(),
  web: BASE,
  api: API,
  deviceScaleFactor: 1,
};

const browser = await chromium.launch();

// ---------- Admin ----------
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, baseURL: BASE });
await ctx.request.post(`${API}/auth/login`, {
  data: { email: 'admin@demo.heart-iot.local', password: 'demo-admin-2026' },
  headers: { Origin: BASE },
});
const page = await ctx.newPage();

// Điều hướng tab bằng bàn phím.
await page.goto(`${BASE}/app/admin?tab=overview`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[role="tab"]');
await page.getByRole('tab', { name: 'Tổng quan' }).focus();
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(300);
out.keyboardTab = {
  activeAfterArrowRight: await page.evaluate(
    () => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() ?? null,
  ),
  focusedTab: await page.evaluate(
    () => document.activeElement?.textContent?.trim() ?? null,
  ),
};
await page.keyboard.press('End');
await page.waitForTimeout(300);
out.keyboardTab.activeAfterEnd = await page.evaluate(
  () => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() ?? null,
);
out.keyboardTab.urlAfterEnd = await page.evaluate(() => location.pathname + location.search);

// Back/forward giữ đúng tab sau khi đổi tab bằng bấm.
await page.goto(`${BASE}/app/admin?tab=overview`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[role="tab"]');
await page.getByRole('tab', { name: 'Nhật ký' }).click();
await page.waitForURL(/view=audit/);
await page.goBack();
await page.waitForURL(/tab=overview/);
out.backForward = {
  urlAfterBack: await page.evaluate(() => location.pathname + location.search),
  tabAfterBack: await page.evaluate(
    () => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() ?? null,
  ),
  headingAfterBack: await page.evaluate(() => document.querySelector('h2')?.textContent?.trim() ?? null),
};

// Chính sách: preview → digest; sửa giá trị làm vô hiệu preview.
await page.goto(`${BASE}/app/admin?tab=advanced&view=policy`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#policy-heartbeatIntervalSeconds');
await page.getByLabel('Gửi nhịp tim mỗi (giây)').fill('20');
await page.getByRole('button', { name: 'Xem trước' }).click();
await page.waitForSelector('.admin-policy-preview__evidence');
await page.waitForTimeout(300);
out.policy = {
  evidence: (await page.locator('.admin-policy-preview__evidence').innerText()).trim(),
  publishEnabledAfterPreview: await page.getByRole('button', { name: 'Phát hành' }).isEnabled(),
  screenshot: 'reports/qa/evidence/v7-a/admin-policy-1280x900-preview.png',
};
await page.screenshot({ path: join(HERE, 'admin-policy-1280x900-preview.png') });
await page.getByLabel('Gửi nhịp tim mỗi (giây)').fill('30');
out.policy.publishDisabledAfterEdit = await page.getByRole('button', { name: 'Phát hành' }).isDisabled();
out.policy.previewClearedAfterEdit = (await page.locator('.admin-policy-preview__evidence').count()) === 0;

// Nhật ký: mở chi tiết, focus vào panel ngoài khung cuộn.
await page.goto(`${BASE}/app/admin?tab=advanced&view=audit`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('table');
await page.getByRole('button', { name: 'Xem chi tiết' }).first().click();
await page.waitForSelector('#audit-detail-panel');
await page.waitForTimeout(300);
out.audit = {
  detailFocused: await page.evaluate(() => document.activeElement?.id === 'audit-detail-panel'),
  detailOutsideTableWrap: await page.evaluate(
    () => document.getElementById('audit-detail-panel')?.closest('.admin-table-wrap') === null,
  ),
  screenshot: 'reports/qa/evidence/v7-a/admin-audit-1280x900-detail.png',
};
await page.screenshot({ path: join(HERE, 'admin-audit-1280x900-detail.png') });

// Người dùng: form khóa tài khoản focus ô lý do.
await page.goto(`${BASE}/app/admin?tab=users`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('table');
await page.getByRole('button', { name: 'Tạm khóa' }).first().click();
await page.waitForSelector('textarea[id^="status-reason-"]');
await page.waitForTimeout(300);
out.users = {
  reasonFocused: await page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA'),
  screenshot: 'reports/qa/evidence/v7-a/admin-users-1280x900-lock-form.png',
};
await page.screenshot({ path: join(HERE, 'admin-users-1280x900-lock-form.png') });
await page.getByRole('button', { name: 'Hủy' }).click();

// Thiết bị: khóa mới chỉ hiển thị một lần, ẩn thì không còn trong DOM.
await page.goto(`${BASE}/app/admin?tab=devices`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#admin-devices-heading');
await page.getByRole('button', { name: 'Đổi khóa thiết bị' }).first().click();
await page.getByRole('button', { name: 'Xác nhận đổi khóa' }).click();
await page.waitForSelector('.admin-device-secret__value');
await page.waitForTimeout(400);
const secretValue = (await page.locator('.admin-device-secret__value').innerText()).trim();
out.devices = {
  secretVisible: await page.locator('.admin-device-secret__value').isVisible(),
  focusAfterSecret: await page.evaluate(() => document.activeElement?.tagName ?? null),
  secretLength: secretValue.length,
  screenshot: 'reports/qa/evidence/v7-a/admin-devices-1280x900-secret.png',
};
await page.screenshot({ path: join(HERE, 'admin-devices-1280x900-secret.png') });
await page.getByRole('button', { name: 'Tôi đã lưu, ẩn đi' }).click();
out.devices.secretInDomAfterDismiss = await page.evaluate(
  (value) => document.body.innerHTML.includes(value),
  secretValue,
);
await ctx.close();

// ---------- Studio ----------
const c2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, baseURL: BASE });
await c2.request.post(`${API}/auth/login`, {
  data: { email: 'ba-an@demo.heart-iot.local', password: 'demo-heart-iot-2026' },
  headers: { Origin: BASE },
});
const p2 = await c2.newPage();
await p2.goto(`${BASE}/app/studio/${VID}`, { waitUntil: 'domcontentloaded' });
await p2.waitForSelector('#studio-layout');
await p2.getByLabel('Xem trước với hồ sơ (tùy chọn)').selectOption(SUBJ);
await p2.getByRole('button', { name: 'Xem trước' }).click();
await p2.waitForSelector('text=Dữ liệu hồ sơ · Bà Trần Thị An');
await p2.waitForTimeout(400);
const before = await p2.locator('.studio-data-head').innerText();
out.studio = {
  previewLabels: before.split('\n').map((line) => line.trim()).filter(Boolean),
  syntheticBadgeVisible: await p2.getByText('Dữ liệu mô phỏng').first().isVisible(),
  dataThatCount: await p2.evaluate(
    () => (document.body.innerText.match(/Dữ liệu thật/g) ?? []).length,
  ),
  screenshot: 'reports/qa/evidence/v7-a/studio-detail-1280x900-subject-preview.png',
};
await p2.screenshot({ path: join(HERE, 'studio-detail-1280x900-subject-preview.png') });
await p2.getByLabel('Xem trước với hồ sơ (tùy chọn)').selectOption('');
await p2.waitForTimeout(400);
const after = await p2.locator('.studio-data-head').innerText();
out.studio.afterSourceChange = after.split('\n').map((line) => line.trim()).filter(Boolean);
await p2.screenshot({ path: join(HERE, 'studio-detail-1280x900-preview-reset.png') });
await c2.close();

await browser.close();
await writeFile(join(HERE, 'states.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify(out, null, 2));
