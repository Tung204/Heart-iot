# Hợp đồng dữ liệu dùng chung

Package `@annhien/contracts` giữ **zod schema + type** dùng cho API, web và simulator. Đây là nguồn hợp đồng đang thực thi trong mã; payload JSON trong `examples/` chỉ là mẫu tài liệu.

## Trạng thái

- Đã có schema chạy được cho **15 miền nghiệp vụ** (auth, subjects, care, devices, telemetry/incident envelope, measurements, incidents API, notifications, assistant, tasks, studio, admin, policies, insights, contacts) cộng lõi enum/lỗi/phân trang, và được `apps/api`, `apps/web`, `tools/simulator` import qua subpath.
- Trong đó `insights`, `contacts` và phần mở rộng `auth`/`tasks` mới là **nền hợp đồng cho v2** (commit `0d669a1`); chưa có endpoint/UI dùng, không được báo là tính năng đã giao.
- Ba payload trong `examples/` được kiểm parse bằng schema tương ứng: `pnpm build:contracts && node tools/docs/check-examples.mjs`. Script fail nếu thêm file mẫu mà chưa khai báo schema, nên mẫu lỗi không lọt qua.
- **Chưa có OpenAPI máy sinh.** Khi bổ sung phải sinh từ schema/service hoặc một nguồn duy nhất; không viết tay bản thứ hai rồi để lệch.
- `ingestAckSchema` là response HTTP của ingest. Adapter MQTT hiện chỉ subscribe telemetry nên **chưa publish ACK**; contract MQTT đầy đủ vẫn là thiết kế trong `docs/04`.

## Dùng trong code

```ts
import { carePermissionsSchema, DEFAULT_CARE_PERMISSIONS } from '@annhien/contracts';
import { authSessionSchema } from '@annhien/contracts/auth';
import { telemetryEnvelopeSchema } from '@annhien/contracts/telemetry';
```

Package biên dịch sang `dist/` (CommonJS + type). Sau khi sửa schema:

```bash
pnpm build:contracts
```

API dùng `ZodValidationPipe` để parse request; response quan trọng cũng nên parse trước khi trả để phát hiện lệch hợp đồng sớm.

## Quy tắc

- Timestamp trên HTTP dùng RFC 3339 UTC (`2026-11-14T09:20:00Z`), trừ trường ngày địa phương có tên `date`.
- Chỉ số không hợp lệ là `null`, không dùng `0` giả; `heart_rate_bpm` đi cùng quality.
- `incident_id` do thiết bị sinh chỉ duy nhất trong namespace thiết bị; server khóa theo `(device_id, incident_id)`.
- Enum mới/thay đổi enum là thay đổi hợp đồng; phải xem xét version, migration và phía firmware/simulator.
- Không đưa credential, token hay dữ liệu sức khỏe người thật vào file mẫu/test.
- Mỗi file trong `examples/` phải khai báo schema kiểm trong `tools/docs/check-examples.mjs`; giữ mẫu parse được thay vì mô tả một hợp đồng cũ.

## Payload mẫu

| Ví dụ | Ý nghĩa |
| --- | --- |
| [telemetry.v1.json](examples/telemetry.v1.json) | Một mẫu BPM và tổng bước trong boot, kèm chất lượng/đồng hồ |
| [fall-confirmed.v1.json](examples/fall-confirmed.v1.json) | Thiết bị xác nhận sau cửa sổ hủy; đủ thông tin để xử lý nếu candidate đến sau (`incident_type`, `evidence.wear_location/motion_quality/heart_rate_quality/heart_rate_bpm`) |
| [event-ack.v1.json](examples/event-ack.v1.json) | Backend xác nhận đã lưu bản tin incident; camelCase đúng `ingestAckSchema`, `incidentId` là UUID server (khác `incident_id` do thiết bị sinh) |

Quy tắc trường, idempotency, MQTT và API nằm ở [đặc tả dữ liệu](../../docs/04-du-lieu-va-giao-tiep.md) và [kế hoạch v1](../../docs/14-ke-hoach-trien-khai-phan-mem.md).
