# Handoff — fix vòng đời cảnh báo suspected → unconfirmed

- **Thời điểm:** 2026-11-15 07:28 (Asia/Ho_Chi_Minh, UTC+7)
- **Nhánh/worktree:** `fix-alert-lifecycle` (worktree riêng, không đụng API 3000 / web 5173 / `.data/pglite` của lead)
- **Nguồn finding:** `reports/qa/v2-data-integrity.md` P2-5 (suspected không bao giờ thành unconfirmed, bị ẩn khỏi hộp cảnh báo nhưng vẫn đếm) và `reports/qa/v2-product-gaps.md` P1-1 (ứng viên té ngã không có kết quả cuối bị ẩn hoàn toàn).
- **Chỉ đọc thêm:** `docs/03-kien-truc-he-thong.md` mục “Mạng, đồng hồ và dữ liệu cũ”, `docs/06-trai-nghiem-va-man-hinh.md` bảng “Trạng thái phải thiết kế”, `AGENTS.md`.

## 1. Đã làm (đúng phạm vi file được giao)

### Cấu hình

- `apps/api/src/config/env.ts`: thêm `SUSPECTED_TIMEOUT_MINUTES` — `z.coerce.number().int().min(1).max(120).default(10)`. Comment ghi rõ đây là chính sách demo **chưa chốt**.
- `.env.example`: thêm `SUSPECTED_TIMEOUT_MINUTES=10` kèm chú thích.

### `apps/api/src/incidents/**`

- `incidents.service.ts`:
  - `IncidentsService` implement `OnModuleInit`/`OnModuleDestroy`; job nền `setInterval(60_000)` gọi `expireSuspectedAlerts()`. **Không chặn request** (chạy ngoài request, `unref()` để không giữ tiến trình, clear khi shutdown). Tắt hoàn toàn khi `NODE_ENV=test`; test gọi thủ công.
  - `expireSuspectedAlerts(now?, limit = 200)`: chọn `state='suspected'` và `last_event_at <= now - SUSPECTED_TIMEOUT_MINUTES`, rồi **mỗi incident một transaction** `SELECT … FOR UPDATE` + đọc lại state/timeout, `UPDATE … WHERE state='suspected'` (khoá dòng + điều kiện state ⇒ idempotent, hai instance chạy song song không đổi hai lần), `version + 1`, `updated_at`, audit `incident.suspected_timeout` với `actorKind='system'`, metadata không chứa dữ liệu sức khỏe.
  - Mốc so sánh là `lastEventAt` (giờ nhận phía server), **không** dùng `detectedAt`, vì `measured_at` của thiết bị có thể trễ hoặc sai tương lai (đúng các finding P2-7/P1-1 của review dữ liệu).
  - `applyTransition` thêm nhánh cho `unconfirmed`:
    - `fall.confirmed`/`sos.confirmed` khi đang `unconfirmed` → `open` (kết quả cuối đến sau ngưỡng vẫn phải mở cảnh báo; nếu coi `unconfirmed` là terminal thì **mất một ca ngã đã xác nhận**, trái docs/03 “không âm thầm bỏ cảnh báo”).
    - `fall.cancelled`/`user.cancel_requested` khi đang `unconfirmed` → giữ nguyên, `applied=false`, `conflictReason='already_unconfirmed'`.
  - `listAlerts`/`getAlert` **không cần sửa logic**: `state=closed` đã gồm `unconfirmed`; detail chỉ 404 với `suspected`. Chỉ cập nhật comment cho rõ.
  - **Không ghi `incident_events`**: enum `incident_event_type` không có loại timeout, thêm sẽ phải migration ⇒ dấu vết nằm ở `audit_logs` (`incident.suspected_timeout`). **Không phát SSE** và **không tạo outbox** cho `unconfirmed`: đây là bản ghi “thiếu kết quả cuối”, không phải cảnh báo mới cần xác nhận — tránh đánh thức người thân như cảnh báo khẩn.

### `apps/web/src/features/alerts`

- `AlertsPage.tsx` (chỉ nhãn/trạng thái): dòng `unconfirmed` có thêm ghi chú “· thiết bị không gửi kết quả cuối”; empty state tab “Đã đóng” nói rõ có cả cảnh báo chưa xác định. Nhãn “Chưa xác định” đã có sẵn trong `ALERT_STATE_LABELS` (hiển thị qua `StatusPill`) nên không sửa labels.

### Test

- `apps/api/test/incidents.spec.ts` thêm T13–T18:
  - **T13** suspected cũ → `unconfirmed`; `state=closed` có, `state=open` không; detail 200 (không 404); chỉ 1 `incident_events` (không bịa event); 0 realtime/0 outbox; đúng 1 audit `system`; quét lại `{scanned:0, transitioned:0}`, version không tăng.
  - **T14** suspected mới → vẫn `suspected`, không thấy ở list/detail (404), không realtime; `isSweepScheduled()=false`, ngưỡng 10 phút.
  - **T15** incident `acknowledged`/`resolved`/`cancelled` đã cũ: quét không đổi state/version.
  - **T16** permission giữ nguyên: owner + caregiver `canReceiveAlerts` xem được closed/detail; caregiver có link nhưng thiếu `canReceiveAlerts` → 403; người ngoài/admin không link → 404; ack/resolve trên `unconfirmed` → 409, state không đổi.
  - **T17** `fall.confirmed` đến sau khi đã `unconfirmed` → mở lại `open` (v3), có outbox `:alert` cho owner + caregiver.
  - **T18** `SUSPECTED_TIMEOUT_MINUTES` = 121 và 0 bị từ chối; 30 được nhận.
- `apps/web/src/features/alerts/AlertsPage.test.tsx` thêm 1 test: tab “Đã đóng” hiện “Chưa xác định”, ghi chú “thiết bị không gửi kết quả cuối”, link Chi tiết đúng, không có nút “Xác nhận”.

## 2. Kiểm đã chạy (kết quả thật của phiên này)

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --prefer-offline --frozen-lockfile` | 711 package, exit 0 |
| `pnpm --filter @annhien/contracts build` | exit 0 |
| `cd apps/api && jest --runInBand test/incidents.spec.ts` | **1 suite / 18 test pass** (17,1 s) |
| `cd apps/api && jest --runInBand` (toàn bộ) | **14 suite / 106 test pass** (150,4 s) |
| `pnpm --filter @annhien/web test` | **20 file / 74 test pass** (12,3 s; trước thay đổi là 73) |
| `pnpm -r typecheck` | contracts, web, api, simulator đều `Done` |
| `pnpm --filter @annhien/api build` | `nest build` exit 0 |

### Smoke test thật (job định kỳ, không chỉ gọi hàm)

DB PGlite tạm `.data/fixlifecycle-smoke` (đã xoá sau khi kiểm), `PORT=3311`, `NODE_ENV=development`, `SUSPECTED_TIMEOUT_MINUTES=1`:

1. Login owner demo 200; `POST /ingest/events` `fall.candidate` → 202, `incidentId=b57778ef-…`.
2. Ngay sau đó (`00:20:24Z`): `state=open` chỉ có incident seed, `state=closed` không có incident này, `GET /alerts/<id>` → **404** (đúng trước timeout).
3. Không làm gì thêm, chỉ chờ job nền. Lúc `00:22:34Z` (sau 2 vòng quét 60 s): `state=closed` trả incident với `state:"unconfirmed"`, `version:2`, `detectedAt=00:20:20.562Z`, `lastEventAt=00:20:20.619Z`; `GET /alerts/<id>` → **200**.
4. `GET /subjects/.../daily-summary?date=2026-11-15` → `incidents: {total: 2, resolved: 0}` (1 open seed + 1 unconfirmed) — khớp tập alert nhìn thấy: 1 open + 1 closed.

## 3. Dashboard/summary — phần lead cần nối (ngoài file được giao)

1. `apps/api/src/measurements/measurements.service.ts:183-211` — `daily-summary.incidents` chỉ có `{total, resolved}` và **đếm mọi state**, gồm cả `suspected` chưa quá hạn. Sau fix này, mismatch còn lại chỉ là incident `suspected` trẻ hơn ngưỡng (≤ `SUSPECTED_TIMEOUT_MINUTES`, mặc định 10 phút) và incident có `detectedAt` rơi sang ngày khác. Đề xuất của review (tách `suspected/unconfirmed` khỏi “đã đóng”, thêm banner) cần sửa file này ⇒ **lead quyết định**; tôi không sửa vì ngoài phạm vi.
2. `apps/web/src/features/dashboard/DashboardPage.tsx:253` — “Cảnh báo hôm nay: {total} (đã đóng {resolved})”: `resolved` **không** gồm `unconfirmed`/`cancelled`, nên sau fix, một ứng viên chưa xác định vẫn hiện trong “hôm nay” nhưng không nằm trong số “đã đóng”. Cần lead chốt câu chữ/ý nghĩa con số (file ngoài phạm vi được sửa).
3. `docs/03`, `docs/06` đã mô tả hành vi “Chưa xác định” nhưng chưa có tham số; lead nên bổ sung `SUSPECTED_TIMEOUT_MINUTES` (mặc định 10, khoảng 1..120) vào bảng tham số demo và ghi là **chưa chốt**.

## 4. Impact map (đã rà theo yêu cầu AGENTS.md)

| Đường ảnh hưởng | Trạng thái |
| --- | --- |
| Ingest → transition | Thêm nhánh `unconfirmed` cho confirmed/cancelled/user.cancel_requested (T17 chứng minh không mất ca confirmed muộn) |
| List `state=open`/`closed` | Không đổi code; `unconfirmed` chỉ xuất hiện ở `closed` (T13/T16) |
| Detail | Không đổi code; `unconfirmed` 200, `suspected` vẫn 404 (T13/T14) |
| Ack/resolve | Không đổi code; `unconfirmed` → 409, không đổi state (T16) |
| SSE `alert.updated` | Vẫn chỉ phát khi state ≠ `suspected`; sweep không phát gì (T13 kiểm `realtime_events` = 0) |
| Notification outbox | Sweep không tạo/huỷ outbox (T13); confirmed muộn mới tạo (T17) |
| Audit | Thêm action `incident.suspected_timeout` (text column, **không cần migration**) |
| API `/admin/audit`, export CSV, AI summary | Không đọc state `unconfirmed` theo cách riêng; daily-summary xem mục 3 |
| Quyền | Không đổi (`receive_alerts`, owner) — T16 |
| Firmware/simulator | Không đổi; thiết bị chỉ gửi event như cũ |

## 5. Quyết định cần lead/giảng viên chốt

1. **Ngưỡng 10 phút** (`SUSPECTED_TIMEOUT_MINUTES`) — chính sách demo, docs chưa có số. Cần chốt có tính thêm “cửa sổ huỷ 20 s” của thiết bị hay không.
2. **`unconfirmed` → `open` khi confirmed đến muộn**: tôi chọn mở lại để không âm thầm bỏ ca ngã đã xác nhận. Nếu lead muốn `unconfirmed` là trạng thái đóng vĩnh viễn thì phải bổ sung đường cảnh báo riêng cho confirmed muộn, **không được bỏ im lặng**.
3. **Không phát SSE/outbox cho `unconfirmed`**: nếu muốn banner “có ứng viên chưa xác định” như P1-1 đề xuất thì cần contract + UI riêng (ngoài phạm vi phiên này).
4. `AlertDetailPage.tsx:350` hiển thị `conflictReason` thô; giá trị mới `already_unconfirmed` sẽ hiện nguyên chuỗi. Muốn nhãn tiếng Việt thì sửa `apps/web/src/features/alerts/AlertDetailPage.tsx` (ngoài phạm vi).
5. Hiệu năng: query quét dùng index hiện có `(subject_id, state, detected_at)`, chưa có index riêng cho `state + last_event_at`; với dữ liệu demo thì ổn, nếu dữ liệu lớn cần partial index (⇒ migration, ngoài phạm vi “tránh migration”).

## 6. File đã sửa

- `.env.example`
- `apps/api/src/config/env.ts`
- `apps/api/src/incidents/incidents.service.ts`
- `apps/api/test/incidents.spec.ts`
- `apps/web/src/features/alerts/AlertsPage.tsx`
- `apps/web/src/features/alerts/AlertsPage.test.tsx`
- `reports/handoffs/v2-fix-alert-lifecycle.md` (file này)

Không sửa: `app.module.ts`, `DashboardPage.tsx`, `measurements/**`, weekly worker, schema/migration, contracts, docs.

## 7. Việc còn lại

- Lead nối `IncidentsModule` hiện có (không cần sửa `app.module.ts` — job tự chạy qua lifecycle hook); thêm test tích hợp `createTestApp()` trên AppModule nếu muốn chắc guard 1 lớp.
- Cập nhật dashboard/summary + docs theo mục 3 và chốt các quyết định ở mục 5.
