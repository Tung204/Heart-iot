# Handoff — v3-fix-alert-write-permission

- **Thời điểm:** 2026-11-15 khoảng 10:56 (Asia/Ho_Chi_Minh), worktree `fix-alert-write-permission`.
- **Worker:** `fix-alert-write-permission` (task `task_e677112397bd`, dispatch `ctx_8c632e1aa76e`).
- **Nhánh:** `fix-alert-write-permission` (không merge master). Base `4a38094`.
- **Commit code:** `d30aad775a2585fdc1be62cf9204f2b64fbb0971`
  `fix(incidents): chặn ghi cảnh báo khi thiếu quyền nhận cảnh báo` (6 file).
  Commit handoff (file này) là commit riêng ngay sau đó.
- **Vùng ghi:** `apps/api/src/incidents/incidents.service.ts`,
  `apps/api/test/incidents.spec.ts`, `apps/web/src/features/alerts/AlertDetailPage.tsx` +
  `AlertDetailPage.test.tsx`, `apps/web/src/features/alerts/AlertsPage.tsx` +
  `AlertsPage.test.tsx`, file này.
  Không sửa contracts/schema/migration, `app.module.ts`, router/AppShell/CSS nền, docs/HTML,
  package exports, `reports/qa/**`.

## Finding gốc

`reports/qa/v2-security-authz.md` **P1-2** (dòng 143–176), đối chiếu `docs/02` FR-07
("Người có quyền nhận sự kiện, xác nhận và đóng có lý do") và `docs/06` mục cảnh báo.

Trước khi sửa, `loadVisibleIncident(userId, alertId, action)` chỉ gọi `assertAction(access, action)`
khi có `action`, nhánh đọc mới kiểm `receive_alerts`. Vì `canAcknowledge`/`canResolve` **không**
suy ra `canReceiveAlerts` (`packages/contracts/src/core.ts:85-97`), caregiver có cờ hành động nhưng
`canReceiveAlerts=false` vẫn đi qua transaction: `incidents.state`/`version` đổi, ghi
`alert_actions` outcome `applied`, tạo outbox update — rồi `return this.getAlert(...)` sau commit
kiểm `receive_alerts` và ném 403. Client thấy 403 trong khi dữ liệu đã đổi (retry sinh thêm action
`conflict`, UI báo "không có quyền" dù cảnh báo đã bị đổi).

**Tái hiện bằng test trước khi sửa:** thêm T8a/T8b rồi chạy trên code cũ (tạm `git stash` phần
service): cả hai fail ở `expect(incidentRow.state).toBe('open')` — request trả 403 nhưng state đã
thành `acknowledged`/`resolved`. Đây là bằng chứng lỗi tồn tại ở base, không chỉ suy luận từ báo cáo.

## Đã làm

### `apps/api/src/incidents/incidents.service.ts` (dòng 928–958, `loadVisibleIncident`)

- Luôn kiểm `receive_alerts` cho **mọi** đường đi qua hàm này (đọc chi tiết, acknowledge, resolve),
  sau đó mới kiểm `action` nếu có. Cả hai check nằm **trước** `db.transaction` và trước mọi ghi.
- Owner không đổi: `AccessService.assertAction` trả ngay với `role === 'owner'`
  (`OWNER_PERMISSIONS.canReceiveAlerts = true`).
- Không đổi semantics đọc: `getAlert` vẫn kiểm `receive_alerts`; caregiver đủ quyền nhận + quyền
  hành động nhận 200 kèm detail sau khi ghi (không còn 403 sau commit trong luồng thường).
- Không đổi route/controller, không đổi `getAlert` sau commit (xem "Rủi ro" #2), không sửa
  contracts/schema.

### UI chi tiết — `apps/web/src/features/alerts/AlertDetailPage.tsx`

- Dòng 145–147: `canAcknowledge`/`canResolve` giờ yêu cầu thêm `viewerPermissions.canReceiveAlerts`.
- Dòng 239–244: nếu biết quyền và thiếu `canReceiveAlerts`, hiện lý do rõ ("Chủ hồ sơ không chia sẻ
  quyền nhận cảnh báo với bạn, nên bạn không thể xác nhận hoặc đóng cảnh báo này…") — không ẩn im lặng.
- Dòng 246–265: nút "Tôi đang hỗ trợ"/"Đóng cảnh báo" chỉ render khi có cả quyền nhận và quyền hành
  động. Khi **có** `canReceiveAlerts` nhưng thiếu quyền hành động, giữ hint cũ (không lặp 2 lần).
  Khi chưa tải xong danh sách hồ sơ (`viewerPermissions === null`) không hiện lý do sai và không hiện nút.

### UI danh sách — `apps/web/src/features/alerts/AlertsPage.tsx`

- Dòng 98–101: `canReceiveAlerts`/`canAcknowledge` lấy từ hồ sơ đang xem.
- Dòng 252–262: mỗi dòng cảnh báo open chưa ai xác nhận mà viewer thiếu quyền sẽ hiện giải thích:
  thiếu `canAcknowledge` → "Bạn không có quyền xác nhận cảnh báo này."; thiếu `canReceiveAlerts` →
  "Chủ hồ sơ không chia sẻ quyền nhận cảnh báo với bạn, …".
- Dòng 277–289: nút "Xác nhận" nhanh chỉ render khi `canReceiveAlerts && canAcknowledge`.

## Test đã thêm

### `apps/api/test/incidents.spec.ts`

- Helper `addCaregiver` (dòng 153–177): đăng ký user rồi chèn `care_links` với bộ quyền chỉ định trên
  cùng hồ sơ fixture; `sharedFrom` cùng mốc 40 ngày để không vướng cửa sổ lịch sử.
- **T8a** (dòng 759–800): `canReceiveAlerts=false, canAcknowledge=true` → POST acknowledge **403**;
  đọc lại state `open`, version `2`; **không có** `alert_actions` nào (cả `applied` lẫn `conflict`);
  outbox giữ nguyên danh sách `dedupeKey`; owner GET detail vẫn `actions: []`.
- **T8b** (dòng 802–849): `canReceiveAlerts=false, canResolve=true` → POST resolve **403**; state
  `open`, version `2`, `resolvedAt/resolutionReason/resolutionOutcome` null; không có `alert_actions`;
  outbox không đổi.
- **T8c** (dòng 851–875): `canReceiveAlerts=true, canAcknowledge=true` → ack **200**, state
  `acknowledged`, version `3`, `acknowledgedBy` đúng user; response là detail đầy đủ (`events[]`),
  `actions[0] = acknowledge/applied`.
- **T8d** (dòng 877–906): `canReceiveAlerts=true, canResolve=true, canAcknowledge=false` → resolve
  **200**, state `resolved`, version `3`, lý do/outcome đúng; chứng minh resolve chỉ cần
  `receive_alerts` + `canResolve` (không đòi `canAcknowledge`) đúng phạm vi yêu cầu.

### `apps/web/src/features/alerts/AlertDetailPage.test.tsx`

- `renderDetail(handler, subject = SUBJECT)` (dòng 17–40) nhận subject override và trả `fetchMock`.
- (dòng 185–201) thiếu `canReceiveAlerts` dù `canAcknowledge`/`canResolve` = true → không có nút
  "Tôi đang hỗ trợ"/"Đóng cảnh báo", hiện lý do không chia sẻ quyền nhận, không hiện hint hành động gây hiểu nhầm.
- (dòng 203–241) đủ `canReceiveAlerts` + `canAcknowledge` + `canResolve` → mở được form đóng cảnh báo,
  nút "Tôi đang hỗ trợ" bấm được, POST thật được gửi, detail chuyển "Đang có người hỗ trợ".

### `apps/web/src/features/alerts/AlertsPage.test.tsx`

- (dòng 204–223) thiếu `canReceiveAlerts` dù `canAcknowledge=true` → không có nút "Xác nhận", hiện lý do.
- (dòng 225–244) đủ `canReceiveAlerts` nhưng `canAcknowledge=false` → không có nút, hiện hint thiếu
  quyền xác nhận (không lẫn lý do quyền nhận).
- (dòng 246–279) đủ cả hai quyền → nút "Xác nhận" hiện, bấm thì có POST tới `/alerts/:id/acknowledge`.

## Bằng chứng chạy (output thật trên worktree này)

Môi trường: Windows, Node v24.22.2, pnpm 12.5.1. Worktree mới **chưa có** `node_modules`, đã cài
offline từ pnpm store: `pnpm install --offline --frozen-lockfile` → "Done in 13.1s", 711 package,
không tải mạng. Sau đó `pnpm build:contracts` pass.

| Lệnh | Kết quả |
| --- | --- |
| `apps/api`: `node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/incidents.spec.ts` **trước khi sửa** | **25/25 pass**, 1 suite, 8.9s (baseline) |
| `apps/api`: T8a/T8b trên **code cũ** (tạm stash service) | **2 fail** ở `state`/`version` (403 nhưng dữ liệu đã đổi) — chứng minh test bắt đúng P1-2 |
| `apps/api`: `node … jest.js --runInBand test/incidents.spec.ts` sau khi sửa | **29/29 pass**, 1 suite, 6.5s |
| `apps/api`: `pnpm --filter @annhien/api typecheck` | pass (`tsc -p tsconfig.json --noEmit`, không output lỗi) |
| `apps/api`: `node … jest.js --runInBand` (toàn bộ) | **20/20 suite, 218/218 test pass**, 57.0s |
| `apps/web`: `npx vitest run src/features/alerts/AlertDetailPage.test.tsx src/features/alerts/AlertsPage.test.tsx` **trước khi sửa** | **11/11 pass**, 2 file (baseline) |
| `apps/web`: cùng 2 file trên **code UI cũ** (tạm stash 2 file `.tsx`) | **3 fail** (đúng 3 test âm mới), 13 pass |
| `apps/web`: cùng 2 file sau khi sửa | **16/16 pass**, 2 file, 2.1s |
| `apps/web`: `npx vitest run` (toàn bộ unit) | **32/32 file, 183/183 test pass**, 8.2s |
| `apps/web`: `pnpm --filter @annhien/web typecheck` | pass (`tsc -p tsconfig.json --noEmit`, không output lỗi) |
| `git diff --check` (trước commit) | không có lỗi whitespace, chỉ cảnh báo LF→CRLF của Git trên Windows |

**Không chạy:** E2E Playwright, build production web (`vite build`), simulator, docs build/check
(không sửa docs/HTML). Không chạy lại seed hay demo thủ công.

**DB/cổng riêng:** không cần và không dùng. `apps/api/test/test-app.ts` dựng PGlite in-memory +
env hermetic (`assertHermeticDatabase`), supertest chạy trong process nên không bind cổng, không kết
nối PostgreSQL/MQTT/AI thật. Web unit test dùng jsdom + `stubFetch`, không gọi server. Vì vậy không
có DB/cổng riêng nào để dọn sau khi chạy.

## Rủi ro / lưu ý cho lead

1. **Finding vẫn mở:** không sửa/không đóng `reports/qa/v2-security-authz.md` P1-2; cần reviewer độc
   lập tái kiểm bằng bản chạy trên nhánh này. Các finding khác (P1-1, P1-3) không bị đụng.
2. **403 sau commit trong race hẹp:** quyền được đọc trước transaction; nếu owner thu hồi
   `canReceiveAlerts` đúng khoảng giữa check và commit, lần ghi vẫn xảy ra rồi `getAlert` sau commit
   có thể trả 403. Fix này không khóa `care_links` trong transaction và không dựng detail từ dữ liệu
   đã khóa (đề xuất phụ trong báo cáo) để giữ phạm vi tối thiểu; nếu lead muốn đóng hẳn lớp lỗi này
   cần một thay đổi riêng (re-check permission trong transaction hoặc trả detail đã khóa).
3. **UI danh sách là phòng thủ:** `listAlerts` đã trả 403 cho caregiver thiếu `receive_alerts`, nên
   bình thường không có item nào để hiện. Hint/nút ẩn ở danh sách chủ yếu xử lý cache quyền cũ
   (quyền bị thu hồi khi trang đang mở) để không gửi request chắc chắn 403; không thay đổi semantics API.
4. **Resolve không đòi `canAcknowledge`:** theo đúng yêu cầu task (receive + quyền hành động tương
   ứng). Nếu sau này chốt mô hình bao hàm `resolve ⇒ acknowledge`, cần sửa cả API, test T8d và UI.
5. **Tài liệu:** `docs/02` FR-07 và `docs/06` đã mô tả đúng hành vi mong muốn; theo phạm vi task
   không sửa docs/`docs/html`. Nếu lead muốn ghi nhận kết quả fix vào `docs/14`/`docs/08` thì cần
   một thay đổi tài liệu riêng và build lại HTML (`tools/docs/build.py --check`).
6. **Không đổi contracts/schema:** quyền vẫn là 4 cờ độc lập; không thêm ràng buộc
   `canResolve ⇒ canAcknowledge ⇒ canReceiveAlerts` khi tạo lời mời (đề xuất khác trong báo cáo),
   vì nằm ngoài phạm vi file được phép sửa. Hệ quả: owner vẫn có thể tạo cấu hình "có quyền hành
   động nhưng không nhận cảnh báo"; API/UI giờ từ chối ghi và nói rõ lý do thay vì ghi rồi 403.
