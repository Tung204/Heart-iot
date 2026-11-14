# ADR 0002 — Nền tảng triển khai phần mềm v1

- **Ngày:** 14/11/2026
- **Trạng thái:** `accepted` trong phạm vi quyết định kỹ thuật của lead. Không phải phê duyệt của giảng viên/nhà trường.
- **Liên quan:** [yêu cầu](../02-yeu-cau-va-pham-vi.md), [kiến trúc](../03-kien-truc-he-thong.md), [AI/cấu hình động](../11-nen-tang-ai-va-cau-hinh-dong.md), [kế hoạch v1](../14-ke-hoach-trien-khai-phan-mem.md)

## Bối cảnh

Repository mới có tài liệu, chưa có mã. Cần một nền tảng chạy được trên laptop Windows hiện tại, không có Docker daemon, không có PostgreSQL cục bộ, nhưng vẫn giữ đường triển khai PostgreSQL thật. Yêu cầu quyền theo hồ sơ, transaction, chống trùng, preview và AI có ranh giới rõ.

## Quyết định

1. **Monorepo pnpm** (`apps/api`, `apps/web`, `packages/contracts`, `tools/simulator`). Một lockfile, chạy song song theo package.
2. **API NestJS 11.2.10 + TypeScript 5.9**, module theo nghiệp vụ. Dùng Express 5 mặc định.
3. **Drizzle ORM + PostgreSQL dialect**. Dev/test mặc định **PGlite** (PostgreSQL WASM, lưu đĩa hoặc in-memory); triển khai dùng **PostgreSQL** qua driver `pg` khi có `DATABASE_URL`.
4. **Xác thực**: phiên lưu DB, cookie `HttpOnly; SameSite=Lax; Path=/`, hash mật khẩu `scrypt` của Node. Kiểm `Origin` cho phương thức ghi; rate limit đăng nhập đơn giản.
5. **Realtime**: SSE + bảng `realtime_events` làm cursor. Mỗi vòng gửi kiểm lại quyền; thu hồi đóng stream.
6. **MQTT**: adapter `mqtt` 5; broker triển khai Mosquitto (compose); test tích hợp dùng `aedes` in-process.
7. **AI**: `AiProvider` adapter HTTP (OpenAI-compatible) tùy chọn; mặc định **fallback xác định** tính từ aggregate. Không gọi provider khi chưa cấu hình; output ghi rõ nguồn/cách sinh.
8. **Dynamic view**: JSON config có schema/version, renderer whitelist; preview chỉ đọc; publish dùng `base_revision` + digest; rollback tạo publication mới.
9. **Không dùng OpenAPI sinh tay** trong v1: hợp đồng là zod schema dùng chung + test. Khi bổ sung OpenAPI phải sinh từ nguồn, không viết bản thứ hai.

## Hệ quả

- Không cần Docker để chạy demo; PGlite không đại diện hiệu năng/extension của PostgreSQL thật, phải ghi rõ khi báo cáo.
- Cùng schema nhưng khác driver cần kỷ luật SQL chuẩn; test migration chạy trên PGlite, PostgreSQL thật là đường triển khai chưa kiểm trong lượt này.
- NestJS 12 là ESM-only; API dùng CommonJS + Jest nên chọn NestJS 11.2.10 (CJS, Node 20+). Mọi API dùng phải đối chiếu docs đúng version, không dựa ví dụ cũ. Khi nâng lên 12 phải chuyển cả API sang ESM và thêm `.js` cho import tương đối.
- Cookie session cần CSRF: áp dụng kiểm Origin và giới hạn CORS; chưa hỗ trợ client cross-site.
- AI fallback không phải LLM; UI phải phân biệt "AI" và "tóm tắt theo mẫu", không gắn nhãn sai.

## Phương án đã cân nhắc

| Phương án | Lý do không chọn mặc định |
| --- | --- |
| PostgreSQL + Docker Compose ngay | Docker daemon không chạy; chặn tiến độ và test tái lập |
| SQLite | Khác dialect, mất ràng buộc/transaction giống PostgreSQL, không khớp hợp đồng đã thiết kế |
| Prisma | Migration/type tốt nhưng driver PGlite không phải đường chính thức; Drizzle hỗ trợ PGlite trực tiếp |
| Next.js full-stack | Gộp API/web, khó tách ranh giới quyền và ingest; SPA + API rõ hơn cho đồ án |
| JWT stateless | Khó thu hồi phiên ngay và kiểm quyền hiện tại; session DB phù hợp yêu cầu thu hồi |

## Bằng chứng cần có trước khi coi là hoàn chỉnh

- Migration từ DB rỗng chạy được trên PGlite; test API dùng DB in-memory độc lập.
- Ít nhất một lần chạy PostgreSQL thật (compose hoặc server có sẵn) nếu môi trường cho phép — **chưa chạy trong lượt này**.
- Test adapter AI với mock server và fallback khi lỗi; không gọi dịch vụ thật.
- E2E Playwright cho luồng đăng nhập → xem cảnh báo → xác nhận/đóng; preview studio không ghi dữ liệu.
