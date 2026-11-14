# Kiểm thử và đánh giá

**Trạng thái:** thiết kế phép kiểm, chưa phải kết quả. Chỉ bổ sung test tự động khi đã có hành vi ứng dụng cần bảo vệ; không tạo test để khẳng định framework hoạt động đúng.

## Chiến lược chạy

1. Chạy lint và type-check liên quan khi đã có toolchain. Với thay đổi chỉ có tài liệu, kiểm Markdown/liên kết/JSON và sự nhất quán.
2. Chạy test nhỏ nhất bao phủ hành vi thay đổi: quyền truy cập, state transition, tổng hợp, chống trùng hoặc parser hợp đồng do ứng dụng sở hữu.
3. Mở integration test khi chạm transaction DB, broker, thời gian, quyền realtime hoặc tác vụ gửi.
4. Dùng E2E cho đường demo quan trọng; race test cho xác nhận đồng thời; load/stress chỉ khi đánh giá giới hạn cụ thể. Full suite dành cho gate phát hành hoặc bằng chứng hồi quy rộng cần thiết.

Mặc định chạy tuần tự. Khi fail phải đọc bằng chứng và tìm nguyên nhân trước khi chạy lại. Không bỏ/skip/nới test hợp lệ để làm xanh.

## Ma trận yêu cầu và bằng chứng

| ID phép kiểm | Yêu cầu | Kịch bản | Bằng chứng mong đợi |
| --- | --- | --- | --- |
| T-01 | FR-01, NFR-01 | Không có phiên, phiên hết hạn, đăng xuất | API từ chối đúng; không đọc dữ liệu còn lại qua stream |
| T-02 | FR-02, NFR-01 | Hồ sơ A/B; mời chưa chấp nhận; thu hồi lúc stream/AI đang chạy | Không có dữ liệu của hồ sơ không được phép; stream và kết quả đang sinh bị chặn |
| T-03 | FR-03 | Chuyển thiết bị từ A sang B rồi nhận dữ liệu cũ | Dữ liệu không rơi vào hồ sơ B; timestamp không tin cậy bị cách ly |
| T-04 | FR-04, FR-05 | BPM null, tín hiệu kém, counter bước reset, qua nửa đêm | Không coi null là 0; không bước âm; thời gian thiếu không bị che |
| T-05 | FR-06, NFR-02 | Candidate → cancel; candidate → confirmed; confirmed đến trước candidate | Đúng một incident; đúng trạng thái cuối; không gửi khẩn sau cancel |
| T-06 | FR-06, NFR-02 | Gửi cùng message 10 lần; cùng key khác payload; đảo revision | Không tạo cảnh báo trùng; payload xung đột bị phát hiện; không lùi trạng thái |
| T-07 | FR-07, NFR-06 | Commit incident rồi worker tắt; gửi lại sau khởi động | Outbox khôi phục được; trạng thái gửi phản ánh số lần thử, không báo đã đọc |
| T-08 | FR-07 | Hai người nhận xác nhận gần đồng thời | Trạng thái nhất quán, audit giữ tác nhân; không mất kết quả thao tác |
| T-09 | FR-08 | Mất mạng, clock unsynced, buffer đầy, reboot | Offline đúng chính sách; dữ liệu trễ rõ ràng; thống kê mất mẫu, không hứa khôi phục phần chưa ghi bền |
| T-10 | FR-09 | Bấm SOS, chống bấm nhầm, hủy sau confirmed | SOS không đợi cửa sổ nghi ngã; hủy sau gửi có thông báo cập nhật |
| T-11 | FR-10 | Thiếu dữ liệu, bịa số, prompt injection, yêu cầu hồ sơ khác | AI không trả dữ liệu ngoài quyền; không bịa số; có fallback |
| T-12 | FR-11, FR-14 | Admin đọc sức khỏe, export sau thu hồi, yêu cầu xóa | Quyền chặn đúng; xóa có phạm vi và trạng thái, không chỉ ẩn UI |
| T-13 | FR-12 | Trình duyệt đóng/tắt quyền push/kênh lỗi | Chỉ công bố hỗ trợ ở nền tảng đã kiểm; trạng thái thất bại không bị coi đã nhận |
| T-14 | NFR-07 | Đo chuỗi timestamp khi dashboard online | Báo p50/p95 và số mẫu; tách cửa sổ hủy, truyền mạng, xử lý, hiển thị |

T-13 chỉ chạy khi triển khai Web Push/P1. Các phép kiểm ở bảng là mục tiêu dự kiến; chưa có test executable hoặc kết quả đạt.

## Bổ sung cho AI thực thi và cấu hình động

[Chương 13, mục 12](13-dac-ta-thuc-thi-ai-va-cau-hinh.md) là nguồn của **AI-01…AI-17**: dùng chung service UI/AI, kiểm quyền xuyên các đường dữ liệu, approval, dedup từ request tạo run đến từng tác động, restart/cancel, preview/publication, cutover lịch, vòng phản hồi trigger, prompt injection và khả năng mở rộng module. AI-17 chỉ áp dụng nếu chọn Coding Agent trong sản phẩm. Không sao chép bảng sang đây để tránh hai nguồn khác nhau.

Bộ này là thiết kế phép kiểm, chưa chạy. [Review nền tảng AI](reviews/02-nen-tang-ai-va-cau-hinh-dong.md) liên kết finding với phép kiểm cần thực hiện. Khi có implementation, bắt đầu ở lớp sở hữu invariant; chỉ dùng integration/race/E2E cho ranh giới thực sự liên quan.

Đánh giá chất lượng tác vụ theo kết quả nghiệp vụ, thời gian/thao tác, can thiệp, chi phí và lỗi quyền/tác động trùng theo định nghĩa trong chương 13. Bộ nhiệm vụ giữ lại để đánh giá tách khỏi bộ dùng chỉnh prompt; báo điều kiện, version, mẫu số và dữ liệu thiếu. Kịch bản bảo vệ trong chương 13 nối thiết bị → tự động hóa → cấu hình → gây lỗi; không thay phép đo phần cứng bên dưới.

## Đánh giá phát hiện té ngã

Xác định đơn vị đánh giá là **sự kiện**, không đếm mỗi cửa sổ IMU như một người ngã độc lập. Lưu nhãn và ranh giới thời gian, vị trí đeo, người/phiên thử, cấu hình cảm biến và version thuật toán.

| Chỉ số | Cách tính/ghi nhận |
| --- | --- |
| Precision | `TP / (TP + FP)`; không xác định khi mẫu số bằng 0 |
| Recall | `TP / (TP + FN)`; không xác định khi mẫu số bằng 0 |
| F1 | `2 * precision * recall / (precision + recall)` khi xác định |
| Báo nhầm theo thời gian | Số cảnh báo giả / giờ theo dõi hợp lệ trong các hoạt động thường ngày |
| Độ trễ | Từ mốc sự kiện đã gán nhãn đến candidate và confirmed; báo riêng cửa sổ hủy |
| Mất dữ liệu | Thời gian hoặc mẫu thiếu / lượng kỳ vọng theo cấu hình |

Không chỉ dùng accuracy khi dữ liệu không ngã chiếm phần lớn. Nếu dùng dataset công khai, ghi giấy phép, thiết bị/vị trí thu và khác biệt với prototype. Chia train/tune/test theo người hoặc phiên, không để các cửa sổ gần nhau rơi vào cả train và test. Giữ tập test không dùng để chọn ngưỡng.

Tập hoạt động âm tính nên có ngồi xuống nhanh, nằm xuống, đi bộ, vung tay, tháo thiết bị và thiết bị rơi khỏi bàn. Mô phỏng bằng vật thay thế cần báo riêng; không gộp với thử trên người để tăng số liệu. Chưa có quy mô mẫu/đích accuracy được chốt.

## Đánh giá nhịp tim và bước chân

Nhịp tim: căn chỉnh thời gian với thiết bị tham chiếu, ghi nguồn/giới hạn tham chiếu, MAE trên cặp mẫu hợp lệ, phân bố sai số và tỷ lệ không có phép đo. Không loại im lặng các đoạn nhiễu để tạo kết quả đẹp; báo riêng nghỉ/vận động và điều kiện tiếp xúc.

Bước chân: dùng số bước đếm thủ công/nguồn tham chiếu của từng phiên, so chênh lệch tuyệt đối/tương đối theo hoạt động và vị trí đeo. Phiên có bước tham chiếu bằng 0 không dùng phần trăm chia cho 0; báo số đếm nhầm.

Pin: ghi cấu hình đo, chu kỳ gửi, RSSI/điều kiện mạng, dung lượng sử dụng và hoạt động cảnh báo. Thời lượng ước tính không thay phép đo chạy thực tế.

## Biểu mẫu bằng chứng tối thiểu

Mỗi lần thử ghi: mã lần thử, mục đích, phiên bản code/config, phần cứng/vị trí đeo, dữ liệu đầu vào và quyền dùng, bước thực hiện, kết quả kỳ vọng/thực tế, số mẫu/thời lượng, lỗi/giới hạn và đường dẫn artifact. Dùng ID ẩn danh; raw data ở vùng local đã loại khỏi Git.

Kết luận báo cáo phải kèm điều kiện thử. Không suy rộng từ một demo vài phút sang độ tin cậy trong gia đình hoặc khả năng chẩn đoán.
