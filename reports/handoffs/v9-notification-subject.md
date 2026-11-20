# Handoff — V9.2a hạ tầng thông báo theo hồ sơ

Ngày 20/11/2026. Phạm vi: **chỉ hạ tầng** để thông báo chăm sóc không cần incident. Chưa có scheduler, quy tắc nhắc chủ động hay bản tin tự động; chưa đổi quyền chia sẻ (D3 vẫn mở).

## Đã làm

- `notification_outbox`: thêm `subject_id` (FK, nullable để tương thích), `kind` (`alert|update|escalation|care_digest|care_rule`, check), `title`, `body`; `incident_id`/`revision` nullable; index `(subject_id, kind)`.
- Migration `apps/api/drizzle/0004_shocking_kulan_gath.sql`:
  - backfill `subject_id` từ `incidents`;
  - backfill `kind='update'` cho bản ghi cũ có `dedupe_key` kết thúc `:update` (trước đây service suy kind bằng chuỗi).
- `packages/contracts/src/notifications.ts`: `incidentId`/`incidentType`/`state`/`revision` nullable; `title`/`body` optional/nullable; thêm kind mới.
- `notifications.service.ts`:
  - bỏ `outboxKind`, dùng cột `kind`;
  - worker alert/update vẫn cần incident; care kind không cần incident;
  - quyền care tạm dùng `canViewMeasurements` (một helper `requiresAlertPermission`/`recipientAllowed`);
  - list/read dùng `subject_id`, cửa sổ `historyDays/sharedFrom` với mốc `incident.detectedAt ?? outbox.createdAt`;
  - row care thiếu `subject_id` → `failed`, không lặp vô hạn.
- `incidents.service.ts`: insert outbox có `subjectId` + `kind`; supersede chỉ áp `kind='alert'`.
- Seed: hai thông báo mẫu có `subjectId`/`kind='alert'`.
- Web:
  - `NotificationsPage` hiển thị care bằng `title/body` + tên hồ sơ, không có link “Xem cảnh báo”;
  - hàng care vẫn đánh dấu đọc được;
  - `.inbox-item__body` cho nội dung dài.

## Bằng chứng

Chạy ngày 20/11/2026:

- `pnpm --filter @heart-iot/api test` → **261 test / 24 suite pass** (thêm 5 test V9.2a).
- `pnpm --filter @heart-iot/api typecheck` → pass.
- `pnpm --filter @heart-iot/web exec vitest run` → **43 file / 386 test pass** (thêm 1 test care).
- `pnpm --filter @heart-iot/web build` → pass.
- `pnpm --filter @heart-iot/web test:e2e` → **26/26 pass**.
- Seed DB mới `.data/v9notif`: `outbox=2`; gọi `GET /notifications` bằng chủ hồ sơ trả 1 mục `kind=alert`, `incidentId` có giá trị, `unreadCount=1`, `title/body=null`.

## Sai lệch / giới hạn

- Migration `0004` mới chạy trên DB PGlite tạo mới; **chưa chạy trên bản sao DB v8 thật**. Backfill `kind='update'` dựa vào đuôi `dedupe_key` một lần; cần kiểm trên DB thật trước khi phát hành.
- `subject_id` vẫn nullable vì insert cũ/test cũ; row thiếu subject bị loại khỏi list và worker care đánh `failed`. Không có ràng buộc DB “care phải có subject”.
- Chưa có producer `care_digest`/`care_rule`; chưa có scheduler/`subject_rules`/`job_runs`.
- Care tạm dùng `canViewMeasurements`; khi D3 chốt `canViewCare` phải đổi helper và test quyền.
- UI care mới kiểm bằng unit test, **chưa có ảnh/kiểm trình duyệt thật**; chưa kiểm Firefox/WebKit/screen reader.
- Chưa chạy PostgreSQL thật, chưa có CI.

## File chính

- `apps/api/src/database/schema.ts`
- `apps/api/drizzle/0004_shocking_kulan_gath.sql`
- `apps/api/src/notifications/notifications.service.ts`
- `apps/api/src/incidents/incidents.service.ts`
- `apps/api/test/notifications-care.spec.ts`
- `packages/contracts/src/notifications.ts`
- `apps/web/src/features/notifications/NotificationsPage.tsx`
- `apps/web/src/features/notifications/NotificationsPage.test.tsx`
