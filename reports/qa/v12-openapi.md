# OpenAPI một phần từ Zod — bằng chứng

**Ngày:** 21/11/2026; cập nhật 22/11/2026

**Nhánh:** `v10-backend` (chưa merge/push)  
**Phạm vi:** artifact hợp đồng cho nhóm quản trị + trợ lý; bổ sung route/schema trợ lý và test hợp đồng, không đổi route hiện hữu.

## Đã làm

- Thêm `packages/contracts/scripts/generate-openapi.mjs` dùng `z.toJSONSchema` (Zod 4.6.7, không thêm dependency).
- Bổ sung `GET /subjects/{id}/assistant/summary` và `POST /subjects/{id}/assistant/ask` để phủ đủ route `AssistantController`.
- Sau khi thêm nháp `maintenance_task.create`, schema `AssistantDraft`/`CreateAssistantDraft`/`UpdateAssistantDraft` sinh dạng `oneOf` theo capability; artifact tăng lên 131 KB.
- Thêm `backend/test/openapi.spec.ts`: đọc metadata decorator của `AdminController`/`AssistantController`, so chính xác tập route với artifact (không mở app/DB).
- Sinh `docs/api/openapi.v1.json` (OpenAPI 3.1.0):
  - 17 path, 20 operation;
  - 22 component schema;
  - cookie session `an_session`;
  - nhóm `/admin/*` và `/assistant/*` + `/subjects/{id}/assistant/*`.
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
| `openapi:generate` | 17 path; artifact 131 KB |
| `openapi:check` | khớp schema Zod, ref/path param hợp lệ |
| Docs `build.py --check` | 373 liên kết / 296 ID / 22 mục |
| Payload mẫu | 5/5 |
| API test | **35 suite / 325 test pass**, gồm 1 test hợp đồng route OpenAPI; randomized **325/325** |

## Giới hạn

- **Không phải toàn bộ API**: path khai báo thủ công trong script; chỉ phủ quản trị + trợ lý. Test hợp đồng chỉ so **route**, không so request/response schema với runtime.
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
