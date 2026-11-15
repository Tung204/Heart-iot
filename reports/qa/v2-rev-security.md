# Reviewer độc lập — tái kiểm bảo mật sau v2

- **Reviewer:** reviewer bảo mật độc lập (agent pi; chỉ đọc code/tài liệu, chạy API/DB riêng, không sửa code sản phẩm).
- **HEAD:** `bf63f03` (`docs(orchestration): spec 2 reviewer độc lập v2`), worktree `rev-v2-security`.
- **Thời điểm kiểm:** 2026-11-15 07:57–08:12 (Asia/Ho_Chi_Minh, UTC+7). Giờ trong output API là UTC.
- **Môi trường riêng:** API cổng **3401**, DB PGlite **`.data/review-sec2`** (gitignored), `WEB_ORIGIN=http://localhost:5173`, `NODE_ENV=development`. Không đụng `.data/pglite`, API 3000 hay web 5173 của lead.
- **Tài liệu đã đọc:** `AGENTS.md`; `reports/orchestration/v2-specs/{qa-backend-security,rev-v2-security}.md`; `reports/qa/{v2-admin-ops,v2-data-integrity,v2-privacy-ethics,v2-iot-protocol,v2-caregiver-journey}.md`; `review-backend-2026-11-14.md`; các handoff/spec `v2-fix-*`, `fix-*`, `feat-*`; `docs/02,03,04,06,08,12`; toàn bộ `apps/api/src`, `packages/contracts`, `infra/`.
- **Lưu ý:** `reports/qa/v2-backend-security.md` **không có** trong worktree tại thời điểm kiểm. Vì vậy mục “trạng thái finding cũ” dưới đây đối chiếu trực tiếp các báo cáo QA còn lại, không dựa vào báo cáo backend-security.

## 1. Kết luận tổng thể

- **Không có P0.** Có **2 P1 mới**, **6 P2** và **2 P3**; một số finding P1/P2 của các báo cáo trước đã được sửa đúng ở phần backend (SSE thu hồi, telemetry quarantine/assignment, notifications, contacts, policy CAS, admin devices API).
- Hai P1 mới đều là rò dữ liệu sức khỏe qua **đường ingest sự kiện** và **Studio data** — hai đường chưa được phủ bởi fix telemetry/measurements:
  1. `POST /ingest/events` không áp lịch sử assignment/cách ly: sự kiện cũ của chủ cũ bị gán cho chủ mới; timestamp tương lai được nhận và hiện thành cảnh báo.
  2. `GET /workspace-views/:id/data` trả tới 24 giờ dữ liệu (nhịp tim, chuỗi đo, cảnh báo) bất kể `sharedFrom/historyDays` và bất kể quyền care link.
- Các kiểm “đạt” quan trọng: SSE gửi `event: revoked` + đóng khi admin khóa user / thu hồi session / thu hồi care link; telemetry tương lai/trước assignment bị cách ly và không lọt measurements/daily/insights/assistant/studio; synced+null → 422; contacts đúng quyền, tối đa 5, primary race an toàn, không lộ phone trong audit/log/SSE; policy thiếu/sai digest → 409 + audit; admin devices rotate/claim code một lần, không lộ health; cookie HttpOnly/SameSite/Secure-prod; MQTT/compose không anonymous/public theo kiểm cấu hình tĩnh.

## 2. Phần đã kiểm (có bằng chứng chạy thật)

### 2.1 Dựng môi trường

```bash
pnpm install --prefer-offline --frozen-lockfile   # 711 packages, 29.9s
pnpm build:contracts                              # exit 0
pnpm --filter @annhien/api build                  # nest build, exit 0
cd apps/api && PGLITE_DATA_DIR=.data/review-sec2 PGLITE_MEMORY=false PORT=3401 \
  node dist/src/database/seed-cli.js              # users 3, subjects 2, telemetry 1681, incidents 3
PGLITE_DATA_DIR=.data/review-sec2 PORT=3401 node dist/src/main.js
```

Tạo thêm bằng API: owner2/subject2, owner A + device `REV-SEC2-A/B`, caregiver `cg2..cg11`, 5 contact, workspace view, policy v2–v4. Sau kiểm, API đã tắt; DB giữ tại `.data/review-sec2` để đối chiếu. Không chạy Docker, không chạy PostgreSQL thật, không chạy toàn bộ Jest; mọi kết luận dưới đây đến từ API/DB thật của reviewer.

### 2.2 SSE — thu hồi/khóa/session (đạt)

| Kịch bản | Kết quả thực |
| --- | --- |
| Caregiver `cg5` đang mở stream, owner thu hồi care link | 1 frame `event: revoked` / `data: {}`; stream đóng; alert tạo sau đó (`inc` mới, 202) không xuất hiện trong stream |
| Caregiver `cg4` đang mở stream, admin `PATCH /admin/users/:id/status {disabled}` | `event: revoked`, stream đóng; `/me` cùng cookie → 401; login lại → 403; không có event sau frame revoked |
| Session B của `c12` bị session A thu hồi | Stream B nhận `event: revoked`; B `/me` 401; A vẫn 200 |
| Không cookie / người lạ / caregiver thiếu `canReceiveAlerts` | 401 / 404 / 403 trước khi mở stream; owner 200 |
| Payload frame revoked | Chỉ `{}`; không sessionId, không lý do, không dữ liệu sức khỏe |

```text
$ timeout 12 curl -s -N -b cg5.txt -H 'Last-Event-ID: 0' $B/subjects/S1/events
...
event: revoked
data: {}
```

**Kết luận:** P1-1 của `v2-admin-ops` (SSE sau khi admin khóa) **khớp yêu cầu ở backend**. Tôi không tự đóng thay reviewer gốc; đề nghị reviewer đó xác nhận bằng chứng này.

### 2.3 Ingest — telemetry (đạt phần lớn)

| Kiểm | Kết quả |
| --- | --- |
| `measured_at` +10 phút / +15 phút | 202 `accepted` + `code=QUARANTINED`; row `is_quarantined=true`; audit `telemetry.quarantined` có reason `clock_skew_future`, metadata **không** có HR/steps/battery |
| Mẫu trước assignment đầu tiên | 202 `QUARANTINED`, reason `before_first_assignment`; không vào measurements/daily/status/insights/studio/assistant |
| Mẫu nằm trong assignment **đã đóng** của chủ cũ (D1 chuyển A→B) | 202 accepted; gán đúng assignment cũ; A đọc được mẫu HR 66, B **không** thấy (`items 0`) |
| `clock_status=synced` + `measured_at=null` | **422** `VALIDATION_FAILED`; không ghi row |
| `unsynced` + null | 202 accepted; không lên timeline; `excludedUnsyncedCount=1` |
| Trùng `message_id` cùng payload / khác payload / trùng sequence | `duplicate` / **409** / **409** |
| Sai key / body `device_id` khác header | 401 / 403 |
| Mẫu cách ly có HR 200/bước 9999/pin 5 | Không xuất hiện ở measurements, daily-summary, insights, status (`hr=88`), studio (`metrics 88`), assistant (`1 mẫu, avg 88`) |

### 2.4 Share boundary — owner/caregiver mới/thu hồi

| Kiểm | Kết quả |
| --- | --- |
| Caregiver mới `cg4` (`sharedFrom=00:59:58`, `historyDays=1`) đọc alert **đã đóng** trước share | List `state=closed` **rỗng**; detail incident resolved 00:59:52 → **403** kèm `details.effectiveFrom` |
| Alert **đang mở** trước share | List/detail 200 kèm `startedBeforeShare=true` (ngoại lệ “trạng thái an toàn hiện tại”, đúng code) |
| Caregiver `cg11` không có `canReceiveAlerts` | alerts 403, detail 403, ack 403, contacts 403, assistant 403; status 200, measurements 200 |
| Caregiver bị thu hồi (`cg4` sau revoke) | status/alerts/detail/studio data → 404; `/notifications` 200 rỗng |
| Assistant `cg8` (`canViewAi=true`, share mới) | summary 200 nhưng `periodStart=sharedFrom`, “Không có dữ liệu đo”; ask trả “Chưa có dữ liệu…” — không đọc trước share |
| Notification `cg4` | Chỉ thấy notification phát sinh sau share; markRead 2 lần 204, `readAt` giữ mốc đầu; sau thu hồi list rỗng, `unreadCount=0`, markRead 404; user khác markRead 404 |
| CSV | Owner 200; caregiver `from` trước share 403; caregiver bị thu hồi/admin 404 |

### 2.5 Emergency contacts

| Kiểm | Kết quả |
| --- | --- |
| Caregiver có `canReceiveAlerts` đọc | 200, có phone (đúng thiết kế) |
| Caregiver không có quyền đọc | 403; người lạ 404; chưa đăng nhập 401 |
| Caregiver create/update/delete | 403 (body hợp lệ); body sai schema trả 422 trước khi kiểm quyền (chỉ là thứ tự validate) |
| Owner tạo tối đa 5 / thêm thứ 6 | 5 thành công; thứ 6 **409** `details.limit=5` |
| Hai create đồng thời khi đã có 4 | một 201, một 409; danh sách đúng 5 |
| Hai create đồng thời `isPrimary=true` trên hồ sơ rỗng | cả hai 201 nhưng danh sách có **đúng 1 primary** (unique partial index) |
| Bỏ primary khi còn 2 | 400; đổi non-primary thành primary | primary cũ bị clear, đúng 1 primary; xóa primary → tự promote |
| Phone trong audit/log/SSE | Audit 13 dòng `targetType=emergency_contact`: không có `09\d{8}`; log API 0 dòng; SSE không có event contact |

### 2.6 Policy

| Kiểm | Kết quả |
| --- | --- |
| Non-admin GET/preview/publish | 403 |
| Publish thiếu `previewDigest` | 409 `preview_missing`; audit `outcome=conflict` |
| Publish sai digest | 409 `preview_mismatch`; audit conflict |
| Preview với `expectedVersion` cũ | 409 `version_mismatch` kèm currentVersion/currentDigest |
| Publish đúng digest | 200, version tăng, bản cũ `retired`; audit success chỉ key/version/digest/note, **không có value** |
| Replay preview cũ sau publish | 409 `version_mismatch` |
| Hai publish đồng thời cùng version/digest | một 200, một 409; audit có success + conflict; active chỉ một |
| **Bypass thủ công** | Gọi thẳng `PUT` với digest tự tính (không gọi preview) → **200**, tạo version mới |

### 2.7 Admin devices / claim code / rotate

| Kiểm | Kết quả |
| --- | --- |
| Non-admin create/list/rotate/claim-code | list 403; create body hợp lệ 403; rotate 403; claim-code 403 |
| Admin create | trả `deviceKey` + `claimCode` đúng một lần; audit chỉ serial; list không có key/code |
| Claim code dùng lại | 422; claim code không lưu plaintext (`claim_code_hash=null` sau claim) |
| Issue claim code lần nữa | trả code mới; không có endpoint đọc lại code cũ |
| Rotate key | key cũ ingest 401, key mới 202; audit `device.rotate_key` metadata `{}` |
| Admin list | 8 trường, không có HR/battery/health; `assignedSubjectId` và `lastSeenAt` |
| Admin không care link | `/subjects` rỗng; measurements/status/alerts/contacts 404; notifications 200 rỗng |

### 2.8 Auth/session, CSRF/origin, enumeration, rate limit

| Kiểm | Kết quả |
| --- | --- |
| Cookie | `HttpOnly`, `SameSite=Lax`, `Secure` khi production, `Path=/`; không lộ token trong body |
| Session revoke | Phiên khác bị 401; revoke session người khác 404; revoke-others giữ phiên hiện tại |
| Password change | sai current → 400; trùng mật khẩu → 400; thành công → phiên khác 401, phiên hiện tại 200; mật khẩu cũ 401, mật khẩu mới 200; audit chỉ reason/revokedSessions |
| Logout | Cookie xóa, token cũ 401 |
| Origin/CSRF | `Origin: http://evil.example` trên POST → 403; `Origin: null` → 403; không Origin (curl) được phép; preflight evil chỉ trả `Access-Control-Allow-Origin: http://localhost:5173` (không reflect) |
| Enumeration | `POST /auth/register` email tồn tại → **409** “Email này đã được sử dụng”; login sai email/mật khẩu cùng message 401 |
| Rate limit login | sai 10 lần → lần 11 **429**; normalize lowercase (C9@TEST.LOCAL dùng chung bucket); user bị khóa 15 phút dù mật khẩu đúng |
| Rate limit register | 12 email mới liên tiếp → **201 cả 12**, không có giới hạn |
| Lỗi input | `x-device-id: foo` → **500**; body 200KB → **500** (xem P3-1) |

### 2.9 MQTT/compose (kiểm cấu hình, không chạy Docker)

```bash
node infra/check-mqtt-exposure.mjs
# 13/13 kiểm tra đạt; lưu ý đây là kiểm cấu hình tĩnh, không chứng minh broker đã chạy
```

Đọc trực tiếp: `allow_anonymous false`, `password_file`, `acl_file`, `listener 1883 127.0.0.1`, compose publish `127.0.0.1:${MQTT_EXPERIMENTAL_PORT:-1883}:1883`, service nằm sau profile `mqtt-experimental`, `passwd` gitignored. API MQTT vẫn chỉ đối chiếu topic↔`device_id` + tồn tại/active, **không** xác thực `x-device-key`; an toàn hiện dựa vào ACL broker. Không chạy broker/ACL thật nên tôi không đóng P0-1 của reviewer IoT.

## 3. Findings

### P1-1 — `POST /ingest/events` gán sự kiện cũ cho chủ hiện tại và nhận timestamp tương lai (rò dữ liệu chéo chủ)

**Mức:** P1 — rò dữ liệu sức khỏe của chủ cũ sang chủ mới; vi phạm trực tiếp T-03.

**Vị trí:**
- `apps/api/src/incidents/incidents.service.ts:317-326` — chỉ lấy `device_assignments` có `ended_at IS NULL` (chủ hiện tại), không dùng lịch sử assignment.
- `apps/api/src/incidents/incidents.service.ts:406` — `detectedAt = envelope.measured_at ?? receivedAt`; không kiểm `MAX_CLOCK_SKEW_SECONDS`, không cách ly.
- Không có nhánh `resolveAssignmentForMeasuredAt`/`is_quarantined` như `apps/api/src/ingest/telemetry-ingest.service.ts:270-330`.

**Tái hiện (đã chạy):**
1. Thiết bị `dddddddd-dddd-4ddd-8ddd-dddddddddddd` thuộc hồ sơ A đến `2026-11-15T00:59:14Z`; B claim lại lúc `00:59:15Z`.
2. Gửi 2 sự kiện `incident_id=inc-oldowner`, `measured_at=2026-11-12T01:05:17Z` (3 ngày trước, thuộc assignment A) qua `POST /ingest/events` bằng key của thiết bị.
3. Kết quả: cả hai **202 accepted**; incident `56483d67-981d-4ac9-afa4-fa05ffce1c4f` nằm ở **subject B**.
4. Gửi tiếp `measured_at=2027-11-15T01:05:17Z`; incident `c7169710-fa78-4529-8afa-0329c46380c9` **202 accepted**, xuất hiện trong alert đang mở của B.

Bằng chứng đọc chéo (owner B):

```json
// GET /subjects/40d2557a-.../alerts?state=open
[
 {"id":"c7169710-...","detectedAt":"2027-11-15T01:05:17.167Z","state":"open"},
 {"id":"56483d67-...","detectedAt":"2026-11-12T01:05:17.037Z","state":"open"}
]
// GET /subjects/40d2557a-.../daily-summary?date=2026-11-12
{"coverage":{"observedCount":0,...},"incidents":{"total":1,"resolved":0}}
// GET /subjects/40d2557a-.../insights?days=7
{"incidentsTotal":1,...}   // ngày 2026-11-12: incidents 1, observedCount 0
// GET /subjects/40d2557a-.../assistant/summary
"… 1 cảnh báo … Cảnh báo gần nhất: Té ngã lúc 2026-11-12T01:05:17.037Z (đang mở)."
```

A (chủ cũ) **không** thấy incident này trong `/subjects/A/alerts`; outbox của B có notification cho incident cũ. Query DB xác nhận `incident.subject_id=40d2557a...` nhưng `device_assignments.started_at=2026-11-15T00:59:15Z`, tức `detected_at` trước assignment 3 ngày.

**Kỳ vọng:** docs/03:83 (“dữ liệu được gán bằng lịch sử assignment tại thời điểm xảy ra; không chắc thời gian thì cách ly”), docs/04:55 (“không tự gán vào chủ hiện tại”), docs/08 T-03 (“Chuyển thiết bị từ A sang B rồi nhận dữ liệu cũ → Dữ liệu không rơi vào hồ sơ B; timestamp không tin cậy bị cách ly”). Sự kiện phải tra assignment theo `measured_at`; nếu trước assignment đầu tiên/ngoài khoảng/ tương lai quá dung sai → cách ly + audit, không tạo incident cho chủ mới.

**Thực tế:** dùng assignment đang mở; `measured_at` tùy ý (kể cả 2027) được nhận; không audit/cách ly; incident, daily-summary, insights, assistant, notification của B đều bị nhiễm dữ liệu của A.

**Ảnh hưởng:** chủ mới và người thân mới nhận cảnh báo té ngã của người khác, có thể gọi/hành động sai; dữ liệu sức khỏe của chủ cũ bị lộ; cảnh báo tương lai 2027 có thể giữ “đang mở” vô hạn và làm sai dashboard. Đây là lỗ hổng cùng lớp với P1-2 của `v2-data-integrity` nhưng ở đường sự kiện, chưa được sửa.

---

### P1-2 — Studio `GET /workspace-views/:id/data` trả dữ liệu sức khỏe trước `sharedFrom` và bỏ qua quyền care link

**Mức:** P1 — caregiver mới (hoặc caregiver bị tắt mọi quyền) đọc được chuỗi nhịp tim/thiết bị/cảnh báo tới 24 giờ trước ngày chia sẻ.

**Vị trí:**
- `apps/api/src/studio/studio.service.ts:237-242` — `renderSubjectData` chỉ gọi `requireSubject`, không `requireHistory`, không `assertAction`; cửa sổ `now-24h`.
- `:326-336` — alert lấy theo `lastEventAt >= windowStart`, không lọc `detectedAt >= effectiveFrom` và không chặn `lastEventAt` tương lai.
- `:363-371` — `alertsTotal`/`alertsResolved` đếm theo `detectedAt >= windowStart`, không áp `effectiveFrom`.
- `:888-916` — endpoint `data()` dùng `renderSubjectData(user.id, subjectId)` cho cả owner và caregiver; caregiver không đi qua `requireHistory`.
- Đối chiếu: measurements/daily/assistant đã dùng `requireHistory` (`measurements.service.ts:87-94`, `assistant.service.ts:268-273`).

**Tái hiện (đã chạy):**
1. Hồ sơ S2 có D2 gửi mẫu `HR=88` lúc `00:58:44Z`, `HR=77` lúc `00:59:28Z`.
2. `cg7` accept lúc `01:02:41Z` (`sharedFrom=01:02:41Z`, `historyDays=1`), `cg3` accept với **mọi quyền false** (`canReceiveAlerts=false`, …).
3. Owner2 publish workspace view `2e8c13ad-...` (scope subject S2).
4. `GET /workspace-views/2e8c13ad-.../data`:

```json
// cg7 — 200
{"metrics":{"heartRateBpm":77,"measuredAt":"2026-11-15T00:59:28.825Z"},
 "series":[{"heartRateBpm":88,...},{"heartRateBpm":77,...}],
 "summary":{"heartRateAvg":82.5,"heartRateMin":77,"heartRateMax":88,"alertsTotal":1},
 "alerts":[{"detectedAt":"2027-11-15T01:05:17.167Z"},{"detectedAt":"2026-11-12T01:05:17.037Z"}]}
// cg3 — 200 cùng dữ liệu (dù canReceiveAlerts=false)
```

Cùng thời điểm, `GET /subjects/S2/measurements` của `cg7` trả `items=0`; `daily-summary` trả `heartRate=null`; tức dữ liệu chỉ lọt qua Studio. `cg6` (không link) → 404; `?subjectId` hồ sơ không có link → 404 (đúng).

**Kỳ vọng:** docs/06:39 (“Người thân không mặc định truy cập toàn bộ dữ liệu trước ngày chia sẻ”), docs/04:11 (`care_links.shared_from`, “kiểm lại trước khi gửi dữ liệu”), NFR-01. Studio phải dùng cùng `requireHistory`/`effectiveFrom` và cùng điều kiện quyền như measurements/alerts; alert/incident phải lọc theo `detectedAt` và assignment.

**Thực tế:** `requireSubject` là đủ; 24 giờ dữ liệu trước share (và cả incident cũ/future) được trả; quyền `canReceiveAlerts/canViewAi` không có tác dụng.

**Ảnh hưởng:** rò nhịp tim, pin, chuỗi đo, cảnh báo (kể cả lý do/trạng thái) cho người thân mới hoặc người đã bị tắt quyền; cùng gốc với P1-2 privacy nhưng đây là endpoint cụ thể chưa được sửa và có thể đọc bằng một request chuẩn.

---

### P2-1 — `GET /subjects/:id/status` và `/devices` trả mẫu trước `sharedFrom` và mẫu tương lai trong dung sai

**Mức:** P2 — rò snapshot sức khỏe ngoài cửa sổ chia sẻ; làm sai “trạng thái hiện tại”.

**Vị trí:**
- `apps/api/src/devices/devices.service.ts:231-236` — list/status chỉ `requireSubject`.
- `:326-350` — `loadLastTelemetry` lọc `synced`, `is_quarantined=false`, `measured_at is not null`, nhưng **không** lọc `measured_at <= now` và **không** lọc `>= effectiveFrom`.

**Tái hiện:**
1. `cg7` (`sharedFrom=01:02:41Z`) gọi `GET /subjects/S2/status` → `lastHeartRateBpm=77`, `batteryPercent=60`, `lastMeasuredAt=00:59:28Z` (trước share 3 phút); `/measurements` cùng lúc `items=0`.
2. Gửi mẫu `measured_at=now+90s` (`HR=222`, pin 2) — trong dung sai 120s nên **không** bị quarantine; `status`/`devices` trả `HR=222`, `lastMeasuredAt=01:10:15Z` (tương lai); measurements/daily/studio/assistant đều loại mẫu này.
3. `cg3` (mọi quyền false) và `cg8` cũng thấy `HR=222`.

**Kỳ vọng:** status/devices là đường đọc sức khỏe; phải kẹp `min(now)` (như studio/measurements) và với caregiver phải tôn trọng `effectiveFrom` — hoặc chốt rõ “snapshot hiện tại được phép trước share” trong docs. Mẫu tương lai không được hiển thị dù chưa vượt dung sai ghi.

**Thực tế:** hiển thị cả mẫu trước share và mẫu tương lai; mẫu 222 được coi là bản đo mới nhất.

**Ảnh hưởng:** caregiver thấy nhịp tim/pin không thuộc quyền chia sẻ; một thiết bị lệch giờ +90s có thể đẩy chỉ số sai (222 bpm) lên dashboard như “hiện tại”.

---

### P2-2 — `daily-summary` đếm incident trước `sharedFrom` và incident không thuộc assignment

**Mức:** P2 — rò số đếm cảnh báo ngoài cửa sổ; cùng gốc P1-1 cũ nhưng phần list/detail đã sửa.

**Vị trí:** `apps/api/src/measurements/measurements.service.ts:179` (telemetry dùng `windowFrom`) vs `:202-212` (incident dùng `from` = đầu ngày, không dùng `windowFrom`, không lọc assignment).

**Tái hiện:**
- `cg4` (`sharedFrom=00:59:58Z`) gọi `daily-summary` hôm nay: `coverage.from=00:59:58Z`, `observedCount=0` nhưng `incidents.total=2` (incident 00:32 và 00:59:52 đều **trước** share).
- Owner B gọi `daily-summary?date=2026-11-12`: `incidents.total=1` dù B chưa có assignment/thiết bị ngày đó (incident từ A — xem P1-1).

**Kỳ vọng:** đếm incident trong `windowFrom..now` như telemetry; incident trước share/không thuộc assignment không được đếm (hoặc tách trường `beforeShareOpenCount` nếu chốt ngoại lệ cảnh báo mở).

**Thực tế:** đếm theo đầu ngày; daily-summary (và UI dùng số này) cao hơn dữ liệu được phép.

**Ảnh hưởng:** rò số lượng/thời điểm cảnh báo trước chia sẻ; tiếp tay P1-1 làm sai thống kê của chủ mới.

---

### P2-3 — SSE replay subject-wide: lộ `alert.updated` trước share, `notification.sent` của người khác, `care.*` của link khác

**Mức:** P2 — metadata (ID/thời điểm/quan hệ), không có HR; nhưng vượt phạm vi người dùng.

**Vị trí:** `apps/api/src/realtime/realtime.service.ts:90-99` — chỉ lọc `subject_id + id > cursor`, không lọc `occurredAt`, `recipientUserId`, `linkId`, `type`; payload:
- `apps/api/src/care/care.service.ts:291` (`linkId`, `caregiverUserId`),
- `apps/api/src/notifications/notifications.service.ts:110` (`id`, `incidentId`),
- `alert.updated` có `occurredAt` (detectedAt).

**Tái hiện:**
- `cg4` (`sharedFrom=00:59:58Z`) replay `Last-Event-ID: 0` → `alert.updated` của incident `1b0b6555` với `occurredAt=2026-11-15T00:59:53Z` (5 giây trước share), `alert.updated` khác lúc `00:32:19Z` (27 phút trước share), cùng 6 `notification.sent` cho các incident xảy ra trước share (ID của owner/người khác); `care.accepted` trong stream là link của chính cg4 (không lộ).
- `cg5` (link `152704c6`, sharedFrom 01:00:30Z) replay → ngoài `care.accepted` của link mình, còn thấy `care.accepted` của link `ba0b33e1` (cg4).
- `POST /notifications/:id/read` với ID của người khác → 404 (không đọc được), nhưng ID/incident vẫn bị lộ.

**Kỳ vọng:** docs/03:92 “API kiểm quyền … đăng ký realtime”; event `care.*` chỉ owner/người gắn link; `notification.sent` chỉ recipient; `alert.updated` lọc theo `effectiveFrom` (trừ ngoại lệ open đã chốt).

**Thực tế:** mọi event của subject sau cursor được phát cho mọi caregiver có `receive_alerts`.

**Ảnh hưởng:** người mới biết có cảnh báo trước khi tham gia, biết người thân khác vừa được mời/thu hồi và ID incident/notification của họ. Đây là P2-5 của `v2-caregiver-journey` **vẫn mở**, chưa được sửa.

---

### P2-4 — Policy: preview không được ràng buộc server-side; tự tính digest để publish không cần preview

**Mức:** P2 — lỗi quy trình/kiểm soát thay đổi toàn cục (admin-only).

**Vị trí:**
- `apps/api/src/admin/admin.service.ts:151-153` — digest = `sha256(canonicalPolicyJson(value) + "\nbase_version=" + expectedVersion)`; thuật toán công khai.
- `:416-447` — preview chỉ trả digest, **không ghi DB**, không phát nonce/preview id.
- `:458-476` — publish chỉ so `input.previewDigest` với digest tự tính; không kiểm đã từng gọi preview.

**Tái hiện:**
```bash
# không gọi POST /previews; digest = sha256(canonicalPolicyJson(value) + LF + "base_version=2")
curl -b admin.txt -X PUT "$B/admin/policies/device_runtime" -H 'Content-Type: application/json' \
  -d '{"value":{"heartbeatIntervalSeconds":298,...},"expectedVersion":2,"previewDigest":"<digest tự tính>"}'
# 200 {"version":3,"status":"active"}
```
Audit chỉ có `policy.publish success` (version 3); không có audit preview. Các cổng thiếu/sai digest, preview cũ, 409, race và audit conflict **đều đạt**.

**Kỳ vọng:** spec `fix-policy-preview` và yêu cầu “không bypass bằng request thủ công” muốn publish gắn với một lần preview server-side (preview id/nonce dùng một lần, hoặc lưu preview + hết hạn), không chỉ là hash nội dung công khai.

**Thực tế:** bất kỳ admin nào (hoặc script có quyền admin) tự tính digest và publish bất kỳ policy hợp lệ nào mà không cần màn hình/endpoint preview.

**Ảnh hưởng:** mất lớp “duyệt nội dung trước khi áp dụng” cho ngưỡng offline/freshness/rate limit toàn hệ thống. Không phải leo thang đặc quyền (admin vốn được publish), nên P2.

---

### P2-5 — User enumeration qua register + rate limit chỉ theo email/process, register không giới hạn

**Mức:** P2 — enumeration, khóa tài khoản có chủ đích, lạm dụng tài nguyên.

**Vị trí:**
- `apps/api/src/auth/auth.service.ts:42-51` — register kiểm email tồn tại và trả **409** khác với đăng ký mới.
- `:29`, `:34`, `:382-400` — `loginAttempts` là `Map` trong bộ nhớ process, khóa theo email chuẩn hóa; không theo IP/global; entry chỉ xóa khi email đó đăng nhập đúng hoặc hết cửa sổ.
- `apps/api/src/auth/auth.controller.ts:43-55` — register không có rate limit.

**Tái hiện:**
```text
POST /auth/register {email: ba-an@demo...}      -> 409 "Email này đã được sử dụng."
12 email mới liên tiếp                          -> 201 x12
11 lần login sai cùng email                     -> 401 x10, 429 lần 11
Sau 10 lần sai, login đúng cùng email            -> 429 (khóa 15 phút)
```
Map không có giới hạn/cleanup khi kẻ tấn công dùng nhiều email khác nhau; restart API xóa toàn bộ trạng thái.

**Kỳ vọng:** register không xác nhận tồn tại email (hoặc chuyển sang luồng xác minh), rate limit theo IP + email + global, có cleanup/giới hạn bộ nhớ; login không khóa người dùng hợp lệ chỉ vì kẻ khác đoán sai.

**Thực tế:** enumeration trực tiếp; targeted lockout; register flood tạo user/audit row không giới hạn.

**Ảnh hưởng:** dò email người dùng, khóa mềm tài khoản nạn nhân 15 phút, tăng bộ nhớ/audit log. Với demo local rủi ro thấp nhưng phải chốt trước dữ liệu thật.

---

### P2-6 — Thao tác phá hủy của admin không bắt buộc lý do; rotate key không có lý do/xác nhận

**Mức:** P2 — thiếu bằng chứng kiểm toán cho hành động nhạy cảm (P2-2 của `v2-admin-ops` vẫn mở).

**Vị trí:** `packages/contracts/src/admin.ts:49` (`reason` optional); `apps/api/src/admin/admin.service.ts:279-283` (chỉ ghi metadata nếu có reason); `apps/api/src/devices/devices.service.ts:137-153` (rotate không nhận reason, audit `{}`).

**Tái hiện:**
```bash
PATCH /admin/users/<c9>/status {"status":"disabled"}   -> 200
GET /admin/audit?targetId=<c9>
# {"action":"admin.user.disable","outcome":"success","metadata":{}}
POST /admin/devices/<D3>/rotate-key                    -> 200 {deviceKey}
# audit device.rotate_key metadata {}
```
Key cũ 401, key mới 202; không có reason/ghi chú.

**Kỳ vọng:** disable/rotate bắt buộc lý do 3..500 ký tự + audit lý do (không ghi key); UI xác nhận hai bước.

**Thực tế:** API chấp nhận thiếu lý do; audit không đủ ngữ cảnh điều tra.

**Ảnh hưởng:** không truy được ai/why khóa tài khoản hoặc đổi credential thiết bị; giảm giá trị audit.

---

### P3-1 — Input header thiết bị không hợp lệ gây 500; body quá lớn cũng 500

**Mức:** P3 — robustness/log noise, không lộ secret trong response.

**Vị trí:** `apps/api/src/devices/device-auth.guard.ts:20-22` (không validate UUID trước khi query); `apps/api/src/devices/device-auth.service.ts:17-29` (`eq(devices.id, deviceId)` với raw string).

**Tái hiện:**
```bash
POST /ingest/telemetry -H 'x-device-id: foo' -H 'x-device-key: bar' -d '{}'
# 500 {"code":"INTERNAL","message":"Có lỗi xảy ra..."}
POST /auth/login với body ~200KB
# 500
```
**Kỳ vọng:** 401/422 cho device id sai định dạng; 413 cho body quá lớn.
**Thực tế:** 500, stack được log server-side.
**Ảnh hưởng:** endpoint công khai có thể tạo log error/stack hàng loạt; không đọc được dữ liệu hay secret qua response.

---

### P3-2 — Thiếu security header cơ bản và `Cache-Control: no-store` trên response chứa secret

**Mức:** P3 — defense-in-depth.

**Vị trí:** `apps/api/src/configure-app.ts:9-20` (chỉ cookieParser/origin/CORS, không helmet); `apps/api/src/auth/session-cookie.ts:6-12`; response login/device create/rotate/claim-code/invitation không set cache directive.

**Bằng chứng header:** login/device create/read chỉ có `X-Powered-By: Express`; không có `X-Content-Type-Options`, `X-Frame-Options`, CSP, HSTS, `Referrer-Policy`; response login có `Set-Cookie` nhưng không `Cache-Control: no-store`.

**Kỳ vọng:** tắt `x-powered-by`, thêm header an toàn; `no-store` cho response chứa session/deviceKey/claimCode/invitation token.
**Thực tế:** thiếu; secret one-time có thể bị cache/proxy/history tùy môi trường.
**Ảnh hưởng:** tăng khả năng lộ secret qua cache/proxy; không phải lỗi khai thác trực tiếp trong demo local.

---

### Điểm cần chốt (chưa xếp finding)

- **Admin overview `alerts.open` toàn hệ thống** (`admin.service.ts:609-645`): admin không có care link vẫn thấy số cảnh báo mở (output `alerts.open=7`). Đây là số tổng hợp, không phải payload sức khỏe; docs/02 nói admin không mặc định đọc dữ liệu sức khỏe. Cần chủ dự án chốt giữ/ẩn như `v2-admin-ops` đã nêu.
- **Care link không gác measurements/device status**: `cg3/cg11` có `canReceiveAlerts=false` vẫn đọc measurements/status 200 (measurements có kẹp history nhưng không có permission riêng cho số đo). Đây là P1-2 của `v2-privacy-ethics` **vẫn mở**; tôi không tự đóng, chỉ xác nhận hành vi hiện tại.
- **AI summaries**: DB có 4 bản ghi `ai_summaries` chứa aggregate sức khỏe, không có `actor_user_id`/consent/retention; `GET summary` vẫn ghi mỗi lần xem. Là P1-3/P1-5 của `v2-privacy-ethics`, chưa được sửa trong phạm vi bảo mật này.
- **MQTT API không xác thực device key**: ACL broker là lớp duy nhất; nếu broker bị cấu hình sai hoặc có credential của thiết bị khác, API vẫn tin `device_id` trong topic. P0-1 của `v2-iot-protocol` chỉ được giảm bề mặt bằng config, chưa đóng vì chưa chạy broker/ACL thật.
- **Claim code**: đã có audit create/issue/claim; chưa có throttle/normalize chữ hoa và chưa kiểm timing — P2-3 của `v2-iot-protocol` chỉ đóng một phần.
- **`Secure` cookie**: chỉ bật khi `NODE_ENV=production`; demo HTTP local không có Secure (đúng thiết kế, cần TLS trước khi dùng ngoài localhost).

## 4. Trạng thái finding cũ (đối chiếu, không tự đóng thay reviewer khác)

| Finding cũ | Kết quả kiểm lại | Ghi chú |
| --- | --- | --- |
| `v2-admin-ops` P1-1 — SSE sau admin khóa | **Khớp** | `event: revoked`, đóng, `/me` 401, không event sau; xem 2.2 |
| `v2-admin-ops` P1-2 — thiếu UI admin devices | **Có mã UI** | `apps/web/src/features/admin/AdminDevicesTab.tsx`; chưa chạy UI, không kết luận thay |
| `v2-admin-ops` P1-3 — preview policy không ràng buộc | **Một phần** | Thiếu/sai/stale digest bị chặn + audit; nhưng digest tự tính được → P2-4 mới |
| `v2-admin-ops` P2-2 — reason không bắt buộc | **Vẫn mở** | P2-6; disable/rotate thiếu reason |
| `v2-admin-ops` P2-3 — 409 policy reload/audit | **Audit đã có** | Conflict được ghi `outcome=conflict`; UI reload chưa kiểm |
| `v2-data-integrity` P1-1 — telemetry tương lai | **Đóng ở telemetry** | +10/+15 phút quarantine, không lọt read path; **incident vẫn nhận future** (P1-1 mới) |
| `v2-data-integrity` P1-2 — telemetry trước assignment | **Đóng ở telemetry** | Mẫu 3 ngày trước thuộc assignment A; B không thấy; **incident chưa** (P1-1) |
| `v2-data-integrity` P1-4 — last telemetry theo `received_at` | **Sửa một phần** | Order theo `measured_at`; còn future trong status (P2-1) |
| `v2-data-integrity` P2-1 / P2-4 — notification/readAt | **Đóng phần notification** | List/read tôn trọng share + revoke; readAt idempotent; alert daily/SSE còn (P2-2/P2-3) |
| `v2-data-integrity` P2-3 — synced+null | **Đóng** | 422, không ghi row |
| `v2-privacy-ethics` P1-1 — alert history trước share | **Đóng list/detail** | Closed list rỗng, detail 403; daily/status/SSE/studio còn (P2-1..P2-3, P1-2) |
| `v2-privacy-ethics` P1-2 — quyền không gác số đo | **Vẫn mở** | `cg3/cg11` measurements/status 200 dù mọi quyền false |
| `v2-caregiver-journey` P1-1 | **Đóng list/detail** | Daily/SSE/status/studio vẫn lệch (P2-1..P2-3, P1-2) |
| `v2-caregiver-journey` P2-5 — SSE metadata | **Vẫn mở** | P2-3 |
| `v2-iot-protocol` P0-1 — MQTT không xác thực | **Chưa đóng** | Config tĩnh pass 13/13; chưa chạy broker; API vẫn không kiểm device key |
| `v2-iot-protocol` P1-2 — rotate/cấp khóa | **API đạt** | Rotate cắt key cũ ngay; UI có mã; chưa chạy UI |
| `v2-iot-protocol` P1-4 — clock_status/future | **Telemetry đạt** | Incident future vẫn nhận (P1-1) |

## 5. Phần chưa kiểm / giới hạn

- Không chạy Docker/PostgreSQL thật, không chạy Mosquitto/ACL/ACK thật; chỉ kiểm cấu hình tĩnh `check-mqtt-exposure.mjs` (13/13) và đọc file.
- Không chạy web UI/Playwright, không kiểm mobile/trình duyệt thật; các kết luận UI (nếu có) chỉ từ đọc mã.
- Không chạy toàn bộ Jest; các test hiện có được đọc để đối chiếu, không thay cho chạy lại. Không kiểm tải/đồng thời nhiều process PGlite (P2-8 cũ), không benchmark SSE.
- Không kiểm Web Push/email, rate limit phân tán nhiều instance, TLS thật, backup/retention, firmware/hardware.
- Không kiểm AI provider thật; `AI_BASE_URL` trống nên assistant dùng template. Các kết luận AI chỉ ở mức đường đọc/quyền.
- Không tấn công ngoài localhost; không dùng dữ liệu người thật; chỉ dùng tài khoản/hồ sơ/thiết bị tổng hợp do reviewer tạo trong `.data/review-sec2`.

## 6. Đề xuất thứ tự xử lý

1. **P1-1:** dùng `resolveAssignmentForMeasuredAt` cho `ingestEvent`, cách ly + audit khi `measured_at` ngoài assignment/ tương lai quá dung sai; test T-03 cho incident, không chỉ telemetry.
2. **P1-2:** cho `renderSubjectData`/`data()` dùng `requireHistory` + `assertAction` (hoặc quyền đọc số đo rõ ràng), lọc alert/incident theo `effectiveFrom` và assignment; test caregiver mới + mọi quyền false.
3. **P2-1/P2-2:** kẹp `measured_at <= now` và `>= effectiveFrom` cho status/devices; dùng `windowFrom` cho incident daily-summary; test biên share/future.
4. **P2-3:** lọc SSE theo `occurredAt >= effectiveFrom` (trừ open đã chốt) và theo `recipientUserId/linkId`; không phát `care.*`/`notification.sent` cho người không liên quan.
5. **P2-4:** lưu preview server-side (id/nonce dùng một lần, hết hạn) hoặc bắt buộc audit preview gắn publish; test request thủ công.
6. **P2-5/P2-6/P3:** thống nhất enumeration/rate limit theo IP+email+global, cleanup map, giới hạn register; bắt buộc reason cho disable/rotate; validate UUID header, trả 413; thêm security header/no-store.

## 7. Bảng finding tổng hợp

| ID | Mức | Khu vực | Tóm tắt | Bằng chứng chính |
| --- | --- | --- | --- | --- |
| P1-1 | P1 | Ingest sự kiện | Sự kiện cũ/tương lai gán cho chủ hiện tại, không cách ly; lộ cảnh báo chéo chủ | `incidents.service.ts:317-326,406`; incident Nov 12/2027 nằm ở B, daily/insights/assistant/notification B nhiễm |
| P1-2 | P1 | Studio data | `/workspace-views/:id/data` trả 24h HR/chuỗi/cảnh báo trước share, bỏ qua quyền | `studio.service.ts:237-242,326-371,888-916`; `cg7` thấy HR 88/77 trước `sharedFrom`; `cg3` (quyền false) cũng 200 |
| P2-1 | P2 | Status/devices | Trả mẫu trước share và mẫu tương lai +90s (HR 222) | `devices.service.ts:231-236,326-350`; measurements cùng lúc rỗng |
| P2-2 | P2 | Daily summary | Đếm incident trước share/không thuộc assignment | `measurements.service.ts:179,202-212`; `incidents.total=2`, `observedCount=0` |
| P2-3 | P2 | SSE replay | Lộ alert trước share, notification/care của người khác | `realtime.service.ts:90-99`; replay `cg4`/`cg5` |
| P2-4 | P2 | Policy | Preview digest tự tính được, publish không cần preview | `admin.service.ts:151-153,458-476`; PUT tự digest → 200 version 3 |
| P2-5 | P2 | Auth | Enumeration qua register; rate limit email/process; register không giới hạn | `auth.service.ts:42-51,382-400`; 409 email tồn tại, 12 register 201, 429 sau 10 lần |
| P2-6 | P2 | Admin devices/users | Disable/rotate thiếu reason, audit `{}` | `contracts/admin.ts:49`; `admin.service.ts:279-283`; `devices.service.ts:137-153` |
| P3-1 | P3 | Ingest/auth | Header UUID sai/body lớn → 500 thay vì 401/422/413 | `device-auth.guard.ts:20-22`; `device-auth.service.ts:17-29` |
| P3-2 | P3 | HTTP hardening | Thiếu security header + no-store trên response chứa secret | `configure-app.ts:9-20`; `session-cookie.ts:6-12`; header login/device |

**Điểm cần chốt:** admin `alerts.open` toàn hệ thống; quyền đọc measurements/status của care link; retention/consent của `ai_summaries`; MQTT API chỉ tin topic + ACL broker.

## 8. Tóm tắt 5 dòng

1. Hai P1 mới: `POST /ingest/events` gán sự kiện cũ/tương lai cho chủ hiện tại (lộ cảnh báo chéo chủ, T-03), và `GET /workspace-views/:id/data` trả tới 24h nhịp tim/chuỗi đo/cảnh báo trước `sharedFrom`, bỏ qua quyền care link.
2. Telemetry quarantine/assignment, `synced+null` 422, notifications/read, contacts (max 5/primary/phone), policy 409 + audit, admin devices rotate/claim code, và SSE `revoked` sau khóa/thu hồi/session **đều đạt** theo kiểm thật; nhưng status/devices vẫn lộ mẫu trước share và mẫu tương lai +90s, daily-summary vẫn đếm incident trước share, SSE replay vẫn lộ metadata người khác.
3. Policy vẫn bypass được bằng digest tự tính (admin-only); register cho phép enumeration/không rate limit, login rate limit theo email/process gây targeted lockout; disable/rotate thiếu reason; request header UUID sai trả 500.
4. MQTT/compose chỉ được kiểm cấu hình tĩnh 13/13 (anonymous false, ACL theo device_id, loopback, profile tắt mặc định); chưa chạy broker nên không đóng P0-1 của reviewer IoT và API MQTT vẫn không kiểm device key.
5. Đã dùng API/DB riêng cổng 3401 + `.data/review-sec2`, tạo user/hồ sơ/thiết bị/workspace/policy thử, chạy hơn 150 request, 40 realtime event, 1689 telemetry row (3 cách ly), 134 audit row; không sửa code/docs, chỉ tạo báo cáo này, API đã tắt sau kiểm.
