// v7 final QA — xác nhận 2 P3 đã đóng trên bản v7-fix:
//  1) /app/alerts/:id xác nhận 2 bước: 0 POST trước xác nhận, 1 POST sau, 409 đúng.
//  2) /app/studio/:id subject-scope có đúng 1 dòng nhận diện hồ sơ, không select.
// Chạy tay: node reports/qa/scripts/v7-final-p3.mjs
// Cần: web 127.0.0.1:4361, API 127.0.0.1:3013 (PGlite .data/final, seed demo).
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
const OWNER = { email: 'ba-an@demo.heart-iot.local', password: 'demo-heart-iot-2026' };
const SUBJECT_AN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DEVICE = {
  'x-device-id': 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'x-device-key': 'demo-device-key-HEARTIOT-2026-001',
};
const STUDIO_VIEW = '68c03421-e519-43e6-8b97-74a86bcd6963';
const VIEWPORTS = [
  { name: '1280x900', width: 1280, height: 900 },
  { name: '390x844', width: 390, height: 844 },
];

mkdirSync(OUT, { recursive: true });
const report = { at: new Date().toISOString(), web: WEB, api: API, runs: [] };

function apiContext() {
  return request.newContext({ baseURL: `${API}/`, extraHTTPHeaders: { Origin: WEB } });
}

async function ownerLogin(context) {
  const response = await context.post('auth/login', { data: OWNER });
  if (!response.ok()) throw new Error(`Owner login lỗi ${response.status()}: ${await response.text()}`);
}

function evidence(incidentId, revision, eventType, sequence) {
  const now = new Date().toISOString();
  return {
    schema_version: '1.0',
    message_id: `qa-final-${incidentId}-${revision}`,
    device_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    boot_id: `boot-${incidentId}`,
    sequence,
    measured_at: now,
    clock_status: 'synced',
    uptime_ms: revision * 1000,
    firmware_version: '0.0.0-sim',
    incident_id: incidentId,
    event_revision: revision,
    event_type: eventType,
    incident_type: 'fall',
    evidence: {
      algorithm_version: 'sim-0.1',
      wear_location: 'wrist',
      motion_quality: 'valid',
      heart_rate_quality: 'valid',
      heart_rate_bpm: 74,
    },
  };
}

/** Tạo incident mới qua ingest thật (candidate r1 + confirmed r2) → open, version 2. */
async function createOpenIncident(ingest) {
  const incidentId = `qa-final-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const first = await ingest.post('ingest/events', {
    data: evidence(incidentId, 1, 'fall.candidate', 1),
    headers: DEVICE,
  });
  const firstBody = await first.json();
  if (!first.ok() || !firstBody.incidentId) {
    throw new Error(`ingest candidate lỗi ${first.status()}: ${JSON.stringify(firstBody)}`);
  }
  const second = await ingest.post('ingest/events', {
    data: evidence(incidentId, 2, 'fall.confirmed', 2),
    headers: DEVICE,
  });
  const secondBody = await second.json();
  if (!second.ok()) {
    throw new Error(`ingest confirmed lỗi ${second.status()}: ${JSON.stringify(secondBody)}`);
  }
  return { deviceIncidentId: incidentId, incidentId: firstBody.incidentId };
}

async function openDetail(page, incidentId) {
  await page.goto(`${WEB}/app/alerts/${incidentId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Tôi đang hỗ trợ' }).waitFor({ timeout: 20_000 });
}

try {
  const browser = await chromium.launch();
  const ownerApi = await apiContext();
  await ownerLogin(ownerApi);
  const ingest = await apiContext();

  for (const vp of VIEWPORTS) {
    const run = { viewport: vp.name, success: {}, conflict: {}, studio: {} };
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
    });
    await context.request.post(`${API}/auth/login`, {
      data: OWNER,
      headers: { Origin: WEB },
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(String(error)));
    const ackResponses = [];
    page.on('response', async (response) => {
      if (!response.url().includes('/acknowledge')) return;
      ackResponses.push({
        status: response.status(),
        requestBody: response.request().postData(),
        responseBody: await response.text().catch(() => ''),
        at: new Date().toISOString(),
      });
    });

    try {
      // ---------- P3-01a: xác nhận 2 bước thành công ----------
      const successIncident = await createOpenIncident(ingest);
      const before = await ownerApi.get(`alerts/${successIncident.incidentId}`);
      const beforeBody = await before.json();
      await openDetail(page, successIncident.incidentId);
      const ackStart = ackResponses.length;

      await page.getByRole('button', { name: 'Tôi đang hỗ trợ' }).click();
      const confirmGroup = page.getByRole('group', { name: 'Xác nhận hỗ trợ cảnh báo' });
      await confirmGroup.waitFor({ timeout: 10_000 });
      const afterToggle = {
        groupVisible: await confirmGroup.isVisible(),
        question: (await confirmGroup.locator('.alert-detail__confirm-question').innerText()).trim(),
        postsBeforeConfirm: ackResponses.length - ackStart,
        confirmButton: await page.getByRole('button', { name: 'Có, tôi đang hỗ trợ' }).isVisible(),
        cancelButton: await page.getByRole('button', { name: 'Hủy' }).isVisible(),
      };
      await page.screenshot({
        path: join(OUT, `alert-detail-${vp.name}-confirm.png`),
        fullPage: false,
      });

      // Hủy phải đóng bước hỏi lại và không POST.
      await page.getByRole('button', { name: 'Hủy' }).click();
      await confirmGroup.waitFor({ state: 'detached', timeout: 5_000 });
      const afterCancel = {
        postsAfterCancel: ackResponses.length - ackStart,
        toggleBack: await page.getByRole('button', { name: 'Tôi đang hỗ trợ' }).isVisible(),
      };

      await page.getByRole('button', { name: 'Tôi đang hỗ trợ' }).click();
      await confirmGroup.waitFor({ timeout: 10_000 });
      await page.getByRole('button', { name: 'Có, tôi đang hỗ trợ' }).click();
      await page.waitForFunction(
        (count) => document.querySelectorAll('.alert-detail__confirm').length === 0,
        null,
        { timeout: 10_000 },
      );
      await page
        .getByText('đã xác nhận đang hỗ trợ', { exact: false })
        .first()
        .waitFor({ timeout: 15_000 });
      const successPosts = ackResponses.slice(ackStart);
      const afterSuccess = {
        posts: successPosts.length,
        status: successPosts[0]?.status ?? null,
        requestBody: successPosts[0]?.requestBody ?? null,
        uiText: (await page.locator('.alert-detail__action').innerText()).trim(),
      };
      const afterApi = await ownerApi.get(`alerts/${successIncident.incidentId}`);
      const afterApiBody = await afterApi.json();
      await page.screenshot({
        path: join(OUT, `alert-detail-${vp.name}-acked.png`),
        fullPage: false,
      });
      run.success = {
        incidentId: successIncident.incidentId,
        versionBefore: beforeBody.version,
        stateBefore: beforeBody.state,
        afterToggle,
        afterCancel,
        afterSuccess,
        versionAfter: afterApiBody.version,
        stateAfter: afterApiBody.state,
        acknowledgedBy: afterApiBody.acknowledgedBy?.displayName ?? null,
        ok:
          afterToggle.groupVisible &&
          afterToggle.postsBeforeConfirm === 0 &&
          afterToggle.confirmButton &&
          afterToggle.cancelButton &&
          afterCancel.postsAfterCancel === 0 &&
          afterSuccess.posts === 1 &&
          afterSuccess.status === 200 &&
          afterApiBody.state === 'acknowledged' &&
          afterApiBody.acknowledgedBy?.displayName === 'Trần Thị An',
      };

      // ---------- P3-01b: 409 khi version lệch ----------
      const conflictIncident = await createOpenIncident(ingest);
      const conflictBefore = await ownerApi.get(`alerts/${conflictIncident.incidentId}`);
      const conflictBeforeBody = await conflictBefore.json();
      // Chặn SSE ở tab kiểm để mô phỏng tab khác đã ack trước khi tab này nhận cập nhật.
      await page.route('**/subjects/*/events*', (route) => route.abort());
      await openDetail(page, conflictIncident.incidentId);
      const ackConflictStart = ackResponses.length;
      const externalAck = await ownerApi.post(`alerts/${conflictIncident.incidentId}/acknowledge`, {
        data: { expectedVersion: conflictBeforeBody.version },
      });
      const externalAckBody = await externalAck.json();
      await page.getByRole('button', { name: 'Tôi đang hỗ trợ' }).click();
      await page.getByRole('group', { name: 'Xác nhận hỗ trợ cảnh báo' }).waitFor({ timeout: 10_000 });
      await page.getByRole('button', { name: 'Có, tôi đang hỗ trợ' }).click();
      await page
        .getByText('Cảnh báo đã thay đổi ở nơi khác', { exact: false })
        .first()
        .waitFor({ timeout: 15_000 });
      const conflictPosts = ackResponses.slice(ackConflictStart);
      const conflictUi = {
        title: (await page.getByText('Cảnh báo đã thay đổi ở nơi khác').first().innerText()).trim(),
        text: (await page.locator('.alert-detail .alert').first().innerText()).trim(),
        reloadButton: await page
          .getByRole('button', { name: 'Tải lại cảnh báo' })
          .isVisible(),
      };
      await page.screenshot({
        path: join(OUT, `alert-detail-${vp.name}-409.png`),
        fullPage: false,
      });
      // Tải lại: hiện đúng trạng thái đã có người xác nhận, không tự ghi đè.
      await page.getByRole('button', { name: 'Tải lại cảnh báo' }).click();
      await page
        .getByText('đã xác nhận đang hỗ trợ', { exact: false })
        .first()
        .waitFor({ timeout: 15_000 });
      const afterReloadText = (await page.locator('.alert-detail__action').innerText()).trim();
      const conflictAfterApi = await ownerApi.get(`alerts/${conflictIncident.incidentId}`);
      const conflictAfterBody = await conflictAfterApi.json();
      await page.screenshot({
        path: join(OUT, `alert-detail-${vp.name}-409-reloaded.png`),
        fullPage: false,
      });
      run.conflict = {
        incidentId: conflictIncident.incidentId,
        versionBefore: conflictBeforeBody.version,
        externalAckStatus: externalAck.status(),
        externalAckState: externalAckBody.state,
        uiPosts: conflictPosts.length,
        uiStatus: conflictPosts[0]?.status ?? null,
        uiRequestBody: conflictPosts[0]?.requestBody ?? null,
        uiResponse: conflictPosts[0]?.responseBody ?? null,
        ui: conflictUi,
        afterReloadText,
        versionAfter: conflictAfterBody.version,
        stateAfter: conflictAfterBody.state,
        ok:
          conflictPosts.length === 1 &&
          conflictPosts[0]?.status === 409 &&
          (conflictPosts[0]?.responseBody ?? '').includes('APPROVAL_STALE') === false &&
          (conflictPosts[0]?.responseBody ?? '').includes('CONFLICT') &&
          conflictUi.reloadButton &&
          conflictAfterBody.state === 'acknowledged' &&
          conflictAfterBody.version === conflictBeforeBody.version + 1,
      };
      await page.unroute('**/subjects/*/events*');

      // ---------- P3-02: Studio subject-scope đúng 1 dòng nhận diện, không select ----------
      await page.goto(`${WEB}/app/studio/${STUDIO_VIEW}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 20_000 });
      await page.locator('.subject-context').first().waitFor({ timeout: 20_000 });
      const studioContext = await page.evaluate(() => {
        const isVisible = (element) => {
          const style = window.getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const lines = [...document.querySelectorAll('.subject-context')].filter(isVisible);
        const groups = [...document.querySelectorAll('[role="group"][aria-label="Người được theo dõi"]')].filter(
          isVisible,
        );
        return {
          contextCount: lines.length,
          contextGroupCount: groups.length,
          contextTexts: lines.map((element) =>
            (element.innerText || '').trim().replace(/\s+/g, ' '),
          ),
          selectsInsideContext: lines.reduce(
            (total, element) => total + element.querySelectorAll('select').length,
            0,
          ),
          globalSubjectSelect: document.querySelectorAll('#active-subject-select').length,
          h1: document.querySelector('h1')?.innerText?.trim() ?? null,
          badge: document.body.innerText.includes('Theo hồ sơ'),
        };
      });
      await page.screenshot({
        path: join(OUT, `studio-detail-${vp.name}-subject-context.png`),
        fullPage: false,
      });
      run.studio = {
        viewId: STUDIO_VIEW,
        ...studioContext,
        ok:
          studioContext.contextCount === 1 &&
          studioContext.contextGroupCount === 1 &&
          studioContext.contextTexts[0]?.includes('Theo dõi:') &&
          studioContext.contextTexts[0]?.includes('Bà Trần Thị An') &&
          studioContext.selectsInsideContext === 0 &&
          studioContext.globalSubjectSelect === 0,
      };
      run.ok = run.success.ok && run.conflict.ok && run.studio.ok;
      run.consoleErrors = consoleErrors;
    } catch (error) {
      run.ok = false;
      run.error = String(error?.stack ?? error);
      await page
        .screenshot({ path: join(OUT, `p3-${vp.name}-error.png`), fullPage: false })
        .catch(() => {});
    }
    report.runs.push(run);
    await context.close();
  }

  await ownerApi.dispose();
  await ingest.dispose();
  await browser.close();
} finally {
  report.ok = report.runs.length > 0 && report.runs.every((run) => run.ok);
  writeFileSync(join(OUT, 'p3-verify.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, runs: report.runs }, null, 2));
}

process.exitCode = report.ok ? 0 : 1;
