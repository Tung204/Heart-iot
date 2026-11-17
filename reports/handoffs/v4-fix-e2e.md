# Handoff — fix E2E theo IA v4

- **Thời điểm:** 2026-11-15 (Asia/Ho_Chi_Minh)
- **Nhánh:** `fix-v4-e2e`, base `ced1c64` (master sau merge v4)
- **Phạm vi ghi:** `apps/web/e2e/{alerts,assistant,history}.spec.ts` và file này.
  Không sửa app code, API, contracts, docs hay cấu hình.

## Vấn đề

`pnpm --filter @annhien/web test:e2e` trên base có 5 test fail vì spec còn viết theo
IA v3 (`/app` là trợ lý, nav Trợ lý/Tổng quan/Lịch sử, lịch sử hiện 20 dòng và có
nút "Hiện tới 400 dòng"). IA v4: `/app` là **Hôm nay**, `/app/overview` là
**Sức khỏe**, nav đầu là **Hôm nay**, lịch sử hiện 10 dòng với một nút
"Hiện thêm N dòng".

## Đã sửa

### `alerts.spec.ts` — test `/app/overview`

- Kiểm URL `/app/overview`, H1 **Sức khỏe** (thay cho "Tổng quan"), breadcrumb
  `← Hôm nay` trỏ `/app`.
- Giữ kiểm dữ liệu cảnh báo: tiêu đề `Cảnh báo đang mở`, pill `1 cần chú ý`,
  `chưa có người xác nhận`, link cảnh báo trỏ đúng `/app/alerts/<id>`.
- Link `Xem tất cả cảnh báo →` trỏ `/app/alerts`; vùng `Tổng hợp hôm nay` có số
  liệu mock (73 bpm, 3210 bước) và link `Xem lịch sử và biểu đồ →` trỏ
  `/app/history`.
- Nav đầu tiên `Hôm nay` trỏ `/app` (thay assertion nav "Lịch sử" đã bị bỏ).

### `assistant.spec.ts` — màn `/app`

- Đổi test màn đầu thành **Hôm nay**: H1 `Hôm nay`, URL `/app`.
- Kiểm thẻ trạng thái (region `Trạng thái hôm nay`) lấy từ cảnh báo mock:
  `Nghi ngã lúc …`, `1 cảnh báo đang mở.`, link `Xem cảnh báo` trỏ `/app/alerts`.
- Kiểm âm các thành phần v3 đã bỏ: không `Tóm tắt theo mẫu`, không heading
  `Bối cảnh`, không `Độ phủ`, không "bản tin".
- Kiểm ô hỏi: label `Câu hỏi`, nút accessible name `Gửi câu hỏi` với chữ hiển thị
  `Gửi`, gợi ý `Nhịp tim?`, chưa có `role=log` trước câu hỏi đầu tiên.
- Kiểm lối `Sức khỏe 7 ngày →` trỏ `/app/overview` và ghi chú
  `Dữ liệu mô phỏng · không thay thế cấp cứu.` xuất hiện đúng một lần.
- Test điều hướng từ `/app/overview`: H1 `Sức khỏe` → nav đầu `Hôm nay`
  (`href=/app`) → URL `/app` + H1 `Hôm nay`.

### `history.spec.ts` — tải dữ liệu và refetch 60 giây

- Mock ghi thêm danh sách URL `/measurements` để so sánh `from/to` trước/sau.
- Test 60 giây: bắt đầu `Đang hiển thị 10/500 dòng` (10 `<tbody><tr>` thật), bấm
  `Hiện thêm 50 dòng` → 60/500 (60 dòng). Tua 61 giây: vẫn 60/500, vẫn 60 dòng,
  số request và toàn bộ URL `/measurements` không đổi.
- Test nút tải: chỉ có một nút `Hiện thêm 50 dòng`, không có
  `Hiện tất cả`/`Hiện tới 400 dòng`/`Tải thêm từ máy chủ`; bấm 8 bước tới trần
  400/500 (kiểm 400 `<tbody><tr>`), nút biến mất, hint nêu `Đã hiện tối đa
  400/500 dòng` + dẫn dùng `Tải CSV`; link CSV có `href` chứa `/export.csv` và
  `download`.
- Giữ kiểm hiệu năng DOM (<5000 phần tử) và desktop chỉ render bảng, không render
  danh sách thẻ.

## Kiểm chứng đã chạy

Môi trường: Windows, web dev server `localhost:5173` đang chạy từ worktree chính
`C:/MyFolder/Hoc_Tap/project/DATN` ở đúng commit `ced1c64` (cùng source với nhánh
này); API `localhost:3000` đang chạy. Các spec này mock toàn bộ `/api/v1/**` bằng
`page.route`, nên không phụ thuộc dữ liệu API thật.

```text
pnpm build:contracts
pnpm --filter @annhien/web typecheck        # pass (tsc --noEmit)
pnpm typecheck                              # pass toàn workspace (contracts, web, api, simulator)
pnpm --filter @annhien/web test:e2e         # 26 passed (7.1s), chromium
apps/web && pnpm exec playwright test e2e/history.spec.ts --repeat-each=3
                                            # 9 passed — kiểm lặp cho test 60 giây/nút tải
```

Không chạy Firefox/WebKit: `playwright.config.ts` hiện chỉ khai báo project
`chromium`. Không sửa log/artifact test vào Git (`test-results/` đã bị bỏ qua).

## Chưa làm / bước tiếp

- Chưa merge nhánh; lead quyết định merge sau khi review diff E2E.
- Chưa kiểm E2E trên trình duyệt khác chromium (ngoài cấu hình hiện tại).
- Nếu đổi `PAGE_SIZE`/trần hiển thị của `HistoryPage`, cần cập nhật lại mock và
  số dòng kỳ vọng trong `history.spec.ts` tương ứng.
