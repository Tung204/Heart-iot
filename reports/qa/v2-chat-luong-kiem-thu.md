# Review độc lập chất lượng kiểm thử — An Nhiên v1.1

- **HEAD:** `8434d66cb8ecb3d92a9a054f87f843d16dbaa3e7` (`perf(web): tách chunk theo route và thống nhất quyền xem cảnh báo`), worktree sạch trước khi tạo báo cáo (`git status --porcelain` rỗng).
- **Thời điểm:** 2026-11-15 06:50–07:15 (Asia/Ho_Chi_Minh). Reviewer độc lập, chỉ đọc/chạy kiểm, **không sửa code, test, docs**; báo cáo này là file duy nhất được tạo.
- **Môi trường:** Windows, Node `v24.22.2`, pnpm `12.5.1`, Jest 30 + PGlite in-memory, Vitest 5, Playwright 1.65.1, Playwright chạy trên web dev có sẵn `http://localhost:5173`. Không gọi/không ghi vào API 3000 hay `.data/pglite` của lead; test API dùng PGlite in-memory (`PGLITE_MEMORY=true` do `apps/api/test/test-app.ts:30` đặt).
- **Phạm vi:** `docs/02`, `docs/03`, `docs/04`, `docs/06`, `docs/08`, `docs/12`, `docs/14`, `git log -3`; toàn bộ test hiện có của `apps/api`, `apps/web`, `tools/simulator`; đối chiếu source ở các điểm test chạm tới.
- **Nguyên tắc:** không tin báo cáo/handoff cũ; mọi kết luận dưới đây dựa trên lệnh hoặc file/dòng tôi tự đọc/chạy. Không đóng finding của review trước.

## Kết luận tổng thể

- **0 P0, 6 P1, 10 P2.** Bộ test hiện tại **pass 100%** khi chạy đúng thứ tự và có nhiều phần rất tốt (state machine incident, quyền theo hồ sơ, contract zod hai phía, audit). Nhưng bằng chứng chưa đủ cho một số tiêu chí P0 trong `docs/02`/`docs/08`, và bộ test **không bền với thay đổi thứ tự** — đã tái hiện 10 test fail bằng `--randomize`.
- Các khoảng trống lớn nhất: (1) test phụ thuộc thứ tự/trạng thái dùng chung, (2) môi trường test có thể trỏ nhầm DB/AI/MQTT thật nếu có `.env`, (3) không có test tích hợp thật xuyên simulator → API → web, (4) outbox retry/restart và thu hồi quyền giữa lúc AI đang chạy chưa từng được chạy, (5) chuyển thiết bị A→B và vùng cách ly chưa có test/implementation, (6) phần lớn spec bỏ qua `AppModule`.
- **Chưa thể dùng kết quả xanh 100/100 để nói "đã kiểm hệ thống"**: đó là 100 test đơn/integration trong tiến trình, chạy PGlite một kết nối; nhiều nhánh quan trọng có coverage 0.

## 1. Đã kiểm / chưa kiểm

### Đã chạy

| Lệnh | Kết quả thật |
| --- | --- |
| `pnpm build:contracts` | exit 0 |
| `pnpm -r typecheck` | contracts/api/web/simulator **Done**, exit 0 |
| `pnpm test` (root, tuần tự) | API **100/100**, web **73/73**, simulator **23 pass / 0 fail**; exit 0 |
| `cd apps/api && node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand` | `Test Suites: 14 passed`; `Tests: 100 passed`; 89.7 s (150 s khi bật coverage) |
| `cd apps/web && pnpm test` | `Test Files 20 passed`; `Tests 73 passed`; 10.8 s |
| `cd apps/web && pnpm test:e2e` | **4 passed** (2 landing/login, 2 UI cảnh báo có mock API), 4.0 s |
| `cd apps/web && npx vitest run --sequence.shuffle` | 73/73 pass (web không phụ thuộc thứ tự) |
| `cd apps/api && ... --randomize` | **10 failed / 90 passed** — xem Q-01 |
| `cd apps/api && ... test/sse.spec.ts` × 5 lần | 2/2 pass cả 5 lần (không thấy flaky SSE trong 5 lần) |
| `cd apps/api && ... --coverage --collectCoverageFrom='src/**/*.ts'` | Statement **87.22%**, Branch **69.96%**, Function **84.86%**, Line **89.34%** |
| Probe `dotenv` với biến đã bị xoá | `DATABASE_URL` được nạp lại từ file `.env` — xem Q-02 |

### Chưa kiểm (không được báo "đạt")

- PostgreSQL thật, nhiều kết nối/instance; `SELECT ... FOR UPDATE`/`SKIP LOCKED` trên PG thật.
- MQTT broker/ACL/ACK thật; adapter MQTT mới test parser (`apps/api/test/ingest.spec.ts:309`), không mở kết nối broker.
- AI provider thật; adapter HTTP thật không được test (Q-14). Không đo chi phí/độ trễ AI.
- Web Push/FR-12 (ngoài phạm vi v1), thông báo khi đóng trình duyệt.
- Backup/restore, xóa dữ liệu xuyên backup/AI cache; yêu cầu xóa (FR-14) không có endpoint.
- Khả dụng NFR-04 với người cao tuổi/người chăm sóc; NFR-07 p50/p95 thực tế.
- Kiểm visual mobile/large-text; các ảnh trong worklog nằm ngoài repo (`C:\tmp\ui-final`), tôi không chạy lại.
- File `.env` thật (worktree không có `.env`) — rủi ro Q-02 được chứng minh bằng code + hành vi dotenv, chưa chạy end-to-end.
- CI: repo không có `.github/workflows`; mọi cổng dưới đây là chạy tay.
- Finding của 2 review trước (`reports/qa/review-*.md`) không được tái kiểm/đóng trong báo cáo này.

## 2. Hiện trạng test (số liệu tự đếm)

| Khu vực | File test | Số test | Ghi chú |
| --- | --- | --- | --- |
| API (`apps/api/test`) | 14 | 100 | 895 lần `expect`; không có `.skip`/`.only`; không có file `*.spec.ts` dưới `apps/api/src` |
| Web unit (`apps/web/src`) | 20 | 73 | 20 file; 8 màn hình route không có component/unit test (Dashboard chỉ có 1 test E2E mock nông; Q-11) |
| Simulator (`tools/simulator/test`) | 6 | 23 | mock HTTP server, không chạy với API thật |
| E2E (`apps/web/e2e`) | 2 | 4 | 2 test mock toàn bộ `/api/v1/**`; 2 test landing/login |
| Tích hợp liên thành phần (`tests/`) | 0 | 0 | chỉ có `tests/README.md`, nội dung còn nói "chưa có ứng dụng" (`tests/README.md:3`) |

Coverage API thấp ở các file quan trọng: `assistant-adapter.ts` 25% statement / **0% branch**, `notifications.service.ts` 69.5%/52.4%, `mqtt-ingest.service.ts` 65.2%/38.5%, `telemetry-ingest.service.ts` 77.9%, `auth.service.ts` 84.3%/65.6%. Web chưa đo coverage (không cài `@vitest/coverage-*`).

## 3. Finding P0

Không có.

## 4. Finding P1

### Q-01. Bộ test API phụ thuộc thứ tự thực thi; 10/100 test fail khi `--randomize`

**Mức:** P1 — che giấu lỗi thật hoặc tạo đỏ giả khi thêm/di chuyển test; không thể chạy song song hoặc đổi thứ tự.

**Tái hiện (đã chạy):**

```bash
cd apps/api
PGLITE_MEMORY= node --experimental-vm-modules node_modules/jest/bin/jest.js \
  --runInBand --randomize --seed=1288443891
# Actual: Test Suites: 3 failed, 11 passed; Tests: 10 failed, 90 passed
```

Kết quả theo file với cùng seed:

- `test/devices.spec.ts` → **5 failed / 9**.
- `test/admin.spec.ts` → **2 failed / 7**.
- `test/assistant.spec.ts` → **3 failed / 13**.

**Nguyên nhân cụ thể (đọc code + thông báo fail):**

1. `apps/api/test/devices.spec.ts:380-395` đổi `users.role` của **admin dùng chung** (`admin` tạo một lần ở `devices.spec.ts:96-98`) thành `user` và không khôi phục. Helper `adminCreateDevice` (`devices.spec.ts:47-54`) luôn kỳ vọng 201. Khi test thu hồi quyền chạy trước, 5 test sau nhận **403 thay vì 201** (đúng thông báo fail `Expected: 201, Received: 403`).
2. `apps/api/test/admin.spec.ts:281-346` (T4) giả định policy đang là mặc định (`effectiveDiff.from = 15`), `:347-359` (T5) giả định `active.version = 0`. Khi T7 (publish, `admin.spec.ts:547`) chạy trước, fail thật là `effectiveDiff.from = 25` thay vì `15`, và `active.version = 1` thay vì `0`.
3. `apps/api/test/assistant.spec.ts:713-748` dùng chung `FakeAdapter` (state `mode`) và cộng dồn `ai_summaries`; test summary `:669` kỳ vọng `fake.calls` đúng 1 và `:679` kỳ vọng `stored` đúng 1, còn test lỗi `:745` kỳ vọng `stored >= 4`. Khi test lỗi chạy trước và fail, `fake.mode` còn `badJson` (dòng `:748` chỉ chạy khi test thành công) → 2 test sau nhận `provider: 'template'` thay vì `openai-compatible`.

**Hệ quả:** test xanh/đỏ phụ thuộc vị trí; một test mới chèn vào có thể làm đỏ dây chuyền hoặc **che** lỗi bằng state do test khác tạo. Điều này trái tinh thần "test nhỏ nhất sở hữu hành vi" và "đọc bằng chứng trước khi kết luận" của `docs/08` (dòng 8, 12).

**Đề xuất:**

- Tạo admin riêng cho test thu hồi (`registerUser` + `createAdmin` cục bộ), không sửa role của fixture dùng chung.
- Reset `policyConfigs` trong `beforeEach` của `admin.spec.ts` (hoặc dùng `scope` riêng cho từng test) và không assert version tuyệt đối; assert delta/`source`.
- Mỗi test assistant tạo `FakeAdapter` riêng, dùng `try/finally { fake.mode = 'ok' }`, assert `fake.calls.length === before + 1` thay vì `toHaveLength(1)`, và assert `ai_summaries` **theo `requestId`/khoảng thời gian của test** thay vì tổng.
- Thêm cổng (sau khi sửa): `pnpm --filter @annhien/api test -- --randomize --seed=...` hoặc `--sequence.shuffle` tương đương; lưu seed trong log.

### Q-02. Test API có thể chạy vào DB/AI/MQTT thật nếu có file `.env`

**Mức:** P1 — phá tính hermetic; có nguy cơ ghi dữ liệu demo/lỗi vào DB thật, gọi AI thật, thử kết nối broker.

**Đường đi (file/dòng):**

- `apps/api/test/test-app.ts:28-34` xoá `process.env.DATABASE_URL` rồi `resetEnvCacheForTests()`.
- `apps/api/src/config/env.ts:44-52` gọi `loadDotenv({ path, override: false })`; dotenv với `override:false` **sẽ set lại biến đang undefined**. Tôi đã kiểm bằng probe: xoá `DATABASE_URL`, nạp một `.env` tạm → `process.env.DATABASE_URL` có lại giá trị.
- `apps/api/src/database/database.ts:40-52`: nếu `env.DATABASE_URL` có giá trị thì dùng `pg` + `migratePg` (Postgres thật), ngược lại mới PGlite memory.
- Cùng cơ chế với `AI_BASE_URL/AI_API_KEY/AI_MODEL`: `apps/api/test/assistant.spec.ts:60-69` xoá trước khi `loadEnv`, nên `.env` sẽ nạp lại; khi đó describe "không cấu hình AI" (`assistant.spec.ts:296`) sẽ gọi provider thật.
- `MQTT_URL` trong `.env` sẽ khiến `MqttIngestService.onModuleInit` kết nối broker thật (`apps/api/src/ingest/mqtt-ingest.service.ts:54-77`) khi `auth.spec`/`seed.spec` boot `AppModule`.
- `.env.example:1,6-7` hướng dẫn copy sang `.env`; nếu người dùng bỏ comment `DATABASE_URL` (đúng hướng dẫn chuyển PostgreSQL ở `docs/14` mục 3) thì `pnpm test` sẽ dùng DB đó.

**Expected/actual:** expected test luôn dùng PGlite in-memory + không gọi dịch vụ ngoài; actual phụ thuộc nội dung `.env` tại `apps/api/.env` hoặc repo root.

**Đề xuất:**

- Trong `loadEnv`, bỏ qua `loadDotenv` khi `NODE_ENV === 'test'` (hoặc chỉ nạp khi không phải test).
- Hoặc trong `buildTestApp` (sau `app.get(ENV)`): `if (env.DATABASE_URL || env.MQTT_URL || env.AI_BASE_URL) throw new Error('Test phải chạy hermetic; kiểm .env')`.
- Thêm một test "guard" cho chính hành vi này (dùng `jest.resetModules`, set env giả) để không tái diễn.
- Ghi rõ trong `apps/api/README.md` rằng `.env` bị bỏ qua khi test.

### Q-03. Không có test tích hợp/E2E thật; hầu hết spec bỏ qua `AppModule`

**Mức:** P1 — contract drift/thiếu module/route sai thứ tự sẽ không bị bắt; "E2E" hiện tại không chạm API.

**Bằng chứng:**

- `tests/README.md:3`: "**Chưa có ứng dụng nên chưa có test executable.**" — đã sai ở HEAD này; thư mục chỉ có README, không có test.
- `apps/web/e2e/alerts.spec.ts:3-4`: "mock API bằng page.route nên KHÔNG cần API thật chạy"; `apps/web/e2e/smoke.spec.ts:1-4` chỉ landing/login. Tổng **4** test E2E; không có test simulator → ingest → DB → incident → outbox → SSE → web.
- `apps/web/e2e/alerts.spec.ts` giữ fixture cảnh báo riêng, trùng lặp với `apps/web/src/test/utils.ts` — sửa contract một nơi có thể không sửa nơi kia.
- `apps/api`: **12/14** spec dựng app bằng `createModuleTestApp` (`apps/api/test/test-app.ts:74-79`) hoặc builder riêng (`assistant.spec.ts:72-84`); chỉ `auth.spec.ts` và `seed.spec.ts` boot `AppModule`. Vì vậy `apps/api/src/app.module.ts` (danh sách import, thứ tự guard/filter) không được kiểm: nếu một module bị bỏ khỏi `AppModule`, test module con vẫn xanh.
- Root `package.json` chỉ có `test` chạy từng package; không có `test:integration`; `docs/14:135` yêu cầu "E2E cho luồng demo", `docs/08` chiến lược 4 yêu cầu E2E cho đường demo quan trọng.

**Đề xuất (ưu tiên cao):**

- Thêm `tests/integration/demo-chain.spec.ts` (Jest, PGlite memory): boot `AppModule` trên cổng ephemeral, dùng `runCli(['demo','--fast'], env)` của simulator trỏ vào API đó, rồi assert: telemetry rows, incident state, outbox rows, SSE event. Chạy bằng script mới `"test:integration": "jest --runInBand tests/integration"` ở root (hoặc `pnpm --filter @annhien/api test:integration`).
- Thêm `tests/integration/app-module.spec.ts`: boot `AppModule`, gọi một endpoint đại diện mỗi module (auth, subjects, care, devices, ingest, measurements, incidents, notifications, realtime, studio, assistant, maintenance, admin, health) và assert không 404 do thiếu module.
- Chuyển ít nhất một luồng demo sang Playwright **không** `page.route`: web dev + API thật + seed, đăng nhập, mở cảnh báo, ack (hoặc chạy `tests/e2e/demo.spec.ts` với `webServer` khởi động cả API).
- Cập nhật `tests/README.md` theo hiện trạng.

### Q-04. Outbox retry/backoff/attempts và "worker tắt rồi khởi động lại" (T-07) chưa từng được chạy

**Mức:** P1 — NFR-06 và T-07 (`docs/08:24`) không có bằng chứng; nhánh retry là code chết trong test.

**Bằng chứng:**

- `apps/api/src/notifications/notifications.service.ts:112-131` là toàn bộ nhánh lỗi: tăng `attempts`, `nextAttemptAt` theo `backoffMs` (1s/5s/30s), `failed` sau 5 lần. Coverage ghi nhận các dòng này **không được thực thi** (file 69.51% statement, 52.38% branch).
- `apps/api/test/notifications.spec.ts` chỉ có N1/N2/N3 (`:168`, `:203`, `:228`): gửi thành công, supersede, API đọc. Không test lỗi gửi, không test `attempts`, `nextAttemptAt`, `lastError`, không test `failed`.
- Worker thật bị tắt trong test: `notifications.service.ts:38-45` chỉ tạo `setInterval` khi `NODE_ENV !== 'test'`; test gọi trực tiếp `processPending()`.
- Helper `countByIncident` (`notifications.service.ts:248-257`, ghi "Dùng trong test/handoff") không được tham chiếu ở đâu ngoài chính nó (grep toàn repo) — dấu hiệu test trạng thái outbox từng dự định viết nhưng chưa có.
- `deliverInApp` không có điểm tiêm lỗi nên nhánh catch gần như không thể kích hoạt bằng API/DB bình thường.

**Đề xuất:**

- Tách một port giao thông báo (ví dụ `InAppDelivery` provider) để test override lỗi; hoặc thêm hook test-only có kiểm soát.
- Test: `attempts` 1→2→3→4 với `nextAttemptAt` +1s/+5s/+30s; lần 5 → `status='failed'`, `sentAt=null`, `lastError` không chứa secret; gọi `processPending` lại sau "restart" (tạo service instance mới trên cùng DB) vẫn nhặt pending đúng hạn; incident đóng giữa retry → alert pending thành `superseded` (đã có N2 cho trường hợp chưa gửi).
- Test worker `onModuleInit` với fake timers (không chỉ gọi trực tiếp), và `onModuleDestroy` clear timer.

### Q-05. Thu hồi quyền giữa lúc AI đang chạy không được kiểm lại; các đường REST sau thu hồi chưa được test

**Mức:** P1 — T-02 (`docs/08:19`) và NFR-01 yêu cầu "stream và kết quả đang sinh bị chặn", "kiểm quyền theo hồ sơ cho REST, realtime, export và AI".

**Bằng chứng:**

- `apps/api/src/assistant/assistant.service.ts:262-267`: chỉ `requireHistory` + `assertAction` **một lần trước khi đọc**; sau đó gọi model `:289`, `persistSummary` `:306`, `return` `:322` — **không kiểm lại quyền**. `ask` tương tự: check `:335-336`, trả kết quả `:396/:406` không re-check. `docs/04:96` ghi "Kiểm quyền trước tổng hợp **và trước trả kết quả**".
- `apps/api/test/assistant.spec.ts:463` chỉ test quyền **trước** khi gọi (403/404/from ngoài lịch sử); không có test thu hồi giữa request.
- `apps/api/test/care.spec.ts:179-231` sau thu hồi chỉ kiểm `GET /subjects/:id` (404) và list; **không** kiểm `measurements`, `alerts`, `export.csv`, `assistant`, dù `docs/02` NFR-01 yêu cầu cả bốn đường.
- `apps/api/test/measurements.spec.ts:208` dùng "stranger" (chưa từng có link), không phải caregiver **đã bị thu hồi**; tương tự export (`:376`).
- SSE đã có test thu hồi khi stream mở (`apps/api/test/sse.spec.ts:167`) — phần này tốt, nhưng không bù cho AI/REST.

**Kỳ vọng/actual nếu viết test T-02:** với một `FakeAdapter` chậm (giữ request vài trăm ms), thu hồi care link trong lúc chờ model → kỳ vọng 403/404 và **không** có bản ghi `ai_summaries`; đọc code hiện tại cho thấy request sẽ trả 200 kèm summary và vẫn `persistSummary`. Tôi **chưa chạy** kịch bản này (không sửa test), nên ghi là "dự kiến fail", không phải kết quả đo.

**Đề xuất:**

- Re-check `requireHistory`/`assertAction` ngay trước `persistSummary` và trước khi trả cả `summary` lẫn `ask`.
- Thêm test `apps/api/test/assistant.spec.ts` (hoặc file mới `assistant-revocation.spec.ts`) dùng adapter có `deferred`; revoke bằng `DELETE /care-links/:id`; assert 403/404 và `ai_summaries` không tăng.
- Thêm bảng test thu hồi cho cả 4 đường: measurements (403/404), alerts (403/404), export (403/404), assistant (403), SSE (`revoked`).

### Q-06. Chuyển thiết bị A→B và vùng cách ly (T-03) chưa có test; `is_quarantined` không bao giờ được ghi `true`

**Mức:** P1 — FR-03 là P0 (`docs/02`), T-03 (`docs/08:20`) yêu cầu "dữ liệu không rơi vào hồ sơ B; timestamp không tin cậy bị cách ly".

**Bằng chứng:**

- `apps/api/test/devices.spec.ts:213-275` chỉ release thiết bị của **cùng** hồ sơ, kiểm dữ liệu cũ vẫn gắn assignment cũ và ingest sau release bị `DEVICE_NOT_CLAIMED`. Không có bước: B claim cùng thiết bị sau release → B xem measurements/export → phải **không** thấy dữ liệu A; A vẫn thấy lịch sử cũ.
- `apps/api/src/measurements/measurements.service.ts:84,163,295` lọc theo `assignmentIdsForSubject` (tất cả assignment của subject, kể cả đã đóng): về logic assignment, dữ liệu A gắn assignment cũ nên B không thấy; nhưng **chưa có test** chứng minh.
- `apps/api/src/database/schema.ts:275` có `is_quarantined`, nhưng `apps/api/src/ingest/telemetry-ingest.service.ts:131` **luôn ghi `false`**; không có nhánh nào set `true`. Contract `packages/contracts/src/measurements.ts:30` có gap reason `quarantined` nhưng `measurements.service.ts` không bao giờ sinh ra.
- Yêu cầu cách ly nằm ở `docs/03:79`, `docs/04:55`, `docs/08:20`; `docs/14:58` còn liệt kê "cách ly" trong module ingest.
- Không test nào chạy nhánh `is_quarantined=true` hay gap `quarantined` (grep `quarantin` trong `apps/api/test` = 0).

**Đề xuất:**

- Test chuyển chủ: A claim → telemetry → release → B claim → `GET /subjects/B/measurements`, `daily-summary`, `export.csv` không chứa mẫu A; `GET /subjects/A/...` vẫn thấy; ingest mới của B gắn assignment B; `subject/status` của B chỉ dùng assignment mới.
- Quyết định phạm vi: hoặc implement cách ly (ví dụ khi `measured_at=null` và không xác định được assignment/time) + test, hoặc ghi rõ trong `docs/14`/`docs/03` rằng v1 chưa làm và **bỏ/đánh dấu chưa dùng** `is_quarantined`/gap `quarantined` để không tuyên bố T-03 đạt.

## 5. Finding P2

### Q-07. Test "đồng thời" chỉ chạy trên PGlite một kết nối — không chứng minh được concurrency PostgreSQL

- `apps/api/src/database/database.ts:56` tạo **một** `new PGlite()`; PGlite chạy in-process. Các test `Promise.all` (`incidents.spec.ts:541-592`, `studio.spec.ts:492-522`, `admin.spec.ts:547`, `assistant.spec.ts:596`) chỉ chứng minh "hai request chồng lấn trong event loop", không chứng minh row lock/`SKIP LOCKED` của Postgres.
- `notifications.service.ts:70` dùng `.for('update', { skipLocked: true })` — hành vi này trên PGlite chưa được xác minh, và test không chạm nhánh worker.
- Chính `docs/14:146,188` đã ghi "chưa benchmark PostgreSQL thật/đa kết nối", nhưng tên test "hai request đồng thời" dễ bị đọc quá mức.
- **Đề xuất:** thêm suite `tests/integration/postgres-concurrency.spec.ts` chỉ chạy khi `DATABASE_URL` có (compose), bật rõ trong CI release gate; đổi tên/comment test PGlite thành "trong cùng tiến trình" để không overclaim.

### Q-08. Nhánh race/unique-violation quan trọng có coverage 0

- `apps/api/src/ingest/telemetry-ingest.service.ts:162-195` (`classifyRace`: unique violation → duplicate/409) **không được thực thi** (coverage liệt kê đúng dòng 162-195). Test hiện chỉ gửi tuần tự (`ingest.spec.ts:154,188`).
- `apps/api/src/incidents/incidents.service.ts:286-295` (tạo incident đụng unique violation khi hai event mới đến cùng lúc) **0 hit**.
- `incidents.service.ts:735-739` (acknowledge khi state không còn `open`) **0 hit** — không có test ack lại cảnh báo đã `acknowledged`/`resolved` với `expectedVersion` hiện tại.
- **Đề xuất:** cùng `message_id` gửi song song → 1 accepted + 1 duplicate + 1 row; cùng `(boot_id, sequence)` khác `message_id` song song → 1 accepted + 1 409; `candidate`+`confirmed` cùng incident mới song song → 1 incident, cả hai accepted; ack sau resolve bằng version hiện tại → 409 + action `conflict`.

### Q-09. Thiếu unit test thời gian/timezone; có test "bom hẹn giờ" 2027-01-01

- Không có `apps/api/src/measurements/time-utils.spec.ts`; các hàm `isValidTimezone`, `timezoneOffsetMs`, `zonedToUtc` (`apps/api/src/measurements/time-utils.ts:9,19,44`) chỉ được chạm gián tiếp (85% statement nhưng 69% branch). T-04 (`docs/08:21`) yêu cầu "qua nửa đêm"; không có test mốc `2026-11-12T17:00Z = 2026-11-13` theo `Asia/Ho_Chi_Minh`, không có DST (`America/New_York`), không có timezone sai.
- `apps/api/test/measurements.spec.ts:318` gửi `date=2027-01-01` để kỳ vọng 422 "ngày tương lai". Sau **2027-01-01** ngày này là quá khứ → test sẽ fail (API chỉ chặn future, `measurements.service.ts:150`), đây là lỗi hẹn giờ chắc chắn.
- Web: `apps/web/src/lib/format.ts:77` (`todayInTimeZone`) và `:98` (`clampRangeToHistoryDays`) không có test trực tiếp.
- **Đề xuất:** bảng test cho `zonedToUtc`/`todayInTimeZone` (biên ngày, DST, tz sai); thay literal `2027-01-01` bằng `new Date(Date.now() + 2*86400_000)` hoặc inject clock.

### Q-10. Thiếu test bảo mật phiên: hết hạn, logout phía server, rate limit đăng nhập, cookie, open-redirect

- `apps/api/test/auth.spec.ts:28-40`: logout 204 rồi `agent.get('/me')` → 401. Supertest agent **tự xoá cookie** khi server `clearCookie` (`apps/api/src/auth/session-cookie.ts:15-22`), nên test này **không chứng minh** session bị revoke phía server (nếu server quên revoke, test vẫn xanh). Cần lấy cookie lúc login, replay thủ công sau logout → 401.
- Không có test phiên hết hạn: filter `sessions.expiresAt > now` (`apps/api/src/auth/auth.service.ts:129-137`) chưa được chạy với row hết hạn; T-01 (`docs/08:18`) yêu cầu "phiên hết hạn".
- Rate limit đăng nhập (`auth.service.ts:166-176`) **không được chạy** (coverage 173-174); `docs/04` yêu cầu rate limit cho auth. Cần test 5 lần sai → 429 và reset sau cửa sổ.
- Cookie flags (`HttpOnly`, `SameSite=Lax`, `Secure` khi production) tại `session-cookie.ts:6-13` không có assertion nào; T-01/NFR-05.
- `apps/web/src/lib/next.ts:7-14`, `apps/web/src/lib/session.ts:7-28` có comment "tách riêng để test" nhưng **không có test**; `ProtectedRoute.test.tsx` chỉ kiểm `next` hợp lệ, không kiểm `next=//evil.example`.

### Q-11. Nhiều màn hình/luồng web chưa có test; test cảnh báo chỉ kiểm nhánh 409, không kiểm body mutation

- Route không có file test component/unit nào: `DashboardPage` (`apps/web/src/app/router.tsx:81`), `SubjectsPage` (`:85`), `SharePage` (`:86`), `NotificationsPage` (`:88`), `InvitePage` (`:73`), `RegisterPage` (`:72`), `AppNotFoundPage` (`:95`), `NotFoundPage` công khai (`:100`).
- Dashboard chứa các hành vi có yêu cầu rõ: nhãn "Nguồn: dữ liệu mô phỏng" (`apps/web/src/features/dashboard/DashboardPage.tsx:199`), "Chưa có mẫu nhịp tim" (`:217`), pin "Chưa có thông tin pin" (`:238`), thứ tự cảnh báo trước số liệu (`:146`). Không hành vi nào được test; E2E tổng quan (`e2e/alerts.spec.ts:175`) chỉ kiểm heading + link.
- `apps/web/src/features/alerts/AlertsPage.test.tsx` và `AlertDetailPage.test.tsx` chỉ có nhánh 409; không có test ack/resolve **thành công**, không assert request body. Trong khi UI gửi `expectedVersion` (`AlertDetailPage.tsx:82,147`, `AlertsPage.tsx:58`), mock handler bỏ qua body — nếu UI gửi sai version, test vẫn xanh.
- `apps/web/src/features/realtime/useSubjectEvents.ts:60-150` (xóa cache khi `revoked`, reconnect bằng cursor, ẩn tab) không có test; `sse.test.ts` chỉ test hàm thuần `parseSseBlock`/`handleRealtimeEvent`.
- `HistoryPage.test.tsx` chỉ có empty/unsynced; biểu đồ, gap, phân trang 20 dòng, nhãn ngày >12h (`docs/06`) không được kiểm.
- E2E fixture cảnh báo bị sao chép giữa `apps/web/e2e/alerts.spec.ts` và `apps/web/src/test/utils.ts`; sửa contract một nơi dễ lệch nơi kia.
- **Đề xuất:** `DashboardPage.test.tsx` (synthetic label, battery null, HR null, alert-first), `AlertDetailPage.test.tsx` thêm success + assert `{ expectedVersion }`/`{ reason, outcome }`, test `useSubjectEvents` với fake `EventSource`, test Share/Notifications/Invite/Register smoke, test `format.ts`.

### Q-12. Chưa test hiệu lực runtime của policy publish (FR-13)

- `apps/api/test/admin.spec.ts:347-458` chỉ assert bản ghi `policy_configs`, history, version/rollback; không kiểm policy mới có hiệu lực ở `/subjects/:id/status` hoặc ingest.
- `apps/api/test/ingest.spec.ts:289-307` **chèn thẳng** `policyConfigs` với `maxTelemetryPerMinute: 1` để test rate limit, bỏ qua đường publish/CAS/digest của admin. Vì vậy "admin publish → ingest dùng ngưỡng mới" chưa từng chạy.
- **Đề xuất:** integration test: admin publish `maxTelemetryPerMinute=1` qua `PUT /admin/policies/device_runtime` → gửi 2 telemetry → 429; publish `offlineAfterSeconds` → `/status` đổi `freshness`; assert `policy.version/digest` trong response khớp bản publish.

### Q-13. Assertion yếu, traceability sai/thiếu, harness trùng global guard/filter

- Audit assertion file-global, không scope theo entity: `apps/api/test/incidents.spec.ts:440` (`incident.ingest/conflict` chỉ `>0`), `:768` (`denied` chỉ `>0`). Nếu hành vi của test hiện tại không tạo audit, test vẫn xanh nhờ test khác.
- `apps/api/test/assistant.spec.ts:745` assert `stored.length >= 4` cộng dồn; `:669/:679` assert số tuyệt đối. `seed.spec.ts:29-34` assert tổng user/subject/incident/task/outbox tuyệt đối (dễ vỡ khi seed mở rộng) và **không** assert `telemetry.source='simulator'` dù seed ghi `source: 'simulator'` (`apps/api/src/database/seed.ts:303`) — nhãn dữ liệu mô phỏng (FR-04/06, `docs/06`) không có bằng chứng. Export test chỉ assert `is_synthetic=false` (`measurements.spec.ts:411`), chưa bao giờ `true`.
- Traceability: `docs/14:137` yêu cầu ID FR/NFR/AI/T trong tên test/handoff. Grep toàn repo test: **0** lần `T-01..T-14`; `FR-03, FR-08, FR-10, FR-12, FR-14` không xuất hiện trong test. Hai test web ghi sai ID: `apps/web/src/features/alerts/AlertsPage.test.tsx:25` và `AlertDetailPage.test.tsx:26` ghi "FR-13" cho cảnh báo (đúng là FR-07/FR-06).
- Harness trùng: `apps/api/test/test-app.ts:60-68` đã đăng ký `APP_GUARD SessionGuard` + `APP_FILTER ApiExceptionFilter` trong `TestInfraModule`; nhưng 8 spec vẫn tự thêm `TestFiltersModule`/`GuardInfraModule` (`admin, care, devices, ingest, measurements, studio, subjects, tasks`): 2 file `care/subjects` đăng ký **guard hai lần**, 6 file còn lại đăng ký trùng filter; comment ở `care.spec.ts:18` ("createModuleTestApp không đăng ký APP_GUARD/APP_FILTER") đã sai.
- Docs/test số liệu stale: `apps/web/README.md:83` ghi 19 file/72 test (hiện 20/73); `tests/README.md:3` ghi chưa có ứng dụng.
- **Đề xuất:** scope mọi query audit theo `targetId`/`incidentId`; dùng delta thay absolute; thêm assert `daily-summary.source='synthetic'` cho seed; gắn ID đúng vào tên test (đặc biệt T-xx); xoá `TestFiltersModule`/`GuardInfraModule` trùng; cập nhật README.

### Q-14. Adapter AI thật (HTTP) gần như không được test

- Coverage `apps/api/src/assistant/assistant-adapter.ts`: **25% statement, 0% branch** (các dòng 42-51, 63-107). Test chỉ dùng `FakeAdapter` (`assistant.spec.ts:227-296`), không chạy `fetch`, timeout `AI_TIMEOUT_MS`, HTTP 4xx/5xx, JSON sai ở tầng adapter.
- `docs/14:149` liệt kê rủi ro "AI provider không có trong môi trường chấm … test adapter bằng mock server" — chưa làm.
- **Đề xuất:** `apps/api/src/assistant/assistant-adapter.spec.ts` dùng `node:http` mock (giống `tools/simulator/test/mock-server.ts`): success, 500, body rỗng/JSON sai, timeout (đặt `AI_TIMEOUT_MS=50`), huỷ request; assert error mapping `AssistantAdapterError` và không retry vô hạn.

### Q-15. SSE cursor/Last-Event-ID/replay chưa có test

- `apps/api/test/sse.spec.ts:167` chỉ assert stream có `id: `; không reconnect. Controller đọc `last-event-id`/`cursor` (`apps/api/src/realtime/realtime.controller.ts:34-37`) và service replay theo `gt(realtimeEvents.id, cursor)` (`apps/api/src/realtime/realtime.service.ts:68-103`), nhưng không test: reconnect sau khi mất kết nối nhận đúng sự kiện bị lỡ; cursor sai → 0/snapshot; không replay trùng; heartbeat.
- Phía web, reconnect/cursor trong `useSubjectEvents.ts:120-150` cũng không được test.
- **Đề xuất:** test S3 trong `sse.spec.ts`: mở stream, nhận event 1, đóng, tạo event 2, mở lại với `Last-Event-ID: 1` → chỉ nhận event 2; gửi cursor không hợp lệ → không 500; kiểm `revoked` vẫn đóng đúng.

### Q-16. Ma trận quyền còn thiếu: lời mời chưa chấp nhận, admin đọc sức khỏe, export sau thu hồi

- `apps/api/src/access/access.service.ts:56-64` chỉ coi link `status='active'`; nhưng không test **invitation pending**: caregiver được mời chưa accept gọi measurements/export/alerts/assistant phải 404. `care.spec.ts` chỉ test accept sai email/sai token.
- Admin (không có care link) mới được test `GET /subjects/:id` 404 (`apps/api/test/subjects.spec.ts:146`); chưa test `measurements`, `daily-summary`, `export.csv`, `alerts`, `assistant`, SSE — T-12 (`docs/08:29`) yêu cầu "Admin đọc sức khỏe" bị chặn.
- Export **sau thu hồi** (không phải stranger) chưa test; xóa dữ liệu/FR-14 không có endpoint (grep source không thấy `deletion`), nên không có gì để đạt.
- Gửi lại `fall.confirmed` nhiều lần (10 lần) chưa test; outbox dedupeKey chỉ được kiểm gián tiếp 1 lần (`incidents.spec.ts:230`). Đây là T-06 (`docs/08:22`) "gửi cùng message 10 lần" — hiện chỉ gửi candidate 2 lần (`incidents.spec.ts:352`).
- **Đề xuất:** thêm test pending-invite no-access; admin 6 đường dữ liệu; export sau revoke; gửi confirmed 10 lần → outbox vẫn đúng 2 dòng, incident/version không đổi.

## 6. Ma trận yêu cầu → test hiện có

### FR (docs/02)

| ID | Test hiện có (file:dòng) | Trạng thái bằng chứng |
| --- | --- | --- |
| FR-01 | `auth.spec.ts:14-69` | Một phần; thiếu phiên hết hạn, logout server-side chắc chắn, rate limit, cookie (Q-10) |
| FR-02 | `care.spec.ts:70,179,232,288,336`; `sse.spec.ts:167` | Một phần; thiếu pending invite, thu hồi REST/AI (Q-05, Q-16) |
| FR-03 | `devices.spec.ts:105,128,155,193,213,277,333,362` | Một phần; thiếu chuyển A→B và cách ly (Q-06) |
| FR-04 | `ingest.spec.ts:122,237,259,274`; `measurements.spec.ts:238,295,323` | Một phần; thiếu biên schema (battery 0-100/null, steps âm), UI Dashboard |
| FR-05 | `measurements.spec.ts:113,166,208,376`; `HistoryPage.test.tsx:7,49` | Một phần; thiếu biểu đồ/gap/nhãn ngày/phân trang UI |
| FR-06 | `incidents.spec.ts:213,268,319,352,472,670,719` | Nhiều test trực tiếp cho state machine; thiếu confirmed lặp 10 lần (Q-16) |
| FR-07 | `incidents.spec.ts:230,541,594,614`; `notifications.spec.ts:168,203,228`; web alerts | Một phần; UI chỉ có 409, thiếu ack/resolve thành công (Q-11) |
| FR-08 | `devices.spec.ts:277,333`; `measurements.spec.ts:166`; `ingest.spec.ts:274` | Một phần; dashboard battery/offline/nhãn chưa test |
| FR-09 | `incidents.spec.ts:719`; `tools/simulator/test/fall.test.ts:161` | Có test trực tiếp backend + simulator; chống bấm nhầm thuộc firmware (N/A v1) |
| FR-10 | `assistant.spec.ts` 13 test | Một phần; thiếu adapter HTTP, prompt injection, revoke giữa request (Q-05, Q-14) |
| FR-11 | `admin.spec.ts:86,130,204,462`; `devices.spec.ts:277`; `tasks.spec.ts:214,273` | Một phần; admin chưa test qua measurements/export/AI/SSE |
| FR-12 | Không có | N/A — chưa triển khai Web Push; không được báo đạt |
| FR-13 | `admin.spec.ts:281,347,547`; `ingest.spec.ts:289` | Một phần; thiếu hiệu lực runtime từ publish (Q-12) |
| FR-14 | `measurements.spec.ts:376` (export) | Một phần; không có test/endpoint xóa (Q-16) |

### NFR (docs/02)

| ID | Test hiện có | Thiếu |
| --- | --- | --- |
| NFR-01 | `care`, `subjects`, `incidents`, `measurements:208`, `assistant:463`, `sse:167`, `studio:524` | Ma trận 4 đường sau thu hồi; admin; AI mid-flight (Q-05, Q-16) |
| NFR-02 | `ingest:154,188`; `incidents:352`; simulator `queue.test.ts` | Race thật, retry outbox, restart (Q-04, Q-07, Q-08) |
| NFR-03 | `ingest:237,274`; `devices:333` | Phân biệt detection vs received; cách ly clock; timezone (Q-06, Q-09) |
| NFR-04 | Không có (thủ công ngoài repo) | Không thể kết luận từ test |
| NFR-05 | CSRF `auth:52`; device auth `ingest:213`; token hash `care:100`; audit lọc `assistant:544` | Cookie flags, login rate limit, open redirect (Q-10) |
| NFR-06 | `notifications:168,203,228`; SSE 5 lần pass | Retry/attempts/failed/restart (Q-04); reconnect cursor (Q-15) |
| NFR-07 | Không có | Chưa đo p50/p95 (T-14) |

### T (docs/08)

| ID | Kết quả đối chiếu |
| --- | --- |
| T-01 | Một phần: logout/không phiên có; **hết hạn** và logout server-side thật chưa có (Q-10) |
| T-02 | Một phần: care/revoke/SSE; **AI đang chạy** và REST sau thu hồi thiếu (Q-05) |
| T-03 | **Thiếu**: chưa test A→B; cách ly chưa implement (Q-06) |
| T-04 | Một phần: null/quality/reset có; **qua nửa đêm**/timezone unit test thiếu (Q-09) |
| T-05 | Có test trực tiếp cho cả 3 kịch bản (`incidents:268,319`), nhưng chỉ trên PGlite |
| T-06 | Một phần: 2 lần gửi; **10 lần**, confirmed lặp, outbox dedupe thiếu (Q-16) |
| T-07 | **Thiếu**: retry/attempts/restart (Q-04) |
| T-08 | Một phần: `incidents:541` 1 applied/1 conflict; nhưng chỉ PGlite một kết nối (Q-07) |
| T-09 | Một phần: unsynced/late/offline/multi-boot; buffer/reboot firmware N/A; cách ly thiếu |
| T-10 | Một phần: SOS/simulator sos; hủy sau confirmed; chống bấm nhầm N/A firmware |
| T-11 | Một phần: thiếu dữ liệu/không bịa số có; **prompt injection/hồ sơ khác** và adapter HTTP thiếu (Q-14) |
| T-12 | Một phần: admin subject detail; **admin health 4 đường**, export sau revoke, xóa thiếu (Q-16) |
| T-13 | N/A — chưa có Web Push |
| T-14 | **Không có** — chưa đo độ trễ/không có script đo |

## 7. Đề xuất ưu tiên (kèm lệnh/file cụ thể)

| Ưu tiên | Việc cần làm | File/đường dẫn | Lệnh kiểm |
| --- | --- | --- | --- |
| 1 | Sửa order coupling (Q-01) | `apps/api/test/devices.spec.ts`, `admin.spec.ts`, `assistant.spec.ts` | `cd apps/api && PGLITE_MEMORY= node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand --randomize` (phải 100/100) |
| 1 | Khoá test hermetic (Q-02) | `apps/api/src/config/env.ts`, `apps/api/test/test-app.ts` | thêm test guard; chạy `pnpm test` với `.env` giả có `DATABASE_URL` trong CI tạm |
| 1 | Thêm chuỗi demo thật (Q-03) | `tests/integration/demo-chain.spec.ts`, `tests/integration/app-module.spec.ts`, `tests/e2e/demo.spec.ts` | `pnpm test:integration` (script mới) + Playwright không `page.route` |
| 1 | Retry/restart outbox (Q-04) | `apps/api/src/notifications/notifications.service.ts`, `apps/api/test/notifications.spec.ts` | `pnpm --filter @annhien/api test -- notifications` |
| 1 | Thu hồi giữa AI + 4 đường (Q-05) | `assistant.service.ts`, `apps/api/test/assistant.spec.ts`, `care.spec.ts` | test với FakeAdapter deferred; chạy `assistant|care|measurements|sse` |
| 1 | Chuyển A→B/cách ly (Q-06) | `apps/api/test/devices.spec.ts`, `measurements.service.ts`, `telemetry-ingest.service.ts` | test mới + quyết định phạm vi trong `docs/14` |
| 2 | Race/unique violation (Q-08) | `apps/api/test/ingest.spec.ts`, `incidents.spec.ts` | Promise.all 3 kịch bản; coverage lại 162-195/286-295 |
| 2 | Time/timezone (Q-09) | `apps/api/src/measurements/time-utils.spec.ts`, sửa `measurements.spec.ts:318`, `apps/web/src/lib/format.test.ts` | `--coverage`; chạy test với `TZ` khác |
| 2 | Auth security (Q-10) | `apps/api/src/auth/session-cookie.spec.ts`, `auth.spec.ts`, `apps/web/src/lib/next.test.ts` | replay cookie sau logout; 5 lần sai → 429; assert `Set-Cookie` |
| 2 | Web screens/mutations (Q-11) | `DashboardPage.test.tsx`, `AlertDetailPage.test.tsx`, `useSubjectEvents.test.tsx`, `Share/Notifications/Invite/Register` | `cd apps/web && pnpm test` |
| 2 | Policy runtime (Q-12) | `apps/api/test/admin.spec.ts` + `ingest.spec.ts` (dùng API publish) | test publish → 429/freshness |
| 2 | Adapter AI (Q-14) | `apps/api/src/assistant/assistant-adapter.spec.ts` | mock `node:http` + `AI_TIMEOUT_MS=50` |
| 2 | SSE reconnect (Q-15) | `apps/api/test/sse.spec.ts` + `useSubjectEvents.test.tsx` | `Last-Event-ID` replay |
| 2 | Traceability/assertion (Q-13) | tên test, README, bỏ `TestFiltersModule`/`GuardInfraModule` trùng | grep `T-0`, `FR-13` sai; review diff |
| 3 | PG thật cho race (Q-07) | `tests/integration/postgres-concurrency.spec.ts` | chỉ chạy khi `DATABASE_URL` |

## 8. Giới hạn của review này

- Không chạy API trên cổng riêng/DB review; toàn bộ kết quả API lấy từ Jest + PGlite in-memory. Không gọi API 3000.
- Không chạy Postgres/MQTT/AI thật, không đo tải/độ trễ; các kết luận về race chỉ ở mức "test chưa chứng minh".
- Không sửa test để thử các kịch bản thiếu; các chỗ ghi "dự kiến fail" (Q-05) là suy luận từ code, không phải output thực thi.
- Không đánh giá lại 2 review trước; các finding P2 của họ có thể vẫn mở.
- Không chấm điểm "đạt/không đạt" cho FR-12, NFR-04, NFR-07 vì chưa có phép đo tương ứng.

## 9. Tóm tắt 5 dòng

1. Toàn bộ test hiện có chạy xanh khi đúng thứ tự: API 100/100, web 73/73, simulator 23/23, E2E 4/4; typecheck sạch.
2. Nhưng bộ API **không bền thứ tự**: `--randomize --seed=1288443891` làm 10/100 test fail vì admin dùng chung bị hạ quyền, policy toàn cục bị publish trước, và `FakeAdapter`/`ai_summaries` cộng dồn.
3. Test chưa hermetic: nếu có `.env`, `loadEnv` nạp lại `DATABASE_URL`/`AI_*`/`MQTT_URL` sau khi test xoá, nên test có thể chạy vào DB/AI/broker thật.
4. Thiếu bằng chứng cho các tiêu chí trọng yếu: outbox retry/restart (T-07), thu hồi giữa lúc AI chạy (T-02), chuyển thiết bị A→B/cách ly (T-03), tích hợp simulator→API→web, và phần lớn màn hình web (Dashboard/Share/Notifications/Invite/Register).
5. Đề xuất trước mắt: sửa order coupling + khoá test hermetic + thêm một chuỗi integration thật; sau đó bổ sung retry outbox, revocation AI, transfer A→B, time-utils, auth security và các test UI còn thiếu — khi đó mới có cơ sở đóng P0/P1 của v1.
