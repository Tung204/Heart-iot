# OpenAPI một phần từ Zod — bằng chứng

**Ngày:** 21/11/2026; cập nhật 22/11/2026 (mở rộng hồ sơ, số đo, phiếu đi khám, cảnh báo, thiết bị, chia sẻ chăm sóc)

**Nhánh:** `v10-backend` (chưa merge/push)  
**Phạm vi:** artifact hợp đồng cho quản trị, trợ lý, hồ sơ, số đo, phiếu đi khám, cảnh báo, thiết bị và chia sẻ chăm sóc; bổ sung route/schema và test hợp đồng, không đổi hành vi API/UI.

## Đã làm

- Thêm `packages/contracts/scripts/generate-openapi.mjs` dùng `z.toJSONSchema` (Zod 4.6.7, không thêm dependency).
- Bổ sung `GET /subjects/{id}/assistant/summary` và `POST /subjects/{id}/assistant/ask` để phủ đủ route `AssistantController`.
- Sau khi thêm nháp `maintenance_task.create`, schema `AssistantDraft`/`CreateAssistantDraft`/`UpdateAssistantDraft` sinh dạng `oneOf` theo capability; artifact tăng lên 131 KB; sau khi phủ hồ sơ/số đo/phiếu đi khám là 205 KB.
- Thêm `backend/test/openapi.spec.ts`: đọc metadata decorator của `AdminController`, `AdminDevicesController`, `AssistantController`, `SubjectsController`, `MeasurementsController`, `VisitReportController`, `IncidentsController`, `SubjectDevicesController`, `CareController`, so chính xác tập route với artifact (không mở app/DB).
- Phủ thêm 11 operation của hồ sơ/số đo/phiếu đi khám: `GET/POST /subjects`, `GET/PATCH /subjects/{id}`, archive, deletion-requests, measurements, daily-summary, insights, export.csv và visit-report.
- Phủ thêm 5 operation cảnh báo: ingest sự kiện thiết bị (header `x-device-id`/`x-device-key`, `security: []`), danh sách/chi tiết cảnh báo, ACK và đóng cảnh báo theo version; artifact tăng lên **256 KB**.
- Phủ thêm 8 operation thiết bị: tạo/list admin, cấp lại claim code, xoay khóa, claim/list thiết bị theo hồ sơ, trạng thái hồ sơ và thu hồi thiết bị; artifact tăng lên **298 KB**.
- Phủ thêm 6 operation chia sẻ chăm sóc: tạo/list lời mời, xem trước công khai, chấp nhận lời mời, list/thu hồi care link; token lời mời chỉ trả một lần; artifact tăng lên **336 KB**.
- Sinh `docs/api/openapi.v1.json` (OpenAPI 3.1.0):
  - 43 path, 50 operation;
  - 58 component schema;
  - cookie session `an_session`;
  - nhóm `/admin/*` (gồm `/admin/devices`), `/assistant/*`, `/subjects/*` (hồ sơ, số đo, phiếu đi khám, cảnh báo, thiết bị), `/alerts/*`, `/devices/*`, `/invitations/*`, `/ingest/events` và `/subjects/{id}/assistant/*`.
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
| `openapi:generate` | 43 path/50 operation/58 schema; artifact 336 KB |
| `openapi:check` | khớp schema Zod, ref/path param hợp lệ |
| Docs `build.py --check` | 373 liên kết / 296 ID / 22 mục |
| Payload mẫu | 5/5 |
| API test | **35 suite / 325 test pass**, gồm 1 test hợp đồng route OpenAPI; randomized **325/325** |

## Giới hạn

- **Không phải toàn bộ API**: path khai báo thủ công trong script; mới phủ quản trị, trợ lý, hồ sơ, số đo, phiếu đi khám, cảnh báo, thiết bị và chia sẻ chăm sóc, chưa phủ reminders/contacts/reports khác. Test hợp đồng chỉ so **route**, không so request/response schema với runtime.
- Chưa kiểm bằng validator OpenAPI độc lập (Redocly/Swagger); script chỉ kiểm cấu trúc tối thiểu và ref.
- Test route đọc metadata decorator, không chứng minh guard/quyền/response thật; enforcement vẫn nằm ở service/controller.
- Chưa dùng artifact để sinh client; chưa có CI.
- Schema JSON do Zod sinh có thể mất một số ràng buộc `.refine/.superRefine`; không thay kiểm nghiệp vụ ở backend.

## Nguồn

- `packages/contracts/scripts/generate-openapi.mjs`
- `backend/test/openapi.spec.ts`
- `docs/api/openapi.v1.json`
- `docs/04-du-lieu-va-giao-tiep.md`
- `packages/contracts/README.md`
- `backend/src/subjects/subjects.controller.ts`, `backend/src/measurements/measurements.controller.ts`, `backend/src/visit-reports/visit-report.controller.ts`, `backend/src/incidents/incidents.controller.ts`, `backend/src/devices/devices.controller.ts`, `backend/src/care/care.controller.ts`
