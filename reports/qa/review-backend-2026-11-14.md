# Review backend độc lập — An Nhiên v1 (14/11/2026)

- **Reviewer:** reviewer-backend độc lập (agent pi, chỉ đọc code/test/config, không chạy git, không sửa gì).
- **Thời điểm chạy kiểm:** 2026-11-14 23:03 → 2026-11-15 00:05 (Asia/Ho_Chi_Minh, UTC+7). Output curl trong báo cáo là giờ UTC.
- **Phạm vi:** docs/02, 03, 04, 12, 14; handoff wave1-be-core, wave1-be-data, wave1-be-alerts, wave2-be-ai, wave2-be-studio, wave3-be-admin; journal điều phối; toàn bộ API `apps/api/src`; contracts `packages/contracts`.
- **Môi trường riêng của reviewer:** `PGLITE_DATA_DIR=.data/review PGLITE_MEMORY= PORT=3100`. KHÔNG đụng `.data/pglite` hay API cổng 3000 (instance có sẵn PID 35092 của môi trường dev được xác nhận còn chạy, không bị can thiệp; reviewer chỉ dùng `.data/review` + cổng 3100 và đã tắt API của mình sau khi xong).
- **Kết quả handoff:** chỉ dùng làm hướng dẫn; mọi kết quả trong báo cáo này do reviewer tự chạy lại.

## Kết luận tổng thể

- **2 finding P1 mở** (rò quyền cảnh báo qua SSE; mất sự kiện incident do dedupe message_id không theo thiết bị) và **5 finding P2**. Không có P0.
- Các cổng build/typecheck/test/seed đều xanh với output thật; hơn 150 kiểm curl trực tiếp chạy trên API thật.
- Theo định nghĩa hoàn thành v1 (docs/14 mục 10): **chưa đạt** — còn P1 mở.

---

## 1. Cổng chất lượng (chạy lại độc lập)

### 1.1 Build contracts + typecheck

```bash
cd C:/MyFolder/Hoc_Tap/project/DATN
pnpm build:contracts          # exit 0
pnpm -r typecheck             # exit 0
```

Output thật:

```
packages/contracts typecheck: Done
apps/web typecheck: Done
apps/api typecheck: Done
tools/simulator typecheck: Done
```

### 1.2 Toàn bộ test API

```bash
cd apps/api
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand
```

Output thật:

```
Test Suites: 14 passed, 14 total
Tests:       100 passed, 100 total
Time:        79.304 s
```

Ghi chú: handoff be-admin có kể một lỗi thoáng qua không tái lập được; lần chạy độc lập của reviewer pass 100/100 ngay lần đầu, không gặp lỗi đó.

### 1.3 Seed idempotent vào DB review (2 lần)

```bash
PGLITE_DATA_DIR=.data/review PGLITE_MEMORY= PORT=3100 pnpm --filter @annhien/api seed   # lần 1
# lần 1: users 3, subjects 2, devices 1, assignments 1, careLinks 1, telemetry 1681, incidents 3, tasks 2, outbox 2
# lần 2: incidents 0, tasks 0, outbox 0 (không thêm mới), telemetry 1681 (tổng trong DB, không nhân bản)
```

Đối chiếu trực tiếp DB (SELECT count) sau 2 lần seed:

```json
{"u":3,"s":2,"d":1,"a":1,"c":1,"t":1681,"i":3,"ie":7,"m":2,"o":2,"re":1}
```

→ **Seed idempotent: ĐẠT.**

### 1.4 Chạy API thật trên cổng 3100

```bash
cd apps/api && pnpm --filter @annhien/api build   # exit 0
PGLITE_DATA_DIR=.data/review PGLITE_MEMORY= PORT=3100 node dist/src/main.js
curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/api/v1/health   # 200
```

Toàn bộ kiểm curl dưới đây chạy trên instance này với cookie jar riêng cho từng vai trò: owner (demo `ba-an@demo.annhien.local`), caregiver (`minh@demo.annhien.local`), admin (`admin@demo.annhien.local`), và các tài khoản đăng ký mới `reviewer-01`, `no-origin`, `victim`, `ratelimit`, `noperm` (đều `@test.local`).

---

## 2. Findings

### P1-1 — SSE không kiểm quyền `canReceiveAlerts`: người thân bị chủ hồ sơ cấm nhận cảnh báo vẫn xem được stream cảnh báo

**Vị trí:**
- `apps/api/src/realtime/realtime.controller.ts:24` — `await this.access.requireSubject(user.id, subjectId);` (chỉ kiểm "có liên kết active", không kiểm permission).
- `apps/api/src/realtime/realtime.service.ts:63` — kiểm lại mỗi vòng cũng chỉ `requireSubject`.
- Đối chiếu đường REST có kiểm đúng: `apps/api/src/incidents/incidents.service.ts:676` — `if (access.role !== 'owner' && !access.permissions.canReceiveAlerts)` → 403.

**Bằng chứng (output thật):** tạo caregiver `noperm@test.local` qua lời mời với `permissions.canReceiveAlerts=false` (accept 201). Sau đó:

```bash
# REST alerts → 403 (đúng)
curl -s -o /dev/null -w "%{http_code}" -b cj-noperm.txt "$B/subjects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/alerts"
# 403

# SSE cùng người dùng → 200 và stream mở, phát toàn bộ lịch sử cảnh báo
timeout 8 curl -s -N -b cj-noperm.txt "$B/subjects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/events"
```

Output stream (trích):

```
id: 4
event: alert.updated
data: {"state":"open","version":2,"subjectId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","incidentId":"1fe621ed-bf52-41d9-abd8-9d64dc40e536","occurredAt":"2026-11-14T16:47:46.573Z","lastRevision":2}
id: 5
event: alert.updated
data: {"state":"acknowledged",...}
id: 7
event: notification.sent
data: {"id":"3759fb4e-8369-4e7f-8cf2-b0a29e88c819","incidentId":"1fe621ed-bf52-41d9-abd8-9d64dc40e536"}
```

**Tác động:** vi phạm FR-02 ("giới hạn quyền theo hồ sơ") và NFR-01 ("kiểm quyền theo hồ sơ cho REST, realtime, export và AI"). Người thân bị tước quyền nhận cảnh báo vẫn thấy trạng thái incident (open/acknowledged/resolved + thời điểm xảy ra) và cả sự kiện `notification.sent` của người nhận khác khi replay từ cursor 0 hoặc theo dõi trực tiếp. Thu hồi cả link thì stream bị ngắt đúng (đã kiểm riêng, không lỗi), nhưng ranh giới quyền chi tiết của care link chưa được áp cho realtime.

**Cách tái hiện:** (1) đăng nhập owner, `POST /subjects/:id/invitations` với `canReceiveAlerts:false`; (2) login tài khoản được mời, `POST /invitations/:token/accept`; (3) `GET /subjects/:id/alerts` → 403 nhưng `GET /subjects/:id/events` → 200 kèm `alert.updated`.

**Đề xuất:** gate SSE bằng cùng điều kiện của listAlerts (owner hoặc `canReceiveAlerts`), hoặc lọc kiểu sự kiện theo permission trong `RealtimeService.stream`; đồng thời xem lại việc replay `notification.sent`/`care.*` cho mọi người có link.

### P1-2 — Dedupe sự kiện incident theo message_id toàn cục (không theo thiết bị): sự kiện của thiết bị khác bị coi là duplicate và bị rơi

**Vị trí:** `apps/api/src/incidents/incidents.service.ts:204-207` — pre-check trùng:

```ts
const storedMessage = await tx
  .select({ incidentId: incidentEvents.incidentId, eventRevision: incidentEvents.eventRevision })
  .from(incidentEvents)
  .where(eq(incidentEvents.messageId, envelope.message_id))   // thiếu điều kiện deviceId
  .limit(1);
```

Trong khi unique index đúng theo thiết bị: `apps/api/src/database/schema.ts:342` — `uniqueIndex('incident_events_message_uq').on(table.deviceId, table.messageId)`.

**Bằng chứng (output thật):** thiết bị demo A (dddddddd-…) gửi sự kiện `message_id=rev-xmsg-1` → accepted, incident `8eed3ebd`. Thiết bị B (REV-001, thuộc chủ khác) gửi sự kiện riêng của nó với cùng `message_id=rev-xmsg-1`:

```bash
curl -s -X POST $B/ingest/events -H "x-device-id: a1673f80-e7a8-41ea-9609-29f30b86bcdb" \
  -H "x-device-key: <key của B>" -d '{..."message_id":"rev-xmsg-1","device_id":"a1673f80-...","incident_id":"x-inc-B","event_type":"fall.candidate"...}'
```

Output (sai):

```json
{"status":"duplicate","sourceMessageId":"rev-xmsg-1","receivedAt":"2026-11-14T16:54:59.611Z","incidentId":"8eed3ebd-0a04-48f1-8033-1a7e8bde1204","acceptedRevision":1,"code":null,"message":null}
```

ACK trả `duplicate` trỏ vào incident **của thiết bị A**; bản tin của B không được ghi, không có audit.

**Tác động:** thiết bị dùng message_id dạng đếm (rất phổ biến ở firmware, ví dụ `msg-1`, `msg-2` theo boot) sẽ bị mất sự kiện bất kỳ khi trùng số hiệu với bất kỳ thiết bị nào khác. Nếu bản tin bị rơi là `fall.confirmed`/`sos.confirmed` thì **cảnh báo không bao giờ mở**, và thiết bị tin ACK `duplicate` nên xóa sự kiện khỏi hàng đợi bền → mất vĩnh viễn.

**Cách tái hiện:** hai thiết bị đều có assignment mở; gửi cùng `message_id` với nội dung khác nhau từ thiết bị thứ hai → nhận ack duplicate thay vì accepted.

**Đề xuất:** thêm `and(eq(incidentEvents.deviceId, device.id))` vào pre-check; đối xứng với cách telemetry ingest đã làm đúng (`telemetry-ingest.service.ts`, lọc theo `(deviceId, messageId)`).

### P2-1 — `requireHistory` từ chối thẳng khi `from < sharedFrom`: caregiver vừa được chấp nhận bị 403 trên mọi cửa sổ mặc định trong ~24 giờ đầu

**Vị trí:** `apps/api/src/access/access.service.ts:97-113` (`effectiveFrom = max(historyDays window, sharedFrom)`; `from < effectiveFrom` → 403). Cửa sổ mặc định của measurements là `now-24h`.

**Bằng chứng:** lời mời `historyDays=7` được accept lúc `16:44:39Z`; ngay sau đó:

```bash
# from = now-2d (trong hạn 7 ngày đã cấp) → 403
curl -s -b cj-stranger.txt "$B/subjects/.../measurements?from=<now-2d>"
# {"code":"FORBIDDEN","message":"Khoảng thời gian yêu cầu vượt quá quyền xem lịch sử được chia sẻ.","details":{"effectiveFrom":"2026-11-14T16:44:39.596Z"}}
```

Tương tự `daily-summary?date=<hôm qua>` → 403. Với `from=now` → 200 (rỗng). Tức là caregiver mới chấp nhận **không đọc được bất kỳ dữ liệu lịch sử nào trong 24 giờ đầu**, dù chủ hồ sơ vừa cấp 7 ngày.

**Trạng thái:** handoff wave1-be-data rủi ro 6 đã nêu, ghi "cần quyết định chính sách". Reviewer xếp P2 vì chưa chốt nhưng ảnh hưởng trực tiếp trải nghiệm demo chia sẻ.

**Đề xuất:** kẹp mềm (clamp `from` về `effectiveFrom` thay vì 403) cho cửa sổ mặc định, hoặc chốt rõ hành vi trong docs/04.

### P2-2 — Thiếu nhất quán 403/404 trên cùng một ranh giới quyền cảnh báo

**Vị trí:** list: `apps/api/src/incidents/incidents.service.ts:676` (caregiver có link nhưng thiếu `canReceiveAlerts` → **403**); detail `GET /alerts/:id` (getAlert): cùng người dùng → **404**.

**Bằng chứng (cùng cookie noperm, cùng subject):**

```bash
GET /subjects/aaaaaaaa-.../alerts            # 403
GET /alerts/ffffffff-ffff-4fff-8fff-ffffffffffff   # 404
```

**Tác động:** docs/04 khuyến nghị thống nhất cách dùng 404 cho tài nguyên riêng tư để tránh dò tồn tại; hai mã khác nhau cho cùng ranh giới gây khó cho client phân biệt "không có quyền" và "không tồn tại".

**Đề xuất:** chốt một quy ước (nên: 404 khi không có link; 403 khi có link nhưng thiếu permission) và áp đồng nhất cho list/detail/status.

### P2-3 — Tổng bước chân daily-summary bị thổi phồng khi counter reset giữa boot

**Vị trí:** `apps/api/src/measurements/measurements.service.ts:440-472` (`computeSteps`): sau khi gặp counter giảm (reset về 0), delta âm bị bỏ, nhưng bước nhảy `0 → giá trị tích lũy` tiếp theo được cộng **nguyên vẹn**. Seed tạo đúng mẫu này: `apps/api/src/database/seed.ts:238` — `stepsSinceBoot = index % 23 === 0 && index > 0 ? 0 : steps`.

**Bằng chứng (output thật):**

```bash
GET /subjects/aaaaaaaa-.../daily-summary?date=2026-11-13
{"date":"2026-11-13","heartRate":{"avg":69.3,...},"steps":{"total":44944,"completeness":"partial","notes":["Counter steps giảm trong boot boot-dem (3292 → 0); bỏ delta âm, có thể đã reset.",...]}}
```

Số bước tăng thật trong ngày theo seed chỉ ~800–900 (delta 2/12 mỗi 5 phút); total hiển thị 44.944 (≈ 55×). Dữ liệu có gắn cờ `partial` + notes (không im lặng sai), nhưng con số total gây hiểu nhầm nếu UI hiển thị trực tiếp.

**Đề xuất:** khi đã phát hiện counter giảm trong một boot, bỏ qua mọi delta của boot đó cho tới khi counter vượt giá trị lớn nhất đã thấy của boot (hoặc đánh dấu cả boot `unreliable`); cân nhắc sửa cả mẫu seed sao cho giống hành vi firmware thật (reset phải đi kèm boot_id mới theo docs/04).

### P2-4 — Không có unique index chặn 2 invitation pending cùng (subject, email) — race tạo 2 bản pending

**Vị trí:** `apps/api/src/database/schema.ts:206-208` — invitations chỉ có `invitations_token_hash_uq` và `invitations_subject_idx`; không có partial unique cho (subject_id, email_normalized) khi `accepted_at is null and revoked_at is null`. Service tạo invitation có pre-check nhưng không khóa dòng.

**Tác động:** hai request đồng thời có thể tạo 2 lời mời pending cùng email (accept được chặn bởi `care_links_active_uq` ở schema.ts:179-181 và FOR UPDATE trong `care.service.ts`, nên không tạo được 2 link). Hậu quả giới hạn ở 1 lời mời thừa trong danh sách của owner cho tới khi hết hạn.

**Trạng thái:** handoff wave1-be-core rủi ro 3 đã nêu, đề nghị lead thêm partial unique index khi sở hữu schema.

### P2-5 — PGlite chỉ an toàn với 1 tiến trình trên một data dir; tiến trình thứ hai có thể crash WASM (đã quan sát, không có khóa trong code)

**Vị trí:** `apps/api/src/database/database.ts` (`createDatabase`) chỉ `mkdirSync` rồi mở `new PGlite(dataDir)` — không kiểm tra `postmaster.pid`/khóa.

**Bằng chứng (2 lần, output thật):** mở PGlite thứ hai trỏ vào `.data/review` khi API cổng 3100 đang chạy (hoặc ngay sau khi bị kill cứng) → tiến trình thứ hai chết với:

```
RuntimeError: Aborted(). Build with -sASSERTIONS for more info.
    at abort (…\@electric-sql+pglite@0.5.16\…\dist\index.cjs:11:76237)
```

(Đối chứng: mở `.data/pglite` khi API 3000 đang chạy vẫn đọc SELECT bình thường — hành vi không xác định, có lúc crash có lúc không; tiến trình API đang chạy không bị hỏng trong các lần quan sát.)

**Tác động:** rủi ro vận hành dev: `pnpm seed`/`db:migrate` chạy trùng data dir với API đang chạy có thể crash hoặc ghi đè lẫn nhau. Lưu ý ghi vào README/hướng dẫn chạy.

---

## 3. Đã kiểm và KHÔNG có lỗi (output thật, API cổng 3100 + DB review)

**Auth & phiên:** register 201 (cookie `an_session` có `HttpOnly; SameSite=Lax`, Secure chỉ bật khi production — `auth/session-cookie.ts`); `GET /me` 200; thiếu cookie 401; sai mật khẩu 401; logout 204 rồi `me` 401; logout không cookie 204 (idempotent); cookie rác 401; email trùng 409; email sai/password ngắn/displayName rỗng 422 (details liệt kê path); uuid param sai 422; JSON body hỏng 400. **Rate limit login:** 10 lần sai → lần thứ 11 kể cả đúng mật khẩu cũng 429 `RATE_LIMITED` (`auth/auth.service.ts:22,166-175`).

**Origin/CSRF:** POST/PATCH/PUT/DELETE với `Origin: https://evil.example` → 403 `Origin không được phép cho thao tác ghi.`; Origin đúng `http://localhost:5173` → pass; không có Origin → pass (cơ chế xác thực riêng, đúng thiết kế middleware `origin-check.middleware.ts`); GET với Origin lạ → 200 (safe method).

**Subjects:** list/detail đúng role (owner permissions 3650 ngày); người lạ → 404 (không lộ tồn tại); caregiver xem 200; caregiver PATCH 403; owner PATCH 200; tạo hồ sơ 201; timezone sai 422. UTF-8 round-trip kiểm bằng `od -t x1z`: `"Bà Trần Thị An"` lưu/trả đúng bytes `42 c3 a0 20 54 72 e1 ba a7 6e …` (nhiễu encoding hiển thị trước đó là do console Windows của reviewer, không phải lỗi API).

**Care/invite:** xem invitations: người lạ 404, caregiver 403; mời chính chủ 422; tạo 201 chỉ trả `token` một lần; mời trùng pending 409; `GET /invitations/:token` công khai **không chứa email**; accept sai tài khoản 403; accept đúng 201 tạo link active; dùng lại token 404; người được mời thấy hồ sơ role caregiver đúng permissions (historyDays 7); thu hồi 204 → **mất quyền ngay lập tức** trên subject/measurements/export (404). Token lưu `sha256` trong DB (`invitations.token_hash`, `care.service.ts:128`).

**Devices/claim:** non-admin tạo device 403; admin tạo 201 trả `deviceKey` + `claimCode` một lần (hết hạn 15 phút); ingest trước khi claim → 202 ack `rejected DEVICE_NOT_CLAIMED`, không ghi dòng; caregiver claim hồ sơ có link 403; người lạ 404; owner claim 201; dùng lại claimCode 422; release: người không có link 404, owner 200 (đóng `endedAt`, giữ dữ liệu cũ); ingest sau release → `DEVICE_NOT_CLAIMED`; release lần 2 → 404. **Rotate key:** key cũ 401, key mới dùng được (`POST /admin/devices/:id/rotate-key`); `GET /admin/devices` không có trường hash/credential.

**Ingest dedupe (telemetry):** lặp lại cùng message_id + payload giống → 202 `duplicate`; cùng message_id khác payload → 409 `message_id_conflict`; cùng (boot_id, sequence) khác message_id → 409 `sequence_conflict`; sai khóa 401; header `x-device-id` lệch `device_id` trong body → 403; `clock_status=unsynced` đi kèm `measured_at` → 422; `poor_signal` + HR khác null → 422; HR 500 → 422; `schema_version=2.0` → 422. **Rate limit ingest:** 121/130 request trong 1 phút → từ request 121 trả 429 (ngưỡng 120 lấy từ policy v1 vừa publish — xác nhận policy áp dụng nóng).

**Measurements/CSV:** owner 200 kèm items/coverage/gaps/excludedUnsyncedCount; `from>to` 422; khoảng >31 ngày 422; pagination cursor; `export.csv` 200 `text/csv; charset=utf-8` có BOM `EF BB BF` + header đúng; người lạ 404; export >31 ngày 422; `daily-summary` ngày tương lai 422; HR không có mẫu valid → null (không bịa 0).

**Alerts/incidents:** `fall.candidate` 202 nhưng **ẩn** khỏi list/detail (suspected); `fall.confirmed` mở cảnh báo; gửi trùng event → 202 `duplicate`; revision cũ đến sau → accepted, không lùi trạng thái; hai payload khác nhau cùng revision → từ chối + audit; ack sai version → 409 kèm `currentVersion`; caregiver `canAcknowledge` → 200 (state acknowledged, version+1); caregiver `canResolve=false` → 403; owner resolve 200; resolve lần 2 → 409; reason <3 ký tự → 422; người lạ/admin (không link) ack → 404. **Race 2 ack đồng thời** (cùng version đúng): một 200 `applied`, một 409 `conflict`, `alert_actions` ghi đủ 2 dòng, không mất lịch sử. SOS mở trực tiếp không cần candidate. Cờ `late` đúng khi sự kiện đến sau detectedAt >5 phút.

**SSE:** không phiên 401; không quyền 404; stream nhận `alert.updated` mới theo thời gian thật; `Last-Event-ID`/cursor replay đúng từ cursor; **thu hồi care link giữa chừng → `event: revoked` rồi đóng stream** (đã kiểm với link riêng, không ảnh hưởng link demo).

**Notifications/outbox:** worker đánh dấu sent + realtime `notification.sent` (quan sát qua SSE); list đúng người nhận + `unreadCount`; mark read của mình 204, của người khác 404.

**Assistant:** không cấu hình AI → summary 200 `status=degraded, provider=template` kèm disclaimer đúng hằng số + số liệu thật (1681 mẫu, HR trung bình 68.3); caregiver có `view_ai` 200; admin không link 404; `from` ngoài lịch sử 403; khoảng >31 ngày 422; câu hỏi <3 ký tự 422; khi AI tắt, ask trả lời từ chối lịch sự không bịa.

**Studio:** tạo view 201 (subject scope); caregiver tạo trên hồ sơ người khác 403; PUT draft sai `baseRevision` → 409 kèm `currentRevision`; preview mẫu (`sample:true`, không ghi DB) và preview dữ liệu thật (`previewSubjectId`, sample false); publish sai digest → 409 `APPROVAL_STALE` kèm `currentDraftDigest`; publish đúng → 201 revision 1 active, bản cũ superseded; caregiver thấy published với `draftDigest:null` (draft bị che); người lạ xem detail 404; caregiver publish 403; publish v2 rồi **rollback → tạo publication mới revision 3**, lịch sử đủ (3 active, 2 superseded, 1 superseded); rollback tới bản đang active → 409; data endpoint 200.

**Tasks:** list chỉ bản open mặc định; caregiver đóng 403; owner đóng 200 (`status:done`); đóng lại 409 kèm `{status, closedAt}`.

**Admin:** overview 200 đếm đúng (users 5 active, devices 2 offline, alerts open 2, outbox pending 0); user thường 403; danh sách user **không chứa passwordHash/tokenHash** (chỉ id/email/displayName/role/status/createdAt); audit list metadata đã lọc (chỉ status/digest/revision — không payload sức khỏe); audit với user thường 403; policy GET version 0 default; **preview policy không ghi DB**; PUT sai `expectedVersion` → 409 `APPROVAL_STALE` kèm `currentVersion/currentDigest`; PUT đúng → 200 version 1 active (ingest dùng ngay ngưỡng mới); key lạ 404; search user theo query hoạt động. **Disable user:** session cũ 401 ngay lập tức; đăng nhập lại 403 "Tài khoản đang bị khóa"; không tự disable chính mình (409); enable lại 200.

**Quyền chéo (NFR-01):** admin không có care link **không đọc được** dữ liệu sức khỏe qua mọi đường: subject 404, measurements 404, export.csv 404, SSE 404, assistant summary 404, alerts 404; tương tự với người lạ. Caregiver bị thu hồi mất quyền trên mọi đường đã liệt kê.

**Không lộ secret:** token session lưu `sha256` (`auth.service.ts:119`), deviceKey/claimCode chỉ trả một lần khi tạo/rotate, invitation token một lần, public preview không có email, admin API không trả hash, log không in payload sức khỏe (chỉ thấy WARN đăng nhập sai trong log API của reviewer).

**Input xấu khác:** envelope thiếu trường/strict → 422 với chi tiết path; query `cursor` sai định dạng bị từ chối; `expiresInHours` ngoài 1–720 → 422 (đã kiểm qua schema + test suite).

---

## 4. Ghi chú môi trường và giới hạn

- Nhiễu encoding: một lần PATCH qua shell Windows làm hỏng dấu tiếng Việt trong **dữ liệu test của reviewer** (không phải lỗi API — đã chứng minh bằng `od` và khôi phục). Các lệnh chuẩn hóa sau đó dùng payload qua file UTF-8.
- Rate limit (auth/assistant/ingest) là bộ nhớ **một tiến trình** — đã ghi trong handoff, đúng như code; nhiều instance sẽ đếm riêng.
- PGlite đơn tiến trình (xem P2-5). Chưa chạy trên PostgreSQL thật — ghi rõ trong docs/14 là giới hạn đã biết.
- MQTT: v1 chưa xác thực khóa thiết bị trên MQTT và chưa publish ACK ngược (handoff wave1-be-data ghi rõ); reviewer không có broker nên không kiểm đường này.
- Sự kiện đến muộn >5 phút: có cờ `late` trên alert, chưa có thông báo "nhận trễ" riêng (handoff be-alerts đã nêu, chưa chốt).
- Quy trình review tuân thủ: chỉ đọc code/test/config, không chạy git, không sửa file nào ngoài báo cáo này; DB riêng `.data/review`, cổng riêng 3100 (đã tắt sau khi xong); không đụng `.data/pglite` và API 3000.
- Không có mục nào bị kẹt quá 15 phút.

---

## 5. Tóm tắt

| Mức | Số | Mã |
| --- | --- | --- |
| P0 | 0 | — |
| P1 | 2 | SSE không kiểm `canReceiveAlerts`; dedupe incident theo message_id không theo thiết bị |
| P2 | 5 | requireHistory chặn caregiver mới ~24h; 403/404 không nhất quán alerts list/detail; steps daily-summary bị thổi phồng sau reset giữa boot; thiếu partial unique invitation pending; PGlite đơn tiến trình |

Cổng chất lượng đạt: `pnpm build:contracts` exit 0, `pnpm -r typecheck` exit 0, full test suite 14/14 suites — 100/100 tests pass, seed 2 lần idempotent. Toàn bộ kiểm curl REST/SSE/export/AI/studio/tasks/admin ghi ở mục 3 đều cho kết quả đúng hợp đồng.

**Kết luận:** chưa đạt tiêu chí hoàn thành v1 theo docs/14 mục 10 (còn 2 P1 mở). Sau khi fix P1, reviewer nên chạy lại 2 kịch bản tái hiện ở mục 2 để xác nhận.
