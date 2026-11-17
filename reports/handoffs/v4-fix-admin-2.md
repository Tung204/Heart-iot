# Handoff — v4-fix-admin-2 (sửa tiếp theo re-review quản trị v4)

- **Thời điểm:** 2026-11-15 khoảng 17:50 (Asia/Ho_Chi_Minh), worktree
  `C:/Users/nguye/orca/workspaces/DATN/fix-v4-admin-2`.
- **Nhánh:** `fix-v4-admin-2`, tách từ `fix-v4-admin` (`7b31ef4`). **Không merge.**
- **Nguồn lỗi:** `reports/qa/v4-rereview-admin.md` (0 P1, 8 P2, 10 P3; bảng R01–R18).
- **Phạm vi đã sửa:** R01, R02, R03, R06, R09, R11, R12 (P2) và R10, R13, R14
  (P3, làm luôn). Không đụng API/contracts/`AppShell`/`router`/`layout.css`/`tokens.css`.
- **File thay đổi:** chỉ 4 file admin + CSS/test
  `apps/web/src/features/admin/AdminPage.tsx`,
  `AdminPage.test.tsx`, `AdminDevicesTab.tsx`,
  `apps/web/src/styles/admin-simple.css`. Không thêm dependency/endpoint.

## Kết quả theo từng phát hiện

### R02 (P2) — chi tiết Nhật ký không còn bị khung cuộn cắt ở 768/1024

- Bỏ hoàn toàn `<tr class="adm-audit-details-row"><td colSpan={5}>` trong bảng.
  Chi tiết chuyển thành **`<section class="adm-audit-panel">` full-width đặt BÊN
  DƯỚI `.adm-table-wrap`**, nên không chịu `scrollLeft` của bảng.
- Panel có `id="audit-detail-panel"`, `aria-labelledby` tới `h3 “Chi tiết nhật ký”`,
  nút `Đóng chi tiết` rõ ràng; `<dl>` cho Hành động/Mã gốc/Người thực hiện/Kết quả/
  Thời gian/Đối tượng (id đầy đủ); `<pre>` giữ `white-space: pre`, `overflow-x: auto`,
  `max-width: 100%`, `tabIndex={0}` để cuộn bằng bàn phím, không bẻ từ.
- Mở panel: focus vào chính panel (`tabIndex={-1}`) + `scrollIntoView`; đóng: focus
  trả về đúng nút `Xem chi tiết` của dòng. Nút toggle chỉ đặt `aria-controls` khi
  panel đang mở (R10).
- Đo bằng Chromium (mock nhật ký có metadata dài, xem mục Bằng chứng):

  | Viewport | Panel rộng | Panel nằm trong `.adm-table-wrap`? | `scrollLeft` của bảng | `<pre>` client/scroll | Tràn trang |
  | --- | --- | --- | --- | --- | --- |
  | 1280×900 | 838px | Không | 0 | 809 / 809 | 0 |
  | 1024×900 | 582px | Không | **200** | 553 / **761** | 0 |
  | 768×900 | 742,5px | Không | **35** | 713 / **761** | 0 |
  | 390×844 | 364,5px | Không | 0 | 335 / **761** | 0 |
  | 360×740 | 334,5px | Không | 0 | 305 / **761** | 0 |

  Ở 768/1024, panel bắt đầu đúng mép trái vùng nội dung (x=12,75 / 365,5 — bằng
  `x` của khung), không còn mất 35/200px đầu như trước. Ảnh:
  `audit-panel-768.png`, `audit-panel-1024.png`, `audit-panel-360.png`,
  `audit-panel-large20-360.png` (JSON dài 761–896px cuộn trong panel).

### R03 (P2) — thông báo đổi trạng thái không mất khi dòng rời bộ lọc

- Thông báo thành công chuyển từ `<td>` của dòng lên **vùng phản hồi cố định đầu
  tab, ngoài bảng** (`.adm-user-feedback`, `role="status"`), vẫn hiện dù
  `invalidateQueries` + bộ lọc làm dòng biến mất.
- Focus sau khi xong: dòng còn trong danh sách → trả về nút hành động của dòng;
  bộ lọc đang bật và trạng thái mới không khớp bộ lọc → focus về vùng thông báo
  (không rơi về BODY).
- Đo tại 360×740 với bộ lọc `Trạng thái = Hoạt động`, khóa Minh: notice rộng
  334,5px (y 208–253 trong viewport), `rows = 1`, không còn dòng Minh,
  `activeElement = .adm-user-feedback`. Ảnh: `users-360-notice.png`,
  `users-1280-notice.png`.

### R06/R12 (P2) — lỗi PATCH rộng đủ đọc, nhận focus; vòng focus 409/rõ ràng

- Lỗi PATCH bỏ khỏi cột hành động, dùng **cùng vùng phản hồi đầu tab**
  (`Alert role="alert"`, tiêu đề “Không đổi được trạng thái”), giữ nguyên form +
  lý do đã gõ để thử lại. Focus + `scrollIntoView({block:'center'})` vào khối lỗi.
- Đo tại 360×740: alert rộng **334,5px** (trước 114px), focus
  `.adm-user-feedback`; tại 1280 rộng 838px. Ảnh: `users-360-error.png`,
  `users-1280-error.png`.
- Thêm rule focus cho vùng nhận focus bằng script:
  `.admin-page [tabindex='-1']:focus { outline: 3px solid var(--color-focus) }`.
  Đo 409 tại 360: focus `.adm-policy-status`, `outline: 3px solid rgb(12, 110, 99)`.
  Bấm `Tải lại` (nút biến mất) → focus về `h2#policy-heading`, không về BODY.
  Ảnh: `policy-stale-360.png`, `policy-stale-1280.png`.

### R01 (P2) — “Cần chú ý” không bỏ tín hiệu, có “Chi tiết vận hành”

- Thứ tự “Cần chú ý” đổi thành tín hiệu **chưa có ô KPI trước**:
  `outbox.pending → tasks.open → devices.offline → alerts.open → outbox.failed`,
  vẫn tối đa 3 dòng. Vì chỉ có 3 tín hiệu không KPI, `devices.offline > 0` không
  còn bị 3 dòng đầu đẩy mất.
- Thêm `<details><summary>Chi tiết vận hành</summary>` dưới 4 KPI, hiện đủ
  **Hồ sơ (`subjects.total`)**, **Người dùng đã khóa (`users.disabled`)**,
  Công việc đang mở, Thông báo đang chờ gửi, Thông báo gửi lỗi,
  **Thiết bị ngoại tuyến** — cả khi `Cần chú ý` đã đủ 3 dòng.
- Đo dữ liệu thật tại 360: “Cần chú ý” = `1 công việc đang mở`, `1 thiết bị
  ngoại tuyến`, `1 cảnh báo đang mở`; “Chi tiết vận hành” = Hồ sơ 2, Người dùng
  đã khóa 0, Công việc đang mở 1, Chờ gửi 0, Gửi lỗi 0, Thiết bị ngoại tuyến 1.
  Ảnh: `overview-360.png`, `overview-details-360.png` (+ 1280/390/768/1024).

### R11 (P3) — lỗi field policy tự xoá, không 2 alert trùng

- `onChange` của từng field policy xoá lỗi + `aria-invalid` của **chính field vừa
  sửa** (không đợi bấm lại `Xem trước`). `Tải lại` cũng xoá `fieldErrors`.
- Tóm tắt lỗi `.adm-policy-errors` bỏ `role="alert"`, đổi thành `role="group"` +
  `aria-labelledby`, vì mỗi ô lỗi `TextField` đã là `role="alert"` (trước đó 2 alert
  đọc lặp cùng nội dung).
- Đo: lúc lỗi chỉ **1** `role=alert`, summary role=group. Sửa `0 → 20`:
  summary biến mất, 0 alert, `aria-invalid` bị gỡ. Ảnh: `policy-field-error-360.png`,
  `policy-field-error-1280.png`.

### R09 (P2) — test bắt được hồi quy, không nới assertion

- Khôi phục assertion `3 thiết bị ngoại tuyến` trong test tổng quan mặc định.
- Cập nhật test “Cần chú ý tối đa 3 dòng” theo thứ tự mới (pending → tasks →
  offline), thay vì xếp `alerts` (có KPI) trước `offline` (không KPI).
- Viết lại test Nhật ký: chọn dòng → panel `SECTION` ngoài `.adm-table-wrap`,
  không có `td/[colspan]`, focus panel, `<pre tabindex=0>`, đóng → focus về nút.
- Thêm test: (a) thành công khi bộ lọc `Hoạt động` làm dòng rời danh sách → notice
  vẫn còn + focus vùng thông báo; (b) PATCH 500 → alert ngoài bảng, focus, giữ form.
- Bổ sung assertion: 409 focus `.adm-policy-status` rồi `Tải lại` focus H2; lỗi
  field tự xoá; chỉ 1 alert; `aria-controls` chỉ ở tab đang chọn; target hồ sơ
  dùng `metadata.subjectName` khi có.
- Tổng test web: **33 file / 216 test pass** (trước 214; thêm 2 `it`, không xoá
  test nào). Không nới/bỏ assertion hợp lệ để làm xanh.

### R10 / R13 / R14 (P3) — làm luôn

- **R10:** tab cấp 1 và mục con chỉ đặt `aria-controls` khi đang chọn (panel tồn
  tại); toggle chi tiết cũng chỉ `aria-controls` khi panel mở. Panel tab không đặt
  `tabIndex=0` vì đã chứa control focus được (theo APG); `<pre>` của panel có
  `tabIndex=0` để cuộn bằng bàn phím.
- **R13:** thêm 16 nhãn action còn thiếu: `maintenance_task.create/close`,
  `device.rotate_key`, `device.claim_code_issued`, `emergency_contact.*`,
  `workspace_view.*`, `care_link.revoke`, `subject.deletion_request`,
  `incident.suspected_timeout`; thêm nhãn target `workspace_view`,
  `maintenance_task`, `emergency_contact`, `care_link`.
- **R14:** `Giới hạn telemetry mỗi phút` → **`Giới hạn số mẫu mỗi phút`**;
  target hồ sơ dùng tên nếu metadata bản ghi có `subjectName`, không thì vẫn id
  ngắn; thiết bị bỏ lặp nhãn `Mã hồ sơ` → `Mã <code>…</code>` dưới `Hồ sơ đang gắn`.

## Bằng chứng chạy (output thật)

Môi trường: Windows, Node v24.22.2, pnpm 12.5.1; chạy `pnpm build:contracts`
trước khi typecheck/test/build.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm --filter @annhien/web typecheck` | exit 0 (`tsc -p tsconfig.json --noEmit`) |
| `pnpm --filter @annhien/web test` | **33 file / 216 test pass**, 23,5s |
| `pnpm --filter @annhien/web build` | exit 0, `✓ built in 1.18s`; `AdminPage-*.js` 42,93 kB (trước 38,75 kB) |

## Đo bằng trình duyệt

- Vite dev **4360** từ worktree này + API thật **3000**; Chromium 1.65.1 headless.
  Đăng nhập admin seed (cookie lấy qua `POST /api/v1/auth/login`).
- Viewport: **1280×900, 1024×900, 768×900, 390×844, 360×740**, thêm bộ chữ lớn
  **20px (125%)** ở cả 1280/1024/768/390/360 và **32px (200%)** ở 1280/360.
- Luồng ghi **mock ở tầng route** (`page.route`): PATCH 200/500, preview 409;
  danh sách người dùng và nhật ký mock dữ liệu tổng hợp để tái hiện đúng bộ lọc +
  metadata dài. Không PATCH user thật, không publish policy, không seed/xoá DB.
- **Tràn trang:** `document.scrollWidth == clientWidth` ở mọi viewport 360–1280 và
  bộ 20px. Ở 32px/360 có tràn 160px **từ `AppShell`** (`.shell__topbar-actions`,
  nút Đăng xuất) — không phải nội dung admin (panel 312px vẫn vừa 360); lỗi
  cross-cutting ngoài file được phép sửa, ghi ở mục dưới.
- **Control ≥44px:** nút toggle/đóng panel và summary đều ≥44px nhờ rule sẵn có
  `.admin-page .button`; `summary` chỉ tiết vận hành đặt `min-height: 44px`.
- Ảnh + `results.json`:
  `C:/Users/nguye/AppData/Local/Temp/v4-fix-admin-2/shots/` (ngoài repo):
  các bộ `overview-*`, `overview-details-*`, `audit-panel-*`, `users-*-notice`,
  `users-*-error`, `policy-field-error-*`, `policy-stale-*`, `*-large20-*`,
  `*-large32-*` cho 5 viewport và bộ chữ lớn.

## Chưa làm / cần xử lý tiếp (handoff)

- **R04** đã xử lý cùng R11 (lỗi field tự xoá khi sửa).
- **R05 (P2, còn mở):** tóm tắt lỗi field nằm sau hàng nút nên ở 360 vẫn dưới
  màn hình (y 1021 trong viewport 740) và tại 1280 bị cắt 36px đáy. Chưa đổi bố
  cục vì ngoài danh sách ưu tiên của vòng này; hướng sửa: đặt summary ngay sau
  field lỗi đầu tiên hoặc sticky trên mobile.
- **R07 (P2, còn mở):** bộ lọc Người dùng/Nhật ký vẫn là state cục bộ nên mất khi
  đổi tab. Cần đưa lên URL/`searchParams` như tab (`?tab=…&q=…&status=…`).
- **R08 (P3):** `?tab=users&view=audit` vẫn giữ param lạ; bấm lại tab đang chọn
  vẫn đẩy history trùng.
- **R15/R16/R17/R18 (P3):** chữ 200% ở 360 tràn do `AppShell` topbar (ngoài phạm
  vi); card nhật ký 360 dài ~5000px; “Cần chú ý” chưa có link tới tab liên quan;
  actor filter gọi ngay còn ô Hành động phải bấm `Lọc`; hint “vuốt ngang” ở 1024.
- **R12 phần actor picker:** vẫn `fetchAdminUsers({limit:100})` + fallback
  `Người dùng 8-ký-tự` khi >100 user — cần API trả đủ/endpoint riêng (ngoài ràng
  buộc “không API”).
- **R14 phần tên hồ sơ ở tab Thiết bị:** API chỉ trả `assignedSubjectId`, không có
  tên; không thể hiện tên nếu không thêm dữ liệu/endpoint. Chỉ bỏ được nhãn lặp.
- **Dọn CSS chết:** `layout.css` còn rule `.adm-audit-details summary/pre` cho
  markup cũ (file này ngoài phạm vi được sửa lần này); không ảnh hưởng hiển thị.
- **Chưa kiểm:** screen reader thật (NVDA/VoiceOver) — a11y dựa trên cấu trúc DOM,
  `ariaSnapshot`/computed style của Chromium; không chạy `pnpm test:e2e` của repo
  (Playwright E2E trỏ 5173 đang có server khác, E2E ngoài yêu cầu). Không đo
  contrast bằng axe/Lighthouse, không kiểm Firefox/Safari.
