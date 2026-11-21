// Kiểm trực quan V9.2 — chạy thủ công, không thuộc Playwright suite.
// API 3021 (DB .data/v9rules đã seed) + Vite 4368.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://localhost:4368';
const API = 'http://localhost:3021/api/v1';
const OUT = 'C:/MyFolder/Hoc_Tap/project/DATN/reports/qa/evidence/v9-care-rules';
const OWNER = { email: 'ba-an@demo.heart-iot.local', password: 'demo-heart-iot-2026' };

mkdirSync(OUT, { recursive: true });
const results = [];

async function login(context) {
  const response = await context.request.post(`${API}/auth/login`, {
    data: OWNER,
    headers: { Origin: BASE },
  });
  if (!response.ok()) throw new Error(`Đăng nhập lỗi ${response.status()}: ${await response.text()}`);
}

async function openCare(page) {
  await page.goto(`${BASE}/app/care`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1, name: 'Nhắc chăm sóc' }).waitFor();
  await page.getByRole('heading', { level: 2, name: 'Nhắc chủ động' }).waitFor();
  await page.getByRole('heading', { level: 3, name: 'Nhắc vận động nhẹ' }).waitFor();
  await page.getByRole('heading', { level: 3, name: 'Bản tin cuối ngày' }).waitFor();
}

async function scrollTo(page, selector) {
  await page.evaluate((target) => {
    const element = document.querySelector(target);
    if (!element) return;
    const top = element.getBoundingClientRect().top + window.scrollY - 76;
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  }, selector);
  await page.waitForTimeout(220);
}

async function metrics(page, label) {
  return page.evaluate((name) => {
    const section = document.querySelector('.care-rules');
    const interactive = [
      ...document.querySelectorAll(
        '.care-rules button, .care-rules a, .care-rules label.care-form__weekday, .care-rules label.care-form__check, .care-rules input[type="time"], .care-rules input[type="number"]',
      ),
    ]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      })
      .map((element) => {
        const box = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          label: element.textContent?.trim().slice(0, 60) || element.getAttribute('aria-label') || '',
          width: Math.round(box.width),
          height: Math.round(box.height),
        };
      });
    const sectionBox = section?.getBoundingClientRect();
    return {
      label: name,
      url: location.href,
      h1: document.querySelectorAll('h1').length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      sectionVisible: Boolean(sectionBox && sectionBox.width > 0 && sectionBox.height > 0),
      sectionHeight: sectionBox ? Math.round(sectionBox.height) : null,
      interactive,
      smallTargets: interactive.filter((target) => target.height < 44 || target.width < 44),
    };
  }, label);
}

async function shot(page, name, label) {
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  const data = await metrics(page, label);
  results.push({ file, ...data });
  console.log(`${name}: overflow=${data.overflow} h1=${data.h1} small=${data.smallTargets.length}`);
}

const browser = await chromium.launch();
try {
  for (const viewport of [
    { width: 1280, height: 1000, name: '1280' },
    { width: 390, height: 844, name: '390' },
  ]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    await login(context);
    const page = await context.newPage();
    await openCare(page);
    await scrollTo(page, '.care-rules');
    await shot(page, `care-rules-default-${viewport.name}`, `default-${viewport.name}`);
    await context.close();
  }

  const ownerContext = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 1,
  });
  await login(ownerContext);
  const owner = await ownerContext.newPage();
  await openCare(owner);
  await scrollTo(owner, '.care-rules');
  const inactivity = owner.locator('article').filter({ hasText: 'Nhắc vận động nhẹ' });
  await inactivity.getByRole('checkbox', { name: 'Bật nhắc vận động' }).check();
  await inactivity.getByRole('button', { name: 'Lưu cấu hình' }).click();
  await inactivity.getByText('Đã lưu cấu hình.').waitFor();
  await inactivity.getByRole('button', { name: 'Xem trước 7 ngày' }).click();
  const previewRegion = inactivity.getByRole('region', { name: 'Lịch kiểm tra 7 ngày tới' });
  await previewRegion.waitFor();
  await previewRegion.scrollIntoViewIfNeeded();
  await owner.waitForTimeout(220);
  await shot(owner, 'care-rules-preview-1280', 'preview-1280');

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  await login(mobileContext);
  const mobile = await mobileContext.newPage();
  await openCare(mobile);
  const mobileInactivity = mobile.locator('article').filter({ hasText: 'Nhắc vận động nhẹ' });
  await mobileInactivity.getByRole('button', { name: 'Xem trước 7 ngày' }).click();
  const mobilePreview = mobileInactivity.getByRole('region', { name: 'Lịch kiểm tra 7 ngày tới' });
  await mobilePreview.waitFor();
  await mobilePreview.scrollIntoViewIfNeeded();
  await mobile.waitForTimeout(220);
  await shot(mobile, 'care-rules-preview-390', 'preview-390');
  await mobile.getByRole('heading', { level: 3, name: 'Bản tin cuối ngày' }).scrollIntoViewIfNeeded();
  await mobile.waitForTimeout(220);
  await shot(mobile, 'care-rules-digest-390', 'digest-390');

  await mobileContext.close();
  await ownerContext.close();
} finally {
  await browser.close();
}

writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(results, null, 2), 'utf8');
const bad = results.filter(
  (item) => item.overflow !== 0 || item.h1 !== 1 || item.smallTargets.length > 0,
);
console.log(`\nẢnh: ${results.length} · lỗi metric: ${bad.length}`);
if (bad.length > 0) console.log(JSON.stringify(bad, null, 2));
