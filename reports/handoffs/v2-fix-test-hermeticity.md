# Handoff — v2 / fix-test-hermeticity

- **Thời điểm:** 2026-11-15 08:16 (Asia/Ho_Chi_Minh)
- **Worker:** fix-test-hermeticity (worktree riêng `fix-test-hermeticity`)
- **Nhánh:** `fix-test-hermeticity`
- **Commit code:** `126dbfefdcd4d1c0e56cc94ab2d74d3e49f747b2`
- **Vùng ghi:** `apps/api/test/**`, `apps/api/jest.config.cjs`,
  `apps/api/package.json`, file này.
- **Không sửa:** code ứng dụng (`apps/api/src/**`), web, docs/HTML, schema/migration.
- **Nguồn yêu cầu:** `reports/qa/v2-chat-luong-kiem-thu.md` Q-01/Q-02/Q-06/Q-07/Q-09;
  `apps/api/test/test-app.ts`; `jest.config.cjs`; các spec liên quan.

## Đã làm

### 1. Môi trường test hermetic (Q-02)

- Thêm `apps/api/test/test-env.ts` và `setup-test-env.ts` chạy qua `setupFiles`
  **trước khi** module ứng dụng import `loadEnv`:
  - `NODE_ENV=test`, `PGLITE_MEMORY=true`, `WEB_ORIGIN=http://localhost:5173`, `TZ=UTC`;
  - xoá `DATABASE_URL`, `MQTT_URL`, `MQTT_*`, `AI_*`, `PORT`, `SESSION_TTL_HOURS`,
    `MAX_CLOCK_SKEW_SECONDS`, `SUSPECTED_TIMEOUT_MINUTES` khỏi shell;
  - `PGLITE_DATA_DIR` trỏ thư mục tạm theo PID.
- `jest.config.cjs` map `dotenv` sang stub `test/stubs/dotenv.cjs` — test không đọc
  bất kỳ file `.env` thật nào. Stub chỉ áp dụng trong Jest của API.
- `global-teardown.cjs` xoá thư mục tạm `annhien-api-tests` sau toàn bộ suite.
- `test-app.ts`:
  - guard `assertHermeticEnv` **trước `app.init()`** để không lỡ kết nối PostgreSQL/MQTT/AI thật;
  - guard DB sau init: chỉ chấp nhận `DatabaseHandle.kind === 'pglite'`;
  - `assistant.spec.ts` dùng cùng guard cho app dựng riêng.
- Thêm `test/hermetic.spec.ts` (4 test):
  - viết `.env` giả có `DATABASE_URL`/`MQTT_URL`/`AI_*`, đổi cwd rồi `loadEnv()` →
    các biến đó vẫn `undefined`;
  - guard từ chối DB/MQTT/AI thật, `NODE_ENV` khác `test`, `PGLITE_MEMORY=false`;
  - app test dùng PGlite memory, không tạo thư mục DB thật;
  - `NotificationService.onModuleInit()` không tạo timer khi `NODE_ENV=test`.
- Đã kiểm thêm bằng tay: tạo tạm `apps/api/.env` chứa `DATABASE_URL`, `MQTT_URL`,
  `AI_BASE_URL`, `AI_API_KEY` giả rồi chạy `hermetic.spec.ts` + `auth.spec.ts`:
  **2 suite / 10 test pass**, sau đó đã xoá `.env`. Không commit file `.env`.

### 2. Cô lập thứ tự test (Q-01 và các phụ thuộc phát hiện thêm)

- `devices.spec.ts`: test thu hồi quyền dùng **admin riêng** (`createAdmin` cục bộ),
  không hạ role admin fixture dùng chung.
- `admin.spec.ts`:
  - `beforeEach` xoá `policyConfigs` và audit `policy.publish` → T4/T5/T5b/T5c/T7
    không phụ thuộc test publish trước;
  - T6 dùng user riêng để disable, không mượn `toDisable` của T2; cập nhật kỳ vọng
    `{ active: 4, disabled: 1 }` theo fixture mới (không nới điều kiện).
- `assistant.spec.ts`: `beforeEach` reset `FakeAdapter.calls`/`mode` và xoá
  `ai_summaries` của subject; sửa assertion lỗi thành **đúng 4 lần gọi adapter,
  đúng 3 bản ghi summary failed** (ask không ghi `ai_summaries`) thay vì `>=4`
  sống nhờ state của test chạy trước.
- `incidents.spec.ts`:
  - T16 nới `sharedFrom` của fixture về 24h trước khi kiểm quyền xem cảnh báo
    `unconfirmed` 30 phút trước (fixture mới mặc định `sharedFrom=now` sau thay đổi
    cửa sổ chia sẻ);
  - T9 scope audit `incident.resolve` theo `targetId=incidentId`, không đếm audit
    của incident khác.
- `tasks.spec.ts`: `beforeEach` trả toàn bộ task fixture về trạng thái ban đầu
  (`open`/`done` đúng task) để T5/T6 đóng task không làm đổi T1/T2/T4/T7.
- `seed.spec.ts`: seed demo một lần trong `beforeAll`; test idempotent vẫn gọi
  `seedDemo` hai lần. Test nào chạy trước theo `--randomize` cũng có dữ liệu.
- `notifications.spec.ts`: `beforeEach` xoá `notification_outbox` (worker xử lý mọi
  hàng pending nên state này là toàn cục); `afterEach` trả real timers/mocks.

### 3. T-03 — chuyển thiết bị A→B / quarantine

- Mở rộng test có sẵn trong `ingest.spec.ts` thành **T-03**:
  - mẫu trước assignment đầu tiên và mẫu giữa hai assignment bị `is_quarantined=true`,
    `code=QUARANTINED`;
  - mẫu trong assignment A vẫn thuộc A; mẫu trong assignment B thuộc B;
  - kiểm thêm `daily-summary`, `export.csv` và `subject/status`:
    A/B không thấy mẫu của nhau, mẫu cách ly không lọt vào đường đọc;
    B status chỉ lấy mẫu B (`63 bpm`, đúng `measuredAt`); A không còn assignment mở.
- Không sửa code ingest/measurements; hành vi quarantine đã có sẵn và test này
  chứng minh thêm các đường đọc.

### 4. T-07 — outbox retry/backoff/restart (Q-04/Q-07)

Thêm vào `notifications.spec.ts`:

- **N11:** inject lỗi `deliverInApp` bằng spy prototype (test-only, không sửa app):
  `attempts` 1→5, `nextAttemptAt` đúng +1s/+5s/+30s, `lastError` không chứa
  device key/email/chỉ số sức khỏe, lần 5 → `failed`, `sentAt=null`; instance
  `NotificationService` mới trên cùng DB ("restart") nhặt lại pending đúng hạn;
  sau `failed` không bị gửi lại.
- **N12:** incident đóng giữa vòng retry → hai alert pending thành `superseded`,
  `supersededAt` có, không gửi.
- **N13:** timer worker tắt khi `NODE_ENV=test`; `onModuleDestroy` an toàn.
- Dùng fake `Date` (không fake timer/socket) để backoff xác định; PGlite/supertest
  vẫn chạy với timer thật.
- Giới hạn trung thực: đây là "restart service instance" trên cùng DB, không phải
  restart process thật; `lastError` hiện chỉ bị cắt 500 ký tự, chưa scrub secret
  (xem mục lỗ hổng).

### 5. Thời gian/timezone, bỏ "bom hẹn giờ" 2027 (Q-09)

- Thêm `test/time-utils.spec.ts` (6 test):
  - `isValidTimezone`, `timezoneOffsetMs` (gồm DST `America/New_York`);
  - `zonedToUtc` qua nửa đêm và hai lần chuyển DST;
  - `zonedDayToUtcRange` đúng biên ngày, fallback UTC khi timezone sai, chặn ngày
    không tồn tại/không đúng định dạng;
  - `localDateKey` tại biên `17:00Z` của `Asia/Ho_Chi_Minh`;
  - ngày tương lai/quá khứ tính **tương đối từ `Date.now()`**, không literal 2027.
- `measurements.spec.ts`: thay `date=2027-01-01` bằng `localDateKey(now + 2 ngày,
  'Asia/Ho_Chi_Minh')`; vẫn giữ assertion `422` cho ngày tương lai.

## Kiểm chứng đã chạy (kết quả thật)

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --frozen-lockfile` | exit 0, +711 packages |
| `pnpm build:contracts` | exit 0 |
| `pnpm typecheck` (root: contracts/web/api/simulator) | exit 0, tất cả `Done` |
| `cd apps/api && pnpm test` | **20 suites, 174/174 passed**, 109.591 s |
| `... --randomize --seed=1288443891` | **20 suites, 174/174 passed**, 113.986 s |
| `... --randomize --seed=42` | **20 suites, 174/174 passed**, 145.644 s |
| `... --randomize --seed=20261115` | **20 suites, 174/174 passed**, 114.336 s |
| `... --randomize --seed=777` (thêm) | **20 suites, 174/174 passed**, 115.188 s |
| `test/hermetic.spec.ts` + `test/auth.spec.ts` khi có `.env` giả | 2 suites / 10 passed; đã xoá `.env` |

Số test tăng từ 161 lên 174: +6 time-utils, +4 hermetic, +3 T-07; T-03 mở rộng
trong test có sẵn nên không tăng số test.

## Lỗ hổng / chưa làm

1. **T-07 chưa thử process restart thật**: "restart" là instance service mới trên
   cùng DB/PGlite, không phải tắt/mở process. Timer worker cố ý tắt trong test
   (`NODE_ENV=test`), nên chưa kiểm `setInterval` thật.
2. **`filterError` chưa scrub secret**: `notifications.service.ts:filterError` chỉ
   cắt 500 ký tự. Kênh `in_app` hiện không có transport ngoài nên test chỉ chứng
   minh lỗi inject không chứa device key/email/chỉ số sức khỏe. Khi thêm email/push
   cần test + cơ chế scrub trước khi lưu `lastError`.
3. **T-03 chưa có API/UI xem vùng cách ly**: đã kiểm DB/audit/đường đọc; không có
   màn hình hay endpoint danh sách bản ghi `is_quarantined`. Không thuộc phạm vi
   worker test.
4. **Q-07 vẫn mở**: test "đồng thời" vẫn chỉ trên PGlite một kết nối trong cùng
   process; chưa chứng minh row lock/`SKIP LOCKED` của PostgreSQL thật.
5. Không chạy MQTT broker thật, AI provider thật, PostgreSQL thật, web/E2E/simulator;
   không sửa code ứng dụng.
6. Chưa thêm CI workflow (repo không có `.github/workflows`); các seed/randomize
   trên là chạy tay.

## File chính

- `apps/api/jest.config.cjs` — setupFiles, globalTeardown, stub dotenv.
- `apps/api/package.json` — thêm `test:random`.
- `apps/api/test/test-env.ts`, `setup-test-env.ts`, `stubs/dotenv.cjs`,
  `global-teardown.cjs`, `hermetic.spec.ts`, `time-utils.spec.ts`.
- `apps/api/test/{test-app,devices,admin,assistant,incidents,tasks,seed,notifications,ingest,measurements}.spec.ts`
  (các sửa cô lập/T-03/T-07/2027 như trên).
