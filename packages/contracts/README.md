# Hợp đồng dữ liệu dùng chung

Package `@heart-iot/contracts` giữ **zod schema + type** dùng cho API, web và simulator. Đây là nguồn hợp đồng đang thực thi trong mã; payload JSON trong `examples/` chỉ là mẫu tài liệu.

## Trạng thái

- Đã có schema chạy được cho các miền nghiệp vụ (auth, subjects, care, devices, telemetry/incident envelope, measurements, insights, incidents API, notifications, notification-preferences, alert-policy, assistant (gồm capability/nháp hành động FR-21), tasks, studio, admin, policies, contacts) cộng lõi enum/lỗi/phân trang, và được `backend`, `frontend`, `tools/simulator` import qua subpath.
- Các miền v2 (`insights`, `contacts`, phần mở rộng `auth`/`tasks`/`subjects`) **đã có endpoint/UI dùng thật** ở HEAD hiện tại: xu hướng 7–30 ngày, liên hệ khẩn cấp, cài đặt tài khoản/phiên, tạo việc, lưu trữ/yêu cầu xóa. Không còn là “nền hợp đồng chưa giao”.
- Năm payload trong `examples/` được kiểm parse bằng schema tương ứng: `pnpm build:contracts && node tools/docs/check-examples.mjs`. Script fail nếu thêm file mẫu mà chưa khai báo schema, nên mẫu lỗi không lọt qua.
- FR-21 có schema `assistantDraftSchema`/`createAssistantDraftSchema`/`assistantDraftFromTextSchema`/`updateAssistantDraftSchema`/`assistantDraftListQuerySchema`; hai capability `care_reminder.create` và `maintenance_task.create` dùng discriminated union, `update` chọn schema theo capability đã lưu; schema tạo nháp nhận `requestKey` idempotency; retention preview `retentionPreviewSchema` (chỉ đọc, không cấu hình); quan sát job nền `adminJobsSchema`/`adminJobHealthSchema` (chỉ đọc `job_runs`, counter vận hành); tổng hợp outbox `adminOutboxSummarySchema` (counter theo trạng thái/kênh/kind, không nội dung/người nhận); nháp chỉ lưu preview, không thay endpoint nghiệp vụ.
- **OpenAPI một phần:** `scripts/generate-openapi.mjs` sinh `docs/api/openapi.v1.json` cho quản trị, FR-21, hồ sơ/số đo/phiếu đi khám, cảnh báo, thiết bị, chia sẻ chăm sóc, lịch nhắc, liên hệ khẩn cấp, bảo trì và cấu hình chính sách từ các schema Zod, có kiểm ref/path param và `openapi:check`. Path được khai báo thủ công; test `backend/test/openapi.spec.ts` so route metadata của `AdminController`/`AdminDevicesController`/`AssistantController`/`SubjectsController`/`MeasurementsController`/`VisitReportController`/`IncidentsController`/`SubjectDevicesController`/`CareController`/`RemindersController`/`EmergencyContactsController`/`MaintenanceController`/`AlertPolicyController`/`CareRulesController` với artifact. **Chưa có OpenAPI toàn bộ API**, nên vẫn phải đối chiếu controller và không viết tay bản schema thứ hai.
- `ingestAckSchema` là response HTTP của ingest và payload ACK sự kiện publish qua MQTT. ACK có thể là `accepted`/`duplicate`/`rejected`; khi cách ly, `code=QUARANTINED` và `incidentId`/`acceptedRevision` có thể null. Adapter MQTT publish ACK sự kiện qua `v1/devices/{id}/acks`; hợp đồng topic/trạng thái thử nghiệm ở `docs/04`.

## Dùng trong code

```ts
import { carePermissionsSchema, DEFAULT_CARE_PERMISSIONS } from '@heart-iot/contracts';
import { authSessionSchema } from '@heart-iot/contracts/auth';
import { telemetryEnvelopeSchema } from '@heart-iot/contracts/telemetry';
```

Package biên dịch sang `dist/` (CommonJS + type). Sau khi sửa schema:

```bash
pnpm build:contracts
```

API dùng `ZodValidationPipe` để parse request; response quan trọng cũng nên parse trước khi trả để phát hiện lệch hợp đồng sớm.

## Quy tắc

- Timestamp trên HTTP dùng RFC 3339 UTC (`2026-11-14T09:20:00Z`), trừ trường ngày địa phương có tên `date`.
- Chỉ số không hợp lệ là `null`, không dùng `0` giả; `heart_rate_bpm` đi cùng quality. `clock_status=synced` bắt buộc có `measured_at`; chỉ `unsynced` được null.
- `incident_id` do thiết bị sinh chỉ duy nhất trong namespace thiết bị; server khóa theo `(device_id, incident_id)`.
- Quyền chia sẻ gồm `canViewMeasurements`; bản ghi cũ thiếu trường được đọc là `true`, chỉ `false` tường minh mới chặn dữ liệu sức khỏe.
- Enum mới/thay đổi enum là thay đổi hợp đồng; phải xem xét version, migration và phía firmware/simulator. `incidentStateSchema` có thêm `unconfirmed` cho ứng viên quá hạn không có kết quả cuối.
- Không đưa credential, token hay dữ liệu sức khỏe người thật vào file mẫu/test.
- Mỗi file trong `examples/` phải khai báo schema kiểm trong `tools/docs/check-examples.mjs`; giữ mẫu parse được thay vì mô tả một hợp đồng cũ.

## Payload mẫu

| Ví dụ | Ý nghĩa |
| --- | --- |
| [telemetry.v1.json](examples/telemetry.v1.json) | Một mẫu BPM và tổng bước trong boot, kèm chất lượng/đồng hồ |
| [fall-confirmed.v1.json](examples/fall-confirmed.v1.json) | Thiết bị xác nhận sau cửa sổ hủy; đủ thông tin để xử lý nếu candidate đến sau (`incident_type`, `evidence.wear_location/motion_quality/heart_rate_quality/heart_rate_bpm`) |
| [event-ack.v1.json](examples/event-ack.v1.json) | Backend xác nhận đã lưu bản tin incident; camelCase đúng `ingestAckSchema`, `incidentId` là UUID server (khác `incident_id` do thiết bị sinh) |
| [event-ack-quarantined.v1.json](examples/event-ack-quarantined.v1.json) | Sự kiện bị cách ly: `status=rejected`, `code=QUARANTINED`, `incidentId=null`; không tạo incident/outbox/SSE |
| [insights.v1.json](examples/insights.v1.json) | Xu hướng ngày có dữ liệu và ngày thiếu (`hasData=false`, `heartRate=null`), chỉ số tổng hợp, ghi chú nguồn mô phỏng |

Quy tắc trường, idempotency, MQTT và API nằm ở [đặc tả dữ liệu](../../docs/04-du-lieu-va-giao-tiep.md) và [kế hoạch v1/v2](../../docs/14-ke-hoach-trien-khai-phan-mem.md).
