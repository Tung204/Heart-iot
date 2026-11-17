// Review v2 hiệu năng — p50/p95 18 endpoint + login + SSE handshake.
// Chạy: node reports/qa/scripts/v2-api-latency.mjs   (API riêng PORT=3201, DB .data/review-perf đã seed)
// Không ghi gì vào DB; chỉ GET/POST login. N=15 mẫu warm mỗi endpoint.
// Đo latency API trên API riêng port 3201 + PGlite .data/review-perf (HEAD 8434d66).
const BASE = process.env.BASE ?? 'http://localhost:3201/api/v1';
const N = Number(process.env.N ?? 15);

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} -> ${res.status} ${await res.text()}`);
  const raw = res.headers.getSetCookie?.() ?? [];
  const cookie = raw.map((c) => c.split(';')[0]).join('; ');
  const body = await res.json();
  return { cookie, user: body.user };
}

async function timed(path, cookie, { method = 'GET', body } = {}) {
  const started = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const ms = performance.now() - started;
  return { ms, status: res.status, bytes: Buffer.byteLength(text), sample: text.slice(0, 120) };
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  return {
    p50: +at(50).toFixed(1),
    p95: +at(95).toFixed(1),
    max: +sorted[sorted.length - 1].toFixed(1),
  };
}

async function measure(label, path, cookie, opts) {
  const warm = await timed(path, cookie, opts);
  if (warm.status >= 500) {
    console.log(`${label.padEnd(42)} LỖI ${warm.status} ${warm.sample}`);
    return { label, error: warm.status };
  }
  const values = [];
  let bytes = warm.bytes;
  let status = warm.status;
  for (let i = 0; i < N; i += 1) {
    const r = await timed(path, cookie, opts);
    values.push(r.ms);
    bytes = r.bytes;
    status = r.status;
  }
  const s = stats(values);
  console.log(
    `${label.padEnd(42)} ${String(status).padStart(3)} p50=${String(s.p50).padStart(7)}ms p95=${String(s.p95).padStart(7)}ms max=${String(s.max).padStart(7)}ms  ${(bytes / 1024).toFixed(1).padStart(7)} kB`,
  );
  return { label, ...s, status, bytes };
}

const owner = await login('ba-an@demo.annhien.local', 'demo-an-nhien-2026');
const caregiver = await login('minh@demo.annhien.local', 'demo-an-nhien-2026');
const admin = await login('admin@demo.annhien.local', 'demo-admin-2026');

const subjects = await (await fetch(`${BASE}/subjects`, { headers: { cookie: owner.cookie } })).json();
const subjectId = subjects.items[0].id;
const now = new Date();
const day = 24 * 3600 * 1000;
const iso = (t) => new Date(t).toISOString();

const results = [];
console.log(`BASE=${BASE} N=${N} (warmup 1 + ${N} lần)  subject=${subjectId}\n`);
results.push(await measure('GET /me', '/me', owner.cookie));
results.push(await measure('GET /subjects (owner)', '/subjects', owner.cookie));
results.push(await measure(`GET /subjects/:id/status`, `/subjects/${subjectId}/status`, owner.cookie));
results.push(await measure('GET measurements 24h (limit 500)', `/subjects/${subjectId}/measurements?from=${iso(now - day)}&to=${iso(now)}&limit=500`, owner.cookie));
results.push(await measure('GET measurements 7d (limit 500)', `/subjects/${subjectId}/measurements?from=${iso(now - 7 * day)}&to=${iso(now)}&limit=500`, owner.cookie));
results.push(await measure('GET measurements 30d (limit 500)', `/subjects/${subjectId}/measurements?from=${iso(now - 30 * day)}&to=${iso(now)}&limit=500`, owner.cookie));
results.push(await measure('GET daily-summary (today)', `/subjects/${subjectId}/daily-summary?date=${iso(now).slice(0, 10)}`, owner.cookie));
results.push(await measure('GET export.csv 7d', `/subjects/${subjectId}/export.csv?from=${iso(now - 7 * day)}&to=${iso(now)}`, owner.cookie));
results.push(await measure('GET /subjects/:id/alerts', `/subjects/${subjectId}/alerts`, owner.cookie));
results.push(await measure('GET /notifications (owner)', '/notifications', owner.cookie));
results.push(await measure('GET /subjects/:id/assistant/summary', `/subjects/${subjectId}/assistant/summary`, owner.cookie));
results.push(await measure('GET /subjects (caregiver)', '/subjects', caregiver.cookie));
results.push(await measure('GET measurements 7d (caregiver)', `/subjects/${subjectId}/measurements?from=${iso(now - 7 * day)}&to=${iso(now)}&limit=500`, caregiver.cookie));
results.push(await measure('GET /admin/overview', '/admin/overview', admin.cookie));
results.push(await measure('GET /admin/users', '/admin/users', admin.cookie));
results.push(await measure('GET /admin/audit', '/admin/audit', admin.cookie));
results.push(await measure('GET /maintenance-tasks', '/maintenance-tasks', admin.cookie));
results.push(await measure('GET /workspace-views', '/workspace-views', admin.cookie));

const loginTimes = [];
for (let i = 0; i < 5; i += 1) {
  const t = performance.now();
  await login('ba-an@demo.annhien.local', 'demo-an-nhien-2026');
  loginTimes.push(performance.now() - t);
}
console.log('POST /auth/login (5 lần)'.padEnd(42), JSON.stringify(stats(loginTimes)));

// SSE: thời gian tới event đầu tiên (heartbeat) và số byte handshake.
const sseStart = performance.now();
const sseRes = await fetch(`${BASE}/subjects/${subjectId}/events`, {
  headers: { cookie: owner.cookie },
});
const reader = sseRes.body.getReader();
const first = await reader.read();
console.log(`\nGET /subjects/:id/events (SSE)`.padEnd(42), `status=${sseRes.status} headers=${(performance.now() - sseStart).toFixed(1)}ms firstChunk=${(performance.now() - sseStart).toFixed(1)}ms bytes=${first.value?.length ?? 0}`);
console.log('  chunk đầu:', new TextDecoder().decode(first.value ?? new Uint8Array()).slice(0, 200).replace(/\n/g, '\\n'));
await reader.cancel();

console.log('\nJSON:', JSON.stringify(results));
