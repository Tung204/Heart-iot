# Handoff — W2 lane H: dữ liệu sức khỏe (v7)

**Task** `task_55a8bc6ed4ee` · **Dispatch** `ctx_609e8901ff77` · **Worker terminal**
`term_4613eb3f-73d2-4bdc-83a8-ac5644b08f2c` · **Coordinator** `term_3f23340f-5395-401c-a4e2-f39372767efd`

- **Worktree**: `C:/Users/nguye/orca/workspaces/DATN/v7-h`
- **Branch**: `Tung204/v7-h` (chưa merge, chưa push)
- **Base**: `cf11c29` — tip `v7-foundation` trong worktree này
  (`feat(web): nền tảng giao diện v7 — token, primitive, shell, CSS graph`).
- **Code commit**: `6734316` (commit handoff này là commit riêng sau đó).
- **Provider/model thực tế**: `moxuna / deepseek-v4.1-flash` (không phải dola).
- **Thời điểm đo**: 2026-11-18 00:35–00:42 ICT (metrics `generatedAt`
  2026-11-17T17:42:58Z).

## 1. Môi trường QA (không bypass origin)

| Thành phần | Giá trị |
| --- | --- |
| Web dev | `http://127.0.0.1:4353` — `pnpm --filter @heart-iot/web exec vite --port 4353 --strictPort --host 127.0.0.1` với `VITE_API_BASE_URL=http://127.0.0.1:3353/api/v1` |
| API | `http://127.0.0.1:3353` — `PORT=3353 WEB_ORIGIN=http://127.0.0.1:4353 node apps/api/dist/src/main.js` |
| DB | PGlite cục bộ trong worktree `PGLITE_DATA_DIR=.data/w2-h` (seed demo; 1.681 telemetry, 3 incident) |
| Tài khoản | owner `ba-an@demo.heart-iot.local` / `demo-heart-iot-2026` |
| Browser | Chromium Playwright 1.65.1 headless, DPR 1, locale `vi-VN`, timezone `Asia/Ho_Chi_Minh` |

Cổng 3000 của phiên khác đang bận nên API chạy cổng riêng 3353; web gọi API qua
`VITE_API_BASE_URL` cùng origin `127.0.0.1`, CORS/`WEB_ORIGIN` khớp `4353` — không
sửa `WEB_ORIGIN` thành `*`, không chèn cookie thủ công, không mock API khi chụp.

## 2. Đã làm theo file

### `features/dashboard/*`
- Viết lại `DashboardPage.tsx` theo `design-system.md` §5.7: **compact subject
  (shell) → breadcrumb Hôm nay → H1 Sức khỏe + action Lịch sử đo → cảnh báo
  đang mở → dữ liệu ngày → xu hướng 7/14/30 → thiết bị**.
- **Cảnh báo độc lập**: giữ nguyên 3 query tách rời; vùng alerts có
  loading/error/empty riêng, không chờ `status`/`daily-summary`/insights/AI.
  Hàng cảnh báo dạng row (vạch đỏ cho cảnh báo cần xử lý), trạng thái `Đang mở`/
  `Đã xác nhận` bằng pill có chữ.
- **Gác quyền đã biết**: `canViewMeasurements === false` ⇒ không gọi
  `daily-summary`, không render `RecentInsightsCard`, ẩn action `Lịch sử đo`,
  link “Xem lịch sử và biểu đồ →” và không có CSV; hiện một vùng quyền rõ
  “Chủ hồ sơ không chia sẻ số đo”. Thiết bị vẫn đọc metadata (`status`) nhưng
  ẩn `Lần đo gần nhất`, ghi “Không được xem số đo của thiết bị này” thay vì giả
  “chưa có dữ liệu”. `403` giữa phiên được xử lý như trạng thái quyền.
- **Null/coverage/source**: `dl` 3 cột desktop (mobile: hàng label/value):
  HR trung bình + min–max + số mẫu hợp lệ; bước `unavailable` hiện `—` +
  “chưa đủ dữ liệu bước” (không hiện `0 bước`); pin `null` = “Chưa có thông
  tin pin”. Ngày theo timezone hồ sơ, nhãn “Nguồn: dữ liệu mô phỏng” (khi
  `source=synthetic`) đặt ngay khối số liệu cùng độ phủ/số lần nhận/khoảng thiếu
  và thời điểm dữ liệu mới nhất.
- Bỏ card bọc số liệu, spinner quay (`@keyframes an-spin` không còn dùng ở
  route này); trạng thái tải là câu `role=status` tĩnh.

### `features/history/*`
- Giữ nguyên hooks/query: `useInfiniteQuery`, `queryKeys.measurements`, cursor,
  `PAGE_SIZE=500`, initial 10, thêm 50, trần 400, một nút tải thêm duy nhất,
  `rangeAnchor` chỉ đổi khi chọn khoảng/Cập nhật, không refetch sau 60 giây,
  `clampRangeToHistoryDays` + `sharedFrom` cho **cả GET và CSV**.
- **Khoảng lọc nằm trong URL** `?days=1|7|30`; đổi khoảng `push` history entry,
  Back/Forward khôi phục đúng lựa chọn (test mới). Khoảng không được phép vẫn
  disable kèm `title` **và** câu giải thích hiển thị (historyDays/sharedFrom).
- Thứ tự mới: breadcrumb Sức khỏe → H1 → range (role=group + aria-pressed,
  target 44) + “Cập nhật khoảng”/“Tải CSV” → **“Dữ liệu hiển thị là dữ liệu mô
  phỏng.”** → cảnh báo rút ngắn khoảng → chart → **Độ phủ và khoảng thiếu**
  (block luôn hiện, thay `<details>`) → bảng desktop/một danh sách mobile →
  nút tải thêm + giới hạn trần + CSV.
- Chỉ HR `quality=valid` + `measuredAt` hợp lệ vào chart/giá trị bảng; mẫu
  `isLate`, `isQuarantined`, `measuredAt=null` có nhãn chữ; gap lý do bằng chữ.
- `ErrorState` dùng `headingLevel=2` (trước đây mặc định H1 → 2 H1 khi lỗi).
- Giữ đúng các chuỗi test cũ: “Đang hiển thị X/Y dòng”, “Hiện thêm N dòng”,
  “Tải thêm từ máy chủ”, “Đã hiện tối đa 400/…”, “Dùng nút “Tải CSV” ở trên…”,
  aria-label danh sách mobile “Dữ liệu đo trong khoảng đã chọn”.

### `features/insights/*`
- `useInsights`: bỏ `keepPreviousData` chung, thay bằng placeholder có điều kiện
  **cùng `subjectId`** (queryKey[1]) — đổi hồ sơ thì không giữ dữ liệu cũ.
  `RecentInsightsCard` kiểm thêm `data.subjectId === subjectId` trước khi render.
- Bỏ 4 card chỉ số → một hàng `dl` có đường phân cách; bỏ gradient nền cột;
  giữ: loading/error/empty, ngày thiếu `—` không nội suy 0, nguồn mô phỏng
  (`syntheticDays` hoặc từng `day.source`), notes từ API, disclaimer y tế,
  7/14/30 ngày `aria-pressed`.

### `components/MeasurementChart.tsx` + `.css` + test
- Đổi selector `.chart*` (đang định nghĩa trong `layout.css` do F sở hữu) sang
  `.measure-chart*` để một selector một nguồn; CSS component tự sở hữu.
- Giữ nguyên dữ liệu/trục/lưới/khoảng thiếu/tooltip `<title>`/downsampling
  2.000 điểm/aria-label; thêm nhãn empty state bằng chữ (“Chưa có mẫu nhịp tim
  hợp lệ… không có điểm nào được nội suy”), caption nêu ô vàng = khoảng thiếu,
  hint cuộn chỉ hiện mobile.
- Desktop SVG co 100% khung (không sinh scrollbar thừa khi chữ lớn); mobile
  `min-width: 45rem` (900px ở chữ lớn) nên chữ trục ~14–18px thực tế, cuộn trong
  khung, trang không tràn.

### `styles/health.css` (mới)
Toàn bộ class mới `health-*`, `history-*` cho hai trang; import từ
`DashboardPage`/`HistoryPage` (CSS đi theo lazy chunk). Chỉ dùng token v7.
`PageHeader` được đặt lại bằng grid trong phạm vi `.health-page` (breadcrumb một
hàng, H1 + action cùng hàng; mobile ẩn breadcrumb Hôm nay của overview vì
bottom-nav đã có, để số liệu chính vào viewport đầu).

## 3. Cổng kiểm — kết quả thật

```text
$ pnpm build:contracts
$ tsc -p tsconfig.json                       # exit 0

$ pnpm --filter @heart-iot/web typecheck
$ tsc -p tsconfig.json --noEmit              # exit 0

$ pnpm --filter @heart-iot/web exec vitest run \
    src/features/dashboard/DashboardPage.test.tsx \
    src/features/history/HistoryPage.test.tsx \
    src/features/insights/RecentInsightsCard.test.tsx \
    src/components/MeasurementChart.test.tsx \
    --no-file-parallelism --maxWorkers=1
Test Files  4 passed (4)
     Tests  30 passed (30)                   # exit 0

$ pnpm --filter @heart-iot/web exec vitest run --no-file-parallelism --maxWorkers=1
Test Files  37 passed (37)
     Tests  297 passed (297)                 # exit 0 (baseline 291 + 6 test mới)

$ pnpm --filter @heart-iot/web build
✓ built in 315ms                             # exit 0
```

Không sửa/nới test cũ để qua cổng.

## 4. Test diff

- `components/MeasurementChart.test.tsx`: đổi **một** assertion class
  `chart__scroll` → `measure-chart__scroll` (đổi tên class do chart CSS chuyển
  từ `layout.css` sang `MeasurementChart.css`); thêm test empty state không
  polyline/polygon/circle + câu giải thích.
- `features/dashboard/DashboardPage.test.tsx`: **thêm** 2 test (không sửa test
  cũ): biết trước `canViewMeasurements=false` → không request
  `daily-summary`/`insights`, không link lịch sử, cảnh báo vẫn hiện, `status`
  vẫn được đọc; bước `unavailable`/HR null/pin null → không hiện `0 bước`,
  có câu “chưa đủ dữ liệu”, “Chưa có thông tin pin”, đếm khoảng thiếu.
- `features/history/HistoryPage.test.tsx`: **thêm** 2 test tích hợp `renderApp`:
  `?days=30` chọn sẵn 30 ngày + cửa sổ GET đúng 30 ngày + câu mô phỏng; đổi
  khoảng ghi `?days=7` và Back trả `?days=30` + `aria-pressed` đúng.
- `features/insights/RecentInsightsCard.test.tsx`: **thêm** 1 test đổi hồ sơ khi
  request mới treo → mất ngay số liệu hồ sơ cũ, chỉ còn loading.
- Không xoá assertion nào khác; các test behavior cũ (alerts độc lập, clamp
  sharedFrom, CSV cùng from/to, 60 giây không refetch, 10/50/400, một biến thể
  mobile, ngày thiếu `—`, synthetic) vẫn chạy nguyên.

## 5. Ảnh + số đo (Playwright, Chromium, DPR 1)

`reports/qa/evidence/v7-h/` — **18 PNG** + `metrics.json` (đo tự động):

- 6 viewport: `1280×900`, `390×844`, `360×740`, `1280×900-large`,
  `390×844-large`, `360×740-large` (“large” = `html[data-text-size=large]`,
  root 20px).
- 3 state: `/app/overview` (viewport), `/app/history` (full page),
  `/app/history?days=30` (full page). Tên file
  `<state>-<viewport>.png`.

| Chỉ số | Kết quả (18/18 tổ hợp) |
| --- | --- |
| `scrollWidth ≤ clientWidth` (html + body) | 0 tràn ngang; `overflowX = 0` |
| Đúng 1 H1 | 18/18 (H1 32px desktop, 24px mobile, 40px/30px chữ lớn) |
| Đúng 1 context line | 18/18 — “Theo dõi: Bà Trần Thị An” |
| Target thao tác đứng riêng <44px | **0** trên toàn bộ `a[href]`, `button`, `select`, `summary`, `[role=menuitem]` tại cả 18 tổ hợp |
| Filter khoảng (24h/7d/30d) | mọi nút ≥44×44 (76,9–152,6 × 44; chữ lớn 55) — `filterAllAtLeast44=true` |
| Số liệu chính trong viewport đầu | Giá trị “63 bpm” nằm trọn trong viewport **6/6** state overview (kể cả 360×740 chữ lớn: đỉnh 602, đáy 638; bottom-nav bắt đầu ~660). Cả 3 hàng `dl` chỉ trọn ở desktop/390 thường |
| Chart không tràn trang | 0 tràn; mobile SVG 720px (900px chữ lớn) cuộn trong `.measure-chart__scroll` (client 288–332), desktop 966px = khung |
| Chữ trục chart | tick 11px CSS → cao 14px thực ở 360/390, 16px ở 1280 chữ lớn, 18px ở 390/360 chữ lớn |
| Nhãn mô phỏng | `overview`: pill “Nguồn: dữ liệu mô phỏng” 6/6; `history`: câu “Dữ liệu hiển thị là dữ liệu mô phỏng.” 12/12 |
| CSV (GET bằng cookie phiên) | 12/12 lịch sử: HTTP **200**, `text/csv`, `attachment; filename="subject-…-YYYY-MM-DD-….csv"`, `from/to` **trùng khớp** request measurements; 24h = 30.481 B, 30 ngày = 180.203 B |
| Lỗi console sau đăng nhập | 0/18 (401 `/me` trên trang login là kiểm tra phiên khách, đã reset sau login) |
| Range pressed | `?days=30` → “30 ngày” pressed; history thường → “24 giờ” |

File CSV dùng đúng `from/to` đã clamp: ví dụ 30 ngày
`from=2026-10-18T17:19Z → to=2026-11-17T17:19Z`, khớp request `/measurements`.

## 6. Hành vi giữ / đổi (tóm tắt)

**Giữ**: API client + query key (`features/{dashboard,history,insights}/api.ts`
không đổi), `sharedFrom`/`historyDays`, clamp GET+CSV, 10/50/400 + một nút tải,
một biến thể bảng/danh sách theo breakpoint, cảnh báo độc lập, 403 = quyền,
không refetch mỗi phút, synthetic/coverage/gaps thật từ response, empty không
hiện 0 giả, subject context do shell render.

**Đổi presentation**: bỏ card bọc metric, thêm `dl`/hàng; bảng đổi class
`history-table` (không còn `data-table`); coverage từ `<details>` sang vùng luôn
hiện; trạng thái cảnh báo nằm cùng dòng meta; breadcrumb overview ẩn ở mobile;
action “Lịch sử đo” cùng hàng H1 ở mobile; source/date chuyển xuống footer khối
số liệu; history lọc theo URL `?days=`.

## 7. CSS legacy đã hết call site ở route H — đề nghị F/lead retire

Chỉ route H ngừng dùng (chưa xoá vì `layout.css`/`app-simple.css` thuộc F):
`layout.css` — `.dashboard__header*`, `.dashboard__eyebrow`, `.dashboard__grid`,
`.dashboard__primary/.dashboard__aside`, `.dashboard-section-head*`,
`.dashboard-alerts*`, `.dashboard-empty-note`, `.dashboard-region__*`,
`@keyframes an-spin`, `.metric-line*`, `.metric-grid`, `.metric__label`,
`.metric__value`, `.metric__sub`, `.chart` + `.chart__*`, `.table-wrap`,
`.data-table*`, `.gap-list*`, `.history-toolbar`, `.measurement-cards`,
`.measurement-card*`, `.status-list*`, `.device-status-card*`, các media override
tương ứng; `app-simple.css` — `.dashboard__primary .dashboard-section-head`,
`.insights-card__notice*`, `.history-tech*`, `.chart-hint-mobile`,
`.dashboard-section-head > .pill`, `.dashboard .status-list*`,
`.dashboard .metric-grid`.
**Không** retire `.alert-row*`, `.alert-list*`, `.segmented*` (lane khác còn
dùng) — kiểm lại impact trước khi xoá.

## 8. Chưa kiểm / giới hạn

- Chỉ Chromium headless, **một** tài khoản owner. Trạng thái caregiver thiếu
  quyền số đo, 403, empty, error 500, sharedFrom được kiểm bằng **unit test**,
  chưa chụp browser.
- CSV kiểm bằng `context.request.get` (cookie phiên), không bấm hộp thoại tải
  file thật; `Content-Disposition` đã ghi.
- Chưa kiểm screen reader, Firefox/WebKit, 200% zoom (W4), `prefers-reduced-motion`
  bằng browser (không thêm animation; global CSS đã tắt).
- Tooltip chart là `<title>` của điểm (như trước), chưa chụp hover.
- Chưa chạy Playwright E2E (`e2e/*`). **Lưu ý:** `e2e/history.spec.ts` còn
  selector `table.data-table`; class đã đổi thành `.history-table` nên assertion
  “mobile không có bảng” vẫn pass nhưng không còn kiểm đúng — lane E/lead cập
  nhật nếu giữ check này. `e2e/alerts.spec.ts` dựa vào chữ “← Hôm nay”, “Xem tất
  cả cảnh báo →”, “Xem lịch sử và biểu đồ →”, “Tổng hợp hôm nay” — các chuỗi này
  vẫn còn (link dùng class button ≥44px).
- `.data/w2-h` là PGlite cục bộ (đã gitignore); api/web dev server đã dừng sau
  khi chụp. Log dev nằm ở `reports/qa/evidence/.{api,web}-w2-h.log` (gitignore
  `*.log`).
- Không sửa API/contract/quyền/SSE/query key; không thêm dependency.

## 9. Cách tích hợp

```bash
git -C C:/Users/nguye/orca/workspaces/DATN/v7-h log --oneline -2   # 6734316 + handoff
git -C C:/Users/nguye/orca/workspaces/DATN/v7-h diff cf11c29..HEAD --stat
# merge branch Tung204/v7-h khi lead duyệt; KHÔNG push từ worker
```

Sau merge: chạy lại `pnpm --filter @heart-iot/web build` (CSS chunk mới) và
kiểm nhanh 2 route bằng seed; các block legacy ở §7 có thể xoá trong W3 khi
không còn lane nào dùng.
