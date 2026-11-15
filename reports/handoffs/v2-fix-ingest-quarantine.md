# Handoff — v2 / fix-ingest-quarantine (cách ly telemetry lệch giờ/ngoài assignment)

- **Thời điểm:** 2026-11-15 07:34 (Asia/Ho_Chi_Minh)
- **Nhánh/worktree:** `fix-ingest-quarantine`
- **Commit code:** `c1ebb630e04c7be6ba7ef67f653a50f424345c1b`
- **Vùng ghi:** `packages/contracts/src/telemetry.ts`, `apps/api/src/ingest/{telemetry-ingest.service.ts,ingest.controller.ts}`, `apps/api/src/measurements/{measurements.service.ts,insights.ts}`, `apps/api/src/config/env.ts`, `.env.example`, `apps/api/test/{ingest,measurements,insights}.spec.ts`, file này.
- **Không sửa:** `devices.service.ts`/`device-status.ts` (worker `fix-last-telemetry`), incidents/notifications/assistant/studio, `app.module.ts`, schema/migration, web, docs/HTML.

## Đã làm

### 1. Contract (`packages/contracts/src/telemetry.ts`)

- `telemetryEnvelopeSchema`: thêm lỗi khi `clock_status='synced' && measured_at=null`; chỉ `unsynced` được null. `synced + null` giờ trả 422 `VALIDATION_FAILED` ở cả HTTP và bị MQTT parser coi là payload không hợp lệ.
- Áp cùng bất biến cho `incidentEnvelopeSchema` (cùng file, cùng quy ước docs/04: `unsynced` đi với null).
- Payload simulator/tools hiện tại: `tools/simulator` chỉ gửi null khi `clock_status='unsynced'`; không phá payload hợp lệ.

### 2. Ingest + assignment (`apps/api/src/ingest/telemetry-ingest.service.ts`)

- `MAX_CLOCK_SKEW_SECONDS` đọc từ `ENV` (mặc định 120, validate 0..3600). Thêm biến vào `env.ts` và `.env.example`.
- Assignment được chọn theo **`measured_at`**, không theo chủ đang mở:
  - Mẫu nằm trong assignment đang mở → gán như cũ.
  - Mẫu nằm trong một assignment **đã đóng** (chủ cũ) → gán đúng assignment cũ; dữ liệu không chuyển sang hồ sơ mới.
  - Mẫu trước assignment đầu tiên → cách ly `before_first_assignment`.
  - Mẫu rơi vào khoảng thiết bị chưa được gán → cách ly `outside_assignment`.
  - Mẫu `measured_at > received_at + MAX_CLOCK_SKEW_SECONDS` → cách ly `clock_skew_future`.
  - Dung sai `MAX_CLOCK_SKEW_SECONDS` chỉ nới sát biên bắt đầu/kết thúc assignment (đồng hồ thiết bị lệch vài chục giây không bị đẩy sang chủ khác); mẫu trước assignment quá ngưỡng vẫn bị cách ly.
- Mẫu bị cách ly **vẫn ghi** vào `telemetry` với `is_quarantined=true` (giữ dedupe `message_id`/`sequence`, giữ bằng chứng), trả **202 `accepted` + `code='QUARANTINED'`** và message trung tính (không có chỉ số sức khỏe). Không dùng 422 cho mẫu lệch giờ/assignment.
- Ghi audit `telemetry.quarantined` (`actorKind='device'`, `outcome='failed'`, target là device) với metadata chỉ gồm `messageId, bootId, sequence, reason, source, measuredAt, clockSkewSeconds, assignmentId`; log `Logger.warn` cùng nội dung. Không ghi nhịp tim/bước/pin/quality.
- Mẫu `unsynced` + `measured_at=null` giữ semantics cũ: ghi vào assignment đang mở, không cách ly, không lên timeline (đếm `excludedUnsyncedCount`).

### 3. Đường đọc

- `measurements.list`: lọc `is_quarantined=false`; trần cửa sổ telemetry là `min(to, now)` nên `measured_at > now` không vào items/coverage/gaps; `excludedUnsyncedCount` cũng bỏ mẫu cách ly.
- `daily-summary`: lọc `is_quarantined=false`; mọi phép tính telemetry (rows, coverage, gaps, `lastSeenAt`, pin, HR, steps) chỉ tới `min(to, now)`; incidents giữ nguyên theo ngày như yêu cầu.
- `export.csv`: lọc `is_quarantined=false`; cả nhánh `measured_at` và nhánh `received_at` (unsynced) đều kẹp `to` về hiện tại.
- `insights`: query lọc `is_quarantined=false`; `buildDailyInsights` lọc thêm `measuredAt <= now` trước khi gom ngày và cộng bước (phòng thủ nếu caller quên kẹp).
- `computeGaps` trả rỗng khi `to <= from` (tránh gap đảo chiều với cửa sổ tương lai).
- Giữ nguyên semantics khác của measurements/daily-summary; không thêm field contract mới (phần `excludedUnsyncedCount`/lý do gap `clock_unsynced` của P2-3 để worker sau theo đúng spec).

### 4. Test

- `apps/api/test/ingest.spec.ts` (+3 test, fixture assignment lùi 35 ngày):
  - `synced + measured_at null` → 422, không ghi row.
  - `measured_at` vượt dung sai → 202 `accepted`/`QUARANTINED`, row `is_quarantined=true`, audit có `reason='clock_skew_future'` và metadata không chứa `heart_rate|steps|battery`, list rỗng.
  - Chuyển chủ A→B: mẫu trong assignment A vẫn thuộc A; mẫu trước assignment đầu tiên và mẫu giữa hai assignment bị cách ly; mẫu trong B thuộc B; list của A/B không thấy mẫu cách ly hay mẫu của chủ kia.
- `apps/api/test/measurements.spec.ts` (+1 test): mẫu +10 phút bị cách ly; mẫu +90 giây (trong dung sai) được lưu không cách ly nhưng chưa được đọc; list/export chỉ có mẫu quá khứ; daily-summary hôm nay không có HR 200/bước 9999/pin 100, `lastSeenAt` không ở tương lai, coverage ≤ 100. Fixture assignment lùi 35 ngày để các test cũ gửi mẫu lịch sử vẫn nằm trong assignment (test cách ly có ca riêng).
- `apps/api/test/insights.spec.ts` (+1 test): mẫu cách ly + mẫu trong dung sai nhưng ở tương lai không vào xu hướng (`dataDays=0`, `totalSteps=0`, `avgHeartRate=null`, mọi ngày `hasData=false`, coverage 0). Fixture assignment lùi 35 ngày.

## Kiểm đã chạy (kết quả thật)

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --prefer-offline --frozen-lockfile` | exit 0, +711 packages |
| `pnpm --filter @annhien/contracts build` | exit 0 |
| `pnpm typecheck` (root: contracts, api, web, simulator) | exit 0, tất cả `Done` |
| `cd apps/api && pnpm test test/ingest.spec.ts` | **1 suite, 13/13 passed** |
| `cd apps/api && pnpm test test/measurements.spec.ts` | **1 suite, 9/9 passed** |
| `cd apps/api && pnpm test test/insights.spec.ts` | **1 suite, 8/8 passed** |
| `cd apps/api && pnpm test` (toàn bộ API) | **17 suites, 126/126 passed**, ~95 s |
| `cd apps/api && pnpm test test/{ingest,measurements,insights}.spec.ts` | **3 suites, 30/30 passed** |

Không chạy web/E2E/simulator thật (ngoài phạm vi worker này); chưa chạy API + PGlite thật.

## Quyết định

1. **202 + `is_quarantined=true` thay vì 422** cho `measured_at` tương lai quá dung sai và mẫu ngoài assignment:
   - Giữ được dedupe/idempotency (`message_id`, `boot_id+sequence`) và bằng chứng để điều tra thiết bị lệch giờ.
   - Thiết bị không retry vô hạn vì ack vẫn `accepted`; `code='QUARANTINED'` cho phép phân biệt mà không đổi status enum của contract.
   - 422 chỉ dùng cho payload sai hợp đồng (`synced + null`).
2. **Gán mẫu cũ cho assignment cũ** khi `measured_at` nằm trong một assignment đã đóng: đúng docs/03/04 (“gán bằng lịch sử assignment tại thời điểm xảy ra”), không chuyển dữ liệu sang chủ mới. Chỉ cách ly khi không xác định được assignment.
3. **Dung sai đồng hồ dùng chung một ngưỡng** `MAX_CLOCK_SKEW_SECONDS` cho cả cận trên (`measured_at > now`) và biên assignment; mặc định 120 s. Có thể đặt 0 nếu muốn chặt.
4. **Kẹp trần đọc về `now`** ở list/export/daily-summary/insights, kể cả khi client xin `to` ở tương lai; đây là thay đổi nhỏ duy nhất của `coverage.to` (giờ trả `min(to, now)` thay vì `to`).
5. **Audit `outcome='failed'`** cho mẫu cách ly để lọc được “protocol error”; metadata không chứa dữ liệu sức khỏe.
6. **Không thêm migration**: cột `is_quarantined` đã có từ trước; không đổi schema.
7. **Test cũ**: chỉ chỉnh fixture `createClaimedDevice` lùi `started_at` 35 ngày, không nới assertion. Lý do: các test cũ gửi mẫu lịch sử ngay sau claim; theo thiết kế mới đó đúng là “mẫu trước assignment” nên phải cách ly. Dữ liệu/assertion của test cũ giữ nguyên.

## Rủi ro / giới hạn

- **`GET /subjects/:id/status` vẫn có thể thấy mẫu cách ly trong nhánh này** vì `devices.service.ts` ngoài vùng được sửa. Worker `fix-last-telemetry` có spec lọc `is_quarantined=false` + `measured_at` (commit riêng); sau khi merge hai nhánh mới đủ yêu cầu “không xuất hiện status”. Đã **không** viết test status ở đây để tránh đỏ giả trước merge.
- **`assistant.service.ts` và `studio.service.ts` vẫn đọc telemetry không lọc `is_quarantined`** (ngoài phạm vi). Mẫu trước assignment bị cách ly lưu dưới assignment đang mở nên về lý thuyết có thể lọt vào tóm tắt AI/studio cho tới khi hai file đó lọc. Cần lead mở việc tiếp theo; đây là rò rỉ dữ liệu sức khỏe tiềm năng, không phải lỗi của worker này.
- Chưa có API/màn hình xem vùng cách ly (schema/UI ngoài phạm vi); hiện chỉ kiểm qua DB/audit.
- `uncertain` assignment có dung sai biên: mẫu ngay sau `ended_at` (≤ 120 s) được giữ với chủ cũ thay vì cách ly; mẫu ngay trước `started_at` (≤ 120 s) thuộc assignment mới. Đây là chủ ý để không mất dữ liệu do lệch đồng hồ nhỏ.
- Chưa cập nhật docs/04/08 và HTML (ngoài vùng); docs/04 hiện chưa mô tả `MAX_CLOCK_SKEW_SECONDS`/quy tắc cách ly cụ thể.

## File lead cần biết

1. `apps/api/src/ingest/telemetry-ingest.service.ts` — logic assignment/quarantine mới; `resolveAssignmentForMeasuredAt` là hàm thuần, có thể test trực tiếp.
2. `apps/api/src/ingest/ingest.controller.ts` — ack `accepted` có thể kèm `code='QUARANTINED'`; client/firmware chỉ nên coi `status` là quyết định.
3. `apps/api/src/config/env.ts` + `.env.example` — biến mới `MAX_CLOCK_SKEW_SECONDS` (0..3600, mặc định 120). Cần thêm vào `.env` thật/tài liệu vận hành nếu muốn khác mặc định.
4. `apps/api/src/measurements/{measurements.service.ts,insights.ts}` — filter `is_quarantined` + trần `now`.
5. `apps/api/test/{ingest,measurements,insights}.spec.ts` — fixture assignment lùi 35 ngày (không phải nới test).
6. Ngoài phạm vi cần follow-up: `assistant.service.ts`, `studio.service.ts` (lọc quarantine), `devices.service.ts` (worker khác), docs/04 + docs/08 (quy tắc mới).

## Chưa làm

- Chưa chạy API + PGlite thật/seed/e2e; chưa thử MQTT broker thật.
- Chưa thêm `excludedUnsyncedCount`/gap `clock_unsynced` cho daily-summary (spec giao worker sau; hiện giữ semantics cũ theo yêu cầu 4).
- Chưa có API/UI kiểm tra vùng cách ly; chưa xử lý retention cho bản ghi cách ly.
- Chưa sửa docs/HTML.

## Báo cáo ngắn

- **Commit:** `c1ebb630e04c7be6ba7ef67f653a50f424345c1b` (nhánh `fix-ingest-quarantine`).
- **Test:** 3 file 30/30 (ingest 13, measurements 9, insights 8); toàn bộ API 126/126; typecheck toàn repo sạch.
- **Quyết định:** 202 + `is_quarantined=true` + `code=QUARANTINED` (không dùng 422 cho lệch giờ); 422 chỉ cho `synced + measured_at=null`.
- **Việc lead cần nối:** merge cùng nhánh `fix-last-telemetry` để `status` lọc quarantine; mở việc cho `assistant.service.ts`/`studio.service.ts`; cập nhật docs/04, docs/08 và `.env` vận hành.
