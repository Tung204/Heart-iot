import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * Smoke API trên PostgreSQL thật (không dùng Jest/PGlite).
 *
 * Chạy sau khi DB đã migrate + seed:
 *   DATABASE_URL=postgres://... node backend/scripts/postgres-smoke.mjs
 *
 * Script tự khởi động `backend/dist/src/main.js`, chờ health, đăng nhập bằng
 * cookie thật, kiểm quyền và luồng nháp → confirm → một lịch nhắc. Dữ liệu là
 * DB dùng một lần; script không tự migrate/seed để tránh xóa nhầm DB.
 */

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const apiEntry = join(repoRoot, 'backend', 'dist', 'src', 'main.js');
const port = Number(process.env.SMOKE_PORT ?? '3032');
const baseUrl = `http://127.0.0.1:${port}/api/v1`;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Thiếu DATABASE_URL; script chỉ chạy với PostgreSQL thật.');
  process.exit(2);
}

function log(message) {
  console.log(`[postgres-smoke] ${message}`);
}

async function waitForHealth(child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API thoát sớm (exit ${child.exitCode})`);
    try {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return response.json();
    } catch {
      // chưa sẵn sàng
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('API không sẵn sàng sau 30 giây');
}

function cookieFrom(response) {
  const cookies = response.headers.getSetCookie?.() ?? [];
  const raw = cookies[0] ?? response.headers.get('set-cookie') ?? '';
  const first = raw.split(';')[0];
  if (!first.includes('=')) throw new Error(`Không nhận được cookie phiên: ${raw}`);
  return first;
}

async function request(path, { method = 'GET', cookie, body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json; charset=utf-8';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // giữ text để báo lỗi
  }
  return { status: response.status, json, text, headers: response.headers };
}

async function login(email, password) {
  const response = await request('/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(response.status, 200, `login ${email} phải 200, nhận ${response.status}: ${response.text}`);
  return cookieFrom(response);
}

const child = spawn(process.execPath, [apiEntry], {
  cwd: repoRoot,
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(port),
    WEB_ORIGIN: 'http://localhost:5173',
    DATABASE_URL: databaseUrl,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let childLog = '';
child.stdout.on('data', (chunk) => {
  childLog += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  childLog += chunk.toString();
});

try {
  const health = await waitForHealth(child);
  assert.equal(health.status, 'ok');
  assert.equal(health.database, 'up');
  log(`health ok, database=${health.database}`);

  const ownerCookie = await login('ba-an@demo.heart-iot.local', 'demo-heart-iot-2026');
  const caregiverCookie = await login('minh@demo.heart-iot.local', 'demo-heart-iot-2026');
  const adminCookie = await login('admin@demo.heart-iot.local', 'demo-admin-2026');
  log('login owner/caregiver/admin ok');

  const anonymousMe = await request('/me');
  assert.equal(anonymousMe.status, 401);

  const subjects = await request('/subjects', { cookie: ownerCookie });
  assert.equal(subjects.status, 200);
  assert.ok(Array.isArray(subjects.json?.items) && subjects.json.items.length > 0);
  const subjectId = subjects.json.items[0].id;
  log(`subjects ok (${subjects.json.items.length}), subject=${subjectId}`);

  for (const path of [
    `/subjects/${subjectId}`,
    `/subjects/${subjectId}/alerts?limit=5`,
    '/notifications',
    `/subjects/${subjectId}/assistant/summary`,
    `/subjects/${subjectId}/assistant/capabilities`,
  ]) {
    const response = await request(path, { cookie: ownerCookie });
    assert.equal(response.status, 200, `${path} phải 200, nhận ${response.status}: ${response.text}`);
  }
  log('owner read endpoints ok');

  const caregiverCapabilities = await request(`/subjects/${subjectId}/assistant/capabilities`, {
    cookie: caregiverCookie,
  });
  assert.equal(caregiverCapabilities.status, 200);
  assert.ok(
    caregiverCapabilities.json?.can?.every((item) => item.available === false),
    'caregiver không được có capability khả dụng',
  );
  const caregiverPatch = await request(`/subjects/${subjectId}`, {
    method: 'PATCH',
    cookie: caregiverCookie,
    body: { displayName: 'Không được phép' },
  });
  assert.equal(caregiverPatch.status, 403);
  assert.equal((await request('/admin/jobs', { cookie: ownerCookie })).status, 403);
  log('caregiver/owner boundary ok');

  for (const path of ['/admin/jobs', '/admin/outbox/summary', '/admin/retention/preview']) {
    const response = await request(path, { cookie: adminCookie });
    assert.equal(response.status, 200, `${path} phải 200, nhận ${response.status}: ${response.text}`);
  }
  log('admin read endpoints ok');

  const draft = await request(`/subjects/${subjectId}/assistant/drafts/from-text`, {
    method: 'POST',
    cookie: ownerCookie,
    body: {
      text: 'nhắc tôi uống nước kiểm tra lúc 8h30 và 20h30 hằng ngày đến 30/11',
    },
  });
  assert.equal(draft.status, 201, `tạo nháp phải 201, nhận ${draft.status}: ${draft.text}`);
  assert.equal(draft.json?.status, 'draft');
  const draftId = draft.json.id;

  const confirm = await request(`/assistant/drafts/${draftId}/confirm`, {
    method: 'POST',
    cookie: ownerCookie,
  });
  assert.equal(confirm.status, 200);
  assert.equal(confirm.json?.status, 'confirmed');
  assert.equal(confirm.json?.result?.type, 'care_reminder');
  const reminderId = confirm.json.result.id;

  const confirmAgain = await request(`/assistant/drafts/${draftId}/confirm`, {
    method: 'POST',
    cookie: ownerCookie,
  });
  assert.equal(confirmAgain.status, 200);
  assert.equal(confirmAgain.json?.result?.id, reminderId, 'confirm lặp phải trả cùng lịch');
  log('draft → confirm idempotent ok');

  const reminders = await request(`/subjects/${subjectId}/reminders`, { cookie: ownerCookie });
  assert.equal(reminders.status, 200);
  const matches = reminders.json.items.filter((item) => item.id === reminderId);
  assert.equal(matches.length, 1, `phải có đúng một lịch ${reminderId}, nhận ${matches.length}`);
  log('đúng một lịch nhắc được tạo');

  const logout = await request('/auth/logout', { method: 'POST', cookie: ownerCookie });
  assert.equal(logout.status, 204);
  assert.equal((await request('/me', { cookie: ownerCookie })).status, 401);
  log('logout thu hồi phiên ok');

  console.log('[postgres-smoke] PASS');
} catch (error) {
  console.error('[postgres-smoke] FAIL:', error instanceof Error ? error.message : String(error));
  if (childLog) console.error('--- API log ---\n' + childLog.slice(-8000));
  process.exitCode = 1;
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
