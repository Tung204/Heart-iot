# Fix worker v4 — sửa P1/P2 ứng dụng khách hàng

Base: `v4-simple-app` (`bda9bb2`). Đọc báo cáo đầy đủ `C:/MyFolder/Hoc_Tap/project/DATN/reports/qa/v4-review-app.md` (35 UI + 4 test; 4 P1). Không merge.

## P1 bắt buộc

- **F01 — quyền cảnh báo:** caregiver `canReceiveAlerts=false` không được thấy “Không có cảnh báo mở”. Hiện trạng thái quyền rõ ràng: `Bạn không có quyền xem cảnh báo của hồ sơ này.` (hoặc tương đương), không tone calm; không hiện badge cảnh báo cho người không có quyền. Khôi phục test cũ T01 (không đổi test để chấp nhận lỗi).
- **F03 — thiết bị ngoại tuyến/dữ liệu cũ:** nếu status/device offline hoặc `lastSeenAt` cũ hơn ngưỡng, thẻ trạng thái phải nói `Thiết bị ngoại tuyến · dữ liệu cuối {giờ}` tone cảnh báo, không nói “Không có cảnh báo mở. Dữ liệu cập nhật…” như bình thường. Giữ trạng thái chưa có dữ liệu/403.
- **F04 — chi tiết cảnh báo:** trong viewport đầu 390/360, hành động **Gọi liên hệ khẩn cấp** phải đứng trước; sau đó “Tôi đang hỗ trợ”; “Đóng cảnh báo” đặt sau/cuối, không phải nút đầu tiên. Không đổi backend; dùng dữ liệu contact hiện có.
- **F07 — xác nhận một chạm:** bỏ nút “Xác nhận” một chạm khỏi danh sách cạnh “Chi tiết”, hoặc thêm bước hỏi lại rõ ràng (`Bạn đã liên hệ và đang hỗ trợ?`) trước khi gọi API. Không auto-ack.

## P2 ưu tiên

- **F02:** thẻ cảnh báo mở trên Hôm nay phải có loại + giờ (nếu API có) và ít nhất link “Xem cảnh báo”; nếu có contact, thêm “Gọi” (có thể lấy từ alert detail/contact API đã có). Không bịa dữ liệu.
- **F12:** chỉ một dòng giới hạn trên Hôm nay (`Dữ liệu mô phỏng · không thay thế cấp cứu.`); bỏ dòng “Cảnh báo chỉ cập nhật khi ứng dụng đang mở” lặp ở mọi màn/sidebar, hoặc chỉ giữ một nơi (Cảnh báo).
- **F13:** gộp “Xem sức khỏe chi tiết” + “Lịch sử đo” thành một liên kết Sức khỏe/“Sức khỏe 7 ngày”; lịch sử nằm trong Sức khỏe.
- **F09/F11:** “Thêm” trên mobile rộng ≥44px, không sát mép; menu chỉ render một bản, Escape/click ngoài đóng; `aria-haspopup`/role đúng.
- **F15:** thêm menu tài khoản/avatar hoặc bỏ câu Cài đặt hướng dẫn tới menu không tồn tại; đăng xuất có hỏi lại. Không cần làm mới toàn bộ.
- **F19:** giảm lặp “mô phỏng/mẫu/độ phủ” trên Sức khỏe; giữ một nhãn nguồn mỗi màn. Không xóa dữ liệu thật.
- **F21:** Lịch sử bớt từ kỹ thuật: bỏ “thay thế cho biểu đồ”, “mỗi 300s”, “3650 ngày” khỏi màn đầu; gộp hai nút tải thêm thành một; giữ CSV/bảng.
- **T02/T03:** khôi phục assertion disclaimer của câu trả lời; không nới thông báo 429; test T01 phải kiểm quyền cảnh báo.
- **F30/F31:** `maxlength=500` khớp schema; chip không bị cắt ở 360 chữ lớn (cho phép scroll ngang có dấu hiệu hoặc wrap).

## Không bắt buộc trong đợt này

F05/F06/F08/F10/F17/F18/F20/F35: ghi rõ chưa làm hoặc xử lý nếu còn thời gian; không được nới test/che lỗi.

## Ràng buộc

- Chỉ sửa file app (AssistantPage, AppShell, AlertsPage/Detail, Dashboard/History/Subjects/Settings/Share, app-simple.css, test tương ứng); không sửa public/admin/router/API/contracts/layout.
- Không thêm dependency/endpoint. Không dùng copy demo.
- Chạy web test/typecheck/build; ảnh 1280/390/360/large; đo F01/F03/F04/F09; ghi handoff `reports/handoffs/v4-fix-app.md`, commit branch riêng, không merge.
