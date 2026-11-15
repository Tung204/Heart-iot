# Handoff — v2 fix preview policy phải ràng buộc nội dung publish

- **Thời điểm:** 2026-11-15 07:27 (Asia/Ho_Chi_Minh)
- **Worker:** fix-policy-preview (task `task_2b578f228bc1`)
- **Nguồn:** `reports/qa/v2-admin-ops.md` P1-3; `docs/11` mục "Preview frontend phải kiểm được gì";
  `docs/13` §6 "Cấu hình, preview và phát hành một phiên bản".
- **Worktree/nhánh:** `fix-policy-preview`; commit trên nhánh riêng (xem cuối file).
- **Vùng ghi:** `packages/contracts/src/admin.ts`, `apps/api/src/admin/admin.service.ts`,
  `apps/api/test/admin.spec.ts`, `apps/web/src/features/admin/AdminPage.tsx`,
  `apps/web/src/features/admin/AdminPage.test.tsx`, `apps/web/src/features/admin/api.ts`, file này.
  Không sửa `admin.controller.ts` (không cần), tab Thiết bị, `app.module`, `router`, `layout.css`,
  docs hay `.data`.

## Vấn đề gốc (P1-3)

Preview chỉ là "trang trí": publish gửi `value` hiện tại của form, không có ràng buộc nào với bản đã
xem trước. Người vận hành có thể xem preview 50, sửa thành 55 rồi bấm Phát hành và tạo bản 55; hoặc
phát hành trực tiếp không preview. Docs/11 (bản duyệt cũ hết hiệu lực khi đổi nội dung) và docs/13
(publish đúng nội dung đã duyệt, xung đột thì tạo diff mới + preview lại) yêu cầu chặn việc này.

## Đã làm

### 1. Contract (`packages/contracts/src/admin.ts`)

| Trường | Trước | Sau |
| --- | --- | --- |
| `policyPreviewRequestSchema` | `{ value }` | `{ value, expectedVersion }` — bắt buộc, là phiên bản nền người xem đang xem |
| `policyPreviewSchema.digest` | `string \| null` | `^[0-9a-f]{64}$` (luôn có khi preview hợp lệ) |
| `policyPreviewSchema.expectedVersion` | — | số nguyên ≥ 0, khớp request, dùng để publish |
| `policyPublishRequestSchema.previewDigest` | — | chuỗi 1..128, **bắt buộc ở tầng service**: thiếu → 409 (không phải 422) |

`digest = sha256(canonicalPolicyJson(value) + "\nbase_version=" + expectedVersion)`: ổn định theo thứ
tự khóa schema, chỉ phụ thuộc policy vốn công khai + phiên bản nền, không chứa secret.

### 2. API (`apps/api/src/admin/admin.service.ts`)

- `computePolicyPreviewDigest(value, expectedVersion)` (export để test) dùng `canonicalPolicyJson`
  có sẵn của `PolicyService`; **không sửa** `policy.service.ts`.
- `previewPolicy`: đọc active, nếu `expectedVersion` lệch bản active → 409 `APPROVAL_STALE`
  (`details.reason='version_mismatch'`, kèm `currentVersion/currentDigest`, không ghi DB); nếu khớp
  → trả `{ valid, value, digest, expectedVersion, warnings, effectiveDiff }`.
- `publishPolicy` thành 2 cổng, cả hai đều **không ghi policy**:
  1. **Nội dung**: `previewDigest` thiếu/khác digest tính lại từ `(value, expectedVersion)` →
     409 `APPROVAL_STALE` với message "Nội dung đã thay đổi so với bản xem trước, hãy xem lại preview
     trước khi công bố." và `details.reason = 'preview_missing' | 'preview_mismatch'`. Cổng này chạy
     trước khi mở transaction.
  2. **CAS version**: giữ nguyên `FOR UPDATE` + `expectedVersion`; lệch → 409
     `details.reason='version_mismatch'`; unique violation khi publish đồng thời →
     `details.reason='publish_race'`.
- Audit: success vẫn chỉ `{ key, version, digest (+note) }`; **thêm** audit `policy.publish`
  `outcome='conflict'` với `{ key, expectedVersion, reason }` cho cả 3 nhánh 409 (kể cả khi
  transaction đã rollback — ghi bằng DB ngoài transaction để không bị rollback theo). Không có
  `value`, hash, token hay credential trong metadata (có assertion test).
- Lỗi 409 vẫn dùng mã `APPROVAL_STALE` đã có trong `ERROR_CODES`; chỉ thêm `details.reason` để UI
  phân biệt "nội dung lệch" và "version lệch".

### 3. UI (`apps/web/src/features/admin/AdminPage.tsx`, `api.ts`)

- Preview gửi `{ value, expectedVersion: active.version }` (lấy từ dữ liệu policy đang tải).
- Kết quả preview giữ thêm `digest`, `expectedVersion`, snapshot `value`; mọi thay đổi field gọi
  `clearPreview()` → xóa preview + digest, `publish.reset()`, xóa banner "nội dung chưa khớp".
- Nút **Phát hành** chỉ bật khi: có preview hợp lệ + có digest + `expectedVersion` preview bằng
  version đang áp dụng + `value` form bằng đúng snapshot đã preview + không đang gửi. Có dòng gợi ý
  giải thích khi nút bị khóa.
- Publish gửi `{ value, expectedVersion: preview.expectedVersion, previewDigest: preview.digest, note? }`.
- 409:
  - `reason = preview_missing/preview_mismatch` → banner "Nội dung chưa khớp preview", hiện nguyên văn
    thông điệp server, **giữ form**, bỏ preview/digest (Phát hành khóa, Xem trước bật lại để làm lại).
  - `version_mismatch/publish_race` → banner "Policy đã thay đổi" + nút **Tải lại** như trước; nút
    này giờ reset cả `publish`/`preview` mutation, preview và form (sửa luôn P2-3 "reload còn lỗi cũ").
- Publish thành công: reset preview + note + stale, invalidate policy, hiện "Đã phát hành policy
  phiên bản N."; preview hiển thị digest rút gọn + phiên bản nền để người duyệt thấy ràng buộc.

### 4. Test

- `apps/api/test/admin.spec.ts` (+2 test, tổng 9):
  - T4 mở rộng: digest đúng công thức, lặp lại cho cùng digest, đổi version nền là đổi digest,
    response chỉ có 6 trường công bố, preview lệch `expectedVersion` → 409 và **không** ghi DB.
  - T5 giữ nguyên toàn bộ assertion cũ (initial v0, publish v1, 409 version kèm
    `currentVersion/currentDigest`, archive `retired`, history, rollback v3, audit success không có
    value), chỉ thêm bước preview để lấy `previewDigest`; audit success lọc theo `outcome`.
  - T5b: publish thiếu `previewDigest` → 409 `preview_missing`, message chứa "nội dung đã thay đổi"
    và "xem lại preview", row count + active version không đổi, audit conflict `{key, expectedVersion,
    reason}` không chứa `heartbeatIntervalSeconds`.
  - T5c: preview value 40 rồi publish value 45 → 409 `preview_mismatch`, không ghi; replay digest cũ
    với `expectedVersion + 1` cũng 409 (digest gắn version nền).
  - T7 (đồng thời): hai admin preview cùng bản nền rồi publish song song → một 200, một 409
    (`version_mismatch` hoặc `publish_race`), đúng một active.
- `apps/web/src/features/admin/AdminPage.test.tsx` (+2 test, tổng 7): cập nhật fixture preview
  (digest 64 hex + `expectedVersion: 2`) và body publish (thêm `previewDigest`); thêm:
  - chưa preview → Phát hành khóa, không gọi API; preview rồi sửa field → preview biến mất, Phát
    hành khóa, không gửi PUT;
  - 409 digest lệch → hiện thông điệp, giữ form, publish khóa, Xem trước bật lại, preview lại +
    publish lại thành công, form/note reset.
  - Test 409 version cũ vẫn giữ nguyên assertion, chỉ thêm bước preview trước khi bấm Phát hành.

## Kiểm đã chạy (kết quả thật, cùng máy)

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --prefer-offline --frozen-lockfile` | exit 0 (reused store) |
| `pnpm build:contracts` | exit 0 |
| `pnpm --filter @annhien/api typecheck` | exit 0 |
| `pnpm --filter @annhien/web typecheck` | exit 0 |
| `pnpm typecheck` (contracts build + 4 workspace) | exit 0 |
| `pnpm test` (toàn repo) | exit 0 — API **14 suite / 102 test**, web **20 file / 75 test**, simulator 23 test |
| `jest --runInBand test/admin.spec.ts` | 9/9 pass (trước: 7) |
| `vitest run src/features/admin/AdminPage.test.tsx` | 7/7 pass (trước: 5) |

Không chạy: e2e Playwright trên API/web thật, PostgreSQL thật, nhiều instance. Test dùng PGlite
in-memory như bộ test hiện có.

## File lead cần nối / dễ conflict

- `apps/web/src/features/admin/AdminPage.tsx` — chỉ sửa `PolicyTab` (+ helper `samePolicyValue`).
  Worker tab **Thiết bị** cũng sửa file này: giữ cả hai phần, không có hunk nào chồng lên phần
  Devices/TABS hiện tại. Nếu conflict, phần của tôi nằm trong `PolicyTab` và block
  `POLICY_KEY`/`samePolicyValue` ngay trước nó.
- `apps/web/src/features/admin/api.ts` — worker Devices có thể thêm hàm mới cùng file; tôi chỉ đổi
  chữ ký `previewPolicy`/`publishPolicy` (2 vùng riêng).
- `apps/api/src/admin/admin.service.ts` — chỉ khối policy; nếu worker khác sửa users/audit ở cùng
  file thì ghép theo hàm.
- `packages/contracts/src/admin.ts` — chỉ khối "Policy động"; `adminUserQuery`/audit giữ nguyên.
- `apps/api/test/admin.spec.ts` — T4/T5/T7 policy + 2 test mới; T1–T3, T6 không đổi.

## Ghi chú / còn lại

- **Breaking contract:** `POST /admin/policies/:key/previews` giờ bắt buộc `expectedVersion`; client
  nào khác (không có trong repo) sẽ nhận 422 `VALIDATION_FAILED`. UI duy nhất đã cập nhật.
- `previewDigest` khai báo `optional` trong zod **có chủ đích** để thiếu digest trả 409 đúng yêu cầu
  (nếu để required sẽ thành 422). Service là nơi cưỡng chế.
- Không sửa docs: `docs/13` §6 đã mô tả đúng hành vi này; danh sách endpoint ở `docs/14` không đổi
  đường dẫn. Nếu lead muốn ghi contract chi tiết vào docs/06 hoặc docs/14 thì cần một việc riêng
  (và sinh lại `docs/html`).
- P2-3 (reload còn lỗi cũ + audit conflict) được xử lý một phần trong phạm vi policy: nút Tải lại
  reset mutation/preview/form và 409 có audit `outcome=conflict`. Header version vẫn lấy từ query
  cache như cũ (sau reload là đúng); không mở rộng sang tab Users.
- Chưa chốt: có cần lưu `previewDigest` vào audit success làm bằng chứng duyệt hay không (hiện chỉ
  lưu content digest như trước).
