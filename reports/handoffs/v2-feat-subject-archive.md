# Handoff — lưu trữ hồ sơ và ghi nhận yêu cầu xóa dữ liệu (v2)

- **Nhánh:** `feat-subject-archive`
- **Commit feature:** `103fb71` — `feat(api,web): lưu trữ hồ sơ và ghi nhận yêu cầu xóa dữ liệu`
- **Thời điểm:** 2026-11-15 (Asia/Ho_Chi_Minh)
- **Phạm vi finding:** `reports/qa/v2-product-gaps.md` P1-6 (FR-14), `reports/qa/v2-privacy-ethics.md` P1-5
- **File thay đổi:**
  - `packages/contracts/src/subjects.ts`
  - `apps/api/src/subjects/subjects.controller.ts`
  - `apps/api/src/subjects/subjects.service.ts`
  - `apps/api/test/subjects.spec.ts`
  - `apps/web/src/features/subjects/SubjectsPage.tsx`
  - `apps/web/src/features/subjects/SubjectsPage.test.tsx` (mới)
  - `apps/web/src/features/subjects/subjects.css` (mới)
- **Không sửa:** schema/migration (`archived_at` có sẵn), `app.module`, router, `AppShell`, `layout.css`, docs, `api.ts` dùng chung của feature.

## 1. Đã làm

### Hợp đồng (`packages/contracts/src/subjects.ts`)

- `archiveSubjectSchema`: `reason` 3–500 (trim), `confirmationName` 1–120 (trim), strict.
- `deletionRequestSchema`: `reason` 10–1000 (trim), `confirmationName` 1–120 (trim), strict.
- `deletionRequestRecordedSchema`: `{ id: uuid, status: 'recorded', recordedAt: iso, note: string }`.

### API

**`POST /subjects/:id/archive`** → `204`

- Chỉ chủ hồ sơ:
  - người không có liên kết → `404`;
  - caregiver có care link đang hiệu lực → `403`;
  - hồ sơ đã lưu trữ (owner gọi lại) → `409`.
- `confirmationName` phải khớp `displayName` sau trim + Unicode NFC + không phân biệt hoa/thường; sai → `400` (`VALIDATION_FAILED`).
- Transaction:
  - set `archived_at`, `updated_at`;
  - thu hồi mọi care link `active`: `status = revoked`, `revoked_at`;
  - ghi `realtime_events` loại `care.revoked` cho từng link;
  - audit `care_link.revoke` (metadata `subjectId`, `caregiverUserId`, `cause: 'subject.archive'`);
  - audit `subject.archive` (metadata `reason`, `revokedCareLinks`).
- Không xóa telemetry/cảnh báo/bản xuất/bản sao AI.
- Sau archive, `AccessService` (đã lọc `archivedAt is null`) làm hồ sơ biến khỏi list/detail/status/alerts/SSE của cả owner và caregiver. Test kiểm list rỗng + các đường đọc trả `404`.

**`POST /subjects/:id/deletion-requests`** → `202`

- Chỉ chủ hồ sơ; caregiver có link → `403`, người ngoài → `404`.
- Kiểm `reason` 10–1000 và `confirmationName` khớp tên (thống nhất với archive; yêu cầu gốc chỉ nêu owner-only, đây là kiểm bổ sung có chủ ý).
- **Không xóa dữ liệu, không tạo bảng mới.** Sinh UUID cho yêu cầu, ghi audit `subject.deletion_request` (metadata `deletionRequestId`, `reason`, `status: 'recorded'`, `recordedAt`).
- Response `note` nói rõ: ghi nhận thủ công; số đo/cảnh báo/bản xuất/AI/cache/backup **chưa bị xóa**; bản demo chưa có quy trình xóa tự động.
- Gọi được cả khi hồ sơ đã archive (owner vẫn là owner; không có UI cho trường hợp này).

Audit không chứa số đo, token, mật khẩu hay tên người khác; chỉ id kỹ thuật và lý do do owner nhập.

### Web — `SubjectsPage`

- Chỉ owner thấy nhóm nút nguy hiểm: **Lưu trữ hồ sơ**, **Yêu cầu xóa dữ liệu** (variant `danger-quiet`); caregiver không thấy.
- Form tại chỗ (không `window.confirm/prompt`), có:
  - giải thích hậu quả archive: mất quyền truy cập, thu hồi chia sẻ, dữ liệu **không bị xóa**, không hoàn tác;
  - form xóa nói rõ chỉ ghi nhận, chưa xóa ngay, chưa có job xóa tự động;
  - lý do + ô gõ đúng tên; validate bằng schema hợp đồng, lỗi theo trường và `aria-invalid`;
  - focus tự vào ô lý do; `aria-expanded`/`aria-controls`; tab đi tiếp tới ô xác nhận tên.
- Sau archive thành công: đóng form, invalidate danh sách, xóa cache con của hồ sơ (`queryKeys.subject(id)`), thông báo `role=status`, chuyển hồ sơ đang xem sang hồ sơ còn lại (hoặc bỏ chọn nếu hết).
- Sau yêu cầu xóa thành công: hiển thị `note`, mã ghi nhận, thời điểm; hồ sơ vẫn còn trên danh sách.
- Lỗi `409/404` có thông báo tiếng Việt và tải lại danh sách; lỗi khác hiển thị message API.
- CSS feature dùng design tokens, không sửa `layout.css`; nhóm nút nguy hiểm tách vách ngăn trên desktop và xuống hàng toàn chiều rộng ở mobile.

## 2. Kiểm chứng đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --prefer-offline --frozen-lockfile` | PASS (711 packages) |
| `pnpm build:contracts` | PASS |
| `pnpm --filter @annhien/api typecheck` | PASS |
| `pnpm --filter @annhien/web typecheck` | PASS |
| `pnpm --filter @annhien/api test` | PASS — **18 suite / 166 test** |
| `pnpm --filter @annhien/web test` | PASS — **25 file / 127 test** (gồm 4 test mới `SubjectsPage.test.tsx`; không phá test cũ) |
| `pnpm --filter @annhien/web build` | PASS |

Test API mới bao phủ: owner archive, tên xác nhận trim/khác hoa-thường, sai tên `400`, lý do ngắn `422`, archive lần hai `409`, caregiver có link `403`, người ngoài `404`, list/detail/status/alerts/SSE `404` sau archive, care link revoked + `care.revoked`, audit archive/revoke, telemetry còn nguyên; deletion request `202`, không xóa telemetry/hồ sơ, audit reason/status, owner-only, validation.

Smoke giao diện thật (PGlite tạm, API cổng 3215, web 5185, Chromium):

- archive và deletion request chạy end-to-end với API thật; hồ sơ archive biến khỏi danh sách, hồ sơ xóa vẫn còn;
- `document.documentElement.scrollWidth === clientWidth` ở 1280, 390, form 390 và chế độ chữ lớn 20px;
- focus tự vào textarea lý do, `Tab` chuyển đúng sang ô xác nhận tên;
- không có lỗi console/page error (ngoài `401 /me` trước đăng nhập là bình thường).
- DB/cổng/log/ảnh tạm đã xóa sau kiểm; không commit ảnh.

## 3. Giới hạn và việc còn lại

1. **Chưa có quy trình xóa thật**: yêu cầu xóa chỉ ghi audit; chưa xóa DB, file export, cache, AI summary hay backup. Đúng giới hạn `docs/04` mục “Retention và xóa”, nhưng **không được báo “đã xóa”**.
2. **Không có UI xem/khôi phục hồ sơ đã lưu trữ**. `GET /subjects/:id` của owner trả `404` sau archive; chỉ audit còn dấu vết. Nếu cần khôi phục phải làm feature riêng có quyết định thiết kế.
3. **Pending invitation không bị set `revoked_at`** khi archive; chúng không chấp nhận được vì `care.service` đã kiểm `subjects.archivedAt`, nhưng dữ liệu lời mời vẫn nằm trong DB tới khi hết hạn.
4. **SSE đang mở**: code dựa vào `AccessService` kiểm lại mỗi vòng poll và `care.revoked` đã ghi; test mới kiểm kết nối mới bị `404` + event row, chưa mở stream dài hạn trong `subjects.spec`. Hành vi thu hồi stream đã có test riêng ở `sse.spec`.
5. **Chưa kiểm với dữ liệu/người dùng thật**, chưa được giảng viên/người dùng nghiệm thu; đây là preview trên DB tổng hợp. Không tuyên bố tuân thủ pháp lý.
6. Kiểm `confirmationName` cho deletion request là bổ sung so với câu chữ tối thiểu của spec; nếu lead muốn đúng spec hẹp hơn thì bỏ `assertConfirmationName` ở `recordDeletionRequest` và test tương ứng.
7. Không sửa `docs`; lead cần cập nhật `docs/04` mục “Chưa triển khai” khi hợp nhất (hiện đã ghi yêu cầu xóa mới chỉ ghi audit — vẫn đúng).
