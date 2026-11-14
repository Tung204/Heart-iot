# Backend API — An Nhiên

NestJS 11 (CJS) + Drizzle ORM, chạy mặc định trên **PGlite** và có thể dùng **PostgreSQL** qua
`DATABASE_URL`. Đây là backend modular monolith cho đồ án An Nhiên, không phải dịch vụ production
đã benchmark.

## Chạy

```bash
# Ở root: cài dependency + build contracts
pnpm install && pnpm build:contracts

# Tạo DB demo + dữ liệu tổng hợp (API phải tắt vì PGlite độc quyền file)
cd apps/api && pnpm seed

# Dev (cổng 3000)
cd apps/api && pnpm dev

# Hoặc build rồi chạy
pnpm build && node dist/src/main.js
```

API base: `http://localhost:3000/api/v1`; health: `GET /api/v1/health`.
Biến môi trường xem `.env.example` ở root. Không commit `.env` hoặc khóa thiết bị thật.

## Kiểm

```bash
cd apps/api
pnpm typecheck
pnpm test        # Jest + PGlite in-memory; không cần API đang chạy
pnpm db:generate # sinh migration Drizzle khi đổi schema
pnpm db:migrate  # áp migration (dừng API trước)
```

## Module và ranh giới

`auth`, `access`, `subjects`, `care`, `devices`, `device-auth`, `ingest`, `measurements`, `incidents`,
`notifications`, `realtime`, `studio`, `assistant`, `maintenance`, `admin`, `policy`.

- Kiểm quyền theo **hồ sơ** tập trung ở `AccessService`; không dựa vào role admin để đọc dữ liệu sức khỏe.
- Ingest thiết bị xác thực bằng header thiết bị; không dùng cookie người dùng.
- Cảnh báo dùng revision đơn điệu, ACK/đóng compare-and-set, outbox + SSE.
- AI không nằm trên đường cảnh báo; không cấu hình provider vẫn có tóm tắt theo mẫu.
- Studio publish dùng CAS `baseRevision + digest`; rollback tạo bản công bố mới.
- Outbox hiện chỉ giao **trong ứng dụng**; chưa có Web Push/email/SMS.

## Giới hạn đã biết

- PGlite chỉ an toàn với một tiến trình trên một data dir; dừng API trước khi seed/migrate.
- Chưa benchmark PostgreSQL thật, nhiều instance, MQTT broker/ACL/ACK hay tải đồng thời.
- Chưa có firmware/đo thật; dữ liệu demo là tổng hợp và có nhãn.
- OpenAPI máy sinh chưa làm; hợp đồng nguồn nằm ở `packages/contracts`.

Nguồn thiết kế: [kiến trúc](../../docs/03-kien-truc-he-thong.md), [dữ liệu/API](../../docs/04-du-lieu-va-giao-tiep.md),
[kế hoạch + trạng thái](../../docs/14-ke-hoach-trien-khai-phan-mem.md).
