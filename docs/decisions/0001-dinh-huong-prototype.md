# ADR-0001 — Định hướng prototype

- Ngày: 10/11/2026.
- Trạng thái: **đề xuất, chưa được chốt**.
- Bối cảnh: có đề cương, chưa có code, yêu cầu trường, danh sách linh kiện hoặc kết quả đo.

## Các lựa chọn đề xuất

| Lựa chọn | Lý do | Đổi khi |
| --- | --- | --- |
| Web responsive trước native app | Một giao diện cho demo máy tính/điện thoại, giảm phần cần triển khai | Trường hoặc thử nghiệm yêu cầu tính năng nền/native không đáp ứng được |
| Modular monolith | Nghiệp vụ còn thay đổi, quy mô chưa chứng minh cần nhiều service | Có ranh giới vận hành/tải rõ và bằng chứng đo |
| MQTT/TLS cho thiết bị, HTTPS cho web | Hợp với sự kiện thiết bị/presence; API dễ tổ chức quyền | Thử nghiệm cho thấy HTTP đơn giản hơn và vẫn đáp ứng yêu cầu mạng/ACK |
| PostgreSQL trước hệ time-series riêng | Cần transaction và quyền trên dữ liệu quan hệ | Khối lượng/retention đo thực tế vượt thiết kế hiện có |
| Nghi ngã được xử lý tại thiết bị | Hủy/còi tại chỗ vẫn dùng khi mất mạng | Chỉ chuyển phần bổ trợ lên server nếu không làm mất khả năng cục bộ |
| Backend chờ confirmed từ thiết bị | Tránh xác nhận nhầm khi cancel bị giữ trong mạng offline | Có giao thức khác được chứng minh xử lý được tranh chấp |
| AI tách khỏi cảnh báo | Độ trễ/lỗi model không làm hỏng cảnh báo | Không đổi ranh giới này chỉ để thêm tính năng hội thoại |
| Prototype trên bàn trước vỏ đeo | Vị trí đo và tín hiệu chưa xác minh | Có dữ liệu đủ để chọn hình thức đeo |

## Hệ quả

Cần thêm broker và quản lý credential thiết bị. Phải xử lý duplicate/out-of-order, application ACK và hàng đợi riêng. Demo web online không chứng minh thông báo nền. Vị trí đeo còn mở nên chưa thiết kế PCB/vỏ cuối cùng hoặc mua linh kiện theo một BOM cố định.

Các thư mục đã tạo phản ánh ranh giới trách nhiệm, chưa khóa framework/package manager. Khi chốt một lựa chọn, cập nhật trạng thái, người/căn cứ xác nhận và bằng chứng; nếu đổi, giữ lý do trong ADR tiếp theo thay vì viết lại như thể chưa từng có đề xuất này.

Tham chiếu: [kiến trúc](../03-kien-truc-he-thong.md), [phần cứng](../05-phan-cung-va-firmware.md), [nguồn/câu hỏi](../10-nguon-va-cau-hoi-mo.md).
