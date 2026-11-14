# Backend API và nghiệp vụ

Nơi triển khai backend modular monolith. **Hiện chưa có ứng dụng, migration hay endpoint đang chạy.** NestJS + TypeScript là ứng viên, chưa khóa version/ORM.

Ranh giới module dự kiến: `auth`, `subjects`, `care-links`, `devices`, `ingestion`, `measurements`, `incidents`, `notifications`, `assistant`, `audit`. Adapter MQTT/HTTP/AI gọi nghiệp vụ qua ranh giới rõ; logic chuyển trạng thái và kiểm quyền không nằm rải trong transport handler.

Nguồn chính: [kiến trúc](../../docs/03-kien-truc-he-thong.md), [dữ liệu/API](../../docs/04-du-lieu-va-giao-tiep.md) và [kiểm thử](../../docs/08-kiem-thu-va-danh-gia.md).

Lát cắt đầu: ingest một telemetry và một incident từ simulator, lưu bền có chống trùng, đọc bằng tài khoản đúng quyền, xác nhận/đóng incident. Viết migration/constraint cùng hành vi; kiểm transaction outbox và truy cập chéo hồ sơ trước khi mở rộng.
