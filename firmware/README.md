# Firmware thiết bị

Nơi đặt chương trình ESP32 sau khi chọn board, ESP-IDF, component MQTT và driver cảm biến. **Chưa có firmware build được hoặc pin mapping đã xác minh.**

Đọc [phần cứng và firmware](../docs/05-phan-cung-va-firmware.md), [hợp đồng](../docs/04-du-lieu-va-giao-tiep.md) và [payload mẫu](../packages/contracts/README.md).

Ranh giới dự kiến: cảm biến, xử lý tín hiệu, phát hiện nghi ngã, tương tác tại chỗ, kết nối, buffer, telemetry và cấu hình. Cần ghi version board/SDK/component, sample rate, đơn vị, vị trí đeo và tham số thuật toán trong từng phiên thử.

Provision credential ngoài source. ACK MQTT không thay ACK lưu bền từ backend. Outbox thư viện không được mặc định là hàng đợi flash sống qua mất nguồn. Chỉ tạo project SDK sau khi xác nhận bộ version tương thích.
