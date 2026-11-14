# Yêu cầu và phạm vi

> **Baseline v0.1:** phạm vi dưới đây được soạn trước yêu cầu nền tảng AI tự thực thi và cấu hình động. Đọc [yêu cầu bổ sung ở chương 11](11-nen-tang-ai-va-cau-hinh-dong.md) trước khi triển khai; chưa dùng bảng này làm phạm vi cuối cùng của web/app.

**Trạng thái:** đặc tả sơ bộ. P0/P1 là thứ tự kỹ thuật đề xuất cho bản demo, chưa phải cam kết tiến độ. Các yêu cầu truy vết lại đề cương trong [nguồn](10-nguon-va-cau-hoi-mo.md).

## Vai trò và quyền

| Vai trò | Được làm | Điều kiện/giới hạn |
| --- | --- | --- |
| Người được theo dõi/chủ hồ sơ | Xem dữ liệu của mình; quản lý chia sẻ; thao tác hủy/SOS trên thiết bị | Cần cơ chế hỗ trợ thiết lập phù hợp khả năng sử dụng |
| Người thân | Xem hồ sơ được chia sẻ; nhận cảnh báo; xác nhận đang hỗ trợ nếu được cấp quyền | Quyền theo từng hồ sơ và khoảng lịch sử; có thể thu hồi |
| Quản trị viên | Quản lý tài khoản, thiết bị, cấu hình vận hành và audit | Không mặc định được đọc dữ liệu sức khỏe hoặc chat AI |
| Thiết bị | Gửi dữ liệu/sự kiện của chính nó; nhận ACK/cấu hình cho chính nó | Định danh riêng; không gửi `subject_id` để tự chọn bệnh nhân |

Một tài khoản có thể vừa có hồ sơ riêng, vừa là người thân của hồ sơ khác. Quan hệ cấp quyền quyết định quyền truy cập; không chỉ dựa trên tên role toàn hệ thống. Mô hình người đại diện khi người cao tuổi không có tài khoản là vấn đề cần xác nhận, không tự cho người thân quyền sở hữu.

## Yêu cầu chức năng

| ID | Năng lực | Phạm vi đề xuất | Tiêu chí chấp nhận ở bản demo |
| --- | --- | --- | --- |
| FR-01 | Trang giới thiệu, đăng ký/đăng nhập/đăng xuất | P0 | Có luồng vào hệ thống và thông báo lỗi; API xác minh phiên phía server |
| FR-02 | Hồ sơ và chia sẻ người thân | P0 | Mời, chấp nhận, giới hạn quyền, thu hồi; yêu cầu tiếp theo và luồng realtime mất quyền ngay khi bị thu hồi |
| FR-03 | Gắn, thu hồi và chuyển thiết bị | P0 | Chứng minh quyền ghép thiết bị; không chuyển dữ liệu cũ sang hồ sơ mới khi đổi chủ |
| FR-04 | Nhịp tim, bước chân, chất lượng tín hiệu | P0 | Xem giá trị, đơn vị, thời điểm; thiếu/sai tín hiệu không thành số 0; reset thiết bị không làm bước chân âm |
| FR-05 | Biểu đồ và thống kê | P0 | Lọc ngày/khoảng thời gian; hiển thị đoạn thiếu dữ liệu, không tính trung bình từ mẫu không hợp lệ |
| FR-06 | Nghi té ngã và hủy báo nhầm | P0 | Có cửa sổ hủy tại thiết bị và trạng thái cuối theo từng incident; gửi trùng không tạo cảnh báo mới |
| FR-07 | Hộp cảnh báo và xác nhận hỗ trợ | P0 | Người có quyền nhận sự kiện, xác nhận và đóng có lý do; hai người xác nhận đồng thời không gây mất lịch sử |
| FR-08 | Thiết bị offline, dữ liệu cũ, pin | P0 | Phân biệt không có dữ liệu với giá trị bình thường; pin chưa đo phải hiển thị chưa biết |
| FR-09 | SOS chủ động và liên hệ hỗ trợ | P0 đề xuất thêm | SOS bỏ qua cửa sổ nghi ngã; có xác nhận chống bấm nhầm; liên hệ thủ công từ giao diện |
| FR-10 | AI tóm tắt ngày/giải thích dữ liệu | P0 giới hạn | Dựa trên dữ liệu được phép, dẫn khoảng dữ liệu; thiếu dữ liệu thì nói rõ; tắt AI không ảnh hưởng cảnh báo |
| FR-11 | Admin tối thiểu | P0 | Xem tình trạng tài khoản/thiết bị và audit đã lọc; không xem sức khỏe qua role admin đơn thuần |
| FR-12 | Thông báo khi đóng trình duyệt | P1 | Chỉ đánh dấu hỗ trợ sau khi kiểm Web Push trên nền tảng mục tiêu; có trạng thái gửi thất bại/không rõ đã đọc |
| FR-13 | Ngưỡng chỉ số cấu hình được | P1 | Có nguồn/phiên bản cấu hình và cơ chế chống lặp; không cài ngưỡng y khoa tùy ý |
| FR-14 | Xuất, lưu trữ, xóa dữ liệu | P0 thiết kế, triển khai trước dữ liệu thật | Quyền người yêu cầu được kiểm tra; phạm vi xóa gồm bản sao, AI, cache và chính sách backup |

P0 ban đầu dùng dữ liệu tổng hợp và người nhận demo. Giao diện phải nói rõ cảnh báo trong ứng dụng chỉ được quan sát khi đang kết nối; không hứa báo thức nền hoặc cuộc gọi tự động.

## Yêu cầu chất lượng

| ID | Yêu cầu | Cách kiểm dự kiến |
| --- | --- | --- |
| NFR-01 | Kiểm quyền theo hồ sơ cho REST, realtime, export và AI | Tài khoản không được chia sẻ phải bị từ chối ở cả bốn đường dữ liệu |
| NFR-02 | Xử lý trùng và lỗi mạng | Gửi lặp, đảo thứ tự, khởi động lại, mất mạng; đối chiếu số bản ghi/cảnh báo |
| NFR-03 | Thời gian có thể giải thích | Giữ thời gian thiết bị, server, trạng thái đồng hồ và độ mới; phân biệt thời gian phát hiện với thời gian gửi |
| NFR-04 | Dễ thao tác | Cỡ chữ rõ, nút chính ít, không chỉ dùng màu; thử các tác vụ cốt lõi với người phù hợp sau khi có đồng ý |
| NFR-05 | Bảo vệ dữ liệu | TLS, secret ngoài Git, log tối thiểu, giới hạn truy cập và kiểm thu hồi quyền |
| NFR-06 | Khôi phục và theo dõi lỗi | Có quy trình backup/restore, retry hữu hạn, trạng thái hàng gửi, bộ đếm mất mẫu; kiểm ở giai đoạn triển khai |
| NFR-07 | Độ trễ hiển thị | Đích demo đề xuất: p95 ≤ 5 giây từ server nhận sự kiện confirmed đến cập nhật dashboard đang online; đo riêng cửa sổ hủy và truyền từ thiết bị |

## Ngoài MVP

Ứng dụng native, gọi cấp cứu tự động, tự chẩn đoán/kê thuốc, theo dõi ngoài nhà bằng SIM/GPS, nhiều loại bệnh, huấn luyện mô hình ngã lớn, quản lý bệnh viện và tích hợp hồ sơ y tế. Đây là các hướng nghiên cứu mở rộng, không phải phần đã loại khỏi tên đề tài hay đã cam kết xây sau.

## Truy vết

Mỗi tính năng triển khai cần ghi ID yêu cầu vào PR/tài liệu thay đổi và liên kết bằng chứng. Bản [kiểm thử](08-kiem-thu-va-danh-gia.md) chứa ánh xạ yêu cầu → kịch bản; không đánh dấu đạt khi mới viết đặc tả.
