# Handoff — sửa accessibility P1/P2 chính (v2)

- **Task:** `task_14ae66306ea7`, dispatch `ctx_fd976a986048`; worker `fix-a11y-p1`.
- **Nhánh/worktree:** `fix-a11y-p1` tại `C:\Users\nguye\orca\workspaces\DATN\fix-a11y-p1`.
- **Nền:** `9f60f43 docs(orchestration): spec accessibility P1/P2`.
- **Ngày:** 15/11/2026 01:01 (+07:00).
- **Trạng thái:** xong F-P1-1, F-P1-2, F-P2-4 (phần chi tiết cảnh báo), F-P2-5, F-P2-6, F-P2-7. Không sửa `AppShell`/router/API/docs/`layout.css`.
- **Commit:** xem `git log -1 --oneline` trên nhánh `fix-a11y-p1` (báo hash trong worker_done; file handoff nằm trong cùng commit).

## Phạm vi và file đã sửa

| File | Thay đổi |
| --- | --- |
| `apps/web/src/styles/tokens.css` | `--color-ink-muted` `#5b6f81` → `#4c5f70`; thêm `html { scroll-padding-bottom: 6rem }` để focus không bị nav dưới che |
| `apps/web/src/features/alerts/AlertsPage.tsx` | Lỗi xác nhận không phải 409 → `Alert tone=error` + `Thử lại`, giữ danh sách/trạng thái; 409 tải lại danh sách để phân biệt “đã có người xác nhận” với dữ liệu cũ; ẩn nút “Xác nhận” khi cảnh báo đã `acknowledged`/có `acknowledgedBy` |
| `apps/web/src/features/alerts/AlertsPage.test.tsx` | +3 test: lỗi 500 có `role=alert` + giữ trạng thái; đã acknowledged không có nút; 409 do người khác xác nhận ra thông điệp đúng, không báo “danh sách cũ” |
| `apps/web/src/features/alerts/AlertDetailPage.tsx` | Thẻ hành động/kết thúc dùng `<h2>` thay `<Card>` (H1→H2, hết nhảy H3); lỗi xác nhận không phải 409 có tiêu đề + nút `Thử lại`; chỉ hiện “Tôi đang hỗ trợ” khi cảnh báo còn `open` và chưa có người xác nhận |
| `apps/web/src/features/alerts/AlertDetailPage.test.tsx` | +3 test: lỗi 500 thân thiện + giữ trạng thái; acknowledged không có nút; thứ tự heading H1→H2 |
| `apps/web/src/features/notifications/NotificationsPage.tsx` | Chấm “chưa đọc” thành trang trí (`aria-hidden`), trạng thái đọc bằng chữ ẩn `.visually-hidden` thay vì `aria-label` trên `<span>` không role |
| `apps/web/src/features/notifications/NotificationsPage.test.tsx` | File mới: +1 test ngữ nghĩa chấm chưa đọc (không còn `aria-label`, chữ ẩn chỉ có ở mục chưa đọc) |
| `apps/web/src/components/MeasurementChart.tsx` | Vùng cuộn `.chart__scroll` có `tabIndex=0`, `role="group"`, nhãn hướng dẫn phím mũi tên; SVG giữ `role="img"` + bảng dữ liệu thay thế |
| `apps/web/src/components/MeasurementChart.css` | File mới (feature CSS, không sửa `layout.css`): `scroll-padding-bottom`/`scroll-margin-bottom`, focus ring cho vùng cuộn |
| `apps/web/src/components/MeasurementChart.test.tsx` | File mới: +1 test vùng cuộn focusable + nhãn + SVG vẫn có tên |

Không sửa `tokens` khác ngoài `--color-ink-muted`; màu mới làm tăng tương phản trên mọi nền sáng (kể cả `sand-soft`, `teal-soft`, `brick-soft` nơi token cũ dưới 4,5:1).

## Kết quả kiểm — output thật

Môi trường: Windows + Git Bash; Node `v24.22.2`; pnpm `12.5.1`; Playwright `1.65.1` (Chromium headless), axe-core `4.14.0`.
Cài đặt: `pnpm install --prefer-offline --frozen-lockfile` → 711 package, 23,3 s, **không đổi `pnpm-lock.yaml`**.
Lưu ý: cổng `5173` đang là instance của lead/QA (mã cũ), nên mọi kiểm trình duyệt dưới đây chạy trên Vite riêng cổng **5199** của worktree này; E2E dùng config tạm trỏ `5199` rồi xoá.

| Lệnh / phép đo | Kết quả |
| --- | --- |
| `pnpm --filter @annhien/web test` | **26 file / 131 test passed** (nền trước sửa: 24 file / 123 test; +8 test mới) |
| `pnpm --filter @annhien/web typecheck` | pass |
| `pnpm typecheck` (root, gồm contracts/api/web/simulator) | pass |
| `pnpm --filter @annhien/web build` | pass (`tsc --noEmit` + vite build) |
| Playwright E2E `alerts.spec.ts` + `smoke.spec.ts` trên cổng 5199 | **4/4 passed** |

### F-P1-1 — tương phản chữ phụ trên `paper-deep`

Công thức WCAG 2.x, đo trên trình duyệt (`getComputedStyle`, nền `rgb(242,234,217)` = `#f2ead9`):

| Phần tử | Trước | Sau |
| --- | --- | --- |
| `.shell__safety-note` (13,8 px) | 4,35:1 (axe báo 4,34) | **5,52:1** |
| `.shell__tagline` | 4,35:1 | **5,52:1** |
| `.shell__user-email` | 4,35:1 | **5,52:1** |
| `.shell__more-toggle > span` | 4,35:1 | **5,52:1** |
| `.site-footer__note` (landing) | 4,35:1 | **5,52:1** |

Axe `color-contrast` sau sửa: **0 vi phạm** trên `/app` 1280×900, `/app/alerts` 390×844, `/app/alerts/:id` 1280/390, `/app/notifications` 390, `/app/history` 390/360, landing 1280. Token cũng cải thiện các nền tint: `sand-soft` 4,41→5,59; `teal-soft` 4,32→5,49; `brick-soft` 4,22→5,36.

### F-P1-2 — xác nhận thất bại không phải 409

- Unit test trang danh sách và chi tiết: chặn `POST .../acknowledge` trả 500 → có `role="alert"` với tiêu đề “Chưa xác nhận được cảnh báo” / “Chưa gửi được xác nhận”, nội dung lỗi + “Cảnh báo vẫn giữ nguyên trạng thái”, nút `Thử lại`; nút xác nhận vẫn còn và trạng thái “Đang mở” không đổi.
- Kiểm trình duyệt thật (390×844, mock 500): `hasAlertRole: true`, text `Chưa xác nhận được cảnh báoMáy chủ đang bận. Cảnh báo vẫn giữ nguyên trạng thái. Kiểm tra kết nối và thử lại. Thử lại`, `retryButton: true`. Ảnh: `C:/tmp/fix-a11y/shot-ack-failure-fixed.png`.

### F-P2-4 — heading chi tiết cảnh báo

DOM thật sau sửa (1280 và 390): `H1 Nghi ngã` → `H2 Cảnh báo cần hành động` → `H2 Diễn biến sự kiện` → `H2 Hành động của người hỗ trợ` → `H2 Người nhận cảnh báo`. Axe `heading-order`: **0 vi phạm** ở cả hai viewport.

### F-P2-5 — chấm chưa đọc

DOM: `.notification-item__dot` có `aria-hidden="true"`, không còn `aria-label`; text ẩn `Chưa đọc` chỉ xuất hiện ở mục chưa đọc. Axe `aria-prohibited-attr`: **0 vi phạm** (`/app/notifications`, 390×844, quét cả bộ luật).

### F-P2-6 — vùng cuộn biểu đồ

- `.chart__scroll` có `tabIndex=0`, `role="group"`, nhãn “Biểu đồ nhịp tim có thể cuộn ngang. Dùng phím mũi tên trái/phải…”. Axe `scrollable-region-focusable`: **0 vi phạm** ở 390×844 và 360×740.
- `scroll-padding-bottom` tính được: **102 px** (cỡ mặc định), **120 px** (chữ lớn). Focus biểu đồ rồi đo: 390×844 `chart.bottom=640 < nav.top=777`; 360×740 `536 < 650`; chữ lớn 390 `414 < 739` → **không còn bị nav che**. `ArrowRight` cuộn `scrollLeft 0 → 40`.
- Không sửa `layout.css`; rule mới nằm trong `MeasurementChart.css` + token/scroll-padding toàn cục ở `tokens.css`.

### F-P2-7 — cảnh báo đã acknowledged

- Danh sách: chỉ hiện “Xác nhận” khi `state === 'open'` và `acknowledgedBy == null`; cảnh báo đã acknowledged chỉ còn pill “Đã xác nhận”, meta “Đã xác nhận bởi …” và link “Chi tiết”.
- 409 khi người khác vừa xác nhận: trang tự tải lại danh sách, hiện “Cảnh báo đã có người xác nhận — <tên> đã xác nhận đang hỗ trợ… bạn không cần xác nhận lại”; không còn thông điệp “Danh sách dưới đây có thể cũ”.
- Chi tiết: không còn nút “Tôi đang hỗ trợ” khi đã có người xác nhận hoặc cảnh báo không còn `open`.

## P2 chưa làm (ngoài phạm vi file được phép)

- **F-P2-1**: live region/focus sau thao tác thành công (danh sách/chi tiết/thông báo/trợ lý) — cần sửa thêm `AppShell` hoặc nhiều feature.
- **F-P2-2**: panel xác nhận tại chỗ (share/admin/tasks/devices) mất focus, không `Escape`.
- **F-P2-3**: menu “Thêm” không đóng bằng `Escape`/click ngoài (`AppShell`).
- **F-P2-8**: tràn ngang khi ép cỡ chữ 150%/200% (`layout.css`, `AppShell`).
- **F-P2-9**: cỡ chữ/vùng chạm nhỏ (`--text-xs`, link phụ, checkbox).
- **F-P2-10**: focus về trường lỗi đầu tiên khi validate form.
- **F-P2-11**: thông báo khi đổi tab Quản trị.
- **F-P2-12**: nhãn “dữ liệu mô phỏng” cấp trang ở Devices/Alerts/Notifications/Assistant/Tasks.
- **F-P2-13**: dialog/modal và xác nhận trước “Phát hành” policy.
- **F-P2-4 phần tab “Chính sách thiết bị”**: vẫn là `Card` → H3 dưới H1 trong `AdminPage`; ngoài vùng được phép của task này, cần worker/admin sửa `AdminPage`/`Card` (tốt nhất cho `Card` nhận `headingLevel`, mặc định `h2`).

## Ghi chú cho người tích hợp

- Script kiểm axe/đo đạc tạm ở `C:/tmp/fix-a11y/axe-fix-check.mjs`, kết quả `C:/tmp/fix-a11y/report.json` (ngoài repo, có thể bị xoá). Chạy lại: bật Vite cổng 5199 trong `apps/web`, sửa `BASE` trong script, `node axe-fix-check.mjs`.
- `scroll-padding-bottom: 6rem` đặt trên `html` trong `tokens.css` là thay đổi toàn cục có chủ đích; nếu sau này nav dưới cao hơn 6rem (chữ rất lớn), cần tăng token này.
- Không có thay đổi API/schema/dữ liệu; không dùng dữ liệu sức khỏe thật.
