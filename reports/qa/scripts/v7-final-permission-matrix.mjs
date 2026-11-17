// v7 final QA — điều kiện 5: ma trận quyền caregiver receive-only / measurement-only
// trên /app, /app/overview, /app/alerts, /app/history ở 1280×900 và 390×844.
// Chạy tay: node reports/qa/scripts/v7-final-permission-matrix.mjs
// Cần: web 127.0.0.1:4361, API 127.0.0.1:3013 (PGlite .data/final) + setup.mjs đã tạo 2 tài khoản.
// 403/empty/error/offline/stale là response giả lập bằng page.route trên endpoint
// mà trang thực sự gọi; baseline dùng API thật. Không sửa source.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const requireFromWeb = createRequire(
  'C:/Users/nguye/orca/workspaces/DATN/v7-final-qa/apps/web/package.json',
);
const { chromium, request } = requireFromWeb('@playwright/test');

const WEB = 'http://127.0.0.1:4361';
const API = 'http://127.0.0.1:3013/api/v1';
const OUT = 'reports/qa/evidence/v7-final';
const SUBJECT_AN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PASSWORD = 'qa-permission-2026';
const DEVICE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ACCOUNTS = [
  {
    key: 'receive-only',
    email: 'qa-receive-only@demo.heart-iot.local',
    permissions: {
      historyDays: 30,
      canReceiveAlerts: true,
      canAcknowledge: true,
      canResolve: false,
      canViewAi: false,
      canViewMeasurements: false,
    },
  },
  {
    key: 'measurement-only',
    email: 'qa-measurement-only@demo.heart-iot.local',
    permissions: {
      historyDays: 30,
      canReceiveAlerts: false,
      canAcknowledge: false,
      canResolve: false,
      canViewAi: false,
      canViewMeasurements: true,
    },
  },
];
const ROUTES = [
  { key: 'today', path: '/app' },
  { key: 'overview', path: '/app/overview' },
  { key: 'alerts', path: '/app/alerts' },
  { key: 'history', path: '/app/history' },
];
const VIEWPORTS = [
  { name: '1280x900', width: 1280, height: 900 },
  { name: '390x844', width: 390, height: 844 },
];
// Trạng thái áp dụng theo endpoint trang thật sự gọi (không bịa trạng thái cho route không tải dữ liệu).
const APPLICABLE = {
  'receive-only': {
    today: ['403', 'empty', 'error', 'offline'],
    overview: ['403', 'empty', 'error', 'offline', 'stale'],
    alerts: ['403', 'empty', 'error', 'offline'],
    history: [],
  },
  'measurement-only': {
    today: ['403', 'empty', 'error', 'offline'],
    overview: ['403', 'empty', 'error', 'offline', 'stale'],
    alerts: [],
    history: ['403', 'empty', 'error', 'offline', 'stale'],
  },
};
const MSG_403 = 'Quyền được chia sẻ không cho phép thao tác này.';
const nowIso = () => new Date().toISOString();
const oldIso = () => new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const isoDaysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

mkdirSync(OUT, { recursive: true });
const report = { at: nowIso(), web: WEB, api: API, subjectId: SUBJECT_AN, accounts: {}, matrix: [] };

function apiContext() {
  return request.newContext({ baseURL: `${API}/`, extraHTTPHeaders: { Origin: WEB } });
}

async function getJson(context, path) {
  const response = await context.get(path);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status(), body };
}

const server = await apiContext();
const owner = await apiContext();
const ownerLogin = await owner.post('auth/login', {
  data: { email: 'ba-an@demo.heart-iot.local', password: 'demo-heart-iot-2026' },
});
if (!ownerLogin.ok()) throw new Error(`Owner login lỗi ${ownerLogin.status()}`);
const ownerViews = await getJson(owner, 'workspace-views');
const defaultPolicy = (
  await getJson(owner, `subjects/${SUBJECT_AN}/status`)
).body?.policy ?? {
  key: 'device_runtime',
  version: 1,
  source: 'database',
  value: {
    heartbeatIntervalSeconds: 300,
    offlineAfterSeconds: 900,
    dataFreshAfterSeconds: 600,
    lateEventMinutes: 5,
    maxTelemetryPerMinute: 60,
  },
  digest: 'qa-default',
};

/** Lấy fixture thật từ API của chính tài khoản (không dùng quyền owner). */
async function loadBaseline(account) {
  const context = await apiContext();
  const login = await context.post('auth/login', { data: { email: account.email, password: PASSWORD } });
  if (!login.ok()) throw new Error(`Login ${account.email} lỗi ${login.status()}: ${await login.text()}`);
  const out = {};
  const paths = {
    status: `subjects/${SUBJECT_AN}/status`,
    alerts: `subjects/${SUBJECT_AN}/alerts?state=open&limit=20`,
    contacts: `subjects/${SUBJECT_AN}/emergency-contacts`,
    summary: `subjects/${SUBJECT_AN}/daily-summary?date=${today}`,
    insights: `subjects/${SUBJECT_AN}/insights?days=7`,
    measurements: `subjects/${SUBJECT_AN}/measurements?from=${encodeURIComponent(
      isoDaysAgo(1),
    )}&to=${encodeURIComponent(nowIso())}&limit=500`,
  };
  for (const [key, path] of Object.entries(paths)) out[key] = await getJson(context, path);
  const subjects = await getJson(context, 'subjects');
  const link = (subjects.body?.items ?? []).find((item) => item.id === SUBJECT_AN) ?? null;
  await context.dispose();
  return { out, link };
}

function emptyFixtures(baseline) {
  const coverage = {
    from: isoDaysAgo(1),
    to: nowIso(),
    expectedIntervalSeconds: 300,
    observedCount: 0,
    expectedCount: 0,
    percent: 0,
  };
  return {
    status: {
      devices: [],
      policy: baseline.status.body?.policy ?? defaultPolicy,
      asOf: nowIso(),
    },
    alerts: { items: [], nextCursor: null },
    contacts: { items: [] },
    summary: {
      date: today,
      timezone: 'Asia/Ho_Chi_Minh',
      heartRate: null,
      steps: { total: 0, completeness: 'unavailable', notes: [] },
      coverage,
      gaps: [],
      incidents: { total: 0, resolved: 0 },
      lastSeenAt: null,
      batteryPercent: null,
      source: 'synthetic',
    },
    insights: {
      subjectId: SUBJECT_AN,
      timezone: 'Asia/Ho_Chi_Minh',
      from: isoDaysAgo(7),
      to: nowIso(),
      days: Array.from({ length: 7 }, (_, index) => ({
        date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
          new Date(Date.now() - index * 24 * 60 * 60 * 1000),
        ),
        hasData: false,
        source: 'synthetic',
        heartRate: null,
        steps: { total: 0, completeness: 'unavailable' },
        coverage: { percent: 0, observedCount: 0, expectedCount: 0 },
        incidents: { total: 0, resolved: 0 },
      })),
      summary: {
        dataDays: 0,
        avgHeartRate: null,
        totalSteps: 0,
        avgCoveragePercent: 0,
        incidentsTotal: 0,
        incidentsResolved: 0,
        syntheticDays: 0,
      },
      notes: [],
    },
    measurements: {
      items: [],
      nextCursor: null,
      coverage,
      gaps: [],
      excludedUnsyncedCount: 0,
    },
  };
}

function staleFixtures(baseline) {
  const out = {};
  if (baseline.status.status === 200 && baseline.status.body) {
    const status = structuredClone(baseline.status.body);
    status.asOf = nowIso();
    status.devices = (status.devices ?? []).map((device) => ({
      ...device,
      freshness: 'stale',
      online: true,
      // Không bịa mốc trước sharedFrom cho receive-only: giữ null nếu server đã ẩn.
      lastSeenAt: device.lastSeenAt ? oldIso() : null,
      lastMeasuredAt: device.lastMeasuredAt ? oldIso() : null,
      lastHeartRateBpm: device.lastHeartRateBpm ?? null,
    }));
    out.status = status;
  }
  if (baseline.summary.status === 200 && baseline.summary.body) {
    const summary = structuredClone(baseline.summary.body);
    summary.lastSeenAt = oldIso();
    summary.date = today;
    out.summary = summary;
  }
  if (baseline.measurements.status === 200 && baseline.measurements.body) {
    const measurements = structuredClone(baseline.measurements.body);
    const shift = (value) => (value ? new Date(new Date(value).getTime() - 3 * 24 * 60 * 60 * 1000).toISOString() : value);
    measurements.items = (measurements.items ?? []).map((item) => ({
      ...item,
      measuredAt: shift(item.measuredAt),
      receivedAt: shift(item.receivedAt),
    }));
    measurements.coverage = {
      ...measurements.coverage,
      from: shift(measurements.coverage.from),
      to: shift(measurements.coverage.to),
    };
    measurements.gaps = (measurements.gaps ?? []).map((gap) => ({
      ...gap,
      from: shift(gap.from),
      to: shift(gap.to),
    }));
    out.measurements = measurements;
  }
  // Hồ sơ measurement-only vừa được chia sẻ hôm nay nên baseline không có mẫu trong cửa sổ.
  // Vẫn cần kiểm "dữ liệu cũ": trả mẫu cũ hợp lệ để xem UI có dán nhãn/không màn trắng,
  // không phải tuyên bố server thật trả dữ liệu trước sharedFrom.
  if (!out.measurements && baseline.status.status === 200) {
    const old = oldIso();
    out.measurements = {
      items: [0, 1, 2].map((index) => ({
        measuredAt: new Date(new Date(old).getTime() - index * 5 * 60 * 1000).toISOString(),
        receivedAt: new Date(new Date(old).getTime() - index * 5 * 60 * 1000 + 2000).toISOString(),
        heartRateBpm: 70 + index,
        heartRateQuality: 'valid',
        motionQuality: 'valid',
        stepsSinceBoot: 100 + index * 2,
        batteryPercent: 80,
        isLate: false,
        isQuarantined: false,
      })),
      nextCursor: null,
      coverage: {
        from: new Date(new Date(old).getTime() - 60 * 60 * 1000).toISOString(),
        to: old,
        expectedIntervalSeconds: 300,
        observedCount: 3,
        expectedCount: 12,
        percent: 25,
      },
      gaps: [],
      excludedUnsyncedCount: 0,
    };
  }
  return out;
}

function fixtureFor(path, fixtures) {
  if (path.includes('/status')) return fixtures.status;
  if (path.includes('/alerts')) return fixtures.alerts;
  if (path.includes('/emergency-contacts')) return fixtures.contacts;
  if (path.includes('/daily-summary')) return fixtures.summary;
  if (path.includes('/insights')) return fixtures.insights;
  if (path.includes('/measurements')) return fixtures.measurements;
  return undefined;
}

function dataKind(url) {
  if (url.includes('/status')) return 'status';
  if (url.includes('/alerts')) return 'alerts';
  if (url.includes('/emergency-contacts')) return 'contacts';
  if (url.includes('/daily-summary')) return 'summary';
  if (url.includes('/insights')) return 'insights';
  if (url.includes('/measurements')) return 'measurements';
  return null;
}

function allowedKinds(accountKey) {
  return accountKey === 'receive-only'
    ? ['status', 'alerts', 'contacts']
    : ['status', 'summary', 'insights', 'measurements'];
}

async function installState(page, accountKey, state, baseline, empty, stale) {
  if (state === 'baseline') return;
  const allowed = allowedKinds(accountKey);
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (!url.startsWith(API)) return route.continue();
    if (!url.includes(`/subjects/${SUBJECT_AN}/`)) return route.continue();
    if (url.includes('/events')) return route.continue();
    const kind = dataKind(url);
    if (!kind || !allowed.includes(kind)) return route.continue();
    if (state === '403') {
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'FORBIDDEN', message: MSG_403, requestId: 'qa-matrix-403' }),
      });
    }
    if (state === 'error') {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'INTERNAL',
          message: 'Lỗi máy chủ giả lập cho kiểm trạng thái.',
          requestId: 'qa-matrix-500',
        }),
      });
    }
    if (state === 'offline') return route.abort('failed');
    if (state === 'empty') {
      const body = fixtureFor(url, empty);
      if (!body) return route.continue();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (state === 'stale') {
      const body = fixtureFor(url, stale);
      if (!body) return route.continue();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    return route.continue();
  });
}

function measureInPage() {
  const isVisible = (element) => {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)
      return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const main = document.querySelector('main') ?? document.body;
  const text = main.innerText ?? '';
  const bodyText = document.body.innerText ?? '';
  const h1 = [...document.querySelectorAll('h1')].filter(isVisible);
  const measurementMatches = [
    ...text.matchAll(/(\d+(?:[.,]\d+)?)\s*bpm/gi),
    ...text.matchAll(/(\d[\d.,\s]*)\s*bước/gi),
    ...text.matchAll(/\d+(?:[.,]\d+)?\s*%/g),
  ].map((match) => match[0]);
  const alertLinks = [...document.querySelectorAll('a[href^="/app/alerts/"]')].filter(isVisible);
  return {
    text: text.slice(0, 5_000),
    bodyText: bodyText.slice(0, 6_000),
    h1Count: h1.length,
    h1: h1[0]?.innerText?.trim() ?? null,
    textLength: text.length,
    alertLinkCount: alertLinks.length,
    measurementMatches: [...new Set(measurementMatches)],
    hasSseBanner: bodyText.includes('Mất cập nhật trực tiếp'),
    hasTechnicalPermissionError: bodyText.includes('Không tải được cảnh báo đang mở'),
    hasPermissionMeasurements: /Chủ hồ sơ không chia sẻ số đo|Bạn chưa được xem số đo/.test(bodyText),
    hasPermissionAlerts: /không có quyền xem cảnh báo/.test(bodyText),
    hasEmptyCopy: /Chưa có|Chưa nhận|Chưa gắn|Không có/.test(text),
    hasStaleCopy: /Chưa cập nhật gần đây|Chưa có số đo mới|Dữ liệu mới nhất|Cập nhật lúc/.test(
      bodyText,
    ),
    hasErrorCopy: /Không tải được|Kiểm tra kết nối|Thử lại|thử lại|Chưa tải được/.test(
      bodyText,
    ),
    hasAlertItemCopy: /Nghi ngã|Đã xác nhận bởi|Phát hiện \d{2}:\d{2}/.test(bodyText),
    hasDataSummary: /Tổng hợp hôm nay|Nhịp tim trung bình|Vận động/.test(bodyText),
    hasHistoryUi: /Lịch sử đo|24 giờ|7 ngày|30 ngày/.test(bodyText),
    historyRowCount: document.querySelectorAll('.history-table tbody tr, .history-card').length,
    hasTodayUi: /Hỏi trợ lý AI/.test(bodyText),
  };
}

const browser = await chromium.launch();
try {
  for (const account of ACCOUNTS) {
    const { out: baseline, link } = await loadBaseline(account);
    const empty = emptyFixtures(baseline);
    const stale = staleFixtures(baseline);
    report.accounts[account.key] = {
      email: account.email,
      role: link?.role ?? null,
      permissions: link?.permissions ?? null,
      baselineStatus: {
        status: baseline.status.status,
        devices: baseline.status.body?.devices?.length ?? null,
        freshness: baseline.status.body?.devices?.map((device) => device.freshness) ?? null,
        healthDataVisible:
          baseline.status.body?.devices?.map((device) => device.healthDataVisible) ?? null,
      },
      baselineEndpoints: Object.fromEntries(
        Object.entries(baseline).map(([key, value]) => [key, value.status]),
      ),
      baselineCounts: {
        alerts: baseline.alerts.body?.items?.length ?? null,
        contacts: baseline.contacts.body?.items?.length ?? null,
        measurements: baseline.measurements.body?.items?.length ?? null,
        insightsDays: baseline.insights.body?.days?.length ?? null,
      },
    };

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
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('pageerror', (error) => consoleErrors.push(String(error)));

      for (const route of ROUTES) {
        const applicableStates = ['baseline', ...APPLICABLE[account.key][route.key]];
        for (const state of applicableStates) {
          const requests = [];
          const failed = [];
          const onResponse = (response) => {
            const url = response.url();
            if (!url.startsWith(API)) return;
            requests.push({
              method: response.request().method(),
              path: url.slice(API.length),
              status: response.status(),
            });
          };
          const onFailed = (req) => {
            if (!req.url().startsWith(API)) return;
            failed.push({ path: req.url().slice(API.length), error: req.failure()?.errorText ?? null });
          };
          page.on('response', onResponse);
          page.on('requestfailed', onFailed);
          const cell = {
            account: account.key,
            viewport: vp.name,
            route: route.key,
            state,
            applicable: state === 'baseline' || APPLICABLE[account.key][route.key].includes(state),
          };
          try {
            await installState(page, account.key, state, baseline, empty, stale);
            await page.goto(`${WEB}${route.path}`, { waitUntil: 'domcontentloaded' });
            await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 20_000 });
            await page.waitForTimeout(state === 'offline' || state === 'error' ? 2_000 : 1_400);
            const measured = await page.evaluate(measureInPage);
            const dataRequests = requests.filter((item) => dataKind(`/x${item.path}`));
            const unauthorizedKinds = account.key === 'receive-only'
              ? ['summary', 'insights', 'measurements']
              : [];
            const unauthorizedRequest = dataRequests.some((item) =>
              unauthorizedKinds.includes(dataKind(`/x${item.path}`)),
            );
            const alertRequest = dataRequests.find((item) => dataKind(`/x${item.path}`) === 'alerts');
            const measureOk = account.key !== 'receive-only' || measured.measurementMatches.length === 0;
            const alertOk = account.key !== 'measurement-only' || measured.alertLinkCount === 0;
            const baseOk = measured.h1Count === 1 && measured.textLength > 40 && measureOk && alertOk && !unauthorizedRequest;
            let stateMessageOk = true;
            let note = null;
            if (state === 'baseline') {
              if (account.key === 'receive-only') {
                if (route.key === 'today') {
                  stateMessageOk = /Trợ lý (chưa được bật|cần quyền xem số đo)/.test(measured.bodyText);
                } else if (route.key === 'overview' || route.key === 'history') {
                  stateMessageOk = measured.hasPermissionMeasurements;
                } else if (route.key === 'alerts') {
                  stateMessageOk = measured.hasAlertItemCopy;
                }
              } else {
                if (route.key === 'today') {
                  stateMessageOk = measured.hasPermissionAlerts;
                } else if (route.key === 'alerts') {
                  stateMessageOk = measured.hasPermissionAlerts;
                } else if (route.key === 'overview') {
                  stateMessageOk = measured.hasDataSummary;
                  // Thiếu canReceiveAlerts nhưng /app/overview vẫn gọi /alerts → 403 và
                  // hiện lỗi kỹ thuật thay vì trạng thái quyền. Ghi anomaly để báo cáo.
                  if (measured.hasTechnicalPermissionError) {
                    cell.anomaly = 'overview gọi /alerts khi thiếu canReceiveAlerts → 403, hiện lỗi kỹ thuật';
                    note = 'permission-noise';
                  }
                } else if (route.key === 'history') {
                  stateMessageOk = measured.hasHistoryUi;
                }
              }
            } else if (state === '403') {
              // 403 giả lập trên endpoint được phép: chấp nhận thông điệp quyền hoặc lỗi có thử lại,
              // miễn là không màn trắng và không lộ dữ liệu.
              stateMessageOk = measured.hasErrorCopy || measured.hasPermissionAlerts || measured.hasPermissionMeasurements;
            } else if (state === 'empty') {
              stateMessageOk = measured.hasEmptyCopy || measured.hasPermissionMeasurements || measured.hasPermissionAlerts;
            } else if (state === 'error' || state === 'offline') {
              stateMessageOk = measured.hasErrorCopy || measured.hasPermissionAlerts || measured.hasPermissionMeasurements;
            } else if (state === 'stale') {
              stateMessageOk =
                measured.hasStaleCopy || measured.hasPermissionMeasurements || measured.historyRowCount > 0;
            }
            cell.requests = dataRequests;
            cell.failed = failed.filter((item) => dataKind(`/x${item.path}`));
            cell.alertRequestStatus = alertRequest?.status ?? null;
            cell.measured = {
              h1Count: measured.h1Count,
              h1: measured.h1,
              textLength: measured.textLength,
              alertLinkCount: measured.alertLinkCount,
              historyRowCount: measured.historyRowCount,
              measurementMatches: measured.measurementMatches,
              hasSseBanner: measured.hasSseBanner,
              hasPermissionMeasurements: measured.hasPermissionMeasurements,
              hasPermissionAlerts: measured.hasPermissionAlerts,
              hasEmptyCopy: measured.hasEmptyCopy,
              hasStaleCopy: measured.hasStaleCopy,
              hasErrorCopy: measured.hasErrorCopy,
              hasTechnicalPermissionError: measured.hasTechnicalPermissionError,
              text: measured.text,
            };
            cell.sse403 = account.key === 'measurement-only' && measured.hasSseBanner;
            if (cell.sse403 && state === 'baseline') cell.anomaly = cell.anomaly ?? 'SSE /events 403 → banner mất cập nhật';
            cell.stateMessageOk = stateMessageOk;
            cell.ok = baseOk && stateMessageOk;
            if (note) cell.note = note;
            cell.consoleErrors = [...new Set(consoleErrors)];
            const file = join(
              OUT,
              `${route.key}-${vp.name}-${account.key}-${state}.png`,
            );
            await page.screenshot({ path: file, fullPage: false });
            cell.screenshot = file;
          } catch (error) {
            cell.ok = false;
            cell.error = String(error?.stack ?? error);
            await page
              .screenshot({
                path: join(OUT, `${route.key}-${vp.name}-${account.key}-${state}-error.png`),
                fullPage: false,
              })
              .catch(() => {});
          } finally {
            page.off('response', onResponse);
            page.off('requestfailed', onFailed);
            if (state !== 'baseline') await page.unroute('**/*');
            consoleErrors.length = 0;
          }
          report.matrix.push(cell);
        }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  await owner.dispose();
  await server.dispose();
  report.summary = {
    cells: report.matrix.length,
    ok: report.matrix.filter((cell) => cell.ok).length,
    failed: report.matrix.filter((cell) => cell.ok === false).length,
    anomalies: report.matrix.filter((cell) => cell.anomaly).length,
  };
  writeFileSync(join(OUT, 'permission-matrix.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ summary: report.summary, accounts: report.accounts }, null, 2));
  for (const cell of report.matrix.filter((item) => !item.ok || item.anomaly)) {
    console.log(
      JSON.stringify({
        account: cell.account,
        viewport: cell.viewport,
        route: cell.route,
        state: cell.state,
        ok: cell.ok,
        stateMessageOk: cell.stateMessageOk,
        anomaly: cell.anomaly,
        requests: cell.requests,
        measured: {
          h1: cell.measured?.h1,
          textLength: cell.measured?.textLength,
          positions: cell.measured?.measurementMatches,
          alertLinkCount: cell.measured?.alertLinkCount,
          hasPermissionAlerts: cell.measured?.hasPermissionAlerts,
          hasTechnicalPermissionError: cell.measured?.hasTechnicalPermissionError,
          hasErrorCopy: cell.measured?.hasErrorCopy,
          hasEmptyCopy: cell.measured?.hasEmptyCopy,
          hasStaleCopy: cell.measured?.hasStaleCopy,
          hasSseBanner: cell.measured?.hasSseBanner,
        },
      }),
    );
  }
}
process.exitCode = report.summary.failed === 0 ? 0 : 1;
