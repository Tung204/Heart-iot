# Live smoke API — bằng chứng độc lập với Jest

**Ngày:** 23/11/2026  
**Nhánh:** `v10-backend` (70 commit trước `master`, chưa merge/push)  
**Mục đích:** chạy API thật bằng process riêng, DB PGlite mới, gọi HTTP bằng `curl` — không dùng Jest, không dùng test harness trong bộ test.

## Cách chạy

```bash
rm -rf .data/smoke-verify
PGLITE_DATA_DIR=.data/smoke-verify pnpm --filter @heart-iot/api db:migrate
PGLITE_DATA_DIR=.data/smoke-verify pnpm --filter @heart-iot/api seed
PGLITE_DATA_DIR=.data/smoke-verify PORT=3030 node backend/dist/src/main.js
```

Sau đó đăng nhập ba tài khoản demo, gọi endpoint bằng cookie thật. Server đã dừng và thư mục DB tạm đã xóa sau khi chạy.

## Kết quả

| Kiểm | Kết quả |
| --- | --- |
| `GET /health` | 200, `status=ok`, `database=up`, `ai=template_fallback` |
| Đăng nhập owner/caregiver/admin | 200 cả ba |
| `GET /me`, `/subjects`, `/subjects/:id`, alerts, notifications | 200 |
| `GET /subjects/:id/assistant/summary`, `/capabilities`, `/drafts` | 200; drafts rỗng lúc đầu |
| `GET /admin/jobs`, `/admin/outbox/summary`, `/admin/retention/preview`, `/admin/users` | 200; jobs đủ 3, retention `enabled=false`, outbox chỉ counter |
| Caregiver `GET /capabilities` | 200; cả hai capability `available=false` |
| Caregiver `PATCH /subjects/:id` | 403 |
| Caregiver tạo nháp trợ lý | 403 |
| Chưa đăng nhập `GET /me` | 401 |
| Owner gọi `/admin/jobs` | 403 |
| Tạo nháp từ câu “nhắc tôi uống nước lúc 8h30 và 20h30 hằng ngày đến 30/11” | 201; `startsOn=2026-11-24` (đã qua giờ hôm nay), `endsOn=2026-11-30`, times đúng |
| Xác nhận nháp | 200; trả `result.type=care_reminder`, một id lịch |
| Xác nhận lặp lại | 200; cùng id, không tạo bản ghi thứ hai |
| `GET /subjects/:id/reminders` | 200; lịch vừa tạo xuất hiện đúng một lần, đúng times/ngày |
| Logout | 204; `GET /me` sau đó 401 |

Ghi chú: lần gửi đầu bằng chuỗi tiếng Việt qua `curl -d` bị lỗi encoding của shell (422 `missing_request`); gửi lại bằng file JSON UTF-8 thì 201. Đây là lỗi thao tác công cụ, không phải lỗi API, nhưng cho thấy test qua shell cần kiểm encoding.

## Giới hạn — không được suy diễn quá mức

- Vẫn là **PGlite**, không phải PostgreSQL thật; chưa kiểm connection pool, migration trên PostgreSQL, backup/restore.
- Chỉ **một process**, dữ liệu seed demo; chưa kiểm tải, tranh chấp, nhiều instance.
- Không kiểm MQTT broker/ACL/TLS thật, Web Push thật, AI provider thật.
- Không kiểm UI trình duyệt; không thay E2E/axe/khả dụng.
- Không phải security audit hay pen-test; chỉ là smoke flow và quyền cơ bản.
- Không chứng minh đúng y khoa, firmware hay độ chính xác cảm biến.

## Kết luận

Smoke này chứng minh API build hiện tại khởi động, migrate/seed, xác thực cookie, phân quyền owner/caregiver/admin và luồng nháp → xác nhận → lịch nhắc hoạt động ngoài Jest. Nó **không** thay bộ test, CI thật, PostgreSQL thật hay đánh giá bảo mật.
