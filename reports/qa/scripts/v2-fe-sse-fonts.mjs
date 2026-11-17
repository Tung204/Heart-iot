// Review v2 — (a) SSE retry khi chặn 2 lần kết nối; (b) "Hiện tất cả 1.681 dòng" trên mobile CPU 4x;
// (c) A/B chi phí font (chặn woff2) trên landing.
// Chạy: cd apps/web && node --input-type=module -e "$(cat ../../reports/qa/scripts/v2-fe-sse-fonts.mjs)"
// S4: (a) SSE reconnect khi mất kết nối; (b) render 1.681 dòng trên mobile + CPU 4x;
//     (c) chi phí font khi chặn woff2 (so sánh LCP trên slow 3G).
import { chromium } from '@playwright/test';

const WEB = 'http://localhost:4273';
const API = 'http://localhost:3201';
const browser = await chromium.launch();
const out = {};

async function login(page) {
  await page.goto(`${WEB}/login`, { waitUntil: 'load' });
  await page.fill('input[type="email"]', 'ba-an@demo.annhien.local');
  await page.fill('input[type="password"]', 'demo-an-nhien-2026');
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=/Nhịp tim/', { timeout: 40_000 });
}

// (a) SSE: chặn 2 lần kết nối đầu rồi cho qua; ghi lại mốc thời gian từng lần thử.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const attempts = [];
  let blocked = 0;
  await page.route(`${WEB}/api/**`, async (route) => {
    const url = route.request().url();
    if (url.includes('/events')) {
      attempts.push({ t: Date.now(), url: url.replace(WEB, ''), phase: blocked < 2 ? 'abort' : 'pass' });
      if (blocked < 2) {
        blocked += 1;
        await route.abort('connectionreset');
        return;
      }
    }
    await route.continue({ url: url.replace(WEB, API) });
  });
  await login(page);
  await page.waitForTimeout(9000);
  const gaps = attempts.slice(1).map((a, i) => ({ from: attempts[i].phase, delayMs: a.t - attempts[i].t }));
  out.sse = { attempts: attempts.map((a) => ({ phase: a.phase, url: a.url })), gaps };
  // Trạng thái SSE có hiển thị cho người dùng không?
  const bannerText = await page.evaluate(() =>
    [...document.querySelectorAll('[role="status"],[role="alert"],.banner,.notice')].map((n) => n.textContent?.trim().slice(0, 80)),
  );
  out.sseVisibleIndicators = bannerText;
  await context.close();
}

// (b) Mobile 390x844 + CPU 4x: render toàn bộ 1.681 dòng.
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 120));
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  await page.route(`${WEB}/api/**`, async (route) => {
    await route.continue({ url: route.request().url().replace(WEB, API) });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Performance.enable');
  await login(page);
  await page.goto(`${WEB}/app/history`, { waitUntil: 'load' });
  await page.waitForSelector('.measurement-card', { timeout: 40_000 });
  await page.getByRole('button', { name: '7 ngày' }).click();
  await page.waitForFunction(() => /\/500 dòng/.test(document.querySelector('table.data-table caption')?.textContent ?? ''), null, { timeout: 30_000 });
  for (let i = 0; i < 5; i += 1) {
    const btn = page.getByRole('button', { name: /Tải thêm từ máy chủ/ });
    if ((await btn.count()) === 0) break;
    const before = await page.evaluate(() => document.querySelectorAll('.measurement-card').length);
    await btn.click();
    await page
      .waitForFunction(
        (n) => {
          const m = (document.querySelector('table.data-table caption')?.textContent ?? '').match(/Đang hiển thị (\d+)\/(\d+) dòng/);
          return m ? +m[2] > n : false;
        },
        before * 25,
        { timeout: 20_000 },
      )
      .catch(() => {});
    await page.waitForTimeout(400);
  }
  const total = await page.evaluate(() => document.querySelector('table.data-table caption')?.textContent?.trim());
  // Đo "Hiện tất cả" trên máy yếu: long task + thời gian tới frame kế tiếp.
  await page.evaluate(() => {
    window.__lt = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration));
    }).observe({ type: 'longtask' });
    window.__mark = performance.now();
  });
  const showAll = page.getByRole('button', { name: /Hiện tất cả/ });
  const label = (await showAll.count()) > 0 ? (await showAll.textContent())?.trim() : null;
  const clickStart = Date.now();
  if ((await showAll.count()) > 0) await showAll.click();
  const frames = await page.evaluate(
    () =>
      new Promise((res) => {
        requestAnimationFrame(() => requestAnimationFrame(() => res(Math.round(performance.now() - window.__mark))));
      }),
  );
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    cards: document.querySelectorAll('.measurement-card').length,
    rows: document.querySelectorAll('table.data-table tbody tr').length,
    domNodes: document.getElementsByTagName('*').length,
    longtasksMs: window.__lt,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  const { metrics } = await cdp.send('Performance.getMetrics');
  const heap = Object.fromEntries(metrics.map((x) => [x.name, x.value])).JSHeapUsedSize / 1048576;
  out.mobileHeavy = { total, label, wallMs: Date.now() - clickStart, frames, after, heapMb: +heap.toFixed(1), consoleErrors };
  await page.screenshot({ path: 'C:/tmp/qa-mobile-history-all.png' });
  await context.close();
}

// (c) Font: so sánh LCP landing trên slow 3G khi có và khi chặn woff2.
async function landingLcp({ blockFonts }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (400 * 1024) / 8,
    connectionType: 'cellular3g',
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.route(`${WEB}/api/**`, async (route) => {
    await route.continue({ url: route.request().url().replace(WEB, API) });
  });
  if (blockFonts) await page.route('**/*.woff2', (route) => route.abort());
  await page.addInitScript(() => {
    window.__p = { lcp: 0, cls: 0, fcp: 0 };
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__p.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__p.fcp = e.startTime;
    }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__p.cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(`${WEB}/`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const p = await page.evaluate(() => ({
    ...window.__p,
    transferKb: +(performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || 0), 0) / 1024).toFixed(1),
    fontRequests: performance.getEntriesByType('resource').filter((r) => r.name.includes('.woff')).length,
    families: getComputedStyle(document.querySelector('h1') ?? document.body).fontFamily,
  }));
  await context.close();
  return { fcp: Math.round(p.fcp), lcp: Math.round(p.lcp), cls: +p.cls.toFixed(4), transferKb: p.transferKb, fontRequests: p.fontRequests, families: p.families };
}
out.fontWith = await landingLcp({ blockFonts: false });
out.fontBlocked = await landingLcp({ blockFonts: true });

await browser.close();
const fs = await import('node:fs');
fs.writeFileSync('C:/tmp/qa-s4.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
