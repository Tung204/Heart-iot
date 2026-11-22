# OpenAPI một phần từ Zod — bằng chứng

**Ngày:** 21/11/2026  
**Nhánh:** `v10-backend` (chưa merge/push)  
**Phạm vi:** artifact hợp đồng cho nhóm quản trị + FR-21; backend/UI không đổi hành vi.

## Đã làm

- Thêm `packages/contracts/scripts/generate-openapi.mjs` dùng `z.toJSONSchema` (Zod 4.6.7, không thêm dependency).
- Sinh `docs/api/openapi.v1.json` (OpenAPI 3.1.0):
  - 14 path, 17 operation;
  - 18 component schema;
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
| `openapi:generate` | 14 path; artifact 89 KB |
| `openapi:check` | khớp schema Zod, ref/path param hợp lệ |
| Docs `build.py --check` | 372 liên kết / 296 ID / 22 mục |
| Payload mẫu | 5/5 |
| API test | không đổi: 34 suite / 317 test (không thêm test API) |

## Giới hạn

- **Không phải toàn bộ API**: path khai báo thủ công trong script; chỉ phủ quản trị + trợ lý.
- Chưa đối chiếu tự động với danh sách route/controller, nên path có thể lệch nếu controller đổi mà script không cập nhật.
- Chưa kiểm bằng validator OpenAPI độc lập (Redocly/Swagger); script chỉ kiểm cấu trúc tối thiểu và ref.
- Chưa dùng artifact để sinh client hay chạy contract test; chưa có CI.
- Schema JSON do Zod sinh có thể mất một số ràng buộc `.refine/.superRefine`; không thay kiểm nghiệp vụ ở backend.
- Không chứng minh quyền/response runtime; enforcement vẫn nằm ở service/controller.

## Nguồn

- `packages/contracts/scripts/generate-openapi.mjs`
- `docs/api/openapi.v1.json`
- `docs/04-du-lieu-va-giao-tiep.md`
- `packages/contracts/README.md`
