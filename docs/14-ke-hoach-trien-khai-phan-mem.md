# Kế hoạch triển khai phần mềm v1/v2

Ngày lập: **14/11/2026**; cập nhật trạng thái v2/v3/v4 ngày **15/11/2026**, bổ sung lát cắt v7 (giao diện xây lại) và kế hoạch mở rộng `FR-15`–`FR-23` ngày **18/11/2026**; bổ sung đề xuất cải thiện v9–v12 ngày **20/11/2026**; cập nhật V10a/V10b backend, MQTT events/ACK, retention tùy chọn, FR-21 backend (nháp lịch nhắc/việc bảo trì; parser câu lệnh đơn giản cho lịch nhắc), quan sát job nền và tổng hợp outbox admin, OpenAPI một phần cho quản trị + trợ lý ngày **21/11/2026**; cập nhật nháp việc bảo trì, mở rộng OpenAPI sang hồ sơ/số đo/phiếu đi khám/cảnh báo/thiết bị/chia sẻ chăm sóc/lịch nhắc/liên hệ khẩn cấp/bảo trì/cấu hình chính sách/thông báo/xác thực/studio/ingest telemetry/health/realtime và test hợp đồng route ngày **22/11/2026**. Trạng thái: **kế hoạch triển khai trong phạm vi kỹ thuật của lead**, chưa phải phê duyệt của giảng viên hay nghiệm thu sản phẩm. Tài liệu gốc 01–13 vẫn là nguồn yêu cầu; kế hoạch này chỉ cụ thể hóa phần mã chạy được.

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
- Xóa dữ liệu xuyên backup/AI cache như một quy trình đã kiểm. v2 có `POST /subjects/:id/deletion-requests` nhưng **chỉ ghi audit** `status=recorded`; V12 mới có **retention job tùy chọn, mặc định tắt** cho một số lớp (telemetry/outbox/realtime/AI summary/nháp trợ lý đã hết hạn), chưa xóa toàn bộ hồ sơ, bản export, AI cache hay backup.
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
| Auth | `POST /auth/register`, `/auth/login`, `/auth/logout`; `GET/PATCH /me`; `POST /me/password`; `GET /me/sessions`, `DELETE /me/sessions/:id`, `POST /me/sessions/revoke-others` |
| Hồ sơ | `GET/POST /subjects`, `GET/PATCH /subjects/:id`, `GET /subjects/:id/status`, `POST /subjects/:id/archive`, `POST /subjects/:id/deletion-requests` |
| Chia sẻ | `GET/POST /subjects/:id/invitations`, `GET /invitations/:token`, `POST /invitations/:token/accept`, `GET/DELETE /subjects/:id/care-links[/:linkId]` |
| Liên hệ khẩn cấp | `GET/POST /subjects/:id/emergency-contacts`, `PATCH/DELETE /subjects/:id/emergency-contacts/:contactId` |
| Thiết bị | `POST /subjects/:id/devices/claim`, `GET /subjects/:id/devices`, `POST /devices/:id/release`; admin `GET/POST /admin/devices`, `POST /admin/devices/:id/claim-code`, `POST /admin/devices/:id/rotate-key` |
| Ingest | `POST /ingest/telemetry`, `/ingest/events` (header `x-device-id`, `x-device-key`); MQTT `v1/devices/{id}/telemetry` + `events`/`acks` là thử nghiệm, chưa kiểm broker thật |
| Đo | `GET /subjects/:id/measurements?from&to`, `GET /subjects/:id/daily-summary?date`, `GET /subjects/:id/insights?days=7|14|30`, `GET /subjects/:id/export.csv` |
| Cảnh báo | `GET /subjects/:id/alerts`, `GET /alerts/:id`, `POST /alerts/:id/acknowledge`, `/resolve`; `GET /subjects/:id/events` (SSE, `revoked`) |
| Thông báo | `GET /notifications`, `POST /notifications/:id/read` |
| AI | `GET /subjects/:id/assistant/summary`, `POST /subjects/:id/assistant/ask` (template fallback + OpenAI-compatible tùy chọn, `dataQuality`); `GET /subjects/:id/assistant/capabilities`, `GET /subjects/:id/assistant/drafts`, `POST /subjects/:id/assistant/drafts`, `POST /subjects/:id/assistant/drafts/from-text` (parser rule-based), `GET /assistant/drafts/:id`, `PATCH /assistant/drafts/:id`, `POST /assistant/drafts/:id/confirm|cancel` (FR-21 backend, nháp lịch nhắc/việc bảo trì). `agent-runs`/planner/RAG theo đặc tả dài hạn **chưa triển khai** — xem mục 11. |
| Bảo trì | `GET /maintenance-tasks`, `POST /maintenance-tasks`, `POST /maintenance-tasks/:id/close` |
| Studio | `GET/POST /workspace-views`, `GET /workspace-views/:id`, `PUT /workspace-views/:id/draft`, `POST /workspace-views/:id/previews`, `POST /workspace-views/:id/publications`, `POST /workspace-views/:id/rollback`, `GET /workspace-views/:id/publications`, `GET /workspace-views/:id/data` |
| Admin | `GET /admin/users`, `PATCH /admin/users/:id/status`, `GET /admin/audit`, `GET /admin/policies/:key`, `POST /admin/policies/:key/previews`, `PUT /admin/policies/:key`, `GET /admin/overview`, `GET /admin/retention/preview`, `GET /admin/jobs`, `GET /admin/outbox/summary` |

Chi tiết request/response nằm trong `packages/contracts` theo từng miền. Bảng này rút gọn để đọc; danh sách đầy đủ theo controller trong `apps/api/src/*/*.controller.ts`. OpenAPI cho quản trị, trợ lý, hồ sơ/số đo/phiếu đi khám/cảnh báo/thiết bị/chia sẻ chăm sóc/lịch nhắc/liên hệ khẩn cấp/bảo trì/cấu hình chính sách/thông báo/xác thực/studio/ingest telemetry/health/realtime đã sinh từ Zod tại `docs/api/openapi.v1.json`, phủ đủ route 21 controller; vẫn chưa kiểm schema/response runtime; đã có validator nội bộ + 10 test và workflow CI nhưng CI chưa chạy, chưa có validator độc lập/generated client. Khi mở rộng phải sinh từ đúng nguồn, không viết tay bản schema thứ hai.

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

**Trạng thái cổng ngày 15/11/2026:** typecheck, unit test API/web, API randomized (219/219), E2E (26/26) và production build web đều đã chạy lại và đạt trên máy dev. Đây là bằng chứng phần mềm, không thay cho kiểm PostgreSQL/MQTT thật, firmware/độ chính xác hay khả dụng người cao tuổi.

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

- Các cổng kỹ thuật mục 8 đã chạy lại với output thật: API **325 test/35 suite** (22/11/2026), web **390 test** (22/11/2026, chạy tuần tự), randomized 325/325, E2E 26/26 (18/11/2026), build web pass. **Chưa đạt đầy đủ** ở phần bằng chứng thực tế: MQTT broker/ACK, PostgreSQL thật, firmware/độ chính xác, retention production/xóa cứng và khả dụng người cao tuổi.
- Reviewer độc lập không còn finding P0/P1 mở; P2 còn lại được ghi rõ. **Hiện chưa có vòng review độc lập cuối cho toàn bộ v2**; hai reviewer v2 đã chạy; các fix sau báo cáo mới có test cục bộ, chưa có vòng tái kiểm độc lập cuối. P1 privacy/retention còn mở (mới có retention tùy chọn, chưa xóa cứng/đồng thuận); P0-2 đã có mã/test MQTT events/ACK nhưng chưa kiểm broker thật, P0-1 vẫn mở.
- README/API/UI dùng được theo hướng dẫn; demo script tái lập từ DB rỗng. **Chưa kiểm lại demo từ DB rỗng trong lượt tài liệu này.**
- Docs nguồn được cập nhật; HTML build `--check` đạt.
- Giới hạn (firmware, push, dữ liệu thật, PostgreSQL production) được nêu rõ ở README và báo cáo.

## 11. Trạng thái triển khai (cập nhật 15/11/2026, bổ sung 18/11/2026 cho v7)

Đây là **trạng thái kỹ thuật do nhóm tự kiểm**, không phải nghiệm thu của giảng viên hay xác nhận sản phẩm đã hoàn chỉnh. Mọi số liệu dưới đây lấy từ lần chạy thật trong repo; bằng chứng chi tiết ở `reports/handoffs/`, `reports/qa/` và `reports/worklog/`.

### Đã có mã chạy được

- **API** (`apps/api`, NestJS 11 + Drizzle + PGlite/PostgreSQL): xác thực phiên và cài đặt tài khoản; hồ sơ, lời mời/chia sẻ quyền có `canViewMeasurements`; lưu trữ hồ sơ + ghi nhận yêu cầu xóa; liên hệ khẩn cấp; thiết bị claim/release/rotate; ingest HTTP + MQTT adapter, chống trùng, assignment theo `measured_at`, cách ly; đo lường/tổng hợp/CSV/insights 7–30 ngày; cảnh báo có state machine (gồm `unconfirmed`) + ack/resolve compare-and-set; outbox + SSE có `revoked`; Studio draft/preview/publish/rollback; trợ lý tóm tắt/hỏi đáp có `dataQuality` và fallback, nháp lịch nhắc/việc bảo trì có preview/confirm (parser câu đơn giản chỉ cho lịch nhắc); bảo trì xem/tạo/đóng; admin user/device/policy CAS/audit.
- **Web** (`apps/web`, React 19 + Vite): landing, đăng nhập/đăng ký/lời mời, khung ứng dụng; **`/app` là Hôm nay** (trợ lý nằm trong trang), `/app/overview` là **Sức khỏe**; lịch sử + biểu đồ, cảnh báo + SSE + hộp thông báo, hồ sơ + lưu trữ/yêu cầu xóa, thiết bị, chia sẻ + liên hệ khẩn cấp, cài đặt tài khoản, Studio, công việc, quản trị; trạng thái rỗng/lỗi/mất quyền và nhãn dữ liệu mô phỏng.
- **Simulator** (`tools/simulator`): telemetry theo profile, fall cancel/confirm/duplicate/late/sos, queue retry, không in device key; đã chạy end-to-end với API.
- **Seed demo** idempotent: 3 tài khoản, 2 hồ sơ, thiết bị, telemetry tổng hợp 6 ngày, cảnh báo, task, outbox, liên hệ khẩn cấp demo. Dữ liệu telemetry ghi `source='simulator'` và hiển thị `is_synthetic=true`.

### Nhật ký thay đổi v2 (ngắn)

| Thay đổi | Hành vi chính | Bằng chứng |
| --- | --- | --- |
| Cài đặt tài khoản/phiên | `PATCH /me`, đổi mật khẩu thu hồi phiên khác, xem/thu hồi phiên; UI `/app/settings` | `account.spec.ts`, `SettingsPage.test.tsx` |
| Xu hướng 7/14/30 ngày | `/insights` một query cho cả cửa sổ; ngày thiếu `hasData=false`, không nội suy; card dashboard | `insights.spec.ts`, `RecentInsightsCard.test.tsx` |
| Liên hệ khẩn cấp | CRUD, tối đa 5, một primary; owner ghi, caregiver có `canReceiveAlerts` đọc; `tel:` trong cảnh báo | `emergency-contacts.spec.ts`, test component contacts |
| Tạo việc bảo trì | `POST /maintenance-tasks`; thiết bị phải đang gắn; caregiver chỉ xem; hạn quá khứ bị từ chối | `task-create.spec.ts`, `TasksPage.test.tsx` |
| Lưu trữ/yêu cầu xóa | Archive 204 + thu hồi care link, không xóa dữ liệu; deletion-request 202 `recorded`, chỉ audit; retention job tùy chọn cho telemetry/outbox/realtime/AI summary/nháp trợ lý đã hết hạn | `subjects.spec.ts`, `retention.spec.ts`, `SubjectsPage.test.tsx` |
| Quyền xem số đo | `canViewMeasurements` tách khỏi cảnh báo; 403 nghiệp vụ; `/status` có `healthDataVisible`; AI cũng bị chặn | `care.spec.ts`, `devices.spec.ts`, `assistant.spec.ts` |
| Badge/banner | Badge chưa đọc, banner thông báo mới toàn tài khoản, banner mất SSE; không dựa vào màu | `AppShell.test.tsx`, `useUnreadNotifications.test.tsx`, `useSubjectEvents.test.tsx` |
| Quản trị thiết bị | Tab thiết bị: danh sách, cấp mã, xoay khóa; mã/khóa chỉ hiện một lần | `AdminPage.test.tsx`, `devices.spec.ts` |
| Studio ranh giới dữ liệu | Preview/data theo `sharedFrom`/`historyDays` và quyền cảnh báo; publish CAS; rollback tạo bản mới | `studio.spec.ts` T12/T13 và test publish/rollback |
| Cách ly ingest | Assignment theo `measured_at`; telemetry cách ly 202 `accepted`/`QUARANTINED`; sự kiện cách ly 202 `rejected`/`QUARANTINED`; không incident/outbox/SSE | `ingest.spec.ts`, `incidents.spec.ts` T19–T24 |
| SSE thu hồi | Mỗi vòng kiểm phiên/trạng thái + care link; `event: revoked` rồi đóng | `sse.spec.ts` S1–S6 |
| AI dataQuality | Coverage/gaps/limitations/synthetic trong contract/template/prompt; hậu kiểm cụm “bình thường” | `assistant.spec.ts`, `AssistantPage.test.tsx` |
| Vòng đời suspected | Job chuyển `unconfirmed` sau ngưỡng; UI “Chưa xác định”; confirmed muộn mở lại `open` | `incidents.spec.ts` T13–T18 |
| Cửa sổ chia sẻ | `historyDays`/`sharedFrom` áp cho lịch sử, cảnh báo, notification, Studio, AI | `incidents.spec.ts`, `notifications.spec.ts` N4–N10, test caregiver window |
| Hiệu năng/a11y/motion | Code-split route, font self-host, focus/contrast, chuyển trang nhẹ, `prefers-reduced-motion` | Test web và handoff v2; chưa đo mạng thật |

### Lát cắt v3 — trợ lý là trung tâm (15/11/2026)

| Thay đổi | Hành vi chính | Bằng chứng |
| --- | --- | --- |
| Trợ lý là route mặc định | `/app` mở AssistantPage; dashboard chuyển `/app/overview`; `/app/assistant` giữ tương thích; nav Trợ lý đầu, Tổng quan thứ hai; admin-only về `/app/admin` | `router.test.tsx`, `AppShell.test.tsx`, `e2e/assistant.spec.ts` |
| Hội thoại và bối cảnh | Bản tin đầu ngắn + 4 fact; chi tiết/nguồn/DataQualityPanel trong `<details>`; hội thoại nhiều lượt; composer trên thread; cột bối cảnh cảnh báo/lần nhận cuối/liên kết | `AssistantPage.test.tsx` 15 test, `e2e/assistant.spec.ts`, ảnh 1280/390/360/chữ lớn |
| Quyền và cô lập hồ sơ | 403 thiếu quyền số đo hiển thị trạng thái quyền, khóa gửi và không retry vô ích; thiếu `canReceiveAlerts` không gọi API cảnh báo; đổi hồ sơ reset thread, bỏ phản hồi muộn | `AssistantPage.test.tsx`; `incidents.spec.ts` 29 test |
| Ngôn ngữ sản phẩm | Bỏ “Bản demo/đồ án/giảng viên/nghiệm thu” khỏi text/metadata/aria-label web; giữ nhãn nguồn mô phỏng/disclaimer; landing/login/footer/settings đồng bộ | `LandingPage.test.tsx`, `AppShell.test.tsx`, grep copy trong e2e |
| Mobile | Composer + nút Gửi nằm trên bottom-nav ở 390/360/chữ lớn; gợi ý gọn một hàng; 0 tràn ngang | ảnh `C:/tmp/ui-v3-assistant`, `C:/tmp/ui-v3-live-*`; bounding box trong handoff v3 |

### Lát cắt v4 — giao diện đơn giản, thay trực tiếp (15/11/2026 — đã được v7 thay thế)

Người dùng bác giao diện v3 vì quá nhiều chữ/khối; yêu cầu thay trực tiếp, không preview. v4 giữ nguyên nghiệp vụ/API, thay IA và trình bày:

| Thay đổi | Hành vi chính | Bằng chứng |
| --- | --- | --- |
| `/app` = Hôm nay | Một câu trạng thái (cảnh báo/thiết bị/quyền), hành động Gọi/Xem cảnh báo, ô hỏi + 3 gợi ý; không bản tin/4 chỉ số/cột bối cảnh | `AssistantPage.test.tsx`, `e2e/assistant.spec.ts`, ảnh `C:/c/tmp/v4-live/app-*` |
| Nav 4 mục | Hôm nay/Cảnh báo/Người thân/Thêm; Sức khỏe mở từ link, Cài đặt/Thiết bị/Thông báo/Công việc/Studio trong Thêm (mục “Thêm” **đã bị bỏ ở v7** — xem lát cắt v7 bên dưới) | `AppShell.test.tsx`, `router.test.tsx`, E2E nav |
| Công khai tối giản | Landing hero + 3 thẻ + dòng an toàn; login/register một thẻ; bỏ khối “Tài khoản trải nghiệm” và nút tự điền | `LandingPage.test.tsx`, `LoginPage.test.tsx`, `smoke.spec.ts` 26 test |
| Quản trị 4 tab | Tổng quan/Người dùng/Thiết bị/Nâng cao; 4 KPI; audit panel ngoài bảng, policy lỗi trong viewport | `AdminPage.test.tsx`, ảnh admin 1280/390 |
| Trạng thái thiết bị | `offline` dùng `lastSeenAt`; `stale` dùng `lastMeasuredAt` và câu “Chưa có số đo mới”, không gọi ngoại tuyến | `AssistantPage.test.tsx`, re-review R-01 |
| Hồi quy đã sửa | Topbar mobile không tràn khi hỏi đăng xuất; Overview chữ lớn không tràn; nút Gửi trên nav; resolved alert không đưa Gọi lên trước | `AppShell.test.tsx`, `AlertDetailPage.test.tsx`, `e2e/smoke.spec.ts` |

**Review v4:** 3 reviewer độc lập (public/admin/app) tìm 69 phát hiện ban đầu; sau các vòng sửa còn 15 P2/P3 public, 18 P2/P3 admin, 24 P2/P3 app (1 P1 stale đã sửa). Báo cáo ở `reports/qa/v4-*.md`; **chưa có reviewer độc lập cho các bản sửa vòng 2 (public/admin/app)**. Các P2 còn lại (menu tài khoản, gộp 3 giá trị nhịp tim, hai nút tải lịch sử, policy summary 360) được ghi nhận, không tuyên bố đã đóng.

### Lát cắt v7 — giao diện xây lại (18/11/2026)

Nghiệp vụ, API và contract giữ nguyên; thay toàn bộ nền tảng trình bày: token + primitive dùng chung, shell mới, CSS tách theo feature và bỏ các lớp override chồng nhau. Chia theo lane: nền tảng/khung → công khai–đăng nhập–đăng ký–lời mời–404 → Hôm nay–Cảnh báo–hộp thông báo–chi tiết cảnh báo–trợ lý → Sức khỏe–Lịch sử đo → Người thân–Chia sẻ–Thiết bị–Công việc–Tài khoản → Quản trị–Studio.

| Thay đổi | Hành vi chính | Bằng chứng |
| --- | --- | --- |
| Nav 4 mục thật | Hôm nay/Cảnh báo/**Sức khỏe**/Người thân; **bỏ hẳn menu “Thêm”**; `routeScope` là nguồn duy nhất quyết định mục active, dòng ngữ cảnh và chế độ hộp thông báo | `apps/web/src/app/routeScope.ts`, `AppShell.test.tsx`, `reports/qa/evidence/v7-foundation/shell-behavior.json` |
| Badge = cảnh báo đang mở | Badge trên mục Cảnh báo đếm cảnh báo đang mở của hồ sơ đang xem (tải 20, còn trang sau thì `20+`), không còn là badge thông báo chưa đọc | `AppShell.tsx`, review W1 P2-03 (`reports/qa/v7-foundation-review.md`) |
| Hộp thông báo có chỗ | `/app/alerts?view=notifications` mount `NotificationsPage` thật; `/app/notifications` chuyển tiếp; đánh dấu đã đọc được, **không** xác nhận/đóng cảnh báo | `reports/qa/evidence/v7-c/behaviour.json` (tab, mark-read, URL sau reload) |
| Ngữ cảnh hồ sơ một dòng trên H1 | Chỉ 5 loại trang (Hôm nay kể cả alias, danh sách Cảnh báo, Sức khỏe, Lịch sử đo, Thiết bị); trang ghim theo id và hộp thông báo không có selector giả | `shell-behavior.json` (`contextBeforeH1`, `inbox.hasContext=false`) |
| Menu tài khoản ở avatar | Tài khoản / Quản trị (chỉ admin) / chữ lớn `Aa` / Đăng xuất có hỏi lại; desktop ở rail, mobile ở topbar; **không link Studio** | `shell-behavior.json` (`hasStudio=false`, item 44px) |
| Công khai, auth, lời mời, 404 | Landing một câu giá trị + flow + dòng giới hạn bốn ý; lỗi trường được focus; token lời mời sai có câu riêng; 404 có bản công khai và bản trong khung | ảnh `reports/qa/evidence/v7-p/`, `states.json`, `e2e/smoke.spec.ts` |
| Quản trị 5 mục | Tổng quan/Người dùng/Thiết bị/Chính sách/Nhật ký; mã gắn và đổi khóa chỉ hiện một lần, đổi khóa có xác nhận | ảnh `reports/qa/evidence/v7-a/` |
| Studio | Danh sách + tạo view; 3 bước cấu hình → xem trước → công bố, lịch sử + rollback tạo bản mới; vào bằng deep link, không có mục menu | ảnh `v7-a/studio-*`, `reports/handoffs/v7-a.md` |
| Bằng chứng đưa vào repo | Ảnh + số đo hành vi của cả 6 lane nằm trong `reports/qa/evidence/v7-*/`, thay cho ảnh ở `C:/tmp` của các vòng trước | — |

**Tự chạy lại ngày 18/11/2026 trên worktree tài liệu (sau khi hợp nhất các lane giao diện v7):** web **38 file/346 test**, E2E **26/26**, API **20 suite/219 test**, simulator **23 test**, `build.py --check` khớp nguồn và `check-examples` parse **5/5**. Lượt này **không** chạy lại typecheck, build production, randomized, seed hay MQTT exposure. Lệnh và mốc thời gian chi tiết ở [chương 8](08-kiem-thu-va-danh-gia.md).

**Còn mở ở v7:** mới có **một** vòng review độc lập cho W1 foundation (`reports/qa/v7-foundation-review.md`), **chưa có review độc lập cho toàn bộ giao diện v7**; chưa kiểm Firefox/WebKit, thiết bị thật hay AI provider thật. Các khoảng hở nghiệp vụ/backend ở mục “Chưa làm hoặc chưa đủ bằng chứng” bên dưới vẫn nguyên (kiểm MQTT broker thật/P0-1, retention/xóa thật, ngưỡng y khoa, form tạo thiết bị, OpenAPI validator độc lập/generated client, CI đã chạy).

### Lệnh kiểm đã dùng (v1–v4, 15/11/2026)

```bash
pnpm -r typecheck
pnpm build:contracts
cd apps/api && pnpm test
cd apps/api && pnpm test:random --seed=20261115
cd apps/web && pnpm test
cd apps/web && pnpm build          # pass; chunk theo route
cd apps/web && pnpm test:e2e       # 26/26
cd tools/simulator && npm test
node tools/docs/check-examples.mjs # sau pnpm build:contracts
python tools/docs/build.py --check
```

Kết quả chạy ngày **15/11/2026** (sau merge v4): API **20 suite/219 test pass** (228,6 s; một test insights phụ thuộc giờ đã được làm tất định); web **35 file/250 test pass**; simulator **23 pass**; typecheck pass; **E2E 26/26**; web production build **pass**; docs `--check` và payload mẫu pass; seed DB trống pass (3 user/2 hồ sơ/1 thiết bị/1.681 telemetry/1 liên hệ khẩn cấp demo). Không chạy PostgreSQL/MQTT broker thật, Web Push, AI provider thật, p95 hay kiểm khả dụng trong lượt này. Bằng chứng chi tiết ở `reports/handoffs/`, `reports/qa/`, `reports/worklog/`; không dùng con số trong tài liệu này thay cho việc chạy lại.

### Chưa làm hoặc chưa đủ bằng chứng

- **Firmware ESP32, BOM, độ chính xác phát hiện ngã, thời lượng pin** — ngoài phạm vi mã web/API; không có số liệu đo thật. `docs/05` vẫn là khảo sát ứng viên.
- **Web Push, email/SMS** — V10b backend đã có outbox `web_push`, preference/subscription và transport `web-push` sau cờ; **chưa có service worker/UI** và chưa kiểm gửi thật trên trình duyệt. Email/SMS chưa có.
- **PostgreSQL thật, nhiều instance** — mới kiểm PGlite một tiến trình; rate limit, SSE, CAS chưa benchmark/kiểm đa kết nối thật.
- **MQTT broker/ACL/ACK** — adapter đã subscribe telemetry/events, ingest fall/SOS dùng chung `IncidentsService` và publish ACK sau commit (P0-2 có mã/test cục bộ). **Chưa** có ingest `status`, chưa xác thực khóa thiết bị ở tầng ứng dụng (P0-1 mở), chưa kiểm broker/ACL/TLS thật. HTTP vẫn là đường ingest chính thức.
- **Xóa/retention** — archive và deletion-request đã có nhưng chỉ ẩn/ghi audit; retention job **mặc định tắt** đã có cho telemetry/outbox/realtime/AI summary/nháp trợ lý đã hết hạn; chưa có xóa cứng toàn bộ hồ sơ, xóa export/AI cache/backup hay API/UI cấu hình.
- **Đặc tả AI dài hạn** — `agent_runs`, `run_steps`, `step_attempts` có bảng nhưng chưa có runtime/endpoint; planner/tool registry, scheduler, luồng duyệt cấu hình chung, RAG chưa triển khai. Hiện có summary/ask giới hạn trên số liệu tổng hợp và backend nháp `care_reminder.create`/`maintenance_task.create` (FR-21).
- **FR-13 ngưỡng sức khỏe/ngã** — chỉ có policy vận hành `device_runtime`; chưa có ngưỡng y khoa có nguồn/phiên bản.
- **UI tạo thiết bị admin** — tab thiết bị có list/cấp mã/xoay khóa nhưng chưa có form tạo; phải gọi API admin.
- **Studio approval độc lập** — người tạo view tự publish; chưa có bước người khác chấp nhận.
- **OpenAPI validator độc lập/generated client, đo khả dụng người cao tuổi, p95/NFR-07, CI chạy thật** — chưa làm; OpenAPI tại `docs/api/openapi.v1.json` đã phủ đủ route 21 controller, có validator nội bộ + 10 test nhưng chưa kiểm schema/response runtime. Code-split đã có; bundle chỉ đo cục bộ, chưa đo mạng thật.
- **P1 privacy/retention còn mở** — chưa có luồng đồng ý/đại diện cho người được chăm sóc, xóa cứng/backup; deletion-request mới ghi audit; retention job mới ở mức tùy chọn, mặc định tắt. Không tuyên bố tuân thủ pháp lý.
- **Tái kiểm độc lập sau fix v2/v3/v4** — đã có reviewer độc lập cho public/admin/app v4 và 2 vòng re-review; các P1 chính đã đóng bằng test/đo lại. **Chưa có reviewer độc lập cho các bản sửa vòng 2 (public/admin/app)**; các P2 còn lại trong `reports/qa/v4-rereview-*.md` chưa đóng hết. Với v7, mới có review W1 foundation; các lane P/C/H/R/A chưa có review độc lập trên bản hợp nhất. Không đóng finding chỉ vì có handoff; chưa kiểm Firefox/WebKit/AI thật.

### Giới hạn vận hành đã biết

- PGlite mở file DB độc quyền theo process: phải dừng API trước khi chạy seed/migration từ process khác.
- `apps/api` build ra `dist/src/main.js` (rootDir `src`); script `start` đã trỏ đúng.
- Web dev dùng alias package hợp đồng (`packages/contracts`) sang source TypeScript để tránh interop CJS/ESM; build dùng package exports.
- Web production build đã pass; khi kiểm UI nên dùng build/preview cho hành vi production, dev server có StrictMode có thể gửi lặp request đầu.

## 12. Kết quả review và trạng thái xử lý (14–15/11/2026)

Reviewer là phiên mới, chỉ đọc và tự chạy lại trên DB/API riêng; không tin kết quả trong handoff. Mục này phân biệt **đã sửa + có test cục bộ**, **chưa tái kiểm độc lập** và **còn mở**; không đóng finding chỉ vì có handoff.

- **Backend v1** (`reports/qa/review-backend-2026-11-14.md`): 0 P0; 2 P1 đã được lead sửa và reviewer tái kiểm đóng (SSE kiểm `canReceiveAlerts`; dedupe incident theo `(device_id, message_id)`). P2 còn: `requireHistory` với caregiver mới, unique index invitation pending, PGlite đơn tiến trình, ghi chú vận hành.
- **Frontend v1** (`reports/qa/review-frontend-2026-11-14.md`): 0 P0/P1; 5 P2, lead đã sửa P2-1/P2-3/P2-5; P2-2 dùng `role="group"` + `aria-pressed` (không gọi là ARIA tabs); P2-4 code-split đã xong. Một lỗi 404 nhất thời trang lời mời không tái hiện, chưa kết luận.
- **Tài liệu/hợp đồng v2** (`reports/qa/v2-docs-consistency.md`): 0 P0, 5 P1, 8 P2 về tài liệu lệch HEAD; đã sửa trong `fix-docs-truth` và tiếp tục cập nhật ở task tài liệu cuối. Bản HTML phải được sinh lại; không sửa tay.
- **Sản phẩm/UX v2** (`reports/qa/v2-product-gaps.md`, `v2-owner-journey.md`, `v2-caregiver-journey.md`, `v2-ux-visual.md`): các P1 chính đã có fix và test cục bộ — vòng đời suspected/unconfirmed, liên hệ khẩn cấp, cảnh báo toàn tài khoản, admin thiết bị, archive/deletion-request, cửa sổ caregiver. Tại thời điểm review v2 các mục PDF, chia sẻ read-only cho bác sĩ, task tự động, kênh thông báo ngoài, chế độ người cao tuổi nằm ngoài phạm vi; đến ngày 18/11/2026 phần xuất PDF đi khám và các tiện ích chăm sóc/AI `FR-15`–`FR-23` đã được đưa vào mục 13 (trạng thái chưa triển khai). Chưa tái kiểm độc lập toàn bộ phần sửa v2.
- **Quyền riêng tư/đạo đức** (`reports/qa/v2-privacy-ethics.md`): quyền xem số đo, copy đồng ý, archive/deletion-request đã bổ sung; **còn mở** quy trình đồng ý/đại diện cho người cao tuổi, retention/xóa thật, đánh giá pháp lý. Không tuyên bố tuân thủ luật.
- **Bảo mật/phân quyền** (`reports/qa/v2-rev-security.md`, `v2-security-authz.md`): các P1 đã có fix/test cục bộ — event ingest theo assignment, MQTT surface/ACL mẫu, quyền số đo tách cảnh báo, SSE thu hồi, notification boundary. **P0-2** đã có ingest sự kiện + ACK qua MQTT (test cục bộ); **còn mở P0-1** (xác thực thiết bị ở tầng ứng dụng/broker thật) và các P2 như lockout DoS, enumeration, cursor alerts, security headers, admin task không cần care link, giới hạn export/SSE.
- **Toàn vẹn dữ liệu** (`reports/qa/v2-data-integrity.md`): quarantine/assignment, notification boundary, last telemetry, status boundary đã có fix/test; chưa có UI xem vùng cách ly, chưa kiểm PostgreSQL thật.
- **IoT/protocol** (`reports/qa/v2-iot-protocol.md`): broker bị hạ xuống profile thử nghiệm, HTTP là đường chính thức; **P0-2** đã có ingest sự kiện/ACK trong mã và test handler, nhưng **chưa kiểm broker/ACL/TLS thật**; **P0-1 vẫn mở**.
- **Chất lượng kiểm thử** (`reports/qa/v2-chat-luong-kiem-thu.md`): hermetic env và randomize đã được cải thiện; đã sửa phụ thuộc thứ tự còn lại. Tại v2 đạt randomized 214/214, E2E 7/7; sau v4 hiện là randomized 219/219, E2E 26/26, build pass. Không dùng “219 test pass” để nói toàn bộ hệ thống đã kiểm.
- **Hiệu năng** (`reports/qa/v2-hieu-nang-va-on-dinh-tai-trang.md`): code-split/font/lịch sử đã tối ưu; số đo p95 trước đó là trên PGlite cục bộ, không đại diện mạng thật và chưa chạy lại sau v2.

**Kết luận:** lát cắt phần mềm có nhiều hành vi được bảo vệ bằng test và các cổng kỹ thuật đã xanh trên máy dev, nhưng **chưa release-ready**: P0-2 đã có mã/test nhưng chưa kiểm broker thật và P0-1 còn mở, retention mới ở mức tùy chọn/chưa chạy production và chưa xóa cứng/backup, chưa có firmware/accuracy, chưa kiểm PostgreSQL/MQTT thật và chưa tái kiểm độc lập từng finding sau fix.

## 13. Kế hoạch mở rộng tiếp theo (bổ sung 18/11/2026 — đang triển khai từng phần)

Các hạng mục dưới đây là **yêu cầu bổ sung của người dùng ngày 18/11/2026**. **Trạng thái 22/11/2026:** `FR-15` (phần web), `FR-16`, `FR-22` đã có mã chạy được và test; `FR-21` mới có **một phần backend** (nháp lịch nhắc/việc bảo trì, preview/confirm; parser rule-based chỉ cho lịch nhắc, chưa UI); các mục `FR-17`, `FR-18`, `FR-19`, `FR-20`, `FR-23` cùng phần thiết bị của `FR-15` **chưa triển khai**. Bằng chứng lúc v8: API **245 test**, web **43 file/377 test**, E2E **26/26**; ảnh trong `reports/qa/evidence/v8-care/`. FR-21 backend hiện có **11 test** trong `assistant-actions.spec.ts` (thêm 2 test nháp việc bảo trì) và **11 test** parser trong `assistant-draft-parser.spec.ts`; API hiện **325 test/35 suite** (22/11/2026; gồm 1 test quan sát job nền + 1 test outbox admin + 1 test hợp đồng OpenAPI). **Ràng buộc thiết bị gọn nhẹ:** giữ thiết bị đeo tối giản, không gắn loa phát giọng nói lên thiết bị; toàn bộ nâng cấp trợ lý AI (`FR-20`–`FR-23`) xử lý ở backend và web:

| Mã | Trạng thái 19/11/2026 |
| --- | --- |
| `FR-15` | **Một phần**: web có lịch nhắc + đánh dấu; chưa có downlink/nút trên firmware |
| `FR-16` | **Đã có bản in** `/app/history/report`; chưa có file PDF tải trực tiếp |
| `FR-22` | **Đã có** 3–5 điểm chú ý trên phiếu |

**Hạng mục và hướng thiết kế:**

| Mã | Tính năng | Hướng thiết kế phần mềm & ràng buộc |
| --- | --- | --- |
| `FR-16` | Xuất phiếu theo dõi PDF 1 trang đi khám | Dùng lại dữ liệu tổng hợp đã kiểm quyền (`canViewMeasurements`, cửa sổ `sharedFrom`/`historyDays`); hiển thị rõ độ phủ, khoảng thiếu, số sự cố ngã và nhãn dữ liệu mô phỏng (nếu có); không tự chẩn đoán y khoa |
| `FR-17` | Nhắc khi sinh hoạt bất thường | Cấu hình khung giờ sinh hoạt linh hoạt theo từng hồ sơ (Dynamic / Configurable, không đóng cứng giờ chung); chỉ xét khi thiết bị đang đeo và có kết nối nhưng thiếu vận động; tách khỏi luồng incident khẩn cấp và chống gửi lặp |
| `FR-15` | Nhắc uống thuốc & sinh hoạt hai chiều | Bổ sung lịch nhắc theo múi giờ hồ sơ, đồng bộ xuống thiết bị qua hàng đợi lệnh có xác thực thiết bị (`downlink command`) và nhận sự kiện *"đã thực hiện"* gửi ngược từ thiết bị; không gợi ý liều hay kê thuốc |
| `FR-18` | Đế sạc kèm còi tìm thiết bị & nhắc quên đeo | Nút *"Tìm thiết bị"* trên web gửi lệnh xác thực xuống thiết bị/đế sạc có giới hạn thời lượng và tần suất kêu; kết hợp trạng thái `not_worn` + đứng yên kéo dài ban ngày theo khung giờ cấu hình để gửi nhắc nhẹ quên đeo |
| `FR-19` | Định vị GPS + SIM 4G khi ra ngoài nhà | Mở rộng trường vị trí tùy chọn trên sự kiện cảnh báo (ngã/SOS) khi triển khai phần cứng ngoài nhà (xét tách phiên bản ngoài nhà để tránh làm cồng kềnh thiết bị đeo trong nhà); kiểm soát chặt quyền xem vị trí theo hồ sơ và không thu thập quỹ đạo liên tục mặc định |
| `FR-20` | Bản tin tóm tắt cuối ngày/cuối tuần tự động | Job nền tổng hợp theo lịch cấu hình từ aggregate đã kiểm `canViewMeasurements` + `canViewAi`, đẩy bản tin gọn vào hộp thông báo (có fallback theo mẫu, chống trùng theo kỳ) |
| `FR-21` | Nhờ AI tạo lịch nhắc/công việc có bước Xem trước – Xác nhận | **Đã có một phần backend (21–22/11/2026):** `care_reminder.create` và `maintenance_task.create` draft → preview → confirm, owner-only, audit, hết hạn/hủy/digest sai bị chặn; nháp task không ghi `maintenance_tasks`, confirm kiểm thiết bị còn gắn hồ sơ; parser rule-based chỉ cho lịch nhắc, gồm ngày kết thúc dạng ngày/tháng(/năm). **Còn thiếu:** UI preview/confirm, câu phức tạp/khoảng tương đối, nháp phiếu |
| `FR-22` | Điểm chú ý chuẩn bị đi khám trên phiếu theo dõi | Bổ sung 3–5 điểm thay đổi số liệu/sự cố nổi bật kèm mốc ngày và khoảng thiếu vào phiếu PDF `FR-16`; có hậu kiểm cấm kết luận chẩn đoán |
| `FR-23` | Hỏi đáp hướng dẫn chăm sóc có trích nguồn đã duyệt | Truy xuất có kiểm soát trên tập tài liệu chăm sóc chính thống đã duyệt trước khi sinh câu trả lời, bắt buộc trích nguồn và từ chối khi vượt ngoài phạm vi nguồn |

## 14. Đề xuất cải thiện hệ thống sau v8 (soạn 20/11/2026 — đang triển khai từng phần)

Mục này trả lời câu hỏi “làm gì tiếp” sau lát cắt v8. Đây là **đề xuất kỹ thuật để người dùng chốt**, không phải cam kết tiến độ, không phải nghiệm thu. V9.1 backend và web đã hợp nhất ngày 20/11/2026; V10a/V10b backend in-app + nền tảng push và MQTT events/ACK đã có trên nhánh riêng, chưa hợp nhất; retention tùy chọn mới ở mức backend, mặc định tắt. Thứ tự lát cắt, phạm vi Web Push, mức retention và hướng MQTT đều nằm trong mục 14.6 và cần quyết định trước khi mở nhánh. Nguồn: trạng thái mục 11–13, yêu cầu `FR-15`–`FR-23` ở [chương 02](02-yeu-cau-va-pham-vi.md), và các finding còn mở ở mục 12.

### 14.1 Khoảng trống có bằng chứng

| # | Khoảng trống | Bằng chứng trong code/tài liệu | Hệ quả |
| --- | --- | --- | --- |
| K1 | Vòng chăm sóc chỉ có “hôm nay” | `GET /subjects/:id/reminders/today`; bảng `care_reminder_completions` chỉ đọc theo một occurrence. **Đã xử lý phần đọc** bằng `GET /subjects/:id/care/adherence` (V9.1 backend, 20/11/2026). **UI đã có** (V9.1 web, 20/11/2026); **backend nhắc chủ động/bản tin đã có** (V9.2b, 20/11/2026) | Đã xử lý phần đọc + backend chủ động; **UI cấu hình có bản preview, chưa hợp nhất** |
| K2 | Chưa có hạ tầng job theo lịch | **Đã có scheduler V9.2b** (`CareSchedulerService`, tick 60 giây, `job_runs`, dedupe outbox) bên cạnh hai `setInterval` cũ. Chưa có advisory lock cho nhiều tiến trình/CI | Đã gỡ chặn cơ bản cho `FR-17`/một phần `FR-20`; còn E2E, hợp nhất preview và vận hành nhiều instance |
| K3 | Cảnh báo chỉ trong ứng dụng | `notification_outbox.channel` luôn `in_app`; **đã khái quát hóa mô hình** (V9.2a, 20/11/2026): `subject_id`, `incident_id` nullable, `kind`, `title`/`body` — nhưng chưa có escalation hay transport ngoài. Chi tiết cảnh báo có danh sách `recipients` nhưng chỉ suy từ outbox, chưa có kênh/thời điểm/trạng thái gửi đầy đủ | Người thân không mở web thì không biết cảnh báo; đây vẫn là rủi ro lớn nhất của sản phẩm cảnh báo té ngã |
| K4 | Trợ lý đọc + hành động có kiểm soát | Đã có summary/ask và **FR-21 backend** cho nháp `care_reminder.create`/`maintenance_task.create` → preview → confirm; parser giới hạn chỉ cho lịch nhắc; chưa có UI/câu phức tạp, chưa có nguồn (`FR-23`) hay bản tin (`FR-20`) | “Trợ lý là trung tâm” đã có một hành động có kiểm soát, nhưng vẫn chưa phải trợ lý hội thoại tự thực thi |
| K5 | Chưa sẵn sàng dữ liệu thật | Yêu cầu xóa chỉ ghi audit; retention mới tùy chọn/mặc định tắt; MQTT mới có mã/test nhưng chưa kiểm broker thật, P0-1 mở; OpenAPI đã phủ đủ route, có validator nội bộ + test nhưng chưa có validator độc lập/generated client/CI đã chạy; chưa test PostgreSQL thật | Demo chạy nhưng chưa thể nói “dùng được với người thật”, chưa đóng được P1 privacy |
| K6 | Thiếu công cụ vận hành | Chưa có UI tạo thiết bị; chưa có UI đọc vùng cách ly (chỉ có ACK `QUARANTINED`); API `GET /admin/jobs`/`GET /admin/outbox/summary` mới chỉ đọc, chưa có UI/cảnh báo job/outbox kẹt; chưa có cấu hình kênh thông báo | Admin phải gọi API; lỗi ingest/job khó điều tra |

### 14.2 Nguyên tắc chọn lát cắt

- Một lát cắt là **một kết quả người dùng thấy được** kèm lớp dữ liệu/quyền mới, không phải danh sách màn hình rời.
- Phần web/server không phụ thuộc firmware; phần cần thiết bị ghi rõ **hoãn**, không mô phỏng là đã có.
- Mọi quy tắc mới có schema + version + validation ở server; giờ/ngưỡng không hard-code trong component.
- Giữ bất biến: cảnh báo không phụ thuộc AI; kiểm quyền ở server; preview không ghi; thông báo chăm sóc không tạo incident.
- Mỗi lát cắt có cổng ra riêng (14.7) và không nới assertion để làm xanh.

### 14.3 Tổng quan lát cắt đề xuất

| Lát cắt | Kết quả người dùng thấy | Yêu cầu | Phụ thuộc | Cỡ đề xuất |
| --- | --- | --- | --- | --- |
| **V9** — Vòng chăm sóc nhìn thấy được | Xem 7/30 ngày đã làm/bỏ qua/chưa ghi nhận; đặt quy tắc nhắc nhẹ khi chưa vận động; nhận bản tin chăm sóc cuối ngày trong hộp thông báo | `FR-15` (phần web), `FR-17`, một phần `FR-20` | v8 reminders; V9.2a notification (đã có); scheduler | V9.1 M, V9.2 M–L |
| **V10** — Cảnh báo không bị bỏ lỡ | Cảnh báo leo thang theo thời gian, biết ai đã được thông báo và khi nào; tuỳ chọn nhận Web Push | `FR-07`, `FR-12` | **V10a + V10b backend đã có** (chính sách, scheduler, outbox `escalation`/`web_push`, preference/subscription); còn service worker/UI + kiểm trình duyệt thật | L |
| **V11** — Trợ lý có hành động và nguồn | Gõ yêu cầu → phiếu nháp xem trước → xác nhận mới lưu; bản tin ngày/tuần; hỏi chăm sóc có trích nguồn | `FR-20`, `FR-21`, `FR-23` | V9–V10; contract AI; bộ tài liệu nguồn | L (tách V11a/V11b) |
| **V12** — Sẵn sàng dữ liệu thật | Xóa/retention có trạng thái và bằng chứng; đồng thuận/đại diện; quyết định MQTT; OpenAPI validator độc lập/generated client/CI/PostgreSQL | `FR-14`, `FR-13`, `NFR-05/06`, P0-2 | D2, D5, D6 | L (chia nhiều PR) |

Thứ tự đề xuất: **V9 → V10 → V11 → V12**. Nếu mục tiêu trước mắt là an toàn khi demo cảnh báo, đổi V9/V10 (quyết định D1). Các quyết định của V12 (retention, MQTT, đồng thuận) nên chốt sớm dù triển khai sau, vì chúng ảnh hưởng schema và lời hứa với người dùng.

### 14.4 Chi tiết từng lát cắt

#### V9 — Vòng chăm sóc nhìn thấy được

**V9.1 — Tổng hợp tuân thủ (đọc + migration nhỏ giữ lịch sử).**

**Backend đã hợp nhất ngày 20/11/2026** (commit `2879ef4`): migration `apps/api/drizzle/0003_loving_justin_hammer.sql`, endpoint `GET /subjects/:id/care/adherence`, hàm thuần `apps/api/src/reminders/care-adherence.ts`, seed completion mẫu; API **256 test/23 suite**. **Web đã hợp nhất ngày 20/11/2026** (commit `b412398`): section giữa “Hôm nay” và danh sách lịch, chọn 7/30 ngày, thẻ từng lịch, pill lưu trữ; web **43 file/385 test**, E2E **26/26**, build pass, 9 ảnh 1280/390 tại `reports/qa/evidence/v9-adherence/` (0 tràn ngang, 1 H1, target ≥44). Lát cắt này giữ nguyên quyền `canViewMeasurements`; **D3 đã chốt dùng lại quyền này cho V9** (xem 14.6). Spec/quyết định/handoff: `reports/orchestration/v9/` và `reports/handoffs/v9-adherence-web.md`.

- Kết quả: trang `/app/care` có dải 7 ngày và bảng theo từng lịch nhắc; người có quyền xem thấy số việc đã làm, bỏ qua và **chưa ghi nhận** (không gọi là “quên”).
- Định nghĩa: occurrence = `times × weekdays` trong `[startsOn, endsOn]`, tính theo `subject.timezone`, chỉ tính mốc **đã qua**. `done`/`skipped` lấy từ `care_reminder_completions`; mốc đã qua không có bản ghi là `pending`. Hiển thị **hai tỉ lệ tách biệt**: `tỉ lệ ghi nhận = (done + skipped) / tổng occurrence đã qua` và `tỉ lệ hoàn thành = done / (done + skipped)`; không gộp “chưa ghi nhận” vào “không làm”, không suy diễn sức khỏe.
- API đã có: `GET /subjects/:id/care/adherence?days=7|30` (mặc định 7, tối đa 30) trả chuỗi ngày + tổng theo lịch nhắc; dùng lại `requireMeasurements`/`requireSubject`. D3 đã chốt dùng lại `canViewMeasurements` cho V9; nếu sau này tách `canViewCare` thì đổi endpoint/UI cùng lúc (xem mục 14.6).
- UI: dải 7 ô có nhãn chữ (không chỉ màu), chú giải “chưa ghi nhận”, link từ thẻ Hôm nay; người thân chỉ đọc.
- Khoảng hiệu lực: chỉ có cờ `active` hiện tại **không đủ** để tính lịch sử đúng (tắt rồi bật lại sẽ mất mốc). Đã thêm bảng `care_reminder_periods` (`reminder_id`, `active_from`, `active_to` nullable), ghi khi tạo/bật/tắt; occurrence chỉ sinh trong giao của `[startsOn, endsOn]` với các khoảng hiệu lực; tạo lịch mở khoảng từ `startsOn` nên backdate vẫn tính lịch sử. Xoá lịch trước đây cascade mất completion; đã đổi sang **lưu trữ mềm** (`archived_at`), chỉ xoá cứng trong luồng xoá dữ liệu (V12) — chốt D9. Lưu trữ vẫn tính vào tổng hợp với cờ `archived`; sửa/đánh dấu lịch đã lưu trữ trả 404.
- Kiểm: logic ngày/thứ/khoảng ngày có test thuần; múi giờ khác Việt Nam (gồm một vùng có DST) để chứng minh không lệch ngày; quyền 403/404; occurrence tương lai không bị tính; tắt/bật lại tạo khoảng mới và không tính ngày đã tắt; lưu trữ mềm giữ completion.
- Ngoài phạm vi: nhắc chủ động, thiết bị, AI, thống kê y khoa.

**V9.2 — Nhắc chủ động (quy tắc + bản tin trong ứng dụng).**

- Điều kiện tiên quyết: **đã làm V9.2a — hạ tầng thông báo theo hồ sơ (20/11/2026)**. `notification_outbox` có `subject_id` (backfill từ incident), `incident_id`/`revision` nullable, `kind`, `title`/`body`; service gửi/lọc/đánh dấu đọc theo `subject_id` + `kind`; migration `0004` backfill. Chi tiết tại [handoff V9.2a](../reports/handoffs/v9-notification-subject.md).
- **Backend V9.2b đã có và hợp nhất master tại `e405996` (20/11/2026):** contract `care-rules`; bảng `subject_rules`/`job_runs`, migration `0005`; scheduler một tiến trình; API `GET/PUT /subjects/:id/care-rules/:kind` + preview 7 ngày; nhắc `inactivity` và bản tin `care_digest` ghi outbox, không tạo incident. Bằng chứng: [handoff V9.2b](../reports/handoffs/v9-care-rules-backend.md).
- **Web preview V9.2 đã có (20/11/2026, nhánh `v9-care-rules-web`, commit `0ebf2f2`):** hai thẻ “Nhắc vận động nhẹ”/“Bản tin cuối ngày” trong `/app/care` (chỉ chủ hồ sơ), bật/tắt, ngày/khung giờ/ngưỡng bước/giờ bản tin, lưu version, xem trước 7 ngày (không ghi). 5 ảnh 1280/390 tại `reports/qa/evidence/v9-care-rules/` (0 tràn ngang, 1 H1, target ≥44); web **44 file/390 test**, E2E 26/26. **Chưa hợp nhất, chờ người dùng chấp nhận preview.**
- Bảng mới (đã có): `subject_rules` (`subject_id`, `kind`, `version`, `config jsonb`, `active`, `created_by`, `created_at`, unique `(subject_id, kind, version)` + partial unique một bản active) và `job_runs` (`job_key`, `run_key`, `started_at`, `finished_at`, `outcome`, `counters`, unique `(job_key, run_key)`).
- `CareSchedulerService` (đã có) một tick 60 giây, `runOnce(now)` để test tất định; ghi `job_runs` trước/sau; giả định **một tiến trình** cho demo (nếu chạy nhiều instance phải thêm advisory lock — ghi rõ).
- Quy tắc sinh hoạt `kind=inactivity`, config v1 (đã có; ví dụ, không phải ngưỡng y khoa): `{enabled, weekdays:[1..7], windowStart:'09:00', windowEnd:'18:00', minSteps:50, graceMinutes:30}`; mặc định **tắt**, chủ hồ sơ bật, validate bằng zod, lưu version.
- Điều kiện gửi: hồ sơ không lưu trữ; thiết bị đang gắn; `lastSeenAt` trong ngưỡng `device_runtime`; có ít nhất một mẫu trong khung giờ; chất lượng mẫu gần nhất không phải `not_worn`; tổng bước trong khung < `minSteps`; đang trong `[windowEnd, windowEnd + grace]`; chưa gửi trong ngày. Không có dữ liệu thì **không nhắc** và ghi audit `skipped:no_data`.
- Chống lặp: `dedupe_key` cố định `care:{subjectId}:{localDate}:{recipientId}:in_app:care_rule`; chạy lại job trong ngày không tạo bản ghi thứ hai. Không tạo incident, không phát SSE cảnh báo, không vào badge cảnh báo.
- Bản tin cuối ngày `kind=care_digest`, config v1 `{enabled, time:'20:00'}` theo múi giờ hồ sơ: tổng hợp việc đã làm/chưa ghi nhận, bước chân, cảnh báo đang mở, khoảng thiếu; **template xác định**, chưa dùng AI (AI ở V11). Người nhận phải còn `canViewMeasurements` tại thời điểm gửi; mất quyền thì supersede như incident.
- API (đã có): `GET/PUT /subjects/:id/care-rules/:kind` (chỉ chủ hồ sơ), `POST /subjects/:id/care-rules/:kind/previews` (trả lịch kiểm tra 7 ngày tới + giải thích, **không ghi**); chưa có endpoint gộp settings.
- UI (**đã có bản preview, chưa hợp nhất**): hai thẻ quy tắc trong `/app/care` với bật/tắt, khung giờ, ngưỡng bước, giờ bản tin, xem trước, câu “chỉ là nhắc nhẹ theo cài đặt của bạn, không phải cảnh báo khẩn”; chỉ chủ hồ sơ thấy. Bản tin hiển thị trong hộp thông báo, không trộn với cảnh báo.
- Kiểm: clock cố định; chạy job hai lần → một thông báo; offline/`not_worn`/không mẫu → không gửi; hồ sơ lưu trữ → không gửi; thu hồi quyền giữa lúc chờ → supersede; ma trận quyền; E2E đặt quy tắc → nhận bản tin; không có bản ghi incident mới.
- Ngoài phạm vi: rung/nút trên thiết bị (`FR-15` phần cứng), Web Push (V10), nội dung do AI sinh (V11).

#### V10 — Cảnh báo không bị bỏ lỡ

**Trạng thái 22/11/2026 — V10a + nền tảng V10b backend đã có (nhánh `v10-backend`, chưa hợp nhất):** API `GET/PUT /subjects/:id/alert-policy` + preview; lưu vào `subject_rules` kind `alert_escalation` với version; mặc định **tắt** và các mốc 10/20/30 phút chỉ là đề xuất. Scheduler 60 giây chỉ xử lý incident `open`, chọn bậc cao nhất đã tới hạn, ghi outbox `kind='escalation'` cho chủ hồ sơ + care link active có `canReceiveAlerts`, bỏ tài khoản khóa; dedupe theo incident/bậc/người nhận; audit `no_recipient` một lần/bậc. Worker bỏ qua escalation đang chờ nếu incident đã ack/đóng hoặc mất quyền. Preview chính sách trả người nhận hiện tại (chủ hồ sơ + care link `canReceiveAlerts`, bỏ tài khoản khóa) và cảnh báo khi không có người nhận; chi tiết cảnh báo trả thêm `deliveries` cho từng người nhận (loại/kênh/trạng thái/số lần/thời điểm gửi/đọc) để biết ai đã được thông báo và khi nào. **V10b backend**: preference (`GET/PUT /me/notification-preferences`, trả khóa công khai VAPID khi bật), subscription (`GET/POST/DELETE /me/push-subscriptions`, chặn endpoint IP/localhost), outbox `web_push` cho alert/escalation, worker xoá subscription khi 404/410 và backoff hữu hạn; mặc định tắt, cần `WEB_PUSH_ENABLED` + VAPID. **Chưa có service worker/UI cấu hình, chưa kiểm push thật trên trình duyệt, SMS/gọi tự động, hay E2E hai tài khoản.** Test mới: `alert-policy.spec.ts` (4), `alert-escalation.spec.ts` (10, fake clock), `notification-settings.spec.ts` (3), `push-delivery.spec.ts` (3) + 1 test chi tiết `deliveries`; thêm 1 test MQTT event/ACK trong `ingest.spec.ts`; API **325 test/35 suite** (thêm 2 test retention/preview + 1 test quan sát job nền + 1 test outbox admin + 11 test trợ lý hành động + 11 test parser + 1 test hợp đồng OpenAPI).

- Kết quả: khi cảnh báo `open` chưa được xác nhận, hệ thống thông báo lại theo bậc; chi tiết cảnh báo mở rộng danh sách người nhận hiện có thành ai/kênh/thời điểm/trạng thái gửi; người dùng bật/tắt kênh ngoài ứng dụng.
- Cấu hình leo thang: `subject_rules` kind `alert_escalation`, version hoá, chủ hồ sơ sửa, mặc định an toàn (ví dụ 10/20/30 phút, tối đa 3 bậc — **giá trị đề xuất, cần chốt**); preview bắt buộc trước khi lưu. Không áp dụng “giờ yên tĩnh” cho cảnh báo khẩn; chỉ nhắc chăm sóc mới có giờ yên tĩnh.
- Chỉ leo thang incident ở trạng thái cần người xử lý (`open`); `suspected` giữ hành vi hiện tại trừ khi chốt D8. Dừng khi `acknowledged`/`resolved`/`cancelled` hoặc quyền bị thu hồi; mọi bản ghi chờ cũ chuyển `superseded`.
- Người nhận: chủ hồ sơ + care link active có `canReceiveAlerts`, kiểm lại từng lần gửi; bỏ qua tài khoản bị khóa; nếu không còn ai thì audit `no_recipient`, không giả vờ đã gửi.
- Kênh: `in_app` luôn bật; **backend Web Push đã có** sau cờ `WEB_PUSH_ENABLED`, cần VAPID/HTTPS, lưu subscription, xoá khi 404/410. Còn thiếu service worker/UI để đăng ký và hiển thị trạng thái “bị từ chối/chưa bật”. Không hứa hoạt động khi trình duyệt đóng trên mọi nền tảng.
- Gửi lỗi: dùng `attempts`/`nextAttemptAt`/`lastError` sẵn có, backoff hữu hạn, hiển thị trạng thái gửi cho người có quyền; không retry vô hạn.
- API: `GET/PUT /subjects/:id/alert-policy`, `POST .../previews`; `GET/PUT /me/notification-preferences`; `POST/DELETE /me/push-subscriptions`; chi tiết cảnh báo giữ `recipients` hiện có và thêm kênh/thời điểm/trạng thái gửi (chỉ người có quyền).
- Kiểm: fake clock cho từng bậc; ack đồng thời; thu hồi quyền giữa chuỗi; trạng thái kết thúc; 410/không có subscription; cấm gửi trùng; E2E hai tài khoản; ghi rõ trình duyệt đã kiểm thật.
- Ngoài phạm vi: SMS/email/cuộc gọi tự động, tích hợp nhà cung cấp viễn thông, push trên iOS chưa kiểm.

#### V11 — Trợ lý có hành động và nguồn

**V11a — `FR-20` + `FR-21`.**

- `FR-21` **(đã có một phần backend, 21–22/11/2026)**: bảng `assistant_drafts`, capability `care_reminder.create` và `maintenance_task.create`; API `GET /subjects/:id/assistant/capabilities`, `GET /subjects/:id/assistant/drafts` (nháp còn hạn), `POST /subjects/:id/assistant/drafts`, `POST /subjects/:id/assistant/drafts/from-text` (parser rule-based chỉ cho lịch nhắc), `GET /assistant/drafts/:id`, `PATCH /assistant/drafts/:id`, `POST /assistant/drafts/:id/confirm|cancel`. Tạo nháp không ghi `care_reminders`/`maintenance_tasks`; `requestKey` tùy chọn chống tạo trùng khi retry, cùng khóa khác nội dung/capability → 409; `PATCH` sửa nháp còn hạn và cập nhật digest; danh sách chỉ trả nháp `draft` còn hạn; confirm kiểm lại quyền, digest, hạn rồi tạo lịch/task trong cùng transaction; nháp task kiểm thiết bị còn gắn hồ sơ; lặp lại không nhân đôi; audit cả bước tạo/sửa/xác nhận/hủy. **Còn thiếu:** UI, câu phức tạp/khoảng tương đối, `request_key` tổng quát cho mọi hành động (mới có tạo nháp), nháp phiếu. Retention nháp đã hết hạn có thể bật qua `RETENTION_ASSISTANT_DRAFT_DAYS`, mặc định tắt.
- Capability **đã mở**: `care_reminder.create`, `maintenance_task.create`. Capability **đề xuất tiếp**: mở phiếu đi khám; **không** đóng/xác nhận cảnh báo, không đổi quyền, không xoá dữ liệu. Không có bước xác nhận thì không có lệnh ghi.
- **Đã làm:** parser rule-based cho câu đơn giản (giờ, hằng ngày, thứ 2–6, mai, ngày kết thúc dạng ngày/tháng/năm) và input có cấu trúc. **Chưa làm:** hiểu khoảng thời gian tương đối/câu phức tạp hoặc dùng provider để tự điền nháp; khi mở rộng phải không gợi ý liều/kê thuốc.
- `FR-20`: job bản tin ngày/tuần dùng lại scheduler + notification đã làm ở V9.2; nội dung từ aggregate đã kiểm quyền, có `dataQuality`, `sourceRefs`, fallback template; chống trùng theo kỳ; người nhận cần `canViewMeasurements` + `canViewAi`.
- UI: thẻ nháp trong hội thoại với “Xác nhận”/“Huỷ”, hiển thị hết hạn; bản tin trong hộp thông báo; không tự cuộn/không tự gửi.
- Kiểm: tạo/xem nháp **không ghi** dữ liệu nghiệp vụ (0 reminder/task mới); confirm một lần; đổi quyền giữa nháp → 409/403; nháp hết hạn; prompt injection vào câu người dùng; mock provider + template; không có từ chẩn đoán.

**V11b — `FR-23` (tách được nếu thời gian).**

- Danh mục nguồn: `care_documents` (tiêu đề, nhà xuất bản, URL, giấy phép, phiên bản, người duyệt, ngày duyệt, hash nội dung) + chunk; chỉ tài liệu đã duyệt mới được truy xuất.
- Trả lời có trích dẫn bắt buộc; từ chối câu hỏi ngoài phạm vi, câu hỏi chẩn đoán/liều; fallback trích nguyên văn khi không có provider.
- Bộ đánh giá 15–20 câu: câu trả lời đúng nguồn, câu phải từ chối, câu có từ cấm; chạy tự động và ghi kết quả.
- Ngoài phạm vi: tư vấn y khoa, chẩn đoán, kê đơn, dữ liệu người thật; không tuyên bố “đã kiểm chứng y khoa”.

#### V12 — Sẵn sàng dữ liệu thật

- **Retention/xóa:** **đã có bản tối thiểu** — job tùy chọn, mặc định tắt, cấu hình `RETENTION_*`; xóa theo lô 500 và ghi audit `retention.purge` cho telemetry/outbox đã kết thúc/realtime/AI summary/nháp trợ lý đã hết hạn; admin có `GET /admin/retention/preview` chỉ đọc, đếm theo env hiện tại và không xóa. **Còn thiếu:** policy version + publish CAS như policy hiện có, API/UI cấu hình, `deletion-requests` thành luồng `recorded → approved → executing → done/failed` (hoặc chốt chỉ ghi nhận — D5), xóa toàn bộ hồ sơ và AI summary/notification liên quan. CSV hiện **sinh trực tiếp** khi tải, không lưu file; nếu sau này lưu export thì phải đưa vào phạm vi xoá. **Không** tuyên bố xoá backup khi chưa có backup thật.
- **Đồng thuận/đại diện:** bảng `consents` (subject, phiên bản văn bản, phạm vi, người cấp, thời điểm, thu hồi); luồng người cao tuổi không có tài khoản do người đại diện quản lý; thu hồi → thu hồi care link và dừng thông báo; không tự cho người thân quyền sở hữu.
- **MQTT (P0-2):** đã chọn hướng (a) ở mức **mã thử nghiệm**: event ingest dùng chung `IncidentsService` + ACK sau commit, broker vẫn sau profile `mqtt-experimental`. Còn thiếu xác thực thiết bị ở tầng ứng dụng (P0-1), kiểm broker/ACL/TLS thật và quyết định có dùng MQTT production hay chốt HTTP-only. Không đóng P0-1/P0-2 thành production chỉ vì test handler xanh.
- **Cổng kỹ thuật:** OpenAPI đã sinh từ zod (một nguồn, không viết tay), phủ đủ route và có validator nội bộ + 10 test; còn thiếu validator độc lập/generated client và kiểm schema/response runtime; workflow CI đã thêm; dry run cục bộ pass nhưng chưa chạy GitHub, cho typecheck/test/build/docs/openapi:check, còn thiếu test tích hợp PostgreSQL thật, Playwright Firefox/WebKit, axe cho màn hình chính.
- **Vận hành nhỏ:** form tạo thiết bị admin, màn hình vùng cách ly, cấu hình kênh thông báo.
- Kiểm: migration từ DB rỗng; job chạy hai lần không xoá quá; dữ liệu ngoài phạm vi còn; audit; E2E xoá; CI xanh có log.
- Ngoài phạm vi: backup/restore production, tuân thủ pháp lý, đo p95 trên mạng thật.

### 14.5 Bản đồ ảnh hưởng khi đổi mô hình thông báo

Thay đổi notification là **luật dùng chung**, không chỉ một màn hình. Khi triển khai V9.2/V10 phải rà các đường sau:

| Đường | Ảnh hưởng |
| --- | --- |
| Schema/outbox | `subject_id`, `incident_id` nullable, cột `kind`, backfill, index theo `(subject_id, created_at)`, unique `dedupe_key` |
| Dispatcher | Rẽ nhánh theo `kind`; thông báo care không kiểm trạng thái incident; quyền kiểm theo subject; supersede khi mất quyền |
| REST hộp thư | `GET /notifications` trả `subjectId`, `kind`, `incidentId?`; cursor/read giữ nguyên |
| Chi tiết cảnh báo | `recipients` hiện dựa trên outbox incident; khi thêm `kind`/kênh phải giữ danh sách và thêm trạng thái, thời điểm, không lộ người nhận ngoài quyền |
| SSE | Payload `notification.sent` có subject/kind; stream vẫn thu hồi khi mất quyền |
| UI | `NotificationsPage` render được thông báo không có incident, dẫn `/app/care`; badge cảnh báo nav **không đổi nghĩa** (vẫn đếm cảnh báo mở) |
| AI | Digest/ask có thể đọc care summary; vẫn phải kiểm `canViewMeasurements` + `canViewAi`; không đưa nội dung thông báo vào prompt mặc định |
| Export/Studio | Không tự mở thêm dữ liệu care; nếu phiếu đi khám dùng adherence thì phải ghi rõ nguồn và quyền |
| Test/seed | Ma trận quyền, dedupe, supersede, unread count, SSE; seed thêm rule mẫu tắt và vài completion để UI có dữ liệu |
| Docs | `docs/02`, `docs/06`, `docs/07`, `docs/14`, README và HTML phải cập nhật cùng PR |

### 14.6 Quyết định cần chốt trước khi mở nhánh

| Mã | Câu hỏi | Lựa chọn | Khuyến nghị |
| --- | --- | --- | --- |
| D1 | Làm V9 hay V10 trước? | V9 trước để có vòng chăm sóc; V10 trước để giảm rủi ro cảnh báo | V9.1 → V9.2 → V10; đổi nếu ưu tiên an toàn demo |
| D2 | Web Push có nằm trong đồ án? | Chỉ in-app + leo thang; hoặc thêm push sau cờ | Làm leo thang in-app trước; backend push sau cờ đã có, nhưng chỉ nhận “đã kiểm trên Chromium” khi có service worker/UI và kiểm thật |
| D3 | Quyền xem chăm sóc | Dùng lại `canViewMeasurements`; hoặc thêm `canViewCare` | **Đã chốt cho V9: dùng lại `canViewMeasurements`**, không thêm quyền mới; lý do: v8 đã chia sẻ lịch nhắc dưới quyền này, giảm migration/UI và tránh mở rộng dữ liệu. Xem lại `canViewCare` nếu cần tách quyền xem lịch khỏi số đo sau này |
| D4 | Mặc định quy tắc sinh hoạt | Khung giờ/ngưỡng bước/grace | Đề xuất 09:00–18:00, 50 bước, 30 phút; **tắt mặc định**, chủ hồ sơ sửa |
| D5 | Retention/xóa | Chỉ ghi nhận; xóa mềm; xóa cứng + retention | Đã làm retention tùy chọn, mặc định tắt (một số lớp); **chưa chốt** xóa cứng/backup và luồng duyệt deletion-request trước dữ liệu thật |
| D6 | MQTT | Hoàn thiện P0-2; hoặc HTTP-only | Đã có event/ACK thử nghiệm; **chưa chốt production** — cần xác thực thiết bị (P0-1), kiểm broker thật rồi chọn HTTP-only hoặc MQTT |
| D7 | Nguồn cho `FR-23` | Bộ tài liệu nào, giấy phép, người duyệt | Chốt danh mục + giấy phép trước khi viết retrieval |
| D8 | Leo thang cho `suspected`? | Chỉ `open`; hoặc cả `suspected` | Chỉ `open` để không biến nghi ngờ thành khẩn cấp |
| D9 | Xoá lịch nhắc | Xoá cứng (mất completion) hoặc lưu trữ mềm | Lưu trữ mềm (`archived_at`), xoá cứng chỉ trong luồng xoá dữ liệu V12 |

### 14.7 Cổng ra và cách ghi bằng chứng

- Mỗi lát cắt: `pnpm -r typecheck`, test đúng lớp sở hữu, build, E2E luồng chính, ảnh 1280/390, `python tools/docs/build.py --check`.
- Số test/ thời gian chỉ ghi kèm **ngày chạy thật**; không dùng số của lát cắt trước cho lát cắt mới.
- Handoff + worklog ghi rõ phần chưa kiểm (thiết bị, trình duyệt, provider, PostgreSQL) và không đóng finding khi chưa có bằng chứng.
- Review độc lập cho thay đổi quyền/thông báo; nếu chưa có, ghi “chưa tái kiểm độc lập”.
- Docs nguồn + HTML + README cập nhật trong cùng PR; không sửa tay HTML.

### 14.8 Không được báo là đã làm

- Rung/nút “đã thực hiện” trên thiết bị, downlink, còi tìm thiết bị, nhắc quên đeo — chưa có firmware.
- Web Push hoạt động khi đóng trình duyệt trên mọi nền tảng; chỉ nói đúng trình duyệt đã kiểm.
- Đã xoá backup, đã có retention/xoá cứng production, đã đánh giá tuân thủ pháp lý hoặc đã có quy trình đồng thuận được duyệt.
- AI chẩn đoán/kê thuốc, “đã kiểm chứng y khoa”, trợ lý tự xác nhận/đóng cảnh báo, hoặc parser hiểu mọi câu lệnh như LLM.
- Trợ lý đã tự hiểu mọi câu lệnh tự nhiên hoặc đã có UI preview/confirm; hiện có backend nháp `care_reminder.create`/`maintenance_task.create` với input có cấu trúc và parser rule-based cho lịch nhắc.
- Leo thang bảo đảm có người nhận; hệ thống chỉ bảo đảm đã thử gửi và ghi trạng thái.
- Độ chính xác phát hiện té ngã, thời lượng pin, p95 trên mạng thật.
