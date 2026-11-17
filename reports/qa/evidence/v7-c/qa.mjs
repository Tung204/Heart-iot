/**
 * v7 W2 — lane C: ảnh + số đo cho cảnh báo, hộp thông báo, trợ lý.
 * Chạy: node reports/qa/evidence/v7-c/qa.mjs
 * Web dev: http://localhost:4352 (VITE_API_BASE_URL -> API :3012)
 * API: WEB_ORIGIN=http://localhost:4352, PGlite .data/qa-v7-c trong worktree v7-c.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKTREE = 'C:/Users/nguye/orca/workspaces/DATN/v7-c';
const require = createRequire(`${WORKTREE}/apps/web/package.json`);
const { chromium } = require('@playwright/test');

const OUT_DIR = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = OUT_DIR;
const BASE = 'http://localhost:4352';
const OWNER = { email: 'ba-an@demo.heart-iot.local', password: 'demo-heart-iot-2026' };

const VIEWPORTS = [
  { name: '1280x900', width: 1280, height: 900, large: false },
  { name: '390x844', width: 390, height: 844, large: false },
  { name: '360x740', width: 360, height: 740, large: false },
  { name: '390x844-large', width: 390, height: 844, large: true },
];

/** Route cần đo; selector đánh dấu vùng dữ liệu đã tải xong. */
const ROUTES = [
  { slug: 'alerts', path: '/app/alerts', ready: '.alerts-list, .empty-state' },
  { slug: 'alerts-inbox', path: '/app/alerts?view=notifications', ready: '.inbox__list, .empty-state' },
  { slug: 'today', path: '/app', ready: '.today-signal' },
  { slug: 'assistant', path: '/app/assistant', ready: '.today-signal' },
];

function slugify(value) {
  return value.replace(/^\//, '').replace(/[/?=&]/g, '-');
}

function round(value) {
  return Math.round(value * 10) / 10;
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Mật khẩu').fill(OWNER.password);
  await page.locator('form').getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL(`${BASE}/app`, { timeout: 20_000 });
  await page.locator('.today-signal').first().waitFor({ timeout: 20_000 });
}

async function measure(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const label = (el) =>
      (el.getAttribute('aria-label') || el.textContent || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 70);
    const targets = Array.from(
      document.querySelectorAll(
        'a[href], button, select, summary, [role="menuitem"], input[type="checkbox"], textarea',
      ),
    )
      .filter(visible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          text: label(el),
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        };
      });
    const headings = Array.from(document.querySelectorAll('h1'))
      .filter(visible)
      .map((el) => el.textContent.trim().replace(/\s+/g, ' '));
    const contextLines = Array.from(
      document.querySelectorAll('[aria-label="Người được theo dõi"]'),
    ).filter(visible).length;
    const tabs = Array.from(document.querySelectorAll('.alerts-tabs__link')).map((el) => ({
      text: el.textContent.trim().replace(/\s+/g, ' '),
      current: el.getAttribute('aria-current'),
    }));
    return {
      dpr: window.devicePixelRatio,
      rootFontSize: getComputedStyle(document.documentElement).fontSize,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      h1: headings,
      contextLines,
      tabs,
      smallTargets: targets.filter((t) => t.width < 44 || t.height < 44),
      targetCount: targets.length,
      targets,
    };
  });
}

async function openViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  });
  if (viewport.large) {
    await context.addInitScript(() => {
      window.localStorage.setItem('an:text-size', 'large');
    });
  }
  const page = await context.newPage();
  await login(page);
  return { context, page };
}

const metrics = [];
const behaviour = {};

const browser = await chromium.launch();
mkdirSync(SHOT_DIR, { recursive: true });

// 1) Tìm incident id thật từ danh sách cảnh báo của seed.
let incidentHref = null;
{
  const { context, page } = await openViewport(browser, VIEWPORTS[0]);
  await page.goto(`${BASE}/app/alerts`, { waitUntil: 'networkidle' });
  await page.locator('.alerts-list, .empty-state').first().waitFor();
  incidentHref = await page.locator('a[href^="/app/alerts/"]').first().getAttribute('href');
  await context.close();
}
if (!incidentHref) throw new Error('Không tìm thấy cảnh báo nào trong seed để đo chi tiết.');
behaviour.incidentHref = incidentHref;

const routes = [...ROUTES, { slug: 'alert-detail', path: incidentHref, ready: '.alert-detail' }];

// 2) Ảnh + số đo: 5 route × 4 viewport.
for (const viewport of VIEWPORTS) {
  const { context, page } = await openViewport(browser, viewport);
  for (const route of routes) {
    await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' });
    await page.locator(route.ready).first().waitFor({ timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    const result = await measure(page);
    const file = `${route.slug}-${viewport.name}.png`;
    await page.screenshot({ path: resolve(SHOT_DIR, file), fullPage: false });
    metrics.push({
      route: route.path,
      viewport: viewport.name,
      largeText: viewport.large,
      screenshot: file,
      ...result,
    });
  }
  await context.close();
}

// 3) Hành vi: tab active, URL giữ khi reload/back.
{
  const { context, page } = await openViewport(browser, VIEWPORTS[1]);
  await page.goto(`${BASE}/app/alerts`, { waitUntil: 'networkidle' });
  await page.locator('.alerts-list, .empty-state').first().waitFor();
  const before = await page.evaluate(() => ({
    url: location.pathname + location.search,
    current: Array.from(document.querySelectorAll('.alerts-tabs__link')).map((el) => ({
      text: el.textContent.trim().replace(/\s+/g, ' '),
      current: el.getAttribute('aria-current'),
    })),
  }));

  await page.getByRole('link', { name: /Thông báo đã nhận/ }).click();
  await page.waitForURL('**/app/alerts?view=notifications');
  await page.locator('.inbox').waitFor();
  const afterTab = await page.evaluate(() => ({
    url: location.pathname + location.search,
    current: Array.from(document.querySelectorAll('.alerts-tabs__link')).map((el) => ({
      text: el.textContent.trim().replace(/\s+/g, ' '),
      current: el.getAttribute('aria-current'),
    })),
  }));

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.inbox').waitFor();
  const afterReload = await page.evaluate(() => ({
    url: location.pathname + location.search,
    h1: document.querySelector('h1')?.textContent?.trim() ?? null,
    h2: document.querySelector('.inbox__title')?.textContent?.trim() ?? null,
  }));

  await page.goBack({ waitUntil: 'networkidle' });
  await page.locator('.alerts-list, .empty-state').first().waitFor();
  const afterBack = await page.evaluate(() => ({
    url: location.pathname + location.search,
    current: Array.from(document.querySelectorAll('.alerts-tabs__link')).map((el) => ({
      text: el.textContent.trim().replace(/\s+/g, ' '),
      current: el.getAttribute('aria-current'),
    })),
  }));

  behaviour.tabs = { before, afterTab, afterReload, afterBack };
  await context.close();
}

// 4) Hành vi: đánh dấu đã đọc đổi trạng thái rồi reload còn đúng.
{
  const { context, page } = await openViewport(browser, VIEWPORTS[0]);
  await page.goto(`${BASE}/app/alerts?view=notifications`, { waitUntil: 'networkidle' });
  await page.locator('.inbox').waitFor();

  const firstItem = page.locator('.inbox-item').first();
  const unreadBefore = await page.locator('.inbox-item--unread').count();
  const titleBefore = await firstItem.locator('.inbox-item__title').innerText();
  const summaryBefore = await page.locator('.inbox__summary').first().innerText();

  if (unreadBefore > 0) {
    await firstItem.getByRole('button', { name: /Đánh dấu đã đọc/ }).click();
    await firstItem.locator('.pill').filter({ hasText: 'Đã đọc' }).waitFor({ timeout: 10_000 });
    const titleAfterClick = await firstItem.locator('.inbox-item__title').innerText();
    const pillAfterClick = await firstItem.locator('.pill').innerText();
    await page.screenshot({
      path: resolve(SHOT_DIR, 'alerts-inbox-read-1280x900.png'),
      fullPage: false,
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.inbox').waitFor();
    const unreadAfterReload = await page.locator('.inbox-item--unread').count();
    const summaryAfterReload = await page.locator('.inbox__summary').first().innerText();
    const firstItemStateAfterReload = await page
      .locator('.inbox-item')
      .first()
      .locator('.pill')
      .first()
      .innerText()
      .catch(() => null);

    behaviour.markRead = {
      unreadBefore,
      titleBefore,
      summaryBefore,
      titleAfterClick,
      pillAfterClick,
      unreadAfterReload,
      summaryAfterReload,
      firstItemStateAfterReload,
      persisted: unreadAfterReload === unreadBefore - 1,
    };
  } else {
    behaviour.markRead = { unreadBefore: 0, note: 'Không có thông báo chưa đọc trong seed.' };
  }
  await context.close();
}

// 1b) Trạng thái tương tác: hỏi lại khi xác nhận, form đóng, câu trả lời trợ lý.
{
  const errors = [];
  const { context, page } = await openViewport(browser, VIEWPORTS[1]);
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('requestfailed', (req) => {
    // Bỏ qua request bị hủy do điều hướng client-side (không phải lỗi mạng).
    const reason = req.failure()?.errorText ?? '';
    if (reason.includes('ERR_ABORTED')) return;
    if (req.url().includes('/api/') && !req.url().includes('/events')) {
      errors.push(`requestfailed: ${req.url()} (${reason})`);
    }
  });
  page.on('response', (res) => {
    if (res.url().includes('/api/') && res.status() >= 500) {
      errors.push(`http ${res.status()}: ${res.url()}`);
    }
  });

  await page.goto(`${BASE}/app/alerts`, { waitUntil: 'networkidle' });
  await page.locator('.alerts-list').first().waitFor();
  await page.getByRole('button', { name: 'Tôi đang hỗ trợ' }).first().click();
  await page.getByText('Bạn đã liên hệ và đang hỗ trợ?').waitFor();
  await page.screenshot({
    path: resolve(SHOT_DIR, 'alerts-ack-confirm-390x844.png'),
    fullPage: false,
  });
  const confirmMetrics = await measure(page);
  metrics.push({
    route: '/app/alerts (mở hỏi lại xác nhận)',
    viewport: '390x844',
    largeText: false,
    screenshot: 'alerts-ack-confirm-390x844.png',
    ...confirmMetrics,
  });

  await page.goto(`${BASE}${behaviour.incidentHref}`, { waitUntil: 'networkidle' });
  await page.locator('.alert-detail').first().waitFor();
  const resolveToggle = page.getByRole('button', { name: 'Đóng cảnh báo' });
  if (await resolveToggle.count()) {
    await resolveToggle.click();
    await page.locator('#resolve-form').waitFor();
    await page.screenshot({
      path: resolve(SHOT_DIR, 'alert-detail-resolve-390x844.png'),
      fullPage: false,
    });
    const resolveMetrics = await measure(page);
    metrics.push({
      route: `${behaviour.incidentHref} (mở form đóng)`,
      viewport: '390x844',
      largeText: false,
      screenshot: 'alert-detail-resolve-390x844.png',
      ...resolveMetrics,
    });
    await page.getByRole('button', { name: 'Hủy' }).click();
  }

  await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  await page.locator('.today-signal').first().waitFor();
  await page.getByLabel(/^Câu hỏi/).fill('Nhịp tim tuần này thế nào?');
  await page.getByRole('button', { name: 'Gửi câu hỏi' }).click();
  const answerOrError = page.locator('.today-msg--assistant:not(.today-msg--pending), .alert');
  await answerOrError.first().waitFor({ timeout: 30_000 }).catch(() => null);
  await page.screenshot({
    path: resolve(SHOT_DIR, 'today-thread-390x844.png'),
    fullPage: false,
  });
  const threadMetrics = await measure(page);
  metrics.push({
    route: '/app (hỏi trợ lý, có câu trả lời)',
    viewport: '390x844',
    largeText: false,
    screenshot: 'today-thread-390x844.png',
    ...threadMetrics,
  });
  behaviour.ask = {
    answers: await page.locator('.today-msg--assistant:not(.today-msg--pending)').count(),
    alerts: await page.locator('.today-ask .alert').count(),
    errors,
  };

  await context.close();
}

// 4b) Probe ngoài ma trận bắt buộc: 360×740 + chữ lớn (dễ vỡ nhất).
{
  const viewport = { name: '360x740-large', width: 360, height: 740, large: true };
  const { context, page } = await openViewport(browser, viewport);
  for (const route of [
    { slug: 'today', path: '/app', ready: '.today-signal' },
    { slug: 'alerts', path: '/app/alerts', ready: '.alerts-list, .empty-state' },
  ]) {
    await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' });
    await page.locator(route.ready).first().waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    const result = await measure(page);
    const file = `${route.slug}-${viewport.name}.png`;
    await page.screenshot({ path: resolve(SHOT_DIR, file), fullPage: false });
    metrics.push({
      route: route.path,
      viewport: viewport.name,
      largeText: true,
      screenshot: file,
      ...result,
    });
  }
  await context.close();
}

// 5) Hành động chính trong viewport đầu (trên bottom-nav) khi scroll = 0.
behaviour.firstViewport = [];
for (const viewport of VIEWPORTS) {
  const { context, page } = await openViewport(browser, viewport);
  const checks = [
    {
      path: '/app',
      selectors: ['.today-signal__actions .button', '#assistant-question', '.today-ask__submit'],
    },
    {
      path: '/app/alerts',
      selectors: ['.alerts-row__actions .button', '.alerts-row__actions a'],
    },
  ];
  for (const check of checks) {
    await page.goto(`${BASE}${check.path}`, { waitUntil: 'networkidle' });
    await page.locator('.today-signal, .alerts-list').first().waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    const info = await page.evaluate((selectors) => {
      const nav = document.querySelector('.shell__bottomnav');
      const navRect = nav ? nav.getBoundingClientRect() : null;
      const navTop = navRect && navRect.height > 0 ? Math.round(navRect.top * 10) / 10 : null;
      const boxes = {};
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (!el) {
          boxes[selector] = null;
          continue;
        }
        const rect = el.getBoundingClientRect();
        boxes[selector] = {
          top: Math.round(rect.top * 10) / 10,
          bottom: Math.round(rect.bottom * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
          aboveNav: navTop === null ? true : rect.bottom <= navTop,
        };
      }
      return { navTop, boxes };
    }, check.selectors);
    behaviour.firstViewport.push({
      path: check.path,
      viewport: viewport.name,
      ...info,
    });
  }
  await context.close();
}

writeFileSync(resolve(SHOT_DIR, 'metrics.json'), JSON.stringify(metrics, null, 2), 'utf8');
writeFileSync(
  resolve(SHOT_DIR, 'behaviour.json'),
  JSON.stringify(behaviour, null, 2),
  'utf8',
);

await browser.close();
console.log(`Đã ghi ${metrics.length} ảnh + metrics.json vào ${SHOT_DIR}`);
console.log(JSON.stringify(behaviour, null, 2));
