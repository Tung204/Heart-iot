// Lane R (v7 W2) — đo giao diện + chụp ảnh cho 5 route.
// Chạy tay, KHÔNG chạy trong vitest/playwright test.
//   node reports/qa/scripts/v7-r-visual.mjs
// Yêu cầu: API riêng ở 127.0.0.1:3104 (PGlite .data/qa-v7-r, seed demo),
// web dev ở 127.0.0.1:4354 với VITE_API_BASE_URL trỏ API đó.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// playwright chỉ được cài trong workspace web (devDependency @playwright/test).
const requireFromWeb = createRequire(
  'C:/Users/nguye/orca/workspaces/DATN/v7-r/apps/web/package.json',
);
const { chromium } = requireFromWeb('@playwright/test');

const WEB = 'http://127.0.0.1:4354';
const API = 'http://127.0.0.1:3104/api/v1';
const OUT = 'reports/qa/evidence/v7-r';
const OWNER = { email: 'ba-an@demo.heart-iot.local', password: 'demo-heart-iot-2026' };
const CAREGIVER = { email: 'minh@demo.heart-iot.local', password: 'demo-heart-iot-2026' };
const SUBJECT_AN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const VIEWPORTS = [
  { name: '1280x900', width: 1280, height: 900, large: false },
  { name: '390x844', width: 390, height: 844, large: false },
  { name: '360x740', width: 360, height: 740, large: false },
  { name: '390x844-large', width: 390, height: 844, large: true },
];

const ROUTES = [
  { name: 'subjects', path: '/app/subjects', nav: 'Người thân' },
  { name: 'share', path: `/app/subjects/${SUBJECT_AN}/share`, nav: 'Người thân' },
  { name: 'devices', path: '/app/devices', nav: 'Người thân' },
  { name: 'tasks', path: '/app/tasks', nav: null },
  { name: 'settings', path: '/app/settings', nav: null },
];

mkdirSync(OUT, { recursive: true });
const results = [];
const browser = await chromium.launch();

async function login(context, account) {
  const response = await context.request.post(`${API}/auth/login`, {
    data: account,
    headers: { Origin: WEB },
  });
  if (!response.ok()) throw new Error(`Login ${account.email} lỗi ${response.status()}: ${await response.text()}`);
}

function measure() {
  const isVisible = (element) => {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const describe = (element) => {
    const label =
      element.getAttribute('aria-label') ||
      (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48) ||
      element.tagName;
    return `${element.tagName.toLowerCase()}[${label}]`;
  };
  const targets = [...document.querySelectorAll('a[href], button, select, summary, [role="menuitem"]')]
    .filter((element) => isVisible(element) && !element.closest('[aria-hidden="true"]'))
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        target: describe(element),
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
      };
    });
  const small = targets.filter((item) => item.width < 44 || item.height < 44);
  // Đếm dòng ngữ cảnh đúng 1 lần: `.page-header__context` bọc `.subject-context`,
  // nên chỉ đếm node ngoài cùng của mỗi dòng.
  const contextLines = [
    ...document.querySelectorAll('.page-header__context, .subject-context'),
  ].filter(
    (element) =>
      isVisible(element) &&
      // `.page-header__context` bọc `.subject-context` → chỉ đếm node ngoài cùng.
      !(element.classList.contains('subject-context') && element.closest('.page-header__context')),
  );
  const h1 = [...document.querySelectorAll('h1')].map((element) => element.textContent.trim());
  const nav = [...document.querySelectorAll('.shell__nav a, .shell__bottomnav a')].filter(isVisible);
  const active = nav.filter((element) => element.getAttribute('aria-current') === 'page');
  return {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    h1Count: h1.length,
    h1: h1[0] ?? null,
    contextCount: contextLines.length,
    contextText: contextLines.map((element) => element.textContent.trim())[0] ?? null,
    targetCount: targets.length,
    smallTargets: small,
    activeNav: active.map((element) => element.textContent.trim()),
    largeText: document.documentElement.getAttribute('data-text-size'),
    forbiddenCopy: /bản demo|đồ án|giảng viên|nghiệm thu/i.test(document.body.innerText),
  };
}

try {
  for (const condition of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: condition.width, height: condition.height },
      deviceScaleFactor: 1,
    });
    if (condition.large) {
      await context.addInitScript(() => window.localStorage.setItem('an:text-size', 'large'));
    }
    await context.addInitScript((subjectId) => {
      window.localStorage.setItem('an:active-subject-id', subjectId);
    }, SUBJECT_AN);
    await login(context, OWNER);
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(String(error)));

    for (const route of ROUTES) {
      await page.goto(`${WEB}${route.path}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      await page.waitForTimeout(500);
      const file = join(OUT, `${route.name}-${condition.name}.png`);
      await page.screenshot({ path: file });
      const metrics = await page.evaluate(measure);
      results.push({
        route: route.name,
        path: route.path,
        viewport: condition.name,
        dpr: 1,
        largeText: condition.large,
        screenshot: file,
        expectedNav: route.nav,
        consoleErrors,
        ...metrics,
      });
      console.log(
        `${route.name} ${condition.name}: overflow=${metrics.scrollWidth - metrics.clientWidth} h1=${metrics.h1Count} ctx=${metrics.contextCount} small=${metrics.smallTargets.length} nav=${metrics.activeNav.join('|')}`,
      );
    }
    await context.close();
  }

  // Trạng thái mở form/xác nhận ở 390×844 (chỉ chụp, không lặp 4 viewport).
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await context.addInitScript((subjectId) => {
    window.localStorage.setItem('an:active-subject-id', subjectId);
  }, SUBJECT_AN);
  await login(context, OWNER);
  const page = await context.newPage();

  async function shot(name, prepare) {
    await prepare();
    await page.waitForTimeout(400);
    const file = join(OUT, `${name}-390x844.png`);
    await page.screenshot({ path: file });
    console.log(`state ${name}`);
    return file;
  }

  const states = [];

  states.push(
    await shot('subjects-create-form', async () => {
      await page.goto(`${WEB}/app/subjects`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Thêm người' }).click();
      await page.getByLabel(/^Tên người được theo dõi/).waitFor();
    }),
  );

  states.push(
    await shot('subjects-archive-confirm', async () => {
      await page.goto(`${WEB}/app/subjects`, { waitUntil: 'domcontentloaded' });
      await page.getByText('Quản lý hồ sơ').first().click();
      await page.getByRole('button', { name: 'Lưu trữ hồ sơ' }).first().click();
      await page.getByRole('heading', { name: /Lưu trữ hồ sơ/ }).waitFor();
    }),
  );

  states.push(
    await shot('devices-release-confirm', async () => {
      await page.goto(`${WEB}/app/devices`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /Tháo gắn/ }).first().click();
      await page.getByRole('group', { name: /Xác nhận tháo gắn/ }).waitFor();
    }),
  );

  states.push(
    await shot('tasks-close-form', async () => {
      await page.goto(`${WEB}/app/tasks`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Đóng công việc' }).first().click();
      await page.getByLabel(/Lý do đóng/).waitFor();
    }),
  );

  states.push(
    await shot('tasks-create-form', async () => {
      await page.goto(`${WEB}/app/tasks`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Tạo việc' }).click();
      await page.getByLabel(/^Tiêu đề/).waitFor();
    }),
  );

  states.push(
    await shot('settings-revoke-confirm', async () => {
      await page.goto(`${WEB}/app/settings`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /Thu hồi phiên đăng nhập lúc/ }).first().click();
      await page.getByRole('group', { name: 'Xác nhận thu hồi phiên' }).waitFor();
    }),
  );

  states.push(
    await shot('share-invite-form', async () => {
      await page.goto(`${WEB}/app/subjects/${SUBJECT_AN}/share`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Mời người thân' }).click();
      await page.getByLabel(/Email người được mời/).waitFor();
    }),
  );

  states.push(
    await shot('share-revoke-confirm', async () => {
      await page.getByRole('button', { name: /Thu hồi quyền của/ }).first().click();
      await page.getByRole('group', { name: /Xác nhận thu hồi quyền/ }).waitFor();
    }),
  );

  // Escape phải huỷ được xác nhận ở cả 5 route.
  const escapeChecks = [];
  async function escapeCheck(name, path, open, isClosed) {
    await page.goto(`${WEB}${path}`, { waitUntil: 'domcontentloaded' });
    await open();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const closed = await isClosed();
    escapeChecks.push({ name, path, closedByEscape: closed });
    console.log(`escape ${name}: closed=${closed}`);
  }

  await escapeCheck(
    'subjects-archive',
    '/app/subjects',
    async () => {
      await page.getByText('Quản lý hồ sơ').first().click();
      await page.getByRole('button', { name: 'Lưu trữ hồ sơ' }).first().click();
      await page.getByRole('heading', { name: /Lưu trữ hồ sơ/ }).waitFor();
    },
    () => page.getByRole('heading', { name: /Lưu trữ hồ sơ/ }).count().then((n) => n === 0),
  );
  await escapeCheck(
    'devices-release',
    '/app/devices',
    async () => {
      await page.getByRole('button', { name: /Tháo gắn/ }).first().click();
      await page.getByRole('group', { name: /Xác nhận tháo gắn/ }).waitFor();
    },
    () => page.getByRole('group', { name: /Xác nhận tháo gắn/ }).count().then((n) => n === 0),
  );
  await escapeCheck(
    'tasks-close',
    '/app/tasks',
    async () => {
      await page.getByRole('button', { name: 'Đóng công việc' }).first().click();
      await page.getByLabel(/Lý do đóng/).waitFor();
    },
    () => page.getByLabel(/Lý do đóng/).count().then((n) => n === 0),
  );
  await escapeCheck(
    'settings-revoke',
    '/app/settings',
    async () => {
      await page.getByRole('button', { name: /Thu hồi phiên đăng nhập lúc/ }).first().click();
      await page.getByRole('group', { name: 'Xác nhận thu hồi phiên' }).waitFor();
    },
    () =>
      page.getByRole('group', { name: 'Xác nhận thu hồi phiên' }).count().then((n) => n === 0),
  );
  await escapeCheck(
    'share-revoke',
    `/app/subjects/${SUBJECT_AN}/share`,
    async () => {
      await page.getByRole('button', { name: /Thu hồi quyền của/ }).first().click();
      await page.getByRole('group', { name: /Xác nhận thu hồi quyền/ }).waitFor();
    },
    () =>
      page.getByRole('group', { name: /Xác nhận thu hồi quyền/ }).count().then((n) => n === 0),
  );

  // Share: người thân không được gọi API owner-only.
  const caregiverContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await login(caregiverContext, CAREGIVER);
  const caregiverPage = await caregiverContext.newPage();
  const requests = [];
  caregiverPage.on('request', (request) => {
    if (request.url().includes('/api/') || request.url().includes(':3104')) {
      requests.push(`${request.method()} ${request.url()}`);
    }
  });
  await caregiverPage.goto(`${WEB}/app/subjects/${SUBJECT_AN}/share`, { waitUntil: 'domcontentloaded' });
  await caregiverPage.getByRole('heading', { level: 1 }).first().waitFor();
  await caregiverPage.waitForTimeout(1200);
  const caregiverScreenshot = join(OUT, 'share-non-owner-390x844.png');
  await caregiverPage.screenshot({ path: caregiverScreenshot });
  const caregiverText = await caregiverPage.locator('h3, .empty-state__title').allTextContents();
  const ownerOnlyRequests = requests.filter(
    (entry) => entry.includes('/invitations') || entry.includes('/care-links'),
  );
  await caregiverContext.close();

  writeFileSync(
    join(OUT, 'metrics.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        web: WEB,
        api: API,
        account: OWNER.email,
        metrics: results,
        states,
        escapeChecks,
        nonOwnerShare: {
          screenshot: caregiverScreenshot,
          requests,
          ownerOnlyRequests,
          headings: caregiverText,
        },
      },
      null,
      2,
    ),
  );
  console.log('escapes', JSON.stringify(escapeChecks));
  console.log('non-owner owner-only requests', ownerOnlyRequests.length, 'of', requests.length);
  await context.close();
} finally {
  await browser.close();
}
