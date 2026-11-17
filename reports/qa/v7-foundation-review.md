# Review độc lập — W1 foundation (v7)

**Trạng thái sau re-check `d4af4da`:** **merge được nhánh foundation để mở W2**, kèm các điều kiện ở §“Re-check d4af4da”. Đây không phải nghiệm thu toàn bộ v7: P2-02 inbox vẫn thuộc C, nợ target của trang P/C/H vẫn còn, và các trang P/C/H/R/A chưa được thay presentation.

- **Worktree review:** `C:/Users/nguye/orca/workspaces/DATN/v7-f1-review`
- **Branch review:** `recheck` (tách từ `d4af4da`); báo cáo gốc trước đó ở `Tung204/v7-f1-review`
- **Base so sánh re-check:** `f7c1322..d4af4da`; review gốc `a10c8ea..dd01cbe`
- **Người kiểm / provider:** Pi, `moxuna / deepseek-v4.1-flash`
- **Thời điểm đo:** 17/11/2026, Asia/Ho_Chi_Minh
- **Web:** `http://127.0.0.1:4360` (Vite 8.3.8, dev server)
- **API:** `http://127.0.0.1:3101`, `WEB_ORIGIN=http://127.0.0.1:4360`, PGlite `.data/qa-f1-recheck` (seed demo cục bộ `@demo.heart-iot.local`; cổng 3000 đang bị worktree khác chiếm nên dùng 3101)
- **Browser:** Playwright `@playwright/test` 1.65.1, Chromium `159.0.8154.6`, headless
- **Tài khoản:** owner `ba-an@demo.heart-iot.local`, caregiver `minh@demo.heart-iot.local`, admin `admin@demo.heart-iot.local`; chỉ đăng nhập/đọc, không gửi mutation nghiệp vụ.
- **Ghi chú môi trường:** không dùng lại API 3000/ảnh 4350 của worktree foundation. Login UI qua `127.0.0.1:4360` với Origin 4360 trả session và cookie `an_session`, nên cấu hình `WEB_ORIGIN` của API là thật, không bỏ qua.

## Re-check `d4af4da` (17/11/2026)

Phạm vi đúng các finding của review trước: P1-01, P1-02, P2-03, P2-04, P2-01; P2-02 chỉ xác nhận deferred. Không review lại toàn bộ page lane.

### Bảng finding → số đo mới → trạng thái

| Finding | Cách kiểm độc lập | Số đo / kết quả mới | Trạng thái |
| --- | --- | --- | --- |
| **P1-01** focus rail | Playwright Chromium 159.0.8154.6, login owner, `/app` 1280×900, Tab qua skip-link → brand → 4 nav → account; đọc computed outline và nền; mở menu bằng Enter để kiểm ring nền sáng | Brand, 3 nav thường và account: **3px solid trắng, offset 3px**, nền `rgb(21,37,62)`, contrast **15,37:1**; nav active `Hôm nay`: **3px trắng**, nền `rgb(40,73,118)`, **9,11:1**; account trong phiên này nền rail nên **15,37:1**, không phải 9,11 như JSON cũ (vẫn >3:1). Menu nền trắng: item “Tài khoản” **3px xanh `rgb(23,75,197)`, offset 3px**, contrast **7,37:1** trên nền `#fff`. Rule `shell.css:345–349`, token `tokens.css:46–47`. | **Đóng**. Chênh số account 9,11 → 15,37 là lỗi ghi bằng chứng, không phải lỗi tương phản. |
| **P1-02** H1 mobile | Đo `getComputedStyle(h1).fontSize` trên `/app`, `/app/overview`, `/app/subjects`, `/app/admin` tại 390×844, 360×740, 390×844 chữ lớn (root 20px) và 1280×900; kiểm `h1` count và overflowX | Cả 4 route: **24px** ở 390 và 360; **30px** khi root 20px; **32px** desktop. `h1Count=1`; `docSW=docCW` ở 16 lượt đo. `.page-title` mobile dùng `base.css:167–172`; các override `.today/.subjects/.assistant` đã bị xoá. | **Đóng**. |
| **P2-03** badge `20+` | Chạy đúng test fixture 20 item + `nextCursor`; đọc code `AppShell.tsx:135–149,531–532,580` | `vitest run src/app/AppShell.test.tsx -t "badge hiện 20+"`: **1 test, 44 skipped, exit 0**. Code dùng `capped = Boolean(nextCursor)`, render `20+`, label `20+ cảnh báo đang mở`. Seed chỉ có 1 cảnh báo nên không có runtime 21 item. | **Đóng** ở mức code + fixture; runtime nhiều trang chưa dựng. |
| **P2-04** ArrowDown/ArrowUp | Browser 1280×900 và 390×844: trigger đóng → ArrowDown; Escape; ArrowUp; Enter; Tab-out; click ngoài; Escape lần cuối | ArrowDown: `aria-expanded=true`, menu mở, focus **“Tài khoản”** (mục đầu); ArrowUp: mở, focus **“Đăng xuất”** (mục cuối); Escape: đóng, focus trả trigger; click ngoài: đóng; Tab-out: đóng sau 3 Tab (qua Aa → Đăng xuất → ra ngoài), focus ra khỏi menu. Cùng kết quả ở 1280 và 390. Trigger key handler `AppShell.tsx:306–317,359`; test `AppShell.test.tsx:540`. | **Đóng**. |
| **P2-01** cổng target | Đọc script QA ngoài repo `C:/tmp/v7-foundation-qa/qa.mjs:46`; kiểm `metrics.json` (`targetSelectors` + `targets`); tự quét lại 390/1280 và phân loại target thuộc shell; đối chiếu bảng owner P/C/H | Script có đúng 5 selector: `a[href]`, `button`, `select`, `summary`, `[role="menuitem"]`; metrics 32 route/viewport, `targetSelectors` ghi cùng danh sách. Tự quét: **shell 0 target <44px** (brand mobile 145,8×44; nav 97,5×64; account 54×54; desktop brand/nav 184×44, account 184×62). Page: **52 lượt, 11 target DOM unique** <44px, cộng **F3 CSS 40px** thành 12 dòng bảng; owner P (login/register), C (`/app`, alerts), H (overview, F3) khớp handoff §5.2. | **Đóng phạm vi F (shell)**; nợ target page vẫn P/C/H. Ghi chú: “12 unique” phải hiểu là 11 DOM + F3 CSS, không phải 12 target DOM. |
| **P2-02** inbox | Mở `/app/notifications`; đọc URL/H1/H2/body/context; grep `AlertsPage`; so source | URL cuối `…/app/alerts?view=notifications` (replace); H1 “Cảnh báo”, **0 H2**, **0** `.subject-context`, không có “Thông báo đã nhận”/“Đánh dấu đã đọc”; body vẫn list cảnh báo. `AlertsPage.tsx` không có `useSearchParams`; `router.tsx:93` chỉ Navigate. | **Còn** — deferred C, không phải lỗi F; không dùng ảnh `alerts-inbox` làm bằng chứng inbox. |

### Cổng lệnh sau fix (worktree sạch, package `@heart-iot`)

| Lệnh | Kết quả thật |
| --- | --- |
| `pnpm install --frozen-lockfile` | exit 0; tạo link workspace `@heart-iot/contracts` sau rename |
| `pnpm build:contracts` | exit 0 |
| `pnpm --filter @heart-iot/web typecheck` | exit 0; `tsc -p tsconfig.json --noEmit` |
| `pnpm --filter @heart-iot/web exec vitest run src/app/AppShell.test.tsx` | 1 file / **45 test**, exit 0; test badge riêng 1 test, exit 0; test ArrowDown/Up riêng 1 test, exit 0 |
| `pnpm --filter @heart-iot/web exec vitest run --no-file-parallelism --maxWorkers=1` | **37 file / 291 test**, exit 0, 113,71 s |
| `pnpm --filter @heart-iot/web build` | exit 0; `✓ built in 306ms` (số của phiên re-check, không phải 510ms trong handoff) |

### Ảnh mới đã mở (8 ảnh)

- `today-390x844.png`: H1 “Hôm nay” 24px, context trên H1, 4 nav bottom, không tràn ngang.
- `overview-390x844.png`: H1 “Sức khỏe” 24px, context trên H1, bottom-nav; các link phụ nhỏ vẫn thấy.
- `subjects-390x844.png`: H1 “Người thân” 24px, không context, nav Người thân active.
- `admin-390x844-admin.png`: H1 “Quản trị” 24px, admin không hồ sơ, bottom-nav chỉ Quản trị.
- `today-390x844-large.png`: root 20px, H1 30px, chip wrap không đẩy document.
- `account-menu-open-1280x900.png`: menu nền sáng, item “Tài khoản” có ring xanh; không chứng minh số đo focus rail (đã đo riêng).
- `overview-1280x900.png`: H1 desktop 32px, bố cục dashboard; không chứng minh target page.
- `register-390x844.png`: link “Đăng nhập” 18px vẫn còn — ảnh xác nhận nợ P, không phải F.

### Kết luận re-check

**Merge được nhánh foundation `d4af4da` để mở W2**, không phải merge toàn bộ v7, với điều kiện:

1. **P2-02 vẫn là cổng C** trước khi đóng W2: `AlertsPage` phải đọc `?view=notifications` và render H2/hàng/mark-read; hiện chỉ redirect.
2. **Nợ target page 52 lượt / 11 DOM unique + F3 CSS** thuộc P/C/H; F đã đóng phần shell (0 vi phạm) nhưng không được tuyên bố cổng 44px toàn app đã xong.
3. **Sửa ghi chú bằng chứng trước khi merge:** account rail thực đo **15,37:1**, không phải 9,11; “12 target unique” gồm **11 DOM + F3 CSS**; script QA `qa.mjs` đang ở ngoài repo nên cần lưu/đường dẫn tái lập.
4. **Các nợ ngoài phạm vi re-check** (P2-05 keyframes/F3, P2-06 pinned context/status H1, P2-07 F01/F02, P2-08 landing/admin) vẫn theo handoff; không dùng kết luận này để nói v7 đã hoàn tất.

## 1. Kết luận lịch sử trước re-check

**Chưa merge được.** Hai lỗi thuộc foundation, không phải trang feature:

1. Focus ring trên rail desktop dùng màu xanh `#174BC5` trên nền mực, tương phản **2,09:1** (mục thường) và **1,24:1** (mục active), trong khi `design-system.md:44` yêu cầu ring trắng trên rail.
2. H1 mobile không theo `design-system.md:57`: đo được **20px** hoặc **32px** thay vì **24px**; với chữ lớn root 20px, H1 `/app` là **25px**, không phải 30px. Nguyên nhân gốc nằm ở `base.css` và các override `.page-title` còn trong CSS legacy.

Ngoài ra cổng bằng chứng target ≥44px của handoff chưa đo link và đang báo thiếu; `/app/alerts?view=notifications` chưa phải inbox; badge `20+` chưa có; menu chưa mở bằng ArrowDown khi đang đóng. Các mục này là P2 (xem §3–§4).

## 2. Lời khai → cách kiểm → kết quả thật (bản gốc `dd01cbe`)

> Các số trong §2–§9 là bản gốc trước fix; số hiện hành sau fix nằm ở mục “Re-check `d4af4da`” phía trên.

### 2.1. Đã kiểm lại bằng lệnh/trình duyệt

| Lời khai trong `reports/handoffs/v7-foundation.md` | Cách kiểm độc lập | Kết quả thật |
| --- | --- | --- |
| `pnpm --filter @annhien/web typecheck` exit 0 | Chạy trên worktree review, sau `build:contracts` | `contracts exit=0`; `typecheck exit=0`; không có output lỗi |
| `pnpm --filter @annhien/web build` exit 0 | Chạy lại | `EXIT:0`; `✓ built in 230ms`; CSS/asset sinh trong `apps/web/dist` |
| Vitest toàn bộ 37 file / 287 test | `pnpm --filter @annhien/web exec vitest run --no-file-parallelism --maxWorkers=1` | `EXIT:0`; `Test Files 37` (37 file), `Tests 287` (287 test), tất cả exit 0, duration `118.65s` |
| 10 file trọng tâm / 83 test | Chạy đúng danh sách AppShell, router, ProtectedRoute, TextSizeToggle, AppErrorBoundary, primitives, useSubjectEvents, useUnreadNotifications, SubjectSwitcher, lib/query | `EXIT:0`; `Test Files 10` (10 file), `Tests 83` (83 test), tất cả exit 0, duration `24.30s` |
| `scrollWidth <= clientWidth` 24/24 | Playwright tự đo `documentElement` và `body` ở 9 route/viewport bắt buộc và một số route thêm | 0 tràn ngang trên **các route đã đo**; chưa chạy đủ 24 nên không xác nhận con số 24/24. Chart History cuộn trong `.chart__scroll` (`overflow-x:auto`, `scrollWidth 652`, `clientWidth 356`), không đẩy document |
| Đúng một H1 24/24 | Đếm `h1` trên DOM | 1 H1 ở **các route đã đo** (9 route bắt buộc + admin/alerts detail/overview/subjects); chưa chạy đủ 24. H1 alert detail chứa cả text trạng thái “Đang mở” (xem P3-02) |
| CTA chính trong viewport đầu | Đo `getBoundingClientRect` của button/link chính ở scrollY=0 | Chưa kiểm đủ mọi CTA của 24 ma trận; ở `/app` 390 nút `Gọi` nằm trên bottom-nav trong màn đầu, nhưng không dùng dòng này làm kết luận toàn ma trận. Các link phụ nhỏ hơn 44px (P2-01) |
| Target ≥44px “12 vi phạm, chỉ 3 chip” | Tự quét **mọi** `a[href]`, `button`, `select`, `summary`, `[role=menuitem]` đang hiển thị | **Không khớp**. `metrics.json` chỉ đo `button:not(.shell__account-item):not(.text-size-toggle)`, không đo link. Tối thiểu 19 target đứng riêng <44px: 18 trong chính ma trận handoff (4 link + 12 chip ở `/app`; 2 link `/login`) và 1 link `/register`; thêm nhiều link ở `/app/overview`, `/app/history`, `/app/alerts` (xem P2-01) |
| Dòng ngữ cảnh đúng 5 loại trang, trên H1 | Đo `.subject-context`, bbox so với H1 | `/app`, `/app/overview`, `/app/history`, `/app/alerts`, `/app/devices` đều có đúng 1 dòng, nằm trên H1; `/app/assistant` alias cũng có 1 dòng và active “Hôm nay”; `/app/subjects`, inbox, `/app/admin` không có dòng. **Khớp** với §3.3 |
| `aria-current` theo nhóm route | Đọc `aria-current="page"` trên rail và bottom-nav | `/app` → Hôm nay; `/app/history` → Sức khỏe; `/app/devices` → Người thân; `/app/assistant` → Hôm nay; `/app/alerts` → Cảnh báo; `/app/admin` → Quản trị. Không có hai mục active |
| Menu mở bằng Enter/Space/ArrowDown; Escape/outside/Tab-out đóng; focus trả trigger | Playwright bấm phím trên trigger ở 1280 và 390 | **Enter** mở và focus mục đầu; **ArrowDown khi menu đóng không mở** (`aria-expanded=false`); ArrowDown/Up khi đã mở di chuyển được; **Escape** đóng và trả focus trigger; click ngoài đóng; Tab-out khỏi menu đóng. Mục menu cao 44px. Xem P2-04 |
| Focus ring 3px `#174BC5`, offset 3px | Tab qua skip-link, brand, nav rail, account trigger | Trên nền sáng: 3px solid, offset 3px. Trên rail: vẫn xanh `rgb(23,75,197)` trên nền `rgb(21,37,62)` / active `rgb(40,73,118)`; **không có ring trắng**. Xem P1-01 |
| Font Be Vietnam Pro; body 16px; H1 32px; large root 20px; topbar 57px; bottom-nav 65px | `getComputedStyle` | Font và body khớp; topbar 57px (56 + border), bottom-nav 65px (64 + border); H1 desktop 32px; **H1 mobile không khớp** (20/32px; large 25/40px). Xem P1-02 |
| Tương phản body 14,13:1; primary 7,37:1; secondary 15,18:1; nav 15,37:1 | Tính lại từ computed color/background | Các cặp này khớp số handoff. **Chưa đo** disabled, hover, error, warning/success trên DOM; focus rail không nằm trong bảng contrast handoff |
| `/app/notifications` → `/app/alerts?view=notifications` replace | Mở URL, đọc `location`, bấm Back | URL cuối đúng `?view=notifications`; Back về `/app/alerts`, không quay lại `/app/notifications`. **Nhưng nội dung là list cảnh báo, không phải inbox** (P2-02) |
| `.subject-context`/`.shell__*` đã rời `app-simple.css` | `grep` + đọc file | `grep` 0 dòng `.subject-context`/`.shell__` trong `app-simple.css`; shell mới nằm ở `styles/shell.css`. Khớp |
| `layout.css` 3509 → 2536 dòng, retire selector foundation | Parse selector, so khớp normalized với `base/primitives/shell`, đọc file | Không còn selector foundation trùng **khít** (0). Nhưng còn `@keyframes shell-route-in`/`shell-banner-in` trùng tên, `.dashboard-region__action .button` ép 40px, và nhiều override context; ledger chưa ghi keyframes. Xem P2-05 |
| `public-simple`/`app-simple`/`admin-simple` không định nghĩa lại foundation | Parse selector + grep `.button/.field/.card/.pill/.alert` | Không có block `.button`/`.field`… độc lập; chỉ có override context như `.hero__actions .button` (width), `.auth-card .field` (margin), `.today-status__action .button` (44px), `.admin-page .button` (44px). Không thấy định nghĩa lại toàn bộ primitive; một số override vẫn nằm ở file legacy (P2-05) |
| `index.html`: title/description trung tính, theme-color `#F4F7FB`, skeleton tĩnh, noscript | Đọc `index.html`, browser meta | Title `Theo dõi sức khỏe`; `theme-color #F4F7FB`; `lang=vi`; boot skeleton nền xám xanh, không animation; noscript giữ. Khớp |
| `AssistantPage` chỉ xoá import + 1 dòng render; test C dùng harness | Đọc diff `a10c8ea..dd01cbe`, chạy suite | Diff đúng 2 dòng trong page; test harness thêm `SubjectContextLine`; không thấy assertion bị nới ngoài phạm vi. Comment đầu page còn nói dòng hồ sơ “ngay dưới H1” (P3-03) |
| Banner thông báo mới link `/app/alerts/{incidentId}`; ẩn đúng incident/inbox; ưu tiên mất quyền > mới > SSE | Đọc `AppShell.tsx`, test; chạy SSE abort; kiểm banner baseline | Code render theo thứ tự revoked → notification → SSE; link dùng `newNotification.incidentId`; ẩn khi `pathname` đúng incident hoặc `scope.inbox`; test AppShell có ca tương ứng. Runtime: SSE abort hiện banner `role=status` “Mất cập nhật trực tiếp — đang thử lại”. **Chưa tạo được banner thông báo mới bằng dữ liệu thật** (§2.2) |
| Unread notifications vẫn còn đường dùng | Mở `/app/notifications`; đọc `AlertsPage.tsx` | **Không khớp**: redirect đúng URL nhưng `AlertsPage` không đọc `searchParams`, không render H2 “Thông báo đã nhận”, không có item/mark-read. Xem P2-02 |
| CSS ledger đầy đủ selector → owner | Đối chiếu ledger với grep/parse | Ledger bỏ sót `@keyframes shell-*` trùng; nhắc `.dashboard-region__action .button` 40px nhưng vẫn để trong W1. Xem P2-05 |
| Interface W2 đóng băng | `git diff --name-only`; kiểm module frozen | Không đổi `features/auth/useAuth`, `features/dashboard/api`, `features/notifications/api` + `useUnreadNotifications`, `features/alerts/labels`, `features/contacts/phone`, `useEmergencyContacts`, `lib/api`, `src/test/utils`. Có đổi `useSubjectEvents` và `SubjectSwitcher` đúng phạm vi W1 |

### 2.2. Không kiểm được trong phiên này

| Phần | Lý do / giới hạn |
| --- | --- |
| Firefox, Safari | Chỉ có Chromium Playwright 159.0.8154.6 |
| Browser zoom 200% | Không chạy; mới đo text-size 125% root (20px) |
| axe/WCAG audit đầy đủ, screen reader thật (NVDA/VoiceOver) | Không có công cụ/phiên đọc màn hình; chỉ đo computed style/keyboard |
| E2E suite `apps/web/e2e` | Không chạy để tránh mutation; chỉ chạy unit + script Playwright riêng |
| API test/backend | Không chạy; task là web foundation |
| Dữ liệu thật/thiết bị thật | Chỉ seed demo tổng hợp: 2 subject, 1 thiết bị, 1 cảnh báo mở, 1 thông báo chưa đọc |
| Banner “mất quyền hồ sơ” runtime | Không thu hồi care link; chỉ đọc code/test |
| Banner “thông báo mới” runtime | Không tạo incident/thông báo mới; mới kiểm baseline (không banner cho thông báo cũ) và code/test |
| Admin có care link | Seed admin không có subject; chỉ kiểm admin không hồ sơ |
| Non-admin không hồ sơ | Không có fixture; code `adminOnly` chỉ dành admin |
| Các trang P/C/H/R/A đầy đủ trạng thái loading/empty/error/form/permission | Ngoài phạm vi W1; mới kiểm happy path §2.1 và một số guard |
| Ảnh 360×740 chữ lớn | Handoff có 390×844 large; không đo 360 large |
| Production preview/build serve | Chỉ chạy `vite build`; không serve dist |
| Network realtime lâu dài, backoff, reconnect | Chỉ abort một lần và thấy banner; không đo chu kỳ backoff đầy đủ |

## 3. Finding P1

### P1-01 — Focus ring trên rail không đủ tương phản (foundation)

- **Route/viewport:** `/app` và mọi trang có shell, desktop 1280×900; cũng ảnh hưởng brand, 4 nav link, account trigger ở rail.
- **Repro:** đăng nhập owner, mở `/app` 1280, blur active element, bấm Tab lần lượt qua skip-link → brand → “Hôm nay” → “Cảnh báo” → “Sức khỏe” → “Người thân” → account trigger. Đọc `getComputedStyle(activeElement).outline` và nền của rail/mục active.
- **Mong đợi:** `design-system.md:44`: focus 3px + offset 3px; “trên rail dùng trắng”. Chỉ báo focus không dùng màu:
  - rail `#15253E` với trắng: 15,37:1;
  - mục active `#284976` với trắng: 9,11:1.
- **Thực tế:** mọi focus trong rail là `3px solid rgb(23,75,197)`:
  - trên rail `rgb(21,37,62)`: **2,09:1**;
  - trên mục active `rgb(40,73,118)`: **1,24:1**.
  - `base.css:111–115` chỉ đổi sang trắng khi có ancestor `.on-dark`, nhưng `AppShell.tsx:559` render `<aside className="shell__sidebar">` không có class này; `shell.css` không có override focus cho rail.
- **Bằng chứng:** script đo computed style (trích xuất trong §2.1); `reports/qa/evidence/v7-foundation/shell-behavior.json` chỉ ghi `focus.outlineColor = rgb(23,75,197)` và không đo nền rail, nên không phát hiện lỗi.
- **Tác động:** người dùng bàn phím khó thấy focus ở điều hướng chính desktop; vi phạm tiêu chí focus của W1 và design §2.1.
- **Điều kiện sửa:** thêm `on-dark` cho rail/nav/account hoặc rule `.shell__sidebar :focus-visible { outline-color: #fff }`; đo lại brand/nav/active/account ở 1280; thêm assertion computed contrast vào `AppShell.test` hoặc script QA.

### P1-02 — H1 mobile sai cỡ và không nhất quán (foundation)

- **Route/viewport:** 390×844 (và 360/390 large):
  - `/app`: **20px**;
  - `/app/overview`: **32px**;
  - `/app/alerts`: **32px**;
  - `/app/history`: **32px**;
  - `/app/devices`: **32px**;
  - `/app/subjects`: **20px**;
  - `/app/settings`: **32px**;
  - `/app/admin` (admin): **32px**;
  - `/app` với root 20px (chữ lớn): **25px**.
- **Repro:** mở từng route ở 390×844, đọc `getComputedStyle(document.querySelector('h1')).fontSize`; bật “Bật chữ lớn” rồi đo lại `/app`.
- **Mong đợi:** `design-system.md:57`: H1 sản phẩm desktop `2rem` (32px), mobile `1.5rem` (24px); với chữ lớn root 20px, H1 mobile là 30px.
- **Thực tế:** `base.css:161–164` đặt `.page-title { font-size: var(--text-3xl) }` (2rem) vô điều kiện. Class này thắng rule `h1` trong `@media (max-width:767px)` ở `base.css:59–64`, nên H1 có class `.page-title` vẫn 32px ở 390. Thêm nữa:
  - `app-simple.css:178–181` `.today .page-title` đặt 20px;
  - `app-simple.css:325–328` `.subjects-page__header .page-title` đặt 20px;
  - `layout.css:2456–2458` `.assistant .page-title` đặt 20px.
  Kết quả là 20px hoặc 32px, không có 24px.
- **Bằng chứng:** ảnh `today-390x844.png` (H1 “Hôm nay” nhỏ hơn ảnh desktop), `alerts-390x844-large.png` (H1 “Cảnh báo” rất lớn), `subjects-390x844.png`; số đo trên.
- **Tác động:** sai hợp đồng typography của foundation; mọi lane W2 dùng `.page-title` sẽ tiếp tục sai; làm H1 mobile không nhất quán giữa các trang.
- **Điều kiện sửa:** cho `.page-title` cùng breakpoint/scale với `PageHeader` (mobile 1.5rem, large scale theo root) hoặc bỏ font-size khỏi class và dùng heading level; xử lý/ghi owner cho các override `.today`/`.subjects`/`.assistant`; đo lại 390 và 360.

## 4. Finding P2

### P2-01 — Cổng target 44px của handoff bỏ sót link; kết luận “12 vi phạm, chỉ 3 chip” không đứng được

- **Route/viewport:** `/app` 1280×900, 390×844 (và 360/large); `/login` 390; `/app/overview` 1280; `/app/history` 390; `/app/alerts` 1280.
- **Repro:** quét mọi `a[href]`, `button`, `select`, `summary`, `[role=menuitem]` đang hiển thị; lấy bbox; so `<44` cả width/height; đối chiếu selector trong `reports/qa/evidence/v7-foundation/metrics.json` và ảnh handoff.
- **Mong đợi:** D10/design §2.3: đo **mọi action đứng riêng**, kể cả link phụ, brand/header, auth switch, select; `sm` vẫn ≥44×44.
- **Thực tế:** `metrics.json` chỉ có entry dạng `"sel": "button:not(.shell__account-item):not(.text-size-toggle)"`; không có selector `a[href]`, `select`, brand. Các số đo bị bỏ:
  - `/app` 390 và 1280: “Sức khỏe 7 ngày →” **146,8×24,8**; “Nhịp tim?” **90,8×31,7**; “Cảnh báo?” **100,6×31,7**; “Pin?” **54,8×31,7** (large: 39,1 cao). Như vậy mỗi viewport có 4 target nhỏ, không phải 3.
  - `/login` 390: “Tạo tài khoản mới” **125,5×18** (large **156,9×23**).
  - `/register` 390: “Đăng nhập” **76×18**.
  - `/app/overview` 1280: “← Hôm nay” **86,5×20**; “Xem lịch sử và biểu đồ →” **166,3×21,7** (2 lần); “Quản lý” **52,6×21,7**; “Xem tất cả cảnh báo →” **160,8×18** (inline).
  - `/app/history` 390: “← Sức khỏe” **90,4×20**.
  - `/app/alerts` 1280: link tiêu đề “Nghi ngã — cần chú ý” **168,9×24,8** (trong row).
- **Bằng chứng:** `metrics.json`; `shell-behavior.json` không có target link; ảnh `today-390x844.png` cho thấy “Sức khỏe 7 ngày” là link đứng riêng; `login-390x844.png` cho thấy link đổi chế độ. Source: `AssistantPage.tsx:105–112,465–470`; `LoginPage.tsx:72–78`; `RegisterPage.tsx:84–88`; CSS `.today-links__item`/`.auth-footer` không đặt `min-height`.
- **Tác động:** bằng chứng cổng W1 không chứng minh được target; ít nhất 19 target đứng riêng <44px: 18 trong chính ma trận handoff (4 link Sức khỏe 7 ngày + 12 chip ở `/app`; 2 link `/login`) và 1 link `/register`, chưa kể các route ngoài ma trận. Handoff chỉ ghi F1/F2 và coi phần còn lại là nợ lane, nhưng kết luận “12 vi phạm, chỉ 3 chip” là sai số đo, không phải chỉ là nợ.
- **Điều kiện sửa:** sửa script đo (link/brand/select), cập nhật `metrics.json`; sửa target ở `/app` (link Sức khỏe 7 ngày và chip) và `/login` (link auth) hoặc ghi rõ owner/gate cho từng mục; thêm test browser target cho link, không chỉ button.

### P2-02 — `/app/alerts?view=notifications` chưa phải inbox; handoff khai “unread notifications” không đúng

- **Route/viewport:** `/app/notifications` → `/app/alerts?view=notifications`, 1280×900 và 390×844, owner có 1 thông báo chưa đọc trong seed.
- **Repro:** mở trực tiếp `/app/notifications`; đợi redirect; đọc H1/H2, body text, `.subject-context`; đọc `AlertsPage.tsx` và `router.tsx`.
- **Mong đợi:** `design-system.md:92,103,204` và D5: URL cũ mở đúng inbox `?view=notifications`; H1 vẫn “Cảnh báo”, H2 “Thông báo đã nhận”, scope tất cả hồ sơ có quyền, hàng có subject/loại/giờ/đã-chưa đọc, **Xem cảnh báo**, **Đánh dấu đã đọc**; mark-read không ack/resolve.
- **Thực tế:** redirect đúng URL và `replace` (Back về `/app/alerts`), nhưng nội dung là list cảnh báo thường:
  - không có H2 “Thông báo đã nhận”;
  - body không có “chưa đọc”/“Đánh dấu đã đọc”;
  - item cảnh báo hiện “Nghi ngã — cần chú ý” và action “Xác nhận/Chi tiết”, không phải hàng thông báo;
  - `.subject-context` = 0 (đúng cho inbox), nhưng không có nội dung inbox thay thế.
  `AlertsPage.tsx:33–60` không import/use `searchParams`; `router.tsx:69–70` ghi “inbox thật của NotificationsPage” và `router.tsx:93` chỉ `Navigate`. `NotificationsPage` vẫn không được mount.
- **Bằng chứng:** ảnh `alerts-inbox-1280x900.png` **giống** `alerts-1280x900.png`, không có H2/thông báo; đây là ảnh không chứng minh điều đã khai.
- **Tác động:** mark-read/unread vẫn không có đường vào; URL `/app/notifications` gây hiểu nhầm là inbox. Đây là phần C phải làm ở W2 theo D5, nhưng handoff W1 đang khai “unread notifications” đã giữ, nên không thể dùng làm bằng chứng cổng.
- **Điều kiện sửa:** hoặc thêm nhánh `view=notifications` trong `AlertsPage` (dùng fetch/mark-read/rollback của `NotificationsPage`), hoặc ghi rõ W1 chỉ redirect và đặt cổng C bắt buộc trước khi đóng W2; sửa comment/router/handoff.

### P2-03 — Badge `20+` khi có cursor chưa được cài

- **Route/viewport:** shell `/app` (mọi viewport).
- **Repro:** đọc `AppShell.tsx:135–144,479–489`; `IncidentList` có `nextCursor` (`packages/contracts/src/incidents.ts:124–127`) nhưng code bỏ qua.
- **Mong đợi:** design §3.2: badge cảnh báo đang mở của hồ sơ, ghi rõ `20+` khi count có cursor; không trộn với thông báo chưa đọc.
- **Thực tế:** `NavBadge` chỉ hiển thị `count > 99 ? '99+' : count`; `openAlertCount = items.length` với limit 20; nếu có 21+ cảnh báo và `nextCursor` khác null, badge là `20` và label “20 cảnh báo đang mở”, không phải `20+`. Không thể dựng 21 cảnh báo bằng seed hiện tại (1 cảnh báo), nên đây là kiểm code, không phải bằng chứng runtime.
- **Tác động:** sai số đếm khi hồ sơ có nhiều cảnh báo; thông tin “20” bị hiểu là tổng.
- **Điều kiện sửa:** dùng `nextCursor` để render `20+` (và label tương ứng); thêm test fixture 20 item + cursor; giữ phân biệt với unread notifications.

### P2-04 — ArrowDown trên trigger đang đóng không mở menu; claim keyboard trong handoff sai

- **Route/viewport:** `/app` 1280×900 và 390×844; account trigger ở rail/topbar.
- **Repro:** focus `.shell__account-trigger`, đóng menu, bấm `ArrowDown`; sau đó bấm Enter để so sánh.
- **Mong đợi:** handoff §1 nói “Mở bằng Enter/Space/ArrowDown”; APG menu button: ArrowDown/ArrowUp mở menu và focus mục đầu/cuối.
- **Thực tế:** `ArrowDown` khi đóng: `aria-expanded="false"`, `.shell__account-menu` không render, focus vẫn trigger, `scrollY=0`. `Enter` mở, focus “Tài khoản”; ArrowDown/Up sau khi mở chạy đúng; Escape trả focus; click ngoài/Tab-out đóng. Trigger `AppShell.tsx:310–325` chỉ có `onClick`, không có `onKeyDown`; key handler chỉ gắn trên menu đang mở.
- **Bằng chứng:** script đo ở 1280/390; ảnh `mobile-account-menu-390x844.png` chỉ chứng minh menu mở, không chứng minh ArrowDown khi đóng.
- **Tác động:** người dùng bàn phím theo pattern menu button không mở được bằng ArrowDown; claim bằng chứng không đúng.
- **Điều kiện sửa:** thêm `onKeyDown` cho trigger (`ArrowDown`/`ArrowUp` mở và focus item đầu/cuối; `Home`/`End` nếu giữ); thêm test keyboard cho trigger đóng.

### P2-05 — CSS foundation còn sót: keyframes trùng, override 40px, pattern dùng chung chưa dời

- **Route/viewport:** toàn app (CSS toàn cục).
- **Repro:** parse selector/keyframes; grep `layout.css`; đọc `metrics`/ledger.
- **Mong đợi:** D1/ledger: `layout.css` chỉ còn feature; foundation một nguồn; không double CSS foundation; ledger đầy đủ.
- **Thực tế:**
  - `layout.css:284` và `:294` vẫn định nghĩa `@keyframes shell-route-in` / `shell-banner-in`; `shell.css:56` và `:380` định nghĩa lại cùng tên. Import `shell.css` sau nên bản mới thắng hiện tại, nhưng vẫn là hai định nghĩa foundation và ledger §1 không ghi.
  - `layout.css:1479–1481` `.dashboard-region__action .button { min-height: 2.5rem }` = 40px, vi phạm target 44px; handoff F3 ghi nhận nhưng vẫn để trong W1.
  - `.segmented` (`layout.css:336`) và `.breadcrumb` (`layout.css:444`) là pattern dùng chung (Alerts/History/AlertDetail) nhưng vẫn ở legacy, không ở `primitives.css`; `ConfirmInline`/`Breadcrumb` chưa có component dùng chung theo D2.
  - Không tìm thấy selector `.button/.field/.card/.pill/.alert/.shell__*` trùng khít giữa foundation và legacy (0); 2536 dòng còn lại chủ yếu là feature (public/auth/alerts/dashboard/history/devices/subjects/share/tasks/settings/admin/studio), không phải một block foundation lớn bị bỏ quên.
- **Bằng chứng:** `css-ledger.md` §1 nói retire toàn bộ `.shell*` nhưng không nhắc keyframes; `metrics.json` target 40px chưa có ca.
- **Tác động:** hiện không đổi render vì thứ tự import, nhưng dễ tái phát khi W3 bỏ layout hoặc đổi thứ tự; vi phạm “một nguồn” và target.
- **Điều kiện sửa:** xoá keyframes khỏi `layout.css`; xử lý F3 (bỏ override hoặc chuyển owner H); chuyển `.segmented/.breadcrumb` sang `primitives.css` hoặc ghi rõ owner lane; cập nhật ledger.

### P2-06 — Context pinned không có trên alert detail/share; H1 alert detail gộp trạng thái

- **Route/viewport:** `/app/alerts/ffffffff-ffff-4fff-8fff-ffffffffffff` 1280×900; `/app/subjects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/share` 1280×900.
- **Repro:** mở hai route owner; đếm `.subject-context`, đọc H1/body.
- **Mong đợi:** design §3.3/§5.6: alert detail/share ghim subject từ URL/API, render cùng dòng nhận diện; H1 alert detail là nhãn loại, trạng thái ở hàng phụ, không nhét vào heading; Share page có tên người được theo dõi.
- **Thực tế:** cả hai route có `.subject-context` = 0. Alert detail H1 là `"Nghi ngãĐang mở"` (StatusPill nằm trong `<h1>`, `AlertDetailPage.tsx:180–188`). Share page body không chứa tên “Bà Trần Thị An”, H1 “Chia sẻ quyền xem”. `routeScope.ts:44,62–64` trả `pinned`; `AppShell.tsx:644` chỉ render `selected`; page không truyền `SubjectContextLine scope="pinned"`.
- **Bằng chứng:** ảnh handoff `assistant-alias`/`alerts` không kiểm detail/share; đây là claim §1 “alert detail/share/Studio data render pinned” không đúng ở thời điểm W1.
- **Tác động:** người dùng không thấy danh tính hồ sơ trên chi tiết cảnh báo/chia sẻ; trạng thái nằm trong H1 làm heading khó đọc/không đúng semantics. Owner C/R cho page; W1 foundation không tự sửa page ngoài `AssistantPage`.
- **Điều kiện sửa:** C/R thêm pinned context và tách status khỏi H1; test route detail/share; nếu W1 không làm, ghi rõ deferred thay vì khai đã có.

### P2-07 — F01/F02 của v6 vẫn tái hiện ở trang P (không do W1 gây ra, nhưng cổng v7 chưa đóng)

- **Route/viewport:** `/invite/x` 390×844; `/login` 390; `/register` 390.
- **Repro:** mở `/invite/x`, đợi request; mở `/login`, đo link “Tạo tài khoản mới”; mở `/register`, đo link “Đăng nhập”.
- **Mong đợi:** `reports/qa/v6-review.md` F01: 422/validation không được gọi là lỗi kết nối và không mời “Thử lại” cho lỗi cố định; F02: link phụ auth/header ≥44×44.
- **Thực tế:**
  - `/invite/x`: H1 “Không kiểm tra được lời mời”, body “Không kết nối được máy chủ hoặc lời mời đang gặp lỗi. Hãy thử lại.” + nút “Thử lại”; token ngắn là 422 validation, không phải lỗi mạng.
  - `/login` 390: “Tạo tài khoản mới” **125,5×18**; `/register` 390: “Đăng nhập” **76×18**.
- **Tác động:** hai rủi ro được yêu cầu không tái phạm vẫn còn. Đây là trang P, ngoài file W1; không phải hồi quy do commit foundation, nhưng không thể dùng câu “F01/F02 đã đóng” trong cổng v7. Source: `InvitePage.tsx:94–95` dùng chung một ErrorState cho mọi lỗi; `LoginPage.tsx:75–77`/`RegisterPage.tsx:86` render link trong `.auth-footer`.
- **Điều kiện sửa:** P xử lý ở W2; thêm test 422/validation tách 404/5xx và test target link auth; không đóng W2 nếu chưa có.

### P2-08 — Landing và Admin vẫn là presentation cũ; ảnh handoff không chứng minh thiết kế v7

- **Route/viewport:** `/` 1280×900 và 390×844; `/app/admin` 1280/390.
- **Repro:** mở `/`, đọc H1/copy, đếm card/hero; mở admin, đọc local nav/KPI.
- **Mong đợi:** design §1/§5.1: H1 “Theo dõi sức khỏe người thân”, không “vẫn an tâm”, ba hàng thông tin không ba card, không hero vòng nhịp tim cũ; §5.12: local nav “Tổng quan / Người dùng / Thiết bị / Chính sách / Nhật ký”, không chỉ 4 KPI.
- **Thực tế:** `/` H1 “Người thân ở nhà, mình vẫn an tâm” (56px desktop, 34,4px mobile); 3 card có border; hero vòng ECG/dotted ring; `/app/admin` nav “Tổng quan / Người dùng / Thiết bị / Nâng cao”, 4 KPI card. Đây là trang P/A chưa thay, không phải lỗi foundation; nhưng ảnh `landing-*`, `admin-*` trong evidence W1 đang được dùng làm ảnh “v7 foundation” trong khi nội dung vẫn là v6.
- **Tác động:** nếu dùng ảnh này làm bằng chứng redesign v7 thì sai; cần ghi là ảnh “shell/token trên trang legacy” hoặc chờ P/A. Source: `LandingPage.tsx:122`; `AdminPage.tsx:145–148,221–223`.
- **Điều kiện sửa:** P/A thay JSX theo §5.1/§5.12; không tính ảnh landing/admin hiện tại là bằng chứng hoàn tất v7.

## 5. Finding P3

### P3-01 — `TextSizeToggle` trong `role="menu"` không có `role="menuitem"`

- **Route/viewport:** `/app` 1280/390, menu tài khoản mở.
- **Repro:** mở menu, đọc role của các phần tử focus được.
- **Mong đợi:** APG menu: các mục focus được trong `role=menu` có `role=menuitem` (hoặc dùng group ngoài menu cho toggle).
- **Thực tế:** “Tài khoản” và “Đăng xuất” có `role=menuitem`; `Aa Bật chữ lớn` là `<button aria-pressed>` không có `menuitem`, nằm trong `<div role="none">` (`AppShell.tsx:374–376`). Arrow key vẫn focus được vì handler tự query `button`, nhưng screen reader không nhận là menu item.
- **Tác động:** pattern menu không nhất quán; thấp hơn P1/P2.

### P3-02 — H1 alert detail chứa StatusPill; status nằm trong heading

- **Route/viewport:** `/app/alerts/:id`, 1280/390.
- **Repro:** mở alert detail; đọc H1.
- **Mong đợi:** design §5.6: H1 là nhãn loại sự kiện, trạng thái ở hàng phụ.
- **Thực tế:** H1 text `"Nghi ngãĐang mở"` do `AlertDetailPage.tsx:180–188` đặt `StatusPill` bên trong `<h1>`; H1 count vẫn 1 nhưng accessible name lẫn trạng thái.
- **Tác động:** semantics/heading khó đọc; page C.

### P3-03 — Comment `AssistantPage` còn mô tả dòng hồ sơ “ngay dưới H1”

- **Route/file:** `AssistantPage.tsx:128–133`.
- **Repro:** đọc comment và render thực tế.
- **Mong đợi:** comment phản ánh v7: dòng hồ sơ do shell render **trên H1**.
- **Thực tế:** comment vẫn nói “một dòng tên hồ sơ đang xem ngay dưới H1”; code đã bỏ `SubjectContextLine`. Không ảnh hưởng runtime, nhưng dễ làm lane C hiểu sai khi sửa.

## 6. CSS — đối chiếu riêng

### 6.1. Selector foundation trùng

- Parse selector đã normalize từ `base.css`, `components/primitives.css`, `styles/shell.css` và so với `layout.css`, `public-simple.css`, `app-simple.css`, `admin-simple.css`: **0 selector trùng khít**.
- `grep` `.shell__|.subject-context` trong `layout.css` và `app-simple.css`: 0. Khớp phần retire shell/context.
- Tuy vậy còn:
  - keyframes `shell-route-in`/`shell-banner-in` trùng tên (`layout.css:284,294` / `shell.css:56,380`);
  - override foundation theo context: `.site-header__nav .button` (`layout.css:50,67`), `.resolve-form textarea.field__input` (`layout.css:533`), `.adm-filter-form .field` (`layout.css:1202`), `.dashboard-region__action .button` 40px (`layout.css:1479`), `.assistant-composer__row .button`/`.field__input` (`layout.css:2277,2281`), `.alert-row > .pill` (`layout.css:2005`), `.dashboard-section-head > .pill` (`layout.css:2095`);
  - `.segmented` (`layout.css:336`), `.breadcrumb` (`layout.css:444`) là pattern dùng chung chưa dời;
  - `.page-title` override mobile ở `app-simple.css:179,326`, `layout.css:2456`.

### 6.2. `layout.css` 2536 dòng — block nào là foundation bị bỏ sót

- Không có một block `.button/.field/.card/.pill/.alert/.empty-state/.page-loader/.shell*` độc lập còn lại; 2536 dòng chủ yếu là CSS feature của các trang chưa thay (public/auth, alerts, dashboard, history, devices, subjects/share, tasks, settings, admin, studio).
- Foundation bị bỏ sót thật sự: **hai keyframe shell**, **override 40px** và **các override typography `.page-title`**. Ngoài ra `.segmented/.breadcrumb` là pattern dùng chung nhưng vẫn ở legacy, chưa có trong `primitives.css` như D2/implementation-plan §2.1 mong đợi.
- `public-simple.css`/`app-simple.css`/`admin-simple.css`: không có block định nghĩa lại toàn bộ primitive; chỉ override context/placement và vài biến thể admin. `admin-simple.css:17` `.admin-page .button { min-height:44px }` trùng giá trị primitive; `.adm-tabs .button*` là biến thể trang admin. `public-simple.css` có `.hero__actions .button` width và `html[data-text-size=large] .hero__actions .button { min-height:2.4rem }` (48px tại root 20px), `.auth-card .field*`; `app-simple.css` có `.today-ask__row .button`, `.today-status__action(s) .button`. Đây là nợ feature, không phải định nghĩa foundation thứ hai.

### 6.3. Thứ tự import

`main.tsx` hiện: `fonts → tokens → base → primitives → layout → public-simple → app-simple → admin-simple → shell`. Khớp mô tả handoff và D1 ở chỗ shell nằm cuối; `primitives.css` đứng trước legacy nên override feature có hiệu lực (đó là lý do F3 40px vẫn thắng primitive). Không phát hiện import trùng/thiếu; nhưng thứ tự này là điều kiện để lỗi F3 còn sống.

## 7. Ảnh đã mở ở bản gốc `dd01cbe`

> Ảnh trong worktree đã được F chụp lại ở `d4af4da`; các số H1 25px/20px dưới đây là bản gốc, không dùng cho kết luận hiện hành. Xem mục “Re-check `d4af4da`” để có số mới.

Đã mở 20 ảnh trong `reports/qa/evidence/v7-foundation/` (không chỉ đọc tên):

- **Chứng minh được:** `today-1280x900.png`, `today-390x844.png` (context trên H1, 4 nav, badge, rail/topbar), `today-390x844-large.png` (bản gốc root lớn, H1 25px; bản mới 30px), `history-1280x900.png` (chart và bảng), `devices-1280x900.png` (subject context + nav Người thân), `alerts-1280x900.png` (H1/context/badge), `subjects-390x844.png` (bản gốc không context, H1 20px; bản mới 24px), `admin-1280x900-admin.png`/`admin-390x844-admin.png` (admin không hồ sơ, nav chỉ Quản trị), `assistant-alias-1280x900.png` (alias active Hôm nay + context), `account-menu-open-1280x900.png`/`mobile-account-menu-390x844.png` (item 44px, menu không Studio), `login-1280x900.png`/`login-390x844.png`/`landing-360x740.png`/`landing-390x844.png` (token nền/chữ, trang legacy).
- **Không chứng minh được điều đã khai:**
  - `alerts-inbox-1280x900.png` giống ảnh alerts thường, không có H2 “Thông báo đã nhận”/hàng thông báo/mark-read; không chứng minh inbox.
  - `landing-*` vẫn H1 “vẫn an tâm”, 3 card và hero vòng ECG; không chứng minh landing §5.1.
  - `admin-*` vẫn “Nâng cao” và 4 KPI card; không chứng minh admin §5.12.
  - `login-*` không đo target link; ảnh không chứng minh F02.
  - `today-*` không đo target link; ảnh không chứng minh target ≥44.
  - `shell-behavior.json` chỉ ghi focus xanh 3px; không đo nền rail, nên không chứng minh focus đúng.
  - `metrics.json` chỉ đo button, không đo link/brand/select; không chứng minh “12 vi phạm, chỉ 3 chip”.
  - `history-1280x900.png` chỉ desktop; không chứng minh 390/local scroll; script riêng mới xác nhận `.chart__scroll` cuộn cục bộ.
  - `assistant-alias` chứng minh active nav/context, không chứng minh alias chunk loading trên production build.

## 8. Kết luận lịch sử tại `dd01cbe` (trước re-check)

> Phần này giữ lịch sử review gốc. Kết luận hiện hành nằm ở mục “Re-check `d4af4da`” phía trên.

**Chưa merge được** ở `dd01cbe`. Điều kiện cụ thể trước khi merge làm nền W2:

1. **Sửa P1-01:** focus ring trên rail phải trắng (hoặc màu có tương phản ≥3:1 trên `#15253E` và `#284976`) cho brand, 4 nav link, account trigger; đo lại computed style ở 1280; thêm kiểm vào test/script QA.
2. **Sửa P1-02:** H1 mobile phải 1.5rem (24px) ở 390/360, large 30px; sửa `.page-title`/breakpoint và xử lý override `.today`/`.subjects`/`.assistant`; đo lại toàn bộ route 390.
3. **Sửa bằng chứng P2-01:** đo link/brand/select, cập nhật `metrics.json`, sửa target `/app` “Sức khỏe 7 ngày” + chip và link auth; không dùng kết luận “12 vi phạm, chỉ 3 chip” để đóng cổng. F3 40px phải bỏ hoặc có owner/gate rõ.
4. **Đóng/khai lại P2-02:** hoặc `AlertsPage` đọc `?view=notifications` và render H2/hàng/mark-read; hoặc ghi rõ W1 chỉ redirect, C phải làm trước khi W2 đóng, và sửa comment/handoff “inbox thật/unread notifications”.
5. **P2-03/P2-04/P2-05:** badge dùng `nextCursor` cho `20+`; trigger ArrowDown mở menu; xoá keyframes trùng và cập nhật ledger. Có thể xử lý ngay sau merge nếu lead chấp nhận nợ có gate, nhưng không nên khai là đã có.
6. **P2-06/P2-07/P2-08:** C/R/P/A xử lý ở W2; không dùng ảnh landing/admin/inbox hiện tại làm bằng chứng v7. F01/F02 phải đóng ở P trước khi đóng W2; pinned context/status H1 phải có test route detail/share.
7. **P3-01/P3-02/P3-03:** có thể gộp vào W2 C; không phải điều kiện chặn foundation nếu các P1/P2 trên đã xử lý.

Nếu chỉ merge foundation để mở W2, có thể chấp nhận các trang legacy P/C/H/R/A còn cũ **với điều kiện** P1-01/P1-02 và P2-01 được sửa, P2-02 được khai đúng là deferred; nếu không, W2 sẽ thừa hưởng focus ring sai và H1 mobile sai trên toàn bộ route.

## 9. Lệnh và output chính

```text
$ pnpm build:contracts
Done in 19.6s using pnpm v12.5.1          # exit 0

$ pnpm --filter @annhien/web typecheck
$ tsc -p tsconfig.json --noEmit           # exit 0

$ pnpm --filter @annhien/web build
✓ built in 230ms                          # exit 0

$ pnpm --filter @annhien/web exec vitest run --no-file-parallelism --maxWorkers=1
Test Files  37 (37 file)
Tests       287 (287 test)
Duration    118.65s                       # EXIT:0

$ ... vitest run <10 file trọng tâm>
Test Files  10 (10 file)
Tests       83 (83 test)
Duration    24.30s                        # EXIT:0
```

- API health `http://127.0.0.1:3101/api/v1/health` → HTTP 200.
- Seed: 3 user, 2 subject, 1 device, 1 assignment, 1 care link, 1681 telemetry, 3 incident, 2 task, 2 outbox; không sửa dữ liệu sau seed ngoài login.
- Browser: Playwright Chromium `159.0.8154.6`; script đo lưu tạm ngoài repo, không thêm file bằng chứng vào commit này.
