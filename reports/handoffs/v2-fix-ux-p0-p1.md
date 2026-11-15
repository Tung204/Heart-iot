# Handoff — v2-fix-ux-p0-p1 (P0-1, P1-1, P1-2, P1-5, P1-8)

- **Ngày:** 2026-11-15 (Asia/Ho_Chi_Minh)
- **Worker:** fix-ux-p0-p1 (dispatched), worktree `C:/Users/nguye/orca/workspaces/DATN/fix-ux-p0-p1`
- **Nhánh:** `fix-ux-p0-p1` (không merge)
- **Base:** `1a504cd docs(orchestration): spec sửa UX P0/P1`
- **Nguồn finding:** `reports/qa/v2-ux-visual.md` (worktree `qa-ux-visual`, HEAD `8434d66`) — P0-1, P1-1, P1-2, P1-5, P1-8
- **Tài liệu tham chiếu:** `docs/06-trai-nghiem-va-man-hinh.md` (mục “Hiện trạng giao diện v1”: cảnh báo ưu tiên trước số liệu; responsive 1280/390/360/chữ lớn; không tràn ngang), `docs/12`
- **Phạm vi đã giữ:** chỉ web UI + CSS + test web. **Không** sửa API, router, contracts, docs, logic quyền/dữ liệu.

## Đã sửa

### 1. P0-1 — `apps/web/src/features/dashboard/DashboardPage.tsx`

Trước: `anyPending/anyError` gộp status + daily-summary + alerts; có lỗi/chậm ở một query là **toàn bộ** nội dung (kể cả cảnh báo đang mở) bị thay bằng `PageLoader`/`ErrorState` toàn trang.

Sau:

- Bỏ loader/lỗi toàn trang. Ba vùng tải độc lập:
  - **Cảnh báo đang mở** (an toàn): render ngay khi `/alerts` trả dữ liệu, kể cả status/daily-summary đang tải hoặc 500. Có loading riêng (“Đang tải cảnh báo đang mở…”) và lỗi riêng kèm nút “Thử lại” chỉ refetch `openAlerts`.
  - **Tổng hợp hôm nay**: loading/lỗi riêng, không ảnh hưởng cảnh báo.
  - **Thiết bị**: loading/lỗi riêng; “Chưa gắn thiết bị nào” chỉ hiện khi query thành công (trước đây nhánh này nằm trong khối `!anyPending`, nay phải gate đúng để không báo sai khi đang tải).
- Không bịa số: vùng chưa có dữ liệu chỉ hiện loading hoặc lỗi, không render metric 0.
- `RecentInsightsCard` và hộp “Giới hạn của bản demo” luôn render, không phụ thuộc 3 query trên.
- Thêm 2 component nội bộ `RegionLoading`/`RegionError` (không tạo file mới, không đổi API/contracts).

### 2. P1-1 — `apps/web/src/app/AppShell.tsx`

Thêm hook `useResetScrollOnNavigate` + `ref` tới `<main id="main" tabIndex={-1}>`:

- Chỉ phụ thuộc `pathname`: đổi pathname trong `/app` → `window.scrollTo({top:0,left:0,behavior:'auto'})` và `main.focus({preventScroll:true})`.
- **Không** can thiệp khi `navigationType === 'POP'`: gồm tải trang đầu/reload và back/forward (trình duyệt tự khôi phục vị trí đã lưu).
- **Không** can thiệp khi URL có `#hash` (giữ điều hướng tới mục cụ thể).
- Đổi query param cùng pathname **không** cuộn (effect không chạy lại).
- Áp dụng cả khi vào `/app` từ trang đăng nhập (điều hướng PUSH), không áp dụng khi mở thẳng URL (POP) để không phá khôi phục của trình duyệt.

### 3. P1-2 — `apps/web/src/features/share/SharePage.tsx` + `layout.css`

- Thêm class `invite-result__token` cho dòng mã lời mời (trước đây chỉ `.field__hint`, không có điểm ngắt).
- `.invite-result`: `min-width: 0; max-width: 100%; overflow-wrap: anywhere` — là flex item trong `.card` nên trước đây bị min-content đẩy rộng.
- `.invite-result__url`: thêm `overflow-wrap: anywhere; max-width: 100%`.
- `.invite-result__actions`: `display:flex; flex-wrap:wrap; gap` để nút wrap thay vì tràn.
- `.alert > div { min-width: 0 }` và `.alert__text { overflow-wrap: anywhere }`: cho phép URL/mã dài xuống dòng trong hộp `Alert`.
- `.error-state p`: `max-width:100%; overflow-wrap:anywhere` — chặn tràn ngang khi thông báo lỗi chứa URL/mã dài (xem mục “Điểm chưa sửa #1”; sửa CSS là tối thiểu, không che lỗi API).

### 4. P1-5 — `apps/web/src/app/AppShell.tsx` + `layout.css`

- Mobile topbar: nhãn đổi từ “Bản demo” → **“Bản demo · dữ liệu mô phỏng”**, đặt thành dòng riêng dưới hàng logo/nút (một dòng ở 360/390, `--text-xs` 0.8125rem thay cho 0.68rem cũ), luôn hiển thị vì `.shell__topbar` sticky.
- Thêm `.shell__mobile-safety-note` ở **cuối nội dung** `<main>` (mobile < 1024px): “Cảnh báo chỉ hiển thị khi trang đang mở và kết nối với máy chủ. Bản demo không tự gọi cấp cứu.” → mọi trang `/app` đều có, không phụ thuộc sidebar.
- Desktop: chuyển `.shell__safety-note` từ đáy sidebar lên **ngay dưới pill demo** (sidebar có `height:100vh; overflow-y:auto` nên note cũ nằm dưới màn hình). Nay đo được `top≈162px, bottom≈249px` trong viewport ở cả 1280×900 và 1280×768. Note được đóng khung nhẹ (border + surface) để tách khỏi nav.

### 5. P1-8 — `apps/web/src/styles/layout.css` (landing header)

- `.site-header .brand { white-space: nowrap }` — logo không còn bẻ “An / Nhiên”.
- `@media (max-width: 639px)`: header `flex-wrap: wrap`, padding-inline 1rem, brand 1.1875rem (một dòng), nav `gap` nhỏ, nút `.button` `min-height:2.75rem` (44px), `padding-inline:0.35rem`, `font-size:var(--text-sm)`, `white-space:nowrap`.
- `@media (max-width: 370px)`: xuống **hai hàng có chủ đích** — brand hàng 1, hai nút chia đều hàng 2 (`flex:1 1 0`, `width:100%`).
- Không đổi copy H1/landing (giữ “Người thân ở nhà, mình vẫn an tâm”, “Bản demo · dữ liệu mô phỏng”, CTA) nên `LandingPage.test.tsx` không phải sửa.

### 6. Test web

- `apps/web/src/features/dashboard/DashboardPage.test.tsx` (**mới**, 4 test): cảnh báo hiện khi status/summary 500; cảnh báo hiện khi status/summary treo (loading từng vùng, không `PageLoader`/`ErrorState` toàn trang); chỉ alerts lỗi → tổng hợp + thiết bị vẫn có số liệu; không có cảnh báo → ghi rõ bằng chữ, không có pill “N cần chú ý”.
- `apps/web/src/app/AppShell.test.tsx` (+4 test): đổi pathname → cuộn `{top:0,left:0,behavior:'auto'}` + focus `main`; đổi query param cùng trang → không cuộn, không đổi focus; POP (back) → không gọi `scrollTo`; nhãn “Bản demo · dữ liệu mô phỏng” + câu giới hạn cảnh báo có ở cả sidebar lẫn note mobile.
- `apps/web/src/test/setup.ts`: stub `window.scrollTo` mặc định cho mỗi test (jsdom chưa cài đặt) để log test sạch; test cụ thể vẫn stub lại để kiểm tham số.

## Kiểm chứng

### Lệnh (worktree này)

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | pass (Done, không lỗi) |
| `pnpm build:contracts` + `pnpm --filter @annhien/api build` | pass (chỉ để chạy API thật cho ảnh; không sửa API) |
| `apps/web: pnpm typecheck` | pass |
| `apps/web: pnpm test` | **25 file / 129 test pass** (trước: 24 file / 121 test) |
| `apps/web: pnpm build` | pass (`✓ built in 276ms`) |

### Ứng dụng chạy thật để kiểm ảnh

- API build production, DB riêng: `PORT=3120 WEB_ORIGIN=http://localhost:3130 PGLITE_DATA_DIR=.data/ux-p0p1 node apps/api/dist/src/main.js`; seed bằng `pnpm --filter @annhien/api seed` cùng env. **Không** dùng `.data/pglite`, **không** dùng cổng 3000/3100/5173.
- Web dev server riêng cho worktree này ở `http://localhost:3130`, proxy `/api` → `http://localhost:3120`, script đặt ngoài repo tại `C:/Users/nguye/AppData/Local/Temp/annhien-ux-p0p1/serve-web.mjs` (giữ nguyên `apps/web/vite.config.ts`).
- Tài khoản: owner `ba-an@demo.annhien.local`, subject `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`.
- Playwright 1.65.1 (chromium có sẵn), script ngoài repo: `verify.mjs`, `normal.mjs`, `scroll.mjs`, `login-scroll.mjs`; results ở `results.json`.

### Kết quả đo (Playwright, ảnh lưu ngoài repo)

**P0-1 — dashboard (status/summary chậm 8s, alerts 200):**

| Viewport | `.alert-row` | Nội dung vùng khác | `PageLoader` toàn trang | `ErrorState` |
| --- | --- | --- | --- | --- |
| 1280×900 | 1 (“Nghi ngã — cần chú ý”) | “Đang tải dữ liệu tổng quan…”, “Đang tải trạng thái thiết bị…” | 0 | 0 |
| 390×844 | 1 | như trên | 0 | 0 |

**P0-1 — status/summary trả 500, alerts 200:**

| Viewport | `.alert-row` | Lỗi từng vùng | `ErrorState` toàn trang | metric |
| --- | --- | --- | --- | --- |
| 1280×900 | 1 | “Không tải được dữ liệu tổng quan”, “Không tải được trạng thái thiết bị” | 0 | 0 |
| 390×844 | 1 | như trên | 0 | 0 |

Luồng bình thường (không chặn): 1 alert, 4 metric, 0 loading/0 lỗi, `scrollWidth == innerWidth` ở 1280/390 và chữ lớn 390.

**P1-1 — scroll khi đổi route (mobile bottom nav / desktop sidebar):**

| Viewport | Trước (history cuối trang) | Sau khi sang `/app/alerts` | Bấm lại đúng mục nav (pathname không đổi) | Back (POP) |
| --- | --- | --- | --- | --- |
| 390×844 | `scrollY=4852`, H1 top `-4591` | `scrollY=0`, H1 top `261`, `activeId=main` | `scrollY` giữ `145` | `scrollY=488`, H1 top `-227` (trình duyệt tự khôi phục) |
| 1280×900 | `scrollY=1302`, H1 top `-1133` | `scrollY=0`, H1 top `169`, `activeId=main` | `scrollY` giữ `0` | `scrollY=115` |

Hash: mở `/app/alerts#main` → `location.hash` giữ `#main`, không bị ép cuộn sai. Đăng nhập từ landing đã cuộn (`scrollY=2994`) → `/app` ở `scrollY=0`, H1 top `286`, focus `main`.

**P1-2 — khối “Đã tạo lời mời” (sau khi tạo lời mời thật):**

| Viewport | `maxScrollX` toàn trang | Phần tử tràn | `.invite-result` (w/scrollW) | Token |
| --- | --- | --- | --- | --- |
| 1280×900 | 0 | không | 785/783 | wrap `anywhere` |
| 390×844 | 0 | không | 312/310 | wrap `anywhere` |
| 360×740 | 0 | không | 282/280 | wrap `anywhere` |
| 360×740 chữ lớn | 0 | không | 268/266 | wrap `anywhere` |

Ghi chú: trước khi sửa, QA đo `maxScrollX=112` (390) và `153` (360) cho khối này. Ở lần đo chữ lớn đầu tiên còn `maxScrollX=11` do **`.error-state` của khối liên hệ khẩn cấp** (API 404 — xem “Điểm chưa sửa #1”), không phải khối lời mời; sau khi thêm `overflow-wrap` cho `.error-state p` thì về 0.

**P1-5 — nhãn demo / giới hạn cảnh báo (`/app/alerts`):**

| Viewport | Topbar mobile label | Note cuối nội dung (mobile) | Sidebar note (desktop) | `maxScrollX` |
| --- | --- | --- | --- | --- |
| 1280×900 | ẩn (đúng: desktop dùng sidebar) | ẩn (đúng) | hiện, `top=162 < 900` | 0 |
| 1280×768 | ẩn | ẩn | hiện, `top=162 < 768` (không cần cuộn sidebar) | 0 |
| 390×844 | hiện, `y=59…77` trong viewport, 1 dòng | hiện ở `y=776…836` (cuối trang) | — | 0 |
| 360×740 | hiện, 1 dòng | có trong DOM, nằm dưới màn hình (footer) | — | 0 |
| 390×844 chữ lớn | hiện, 1 dòng (`y=69…90`) | footer | — | 0 |

Topbar mobile cao 86,7px (mặc định) / 101,1px (chữ lớn) do thêm dòng nhãn; sidebar desktop vẫn `overflow-y:auto` nhưng note không còn bị cắt.

**P1-8 — header landing:**

| Viewport | Header cao | Brand | Nav | Tràn ngang |
| --- | --- | --- | --- | --- |
| 1280×900 | 78px | 133×35, 1 dòng | 1 hàng, nút 43px | 0 |
| 390×844 | **73px** | 91×24, 1 dòng | 1 hàng: “Đăng nhập” 102×47, “Tạo tài khoản” 126×47 | 0 |
| 360×740 | 97px (2 hàng có chủ đích) | 91×24, 1 dòng | 2 nút chia đều hàng dưới, mỗi nút 161×47 | 0 |
| 390×844 chữ lớn | 125px | 107×29, 1 dòng | 1 hàng, nút 55px | 0 |
| 360×740 chữ lớn | 115px (2 hàng) | 107×29, 1 dòng | 2 nút 158×55 | 0 |

Trước khi sửa (QA): brand 97,8×70,1 (2 dòng “An / Nhiên”), nút cao 62,4 (2 dòng), header 104,1px ở 360. Nay không còn text bị bẻ dòng; 390 đạt mục tiêu ≤80px.

### Ảnh (ngoài repo)

Thư mục: `C:/Users/nguye/AppData/Local/Temp/annhien-ux-p0p1/shots/` (32 ảnh, PNG, viewport 1280×900 / 390×844 / 360×740 / chữ lớn):

- Landing: `landing-1280x900.png`, `landing-390x844.png`, `landing-360x740.png`, `landing-large-390x844.png`, `landing-large-360x740.png`
- Dashboard P0: `dashboard-status-summary-slow-1280x900.png`, `dashboard-status-summary-slow-390x844.png`, `dashboard-status-summary-500-1280x900.png`, `dashboard-status-summary-500-390x844.png`; luồng bình thường: `dashboard-normal-1280x900[-bottom].png`, `dashboard-normal-390x844[-bottom].png`, `dashboard-large-390x844[-bottom].png`
- Scroll: `scroll-nav-390x844.png`, `scroll-nav-1280x900.png`, `login-to-dashboard-390x844.png`
- Lời mời: `invite-result-1280x900.png`, `invite-result-390x844.png`, `invite-result-360x740.png`, `invite-result-large-360x740.png`
- Nhãn demo/sidebar: `labels-1280x900[-bottom].png`, `labels-1280x768[-bottom].png`, `labels-390x844[-bottom].png`, `labels-360x740[-bottom].png`, `labels-large-390x844[-bottom].png`

Dữ liệu đo chi tiết: `C:/Users/nguye/AppData/Local/Temp/annhien-ux-p0p1/results.json`.

## File thay đổi

- `apps/web/src/features/dashboard/DashboardPage.tsx`
- `apps/web/src/features/dashboard/DashboardPage.test.tsx` (mới)
- `apps/web/src/app/AppShell.tsx`
- `apps/web/src/app/AppShell.test.tsx`
- `apps/web/src/features/share/SharePage.tsx` (1 class)
- `apps/web/src/styles/layout.css` (rule liên quan: alert/error-state/invite-result/site-header/shell/dashboard region)
- `apps/web/src/test/setup.ts` (stub `scrollTo` cho jsdom)
- `reports/handoffs/v2-fix-ux-p0-p1.md` (file này)

Không sửa API/router/contracts/docs; không đổi logic quyền, logic dữ liệu hay copy H1/landing đang được test.

## Điểm chưa sửa / rủi ro

1. **Lỗi ngoài phạm vi phát hiện khi kiểm chữ lớn:** `EmergencyContactsModule` có trong `apps/api/src/emergency-contacts/` nhưng **không được import trong `apps/api/src/app.module.ts`** → `GET /api/v1/subjects/:id/emergency-contacts` trả 404; trang Chia sẻ hiện hộp lỗi “Không tải được liên hệ khẩn cấp”. Đây là lỗi API (không thuộc task này), cần worker/lead sửa ở `app.module.ts`; tôi chỉ chặn tràn ngang của hộp lỗi bằng CSS.
2. **Back/forward sau khi rời trang dài:** trình duyệt tự khôi phục nhưng bị kẹp theo chiều cao nội dung tại thời điểm khôi phục (390: 488 thay vì 4852; desktop: 115 thay vì 1302) vì trang đích tải dữ liệu bất đồng bộ. Không phải do effect ép cuộn; muốn khôi phục chính xác cần lưu/khôi phục scroll sau khi dữ liệu render (ngoài phạm vi P1-1).
3. **Header landing ở 360 là hai hàng** (97px, chữ lớn 115px). Đây là lựa chọn có chủ đích theo gợi ý của review; nếu lead muốn một hàng ở 360 thì phải giảm thêm cỡ chữ/padding nút (đang sát ngưỡng, dễ vỡ lại).
4. **Topbar mobile cao thêm ~22px** (86,7px mặc định) vì nhãn “Bản demo · dữ liệu mô phỏng” luôn hiển thị. Nếu cần gọn hơn, có thể chuyển nhãn này xuống note cuối nội dung (khi đó mất nhãn luôn thấy ở topbar).
5. **P1-4 (0 bước giả, dữ liệu trước `sharedFrom`) và P1-3 (caregiver 403 lịch sử) không sửa** — ngoài danh sách finding của task; dashboard vẫn in `steps.total` như cũ.
6. **Chưa chạy `pnpm test:e2e` của repo:** `apps/web/playwright.config.ts` hard-code `http://localhost:5173` + `reuseExistingServer`, trong khi cổng 5173 trên máy đang phục vụ worktree khác; chạy sẽ kiểm nhầm code. Đã thay bằng harness Playwright riêng trỏ `localhost:3130` (ghi ở trên). Chưa có ESLint trong repo nên không chạy lint.
7. **`.error-state p` là rule dùng chung** (không chỉ trang chia sẻ); thay đổi chỉ là wrap chữ dài, không đổi layout bình thường.

## Trạng thái

Xong 5 finding P0-1/P1-1/P1-2/P1-5/P1-8 trên nhánh `fix-ux-p0-p1`; test web 129/129 pass, typecheck + build pass, ảnh đo thật ở 1280/390/360/chữ lớn lưu ngoài repo. Sẵn sàng cho lead review/merge; lỗi `EmergencyContactsModule` chưa đăng ký cần xử lý riêng ở API.
