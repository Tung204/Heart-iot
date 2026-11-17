# Review UX / visual / motion v2 — An Nhiên web

- **Ngày review:** 2026-11-15 (giờ máy: 07:22–07:25 UTC+7)
- **Worktree:** `C:/Users/nguye/orca/workspaces/DATN/qa-ux-visual`
- **HEAD được review:** `8434d66cb8ecb3d92a9a054f87f843d16dbaa3e7`
- **Commit gần nhất:** `8434d66 perf(web): tách chunk theo route và thống nhất quyền xem cảnh báo`
- **Vai trò review:** reviewer độc lập; **không sửa code**, không tin báo cáo cũ, chỉ ghi nhận từ quan sát, ảnh chụp, DOM/measurement và log của phiên này.
- **Kết quả cuối:** 1 P0, 9 P1, 8 P2. Báo cáo chỉ thêm file này; không commit.

## 0. Kết luận nhanh

Giao diện có hướng thiết kế rõ ràng, ấm và phù hợp người thân lớn tuổi; các luồng đăng nhập, lời mời, phân quyền, thu hồi quyền và SSE cơ bản chạy thật. Tuy nhiên, **thông tin cảnh báo an toàn vẫn có thể bị che bởi dữ liệu tổng quan đang tải/lỗi** (P0), **điều hướng giữ vị trí cuộn** và **mốc chia sẻ dữ liệu** tạo ra các trạng thái sai hoặc khó hiểu cho người mới được chia sẻ. Các vấn đề mobile 360/390 (header landing, overflow lời mời, nhãn “dữ liệu mô phỏng” bị ẩn, tap target nhỏ) đủ nhiều để cần sửa trước khi coi là bản mobile hoàn chỉnh.

### Đánh giá nhanh theo tiêu chí

- **Thứ bậc thông tin:** khi dữ liệu bình thường, cảnh báo đứng trước metric và có CTA rõ — đúng ưu tiên an toàn. Nhưng P0-1 phá vỡ thứ bậc này khi status/summary tải/lỗi; trên mobile, “Tóm tắt hôm nay” nằm dưới viewport đầu (P2-6).
- **Ngôn ngữ:** giọng điệu ấm, gần gũi, nhiều câu giải thích đúng cho người thân; lỗi chính là thuật ngữ kỹ thuật rải rác (P2-5) và thông điệp lỗi HTTP/sai nguyên nhân (P2-4).
- **Khoảng trắng:** thoáng, dễ đọc ở 1280; mobile dùng nhiều khoảng trắng dọc làm trang dài (P2-6). Khối lời mời thành công bị chật/tràn (P1-2).
- **Loading/empty/error:** validation, offline, 401 và copy fallback tốt; loading cảnh báo bị che (P0-1), session loading trắng (P2-4), empty state lặp/không có h1 (P2-3).
- **Phản hồi sau hành động:** tạo lời mời có URL/token và copy; mark-read và acknowledge có phản hồi; thu hồi có banner rõ. Thiếu phản hồi cảnh báo mới/mất SSE toàn cục (P1-6), thiếu hành động liên hệ (P1-7).
- **Nhãn “dữ liệu mô phỏng”:** rõ ở landing/login/register và desktop; trên mobile, các trang app ngoài dashboard chỉ còn “Bản demo” (P1-5), còn dashboard có card demo nhưng nằm cuối trang. Đây là rủi ro niềm tin, không chỉ nhãn phụ.
- **Hoàn thành việc dưới mạng chậm/lỗi:** login và session 401 xử lý tốt; dashboard che cảnh báo (P0-1); caregiver mới bị chặn history (P1-3); invite malformed báo sai nguyên nhân (P2-4).
- **Motion:** không có animation trang trí/parallax; hover/focus nhẹ, spinner rõ, có `prefers-reduced-motion`. Vấn đề motion chính là điều hướng giữ scroll (P1-1), không phải hiệu ứng.

## 1. HEAD, trạng thái repo và lệnh đã chạy

### 1.1. Trạng thái repo

```text
$ git status --short
(không có output — worktree sạch trước review)

$ git log -3 --oneline
8434d66 perf(web): tách chunk theo route và thống nhất quyền xem cảnh báo
1080c5c docs: ghi worklog và bài học rà giao diện trực quan
d4ba436 feat(web): hoàn thiện giao diện responsive và rà soát trực quan

$ git rev-parse HEAD
8434d66cb8ecb3d92a9a054f87f843d16dbaa3e7
```

Sau khi cài dependency/build, `git status --short` vẫn rỗng. `.data/` và `dist/` nằm trong `.gitignore`; không có file source nào bị sửa.

### 1.2. Cài đặt và build

```text
$ pnpm install --frozen-lockfile
Scope: all 10 workspace projects
...
Done in 12.8s using pnpm v10.32.1
(711 packages được tái sử dụng)

$ pnpm build:contracts
> @annhien/contracts@1.0.0 build ...
> tsc -p tsconfig.build.json
(không lỗi)

$ pnpm --filter @annhien/api build
> @annhien/api@1.0.0 build ...
> nest build
(không lỗi)
```

Lần chạy API đầu bằng `tsx src/main.ts` gặp `UndefinedDependencyException` của Nest cho `AssistantService` index `[1]`; đây là khác biệt giữa chạy source trực tiếp và build. Để review bằng ứng dụng thật, tôi dùng build production của API (`node dist/src/main.js`), không sửa code.

### 1.3. API, DB và web review

- API: `http://localhost:3100`, chạy từ `apps/api` với:
  - `PORT=3100`
  - `WEB_ORIGIN=http://localhost:3110`
  - `PGLITE_DATA_DIR=.data/review-ux` (resolve thành `<worktree>/.data/review-ux`)
- DB review: `C:/Users/nguye/orca/workspaces/DATN/qa-ux-visual/.data/review-ux`
- **Không** dùng `.data/pglite`, **không** dùng cổng 3000, **không** dùng cổng 5173.
- Web review: Vite dev server riêng ở `http://localhost:3110`, cấu hình tạm đặt ngoài repo tại `C:/Users/nguye/AppData/Local/Temp/annhien-ux/serve-web.mjs`, proxy `/api` → `http://localhost:3100`. Lý do: `apps/web/vite.config.ts` trong repo hard-code cổng 5173 và proxy 3000; sửa file đó sẽ làm bẩn worktree.
- Health check thật:

```text
$ curl -s -o /tmp/health.json -w '%{http_code}' http://localhost:3100/api/v1/health
200
$ cat /tmp/health.json
{"status":"ok","database":"up","ai":"template_fallback","version":"1.0.0"}

$ curl -s -o /dev/null -w '%{http_code}' http://localhost:3110/
200
$ curl -s -o /dev/null -w '%{http_code}' http://localhost:3110/api/v1/health
200
```

- Seed trên DB review:

```text
$ PORT=3100 WEB_ORIGIN=http://localhost:3110 PGLITE_DATA_DIR=.data/review-ux \
  pnpm --filter @annhien/api seed
...
users=3 subjects=2 devices=1 assignments=1 careLinks=1
telemetry=1681 incidents=3 tasks=2 outbox=2
```

Ghi chú minh bạch: lần chạy API đầu tiên dùng đường dẫn tương đối sai, tạo `C:/Users/nguye/orca/workspaces/.data/review-ux` ngoài worktree. Tôi đã dừng tiến trình, xóa đúng thư mục vừa tạo và chạy lại với `.data/review-ux` trong worktree. Không đụng `.data/pglite`, không đụng cổng 3000.

### 1.4. Tài khoản và dữ liệu dùng để kiểm

- Owner: `ba-an@demo.annhien.local` / `demo-an-nhien-2026`
- Caregiver có quyền: `minh@demo.annhien.local` / `demo-an-nhien-2026`
- Admin: `admin@demo.annhien.local` / `demo-admin-2026`
- Subject: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`
- Alert mẫu: `ffffffff-ffff-4fff-8fff-ffffffffffff`
- Device: `dddddddd-dddd-4ddd-8ddd-dddddddddddd`

Các thay đổi dữ liệu review (chỉ trong DB `.data/review-ux`):

- Acknowledge alert té ngã mẫu bằng caregiver; đánh dấu đã đọc notification mẫu.
- Tạo 4 lời mời; đăng ký 1 tài khoản mới từ lời mời, chấp nhận, sau đó thu hồi care link của tài khoản này.
- Tạo 1 Studio view `to-quan-review-ux` (chưa publish).
- Simulator tạo 4 cảnh báo SOS: 1 bằng CLI, 3 trong kịch bản SSE. Vì vậy số cảnh báo trong ảnh chụp thay đổi theo thời điểm; ảnh đầu phiên có 1 cảnh báo mở, ảnh cuối có nhiều hơn.
- Không publish policy, không release device, không khóa user, không sửa app.

### 1.5. Các lệnh đo chính và output

```text
$ node sweep.mjs
results=118 failures=0

$ node overflow.mjs
390x844: scrollWidth=502 innerWidth=390 maxScrollX=112
360x740: scrollWidth=513 innerWidth=360 maxScrollX=153

$ node - (đo scroll sau điều hướng)
history -> alerts:   scrollY=969  h1Top=-734
history -> subjects: scrollY=487  h1Top=-252
history -> dashboard:scrollY=2316 h1Top=-2056

$ node - (SSE)
alerts: rows 2 -> 3, nav badge count=0, toast=false
history: bodyChanged=false, nav badge count=0
SSE blocked: alerts 4 -> 4, connectionWarning=false

$ node - (admin policy)
publishButton.isDisabled=false, previewCount=0

$ node - (header 360)
brand=97.8x70.1  headerHeight=104.1  navButtonHeight=62.4

$ node - (chữ lớn)
rootFontSize=20px, dashboard overflow=false
```

Các script nằm tại `C:/Users/nguye/AppData/Local/Temp/annhien-ux/`; output đầy đủ trong các file JSON cùng thư mục.

## 2. Phạm vi, cách kiểm và bằng chứng

### 2.1. Màn hình đã mở thật

**Công khai:** `/`, `/login`, `/register`, `/invite/:token` (token hợp lệ, token sai 43 ký tự, token sai định dạng), 404 công khai, `/login?next=...`.

**Trong app:** `/app`, `/app/history`, `/app/alerts`, `/app/alerts/:id`, `/app/subjects`, `/app/subjects/:id/share`, `/app/devices`, `/app/notifications`, `/app/assistant`, `/app/tasks`, `/app/studio`, `/app/studio/:id`, `/app/admin` (Tổng quan, Người dùng, Chính sách thiết bị, Nhật ký kiểm toán), 404 trong app.

**Vai trò:** anonymous, owner, caregiver, admin, caregiver mới được mời, caregiver bị thu hồi quyền.

**Viewport:** 1280×900, 390×844, 360×740; thêm 320, 768 và 1280×768 cho các điểm cụ thể. “Chữ lớn” bật bằng `?text-size=large` (root font 20px) trên dashboard, alerts, history, devices, assistant, admin, public.

### 2.2. Cách đo

- Playwright/Chromium chạy ngoài repo; script và kết quả ở `C:/Users/nguye/AppData/Local/Temp/annhien-ux/`.
- `sweep.mjs`: 118 ảnh chụp theo role × route × viewport, ghi `document.title`, `scrollWidth`, `innerWidth`, console error, pageerror.
- `public.mjs`: landing/login/register/404/invite công khai.
- `interact.mjs`: menu “Thêm”, scroll sau điều hướng, touch target, font-size, contrast token, active nav.
- `flow.mjs`: tạo lời mời → đăng ký → chấp nhận → thu hồi; admin; Studio; notification; caregiver acknowledge.
- `overflow.mjs`: đo overflow của trang tạo lời mời thành công.
- `states.mjs`: API chậm, API 500, offline, session 401/500.
- Script SSE: chặn SSE; tạo SOS; đo badge/toast/body; so sánh trước/sau.
- Không dùng axe hay screen reader tự động; các kết luận a11y dưới đây dựa trên DOM, keyboard và kích thước đo được.

### 2.3. Tổng hợp lỗi

| ID | Mức | Màn hình | Triệu chứng |
|---|---|---|---|
| P0-1 | P0 | `/app` | Cảnh báo đang mở bị ẩn hoàn toàn khi status/daily-summary đang tải hoặc lỗi |
| P1-1 | P1 | Điều hướng app | Đổi tab giữ nguyên scroll; H1 và cảnh báo đầu trang nằm ngoài viewport |
| P1-2 | P1 | `/app/subjects/:id/share` | Khối lời mời thành công tràn ngang 502/390, 513/360 |
| P1-3 | P1 | `/app/history` | Caregiver mới nhận lời mời luôn thấy lỗi 403 “vượt quá quyền xem lịch sử” |
| P1-4 | P1 | `/app` | Caregiver mới thấy “0 bước” giả và dữ liệu thiết bị trước mốc chia sẻ, không có nhãn mốc chia sẻ |
| P1-5 | P1 | Các trang app (trừ dashboard) | Mobile chỉ còn “Bản demo”, thiếu nhãn “dữ liệu mô phỏng”/cảnh báo mở trang ở alerts/devices/assistant/tasks/studio; sidebar desktop bị cắt |
| P1-6 | P1 | `/app/history`, `/app/alerts` | Không có badge/toast cảnh báo mới toàn cục; mất SSE không có cảnh báo |
| P1-7 | P1 | Alert detail / notifications | Không có nút gọi/liên hệ người đang gặp sự cố |
| P1-8 | P1 | `/` | Header landing vỡ ở 360/390: logo và nút xuống dòng |
| P1-9 | P1 | `/app/admin` → Chính sách | “Phát hành” bật trước preview, không xác nhận |
| P2-1 | P2 | Mobile | Nhiều chữ 13–14px và tap target 20–38px |
| P2-2 | P2 | Menu “Thêm” | Không đóng bằng Escape/click ngoài; không có active state cho mục trong menu |
| P2-3 | P2 | Empty/404 | H1 là `h3`; title tab giống nhau; empty state bị lặp sau thu hồi |
| P2-4 | P2 | Lỗi/loading | HTTP 500 lộ mã; session lỗi thành màn hình trắng; invite sai định dạng báo sai nguyên nhân; auth loading trắng |
| P2-5 | P2 | Nhiều màn hình | Thuật ngữ kỹ thuật: `AI_BASE_URL`, `Widget`, `Options (JSON)`, `device_runtime`, `#dddddddd`... |
| P2-6 | P2 | Dashboard / history | Mật độ dọc cao: dashboard 2.479px, history 5.412px ở 390 |
| P2-7 | P2 | Admin → Người dùng | Bảng 680px trong khung 365px, cột trạng thái/hành động ngoài màn hình |
| P2-8 | P2 | Login/Register | Không có quên mật khẩu, không có hiện/ẩn mật khẩu |

Các mục P1/P2 có thể chồng lấn về nguyên nhân (đặc biệt P1-3/P1-4/P1-5); tôi tách theo màn hình để có thể sửa và kiểm riêng.

## 3. Findings P0

### P0-1 — Cảnh báo đang mở bị ẩn khi dữ liệu tổng quan/thiết bị đang tải hoặc lỗi

- **Màn hình:** `/app` (owner và caregiver), 390×844 và 1280×900.
- **Tái hiện:**
  1. Đăng nhập owner.
  2. Chặn `/api/v1/subjects/:id/status` và `/api/v1/subjects/:id/daily-summary` bằng delay 8 giây, giữ `/alerts` bình thường; mở `/app` và chụp ở 2,5 giây.
  3. Lặp lại với status/summary trả 500, alerts trả 200.
- **Thực tế:**
  - Khi chậm: phần nội dung chỉ còn “Đang tải dữ liệu tổng quan…” (header/tiêu đề trang vẫn còn), `0` phần tử `.alert-row`; cảnh báo té ngã đang mở không xuất hiện dù API alerts đã trả dữ liệu.
  - Khi status/summary 500: toàn dashboard thay bằng “Không tải được dữ liệu tổng quan… Yêu cầu không thành công (HTTP 500)”; không có cảnh báo nào.
- **Mong đợi:** Khối “Cảnh báo đang mở” phải render độc lập với status/summary; có loading/error riêng cho từng khối. Nếu alerts có dữ liệu, phải hiển thị ngay cả khi các khối khác lỗi. Cảnh báo là thông tin an toàn, không được phụ thuộc vào query không liên quan.
- **Bằng chứng:** `C:/Users/nguye/AppData/Local/Temp/annhien-ux/shots/state-dashboard-alerts-hidden-390.png`, `.../state-dashboard-data-500-390.png`.
- **Mã liên quan:** `apps/web/src/features/dashboard/DashboardPage.tsx:95–96` gộp `anyError/anyPending` của cả status, summary, openAlerts; `:125–141` chỉ render nội dung khi `!anyPending && !anyError`.
- **Mức độ:** P0 vì có thể che cảnh báo SOS/ngã trong tình huống mạng chậm hoặc một API phụ lỗi.

## 4. Findings P1

### P1-1 — Đổi trang trong app giữ nguyên vị trí cuộn, bỏ qua đầu trang

- **Màn hình:** bottom nav; đi từ `/app/history` (đã cuộn cuối) sang `/app/alerts`, `/app/subjects`, `/app`.
- **Tái hiện:** mở history, cuộn xuống cuối, bấm “Cảnh báo” hoặc “Tổng quan” ở bottom nav.
- **Thực tế:** route đổi nhưng scroll được giữ: sau khi sang alerts `scrollY=969`, H1 top `-734`; sang subjects `scrollY=487`, H1 top `-252`; sang dashboard `scrollY=2316`, H1 top `-2056`. Người dùng nhìn thấy giữa danh sách hoặc cuối trang, không thấy tiêu đề và cảnh báo đầu trang.
- **Mong đợi:** mỗi lần đổi route (trừ back/forward có chủ đích) đưa scroll về đầu trang và đưa focus tới H1/main; back/forward có thể khôi phục scroll đã lưu.
- **Bằng chứng:** `.../shots/scroll-after-nav-_app_alerts-390.png`, `.../scroll-after-nav-_app-390.png`, `.../scroll-after-nav-_app_subjects-390.png`.
- **Mã liên quan:** không có `ScrollRestoration` hay effect reset scroll trong `apps/web/src/app`; `AppShell` chỉ đổi `NavLink`.
- **Ảnh hưởng:** trên dashboard, cảnh báo mở nằm phía trên viewport sau khi điều hướng; đây là lỗi an toàn chứ không chỉ là khó chịu.

### P1-2 — Khối “Đã tạo lời mời” tràn ngang ở 390/360

- **Màn hình:** `/app/subjects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/share`, sau khi bấm “Tạo lời mời”.
- **Tái hiện:** owner đăng nhập → Hồ sơ → Quản lý và chia sẻ → nhập email → Tạo lời mời; đo `scrollWidth` và chụp 390/360.
- **Thực tế:** `scrollWidth` 502 so với viewport 390 (`maxScrollX=112`); 513 so với 360 (`maxScrollX=153`). URL dài khoảng 406–417px; token trong `.field__hint` không có điểm ngắt. Khối success, tiêu đề “Đã tạo lời mời”, email và token bị cắt; người dùng phải cuộn ngang để đọc/copy thủ công.
- **Mong đợi:** URL và token wrap trong card (`overflow-wrap:anywhere`/`word-break:break-all`, `min-width:0` cho flex child); không có scroll ngang ở 360/390. Nút copy vẫn phải hoạt động và có fallback chọn văn bản.
- **Bằng chứng:** `.../shots/overflow-invite-result-390x844.png`, `.../overflow-invite-result-360x740.png`, `.../overflow-invite-result-360x740-scrolled.png`.
- **Mã liên quan:** `apps/web/src/features/share/SharePage.tsx:284–304`; `.invite-result__url` có `word-break:break-all` nhưng token ở `.field__hint` thì không; `.alert` không giới hạn `min-width` của con.
- **Ghi chú:** đây là lỗi duy nhất gây overflow cấp trang trong 118 ảnh sweep; các bảng/card khác chỉ scroll trong vùng của chúng.

### P1-3 — Caregiver vừa nhận lời mời không xem được lịch sử, lỗi 403 lặp lại

- **Màn hình:** `/app/history` của tài khoản mới được mời, quyền 7 ngày (mặc định UI vẫn chọn 24 giờ).
- **Tái hiện:** owner tạo lời mời cho email mới → người mới đăng ký, chấp nhận → mở Lịch sử. Thử lại và thử các mốc 7/30 ngày.
- **Thực tế:** “Không tải được dữ liệu đo — Khoảng thời gian yêu cầu vượt quá quyền xem lịch sử được chia sẻ.” Nút “Thử lại” lặp lại đúng lỗi. Với tài khoản mới, `sharedFrom` mới hơn `now - 24h`, nhưng UI không cắt khoảng.
- **Mong đợi:** UI đọc `subject.sharedFrom` (đã có trong contract) và cắt `from` về mốc chia sẻ/`effectiveFrom`; hiển thị “Dữ liệu từ 07:10 hôm nay” hoặc empty state “Chưa có dữ liệu từ khi bạn được chia sẻ”, không hiện lỗi kỹ thuật. Nếu backend muốn giữ 403, UI phải xử lý 403 bằng cách tự điều chỉnh khoảng và thử lại một lần.
- **Bằng chứng:** `.../shots/flow-new-caregiver-history-390.png`.
- **Mã liên quan:** `apps/web/src/features/history/HistoryPage.tsx:64–69` chỉ dùng `permissions.historyDays`, bỏ qua `sharedFrom`; `apps/api/src/access/access.service.ts:104–110` ném 403 khi `from < effectiveFrom` dù service đo sau đó có logic cắt `windowFrom`.

### P1-4 — Dashboard caregiver mới hiện “0 bước” giả và dữ liệu trước mốc chia sẻ

- **Màn hình:** `/app` của tài khoản vừa chấp nhận lời mời.
- **Tái hiện:** mở dashboard ngay sau khi chấp nhận lời mời; so sánh với Lịch sử và Thiết bị.
- **Thực tế:**
  - Card Vận động hiện “0 bước” kèm “chưa đủ dữ liệu”, và “Độ phủ dữ liệu 0% / 0 mẫu đã nhận”; phần tổng hợp nói “chưa nhận dữ liệu từ thiết bị”.
  - Card thiết bị lại hiện “Ngoại tuyến”, “lần nhận cuối 22 phút trước”, “Nhịp tim gần nhất 61 bpm”, “Pin 86%” — tức dữ liệu trước/khác mốc chia sẻ.
  - Không có nhãn “dữ liệu chỉ từ lúc bạn được chia sẻ”, nên người dùng không thể hiểu vì sao “0 bước” nhưng thiết bị vẫn có nhịp tim/pin.
- **Mong đợi:**
  - Không render `0` khi `steps.completeness='unavailable'`; thay bằng “Chưa có dữ liệu vận động từ khi bạn được chia sẻ”.
  - Card thiết bị chỉ hiển thị dữ liệu trong phạm vi được chia sẻ, hoặc ghi rõ “dữ liệu trước 07:10 không hiển thị”.
  - Thêm dòng “Bạn được chia sẻ từ 07:10 15/11” ở đầu dashboard.
- **Bằng chứng:** `.../shots/flow-invite-new-user-app-390.png`.
- **Mã liên quan:** `DashboardPage.tsx:223` luôn in `steps.total`; `devices.service.ts:304–317` lấy telemetry cuối mà không lọc `effectiveFrom`; `AppShell` không truyền `sharedFrom` xuống dashboard.
- **Ghi chú riêng tư:** API device status trả nhịp tim 61 bpm lúc 23:47Z, trước `sharedFrom` 00:10Z. Cần xác nhận đây là chủ đích (hiển thị “last known” trước chia sẻ) hay là rò rỉ dữ liệu sức khỏe trước mốc chia sẻ; tài liệu `docs/06` nói chỉ chia sẻ từ mốc chấp nhận. Nếu là lỗi, cần ưu tiên cao hơn P1.

### P1-5 — Các trang app ngoài dashboard thiếu nhãn “dữ liệu mô phỏng” trên mobile; sidebar desktop bị cắt

- **Màn hình:** `/app/alerts`, `/app/devices`, `/app/assistant`, `/app/tasks`, `/app/studio` ở 390/360; sidebar desktop 1280×900 và 1280×768.
- **Tái hiện:** mở các trang app trên mobile; so với landing/login (có ghi “Bản demo · dữ liệu mô phỏng”). Trên desktop, cuộn sidebar xuống cuối.
- **Thực tế:**
  - Dashboard có card “Giới hạn của bản demo” ở cuối trang (sau hơn 2.000px) nêu dữ liệu mô phỏng và cảnh báo chỉ hiển thị khi trang mở. Các trang alerts/devices/assistant/tasks/studio **không có card này**; body chỉ có nội dung nghiệp vụ.
  - Dưới 1024px, sidebar bị ẩn; topbar chỉ còn “Bản demo”, không còn “dữ liệu mô phỏng”. Vì vậy trên mobile, người dùng vào thẳng alerts/devices/assistant không thấy nhãn mô phỏng hay cảnh báo “chỉ hiển thị khi trang đang mở”.
  - Desktop 1280×900 có đáy safety note khoảng 929 > 900, 1280×768 có top khoảng 847 > 768; note chỉ thấy nếu sidebar tự cuộn.
- **Mong đợi:** một notice nhỏ nhưng luôn truy cập được ở mọi breakpoint (topbar/“Thêm”/footer trang), ví dụ “Bản demo — dữ liệu mô phỏng; cảnh báo chỉ hiện khi app đang mở”. Các màn hình có dữ liệu sức khỏe nên có nhãn “dữ liệu mô phỏng” riêng, không chỉ logo “Bản demo”; card cuối dashboard không thay thế được notice toàn cục.
- **Bằng chứng:** `.../shots/owner-devices-390x844.png`, `.../owner-assistant-390x844.png`, `.../flow-invite-new-user-app-390.png` (card demo cuối dashboard), `.../interact-dashboard-1280-top.png`, `.../interact-dashboard-1280x768.png`.
- **Mã liên quan:** `apps/web/src/app/AppShell.tsx:259–263` (safety note trong sidebar), `:273` (topbar chỉ “Bản demo”); CSS sidebar ẩn dưới 1024px.

### P1-6 — Không có chỉ báo cảnh báo mới hoặc mất kết nối realtime ngoài trang đang xem

- **Màn hình:** `/app/history` và `/app/alerts`; sau đó chặn SSE.
- **Tái hiện:**
  1. Mở `/app/alerts`; cho simulator gửi SOS. Đo số `.alert-row` trước/sau.
  2. Mở `/app/history`; cho simulator gửi SOS; so sánh body/URL/badge.
  3. Chặn request SSE (`**/events**`), gửi SOS, đo số alert và tìm cảnh báo kết nối.
- **Thực tế:**
  - Ở `/app/alerts`, danh sách tự tăng 2 → 3 hàng, nhưng không có badge, toast, `document.title` hay thông báo “Cảnh báo mới”. `.shell__nav-badge` không được render ở bất kỳ trang nào.
  - Ở `/app/history`, body không đổi sau khi SOS được tạo; người dùng không biết có cảnh báo mới.
  - Khi SSE bị chặn: số alert 4 → 4, không có banner “Mất kết nối trực tiếp” hay “Đang thử lại”. Trang chỉ có nội dung tĩnh.
- **Mong đợi:** badge số chưa đọc trên nav “Cảnh báo”/“Thông báo” + toast một lần cho cảnh báo mới; banner trạng thái SSE (đang kết nối/mất kết nối/đang thử lại) có thể đóng nhưng còn indicator; không im lặng khi mất realtime.
- **Bằng chứng:** `.../shots/sse-alert-added-390.png`, `.../sse-history-new-alert-silent-390.png`, `.../sse-blocked-silent-390.png`.
- **Mã liên quan:** `AppShell.tsx:102–110` gọi `useSubjectEvents` nhưng bỏ qua `status/retryAttempt`; CSS `.shell__nav-badge` tồn tại nhưng không có JSX render.

### P1-7 — Không có cách gọi/liên hệ người đang gặp sự cố

- **Màn hình:** `/app/alerts/:id` (owner và caregiver), `/app/notifications`.
- **Tái hiện:** mở cảnh báo té ngã; tìm nút gọi điện/hotline/số liên hệ.
- **Thực tế:** chỉ có “Tôi đang hỗ trợ” (caregiver) hoặc “Đóng cảnh báo” (owner); cảnh báo ghi “Nếu đây là khẩn cấp, hãy gọi 115 hoặc liên hệ chủ hồ sơ”, nhưng không có `tel:`, số 115, danh bạ người thân hay nút gọi. Tìm chuỗi `tel:`/`hotline`/`phone` trong `apps/web/src` chỉ thấy đúng câu text này.
- **Mong đợi:** nút “Gọi 115” (`tel:115`) và danh sách liên hệ đã được chủ hồ sơ chia sẻ (tên + số, có consent), hoặc ít nhất copy số. Ghi nhận hành động “đã gọi/liên hệ” vào timeline để phối hợp.
- **Bằng chứng:** `.../shots/owner-alert-detail-390x844.png`, `.../caregiver-alert-detail-390x844.png`.
- **Tài liệu:** `docs/06` mô tả bước “liên hệ thủ công” trong luồng cảnh báo; UI hiện không có công cụ nào để làm bước đó trong app.

### P1-8 — Header landing vỡ ở 360/390: logo và nút xuống dòng

- **Màn hình:** `/` công khai, 360×740 và 390×844.
- **Tái hiện:** mở landing không đăng nhập; đo brand/nav.
- **Thực tế:** ở 360, brand rộng 97,8px nhưng cao 70,1px (2 dòng “An / Nhiên”); hai nút “Đăng nhập”/“Mở ứng dụng” cao 62,4px (2 dòng), header cao 104,1px. Ở 390 brand 107,8×70,1. Ở 320 tệ hơn. Trong khi đó 768 brand một dòng, nút 42,5px.
- **Mong đợi:** brand `white-space:nowrap` và giữ một dòng; nếu không đủ chỗ, header chuyển thành hai hàng có chủ đích (brand hàng 1, actions hàng 2) thay vì ép chữ/nút wrap. Header mục tiêu ≤ 80px ở 390.
- **Bằng chứng:** `.../shots/header-360.png`, `.../header-390.png`, `.../public-landing-360x740-top.png`, `.../public-landing-390x844.png`.
- **Ảnh hưởng:** đây là màn hình đầu tiên của người thân; logo bị bẻ đôi và nút hai dòng làm giảm cảm giác tin cậy/hoàn thiện.

### P1-9 — Có thể “Phát hành” chính sách thiết bị mà không cần xem trước hoặc xác nhận

- **Màn hình:** `/app/admin` → tab “Chính sách thiết bị”.
- **Tái hiện:** admin đăng nhập → Quản trị → Chính sách thiết bị; không bấm “Xem trước”, bấm “Phát hành”.
- **Thực tế:** nút “Phát hành” enabled ngay (`isDisabled=false`), preview count `0`; không có dialog xác nhận, không hiển thị diff/giá trị sẽ ghi. Mô tả trên màn hình lại nói “Xem trước … trước khi Phát hành”. Trên mobile, “Xem trước” và “Phát hành” nằm cạnh nhau, “Phát hành” là nút primary teal.
- **Mong đợi:** disable “Phát hành” đến khi có preview hợp lệ, hoặc bắt buộc dialog xác nhận “Bạn sẽ ghi các giá trị sau…”; hiển thị diff/nguồn và cảnh báo không rollback. Với admin ít kỹ thuật, đây là thao tác cấu hình thiết bị có thể gây hậu quả vận hành.
- **Bằng chứng:** `.../shots/flow-admin-policy-before-preview-390.png`, `.../flow-admin-policy-preview-1280.png`, `.../flow-admin-policy-390.png`.
- **Mã liên quan:** `AdminPage.tsx:532–535`; `publish` mutation không kiểm tra `previewResult`.

## 5. Findings P2

### P2-1 — Chữ phụ và tap target còn nhỏ trên mobile

- **Màn hình:** `/app` ở 390×844; bottom nav, topbar, select hồ sơ, link cảnh báo.
- **Tái hiện:** đo `font-size`/bounding box của các phần tử tương tác; bật chữ lớn để so sánh.
- **Thực tế:**
  - Label bottom nav 13,81px; “Đăng xuất” 13,26px, cao 38,25px; select hồ sơ cao 32px; link tiêu đề cảnh báo cao 28,05px; “Xem tất cả cảnh báo →” cao 20px; “Xem lịch sử và biểu đồ →” 26px; “Quản lý” 26px; nút “Thêm” 42,3×62px (rộng 42,3 < 44px) và chữ 13,8px.
  - Ở chữ lớn, nav item khoảng 77×104 và trang không overflow; chữ lớn hoạt động, nhưng mặc định vẫn nhỏ so với người 35–55 tuổi.
- **Mong đợi:** tap target chính ≥44×44px (đặc biệt select, logout, link cảnh báo); meta text mặc định 15–16px; giữ nguyên khả năng phóng to. Đây là tiêu chí usability cho người lớn tuổi, không chỉ WCAG 2.2 minimum 24px.
- **Bằng chứng:** `.../shots/owner-dashboard-390x844.png`, `.../interact-dashboard-360-large-top.png`, `.../owner-alerts-390x844.png`.

### P2-2 — Menu “Thêm” không đóng bằng Escape/click ngoài; không có active state cho mục bên trong

- **Màn hình:** mobile bottom nav “Thêm”; `/app/devices`, `/app/notifications`, `/app/assistant`, `/app/tasks`, `/app/studio`.
- **Tái hiện:** mở “Thêm”, bấm Escape hoặc click ngoài; mở một mục trong menu; kiểm `.shell__nav-link.is-active`.
- **Thực tế:** sau Escape và click ngoài, `aria-expanded=true`, menu vẫn mở; focus không được đưa vào menu. Khi ở Thiết bị/Thông báo/Trợ lý/Công việc/Studio, không có nav item nào có `.is-active` (activeNav rỗng), vì các mục này nằm trong menu chứ không phải bottom nav.
- **Mong đợi:** đóng bằng Escape/click ngoài, trả focus về nút “Thêm”; `aria-controls`; đánh dấu “Thêm” active khi route thuộc menu, hoặc highlight mục đang mở khi menu mở.
- **Bằng chứng:** `.../shots/interact-more-open-390.png`, `.../interact-more-after-outside-390.png`, `.../interact-tasks-390-top.png`.
- **Mã liên quan:** `AppShell.tsx:195–224`; không có `useEffect` cho Escape/outside, không có `aria-controls`; `moreItems` không tham gia `isActive` của bottom nav.

### P2-3 — Heading, title tab và empty state chưa đúng ngữ nghĩa

- **Màn hình:** `/app/khong-ton-tai`, `/app/subjects/:id/share` (caregiver bị từ chối), `/app/history` (admin không có hồ sơ), trạng thái không có hồ sơ; sau thu hồi quyền.
- **Tái hiện:** mở các URL trên; đếm `h1`; xem `document.title`; sau thu hồi caregiver mở lại `/app`.
- **Thực tế:**
  - Các empty/denied/404 toàn trang dùng `EmptyState` với `<h3>`; `h1` count = 0. Không có cách điều hướng bằng heading cho screen reader.
  - Tất cả route dùng cùng title “An Nhiên — theo dõi người thân”; tab/lịch sử trình duyệt không phân biệt trang.
  - Sau thu hồi, “Chưa có hồ sơ nào” xuất hiện hai lần (SubjectSwitcher + Dashboard), không có CTA rõ để về trang chủ/đăng xuất.
- **Mong đợi:** mỗi trang có đúng một `h1` (EmptyState nhận prop heading level hoặc page bọc `h1`); title theo route; một empty state duy nhất với CTA.
- **Bằng chứng:** `.../shots/owner-app-404-390x844.png`, `.../caregiver-share-denied-390x844.png`, `.../flow-revoked-caregiver-390.png`, `.../admin-history-empty-390x844.png`.
- **Mã liên quan:** `apps/web/src/components/EmptyState.tsx:31` luôn `<h3>`; title đặt ở `App.tsx`/router một lần.

### P2-4 — Trạng thái lỗi/loading còn kỹ thuật, thiếu lối thoát

- **Màn hình:** `/app` (HTTP 500), `/app/history` (403), `/app` sau session 401/500, `/login` khi kiểm tra session chậm, `/invite/token-khong-hop-le`.
- **Tái hiện và thực tế:**
  - API daily-summary 500 → “Yêu cầu không thành công (HTTP 500)” ngay trên dashboard; không có gợi ý “thử lại sau” hay “xem cảnh báo vẫn được”.
  - Session API 500 → màn hình chỉ có “Không xác nhận được phiên đăng nhập / Không kết nối được máy chủ hoặc phiên đang gặp lỗi. Thử lại”, mất header/brand/lối về đăng nhập; không lộ HTTP nhưng là ngõ cụt.
  - Kiểm tra session chậm 5 giây → body chỉ “Đang kiểm tra phiên đăng nhập…”, không có brand/nav/skeleton; trông như trang trắng.
  - History lỗi 403 → ErrorState cao `60vh`, nằm dưới nav, tiêu đề lỗi ở giữa màn hình thay vì cạnh bộ lọc.
  - `/invite/token-khong-hop-le` → API 422; UI báo “Không kết nối được máy chủ. Kiểm tra kết nối mạng và thử lại.” Trong khi token sai 43 ký tự → “Lời mời không hợp lệ”. Cùng là link hỏng nhưng hai thông điệp khác nhau, một thông điệp sai nguyên nhân.
- **Mong đợi:** message tiếng Việt gần gũi, không lộ HTTP; phân biệt lỗi mạng/máy chủ/dữ liệu; luôn có CTA “Thử lại”, “Về trang chủ”, “Đăng nhập”; loading có brand/skeleton và timeout; invite sai định dạng dùng cùng guidance “Liên kết không hợp lệ hoặc đã hết hạn”.
- **Bằng chứng:** `.../shots/state-session-error-390.png`, `.../state-session-slow-390.png`, `.../state-login-offline-390.png`, `.../public-invite-malformed-360x740.png`, `.../public-invite-unknown-360x740.png`.
- **Mã liên quan:** `apps/web/src/lib/api.ts:123` tạo “HTTP ${status}”; `public.mjs` ghi nhận 422 cho token sai định dạng.

### P2-5 — Thuật ngữ kỹ thuật xuất hiện trên màn hình người dùng

- **Màn hình:** Assistant, Studio, Tasks, Subjects, Admin, error states.
- **Tái hiện:** mở từng màn hình và đọc label/help text.
- **Thực tế:**
  - Assistant: “AI_BASE_URL”, “template_fallback”, “gemini”, “OpenAI-compatible”.
  - Studio: “Mã view”, “Widget”, “Options (JSON)”, “Draft r1 · digest”, “bundle”, “entry”.
  - Tasks: “Điểm ưu tiên 2/100”, “#dddddddd”, “firmware 0.0.0-sim”, UUID thiết bị.
  - Subjects: “Asia/Ho_Chi_Minh”, “3650 ngày”, “30 ngày”, “vai trò owner/caregiver”.
  - Admin: “device_runtime”, “telemetry”, “auth.login”, “database”, “rollback”.
  - Error: “HTTP 500”.
- **Mong đợi:** label nghiệp vụ bằng tiếng Việt; thông tin kỹ thuật đặt trong “Chi tiết kỹ thuật” có thể mở, dành cho admin. Với owner/caregiver, chỉ giữ “7 ngày”, “30 ngày”, “múi giờ Việt Nam”, “ưu tiên cao/thấp”.
- **Bằng chứng:** `.../shots/owner-assistant-1280x900.png`, `.../owner-studio-1280x900.png`, `.../flow-studio-detail-390.png`, `.../owner-tasks-390x844.png`, `.../owner-subjects-390x844.png`, `.../admin-admin-1280x900.png`.

### P2-6 — Mật độ dọc cao ở dashboard và history trên mobile

- **Màn hình:** `/app` và `/app/history` ở 390×844.
- **Tái hiện:** đo `scrollHeight`, vị trí các section; đếm card history.
- **Thực tế:** dashboard cao 2.479px; 4 metric xếp một cột (grid cao 416px) nên “Tóm tắt hôm nay” bắt đầu khoảng 838px, thiết bị khoảng 1.589px; history cao 5.412px (chữ lớn 6.595px), 20 card mỗi card nhiều dòng, nút “Tải thêm 20” ở cuối. Ở 390, người dùng phải cuộn rất lâu mới thấy thông tin thiết bị/lịch sử cũ.
- **Mong đợi:** dashboard dùng 2×2 metric ở mặc định (1 cột khi chữ lớn); history dùng row gọn/group theo giờ, sticky bộ lọc, hoặc “Tải thêm” sớm hơn; giữ thông tin quan trọng (cảnh báo, pin, lần nhận cuối) trong 1–2 viewport đầu.
- **Bằng chứng:** `.../shots/owner-dashboard-390x844.png`, `.../owner-history-390x844.png`, `.../history-390-mid.png`.

### P2-7 — Bảng Người dùng của admin bị cắt trên mobile, không có chỉ báo cuộn

- **Màn hình:** `/app/admin` → Người dùng, 390/360.
- **Tái hiện:** mở tab Người dùng trên mobile; đo table/container; thử tìm trạng thái/hành động.
- **Thực tế:** table rộng 680px trong container 365px; cột trạng thái và nút thao tác nằm ngoài màn hình; không có shadow/fade hay chữ “vuốt ngang”.
- **Mong đợi:** card/list theo hàng cho mobile, hoặc sticky cột đầu + chỉ báo cuộn + action menu; giữ bottom nav không đè nội dung.
- **Bằng chứng:** `.../shots/flow-admin-users-390.png`, `.../admin-admin-users-390x844.png`.

### P2-8 — Không có quên mật khẩu hoặc hiện/ẩn mật khẩu

- **Màn hình:** `/login`, `/register`.
- **Tái hiện:** tìm link “Quên mật khẩu”, toggle con mắt trong ô mật khẩu.
- **Thực tế:** không có link recovery, không có toggle hiện/ẩn. Có `<details>` “Tài khoản demo có sẵn” để điền nhanh, nhưng khi tự nhập hoặc dùng tài khoản thật thì mật khẩu dài `demo-an-nhien-2026` vẫn phải gõ mù, dễ sai trên điện thoại.
- **Mong đợi:** nếu ngoài phạm vi demo, ghi rõ “Bản demo chưa hỗ trợ khôi phục”; nếu không, thêm luồng quên mật khẩu và toggle hiện/ẩn. Đây là gap chức năng, không chỉ visual.
- **Bằng chứng:** `.../shots/public-login-390x844.png`, `.../public-login-360x740-top.png`.

## 6. Điểm đã làm tốt (đối chiếu, không chỉ lỗi)

- **Định hướng thị giác rõ:** palette ấm, font Newsreader/Be Vietnam Pro, card và status pill nhất quán; landing/login có cảm giác “sản phẩm chăm sóc” chứ không phải dashboard kỹ thuật.
- **Cảnh báo được ưu tiên khi dữ liệu bình thường:** dashboard đặt “Cảnh báo đang mở” trước metric; tiêu đề cảnh báo lớn, có loại “Yêu cầu trợ giúp”, thời gian, trạng thái; không chỉ dùng màu để phân biệt.
- **Luồng quyền thật:** caregiver không có nút đóng cảnh báo; owner có form đóng với lý do bắt buộc; share page phân biệt pending/accepted/revoked; caregiver bị thu hồi nhận banner “Bạn đã mất quyền xem hồ sơ…” và dữ liệu bị xóa.
- **SSE hoạt động khi đang ở đúng trang:** danh sách alerts tự cập nhật khi simulator gửi SOS; notification mark-read phản hồi ngay; valid invite public page không lộ email người được mời.
- **Xử lý phiên/khôi phục:** 401 chuyển `/login?next=…` đúng; offline login báo “Không kết nối được máy chủ…” thân thiện; nút copy lời mời có fallback khi clipboard bị chặn.
- **Không có pageerror/console error bất thường** trong 118 ảnh sweep; các 401/422 xuất hiện là có chủ đích (session/invite test).
- **Không tràn ngang cấp trang** ở 118 ảnh sweep (trừ invite success); bảng history/admin cuộn trong container; chart có hướng dẫn vuốt và bảng thay thế.
- **Chữ lớn hoạt động:** root 20px, layout không tràn ở 360; contrast các cặp token chính đều ≥4,5:1 (thấp nhất đo được 4,82 cho `#5b6f81` trên `#faf6ed`).
- **Reduced motion:** có block `@media (prefers-reduced-motion: reduce)`; không thấy animation gây mất tập trung.

## 7. Đã kiểm / chưa kiểm

### Đã kiểm

- 14 nhóm route công khai + trong app, 4 vai trò, 3 viewport chính, chữ lớn.
- Login empty/wrong password/offline; 401 session; session API 500; dashboard/history/subjects/share API 500; slow 1s/5s/8s; SSE blocked.
- Invite: valid, unknown, malformed; create via UI; register new user; accept; revoke; caregiver denial.
- Alerts: list/detail, caregiver acknowledge, owner resolve form (mở form, chưa submit), SSE thêm alert, alert trên history, overflow/scroll.
- Admin: users/policy/audit, preview, publish button state, mobile table.
- Studio: tạo view, detail, mobile; tasks/notifications/devices/subjects/assistant.
- Keyboard: Escape/click ngoài menu “Thêm”; focus visible; skip link có trong DOM.
- Đo touch target, font-size, scrollWidth, scrollY, body height, h1 count, document.title.
- Git status/HEAD; không sửa source; không commit.

### Chưa kiểm

- **Thiết bị/OS thật:** chỉ Chromium desktop; chưa iOS Safari, Android Chrome thật, Firefox.
- **Screen reader:** chưa chạy VoiceOver/TalkBack/NVDA; kết luận a11y dựa trên DOM/keyboard/kích thước.
- **Keyboard toàn bộ:** chưa quét toàn bộ tab order, focus trap modal, screen reader form error announcement.
- **Mạng thật:** mô phỏng delay/offline/500; chưa đo 3G/4G, packet loss, CPU throttling.
- **Zoom 200%:** chưa kiểm browser zoom; mới kiểm chữ lớn 20px.
- **Performance:** chưa đo LCP/INP/bundle size; commit `8434d66` có tách chunk nhưng không đo trong review này.
- **Web Push/PWA/offline reload:** chưa có service worker/push trong phạm vi; chưa kiểm.
- **Tác vụ phá hủy:** không submit resolve form, không publish policy, không release device, không khóa user, không xóa dữ liệu; chỉ mở form/kiểm trạng thái nút để tránh thay đổi ngoài ý muốn.
- **CSV export:** chưa bấm tải CSV; chỉ thấy URL export trong UI.
- **Đa người dùng đồng thời/rate limit/CSRF:** ngoài phạm vi UX.
- **Automated axe/Lighthouse:** chưa chạy; contrast được tính từ token, không phải audit toàn trang.
- **Test suite repo:** không chạy `pnpm test`/E2E vì review read-only; chỉ build API/contracts để chạy thật.

## 8. Giới hạn môi trường

1. **Web không chạy bằng config repo:** `apps/web/vite.config.ts` hard-code 5173 và proxy 3000. Để không đụng cổng 3000/5173 và không sửa file, tôi dùng Vite server tạm ở 3110 với proxy 3100. Đây là môi trường review, không phải production build.
2. **API chạy bằng `dist`:** `tsx src/main.ts` lỗi DI `AssistantService`; `nest build` rồi `node dist/src/main.js` chạy được. Đây là build production-like, không phải source watch.
3. **DB là dữ liệu seed + thao tác review:** không phải dữ liệu thật; số alert/invite thay đổi trong phiên. Ảnh là ảnh tại thời điểm chụp, không phải trạng thái cuối.
4. **Ảnh fullPage và bottom nav:** Playwright fullPage chụp toàn bộ document; bottom nav `position:fixed` có thể xuất hiện giữa ảnh. Các kết luận về che khuất/overflow dùng thêm bounding box/viewport screenshot, không chỉ nhìn ảnh fullPage.
5. **Không có dữ liệu người thật:** toàn bộ email/tên/số liệu là seed/synthetic; không dùng dữ liệu cá nhân.
6. **Dừng dịch vụ sau review:** API 3100 và web 3110 sẽ được dừng; DB `.data/review-ux` giữ lại để tái hiện nếu cần. Không đụng `.data/pglite` hay cổng 3000.

## 9. Danh sách ảnh và artifact

**Thư mục ảnh:** `C:/Users/nguye/AppData/Local/Temp/annhien-ux/shots/` (218 PNG; dưới đây là các ảnh dùng làm bằng chứng).

**Dữ liệu đo:**

- `C:/Users/nguye/AppData/Local/Temp/annhien-ux/sweep.json` — 118 snapshot, 0 failure.
- `.../sweep.json` — 118 snapshot, 0 failure; console/pageerror được đọc trực tiếp từ script, không lưu file riêng.
- `.../interact.json` — scroll, touch target, active nav, menu.
- `.../flow.json` — invite/register/accept/revoke, notification, caregiver ack, admin, studio.
- `.../overflow.json` — overflow invite success.
- `.../states.json` — slow/error/offline/session.
- `.../public.json` — public/invite.

**Ảnh chính:**

- Landing/header: `landing-1280.png`, `public-landing-390x844.png`, `public-landing-360x740-top.png`, `header-360.png`, `header-390.png`.
- Auth: `public-login-390x844.png`, `public-login-360x740-top.png`, `public-register-390x844.png`, `state-login-offline-390.png`.
- Dashboard: `owner-dashboard-1280x900.png`, `owner-dashboard-390x844.png`, `owner-dashboard-360x740-large.png`, `state-dashboard-alerts-hidden-390.png`, `state-dashboard-data-500-390.png`, `flow-invite-new-user-app-390.png`.
- History: `owner-history-1280x900.png`, `owner-history-390x844.png`, `flow-new-caregiver-history-390.png`, `history-390-top.png`, `history-390-mid.png`, `scroll-after-nav-_app_alerts-390.png`.
- Alerts: `owner-alerts-390x844.png`, `owner-alert-detail-390x844.png`, `caregiver-alert-detail-390x844.png`, `flow-resolve-form-390.png`, `sse-alert-added-390.png`, `sse-history-new-alert-silent-390.png`, `sse-blocked-silent-390.png`.
- Share/invite: `owner-share-390x844.png`, `owner-share-1280x900.png`, `overflow-invite-result-390x844.png`, `overflow-invite-result-360x740.png`, `flow-owner-invite-created-390.png`, `flow-revoked-caregiver-390.png`, `caregiver-share-denied-390x844.png`.
- Khác: `owner-devices-390x844.png`, `owner-notifications-390x844.png`, `owner-assistant-1280x900.png`, `owner-assistant-390x844.png`, `owner-tasks-390x844.png`, `owner-studio-1280x900.png`, `flow-studio-detail-390.png`, `admin-admin-1280x900.png`, `flow-admin-users-390.png`, `flow-admin-policy-390.png`, `flow-admin-policy-before-preview-390.png`, `owner-app-404-390x844.png`, `public-404-390x844.png`, `interact-more-open-390.png`, `interact-dashboard-1280x768.png`.
- Session/lỗi: `state-session-expired-1280.png`, `state-session-error-390.png`, `state-session-slow-390.png`, `public-invite-malformed-360x740.png`, `public-invite-unknown-360x740.png`.

## 10. Tóm tắt 5 dòng cho lead

1. HEAD `8434d66`; API 3100 + DB `.data/review-ux` + web review 3110 chạy thật; 118 ảnh, 0 pageerror, chỉ file báo cáo này được thêm.
2. **P0:** dashboard ẩn toàn bộ cảnh báo đang mở khi status/daily-summary đang tải hoặc lỗi; phải render cảnh báo độc lập ngay.
3. **P1:** scroll không reset khi đổi tab; invite tràn ngang 502/390; caregiver mới lỗi history 403 + “0 bước” giả/dữ liệu trước mốc share; thiếu badge cảnh báo mới/SSE, nút gọi, nhãn mô phỏng mobile, header landing 360/390, publish policy không preview.
4. **P2:** tap target/chữ nhỏ, menu “Thêm” không đóng bằng Escape/click ngoài, heading/title/empty state, HTTP 500/session/invite error, thuật ngữ kỹ thuật, mật độ dashboard/history, bảng admin mobile, quên mật khẩu.
5. Chỉ thêm `reports/qa/v2-ux-visual.md`; không commit, không sửa code; API/web đã dừng sau review.

