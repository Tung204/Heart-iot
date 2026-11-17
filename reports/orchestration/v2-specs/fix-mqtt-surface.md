# Fix worker — đóng bề mặt MQTT chưa xác thực

Bạn là worker sửa lỗi trên worktree riêng. Đọc `AGENTS.md`, `reports/qa/v2-iot-protocol.md` P0-1/P0-2, `infra/compose.yaml`, `infra/mosquitto/*`, `docs/03`, `docs/04` mục transport, code ingest HTTP.

Chỉ sửa: `infra/compose.yaml`, `infra/mosquitto/**`, `infra/README` nếu có, `docs/03`/`docs/04` phần MQTT/transport, `README.md` mục chạy demo; test cấu hình nếu có. Không sửa API/web/contracts/schema/app.module. Không cần Docker chạy; không bịa kết quả broker.

Yêu cầu:
- Không còn broker `allow_anonymous true` mở cổng 1883 ra ngoài. MQTT nếu giữ phải: bind localhost, xác thực user/password hoặc mTLS, ACL theo `device_id`, không public; cấu hình bằng secret ngoài repo, không commit mật khẩu thật.
- Vì hiện **chưa có ingest MQTT cho fall/SOS/telemetry**, hạ MQTT xuống profile thử nghiệm (`profiles: ["mqtt-experimental"]`) hoặc tắt mặc định; ghi rõ HTTP `/api/v1/ingest/*` là đường duy nhất đang hỗ trợ và MQTT publish sự kiện **không** tạo incident/ACK.
- `docker compose up` mặc định không mở MQTT; tài liệu cảnh báo không dùng broker anonymous, không tuyên bố firmware/MQTT đã hỗ trợ.
- Thêm kiểm tra tĩnh (script/grep/Makefile) rằng config không chứa `allow_anonymous true`, compose không map 1883 ra 0.0.0.0; ghi lệnh/output.
- Không sửa hoặc xóa finding P0-2; ghi rõ đây là giảm bề mặt + trung thực, không phải đã triển khai MQTT.
- Handoff `reports/handoffs/v2-fix-mqtt-surface.md`; commit nhánh riêng. Báo commit hash, kiểm tra đã chạy, phần chưa làm.
