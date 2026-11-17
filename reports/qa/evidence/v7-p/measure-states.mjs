/**
 * Các trạng thái bổ sung ngoài matrix 6 route × 5 viewport:
 * landing signed-in / session-error / pending, login field errors, register lỗi.
 * Chạy từ `apps/web` (nơi có @playwright/test):
 *   cp ../../reports/qa/evidence/v7-p/measure-states.mjs ./qa-states.mjs
 *   COOKIE_FILE=<cookie jar Netscape của owner> node qa-states.mjs
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.WEB_URL ?? 'http://127.0.0.1:4351';
const OUT = path.resolve('../../reports/qa/evidence/v7-p');
const cookieFile = process.env.COOKIE_FILE;
if (!cookieFile) throw new Error('Thiếu COOKIE_FILE (cookie jar Netscape có an_session của owner).');
const cookieLine = fs
  .readFileSync(cookieFile, 'utf8')
  .split('\n')
  .find((line) => line && line.includes('an_session') && !line.startsWith('# ') && !line.startsWith('# Netscape'));
const cookieValue = cookieLine.split('\t').at(-1).trim();

const browser = await chromium.launch();
const states = [];

async function baseContext(width, height, dpr, large = false) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
  });
  if (large) {
    await context.addInitScript(() => window.localStorage.setItem('an:text-size', 'large'));
  }
  return context;
}

async function measure(page) {
  return page.evaluate(() => {
    const rect = (el) => (el ? el.getBoundingClientRect().toJSON() : null);
    return {
      rootFontSize: getComputedStyle(document.documentElement).fontSize,
      h1: [...document.querySelectorAll('h1')].map((n) => n.textContent),
      h1Count: document.querySelectorAll('h1').length,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      sessionText: document.querySelector('.landing-session')?.textContent ?? null,
      heroLinks: [...document.querySelectorAll('.landing-hero__actions a')].map((a) => a.textContent),
      sessionLinks: [...document.querySelectorAll('.landing-session__actions a')].map((a) => a.textContent),
      sessionButtons: [...document.querySelectorAll('.landing-session__actions button')].map(
        (b) => b.textContent,
      ),
      activeElement: document.activeElement?.id || document.activeElement?.tagName,
      errors: [...document.querySelectorAll('.field__error')].map((e) => ({
        text: e.textContent,
        rect: rect(e),
      })),
      inputs: [...document.querySelectorAll('.field__input')].map((i) => ({
        id: i.id,
        rect: rect(i),
      })),
      submit: rect(document.querySelector('button[type=submit]')),
      asideVisible: (() => {
        const aside = document.querySelector('.auth-aside');
        if (!aside) return false;
        const style = getComputedStyle(aside);
        return style.display !== 'none' && aside.getBoundingClientRect().width > 0;
      })(),
    };
  });
}

// 1. Landing: đã đăng nhập (cookie phiên owner hợp lệ).
{
  const context = await baseContext(1280, 900, 1);
  await context.addCookies([
    { name: 'an_session', value: cookieValue, domain: '127.0.0.1', path: '/', httpOnly: true },
  ]);
  const page = await context.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('a[href="/app"]');
  await page.screenshot({ path: path.join(OUT, 'landing-1280x900-signed-in.png') });
  states.push({ name: 'landing', state: 'signed-in', viewport: '1280x900', dpr: 1, ...(await measure(page)) });
  await context.close();
}

// 2. Landing: lỗi máy chủ khi kiểm phiên (không phải khách).
{
  const context = await baseContext(390, 844, 2);
  const page = await context.newPage();
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'INTERNAL', message: 'Máy chủ đang gặp lỗi.', requestId: 'qa' }),
    }),
  );
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.landing-session');
  await page.screenshot({ path: path.join(OUT, 'landing-390x844-session-error.png') });
  states.push({ name: 'landing', state: 'session-error', viewport: '390x844', dpr: 2, ...(await measure(page)) });
  await context.close();
}

// 3. Landing: đang kiểm tra phiên (response chậm) — không nháy CTA khách.
{
  const context = await baseContext(390, 844, 2);
  const page = await context.newPage();
  await page.route('**/api/v1/me', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 30_000));
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'UNAUTHENTICATED', message: 'Chưa đăng nhập.', requestId: 'qa' }),
    });
  });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[role="status"][aria-busy="true"]');
  await page.screenshot({ path: path.join(OUT, 'landing-390x844-pending.png') });
  states.push({ name: 'landing', state: 'pending', viewport: '390x844', dpr: 2, ...(await measure(page)) });
  await context.close();
}

// 4. Login: lỗi field khi submit rỗng (lỗi cạnh field + focus field đầu).
{
  const context = await baseContext(390, 844, 2);
  const page = await context.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.waitForSelector('form');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForSelector('.field__error');
  await page.screenshot({ path: path.join(OUT, 'login-390x844-field-errors.png') });
  states.push({ name: 'login', state: 'field-errors', viewport: '390x844', dpr: 2, ...(await measure(page)) });
  await context.close();
}

// 5. Register: lỗi field ở 360×740 chữ lớn (không tràn ngang, focus field đầu).
{
  const context = await baseContext(360, 740, 2, true);
  const page = await context.newPage();
  await page.goto(BASE + '/register', { waitUntil: 'networkidle' });
  await page.waitForSelector('form');
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await page.waitForSelector('.field__error');
  await page.screenshot({ path: path.join(OUT, 'register-360x740-large-field-errors.png') });
  states.push({ name: 'register', state: 'field-errors', viewport: '360x740-large', dpr: 2, ...(await measure(page)) });
  await context.close();
}

fs.writeFileSync(
  path.join(OUT, 'states.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), web: BASE, results: states }, null, 2),
  'utf8',
);
console.log(JSON.stringify(states, null, 1));
await browser.close();
