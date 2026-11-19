# Handoff — v8-care-WEB (Nhắc chăm sóc + phiếu đi khám)

- **Thời điểm:** 2026-11-19 (Asia/Ho_Chi_Minh)
- **Branch:** `v8-care-web`, tạo từ `master` @ `d33d6d6` (đã gồm backend v8 `ba2dcc3`); commit gốc `7441c7b`, commit sửa P2/P3 ở lượt QA ảnh nằm sau đó trên cùng nhánh; **chưa merge/push**
- **Phạm vi:** chỉ `apps/web` + test/QA. Không sửa `apps/api`, `packages/contracts`.
- **Provider/model:** `moxuna` / `deepseek-v4.1-flash`

## 1. Hành vi đã cài

### `/app/care` — Nhắc chăm sóc (FR-15 phần web)

- Route mới `care` trong `router.tsx`; `routeScope`: section `people`, context `selected`. **Không thêm mục nav**; vào từ header Người thân (cạnh “Công việc bảo trì”) và thẻ “Nhắc hôm nay” trên Hôm nay.
- Đúng 1 H1 “Nhắc chăm sóc”; dòng ngữ cảnh hồ sơ do shell render.
- Danh sách `GET /subjects/:id/reminders`: tiêu đề, loại (Thuốc/Sinh hoạt/Đo chỉ số/Khác), giờ, thứ, khoảng ngày, bật/tắt, ghi chú. Rỗng có empty state + nút tạo (owner).
- Owner tạo/sửa/xoá tại chỗ; form validate theo `createReminderSchema` (title 2–120, note ≤500, 1–6 giờ `HH:MM`, T2–CN, `endsOn >= startsOn`). Giờ/thứ được sắp tăng dần trước khi gửi vì API không tự sắp. Lỗi 422 từ API được gắn lại theo field (`times.0`, `weekdays.2` gộp về vùng) và lỗi chung. Xoá có bước xác nhận thứ hai.
- “Hôm nay” `GET .../reminders/today`: giờ + tiêu đề + trạng thái; nút **Đã thực hiện / Bỏ qua / Hoàn tác**. Optimistic + rollback đúng ảnh chụp cache khi API lỗi; `onSettled` invalidate nên tải lại vẫn đúng. Dùng chung hook với thẻ trên Hôm nay (một query key).
- Caregiver có `canViewMeasurements`: xem + đánh dấu nhưng **không** thấy nút tạo/sửa/xoá. Thiếu quyền: câu nghiệp vụ, **không gọi API** nhắc. Owner luôn có quyền.
- Câu giới hạn cố định hiển thị **một lần**: “Chỉ là nhắc việc bạn tự đặt, không thay tư vấn y tế.”

### Hôm nay — thẻ “Nhắc hôm nay”

- Chỉ render khi có occurrence thật và người xem có quyền xem số đo; thiếu quyền/không có dữ liệu/lỗi tải → không render thẻ, không lỗi.
- Tối đa 3 việc còn `pending`, nút “Đã thực hiện” tại chỗ, link “Xem tất cả” → `/app/care`; còn việc thì ghi “Còn N việc khác hôm nay.”

### `/app/history/report` — phiếu đi khám (FR-16 + FR-22)

- Link “Phiếu đi khám” ở header Lịch sử đo cạnh “Tải CSV”, truyền `from`/`to` hiện tại đã quy về **ngày địa phương** theo `subject.timezone`.
- Trang đọc query `from`,`to`, gọi `GET /subjects/:id/visit-report`; loading skeleton; 403/422 hiện câu nghiệp vụ + đường về Lịch sử đo.
- Nội dung A4 dọc: hồ sơ, kỳ + ngày xuất, 4 chỉ số (số mẫu, độ phủ %, nhịp tim TB/min–max, tổng bước), khoảng thiếu, số ngã/SOS + mốc gần nhất, điểm chú ý kèm ngày + câu “Chỉ nêu số liệu, không phải kết luận y khoa”, nhãn “Dữ liệu mô phỏng” khi `simulated`, disclaimer nguyên văn từ API.
- Nút **In / Lưu PDF** gọi `window.print()`; `@media print` ẩn rail/topbar/bottom nav/breadcrumb/nút, nền trắng, `@page { size: A4; margin: 14mm }`. Không thêm thư viện PDF.

## 2. File thay đổi

### Sửa

| File | Nội dung |
| --- | --- |
| `apps/web/src/app/routeScope.ts` | `/app/care` → `people/selected`; `/app/history/report` → `health/selected` |
| `apps/web/src/app/router.tsx` | Lazy route `care`, `history/report` |
| `apps/web/src/features/assistant/AssistantPage.tsx` | Chèn thẻ `TodayRemindersCard` sau dải tín hiệu |
| `apps/web/src/features/history/HistoryPage.tsx` | Link “Phiếu đi khám” giữ `from`/`to` (ngày địa phương) |
| `apps/web/src/features/subjects/SubjectsPage.tsx` | Link “Nhắc chăm sóc” cạnh “Công việc bảo trì” |
| `apps/web/src/lib/format.ts` | `formatDayKey()` cho ngày `YYYY-MM-DD` |
| `apps/web/src/lib/query.ts` | Query key `reminders`, `remindersToday`, `visitReport` (đều subject-scoped) |
| `apps/web/src/test/utils.tsx` | Fixture `REMINDER`/`REMINDER_DAY`/`VISIT_REPORT` + `careApiHandler` mẫu; không đổi handler cũ |

### Mới

| File | Nội dung |
| --- | --- |
| `apps/web/src/features/care/api.ts` | Fetch/list/today/create/update/delete/completion/undo |
| `apps/web/src/features/care/labels.ts` | Nhãn loại, thứ, khoảng ngày |
| `apps/web/src/features/care/useReminderCompletion.ts` | Mutation optimistic + rollback dùng chung |
| `apps/web/src/features/care/ReminderForm.tsx` | Form tạo/sửa, validate contract, lỗi theo field |
| `apps/web/src/features/care/CarePage.tsx` + `care.css` | Trang Nhắc chăm sóc |
| `apps/web/src/features/care/TodayRemindersCard.tsx` | Thẻ trên Hôm nay |
| `apps/web/src/features/history/report-api.ts` | Client phiếu đi khám |
| `apps/web/src/features/history/VisitReportPage.tsx` + `report.css` | Phiếu 1 trang + print CSS |
| `apps/web/src/app/routeScope.test.ts` | Route scope mới |
| `apps/web/src/features/care/CarePage.test.tsx` | 9 test care |
| `apps/web/src/features/assistant/AssistantReminders.test.tsx` | 3 test thẻ Hôm nay |
| `apps/web/src/features/history/HistoryPage.report-link.test.tsx` | 1 test link giữ from/to |
| `apps/web/src/features/history/VisitReportPage.test.tsx` | 4 test phiếu (nội dung, in, 403, 422) |

## 3. Cổng đã chạy

```text
$ pnpm build:contracts
$ pnpm --filter @heart-iot/contracts build   # tsc -p tsconfig.json, không lỗi

$ pnpm --filter @heart-iot/web typecheck
$ tsc -p tsconfig.json --noEmit              # không lỗi

$ pnpm --filter @heart-iot/web exec vitest run --no-file-parallelism --maxWorkers=1
Test Files  43 passed (43)
Tests       377 passed (377)

# baseline master: 38 file test; +5 file mới / +20 test
# (CarePage 9, AssistantReminders 3, HistoryReportLink 1, VisitReport 4, routeScope 3)

$ pnpm --filter @heart-iot/web build
$ tsc -p tsconfig.json --noEmit && vite build   # không lỗi

$ pnpm --filter @heart-iot/web test:e2e
26 passed (26)                                   # không skip, retries = 0
```

### API + DB thật cho QA

```text
$ PGLITE_DATA_DIR=.data/v8web WEB_ORIGIN=http://127.0.0.1:4365 pnpm --filter @heart-iot/api seed
{ "users": 3, "subjects": 2, "devices": 1, "assignments": 1, "careLinks": 1,
  "telemetry": 1681, "incidents": 3, "tasks": 2, "outbox": 2, "reminders": 2 }

$ PORT=3018 PGLITE_DATA_DIR=.data/v8web WEB_ORIGIN=http://127.0.0.1:4365 node apps/api/dist/src/main.js
$ VITE_API_BASE_URL=http://127.0.0.1:3018/api/v1 pnpm --filter @heart-iot/web exec vite --port 4365 --host 127.0.0.1
```

Đăng nhập owner/caregiver bằng tài khoản seed; `/reminders/today` trả 2 occurrence ngày 19/11/2026,
`/visit-report?from=2026-10-21&to=2026-11-19` trả phiếu seed (`simulated=true`, 5 điểm chú ý).

## 4. Bằng chứng QA

Thư mục: `reports/qa/evidence/v8-care/` (10 ảnh + 1 PDF + `measurements.json`).

| Ảnh | Nội dung |
| --- | --- |
| `care-owner-1280.png` / `care-owner-390.png` | Trang care owner, có form/list/today, 2 kích thước |
| `care-caregiver-1280.png` / `care-caregiver-390.png` | Caregiver `canViewMeasurements`; 0 nút tạo/sửa/xoá |
| `care-form-create-1280.png` | Form tạo lịch nhắc |
| `today-reminders-1280.png` | Thẻ “Nhắc hôm nay” trên Hôm nay |
| `visit-report-1280.png` / `visit-report-390.png` | Phiếu trên màn hình |
| `visit-report-print-794.png` + `visit-report-print-1123.png` + `visit-report-print.pdf` | `emulateMedia('print')` ở 794×1123 và 1123×1123; PDF A4 |

Đo tự động (Chromium, `measurements.json`):

- 0 tràn ngang (`documentElement` và `body`) ở 1280/390 cho care + report; 0 ở bản in 794 và 1123.
- H1 thẳng trái với nội dung: `h1Left - contentLeft = 0` trên care/report ở 1280 và 390 (`headerDisplay: grid`).
- Mọi `a/button/input/select/textarea/summary` hiển thị có target ≥44px (`smallTargets: []`; checkbox tính theo label).
- 1 H1 trên care, form, Hôm nay, report; bản in cũng 1 H1.
- Bản in: `.shell__sidebar/.shell__topbar/.shell__bottomnav/.report-actions` đều `display:none`,
  body nền trắng, disclaimer còn hiển thị; header meta không cắt ở 794/1123; PDF **1 trang**
  (Ghostscript render 1 PNG; `pdftotext` thấy đủ “30 ngày” và “21/10/2026 … 13/11/2026”).
- Caregiver: `forbiddenEditButtons = 0`.

## 5. Vòng sửa P2/P3 sau QA ảnh (cùng nhánh)

- **P2 — H1 desktop bị căn giữa:** `PageHeader` mặc định là flex row 3 phần tử, chỉ `.health-page` được override grid. Đã thêm grid 2 cột cho `.care-page .page-header` và `.report-page .page-header`: breadcrumb span `1 / -1`, H1 cột 1, action cột 2; bản in report override `display: block`. Đo lại `h1Left - contentLeft = 0` ở 1280 và 390 cho cả hai trang.
- **P2 — bản in cắt bên phải:** header meta có thể tràn khi vùng in hẹp; print CSS nay xếp header thành cột, thêm `min-width: 0` + wrap cho facts. Đồng thời sửa lỗi shell ở print khi viewport ≥1024: rail bị ẩn nhưng track grid vẫn còn 216px làm body rơi vào cột hẹp; print đặt `body:has(.report-page) .shell { display: block !important }`. Đo 794 và 1123: `textOverflow` lần lượt **-74,8** và **-84,7**, `elementOverflow = 0`; PDF vẫn **1 trang**, có đủ “30 ngày” và “21/10/2026 … 13/11/2026”.
- **P3 — trộn định dạng ngày trong “Điểm chú ý”:** thêm `formatDaysInText()` đổi mọi token `YYYY-MM-DD` trong `attentionPoints[].detail` sang `DD/MM/YYYY`; test khẳng định phiếu không còn chuỗi `2026-…` và có “từ 21/10/2026 00:00 đến 13/11/2026 12:01”.
- File sửa ở vòng này: `apps/web/src/features/care/care.css`, `apps/web/src/features/history/report.css`, `apps/web/src/features/history/VisitReportPage.tsx`, `apps/web/src/features/history/VisitReportPage.test.tsx`; ảnh/measurements trong `reports/qa/evidence/v8-care/` được chụp lại.
- Cổng chạy lại: web typecheck, **43 file/377 test**, web build, **E2E 26/26**.

## 6. Chưa kiểm / giới hạn

- **Firefox/Safari**: print CSS dùng `body:has(.report-page)` cho Chrome/Chromium; chưa kiểm hai trình duyệt còn lại và chưa kiểm máy in thật/khổ giấy thực. PDF chỉ mới đo bằng Chromium headless.
- **FR-15 phần thiết bị** (downlink, rung/nút xác nhận trên firmware, nhận sự kiện “đã thực hiện” từ thiết bị) **chưa có** — đúng phạm vi lát cắt v8 đã chốt.
- Chưa kiểm với dữ liệu thật/người dùng thật; phiếu dùng dữ liệu seed tổng hợp.
- Native `<input type="date">`/`type="time"` hiển thị theo locale trình duyệt (ảnh QA là en-US), giá trị gửi API vẫn là `YYYY-MM-DD`/`HH:MM`.
- Chưa cập nhật `docs/02`, `docs/06`, `docs/14` sang trạng thái “đã có UI v8”; để worker docs/lead cập nhật cùng lúc.
