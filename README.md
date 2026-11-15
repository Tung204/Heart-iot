# Đồ án sức khỏe IoT — An Nhiên

**Hệ thống giám sát sức khỏe và cảnh báo té ngã cho người cao tuổi, có trợ lý AI hỗ trợ đọc dữ liệu.**

Repo này là bản triển khai phần mềm của đồ án: API nghiệp vụ, web responsive cho người dùng/người thân/quản trị, simulator thiết bị và bộ dữ liệu demo tổng hợp. Thiết kế gốc nằm trong `docs/`; kế hoạch và trạng thái triển khai ở [docs/14](docs/14-ke-hoach-trien-khai-phan-mem.md).

> **Trạng thái 15/11/2026 — v2 phần mềm:** đã có mã chạy được trong phạm vi kỹ thuật, có test và luồng demo end-to-end trên máy cục bộ. **Chưa** có firmware ESP32, chưa đo độ chính xác phát hiện ngã, chưa benchmark PostgreSQL thật, chưa Web Push, chưa xóa vĩnh viễn dữ liệu (chỉ ghi nhận yêu cầu) và chưa được giảng viên nghiệm thu. MQTT vẫn là thử nghiệm; HTTP là đường ingest chính thức. Không dùng repo này để khẳng định sản phẩm đã hoàn chỉnh.

## Tính năng hiện có

- **Tài khoản và phiên:** đăng ký/đăng nhập/đăng xuất bằng cookie HttpOnly + bảng `sessions`; đổi tên hiển thị, đổi mật khẩu (giữ phiên hiện tại, thu hồi phiên khác), xem và thu hồi từng phiên; admin khóa tài khoản sẽ thu hồi phiên.
- **Hồ sơ và chia sẻ:** tạo/sửa hồ sơ, mời người thân, chấp nhận/thu hồi quyền, giới hạn số ngày lịch sử. Quyền `canViewMeasurements` tách khỏi quyền nhận cảnh báo: người thân có thể nhận cảnh báo mà không xem nhịp tim/bước chân/lịch sử/CSV.
- **Dữ liệu đo:** ingest telemetry HTTP, chống trùng, gán theo assignment tại `measured_at`, cách ly mẫu lệch giờ/ngoài assignment; tổng hợp ngày, lịch sử có khoảng thiếu/độ phủ, CSV, xu hướng 7/14/30 ngày.
- **Cảnh báo:** vòng đời `suspected → unconfirmed/open → acknowledged → resolved/cancelled`, ack/resolve compare-and-set, outbox trong ứng dụng + SSE. Badge thông báo chưa đọc và banner cảnh báo mới hiển thị toàn tài khoản; stream bị thu hồi khi mất quyền, khóa tài khoản hoặc phiên hết hạn.
- **Liên hệ khẩn cấp:** tối đa 5 liên hệ/hồ sơ, một liên hệ chính, số điện thoại có `tel:` trong chi tiết cảnh báo; chỉ chủ hồ sơ ghi, người thân có quyền nhận cảnh báo được đọc.
- **Việc bảo trì:** xem/đóng việc theo quyền hồ sơ; chủ hồ sơ tạo việc cho thiết bị đang gắn (kiểm thiết bị, hạn xử lý, lý do đóng).
- **Lưu trữ và yêu cầu xóa:** chủ hồ sơ lưu trữ hồ sơ (thu hồi liên kết chia sẻ, **không xóa** dữ liệu) hoặc ghi nhận yêu cầu xóa dữ liệu để xử lý thủ công. Chưa có quy trình xóa cứng, retention tự động hay xóa xuyên backup/AI cache.
- **Quản trị:** người dùng, thiết bị, policy thiết bị có preview/publish CAS, audit, tổng quan. Tab thiết bị có danh sách, cấp mã gắn thiết bị và xoay khóa; tạo thiết bị mới hiện vẫn qua API admin.
- **Studio:** draft → preview chỉ đọc → publish CAS `baseRevision + digest` → rollback tạo bản mới; dữ liệu preview/data tôn trọng mốc chia sẻ và quyền cảnh báo.
- **Trợ lý AI:** tóm tắt và hỏi đáp trên aggregate đã kiểm quyền, có `dataQuality` (độ phủ, khoảng thiếu, nguồn mô phỏng, giới hạn), fallback template xác định khi chưa cấu hình provider; AI không nằm trên đường cảnh báo.

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

### PostgreSQL và MQTT qua Docker (tùy chọn)

Docker không bắt buộc cho demo. Chạy mặc định chỉ dựng PostgreSQL:

```bash
docker compose -f infra/compose.yaml up -d
```

`docker compose` mặc định **không** dựng MQTT: service `mosquitto` nằm sau profile `mqtt-experimental`, chỉ bind `127.0.0.1` và bắt buộc `password_file` + ACL theo `device_id`. Adapter MQTT hiện chỉ subscribe telemetry — chưa có ingest fall/SOS/status, chưa xác thực khóa thiết bị ở tầng ứng dụng và chưa publish ACK — nên **không** dùng MQTT cho demo cảnh báo. `POST /api/v1/ingest/*` là đường duy nhất đang hỗ trợ. Cách tạo credential cục bộ, cách bật profile và giới hạn của broker: [`infra/README.md`](infra/README.md).

## Kiểm thử

```bash
pnpm -r typecheck

cd apps/api && pnpm test                  # Jest, PGlite in-memory
cd apps/web && pnpm test                  # Vitest + Testing Library
cd apps/web && pnpm build                 # typecheck + Vite production build
cd tools/simulator && npm test            # node:test
cd apps/web && pnpm test:e2e              # Playwright; cần web server
python tools/docs/build.py --check        # HTML khớp nguồn Markdown/JSON
node tools/docs/check-examples.mjs        # mọi payload mẫu parse bằng schema (cần pnpm build:contracts)
node infra/check-mqtt-exposure.mjs        # broker không anonymous, 1883 không mở ra ngoài loopback
```

Kết quả chạy ngày **15/11/2026** trên worktree này:

| Hạng mục | Kết quả |
| --- | --- |
| API (`cd apps/api && pnpm test`) | **20 suite / 214 test pass**, 109,2 s |
| Web unit (`cd apps/web && pnpm test`) | **32 file / 178 test pass**, 11,2 s |
| Simulator (`cd tools/simulator && npm test`) | **23 test pass** |
| E2E (`cd apps/web && pnpm test:e2e`) | **7/7 pass**; test 60 giây xác nhận không refetch sau khi tải thêm |
| Typecheck (`pnpm -r typecheck`) | contracts/api/web/simulator pass |
| Contracts (`pnpm build:contracts`) | pass |
| Web production build (`cd apps/web && pnpm build`) | **pass**; bundle tách theo route, chunk lớn nhất ~269 kB (chưa đo mạng thật) |
| Docs HTML (`python tools/docs/build.py --check`) | pass sau khi sinh lại; xem `tools/docs/README.md` |
| Payload mẫu | parse đủ bằng schema tương ứng; script fail nếu file mẫu chưa khai báo schema |

Bằng chứng test/handoff/review nằm ở `reports/handoffs/`, `reports/qa/`, `reports/worklog/`. Không dùng kết quả trong tài liệu thay cho việc chạy lại. Repo **chưa có CI**; các cổng trên là chạy tay.

## Thành phần

```text
apps/
  api/                  NestJS 11, Drizzle, PGlite/PostgreSQL, Jest
  web/                  React 19, Vite, TanStack Query, Vitest, Playwright
packages/contracts/     Schema zod dùng chung cho API/web/simulator
tools/simulator/        CLI giả lập thiết bị (telemetry, fall, queue retry)
infra/                  compose PostgreSQL (mặc định) + Mosquitto sau profile thử nghiệm
docs/                   Thiết kế, yêu cầu, quyết định, HTML sinh từ Markdown
reports/                Handoff, worklog, journal điều phối, báo cáo review
```

Backend là modular monolith: `auth`, `access`, `subjects`, `care`, `emergency-contacts`, `devices`, `ingest`, `measurements`, `incidents`, `notifications`, `realtime`, `studio`, `assistant`, `maintenance`, `admin`, `policy`, `health`. UI và trợ lý dùng chung service nghiệp vụ; AI không nằm trên đường cảnh báo.

## Quyết định kỹ thuật chính

- Phiên đăng nhập bằng cookie HttpOnly + bảng `sessions` (thu hồi ngay), không dùng JWT.
- PGlite mặc định cho dev/test; cùng schema Drizzle chạy được PostgreSQL qua `DATABASE_URL`.
- Cảnh báo: revision đơn điệu, ack/resolve compare-and-set, outbox + SSE, thu hồi quyền/khóa tài khoản đóng stream.
- Sự kiện và telemetry được gán theo **assignment tại `measured_at`**, không theo chủ đang mở; mẫu không xác định được thời gian/assignment bị cách ly thay vì gán sang chủ mới.
- Studio: draft → preview chỉ đọc → publish CAS `baseRevision + digest` → rollback tạo bản mới.
- Trợ lý: tổng hợp số liệu thật, adapter OpenAI-compatible tùy chọn, fallback template xác định; không chẩn đoán/kê đơn.
- Dữ liệu demo được đánh dấu `source=simulator` / `is_synthetic=true`; UI hiển thị nhãn mô phỏng.
- Quyền xem số đo (`canViewMeasurements`) tách khỏi quyền nhận cảnh báo; admin không mặc định đọc dữ liệu sức khỏe.

ADR: [docs/decisions/0002-nen-tang-trien-khai.md](docs/decisions/0002-nen-tang-trien-khai.md).

## Giới hạn đã biết

- **Phần cứng/firmware:** chưa có firmware ESP32, BOM, sơ đồ chân, thời lượng pin hoặc số liệu đo thật.
- **Độ chính xác té ngã:** chưa có phép đo precision/recall/F1; cửa sổ hủy 20 giây chỉ là tham số demo đề xuất.
- **MQTT:** chỉ là profile thử nghiệm; adapter chỉ subscribe telemetry, chưa có ingest `fall.*`/`sos.*`/`status`, chưa publish ACK, chưa kiểm ACL/TLS với broker thật. HTTP là đường chính thức.
- **Thông báo:** chỉ giao trong ứng dụng; chưa có Web Push/email/SMS, chưa có thông báo khi đóng trình duyệt.
- **Xóa/retention:** lưu trữ hồ sơ chỉ ẩn khỏi danh sách và thu hồi chia sẻ; yêu cầu xóa chỉ được ghi audit, chưa xóa dữ liệu, chưa có retention tự động, chưa xử lý backup/AI cache.
- **AI:** chỉ tóm tắt/hỏi đáp giới hạn với fallback template; chưa có RAG, planner/tool registry, scheduler, approval flow hay runtime `agent_runs`/`run_steps`. Chưa kiểm provider thật/chi phí/độ trễ.
- **Hạ tầng:** chưa benchmark PostgreSQL thật, nhiều instance, backup/restore, TLS, xoay secret production; PGlite mở file DB độc quyền theo process nên phải dừng API trước khi `pnpm seed`/migration.
- **Kiểm thử:** unit/integration API 214 test, web 178 test, randomized 214/214, E2E 7/7 và build web đã qua trên máy dev. Chưa có CI, chưa đo p95/NFR-07 trên mạng thật, chưa kiểm khả dụng với người cao tuổi/người chăm sóc thật, chưa có OpenAPI máy sinh.
- **Giao diện:** đã tách chunk theo route; lần đo gần nhất trước v2 có chunk lớn nhất ~265 kB, chưa đo trên mạng thật.

## Đọc tiếp

- [Mục lục tài liệu](docs/README.md)
- [Yêu cầu và phạm vi](docs/02-yeu-cau-va-pham-vi.md)
- [Kiến trúc](docs/03-kien-truc-he-thong.md)
- [Dữ liệu và giao tiếp](docs/04-du-lieu-va-giao-tiep.md)
- [Trải nghiệm và màn hình](docs/06-trai-nghiem-va-man-hinh.md)
- [Kế hoạch triển khai + trạng thái](docs/14-ke-hoach-trien-khai-phan-mem.md)
- [Bản HTML ngoại tuyến](docs/html/index.html) — sinh lại bằng `python tools/docs/build.py`
