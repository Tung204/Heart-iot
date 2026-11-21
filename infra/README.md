# Môi trường và triển khai

Nơi đặt cấu hình chạy local/demo. **Chưa có image, môi trường đã deploy hay broker production nào được dựng trong repository này.** `infra/compose.yaml` chỉ là file tham khảo cho máy phát triển; mọi tuyên bố "đã chạy" cần lệnh và output thật.

## Trạng thái từng thành phần

| Thành phần | Trạng thái | Ghi chú |
| --- | --- | --- |
| PostgreSQL 17 | Có service trong compose, **chưa chạy trong các lượt kiểm tài liệu** | Mặc định `docker compose up` chỉ dựng service này; cổng publish chỉ bind `127.0.0.1`. Ứng dụng vẫn mặc định dùng PGlite, không cần Docker. |
| MQTT broker (Mosquitto) | **Profile thử nghiệm `mqtt-experimental`, tắt mặc định** | Adapter đã có telemetry + events/ACK trong mã; chưa phải đường ingest production. Xem mục dưới. |
| API/worker/web trong compose | Chưa có image | Chạy bằng `pnpm dev` theo [README gốc](../README.md). |

Secret không commit. Khi thêm `.env.example`, chỉ ghi tên biến và giá trị demo vô hại, không sao chép `.env` thật. Không mở broker/DB công khai để tiện demo.

## MQTT là thử nghiệm, không phải đường ingest được hỗ trợ

Tính đến 21/11/2026:

- **HTTP là đường ingest chính thức:** `POST /api/v1/ingest/telemetry` và `POST /api/v1/ingest/events` với header `x-device-id`/`x-device-key`. Đây là đường simulator và test dùng.
- Adapter MQTT trong `backend` subscribe `v1/devices/+/telemetry` và `v1/devices/+/events` khi đặt `MQTT_URL`; sự kiện dùng chung `IncidentsService` và được ACK qua `v1/devices/{id}/acks` sau commit. Phần mã/test của **P0-2** đã có.
- Tuy vậy **chưa xác thực khóa thiết bị ở tầng ứng dụng** (P0-1 vẫn mở), chưa kiểm broker/ACL/TLS thật và chưa kiểm tải/độ bền ACK trên broker thật. Không dùng MQTT cho demo cảnh báo, không tuyên bố firmware đã hỗ trợ MQTT production.

### Vì sao broker bị hạ xuống profile

Bản trước mở `listener 1883 0.0.0.0` với `allow_anonymous true` và compose publish `1883:1883`. Bất kỳ máy nào trong LAN đều ghi được telemetry sức khỏe giả cho mọi `device_id` (P0-1). Cấu hình hiện tại:

- Service `mosquitto` có `profiles: ["mqtt-experimental"]` → `docker compose up` mặc định **không** dựng và không mở cổng 1883.
- Cổng publish chỉ bind loopback host: `127.0.0.1:${MQTT_EXPERIMENTAL_PORT:-1883}:1883`.
- `infra/mosquitto/mosquitto.conf`: `allow_anonymous false`, `password_file`, `acl_file`, listener `127.0.0.1`.
- `infra/mosquitto/acl`: username thiết bị **phải** là `device_id` (UUID); `pattern` cho publish `v1/devices/%u/telemetry`, `v1/devices/%u/events` và đọc `v1/devices/%u/acks`. Backend dùng user riêng, đọc telemetry/events và chỉ publish ACK.
- File mật khẩu tạo cục bộ, **đã gitignore** (`infra/mosquitto/passwd`). Thiếu file này broker dừng (fail closed), không quay lại anonymous.

### Chạy thử profile (tùy chọn, không bắt buộc cho demo)

```bash
# 1) Tạo file mật khẩu cục bộ (không commit). Nhập mật khẩu khi được hỏi,
#    tránh đưa mật khẩu vào lịch sử shell. Lệnh dưới dùng bash/Git Bash.
docker run --rm -it --user root -v "$PWD/infra/mosquitto:/work" eclipse-mosquitto:2 \
  mosquitto_passwd -c /work/passwd heart-iot-ingest
# Lặp lại không có -c cho từng thiết bị; username phải đúng device_id (UUID) trong DB:
#   docker run --rm -it --user root -v "$PWD/infra/mosquitto:/work" eclipse-mosquitto:2 \
#     mosquitto_passwd /work/passwd dddddddd-dddd-4ddd-8ddd-dddddddddddd

# 2) Dựng broker ở profile thử nghiệm, chỉ trên loopback host
docker compose -f infra/compose.yaml --profile mqtt-experimental up -d mosquitto

# 3) Khi xong, tắt và xóa credential cục bộ nếu không cần nữa
docker compose -f infra/compose.yaml --profile mqtt-experimental down
rm infra/mosquitto/passwd
```

Lưu ý thực tế: container Mosquitto chạy bằng user nội bộ `mosquitto` của image, nên file `passwd` phải đọc được bởi user đó. Nếu broker báo lỗi mở password file, chỉnh quyền file cục bộ rồi chạy lại. Các lệnh trên **chưa được chạy trong repository này** (không có Docker daemon ở lượt sửa); chỉ `docker compose config` được kiểm.

Backend chỉ kết nối broker khi đặt `MQTT_URL` (ví dụ `mqtt://127.0.0.1:1883`) cùng `MQTT_USERNAME`/`MQTT_PASSWORD` của user `heart-iot-ingest` trong `.env` cục bộ. Không commit các giá trị này.

### Chưa làm (không được suy diễn là đã có)

- Chưa dựng hay kiểm broker, kết nối TLS/mTLS, ACL thực thi, luồng ACK trên broker thật.
- Đã có ingest MQTT cho `events` + ACK; **chưa có** ingest `status` và chưa xác thực khóa thiết bị ở tầng ứng dụng cho MQTT.
- Chưa có provisioning/rotation credential thiết bị cho MQTT (khóa HTTP hiện có endpoint admin rotate; xem P1-2).
- Chưa có persistence, backup/restore hay giám sát cho broker.

Trước khi dùng ngoài máy local phải có: TLS bắt buộc, mTLS hoặc user riêng từng thiết bị kèm rotation, ACL kiểm bằng test, xác thực thiết bị ở tầng ứng dụng và quyết định production cho MQTT hay chỉ HTTPS.

## Kiểm cấu hình tĩnh

Chạy trước khi commit thay đổi `infra/`:

```bash
node infra/check-mqtt-exposure.mjs
```

Script fail khi: còn `allow_anonymous true`, listener bind ngoài loopback, thiếu `password_file`/`acl_file`, compose bỏ profile hoặc publish cổng 1883 ra ngoài loopback, hoặc file `passwd` bị Git track. Đây là kiểm regex trên file cấu hình — **không** chứng minh broker chạy đúng và không thay test tích hợp.

## Việc còn lại của môi trường

Đọc [kiến trúc](../docs/03-kien-truc-he-thong.md) và [vận hành/bàn giao](../docs/09-lo-trinh-va-ho-so.md). Khi có môi trường thật, cấu hình phải mô tả port, TLS, health check, volume, backup/restore, migration, credential rotation và cách rollback. Secret lấy từ secret store hoặc `.env` cục bộ, không đưa vào Git.
