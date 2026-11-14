# Handoff — wave3-be-admin

- **Thời điểm:** 2026-11-14 (Asia/Ho_Chi_Minh), sau wave 2
- **Worker:** be-admin
- **Vùng ghi:** `packages/contracts/src/{tasks,admin}.ts`, `apps/api/src/maintenance/**`,
  `apps/api/src/admin/**`, `apps/api/test/{tasks,admin}.spec.ts`, file này.
  Không sửa `app.module.ts`, `database/schema.ts`, module khác, `apps/web/**`, docs, `.env`;
  không chạy git/pnpm add.

## Đã làm

### Hợp đồng

- `packages/contracts/src/tasks.ts`: `maintenanceTaskStatusSchema`, `maintenanceTaskQuerySchema`
  (status=open|closed|all mặc định open, subjectId/deviceId/cursor/limit 1..100), `maintenanceTaskSummarySchema`
  (không chứa dữ liệu sức khỏe), `maintenanceTaskListSchema` (dùng `pageSchema`), `closeTaskSchema`
  (reason 3..500). Dùng lại `idSchema` từ core. Hằng số `OPEN_TASK_STATUSES`/`CLOSED_TASK_STATUSES`.
- `packages/contracts/src/admin.ts`: `adminUserSummarySchema` (chỉ id/email/displayName/role/status/createdAt —
  không hash/session), `adminUserListSchema`, `adminUserQuerySchema`, `updateUserStatusSchema`
  (status + reason tùy chọn; **không có trường role** — wave này không đổi role),
  `auditEntrySchema`/`auditListSchema`/`auditQuerySchema` (lọc actorUserId/action/targetType/targetId/from/to + cursor),
  `policyPreviewRequestSchema`/`policyPreviewSchema` (valid/value/digest/warnings/effectiveDiff),
  `policyPublishRequestSchema` (value + expectedVersion + note?) / `policyPublishSchema`,
  `policyStateSchema` (active + defaults + history ≤10), `adminOverviewSchema`.
  Bổ sung ngoài danh sách prompt (lead có thể đổi tên): `policyDiffEntrySchema`, `policyUserRefSchema`,
  `policyActiveSchema`, `policyHistoryEntrySchema`, `auditOutcomeSchema`, `POLICY_DEFAULTS`.

### `apps/api/src/maintenance/` (MaintenanceModule)

- `GET /maintenance-tasks?status&subjectId&deviceId&cursor&limit`:
  - Lọc `subjectId`: chủ hồ sơ xem hết; caregiver cần `canReceiveAlerts` (dùng lại `AccessService`,
    thiếu quyền → 403 vì đã có link); người ngoài và admin không có link → 404.
  - Không lọc `subjectId`: người thường thấy task của mọi hồ sơ mình sở hữu/chăm sóc có
    `canReceiveAlerts`; **admin chỉ thấy task không gắn subject** (`subjectId IS NULL`).
  - Sắp xếp `priority desc, dueAt asc nulls last, id desc`; cursor khớp đúng thứ tự này
    (cursor chứa `{priority, dueAt|'null', id}`); trả `{items, nextCursor}` — không có `unread`.
  - Lọc `deviceId` hoạt động độc lập và kết hợp với `subjectId`.
- `POST /maintenance-tasks/:id/close` body `{reason}` 3..500: chỉ chủ hồ sơ (task có subjectId)
  hoặc admin; task không gắn subject chỉ admin thấy/đóng (người thường → 404). Đã đóng → 409 kèm
  `{status, closedAt}`. Ghi `closedAt`, `closeReason`, `status='done'` + audit
  `maintenance_task.close` (metadata `{status:'done'}`). Trả task summary đã đóng.
- **Không tự sinh task định kỳ** trong wave này (chỉ đọc + đóng).

### `apps/api/src/admin/` (AdminModule)

- `GET /admin/users?query&status&cursor&limit`: search ILIKE email/displayName (escape `%_\\`),
  phân trang `(createdAt,id) desc`; response chỉ trường đã công bố — không passwordHash/tokenHash.
- `PATCH /admin/users/:id/status`: không tự disable chính mình (409); disable → update user +
  revoke mọi session `revoked_at is null` của user **trong cùng transaction** + audit
  `admin.user.disable`; enable → update + audit `admin.user.enable`, **không tạo session**;
  trạng thái không đổi → 409; không đổi role (schema không nhận).
- `GET /admin/audit`: chỉ admin; lọc actorUserId/action/targetType/targetId/from/to; cursor
  `(createdAt,id)` desc; metadata trả nguyên bản đã lọc khi ghi (không thêm dữ liệu sức khỏe).
  Không có endpoint sửa/xóa audit.
- `GET /admin/policies/:key` (key chỉ `device_runtime`, key khác → 404): trả
  `{key, active:{version,value,digest,source,updatedAt,updatedBy}, defaults, history≤10}`;
  `active` dùng lại `PolicyService.getActive` (version 0/source `default` khi chưa có bản DB).
- `POST /admin/policies/:key/previews` `{value}`: validate `policyValueSchema` (sai → 422 qua pipe),
  **không ghi DB** (kể cả audit); trả `{valid,value,digest,warnings,effectiveDiff}`. Cảnh báo 3 cặp:
  `offlineAfterSeconds < heartbeatIntervalSeconds`, `dataFreshAfterSeconds > offlineAfterSeconds`,
  `maxTelemetryPerMinute` ngoài ngưỡng hợp lý (hằng số `REASONABLE_TELEMETRY_MIN=10`/`_MAX=600` trong code).
- `PUT /admin/policies/:key` `{value, expectedVersion, note?}`: CAS — `expectedVersion` phải bằng
  version active hiện tại, lệch → 409 `APPROVAL_STALE` kèm `{currentVersion, currentDigest}`;
  transaction + `SELECT ... FOR UPDATE` trên bản active, version = max+1, digest canonical
  (`computePolicyDigest` dùng lại từ PolicyService — sort key), bản active cũ → archive, audit
  `policy.publish` metadata chỉ `{key, version, digest, note?}` — **không chứa value**.
  Phòng thủ thêm: unique `(key,scope,version)` → `APPROVAL_STALE` khi hai publish đầu tiên đồng thời.
  Không xóa lịch sử; rollback = publish lại value cũ với version mới (đã test).
- `GET /admin/overview`: đếm users active/disabled, subjects chưa archive, device online/offline
  theo `offlineAfterSeconds` của policy active (dùng lại `PolicyService.getActive`), alert open
  (`INCIDENT_OPEN_STATES`), task open (`open|in_progress`), outbox `pending|failed`. Chỉ admin.

## Kiểm đã chạy (kết quả thật)

| Lệnh (thư mục gốc repo) | Kết quả |
| --- | --- |
| `cd packages/contracts && pnpm build` | exit 0, sinh `dist/{tasks,admin}.js` |
| `cd packages/contracts && pnpm typecheck` | exit 0 |
| `cd apps/api && pnpm typecheck` | exit 0 |
| `cd apps/api && node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/tasks.spec.ts` | **1 suite, 7/7 pass** (~2.5s) |
| `cd apps/api && node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/admin.spec.ts` | **1 suite, 7/7 pass** (~2.4s) |
| `cd apps/api && node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/tasks.spec.ts test/admin.spec.ts` | **2 suites, 14/14 pass** (~4.2s) |
| `pnpm -r typecheck` (root) | exit 0 — contracts, simulator, web, api đều Done |
| Full suite `cd apps/api && node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand` | **14 suites, 100/100 pass** (~28–30s). Lưu ý: lần chạy full đầu tiên có **1 test lỗi thoáng qua** ở một suite khác (output không giữ lại được tên suite); **7 lần chạy full liên tiếp sau đó đều 14/14 suite, 100/100 test pass** — nghi do worker khác đang sửa file đồng thời lúc đó. Chưa tái lập được. |

Test bao phủ 7 nhóm prompt: T1 owner list/close + caregiver thiếu quyền 403/404 + task closed 409 +
audit; T2 admin list user + user thường 403 + disable revoke session (request cũ 401 ngay) +
không tự disable + enable; T3 audit chỉ admin + filter action/actor + cursor + không lộ secret
(kiểm cả key response user không có passwordHash/tokenHash); T4 preview không ghi DB (đếm
`policy_configs` trước–sau) + value sai 422 + warning đúng 3 cặp ngưỡng; T5 CAS version lệch 409
`APPROVAL_STALE` + archive bản cũ + audit không chứa value + history + rollback bằng publish lại;
T6 overview đếm đúng fixture + user thường 403; T7 hai publish đồng thời → một 200 một 409, đúng
một active (FR-11/FR-13 ghi trong tên test).

## Chưa làm / giới hạn

- **Enum schema không có `archived`**: `config_status` chỉ có `draft/active/retired` nên bản active
  cũ được archive bằng `status='retired'` (ngữ nghĩa tương đương "bản cũ đã thay thế"). Không sửa
  `database/schema.ts` (ngoài vùng ghi). Đề nghị lead chốt: đổi tên enum thành `archived` hoặc
  giữ `retired` và sửa prompt/docs.
- Không tạo task bảo trì định kỳ (đúng prompt wave này); không có endpoint sửa/xóa audit; không
  đổi role user (chỉ status).
- Policy preview không ghi audit (prompt yêu cầu "không ghi DB" — audit cũng là ghi nên bỏ qua;
  khác studio ghi `workspace_view.preview`).
- `policy_configs` không có cột `note` nên note publish chỉ nằm trong response + audit metadata,
  không hiển thị lại trong `GET /admin/policies/:key` history.
- Admin không có link không thấy task gắn subject kể cả khi không lọc (đúng prompt); admin có
  hồ sơ riêng vẫn xem task hồ sơ đó qua `?subjectId=` (requireSubject theo quyền hồ sơ).
- Đồng thời publish kiểm trên PGlite đơn kết nối: đúng hành vi CAS nhờ `FOR UPDATE` + unique
  `(key,scope,version)`, nhưng chưa phải bằng chứng trên PostgreSQL nhiều kết nối.

## Rủi ro tích hợp

1. **Chưa nối module vào `AppModule`** (thuộc lead): thêm `MaintenanceModule`, `AdminModule`
   vào imports của `apps/api/src/app.module.ts` (PolicyModule đã có sẵn). Cả hai module tự
   import `AuthModule` để resolve `SessionGuard` trên controller (giống StudioModule).
2. `AdminService` tiêm `PolicyService` từ `PolicyModule` — nếu lead đổi provider PolicyModule
   phải kiểm tra lại.
3. Response policy shape là đề xuất: `{key, active, defaults, history}`; fe-studio (task center,
   admin) cần khớp đúng `packages/contracts/src/admin.ts` (một nguồn duy nhất).
4. Sắp xếp task dùng `dueAt asc nulls last` + cursor riêng (không dùng cursor chung
   createdAt,id) — client phải dùng `nextCursor` nguyên văn, không tự dựng cursor.
5. Disable user chỉ revoke session `revoked_at is null`; session hết hạn tự nhiên không cần
   revoke (guard đã kiểm expiresAt). Đã kiểm "request cũ 401 ngay" trong test.
6. **Obsidian chưa cập nhật**: vault OneDrive (`C:\Users\nguye\OneDrive\Tài liệu\Obsidian Vault`)
   không truy cập được từ môi trường này (đường dẫn không tồn tại); không tạo vault thay thế.
   Cần đồng bộ OneDrive rồi cập nhật note dự án sau.
