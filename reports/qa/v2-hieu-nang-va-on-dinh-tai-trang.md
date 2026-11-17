# Review độc lập v2 — hiệu năng và độ ổn định tải trang (qa-performance)

**Người thực hiện:** reviewer độc lập (phiên `qa-performance`, worktree riêng). Chỉ đọc + chạy kiểm; không sửa code/docs, không commit, không đụng `.data/pglite` của lead hay API 3000 / web 5173.
**Ngày chạy:** 15/11/2026 (Asia/Ho_Chi_Minh).
**HEAD:** `8434d66cb8ecb3d92a9a054f87f843d16dbaa3e7` — `perf(web): tách chunk theo route và thống nhất quyền xem cảnh báo` (nhánh `qa-performance`, worktree `C:/Users/nguye/orca/workspaces/DATN/qa-performance`).
**Nguyên tắc:** không tin số trong `docs/14` hay handoff; mọi con số dưới đây lấy từ lần chạy của tôi trong phiên này. Phần chưa chạy được ghi rõ là **chưa kiểm**, không suy ra "đạt".

---

## 1. Môi trường đo

| Thành phần | Giá trị |
| --- | --- |
| Máy | Windows, Intel Core i9-14900HX (24 core / 32 thread), 31,7 GB RAM |
| Node / pnpm | Node `v24.22.2`, pnpm `12.5.1` |
| Cài dependency | `pnpm install --prefer-offline --frozen-lockfile` → **OK, 16,8 s** (store đã có sẵn) |
| API | instance riêng: `PORT=3201 PGLITE_DATA_DIR=.data/review-perf`, build `nest build` + `node dist/src/main.js` |
| DB | PGlite `0.5.16`, thư mục `.data/review-perf` (seed demo: 1.681 telemetry, 3 incident, 2 hồ sơ) + dữ liệu tổng hợp do tôi chèn: 2.040 `audit_logs`, 30 thiết bị, 200 thông báo |
| Web đo hiệu năng | **bản production build** (`pnpm --filter @annhien/web build`) phục vụ bằng `vite preview --port 4273`, Playwright route-rewrite `/api/**` → `:3201` (cùng origin nên cookie/CSRF hoạt động như thật) |
| Trình duyệt | Playwright `1.65.1`, Chromium `159.0.8154.6` (headless shell 1255) |
| Throttling | CDP `Network.emulateNetworkConditions`: 400 kbps down / 400 kbps up / **400 ms RTT** ("Slow 3G"), `Network.setCacheDisabled`; CDP `Emulation.setCPUThrottlingRate` = **4x** (giả lập máy yếu) hoặc 1x/2x như ghi ở từng mục |

Lệnh chính đã chạy (output thật, không phải đề xuất):

```bash
pnpm install --prefer-offline --frozen-lockfile
pnpm --filter @annhien/contracts build && pnpm --filter @annhien/api build && (cd apps/web && pnpm build)
PGLITE_DATA_DIR=.data/review-perf pnpm --filter @annhien/api seed          # 1.681 telemetry / 1.681 synced
cd apps/api && PORT=3201 WEB_ORIGIN=http://localhost:4273 PGLITE_DATA_DIR=.data/review-perf node dist/src/main.js
cd apps/web && npx vite preview --port 4273 --strictPort
node <script trong reports/qa/scripts/>                                    # xem phụ lục A
```

Build web tại HEAD: **PASS**, `✓ 256 modules transformed`, không còn cảnh báo chunk > 500 kB.

| Chunk | decoded | gzip/transfer |
| --- | --- | --- |
| `index-DxULU1N-.js` (entry) | 264,55 kB | 81,25 kB |
| `ErrorState-DTvOLCOr.js` (vendor dùng chung, **modulepreload ngay**) | 230,68 kB | 70,63 kB |
| `index-BwZuFFxD.css` | 56,53 kB | 9,08 kB |
| Route chunk lớn nhất (`AdminPage`) | 20,61 kB | 6,33 kB |
| Còn lại (14 route chunk) | 0,32–16,04 kB | — |
| Font phát hành kèm `dist` | 18 × `.woff2` = 272,1 kB **+ 18 × `.woff` = 237,6 kB** | — |

**Lần tải đầu (landing, mobile 390×844, slow 3G + 4x CPU):** 4 request, **157,1 kB** transfer, JS entry + vendor = 147,5 kB.

---

## 2. Phạm vi: đã kiểm / chưa kiểm

**Đã kiểm (có số đo):**
- Bundle/chunk sau code-split; thành phần chunk dùng chung; cache header của asset; nén gzip.
- Cold load landing + login → dashboard trên slow 3G + 4x CPU: FCP, LCP, CLS, long task, waterfall request.
- Trang lịch sử với **1.681 dòng** (7 ngày, 4 trang × 500): thời gian render, DOM, heap, long task, "Hiện thêm 20 dòng", "Hiện tất cả".
- A/B tác động của `Intl.DateTimeFormat` (cache vs tạo mới) lên thời gian render 1.681 dòng.
- Trang Quản trị → Audit với **2.040 dòng** (limit 20/trang, phân trang cursor).
- Font: 18 `@font-face`, 16 file woff2 tải trong một lần vào dashboard, A/B chặn woff2.
- API: latency p50/p95 18 endpoint chính (15 mẫu warm) + SSE handshake + login.
- N+1: A/B cùng process (31 thiết bị → 1 thiết bị) cho `/subjects/:id/status` và `/subjects/:id/devices`.
- SSE reconnect: chặn 2 lần kết nối đầu, đo khoảng cách retry.
- Console error/warning khi đi qua 10 route; tràn ngang ở 390×844 và 360×740 + chế độ chữ lớn.

**Chưa kiểm (không được coi là đạt):**
- Mạng di động/4G thật, HTTP/2, CDN, service worker/PWA. Throttling là CDP, không phải mạng thật.
- Máy yếu thật (chỉ giả lập bằng CPU 4x); không đo pin/nhiệt.
- PostgreSQL thật, nhiều instance, connection pool; PGlite một tiến trình nên mọi số API là **cận dưới**.
- Load test đồng thời (k6/artillery), memory leak theo thời gian dài, INP field data (chỉ lab).
- Firefox/Safari; Web Push; export CSV lớn hơn 7 ngày; dữ liệu 30 ngày thật (demo chỉ có 6 ngày).
- Chất lượng cảm nhận với người cao tuổi (ngoài phạm vi phiên này).

---

## 3. Tổng hợp

**P0: 0. P1: 4. P2: 8.** Không có lỗi chức năng chặn demo trong phạm vi hiệu năng; rủi ro chính là **tải trang đầu trên mạng chậm**, **render danh sách dài**, và **dữ liệu lịch sử bị nạp lại mỗi phút**.

| # | Mức | Tóm tắt | Bằng chứng chính |
| --- | --- | --- | --- |
| P1-1 | P1 | Lịch sử tự reset về trang 1 và refetch mỗi 60 giây | 1.681 → 500 dòng sau 76 s; thêm 1 request `/measurements` |
| P1-2 | P1 | "Hiện tất cả 1.681 dòng" khoá main thread 11,6 s (mobile 4x CPU); mỗi lần "Hiện thêm 20 dòng" 0,4–1,0 s | long task 11.573 ms; DOM 41.947; A/B Intl giảm còn 5.783 ms |
| P1-3 | P1 | Font chiếm 61% bytes một lần tải dashboard (256,6/423,3 kB, 16 file) | font xong ở giây 12,9; chặn font → data sớm hơn 761 ms |
| P1-4 | P1 | Cold start slow 3G: 5,6 s trắng trước FCP; 5,6 s từ login tới dữ liệu, trong đó 4,2 s chỉ có spinner | FCP=LCP 5.600 ms; LCP dashboard 7.004 ms |
| P2-1 | P2 | N+1 ở `loadSubjectDevices` (status + devices) | 30 thiết bị: p50 51,9 ms vs 10,1 ms; payload 10,9 vs 0,7 kB |
| P2-2 | P2 | Outbox worker N+1 (4–5 query/dòng, batch 20) | code + đếm query theo dòng |
| P2-3 | P2 | Studio N+1 khi liệt kê view/publication | `studio.service.ts:468`, `:867` |
| P2-4 | P2 | Asset có hash bị `Cache-Control: no-cache` (vite preview) → revalidate mỗi lần vào | 300 B/asset, 422–508 ms/asset trên slow 3G |
| P2-5 | P2 | Vendor nằm trong chunk tên `ErrorState`, preload ngay từ landing; không có `manualChunks` | 147,5 kB JS trước khi đăng nhập |
| P2-6 | P2 | SSE mất kết nối nhưng UI không có chỉ báo | retry 1.011/2.019 ms, không banner |
| P2-7 | P2 | Biểu đồ tính lại toàn bộ điểm mỗi render + `Math.min(...values)` | `MeasurementChart.tsx:22-30`, 1.549 điểm |
| P2-8 | P2 (thấp) | 401 "hợp lệ" của `/me` ghi `console error` trên trang công khai | console landing/login |

---

## 4. Findings P1

### P1-1. Trang lịch sử tự nạp lại từ trang 1 mỗi 60 giây, mất dữ liệu đã tải

- **Vị trí:** `apps/web/src/features/history/HistoryPage.tsx:56-58` (`setNow(Date.now())` mỗi 60 s; thêm `:61` set lại khi đổi khoảng) → `:67-70` (`from`/`to` tính từ `now`) → `:78` (`queryKey` chứa `from`,`to`).
- **Kịch bản tái hiện** (`reports/qa/scripts/v2-fe-history-1681.mjs`, phần `minuteTick`):
  1. Đăng nhập chủ hồ sơ → `/app/history` → chọn **7 ngày**.
  2. Bấm "Tải thêm từ máy chủ" 3 lần → caption `Đang hiển thị 20/1681 dòng` (đúng 4 trang × 500/500/500/181).
  3. Để nguyên tab, chờ 76 s.
- **Expected:** danh sách đã tải giữ nguyên 1.681 dòng; nếu cần dữ liệu mới thì chỉ refetch đúng khoảng đang xem.
- **Actual:** caption quay về `Đang hiển thị 20/500 dòng`; `/measurements` được gọi lại (tổng request 8 → 9, lần mới ở **giây thứ 56** của cửa sổ chờ). Vì `useInfiniteQuery` đổi `queryKey`, toàn bộ `pages` bị bỏ.
- **Hệ quả:** người dùng đang đọc lịch sử bị đẩy về 500 dòng đầu; mất ngữ cảnh cuộn; **112,7 kB refetch mỗi phút cho mỗi tab đang mở** (đo: 1 trang 7 ngày = 112,7 kB, 4 trang = 379,5 kB); mỗi lần reset còn re-render bảng + biểu đồ.
- **Ghi chú đối chiếu, không đóng finding cũ:** đây là hệ quả của cách sửa P2-3 trong `reports/qa/review-frontend-2026-11-14.md` (mốc `now` bị đóng băng). Tôi chỉ báo cáo hệ quả mới; việc chấp nhận/đóng thuộc reviewer cũ và lead.
- **Đề xuất (chi phí thấp, ~15 dòng):** giữ `from`/`to` ổn định theo `rangeKey` (làm tròn mốc xuống 5 phút, lấy một lần khi đổi range), dùng `refetchInterval`/`refetchOnWindowFocus` thay vì đổi `queryKey`. Lợi: hết mất trạng thái + hết refetch chu kỳ; không đổi contract API.

### P1-2. Danh sách dài: khoá main thread 11,6 s khi "Hiện tất cả", 0,4–1,0 s mỗi lần "Hiện thêm 20 dòng"

- **Vị trí:**
  - `HistoryPage.tsx:235` (bảng `visibleItems.map`) **và** `:266` (danh sách thẻ `.measurement-card`) **luôn render đồng thời**; CSS ẩn một bên (`table-wrap--history { display:none }` ở 390 px, `.measurement-cards { display:none }` ở 1280 px).
  - `apps/web/src/lib/format.ts:11, 22, 35, 46, 52` — mỗi ô gọi `new Intl.DateTimeFormat(...)`.
  - `apps/web/src/components/MeasurementChart.tsx:22-30` (`Math.min(...values)` trên toàn mảng) và `:60-72` (dựng `linePoints` cho toàn bộ điểm mỗi render; `useMemo` ở `:46` phụ thuộc `points` mà `points` là mảng mới tạo mỗi render ở `HistoryPage.tsx:113-124`).
- **Số đo 1 — "Hiện tất cả 1.681 dòng":**

  | Điều kiện | long task | tới frame kế tiếp | DOM node | heap |
  | --- | --- | --- | --- | --- |
  | Desktop 1280×900, không throttle | 716 ms | 800 ms | 41.949 | 10,8 → 16,9 MB (**+6,1**) |
  | Mobile 390×844, CPU 4x | **11.573 ms** | 12.267 ms | 41.947 | 19,4 MB |
  | Mobile 390×844, CPU 4x, **cache `Intl.DateTimeFormat`** | 5.783 ms | 5.968 ms | 41.947 | 19,4 MB |

  A/B ở dòng 2 và 3 chỉ khác một thứ (patch `Intl.DateTimeFormat` memoize bằng `addInitScript`, không sửa code): **giảm 5.790 ms (−50%)**. Benchmark riêng trên V8 (3.362 lần format, `reports/qa/scripts/v2-intl-benchmark.mjs`): tạo mới **174,2 ms** vs tái sử dụng **2,5 ms** (~52 µs/lần).
- **Số đo 2 — tương tác lặp:** 10 lần bấm "Hiện thêm 20 dòng" trên danh sách 287 dòng (mobile, không throttle, CPU 4x): 413 / 510 / 583 / 728 / 687 / 810 / 724 / 807 / 995 / 983 ms; bản ghi Event Timing dài nhất **784 ms**. Ngưỡng INP "good" là 200 ms ⇒ vượt 3–5 lần ngay ở 287 dòng.
- **Expected (docs/06 + NFR-04 "dễ thao tác"):** thao tác thêm dòng phản hồi dưới ~200 ms; không có long task > 500 ms khi chỉ hiển thị dữ liệu đã tải.
- **Actual:** mỗi lần tăng 20 dòng phải render lại **cả bảng và cả danh sách thẻ** cho toàn bộ `items`, cộng dựng lại biểu đồ; "Hiện tất cả" tạo 3.362 dòng (1.681 bảng + 1.681 thẻ) và ~42.000 node.
- **Đề xuất theo thứ tự lợi ích/chi phí:**
  1. Cache formatter ở module scope trong `lib/format.ts` (~5 dòng) → **đo được −50%** thời gian ở bài test trên.
  2. Chỉ render một biến thể theo breakpoint (`matchMedia('(max-width: 720px)')`) thay vì render cả hai rồi ẩn bằng CSS (~20 dòng) → giảm ~50% node/DOM work.
  3. Bỏ hoặc giới hạn nút "Hiện tất cả" (ví dụ tối đa 200 dòng + tải thêm), hoặc ảo hoá danh sách (~60–100 dòng) → loại bỏ hẳn long task 10 s.
  4. Memo biểu đồ theo `items` (không theo mảng mới) + thay `Math.min(...values)` bằng `reduce` (P2-7).
- **Rủi ro nếu không sửa:** trên điện thoại tầm trung, bấm "Hiện tất cả" treo UI ~10 s (nguy cơ người dùng tưởng app hỏng, bấm lại nhiều lần).

### P1-3. Font chiếm 61% bytes và tranh băng thông với API ở lần tải dashboard

- **Vị trí:** `apps/web/src/main.tsx:1-6` import 6 file weight (`be-vietnam-pro` 400/500/600/700, `newsreader` 600/700) → CSS bundle có **18 `@font-face`** (3 subset `vietnamese`/`latin-ext`/`latin` × 6 weight), tất cả `font-display: swap`.
- **Số đo (mobile 390×844, slow 3G + 4x CPU, login → dashboard):** tổng **423,3 kB / 29 request**, trong đó **font: 16 file, 256,6 kB (61%)**; file font đầu bắt đầu ở 4,8 s và file cuối kết thúc ở **12,9 s** — tức là font vẫn đang chiếm băng thông khi `/subjects` (9,0 s) và `/status` (12,2 s) đang chạy. A/B chặn `*.woff2`: dữ liệu tổng quan xuất hiện sau **5.115 ms** thay vì **5.876 ms** (**−761 ms**; 1 lần đo mỗi bên, cùng điều kiện).
- **Expected:** font chỉ nên là phần nhỏ của bytes lần đầu và không chặn đường dữ liệu.
- **Actual:** 6 weight × 3 subset; ngoài ra `dist` còn **237,6 kB `.woff` (legacy) không bao giờ được trình duyệt hiện đại tải**.
- **Đề xuất:**
  - Chỉ import 2 weight (400 + 600) cho `be-vietnam-pro`, bỏ `newsreader/700` → **−~94 kB** woff2 (đo theo kích thước file: 500 = 46,5 kB + 700 = 47,3 kB).
  - Hoặc dùng `@fontsource-variable/be-vietnam-pro` (1 file/subset) → ước tính −150…−200 kB; cần kiểm lại rendering tiêu đề.
  - Thêm `<link rel="preload" as="font" crossorigin>` cho đúng 1–2 file woff2 mà màn hình đầu dùng (400 latin + vietnamese) để tránh FOUT rồi swap muộn.
  - Loại `.woff` khỏi bundle (hoặc cấu hình chỉ phát woff2) → giảm 237,6 kB kích thước triển khai.
- **Lưu ý:** đổi weight/font ảnh hưởng giao diện đã được duyệt ở docs/06 ⇒ cần preview trước khi áp dụng (theo AGENTS.md).

### P1-4. Cold start trên slow 3G: 5,6 s màn hình trắng; 5,6 s từ đăng nhập tới dữ liệu tổng quan

- **Vị trí:** `apps/web/index.html:1-19` (chỉ có `<div id="root">`, không shell/inline CSS), `apps/web/src/app/router.tsx:14-46` (lazy route + `Suspense`), `ProtectedRoute.tsx` + `AppShell.tsx` (query `/me` → `useSubjects` → query trang) tạo chuỗi phụ thuộc tuần tự.
- **Số đo (slow 3G + 4x CPU):**

  | Mốc | Giá trị |
  | --- | --- |
  | Landing: FCP = LCP | **5.600 ms** (trước đó là màn hình trắng; `DOMContentLoaded` 4.487 ms) |
  | Landing: long task | 395 ms và 212 ms |
  | Login → dữ liệu tổng quan hiện | **5.566 ms** |
  | Dashboard: FCP / LCP | 4.900 / **7.004 ms** |
  | Chỉ có spinner trước khi tiêu đề trang tổng quan render (đo từ lúc khung ứng dụng đã có nav "Tổng quan") | **4.241 ms** |
  | Waterfall | entry JS 3,6 s → route chunk `DashboardPage`+3 chunk phụ 2,1–2,7 s → `/me` 502 ms → `/subjects` 564 ms → `/status` 487 ms (**3 RTT tuần tự sau khi JS xong**) |
  | Console | 1 lỗi 401 của `/me` khi chưa đăng nhập (hợp lệ về nghiệp vụ) |

- **Expected:** trên 3G, FCP nên có nội dung khung trong ~1–2 s; dữ liệu tổng quan nên bắt đầu tải ngay khi biết phiên, không phải sau 3 vòng round-trip.
- **Actual:** toàn bộ khung UI phụ thuộc JS (entry + vendor 147,5 kB) rồi mới tới chunk route; sau đó `me` → `subjects` → `status` chạy tuần tự vì `status` cần `subjectId`.
- **Đề xuất:**
  1. Đưa shell tĩnh (header + skeleton tổng quan + "Dữ liệu mô phỏng") vào `index.html` cùng ~1 kB CSS critical → FCP dưới 1 s, không cần đổi React.
  2. Sau khi submit login, `import('../features/dashboard/DashboardPage')` song song với `POST /auth/login` → tiết kiệm ~2 s trên 3G (chunk tải trong lúc chờ API).
  3. Giảm 1 RTT: trả `activeSubjectId` (hoặc danh sách hồ sơ rút gọn) trong `GET /me`, hoặc cho `AppShell` đọc `localStorage` của lần dùng trước để bắn `/status` sớm — cần chốt contract (`packages/contracts`), không nên tự đổi.
  4. Giảm font (P1-3) để nhường băng thông cho API.
- **Ghi chú:** trên LAN (không throttle) trang lịch sử có LCP 688 ms và cả 10 route sau đăng nhập render có tiêu đề trang, không lỗi console ⇒ vấn đề chính xuất hiện ở mạng chậm. Đây là kịch bản cần nêu nếu demo ngoài LAN hoặc qua hotspot.

---

## 5. Findings P2

### P2-1. N+1 ở `loadSubjectDevices` (dashboard `status` và danh sách thiết bị)
- **Vị trí:** `apps/api/src/devices/devices.service.ts:304-320` — 1 query lấy danh sách thiết bị, rồi `for (const row of rows)` (`:314`) gọi `await this.loadLastTelemetry(...)` (`:315`, định nghĩa `:322`) ⇒ **1 + N query**.
- **A/B cùng process** (`reports/qa/scripts/v2-api-devices-n1.mjs`, 20 mẫu warm):

  | Endpoint | 30 thiết bị | 1 thiết bị | Chênh |
  | --- | --- | --- | --- |
  | `GET /subjects/:id/status` | p50 **51,9 ms**, 10,9 kB | p50 **10,1 ms**, 0,7 kB | +41,8 ms / +10,2 kB |
  | `GET /subjects/:id/devices` | p50 **41,1 ms** | p50 **8,6 ms** | +32,5 ms |

  Chi phí biên ≈ **1,4 ms/thiết bị** trên PGlite (in-process). Trên PostgreSQL qua mạng, mỗi thiết bị thêm 1 round-trip thật ⇒ tệ hơn nhiều.
- **Expected:** số query không phụ thuộc số thiết bị.
- **Đề xuất:** một query `LEFT JOIN LATERAL`/`DISTINCT ON (assignment_id)` lấy telemetry mới nhất cho toàn bộ assignment của hồ sơ (~10 dòng SQL). Lợi: bỏ N+1, payload vẫn như cũ. Hiện tại mỗi hồ sơ demo có 1–2 thiết bị nên ưu tiên thấp.

### P2-2. Outbox worker N+1 mỗi dòng (chỉ đường ghi, không ảnh hưởng latency HTTP)
- **Vị trí:** `apps/api/src/notifications/notifications.service.ts:65-140` — mỗi dòng trong batch 20: `select incident` + `recipientAllowed(...)` + `update status` + `insert realtime_events` (+ `deliverInApp`) ⇒ ~4–5 query/dòng, **~80–100 query mỗi 5 giây** khi outbox dồn (mất mạng dài, nhiều người nhận).
- **Đo được:** `GET /notifications` (caregiver, 200 bản ghi) p50 **6,7 ms** — đường đọc đã join sẵn, **không** N+1. Vì vậy đây chỉ là nợ kỹ thuật ở worker.
- **Đề xuất:** join sẵn `incidents` + `care_links` trong 1 query batch, chỉ `update` theo `id IN (...)`. Đo lại bằng cách bơm 200 outbox `pending` và bật log thời gian xử lý batch.

### P2-3. Studio N+1 khi liệt kê view/publication
- **Vị trí:** `apps/api/src/studio/studio.service.ts:468` (`items.push(await this.buildViewSummary(...))` trong `for`) và `:867` (`toPublicationSummary` trong `for`).
- **Đo được:** `GET /workspace-views` p50 **14,1 ms** với **0 bản ghi** (DB seed không có view) ⇒ **chưa có bằng chứng định lượng**; nêu để tránh "đạt" khi chưa kiểm ở dữ liệu thật.
- **Đề xuất:** khi có dữ liệu, đo với 20–50 view; gom query publication theo `InArray`.

### P2-4. Asset có hash bị `Cache-Control: no-cache` (đường phục vụ đã tài liệu hoá)
- **Bằng chứng:** `curl -sI http://localhost:4273/assets/index-DxULU1N-.js` → `Cache-Control: no-cache`; GET có `Content-Encoding: gzip` (tốt). Lần vào lại (cache bật, slow 3G): cả 3 asset đều **revalidate**, mỗi asset 300 B nhưng **422–508 ms** (1 RTT); warm FCP **1.308 ms** so với cold 5.600 ms.
- **Expected:** asset có content hash → `Cache-Control: public, max-age=31536000, immutable` để bỏ hẳn revalidate.
- **Actual:** `vite preview` (đường đã dùng cho kiểm E2E trên bản build — `reports/handoffs/wave2-fe-features.md:122`; script `apps/web/package.json:9`) trả `no-cache`; nếu deploy thật mà copy cấu hình này thì mỗi lần vào lại mất thêm ~0,4–0,8 s trên 3G. README/docs chưa có mẫu header cho bản deploy.
- **Đề xuất:** ghi rõ trong README rằng preview không đại diện cache production; thêm mẫu header (nginx/express) trong `docs/14` hoặc `infra/`.

### P2-5. Chia chunk: vendor nằm trong chunk tên `ErrorState`, preload ngay từ landing
- **Bằng chứng:** `dist/index.html` có `<link rel="modulepreload" href="/assets/ErrorState-DTvOLCOr.js">`; chunk 230,68 kB này chứa `zod` (325 tham chiếu), `react-router`, `@tanstack/react-query` (không phải component `ErrorState`). Entry `index-*.js` 264,55 kB. Tổng JS lần đầu **147,5 kB transfer** dù người chưa đăng nhập chỉ cần landing.
- **Đánh giá:** ngưỡng "chunk > 500 kB" đã hết (chunk lớn nhất 264,55 kB) — tôi **ghi nhận**, không đóng P2-4 của review trước; nhưng lợi ích thật của code-split lần này là **route sau đăng nhập**, không phải trang công khai.
- **Đề xuất:** `build.rollupOptions.output.manualChunks` cho `react`, `react-router`, `@tanstack`, `zod` → chunk vendor ổn định giữa các lần deploy (cache hit dài hạn); đặt tên theo nhóm thay vì tên component ngẫu nhiên.

### P2-6. Mất SSE không có chỉ báo cho người dùng
- **Vị trí:** `apps/web/src/features/realtime/useSubjectEvents.ts:100-102` (backoff 1 s → 2 s → … → 30 s) nhưng `apps/web/src/app/AppShell.tsx:102` **bỏ qua** giá trị `{ status, retryAttempt }` mà hook trả về.
- **Đo được:** chặn 2 lần kết nối `/subjects/:id/events` → các lần thử lại cách nhau **1.011 ms** rồi **2.019 ms** (đúng công thức), lần 3 mở thành công; DOM không có banner/`role="status"` nào về kết nối realtime (chỉ có khối "Giới hạn của bản demo" tĩnh).
- **Hệ quả:** khi mạng chập chờn, cảnh báo mới không tự cập nhật nhưng giao diện trông vẫn bình thường — trái tinh thần docs/06 ("mất mạng/offline phải có nhãn").
- **Đề xuất:** hiện chip "Đang kết nối lại…" khi `retryAttempt ≥ 1` hoặc `status === 'closed'` kèm mốc sự kiện cuối; ~10 dòng, dùng đúng state hook đã có.

### P2-7. Biểu đồ tính lại toàn bộ điểm mỗi render + spread số lượng lớn
- **Vị trí:** `apps/web/src/components/MeasurementChart.tsx:22-30` (`Math.min(...values)` / `Math.max(...values)` trên mảng toàn bộ điểm) và `:46` (`useMemo` phụ thuộc `points` nhưng `points` được tạo mới mỗi render ở `HistoryPage.tsx:113-124`), `:60-72` dựng chuỗi `linePoints` mỗi render.
- **Đo được:** 7 ngày = **1.549 điểm** trong 1 `<polyline>` (tốt, không vẽ từng `circle`); 30 ngày × 288 mẫu/ngày ≈ 8.640 điểm → mỗi lần render parse 8.640 `Date` + dựng chuỗi ~100 kB. Với 100.000+ điểm, spread sẽ `RangeError: Maximum call stack size exceeded`.
- **Đề xuất:** `useMemo` cho `bounds` + `linePoints` theo `items` gốc; thay spread bằng vòng `reduce`; nếu mở 30 ngày, downsample xuống ≤ 2.000 điểm để vẽ.

### P2-8 (thấp). 401 hợp lệ của `/me` ghi `console error` trên trang công khai
- **Bằng chứng:** landing và `/login` đều có `error: Failed to load resource: the server responded with a status of 401 (Unauthorized)` khi kiểm phiên; quét 10 route sau đăng nhập **không** còn lỗi/cảnh báo console nào khác.
- **Đề xuất:** chấp nhận và ghi chú, hoặc chỉ gọi `/me` khi có dấu hiệu đã đăng nhập (ví dụ cờ `localStorage`) để console sạch khi rà lỗi.

---

## 6. Phần đã đo và **không** thấy vấn đề (không phải "đạt" cho toàn hệ thống)

| Hạng mục | Số đo | Nhận xét |
| --- | --- | --- |
| CLS landing (mobile, slow 3G) | **0** | tốt |
| CLS dashboard (mobile, slow 3G) | **0,0654**; (desktop 1280, slow 3G: **0,0105**, shift lớn nhất 0,022 khi dữ liệu về) | dưới ngưỡng tốt 0,1, nhưng mobile chỉ còn ~35% dư địa |
| CLS trang lịch sử khi data về | **0** (loader chiếm chỗ sẵn) | tốt |
| Tràn ngang 390×844 và 360×740 (kể cả `data-text-size="large"`, root 20 px) | `scrollWidth == clientWidth` ở dashboard và lịch sử | tốt; `svg` biểu đồ rộng 656 px nằm trong khung cuộn ngang **có chủ đích** (docs/06) |
| Console trên 10 route | chỉ 401 của `/me` | tốt |
| Chunk lớn nhất | 264,55 kB (ngưỡng cảnh báo 500 kB) | tốt ở mức "không còn cảnh báo build" |
| API p95 các endpoint chính (PGlite, 15 mẫu/endpoint, DB có 2.040 audit + 31 thiết bị) | `/me` 4,6 · `/subjects` 9,7 · `/status` 70,1 · measurements 24h 60,9 · 7d 88,5 · export.csv 7d 105,3 · `/alerts` 9,7 · `/notifications` 12,3 · assistant summary 114,5 · `/admin/audit` 15,9 ms | đều < 250 ms; export CSV 176 kB và assistant summary là hai endpoint nặng nhất |
| Phân trang audit 2.040 dòng | 20 dòng/trang, "Tải thêm" 76–80 ms/trang (đo tới frame) | tốt; cursor + API p50 11,2 ms |
| SSE handshake | 12–34 ms tới chunk đầu tiên (`id: 1 / alert.updated`) | tốt |
| Lazy route + `AppErrorBoundary` | 14 route chunk 0,32–20,61 kB; cả 10 route sau đăng nhập render có tiêu đề trang, không lỗi console | tốt (không đo thời gian điều hướng riêng trong phiên này) |

Số API đầy đủ (chạy 2 lần: trước và sau khi chèn dữ liệu tổng hợp) nằm trong output của `reports/qa/scripts/v2-api-latency.mjs`; bảng trên lấy lần chạy sau (trạng thái nặng hơn).

---

## 7. Thứ tự đề xuất (lợi ích / chi phí)

| Ưu tiên | Việc | Chi phí | Lợi ích đo được/ước tính |
| --- | --- | --- | --- |
| 1 | Cache `Intl.DateTimeFormat` trong `lib/format.ts` (P1-2.1) | ~5 dòng | −50% thời gian render 1.681 dòng (đo), −~170 ms desktop |
| 2 | Chỉ render một biến thể bảng/thẻ (P1-2.2) | ~20 dòng | −50% DOM node, giảm long task |
| 3 | Giữ `from`/`to` ổn định, bỏ reset mỗi phút (P1-1) | ~15 dòng | hết mất dữ liệu + −112,7 kB/phút/tab |
| 4 | Giảm font còn 2 weight + bỏ `newsreader/700` (P1-3) | 1–2 dòng import | −~94 kB woff2, ~−0,7 s dữ liệu trên 3G (đo bằng A/B chặn font) |
| 5 | Shell tĩnh + skeleton trong `index.html` (P1-4.1) | ~30 dòng HTML/CSS | FCP từ 5,6 s → mục tiêu < 1 s trên 3G |
| 6 | Prefetch chunk trang đích khi submit login (P1-4.2) | 1 dòng | ~−2 s trên 3G |
| 7 | Giới hạn/ảo hoá "Hiện tất cả" (P1-2.3) | 60–100 dòng | loại bỏ long task 10 s trên mobile |
| 8 | `manualChunks` vendor (P2-5) | ~10 dòng config | cache hit giữa deploy, không giảm bytes lần đầu |
| 9 | Banner trạng thái SSE (P2-6) | ~10 dòng | tránh hiểu nhầm dữ liệu realtime còn sống |
| 10 | Sửa N+1 `loadSubjectDevices`, outbox, studio (P2-1/2/3) | 10–40 dòng/SQL | bỏ 1,4 ms/thiết bị; giảm ~80 query/5 s ở worker |
| 11 | Header cache immutable + mẫu deploy (P2-4) | tài liệu + config | −0,4…0,8 s mỗi lần vào lại trên 3G |

---

## 8. Phụ lục A — script tái lập (trong `reports/qa/scripts/`)

| File | Việc nó đo | Cách chạy |
| --- | --- | --- |
| `v2-api-latency.mjs` | p50/p95 18 endpoint + login + SSE handshake | `node reports/qa/scripts/v2-api-latency.mjs` (cần API ở `:3201`, seed demo) |
| `v2-api-devices-n1.mjs` | A/B N+1 khi 30 thiết bị → 1 thiết bị | như trên, DB có 30 thiết bị `PERF-*` (xem `v2-bulk-data.mjs`) |
| `v2-bulk-data.mjs` | chèn 2.040 audit, 30 thiết bị + assignment, 200 thông báo | chạy **khi API đã dừng** (PGlite độc quyền), `QADIR=<repo>/.data/review-perf`, cwd `apps/api` |
| `v2-fe-landing-dashboard.mjs` | landing + login→dashboard, slow 3G + 4x CPU, LCP/CLS/long task/waterfall | `cd apps/web && node --input-type=module -e "$(cat ../../reports/qa/scripts/v2-fe-landing-dashboard.mjs)"` (preview `:4273`, API `:3201`) |
| `v2-fe-history-1681.mjs` | 7 ngày 4 trang → "Hiện tất cả 1.681 dòng" + test reset sau 60 s | như trên |
| `v2-fe-intl-ab.mjs` | A/B cache `Intl.DateTimeFormat` trên mobile 4x CPU | như trên |
| `v2-fe-sse-fonts.mjs` | SSE retry + "Hiện tất cả" trên mobile 4x CPU + A/B font | như trên |
| `v2-intl-benchmark.mjs` | micro-benchmark tạo mới vs tái sử dụng `Intl.DateTimeFormat` | `node reports/qa/scripts/v2-intl-benchmark.mjs` |

Các script dùng `route.continue({url})` để chuyển `/api/**` của `:4273` sang API riêng `:3201` (giữ cookie same-origin). API phải chạy với `WEB_ORIGIN=http://localhost:4273` nếu không sẽ bị chặn CSRF origin (đúng thiết kế).

## 9. Phụ lục B — ghi chú môi trường

- PGlite mở file DB độc quyền: mọi thao tác chèn dữ liệu phải dừng API trước; đã dừng và khởi động lại API 3 lần trong phiên này.
- `apps/api` phải `nest build` rồi `node dist/src/main.js`; chạy `node` trước khi build xong sẽ lỗi `Cannot find module .../dist/src/main.js`.
- Không đụng `.data/pglite` của lead, không chạy seed trên DB đó, không dùng port 3000/5173 cho mục đích ghi.

---

## 10. Tóm tắt 5 dòng

1. Đã đo trên HEAD `8434d66` bằng production build phục vụ ở `:4273` + API riêng `:3201`/PGlite `.data/review-perf`, Chromium 159 qua Playwright 1.65.1, throttle 400 kbps/400 ms RTT và CPU 4x, kèm A/B trong cùng process.
2. Bốn P1: lịch sử tự reset và refetch 112,7 kB mỗi 60 s; "Hiện tất cả 1.681 dòng" khoá main thread 11,6 s trên mobile (A/B cache `Intl.DateTimeFormat` giảm 50%); font chiếm 256,6/423,3 kB (61%) một lần tải dashboard; cold start 5,6 s trắng và 5,6 s từ login tới dữ liệu do waterfall `/me`→`/subjects`→`/status`.
3. Tám P2 gồm N+1 ở `loadSubjectDevices` (30 thiết bị: 51,9 ms vs 10,1 ms), N+1 worker outbox/studio, `Cache-Control: no-cache` cho asset có hash, vendor nằm trong chunk `ErrorState`, SSE mất kết nối không có chỉ báo, biểu đồ tính lại mỗi render, và tiếng ồn 401 trên trang công khai.
4. Các mặt tốt đã đo: CLS 0 ở landing và lịch sử, 0,065 ở dashboard 3G; không tràn ngang ở 390/360 px kể cả chữ lớn (root 20 px); không còn chunk > 500 kB; API p95 các endpoint chính < 250 ms trên PGlite; audit 2.040 dòng phân trang 76–80 ms/trang.
5. Chưa kiểm: mạng di động thật, máy yếu thật, PostgreSQL/multi-instance, load test đồng thời, Firefox/Safari, Web Push, dữ liệu 30 ngày thật — không được coi các phần này là đạt; thứ tự sửa đề xuất nằm ở mục 7, bắt đầu bằng cache `Intl` (5 dòng) và chỉ render một biến thể danh sách.
