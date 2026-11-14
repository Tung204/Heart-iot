# Prompt worker — be-admin (wave 3)

Bạn là **be-admin**, worker backend của dự án An Nhiên. Repo `C:/MyFolder/Hoc_Tap/project/DATN`.
Đọc prompt này rồi **thực thi ngay**, không chỉ lập kế hoạch.

## Bối cảnh bắt buộc đọc

1. `docs/11-nen-tang-ai-va-cau-hinh-dong.md` mục cấu hình động, preview/publish.
2. `docs/14-ke-hoach-trien-khai-phan-mem.md` mục 6 (nhóm Bảo trì, Admin) và mục 8.
3. `docs/02-yeu-cau-va-pham-vi.md` — quyền admin, audit, policy.
4. Code: `access/{access,audit}.service.ts`, `policy/policy.service.ts`, `auth/*`,
   `database/schema.ts` (`maintenanceTasks`, `policyConfigs`, `auditLogs`, `users`, `sessions`),
   `packages/contracts/src/{tasks,admin,policies}.ts` (exports đã khai báo, có thể chưa có file).
5. Test harness `apps/api/test/test-app.ts`.

## Vùng ghi

- `packages/contracts/src/tasks.ts`, `packages/contracts/src/admin.ts`
- `apps/api/src/maintenance/**`, `apps/api/src/admin/**`
- `apps/api/test/{tasks,admin}.spec.ts`
- `reports/handoffs/wave3-be-admin.md`

**Không** sửa `app.module.ts`, `database/schema.ts`, module khác, `apps/web/**`, docs, HTML,
`.env`; không chạy `git`, không `pnpm add`, không đổi `.env` thật.

## Phần A — Bảo trì (`/maintenance-tasks`)

- `GET /maintenance-tasks?status=open|closed|all&subjectId&deviceId&cursor&limit`:
  - Chủ hồ sơ thấy task của thiết bị thuộc hồ sơ mình; caregiver cần quyền `canReceiveAlerts`
    (dùng lại AccessService, không tự viết lại luật); người ngoài 404; admin không có link → 404
    (trừ khi task không gắn subject — chỉ admin thấy).
  - Trả `items`, `nextCursor`, `unread` không cần; sắp xếp priority desc, dueAt asc null cuối.
- `POST /maintenance-tasks/:id/close` body `{reason}` (3..500):
  - Chỉ owner hoặc admin; task đã closed → 409; ghi `closedAt`, `closeReason`, audit.
  - Response là task summary đã đóng.
- Không tự tạo task định kỳ trong wave này. Ghi rõ.
- `tasks.ts`: `maintenanceTaskSummarySchema`, `maintenanceTaskListSchema`, `closeTaskSchema`,
  `maintenanceTaskQuerySchema`; dùng lại `idSchema`.

## Phần B — Admin

### Người dùng
- `GET /admin/users?query&status&cursor&limit`: email, displayName, role, status, createdAt.
  Không trả hash/session.
- `PATCH /admin/users/:id/status` body `{status:'active'|'disabled', reason?}`:
  - Không tự disable chính mình (409/422).
  - Khi disable: cập nhật user + **revoke mọi session đang hoạt động** của user trong cùng
    transaction; audit. Khi active lại: audit, không tạo session.
  - Không cho đổi role trong wave này (ghi rõ).

### Audit
- `GET /admin/audit?actorUserId&action&targetType&targetId&from&to&cursor&limit`:
  chỉ admin; trả metadata đã lưu (không thêm dữ liệu sức khỏe), cursor `(createdAt,id)` desc.
- Không cho sửa/xóa audit.

### Policy động
- `GET /admin/policies/:key` — key hiện chỉ `device_runtime`; trả active value + version +
  digest + source + `defaults`, và 10 bản gần nhất.
- `POST /admin/policies/:key/previews` body `{value}` — validate bằng `policyValueSchema`,
  **không ghi DB**; trả `{valid, value, digest, warnings, effectiveDiff}`.
  Cảnh báo khi offlineAfterSeconds < heartbeatIntervalSeconds, dataFreshAfterSeconds >
  offlineAfterSeconds, maxTelemetryPerMinute quá cao/thấp (ngưỡng hợp lý ghi trong code).
- `PUT /admin/policies/:key` body `{value, expectedVersion, note?}`:
  - CAS: expectedVersion phải bằng version active hiện tại → lệch 409 `APPROVAL_STALE`
    kèm `currentVersion`/`currentDigest`; transaction + `FOR UPDATE`.
  - Archive bản active cũ (`status='archived'`), insert version mới `active`, digest canonical
    (sort key), audit `policy.publish` metadata không chứa value đầy đủ (chỉ key/version/digest).
  - Không xóa lịch sử; rollback = publish lại value cũ với version mới.
- `GET /admin/overview`: đếm user active/disabled, subject, device online/offline theo policy,
  alert open, task open, outbox pending/failed. Chỉ admin.

### Hợp đồng `admin.ts`
`adminUserSummarySchema`, `adminUserListSchema`, `updateUserStatusSchema`,
`auditEntrySchema`, `auditListSchema`, `policyPreviewRequestSchema`, `policyPreviewSchema`,
`policyPublishSchema`, `policyStateSchema` (kèm history), `adminOverviewSchema`.
Không trả `credentialHash`, `tokenHash`, cookie, hay nội dung sức khỏe.

## Kiểm phải chạy

```bash
cd packages/contracts && pnpm build
cd apps/api && pnpm typecheck
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/tasks.spec.ts test/admin.spec.ts
```

Test tối thiểu:
1. Owner list/close task; caregiver thiếu quyền 403/404; task closed 409; audit có bản ghi.
2. Admin list user; user thường 403; disable user revoke session (request cũ 401 ngay);
   không tự disable; enable lại.
3. Audit list chỉ admin, filter action, cursor phân trang, không lộ secret.
4. Policy preview không ghi DB; value sai 422; warning đúng cặp ngưỡng.
5. Policy publish CAS: version lệch 409; thành công archive bản cũ + version mới active;
   audit; GET trả history; rollback bằng publish lại value cũ.
6. Overview đếm đúng fixture; user thường 403.
7. Hai publish đồng thời → một thành công, một 409, đúng một active.

Ghi lệnh + kết quả thật vào `reports/handoffs/wave3-be-admin.md`. Nếu kẹt >15 phút ở một lỗi,
dừng và ghi handoff trung thực.
