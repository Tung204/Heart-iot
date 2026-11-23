# OpenAPI từ Zod — bằng chứng

**Ngày:** 21/11/2026; cập nhật 22/11/2026 (phủ đủ route toàn bộ 21 controller, gồm health/realtime)

**Nhánh:** `v10-backend` (chưa merge/push)  
**Phạm vi:** artifact hợp đồng cho quản trị, trợ lý, hồ sơ, số đo, phiếu đi khám, cảnh báo, thiết bị, chia sẻ chăm sóc, lịch nhắc, liên hệ khẩn cấp, bảo trì, cấu hình chính sách, thông báo, xác thực, studio, ingest telemetry, health và realtime SSE; bổ sung route/schema và test hợp đồng, không đổi hành vi API/UI.

## Đã làm

- Thêm `packages/contracts/scripts/generate-openapi.mjs` dùng `z.toJSONSchema` (Zod 4.6.7, không thêm dependency).
- Bổ sung `GET /subjects/{id}/assistant/summary` và `POST /subjects/{id}/assistant/ask` để phủ đủ route `AssistantController`.
- Sau khi thêm nháp `maintenance_task.create`, schema `AssistantDraft`/`CreateAssistantDraft`/`UpdateAssistantDraft` sinh dạng `oneOf` theo capability; artifact tăng lên 131 KB; sau khi phủ hồ sơ/số đo/phiếu đi khám là 205 KB.
- Thêm `backend/test/openapi.spec.ts`: đọc metadata decorator của `AdminController`, `AdminDevicesController`, `AssistantController`, `SubjectsController`, `MeasurementsController`, `VisitReportController`, `IncidentsController`, `SubjectDevicesController`, `CareController`, `RemindersController`, `EmergencyContactsController`, `MaintenanceController`, `AlertPolicyController`, `CareRulesController`, `NotificationsController`, `NotificationSettingsController`, `AuthController`, `StudioController`, `IngestController`, `HealthController`, `RealtimeController`, so chính xác tập route với artifact (không mở app/DB).
- Phủ thêm 11 operation của hồ sơ/số đo/phiếu đi khám: `GET/POST /subjects`, `GET/PATCH /subjects/{id}`, archive, deletion-requests, measurements, daily-summary, insights, export.csv và visit-report.
- Phủ thêm 5 operation cảnh báo: ingest sự kiện thiết bị (header `x-device-id`/`x-device-key`, `security: []`), danh sách/chi tiết cảnh báo, ACK và đóng cảnh báo theo version; artifact tăng lên **256 KB**.
- Phủ thêm 8 operation thiết bị: tạo/list admin, cấp lại claim code, xoay khóa, claim/list thiết bị theo hồ sơ, trạng thái hồ sơ và thu hồi thiết bị; artifact tăng lên **298 KB**.
- Phủ thêm 6 operation chia sẻ chăm sóc: tạo/list lời mời, xem trước công khai, chấp nhận lời mời, list/thu hồi care link; token lời mời chỉ trả một lần; artifact tăng lên **336 KB**.
- Phủ thêm 8 operation lịch nhắc: tuân thủ, list/tạo/sửa/lưu trữ, occurrence hôm nay, đánh dấu và hoàn tác; artifact tăng lên **385 KB**.
- Phủ thêm 7 operation liên hệ khẩn cấp và bảo trì: list/tạo/sửa/xóa liên hệ, list/tạo/đóng công việc bảo trì; artifact tăng lên **418 KB**.
- Phủ thêm 6 operation cấu hình chính sách: alert-policy GET/PUT/preview và care-rules theo kind GET/PUT/preview; artifact tăng lên **446 KB**.
- Phủ thêm 7 operation thông báo/Web Push: hộp thư, đánh dấu đã đọc, preference, list/add/remove subscription; artifact tăng lên **468 KB**.
- Phủ thêm 9 operation xác thực/phiên: register, login, logout, me, đổi mật khẩu, list/revoke session; artifact tăng lên **489 KB**.
- Phủ thêm 9 operation studio: list/tạo/xem view, sửa nháp, preview, publish, rollback, lịch sử công bố, dữ liệu view; artifact tăng lên **599 KB**.
- Bổ sung **1 operation ingest telemetry HTTP** (`POST /ingest/telemetry`) từng bị bỏ sót vì test route chưa gồm `IngestController`; artifact tăng lên **606 KB**.
- Phủ thêm **1 operation health** (`GET /health`) với contract `healthStatusSchema` mới, backend parse response; **1 operation realtime SSE** (`GET /subjects/{id}/events`) mô tả `text/event-stream`, `Last-Event-ID`/cursor; artifact tăng lên **610 KB**.
- Sinh `docs/api/openapi.v1.json` (OpenAPI 3.1.0):
  - 79 path, 99 operation;
  - 105 component schema;
  - cookie session `an_session`;
  - nhóm `/admin/*` (gồm `/admin/devices`), `/assistant/*`, `/subjects/*` (hồ sơ, số đo, phiếu đi khám, cảnh báo, thiết bị, lịch nhắc, liên hệ khẩn cấp), `/maintenance-tasks/*`, cấu hình `/alert-policy`, `/care-rules/{kind}`, `/notifications` và `/me/notification-preferences`/`/me/push-subscriptions`, `/auth/*`, `/me/sessions*`, `/workspace-views/*`, `/ingest/telemetry`, `/alerts/*`, `/devices/*`, `/invitations/*`, `/ingest/events`, `/subjects/{id}/assistant/*`, `/health` và `/subjects/{id}/events`.
- Validator nội bộ `scripts/openapi-validate.mjs` + **10 test** (`test/openapi-validate.test.mjs`): operationId duy nhất, tag khai báo, path param đủ/required, response 2xx có content (204 không content), security scheme/scope hợp lệ, parameter không trùng, ref tồn tại.
- Script kiểm:
  - `$ref` trỏ đúng component;
  - path param khớp placeholder;
  - operation có `operationId`/`responses`;
  - artifact khớp schema khi chạy `--check`.
- Thêm script package:
  - `pnpm openapi:generate`
  - `pnpm openapi:check`

## Kết quả

| Kiểm | Kết quả |
| --- | --- |
| `openapi:generate` | 79 path/99 operation/105 schema; artifact 610 KB |
| `openapi:check` | khớp schema Zod, ref/path param hợp lệ |
| Docs `build.py --check` | 373 liên kết / 296 ID / 22 mục |
| Payload mẫu | 5/5 |
| API test | **35 suite / 325 test pass**, gồm 1 test hợp đồng route OpenAPI; randomized **325/325** |
| Validator nội bộ | **10/10 test pass** (`pnpm --filter @heart-iot/contracts test`) |
| CI | `.github/workflows/ci.yml` đã thêm; **chưa chạy trên GitHub** |

## Giới hạn

- **Phủ đủ route, chưa phải hợp đồng runtime đầy đủ**: path khai báo thủ công; test so **route** của toàn bộ 21 controller nhưng không so request/response schema với runtime. Một số response được mô tả inline (health, SSE) thay vì schema Zod đầy đủ.
- Validator nội bộ chỉ kiểm cấu trúc; **chưa kiểm bằng validator OpenAPI độc lập** (Redocly/Swagger).
- Test route đọc metadata decorator, không chứng minh guard/quyền/response thật; enforcement vẫn nằm ở service/controller.
- Chưa dùng artifact để sinh client; đã có workflow CI nhưng chưa chạy trên GitHub.
- Schema JSON do Zod sinh có thể mất một số ràng buộc `.refine/.superRefine`; không thay kiểm nghiệp vụ ở backend.

## Nguồn

- `packages/contracts/scripts/generate-openapi.mjs`
- `backend/test/openapi.spec.ts`
- `docs/api/openapi.v1.json`
- `docs/04-du-lieu-va-giao-tiep.md`
- `packages/contracts/README.md`
- `backend/src/subjects/subjects.controller.ts`, `backend/src/measurements/measurements.controller.ts`, `backend/src/visit-reports/visit-report.controller.ts`, `backend/src/incidents/incidents.controller.ts`, `backend/src/devices/devices.controller.ts`, `backend/src/care/care.controller.ts`, `backend/src/reminders/reminders.controller.ts`, `backend/src/emergency-contacts/emergency-contacts.controller.ts`, `backend/src/maintenance/maintenance.controller.ts`, `backend/src/alert-policy/alert-policy.controller.ts`, `backend/src/care-rules/care-rules.controller.ts`, `backend/src/notifications/notifications.controller.ts`, `backend/src/notifications/notification-settings.controller.ts`, `backend/src/auth/auth.controller.ts`, `backend/src/studio/studio.controller.ts`, `backend/src/ingest/ingest.controller.ts`, `backend/src/health/health.controller.ts`, `backend/src/realtime/realtime.controller.ts`, `packages/contracts/src/health.ts`
