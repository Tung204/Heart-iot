# Retention dữ liệu theo tuổi — bằng chứng lát cắt (21/11/2026)

## Phạm vi

Thêm job retention **mặc định tắt**, không có ngày mặc định. Chỉ bật khi cấu hình
`RETENTION_ENABLED=true` và ít nhất một `RETENTION_*_DAYS`:

- `RETENTION_TELEMETRY_DAYS` — xóa mẫu đo cũ theo `received_at`;
- `RETENTION_NOTIFICATION_DAYS` — xóa outbox đã kết thúc (`sent`/`failed`/`superseded`);
- `RETENTION_REALTIME_DAYS` — xóa sự kiện SSE cũ;
- `RETENTION_AI_SUMMARY_DAYS` — xóa tóm tắt AI cũ;
- `RETENTION_ASSISTANT_DRAFT_DAYS` — xóa nháp trợ lý **đã hết hạn** (`expires_at`), không xóa nháp còn hiệu lực.

Job chạy một lần/ngày theo UTC (`job_runs` khóa `retention:<ngày>`), xóa theo lô
500, ghi audit `retention.purge` với cutoff và số dòng đã xóa. Admin có
`GET /admin/retention/preview` **chỉ đọc**: đếm theo đúng env/cutoff nhưng không
xóa, không ghi `job_runs`; chưa có API đổi cấu hình. Không xóa hồ sơ,
incident, audit, care link, cấu hình hay backup. Đây **không** thay luồng
`deletion-requests`/xóa cứng toàn bộ dữ liệu (D5 chưa chốt).

## Kiểm chứng đã chạy

| Lệnh/hạng mục | Kết quả |
| --- | --- |
| `pnpm --filter @heart-iot/api typecheck` | pass |
| `node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/retention.spec.ts` | **3/3 test pass** |
| `test/admin.spec.ts` (preview retention + job nền) | **11/11 test pass** |
| Full API suite | **34 suite / 317 test pass** |
| Randomized seed `20261121` | **317/317 pass** |
| Migration | `0008_smart_wrecker.sql` thêm index retention; `0010_confused_klaw.sql` thêm index `assistant_drafts.expires_at`; test migrate từ DB rỗng |
| `pnpm -r typecheck` | pass toàn monorepo |
| `pnpm --filter @heart-iot/api build` (`nest build`) | pass |
| Docs `build.py --check` | khớp nguồn, **369 liên kết/296 ID/22 mục** |
| Payload mẫu / MQTT exposure | **5/5** payload; **16/16** kiểm tra tĩnh |

Test kiểm: mặc định tắt không xóa; preview chỉ đọc đếm đúng từng lớp và không xóa; khi bật chỉ xóa bản cũ đúng lớp, giữ bản mới, outbox `pending` và nháp trợ lý còn hiệu lực; audit có số đếm; chạy lại cùng ngày bị `job_runs` skip. Admin preview từ chối user thường.

## Giới hạn

- Có API preview chỉ đọc cho admin; **chưa có API/UI đổi cấu hình** (vẫn qua env) và chưa có policy version/publish CAS cho retention.
- Randomized lần đầu phát hiện test audit incidents dùng `JSON.stringify(...).not.toContain("188")` trùng chuỗi trong UUID ngẫu nhiên; đã thay bằng kiểm đúng tập khóa metadata, không nới phép kiểm dữ liệu sức khỏe.
- Chưa xóa toàn bộ hồ sơ, bản export, cache AI/trình duyệt hay backup.
- Chưa kiểm PostgreSQL thật, nhiều instance/advisory lock, hay tải lớn.
- Chưa chạy job trên dữ liệu thật; chỉ PGlite in-memory với dữ liệu kiểm thử.
- Ngày retention là **quyết định của người triển khai**, không phải khuyến nghị y khoa/pháp lý.

## File chính

- `backend/src/retention/retention.service.ts`, `retention.module.ts`
- `packages/contracts/src/admin.ts` (`retentionPreviewSchema`), `backend/src/admin/{admin.controller,admin.service,admin.module}.ts`
- `backend/test/retention.spec.ts`
- `backend/drizzle/0008_smart_wrecker.sql`, `0010_confused_klaw.sql`
- `backend/src/config/env.ts`, `.env.example`
- `docs/02`, `docs/03`, `docs/04`, `docs/08`, `docs/12`, `docs/14`, `README.md`
