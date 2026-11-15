# Handoff — v2 / feat-motion (chuyển động nhẹ, có mục đích)

- **Thời điểm:** 2026-11-15 08:32 (Asia/Ho_Chi_Minh)
- **Nhánh/worktree:** `feat-motion` — `C:/Users/nguye/orca/workspaces/DATN/feat-motion`
- **Base:** `c56fece docs(orchestration): spec chuyển động nhẹ`
- **Commit code:** `dd94c947373f1f485d779e7adfcf4228018d7d07` (feat(web): chuyển trang mềm, phản hồi khi bấm và giảm chuyển động)
- **Vùng ghi:** `apps/web/src/app/AppShell.tsx`, `apps/web/src/app/AppShell.test.tsx`, `apps/web/src/styles/layout.css`, `apps/web/src/styles/tokens.css`, file này.
- **Không sửa:** router, features, API, contracts, docs/HTML, package.json (không thêm dependency).
- **Nguồn finding:** `reports/qa/v2-ux-visual.md` (worktree `qa-ux-visual`, HEAD `8434d66`) — mục Motion/feedback: “không có animation trang trí/parallax; hover/focus nhẹ, spinner rõ, có `prefers-reduced-motion`; vấn đề motion chính là điều hướng giữ scroll (P1-1), không phải hiệu ứng”. Báo cáo này **không có trong worktree feat-motion** nên đọc từ worktree QA.
- **Tài liệu tham chiếu:** `docs/06-trai-nghiem-va-man-hinh.md` (trạng thái phải thiết kế, responsive 1280/390/360, chữ lớn), `docs/12`; skill `frontend-design` (“Keep motion purposeful. Prefer feedback to user actions; respect reduced-motion preferences.”).

## Đã làm

### 1. Chuyển trang mềm — `AppShell.tsx` + `layout.css`

- Hook `useRouteTransition(pathname)` (trong `AppShell.tsx`) giữ `{ path, animate }`; chỉ khi `pathname` đổi mới bật `animate`. State được cập nhật ngay trong render (mẫu “adjusting state when props change” của React) để lớp animation có mặt ngay ở lần render đầu của key mới — không phải chờ effect (sẽ là một nháy nội dung đã hiện rồi mới mờ đi).
- `<Outlet />` được bọc trong `<div key={pathname} className="shell__route [shell__route--enter]">`, thay cho `key` đặt trực tiếp trên `AppErrorBoundary` (key vẫn đảm bảo lỗi trang trước không dính sang trang mới; comment trong code ghi rõ).
- CSS: `.shell__route--enter { animation: shell-route-in var(--motion-route) both }`; keyframes
  `from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none }`.
  Chỉ `opacity`/`transform` → không layout shift; `--motion-route: 200ms cubic-bezier(0.22,0.61,0.36,1)`, `--motion-route-shift: 8px` (trong khoảng yêu cầu 160–220ms, 6–8px).
- **Không chạy lại** khi refetch/query đổi hay đổi query param/hash: cùng `key` nên không mount lại. Lần tải đầu (POP/reload) không có lớp `--enter` → không làm chậm first paint.
- `.shell__route { min-width: 0 }` để nội dung rộng (bảng) không đẩy tràn ngang; nav (`sidebar`, `bottomnav`) nằm **ngoài** phần tử này nên không bị mờ/che khi chuyển trang.

### 2. Phản hồi khi bấm + hover — `layout.css`

- `.button:active` → `translateY(0) scale(0.985)` (hạ nhẹ tại chỗ, không nảy). Đặt **sau** khối hover để khi vừa hover vừa bấm vẫn thấy phản hồi.
- `.shell__nav-link:active` → nền `--color-paper-deep` + `scale(0.985)`; đặt sau `.is-active` và `:hover` để bấm mục đang mở vẫn có phản hồi.
- `.shell__bottomnav > a:active` → nền `--color-paper-deep` (không scale để thanh nav không rung).
- `.shell__more-toggle:active` → nền + `scale(0.985)`; thêm `transition` cho các mục nav.
- **Hover chỉ trên thiết bị có con trỏ**: chuyển toàn bộ hover của `.button*` (5 biến thể + lift) và hover của `.shell__nav-link`, `.shell__more-toggle`, `.shell__sidebar .shell__more-toggle` vào `@media (hover: hover)`. Cảm ứng không còn dính trạng thái hover sau khi chạm.
- Các hover khác ngoài phạm vi (`.segmented__item`, `.ai-suggestion`, link trong danh sách cảnh báo… — không có chuyển động) giữ nguyên; không thêm hover mới nào ngoài `@media (hover: hover)`.

### 3. Banner thông báo mới — `layout.css`

- `.shell__banner--notice` thêm `animation: shell-banner-in var(--motion-banner) both` (220ms, trượt từ trên xuống 8px + fade khi mount). Chạy đúng một lần, không lặp vô hạn; banner “mất SSE” (`--warning`) không animate vì là trạng thái thường trực.

### 4. `prefers-reduced-motion: reduce` — `tokens.css` + `layout.css`

- Global có sẵn trong `tokens.css` (mọi `animation/transition` về 0.01ms, 1 lần) được giữ nguyên và ghi chú rõ áp dụng cho hiệu ứng mới.
- Thêm khối riêng cuối `layout.css`: `.shell__route--enter, .shell__banner--notice { animation: none }`; `transition: none` cho `.button`, `.shell__nav-link`, `.shell__bottomnav > a`, `.shell__more-toggle`; bỏ `transform` khi `:active`. Tức hiệu ứng mới **tắt hẳn**, không chỉ rút ngắn.

### 5. Token mới — `tokens.css`

`--motion-press: 90ms ease-out`, `--motion-route: 200ms cubic-bezier(...)`, `--motion-banner: 220ms ease-out`, `--motion-route-shift: 8px` (giữ `--motion-fast` cũ). Không dùng animation lặp/trang trí; không thêm dependency.

## Test đã thêm — `AppShell.test.tsx` (4 test, không snapshot)

1. Lần tải đầu không có `.shell__route--enter`; bấm “Lịch sử” → phần tử `.shell__route` **mới** (khác node cũ) có `shell__route--enter`; nav sidebar/bottom-nav nằm ngoài phần tử route và link vẫn truy cập được (`getAllByRole('link', …)`).
2. Refetch `notifications` (kể cả sinh banner mới) và đổi query param (`/app?tab=2`) → **cùng node** `.shell__route`, không thêm lớp animation.
3. Đọc `tokens.css`/`layout.css`: khối `prefers-reduced-motion: reduce` có `animation-duration: 0.01ms !important`, `animation-iteration-count: 1 !important`, và khối riêng phủ `.shell__route--enter`, `.shell__banner--notice` với `animation: none`.
4. Đọc `layout.css`: `.button:hover:not(:disabled)`, `.shell__nav-link:hover`, `.shell__more-toggle:hover` chỉ xuất hiện trong `@media (hover: hover)` (đếm số lần xuất hiện trong toàn file so với trong khối).

Helper `mediaBlocks()` khớp ngoặc nhọn nên không phụ thuộc thứ tự/format CSS.

## Kiểm đã chạy (kết quả thật)

| Lệnh | Kết quả |
| --- | --- |
| `pnpm build:contracts` | exit 0 (`tsc -p tsconfig.json`) |
| `pnpm --filter @annhien/web typecheck` | exit 0, không lỗi |
| `pnpm --filter @annhien/web test` | **31 file, 170 test pass** (13–15s) |
| `npx vitest run src/app/AppShell.test.tsx --reporter=verbose` | 18 test pass, gồm 4 test mới |

Kiểm thêm trong **Chromium thật** (Playwright 1.65.1, dev server riêng cổng 5199, API giả lập `/api/v1/{me,subjects,notifications}`, spec tạm **không commit** và đã xoá):

- 1280×900: lần tải đầu `animation-name: none`; sau khi bấm “Lịch sử” → `shell-route-in`, `0.2s`, `iteration-count: 1`, `playState: running`; `overflowX = 0`; nav ngoài route, `position: fixed`, `z-index: 20`.
- 390×844: cùng animation `0.2s`; `overflowX = 0`; hit-test điểm giữa thanh nav trả về phần tử trong `.shell__bottomnav` (nav không bị nội dung che).
- `emulateMedia({ reducedMotion: 'reduce' })`: `animation-name: none`, `getAnimations().length = 0`, transition của button/nav ≈ `0.01ms`.

Chưa chạy với API/DB thật (cổng 3000 đang do phiên khác dùng; PGlite độc quyền data dir) nên **không có ảnh chụp** kèm báo cáo — các phép đo ở trên là số liệu thật từ Chromium.

## Chưa xong / giới hạn

- Chưa kiểm bằng mắt với dữ liệu thật/ảnh chụp; chưa thử trên thiết bị cảm ứng thật (chỉ mô phỏng `hover: hover` qua CSS và Chromium).
- Chưa có đo FPS/LCP trước–sau; “không chậm first paint” mới được bảo đảm bằng thiết kế (không animation ở lần tải đầu, chỉ opacity/transform) và kiểm `animation-name: none` trên lần tải đầu.
- Landing/auth (`base.css`) không thuộc phạm vi; hover ở đó vẫn như cũ.
- Bước tiếp theo: review bản xem trước theo quy ước frontend của dự án, rồi (nếu duyệt) chạy lại `pnpm -r test` trước khi merge.
