import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

/**
 * Đo tải ngắn trên PostgreSQL thật (không dùng Jest/PGlite).
 *
 * Chạy sau khi DB đã migrate + seed:
 *   DATABASE_URL=postgres://... node backend/scripts/postgres-load.mjs
 *
 * Mục đích là kiểm đúng/sai và quan sát độ trễ khi nhiều request đồng thời,
 * không phải benchmark production: một process API, pool `pg` mặc định max 10,
 * dữ liệu seed, máy dev.
 */

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const apiEntry = join(repoRoot, 'backend', 'dist', 'src', 'main.js');
const port = Number(process.env.LOAD_PORT ?? '3033');
const baseUrl = `http://127.0.0.1:${port}/api/v1`;
const databaseUrl = process.env.DATABASE_URL;
const concurrencyLevels = (process.env.LOAD_CONCURRENCY ?? '1,10,25,50')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0);
const durationMs = Number(process.env.LOAD_DURATION_MS ?? '5000');

if (!databaseUrl) {
  console.error('Thiếu DATABASE_URL; script chỉ chạy với PostgreSQL thật.');
  process.exit(2);
}
if (concurrencyLevels.length === 0) {
  console.error('LOAD_CONCURRENCY phải có ít nhất một số nguyên dương.');
  process.exit(2);
}
if (!Number.isFinite(durationMs) || durationMs < 1000) {
  console.error('LOAD_DURATION_MS phải >= 1000.');
  process.exit(2);
}

const dbUrl = new URL(databaseUrl);
const dbLabel = `${dbUrl.hostname}${dbUrl.pathname}`;

function log(message) {
  console.log(`[postgres-load] ${message}`);
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
  return { status: response.status, text, headers: response.headers };
}

async function login(email, password) {
  const response = await request('/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(response.status, 200, `login ${email} phải 200, nhận ${response.status}`);
  return cookieFrom(response);
}

function percentile(sorted, value) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((value / 100) * sorted.length) - 1));
  return sorted[index];
}

async function runScenario({ name, path, cookie, expectedStatus = 200 }, concurrency) {
  const latencies = [];
  const statuses = new Map();
  let requestErrors = 0;
  const deadline = performance.now() + durationMs;

  async function worker() {
    while (performance.now() < deadline) {
      const started = performance.now();
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          headers: cookie ? { cookie } : {},
          signal: AbortSignal.timeout(10_000),
        });
        const elapsed = performance.now() - started;
        await response.arrayBuffer();
        latencies.push(elapsed);
        statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
      } catch {
        requestErrors += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const sorted = [...latencies].sort((a, b) => a - b);
  const total = latencies.length + requestErrors;
  const unexpected = [...statuses.entries()]
    .filter(([status]) => status !== expectedStatus)
    .reduce((sum, [, count]) => sum + count, 0);
  return {
    name,
    concurrency,
    requests: total,
    rps: total / (durationMs / 1000),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    errors: requestErrors + unexpected,
    statuses: Object.fromEntries([...statuses.entries()].sort(([a], [b]) => a - b)),
  };
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
  log(`Node ${process.version}; DB ${dbLabel}; API một process; pool pg max=10`);

  const ownerCookie = await login('ba-an@demo.heart-iot.local', 'demo-heart-iot-2026');
  const subjects = await request('/subjects', { cookie: ownerCookie });
  assert.equal(subjects.status, 200);
  const subjectId = JSON.parse(subjects.text).items[0].id;

  const scenarios = [
    { name: 'health', path: '/health', cookie: null },
    { name: 'subjects', path: '/subjects', cookie: ownerCookie },
    { name: 'alerts', path: `/subjects/${subjectId}/alerts?limit=5`, cookie: ownerCookie },
  ];

  const results = [];
  for (const scenario of scenarios) {
    for (const concurrency of concurrencyLevels) {
      const result = await runScenario(scenario, concurrency);
      results.push(result);
      log(
        `${result.name} c=${result.concurrency}: ${result.requests} req, ` +
          `${result.rps.toFixed(1)} req/s, p50=${result.p50.toFixed(1)}ms, ` +
          `p95=${result.p95.toFixed(1)}ms, p99=${result.p99.toFixed(1)}ms, errors=${result.errors}`,
      );
    }
  }

  const failed = results.filter((result) => result.errors > 0);
  assert.equal(failed.length, 0, `có ${failed.length} lượt có lỗi/status bất thường`);
  console.log('[postgres-load] PASS');
} catch (error) {
  console.error('[postgres-load] FAIL:', error instanceof Error ? error.message : String(error));
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
