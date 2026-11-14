# Môi trường và triển khai

Nơi đặt cấu hình chạy local/demo sau khi ứng dụng có thể build. **Chưa có Compose, image hoặc môi trường đã deploy.**

Thành phần dự kiến gồm PostgreSQL, MQTT broker có ACL, API/worker và web. Chỉ thêm cache/queue chuyên dụng khi có nhu cầu được chứng minh; bản đầu có thể dùng notification outbox trong database.

Đọc [kiến trúc](../docs/03-kien-truc-he-thong.md) và [vận hành/bàn giao](../docs/09-lo-trinh-va-ho-so.md). Cấu hình thực tế phải mô tả port, TLS, health check, volume, backup/restore, migration, credential rotation và cách rollback.

Secret không commit. Khi thêm `.env.example`, chỉ ghi tên biến và giá trị demo vô hại, không sao chép `.env` thật. Không mở broker/DB công khai để tiện demo.
