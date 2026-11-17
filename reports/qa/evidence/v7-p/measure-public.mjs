/**
 * v7 W2 lane P — đo landing/auth/invite/404 trên Chromium.
 *
 * Chạy từ `apps/web` (nơi có @playwright/test):
 *   cp ../../reports/qa/evidence/v7-p/measure-public.mjs ./qa-measure-public.mjs
 *   INVITE_TOKEN=<token preview hợp lệ> node qa-measure-public.mjs
 *
 * Yêu cầu môi trường:
 * - web dev `http://127.0.0.1:4351`
 * - API dev `http://127.0.0.1:3010` với WEB_ORIGIN=http://127.0.0.1:4351 và PGlite cục bộ
 * - token thuộc lời mời pending do owner seed tạo trên DB cục bộ đó
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.WEB_URL ?? 'http://127.0.0.1:4351';
const TOKEN = process.env.INVITE_TOKEN;
if (!TOKEN) {
  throw new Error('Thiếu INVITE_TOKEN (token lời mời pending trên DB cục bộ).');
}
const OUT = path.resolve('../../reports/qa/evidence/v7-p');

const VIEWPORTS = [
  { name: '1280x900', width: 1280, height: 900, dpr: 1, large: false },
  { name: '390x844', width: 390, height: 844, dpr: 2, large: false },
  { name: '360x740', width: 360, height: 740, dpr: 2, large: false },
  { name: '390x844-large', width: 390, height: 844, dpr: 2, large: true },
  { name: '360x740-large', width: 360, height: 740, dpr: 2, large: true },
];

const ROUTES = [
  {
    name: 'landing',
    path: '/',
    state: 'guest',
    ready: '.landing-hero',
    cta: '.landing-hero__actions .button--primary',
  },
  { name: 'login', path: '/login', state: 'guest', ready: 'form', cta: 'button[type=submit]' },
  {
    name: 'register',
    path: '/register',
    state: 'guest',
    ready: 'form',
    cta: 'button[type=submit]',
  },
  {
    name: 'invite-valid',
    path: `/invite/${TOKEN}`,
    state: 'guest',
    ready: '.invite-facts',
    cta: '.invite-actions .button--primary',
  },
  {
    name: 'invite-invalid',
    path: '/invite/abc1234567',
    state: 'token-422',
    ready: '.auth-message',
    cta: '.invite-actions .button--primary',
  },
  {
    name: 'not-found',
    path: '/khong-ton-tai',
    state: '404',
    ready: '.not-found',
    cta: '.not-found .button',
  },
];

const results = [];
const browser = await chromium.launch();

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.dpr,
  });
  await context.addInitScript((large) => {
    if (large) window.localStorage.setItem('an:text-size', 'large');
    else window.localStorage.removeItem('an:text-size');
  }, viewport.large);

  for (const route of ROUTES) {
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const apiStatuses = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/api/v1/me') || url.includes('/api/v1/invitations/')) {
        const apiPath = url.includes('/api/v1') ? url.slice(url.indexOf('/api/v1')) : url;
        apiStatuses.push({ path: apiPath.replace(TOKEN, '<token>'), status: response.status() });
      }
    });

    await page.goto(BASE + route.path, { waitUntil: 'networkidle' });
    await page.waitForSelector(route.ready, { timeout: 15_000 });
    await page.waitForTimeout(250);

    const screenshotName = `${route.name}-${viewport.name}-${route.state}.png`;
    await page.screenshot({ path: path.join(OUT, screenshotName) });

    const measured = await page.evaluate(
      ({ ctaSelector }) => {
        const rectOf = (element) => {
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return {
            x: Math.round(rect.x * 10) / 10,
            y: Math.round(rect.y * 10) / 10,
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
            bottom: Math.round(rect.bottom * 10) / 10,
            right: Math.round(rect.right * 10) / 10,
          };
        };
        const visible = (element) => {
          const style = getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const targets = [];
        const selector = 'a[href], button, select, summary, [role="menuitem"]';
        for (const element of document.querySelectorAll(selector)) {
          if (!visible(element)) continue;
          const rect = element.getBoundingClientRect();
          targets.push({
            tag: element.tagName.toLowerCase(),
            text: (element.textContent ?? '').trim().slice(0, 80),
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
            disabled: element.hasAttribute('disabled'),
          });
        }
        const h1s = [...document.querySelectorAll('h1')].map((element) => ({
          text: element.textContent,
          fontSize: getComputedStyle(element).fontSize,
        }));
        const cta = document.querySelector(ctaSelector);
        const ctaRect = rectOf(cta);
        const aside = document.querySelector('.auth-aside');
        return {
          title: document.title,
          rootFontSize: getComputedStyle(document.documentElement).fontSize,
          h1: h1s,
          h1Count: h1s.length,
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          bodyOverflowX: document.body.scrollWidth - document.body.clientWidth,
          cta: cta
            ? {
                text: (cta.textContent ?? '').trim(),
                ...ctaRect,
                inFirstViewport: ctaRect !== null && ctaRect.bottom <= window.innerHeight,
              }
            : null,
          targets,
          smallTargets: targets.filter(
            (target) => !target.disabled && (target.width < 44 || target.height < 44),
          ),
          asideVisible: aside ? visible(aside) : false,
          skipLink: !!document.querySelector('.skip-link'),
          bodyText: document.body.innerText.slice(0, 1200),
        };
      },
      { ctaSelector: route.cta },
    );

    const record = {
      route: route.path.replace(TOKEN, '<token>'),
      name: route.name,
      state: route.state,
      viewport: viewport.name,
      viewportSize: `${viewport.width}x${viewport.height}`,
      dpr: viewport.dpr,
      largeText: viewport.large,
      screenshot: screenshotName,
      apiStatuses,
      consoleErrors: consoleErrors.filter(
        (message) =>
          !/status of (401|422)/.test(message) &&
          !message.includes('Failed to load resource'),
      ),
      allConsoleErrors: consoleErrors,
      pageErrors,
      ...measured,
    };
    results.push(record);
    console.log(
      `${viewport.name} ${route.name}: h1=${record.h1Count} overflow=${record.overflowX} cta=${
        record.cta ? `${record.cta.inFirstViewport ? 'in' : 'OUT'}:${record.cta.bottom}` : 'none'
      } smallTargets=${record.smallTargets.length}`,
    );
    await page.close();
  }
  await context.close();
}

const metrics = {
  generatedAt: new Date().toISOString(),
  web: BASE,
  api: process.env.API_URL ?? 'http://127.0.0.1:3010',
  playwright: '1.65.1',
  browser: 'chromium',
  note:
    'Token lời mời không ghi vào metrics; route được thay bằng <token>. 401 /me và 422 token ngắn là phản hồi mong đợi.',
  tokenLength: TOKEN.length,
  results,
};
fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2), 'utf8');

await browser.close();
