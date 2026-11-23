# Live smoke PostgreSQL — bằng chứng

**Ngày:** 23/11/2026  
**Nhánh:** `v10-backend`, commit `6720f5b`  
**Mục đích:** chạy API trên **PostgreSQL thật**, không dùng PGlite/Jest; kiểm migration, seed, quyền và luồng nháp → confirm.

## Chạy cục bộ

- Docker `postgres:17-alpine` (PostgreSQL **17.11**), container tạm, DB dùng một lần.
- `DATABASE_URL=postgres://heartiot:…@localhost:55432/heartiot`.
- `pnpm --filter @heart-iot/api db:migrate` → áp migration cho postgres.
- `pnpm --filter @heart-iot/api seed` → seed demo.
- `node backend/dist/src/main.js`, cổng 3031.
- Gọi HTTP bằng `curl`/Node `fetch`, cookie thật.

## Kết quả cục bộ

| Kiểm | Kết quả |
| --- | --- |
| `GET /health` | 200, `database=up` |
| Login owner/admin | 200 |
| `/me`, `/subjects`, `/alerts`, `/notifications`, assistant summary | 200 |
| Admin `/admin/jobs`, `/admin/outbox/summary` | 200 |
| Tạo nháp từ câu tiếng Việt | 201, times/ngày đúng |
| Confirm | 200, `result.type=care_reminder` |
| Confirm lặp | 200, cùng id |
| Danh sách lịch nhắc | đúng **một** lịch với id vừa tạo |

Sau khi chạy: dừng API, xóa container, xóa file body tạm. Không đụng DB demo.

## CI GitHub Actions

Workflow `.github/workflows/ci.yml` có thêm job `PostgreSQL smoke`:

- service `postgres:17-alpine` với healthcheck;
- build contracts/API, migrate, seed;
- chạy `pnpm --filter @heart-iot/api smoke:postgres` (script `backend/scripts/postgres-smoke.mjs`);
- script tự khởi động API, kiểm health/login/quyền/read endpoints/nháp → confirm → đúng một lịch/logout, rồi dừng process.

**Run `45201826671` ngày 23/11/2026: cả hai job pass.**

- URL: https://github.com/Tung204/Heart-iot/actions/runs/45201826671
- `check`: 3m55s
- `PostgreSQL smoke`: 42s

## Giới hạn

- Không kiểm tải, tranh chấp, nhiều instance, connection pool cạn, failover, backup/restore.
- DB seed demo, không phải dữ liệu thật.
- Không kiểm MQTT/Web Push/AI provider/UI trình duyệt.
- Đây là smoke luồng chính, không phải toàn bộ API hay security audit.
- Script không tự migrate/seed để tránh xóa nhầm DB; CI/local phải chạy migration/seed trước.

## Nguồn

- `backend/scripts/postgres-smoke.mjs`
- `.github/workflows/ci.yml`
- `backend/package.json` (`smoke:postgres`)
- Run GitHub Actions `45201826671`
