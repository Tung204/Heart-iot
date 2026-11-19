# v8-care-WEB — UI lịch nhắc chăm sóc + phiếu đi khám

Bạn là worker **frontend**. Backend v8 đã hợp nhất vào master (`ba2dcc3`): contracts `@heart-iot/contracts/reminders` và `/reports`, API `/subjects/:id/reminders*` + `/subjects/:id/visit-report`. Chỉ sửa `apps/web`; không sửa API/contracts.

Đọc: `reports/orchestration/v8/decisions.md`, `reports/handoffs/v8-care-be.md`, `docs/06` (nguyên tắc màn hình), `routeScope.ts`, `features/history/HistoryPage.tsx`, `features/subjects/SubjectsPage.tsx`, `features/assistant/AssistantPage.tsx`, `components/primitives.css`, `test/utils.tsx`.

## 1. Trang `/app/care` — “Nhắc chăm sóc”

- Thêm route vào `router.tsx`; cập nhật `routeScope.ts`: `/app/care` → section `people`, context `selected`; `/app/history/report` → section `health`, context `selected` (hoặc page tự ghim nếu in).
- H1 “Nhắc chăm sóc”, đúng 1 H1; dòng ngữ cảnh hồ sơ do shell render.
- **Danh sách lịch nhắc** (`GET /subjects/:id/reminders`): mỗi item có tiêu đề, loại (Thuốc/Sinh hoạt/Đo chỉ số/Khác), giờ, thứ, khoảng ngày, trạng thái bật/tắt, ghi chú. Rỗng có empty state + nút tạo (owner).
- **Tạo/sửa/xoá** (chỉ owner hiện nút): form inline hoặc dialog; field: loại, tiêu đề (2–120), ghi chú (≤500), giờ (1–6, `HH:MM`), thứ (T2–CN), từ ngày, đến ngày (tuỳ chọn), bật/tắt. Validate theo contract; lỗi 422 hiện theo field/general như pattern hiện có. Xoá có bước xác nhận.
- **Hôm nay** (`GET /subjects/:id/reminders/today`): nhóm “Hôm nay”; mỗi occurrence có giờ + tiêu đề + trạng thái; nút **Đã thực hiện** / **Bỏ qua** / **Hoàn tác** gọi completion API. Optimistic + rollback như mark-read hiện có; reload còn đúng. Người có `canViewMeasurements` được đánh dấu; không phải owner thì ẩn nút sửa/xoá/tạo.
- Câu disclaimer cố định: “Chỉ là nhắc việc bạn tự đặt, không thay tư vấn y tế.” (một lần, không lặp mỗi item).
- Không thêm nav item. Lối vào:
  - `SubjectsPage` header: link “Nhắc chăm sóc” cạnh “Công việc bảo trì”.
  - Hôm nay (`AssistantPage`): thẻ “Nhắc hôm nay” chỉ khi có occurrence; tối đa 3 pending + link “Xem tất cả”; có nút Đã thực hiện tại chỗ. Nếu không có dữ liệu/quyền → không render thẻ, không lỗi.
- Inbox/thông báo không đổi.

## 2. Trang `/app/history/report` — phiếu đi khám 1 trang

- Link “Phiếu đi khám” ở header `HistoryPage` cạnh “Tải CSV”, truyền `from`/`to` hiện tại.
- Trang đọc query `from`,`to`; gọi `GET /subjects/:id/visit-report`; lỗi 403/422 hiện thông báo nghiệp vụ + quay lại; loading skeleton.
- Nội dung phiếu (A4 dọc, 1 trang khi in):
  - Tiêu đề “Phiếu theo dõi sức khỏe”, tên hồ sơ, khoảng ngày, ngày xuất.
  - 4 chỉ số: số mẫu, độ phủ %, nhịp tim TB/min–max, tổng bước.
  - Khoảng thiếu dữ liệu (nếu có), số cảnh báo ngã/SOS + mốc gần nhất.
  - **Điểm chú ý** (3–5) kèm ngày; ghi rõ “Chỉ nêu số liệu, không phải kết luận y khoa”.
  - Cảnh báo “Dữ liệu mô phỏng” nếu `simulated`; disclaimer từ API.
  - Nút **In / Lưu PDF** gọi `window.print()` (ẩn khi in); nút quay lại.
- `@media print`: ẩn shell (rail/topbar/bottom nav/nút), nền trắng, chữ đen, không cắt trang; `@page { size: A4; margin: 14mm }`. Không dùng thư viện PDF mới.

## 3. API client + test

- `features/care/api.ts` (hoặc tách `reminders/api.ts`, `history/report-api.ts`): hàm fetch + query keys; dùng `lib/api` hiện có.
- `test/utils.tsx`: handler mẫu cho reminders/today/completions/visit-report; không phá handler cũ.
- Unit test bắt buộc:
  - Care: render danh sách; owner thấy nút tạo/sửa/xoá, caregiver không; tạo thành công gọi POST đúng body; lỗi 422 hiện lỗi; today complete optimistic + rollback khi 500; undo.
  - Assistant: có occurrence → thẻ hiện tối đa 3 + complete; không quyền/không có → không gọi API, không thẻ.
  - History: link “Phiếu đi khám” giữ from/to.
  - Report: render đủ mục + attention points + nhãn mô phỏng; 403 hiện thông báo quyền; nút In gọi `window.print`.
  - `routeScope`: `/app/care` active Người thân + context selected; `/app/history/report` active Sức khỏe.
- Cập nhật test AppShell/handoff nếu nav table thay đổi (không thêm nav).

## 4. Cổng

- `pnpm build:contracts`, `pnpm --filter @heart-iot/web typecheck`.
- Full vitest (`--no-file-parallelism --maxWorkers=1`) — dán số file/test.
- `pnpm --filter @heart-iot/web build`; `pnpm --filter @heart-iot/web test:e2e` **26/26** (không skip/retry).
- Chạy API 3018 + DB `.data/v8web` (seed), web **4365**, `WEB_ORIGIN=http://127.0.0.1:4365`, `VITE_API_BASE_URL=http://127.0.0.1:3018/api/v1`.
- Ảnh Chromium vào `reports/qa/evidence/v8-care/`: `/app/care` 1280/390 (owner, caregiver), form tạo, today card, `/app/history/report` 1280/390 + bản `emulateMedia('print')` PDF-like; tổng ≥8 ảnh.
- Đo: 0 tràn ngang, target ≥44, 1 H1, in không cắt nội dung (ít nhất kiểm 390/1280).

## 5. Bàn giao

Commit branch `v8-care-web` (từ master), không merge/push. `reports/handoffs/v8-care-web.md`: file đổi, test diff, ảnh, phần chưa kiểm (Firefox/Safari, máy in thật, phần thiết bị FR-15), provider/model.
