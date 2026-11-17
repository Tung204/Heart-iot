// Review v2 — lịch sử 7 ngày: 4 trang × 500 = 1.681 dòng, "Hiện tất cả", và test dữ liệu bị reset sau 60 s.
// Chạy: cd apps/web && node --input-type=module -e "$(cat ../../reports/qa/scripts/v2-fe-history-1681.mjs)"
// Cần preview :4273 + API :3201 (WEB_ORIGIN=:4273). Script chờ 75 s ở bước cuối.
// S3c: (a) tải đủ 4 trang 7 ngày rồi "Hiện tất cả 1.681 dòng";
// (b) kiểm dữ liệu đã tải có bị reset khi mốc `now` đổi sau 60 giây không.
import { chromium } from '@playwright/test';

const WEB = 'http://localhost:4273';
const API = 'http://localhost:3201';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
const measurementRequests = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text().slice(0, 160)}`);
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('request', (r) => {
  if (r.url().includes('/measurements')) measurementRequests.push({ t: Date.now(), url: r.url() });
});
await page.route(`${WEB}/api/**`, async (route) => {
  await route.continue({ url: route.request().url().replace(WEB, API) });
});
const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');
const heapMb = async () => {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  return +(m.JSHeapUsedSize / 1024 / 1024).toFixed(1);
};

const captionTotal = () =>
  page.evaluate(() => {
    const text = document.querySelector('table.data-table caption')?.textContent ?? '';
    const m = text.match(/Đang hiển thị (\d+)\/(\d+) dòng/);
    return m ? { visible: +m[1], total: +m[2] } : { visible: 0, total: 0 };
  });

await page.goto(`${WEB}/login`, { waitUntil: 'load' });
await page.fill('input[type="email"]', 'ba-an@demo.annhien.local');
await page.fill('input[type="password"]', 'demo-an-nhien-2026');
await page.click('button[type="submit"]');
await page.waitForSelector('text=/Nhịp tim/', { timeout: 30_000 });
await page.click('a[href="/app/history"]');
await page.waitForSelector('table.data-table tbody tr', { state: 'attached', timeout: 30_000 });
await page.getByRole('button', { name: '7 ngày' }).click();
await page.waitForFunction(() => /\/500 dòng/.test(document.querySelector('table.data-table caption')?.textContent ?? ''), null, { timeout: 20_000 });
await page.waitForTimeout(600);
const page1 = await captionTotal();

// Tải thêm từng trang tới khi hết.
const pagingTimes = [];
for (let i = 0; i < 6; i += 1) {
  const btn = page.getByRole('button', { name: /Tải thêm từ máy chủ/ });
  if ((await btn.count()) === 0) break;
  const start = Date.now();
  const beforeTotal = (await captionTotal()).total;
  await btn.click();
  await page
    .waitForFunction(
      (before) => {
        const text = document.querySelector('table.data-table caption')?.textContent ?? '';
        const m = text.match(/Đang hiển thị (\d+)\/(\d+) dòng/);
        return m ? +m[2] > before : false;
      },
      beforeTotal,
      { timeout: 20_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(300);
  pagingTimes.push({ ms: Date.now() - start, total: (await captionTotal()).total });
}
const afterPaging = await captionTotal();
const chartPoints = await page.evaluate(
  () => document.querySelector('[class*="chart"] polyline')?.getAttribute('points')?.split(' ').length ?? 0,
);
const heapPaged = await heapMb();

// (a) Hiện tất cả — đo render + heap.
await page.evaluate(() => {
  window.__lt = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration));
  }).observe({ type: 'longtask' });
  window.__mark = performance.now();
});
const showAll = page.getByRole('button', { name: /Hiện tất cả/ });
const showAllLabel = (await showAll.count()) > 0 ? (await showAll.textContent())?.trim() : null;
if ((await showAll.count()) > 0) await showAll.click();
const renderMs = await page.evaluate(
  () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(Math.round(performance.now() - window.__mark))))),
);
await page.waitForTimeout(400);
const afterAll = await page.evaluate(() => ({
  rows: document.querySelectorAll('table.data-table tbody tr').length,
  cards: document.querySelectorAll('.measurement-card').length,
  domNodes: document.getElementsByTagName('*').length,
  longtasksMs: window.__lt,
  scrollHeight: document.documentElement.scrollHeight,
}));
const heapAll = await heapMb();
await page.screenshot({ path: 'C:/tmp/qa-history-7d-all.png' });

// (b) Chờ mốc `now` cập nhật (interval 60s) và xem dữ liệu có bị nạp lại từ trang 1.
const beforeWait = { total: (await captionTotal()).total, requests: measurementRequests.length };
const waitStart = Date.now();
await page.waitForTimeout(75_000);
const afterWait = { total: (await captionTotal()).total, requests: measurementRequests.length };
const requestsAfter = measurementRequests.slice(beforeWait.requests - 1);

await browser.close();
const out = {
  page1,
  pagingTimes,
  afterPaging,
  chartPoints,
  heapPaged,
  showAll: { label: showAllLabel, renderMs, afterAll, heapAll, heapDeltaMb: +(heapAll - heapPaged).toFixed(1) },
  minuteTick: { beforeWait, afterWait, waitedMs: Date.now() - waitStart, requestsAfterCount: requestsAfter.length, requestsAfter: requestsAfter.map((r) => `${Math.round((r.t - waitStart) / 1000)}s`) },
  consoleErrors,
};
const fs = await import('node:fs');
fs.writeFileSync('C:/tmp/qa-s3c.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
