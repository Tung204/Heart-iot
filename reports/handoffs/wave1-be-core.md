# Handoff — wave1-be-core

- **Thời điểm:** 2026-11-14 21:46 (Asia/Ho_Chi_Minh)
- **Worker:** be-core
- **Vùng ghi:** `packages/contracts/src/{subjects,care}.ts`, `apps/api/src/subjects/**`, `apps/api/src/care/**`, `apps/api/test/{subjects,care}.spec.ts`, file này.

## Đã làm

### Hợp đồng (packages/contracts)

- `src/subjects.ts`: `createSubjectSchema` (displayName trim 1–120, timezone default `Asia/Ho_Chi_Minh`, strict), `updateSubjectSchema` (strict, refine ít nhất một trường), `subjectSummarySchema`, `subjectListSchema`, `subjectDetailSchema` + các type tương ứng.
- `src/care.ts`: `createInvitationSchema` (email `z.email()`, permissions, `expiresInHours` int 1–720 default 72, strict), `invitationStatusSchema`, `invitationSummarySchema`, `invitationCreatedSchema` (chỉ trả `token` một lần), `publicInvitationSchema` (không email, không dữ liệu sức khỏe), `careLinkSummarySchema`, `careLinkListSchema` + type.
- Bổ sung ngoài danh sách prompt vì cần để “mọi response parse qua zod”: `invitationListSchema` (danh sách invitation của owner), `invitationTokenSchema` (validate param `:token`). Lead có thể đổi tên nếu muốn.

### SubjectsModule (`apps/api/src/subjects/`)

- `GET /subjects`: danh sách từ `AccessService.listAccessibleSubjects`, map role/permissions/sharedFrom; parse qua `subjectListSchema`.
- `POST /subjects`: tạo hồ sơ (201), validate timezone bằng `Intl.DateTimeFormat` (422 nếu không hợp lệ), audit `subject.create`; parse qua `subjectDetailSchema`.
- `GET /subjects/:id`: `access.requireSubject` → 404 nếu không có quyền (không lộ tồn tại).
- `PATCH /subjects/:id`: chỉ owner (caregiver 403), validate timezone, audit `subject.update` (metadata chỉ tên trường, không chứa giá trị).

### CareModule (`apps/api/src/care/`)

- `POST /subjects/:id/invitations` (owner): email trùng chủ hồ sơ → 422; care link active cho email đó → 409; invitation pending còn hạn cùng subject+email → 409. Token 32 byte base64url, chỉ lưu `sha256(token)`, hết hạn theo `expiresInHours`, audit `invitation.create`. Trả `{ invitation, token, acceptUrl }` (acceptUrl = `WEB_ORIGIN/invitations/<token>` — đề nghị lead chốt đường dẫn web thật).
- `GET /subjects/:id/invitations` (owner): email đầy đủ, trạng thái tính theo thời gian thực (pending/accepted/expired/revoked).
- `GET /invitations/:token` (`@Public()`): tra theo hash; token sai/hết hạn/đã dùng → 404; trả `publicInvitationSchema` (subjectName, inviterName, permissions, expiresAt, status `pending`), không lộ email người được mời.
- `POST /invitations/:token/accept` (đăng nhập): transaction với `FOR UPDATE` trên invitation; email tài khoản phải khớp (chuẩn hóa lowercase/trim) → 403 nếu sai; đánh dấu `acceptedAt/acceptedByUserId`, tạo `care_links` active (unique index chống trùng, race → 409), ghi `realtime_events` type `care.accepted` (payload `{ linkId, caregiverUserId }`), audit `invitation.accept`. Trả 201 `careLinkSummarySchema` (chưa có schema response riêng trong hợp đồng; nếu lead muốn bọc `{ link }` hoặc trả subject thì nói rõ).
- `GET /subjects/:id/care-links` (owner): active + revoked, join user.
- `DELETE /subjects/:id/care-links/:linkId` (owner, 204): set status `revoked` + `revokedAt`; audit `care_link.revoke`; realtime `care.revoked` (payload `{ linkId, caregiverUserId }`). Người bị thu hồi mất quyền ngay qua AccessService (test chứng minh 404 ngay sau DELETE).
- Chính sách 404/403: người lạ không có quyền vào subject → 404 (không lộ tồn tại); caregiver có quyền xem nhưng không phải owner → 403; thu hồi link của hồ sơ khác → 404. Chặn owner tự mời/tạo link cho chính mình (422 khi mời chính chủ, 409 phòng thủ khi accept).
- Toàn bộ quyền kiểm qua `AccessService`; không có kiểm quyền bằng role toàn cục.

## Kiểm đã chạy (kết quả thật)

| Lệnh (thư mục) | Kết quả |
| --- | --- |
| `cd packages/contracts && pnpm typecheck` | exit 0 |
| `cd packages/contracts && pnpm build` | exit 0, sinh `dist/{subjects,care}.js` |
| `cd apps/api && pnpm typecheck` | **exit 2 — 9 lỗi, tất cả ở `src/devices/**` và `src/ingest/**` của worker be-data đang viết song song; không có lỗi nào ở `src/subjects/**`, `src/care/**` hay test của tôi** |
| `cd apps/api && node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/subjects.spec.ts test/care.spec.ts` | **2 suites passed, 11/11 tests pass** (~4.3s) |
| `cd apps/api && node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/auth.spec.ts` (hồi quy) | 6/6 pass |

## Bằng chứng hành vi trong test (FR-02, NFR-01, NFR-05)

- FR-02/NFR-01: tạo hồ sơ → list/detail role owner; người không có liên kết → 404; mời → preview public không email/không dữ liệu sức khỏe → accept sai email 403, đúng email tạo link → caregiver xem với đúng `permissions` (historyDays 7); thu hồi → caregiver 404 ngay, owner vẫn xem, audit `care_link.revoke` + realtime `care.revoked` có bản ghi; non-owner không mời/thu hồi (403/404); admin không tự xem hồ sơ (404).
- Chống trùng: invitation pending trùng → 409; link active trùng email → 409; token dùng lại/hết hạn → 404; DB chỉ lưu `sha256(token)`.
- 401 khi không có phiên; 403 khi POST/PATCH/DELETE với Origin lạ (middleware); timezone sai → 422.

## Chưa làm / giới hạn

- Không nối `SubjectsModule`/`CareModule` vào `AppModule` (thuộc lead).
- Không sửa `test/test-app.ts`: `createModuleTestApp` **không đăng ký `APP_GUARD`/`APP_FILTER`** (chỉ có trong `AppModule`), nên route test không qua `SessionGuard` và lỗi không theo envelope. Tôi bù bằng module cục bộ `GuardInfraModule` (import `AuthModule`, provide `APP_GUARD: SessionGuard`, `APP_FILTER: ApiExceptionFilter`) khai báo trong từng spec — không sửa code nền. Đề nghị lead cập nhật `test-app.ts` cho các worker sau.
- Mã hóa/che email: danh sách invitation chỉ có owner xem nên trả email đầy đủ (đúng “email đầy đủ cho owner”); preview public không có email. Ghi chú “che ký tự giữa ở response cho caregiver” trong prompt không phát sinh endpoint nào cho caregiver, nên chưa cần implement mask.
- `GET /subjects/:id/status` (docs/14) chưa làm — không nằm trong prompt wave này.
- Chưa chạy: full test suite (có file test của worker khác đang dang dở), build production, PostgreSQL thật, SSE đọc realtime events.

## Rủi ro tích hợp

1. **Typecheck toàn repo đang đỏ do worker song song**: 9 lỗi ở `src/devices/**`, `src/ingest/**` (TS18048/TS2532/TS2322) — không liên quan vùng tôi. Lead cần đợi be-data xong hoặc không coi `pnpm typecheck` là cổng xanh khi có worker đang chạy. File tôi viết typecheck sạch.
2. **Guard trong module test**: nếu lead sửa `createModuleTestApp` để tự đăng ký APP_GUARD/APP_FILTER, hai spec của tôi có thể bị double-guard (guard chạy 2 lần nhưng idempotent) — không phá hành vi, chỉ nên gỡ `GuardInfraModule` khi đó.
3. **Race tạo invitation trùng**: pre-check + không có unique index DB cho (subject_id, email_normalized) khi pending. Hai request đồng thời có thể tạo 2 invitation pending cùng email (accept sẽ chặn cái thứ hai). Đề nghị lead thêm partial unique index khi sở hữu schema (vùng của lead).
4. **`acceptUrl`**: đang là `${WEB_ORIGIN}/invitations/<token>` — đường dẫn web chưa tồn tại; fe-shell cần khớp hoặc lead đổi hợp đồng.
5. **Response accept**: đang trả 201 + `careLinkSummarySchema` trực tiếp. Nếu frontend cần subject sau accept thì phải gọi thêm `GET /subjects`; chốt schema response với lead.
6. `care.service.ts` import `toUserSummary` từ `auth/auth.service.ts` (đã export sẵn) — nếu auth refactor thì chỉ cần cập nhật import.
7. Realtime events đã ghi vào `realtime_events` nhưng chưa có consumer (SSE thuộc be-alerts); kiểm tra end-to-end realtime chưa chạy.

## Đề nghị lead

- Sau khi các worker wave 1 xong: nối `SubjectsModule` + `CareModule` vào `AppModule`, chạy `pnpm -r typecheck` và full suite, kiểm double-guard nếu sửa `test-app.ts`.
- Chốt: đường dẫn `acceptUrl` phía web, schema response của `POST /invitations/:token/accept`, partial unique index cho invitation pending (mục 3 ở trên).
- Không có thay đổi nào ngoài vùng ghi; không chạy git, không thêm dependency, không đổi `.env`.
