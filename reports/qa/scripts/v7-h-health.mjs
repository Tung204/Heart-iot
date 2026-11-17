// v7 W2 lane H — QA ảnh + số đo cho Sức khỏe (/app/overview) và Lịch sử (/app/history).
// Chạy: cd apps/web && node ../../reports/qa/scripts/v7-h-health.mjs
// Cần: web dev http://127.0.0.1:4353; API http://127.0.0.1:3353 với
// WEB_ORIGIN=http://127.0.0.1:4353, PGlite cục bộ trong worktree (seed demo).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Chạy từ apps/web để dùng @playwright/test của workspace web (không thêm dependency).
const { chromium } = await import(
  pathToFileURL(path.resolve('node_modules/@playwright/test/index.mjs')).href
);

const WEB = 'http://127.0.0.1:4353';
const OUT = path.resolve('../../reports/qa/evidence/v7-h');
const OWNER = { email: 'ba-an@demo.heart-iot.local', password: 'demo-heart-iot-2026' };

fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '1280x900', width: 1280, height: 900, large: false },
  { name: '390x844', width: 390, height: 844, large: false },
  { name: '360x740', width: 360, height: 740, large: false },
  { name: '1280x900-large', width: 1280, height: 900, large: true },
  { name: '390x844-large', width: 390, height: 844, large: true, dpr: 1 },
  { name: '360x740-large', width: 360, height: 740, large: true },
];

const STATES = [
  { key: 'overview', route: '/app/overview', fullPage: false },
  { key: 'history', route: '/app/history', fullPage: true },
  { key: 'history-30d', route: '/app/history?days=30', fullPage: true },
];

const results = [];

async function login(page) {
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Mật khẩu').fill(OWNER.password);
  await Promise.all([
    page.waitForURL(/\/app(\/|$|\?)/, { timeout: 20_000 }),
    page.getByRole('button', { name: 'Đăng nhập' }).click(),
  ]);
}

async function openState(page, state) {
  await page.goto(`${WEB}${state.route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main h1', { timeout: 20_000 });
  if (state.key === 'overview') {
    // Chờ vùng dữ liệu chính (hoặc thông báo quyền) thay vì chỉ chờ H1.
    await page.waitForSelector('.health-day, .health-region .alert', { timeout: 20_000 });
  } else {
    await page.waitForSelector('.history-table, .history-cards, .empty-state', {
      timeout: 20_000,
    });
  }
  // Chờ các request nền (status/alerts/insights) ổn định trong một nhịp ngắn.
  await page.waitForTimeout(1200);
}

async function collect(page, state, viewport) {
  return page.evaluate(
    ({ stateKey, vp }) => {
      const html = document.documentElement;
      const h1s = [...document.querySelectorAll('h1')].map((el) => {
        const r = el.getBoundingClientRect();
        return {
          text: (el.textContent ?? '').trim(),
          fontSize: getComputedStyle(el).fontSize,
          top: Math.round(r.top + window.scrollY),
          height: Math.round(r.height),
        };
      });
      const contexts = [...document.querySelectorAll('.subject-context')];

      const targetSelectors = 'a[href], button, select, summary, [role="menuitem"]';
      const smallTargets = [];
      const filterTargets = [];
      let targetCount = 0;
      for (const el of document.querySelectorAll(targetSelectors)) {
        if (!(el instanceof HTMLElement)) continue;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        targetCount += 1;
        const item = {
          text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 70),
          className: typeof el.className === 'string' ? el.className : '',
          w: +rect.width.toFixed(1),
          h: +rect.height.toFixed(1),
        };
        if (rect.height < 43.5 || rect.width < 43.5) smallTargets.push(item);
        if (el.closest('.history-range')) filterTargets.push(item);
      }

      const chartScroll = document.querySelector('.measure-chart__scroll');
      const chartSvg = document.querySelector('.measure-chart__svg');
      const chartTicks = [...document.querySelectorAll('.measure-chart__tick')].slice(0, 3);
      const chart = chartScroll && chartSvg
        ? {
            scrollClientWidth: chartScroll.clientWidth,
            scrollWidth: chartScroll.scrollWidth,
            svgWidth: +chartSvg.getBoundingClientRect().width.toFixed(1),
            tickHeights: chartTicks.map((t) => +t.getBoundingClientRect().height.toFixed(1)),
            tickFontSize: chartTicks[0] ? getComputedStyle(chartTicks[0]).fontSize : null,
          }
        : null;

      const healthDay = document.querySelector('.health-day');
      const healthDayRect = healthDay ? healthDay.getBoundingClientRect() : null;
      const firstValue = document.querySelector('.health-day__value');
      const firstValueRect = firstValue ? firstValue.getBoundingClientRect() : null;
      const firstMetric = healthDayRect
        ? {
            dlTop: Math.round(healthDayRect.top + window.scrollY),
            dlBottom: Math.round(healthDayRect.bottom + window.scrollY),
            valueText: firstValue ? (firstValue.textContent ?? '').trim() : null,
            valueTop: firstValueRect ? Math.round(firstValueRect.top) : null,
            valueBottom: firstValueRect ? Math.round(firstValueRect.bottom) : null,
            valueFullyInFirstViewport: firstValueRect
              ? firstValueRect.top >= 0 && firstValueRect.bottom <= window.innerHeight
              : false,
            dlFullyInFirstViewport:
              healthDayRect.top >= 0 && healthDayRect.bottom <= window.innerHeight,
          }
        : null;

      const pressed = [...document.querySelectorAll('.history-range__item')].map((el) => ({
        text: (el.textContent ?? '').trim(),
        pressed: el.getAttribute('aria-pressed'),
        disabled: el.hasAttribute('disabled'),
        w: +el.getBoundingClientRect().width.toFixed(1),
        h: +el.getBoundingClientRect().height.toFixed(1),
      }));

      const textOf = (selector) =>
        [...document.querySelectorAll(selector)].map((el) => (el.textContent ?? '').trim());
      const bodyText = document.body.innerText;

      return {
        state: stateKey,
        viewport: vp.name,
        dpr: window.devicePixelRatio,
        htmlFontSize: getComputedStyle(html).fontSize,
        textSizeAttr: html.getAttribute('data-text-size'),
        viewportInner: { width: window.innerWidth, height: window.innerHeight },
        docScrollWidth: html.scrollWidth,
        docClientWidth: html.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        overflowX: Math.max(0, html.scrollWidth - html.clientWidth),
        h1Count: h1s.length,
        h1s,
        contextLineCount: contexts.length,
        contextText: contexts.map((el) => (el.textContent ?? '').trim()),
        targetCount,
        smallTargets,
        filterTargets,
        filterAllAtLeast44: filterTargets.every((t) => t.w >= 43.5 && t.h >= 43.5),
        rangeButtons: pressed,
        chart,
        firstMetric,
        simulationLabel:
          textOf('p').includes('Dữ liệu hiển thị là dữ liệu mô phỏng.') ||
          bodyText.includes('Nguồn: dữ liệu mô phỏng'),
        hasSimulationNoteHistory: textOf('p').includes('Dữ liệu hiển thị là dữ liệu mô phỏng.'),
        hasSyntheticSourcePill: bodyText.includes('Nguồn: dữ liệu mô phỏng'),
        csvLink: (() => {
          const link = [...document.querySelectorAll('a')].find(
            (a) => (a.textContent ?? '').trim() === 'Tải CSV',
          );
          return link ? link.getAttribute('href') : null;
        })(),
        h2s: [...document.querySelectorAll('h2')].map((el) => (el.textContent ?? '').trim()),
      };
    },
    { stateKey: state.key, vp: viewport },
  );
}

async function csvCheck(context, csvHref, measurementParams) {
  if (!csvHref) return { ok: false, reason: 'không có link Tải CSV' };
  const absolute = new URL(csvHref, WEB);
  const csv = {
    from: absolute.searchParams.get('from'),
    to: absolute.searchParams.get('to'),
    href: absolute.toString(),
  };
  const sameRange =
    measurementParams &&
    csv.from === measurementParams.from &&
    csv.to === measurementParams.to;
  const response = await context.request.get(absolute.toString());
  const body = await response.text();
  return {
    ok: response.ok() && sameRange,
    status: response.status(),
    contentType: response.headers()['content-type'] ?? null,
    contentDisposition: response.headers()['content-disposition'] ?? null,
    bytes: body.length,
    headerLine: body.split('\n')[0]?.slice(0, 90) ?? '',
    csv,
    measurementParams,
    sameRange,
  };
}

const browser = await chromium.launch();
try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.dpr ?? 1,
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
    });
    if (viewport.large) {
      await context.addInitScript(() => {
        try {
          window.localStorage.setItem('an:text-size', 'large');
        } catch {
          /* bỏ qua */
        }
      });
    }
    const page = await context.newPage();
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(String(err)));

    await login(page);
    // 401 của `/me` trên trang login là kiểm tra phiên khách bình thường, không phải lỗi màn nghiệp vụ.
    errors.length = 0;
    let lastMeasurements = null;
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        if (url.pathname.endsWith('/measurements')) {
          lastMeasurements = {
            from: url.searchParams.get('from'),
            to: url.searchParams.get('to'),
          };
        }
      } catch {
        /* ignore */
      }
    });

    for (const state of STATES) {
      await openState(page, state);
      const measurement = await collect(page, state, viewport);
      measurement.consoleErrors = errors.splice(0);
      if (state.key.startsWith('history')) {
        measurement.csv = await csvCheck(context, measurement.csvLink, lastMeasurements);
      }
      const file = `${state.key}-${viewport.name}.png`;
      await page.screenshot({
        path: path.join(OUT, file),
        fullPage: state.fullPage,
      });
      measurement.screenshot = file;
      results.push(measurement);
    }

    await context.close();
  }
} finally {
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  web: WEB,
  api: 'http://127.0.0.1:3353/api/v1',
  account: OWNER.email,
  viewports: VIEWPORTS.map((v) => ({
    name: v.name,
    width: v.width,
    height: v.height,
    large: v.large,
    dpr: v.dpr ?? 1,
  })),
  results,
};
fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(report, null, 2));

const summary = results.map((r) => ({
  state: r.state,
  viewport: r.viewport,
  overflowX: r.overflowX,
  h1: r.h1Count,
  context: r.contextLineCount,
  small: r.smallTargets.length,
  filter44: r.filterAllAtLeast44,
  chart: r.chart
    ? `${Math.round(r.chart.svgWidth)}px/svg, tick ${r.chart.tickHeights.join('/')}px`
    : null,
  sim: r.state === 'overview' ? r.hasSyntheticSourcePill : r.hasSimulationNoteHistory,
  csv: r.csv ? `${r.csv.status} sameRange=${r.csv.sameRange} ${r.csv.bytes}B` : null,
  errors: r.consoleErrors.length,
}));
console.log(JSON.stringify(summary, null, 2));
