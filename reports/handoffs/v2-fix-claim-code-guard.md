# Handoff — v2 / fix-claim-code-guard

- **Thời điểm:** 2026-11-15 02:04 (Asia/Ho_Chi_Minh)
- **Worker:** fix-claim-code-guard (worktree riêng `C:/Users/nguye/orca/workspaces/DATN/fix-claim-code-guard`)
- **Nhánh:** `fix-claim-code-guard` (không merge)
- **Base:** `3c93f17 docs(orchestration): spec claim code và đổi mật khẩu`
- **Nguồn finding:** `reports/qa/v2-rev-features.md` P2-2 (worktree `rev-v2-features`) — admin tạo được claim code cho thiết bị đang gán; code còn hiệu lực sau release; UI không khóa nút.
- **Tài liệu tham chiếu:** `docs/04-du-lieu-va-giao-tiep.md` (endpoint thiết bị, claim code dùng một lần), `packages/contracts/src/devices.ts`, `docs/12-nguyen-tac-phat-trien-va-bang-chung.md`.

## Đã sửa

### 1. API — `apps/api/src/devices/devices.service.ts`

**`issueClaimCode`:**
- Chạy trong transaction và khóa dòng thiết bị bằng `SELECT ... FOR UPDATE` trước khi kiểm tra assignment mở. Hai request cấp mã đồng thời không ghi đè lẫn nhau; request cấp mã cũng thấy assignment do claim/release vừa commit.
- Thiết bị đang có assignment mở → `AppError.conflict` (HTTP 409), message **“Thiết bị đang gắn hồ sơ; hãy gỡ trước khi tạo mã.”**, `details = { code: 'DEVICE_ALREADY_ASSIGNED' }`.
- Không sinh mã, không ghi `claimCodeHash`/`claimCodeExpiresAt`, không ghi audit `device.claim_code_issued` khi bị từ chối.
- Vì `ErrorCode` trong `packages/contracts` là enum đóng và worker không được sửa contracts, mã lỗi chi tiết nằm ở `details.code`; `code` cấp ngoài vẫn là `CONFLICT` (409).

**`releaseDevice`:**
- Đóng assignment và xóa claim code trong cùng một transaction.
- Update assignment có điều kiện `ended_at IS NULL` + `returning`; release đồng thời thứ hai nhận 404 thay vì ghi đè.
- Sau khi đóng assignment, set `claimCodeHash = null`, `claimCodeExpiresAt = null` trên thiết bị → mã đang chờ (kể cả dữ liệu cũ do lỗi P2-2 trước đây) không dùng lại được.
- Audit `device.release` chuyển vào cùng transaction.

### 2. Web — `apps/web/src/features/admin/AdminDevicesTab.tsx` + `admin-devices.css`

- Nút **“Tạo mã gắn thiết bị”** bị disabled khi `device.assignedSubjectId !== null`, kèm hint hiển thị **“Thiết bị đang gắn hồ sơ; hãy gỡ trước khi tạo mã.”** và `aria-describedby` trỏ tới hint — không disabled im lặng.
- Hint nằm trong `.adm-device__actions`, CSS `.adm-device__claim-hint` cho xuống dòng đầy đủ (`flex: 1 1 100%`), không phá layout 360/390px.
- Khi server trả 409 (UI đang giữ danh sách cũ), mutation `onError` gọi `devices.refetch()` để nút khóa đúng trạng thái mới. Danh sách vẫn có nút “Tải lại danh sách” để cập nhật sau khi thiết bị được gỡ ở trang chủ hồ sơ.

### 3. Test

`apps/api/test/devices.spec.ts`:
- Cập nhật test thiết bị đã gán: cấp mã → 409, `details.code = DEVICE_ALREADY_ASSIGNED`, message đúng, `claimCodeHash`/`claimCodeExpiresAt` vẫn `null`; caregiver vẫn 403; sau release cấp mã mới → chủ hồ sơ khác claim được 201.
- Thêm test vòng đời: claim → cấp mã bị 409 → giả lập mã cũ đang chờ trong DB → release → hash/expiry null và mã cũ claim 422 → mã mới claim 201 lần đầu, dùng lại 422.
- Thêm test hai request cấp mã đồng thời cho thiết bị đang gán: cả hai 409, hash vẫn null.
- Test “claim code mới thay thế code cũ” giữ nguyên và vẫn pass.

`apps/web/src/features/admin/AdminPage.test.tsx`:
- Test mã thành công chuyển sang thiết bị **chưa gắn** (thiết bị đã gắn bị khóa).
- Thêm test: thiết bị đang gắn → nút disabled, hint có `id` khớp `aria-describedby`, bấm không gọi API; sau khi dữ liệu trả về `assignedSubjectId = null` và bấm “Tải lại danh sách” → nút mở, hint mất, cấp mã được.
- Thêm test: server 409 → alert hiển thị lý do và danh sách được tải lại (GET `/admin/devices` lần 2).

## Kiểm chứng đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --offline --frozen-lockfile` | pass (worktree chưa có `node_modules`) |
| `pnpm build:contracts` | pass |
| `pnpm --filter @annhien/api typecheck` | pass |
| `pnpm --filter @annhien/web typecheck` | pass |
| `pnpm --filter @annhien/api test test/devices.spec.ts` | **15/15 pass** |
| `pnpm --filter @annhien/api test test/admin.spec.ts` | **9/9 pass** |
| `pnpm --filter @annhien/api test test/ingest.spec.ts` | **13/13 pass** (kiểm chéo luồng release → cấp mã → claim chuyển chủ) |
| `pnpm --filter @annhien/web test` | **32 file / 178 test pass** |
| `pnpm --filter @annhien/web test src/features/admin/AdminPage.test.tsx` | **15/15 pass** (chạy riêng trước full suite) |

Không chạy e2e Playwright và không gọi API/DB thật; test API dùng PGlite in-memory theo `test-app.ts`.

## File thay đổi

- `apps/api/src/devices/devices.service.ts`
- `apps/api/test/devices.spec.ts`
- `apps/web/src/features/admin/AdminDevicesTab.tsx`
- `apps/web/src/features/admin/AdminPage.test.tsx`
- `apps/web/src/features/admin/admin-devices.css`
- `reports/handoffs/v2-fix-claim-code-guard.md` (file này)

Không sửa router, contracts, schema/migration, docs hay feature khác.

## Giới hạn / điểm cần lead biết

1. **Mã lỗi chi tiết nằm trong `details.code`**, không thêm vào `ERROR_CODES` vì contracts ngoài phạm vi. Nếu lead muốn `body.code = 'DEVICE_ALREADY_ASSIGNED'` thì phải mở contracts + exception filter ở thay đổi khác.
2. **Admin tab không tự nhận sự kiện release từ trang chủ hồ sơ** (khác route/phiên). Danh sách cập nhật khi mở tab, bấm “Tải lại danh sách”, window focus refetch, hoặc khi gặp 409. Muốn realtime cần SSE/invalidation cấp tài khoản — ngoài phạm vi.
3. **Không kiểm UI bằng trình duyệt thật/ảnh chụp** trong lượt này; mới kiểm DOM/accessibility qua Testing Library (disabled, hint, `aria-describedby`, refetch). Nếu cần ảnh 1280/390/360 như các handoff khác thì phải chạy harness riêng.
4. Không đổi hành vi rotate key, claim, danh sách/trạng thái thiết bị; các spec hiện có của các luồng này vẫn pass.
