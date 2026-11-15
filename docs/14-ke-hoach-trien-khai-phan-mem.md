# Kế hoạch triển khai phần mềm v1

Ngày lập: **14/11/2026**. Trạng thái: **kế hoạch triển khai trong phạm vi kỹ thuật của lead**, chưa phải phê duyệt của giảng viên hay nghiệm thu sản phẩm. Tài liệu gốc 01–13 vẫn là nguồn yêu cầu; kế hoạch này chỉ cụ thể hóa phần mã chạy được.

## 1. Mục tiêu v1

Dựng một lát cắt **chạy được, kiểm được, tái lập được** trên máy Windows không cần Docker:

1. Thiết bị mô phỏng gửi telemetry/sự kiện vào backend.
2. Backend lưu bền, chống trùng, tính trạng thái thiết bị/dữ liệu cũ, mở và xử lý incident.
3. Người sở hữu/chia sẻ xem dashboard, biểu đồ có khoảng thiếu, hộp cảnh báo, xác nhận/đóng.
4. Quyền theo hồ sơ được kiểm ở REST, SSE, export và AI; thu hồi có hiệu lực ngay.
5. AI tạo tóm tắt **từ aggregate đã kiểm quyền**, có fallback xác định khi không có provider; cảnh báo không phụ thuộc AI.
6. Nền tảng tác vụ có `run/step`, `request_key`, trạng thái dừng/đợi duyệt, audit.
7. Studio cấu hình động: nháp → preview tương tác chỉ đọc → chấp nhận → công bố; rollback tạo phiên bản mới.
8. Web responsive dùng được ở 390px và desktop, trạng thái lỗi/rỗng/mất quyền/dữ liệu mô phỏng rõ ràng.

## 2. Ngoài phạm vi v1 (không được báo là đã làm)

- Firmware ESP32, độ chính xác phát hiện té ngã, thời lượng pin, BOM/giá linh kiện.
- Web Push khi đóng trình duyệt; gọi cấp cứu tự động; ứng dụng native.
- Dữ liệu sức khỏe người thật, đo độ trễ trên mạng thật, độ khả dụng với người cao tuổi.
- Backup/restore production, TLS/ACL broker production, xoay secret thật.
- Xóa dữ liệu xuyên backup/AI cache như một quy trình đã kiểm; v1 chỉ ghi audit cho yêu cầu xóa và nêu giới hạn.
- Coding Agent sửa backend trong runtime sản phẩm (AI-17). AI vận hành chỉ dùng capability đã đăng ký.

## 3. Stack và version

| Lớp | Chọn | Lý do / giới hạn |
| --- | --- | --- |
| Monorepo | pnpm 12 workspace, Node 24 | Tách package, chạy song song |
| Ngôn ngữ | TypeScript 5.9 | Ổn định decorator metadata cho NestJS; TS 7 chưa dùng cho build này |
| API | NestJS 11.2.10 + Express 5 | CJS ổn định cho Jest; NestJS 12 là ESM-only nên chưa dùng. Đọc docs đúng version trước khi dùng API mới |
| ORM/DB | Drizzle ORM 0.45 (PostgreSQL dialect) | Query typed, migration SQL; cùng schema cho hai driver |
| DB dev/test | PGlite 0.5 (PostgreSQL WASM) | Chạy không cần Docker; dữ liệu trên đĩa khi dev, in-memory khi test |
| DB triển khai | PostgreSQL 17 qua `pg` 8 | Cùng dialect; chuyển bằng `DATABASE_URL` |
| Validator | zod 4 | Một nguồn schema cho API + web; lỗi có cấu trúc |
| Web | React 19 + Vite 8 + React Router 7 + TanStack Query 5 | SPA responsive; không SSR |
| Realtime | SSE + event log trong DB | Reconnect bằng `Last-Event-ID`/cursor; kiểm quyền lại mỗi vòng |
| Thiết bị | HTTP ingest + MQTT adapter (`mqtt` 5) | Broker thật là Mosquitto trong compose; test bằng `aedes` |
| AI | Adapter OpenAI-compatible tùy chọn; fallback tóm tắt theo mẫu | Không gọi mạng khi chưa cấu hình; output có nhãn nguồn |
| Test | Jest + SWC (API), Vitest + Testing Library (web), Playwright (E2E) | Kiểm đúng lớp sở hữu hành vi |
| Font/UI | font self-host (@fontsource), CSS token | Không phụ thuộc CDN khi demo offline |

Xem [ADR 0002](decisions/0002-nen-tang-trien-khai.md).

## 4. Ranh giới module API

```text
apps/api/src/
├── main.ts, app.module.ts        # lead sở hữu
├── config/ database/             # env + Drizzle/PGlite, schema, migration, seed
├── common/                       # lỗi, request-id, zod pipe, phân trang, cookie/origin-check
├── auth/                         # đăng ký/đăng nhập/phiên/guard
├── access/                       # quyền theo hồ sơ + audit (dùng chung)
├── subjects/                     # hồ sơ, mời/chấp nhận/thu hồi chia sẻ
├── devices/                      # claim/release, assignment, admin thiết bị
├── ingest/                       # HTTP + MQTT, chống trùng, cách ly
├── measurements/                 # truy vấn, tổng hợp ngày, coverage/gap
├── incidents/                    # state machine, alert actions, SSE
├── notifications/                # outbox + giao trong ứng dụng
├── assistant/                    # tóm tắt/hỏi đáp trên aggregate đã kiểm quyền
├── care/                         # mời, chấp nhận, care link, thu hồi
├── studio/                       # workspace view draft/preview/publication
├── maintenance/                  # maintenance task, đóng task
├── admin/                        # người dùng, thiết bị, audit
├── policy/                       # policy config CAS + preview
└── health/                       # health
```

Luật: UI và AI gọi cùng service nghiệp vụ; transport chỉ chuyển đổi dữ liệu. Không có endpoint riêng cho AI bỏ qua validation.

## 5. Lát cắt dữ liệu

Bảng chính (chi tiết ở `database/schema.ts`):

`users`, `sessions`, `subjects`, `care_links`, `invitations`, `devices`, `device_assignments`, `telemetry`, `incidents`, `incident_events`, `alert_actions`, `notification_outbox`, `realtime_events`, `audit_logs`, `ai_summaries`, `agent_runs`, `run_steps`, `step_attempts`, `delegations`, `maintenance_tasks`, `workspace_views`, `view_publications`, `policy_configs`.

Bất biến then chốt:

- `telemetry` unique `(device_id, message_id)` và `(device_id, boot_id, sequence)`; payload khác cùng khóa là xung đột, không overwrite.
- Incident khóa theo `(device_id, device_incident_id)`; event lạ không được đổi incident của assignment khác.
- Revision tăng đơn điệu; sự kiện cũ đến sau không lùi trạng thái.
- Outbox unique theo `(incident_id, revision, recipient_id, channel, kind)`, hiện thực bằng `dedupe_key = <incident>:<revision>:<recipient>:in_app:<alert|update>`; cần `kind` để một incident vừa có thông báo cảnh báo vừa có thông báo cập nhật hợp lệ. Trước khi gửi kiểm lại quyền + trạng thái hiện tại; đóng incident thì tác vụ chưa gửi thành `superseded`.
- `care_links` chỉ có hiệu lực sau chấp nhận; thu hồi ghi mốc và chặn mọi đường đọc.
- `agent_runs` unique `(actor_user_id, request_key)`; cùng key khác input → conflict.
- `workspace_views` công bố bằng so-sánh `base_revision` + digest; preview không gọi đường ghi.
- Admin kỹ thuật không có quyền sức khỏe nếu không phải chủ/chia sẻ.

## 6. Hợp đồng API v1 (rút gọn)

Prefix `/api/v1`. Lỗi: `{ code, message, requestId, details? }`. Phân trang cursor. Thời gian ISO-8601 UTC.

| Nhóm | Endpoint |
| --- | --- |
| Health | `GET /health` (công khai) |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/logout`; `GET /me` |
| Hồ sơ | `GET/POST /subjects`, `GET/PATCH /subjects/:id`, `GET /subjects/:id/status` |
| Chia sẻ | `GET/POST /subjects/:id/invitations`, `GET /invitations/:token`, `POST /invitations/:token/accept`, `GET/DELETE /subjects/:id/care-links[/:linkId]` |
| Thiết bị | `POST /subjects/:id/devices/claim`, `GET /subjects/:id/devices`, `POST /devices/:id/release`; admin `GET/POST /admin/devices`, `POST /admin/devices/:id/claim-code`, `POST /admin/devices/:id/rotate-key` |
| Ingest | `POST /ingest/telemetry`, `/ingest/events` (header `x-device-id`, `x-device-key`); MQTT `v1/devices/{id}/telemetry` (chỉ telemetry trong v1) |
| Đo | `GET /subjects/:id/measurements?from&to`, `GET /subjects/:id/daily-summary?date`, `GET /subjects/:id/export.csv` |
| Cảnh báo | `GET /subjects/:id/alerts`, `GET /alerts/:id`, `POST /alerts/:id/acknowledge`, `/resolve`; `GET /subjects/:id/events` (SSE) |
| Thông báo | `GET /notifications`, `POST /notifications/:id/read` |
| AI | `GET /subjects/:id/assistant/summary`, `POST /subjects/:id/assistant/ask` (template fallback + OpenAI-compatible tùy chọn). `agent-runs`/`summaries` theo đặc tả dài hạn **chưa triển khai** — xem mục 11. |
| Bảo trì | `GET /maintenance-tasks`, `POST /maintenance-tasks/:id/close` |
| Studio | `GET/POST /workspace-views`, `GET /workspace-views/:id`, `PUT /workspace-views/:id/draft`, `POST /workspace-views/:id/previews`, `POST /workspace-views/:id/publications`, `POST /workspace-views/:id/rollback`, `GET /workspace-views/:id/publications`, `GET /workspace-views/:id/data` |
| Admin | `GET /admin/users`, `PATCH /admin/users/:id/status`, `GET /admin/audit`, `GET /admin/policies/:key`, `POST /admin/policies/:key/previews`, `PUT /admin/policies/:key`, `GET /admin/overview` |

Chi tiết request/response nằm trong `packages/contracts` theo từng miền. Bảng này rút gọn để đọc; danh sách đầy đủ theo controller trong `apps/api/src/*/*.controller.ts`. OpenAPI máy sinh **chưa làm**; khi làm phải sinh từ đúng nguồn, không viết tay bản thứ hai.

## 7. Phân chia wave và quyền ghi

| Wave | Phiên | Vùng ghi chính | Cổng ra |
| --- | --- | --- | --- |
| 0 | Lead | root, `packages/contracts/core`, `apps/api/{config,database,common,auth,health}`, docs | `pnpm -r typecheck`, test auth, migration từ DB rỗng |
| 1 | `be-core` | `apps/api/src/{access,subjects,audit}` + contracts miền | Test quyền/mời/thu hồi; typecheck |
| 1 | `be-data` | `apps/api/src/{devices,ingest,measurements}` + contracts | Test claim/dedupe/coverage; typecheck |
| 1 | `be-alerts` | `apps/api/src/{incidents,notifications,realtime}` + contracts | Test state machine/outbox/SSE; typecheck |
| 1 | `fe-shell` | `apps/web` (nền tảng, landing, auth, app shell) | Build + unit test; login chạy thật |
| 1 | `sim` | `tools/simulator` | Chạy kịch bản với API thật |
| 2 | `be-ai` | `apps/api/src/assistant` | Summary/ask + fallback + audit; test (agent-runs để wave sau) |
| 2 | `be-studio` | `apps/api/src/studio` | Draft/preview/publish/rollback; test |
| 2 | `fe-features` | dashboard, hồ sơ, biểu đồ, cảnh báo, chia sẻ, thiết bị | Build + test component |
| 2 | `seed` | `apps/api/src/database/seed*`, `data/demo` | Seed idempotent, dữ liệu tổng hợp có nhãn |
| 3 | `be-admin` | `apps/api/src/{maintenance,admin}` | Task close; admin user/audit/policy CAS; test |
| 3 | `fe-studio` | Studio, Task Center, admin, export | Build + test |
| 4 | `fe-admin-ai` | Trợ lý, công việc, quản trị trên web | Build + test |
| 3 | `be-lead` | mini-lead backend: rà tích hợp, sửa lỗi hợp đồng | Test API toàn bộ |
| 3 | `fe-lead` | mini-lead frontend: rà tích hợp UI/API | E2E chuỗi chính |
| 4 | `rev-*` (2–3 phiên mới) | chỉ đọc; tự chạy lại | Findings P0/P1/P2 |
| 4 | `fix-*` | sửa finding đã chấp nhận | Test hồi quy + reviewer xác nhận |

Quyền ghi chi tiết và prompt nằm trong handoff/`reports/orchestration`.

## 8. Cổng chất lượng

1. `pnpm -r typecheck` sạch trước khi commit wave.
2. Test nhỏ nhất sở hữu hành vi; integration khi qua DB/quyền/transaction; E2E cho luồng demo.
3. Migration chạy từ DB rỗng; seed chạy hai lần không nhân bản.
4. Mỗi yêu cầu có ID (FR/NFR/AI/T) ghi trong tên test hoặc handoff.
5. Reviewer độc lập chạy lại; không chấp nhận "test đã pass" không có output.
6. Không commit secret/.env; `.env.example` chỉ tên biến.
7. Cập nhật docs nguồn + sinh lại HTML trước khi báo hoàn thành.

## 9. Rủi ro đã biết

| Rủi ro | Cách xử lý |
| --- | --- |
| PGlite khác PostgreSQL thật ở extension/hiệu năng | Chỉ dùng SQL chuẩn; test migration trên PGlite; ghi rõ chưa benchmark PostgreSQL thật |
| Nhiều worker sửa chéo | Vùng ghi rời nhau; lead giữ `app.module.ts`, schema, root config |
| Frontend lệch hợp đồng | Contracts theo miền + `docs/14` + mini-lead fe review; E2E |
| AI provider không có trong môi trường chấm | Fallback xác định + nhãn "tóm tắt theo mẫu"; test adapter bằng mock server |
| Docker không chạy | PGlite mặc định; compose chỉ là đường triển khai phụ, chưa kiểm trong lượt này |
| Thời gian | Ưu tiên lát cắt cảnh báo + quyền + preview; phần chưa xong ghi rõ, không mô phỏng đạt |

## 10. Định nghĩa hoàn thành v1

- Tất cả cổng mục 8 đã chạy với output thật trong phiên này.
- Reviewer độc lập không còn finding P0/P1 mở; P2 còn lại được ghi rõ.
- README/API/UI dùng được theo hướng dẫn; demo script tái lập từ DB rỗng.
- Docs nguồn được cập nhật; HTML build `--check` đạt.
- Giới hạn (firmware, push, dữ liệu thật, PostgreSQL production) được nêu rõ ở README và báo cáo.

## 11. Trạng thái triển khai (cập nhật 15/11/2026)

Đây là **trạng thái kỹ thuật do nhóm tự kiểm**, không phải nghiệm thu của giảng viên hay xác nhận sản phẩm đã hoàn chỉnh. Mọi số liệu dưới đây lấy từ lần chạy thật trong repo; bằng chứng chi tiết ở `reports/handoffs/`, `reports/qa/` và `reports/worklog/`.

### Đã có mã chạy được

- **API** (`apps/api`, NestJS 11 + Drizzle + PGlite/PostgreSQL): xác thực phiên, hồ sơ, lời mời/chia sẻ quyền, thiết bị claim/release/rotate, ingest HTTP + MQTT adapter, chống trùng, đo lường/tổng hợp/CSV, cảnh báo có state machine + ack/resolve compare-and-set, outbox + SSE, studio draft/preview/publish/rollback, trợ lý tóm tắt/hỏi đáp có fallback, bảo trì, admin user/audit/policy CAS.
- **Web** (`apps/web`, React 19 + Vite): landing, đăng nhập/đăng ký, khung ứng dụng, tổng quan, lịch sử + biểu đồ, cảnh báo + SSE, hồ sơ, thiết bị, chia sẻ, thông báo, studio, trợ lý, công việc, quản trị; trạng thái rỗng/lỗi/mất quyền và nhãn dữ liệu mô phỏng.
- **v1.1 (commit `8434d66`, 15/11)**: toàn bộ trang sau đăng nhập dùng `React.lazy` + `Suspense` nên build tách chunk theo route (lần đo của review v2: chunk lớn nhất `index-*.js` ~265 kB, không còn cảnh báo >500 kB); `AppErrorBoundary` giữ khung ứng dụng khi một trang/chunk lỗi; cảnh báo chi tiết trả `403` khi có link nhưng thiếu `canReceiveAlerts` và `404` khi không có link/đang `suspected`, có test list/detail/ngoài hồ sơ.
- **Nền hợp đồng v2 (`0d669a1`, chưa giao tính năng)**: schema cho cập nhật tài khoản/phiên, xu hướng 7–30 ngày, liên hệ khẩn cấp và input tạo việc bảo trì, kèm migration `0001`. Chưa có endpoint/UI tương ứng; không được báo là đã có các tính năng v2.
- **Simulator** (`tools/simulator`): telemetry theo profile, fall cancel/confirm/duplicate/late/sos, queue retry, không in device key; đã chạy end-to-end với API.
- **Seed demo** idempotent: 3 tài khoản, 2 hồ sơ, thiết bị, telemetry tổng hợp 6 ngày, cảnh báo, task, outbox. Dữ liệu telemetry ghi `source='simulator'` và hiển thị `is_synthetic=true`.

### Lệnh kiểm đã dùng

```bash
pnpm -r typecheck
cd packages/contracts && pnpm build
cd apps/api && pnpm test
cd apps/web && pnpm test && pnpm build
cd apps/api && pnpm seed          # dừng API trước: PGlite độc quyền theo process
node tools/docs/check-examples.mjs # sau pnpm build:contracts; parse payload mẫu bằng schema
python tools/docs/build.py --check # HTML khớp nguồn Markdown/JSON
```

Kết quả test/kiểm cuối cùng được ghi ở `reports/qa/` và worklog; không dùng con số trong tài liệu này thay cho việc chạy lại.

### Chưa làm hoặc chưa đủ bằng chứng

- **Firmware ESP32, BOM, độ chính xác phát hiện ngã, thời lượng pin** — ngoài phạm vi mã web/API lần này; không có số liệu đo thật.
- **Web Push, email/SMS** — outbox hiện chỉ giao trong ứng dụng; chưa có transport ngoài.
- **PostgreSQL thật, nhiều instance** — mới kiểm PGlite một tiến trình; rate limit, SSE, CAS chưa benchmark/kiểm đa kết nối thật.
- **MQTT broker/ACL/ACK** — adapter đã có và test parser; chưa chạy broker thật, chưa xác thực khóa thiết bị trên MQTT, chưa publish ACK ngược.
- **Đặc tả AI dài hạn** — `agent_runs`, `run_steps`, `step_attempts` đã có bảng trong schema nhưng **chưa có runtime/endpoint**; planner/tool registry, scheduler, approval flow, RAG chưa triển khai. v1 chỉ có summary/ask giới hạn trên số liệu tổng hợp.
- **OpenAPI máy sinh, đo khả dụng người cao tuổi** — chưa làm. Code-split đã xong ở v1.1; bundle chỉ mới đo bằng một lần build cục bộ, chưa đo trên mạng thật.
- **Chính sách ẩn `suspected`, ngưỡng sự kiện trễ, quyền admin với dữ liệu sức khỏe** — cần chốt với giảng viên; hiện là quyết định kỹ thuật có ghi trong code/handoff.

### Giới hạn vận hành đã biết

- PGlite mở file DB độc quyền theo process: phải dừng API trước khi chạy seed/migration từ process khác.
- `apps/api` build ra `dist/src/main.js` (rootDir `src`); script `start` đã trỏ đúng.
- Web dev dùng alias `@annhien/contracts` sang source TypeScript để tránh interop CJS/ESM; build dùng package exports.

## 12. Kết quả review độc lập (14–15/11/2026)

Reviewer là phiên mới, chỉ đọc và tự chạy lại trên DB/API riêng; không tin kết quả trong handoff.

- **Backend** (`reports/qa/review-backend-2026-11-14.md`): 0 P0; 2 P1 đã được lead sửa và reviewer tái kiểm đóng:
  - SSE phải kiểm `canReceiveAlerts`, không chỉ có link active.
  - Dedupe sự kiện incident theo `(device_id, message_id)`; cùng message_id khác nội dung trả CONFLICT thay vì duplicate.
  Còn P2: `requireHistory` với cửa sổ mặc định của caregiver mới (đã kẹp mềm cho danh sách measurements), ~~403/404 chưa nhất quán giữa list/detail alerts~~ (**đã sửa ở `8434d66`**: 403 khi thiếu `canReceiveAlerts`, 404 khi không có link/suspected), thiếu unique index cho invitation pending, PGlite đơn tiến trình, và ghi chú vận hành.
- **Frontend** (`reports/qa/review-frontend-2026-11-14.md`): 0 P0/P1; 5 P2 (form mời hiện cho caregiver, tab admin chưa theo ARIA APG, mốc thời gian lịch sử đóng băng, bundle >500 kB, nút sao chép im lặng khi clipboard bị chặn). Lead đã sửa P2-1/P2-3/P2-5 và chạy lại typecheck/test/build; P2-2 đã bỏ ngữ nghĩa tab giả (dùng `role="group"` + `aria-pressed`, không phải ARIA tabs) — chấp nhận cách thay thế nhưng không gọi là “tab theo APG”; P2-4 (code-split) **đã xong ở `8434d66`**. Một lỗi 404 nhất thời trang lời mời không tái hiện sau khi API ổn định, chưa kết luận.
- **Tài liệu/hợp đồng v2** (`reports/qa/v2-docs-consistency.md`): 0 P0, 5 P1 và 8 P2 về tài liệu lệch HEAD (HTML lỗi thời, tuyên bố “chưa code-split/chưa có test/chưa có endpoint”, 2 payload mẫu sai schema, trùng số mục, inventory endpoint, `request_id`). Đã sửa trong nhánh `fix-docs-truth`; bằng chứng ở `reports/handoffs/v2-fix-docs-truth.md`.

Các P2 còn mở không chặn demo nhưng phải được xử lý hoặc chốt trước khi dùng dữ liệu thật/nhiều instance.
