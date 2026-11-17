// Review v2 — chèn dữ liệu tổng hợp để đo: 2.040 audit_logs, 30 thiết bị + assignment, 200 thông báo.
// Chạy khi API ĐÃ DỪNG (PGlite độc quyền mỗi process), cwd=apps/api:
//   QADIR=<repo>/.data/review-perf node --input-type=module -e "$(cat ../../reports/qa/scripts/v2-bulk-data.mjs)"
// Chỉ dùng cho DB review riêng; không chạy trên .data/pglite của lead.
// Sinh dữ liệu tổng hợp để đo hiệu năng (chỉ trên DB review-perf riêng của reviewer).
import { PGlite } from '@electric-sql/pglite';

const dataDir = process.env.QADIR;
const db = new PGlite(dataDir);
await db.waitReady;

const subjectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownerId = (await db.query(`select id from users where email = 'ba-an@demo.annhien.local'`)).rows[0].id;
const caregiverId = (await db.query(`select id from users where email = 'minh@demo.annhien.local'`)).rows[0].id;
const incidentId = (await db.query(`select id from incidents order by detected_at desc limit 1`)).rows[0].id;

// 1) 2.000 bản ghi audit (đo trang audit + export khi lịch sử dài).
await db.exec(`
  insert into audit_logs (actor_user_id, actor_kind, action, target_type, target_id, outcome, request_id, metadata, created_at)
  select '${ownerId}', 'user', 'review.perf.synthetic', 'subject', '${subjectId}', 'success',
         'perf-' || g, '{"synthetic":true}'::jsonb, now() - (g || ' seconds')::interval
  from generate_series(1, 2000) g
  on conflict do nothing;
`);

// 2) 30 thiết bị gán cho hồ sơ demo (đo N+1 khi liệt kê thiết bị/trạng thái).
await db.exec(`
  insert into devices (id, serial, label, credential_hash, status, created_at, updated_at)
  select gen_random_uuid(), 'PERF-' || g, 'Thiết bị đo hiệu năng ' || g, 'x', 'active', now(), now()
  from generate_series(1, 30) g
  on conflict do nothing;
`);
await db.exec(`
  insert into device_assignments (id, device_id, subject_id, assigned_by_user_id, started_at)
  select gen_random_uuid(), d.id, '${subjectId}', '${ownerId}', now() - interval '1 hour'
  from devices d where d.serial like 'PERF-%'
  on conflict do nothing;
`);

// 3) 200 thông báo đã gửi cho caregiver (đo hộp thư dài).
await db.exec(`
  insert into notification_outbox (id, incident_id, revision, recipient_user_id, channel, status, attempts, next_attempt_at, sent_at, dedupe_key, created_at, updated_at)
  select gen_random_uuid(), '${incidentId}', 1000 + g, '${caregiverId}', 'in_app', 'sent', 1, now(), now() - (g || ' minutes')::interval,
         'perf-notify-' || g, now() - (g || ' minutes')::interval, now() - (g || ' minutes')::interval
  from generate_series(1, 200) g
  on conflict do nothing;
`);

const counts = await db.query(`
  select
    (select count(*) from audit_logs)::int as audit_rows,
    (select count(*) from devices)::int as devices,
    (select count(*) from device_assignments where ended_at is null)::int as open_assignments,
    (select count(*) from notification_outbox where status = 'sent')::int as sent_notifications,
    (select count(*) from telemetry)::int as telemetry,
    (select count(*) from telemetry where measured_at is not null)::int as telemetry_synced
`);
console.log(JSON.stringify(counts.rows[0]));
await db.close();
