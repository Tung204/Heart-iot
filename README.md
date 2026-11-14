# Đồ án sức khỏe IoT — An Nhiên

**Hệ thống giám sát sức khỏe và cảnh báo té ngã cho người cao tuổi, có trợ lý AI hỗ trợ đọc dữ liệu.**

Repo này là bản triển khai phần mềm của đồ án: API nghiệp vụ, web responsive cho người dùng/người thân/quản trị, simulator thiết bị và bộ dữ liệu demo tổng hợp. Thiết kế gốc nằm trong `docs/`; kế hoạch và trạng thái triển khai ở [docs/14](docs/14-ke-hoach-trien-khai-phan-mem.md).

> **Trạng thái 14/11/2026:** đã có mã chạy được trong phạm vi kỹ thuật, có test và luồng demo end-to-end trên máy cục bộ. **Chưa** có firmware ESP32, chưa đo độ chính xác phát hiện ngã, chưa benchmark PostgreSQL thật, chưa Web Push và chưa được giảng viên nghiệm thu. Không dùng repo này để khẳng định sản phẩm đã hoàn chỉnh.

## Chạy nhanh

Yêu cầu: Node.js ≥ 24, pnpm 12. Docker/PostgreSQL không bắt buộc (mặc định dùng PGlite).

```bash
# 1) Cài dependency và build hợp đồng dùng chung
pnpm install
pnpm build:contracts

# 2) Tạo DB demo + dữ liệu tổng hợp (chạy khi API đang tắt)
cd apps/api && pnpm seed && cd ../..

# 3) API (cổng 3000)
cd apps/api && pnpm dev

# 4) Web (cổng 5173) — mở terminal khác
cd apps/web && pnpm dev
```

Mở http://localhost:5173. Tài khoản demo (mật khẩu chỉ dùng cho demo cục bộ):

| Vai trò | Email | Mật khẩu |
| --- | --- | --- |
| Chủ hồ sơ | `ba-an@demo.annhien.local` | `demo-an-nhien-2026` |
| Người thân | `minh@demo.annhien.local` | `demo-an-nhien-2026` |
| Quản trị | `admin@demo.annhien.local` | `demo-admin-2026` |

Thiết bị demo cho simulator:

```bash
export ANNHIEN_DEVICE_ID=dddddddd-dddd-4ddd-8ddd-dddddddddddd
export ANNHIEN_DEVICE_KEY=demo-device-key-AN-2026-001
cd tools/simulator && npx tsx src/cli.ts demo --fast
```

Simulator gửi telemetry/sự kiện ngã qua đúng đường thiết bị (`POST /api/v1/ingest/*`), không dùng cookie hay đường tắt quyền.

## Kiểm thử

```bash
pnpm -r typecheck

cd apps/api && pnpm test                  # Jest, PGlite in-memory
cd apps/web && pnpm test && pnpm build    # Vitest + build production
cd tools/simulator && npm test            # node:test
cd apps/web && pnpm test:e2e              # Playwright (cần web/API đang chạy)
```

Bằng chứng test/handoff/review nằm ở `reports/handoffs/`, `reports/qa/`, `reports/worklog/`. Không dùng kết quả trong tài liệu thay cho việc chạy lại.

## Thành phần

```text
apps/
  api/                  NestJS 11, Drizzle, PGlite/PostgreSQL, Jest
  web/                  React 19, Vite, TanStack Query, Vitest, Playwright
packages/contracts/     Schema zod dùng chung cho API/web/simulator
tools/simulator/        CLI giả lập thiết bị (telemetry, fall, queue retry)
infra/                  compose PostgreSQL/Mosquitto tham khảo, chưa chạy trong lượt này
docs/                   Thiết kế, yêu cầu, quyết định, HTML sinh từ Markdown
reports/                Handoff, worklog, journal điều phối, báo cáo review
```

Backend là modular monolith: `auth`, `access`, `subjects`, `care`, `devices`, `ingest`, `measurements`, `incidents`, `notifications`, `realtime`, `studio`, `assistant`, `maintenance`, `admin`. UI và trợ lý dùng chung service nghiệp vụ; AI không nằm trên đường cảnh báo.

## Quyết định kỹ thuật chính

- Phiên đăng nhập bằng cookie HttpOnly + bảng `sessions` (thu hồi ngay), không dùng JWT.
- PGlite mặc định cho dev/test; cùng schema Drizzle chạy được PostgreSQL qua `DATABASE_URL`.
- Cảnh báo: revision đơn điệu, ack/resolve compare-and-set, outbox + SSE, thu hồi quyền đóng stream.
- Studio: draft → preview chỉ đọc → publish CAS `baseRevision + digest` → rollback tạo bản mới.
- Trợ lý: tổng hợp số liệu thật, adapter OpenAI-compatible tùy chọn, fallback template xác định; không chẩn đoán/kê đơn.
- Dữ liệu demo được đánh dấu `source=simulator` / `is_synthetic=true`; UI hiển thị nhãn mô phỏng.

ADR: [docs/decisions/0002-nen-tang-trien-khai.md](docs/decisions/0002-nen-tang-trien-khai.md).

## Giới hạn đã biết

- PGlite mở file DB độc quyền theo process: dừng API trước khi `pnpm seed`/migration.
- Chưa kiểm PostgreSQL thật, nhiều instance, MQTT broker/ACL/ACK, Web Push/email.
- AI dài hạn (`agent_runs`, planner/tool registry, scheduler) chưa triển khai.
- Frontend chưa code-split; bundle còn >500 kB.
- Không có số liệu đo thật, độ chính xác ngã, BOM hay thời lượng pin.

## Đọc tiếp

- [Mục lục tài liệu](docs/README.md)
- [Yêu cầu và phạm vi](docs/02-yeu-cau-va-pham-vi.md)
- [Kiến trúc](docs/03-kien-truc-he-thong.md)
- [Dữ liệu và giao tiếp](docs/04-du-lieu-va-giao-tiep.md)
- [Trải nghiệm và màn hình](docs/06-trai-nghiem-va-man-hinh.md)
- [Kế hoạch triển khai + trạng thái](docs/14-ke-hoach-trien-khai-phan-mem.md)
- [Bản HTML ngoại tuyến](docs/html/index.html) — sinh lại bằng `python tools/docs/build.py`
