// Review v2 — landing (mobile, slow 3G + CPU 4x) và login→dashboard: FCP/LCP/CLS/long task/waterfall.
// Chạy: cd apps/web && node --input-type=module -e "$(cat ../../reports/qa/scripts/v2-fe-landing-dashboard.mjs)"
// Cần: `vite preview --port 4273` (web build) + API :3201 với WEB_ORIGIN=http://localhost:4273.
// S1: landing cold (slow 3G + CPU 4x, mobile 390x844). S2: login -> dashboard.
import { chromium } from '@playwright/test';

const WEB = 'http://localhost:4273';
const API = 'http://localhost:3201';
const OUT = {};

const initScript = () => {
  window.__perf = { lcp: 0, cls: 0, shifts: [], longtasks: [], fcp: 0, rootBlankMs: null };
  const nowIso = () => performance.now();
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__perf.lcp = entry.startTime;
      window.__perf.lcpSize = entry.size;
      window.__perf.lcpElement = entry.element ? entry.element.tagName + '.' + entry.element.className : null;
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) {
        window.__perf.cls += entry.value;
        window.__perf.shifts.push({ t: Math.round(entry.startTime), v: +entry.value.toFixed(4) });
      }
    }
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === 'first-contentful-paint') window.__perf.fcp = entry.startTime;
    }
  }).observe({ type: 'paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__perf.longtasks.push({ t: Math.round(entry.startTime), d: Math.round(entry.duration) });
    }
  }).observe({ type: 'longtask', buffered: true });
  // Thời điểm #root có nội dung lần đầu (đo khoảng "màn hình trắng").
  const started = nowIso();
  const root = document.getElementById('root');
  const check = () => {
    if (window.__perf.rootBlankMs === null && root && root.childElementCount > 0) {
      window.__perf.rootBlankMs = Math.round(nowIso() - started);
    }
  };
  const attach = () => { if (document.documentElement) new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true }); };
  if (document.documentElement) attach(); else document.addEventListener('readystatechange', attach);
  queueMicrotask(check);
};

async function setup(page, { slow = true, cpu = 4 } = {}) {
  const client = await page.context().newCDPSession(page);
  if (slow) {
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 400,
      downloadThroughput: (400 * 1024) / 8,
      uploadThroughput: (400 * 1024) / 8,
      connectionType: 'cellular3g',
    });
  }
  if (cpu > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.route(`${WEB}/api/**`, async (route) => {
    await route.continue({ url: route.request().url().replace(WEB, API) });
  });
  await page.addInitScript(initScript);
  return client;
}

async function collect(page) {
  const perf = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource').map((r) => ({
      name: r.name.replace(location.origin, ''),
      start: Math.round(r.startTime),
      dur: Math.round(r.duration),
      transfer: r.transferSize,
      decoded: r.decodedBodySize,
      type: r.initiatorType,
    }));
    return {
      ...window.__perf,
      domContentLoaded: Math.round(nav?.domContentLoadedEventEnd ?? 0),
      loadEvent: Math.round(nav?.loadEventEnd ?? 0),
      resources: res,
    };
  });
  return perf;
}

const browser = await chromium.launch();

// ---------------------------------------------------------------- S1 landing
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
    if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  await setup(page, { slow: true, cpu: 4 });
  const t0 = Date.now();
  await page.goto(`${WEB}/`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const perf = await collect(page);
  OUT.landing = {
    wallMs: Date.now() - t0,
    fcp: Math.round(perf.fcp),
    lcp: Math.round(perf.lcp),
    cls: +perf.cls.toFixed(4),
    rootBlankMs: perf.rootBlankMs,
    domContentLoaded: perf.domContentLoaded,
    loadEvent: perf.loadEvent,
    requests: perf.resources.length,
    transferKb: +(perf.resources.reduce((a, r) => a + (r.transfer || 0), 0) / 1024).toFixed(1),
    longtasks: perf.longtasks,
    consoleErrors,
    resources: perf.resources
      .filter((r) => /\.(js|css|woff2?|html)$/.test(r.name) || r.name.includes('/api/'))
      .sort((a, b) => a.start - b.start),
  };
  await page.screenshot({ path: 'C:/tmp/qa-landing-mobile-slow3g.png', fullPage: false });
  await context.close();
}

// ------------------------------------------------------- S2 login -> dashboard
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  await setup(page, { slow: true, cpu: 4 });

  await page.goto(`${WEB}/login`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const loginPerf = await collect(page);

  await page.fill('input[type="email"]', 'ba-an@demo.annhien.local');
  await page.fill('input[type="password"]', 'demo-an-nhien-2026');
  const t0 = Date.now();
  await page.click('button[type="submit"]');
  // Đo mốc dữ liệu nghiệp vụ đầu tiên hiện trên tổng quan.
  const firstData = await page
    .locator('text=Nhịp tim')
    .first()
    .waitFor({ timeout: 60_000 })
    .then(() => Date.now() - t0)
    .catch(() => null);
  await page.waitForTimeout(2500);
  const perf = await collect(page);
  OUT.dashboard = {
    loginFcp: Math.round(loginPerf.fcp),
    loginRequests: loginPerf.resources.length,
    timeToDashboardDataMs: firstData,
    fcp: Math.round(perf.fcp),
    lcp: Math.round(perf.lcp),
    cls: +perf.cls.toFixed(4),
    shifts: perf.shifts,
    requests: perf.resources.length,
    transferKb: +(perf.resources.reduce((a, r) => a + (r.transfer || 0), 0) / 1024).toFixed(1),
    longtasks: perf.longtasks,
    consoleErrors,
    resourceTimeline: perf.resources
      .filter((r) => r.name.includes('/api/') || /\.(js|css|woff2?)$/.test(r.name))
      .sort((a, b) => a.start - b.start)
      .map((r) => `${r.start}ms +${r.dur}ms ${r.type} ${r.name.split('/').pop()}`),
  };
  await page.screenshot({ path: 'C:/tmp/qa-dashboard-slow3g.png' });
  await context.close();
}

await browser.close();
const fs = await import('node:fs');
fs.writeFileSync('C:/tmp/qa-s1s2.json', JSON.stringify(OUT, null, 2));
console.log(JSON.stringify({ landing: { ...OUT.landing, resources: OUT.landing.resources.map((r) => `${r.start}ms +${r.dur}ms ${r.type} ${r.name.split('/').pop()} ${(r.transfer/1024).toFixed(1)}kB`) }, dashboard: { ...OUT.dashboard, resourceTimeline: OUT.dashboard.resourceTimeline } }, null, 2));
