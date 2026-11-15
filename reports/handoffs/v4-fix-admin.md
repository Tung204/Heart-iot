# Handoff — v4-fix-admin (sửa lỗi review quản trị)

- **Thời điểm:** 2026-11-15 khoảng 17:10 (Asia/Ho_Chi_Minh), worktree
  `C:/Users/nguye/orca/workspaces/DATN/fix-v4-admin`.
- **Nhánh:** `fix-v4-admin`, tách từ `v4-simple-admin` (`fe31dec`). **Không merge.**
- **Phạm vi sửa (đúng ràng buộc):** chỉ 5 file
  `apps/web/src/features/admin/AdminPage.tsx`,
  `AdminPage.test.tsx`, `AdminDevicesTab.tsx`,
  `apps/web/src/styles/admin-simple.css`,
  `apps/web/src/features/admin/admin-devices.css`.
  Không sửa `AppShell.tsx`, `router.tsx`, `main.tsx`, `layout.css`, `tokens.css`,
  `app-simple.css`, `public-simple.css`, API/contracts/docs/README/package.json.
- **Không thêm dependency/endpoint.** Không dùng copy demo/đồ án/giảng viên.
- **Nguồn lỗi:** `C:/MyFolder/Hoc_Tap/project/DATN/reports/qa/v4-review-admin.md`
  (18 phát hiện: 2 P1, 11 P2, 5 P3).

## Kết quả theo từng phát hiện

### F01 (P1) — “Xem chi tiết” audit mở full-width

- Bảng Nhật ký chuyển `table-layout: fixed` với bề rộng cột cố định
  (23/22/14/24/17%), nên ô chi tiết không thể kéo bảng rộng ra.
- Nút `Xem chi tiết` (button thật, `aria-expanded` + `aria-controls`, ≥44px)
  mở thêm `<tr class="adm-audit-details-row"><td colSpan={5} id="audit-details-N">`.
  Trong ô: `Mã hành động <code>{action}</code>` + `<pre>` JSON.
- `<pre>`: `white-space: pre` (không bẻ từ), `overflow-x: auto`,
  `max-width: 100%`; bỏ `max-width: 22rem` và `overflow-wrap: anywhere` cũ.
- Đo lại (Playwright, API thật 3000 + dev web 4360) — **trước → sau**:

  | Viewport | `<td>` | `<pre>` | Cao `<pre>` | Trang |
  | --- | --- | --- | --- | --- |
  | 1280×900 | 838px (trước 147) | **810,5px** (trước 121) | **68,3px** (trước 468) | 1855px (trước 2229) |
  | 390×844 | 364,5px (trước 93) | **337px** (trước 67) | 68,3px (trước 904) | — |
  | 360×740 | 334,5px (trước 93) | **307px** (trước 67) | 68,3px (trước 904) | 5888px (trước 3285, do card 20 dòng) |

  `<pre>` có `scrollWidth 357 > clientWidth 307` tại 360 → cuộn ngang trong ô,
  không bẻ giữa từ. Ảnh: `audit-details-1280x900.png`,
  `audit-details-390x844.png`, `audit-details-360x740.png` (+ biến thể chữ lớn).

### F02 (P1) — lỗi field policy và 409 nhìn thấy tại chỗ bấm

- `validateValue` gọi `focusById('policy-<field>')` cho **field lỗi đầu tiên**
  (`.focus()` + `scrollIntoView({block:'center'})`), nên lỗi field nằm trong màn.
- Thêm khối `.adm-policy-errors` (`role="alert"`, tiêu đề “N giá trị chưa hợp lệ”,
  danh sách link `#policy-<field>` focus lại đúng ô) **ngay sau hàng nút**
  `Xem trước`/`Phát hành` — kiểm cấu trúc: `actions.nextElementSibling === summary`.
- Cảnh báo 409 + kết quả preview chuyển từ đầu panel xuống khối
  `.adm-policy-status` ngay dưới nút; khi có 409 thì `focus()` + `scrollIntoView`
  khối này. Đo tại 360×740 (viewport 740):

  | Trạng thái | Đo được |
  | --- | --- |
  | Field sai (`Gửi nhịp tim mỗi = 0`) | focus `policy-heartbeatIntervalSeconds`; field y 290–347 (trong màn); summary ngay sau actions |
  | 409 `APPROVAL_STALE` | cảnh báo y 228,9–437,2 (trong màn); nút `Tải lại` y 367,6–419,2 (trong màn); focus `.adm-policy-status` |

  Ảnh: `policy-invalid-360x740.png`, `policy-stale-360x740.png` (+ 1280/390/chữ lớn).
- Lỗi field dùng `aria-invalid` + `role="alert"` như cũ; không còn phụ thuộc
  riêng `role=alert` để người nhìn thấy phản hồi.

### F03 (P2) — Nhật ký mobile/tablet không giấu cột

- `<768px`: bảng Nhật ký chuyển thành **card có nhãn** (Hành động, Người thực
  hiện, Kết quả, Thời gian, Chi tiết) giống bảng Người dùng; không còn cuộn
  ngang và không giấu cột.
- `768–1024`: giữ bảng, nhưng dòng hint
  `Bảng rộng hơn khung — vuốt ngang để xem đủ cột.` chỉ render khi
  `scrollWidth - clientWidth > 1` (đo bằng `ResizeObserver`, có guard cho jsdom)
  thay vì `display:none` cứng ở mọi width >767px. Đo thật:
  **768: khung 743 / bảng 782 → hint hiện**; **1024: khung 582 / bảng 782 → hint hiện**;
  1280: khung 838 = bảng 838 → không hint.

### F04 (P2) — copy lịch sử policy

- Bỏ câu vô điều kiện “Chưa có bản phát hành:”; nhãn nay là
  `Giá trị mặc định (dùng khi chưa có bản phát hành)` cạnh nút
  `Điền giá trị mặc định`. `EmptyState` “Chưa có bản phát hành nào” chỉ còn khi
  `history.length === 0`. Đo với dữ liệu thật (v1 active):
  `Lịch sử phiên bản (1) · Giá trị mặc định (dùng khi chưa có bản phát hành) ·
  Điền giá trị mặc định · v1 · đang hoạt động · 12:12 15 thg 11, 2026`.

### F05 (P2) — bằng chứng preview

- Dưới alert hợp lệ có dòng
  `Bản xem trước cho v{expectedVersion} · digest {12 ký tự} · không ghi dữ liệu`
  (`digest` server trả về, không tự tính). Có test riêng.

### F06 (P2) — không mất `tasks.open` / `outbox.pending`

- “Cần chú ý” xây theo thứ tự ưu tiên tín hiệu **chưa có ô KPI**:
  `failed` → `pending` → `tasks.open` → `alerts.open` → `devices.offline`,
  rồi `.slice(0, 3)` (đúng “tối đa 3 dòng”), không thêm KPI thứ 5.
- Dữ liệu API thật lúc đo: `tasks.open = 1`, `outbox.pending = 0` →
  Cần chú ý: “1 công việc đang mở”, “1 cảnh báo đang mở”, “1 thiết bị ngoại tuyến”.
- Có test cho `failed > 0` (“1 thông báo gửi lỗi”), `pending > 0`, cap 3 dòng.

### F08 (P2) — Người dùng: ngày tạo + hint

- Cột đầu mỗi dòng thêm `Tạo {formatDate(createdAt)}` (đo được
  “Tạo 1 thg 11, 2026”) — giữ thông tin thay vì bỏ hẳn cột `Tạo`.
- Hint ngắn: ô tìm `Tìm theo email hoặc tên hiển thị.` (qua `aria-describedby`),
  bộ lọc trạng thái `“Tất cả” gồm cả tài khoản đã khóa.` (`aria-describedby`).

### F09/F10 (P2) — thông báo và focus tab Người dùng

- Thông báo thành công chuyển từ đầu tab vào **đúng dòng vừa đổi**, ngay trên
  nút hành động (`role="status"`). Đo tại 360: notice y 389,9–442,5 trong
  viewport 740; dòng 218,9; nút hành động 451 → cách nút ~8px.
  Lỗi PATCH cũng nằm trong form của dòng đó.
- Mở form: `useEffect` focus textarea lý do (đo `focusId = status-reason-<id>`).
- Hủy: lưu id dòng và trả focus về nút `Tạm khóa`/`Kích hoạt` của đúng dòng
  (đo `document.activeElement.textContent === 'Tạm khóa'`); thành công cũng trả
  focus về nút mới của dòng.
- `textarea`: `required`, `aria-required="true"`, `maxLength={500}` (khớp validate
  500, sửa lỗi “cho gõ 600 nhưng chặn 500”), `aria-invalid` +
  `aria-describedby` trỏ tới hint (`Bắt buộc, tối đa 500 ký tự.`) và lỗi.

### F11 (P2) — nhãn cột mobile không đọc lặp

- Bỏ hoàn toàn `data-label` + `td::before { content: attr(data-label) }`.
- Nhãn thẻ mobile là `<span class="adm-cell-label" aria-hidden="true">` trong ô;
  giá trị nằm trong `.adm-cell-value`. A11y snapshot Chromium (375px):
  `cell "Quản trị"`, `cell "Hoạt động"`, `cell "Tạm khóa"` — không còn
  “Vai trò Quản trị”. Bảng Nhật ký áp dụng cùng cơ chế.

### F12 (P2) — Nhật ký dễ đọc, không cần API mới

- Map nhãn tiếng Việt cho 25 action phổ biến (`auth.login` → “Đăng nhập”,
  `assistant.summary` → “Tóm tắt bằng trợ lý”,
  `incident.acknowledge` → “Xác nhận cảnh báo”,
  `admin.user.disable` → “Khóa tài khoản”, `policy.publish`, `device.*`,
  `subject.*`, `invitation.*`, `measurement.export`…). Action lạ vẫn hiện mã gốc.
- Mã gốc giữ trong `title` của nhãn và trong dòng `Mã hành động <code>` của phần
  chi tiết.
- Target dễ đọc: `Tài khoản/Hồ sơ/Cảnh báo/Thiết bị/Chính sách/Lời mời/Phiên`
  + 8 ký tự id, id đầy đủ trong `title` (đo: “Hồ sơ aaaaaaaa”,
  `title="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"`).
- Bộ lọc “Hành động” có hint ví dụ + `<datalist>` gợi ý 6 mã phổ biến.
- **Chưa làm:** actor picker vẫn `fetchAdminUsers({ limit: 100 })` và fallback
  “Người dùng 8-ký-tự” khi >100 user — cần API trả đủ/thêm endpoint, ngoài
  ràng buộc “không thêm endpoint”.

### F13 (P2) — tab/subtab trong URL

- `AdminPage` dùng `useSearchParams`: `?tab=overview|users|devices|advanced` và
  `?view=policy|audit`; `?view=audit` không có `tab` vẫn mở Nâng cao.
- Reload/chia sẻ link giữ đúng màn (đo: ArrowRight → `/app/admin?tab=users`;
  mở lại `/app/admin?tab=advanced&view=audit` → tab “Nhật ký” selected).
- **Chưa làm:** bộ lọc (tìm người dùng, mã hành động, actor) vẫn là state cục bộ
  nên mất khi đổi tab — yêu cầu chỉ nêu tab/subtab; ghi rõ ở đây để không hiểu
  nhầm là đã xong.

### F14 (P3) — tab có ngữ nghĩa + H2 + ArrowRight

- Tab cấp 1 và mục con đều là `role="tablist"` + `role="tab"` với
  `aria-selected`, `aria-controls`, roving `tabIndex`; panel là
  `role="tabpanel"` + `aria-labelledby`.
- ArrowLeft/ArrowRight/Home/End đổi tab và chuyển focus (đo trong Chromium:
  `selected: "Người dùng"`, `focused: "Người dùng"`, panel `adm-tab-users`).
- Mỗi panel có H2: ẩn cho screen reader (`Tổng quan`, `Người dùng`, `Thiết bị`,
  `Nâng cao`), riêng Chính sách/Nhật ký có H2 hiển thị (`Chính sách thiết bị`,
  `Nhật ký hoạt động`). Snapshot: `tabpanel "Tổng quan" > heading level=2`.

### F15/F16 (P3) — nhãn policy và thẻ thiết bị

- Nhãn policy mới: `Gửi nhịp tim mỗi (giây)`,
  `Ngoại tuyến khi không nhận dữ liệu (giây)`,
  `Dữ liệu được coi là mới trong (giây)`, `Nhận sự kiện trễ trong (phút)`,
  `Giới hạn telemetry mỗi phút`.
- Thiết bị: “Hồ sơ đang gắn” hiện `Mã hồ sơ aaaaaaaa` (id đầy đủ trong `title`),
  không in UUID trần; trạng thái ngoại tuyến kèm ngưỡng
  “Không nhận dữ liệu hơn 900 giây nên được coi là ngoại tuyến.”; trạng thái
  “Chưa rõ kết nối” có lý do “Chưa rõ vì chưa tải được ngưỡng ngoại tuyến từ
  chính sách.”
- Chi tiết nhỏ F18 được xử lý luôn: nút `Xem chi tiết` là `<button>` nên cao
  ≥44px (đo danh sách control <44px của `.admin-page`: rỗng).

### F17 (P2) — test

Từ **200 → 214 test** trong 33 file; **không xoá test nào** (chỉ đổi
`button` → `tab` và nhãn policy mới). Test mới:

- `tổng quan: Cần chú ý tối đa 3 dòng và ưu tiên tín hiệu chưa có KPI`.
- `tổng quan: outbox.failed > 0 hiện dòng thông báo gửi lỗi và thiết bị ngoại tuyến vẫn có chỗ`
  (thay assertion rỗng `failed: 0` cũ).
- `người dùng: mở form focus ô lý do, hủy trả focus về nút, lý do bắt buộc + mô tả lỗi`.
- `policy: lỗi field → focus ô sai đầu tiên và summary lỗi ngay cạnh nút`.
- `policy: preview hiện bằng chứng version nền, digest ngắn và “không ghi dữ liệu”`.
- `policy: lịch sử có bản phát hành thì nhãn là “Giá trị mặc định”…`.
- `khung trang: ArrowRight đổi tab và focus theo tab mới`.
- `khung trang: tab và mục con lưu trong URL, mở lại link không mất`.
- `audit: Xem chi tiết mở dòng full-width (colSpan=5), JSON không bị bóp trong ô`.
- `audit: nhãn tiếng Việt cho action phổ biến, actor và target dễ đọc`.
- `audit: bảng rộng hơn khung thì hiện hint cuộn ngang` + `bảng vừa khung thì không có hint`.
- `audit: nhãn cột mobile là aria-hidden trong cell, không dùng pseudo-element data-label`.
- `người dùng: thẻ mobile dùng nhãn aria-hidden, giữ ngày tạo và hint tìm/lọc`.
- Các test cũ của Người dùng/Thiết bị/policy/audit vẫn giữ; bổ sung assertion
  thông báo nằm trong dòng vừa đổi và `Mã hồ sơ` thay UUID trần.

## Bằng chứng chạy (output thật)

Môi trường: Windows, Node v24.22.2, pnpm 12.5.1; chạy `pnpm build:contracts`
trước khi typecheck/test/build.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm --filter @annhien/web typecheck` | exit 0 (`tsc -p tsconfig.json --noEmit`) |
| `pnpm --filter @annhien/web test` | **33 file / 214 test pass**, 13,37s |
| `pnpm --filter @annhien/web build` | exit 0, `✓ built in 493ms`; `AdminPage-*.js` 38,75 kB (trước 30,59 kB) |

Đo bằng Chromium (Playwright 1.65.1, script tạm ngoài repo, không commit),
dev web **4360** + API thật **3000**, đăng nhập admin seed:

- Viewport 1280×900, 390×844, 360×740 và bộ “chữ lớn” của cả ba; mở Tổng quan,
  Người dùng (+ form + thông báo), Thiết bị, Chính sách (+ lỗi field + 409),
  Nhật ký (+ mở chi tiết). Thêm 768×900 và 1024×900 cho bảng Nhật ký.
- **`document.scrollWidth == clientWidth` ở mọi lượt đo** (0 tràn trang); 0
  `pageerror`; log console chỉ có 6 dòng 409 do route mock cố ý cho kịch bản
  409 (không phải lỗi ứng dụng).
- **Không có control nào trong `.admin-page` nhỏ hơn 44×44** — đo 36 button + summary
  trên 5 màn ở 375px, danh sách control nhỏ là rỗng.
- Luồng ghi (PATCH trạng thái, 409 preview) được **mock ở tầng route**, không
  chạm API/DB: không PATCH user thật, không publish policy, không seed/xoá DB.

## Ảnh kiểm tra

Thư mục: `C:/Users/nguye/AppData/Local/Temp/v4-fix-admin/shots` (ngoài repo).

- Bộ 6 điều kiện (1280/390/360 và bản `-large`): `overview-*`, `users-*`,
  `users-form-*`, `users-notice-*`, `devices-*`, `audit-*`, `audit-details-*`,
  `policy-invalid-*`, `policy-stale-*`, thêm `audit-768x900.png`.
- `results.json`: overflow trang, vị trí field lỗi/summary/cảnh báo 409/nút Tải
  lại/notice theo viewport, kích thước `<td colspan>`/`<pre>`, cờ hint, focus,
  URL sau phím mũi tên, ảnh chụp kèm lỗi console.

## Chưa làm / giới hạn

- **F12 actor picker >100 user** và **F13 giữ bộ lọc trong URL**: cần API/thêm
  tham số ngoài phạm vi cho phép; đã ghi rõ ở trên.
- **F07** (Cần chú ý có link tới tab liên quan; bỏ dòng lặp KPI) chỉ xử lý phần
  “không chiếm chỗ KPI”: thứ tự ưu tiên đặt tín hiệu chưa có KPI trước, cap 3
  dòng; chưa thêm link vì ngoài danh sách phải sửa.
- **F01 trên tablet (768–1024) và chế độ chữ lớn ở 1280**: bảng vẫn cần cuộn
  ngang trong khung (đúng thiết kế F03) nên ô chi tiết rộng bằng bảng; `<pre>`
  tự cuộn ngang và dòng hint nhắc vuốt. Ở ba viewport bắt buộc
  (1280/390/360) `<pre>` rộng 810/337/307px, không bẻ từ.
- Không chạy `pnpm test:e2e` của repo (Playwright config trỏ 5173 đang có server
  khác, E2E không nằm trong yêu cầu); kiểm giao diện bằng script Playwright tạm
  đặt ngoài worktree.
- Không kiểm screen reader thật (NVDA/VoiceOver): a11y dựa trên `ariaSnapshot`
  của Chromium và cấu trúc DOM.
- Ảnh full-page mobile có artifact của bottom-nav cố định; ảnh viewport là ảnh
  dùng để duyệt bố cục.
