// Đo giao diện v7 W2 — lane A (quản trị + Studio).
// Chạy: node reports/qa/evidence/v7-a/measure.mjs
// Yêu cầu: web dev http://127.0.0.1:4355 (VITE_API_BASE_URL trỏ API lane A),
// API lane A với PGlite cục bộ trong worktree, WEB_ORIGIN=http://127.0.0.1:4355.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire('file:///C:/Users/nguye/orca/workspaces/DATN/v7-a/apps/web/package.json');
const { chromium } = require('@playwright/test');

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://127.0.0.1:4355';
const API = 'http://127.0.0.1:3400/api/v1';
const PUBLISHED_VIEW_ID = process.env.V7A_PUBLISHED_ID ?? '4ec05596-6bd4-4bb4-ac67-164ab019cc93';

const VIEWPORTS = [
  { name: '1280x900', width: 1280, height: 900, large: false },
  { name: '390x844', width: 390, height: 844, large: false },
  { name: '360x740', width: 360, height: 740, large: false },
  { name: '390x844-large', width: 390, height: 844, large: true },
];

const ADMIN_ROUTES = [
  { slug: 'admin-overview', url: '/app/admin?tab=overview', ready: 'text=Tổng quan' },
  { slug: 'admin-users', url: '/app/admin?tab=users', ready: '[role="tabpanel"] table, [role="tabpanel"] .empty-state' },
  { slug: 'admin-devices', url: '/app/admin?tab=devices', ready: '#admin-devices-heading' },
  { slug: 'admin-policy', url: '/app/admin?tab=advanced&view=policy', ready: '#policy-heartbeatIntervalSeconds' },
  { slug: 'admin-audit', url: '/app/admin?tab=advanced&view=audit', ready: '[role="tabpanel"] table' },
];

const STUDIO_ROUTES = [
  { slug: 'studio-list', url: '/app/studio', ready: 'text=View đã tạo' },
  { slug: 'studio-detail', url: `/app/studio/${PUBLISHED_VIEW_ID}`, ready: '#studio-layout' },
  { slug: 'studio-data', url: `/app/studio/${PUBLISHED_VIEW_ID}/data`, ready: '#data-publication-title' },
];

async function login(context, email, password) {
  const res = await context.request.post(`${API}/auth/login`, {
    data: { email, password },
    headers: { Origin: BASE, 'Content-Type': 'application/json' },
  });
  if (!res.ok()) throw new Error(`login ${email} -> ${res.status()} ${await res.text()}`);
}

async function measure(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const body = document.body;
    const h1 = [...document.querySelectorAll('h1')].map((el) => ({
      text: (el.textContent ?? '').trim(),
      fontSize: getComputedStyle(el).fontSize,
    }));
    const tabs = [...document.querySelectorAll('[role="tab"]')].map((el) => ({
      text: (el.textContent ?? '').trim(),
      selected: el.getAttribute('aria-selected'),
    }));
    const current = [...document.querySelectorAll('[aria-current]')].map((el) => ({
      tag: el.tagName.toLowerCase(),
      current: el.getAttribute('aria-current'),
      text: (el.textContent ?? '').trim().slice(0, 60),
    }));
    const selectors = ['a[href]', 'button', 'select', 'summary', '[role="menuitem"]', '[role="tab"]'];
    const seen = new Set();
    const targets = [];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (seen.has(el)) continue;
        seen.add(el);
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (rect.width === 0 && rect.height === 0) continue;
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        targets.push({
          sel,
          text: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 60),
          w: Math.round(rect.width * 10) / 10,
          h: Math.round(rect.height * 10) / 10,
        });
      }
    }
    const small = targets.filter((item) => item.w < 44 || item.h < 44);
    const tables = [...document.querySelectorAll('table')].map((table) => {
      const wrap = table.closest('[class*="table-wrap"]') ?? table.parentElement;
      const r = table.getBoundingClientRect();
      return {
        caption: (table.querySelector('caption')?.textContent ?? '').trim(),
        tableWidth: Math.round(r.width),
        wrapClientWidth: wrap ? wrap.clientWidth : null,
        wrapScrollWidth: wrap ? wrap.scrollWidth : null,
        overflowsWrap: wrap ? wrap.scrollWidth - wrap.clientWidth > 1 : null,
      };
    });
    const text = body.innerText ?? '';
    return {
      url: location.pathname + location.search,
      overflowX: de.scrollWidth - de.clientWidth,
      bodyOverflowX: body.scrollWidth - body.clientWidth,
      h1Count: h1.length,
      h1,
      tabs,
      current,
      smallTargets: small,
      targetCount: targets.length,
      tables,
      dataThatCount: (text.match(/Dữ liệu thật/g) ?? []).length,
      dataProfileCount: (text.match(/Dữ liệu hồ sơ/g) ?? []).length,
      syntheticCount: (text.match(/Dữ liệu mô phỏng/g) ?? []).length,
      sampleCount: (text.match(/Dữ liệu mẫu/g) ?? []).length,
      contextLines: document.querySelectorAll('.subject-context').length,
      studioLinksInNav: [...document.querySelectorAll('nav a[href*="/studio"]')].length,
    };
  });
}

async function run() {
  await mkdir(HERE, { recursive: true });
  const browser = await chromium.launch();
  const results = [];

  const roles = [
    { role: 'admin', email: 'admin@demo.heart-iot.local', password: 'demo-admin-2026', routes: ADMIN_ROUTES },
    { role: 'owner', email: 'ba-an@demo.heart-iot.local', password: 'demo-heart-iot-2026', routes: STUDIO_ROUTES },
  ];

  for (const role of roles) {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        baseURL: BASE,
      });
      if (viewport.large) {
        await context.addInitScript(() => window.localStorage.setItem('an:text-size', 'large'));
      }
      await login(context, role.email, role.password);
      const page = await context.newPage();
      // requestfailed gồm cả ERR_ABORTED khi điều hướng/reload — tách khỏi lỗi thật.
      const failedRequests = [];
      const abortedRequests = [];
      page.on('requestfailed', (request) => {
        const error = request.failure()?.errorText ?? '';
        (error === 'net::ERR_ABORTED' ? abortedRequests : failedRequests).push(
          error ? `${request.url()} (${error})` : request.url(),
        );
      });

      for (const route of role.routes) {
        await page.goto(BASE + route.url, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector(route.ready, { timeout: 20_000 });
        await page.waitForTimeout(600);
        const metrics = await measure(page);
        const shot = join(HERE, `${route.slug}-${viewport.name}.png`);
        await page.screenshot({ path: shot, fullPage: false });
        // Reload: URL + tab đang chọn phải giữ nguyên (yêu cầu URL canonical).
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector(route.ready, { timeout: 20_000 });
        await page.waitForTimeout(400);
        const afterReload = await measure(page);
        const activeTab =
          afterReload.tabs.find((tab) => tab.selected === 'true')?.text ?? null;
        results.push({
          role: role.role,
          route: route.slug,
          viewport: viewport.name,
          width: viewport.width,
          height: viewport.height,
          largeText: viewport.large,
          ...metrics,
          afterReload: {
            url: afterReload.url,
            activeTab,
            urlKept: afterReload.url === metrics.url,
            tabKept:
              (metrics.tabs.find((tab) => tab.selected === 'true')?.text ?? null) === activeTab,
          },
          failedRequests,
          abortedRequestCount: abortedRequests.length,
          screenshot: shot.replace(HERE, 'reports/qa/evidence/v7-a'),
        });
      }
      await context.close();
    }
  }

  // Hành vi bổ sung: non-admin không gọi API quản trị; Studio không nằm trong nav.
  const ownerContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    baseURL: BASE,
  });
  await login(ownerContext, 'ba-an@demo.heart-iot.local', 'demo-heart-iot-2026');
  const ownerPage = await ownerContext.newPage();
  const adminApiCalls = [];
  ownerPage.on('request', (request) => {
    // Chỉ request API; URL module của dev server cũng chứa "/admin/".
    if (request.url().includes('/api/v1/admin/')) adminApiCalls.push(request.url());
  });
  await ownerPage.goto(BASE + '/app/admin', { waitUntil: 'domcontentloaded' });
  await ownerPage.waitForSelector('text=Không có quyền truy cập', { timeout: 20_000 });
  await ownerPage.waitForTimeout(800);
  const guard = {
    kind: 'non-admin-admin-api',
    adminApiCalls: adminApiCalls.length,
    noticeVisible: await ownerPage.getByText('Không có quyền truy cập').isVisible(),
  };
  await ownerPage.goto(BASE + '/app/studio', { waitUntil: 'domcontentloaded' });
  await ownerPage.waitForSelector('text=View đã tạo', { timeout: 20_000 });
  await ownerPage.waitForTimeout(500);
  const nav = await ownerPage.evaluate(() => {
    const items = [...document.querySelectorAll('.shell__nav a, .shell__bottom-nav a, nav a')]
      .filter((el) => el.closest('.shell__rail, .shell__topbar, .shell__bottom-nav, header, nav'))
      .map((el) => ({
        text: (el.textContent ?? '').trim(),
        href: el.getAttribute('href'),
      }));
    return {
      primaryItems: items.filter((item) => ['/app', '/app/alerts', '/app/overview', '/app/subjects'].includes(item.href ?? '')),
      studioLinks: items.filter((item) => (item.href ?? '').includes('/studio')),
    };
  });
  await ownerContext.close();
  await browser.close();

  const output = {
    generatedAt: new Date().toISOString(),
    web: BASE,
    api: API,
    deviceScaleFactor: 1,
    publishedViewId: PUBLISHED_VIEW_ID,
    viewports: VIEWPORTS,
    guard,
    nav,
    results,
  };
  await writeFile(join(HERE, 'metrics.json'), JSON.stringify(output, null, 2), 'utf8');
  const summary = results.map((r) => ({
    route: `${r.route}@${r.viewport}`,
    overflowX: r.overflowX,
    h1: r.h1Count,
    small: r.smallTargets.length,
    tab: r.tabs.find((t) => t.selected === 'true')?.text ?? null,
    reloadKept: `${r.afterReload.urlKept}/${r.afterReload.tabKept}`,
    dataThat: r.dataThatCount,
  }));
  console.log(JSON.stringify({ guard, nav, summary }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
