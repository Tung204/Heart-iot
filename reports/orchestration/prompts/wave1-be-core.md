# Prompt wave 1 — be-core (backend: hồ sơ, chia sẻ, quyền)

Repo: `C:/MyFolder/Hoc_Tap/project/DATN`. Bạn là **worker backend be-core**, không phải lead.

## Đọc trước khi code (bắt buộc)

1. `AGENTS.md`, `docs/12-nguyen-tac-phat-trien-va-bang-chung.md`.
2. `docs/14-ke-hoach-trien-khai-phan-mem.md` mục 4–8 (module, dữ liệu, API, cổng chất lượng).
3. `docs/02-yeu-cau-va-pham-vi.md` (FR-02, NFR-01), `docs/03-kien-truc-he-thong.md` (ranh giới quyền), `docs/04-du-lieu-va-giao-tiep.md` (care_links/invitations/API).
4. `reports/worklog/2026-11-14.md` mục 21:26 (nền tảng đã có), `reports/orchestration/README.md` mục 4–5.
5. Code nền: `apps/api/src/{access,auth,common,database,configure-app.ts}`, `apps/api/test/test-app.ts`, `packages/contracts/src/core.ts`.

## Vùng ghi được phép

- `apps/api/src/subjects/**`
- `apps/api/src/care/**`
- `packages/contracts/src/subjects.ts`
- `packages/contracts/src/care.ts`
- `apps/api/test/subjects.spec.ts`
- `apps/api/test/care.spec.ts`
- `reports/handoffs/wave1-be-core.md`

**Không sửa** `app.module.ts`, `database/schema.ts`, `access/**`, `auth/**`, `common/**`, `package.json`, docs, `docs/html`, file của worker khác. Không chạy `git`. Không `pnpm add`. Không đổi `.env`.

## Mục tiêu

Xây module hồ sơ + chia sẻ người thân, dùng `AccessService`/`AuditService` có sẵn.

### 1. `packages/contracts/src/subjects.ts`

Export (đúng tên, dùng zod 4 như `core.ts`):

- `createSubjectSchema`: `{ displayName: string.trim().min(1).max(120), timezone: string.min(1).max(64).default('Asia/Ho_Chi_Minh') }` strict.
- `updateSubjectSchema`: `displayName?`, `timezone?`, strict, ít nhất một trường (refine).
- `subjectSummarySchema`: `id, ownerUserId, displayName, timezone, role: subjectRoleSchema, permissions: carePermissionsSchema, sharedFrom: isoDateTimeSchema.nullable(), createdAt: isoDateTimeSchema`.
- `subjectListSchema`: `{ items: subjectSummarySchema[] }`.
- `subjectDetailSchema`: `subjectSummarySchema.extend({ archivedAt: isoDateTimeSchema.nullable() })`.
- Type tương ứng.

### 2. `packages/contracts/src/care.ts`

- `createInvitationSchema`: `{ email: z.email(), permissions: carePermissionsSchema, expiresInHours: int 1..720 default 72 }` strict.
- `invitationStatusSchema = z.enum(['pending','accepted','expired','revoked'])`.
- `invitationSummarySchema`: `id, subjectId, email (che ký tự giữa ở response cho caregiver? xem dưới), permissions, status, createdAt, expiresAt, acceptedAt nullable, revokedAt nullable`.
- `invitationCreatedSchema`: `{ invitation, token, acceptUrl }` — `token` chỉ trả một lần.
- `publicInvitationSchema`: `{ subjectName, inviterName, permissions, expiresAt, status }` — **không** có dữ liệu sức khỏe.
- `careLinkSummarySchema`: `{ id, subjectId, caregiver: userSummarySchema, permissions, status, sharedFrom, acceptedAt nullable, revokedAt nullable }`.
- `careLinkListSchema`: `{ items: careLinkSummarySchema[] }`.
- Type tương ứng.

### 3. `SubjectsModule` (`apps/api/src/subjects/`)

Routes (prefix `subjects`, guard phiên mặc định):

- `GET /subjects` → `{ items }` từ `AccessService.listAccessibleSubjects(user.id)`; map role/permissions.
- `POST /subjects` → owner tạo hồ sơ. Validate timezone bằng `Intl.DateTimeFormat(undefined,{timeZone})`, lỗi 422 nếu không hợp lệ. Audit `subject.create`. Trả 201 `subjectDetailSchema`.
- `GET /subjects/:id` → `access.requireSubject` (404 nếu không có quyền), trả chi tiết.
- `PATCH /subjects/:id` → chỉ owner (caregiver 403); audit; cập nhật.
- Mọi response parse qua zod schema trước khi trả (đảm bảo hợp đồng).
- Không cho caregiver đọc hồ sơ chưa chấp nhận/thu hồi (do AccessService lo, nhưng test phải chứng minh).

### 4. `CareModule` (`apps/api/src/care/`)

- `POST /subjects/:id/invitations` (owner):
  - Nếu email trùng chủ hồ sơ → 422.
  - Nếu đã có care link active cho user có email đó → 409.
  - Nếu đã có invitation pending cùng subject+email còn hạn → 409 (không tạo trùng).
  - Sinh token 32 byte base64url; chỉ lưu `sha256(token)`; hết hạn theo `expiresInHours`; audit `invitation.create`. Trả token một lần.
- `GET /subjects/:id/invitations` (owner) → danh sách invitation (email đầy đủ cho owner).
- `GET /invitations/:token` **public** (`@Public()`): tra theo hash; trả `publicInvitationSchema`; token sai/hết hạn/đã dùng → 404; không lộ email người được mời.
- `POST /invitations/:token/accept` (đăng nhập):
  - Email tài khoản phải khớp email lời mời (chuẩn hóa lowercase/trim), nếu không 403.
  - Token dùng một lần, transaction: đánh dấu acceptedAt/acceptedBy, tạo `care_links` active (unique active per subject+caregiver; nếu đã có → 409), audit `invitation.accept`.
  - Ghi `realtime_events` type `care.accepted` cho subject.
- `GET /subjects/:id/care-links` (owner): gồm active + revoked, join user.
- `DELETE /subjects/:id/care-links/:linkId` (owner): set status/revokedAt; audit `care_link.revoke`; ghi `realtime_events` type `care.revoked` (payload linkId, caregiverUserId). Người bị thu hồi mất quyền ngay qua AccessService.
- Owner không thể thu hồi link của hồ sơ khác; 404/403 đúng chính sách (không lộ tồn tại).
- Không cho owner tự tạo care link cho chính mình.

Dùng `AppError`, `ZodValidationPipe`, `AuditService`, `AccessService`, `DB`. Không kiểm quyền chỉ ở controller bằng role toàn cục.

### 5. Test bắt buộc (Jest, PGlite in-memory)

Dùng `createModuleTestApp([SubjectsModule, CareModule])` + `registerUser`/`createAdmin`/`loginUser` từ `test/test-app.ts`. Tạo dữ liệu qua API khi có thể; chèn DB trực tiếp khi cần.

Tối thiểu:

1. Tạo hồ sơ; `GET /subjects` trả đúng role owner; caregiver chưa có link nhận 404.
2. Mời → preview public không lộ dữ liệu sức khỏe; accept sai email 403; accept đúng tạo link; caregiver xem được; `permissions` giới hạn lịch sử phản ánh đúng.
3. Thu hồi → caregiver mất quyền ngay (GET 404), owner vẫn xem; audit có bản ghi.
4. Không tạo trùng active link/invitation; token dùng lại bị từ chối.
5. Non-owner không mời/thu hồi được; admin không tự xem hồ sơ nếu không có link (404).
6. Không có phiên → 401; origin lạ khi POST → 403 (đã có middleware, kiểm ít nhất một route).
7. Timezone sai → 422.

Chạy:

```bash
cd apps/api
pnpm typecheck
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/subjects.spec.ts test/care.spec.ts
```

Không dùng `sleep` dài; không để timer/socket mở. Không sửa test cũ để làm xanh.

## Kết thúc

Ghi `reports/handoffs/wave1-be-core.md` theo mẫu trong `reports/orchestration/README.md`: file đã tạo/đổi, lệnh + kết quả thật (số test pass/fail), phần chưa làm, rủi ro tích hợp, đề nghị lead. Nếu kẹt > 15 phút ở một lỗi, ghi handoff rồi dừng, không bịa kết quả.
