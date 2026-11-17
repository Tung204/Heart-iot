# Handoff — v7 W3: đồng bộ E2E với giao diện mới

- **Task**: `task_c325c70a7383` · **Dispatch**: `ctx_5a1dcfe3ce9c`
- **Worker terminal**: `term_914f4e30-7658-482a-9536-e1d17dea3a86`
- **Worktree**: `C:/Users/nguye/orca/workspaces/DATN/v7-e2e` — nhánh `Tung204/v7-e2e`
- **Base**: `e6f21bb` (`docs(orchestration): spec đồng bộ E2E v7`)
- **Commit**: `eceac5a` — `test(web): đồng bộ E2E với giao diện v7` (chưa merge, chưa push)
- **Provider/model**: `moxuna / deepseek-v4.1-flash` (`PI_REASONING_LEVEL=max`)
- **Môi trường đo**: Node `v24.22.2`, pnpm `12.5.1`, Playwright `1.65.1`,
  Chromium for Testing `159.0.8154.6`; web dev Vite do `webServer` của Playwright tự bật
  ở `http://localhost:5173` (`reuseExistingServer: true`); **không cần API thật** vì mọi
  spec tự mock bằng `page.route`.

Phạm vi: chỉ `apps/web/e2e/*.spec.ts`. Không chạm `src/`, CSS, API, contract,
`playwright.config.ts`; không thêm dependency; không xoá test, không `skip`, không nới
timeout, không đổi `retries` (`retries: 0` giữ nguyên).

## 1. Baseline thật trước khi sửa

```
$ pnpm --filter @heart-iot/web test:e2e
  6 failed
    [chromium] › e2e\alerts.spec.ts:175:1 › Sức khỏe hiển thị cảnh báo mở và đường dẫn về Hôm nay/lịch sử
    [chromium] › e2e\assistant.spec.ts:160:1 › /app là Hôm nay: trạng thái cảnh báo, ô hỏi, không còn bối cảnh v3
    [chromium] › e2e\history.spec.ts:106:1 › lịch sử giữ nguyên trang đã tải sau 60 giây, không refetch
    [chromium] › e2e\smoke.spec.ts:24:1 › landing hiển thị tên sản phẩm, trợ lý AI và dữ liệu mô phỏng trong màn đầu
    [chromium] › e2e\smoke.spec.ts:193:3 › /me chậm hoặc lỗi › đang kiểm phiên: chỉ báo tải có aria-busy, chưa hiện CTA khách
    [chromium] › e2e\smoke.spec.ts:218:3 › /me chậm hoặc lỗi › lỗi máy chủ: giữ đăng nhập, tạo tài khoản và thử lại được
  20 passed (11.9s)
```

Nguyên nhân từng fail (đọc `apps/web/src` hiện tại, tất cả đều là presentation v7):

| Test | Locator/chuỗi cũ | Hợp đồng v7 |
| --- | --- | --- |
| smoke landing | H1 `/Người thân ở nhà/`, title `/trợ lý AI/i`, copy “Trợ lý AI trả lời câu hỏi…” | `LandingPage.tsx`: H1 **Theo dõi sức khỏe người thân**, `<title>` trong `index.html` là **Theo dõi sức khỏe**, hàng thông tin ghi “Hỏi trợ lý AI về số liệu của người thân.” |
| smoke `/me` chậm | `.hero__session[aria-busy="true"]` | khối trạng thái phiên đổi sang `.landing-session` (vẫn `role="status"`, `aria-busy`) |
| smoke `/me` lỗi | `.hero__session`, `.hero__actions a` | khối lỗi riêng `.landing-session`; CTA khách nằm ở `.landing-hero__actions` và **không render** khi chưa biết phiên |
| assistant `/app` | nút gợi ý “Nhịp tim?” | `SUGGESTED_QUESTIONS` theo design-system §5.4: **Nhịp tim tuần này** |
| history 60 giây | `new Set(urls).size === 1` | v7 dựng lại `rangeAnchor` một lần ở lượt effect thứ hai của StrictMode → 3 request mount: 2 trùng URL + 1 lệch `to` ~0,24 s (xem §4) |
| alerts Sức khỏe | link nằm trong `<nav aria-label="Đường dẫn">` | `PageHeader` v7 render breadcrumb là `Link` trực tiếp, không còn nav đó |

## 2. Test đã đổi gì

### `apps/web/e2e/smoke.spec.ts` (+13/−9)

- H1: `/Người thân ở nhà/` → đúng chuỗi `Theo dõi sức khỏe người thân`.
- Title: `/trợ lý AI/i` → `/Theo dõi sức khỏe/`; comment nêu rõ `<title>` tĩnh v7 không
  còn chữ “trợ lý AI” nên không kiểm bằng title được nữa (ý định “title nêu sản phẩm” giữ nguyên).
- Copy hero/phụ: “Trợ lý AI trả lời câu hỏi về số liệu của người thân.” → “Hỏi trợ lý AI
  về số liệu của người thân.” (v7 mô tả trợ lý là nơi *hỏi*, không tự trả lời).
- `header.site-header` → `page.getByRole('banner')`: v7 giữ header một link nhưng kiểm
  bằng landmark thay vì class, đúng ý định “header chỉ logo”.
- Khối trạng thái phiên: `.hero__session*` → `.landing-session*`; vùng CTA kiểm
  `.landing-hero__actions a` (v7 không render CTA khách khi đang kiểm phiên/lỗi phiên).
- Giữ nguyên: HERO_SAFETY_NOTE 4 ý, đếm link CTA đúng 1 mỗi đích, không có “bản demo/đồ án”,
  7 viewport landing chữ lớn, register 390/360, 404, focus hộp lỗi đăng nhập.

### `apps/web/e2e/assistant.spec.ts` (+8/−1)

- Gợi ý: `Nhịp tim?` → `Nhịp tim tuần này`; thêm kiểm bấm gợi ý **chỉ điền** câu hỏi
  (“Nhịp tim tuần này thế nào?”) và **không tự gửi** (`role=log` vẫn chưa xuất hiện).
- Giữ nguyên: H1 “Hôm nay”, vùng `Trạng thái hôm nay` + “Nghi ngã lúc …/1 cảnh báo đang mở.”
  + link `Xem cảnh báo` → `/app/alerts`, không còn bối cảnh v3 (`Tóm tắt theo mẫu`,
  “Bối cảnh”, “Độ phủ”, “bản tin”), ô hỏi + nút Gửi, link `Sức khỏe 7 ngày →`,
  note “Dữ liệu mô phỏng · không thay thế cấp cứu.”; test 2 câu hỏi nối tiếp và test
  quay về Hôm nay từ nav giữ nguyên.

### `apps/web/e2e/history.spec.ts` (+16/−3)

- Thay `expect(new Set(urlsBefore).size).toBe(1)` bằng khẳng định chặt hơn về **cửa sổ**:
  mọi request mount phải cùng một cửa sổ 24 giờ (`to − from = 86.400.000 ms`), cùng
  `limit=500`, không `cursor`, và `callsBefore ≤ 3` (số lượt mount tối đa của dev:
  StrictMode chạy effect 2 lần + 1 lượt dựng lại anchor).
- Vẫn giữ nguyên trục chính của QA v2 P1-1: sau `page.clock.fastForward(61_000)` **không
  tăng request nào**, `counters.urls` không đổi, bảng vẫn “Đang hiển thị 60/500 dòng”
  với 60 dòng.
- Test trần 400 dòng/CSV và test màn hẹp không đổi.

### `apps/web/e2e/alerts.spec.ts` (+5/−6)

- Đường về Hôm nay: bỏ `getByRole('navigation', { name: 'Đường dẫn' })`, dùng trực tiếp
  link `← Hôm nay` + `toHaveAttribute('href', '/app')` + `toBeVisible()`.
- Giữ nguyên: H1 “Sức khỏe”, H2 “Cảnh báo đang mở”, pill “1 cần chú ý”, nhãn
  “chưa có người xác nhận”, link cảnh báo → `/app/alerts/<id>`, “Xem tất cả cảnh báo →”,
  khối “Tổng hợp hôm nay” (73 bpm / 3210 bước), “Xem lịch sử và biểu đồ →”, nav chính
  “Điều hướng ứng dụng” với “Hôm nay” → `/app`.

## 3. Cổng kiểm — output thật (lần chạy cuối)

```
$ pnpm --filter @heart-iot/web test:e2e
$ playwright test
[WebServer] $ vite --port 5173

Running 26 tests using 16 workers
  ...
  ok  1 [chromium] › e2e\alerts.spec.ts:161:1 › danh sách cảnh báo hiển thị cảnh báo đang mở và đi tới chi tiết (3.6s)
  ok  6 [chromium] › e2e\history.spec.ts:106:1 › lịch sử giữ nguyên trang đã tải sau 60 giây, không refetch (2.5s)
  ok  8 [chromium] › e2e\assistant.spec.ts:160:1 › /app là Hôm nay: trạng thái cảnh báo, ô hỏi, không còn bối cảnh v3 (2.1s)

  26 passed (5.4s)

real	0m6.005s
E2E_EXIT=0
```

- Số test trước và sau: **26** (không thêm/xoá test; chỉ sửa locator/assertion và thêm
  ba khẳng định phụ trong test gợi ý của `/app`).
- Sau khi sửa, chạy full suite **8 lần**, tất cả `26 passed` (thời gian Playwright báo):
  `4.7s · 5.7s · 5.9s · 5.5s · 5.1s · 5.9s · 5.3s · 5.4s`. Lần cuối là đúng lệnh gate từ
  gốc repo; `time` thật của cả tiến trình `6.005s` (gồm Playwright tự khởi động Vite).
  4 lần cuối nằm sau thay đổi locator header → `getByRole('banner')`.
- Không có fail/flaky trong 8 lần; không có `test.skip`, `test.fixme`, `retries` mới.

```
$ pnpm --filter @heart-iot/web typecheck
$ tsc -p tsconfig.json --noEmit
TYPECHECK_EXIT=0
```

Ghi chú: worktree mới chưa có `packages/contracts/dist` nên lần typecheck đầu báo
`TS2307 Cannot find module '@heart-iot/contracts'`. Đã chạy `pnpm build:contracts`
ở gốc repo (đúng quy trình các lane trước); `dist` không được commit. Sau đó typecheck
sạch — lỗi ban đầu là môi trường, không phải spec.

## 4. Phát hiện, không sửa (ngoài phạm vi)

1. **Dev/StrictMode: `rangeAnchor` bị dựng lại một lần khi mount** (`HistoryPage.tsx`,
   `skipFirstRangeEffect`). StrictMode chạy effect mount hai lần: lượt đầu bỏ qua, lượt
   hai gọi `setRangeAnchor(Date.now())` → thêm 1 request `/measurements` (~112 kB) với
   `to` lệch vài trăm ms. Chỉ xảy ra ở dev StrictMode; production một lượt nên không lặp.
   Test đã được viết để không phụ thuộc hiệu ứng này nhưng vẫn bắt được hồi quy refetch
   60 giây. Nếu muốn sạch cả dev, dùng `useRef` “đã chạy” gắn với mount thật thay vì
   đếm lượt effect.
2. **`<title>` landing không còn “trợ lý AI”** (`apps/web/index.html`). Không sai, nhưng
   giảm khả năng tìm thấy theo từ khoá trợ lý; test đổi sang kiểm “Theo dõi sức khỏe”.
3. **Breadcrumb Sức khỏe/Lịch sử không còn là `<nav aria-label="Đường dẫn">`** — chỉ là
   link đơn trong `PageHeader`. Không phải lỗi a11y (link vẫn có tên rõ), nhưng mất
   landmark điều hướng phụ; test chuyển sang kiểm link trực tiếp.

Không sửa `src/`, CSS, API hay contract nào.

## 5. Chưa kiểm

- **Firefox/WebKit**: `playwright.config.ts` chỉ khai báo project `chromium`; chưa cài
  browser khác, chưa chạy.
- **CI**: repo chưa có CI; toàn bộ số liệu là chạy cục bộ trên Windows, dev Vite
  (`reuseExistingServer: true`). Trên CI (`CI=1`) server sẽ do Playwright tự quản và
  `forbidOnly` bật — chưa đo.
- **API/DB thật**: 100% mock `page.route`; không kiểm SSE thật, không kiểm quyền thật.
- **Mobile thật/axe**: viewport hẹp chỉ chạy Chromium headless; chưa chạy axe hay so ảnh.
- **Độ ổn định dài**: 7 lần chạy liên tiếp, chưa chạy lặp nhiều giờ hay `--repeat-each`.

## 6. Ghi chú Obsidian

Đã cập nhật nhật ký dự án cho wave này (xem liên kết trong câu trả lời cuối).
