# Backend API — Heart-iot

NestJS 11 (CJS) + Drizzle ORM, chạy mặc định trên **PGlite** và có thể dùng **PostgreSQL** qua
`DATABASE_URL`. Đây là backend modular monolith cho Heart-iot, không phải dịch vụ production
đã benchmark.

## Chạy

```bash
# Ở root: cài dependency + build contracts
pnpm install && pnpm build:contracts

# Tạo DB demo + dữ liệu tổng hợp (API phải tắt vì PGlite độc quyền file)
cd backend && pnpm seed

# Dev (cổng 3000)
cd backend && pnpm dev

# Hoặc build rồi chạy
pnpm build && node dist/src/main.js
```

API base: `http://localhost:3000/api/v1`; health: `GET /api/v1/health`.
Biến môi trường xem `.env.example` ở root. Không commit `.env` hoặc khóa thiết bị thật.
`MAX_CLOCK_SKEW_SECONDS` (mặc định 120) và `SUSPECTED_TIMEOUT_MINUTES` (mặc định 10) là chính sách
demo cho cách ly/lifecycle cảnh báo, chưa phải ngưỡng y khoa đã chốt.

## Kiểm

```bash
cd backend
pnpm typecheck
pnpm test        # Jest + PGlite in-memory; không cần API đang chạy
pnpm test:random --seed=1288443891  # kiểm phụ thuộc thứ tự test
pnpm db:generate # sinh migration Drizzle khi đổi schema
pnpm db:migrate  # áp migration (dừng API trước)
pnpm seed
```

Lần chạy ngày **15/11/2026**: `pnpm test` **20 suite / 214 test pass** (109,2 s). Chạy randomized
cùng ngày với seed `1288443891`: **214/214**; các test audit đã scope theo đối tượng, không phụ thuộc thứ tự.
Con số có thể thay đổi; luôn chạy lại thay vì tin README.

## Module và ranh giới

`auth`, `access`, `subjects`, `care`, `emergency-contacts`, `devices` (kèm `device-auth`), `ingest`,
`measurements`, `incidents`, `notifications`, `realtime`, `studio`, `assistant`, `maintenance`,
`admin`, `policy`, `health`.

- Kiểm quyền theo **hồ sơ** tập trung ở `AccessService`; không dựa vào role admin để đọc dữ liệu sức khỏe.
- Quyền xem số đo (`canViewMeasurements`) tách khỏi quyền nhận cảnh báo. Người thân có thể nhận cảnh báo
  mà không xem nhịp tim/bước chân/lịch sử/CSV; trợ lý AI cần cả quyền số đo và `canViewAi`.
- Ingest thiết bị xác thực bằng header thiết bị; không dùng cookie người dùng. HTTP là đường đang hỗ trợ;
  adapter MQTT chỉ subscribe telemetry và chỉ bật khi có `MQTT_URL`, không thay đường ingest chính thức.
- Telemetry/sự kiện được gán theo **assignment tại `measured_at`**; mẫu lệch giờ/ngoài assignment bị cách ly.
  Telemetry cách ly trả 202 `accepted` + `code=QUARANTINED`; sự kiện cách ly trả 202 `rejected` +
  `code=QUARANTINED` và không tạo incident/outbox/SSE.
- Cảnh báo dùng revision đơn điệu, ACK/đóng compare-and-set, outbox + SSE. Vòng đời có `suspected`,
  `unconfirmed`, `open`, `acknowledged`, `resolved`, `cancelled`; khóa tài khoản/phiên hết hạn hoặc thu hồi
  care link làm SSE gửi `revoked` và đóng stream.
- Cài đặt tài khoản: `PATCH /me`, đổi mật khẩu (thu hồi phiên khác), xem/thu hồi phiên.
- Hồ sơ có lưu trữ (`POST /subjects/:id/archive`, 204, không xóa dữ liệu) và ghi nhận yêu cầu xóa
  (`POST /subjects/:id/deletion-requests`, 202 `recorded`, chỉ audit). **Chưa có xóa cứng/retention.**
- Liên hệ khẩn cấp tối đa 5/hồ sơ; chủ hồ sơ ghi, caregiver có `canReceiveAlerts` đọc.
- Công việc bảo trì: xem/đóng theo quyền; chủ hồ sơ tạo cho thiết bị đang gắn.
- Studio publish dùng CAS `baseRevision + digest`; rollback tạo bản công bố mới; dữ liệu tôn trọng mốc chia sẻ.
- AI không nằm trên đường cảnh báo; không cấu hình provider vẫn có tóm tắt theo mẫu; response có `dataQuality`.
- Outbox hiện chỉ giao **trong ứng dụng**; chưa có Web Push/email/SMS.

## Giới hạn đã biết

- PGlite chỉ an toàn với một tiến trình trên một data dir; dừng API trước khi seed/migrate.
- Chưa benchmark PostgreSQL thật, nhiều instance, MQTT broker/ACL/ACK hay tải đồng thời.
- MQTT chưa có ingest `events`/`status`, chưa publish ACK, chưa xác thực khóa thiết bị ở tầng ứng dụng;
  finding P0-2 vẫn mở. Không dùng MQTT cho demo cảnh báo.
- Chưa có firmware/đo thật; dữ liệu demo là tổng hợp và có nhãn.
- Chưa có xóa cứng, retention, backup/restore, TLS/secret rotation production.
- AI runtime dài hạn (`agent_runs`/`run_steps`), planner/tool registry, scheduler, RAG chưa triển khai.
- OpenAPI máy sinh chưa làm; hợp đồng nguồn nằm ở `packages/contracts`.

Nguồn thiết kế: [kiến trúc](../docs/03-kien-truc-he-thong.md), [dữ liệu/API](../docs/04-du-lieu-va-giao-tiep.md),
[kế hoạch + trạng thái](../docs/14-ke-hoach-trien-khai-phan-mem.md).
