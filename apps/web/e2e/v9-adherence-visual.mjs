// Kiểm trực quan V9.1 — chạy thủ công, không thuộc Playwright test suite.
// Yêu cầu: API 3019 (DB .data/v9web đã seed) + Vite 4366 với
// VITE_API_BASE_URL=http://localhost:3019/api/v1.
// Chạy từ apps/web: node e2e/v9-adherence-visual.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://localhost:4366';
const API = 'http://localhost:3019/api/v1';
const OUT = 'C:/MyFolder/Hoc_Tap/project/DATN/reports/qa/evidence/v9-adherence';
const SUBJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER = { email: 'ba-an@demo.heart-iot.local', password: 'demo-heart-iot-2026' };
const CAREGIVER = { email: 'minh@demo.heart-iot.local', password: 'demo-heart-iot-2026' };

mkdirSync(OUT, { recursive: true });
const results = [];

function dayKey(offset) {
  const date = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function login(context, account) {
  const response = await context.request.post(`${API}/auth/login`, {
    data: account,
    headers: { Origin: BASE },
  });
  if (!response.ok()) {
    throw new Error(`Đăng nhập thất bại ${response.status()}: ${await response.text()}`);
  }
}

async function openCare(page) {
  await page.goto(`${BASE}/app/care`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1, name: 'Nhắc chăm sóc' }).waitFor();
  await page.getByRole('region', { name: 'Tổng hợp chăm sóc' }).waitFor();
  await page.getByText(/Đã làm \d+ · Bỏ qua \d+ · Chưa ghi nhận/).first().waitFor();
}

async function scrollAdherence(page) {
  await page.evaluate(() => {
    const section = document.querySelector('.care-adherence');
    if (!section) return;
    const top = section.getBoundingClientRect().top + window.scrollY - 76;
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  });
}

async function metrics(page, label) {
  return page.evaluate((name) => {
    const section = document.querySelector('.care-adherence');
    const nav = document.querySelector('.shell__bottomnav');
    const navVisible = nav && getComputedStyle(nav).display !== 'none';
    const targets = [...document.querySelectorAll('.care-adherence button')].map((button) => {
      const box = button.getBoundingClientRect();
      return { label: button.textContent?.trim(), height: Math.round(box.height) };
    });
    const sectionBox = section?.getBoundingClientRect();
    return {
      label: name,
      url: location.href,
      h1: document.querySelectorAll('h1').length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
      sectionVisible: Boolean(sectionBox && sectionBox.width > 0 && sectionBox.height > 0),
      sectionTop: sectionBox ? Math.round(sectionBox.top) : null,
      navTop: navVisible ? Math.round(nav.getBoundingClientRect().top) : null,
      targets,
      smallTargets: targets.filter((target) => target.height < 44),
    };
  }, label);
}

async function shot(page, name, label) {
  const file = join(OUT, `${name}.png`);
  // Chờ transition nền nút (120ms) kết thúc để ảnh không chụp giữa trạng thái.
  await page.waitForTimeout(220);
  await page.screenshot({ path: file, fullPage: false });
  const data = await metrics(page, label);
  results.push({ file, ...data });
  console.log(`${name}: overflow=${data.overflow} h1=${data.h1} small=${data.smallTargets.length}`);
}

const browser = await chromium.launch();
try {
  // Owner 1280 + 390 + 30 ngày + archived thật qua API.
  const ownerContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  await login(ownerContext, OWNER);

  // Tạo một lịch đã lưu trữ có lịch sử để thấy pill trên UI thật.
  const archivedTitle = 'Đo huyết áp buổi sáng';
  const created = await ownerContext.request.post(`${API}/subjects/${SUBJECT_ID}/reminders`, {
    data: {
      kind: 'measurement',
      title: archivedTitle,
      note: null,
      times: ['07:00'],
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      startsOn: dayKey(-2),
      endsOn: null,
      active: true,
    },
    headers: { Origin: BASE },
  });
  if (!created.ok()) throw new Error(`Tạo lịch lưu trữ lỗi ${created.status()}`);
  const reminder = await created.json();
  await ownerContext.request.post(
    `${API}/subjects/${SUBJECT_ID}/reminders/${reminder.id}/completions`,
    {
      data: { date: dayKey(-1), time: '07:00', status: 'done' },
      headers: { Origin: BASE },
    },
  );
  await ownerContext.request.delete(
    `${API}/subjects/${SUBJECT_ID}/reminders/${reminder.id}`,
    { headers: { Origin: BASE } },
  );

  const owner = await ownerContext.newPage();
  await openCare(owner);
  const adherence = owner.getByRole('region', { name: 'Tổng hợp chăm sóc' });
  await scrollAdherence(owner);
  await shot(owner, 'care-adherence-owner-1280', 'owner-1280');
  await owner.getByRole('button', { name: '30 ngày' }).click();
  await owner.getByRole('list', { name: 'Từng tuần trong 30 ngày' }).waitFor();
  await scrollAdherence(owner);
  await shot(owner, 'care-adherence-owner-30d-1280', 'owner-30d-1280');
  await ownerContext.close();

  const ownerMobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  await login(ownerMobileContext, OWNER);
  const ownerMobile = await ownerMobileContext.newPage();
  await openCare(ownerMobile);
  await scrollAdherence(ownerMobile);
  await shot(ownerMobile, 'care-adherence-owner-390', 'owner-390');
  await ownerMobile.getByRole('button', { name: '30 ngày' }).click();
  await ownerMobile.getByRole('list', { name: 'Từng tuần trong 30 ngày' }).waitFor();
  await scrollAdherence(ownerMobile);
  await shot(ownerMobile, 'care-adherence-owner-30d-390', 'owner-30d-390');
  await ownerMobileContext.close();

  // Caregiver 1280/390.
  for (const viewport of [
    { width: 1280, height: 900, name: '1280' },
    { width: 390, height: 844, name: '390' },
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    await login(context, CAREGIVER);
    const page = await context.newPage();
    await openCare(page);
    await scrollAdherence(page);
    await shot(page, `care-adherence-caregiver-${viewport.name}`, `caregiver-${viewport.name}`);
    await context.close();
  }

  // Empty: tài khoản mới + hồ sơ chưa có lịch.
  const emptyContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  const email = `qa-v9-empty-${Date.now()}@example.test`;
  const registered = await emptyContext.request.post(`${API}/auth/register`, {
    data: { email, password: 'qa-v9-empty-2026', displayName: 'QA V9 trống' },
    headers: { Origin: BASE },
  });
  if (!registered.ok()) throw new Error(`Đăng ký empty lỗi ${registered.status()}`);
  await emptyContext.request.post(`${API}/subjects`, {
    data: { displayName: 'Hồ sơ chưa có lịch', timezone: 'Asia/Ho_Chi_Minh' },
    headers: { Origin: BASE },
  });
  const empty = await emptyContext.newPage();
  await empty.goto(`${BASE}/app/care`, { waitUntil: 'domcontentloaded' });
  await empty.getByRole('heading', { level: 1, name: 'Nhắc chăm sóc' }).waitFor();
  await empty.getByText('Chưa có lịch nhắc trong 7 ngày').waitFor();
  await scrollAdherence(empty);
  await shot(empty, 'care-adherence-empty-390', 'empty-390');
  await emptyContext.close();

  // 403: caregiver có quyền trang nhưng API tổng hợp trả 403 (mô phỏng thu hồi giữa phiên).
  const forbiddenContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  await login(forbiddenContext, CAREGIVER);
  const forbidden = await forbiddenContext.newPage();
  await forbidden.route('**/care/adherence*', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền xem số đo của hồ sơ này.',
        requestId: 'v9-visual-403',
      }),
    }),
  );
  await forbidden.goto(`${BASE}/app/care`, { waitUntil: 'domcontentloaded' });
  await forbidden.getByRole('heading', { level: 1, name: 'Nhắc chăm sóc' }).waitFor();
  await forbidden.getByText('Chủ hồ sơ không chia sẻ tổng hợp chăm sóc').waitFor();
  await scrollAdherence(forbidden);
  await shot(forbidden, 'care-adherence-forbidden-390', 'forbidden-390');
  await forbiddenContext.close();

  // Loading: giữ response tổng hợp 4 giây để chụp skeleton/aria-busy.
  const loadingContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  await login(loadingContext, OWNER);
  const loading = await loadingContext.newPage();
  await loading.route('**/care/adherence*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    await route.continue();
  });
  await loading.goto(`${BASE}/app/care`, { waitUntil: 'domcontentloaded' });
  await loading.getByRole('heading', { level: 1, name: 'Nhắc chăm sóc' }).waitFor();
  await loading.getByText('Đang tải tổng hợp chăm sóc…').waitFor();
  await scrollAdherence(loading);
  await shot(loading, 'care-adherence-loading-390', 'loading-390');
  await loadingContext.close();
} finally {
  await browser.close();
}

writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(results, null, 2), 'utf8');
const bad = results.filter((item) => item.overflow !== 0 || item.h1 !== 1 || item.smallTargets.length > 0);
console.log(`\nẢnh: ${results.length} · lỗi metric: ${bad.length}`);
if (bad.length > 0) console.log(JSON.stringify(bad, null, 2));
