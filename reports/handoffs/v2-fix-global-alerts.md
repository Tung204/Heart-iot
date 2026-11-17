# Handoff — v2-fix-global-alerts (P1-4 product gaps, P1-6 UX, P2-6 hiệu năng)

- **Ngày:** 2026-11-15 (Asia/Ho_Chi_Minh)
- **Worker:** fix-global-alerts (dispatched), worktree `C:/Users/nguye/orca/workspaces/DATN/fix-global-alerts`
- **Nhánh:** `fix-global-alerts` (không merge)
- **Base:** `180b7f0 docs(orchestration): spec badge cảnh báo toàn tài khoản`
- **Commit sửa:** `f83b458` (fix(web): badge thông báo chưa đọc và banner cảnh báo mới toàn tài khoản)
- **Nguồn finding:**
  - `reports/qa/v2-product-gaps.md` P1-4 (worktree này) — cảnh báo hồ sơ khác không xuất hiện, không badge toàn cục.
  - `reports/qa/v2-ux-visual.md` P1-6 (worktree `qa-ux-visual`, HEAD `8434d66`) — không có chỉ báo thông báo mới/mất SSE ngoài trang đang xem.
  - `reports/qa/v2-hieu-nang-va-on-dinh-tai-trang.md` P2-6 (worktree này) — mất SSE không có chỉ báo.
- **Tài liệu tham chiếu:** `docs/06-trai-nghiem-va-man-hinh.md` (trạng thái “Mất mạng/offline”, “Kênh thông báo lỗi”, không dùng màu làm tín hiệu duy nhất), `docs/12-nguyen-tac-phat-trien-va-bang-chung.md`.
- **Phạm vi đã giữ:** chỉ web UI + CSS + test web. **Không sửa** API, router, contracts, Dashboard, docs; không đổi logic quyền/dữ liệu.

## Đã sửa

### 1. Badge số thông báo chưa đọc — P1-4/P1-6

- **Hook mới** `apps/web/src/features/notifications/useUnreadNotifications.ts`:
  - Dùng đúng query key `queryKeys.notifications` (dùng chung cache với `NotificationsPage`) → một bộ đệm, không gọi API trùng khi mở trang Thông báo.
  - `refetchInterval` **20 giây** (`UNREAD_POLL_INTERVAL_MS`), trả `false` khi `document.hidden`; thêm `refetchIntervalInBackground: false`. React Query cũng không chạy interval khi cửa sổ mất focus; quay lại tab sẽ refetch theo `refetchOnWindowFocus`.
  - SSE `notification.sent` (hook realtime đã có) invalidate đúng key này → badge cập nhật ngay, không chờ poll.
  - Phát hiện “mới”: lần tải đầu chỉ lập mốc (không báo thông báo cũ); các lần sau báo khi có **id mới** hoặc **unreadCount tăng**; `dismiss()` ẩn banner và cùng thông báo đó không bật lại ở lần tải sau.
- **`AppShell.tsx`**:
  - Badge trên mục “Thông báo” ở **sidebar desktop** và trong **menu “Thêm” của mobile** (mục Thông báo). Số > 99 hiển thị `99+`.
  - Badge có `aria-hidden` cho phần số và một dòng `.visually-hidden` **“N thông báo chưa đọc”**, nên tên đọc của liên kết là “Thông báo N thông báo chưa đọc” — không dựa vào màu/số trần.
  - `unreadCount === 0` → không render badge, liên kết vẫn còn.
  - Badge `margin-inline-start: auto` trên sidebar/menu; CSS bottom-nav neo góc phải (dự phòng nếu sau này hiện lại mục optional) để không đè icon và không tăng chiều cao thanh nav.
- **Không thêm** badge/dot trên nút “Thêm”: đã đo thử trong trình duyệt, badge ở góc nút “Thêm” (72 px/mục) **đè icon** ở 360 và chữ lớn, nên bỏ; badge nằm ở mục “Thông báo” trong menu như yêu cầu “mobile bottom/more”.

### 2. Banner thông báo mới — P1-4/P1-6

Trong `AppShell.tsx`, ngay trên vùng nội dung:

- Chỉ hiện khi có thông báo mới **và** người dùng không ở `/app/notifications`.
- `role="status"`, nội dung: **“Có thông báo mới cho hồ sơ …”** (chỉ tên hồ sơ; không loại cảnh báo, không chi tiết sức khỏe).
- Hai hành động: `Xem thông báo` (liên kết `/app/notifications`) và `Đóng` (`aria-label="Đóng thông báo mới"`). **Không tự điều hướng**.
- Đang ở trang Thông báo thì state được xóa ngay (kể cả thông báo tới lúc đang mở trang) → rời trang không thấy banner cũ. Đã đóng thì tải lại cùng dữ liệu không bật lại.

### 3. Banner mất SSE — P2-6

- `AppShell` dùng giá trị `{ status, retryAttempt }` của `useSubjectEvents` (trước đây bị bỏ qua).
- Điều kiện: `retryAttempt > 0 && status !== 'revoked'`. `retryAttempt` tăng khi `onerror`, **giữ nguyên trong lúc chờ/đang thử lại**, chỉ về 0 khi `onopen` → banner **“Mất cập nhật trực tiếp — đang thử lại”** hiện tới khi nối lại rồi tự ẩn.
- Banner có dòng phụ “Cảnh báo đã tải vẫn giữ nguyên; hệ thống tự kết nối lại khi có mạng.” — lỗi stream không xóa cache cảnh báo (hook chỉ xóa khi `revoked`).
- Tab ẩn không bật banner (không tăng `retryAttempt`), tránh báo sai khi chủ động đóng stream.

### 4. CSS — `apps/web/src/styles/layout.css`

Chỉ thêm/sửa rule badge + banner: `.shell__nav-badge` (kích thước, viền, số tabular), `.shell__bottomnav > a > .shell__nav-badge` (neo góc phải, `:has` để `position: relative`), `.shell__banner`, `.shell__banner--notice`, `.shell__banner--warning`, `.shell__banner-text/actions/hint`. Banner dùng `flex-wrap`, `min-width: 0`, `overflow-wrap: anywhere` để không tràn ngang ở 360/390/chữ lớn.

### 5. `useSubjectEvents.ts`

Không cần sửa production code: hook đã trả `status` + `retryAttempt` đúng ngữ nghĩa banner cần. Chỉ thêm test khóa hành vi (`useSubjectEvents.test.tsx`).

## Kiểm chứng

### Lệnh (worktree này)

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | pass |
| `pnpm build:contracts` | pass |
| `pnpm --filter @annhien/web typecheck` | pass |
| `pnpm --filter @annhien/web test` | **27 file / 148 test pass** (thêm 16 test so với base) |
| `pnpm --filter @annhien/web build` | pass (`✓ built in 241ms`) |

Test thêm:

- `apps/web/src/app/AppShell.test.tsx` (+7): badge 2 chưa đọc ở cả sidebar và bottom-nav, accessible name chứa “2 thông báo chưa đọc”; 0 chưa đọc → không badge nhưng còn liên kết; menu “Thêm” có badge ở mục Thông báo, tên nút vẫn là “Thêm”; banner thông báo mới (`role=status`, có tên hồ sơ, không chi tiết sức khỏe, không tự điều hướng, đóng được, không lặp); bấm “Xem thông báo” → mở hộp thư và banner biến mất; SSE `notification.sent` → badge/banner cập nhật ngay; SSE `onerror` → banner mất kết nối, nối lại sau backoff 1 giây → banner ẩn.
- `apps/web/src/features/realtime/useSubjectEvents.test.tsx` (**mới**, 5): mở đúng URL stream, `onopen` → `open`; `onerror` → `closed` + `retryAttempt=1`, nối lại sau 1 giây kèm `cursor=<lastEventId>`, còn banner cho tới `onopen`; không có hồ sơ → `idle`; `notification.sent` → invalidate hộp thư; `revoked` → đóng stream + `revoked`.
- `apps/web/src/features/notifications/useUnreadNotifications.test.tsx` (**mới**, 4): chính sách 20–30 giây, tab ẩn trả `false`; lần tải đầu không báo “mới”; id mới báo một lần, dismiss không lặp; unreadCount tăng dù chưa thấy id mới vẫn báo.

Mock `fetch` + `EventSource` giả; **không gọi API thật**.

### Kiểm layout trong trình duyệt thật (API giả qua Playwright route, không gọi API thật)

- Script tạm (đã xóa), web build production phục vụ `vite preview :4173`; route `**/api/v1/**` trả `/me`, `/subjects`, `/notifications` (lần 1 baseline, lần 2 có thông báo mới) và một sự kiện SSE `notification.sent` rồi đóng stream.
- Ảnh + dữ liệu đo (ngoài repo): `C:/Users/nguye/AppData/Local/Temp/annhien-global-alerts/` (`shots/*.png`, `results.json`).

| Viewport | Tràn ngang (`scrollWidth - innerWidth`) | Banner `role=status` | Badge/icon |
| --- | --- | --- | --- |
| 1280×900 | 0 | 2 (thông báo mới + mất SSE) | sidebar: badge 23,8×…, **không giao** với icon chuông |
| 390×844 | 0 | 2 | menu “Thêm”: badge “2” hiện, không tràn; mục Thông báo vẫn ẩn khỏi bottom-nav như trước |
| 360×740 | 0 | 2 | menu “Thêm”: badge “2” hiện, không tràn |
| 390×844 chữ lớn | 0 | 2 | menu “Thêm”: badge “2” hiện, không tràn |
| 360×740 chữ lớn | 0 | 2 | menu “Thêm”: badge “2” hiện, không tràn |

Banner thông báo mới hiển thị đúng “Có thông báo mới cho hồ sơ Ông Bảy” + Xem/Đóng; banner SSE đúng câu yêu cầu. Ảnh: `desktop-1280x900.png`, `mobile-390x844-more.png`, `mobile-360x740-more.png`, `mobile-large-390x844-more.png`, `mobile-large-360x740-more.png`.

## File thay đổi

- `apps/web/src/app/AppShell.tsx`
- `apps/web/src/app/AppShell.test.tsx`
- `apps/web/src/features/notifications/useUnreadNotifications.ts` (mới)
- `apps/web/src/features/notifications/useUnreadNotifications.test.tsx` (mới)
- `apps/web/src/features/realtime/useSubjectEvents.test.tsx` (mới; production hook không đổi)
- `apps/web/src/styles/layout.css` (chỉ rule badge/banner)
- `reports/handoffs/v2-fix-global-alerts.md` (file này)

## Giới hạn / điểm chưa sửa

1. **Chỉ in-app khi tab đang mở.** Không Web Push, service worker, email/SMS; đóng tab/app thì không nhận. Đúng phạm vi finding (“không cần Web Push để sửa lỗi này khi tab đang mở”).
2. **SSE vẫn chỉ mở cho hồ sơ đang xem** (không sửa API). Thông báo của hồ sơ khác đến qua poll 20 giây (cộng outbox API ~5 giây), không tức thời như hồ sơ đang xem. Muốn tức thời toàn tài khoản cần stream cấp tài khoản ở API — ngoài phạm vi worker này.
3. **Mobile:** mục “Thông báo” bị CSS ẩn khỏi bottom-nav từ trước (`shell__nav-optional` <1024), nên badge nằm trong menu “Thêm”; chưa có chỉ báo trên chính nút “Thêm” vì đã đo thấy đè icon ở 360/chữ lớn. Người dùng phải mở “Thêm” mới thấy số.
4. **Admin không có hồ sơ** không tải `/notifications` (không badge) — hợp lý vì không có cảnh báo nào để nhận.
5. **Banner SSE không phân biệt nguyên nhân** (mạng, server, tab vừa hiện lại) và không có nút thử lại thủ công; hook tự backoff 1→2→4…30 giây.
6. **Không kiểm bằng trình đọc màn hình thật**; mới kiểm accessible name qua DOM. Không chạy `pnpm test:e2e` của repo (Playwright config trỏ `localhost:5173` đang phục vụ worktree khác); thay bằng harness route-mock riêng ở trên.
7. **Không thêm** đổi `document.title`/favicon, đánh dấu đã đọc tất cả, hay phân công/leo thang cảnh báo — ngoài phạm vi P1-4/P1-6 đã chốt.
8. `useSubjectEvents.ts` production giữ nguyên; nếu sau này đổi ngữ nghĩa `retryAttempt`, banner dựa trên test `useSubjectEvents.test.tsx` sẽ bắt lệch.

## Trạng thái

Xong badge thông báo chưa đọc + banner thông báo mới + banner mất SSE trên nhánh `fix-global-alerts` (commit `f83b458`); test web 148/148, typecheck + build pass, layout 1280/390/360/chữ lớn không tràn ngang và badge không đè icon. Sẵn sàng cho lead review/merge; giới hạn lớn nhất là chỉ in-app (không Web Push) và SSE vẫn theo hồ sơ đang xem nên hồ sơ khác trễ tối đa ~20 giây.
