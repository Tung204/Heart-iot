# v8 — quyết định lát cắt "chăm sóc hằng ngày"

Ngày 19/11/2026. Người dùng: “tính năng còn rất sơ sài” → làm thêm nghiệp vụ, không chỉ trình bày.

## Phạm vi lát cắt đầu

| Mã | Làm trong v8 | Ghi chú |
| --- | --- | --- |
| FR-15 | **Phần web**: lịch nhắc uống thuốc/sinh hoạt theo múi giờ hồ sơ, xem hôm nay, đánh dấu đã thực hiện, bỏ đánh dấu | Phần xuống thiết bị (rung/nút trên firmware) **hoãn**, ghi rõ là chưa có |
| FR-16 | Phiếu theo dõi **1 trang A4 để in/lưu PDF** từ dữ liệu đã kiểm quyền | Không thêm thư viện PDF; dùng print CSS + nút In/Lưu PDF của trình duyệt |
| FR-22 | 3–5 “điểm chú ý” sinh từ dữ liệu thật (kèm ngày, độ phủ, khoảng thiếu) trên phiếu | Chỉ nêu số liệu, cấm kết luận bệnh |
| FR-17/18/19/20/21/23 | **Chưa làm ở lát cắt này** | Làm tiếp sau khi FR-15/16/22 ổn định |

## Quyết định

- **V8-1 IA:** không đổi nav 4 mục. Trang nhắc việc là `/app/care` (tên “Nhắc chăm sóc”), vào từ header trang **Người thân** và từ thẻ nhắc trên Hôm nay. Phiếu đi khám là `/app/history/report`, vào từ header trang **Lịch sử đo**.
- **V8-2 Quyền:**
  - Chủ hồ sơ: tạo/sửa/xoá lịch nhắc, cấu hình; xem và đánh dấu.
  - Người thân có `canViewMeasurements`: xem lịch + đánh dấu đã thực hiện (không sửa/xoá).
  - Người chỉ nhận cảnh báo / không có quyền: không thấy nội dung nhắc; API trả 403 theo mẫu hiện có.
  - Admin không có link hồ sơ: 404 như các trang sức khỏe.
- **V8-3 Thời gian:** mọi tính toán “hôm nay” theo `subject.timezone`; occurrence khoá theo `(reminderId, date, time)`.
- **V8-4 Nội dung:** tiêu đề + ghi chú tự do; **không** gợi ý liều/lịch y khoa, không chẩn đoán. UI có câu “Chỉ là nhắc việc bạn tự đặt, không thay tư vấn y tế.”
- **V8-5 Phiếu:** dữ liệu từ measurements/incidents đã lọc `sharedFrom`/`historyDays`; hiện độ phủ, khoảng thiếu, số ngã, điểm chú ý, nhãn “Dữ liệu mô phỏng” nếu có; không logo thương hiệu lạ.
- **V8-6 Kỹ thuật:** thêm contract `reminders`, `reports`; migration mới; test API cho quyền/ranh giới ngày/DST; không phá test cũ.
