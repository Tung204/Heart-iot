// Review v2 — A/B N+1: /subjects/:id/status + /devices khi 30 thiết bị (PERF-*) vs 1 thiết bị.
// Chạy: node reports/qa/scripts/v2-api-devices-n1.mjs  (DB phải có 30 thiết bị PERF-*: chạy v2-bulk-data.mjs)
// Lưu ý: script POST /devices/:id/release 29 thiết bị PERF-* (chỉ trên DB review).
// A/B N+1: đo /subjects/:id/status + /subjects/:id/devices khi hồ sơ có 31 thiết bị,
// sau đó release 30 thiết bị tổng hợp (PERF-*) và đo lại cùng process/cùng cache.
const BASE = 'http://localhost:3201/api/v1';
const N = 20;

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ba-an@demo.annhien.local', password: 'demo-an-nhien-2026' }),
  });
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}

async function stats(path, cookie) {
  const times = [];
  let bytes = 0;
  let status = 0;
  for (let i = -1; i < N; i += 1) {
    const t = performance.now();
    const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
    const text = await res.text();
    if (i >= 0) {
      times.push(performance.now() - t);
      bytes = Buffer.byteLength(text);
      status = res.status;
    }
  }
  const s = [...times].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  return { status, p50: +at(50).toFixed(1), p95: +at(95).toFixed(1), kb: +(bytes / 1024).toFixed(1) };
}

const cookie = await login();
const subjectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const list = async () =>
  (await (await fetch(`${BASE}/subjects/${subjectId}/devices`, { headers: { cookie } })).json()).items;

const before = await list();
console.log(`thiết bị đang gán: ${before.length}`);
console.log('A) 31 thiết bị');
console.log('  /subjects/:id/status   ', JSON.stringify(await stats(`/subjects/${subjectId}/status`, cookie)));
console.log('  /subjects/:id/devices  ', JSON.stringify(await stats(`/subjects/${subjectId}/devices`, cookie)));

let released = 0;
for (const device of before) {
  if (!device.serial.startsWith('PERF-')) continue;
  const res = await fetch(`${BASE}/devices/${device.deviceId}/release`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'review perf' }),
  });
  if (res.ok) released += 1;
  else console.log('  release lỗi', res.status, (await res.text()).slice(0, 160));
}
console.log(`  đã release ${released} thiết bị tổng hợp`);
console.log(`thiết bị còn: ${(await list()).length}`);
console.log('B) 1 thiết bị');
console.log('  /subjects/:id/status   ', JSON.stringify(await stats(`/subjects/${subjectId}/status`, cookie)));
console.log('  /subjects/:id/devices  ', JSON.stringify(await stats(`/subjects/${subjectId}/devices`, cookie)));
