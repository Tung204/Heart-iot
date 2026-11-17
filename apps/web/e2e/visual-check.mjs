// Kiểm trực quan thủ công (không chạy trong `vitest`/`playwright test`).
// Yêu cầu: API riêng ở cổng 3100 + preview bản build ở cổng 4210 (xem handoff).
// Chạy từ apps/web: node e2e/visual-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://localhost:4210';
const API = 'http://localhost:3100/api/v1';
const OUT = 'C:/tmp/ui-v3-assistant';
const ONLY = process.env.VISUAL_ONLY?.split(',').filter(Boolean) ?? null;

const CONDITIONS = [
  { name: '1280x900', width: 1280, height: 900, large: false },
  { name: '390x844', width: 390, height: 844, large: false },
  { name: '360x740', width: 360, height: 740, large: false },
  { name: '1280x900-large', width: 1280, height: 900, large: true },
  { name: '390x844-large', width: 390, height: 844, large: true },
  { name: '360x740-large', width: 360, height: 740, large: true },
];

const results = [];
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
try {
  for (const condition of CONDITIONS) {
    const context = await browser.newContext({
      viewport: { width: condition.width, height: condition.height },
      deviceScaleFactor: 1,
    });
    if (condition.large) {
      await context.addInitScript(() => window.localStorage.setItem('an:text-size', 'large'));
    }
    const page = await context.newPage();
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(String(error)));

    async function shot(name) {
      if (ONLY && !ONLY.includes(name)) return;
      const file = join(OUT, `${name}-${condition.name}.png`);
      await page.screenshot({ path: file });
      if (name === 'assistant' && process.env.VISUAL_FULL) {
        await page.screenshot({
          path: join(OUT, `assistant-full-${condition.name}.png`),
          fullPage: true,
        });
      }
      let composerCheck = null;
      if (name === 'assistant') {
        const send = await page.getByRole('button', { name: 'Gửi câu hỏi' }).boundingBox();
        const input = await page.getByLabel(/^Câu hỏi/).boundingBox();
        const navTop = await page.evaluate(() => {
          const nav = document.querySelector('.shell__bottomnav');
          if (!nav) return null;
          const style = window.getComputedStyle(nav);
          return style.display === 'none' ? null : nav.getBoundingClientRect().top;
        });
        composerCheck = {
          inputTop: input ? Math.round(input.y) : null,
          inputBottom: input ? Math.round(input.y + input.height) : null,
          sendTop: send ? Math.round(send.y) : null,
          sendBottom: send ? Math.round(send.y + send.height) : null,
          navTop: navTop === null ? null : Math.round(navTop),
          sendAboveNav:
            send !== null && (navTop === null || send.y + send.height <= navTop),
        };
      }
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        largeText: document.documentElement.getAttribute('data-text-size'),
        forbiddenCopy: /bản demo|đồ án|giảng viên|nghiệm thu|chưa được duyệt/i.test(
          document.body.innerText,
        ),
      }));
      results.push({
        screenshot: file,
        page: name,
        condition: condition.name,
        ...metrics,
        ...(composerCheck ? { composerCheck } : {}),
      });
      console.log(
        `${name} ${condition.name}: overflow=${
          metrics.scrollWidth - metrics.clientWidth
        }/${metrics.bodyScrollWidth - metrics.bodyClientWidth} large=${metrics.largeText} forbidden=${metrics.forbiddenCopy}${
          composerCheck
            ? ` send=${composerCheck.sendTop}-${composerCheck.sendBottom} nav=${composerCheck.navTop} visible=${composerCheck.sendAboveNav}`
            : ''
        }`,
      );
    }

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.waitForTimeout(400);
    await shot('landing');

    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1, name: 'Đăng nhập' }).waitFor();
    await page.waitForTimeout(300);
    await shot('login');

    const login = await context.request.post(`${API}/auth/login`, {
      data: { email: 'ba-an@demo.heart-iot.local', password: 'demo-heart-iot-2026' },
      headers: { Origin: BASE },
    });
    if (!login.ok()) {
      throw new Error(`Đăng nhập QA thất bại ${login.status()}: ${await login.text()}`);
    }

    await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1, name: 'Trợ lý' }).waitFor();
    await page.getByText('Tóm tắt theo mẫu').first().waitFor({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(900);
    await shot('assistant');

    await page.goto(`${BASE}/app/overview`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1, name: /Tổng quan/ }).waitFor();
    await page.waitForTimeout(1_200);
    await shot('overview');

    if (errors.length > 0) {
      results.push({ condition: condition.name, consoleErrors: errors });
      console.log(`console errors (${condition.name}):`, errors.slice(0, 5));
    }
    await context.close();
  }
} finally {
  await browser.close();
}

writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2), 'utf8');
const overflow = results.filter(
  (item) => item.screenshot && (item.scrollWidth !== item.clientWidth || item.bodyScrollWidth !== item.bodyClientWidth),
);
const forbidden = results.filter((item) => item.forbiddenCopy);
console.log(`\nẢnh: ${results.filter((item) => item.screenshot).length} · tràn ngang: ${overflow.length} · còn copy demo: ${forbidden.length}`);
if (overflow.length > 0) console.log(overflow);
if (forbidden.length > 0) console.log(forbidden);
