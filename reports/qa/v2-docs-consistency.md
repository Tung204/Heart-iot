# Review độc lập v2 — tài liệu và hợp đồng

- **Người review:** phiên worker độc lập (dispatch `task_b3f6b7ead6a7`), chỉ đọc, không sửa code/docs.
- **HEAD:** `8434d66cb8ecb3d92a9a054f87f843d16dbaa3e7` — `perf(web): tách chunk theo route và thống nhất quyền xem cảnh báo` (2026-11-15 06:44 +07).
- **Nhánh/worktree:** checkout riêng `qa-docs-consistency`; `git status` sạch trước và sau khi review.
- **Ngày review:** 2026-11-15.

## Môi trường

| Thành phần | Giá trị |
| --- | --- |
| OS / shell | Windows, Git Bash |
| Node / pnpm | v24.22.2 / 12.5.1 (`packageManager` pnpm@12.5.1) |
| Python cho `tools/docs` | 3.12.10 + `Markdown==3.7` (venv tạm ngoài repo, không tạo `.venv` trong repo) |
| Dependency JS | `pnpm install --prefer-offline --frozen-lockfile` → Done in 1m 58s |
| DB dùng riêng | `PGLITE_DATA_DIR=.data/review-docs` (gitignore), không đụng `.data/pglite` |
| API dùng riêng | cổng **3211** (build `dist/src/main.js`), đã dừng sau khi kiểm |
| App dùng chung | web `:5173`, API `:3000` của lead — chỉ đọc, dùng cho E2E Playwright |
| Artifact ngoài repo | `/tmp/docsvenv`, `/tmp/dcheck` (bản `git archive HEAD`), `/tmp/pw-out` |

## Phạm vi

Đọc đầy đủ: `AGENTS.md`, `README.md`, `docs/README.md`, `docs/02`, `docs/03`, `docs/04`, `docs/06`,
`docs/08`, `docs/12`, `docs/14`, `apps/api/README.md`, `apps/web/README.md`,
`packages/contracts/README.md`, `tools/docs/README.md`, `docs/decisions/0002`, `reports/README.md`,
`tests/README.md`, `reports/orchestration/README.md`, `reports/worklog/2026-11-15.md`.

Đối chiếu code: `apps/api/src/**` (controller/schema/service), `apps/web/src/app/router.tsx`,
`apps/web/e2e/**`, `packages/contracts/src/**`, `packages/contracts/examples/**`,
`tools/simulator/src/**`, manifest/lockfile.

Chỉ tra cứu cục bộ (grep), **chưa đọc toàn văn**: `docs/01`, `docs/05`, `docs/07`, `docs/09`,
`docs/10`, `docs/11`, `docs/13`, `docs/reviews/*`, `docs/decisions/0001`, các handoff.

## Phần đã kiểm và kết quả thật

| # | Lệnh / bước | Kết quả | Ghi chú |
| --- | --- | --- | --- |
| 1 | `pnpm install --prefer-offline --frozen-lockfile` | Done 1m 58s | khoá dependency khớp manifest (trừ P2-5) |
| 2 | `pnpm -r typecheck` | pass (api, web, simulator, contracts) | |
| 3 | `cd apps/api && pnpm test` | **14 suite / 100 test pass** (82s) | khớp worklog 2026-11-15 |
| 4 | `cd apps/web && pnpm test --run` | **20 file / 73 test pass** | README ghi 19/72 → P2-4 |
| 5 | `cd apps/web && pnpm build` | OK; chunk lớn nhất `index-*.js` 264.55 kB, không còn cảnh báo >500 kB | README/docs/14 ghi ngược → P1-2 |
| 6 | `cd apps/web && npx playwright test --output=/tmp/pw-out` | **4/4 pass** trên app đang chạy 5173/3000 | 2/4 test mock API → P2-4 |
| 7 | `cd tools/simulator && npm test` | **23 pass** | |
| 8 | `PGLITE_DATA_DIR=.data/review-docs pnpm seed` (DB rỗng) | 3 users, 2 subjects, 1 device, 1 assignment, 1 care link, 1681 telemetry, 3 incidents, 2 tasks, 2 outbox; in đúng tài khoản/device key như README | tái lập "Chạy nhanh" |
| 9 | Chạy `pnpm seed` lần 2 | telemetry vẫn 1681, incidents/tasks/outbox insert 0 | idempotent, không nhân bản |
| 10 | API 3211 + `GET /api/v1/health` | 200 `{"status":"ok","database":"up","ai":"template_fallback"}` | |
| 11 | Đăng nhập 3 tài khoản demo | 200 cả ba | khớp bảng README |
| 12 | Admin `GET /subjects` + `GET /subjects/<id>/status` | `{"items":[]}` 200; 404 `NOT_FOUND` | khớp `docs/02` FR-11, `docs/14` §5 |
| 13 | `npx tsx src/cli.ts demo --fast` (`ANNHIEN_BASE_URL=…:3211`) | 19 generated / 20 sent / 20 accepted / 0 failed | luồng thiết bị chạy thật |
| 14 | `python tools/docs/build.py --check` | **FAIL** — "HTML is missing or stale" (296 link, 218 ID, 20 section) | → P1-1 |
| 15 | Script kiểm link Markdown nội bộ toàn repo | 60 file, **1 link hỏng** | → P2-6 |

Kiểm bằng chứng tĩnh đã đối chiếu code:

- `apps/api/src/realtime/realtime.controller.ts:24` và `realtime.service.ts:63` dùng `requireAction(..., 'receive_alerts')` → tuyên bố P1 đã đóng ở `docs/14:205` là đúng.
- `apps/api/src/incidents/incidents.service.ts:203-232` dedupe theo `(device_id, message_id)`, cùng khóa khác nội dung → `CONFLICT` + audit; test `T5` phủ → tuyên bố `docs/14:206` đúng.
- Unique index trong `apps/api/src/database/schema.ts:280-281,316,341-342` khớp bảng khóa của `docs/04` mục "Mô hình dữ liệu".
- Route web trong `apps/web/src/app/router.tsx:76-96` khớp "Sơ đồ route" của `apps/web/README.md`.
- MQTT chỉ subscribe `v1/devices/+/telemetry`, không publish ACK (`apps/api/src/ingest/mqtt-ingest.service.ts:18,61`) — khớp `docs/14` §6 và §10.
- Nav mobile ẩn 2 mục `shell__nav-optional` (`apps/web/src/styles/layout.css:1994`), còn 4 mục + "Thêm" — khớp `docs/06` "5 mục chính".

## Phần chưa kiểm

- PostgreSQL thật (`DATABASE_URL`), nhiều instance, benchmark; MQTT broker/ACL/ACK publish; Web Push/email/SMS; firmware ESP32.
- Chưa đọc toàn văn `docs/13` (đặc tả AI dài hạn) và `docs/reviews/*`; chưa đối chiếu từng dòng hợp đồng AI với code.
- Chưa chụp lại ảnh 1280×900 / 390×844 / 360×740 / chữ lớn; chỉ đối chiếu ảnh phiên trước ở `C:\tmp\ui-final` (42 file) nên **không** báo "đạt" cho tuyên bố ở `docs/06:76`.
- Không đo bundle trên mạng thật, không kiểm a11y bằng công cụ; không chạy E2E với API riêng 3211 (dùng 3000/5173 sẵn có nên không xác minh được luồng đăng nhập → ack/resolve thật).
- Không kiểm nội dung `reports/handoffs/*` so với code.

## Findings

**P0: không có.** Không thấy tuyên bố sai gây mất dữ liệu/quyền hay hứa hẹn sản phẩm đã nghiệm thu; các lỗi bên dưới là tài liệu lệch code/artifact chưa sinh lại.

### P1-1 — HTML sinh sẵn đang lỗi thời và chứa nội dung sai về backend

- **Vị trí:** `docs/html/index.html` (bản commit), sinh bởi `tools/docs/build.py`.
- **Hiện trạng:** `docs/html/index.html:3474` viết *"Nơi triển khai backend modular monolith. **Hiện chưa có ứng dụng, migration hay endpoint đang chạy.** NestJS + TypeScript là ứng viên, chưa khóa version/ORM."* — trong khi `apps/api` có API NestJS 11.2.10 chạy được, migration + seed + 100 test.
- **Mong đợi:** artifact HTML khớp nguồn Markdown tại HEAD; `--check` đạt (yêu cầu `AGENTS.md`, `docs/12` bảng "Nội dung đưa vào HTML", `docs/14:158`).
- **Bằng chứng:**
  - `python tools/docs/build.py --check` → `HTML is missing or stale. Run tools/docs/build.py.` + `Validated 296 links and 218 unique IDs; 20 sections.` (exit 1).
  - Bản `git archive HEAD` trong `/tmp/dcheck`: `--check` cũng fail → lỗi thuộc commit, không do môi trường.
  - So sánh bản sinh lại: digest đổi `ba31f618…` → `0fb5a84a…`; **4 section** khác nội dung (`cau-truc-web`, `cau-truc-web-so-do-route`, `cau-truc-web-trang-thai`, `cau-truc-api`) cộng 1 heading bị đổi id (`cau-truc-web-quy-uoc-wave-2` → `cau-truc-web-quy-uoc`) nên link sâu cũ hỏng; bản mới thêm 4 heading (`cau-truc-api-chay`, `-kiem`, `-module-va-ranh-gioi`, `-gioi-han-da-biet`).
  - Nguyên nhân: `git log --oneline -- docs/html/index.html` dừng ở `d4ba436`; commit HEAD `8434d66` sửa `apps/api/README.md` và `apps/web/README.md` nhưng không sinh lại HTML.
- **Đề xuất:** chạy lại bộ sinh và commit `docs/html/index.html` (không sửa tay), rồi `--check`; thêm bước `docs:check` vào cổng trước commit. Không cần viết lại lịch sử; chỉ thêm commit sinh lại HTML kèm ghi chú.

### P1-2 — README và docs/14 còn tuyên bố "chưa code-split, bundle >500 kB"

- **Vị trí:** `README.md:90`, `docs/14-ke-hoach-trien-khai-phan-mem.md:191`, `docs/14:208`.
- **Hiện trạng:** "Frontend chưa code-split; bundle còn >500 kB"; "OpenAPI máy sinh, code-split frontend … chưa làm; bundle web còn cảnh báo >500 kB"; "P2-4 (code-split) giữ là việc tiếp theo".
- **Mong đợi:** phản ánh HEAD, nơi `Router` đã `React.lazy` + `Suspense`.
- **Bằng chứng:** `apps/web/src/app/router.tsx:15-64` lazy 14 trang sau đăng nhập; `pnpm build` → `✓ built`, `dist/assets/index-DxULU1N-.js 264.55 kB`, `ErrorState-*.js 230.68 kB`, **không** có cảnh báo "chunks are larger than 500 kB"; `apps/web/README.md:5,82` đã mô tả đúng việc tách chunk.
- **Đề xuất:** sửa `README.md:90` thành giới hạn còn lại (ví dụ: "đã tách chunk theo route; bundle chính ~265 kB, chưa đo trên mạng thật"); sửa `docs/14:191` bỏ "code-split" khỏi danh sách chưa làm và bỏ ">500 kB"; sửa `docs/14:208` ghi P2-4 đã xử lý ở `8434d66` (kèm số chunk), không xóa dấu vết finding cũ — chỉ cập nhật trạng thái.

### P1-3 — Hai trong ba payload mẫu không hợp lệ với schema đang thực thi

- **Vị trí:** `docs/04-du-lieu-va-giao-tiep.md:3` ("Ví dụ hợp lệ về cấu trúc JSON"), `packages/contracts/examples/fall-confirmed.v1.json`, `packages/contracts/examples/event-ack.v1.json`.
- **Hiện trạng:** `fall-confirmed.v1.json` thiếu `incident_type`, `evidence.wear_location`, `evidence.motion_quality`, `evidence.heart_rate_quality`, `evidence.heart_rate_bpm` và chứa khóa lạ `detected_at`, `detected_uptime_ms`, `wear_position`, `cancel_window_ms`, `signal_quality`. `event-ack.v1.json` dùng snake_case (`source_message_id`, `incident_id`, `accepted_revision`, `received_at`) trong khi schema là camelCase. Chỉ `telemetry.v1.json` hợp lệ.
- **Mong đợi:** cả ba mẫu parse được bằng schema mà API/web/simulator dùng, hoặc ghi rõ mẫu là bản nháp v0 không còn hiệu lực.
- **Bằng chứng** (chạy tại `packages/contracts`):

  ```bash
  node -e "
  const fs=require('fs'),t=require('./dist/telemetry.js');
  const m={'telemetry.v1.json':t.telemetryEnvelopeSchema,'fall-confirmed.v1.json':t.incidentEnvelopeSchema,'event-ack.v1.json':t.ingestAckSchema};
  for(const f in m){const r=m[f].safeParse(JSON.parse(fs.readFileSync('examples/'+f,'utf8')));
    console.log(f,r.success?'OK':'FAIL',r.success?'':r.error.issues.map(i=>i.path.join('.')+':'+i.code).join(', '));}
  "
  ```

  Kết quả: `telemetry.v1.json OK`, `fall-confirmed.v1.json FAIL` (`incident_type:invalid_value`, `evidence.wear_location:invalid_type`, `evidence.motion_quality:invalid_value`, `evidence.heart_rate_quality:invalid_value`, `evidence.heart_rate_bpm:invalid_type`, `evidence:unrecognized_keys`), `event-ack.v1.json FAIL` (thiếu `sourceMessageId`, `receivedAt`, `incidentId`, `acceptedRevision`, `code`, `message`).
  Schema nguồn: `packages/contracts/src/telemetry.ts:71-107` (incident) và `:109-118` (ack). Simulator đang dựng đúng schema (`tools/simulator/src/incident.ts:53-61`), nên mẫu tài liệu mới là bên lệch.
- **Đề xuất:** cập nhật `fall-confirmed.v1.json` theo `incidentEnvelopeSchema` (thêm `incident_type`, đổi `wear_position`→`wear_location`, thêm `motion_quality`/`heart_rate_quality`/`heart_rate_bpm`, bỏ các khóa chỉ-design) và `event-ack.v1.json` sang camelCase đúng `ingestAckSchema`; đồng thời sửa `docs/04:78` (danh sách trường ACK) theo đúng tên camelCase hoặc ghi rõ đó là hợp đồng MQTT tương lai chưa hiện thực. Thêm một test parse cả `examples/*.json` để `docs:check` không chỉ `json.loads`.

### P1-4 — docs/04 nói "chưa có endpoint chạy" và liệt kê endpoint không tồn tại

- **Vị trí:** `docs/04-du-lieu-va-giao-tiep.md:84` (và bảng "API dự kiến" `:86-98`).
- **Hiện trạng:** "Prefix `/api/v1`; đây là inventory thiết kế, **chưa có endpoint chạy**." Trong khi API đã chạy 55 route handler (`grep -rho "@\(Get\|Post\|Put\|Patch\|Delete\)(" apps/api/src --include=*.controller.ts | wc -l` → 55). Bảng còn liệt kê `POST /subjects/{id}/exports`, `POST /subjects/{id}/deletion-requests` — không tồn tại trong code (đã grep `exports`/`deletion-requests` trong `*.controller.ts`: không có; chỉ có `GET /subjects/:id/export.csv` tại `measurements.controller.ts:46`).
- **Mong đợi:** trạng thái đúng (endpoint đã chạy) và phân biệt rõ endpoint "đã có" / "mới là thiết kế".
- **Bằng chứng:** `curl` trên API 3211 trả 200 cho `/api/v1/health`, `/api/v1/auth/login`, `/api/v1/subjects`; danh sách route in ra khi khởi động (`/tmp/api-dev.log`) đủ nhóm auth/subjects/care/devices/ingest/measurements/incidents/notifications/realtime/studio/assistant/maintenance/admin.
- **Đề xuất:** sửa câu mở đầu mục "API dự kiến" thành hiện trạng (prefix `/api/v1`, phần lớn endpoint đã chạy ở v1; endpoint chưa có ghi rõ "chưa triển khai"); thêm cột/ghi chú trạng thái cho `exports`/`deletion-requests` và đổi `GET …/export.csv` nếu muốn giữ đúng inventory.

### P1-5 — Nhóm tuyên bố "chưa có ứng dụng / chưa có test / chưa có hợp đồng" đã sai ở HEAD

- **Vị trí:** `docs/12-nguyen-tac-phat-trien-va-bang-chung.md:46`, `tests/README.md:3`, `docs/08-kiem-thu-va-danh-gia.md:33`, `packages/contracts/README.md:8`.
- **Hiện trạng:**
  - `docs/12:46`: "Hiện tại repository chỉ có công cụ sinh tài liệu, payload minh họa và README module. Chưa có runtime tool registry, API contract triển khai hoặc Business Service để đăng ký là `active`."
  - `tests/README.md:3`: "**Chưa có ứng dụng nên chưa có test executable.**"
  - `docs/08:33`: "Các phép kiểm ở bảng là mục tiêu dự kiến; chưa có test executable hoặc kết quả đạt."
  - `packages/contracts/README.md:8`: "Các miền còn lại (subjects, care, devices, measurements, incidents API, assistant, tasks, studio, admin, policies) do wave tương ứng bổ sung…" trong khi **tất cả** đã có file schema (`packages/contracts/src/*.ts`, 13 miền) và được API/web/simulator import.
- **Mong đợi:** trạng thái đúng; `docs/12` và `tests/README` là nguồn dẫn cho reviewer nên không được phủ nhận sự tồn tại của code/test/hợp đồng.
- **Bằng chứng:** `pnpm -r typecheck` pass; `apps/api` 14 suite/100 test; `apps/web` 20 file/73 test; `tools/simulator` 23 test; test mang ID FR/NFR (`apps/api/test/care.spec.ts:30`, `incidents.spec.ts:4,200`, `notifications.spec.ts:3`, `subjects.spec.ts:29`); `@annhien/contracts` export 14 subpath (`packages/contracts/package.json`) được `apps/web`, `apps/api`, `tools/simulator` khai báo `workspace:*`.
- **Đề xuất:** viết lại 4 câu trên theo mẫu "đã có gì / bằng chứng ở đâu / còn thiếu gì", giữ nguyên phần yêu cầu phía sau. Ví dụ `tests/README.md:3` → "API/web/simulator có test executable (xem `README.md` mục Kiểm thử); thư mục này vẫn trống cho integration/E2E liên thành phần". `packages/contracts/README.md:7-8` gộp thành một dòng "đã có schema cho toàn bộ 13 miền; OpenAPI máy sinh chưa làm".

### P2-1 — docs/14 có hai mục "10" và tham chiếu "xem mục 10" không xác định

- **Vị trí:** `docs/14:153` (`## 10. Định nghĩa hoàn thành v1`) và `docs/14:161` (`## 10. Trạng thái triển khai tại 14/11/2026`); mục 11 ở `:200`.
- **Hiện trạng:** trùng số mục; `docs/14:101` viết "`agent-runs`/`summaries` … **chưa triển khai** — xem mục 10", trong khi nội dung cần dẫn ("Đặc tả AI dài hạn — chưa có…") nằm ở mục 10 **thứ hai** (`:190`), không phải mục 10 DoD.
- **Mong đợi:** số mục duy nhất, tham chiếu chéo chính xác.
- **Bằng chứng:** `grep -n "^## " docs/14…` → hai dòng `## 10.`; `sed -n 153,170p`, `sed -n 200,201p`; `grep -n "xem mục 10" docs/14…` → dòng 101.
- **Đề xuất:** đổi `## 10. Trạng thái triển khai…` → `## 11.`, `## 11. Kết quả review độc lập…` → `## 12.`, và sửa `:101` thành "xem mục 11"; cập nhật mọi tham chiếu "mục 10/11" ở `docs/README.md`, handoff nếu có.

### P2-2 — Inventory module/endpoint của docs/14 lệch code

- **Vị trí:** `docs/14:50-65` (cây module), `docs/14:65` (`health/ # health/ready`), `docs/14:96` (nhóm Thiết bị), `docs/14:103` (nhóm Studio).
- **Hiện trạng:** (a) `GET /api/v1/health/ready` **không tồn tại** — `curl` → 404; chỉ có `GET /api/v1/health` (`apps/api/src/health/health.controller.ts:12`), khớp `apps/api/README.md:23`. (b) Cây module bỏ `care/`, `policy/`, `maintenance/` (có thật trong `apps/api/src`), và chú thích `assistant/ # agent runs/steps, tóm tắt, task bảo trì` gộp hai thứ đã tách/không có. (c) Hai endpoint đã chạy và được web dùng nhưng không có trong §6: `POST /admin/devices/:id/claim-code` (`devices.controller.ts:52`) và `GET /workspace-views/:id/data` (`studio.controller.ts:111`).
- **Mong đợi:** bảng §6 và cây §4 dùng được làm hợp đồng giữa be/fe như tiêu đề `docs/14:87` và câu "Chi tiết request/response nằm trong `packages/contracts`" ở `docs/14:106`.
- **Bằng chứng:** `ls apps/api/src`; `grep -rn "@\(Get\|Post\|Put\|Patch\|Delete\)(" apps/api/src --include=*.controller.ts`; `curl -o /dev/null -w "%{http_code}" …/api/v1/health/ready` → 404.
- **Đề xuất:** bỏ `# health/ready` hoặc thêm route ready thật; thêm 3 dòng module `care/`, `maintenance/`, `policy/` vào cây; thêm 2 endpoint vào §6 (hoặc ghi chú "rút gọn, xem controller là nguồn"). Nếu giữ §6 là "rút gọn", thêm câu "danh sách đầy đủ theo controller".

### P2-3 — Envelope lỗi đặt tên khác nhau giữa docs/04 và docs/14/code

- **Vị trí:** `docs/04:100` (`request_id`), `docs/14:89` (`requestId`), code `apps/api/src/common/api-exception.filter.ts:74`.
- **Hiện trạng:** docs/04 ghi `{ "code", "message", "request_id" }`; API trả `requestId` (camelCase) — xác nhận bằng response 404 thật: `{"code":"NOT_FOUND","message":"Không tìm thấy hồ sơ hoặc bạn không có quyền truy cập.","requestId":"2b0b515c-…"}`.
- **Mong đợi:** một tên trường duy nhất cho mọi tài liệu HTTP (chính `docs/12` yêu cầu rà mâu thuẫn baseline).
- **Bằng chứng:** `curl -b admin.txt …/subjects/<id>/status`; `grep -rn request_id docs/*.md`.
- **Đề xuất:** sửa `docs/04:100` sang `requestId`; nếu sau này có hợp đồng MQTT snake_case thì tách mục riêng và ghi rõ khác biệt transport.

### P2-4 — apps/web/README: số test cũ và mô tả E2E không đúng phạm vi; comment E2E còn "wave 1 chưa chạy"

- **Vị trí:** `apps/web/README.md:83`; `apps/web/playwright.config.ts:4`; `apps/web/e2e/smoke.spec.ts:3`; `apps/web/e2e/alerts.spec.ts:3`.
- **Hiện trạng:** README ghi "19 file/72 test", thực tế **20 file/73 test** (HEAD thêm `src/components/AppErrorBoundary.test.tsx`). README ghi "E2E 4/4 khi API chạy", nhưng `alerts.spec.ts` mock toàn bộ `/api/v1/**` và tự ghi "KHÔNG cần API thật chạy"; cả 4 test đều chỉ cần web server, không test nào cần API thật (2 `smoke` tải trang công khai, 2 alerts mock `/api/v1/**`). Comment ở `playwright.config.ts:4` và `smoke.spec.ts:3` vẫn nói "Wave 1: chưa chạy (API chưa đủ endpoint)" — trái với việc E2E đang pass 4/4.
- **Mong đợi:** con số và phạm vi đúng, comment không mâu thuẫn trạng thái.
- **Bằng chứng:** `cd apps/web && pnpm test --run` → `Test Files 20 passed (20) | Tests 73 passed (73)`; `npx playwright test` → `4 passed (2.9s)`; đọc 2 spec như trên.
- **Đề xuất:** cập nhật `:83` thành "20 file/73 test"; đổi "E2E 4/4 khi API chạy" → "E2E 4/4 (cần web server; 2 test cảnh báo mock API nên không cần API thật)"; xóa/sửa comment "wave 1 chưa chạy" ở config và smoke spec.

### P2-5 — `apps/api/package.json` khai báo `@nestjs/testing` là `null`

- **Vị trí:** `apps/api/package.json:31` (`dependencies."@nestjs/testing": null`) trùng `:35` (`devDependencies."@nestjs/testing": "11.2.10"`).
- **Hiện trạng:** manifest có một spec không hợp lệ; lockfile ghi `specifier: 11.2.10` (`pnpm-lock.yaml:218-220`). `pnpm install --frozen-lockfile` vẫn chạy, nhưng công cụ khác (npm, Dependabot, `pnpm install` không frozen) có thể fail hoặc ghi đè manifest.
- **Mong đợi:** một khai báo duy nhất, đúng semver, ở devDependencies (test-only).
- **Bằng chứng:** `git show HEAD:apps/api/package.json | sed -n 28,36p`; `pnpm-lock.yaml` dòng 218-220.
- **Đề xuất:** xóa dòng `"@nestjs/testing": null` khỏi `dependencies`, giữ `devDependencies`; chạy lại `pnpm install` và xác nhận lockfile không đổi nghĩa.

### P2-6 — Link hỏng trong reports/orchestration/README.md

- **Vị trí:** `reports/orchestration/README.md:81` → `[lessons.md](lessons.md)`.
- **Hiện trạng:** file không tồn tại (`find . -name "lessons*"` rỗng); `reports/orchestration/` chỉ có `journal-2026-11-14.md`, `journal-2026-11-15.md`, `logs/`, `prompts/`.
- **Mong đợi:** link nội bộ trong repo mở được (quy ước `AGENTS.md`: kiểm liên kết khi sửa tài liệu).
- **Bằng chứng:** script quét 60 file Markdown: 1 link hỏng duy nhất là link này.
- **Đề xuất:** tạo `reports/orchestration/lessons.md` từ mục "Vận hành / bài học" của worklog, hoặc bỏ câu đó/thay bằng link tới `reports/worklog/2026-11-15.md`.

### P2-7 — Bất biến outbox trong docs hẹp hơn unique index thực tế

- **Vị trí:** `docs/14:81` ("Outbox unique `(incident_id, revision, recipient_id, channel)`"), `apps/api/src/incidents/incidents.service.ts:567,604`, `apps/api/src/database/schema.ts:390`.
- **Hiện trạng:** unique index thật là `notification_outbox_dedupe_uq(dedupe_key)` với `dedupeKey = <incident>:<revision>:<recipient>:in_app:<alert|update>`; cùng một bộ 4 trường vẫn có thể có 2 dòng (alert và update). Nếu ai làm đúng theo câu docs/14 sẽ tạo index 4 cột và chặn nhầm dòng cập nhật hợp lệ.
- **Mong đợi:** tài liệu mô tả đúng khóa dedupe (kèm `kind`).
- **Bằng chứng:** đọc 2 chỗ sinh `dedupeKey`; `grep -n "dedupeKey" apps/api/src/incidents/incidents.service.ts`.
- **Đề xuất:** sửa `docs/14:81` thành "unique theo `incident_id, revision, recipient, channel, kind` (hiện thực bằng `dedupe_key`)" và ghi chú lý do cần `kind`.

### P2-8 — Bằng chứng kiểm giao diện của docs/06 nằm ngoài repo

- **Vị trí:** `docs/06-trai-nghiem-va-man-hinh.md:76` ("Đã kiểm ở 1280×900, 390×844, 360×740…").
- **Hiện trạng:** bằng chứng duy nhất là 42 ảnh ở `C:\tmp\ui-final` (ngoài Git; worklog 2026-11-15 ghi rõ "chỉ là bằng chứng phiên"). Người nhận bàn giao không kiểm lại được; ngưỡng "không tràn ngang" không có log/số đo kèm.
- **Mong đợi:** `docs/12` yêu cầu artifact path/điều kiện thử cho mọi kết luận.
- **Bằng chứng:** `ls C:\tmp\ui-final` (42 file, có `desk-large.png`, `m-large.png`, `xs.png`); không có thư mục artifact nào trong repo (`find . -iname "*.png" -not -path "*/node_modules/*"` không có ảnh kiểm UI).
- **Đề xuất:** copy 4-6 ảnh đại diện vào `reports/qa/artifacts/ui-2026-11-15/` kèm `README` ghi viewport/zoom/commit, rồi dẫn từ `docs/06:76`; hoặc hạ câu đó thành "đã kiểm thủ công trong phiên 15/11, ảnh ở ngoài repo".

## Đối chiếu docs/14 §10–§11 với implementation

| Mục | Tuyên bố | Kết quả kiểm | Kết luận |
| --- | --- | --- | --- |
| §10 (DoD) | Cổng §8 đã chạy với output thật | typecheck, API test, web test, web build, E2E, seed 2 lần: **đạt**; HTML `--check`: **fail** | **Không đạt** ở thời điểm HEAD |
| §10 (DoD) | README/API/UI dùng được; demo tái lập từ DB rỗng | seed từ `.data/review-docs` rỗng + login + simulator demo: đạt | đạt (trừ sai lệch README nêu P1-2) |
| §10 (DoD) | Docs nguồn cập nhật; HTML `--check` đạt | `--check` fail | **không đạt** (P1-1) |
| §10 (status) | Seed idempotent, simulator end-to-end | đã chạy lại, khớp | đạt |
| §10 (status) | "Chưa làm: code-split frontend … bundle >500 kB" | đã làm ở HEAD, build sạch cảnh báo | **sai** (P1-2) |
| §10 (status) | "Chưa làm: `agent_runs/run_steps`, planner…" (`docs/14:190`) | `schema.ts:476,501,517` định nghĩa đủ 3 bảng; `docs/14:74,83` cũng liệt kê/đặt bất biến cho chúng; grep ngoài `schema.ts` không thấy dùng | **mâu thuẫn nội bộ docs/14** — nên nói rõ "có bảng trong schema nhưng chưa có runtime/endpoint" |
| §11 | SSE kiểm `canReceiveAlerts` | `realtime.controller.ts:24`, `realtime.service.ts:63` dùng `receive_alerts` | đúng |
| §11 | Dedupe incident theo `(device_id, message_id)`, payload khác → CONFLICT | `incidents.service.ts:203-232`; test `T5` pass | đúng |
| §11 | P2-4 code-split "việc tiếp theo" | đã xong ở `8434d66` | **hết hiệu lực** (P1-2) |
| §11 | P2-1/3/5 đã sửa | `SharePage.tsx:180` chặn non-owner; `HistoryPage.tsx:56-61` cập nhật `now`; `SharePage.tsx:69,142-149,297` xử lý clipboard lỗi | đúng |
| §11 | P2-2 tab admin theo ARIA APG | `AdminPage.tsx:793` dùng `role="group"` + `aria-pressed`, không dùng `tablist/tab` | đã bỏ ngữ nghĩa tab giả; coi là đạt theo hướng thay thế, nhưng nên ghi rõ trong docs/14 |

Ghi chú: bảng trên chỉ đối chiếu tuyên bố với code/test tại HEAD; **không** đóng finding của review trước (`reports/qa/review-backend-2026-11-14.md`, `review-frontend-2026-11-14.md`). Các P2 còn mở ở hai báo cáo đó vẫn giữ nguyên trạng thái.

## Thứ tự đề xuất xử lý

1. P1-1 sinh lại HTML + thêm `docs:check` vào cổng (rẻ, chặn artifact sai).
2. P1-2, P1-4, P1-5 cập nhật trạng thái README/docs/04/docs/08/docs/12/tests/contracts README.
3. P1-3 sửa 2 payload mẫu + test parse examples.
4. P2-1 sửa số mục docs/14 (làm cùng lúc với P1-2 vì cùng file).
5. P2-2/P2-3/P2-7 làm rõ hợp đồng; P2-4/P2-5/P2-6/P2-8 vệ sinh tài liệu/manifest.

## Tóm tắt 5 dòng

1. Đã chạy lại toàn bộ cổng tại HEAD `8434d66`: typecheck sạch, API 14 suite/100 test, web 20 file/73 test, build không còn cảnh báo >500 kB, E2E 4/4, simulator 23 test, seed từ DB rỗng + seed lần hai không nhân bản, login 3 vai trò và simulator demo chạy thật trên DB riêng `.data/review-docs`/cổng 3211.
2. Phát hiện 5 P1: HTML sinh sẵn lỗi thời và còn viết "backend chưa có ứng dụng/endpoint"; README + docs/14 vẫn nói chưa code-split/bundle >500 kB; 2/3 payload mẫu không parse được bằng schema thực thi; docs/04 nói "chưa có endpoint chạy" và liệt kê endpoint không tồn tại; docs/12 + tests/README + docs/08 + contracts README phủ nhận sự tồn tại của code/test/hợp đồng.
3. Phát hiện 8 P2: docs/14 trùng số mục 10 và tham chiếu "xem mục 10" mơ hồ, inventory module/endpoint lệch code (`health/ready` 404, thiếu `care/policy/maintenance`, thiếu `claim-code` và `workspace-views/:id/data`), `request_id` vs `requestId`, README web ghi 19/72 test, `@nestjs/testing: null`, link `lessons.md` hỏng, bất biến outbox thiếu `kind`, bằng chứng ảnh UI nằm ngoài repo.
4. Không có P0; các tuyên bố P1 backend ở docs/14 §11 (SSE `receive_alerts`, dedupe `(device_id, message_id)` + CONFLICT) đã đối chiếu code và test là đúng, còn P2-4 code-split trong docs/14 §11 đã hết hiệu lực sau commit HEAD.
5. Chưa kiểm: PostgreSQL thật/MQTT broker/Web Push/firmware, toàn văn docs/13 và reviews, chụp lại ảnh 1280/390/360, E2E đăng nhập→ack/resolve với API thật; báo cáo này chỉ ghi nhận finding, không sửa code/docs và không đóng finding của review trước.
