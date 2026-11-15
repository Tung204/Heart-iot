# Review độc lập v2 — tính toàn vẹn dữ liệu

**Ngày:** 15/11/2026 · **Reviewer:** phiên review độc lập (dispatched worker) · **Vai trò:** chỉ đọc code, chạy thử trên DB/API riêng, không sửa code/docs.

## 1. HEAD, môi trường, phạm vi

| Mục | Giá trị |
| --- | --- |
| HEAD | `8434d66cb8ecb3d92a9a054f87f843d16dbaa3e7` (v1.1) — worktree `C:/Users/nguye/orca/workspaces/DATN/qa-data-integrity` |
| 3 commit gần nhất | `8434d66 perf(web): tách chunk theo route…`, `1080c5c docs: ghi worklog…`, `d4ba436 feat(web): hoàn thiện giao diện…` |
| OS/runtime | Windows 11, Node `v24.22.2`, pnpm 12 workspace; PGlite `0.5.16`; NestJS 11.2.10 |
| Dependency | `pnpm install --prefer-offline --frozen-lockfile` (711 package), `packages/contracts` build bằng `pnpm build` |
| DB review | `.data/review-fresh` (PGlite, gitignored) + API `PORT=3278`; trước đó `.data/review-integrity` + `PORT=3277` (bị hỏng khi hai tiến trình cùng mở — xem P2-8) |
| Chế độ chạy | `NODE_ENV=test` để tắt worker outbox khi cần quan sát trạng thái trung gian; `NODE_ENV=development` để worker gửi thông báo |
| Không đụng | API 3000, web 5173, `.data/pglite` của lead; không commit |
| Công cụ đọc DB | script PGlite read-only ngoài repo (import tuyệt đối `apps/api/node_modules/@electric-sql/pglite/dist/index.js`) — chỉ mở DB sau khi dừng API |
| Migration/seed | `PGLITE_DATA_DIR=.data/review-fresh pnpm db:migrate` → `pnpm seed` (2 lần) |

**Thiết lập dữ liệu thử:** DB review-fresh = seed demo (policy seed 300 s, 1681 telemetry, 3 incident, 2 outbox) + các hồ sơ/thiết bị tạo qua API. DB review-integrity dùng policy mặc định (`heartbeatIntervalSeconds=15`, `offlineAfterSeconds=45`, `dataFreshAfterSeconds=30`, `lateEventMinutes=5`) để kiểm coverage/late; dữ liệu ở đó là bằng chứng cho P1-1…P1-4, P2-3, P2-4, P2-6, P2-7. Mọi con số dưới đây là output thật của lần chạy này.

## 2. Tóm tắt finding

| # | Mức | Nội dung ngắn | Trạng thái |
| --- | --- | --- | --- |
| P1-1 | P1 | Telemetry `measured_at` ở tương lai được nhận; daily-summary/thiết bị tính cả mẫu tương lai, lịch sử thì không — số liệu sai im lặng | Mới |
| P1-2 | P1 | Telemetry đo **trước** assignment hiện tại (claim lần đầu hoặc chuyển chủ) bị gán cho chủ mới; không có vùng cách ly | Mới (code comment đã ghi R-02/R-03 mở, nhưng đây là vi phạm FR-03 có bằng chứng) |
| P1-3 | P1 | `steps.completeness = 'complete'` dù bỏ toàn bộ delta bắc qua nửa đêm/đoạn mất dữ liệu → thiếu bước mà không báo | Mới |
| P1-4 | P1 | “Nhịp tim gần nhất”/pin của thiết bị lấy theo `received_at`; mẫu đến trễ làm hiển thị số cũ và `freshness='stale'` dù có mẫu mới hơn | Mới |
| P2-1 | P2 | Ranh giới chia sẻ không nhất quán: alert history + số incident trong daily-summary vượt `shared_from`/`historyDays`; notification vẫn đọc/đánh dấu đã đọc sau khi bị thu hồi | Mới |
| P2-2 | P2 | Export CSV 403 với caregiver vừa accept (UI gửi `from=now-24h`, chỉ kẹp theo `historyDays`), trong khi measurements âm thầm kẹp theo `shared_from` | Mới (liên quan P2 cũ “requireHistory”) |
| P2-3 | P2 | Daily summary bỏ hẳn snapshot `clock_status=unsynced` (không có `excludedUnsyncedCount`), gap bị gắn `no_data` thay vì `clock_unsynced`; ingest nhận `synced + measured_at=null` | Mới |
| P2-4 | P2 | Đọc lại notification ghi đè `read_at` (mất mốc đọc lần đầu) | Mới |
| P2-5 | P2 | Incident `suspected` không bao giờ thành `unconfirmed`; bị ẩn khỏi hộp cảnh báo nhưng vẫn đếm trong “Cảnh báo hôm nay” | Mới |
| P2-6 | P2 | Timezone DST lúc nửa đêm (America/Havana) tính sai cửa sổ ngày 1 giờ; New York đúng | Mới |
| P2-7 | P2 | Seed tạo notification `sent_at < created_at`; seed lần 2 báo `devices: 0` dù thiết bị tồn tại | Mới (dữ liệu demo) |
| P2-8 | P2 | PGlite không có khóa/guard: hai tiến trình API cùng `PGLITE_DATA_DIR` làm DB không mở lại được | Quan sát vận hành trong phiên này |

Không có P0 trong phạm vi đã kiểm.

## 3. Phần đã kiểm và kết quả

### 3.1 Di trú, seed, khởi động lại

| Kịch bản | Lệnh | Expected | Actual | Kết luận |
| --- | --- | --- | --- | --- |
| Migration từ DB rỗng | `PGLITE_DATA_DIR=.data/review-fresh pnpm db:migrate` rồi đếm `information_schema.tables` | Đủ bảng, không lỗi | 23 bảng public | Đạt |
| Seed chạy 2 lần | `pnpm seed` ×2 rồi `select count(*)` | Không nhân bản | Lần 1: telemetry 1681/incident 3/outbox 2/task 2. Lần 2: `telemetry: 1681`, `incidents: 0`, `tasks: 0`, `outbox: 0`; DB sau đó vẫn `telemetry=1681, incidents=3, events=7, outbox=2, tasks=2, policy=1` | Đạt (idempotent) |
| Restart PGlite | dừng API, mở lại bằng `node dist/src/main.js` cùng `PGLITE_DATA_DIR` | Dữ liệu còn | Thông báo/telemetry tạo trước khi restart vẫn đọc được qua API | Đạt |
| `taskkill /F` rồi mở lại DB sạch | kill API đang chạy trên review-fresh, mở bằng script PGlite | Không hỏng dữ liệu | `select count(*) from telemetry` = 1681 | Đạt (crash đơn tiến trình phục hồi được) |
| Hai tiến trình cùng DB | xem P2-8 | Không có hành vi xác định | DB abort khi mở lại (kể cả bản copy) | Không đạt (xem P2-8) |

### 3.2 Telemetry: trùng, xung đột, thời gian

| Kịch bản | Expected | Actual | Kết luận |
| --- | --- | --- | --- |
| Gửi lặp cùng `message_id`, cùng payload | `duplicate`, 1 dòng | 202 `duplicate`; DB 1 dòng | Đạt |
| Cùng `message_id`, payload khác | 409, không ghi đè | 409 `CONFLICT` | Đạt |
| Cùng `(boot_id, sequence)`, message khác | 409 protocol conflict | 409 `CONFLICT` | Đạt |
| 4 request song song cùng event mới | 1 accepted + duplicate, không 500 | 1 accepted, 3 duplicate | Đạt |
| `clock_status=unsynced` + `measured_at` khác null | 422 | 422 `VALIDATION_FAILED` | Đạt |
| `clock_status=synced` + `measured_at=null` | Nên từ chối (hợp đồng: chỉ unsynced mới null) | **202 accepted** | Không đạt — P2-3 |
| Mẫu đến trễ (measured 10–20 phút trước) | `is_late=true`, giữ giờ gốc | `is_late=true`, CSV/DB đúng giờ gốc | Đạt |
| Mẫu `measured_at` tương lai (+3 h) | Từ chối/cách ly/cờ lỗi | **202 accepted**, vào daily-summary và device status | Không đạt — P1-1 |
| Thiết bị chưa claim | `rejected DEVICE_NOT_CLAIMED`, không ghi | 202 `rejected DEVICE_NOT_CLAIMED`; không lưu bản tin; không có bảng cách ly | Đạt một phần — xem P1-2 |

### 3.3 Daily summary / coverage / CSV

Đối chiếu API ↔ DB trên 3 ngày seed đầy đủ (script SQL độc lập, cùng thuật toán steps):

| Ngày (Asia/Ho_Chi_Minh) | API obs/expected/pct | API HR (avg/min/max/valid) | API steps | lastSeenAt | pin | gaps | DB (độc lập) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-11 | 288/288/100% | 69,3 / 59 / 77 / 266 | 856 | 2026-11-11T16:57:41.264Z | 75 | 0 | 288 dòng, 266 valid, avg 69,3, steps 856, pin 75, 0 gap |
| 2026-11-12 | 264/288/91,7% | 67,9 / 59 / 77 / 243 | 790 | 2026-11-12T16:57:41.264Z | 75 | 1 | 264 dòng, 243 valid, steps 790, 1 gap (21:57:41Z→00:02:41Z) |
| 2026-11-13 | 288/288/100% | 66,9 / 59 / 77 / 265 | 876 | 2026-11-13T16:57:41.264Z | 75 | 0 | 288 dòng, 265 valid, steps 876 |

→ Phép tính coverage/HR/steps/pin/gap của daily-summary khớp DB trên dữ liệu đều đặn. Các lỗi nằm ở biên (P1-1, P1-3, P2-3).

| Kịch bản khác | Expected | Actual | Kết luận |
| --- | --- | --- | --- |
| Ngày rỗng (2026-11-08) | `steps.unavailable`, HR null, coverage 0, 1 gap `no_data`, pin null | Đúng như expected | Đạt |
| CSV header/BOM/`is_late`/`is_synthetic` | Header `CSV_HEADER`, BOM, cờ đúng | Đúng; dòng seed `source=simulator`, `is_synthetic=true`; CSV cửa sổ 17:00Z→now có 3 dòng khớp 3 item measurements | Đạt |
| 6 snapshot unsynced trong ngày | Gap lý do `clock_unsynced`, summary cho biết có mẫu bị loại | Summary: obs 1, gap `no_data`, không có trường đếm mẫu bị loại; CSV có 6 dòng `measured_at` rỗng, trong đó 1 dòng `clock_status=synced` | Không đạt — P2-3 |
| Steps bắc qua nửa đêm + đoạn mất dữ liệu | Đánh dấu chưa đủ dữ liệu (docs/04) | `steps.total=50, completeness='complete', notes=[]` trong khi 200 bước (23:50→00:05) và 4000 bước (23:00→02:00) bị bỏ | Không đạt — P1-3 |
| Ngày có mẫu tương lai | Không tính vào “hôm nay” | xem P1-1 | Không đạt — P1-1 |

### 3.4 Incident / revision / ack / resolve / outbox

| Kịch bản | Expected | Actual | Kết luận |
| --- | --- | --- | --- |
| `fall.confirmed` (rev2) mở incident; rev1 candidate đến sau cùng nội dung | Lưu lịch sử, không lùi trạng thái, ack accepted | accepted, `acceptedRevision=2`, state `open` | Đạt |
| Rev2 lặp cùng nội dung (message_id khác) | `duplicate` | `duplicate` | Đạt |
| Rev2 khác payload | rejected CONFLICT + audit | rejected `CONFLICT` | Đạt |
| Rev3 `fall.cancelled` khi đã confirmed | Lưu `applied=false`, không đóng | `applied=false`, `already_confirmed`, state `open` | Đạt |
| Rev4 confirmed sau đó | Không hạ cấp; ack accepted | accepted rev4, state `open` | Đạt |
| `user.cancel_requested` sau confirmed | `resolved` với reason/outcome, outbox cập nhật, alert chưa gửi bị supersede | resolved “Thiết bị yêu cầu hủy sau khi đã xác nhận”/`cancelled_by_user`; DB: alert rev2 `superseded`, update rev3 `pending` | Đạt |
| Hai ack song song cùng `expectedVersion=2` | 1 áp dụng, 1 409, giữ cả 2 vết | owner 200 → `acknowledged` v3; cg2 409; detail có 2 `alert_actions` (applied + conflict) và `acknowledgedBy` | Đạt |
| Resolve lặp `expectedVersion` cũ | 409 kèm `currentVersion` | 409 `currentVersion=4` | Đạt |
| Caregiver không có `canResolve` resolve | 403 | 403 | Đạt |
| Outbox sau resolve | Alert cũ `superseded`, update mới gửi | DB: rev2 alert + rev3 update `superseded`, rev4 update `pending`; sau khi chạy worker → `sent` | Đạt |
| Notification read/unread | 204, giảm unread | 204, unread 4→3 | Đạt một phần (read lại ghi đè — P2-4) |
| SSE khi thu hồi chia sẻ | `event: revoked` rồi đóng; REST 404 | Nhận `event: revoked`, sau đó alerts/measurements = 404 | Đạt |
| Claim song song 2 chủ | 1 thắng, chủ kia không claim được | f-an 201; f-minh 422 “mã không hợp lệ hoặc hết hạn” | Đạt (mã lỗi 422 thay vì 409 — chấp nhận được) |

### 3.5 Share boundary / người thân mới accept

Thực hiện: incident SOS được tạo 30 phút **trước** khi caregiver accept (`sharedFrom=2026-11-14T23:57:33.072Z`), quyền `historyDays=1`.

| Kịch bản | Expected | Actual | Kết luận |
| --- | --- | --- | --- |
| Caregiver đọc alert tạo trước `shared_from` | 403/không thấy | 200, thấy `detectedAt=23:27:24.914Z`; detail 200 | Không đạt — P2-1 |
| Caregiver `historyDays=1` đọc alert 5 ngày trước | Không thấy | 200, alert 5 ngày trước xuất hiện trong danh sách open | Không đạt — P2-1 |
| Daily-summary ngày trước mốc chia sẻ | 403 | 403 “Ngày yêu cầu nằm trước mốc chia sẻ” | Đạt |
| Daily-summary ngày hôm nay (một phần trước share) | Incident trước share không bị đếm | `incidents.total=1` (incident 23:27) trong khi cửa sổ dữ liệu bắt đầu 23:57 | Không đạt — P2-1 |
| Measurements mặc định của caregiver mới | 200, kẹp theo mốc share | 200, `coverage.from=23:57:33`, 0 item | Đạt (kẹp mềm) |
| Export CSV mặc định của caregiver mới | Không lỗi, hoặc thông báo rõ | 403 khi `from=now-24h` **và** khi `from=now-30min` | Không đạt — P2-2 |
| Notification sau khi bị thu hồi | Không còn đọc dữ liệu hồ sơ | GET 200 (subjectName, incidentType/state), POST read 204 | Không đạt — P2-1 |

### 3.6 Timezone/DST

| Kịch bản | Expected | Actual | Kết luận |
| --- | --- | --- | --- |
| America/New_York 2026-03-08 (mất 1 giờ) | 05:00Z→04:00Z hôm sau, expectedCount 5520 | Đúng (5520, obs 3) | Đạt |
| America/New_York 2026-11-01 (lặp 1 giờ) | 04:00Z→05:00Z hôm sau, expectedCount 6000 | Đúng (6000, obs 4) | Đạt |
| America/Havana 2026-03-07 | 05:00Z→05:00Z hôm sau (24 h) | **05:00Z→04:00Z** (23 h, mất múi 23:00–24:00 local) | Không đạt — P2-6 |
| America/Havana 2026-03-08 (DST lúc 00:00) | 05:00Z→04:00Z hôm sau (23 h, 5520) | **04:00Z→04:00Z hôm sau** (24 h, 5760); mẫu local 07/03 23:30 (04:30Z) bị tính vào ngày 08/03 | Không đạt — P2-6 |

## 4. Findings chi tiết

### P1-1 — `measured_at` tương lai được nhận và làm sai daily-summary/trạng thái thiết bị

**Nguồn:** `apps/api/src/ingest/telemetry-ingest.service.ts:63-66` (chỉ tính `isLate` theo cận dưới, không kiểm `measured_at > received_at`), `:110-135` (ghi thẳng); `apps/api/src/measurements/measurements.service.ts:165-177` (dailySummary dùng `to` = cuối ngày dù `coverageTo` = now), `:204-206`; `apps/api/src/devices/devices.service.ts:321-334`; `apps/api/src/devices/device-status.ts:34-45`.
Hợp đồng: docs/03 “Chưa đồng bộ giờ… không lấy giờ nhận làm giờ đo thật”; docs/04 `measured_at` chỉ có nghĩa khi `clock_status=synced` (thiết bị có đồng hồ tin cậy). Không có quy tắc cho mẫu vượt giờ nhận.

**Tái hiện** (DB review-integrity, policy 15 s; subject `4a7860e5-…`, thiết bị `07d235d7-…`):

```bash
# 3 mẫu bình thường: 23:35:58Z (HR50), 23:45:58Z (HR55), 23:54:58Z (HR70, steps100)
# sau đó 1 mẫu tương lai +3h:
{"message_id":"t4-f1","sequence":4,"measured_at":"2026-11-15T02:56:11.918Z",
 "clock_status":"synced","metrics":{"heart_rate_bpm":200,"steps_since_boot":9999},
 "battery_percent":100, ...}
curl -s -H "x-device-id: $DEV" -H "x-device-key: $KEY" -d @body.json $API/ingest/telemetry
# → 202 accepted
```

**Expected:** 422/202 rejected hoặc lưu kèm cờ “giờ không tin cậy” và **không** đưa vào tổng hợp “hôm nay”.
**Actual:**
- `GET /subjects/:id/daily-summary?date=2026-11-15`: `heartRate {avg:93.8, min:50, max:200, validSamples:4}`, `steps.total=9939, completeness='complete'`, `lastSeenAt=2026-11-15T02:56:11.918Z`, `batteryPercent=100`, `coverage.to=23:56:12Z` nhưng `observedCount=4`, gap cuối `23:54:58Z → 02:56:11Z (no_data)`.
- Cùng ngày, `GET /subjects/:id/measurements?from=…&to=<now>`: chỉ 3 item (HR cuối 70, steps 100) — **hai API cùng ngày nói hai sự thật khác nhau**.
- `GET /subjects/:id/status`: `freshness='live'`, `lastHeartRateBpm=200`, `lastMeasuredAt=02:56Z`, `batteryPercent=100`.
- Caregiver vừa accept (không được xem dữ liệu trước `shared_from`): `daily-summary` trả `coverage {from:23:57:33Z, to:23:57:40Z, observedCount:1, expectedCount:1, percent:100}`, `lastSeenAt` = mẫu tương lai, trong khi `measurements` trả 0 item. Đây là “summary khi mới accept” bị sai, đúng trọng tâm kiểm.

**Hệ quả:** số bước/nhịp tim/pin của “hôm nay” bị một mẫu lỗi đồng hồ chi phối; UI hiển thị độ phủ 100% và “dữ liệu mới nhất” ở tương lai; cảnh báo `stale/live` sai. Không có log/audit nào đánh dấu mẫu bất thường.

**Đề xuất:** (a) validate `measured_at ≤ received_at + skew` (cấu hình được trong policy, ví dụ 60 s) → 422 hoặc lưu `is_quarantined=true` + audit protocol error; (b) daily-summary chỉ tính `measured_at < min(to, now)`, hoặc trả thêm cảnh báo “có mẫu ngoài khoảng tin cậy”; (c) thêm test biên cho mẫu tương lai và cho summary-when-newly-accepted.

### P1-2 — Telemetry trước assignment bị gán cho chủ mới; không có vùng cách ly

**Nguồn:** `apps/api/src/ingest/telemetry-ingest.service.ts:52` (`findOpenAssignment` theo thời điểm nhận), `:200-208`; `:131` luôn `isQuarantined:false`; schema chỉ có cờ `is_quarantined` (`apps/api/src/database/schema.ts`, bảng `telemetry`) — không có bảng/API cách ly; `applyTransition`/`gap` có `quarantined` nhưng không đường nào tạo ra.
Hợp đồng: docs/02 FR-03 “không chuyển dữ liệu cũ sang hồ sơ mới khi đổi chủ”; docs/03 bảng “Chuyển thiết bị sang hồ sơ khác … không chắc thời gian thì cách ly để kiểm tra”; docs/04 “Khi không đủ bằng chứng để gán dữ liệu vào lịch sử assignment, giữ bản tin ở vùng cách ly; không tự gán vào chủ hiện tại”.

**Tái hiện** (DB review-fresh): tạo thiết bị `TRANSFER-01`, claim cho hồ sơ An (assignment A bắt đầu `2026-11-15T00:04:16.306Z`, kết thúc `.762Z`), release, cấp claim code mới, Minh claim cho hồ sơ Bình (assignment B bắt đầu `00:04:17.084Z`), rồi gửi telemetry có `measured_at=2026-11-14T22:34:25.922Z` (trước cả hai assignment).

**Expected (docs):** bản tin bị cách ly/đánh dấu cần kiểm, không vào lịch sử hồ sơ Bình.
**Actual:** 202 `accepted`; DB `telemetry` dòng `tr-late-pre-transfer` có `assignment_id` = assignment B, `subject_id` = Bình, `is_late=true`; `GET /subjects/<Bình>/measurements` trả HR 81 @22:34Z; `daily-summary` của Bình `observedCount=1`, HR 81; `GET /subjects/<Bình>/status` HR 81, pin 64. Ngược lại lịch sử của An (chủ cũ) không có mẫu đó.
Đáng chú ý: cả bản tin đầu tiên `tr-before` (measured `23:04:16.517Z`) cũng được gán cho A dù A chỉ được claim lúc `00:04:16.306Z` — lỗi xảy ra ngay ở lần claim đầu, không chỉ khi chuyển chủ.
DB kiểm chứng: `select count(*) from telemetry where is_quarantined` = **0**; `incidents.state='unconfirmed'` = **0**.

**Hệ quả:** dữ liệu sức khỏe của chủ cũ hiển thị cho chủ mới (và ngược lại mất dữ liệu), đúng loại lỗi FR-03 muốn chặn. Code đã ghi R-02/R-03 là việc mở; review này bổ sung bằng chứng runtime và mức độ vi phạm tiêu chí chấp nhận.

**Đề xuất:** so `measured_at` với `assignment.startedAt` (và dùng `endedAt` của assignment trước nếu có) trước khi gán; lệch/không chắc → lưu `is_quarantined=true` + audit + không trả trong measurements/daily-summary; thêm màn hình/API kiểm tra cách ly; test T-03 (docs/08) chạy thật.

### P1-3 — `steps.completeness='complete'` che việc mất delta bắc ngày/đoạn dữ liệu

**Nguồn:** `apps/api/src/measurements/measurements.service.ts:457-490` (`computeSteps`: mẫu đầu tiên của mỗi boot trong ngày bị bỏ làm mốc, không ghi note; chỉ `partial` khi delta âm), `:167-177` (chỉ lấy mẫu trong ngày), `:204`.
Hợp đồng: docs/04 — “Lần nhận đầu của boot sau một đoạn mất dữ liệu có thể không phân bổ chính xác theo ngày; **đánh dấu chưa đủ dữ liệu** thay vì cộng toàn bộ vào ngày nhận”; docs/06 trạng thái “chưa đủ dữ liệu”.

**Tái hiện** (DB review-integrity, subject review):
- boot `boot-day-a`: `2026-11-09T16:50Z steps=1000` (local 23:50 09/11), `17:05Z steps=1200`, `17:10Z steps=1250`.
- boot `boot-day-b`: `16:00Z steps=1000` (local 23:00 09/11), `19:00Z steps=5000` (local 02:00 10/11).
`GET /subjects/:id/daily-summary?date=2026-11-10` →

**Expected:** `completeness='partial'` kèm note (không phân bổ được 200 bước 23:50→00:05 và 4000 bước 23:00→02:00), hoặc ít nhất không khẳng định “đủ dữ liệu”.
**Actual:** `steps {total:50, completeness:'complete', notes:[]}` — mất tới ~4200 bước trong ngày mà UI hiển thị “đủ dữ liệu” (`apps/web/src/features/dashboard/DashboardPage.tsx:225-231`).

**Hệ quả:** mọi ngày có boot kéo dài qua nửa đêm hoặc có đoạn mất dữ liệu qua đêm đều bị undercount im lặng. Seed demo che lỗi vì tạo boot mới mỗi ngày và counter reset về 0 ngay tại mốc boot (mẫu đầu boot ≈ 0–12 bước).

**Đề xuất:** đánh dấu `partial` + note khi (a) mẫu đầu tiên của boot trong ngày > 0, (b) khoảng trước mẫu đầu tiên trong ngày vượt ngưỡng, (c) có gap bên trong ngày vắt qua mốc ngày; hoặc trả thêm `steps.attributionUnknown`. Thêm test T-04 với dữ liệu bắc nửa đêm.

### P1-4 — “Nhịp tim gần nhất”/pin của thiết bị lấy mẫu theo `received_at`, không theo `measured_at`

**Nguồn:** `apps/api/src/devices/devices.service.ts:321-334` — `loadLastTelemetry` `orderBy(desc(telemetry.receivedAt))`; `apps/api/src/devices/device-status.ts:28-51` — `freshness`/`lastMeasuredAt`/HR/pin lấy từ dòng đó.
UI: `apps/web/src/features/dashboard/DashboardPage.tsx:289-300` (“Nhịp tim gần nhất”, “lần nhận cuối”) và `:255-256` (“dữ liệu mới nhất” từ daily-summary) — hai nguồn khác nhau trên cùng màn hình.

**Tái hiện:** gửi mẫu mới `23:54:58Z` (HR70, pin80) rồi gửi mẫu cũ đến trễ `23:35:58Z` (HR50, pin20) — cả hai `accepted`.
**Expected (docs/06 “Nhịp tim mới nhất”, “thời điểm đo cuối hợp lệ”; docs/03 “sự kiện đến muộn… không tự khẳng định nguy cơ đang diễn ra”):** thiết bị hiển thị HR70/pin80/`lastMeasuredAt=23:54:58Z`, freshness tính theo mẫu mới nhất.
**Actual:** `GET /subjects/:id/status` → `lastHeartRateBpm=50`, `batteryPercent=20`, `lastMeasuredAt=23:35:58.993Z`, `freshness='stale'`; trong khi `daily-summary` cùng thời điểm → `lastSeenAt=23:54:58.993Z`, `batteryPercent=80`. Trên dashboard, thẻ “Nhịp tim gần nhất” hiện 50 bpm và “dữ liệu mới nhất” hiện 1 phút trước — mâu thuẫn trực tiếp.

**Hệ quả:** người chăm sóc thấy nhịp tim/pin cũ hơn thực tế và có thể bị báo “dữ liệu cũ” sai; ngược lại nếu mẫu đến trễ mang giá trị bất thường thì nó sẽ thay thế giá trị mới (nguy cơ hiểu sai tình trạng).
**Đề xuất:** chọn dòng theo `measured_at desc, received_at desc` (ưu tiên giờ đo, tie-break giờ nhận), tính `freshness` theo cùng dòng; hiển thị cả “nhận lúc” nếu `is_late`; test T-04/FR-04.

### P2-1 — Ranh giới chia sẻ không nhất quán giữa alerts / summary / notifications

**Nguồn:** `apps/api/src/incidents/incidents.service.ts:639-672` (`listAlerts` chỉ kiểm `requireSubject` + `receive_alerts`, **không** dùng `sharedFrom/historyDays`), `:689-712` (`loadVisibleIncident` cho detail cũng vậy); `apps/api/src/measurements/measurements.service.ts:146-165` (`dailySummary` lọc dữ liệu theo `windowFrom` nhưng `incidentRows` đếm theo `from..to` của ngày — `:180-190`); `apps/api/src/notifications/notifications.service.ts:184-228` (`listNotifications` không kiểm quyền hiện tại), `:231-245` (`markRead` không kiểm quyền hiện tại).
Hợp đồng: docs/02 NFR-01 (kiểm quyền theo hồ sơ cho REST/realtime/export/AI), docs/04 `care_links` “giới hạn lịch sử được xem; kiểm lại trước khi gửi dữ liệu”, docs/06 “Người thân không mặc định truy cập toàn bộ dữ liệu trước ngày chia sẻ” và luồng thu hồi “mất quyền đọc API/AI/export… thông báo chưa gửi bị hủy”.

**Tái hiện:** caregiver accept lúc `23:57:33Z` (`historyDays=1`), incident SOS tạo lúc `23:27:24Z`; alert 5 ngày trước tạo lúc `23:57:55Z` với `measured_at` 5 ngày trước.
**Expected:** alert/detail/summary/notification của dữ liệu trước `shared_from` hoặc ngoài `historyDays` bị từ chối/không hiển thị (như measurements đang làm).
**Actual:** `GET /subjects/:id/alerts?state=open` (caregiver) trả cả alert `23:27:24Z` và alert 5 ngày trước; `GET /alerts/:id` 200; `daily-summary?date=hôm-nay` trả `incidents.total=1` dù `coverage.from=23:57:33Z`; `daily-summary` ngày trước share 403 (nhất quán cho measurements). Sau khi thu hồi (fresh DB): `GET /notifications` 200 trả `subjectName="Bà Trần Thị An"`, `incidentType=fall`, `state=open`; `POST /notifications/:id/read` 204.

**Hệ quả:** người thân mới/đã bị thu hồi vẫn suy ra được sự kiện, thời điểm và tên hồ sơ; “thu hồi” không có hiệu lực trên toàn bộ đường đọc.
**Đề xuất:** áp `requireHistory`/`sharedFrom` cho alert list/detail, incident count trong daily-summary và notification list; `markRead` kiểm lại quyền; test T-02 với alert/notification (hiện test chỉ phủ measurements/SSE).

### P2-2 — Export CSV 403 với caregiver vừa accept; UI không biết `shared_from`

**Nguồn:** `apps/api/src/measurements/measurements.service.ts:221-241` (`exportCsv` gọi `resolveWindow` rồi `requireHistory(from)`), `apps/api/src/access/access.service.ts:97-113` (`effectiveFrom = max(now-historyDays, sharedFrom)`, từ chối nếu `from` sớm hơn); UI `apps/web/src/features/history/HistoryPage.tsx:66-72` (chỉ kẹp theo `historyDays`), `:153-160` (link export dùng cùng `from/to`), `apps/web/src/features/history/api.ts:31-34`.
**Tái hiện:** caregiver `historyDays=1`, `sharedFrom=23:57:33Z`; `GET /subjects/:id/export.csv` (không tham số) → 403; `GET …/export.csv?from=<now-30m>&to=<now>` → 403 (`details.effectiveFrom=23:57:33Z`); cùng lúc `GET …/measurements` (không tham số) → 200 với `coverage.from=23:57:33Z` và 0 item, không có thông báo bị kẹp.
**Expected:** hai đường đọc cùng chính sách: hoặc cùng 403 kèm giải thích, hoặc cùng kẹp và UI nói rõ; export không được trả JSON 403 sau khi người dùng bấm “Tải CSV”.
**Actual:** UI 24h clamp theo `historyDays` → link export của caregiver mới luôn 403 đến khi cửa sổ `from ≥ sharedFrom`; measurements thì âm thầm trả dữ liệu sau mốc share.
**Đề xuất:** dùng `subject.sharedFrom` khi tính `from` ở web; thống nhất semantics list/export (kẹp kèm warning hoặc 403 có hướng dẫn); test T-02/T-12.

### P2-3 — Snapshot `clock_status=unsynced` biến mất khỏi daily summary; gap lý do sai; ingest nhận `synced+null`

**Nguồn:** `apps/api/src/measurements/measurements.service.ts:396-415` (`computeGaps` chỉ dùng `excludedUnsyncedCount` khi **không có** mẫu synced nào), `:303-330` (đếm unsynced theo `received_at`), `packages/contracts/src/measurements.ts` (`dailySummarySchema` không có `excludedUnsyncedCount`), `packages/contracts/src/telemetry.ts:40-47` (superRefine chỉ chặn `unsynced ⇒ null`, không chặn `synced + null`), `apps/api/src/ingest/telemetry-ingest.service.ts:63-66`.
**Tái hiện:** 1 mẫu `synced=19:00Z` + 5 mẫu `unsynced` + 1 mẫu `clock_status=synced, measured_at=null` (tất cả 202 accepted).
**Expected:** daily-summary cho biết có 6 mẫu bị loại vì thiếu giờ, gap của vùng đó lý do `clock_unsynced` (docs/04), và `synced + null` bị 422.
**Actual:** `daily-summary`: `observedCount=1`, `steps.total=0, completeness='complete'`, gaps `[00:00→19:00 no_data, 19:00→now no_data]`, không có trường đếm mẫu bị loại. `measurements`: `excludedUnsyncedCount=6` nhưng gap vẫn `no_data`. CSV: 6 dòng `measured_at` rỗng, trong đó dòng cuối `clock_status=synced`.
**Hệ quả:** tình trạng “đồng hồ chưa đồng bộ” bị hiển thị như “mất kết nối/không có dữ liệu”; người dùng không biết thiết bị vẫn gửi nhưng giờ sai.
**Đề xuất:** thêm `excludedUnsyncedCount` (và `excludedByReason`) vào daily summary; gắn `clock_unsynced` cho gap khi có mẫu unsynced trong khoảng; siết schema `synced ⇒ measured_at != null`; test T-04/T-09.

### P2-4 — Đọc lại notification ghi đè `read_at`

**Nguồn:** `apps/api/src/notifications/notifications.service.ts:231-245` — `set({ readAt: new Date() })` không có điều kiện `isNull(readAt)`.
**Tái hiện:** `POST /notifications/29cb29a0-…/read` hai lần cách 2 s.
**Expected:** lần đọc đầu tiên được giữ (mốc “đã đọc” bất biến, idempotent).
**Actual:** `readAt` 1 = `2026-11-15T00:00:29.053Z`, sau lần 2 = `2026-11-15T00:00:31.209Z`; unread vẫn giảm đúng 1. Không có audit cho hành động đọc.
**Hệ quả:** mất bằng chứng thời điểm đọc đầu tiên (docs/03: “Gửi thành công… không đồng nghĩa người dùng đã đọc; `acknowledged` phải là hành động rõ ràng” — mốc đọc là bằng chứng).
**Đề xuất:** `where isNull(readAt)` (hoặc giữ `first_read_at` + `last_read_at` riêng), trả 204 idempotent.

### P2-5 — `suspected` không bao giờ thành `unconfirmed`; bị ẩn khỏi hộp cảnh báo nhưng vẫn đếm

**Nguồn:** `apps/api/src/incidents/incidents.service.ts:60-95` (`applyTransition` không sinh `unconfirmed`), `:639-646` (list chỉ `open/acknowledged` hoặc `resolved/cancelled/unconfirmed`), `apps/api/src/database/schema.ts` (`incidentStateEnum` có `unconfirmed`); `apps/api/src/measurements/measurements.service.ts:180-190` (đếm mọi incident trong ngày, không lọc state).
**Tái hiện:** gửi `fall.candidate` rev1 cho incident mới (không có confirmed/cancelled); sau đó `GET /subjects/:id/alerts?state=open` và `?state=closed` + `daily-summary?date=hôm-nay`.
**Expected (docs/06 “Candidate thiếu kết quả → ‘Chưa xác định’; giữ trong lịch sử kỹ thuật”):** incident hiển thị “chưa xác định”, hoặc ít nhất summary và alert box nhất quán.
**Actual:** incident suspected không xuất hiện ở cả open và closed; trong khi `daily-summary.incidents.total=4, resolved=2` của ngày hôm nay **có** đếm nó. Hộp cảnh báo cùng lúc trả 2 open + 2 closed, nhưng tập đó lại gồm 1 incident tạo cách đây 5 ngày và không có suspected (số tổng bằng nhau chỉ là trùng hợp). DB `state='unconfirmed'` = 0 trên toàn bộ DB.
**Hệ quả:** dashboard hiển thị “Cảnh báo hôm nay: 4 (đã đóng 2)” nhưng danh sách cảnh báo không có mục tương ứng; một số incident mồ côi không có đường xem/xử lý.
**Đề xuất:** job/transition `suspected → unconfirmed` sau ngưỡng (kèm “chưa rõ tình trạng”), hiển thị trong lịch sử kỹ thuật; hoặc loại suspected khỏi count và ghi rõ lý do; test T-05.

### P2-6 — DST lúc nửa đêm (America/Havana) lệch cửa sổ ngày 1 giờ

**Nguồn:** `apps/api/src/measurements/time-utils.ts:44-64` (`zonedToUtc` lặp 4 lần, không xử lý giờ địa phương không tồn tại/lặp; dừng ở giá trị dao động), `:75-100` (`zonedDayToUtcRange` không kiểm tra `from` quy về đúng ngày địa phương).
**Tái hiện:** subject timezone `America/Havana`, mẫu `2026-03-08T04:30Z` (= 07/03 23:30 local) và `05:30Z` (= 08/03 01:30 local).
**Expected:** ngày 08/03 local bắt đầu `05:00Z` (00:00 không tồn tại, nhảy tới 01:00) → cửa sổ 05:00Z→04:00Z hôm sau, `expectedCount=5520`; ngày 07/03 là 05:00Z→05:00Z (24 h).
**Actual:** ngày 08/03 = `04:00Z→04:00Z` hôm sau (24 h, `expectedCount=5760`) → mẫu 07/03 23:30 local bị tính vào 08/03 (`lastSeenAt=05:30Z`, obs 2); ngày 07/03 = `05:00Z→04:00Z` (mất múi 23:00–24:00 local). New York (DST 02:00) đúng cả hai chiều, nên lỗi chỉ ở timezone DST lúc 00:00.
**Hệ quả:** coverage/gap và `lastSeenAt` của ngày sai 1 giờ với một số timezone hợp lệ (timezone hồ sơ là chuỗi IANA người dùng nhập); dữ liệu một giờ bị quy sai ngày.
**Đề xuất:** xác định “đầu ngày” bằng cách tìm UTC instant đầu tiên có local date = ngày yêu cầu (quét ±3 h), hoặc dùng thư viện tz chuẩn; thêm test DST cho timezone chuyển giờ lúc 00:00.

### P2-7 — Seed tạo notification `sent_at < created_at`; seed rerun báo `devices: 0`

**Nguồn:** `apps/api/src/database/seed.ts:519-543` (set `sentAt = now-24h`, không set `createdAt` → default now), `:120-150`/`:193-200` (summary `devices` lấy từ `insert().returning()` nên lần 2 = 0).
**Actual (DB review-fresh):** `seed-open-alert-owner`: `sent_at=2026-11-14T23:38:41.264Z`, `created_at=2026-11-15T00:02:41.677Z` (`sent_at < created_at`); seed lần 2 in `"devices": 0` dù DB vẫn 1 thiết bị.
**Hệ quả:** dữ liệu demo có thứ tự thời gian không thể xảy ra; nếu UI hiển thị tuổi thông báo theo `created_at` hoặc `sent_at` sẽ lệch; báo cáo seed gây hiểu nhầm.
**Đề xuất:** set `createdAt` xen kẽ hợp lý (created ≤ sent), hoặc dùng `sentAt` cũ hơn `createdAt` trong seed; sửa summary lấy count thực.

### P2-8 — PGlite không có guard khi hai tiến trình cùng mở DB

**Nguồn:** `apps/api/src/database/database.ts` (không tạo lock/pid guard; docs/14 đã ghi “PGlite mở file DB độc quyền theo process”).
**Quan sát trong phiên này:** do một tiến trình API cũ còn giữ cùng `PGLITE_DATA_DIR=.data/review-integrity` khi tiến trình thứ hai mở DB, toàn bộ DB sau đó **không mở lại được**: `RuntimeError: Aborted()` từ PGlite, kể cả trên bản copy; `postmaster.pid` còn lại. Trong khi đó, `taskkill /F` một API đang chạy trên DB sạch (`review-fresh`) rồi mở lại vẫn đọc đủ 1681 dòng telemetry.
**Hệ quả:** thao tác sai quy trình (quên dừng API, chạy seed/migration/2 API cùng dir) có thể làm mất toàn bộ DB demo/review mà không có thông báo rõ; không có cách phục hồi trong repo.
**Đề xuất:** lock file + kiểm tra PID/socket trước khi mở; script seed/migrate từ chối nếu API đang chạy; thông báo lỗi hướng dẫn thay vì abort wasm; ghi vào README/docs vận hành (không phải bug nghiệp vụ).

## 5. Phần chưa kiểm / giới hạn

- **UI E2E**: không chạy Playwright trên DB review (app 5173 của lead dùng DB khác); kết luận về UI dựa trên đọc code `DashboardPage.tsx`, `HistoryPage.tsx` và đối chiếu số API↔DB. Chưa xác nhận bằng ảnh chụp/pixel.
- **MQTT**: chưa chạy broker/ACL/ACK (không có broker trong phiên); chỉ đọc code `mqtt-ingest.service.ts`.
- **Outbox retry/backoff/`failed`**: `deliverInApp` hiện không thể ném lỗi nên nhánh `failed`/retry/backoff **không thể chạy** trong v1 — chưa có bằng chứng cho T-07; cần transport thật hoặc test inject lỗi.
- **Rate limit**: giới hạn trong bộ nhớ một tiến trình; chưa thử 429/multi-instance.
- **PostgreSQL thật, nhiều instance, p95 độ trễ** (NFR-07): chưa đo.
- **Web Push/email/SMS**: ngoài phạm vi v1 (outbox chỉ in-app).
- **Xoá dữ liệu/retention**: chưa có endpoint implement; không kiểm.
- **AI summary**: không đụng (trọng tâm là dữ liệu telemetry/incident/notification).
- **PGlite hỏng DB**: đã xóa `.data/review-integrity` hỏng; các bằng chứng P1-1…P2-6 lấy từ output API trong phiên trước khi hỏng (đã ghi trong mục 4). DB `.data/review-fresh` giữ lại để tái lập phần 3.1–3.5.

## 6. Đề xuất ưu tiên

1. **Trước demo**: chặn/cách ly `measured_at` tương lai và mẫu trước `assignment.startedAt` (P1-1, P1-2); sửa `loadLastTelemetry` theo `measured_at` (P1-4); sửa `computeSteps` để không báo `complete` khi mất delta bắc ngày (P1-3). Đây là các số liệu sức khỏe hiển thị sai, không phải lỗi 500.
2. **Trước khi chia sẻ cho người thân thật**: thống nhất ranh giới `shared_from/historyDays` cho alerts/summary/notifications (P2-1) và export (P2-2).
3. **Trước dữ liệu thật**: hiển thị `unsynced`/quarantine trong summary (P2-3, P1-2); `unconfirmed` (P2-5); DST (P2-6); `read_at` idempotent (P2-4).
4. **Vận hành**: lock/guard PGlite + quy trình dừng API trước seed/migrate (P2-8); sửa seed timestamp (P2-7).
5. **Hồi quy tối thiểu cần thêm**: T-03 (chuyển chủ + dữ liệu cũ), T-04 (bắc nửa đêm, unsynced, tương lai), T-05 (suspected/unconfirmed), T-02 mở rộng cho alert/notification, T-12 export với caregiver mới; kiểm DST Havana/New York; kiểm API↔DB bằng script đọc PGlite (như mục 3.3).

## 7. Tóm tắt 5 dòng

1. Đã chạy lại trên HEAD `8434d66` với DB PGlite riêng (`.data/review-fresh`, port 3278) và hai chế độ worker; kiểm migration từ DB rỗng (23 bảng), seed 2 lần idempotent (1681 telemetry/3 incident/7 event/2 outbox), restart và crash-kill đều phục hồi; đối chiếu daily-summary API ↔ SQL độc lập khớp tuyệt đối cho 3 ngày seed.
2. Dedupe telemetry (duplicate/409 message/409 sequence, 4 request song song), state machine incident (stale revision, terminal không mở lại, `user.cancel_requested`), ack/resolve CAS (1 áp dụng + 1 conflict, 409 kèm version), outbox dedupe/supersede, SSE `revoked` và claim race đều đúng như hợp đồng.
3. Bốn lỗi P1 làm **số liệu sai im lặng**: mẫu `measured_at` tương lai được nhận và thống kê vào “hôm nay” (steps 9939, HR 200, coverage 100% cho caregiver chưa thấy dữ liệu); telemetry trước assignment bị gán cho chủ mới; `steps.completeness='complete'` dù mất ~4200 bước bắc nửa đêm; “nhịp tim gần nhất” lấy theo `received_at` nên hiện số cũ (50 bpm) trong khi summary nói dữ liệu mới hơn (70 bpm).
4. Tám P2 về ranh giới chia sẻ (alert/notification vượt `shared_from`, export 403 cho caregiver mới), unsynced biến mất khỏi summary, `read_at` bị ghi đè, suspected không bao giờ `unconfirmed`, DST Havana lệch 1 giờ, seed timestamp không hợp lệ và PGlite không có lock guard.
5. Chưa kiểm: MQTT/broker thật, nhánh outbox retry/failed (hiện không thể lỗi), rate limit đa tiến trình, PostgreSQL/p95, UI E2E trên DB review; lỗi P1-2 đã được code ghi nhận là R-02/R-03 mở nhưng review này xác nhận vi phạm trực tiếp tiêu chí FR-03 nên cần xử lý trước demo.

## Phụ lục — lệnh chính đã dùng

```bash
# 0) Chuẩn bị (không đụng DB lead)
pnpm install --prefer-offline --frozen-lockfile
cd packages/contracts && pnpm build
cd apps/api && pnpm build

# 1) DB sạch + migration + seed 2 lần
cd apps/api
PGLITE_DATA_DIR=.data/review-fresh pnpm db:migrate
PGLITE_DATA_DIR=.data/review-fresh pnpm seed
PGLITE_DATA_DIR=.data/review-fresh pnpm seed            # lần 2: không nhân bản

# 2) API riêng (worker outbox tắt khi cần trạng thái trung gian)
PGLITE_DATA_DIR=.data/review-fresh PORT=3278 NODE_ENV=test \
  nohup node dist/src/main.js > /tmp/review/api-fresh.log 2>&1 &
curl -s http://localhost:3278/api/v1/health

# 3) Đối chiếu API ↔ DB: dừng API rồi đọc PGlite bằng script read-only ngoài repo
#    (import tuyệt đối: apps/api/node_modules/@electric-sql/pglite/dist/index.js)
node /tmp/review/pg.mjs "…/.data/review-fresh" \
  "select count(*)::int from telemetry"
#    so daily-summary 3 ngày với SQL:
#    select count(*), count(*) filter (where quality->>'heart_rate'='valid'),
#           avg((metrics->>'heart_rate_bpm')::numeric) filter (...),
#           max(measured_at), (array_agg(battery_percent order by measured_at desc))[1]
#    from telemetry t join device_assignments a on a.id=t.assignment_id
#    where a.subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
#      and measured_at >= $1 and measured_at < $2;

# 4) Telemetry/ingest
curl -s -H "x-device-id: $DEV" -H "x-device-key: $KEY" \
  -H 'Content-Type: application/json' --data-binary @body.json \
  http://localhost:3278/api/v1/ingest/telemetry
#    body.json: schema_version, message_id, device_id, boot_id, sequence,
#               measured_at, clock_status, uptime_ms, metrics, quality,
#               battery_percent, firmware_version

# 5) Daily summary / measurements / CSV / status
curl -s -b cookie.jar "$API/subjects/$SUBJ/daily-summary?date=2026-11-11"
curl -s -b cookie.jar "$API/subjects/$SUBJ/measurements?from=…&to=…"
curl -s -b cookie.jar "$API/subjects/$SUBJ/export.csv?from=…&to=…"
curl -s -b cookie.jar "$API/subjects/$SUBJ/status"

# 6) Incident/outbox
curl -s -H "x-device-id: $DEV" -H "x-device-key: $KEY" \
  -H 'Content-Type: application/json' --data-binary @event.json \
  "$API/ingest/events"
curl -s -b cookie.jar -H 'Content-Type: application/json' \
  -d '{"expectedVersion":2}' -X POST "$API/alerts/$ID/acknowledge"
curl -s -b cookie.jar -H 'Content-Type: application/json' \
  -d '{"expectedVersion":3,"reason":"…","outcome":"supported"}' \
  -X POST "$API/alerts/$ID/resolve"
#    Outbox kiểm bằng SQL sau khi dừng API:
#    select i.device_incident_id, o.revision, o.status, o.attempts, o.read_at
#    from notification_outbox o join incidents i on i.id=o.incident_id
#    order by i.created_at, o.dedupe_key;
```

Lưu ý: mọi lần đọc DB PGlite phải dừng API trước (một tiến trình/DB); đây cũng là nội dung P2-8.
