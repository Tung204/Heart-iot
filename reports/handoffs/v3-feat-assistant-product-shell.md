# Handoff — v3-feat-assistant-product-shell

- **Thời điểm:** 2026-11-15 khoảng 11:45 (Asia/Ho_Chi_Minh), worktree
  `feat-assistant-product-shell`.
- **Worker:** `feat-assistant-product-shell` (task `task_5dc8dfa4f7ce`, dispatch
  `ctx_0b3c1b6ae009`), terminal `term_4e8cd4ad-5301-48c3-86c1-0cc7aee63999`.
- **Nhánh:** `feat-assistant-product-shell` (không merge master). Base `398ba2f`.
- **Commit code:** `703cfb2820a3f11bf5a414106f7084b1e4011c93`
  `feat(web): đưa trợ lý thành trung tâm sản phẩm` (30 file).
- **Commit handoff:** file này là commit riêng ngay sau commit code.
- **Vùng ghi:** `apps/web/src/features/assistant/**`, `app/router.tsx`, `app/AppShell.tsx`,
  `pages/LandingPage.tsx` + test, `components/AppErrorBoundary.tsx` + test,
  `components/SiteFooter.tsx`, `features/auth/**`, `features/dashboard/**`,
  `features/history/HistoryPage.tsx`, `features/alerts/AlertDetailPage.tsx`,
  `features/subjects/SubjectsPage.tsx` + test, `features/settings/ProfileCard.tsx`,
  `features/invitations/InvitePage.tsx`, `styles/layout.css`, `apps/web/index.html`,
  `apps/web/e2e/**`, file này. Xóa `components/DemoNotice.tsx`.
  Không sửa API, contracts, schema/migration, docs/HTML, package export; không thêm dependency.

## Kết quả chính

### Trợ lý là trung tâm

- `/app` giờ mở `AssistantPage`; dashboard chuyển sang `/app/overview`. Legacy `/app/assistant`
  vẫn trỏ cùng trang trợ lý. Admin-only không có hồ sơ được chuyển `/app` → `/app/admin`
  (giữ hành vi cũ), có test router.
- Nav chính đưa **Trợ lý** lên đầu (desktop + mobile), **Tổng quan** thứ hai; bottom-nav vẫn
  tối đa 6 mục, Trợ lý không nằm trong "Thêm". Bỏ điều kiện `canViewAi` khi render nav;
  trang trợ lý tự giải thích khi hồ sơ chưa bật AI.
- Trang trợ lý chat-first: hội thoại nhiều lượt trong phiên, câu trả lời nối tiếp; cột
  "Bối cảnh" bên phải trên desktop, `<details>` gấp trên mobile; có hồ sơ, cảnh báo mở,
  lần nhận dữ liệu cuối (chỉ khi có quyền xem số đo), link tới các màn hình và ghi chú
  "Cảnh báo được tạo và cập nhật độc lập với trợ lý. Trợ lý không tự xác nhận hay đóng cảnh báo".
- Giữ `DataQualityPanel`, nguồn, disclaimer, xử lý 429 và lỗi; 403 là trạng thái quyền
  (không mời "Thử lại" vô ích), composer bị khóa khi thiếu quyền xem số đo.
- Đổi hồ sơ không lẫn hội thoại: reset `turns`/câu hỏi/lỗi theo `subjectId` ngay trong render,
  mutation mang `subjectId`, bỏ phản hồi về muộn bằng ref. Có test cho cả hai trường hợp.

### Bản tin đầu ngắn, composer luôn thấy

Theo 3 vòng góp ý của coordinator (`msg_4a58c4571ea3`, `msg_92476cdf1a84`,
`msg_a3baa3ca6eae`):

- Bản tin đầu chỉ còn: lời chào/ngữ cảnh, headline ngắn, 4 fact chính (nhịp tim trung bình,
  mẫu đo, cảnh báo đang mở, pin), dòng chất lượng ngắn (`Dữ liệu mô phỏng` + độ phủ/số mẫu/
  khoảng thiếu). Chi tiết số liệu, nguồn, `DataQualityPanel`, lý do degraded và **toàn văn
  headline** nằm trong `<details>` đóng sẵn; disclaimer vẫn hiển thị.
- `splitHeadline` chỉ lấy câu đầu tiên (thường là caveat độ phủ do backend sinh) và giữ toàn
  văn trong details — không bỏ caveat, không đổi số liệu.
- Composer (gợi ý + ô hỏi + nút gửi) nằm **trên** thread, không sticky; desktop giữ nguyên
  nhãn "Gửi câu hỏi", mobile đổi nhãn hiển thị thành "Gửi" nhưng `aria-label` vẫn là
  "Gửi câu hỏi". Textarea `rows=1`, cao 57px; nút và textarea cùng hàng.
- Mobile bỏ page lead/eyebrow/chat hint khỏi màn đầu, hạ cỡ page title/section title/headline,
  ẩn nút "Làm mới" và link "Quản lý và chia sẻ" trong subject switcher (vẫn còn trong
  "Bối cảnh"/nav), ẩn nhãn + hint của field **chỉ về mặt thị giác** (vẫn đọc được bởi
  trình đọc màn hình), giữ suggestions cuộn ngang.

### Copy sản phẩm, không còn copy demo

- Xóa `DemoNotice`; thay bằng ghi chú ngắn "Dữ liệu hiển thị là dữ liệu mô phỏng..." ở
  landing/auth/areas có số liệu. Không còn chuỗi "bản demo", "đồ án", "giảng viên",
  "nghiệm thu", "chưa được duyệt" trong UI/metadata/aria-label (test và script kiểm tra
  khẳng định **không có**).
- LandingPage viết lại theo hướng sản phẩm: "Trợ lý theo dõi người thân", CTA "Mở trợ lý",
  mục "Trợ lý ở trung tâm"; login "Tài khoản mẫu"; footer/settings/invite/history/alerts/
  subjects/index.html đồng bộ. Dashboard đổi "Giới hạn cần biết". Link `/app` còn lại là
  brand/nav "Trợ lý"/CTA hợp lệ; các link cũ đã trỏ `/app/overview`.

## Bằng chứng chạy (output thật trên worktree này)

Môi trường: Windows, Node v24.22.2, pnpm 12.5.1. Đã cài `pnpm install --frozen-lockfile`,
`pnpm build:contracts` trước khi làm.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm --filter @annhien/web typecheck` | pass (`tsc -p tsconfig.json --noEmit`, không lỗi) |
| `pnpm --filter @annhien/web test` | **33 file / 197 test pass**, 8.3s (baseline 183) |
| `pnpm --filter @annhien/web build` | pass (`tsc` + `vite build`, 209ms) |
| `node e2e/visual-check.mjs` (preview 4210) | **24 ảnh · tràn ngang 0 · copy demo 0** |
| Playwright E2E qua config tạm trỏ 4210 | **10/10 pass**, 3.0s |

### Visual QA

- Bộ ảnh: `C:/tmp/ui-v3-assistant/{landing,login,assistant,overview}-{1280x900,390x844,
  360x740,1280x900-large,390x844-large,360x740-large}.png`; thêm
  `assistant-full-390x844.png`, `assistant-full-1280x900.png` (ảnh full-page có artifact
  bottom-nav fixed, ảnh viewport là ảnh chuẩn để duyệt).
- Mỗi ảnh đều kiểm `documentElement.scrollWidth === clientWidth` và body; kết quả 0 tràn.
- Kiểm bounding box nút gửi so với bottom-nav (script ghi vào `results.json`):

| Điều kiện | Input / nút Gửi (top–bottom) | Bottom-nav top | Nút trên nav? |
| --- | --- | --- | --- |
| 1280×900 | 588–646 | — (không có bottom-nav) | có |
| 390×844 | 378–435 | 754 | có, cách 319px |
| 360×740 | 378–435 | 650 | có, cách 215px |
| 1280×900 chữ lớn | 691–758 | — | có |
| 390×844 chữ lớn | 442–509 | 739 | có |
| 360×740 chữ lớn | 469–536 | 635 | có |

- Ảnh 390/360 default đã đọc lại: ô hỏi + "Gửi" nằm trọn trong màn đầu, placeholder
  "Nhập câu hỏi…" không bị cắt; textarea rộng ~230px ở 360 (nút "Gửi" ~92px), suggestions
  vẫn cuộn ngang. Desktop 1280 hiển thị page lead + composer + đầu bản tin; không đổi nhãn
  desktop.
- Console QA: chỉ có 2 lần 401 `/me` mỗi điều kiện trên trang công khai (probe chưa đăng
  nhập), không có pageerror.

### E2E

- Config mặc định của repo trỏ `http://localhost:5173` và tự bật `pnpm dev`; cổng 5173 đang
  bị một server khác chiếm, nên **không chạy** `pnpm test:e2e` mặc định để tránh test nhầm
  server. Đã tạo config tạm `playwright.qa.config.ts` (baseURL 4210, không webServer), chạy
  `pnpm exec playwright test --config=playwright.qa.config.ts`, rồi xóa config.
- Lần đầu 8/10: hai assertion cũ bị strict-mode vì "1 cảnh báo" xuất hiện ở stat + details +
  context, và câu hỏi mẫu xuất hiện ở suggestions + thread. Đã scoped lại test vào
  `.assistant-context` và `role=log`; không sửa sản phẩm để chiều test.
- Kết quả cuối: 10/10 pass (smoke 2, assistant 3, alerts 2, history 3).

## Test đã thêm/cập nhật

- `router.test.tsx`: `/app` → Assistant, `/app/overview` → Dashboard, legacy
  `/app/assistant`, admin-only redirect.
- `AppShell.test.tsx`: thứ tự Trợ lý/Tổng quan, Trợ lý ngoài "Thêm", bottom-nav ≤ 6.
- `AssistantPage.test.tsx` (15 test): tóm tắt + 4 fact + details gấp; hỏi nhiều lượt;
  đổi hồ sơ xóa lượt cũ; phản hồi muộn không append; 403 summary/ask; 403 alerts;
  caregiver không nhận cảnh báo; 429; validation; admin redirect; không auto-ack.
- `LandingPage.test.tsx`: CTA "Mở trợ lý", không còn copy demo, nhãn dữ liệu mô phỏng.
- `e2e/assistant.spec.ts`: `/app` mở trợ lý, hai câu nối tiếp, từ overview quay lại nav đầu.
- `e2e/smoke.spec.ts`, `e2e/alerts.spec.ts`: bỏ copy demo, goto `/app/overview`.

## Chưa kiểm / rủi ro

1. **Chưa có reviewer duyệt.** Không tuyên bố "đã nghiệm thu"; cần reviewer độc lập đọc
   diff + chạy lại trên nhánh này.
2. **AI thật chưa gọi.** QA dùng template/degraded và mock E2E; chưa kiểm provider thật,
   chất lượng câu trả lời, hay 429 từ provider. UI 403/429 đã test bằng mock.
3. **E2E mặc định vẫn 5173.** Config repo chưa đổi (ngoài phạm vi); CI cần tham số hóa
   baseURL/webServer hoặc dùng preview 4210 như config tạm.
4. **Mobile có tradeoff đã chủ ý:** ẩn "Làm mới" và link "Quản lý và chia sẻ" khỏi màn đầu,
   nhãn/hint field chỉ còn cho screen reader. Nếu reviewer muốn giữ các lối này, cần bố trí
   lại chứ không chỉ tăng chiều cao (sẽ đẩy nút Gửi xuống dưới nav).
5. **Chỉ Chromium headless**, chưa thử Firefox/WebKit hay thiết bị thật; ảnh full-page có
   artifact bottom-nav fixed (đã nêu ở trên).
6. **Không sửa API/contracts/schema/docs/HTML.** Các thay đổi copy/docs cấp sản phẩm nếu
   cần ghi vào docs phải do owner docs quyết định.

## QA stack đã dùng

- API 3100: `node apps/api/dist/src/main.js` với `WEB_ORIGIN=http://localhost:4210`,
  PGlite `.data/pglite-v3assistant`; preview 4210:
  `VITE_API_BASE_URL=http://localhost:3100/api/v1 pnpm --filter @annhien/web exec vite preview --port 4210`.
- Tài khoản QA: `ba-an@demo.annhien.local` / `demo-an-nhien-2026`.
- Hai process QA sẽ được dừng sau khi handoff; ảnh và `results.json` giữ tại
  `C:/tmp/ui-v3-assistant`.

## Xác nhận cổng cuối (task `task_ce85a644888a`)

Chạy lại trên cây sạch tại commit code `703cfb2`, **không sửa code**:

- `pnpm --filter @annhien/web typecheck`: pass.
- `pnpm --filter @annhien/web test`: **33 file / 197 test pass**, 8.14s.
- `pnpm --filter @annhien/web build`: pass, 210ms.

Không còn thay đổi chưa commit. Ảnh, E2E 10/10 và các phần chưa chạy giữ nguyên như trên;
QA stack 3100/4210 đã dừng.
