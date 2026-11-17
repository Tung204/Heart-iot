// v7-fix2 — bằng chứng cho 3 P3 quyền (P3-03 SSE, P3-04 /alerts ở overview, P3-05 copy kết nối).
// Chạy tay sau khi API 3014 (PGlite .data/fix2) + web 4362 đã lên:
//   node reports/qa/scripts/v7-fix2-evidence.mjs
// Script tạo 2 tài khoản caregiver riêng (measurement-only, receive-only) bằng API thật,
// đo request SSE /alerts thật trên Chromium và ghi ảnh + summary.json. Không sửa source.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const requireFromWeb = createRequire(
  'C:/Users/nguye/orca/workspaces/DATN/v7-fix2/apps/web/package.json',
);
const { chromium, request } = requireFromWeb('@playwright/test');

const WEB = 'http://127.0.0.1:4362';
const API = 'http://127.0.0.1:3014/api/v1';
const OUT = 'reports/qa/evidence/v7-fix2';
const SUBJECT_AN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER = { email: 'ba-an@demo.heart-iot.local', password: 'demo-heart-iot-2026' };
const PASSWORD = 'qa-fix2-2026';
const ACCOUNTS = [
  {
    key: 'measurement-only',
    email: 'fix2-measurement-only@demo.heart-iot.local',
    displayName: 'QA Fix2 đo',
    permissions: {
      historyDays: 30,
      canReceiveAlerts: false,
      canAcknowledge: false,
      canResolve: false,
      canViewAi: false,
      canViewMeasurements: true,
    },
  },
  {
    key: 'receive-only',
    email: 'fix2-receive-only@demo.heart-iot.local',
    displayName: 'QA Fix2 nhận cảnh báo',
    permissions: {
      historyDays: 30,
      canReceiveAlerts: true,
      canAcknowledge: true,
      canResolve: false,
      canViewAi: false,
      canViewMeasurements: false,
    },
  },
];
const VIEWPORTS = [
  { name: '1280x900', width: 1280, height: 900 },
  { name: '390x844', width: 390, height: 844 },
];

mkdirSync(OUT, { recursive: true });
const nowIso = () => new Date().toISOString();
const summary = { at: nowIso(), web: WEB, api: API, setup: {}, shots: [] };

function apiContext() {
  return request.newContext({ baseURL: `${API}/`, extraHTTPHeaders: { Origin: WEB } });
}

async function loginOrRegister(context, account) {
  const login = await context.post('auth/login', {
    data: { email: account.email, password: PASSWORD },
  });
  if (login.ok()) return { session: await login.json(), registeredNow: false };
  if (login.status() !== 401) {
    throw new Error(`Login ${account.email} lỗi ${login.status()}: ${await login.text()}`);
  }
  const register = await context.post('auth/register', {
    data: { email: account.email, password: PASSWORD, displayName: account.displayName },
  });
  if (!register.ok()) {
    throw new Error(`Register ${account.email} lỗi ${register.status()}: ${await register.text()}`);
  }
  return { session: await register.json(), registeredNow: true };
}

// --- 1. Tạo 2 care link với quyền cụ thể qua API thật (không sửa DB tay) -------------
for (const account of ACCOUNTS) {
  const owner = await apiContext();
  const ownerLogin = await owner.post('auth/login', { data: OWNER });
  if (!ownerLogin.ok()) throw new Error(`Owner login lỗi ${ownerLogin.status()}`);

  const invite = await owner.post(`subjects/${SUBJECT_AN}/invitations`, {
    data: { email: account.email, permissions: account.permissions, expiresInHours: 72 },
  });
  if (!invite.ok()) {
    throw new Error(`Tạo lời mời ${account.email} lỗi ${invite.status()}: ${await invite.text()}`);
  }
  const { token } = await invite.json();

  const context = await apiContext();
  const auth = await loginOrRegister(context, account);
  const accept = await context.post(`invitations/${token}/accept`);
  if (!accept.ok()) {
    throw new Error(`Nhận lời mời ${account.email} lỗi ${accept.status()}: ${await accept.text()}`);
  }
  const subjects = await context.get('subjects');
  const body = await subjects.json();
  const link = (body.items ?? []).find((item) => item.id === SUBJECT_AN) ?? null;
  if (!link) throw new Error(`${account.email} không thấy hồ sơ Bà An sau khi nhận lời mời`);
  summary.setup[account.key] = {
    email: account.email,
    registeredNow: auth.registeredNow,
    role: link.role,
    permissions: link.permissions,
    sharedFrom: link.sharedFrom,
  };
  await context.dispose();
  await owner.dispose();
}

// --- 2. Đo trên Chromium: request thật + nội dung hiển thị ---------------------------
async function measure(page) {
  return page.evaluate(() => {
    const bodyText = document.body.innerText;
    const alerts = document.querySelector('.health-alerts');
    const alertsText = alerts ? alerts.innerText : '';
    const deviceItems = Array.from(document.querySelectorAll('.health-device')).map((item) => ({
      text: item.innerText,
      pills: Array.from(item.querySelectorAll('.pill, [class*="pill"]')).map((pill) => pill.innerText),
    }));
    return {
      bodyText,
      hasRealtimeLostBanner: /Mất cập nhật trực tiếp/.test(bodyText),
      hasAlertsPermissionCopy: /Chủ hồ sơ không chia sẻ cảnh báo với bạn/.test(bodyText),
      alertsText,
      alertRetryButtons: alerts
        ? Array.from(alerts.querySelectorAll('button')).filter((button) =>
            /Thử lại/.test(button.innerText),
          ).length
        : 0,
      alertLinks: alerts
        ? Array.from(alerts.querySelectorAll('a')).map((link) => link.getAttribute('href'))
        : [],
      alertRegionError: /Không tải được cảnh báo đang mở/.test(alertsText),
      navBadge: document.querySelector('.shell__nav-badge')?.textContent ?? null,
      deviceItems,
    };
  });
}

const browser = await chromium.launch();
try {
  for (const account of ACCOUNTS) {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        locale: 'vi-VN',
        timezoneId: 'Asia/Ho_Chi_Minh',
      });
      const login = await context.request.post(`${API}/auth/login`, {
        data: { email: account.email, password: PASSWORD },
        headers: { Origin: WEB },
      });
      if (!login.ok()) throw new Error(`Login trình duyệt ${account.email} lỗi ${login.status()}`);
      await context.addInitScript((subjectId) => {
        window.localStorage.setItem('an:active-subject-id', subjectId);
      }, SUBJECT_AN);

      const routes = [
        { key: 'today', path: '/app' },
        { key: 'overview', path: '/app/overview' },
      ];
      for (const route of routes) {
        const page = await context.newPage();
        const requests = [];
        const failed = [];
        page.on('request', (req) => {
          const url = req.url();
          if (!url.startsWith(API)) return;
          requests.push({
            method: req.method(),
            path: url.slice(API.length),
            resourceType: req.resourceType(),
          });
        });
        page.on('response', (response) => {
          const url = response.url();
          if (!url.startsWith(API)) return;
          const entry = requests.find(
            (item) => item.path === url.slice(API.length) && item.status === undefined,
          );
          if (entry) entry.status = response.status();
        });
        page.on('requestfailed', (req) => {
          if (req.url().startsWith(API)) {
            failed.push({ path: req.url().slice(API.length), error: req.failure()?.errorText ?? null });
          }
        });
        const consoleErrors = [];
        page.on('console', (message) => {
          if (message.type() === 'error') consoleErrors.push(message.text());
        });
        page.on('pageerror', (error) => consoleErrors.push(String(error)));

        await page.goto(`${WEB}${route.path}`, { waitUntil: 'domcontentloaded' });
        await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 20_000 });
        // Chờ query hồ sơ/trạng thái ổn định và SSE (nếu có) có cơ hội mở.
        await page.waitForTimeout(2_500);
        const measured = await measure(page);
        const name = `${route.key}-${vp.name}-${account.key}`;
        const shot = join(OUT, `${name}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        const eventRequests = requests.filter((item) => item.path.includes('/events'));
        const alertRequests = requests.filter((item) => /\/alerts(\?|$)/.test(item.path));
        summary.shots.push({
          account: account.key,
          viewport: vp.name,
          route: route.key,
          shot,
          eventRequests,
          alertRequests,
          requests,
          failed,
          consoleErrors,
          hasRealtimeLostBanner: measured.hasRealtimeLostBanner,
          hasAlertsPermissionCopy: measured.hasAlertsPermissionCopy,
          alertsText: measured.alertsText,
          alertRetryButtons: measured.alertRetryButtons,
          alertLinks: measured.alertLinks,
          alertRegionError: measured.alertRegionError,
          navBadge: measured.navBadge,
          deviceItems: measured.deviceItems,
        });
        await page.close();
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

writeFileSync(join(OUT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

// In bảng kiểm nhanh để người chạy đọc ngay.
for (const shot of summary.shots) {
  console.log(
    [
      shot.route.padEnd(8),
      shot.viewport.padEnd(8),
      shot.account.padEnd(16),
      `events=${shot.eventRequests.length}`,
      `alerts=${shot.alertRequests.length}`,
      `sseBanner=${shot.hasRealtimeLostBanner}`,
      `permCopy=${shot.hasAlertsPermissionCopy}`,
      `retry=${shot.alertRetryButtons}`,
      `alertLinks=${shot.alertLinks.length}`,
      `err=${shot.alertRegionError}`,
    ].join(' '),
  );
}
