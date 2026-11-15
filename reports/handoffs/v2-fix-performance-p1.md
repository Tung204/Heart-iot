# Handoff — fix-performance-p1 (P1-1..P1-4, P2-7)

- **Thời điểm:** 2026-11-15 08:04 (Asia/Ho_Chi_Minh)
- **Worker:** Orca worker `fix-performance-p1` (task `task_070d1997030a`)
- **Nhánh / commit code:** `fix-performance-p1` @ **`74a9e68`**
  (`perf(web): ổn định cửa sổ lịch sử, giới hạn 400 dòng, giảm font và thêm khung tải`)
- **Nguồn finding:** `reports/qa/v2-hieu-nang-va-on-dinh-tai-trang.md` — P1-1, P1-2, P1-3, P1-4,
  P2-7; P2-8 kiểm tra phạm vi.
- **Phạm vi đã sửa:** `apps/web/src/features/history/**`,
  `apps/web/src/components/MeasurementChart.tsx`, `apps/web/src/lib/format.ts` (+ test),
  `apps/web/src/main.tsx`, `apps/web/src/styles/base.css`, `apps/web/src/styles/fonts.css` (mới),
  `apps/web/index.html`, `apps/web/e2e/history.spec.ts` (mới).
  **Không sửa** API, `packages/contracts`, `app/router.tsx`, `AppShell.tsx`, `styles/layout.css`,
  `vite.config.ts`, `playwright.config.ts`, package.json/lockfile.

## 1. Đã làm

### P1-1 — lịch sử không còn reset/refetch mỗi 60 giây

`features/history/HistoryPage.tsx`

- Tách hai khái niệm:
  - `rangeAnchor` (mốc cửa sổ dữ liệu) chỉ đổi khi **người dùng chọn khoảng khác** hoặc bấm
    **“Cập nhật khoảng”**. `from`/`to` và `queryKey` ổn định theo mốc này.
  - `now` cập nhật mỗi 60 giây chỉ dùng cho **nhãn/gợi ý** (hiển thị reason khi nút khoảng bị
    disable theo `sharedFrom`), không tham gia queryKey.
- Thêm nút **“Cập nhật khoảng”** + dòng ghi rõ “Cửa sổ dữ liệu kết thúc lúc … — trang không tự
  tải lại để giữ nguyên các trang bạn đã mở”.
- `useInfiniteQuery`: bỏ refetch định kỳ (không có `refetchInterval`) và đặt
  `refetchOnWindowFocus: false` cho query lịch sử — tránh tải lại cả 4 trang (≈380 kB) khi quay
  lại tab. Người dùng chủ động cập nhật.
- Hệ quả: không còn request `/measurements` mỗi phút và các `pages` đã tải không bị bỏ.

### P1-2 — danh sách dài có trần, không render hai biến thể

- **Trần hiển thị 400 dòng**, bước **50 dòng/lần** (`VISIBLE_STEP`, `MAX_VISIBLE_ROWS`).
  Bỏ nút “Hiện tất cả 1.681 dòng”; thay bằng “Hiện thêm 50 dòng” + “Hiện tới 400 dòng”.
  Khi chạm trần, ghi rõ: “… Dùng nút “Tải CSV” ở trên để xem toàn bộ N dòng đã tải.”
- **Chỉ render một biến thể** theo `matchMedia('(max-width: 767px)')` (cùng breakpoint với
  `layout.css`): desktop chỉ bảng, mobile chỉ danh sách thẻ. Trước đây render cả hai rồi CSS ẩn.
- **Memo hoá**: `items` theo `pages`, `chartPoints` theo `items`, `chartRange`, dòng bảng/thẻ là
  `memo` component (cuộn/tick đồng hồ không render lại từng dòng đã có).
- **Cache formatter**: `lib/format.ts` tạo sẵn 5 `Intl.DateTimeFormat` ở phạm vi module thay vì
  tạo mới mỗi ô (đo A/B của QA: −50% thời gian render 1.681 dòng).
- Biểu đồ (P2-7) xem mục dưới.

### P2-7 — biểu đồ không tính lại mỗi render

`components/MeasurementChart.tsx`

- Bọc `memo`, gói toàn bộ hình học (bounds, polyline, area, tick, gap) trong **một `useMemo`**
  phụ thuộc `points`, `gaps`, `range.from`, `range.to`; `range` được memo ở HistoryPage nên không
  bị tạo mới mỗi render.
- Thay `Math.min(...values)` / `Math.max(...values)` bằng vòng lặp một lượt (tránh `RangeError`
  khi mảng rất lớn).
- Giới hạn **2.000 điểm vẽ** (`MAX_RENDER_POINTS`, downsample giữ mẫu cuối) cho khoảng 30 ngày
  (~8.640 điểm); aria-label ghi rõ “vẽ rút gọn còn N điểm”; bảng/danh sách vẫn đủ từng mẫu.

### P1-3 — giảm bytes font, giữ font family/token

- `styles/fonts.css` (mới) khai báo `@font-face` **chỉ woff2**, chỉ subset **vietnamese + latin**,
  cho **Be Vietnam Pro 400/500/600/700** (đều đang được CSS dùng) và **Newsreader 600**.
- Bỏ `@fontsource/newsreader/700`; `.brand` hạ `font-weight: 700 → 600` trong `base.css`
  (Newsreader chỉ còn một weight). `--font-body` / `--font-display` không đổi.
- Bỏ subset `latin-ext` (giao diện tiếng Việt không cần; ký tự ngoài phạm vi sẽ fallback hệ thống)
  và bỏ `.woff` legacy khỏi bundle.
- Kết quả file phát hành: **18 woff2 (278.664 B) + 18 woff (243.336 B) → 10 woff2 (164.964 B), 0 woff**.

### P1-4 — khung tải tĩnh trong `index.html`

- Thêm `#root` tĩnh: tên “An Nhiên”, “Đang tải giao diện…”, 3 khối skeleton + ghi chú dữ liệu mô
  phỏng, kèm ~2 kB CSS inline dùng font hệ thống (không phát sinh request font trước CSS chính) và
  `prefers-reduced-motion`. React thay nội dung `#root` ở lần render đầu; không đổi logic auth.
- Thêm `<noscript>` nhắc bật JavaScript.

### Test đã thêm

- `src/features/history/HistoryPage.test.tsx` (+3):
  - sau 60 giây (fake `setInterval`) không refetch, `from`/`to` không đổi, vẫn `20/65` dòng và không mất trang đã tải;
  - “Hiện thêm 50 dòng” → 70 dòng, “Hiện tới 400 dòng” → 400 dòng, không còn nút “Hiện tất cả”, có hướng dẫn CSV;
  - màn hình hẹp chỉ render danh sách thẻ, không có `<table>`.
- `src/lib/format.test.ts` (mới, +2): 200 vòng × 5 hàm không tạo `Intl.DateTimeFormat` mới; định dạng và fallback chuỗi gốc giữ nguyên.
- `e2e/history.spec.ts` (mới, +3, Playwright mock API): 60 giây không refetch (dùng `page.clock`),
  trần 400 dòng + DOM < 5.000 phần tử, mobile chỉ render danh sách thẻ.

## 2. Kiểm chứng đã chạy

| Việc | Kết quả |
| --- | --- |
| `pnpm install --prefer-offline --frozen-lockfile` | OK (22,6 s, dùng store có sẵn) |
| `pnpm --filter @annhien/contracts build` | OK |
| `apps/web`: `pnpm typecheck` | OK, 0 lỗi |
| `apps/web`: `pnpm test` (vitest) | **25 file / 128 test pass** (trước thay đổi: 24 file / 123 test) |
| `apps/web`: `pnpm build` | OK, `✓ built`, 0 cảnh báo chunk |
| `playwright test e2e/history.spec.ts` (preview production build, API mock) | **3/3 pass** |
| `playwright test` toàn bộ e2e | **chưa chạy** toàn bộ; chỉ chạy spec mới trên preview riêng |
| Docs build/check | không cần (không sửa `docs/`) |

Ghi chú môi trường: worktree khác đang giữ **cổng 5173** nên e2e được chạy bằng config tạm trỏ
`vite preview` ở cổng riêng (5373) với production build; API được mock bằng `page.route`, không
đụng API/DB của lead.

## 3. Số đo thật trước/sau

Điều kiện: Chromium 159 (Playwright 1.65.1), production build `vite preview`, viewport **390×844**,
CDP **CPU 4x**; API mock cùng một bộ 1.681 mẫu (4 trang 500). Bản “trước” build từ `dba1ccf`
(base của nhánh, code trước thay đổi); bản “sau” là `74a9e68`. Không giả lập mạng chậm ở mục 3.1–3.3
(mục 3.4 có 400 kbps/400 ms RTT). Số đo là **một lần chạy mỗi bên**, không phải p50/p95.

### 3.1 P1-1 — sau 60 giây

| Chỉ số | Trước (`dba1ccf`) | Sau (`74a9e68`) |
| --- | --- | --- |
| Request `/measurements` sau khi tải 4 trang | 5 | 4 |
| Sau khi tua đồng hồ 61 s | **6 lần** (refetch) | **4 lần** (không refetch) |
| Danh sách hiển thị sau 61 s | **20/500** (mất 3 trang) | **20/1681** (giữ nguyên) |

### 3.2 P1-2 — “xem nhiều dòng” từ trạng thái 20/1681

| Chỉ số | Trước: “Hiện tất cả 1681 dòng” | Sau: “Hiện tới 400 dòng” |
| --- | --- | --- |
| Long task lớn nhất | **7.910 ms** | **298 ms** (−96%) |
| Thời gian tới frame kế tiếp (wall) | **8.420 ms** | **384 ms** (−95%) |
| DOM node | **42.181** | **6.969** (−83%) |
| Dòng render | 1.681 thẻ **+** 1.681 hàng bảng | 400 thẻ (chỉ một biến thể) |

Bấm thêm dòng (đo từng lần, long task lớn nhất):

| Lần | Trước (+20 dòng) | Sau (+50 dòng) |
| --- | --- | --- |
| 1 | 939 ms wall / 460 ms long task | 306 ms / 0 ms |
| 2 | 1.319 ms / 790 ms | 603 ms / 172 ms |
| 3 | 1.075 ms / 556 ms | — |
| 4 | 910 ms / 557 ms | — |
| 5 | 742 ms / 388 ms | — |

DOM lúc 20 dòng: **682 → 515 node** (bỏ biến thể thứ hai).

### 3.3 P1-3 — font tải trong một lần vào `/app/history`

| Chỉ số | Trước | Sau |
| --- | --- | --- |
| Số file font | 15 | **10** |
| Bytes font | 245.524 B (239,8 KiB) | **164.964 B (161,1 KiB)** (−33%) |
| Bundle font trong `dist` | 18 woff2 + 18 woff | **10 woff2, 0 woff** |

Thời điểm dữ liệu hiện lần đầu (cùng mock API, không throttle mạng): **2.378 ms → 1.730 ms**.

### 3.4 P1-4 — cold load trang công khai, slow 3G + CPU 4x

Điều kiện: 400 kbps down/up, 400 ms RTT, cache tắt, CPU 4x, `/` chưa đăng nhập.

| Chỉ số | Trước | Sau |
| --- | --- | --- |
| FCP | **5.468 ms** | **1.488 ms** (−73%) |
| `DOMContentLoaded` | 4.425 ms | 5.633 ms |
| Skeleton còn lại sau khi React mount | — | 0 (đã được thay) |

`DOMContentLoaded` tăng nhẹ vì HTML có thêm CSS inline, nhưng người dùng thấy nội dung sớm hơn
~4 s. Số LCP không lấy được trong script (entry `largest-contentful-paint` rỗng khi đọc sau load).

### 3.5 Ảnh chụp giao diện (kiểm tra mắt, không commit)

Đã xem nhanh 1280×900 và 390×844 của `/app/history`: toolbar xuống dòng đúng, bảng desktop /
thẻ mobile render đúng một biến thể, không tràn ngang. Ảnh lưu tạm ở
`%TEMP%/annhien-history-{desktop,mobile}.png` — **không** đưa vào repo.

## 4. Thay đổi giao diện cần duyệt (theo AGENTS.md)

- `.brand` (tên “An Nhiên” ở header/footer/landing): Newsreader **700 → 600**. Cùng family/token,
  chữ mảnh hơn một bậc; cần lead/người duyệt UI xác nhận trước khi coi là chốt.
- Bỏ subset `latin-ext`: ký tự Latin mở rộng (ví dụ tên tiếng Ba Lan/Séc) sẽ dùng font hệ thống.
  Giao diện tiếng Việt không đổi.
- Nút **“Cập nhật khoảng”** là mới trong toolbar lịch sử; nút “Hiện tất cả” đã bị thay bằng
  “Hiện tới 400 dòng”.
- Mobile: bảng dữ liệu **không còn trong DOM** (trước đây có nhưng bị `display:none`), danh sách
  thẻ có `aria-label="Dữ liệu đo trong khoảng đã chọn"`.

## 5. Chưa làm / ngoài phạm vi

- **P1-4.2 prefetch chunk Dashboard khi submit login** (`app/router.tsx`, `features/auth/LoginPage`
  không thuộc vùng được phép sửa) — chưa làm, ước tính −2 s trên 3G theo QA.
- **P1-4.3 giảm 1 RTT `/me` → `/subjects` → `/status`**: cần đổi contract/API, ngoài phạm vi.
- **P2-5 `manualChunks` vendor** và **P2-4 header cache immutable**: `vite.config.ts`/infra,
  ngoài phạm vi.
- **P2-8 401 `/me` trên trang công khai**: nằm ở `features/auth/useAuth.ts` + `lib/api.ts`
  (`fetch` trả 401 bị DevTools tự log “Failed to load resource”; JS không tắt được log của
  trình duyệt). Chưa sửa vì ngoài danh sách file được phép và sẽ đổi luồng kiểm phiên — cần lead quyết.
- **Ảo hoá danh sách** (virtualize) không làm; chọn trần 400 dòng + CSV. Nếu sau này cần xem
  >400 dòng ngay trên trang, virtualize là bước tiếp theo (ước tính 60–100 dòng code).
- **Font variable** (`@fontsource-variable/be-vietnam-pro`) chưa thử vì cần thêm dependency +
  lockfile (ngoài phạm vi); ước tính giảm thêm 100–150 kB.
- **Bỏ `.woff` legacy** đã làm ở bundle phát hành (không còn import CSS của fontsource). Nếu sau này
  ai import lại `@fontsource/*/xxx.css` thì `.woff` sẽ quay lại `dist`.
- E2E toàn bộ suite chưa chạy; chỉ chạy `e2e/history.spec.ts` (3 test) trên preview riêng vì
  cổng 5173 đang bị worktree khác chiếm.

## 6. Ghi chú triển khai / rủi ro

- `refetchOnWindowFocus: false` cho trang lịch sử là thay đổi có chủ đích (tránh tải lại 4 trang);
  nếu muốn dữ liệu tự cập nhật khi quay lại tab thì dùng nút “Cập nhật khoảng” — đã ghi trong UI.
- `HistoryPage` dùng `matchMedia`; jsdom không có API này nên test mobile tự gắn bản giả và dọn lại.
- Mốc `rangeAnchor` lấy `Date.now()` tại lúc chọn khoảng nên cửa sổ có thể lệch vài giây so với
  thời điểm mạng trả dữ liệu; UI ghi rõ “Cửa sổ dữ liệu kết thúc lúc …”.
- Script đo A/B nằm tạm trong `apps/web/node_modules/.perf/` (bị gitignore) và đã xoá; số đo ở mục 3
  tái lập được bằng `apps/web/e2e/history.spec.ts` (hành vi) + quy trình mô tả ở trên.
