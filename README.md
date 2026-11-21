# Heart-iot — Giám sát sức khỏe IoT

**Hệ thống giám sát sức khỏe và cảnh báo té ngã cho người cao tuổi, có trợ lý AI hỗ trợ đọc dữ liệu.**

Repo này là bản triển khai phần mềm của đồ án: API nghiệp vụ, web responsive cho người dùng/người thân/quản trị, simulator thiết bị và bộ dữ liệu demo tổng hợp. Thiết kế gốc nằm trong `docs/`; kế hoạch và trạng thái triển khai ở [docs/14](docs/14-ke-hoach-trien-khai-phan-mem.md).

> **Trạng thái 18/11/2026 — v7 phần mềm:** đã có mã chạy được trong phạm vi kỹ thuật, có test và luồng demo end-to-end trên máy cục bộ. **v7 xây lại toàn bộ lớp trình bày** (token/primitive dùng chung, shell mới, CSS tách theo feature) mà không đổi nghiệp vụ hay API: **`/app` là Hôm nay** (một câu trạng thái, hành động chính, ô hỏi), **`/app/overview` là Sức khỏe**; nav chính **4 mục Hôm nay/Cảnh báo/Sức khỏe/Người thân**, không còn menu “Thêm”. Trợ lý vẫn độc lập với cảnh báo; giao diện dùng ngôn ngữ sản phẩm, không còn nhãn “bản demo/đồ án”. **Chưa** có firmware ESP32, chưa đo độ chính xác phát hiện ngã, chưa benchmark PostgreSQL thật, chưa Web Push, chưa xóa vĩnh viễn dữ liệu (chỉ ghi nhận yêu cầu) và chưa được giảng viên nghiệm thu. MQTT vẫn là thử nghiệm; HTTP là đường ingest chính thức. Không dùng repo này để khẳng định sản phẩm đã hoàn chỉnh.

## Tính năng hiện có

- **Tài khoản và phiên:** đăng ký/đăng nhập/đăng xuất bằng cookie HttpOnly + bảng `sessions`; đổi tên hiển thị, đổi mật khẩu (giữ phiên hiện tại, thu hồi phiên khác), xem và thu hồi từng phiên; admin khóa tài khoản sẽ thu hồi phiên.
- **Hồ sơ và chia sẻ:** tạo/sửa hồ sơ, mời người thân, chấp nhận/thu hồi quyền, giới hạn số ngày lịch sử. `/app` là Hôm nay; `/app/overview` là Sức khỏe chi tiết; nav chính chỉ 4 mục, mọi trang khác đi vào từ đúng ngữ cảnh hồ sơ (Thiết bị, Chia sẻ và liên hệ, Công việc) hoặc từ menu tài khoản. Quyền `canViewMeasurements` tách khỏi quyền nhận cảnh báo: người thân có thể nhận cảnh báo mà không xem nhịp tim/bước chân/lịch sử/CSV.
- **Dữ liệu đo:** ingest telemetry HTTP, chống trùng, gán theo assignment tại `measured_at`, cách ly mẫu lệch giờ/ngoài assignment; tổng hợp ngày, lịch sử có khoảng thiếu/độ phủ, CSV, xu hướng 7/14/30 ngày.
- **Nhắc chăm sóc (FR-15 phần web):** `/app/care` cho chủ hồ sơ tạo lịch nhắc uống thuốc/sinh hoạt theo múi giờ hồ sơ (1–6 giờ, thứ, khoảng ngày, bật/tắt); người thân có `canViewMeasurements` xem và đánh dấu Đã thực hiện/Bỏ qua/Hoàn tác; thẻ “Nhắc hôm nay” trên Hôm nay. Không gợi ý liều/kê thuốc.
- **Phiếu đi khám (FR-16/22):** `/app/history/report` in 1 trang A4/lưu PDF, gồm độ phủ, khoảng thiếu, nhịp tim, bước chân, cảnh báo ngã/SOS và 3–5 điểm chú ý từ dữ liệu; tôn trọng quyền đo/cửa sổ chia sẻ và nhãn dữ liệu mô phỏng, không kết luận chẩn đoán.
- **Cảnh báo:** vòng đời `suspected → unconfirmed/open → acknowledged → resolved/cancelled`, ack/resolve compare-and-set, outbox trong ứng dụng + SSE. Nav Cảnh báo mang badge **số cảnh báo đang mở** của hồ sơ đang xem (tối đa 20, `20+` khi còn trang sau); hộp thông báo toàn tài khoản ở `/app/alerts?view=notifications` và banner “Có thông báo mới” dẫn đúng incident; stream bị thu hồi khi mất quyền, khóa tài khoản hoặc phiên hết hạn.
- **Liên hệ khẩn cấp:** tối đa 5 liên hệ/hồ sơ, một liên hệ chính, số điện thoại có `tel:` trong chi tiết cảnh báo; chỉ chủ hồ sơ ghi, người thân có quyền nhận cảnh báo được đọc.
- **Việc bảo trì:** xem/đóng việc theo quyền hồ sơ; chủ hồ sơ tạo việc cho thiết bị đang gắn (kiểm thiết bị, hạn xử lý, lý do đóng).
- **Lưu trữ và yêu cầu xóa:** chủ hồ sơ lưu trữ hồ sơ (thu hồi liên kết chia sẻ, **không xóa** dữ liệu) hoặc ghi nhận yêu cầu xóa dữ liệu để xử lý thủ công. Chưa có quy trình xóa cứng, retention tự động hay xóa xuyên backup/AI cache.
- **Quản trị:** người dùng, thiết bị, policy thiết bị có preview/publish CAS, audit, tổng quan. Tab thiết bị có danh sách, cấp mã gắn thiết bị và xoay khóa; tạo thiết bị mới hiện vẫn qua API admin.
- **Studio:** draft → preview chỉ đọc → publish CAS `baseRevision + digest` → rollback tạo bản mới; dữ liệu preview/data tôn trọng mốc chia sẻ và quyền cảnh báo.
- **Hôm nay + trợ lý:** `/app` chỉ còn câu trạng thái, hành động Gọi/Xem cảnh báo, ô hỏi + 3 gợi ý; hội thoại chỉ hiện sau khi hỏi. Câu trả lời dựa trên aggregate đã kiểm quyền, có `dataQuality` (độ phủ, khoảng thiếu, nguồn mô phỏng, giới hạn), fallback template xác định khi chưa cấu hình provider. Thiếu quyền số đo hiển thị 403 là trạng thái quyền, không retry vô ích; đổi hồ sơ xóa hội thoại cũ. AI không nằm trên đường cảnh báo và không tự xác nhận/đóng cảnh báo.

## Chạy nhanh

Yêu cầu: Node.js ≥ 24, pnpm 12. Docker/PostgreSQL không bắt buộc (mặc định dùng PGlite).

```bash
# 1) Cài dependency và build hợp đồng dùng chung
pnpm install
pnpm build:contracts

# 2) Tạo DB demo + dữ liệu tổng hợp (chạy khi API đang tắt)
cd backend && pnpm seed && cd ../..

# 3) API (cổng 3000)
cd backend && pnpm dev

# 4) Web (cổng 5173) — mở terminal khác
cd frontend && pnpm dev
```

Mở http://localhost:5173. Tài khoản demo **chỉ dùng khi chạy seed local, không hiện trong UI**: gõ tay email/mật khẩu ở trang đăng nhập. Giao diện công khai không còn khối tự điền tài khoản, và các chuỗi này không có trong bundle web gửi tới trình duyệt.

| Vai trò | Email | Mật khẩu |
| --- | --- | --- |
| Chủ hồ sơ | `ba-an@demo.heart-iot.local` | `demo-heart-iot-2026` |
| Người thân | `minh@demo.heart-iot.local` | `demo-heart-iot-2026` |
| Quản trị | `admin@demo.heart-iot.local` | `demo-admin-2026` |

Thiết bị demo cho simulator:

```bash
export HEART_IOT_DEVICE_ID=dddddddd-dddd-4ddd-8ddd-dddddddddddd
export HEART_IOT_DEVICE_KEY=demo-device-key-HEARTIOT-2026-001
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

cd backend && pnpm test                  # Jest, PGlite in-memory
cd frontend && pnpm test                  # Vitest + Testing Library
cd frontend && pnpm build                 # typecheck + Vite production build
cd tools/simulator && npm test            # node:test (cần pnpm build:contracts trước)
cd frontend && pnpm test:e2e              # Playwright 26 test; cần API + web server
python tools/docs/build.py --check        # HTML khớp nguồn Markdown/JSON
node tools/docs/check-examples.mjs        # mọi payload mẫu parse bằng schema (cần pnpm build:contracts)
node infra/check-mqtt-exposure.mjs        # broker không anonymous, 1883 không mở ra ngoài loopback
```

Kết quả chạy ngày **18/11/2026** trên worktree này (sau khi hợp nhất các lane giao diện v7):

| Hạng mục | Kết quả |
| --- | --- |
| API (`pnpm --filter @heart-iot/api test`) | **22 suite / 245 test pass**, 65,2 s |
| Web unit (`pnpm --filter @heart-iot/web exec vitest run --no-file-parallelism --maxWorkers=1`) | **43 file / 377 test pass** |
| Simulator (`cd tools/simulator && npm test`) | **23 test pass** |
| E2E (`pnpm --filter @heart-iot/web test:e2e`) | **26/26 pass**; gồm landing/login/404/lời mời, Hôm nay, cảnh báo, lịch sử và test 60 giây không refetch |
| Docs HTML (`tools/docs/.venv/Scripts/python.exe tools/docs/build.py --check`) | pass sau khi sinh lại; 354 liên kết/275 ID |
| Payload mẫu (`node tools/docs/check-examples.mjs`) | parse đủ 5/5 payload bằng schema tương ứng |
| Typecheck, web production build, API randomized, seed, MQTT exposure | **không chạy lại** trong lượt này |

Bằng chứng test/handoff/review nằm ở `reports/handoffs/`, `reports/qa/`, `reports/worklog/`; ảnh và số đo giao diện v7 ở `reports/qa/evidence/v7-*/`. Không dùng kết quả trong tài liệu thay cho việc chạy lại. Repo **chưa có CI**; các cổng trên là chạy tay.

## Thành phần

```text
frontend/               React 19, Vite, TanStack Query, Vitest, Playwright
backend/                NestJS 11, Drizzle, PGlite/PostgreSQL, Jest
packages/contracts/     Schema zod dùng chung cho API/web/simulator
tools/simulator/        CLI giả lập thiết bị (telemetry, fall, queue retry)
infra/                  compose PostgreSQL (mặc định) + Mosquitto sau profile thử nghiệm
docs/                   Thiết kế, yêu cầu, quyết định, HTML sinh từ Markdown
reports/                Handoff, worklog, journal điều phối, báo cáo review
```

`frontend/` và `backend/` là hai package độc lập: frontend chỉ gọi API qua HTTP, không import mã backend; backend không phụ thuộc frontend. `packages/contracts` giữ schema zod dùng chung để hai bên không lệch hợp đồng. Chạy API và web ở hai tiến trình/port riêng.

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
- **Nhắc chăm sóc trên thiết bị:** FR-15 mới có phần web; chưa có hàng đợi lệnh xuống thiết bị, rung/nút xác nhận trên firmware hay sự kiện gửi ngược.
- **Xóa/retention:** lưu trữ hồ sơ chỉ ẩn khỏi danh sách và thu hồi chia sẻ; yêu cầu xóa chỉ được ghi audit, chưa xóa dữ liệu, chưa có retention tự động, chưa xử lý backup/AI cache.
- **AI:** chỉ tóm tắt/hỏi đáp giới hạn với fallback template; chưa có RAG, planner/tool registry, scheduler, approval flow hay runtime `agent_runs`/`run_steps`. Chưa kiểm provider thật/chi phí/độ trễ.
- **Hạ tầng:** chưa benchmark PostgreSQL thật, nhiều instance, backup/restore, TLS, xoay secret production; PGlite mở file DB độc quyền theo process nên phải dừng API trước khi `pnpm seed`/migration.
- **Kiểm thử:** unit/integration API 245 test, web 377 test, E2E 26/26 và simulator 23 test đã qua trên máy dev ngày 19/11/2026 (lượt v8); chưa chạy lại randomized, chưa có CI, chưa đo p95/NFR-07 trên mạng thật, chưa kiểm khả dụng với người cao tuổi/người chăm sóc thật, chưa có OpenAPI máy sinh.
- **Giao diện:** code-split theo route đã có; v7 chưa đo lại kích thước bundle hay hiệu năng trên mạng thật. Mới có một vòng review độc lập cho phần nền tảng giao diện v7 (`reports/qa/v7-foundation-review.md`); chưa kiểm Firefox/WebKit.

## Đọc tiếp

- [Mục lục tài liệu](docs/README.md)
- [Yêu cầu và phạm vi](docs/02-yeu-cau-va-pham-vi.md)
- [Kiến trúc](docs/03-kien-truc-he-thong.md)
- [Dữ liệu và giao tiếp](docs/04-du-lieu-va-giao-tiep.md)
- [Trải nghiệm và màn hình](docs/06-trai-nghiem-va-man-hinh.md)
- [Kế hoạch triển khai + trạng thái](docs/14-ke-hoach-trien-khai-phan-mem.md)
- [Bản HTML ngoại tuyến](docs/html/index.html) — sinh lại bằng `python tools/docs/build.py`
