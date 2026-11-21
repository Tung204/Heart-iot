# Kiểm thử liên thành phần

**Trạng thái:** các package đã có test executable chạy trên máy cục bộ — `backend` (Jest + PGlite in-memory, **29 suite/287 test** ngày 21/11/2026), `frontend` (Vitest + Testing Library, số cũ 20 file/73 test), `frontend/e2e` (Playwright, số cũ 4 test) và `tools/simulator` (node:test, 23 test); repo **chưa có CI tự động**. Chạy lại thay vì tin tài liệu. Thư mục này **chưa có test** — dành cho integration/E2E
liên thành phần qua ranh giới thiết bị → ingest → lưu trữ → cảnh báo → người nhận khi thực sự cần.
Ma trận yêu cầu/kịch bản và cách đo nằm tại [kiểm thử và đánh giá](../docs/08-kiem-thu-va-danh-gia.md).

Unit test đặt gần module sở hữu hành vi khi chọn framework. Thư mục này dành cho integration/E2E qua ranh giới thiết bị → ingest → lưu trữ → cảnh báo → người nhận, và fixture tổng hợp dùng chung khi thực sự cần.

Ưu tiên lint/type-check rồi test nhỏ nhất liên quan; chạy tuần tự mặc định. Test cần bảo vệ quyền, idempotency, state transition, quality/time và khôi phục sau lỗi. Không viết test chỉ để khẳng định tên file/thư mục có mặt hoặc mô phỏng lại nội bộ framework.

Kết quả phần cứng/AI cần thông số và bằng chứng riêng; không gọi một JSON parse thành công là test hệ thống IoT đạt.

## Kiểm tài liệu và payload mẫu

```bash
pnpm build:contracts                   # sinh packages/contracts/dist (schema zod)
node tools/docs/check-examples.mjs     # parse mọi file packages/contracts/examples/*.json bằng schema tương ứng
python tools/docs/build.py --check     # HTML sinh từ Markdown/JSON khớp nguồn đầu vào
```

`check-examples.mjs` bắt buộc mỗi file mẫu phải có ánh xạ schema; thêm file mới mà quên khai báo sẽ fail,
không bỏ qua âm thầm. `build.py --check` chỉ kiểm cú pháp JSON và liên kết/ID của HTML, không thay kiểm schema.
