# MQTT sự kiện + ACK — bằng chứng lát cắt (21/11/2026)

## Phạm vi

Bổ sung ingest sự kiện `fall.*`/`sos.*` qua MQTT và ACK ứng dụng, dùng chung
`IncidentsService` với HTTP. Đây là **profile thử nghiệm** (`mqtt-experimental`);
HTTP vẫn là đường ingest chính thức.

- Topic subscribe: `v1/devices/+/telemetry`, `v1/devices/+/events`.
- Topic publish ACK: `v1/devices/{device_id}/acks`, QoS 1, không retain.
- ACL mẫu: thiết bị publish telemetry/events của chính mình, đọc ACK; backend
  đọc telemetry/events và chỉ publish ACK.
- Không đổi schema DB, không thêm dependency.

## Quyết định/giới hạn

- **P0-2** (publish sự kiện bị bỏ im lặng) đã có mã + test handler; **chưa** kiểm
  broker Mosquitto/ACL/TLS thật, chưa đo QoS/retry khi mất kết nối.
- **P0-1 vẫn mở**: adapter chỉ đối chiếu topic ↔ payload và trạng thái thiết bị;
  chưa xác thực khóa thiết bị ở tầng ứng dụng. Khi chạy thật phải dựa vào
  username/password + ACL broker; không dùng cấu hình anonymous.
- Chưa có ingest `status`, chưa có hàng đợi bền/ACK trên firmware.

## Kiểm chứng đã chạy

| Lệnh/hạng mục | Kết quả |
| --- | --- |
| `pnpm --filter @heart-iot/api typecheck` | pass |
| `node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/ingest.spec.ts` | **14/14 test pass** |
| Full API suite | **31 suite / 296 test pass** |
| Randomized seed `20261121` | **296/296 pass** |
| `node infra/check-mqtt-exposure.mjs` | **16/16 kiểm tra đạt**; chỉ kiểm cấu hình tĩnh, không chứng minh broker chạy |
| Broker thật/ACL/TLS | **chưa chạy** |

Test MQTT events kiểm: handler nhận `fall.candidate` tạo incident `suspected`, ACK đúng topic
`v1/devices/{id}/acks`/JSON, duplicate không tạo thêm incident, payload sai và
`device_id` lệch topic bị chặn, không publish ACK sai.

## File chính

- `backend/src/ingest/mqtt-ingest.service.ts`
- `backend/src/ingest/ingest.module.ts`
- `backend/test/ingest.spec.ts`
- `infra/mosquitto/acl`, `infra/mosquitto/mosquitto.conf`, `infra/compose.yaml`
- `docs/03`, `docs/04`, `docs/08`, `docs/14`, `README.md`, `infra/README.md`

## Việc còn lại trước khi coi là production

1. Chốt xác thực thiết bị (mTLS hoặc user riêng + rotation) và kiểm ACL broker thật.
2. Chạy Mosquitto thật: publish `fall.candidate`/`sos.confirmed`, nhận ACK, thử
   duplicate/retry, sai topic, thiếu credential; ghi log/output.
3. Đo hành vi khi broker mất kết nối/ACK thất bại; quyết định retry phía thiết bị.
4. Chốt D6: dùng MQTT production hay HTTP-only; cập nhật tài liệu/finding tương ứng.
