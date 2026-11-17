// Tạo dữ liệu Studio cho bằng chứng lane A (API cục bộ, seed demo).
// Chạy SAU khi seed: node reports/qa/evidence/v7-a/seed-studio.mjs
const BASE = 'http://127.0.0.1:3400/api/v1';
const ORIGIN = 'http://127.0.0.1:4355';
const SUBJ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

let cookie = '';
async function call(path, method = 'GET', body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

await call('/auth/login', 'POST', { email: 'ba-an@demo.heart-iot.local', password: 'demo-heart-iot-2026' });

const published = await call('/workspace-views', 'POST', {
  key: 'tong-quan-hang-ngay',
  name: 'Tổng quan hằng ngày',
  scope: 'subject',
  subjectId: SUBJ,
  config: {
    version: 1,
    layout: 'grid',
    widgets: [
      { id: 'hr', type: 'metric', title: 'Nhịp tim gần nhất', span: 1 },
      { id: 'chart', type: 'chart', title: 'Nhịp tim theo mẫu', span: 2, options: { points: 30 } },
      { id: 'sum', type: 'summary', title: 'Tổng hợp 24 giờ', span: 2 },
      { id: 'alerts', type: 'alerts', title: 'Cảnh báo gần đây', span: 1 },
    ],
  },
});
const preview = await call(`/workspace-views/${published.id}/previews`, 'POST', {
  draftRevision: 1,
  previewSubjectId: SUBJ,
});
await call(`/workspace-views/${published.id}/publications`, 'POST', {
  draftRevision: 1,
  digest: preview.digest,
  baseRevision: 0,
  note: 'Bản đầu tiên',
});

const draft = await call('/workspace-views', 'POST', {
  key: 'theo-doi-pin',
  name: 'Theo dõi pin thiết bị',
  scope: 'user',
  config: {
    version: 1,
    layout: 'stack',
    widgets: [{ id: 'pin', type: 'metric', title: 'Pin thiết bị', span: 1, options: { field: 'batteryPercent' } }],
  },
});

console.log(JSON.stringify({ publishedId: published.id, draftId: draft.id }, null, 2));
