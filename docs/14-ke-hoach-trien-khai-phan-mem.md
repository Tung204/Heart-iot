# Kế hoạch triển khai phần mềm v1/v2

Ngày lập: **14/11/2026**; cập nhật trạng thái v2/v3/v4 ngày **15/11/2026**, bổ sung lát cắt v7 (giao diện xây lại) và kế hoạch mở rộng `FR-15`–`FR-23` ngày **18/11/2026**. Trạng thái: **kế hoạch triển khai trong phạm vi kỹ thuật của lead**, chưa phải phê duyệt của giảng viên hay nghiệm thu sản phẩm. Tài liệu gốc 01–13 vẫn là nguồn yêu cầu; kế hoạch này chỉ cụ thể hóa phần mã chạy được.

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
- Xóa dữ liệu xuyên backup/AI cache như một quy trình đã kiểm. v2 có `POST /subjects/:id/deletion-requests` nhưng **chỉ ghi audit** `status=recorded`; chưa có job xóa/retention, chưa xóa bản export/AI cache/backup.
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
| Ingest | `POST /ingest/telemetry`, `/ingest/events` (header `x-device-id`, `x-device-key`); MQTT `v1/devices/{id}/telemetry` chỉ là thử nghiệm, chưa có event/ACK |
| Đo | `GET /subjects/:id/measurements?from&to`, `GET /subjects/:id/daily-summary?date`, `GET /subjects/:id/insights?days=7|14|30`, `GET /subjects/:id/export.csv` |
| Cảnh báo | `GET /subjects/:id/alerts`, `GET /alerts/:id`, `POST /alerts/:id/acknowledge`, `/resolve`; `GET /subjects/:id/events` (SSE, `revoked`) |
| Thông báo | `GET /notifications`, `POST /notifications/:id/read` |
| AI | `GET /subjects/:id/assistant/summary`, `POST /subjects/:id/assistant/ask` (template fallback + OpenAI-compatible tùy chọn, `dataQuality`). `agent-runs`/planner/RAG theo đặc tả dài hạn **chưa triển khai** — xem mục 11. |
| Bảo trì | `GET /maintenance-tasks`, `POST /maintenance-tasks`, `POST /maintenance-tasks/:id/close` |
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

- Các cổng kỹ thuật mục 8 đã chạy lại với output thật: API 219 test, web 250 test, randomized 219/219, E2E 26/26, build web pass. **Chưa đạt đầy đủ** ở phần bằng chứng thực tế: MQTT broker/ACK, PostgreSQL thật, firmware/độ chính xác, retention/xóa thật và khả dụng người cao tuổi.
- Reviewer độc lập không còn finding P0/P1 mở; P2 còn lại được ghi rõ. **Hiện chưa có vòng review độc lập cuối cho toàn bộ v2**; hai reviewer v2 đã chạy; các fix sau báo cáo mới có test cục bộ, chưa có vòng tái kiểm độc lập cuối. P1 privacy/retention và P0-2 MQTT vẫn mở.
- README/API/UI dùng được theo hướng dẫn; demo script tái lập từ DB rỗng. **Chưa kiểm lại demo từ DB rỗng trong lượt tài liệu này.**
- Docs nguồn được cập nhật; HTML build `--check` đạt.
- Giới hạn (firmware, push, dữ liệu thật, PostgreSQL production) được nêu rõ ở README và báo cáo.

## 11. Trạng thái triển khai (cập nhật 15/11/2026, bổ sung 18/11/2026 cho v7)

Đây là **trạng thái kỹ thuật do nhóm tự kiểm**, không phải nghiệm thu của giảng viên hay xác nhận sản phẩm đã hoàn chỉnh. Mọi số liệu dưới đây lấy từ lần chạy thật trong repo; bằng chứng chi tiết ở `reports/handoffs/`, `reports/qa/` và `reports/worklog/`.

### Đã có mã chạy được

- **API** (`apps/api`, NestJS 11 + Drizzle + PGlite/PostgreSQL): xác thực phiên và cài đặt tài khoản; hồ sơ, lời mời/chia sẻ quyền có `canViewMeasurements`; lưu trữ hồ sơ + ghi nhận yêu cầu xóa; liên hệ khẩn cấp; thiết bị claim/release/rotate; ingest HTTP + MQTT adapter, chống trùng, assignment theo `measured_at`, cách ly; đo lường/tổng hợp/CSV/insights 7–30 ngày; cảnh báo có state machine (gồm `unconfirmed`) + ack/resolve compare-and-set; outbox + SSE có `revoked`; Studio draft/preview/publish/rollback; trợ lý tóm tắt/hỏi đáp có `dataQuality` và fallback; bảo trì xem/tạo/đóng; admin user/device/policy CAS/audit.
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
| Lưu trữ/yêu cầu xóa | Archive 204 + thu hồi care link, không xóa dữ liệu; deletion-request 202 `recorded`, chỉ audit | `subjects.spec.ts`, `SubjectsPage.test.tsx` |
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

**Còn mở ở v7:** mới có **một** vòng review độc lập cho W1 foundation (`reports/qa/v7-foundation-review.md`), **chưa có review độc lập cho toàn bộ giao diện v7**; chưa kiểm Firefox/WebKit, thiết bị thật hay AI provider thật. Các khoảng hở nghiệp vụ/backend ở mục “Chưa làm hoặc chưa đủ bằng chứng” bên dưới vẫn nguyên (MQTT P0-2, retention/xóa thật, ngưỡng y khoa, form tạo thiết bị, OpenAPI, CI).

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
- **Web Push, email/SMS** — outbox chỉ giao trong ứng dụng; chưa có service worker/transport ngoài.
- **PostgreSQL thật, nhiều instance** — mới kiểm PGlite một tiến trình; rate limit, SSE, CAS chưa benchmark/kiểm đa kết nối thật.
- **MQTT broker/ACL/ACK** — adapter chỉ subscribe telemetry; chưa có ingest `events`/`status`, chưa xác thực khóa thiết bị trên MQTT, chưa publish ACK. Finding P0-2 (publish sự kiện lên broker bị bỏ qua) **vẫn mở**.
- **Xóa/retention** — archive và deletion-request đã có nhưng chỉ ẩn/ghi audit; chưa có job retention, xóa cứng, xóa export/AI cache/backup.
- **Đặc tả AI dài hạn** — `agent_runs`, `run_steps`, `step_attempts` có bảng nhưng chưa có runtime/endpoint; planner/tool registry, scheduler, approval flow, RAG chưa triển khai. Hiện chỉ có summary/ask giới hạn trên số liệu tổng hợp.
- **FR-13 ngưỡng sức khỏe/ngã** — chỉ có policy vận hành `device_runtime`; chưa có ngưỡng y khoa có nguồn/phiên bản.
- **UI tạo thiết bị admin** — tab thiết bị có list/cấp mã/xoay khóa nhưng chưa có form tạo; phải gọi API admin.
- **Studio approval độc lập** — người tạo view tự publish; chưa có bước người khác chấp nhận.
- **OpenAPI máy sinh, đo khả dụng người cao tuổi, p95/NFR-07, CI** — chưa làm. Code-split đã có; bundle chỉ đo cục bộ, chưa đo mạng thật.
- **P1 privacy/retention còn mở** — chưa có luồng đồng ý/đại diện cho người được chăm sóc, retention/xóa cứng/backup; deletion-request mới ghi audit. Không tuyên bố tuân thủ pháp lý.
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
- **Bảo mật/phân quyền** (`reports/qa/v2-rev-security.md`, `v2-security-authz.md`): các P1 đã có fix/test cục bộ — event ingest theo assignment, MQTT surface/ACL mẫu, quyền số đo tách cảnh báo, SSE thu hồi, notification boundary. **Còn mở** P0-2 MQTT event/ACK và các P2 như lockout DoS, enumeration, cursor alerts, security headers, admin task không cần care link, giới hạn export/SSE.
- **Toàn vẹn dữ liệu** (`reports/qa/v2-data-integrity.md`): quarantine/assignment, notification boundary, last telemetry, status boundary đã có fix/test; chưa có UI xem vùng cách ly, chưa kiểm PostgreSQL thật.
- **IoT/protocol** (`reports/qa/v2-iot-protocol.md`): broker bị hạ xuống profile thử nghiệm, HTTP là đường chính thức; **P0-2 vẫn mở** vì chưa có ingest sự kiện/ACK qua MQTT và chưa kiểm ACL/TLS broker thật.
- **Chất lượng kiểm thử** (`reports/qa/v2-chat-luong-kiem-thu.md`): hermetic env và randomize đã được cải thiện; đã sửa phụ thuộc thứ tự còn lại. Tại v2 đạt randomized 214/214, E2E 7/7; sau v4 hiện là randomized 219/219, E2E 26/26, build pass. Không dùng “219 test pass” để nói toàn bộ hệ thống đã kiểm.
- **Hiệu năng** (`reports/qa/v2-hieu-nang-va-on-dinh-tai-trang.md`): code-split/font/lịch sử đã tối ưu; số đo p95 trước đó là trên PGlite cục bộ, không đại diện mạng thật và chưa chạy lại sau v2.

**Kết luận:** lát cắt phần mềm có nhiều hành vi được bảo vệ bằng test và các cổng kỹ thuật đã xanh trên máy dev, nhưng **chưa release-ready**: MQTT P0-2 mở, chưa có xóa/retention thật, chưa có firmware/accuracy, chưa kiểm PostgreSQL/MQTT thật và chưa tái kiểm độc lập từng finding sau fix.

## 13. Kế hoạch mở rộng tiếp theo (bổ sung 18/11/2026 — đang triển khai từng phần)

Các hạng mục dưới đây là **yêu cầu bổ sung của người dùng ngày 18/11/2026**. **Trạng thái 19/11/2026:** `FR-15` (phần web), `FR-16` và `FR-22` đã có mã chạy được và test; các mục `FR-17`, `FR-18`, `FR-19`, `FR-20`, `FR-21`, `FR-23` cùng phần thiết bị của `FR-15` **chưa triển khai**. Bằng chứng: API **245 test**, web **43 file/377 test**, E2E **26/26**; ảnh trong `reports/qa/evidence/v8-care/`. **Ràng buộc thiết bị gọn nhẹ:** giữ thiết bị đeo tối giản, không gắn loa phát giọng nói lên thiết bị; toàn bộ nâng cấp trợ lý AI (`FR-20`–`FR-23`) xử lý ở backend và web:

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
| `FR-21` | Nhờ AI tạo lịch nhắc/công việc có bước Xem trước – Xác nhận | Dùng tool/preview phía server để dựng bản nháp lịch nhắc (`FR-15`), việc bảo trì hoặc xuất phiếu (`FR-16`); chỉ áp dụng sau khi người dùng xác nhận rõ ràng, giữ audit đầy đủ |
| `FR-22` | Điểm chú ý chuẩn bị đi khám trên phiếu theo dõi | Bổ sung 3–5 điểm thay đổi số liệu/sự cố nổi bật kèm mốc ngày và khoảng thiếu vào phiếu PDF `FR-16`; có hậu kiểm cấm kết luận chẩn đoán |
| `FR-23` | Hỏi đáp hướng dẫn chăm sóc có trích nguồn đã duyệt | Truy xuất có kiểm soát trên tập tài liệu chăm sóc chính thống đã duyệt trước khi sinh câu trả lời, bắt buộc trích nguồn và từ chối khi vượt ngoài phạm vi nguồn |
