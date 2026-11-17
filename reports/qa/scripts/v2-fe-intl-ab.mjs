// Review v2 — A/B: cache Intl.DateTimeFormat (addInitScript) ảnh hưởng thời gian render 1.681 dòng;
// kèm kiểm tràn ngang 360×740 + chữ lớn (root 20px) trên trang lịch sử.
// Chạy: cd apps/web && node --input-type=module -e "$(cat ../../reports/qa/scripts/v2-fe-intl-ab.mjs)"
// S8: (a) A/B trên mobile 4x CPU — "Hiện tất cả 1.681 dòng" có/không cache Intl.DateTimeFormat;
//     (b) tràn ngang 360px + chữ lớn khi danh sách dày.
import { chromium } from '@playwright/test';

const WEB = 'http://localhost:4273';
const API = 'http://localhost:3201';
const browser = await chromium.launch();
const out = {};

const intlPatch = () => {
  const Orig = Intl.DateTimeFormat;
  const cache = new Map();
  const Patched = function (locales, options) {
    const key = JSON.stringify([locales, options ?? null]);
    let fmt = cache.get(key);
    if (!fmt) {
      fmt = new Orig(locales, options);
      cache.set(key, fmt);
    }
    return fmt;
  };
  Patched.prototype = Orig.prototype;
  Patched.supportedLocalesOf = Orig.supportedLocalesOf;
  Intl.DateTimeFormat = Patched;
};

async function runScenario({ patchIntl }) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.route(`${WEB}/api/**`, async (route) => {
    await route.continue({ url: route.request().url().replace(WEB, API) });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Performance.enable');
  if (patchIntl) await page.addInitScript(intlPatch);
  await page.goto(`${WEB}/login`, { waitUntil: 'load' });
  await page.fill('input[type="email"]', 'ba-an@demo.annhien.local');
  await page.fill('input[type="password"]', 'demo-an-nhien-2026');
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=/Nhịp tim/', { timeout: 60_000 });
  await page.goto(`${WEB}/app/history`, { waitUntil: 'load' });
  await page.waitForSelector('.measurement-card', { timeout: 60_000 });
  await page.getByRole('button', { name: '7 ngày' }).click();
  await page.waitForFunction(() => /\/500 dòng/.test(document.querySelector('table.data-table caption')?.textContent ?? ''), null, { timeout: 40_000 });
  for (let i = 0; i < 6; i += 1) {
    const btn = page.getByRole('button', { name: /Tải thêm từ máy chủ/ });
    if ((await btn.count()) === 0) break;
    const before = await page.evaluate(() => (document.querySelector('table.data-table caption')?.textContent ?? '').match(/\/(\d+) dòng/)?.[1]);
    await btn.click();
    await page
      .waitForFunction(
        (n) => (document.querySelector('table.data-table caption')?.textContent ?? '').match(/\/(\d+) dòng/)?.[1] !== n,
        before,
        { timeout: 30_000 },
      )
      .catch(() => {});
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => {
    window.__lt = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration));
    }).observe({ type: 'longtask' });
    window.__m = performance.now();
  });
  const label = (await page.getByRole('button', { name: /Hiện tất cả/ }).textContent())?.trim();
  await page.getByRole('button', { name: /Hiện tất cả/ }).click();
  const frames = await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(Math.round(performance.now() - window.__m))))),
  );
  await page.waitForTimeout(400);
  const res = await page.evaluate(() => ({
    longtasks: window.__lt,
    cards: document.querySelectorAll('.measurement-card').length,
    domNodes: document.getElementsByTagName('*').length,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  const { metrics } = await cdp.send('Performance.getMetrics');
  res.heapMb = +(Object.fromEntries(metrics.map((x) => [x.name, x.value])).JSHeapUsedSize / 1048576).toFixed(1);
  res.label = label;
  res.frames = frames;
  return res;
}

out.base = await runScenario({ patchIntl: false });
out.intlCached = await runScenario({ patchIntl: true });

// (b) 360px + chữ lớn với danh sách dày.
{
  const context = await browser.newContext({
    viewport: { width: 360, height: 740 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.route(`${WEB}/api/**`, async (route) => {
    await route.continue({ url: route.request().url().replace(WEB, API) });
  });
  await page.goto(`${WEB}/login`, { waitUntil: 'load' });
  await page.fill('input[type="email"]', 'ba-an@demo.annhien.local');
  await page.fill('input[type="password"]', 'demo-an-nhien-2026');
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=/Nhịp tim/', { timeout: 40_000 });
  const toggle = page.getByRole('button', { name: /Bật chữ lớn/ });
  const toggleCount = await toggle.count();
  if (toggleCount > 0) await toggle.first().click();
  const size = await page.evaluate(() => ({
    root: getComputedStyle(document.documentElement).fontSize,
    attr: document.documentElement.getAttribute('data-text-size'),
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    bodyOverflowX: getComputedStyle(document.body).overflowX,
  }));
  await page.goto(`${WEB}/app/history`, { waitUntil: 'load' });
  await page.waitForSelector('.measurement-card', { timeout: 40_000 });
  const hist = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    visibleCards: document.querySelectorAll('.measurement-card').length,
  }));
  // Kiểm phần tử rộng nhất tràn khung.
  const widest = await page.evaluate(() => {
    let worst = null;
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > document.documentElement.clientWidth + 1) {
        if (!worst || r.right > worst.right) worst = { tag: el.tagName, cls: String(el.className).slice(0, 60), right: Math.round(r.right) };
      }
    }
    return worst;
  });
  await page.screenshot({ path: 'C:/tmp/qa-360-large-text-history.png' });
  out.mobile360LargeText = { toggleCount, size, hist, widest };
  await context.close();
}

await browser.close();
const fs = await import('node:fs');
fs.writeFileSync('C:/tmp/qa-s8.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
