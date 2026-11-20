# v9.2-WEB — cấu hình nhắc chủ động trên `/app/care`

> **Trạng thái 20/11/2026:** đã triển khai **bản preview** trên nhánh `v9-care-rules-web` (commit `0ebf2f2`), **chưa hợp nhất**. Bằng chứng: `reports/handoffs/v9-care-rules-web.md`. Backend V9.2b đã hợp nhất tại `e405996`.

## Phạm vi

- Chỉ chủ hồ sơ thấy section **“Nhắc chủ động”** trong `/app/care`; người thân không thấy và không gọi API cấu hình.
- Hai thẻ:
  - **Nhắc vận động nhẹ**: bật/tắt, ngày trong tuần, khung `windowStart`–`windowEnd`, `minSteps`, `graceMinutes`.
  - **Bản tin cuối ngày**: bật/tắt, giờ gửi.
- Nút **Lưu cấu hình** gọi `PUT`, tạo version mới; nút **Xem trước 7 ngày** gọi preview đã lưu, không ghi.
- Câu giải thích cố định: “Chỉ là nhắc nhẹ theo cài đặt của bạn, không phải cảnh báo khẩn. Mặc định tắt…”.
- Không dùng AI, không tạo incident, không thêm nav; bản tin vẫn nằm trong hộp thông báo hiện có.

## UX/accessibility

- `section aria-labelledby` → h2; mỗi thẻ article có h3; không thêm H1.
- Checkbox/ngày nằm trong label đủ 44px; input time/number dùng `TextField`.
- Validate trước khi gửi: ít nhất một ngày; giờ kết thúc sau giờ bắt đầu; giờ kết thúc + chờ ≤ 24:00.
- 403/500 của query dùng ErrorState + Thử lại; lỗi lưu/preview dùng Alert; lưu thành công có `role="status"`.
- Preview hiển thị 7 dòng ngày/giờ/“Sẽ kiểm tra” hoặc “Không áp dụng”, disclaimer; chỉ ghi chú ngày không áp dụng để danh sách gọn.

## Kiểm

- `CareRulesSection.test.tsx`: mặc định tắt, lưu bật inactivity (body đúng), chặn lưu khi bỏ hết ngày, preview 7 ngày không PUT, lỗi tải có retry.
- `CarePage.test.tsx`: caregiver không thấy heading “Nhắc chủ động”.
- Ảnh Chromium 1280/390: 0 tràn ngang, 1 H1, target ≥44; xem `reports/qa/evidence/v9-care-rules/`.
- Web 44 file/390 test, build pass, E2E 26/26 (20/11/2026).

## Giới hạn

- Chỉ Chromium; chưa Firefox/WebKit/screen reader thật.
- Input `type=time` hiển thị theo locale trình duyệt (ảnh chụp en-US ra “08:00 PM”); giá trị gửi vẫn là `HH:MM`.
- Chưa E2E đặt quy tắc → scheduler gửi thật trong trình duyệt; scheduler đã kiểm ở backend test.
- **Chưa hợp nhất**; cần người dùng chấp nhận 5 ảnh trước khi merge.
