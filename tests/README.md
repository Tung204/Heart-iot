# Kiểm thử liên thành phần

**Chưa có ứng dụng nên chưa có test executable.** Ma trận yêu cầu/kịch bản và cách đo nằm tại [kiểm thử và đánh giá](../docs/08-kiem-thu-va-danh-gia.md).

Unit test đặt gần module sở hữu hành vi khi chọn framework. Thư mục này dành cho integration/E2E qua ranh giới thiết bị → ingest → lưu trữ → cảnh báo → người nhận, và fixture tổng hợp dùng chung khi thực sự cần.

Ưu tiên lint/type-check rồi test nhỏ nhất liên quan; chạy tuần tự mặc định. Test cần bảo vệ quyền, idempotency, state transition, quality/time và khôi phục sau lỗi. Không viết test chỉ để khẳng định tên file/thư mục có mặt hoặc mô phỏng lại nội bộ framework.

Kết quả phần cứng/AI cần thông số và bằng chứng riêng; không gọi một JSON parse thành công là test hệ thống IoT đạt.
