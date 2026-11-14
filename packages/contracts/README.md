# Hợp đồng dữ liệu

Thư mục giữ định nghĩa dùng chung giữa firmware, simulator, API và web. **Hiện có payload JSON tổng hợp minh họa v1; chưa có JSON Schema/OpenAPI/codegen hoặc validator thực thi.**

| Ví dụ | Ý nghĩa |
| --- | --- |
| [telemetry.v1.json](examples/telemetry.v1.json) | Một mẫu BPM và tổng bước trong boot, kèm chất lượng/đồng hồ |
| [fall-confirmed.v1.json](examples/fall-confirmed.v1.json) | Thiết bị xác nhận sau cửa sổ hủy; đủ thông tin để xử lý nếu candidate đến sau |
| [event-ack.v1.json](examples/event-ack.v1.json) | Backend xác nhận đã lưu bản tin incident |

Quy tắc trường, idempotency, MQTT và API nằm ở [đặc tả dữ liệu](../../docs/04-du-lieu-va-giao-tiep.md). Giá trị `demo-*`, timestamp và chỉ số đều là minh họa, không phải dữ liệu người thật hoặc kết quả thử.

Khi triển khai, viết JSON Schema cho envelope/payload và OpenAPI cho HTTP, chọn một nguồn sinh kiểu dữ liệu thay vì giữ nhiều bản độc lập. Thay đổi phá tương thích phải có version mới và thử firmware cũ trong phạm vi hỗ trợ. Cần chốt giới hạn kích thước, độ dài ID, kiểu số và các enum trước khi dùng validator trong ingest.
