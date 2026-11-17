# Review độc lập v2 — Bảo mật & phân quyền backend (An Nhiên v1.1)

- **HEAD:** `8434d66cb8ecb3d92a9a054f87f843d16dbaa3e7` (`perf(web): tách chunk theo route và thống nhất quyền xem cảnh báo`), nhánh `worktree qa-backend-security`; `git status --porcelain` sạch trước khi review.
- **Người review:** phiên reviewer độc lập (worker Orca), **không sửa code/docs/test**, không commit; chỉ tạo báo cáo này trong `reports/qa/`.
- **Thời điểm:** 2026-11-15 ~06:45–07:15 (Asia/Ho_Chi_Minh). Giờ trong output curl là UTC.
- **Phạm vi:** chỉ đọc + chạy lại độc lập. Không dùng kết luận từ `reports/handoffs/`, `reports/qa/review-backend-2026-11-14.md` hay `docs/14` mục 11 làm bằng chứng; các kết luận dưới đây do tôi tự chạy trên API/DB riêng.
- **Không đóng finding của người khác.** Các P2 cũ vẫn giữ trạng thái; chỗ nào hành vi đã đổi, tôi ghi rõ "đối chiếu, không đóng".

---

## 1. Kết luận tổng thể

| Mức | Số | Nội dung ngắn |
| --- | --- | --- |
| **P0** | **0** | Không tìm được đường đọc dữ liệu sức khỏe khi không có phiên/care link; admin không có care link bị chặn ở mọi đường đã thử. |
| **P1** | **3** | (1) Thu hồi care link **không** chặn `/notifications`; (2) `canAcknowledge`/`canResolve` một mình đủ để **ghi** trạng thái cảnh báo dù `canReceiveAlerts=false` (và API trả 403 sau khi đã commit); (3) ingest MQTT **không** xác thực khóa thiết bị + cấu hình broker mẫu `allow_anonymous true` → chèn dữ liệu sức khỏe giả (có điều kiện bật MQTT). |
| **P2** | **10** | Lockout DoS qua rate limit đăng nhập; enumeration email (409 + timing); share boundary không áp cho alerts/SSE; cursor alerts lỗi → 500; logout/disable không ngắt SSE đang mở (vi phạm T-01); thiếu security headers/`Cache-Control`/`Secure` mặc định; admin đọc+đóng task gắn hồ sơ không cần care link; password policy yếu; cửa sổ mặc định `export.csv`/`assistant/ask` trả 403 oan; bề mặt DoS có xác thực (query 31 ngày không giới hạn, export không giới hạn dòng, SSE không giới hạn kết nối, claim code không throttle). |
| **P3** | **8** | Health lộ version/cấu hình; `X-Request-Id` do client đặt; log 500 ghi URL+SQL; audit lưu email người dùng; `/alerts/:id` lộ tên+quyền caregiver khác; không có danh sách phiên/logout-all; rate limit trong bộ nhớ; `/status` trả HR mới nhất cho mọi link. |

Cổng chất lượng chạy lại trên checkout này: `pnpm build:contracts` (tsc) + `pnpm --filter @annhien/api build` (`nest build`) exit 0; **jest API: 14/14 suite — 100/100 test pass** (86.0 s). Tôi **không** chạy `pnpm -r typecheck` toàn repo và không chạy build/test của `apps/web`. Chi tiết ở §3.

---

## 2. Môi trường review (tách biệt hoàn toàn với lead)

```bash
# Node/pnpm
node -v   # v24.22.2
pnpm -v   # 12.5.1

# Chưa có node_modules trong worktree → cài theo lockfile (1m55s)
pnpm install --prefer-offline --frozen-lockfile

# Build
pnpm build:contracts && cd apps/api && pnpm build

# Seed + API riêng (KHÔNG dùng .data/pglite, KHÔNG dùng cổng 3000/5173)
cd apps/api
PGLITE_DATA_DIR=.data/review-sec PORT=3245 pnpm seed
PGLITE_DATA_DIR=.data/review-sec PORT=3245 NODE_ENV=development node dist/src/main.js
# API thứ hai cho thí nghiệm MQTT (DB riêng, cổng riêng)
PGLITE_DATA_DIR=.data/review-sec-mqtt PORT=3246 pnpm seed
PGLITE_DATA_DIR=.data/review-sec-mqtt PORT=3246 MQTT_URL=mqtt://localhost:1885 node dist/src/main.js
```

- Cổng `3200/3210/3220` đã bị **phiên reviewer khác** chiếm (`netstat` cho thấy LISTENING do PID không phải của tôi); tôi dùng **3245/3246** và broker nội bộ **1885**.
- DB tạo mới: `.data/review-sec`, `.data/review-sec-mqtt` (đều nằm ngoài Git, `git status` vẫn sạch). Không mở/ghi `.data/pglite`, không gọi API 3000, không sửa web 5173.
- Dữ liệu thử: tài khoản `@test.local` tự đăng ký (`attack-sec`, `victim-sec`, `care2-sec`…`care6-sec`, `flood-*`, `spam-*`, `pw-*`), lời mời chia sẻ do owner demo tạo, thiết bị do admin tạo (`SEC-REV-001`).
- Broker MQTT thí nghiệm: `aedes` (devDependency của repo) chạy tại `127.0.0.1:1885`, **không** username/password — mô phỏng đúng `infra/mosquitto/mosquitto.conf`.
- Sau khi xong: đã tắt cả 3 tiến trình (`taskkill`), kiểm lại `netstat` không còn listener 3245/3246/1885.

---

## 3. Cổng kiểm đã chạy (output thật)

```bash
cd apps/api && node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand
# Test Suites: 14 passed, 14 total
# Tests:       100 passed, 100 total
# Time:        85.996 s
```

```bash
git log -3 --oneline
# 8434d66 perf(web): tách chunk theo route và thống nhất quyền xem cảnh báo
# 1080c5c docs: ghi worklog và bài học rà giao diện trực quan
# d4ba436 feat(web): hoàn thiện giao diện responsive và rà soát trực quan
```

Không chạy: `pnpm -r typecheck` (đã chạy `nest build` + `tsc` của contracts), `pnpm --filter @annhien/web test/build`, E2E Playwright, load/stress. Vì vậy báo cáo này **không** kết luận gì về frontend.

---

## 4. Đã kiểm và **không** thấy lỗi (có output)

Tất cả dưới đây chạy trên API 3245/3246 + DB riêng; mã 4xx/5xx là mã thật.

| Nhóm | Phép thử | Kết quả |
| --- | --- | --- |
| Auth cơ bản | register 201; login 200; `/me` 200; cookie rác/sửa 1 ký tự → 401; logout 204 → `/me` 401; logout không cookie → 204 | đúng hợp đồng |
| Cookie | `Set-Cookie: an_session=…; Path=/; Expires=+7d; HttpOnly; SameSite=Lax` (không `Secure` vì `NODE_ENV=development`, xem P2-6) | đúng thiết kế, có ghi chú |
| Session khi disable user | admin `PATCH /admin/users/:id/status` → session cũ 401 ngay, login lại 403 `Tài khoản đang bị khóa`; admin tự disable → 409 | đúng |
| CSRF/Origin | POST/PATCH/DELETE `Origin: https://evil.example` → 403 `Origin không được phép cho thao tác ghi.` (kể cả `POST /auth/logout`); GET với Origin lạ → 200 (safe method); POST **không** có Origin → 201 (xem P2-6) | đúng thiết kế, thiếu defense-in-depth |
| CORS | Preflight từ `https://evil.example` trả `Access-Control-Allow-Origin: http://localhost:5173` (không khớp → browser chặn); preflight/normal từ web origin đúng, `credentials: true`, `Vary: Origin` | đúng |
| IDOR — người lạ (không link) | `GET subjects/:id`, `/measurements`, `/export.csv`, `/alerts`, `/alerts/:id`, `/assistant/summary`, `/status`, `/devices`, `/care-links`, `/invitations` → **404 toàn bộ**; `POST /alerts/:id/acknowledge\|resolve`, `POST devices/claim`, `POST devices/:id/release`, `POST invitations` → 404; `GET /maintenance-tasks` → 200 `{items:[]}` | đúng |
| IDOR — admin **không** care link | cùng bộ đường dữ liệu sức khỏe → **404 toàn bộ**; `GET /subjects` → 0 item; `GET /notifications` → 0 item; `POST acknowledge` → 404; `/admin/overview` chỉ trả số đếm tổng hợp (`users/subjects/devices/alerts/tasks/outbox`), không có HR/tên hồ sơ | đúng NFR-01/FR-11 |
| IDOR chéo chủ | owner hồ sơ A `DELETE /subjects/B/care-links/:id` → 404; caregiver tạo/list invitations → 403; caregiver `PATCH /subjects/:id` → **403** `Chỉ chủ hồ sơ được thực hiện thao tác này.` (owner `PATCH` cùng body → 200) | đúng |
| Notification IDOR | user khác `POST /notifications/:id/read` trên notification của care4 → 404 | đúng (nhưng xem P1-1 cho trường hợp **thu hồi link**) |
| Studio | view scope `subject` của owner: stranger/caregiver/admin khác → 404 cả `GET view` và `GET data`; care ghi draft → 403; user thường tạo view `scope=global` → 403 `Chỉ quản trị viên…` | đúng |
| Ingest HTTP — auth | thiếu header → 401 `DEVICE_AUTH_FAILED`; sai key → 401; `x-device-id` không tồn tại → 401; `device_id` trong body khác header → 403; thiết bị chưa claim → 202 `rejected DEVICE_NOT_CLAIMED`, không ghi | đúng |
| Ingest — dedupe/schema | gửi lại y hệt → 202 `duplicate`; cùng `message_id` khác payload → 409 `message_id_conflict`; cùng `(boot_id, sequence)` khác `message_id` → 409 `sequence_conflict`; HR 500 → 422; `clock_status=unsynced` + `measured_at` → 422; schema strict (extra key) → 422; `state` lặp query → 422; `__proto__` trong body → 422 | đúng docs/04 |
| Ingest rate limit | policy active `maxTelemetryPerMinute=60`; 55 request liên tiếp 202 rồi **429** từ request thứ 56 (5 request trước đó trong cùng cửa sổ) | đúng, là rate limit trong bộ nhớ (1 tiến trình) |
| Device key rotation | admin `POST /admin/devices/:id/rotate-key` → key cũ 401, key mới 202; `GET /admin/devices` chỉ có `id/serial/label/status/firmwareVersion/lastSeenAt/createdAt/assignedSubjectId`, **không** hash/key | đúng |
| Invitation token | preview công khai **không** có email (chỉ subjectName/inviterName/permissions/expiry); token dùng lại → 404; token sau khi accept → 404; accept sai tài khoản → 403; token random → 404; DB lưu `sha256(token)` | đúng FR-02 |
| Share revoke (REST) | care4 bị revoke → `GET subjects/:id`, measurements, export.csv, alerts, assistant, devices, status đều **404**; `GET /subjects` không còn hồ sơ | đúng — trừ `/notifications` (P1-1) |
| SSE share revoke | stream care5 đang mở, owner `DELETE care-links/:id` → stream nhận `event: revoked` rồi đóng; `GET subjects/:id` sau đó 404 | đúng |
| Inference/filter injection | admin search `query=%` và `query=_` → 0 item (escape LIKE đúng); `query=' OR 1=1--` → 0 item; `measurements?from=2026-01-01' OR 1=1--` → 422; `limit=99999`/`-1` → 422; cursor measurements sai → 422 | đúng (trừ cursor alerts, P2-4) |
| CSV export | 920 dòng/3 ngày, 98.534 byte, BOM `EF BB BF`, `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="subject-<uuid>-<from>-<to>.csv"`; **0 ô** bắt đầu bằng `= + - @ TAB CR`; mọi cột đều do server sinh (timestamp, số, enum `quality/clock_status`, `source` ∈ {`http`,`mqtt`,`simulator`}) → **không có bề mặt CSV formula injection** ở v1 | đúng |
| Log/secret | grep toàn bộ log API (126 dòng: startup + WARN/ERROR, không có access log) cho `demo-device-key`, `demo-an-nhien-2026`, `demo-admin-2026`, mật khẩu test, `an_session=`, deviceKey, claimCode → **0 hit**; audit `metadata` (100 dòng gần nhất) chỉ có khóa `careLinkId, code, digest, emailNormalized, expiresInHours, from/to, incidentId, messageId, outcome, periodStart/End, provider, reason, revision, rowCount, scope, serial, status, subjectId, timezone` — **không** có HR/steps/evidence | đúng NFR-05 (có 2 ghi chú P3) |
| SSE payload | replay 24 event của owner: **0** chuỗi `heart\|steps\|bpm`; payload chỉ `subjectId, incidentId, state, version, occurredAt`, `care.*` (linkId/userId), `notification.sent` (id) | đúng data minimization |
| Assistant quyền | caregiver `canViewAi=false` → 403; người lạ → 404; thiếu dữ liệu/không cấu hình AI → fallback template + `degradedReason` | đúng |
| Health | `GET /api/v1/health` (public) trả `{status, database, ai, version}` | đúng thiết kế, xem P3-1 |

---

## 5. Findings

### P1-1 — Thu hồi care link **không** có hiệu lực trên `/notifications` (đọc + đánh dấu đã đọc)

**Vị trí**
- `apps/api/src/notifications/notifications.service.ts:184-215` — `listNotifications(userId)` chỉ lọc `notification_outbox.recipientUserId = userId AND status='sent'`, **không** kiểm `access.resolve`/`careLinks.revokedAt`.
- `apps/api/src/notifications/notifications.service.ts:231-246` — `markRead` cũng chỉ lọc theo `recipientUserId`.
- Đối chiếu: `docs/02` FR-02 ("yêu cầu tiếp theo và luồng realtime mất quyền ngay khi bị thu hồi"), `docs/06` mục "Thu hồi chia sẻ" ("người thân mất quyền đọc API/AI/export và stream đang mở"), `docs/04` ("Tài khoản người thân đã bị thu hồi không nhận notification còn trong hàng đợi…").

**Tái hiện (output thật)**
1. Owner mời `care4-sec@test.local` (`canReceiveAlerts=true, historyDays=7`), care4 accept 201.
2. Thiết bị demo gửi `fall.confirmed` (`message_id=sec-fall-1`) → 202 accepted, incident `88478d7c-…`; worker outbox gửi trong ~3 s.
3. care4 `GET /notifications` → 200, 1 item:
   ```json
   {"id":"c1c94c5c-6525-41c4-8827-54159223eedf","incidentId":"88478d7c-a7b9-40e0-82eb-8c9258b3ae40",
    "subjectId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","subjectName":"Bà Trần Thị An",
    "incidentType":"fall","state":"open","revision":2,"kind":"alert","sentAt":"2026-11-14T23:57:05.697Z"}
   ```
4. Owner `DELETE /subjects/aaaaaaaa-…/care-links/1a47e9f0-…` → **204**.
5. care4 gọi lại: `GET /subjects/aaaaaaaa-…/{measurements,export.csv,alerts,status,devices,assistant/summary}` → **404** (đúng), nhưng:
   ```
   GET /notifications            -> 200, vẫn trả đúng item trên (subjectName, incidentType=fall, state=open, incidentId, revision)
   POST /notifications/<id>/read -> 204 (vẫn ghi readAt)
   ```

**Expected:** sau thu hồi, mọi đường đọc dữ liệu của hồ sơ bị chặn ngay — gồm danh sách thông báo và thao tác đọc thông báo (T-02/T-12, docs/06).
**Actual:** dữ liệu sự kiện sức khỏe (loại `fall`, tên hồ sơ, thời điểm, trạng thái, `incidentId`) vẫn đọc được **vô thời hạn** bởi tài khoản đã bị thu hồi.

**Tác động:** vi phạm trực tiếp FR-02/NFR-01 ở đường notification; người thân bị thu hồi (ví dụ sau khi chấm dứt việc chăm sóc) vẫn theo dõi được có cảnh báo té ngã mới hay không, và vẫn giữ metadata sự kiện. Không lộ HR/steps (payload notification không chứa), nên không P0, nhưng đây là ranh giới quyền hồ sơ bị hở → **P1**.

**Đề xuất**
- Trong `listNotifications`/`markRead`, join `care_links` + `subjects` và kiểm `ownerUserId = user OR (link active AND canReceiveAlerts)`; hoặc dùng lại `AccessService.resolve` cho `subjectId` của incident (lưu ý N+1 → gộp bằng một truy vấn).
- Chốt chính sách: ẩn notification so với ẩn + xoá `readAt`; nếu chọn "giữ lịch sử cho chủ hồ sơ", notification phải chuyển sang chủ hồ sơ, không giữ ở người bị thu hồi.
- Thêm test: sau revoke, `GET /notifications` không trả item của hồ sơ; `markRead` 404.

---

### P1-2 — `canAcknowledge`/`canResolve` một mình đủ để **ghi** trạng thái cảnh báo khi `canReceiveAlerts=false`; API trả 403 **sau khi đã commit**

**Vị trí**
- `apps/api/src/incidents/incidents.service.ts:689-710` — `loadVisibleIncident(userId, alertId, action)`: nếu có `action` thì chỉ gọi `assertAction(access, action)` (dòng 702) rồi `return`; nhánh đọc mới gọi `assertAction(access,'receive_alerts')` (dòng 707). `canAcknowledge`/`canResolve` **không** suy ra `canReceiveAlerts` (xem `packages/contracts/src/core.ts:85-97`).
- `apps/api/src/incidents/incidents.service.ts:711-799` (`acknowledgeAlert`) và `:802-901` (`resolveAlert`): commit transaction (đổi `incidents.state`, ghi `alert_actions`, tạo outbox update) rồi `return this.getAlert(userId, alertId)` (dòng 799/901) — `getAlert` **lại** kiểm `receive_alerts` và ném 403 vì người dùng không có quyền đọc.
- Lỗ hổng không được test che: `apps/api/test/incidents.spec.ts:599` (T8) chỉ dùng fixture `NO_ALERT_PERMISSIONS` với **mọi** quyền `false`; không có ca `canAcknowledge=true` + `canReceiveAlerts=false`.

**Tái hiện (output thật)**
1. Owner mời `care2-sec@test.local` với `{historyDays:7, canReceiveAlerts:false, canAcknowledge:true, canResolve:false, canViewAi:false}`; accept 201; permissions trả đúng như trên.
2. care2: `GET /subjects/:id/alerts` → **403**; `GET /alerts/ffffffff-…` → **403**; `GET /subjects/:id/events` (SSE) → **403**. (Đọc bị chặn đúng.)
3. care2: `POST /alerts/ffffffff-…/acknowledge {"expectedVersion":2}` → **403** `Quyền được chia sẻ không cho phép thao tác này.`
   Nhưng trạng thái **đã đổi**:
   ```bash
   # owner đọc lại cùng alert
   {"state":"acknowledged","version":3,
    "acknowledgedBy":{"userId":"8d6be765-e975-43b7-afb8-aa64dab7c307","displayName":"Care2"},
    "actions":[{"action":"acknowledge","outcome":"applied","actor":{"displayName":"Care2"},
                "stateBefore":"open","stateAfter":"acknowledged","createdAt":"2026-11-14T23:55:43.822Z"}]}
   ```
4. Lặp lại với đường resolve: caregiver `care3-sec` (`canReceiveAlerts:false, canResolve:true, canAcknowledge:false`), incident `7f16c575-…` (open, version 2):
   - `GET /alerts/7f16c575-…` → **403**
   - `POST /alerts/7f16c575-…/resolve {"expectedVersion":2,"reason":"care3 resolves without alert-read permission","outcome":"false_alarm"}` → **403**
   - owner đọc lại: `state=resolved`, `version=3`, `resolutionReason="care3 resolves without alert-read permission"`, `resolutionOutcome=false_alarm`, `actions` có `resolve applied` của Care3.

**Expected:** (a) theo FR-07/docs/06, người xác nhận/đóng phải là người "có quyền nhận sự kiện"; ít nhất một quyền ghi không được vượt quyền đọc cùng tài nguyên; (b) nếu request bị từ chối thì **không** được thay đổi dữ liệu; response phải phản ánh đúng kết quả (200 + body, hoặc 403 + không đổi gì).
**Actual:** ghi thành công (state + lịch sử + outbox update) nhưng client nhận 403. Retry của client sẽ tạo thêm bản ghi `alert_actions` outcome `conflict` và UI hiển thị "không có quyền" trong khi cảnh báo đã bị đổi.

**Tác động:** bypass chính sách chia sẻ (owner tắt `canReceiveAlerts` nhưng vẫn bị người đó đổi trạng thái cảnh báo), audit ghi một hành động mà actor không được phép đọc đối tượng, và trạng thái nghiệp vụ bị lệch so với phản hồi API. Không cần dữ liệu đặc biệt → **P1**.

**Đề xuất**
- Trong `loadVisibleIncident`, với mọi `action` phải kiểm **cả** `receive_alerts` (hoặc định nghĩa `hasCarePermission` theo quan hệ bao hàm: `acknowledge ⇒ receive_alerts`, `resolve ⇒ acknowledge`).
- Trả body chi tiết ngay trong transaction (không gọi `getAlert` sau commit) hoặc dựng detail từ dữ liệu đã khóa để không phát sinh 403 sau commit.
- Validate tổ hợp permissions khi tạo invitation (schema/zod `superRefine`): `canResolve ⇒ canAcknowledge ⇒ canReceiveAlerts`, để không tạo cấu hình vô nghĩa.
- Thêm test: `canAcknowledge=true, canReceiveAlerts=false` → 403 **và** state không đổi; resolve tương tự; test rằng mọi response 403 không để lại `alert_actions` outcome `applied`.

---

### P1-3 — Ingest MQTT không xác thực khóa thiết bị; cấu hình broker mẫu cho phép anonymous → chèn dữ liệu sức khỏe giả

**Vị trí**
- `apps/api/src/ingest/mqtt-ingest.service.ts:100-124` — `handleIncoming` chỉ kiểm: topic khớp regex `v1/devices/{uuid}/telemetry`, payload parse theo schema, `envelope.device_id === topicDeviceId`, thiết bị **tồn tại** và `status='active'`; **không** đọc/so `credentialHash`, không dùng `MQTT_USERNAME/PASSWORD` theo thiết bị (chỉ dùng cho kết nối của server). Comment trong file cũng ghi rõ "Không xác thực bằng khóa thiết bị trên MQTT".
- `infra/mosquitto/mosquitto.conf:4-5` — `listener 1883 0.0.0.0` + `allow_anonymous true`; `infra/compose.yaml` publish `1883:1883`.
- HTTP tương ứng thì đúng: `devices/device-auth.guard.ts` + `device-auth.service.ts` kiểm `sha256(x-device-key)` bằng `timingSafeEqual`.

**Tái hiện (output thật)**
```bash
# Broker nội bộ mô phỏng đúng mosquitto.conf (aedes, allow anonymous), cổng 1885
node /tmp/qasec/broker.js          # broker on 1885 (anonymous, no auth)
# API riêng với MQTT_URL trỏ broker trên, DB .data/review-sec-mqtt, cổng 3246
# Publisher KHÔNG có credential nào:
mqtt.connect('mqtt://localhost:1885', { clientId: 'anonymous-attacker' })
    .publish('v1/devices/dddddddd-dddd-4ddd-8ddd-dddddddddddd/telemetry', JSON.stringify({
      schema_version:'1.0', message_id:'mqtt-anon-1', device_id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      boot_id:'boot-mqtt-1', sequence:40001, measured_at:'2026-11-15T00:05:00.000Z', clock_status:'synced',
      uptime_ms:600000, metrics:{heart_rate_bpm:131, steps_since_boot:1234},
      quality:{heart_rate:'valid', motion:'valid'}, battery_percent:42, firmware_version:'attacker-1.0.0' }))
```
Kết quả:
```
broker log: client connected anonymous-attacker
            publish topic=v1/devices/dddddddd-…/telemetry from=anonymous-attacker
# owner đăng nhập API 3246
GET /subjects/aaaaaaaa-…/measurements?limit=1000
-> items 289, rows with HR=131: 1
   {"measuredAt":"2026-11-15T00:05:00.000Z","receivedAt":"2026-11-15T00:05:34.299Z","heartRateBpm":131,
    "heartRateQuality":"valid","motionQuality":"valid","stepsSinceBoot":1234,"batteryPercent":42,"isLate":false,"isQuarantined":false}
GET /subjects/aaaaaaaa-…/export.csv  -> dòng: …,131,valid,valid,1234,42,synced,false,false,mqtt,false
GET /subjects/aaaaaaaa-…/status      -> [{"serial":"AN-2026-001","firmwareVersion":"attacker-1.0.0","lastHeartRateBpm":131,"online":true}]
```

**Expected:** chỉ thiết bị đã cấp credential được ghi telemetry của chính nó (docs/03 "API xác minh payload khớp định danh kết nối", docs/04 "ACL buộc device_id trong topic và payload khớp định danh đã cấp… không dùng chung một tài khoản thiết bị cho mọi board"); dữ liệu không đủ tin cậy phải vào vùng cách ly chứ không vào timeline.
**Actual:** bất kỳ ai kết nối được broker đều ghi được vào timeline hồ sơ như dữ liệu thật (`source=mqtt`, `is_quarantined=false`, `is_synthetic=false`), đổi được `firmwareVersion`/`lastSeenAt` (làm thiết bị trông "online"), và có thể chiếm hạn mức rate limit 60/phút của thiết bị (chặn dữ liệu thật).

**Tác động:** dữ liệu sức khỏe bị làm giả/làm nhiễu trong hồ sơ y tế của người được theo dõi; ảnh hưởng trực tiếp NFR-05 và tin cậy của cảnh báo. Điều kiện: `MQTT_URL` được cấu hình và broker chạy theo compose mẫu (hiện `.env.example` để trống và docs/14 ghi MQTT là "chưa chạy broker thật") → xếp **P1 có điều kiện**; nếu bật MQTT cho demo thật thì đây là lỗ hổng nghiêm trọng nhất của hệ thống.

**Đề xuất**
- Bắt buộc xác thực thiết bị trên MQTT: dùng username = `device_id`, password = device key (broker plugin/ACL), hoặc mang `x-device-key`/chữ ký trong payload và **gọi chung** `DeviceAuthService.authenticate` trước `ingest`; từ chối mọi bản tin không có credential (hiện chỉ log WARN).
- Không ship `allow_anonymous true` trong `infra/compose.yaml`; mẫu cần `password_file`/ACL theo topic + ghi rõ "không dùng cho dữ liệu thật"; thêm `listener … 127.0.0.1` cho demo.
- Thêm cột/nguồn tin cậy: bản tin MQTT không xác thực phải `is_quarantined=true` và không xuất hiện trong measurements/status cho tới khi có người kiểm.
- Test: publisher không credential → `ignored`/vào cách ly; key sai → từ chối; key đúng → accepted.

---

### P2-1 — Lockout DoS qua rate limit đăng nhập (đếm theo email, chặn cả mật khẩu đúng), không có giới hạn theo IP, mỗi lần sai ghi 1 audit row

**Vị trí:** `apps/api/src/auth/auth.service.ts:22` (`LOGIN_MAX_ATTEMPTS=10`), `:27` (`Map` trong bộ nhớ), `:80` (`assertLoginRate` **trước** khi kiểm mật khẩu), `:166-186`; audit: `:88-99`; đăng ký không rate limit: `:35-70`; `apps/api/src/common/origin-check.middleware.ts` không liên quan.

**Tái hiện (output thật)**
```
# 12 lần sai liên tiếp cho victim-sec@test.local
attempt1..10: 401   attempt11: 429   attempt12: 429
# nạn nhân đăng nhập ĐÚNG mật khẩu trong lúc bị khóa
{"code":"RATE_LIMITED","message":"Quá nhiều lần đăng nhập sai. Thử lại sau 15 phút."} (429)
# tài khoản khác vẫn đăng nhập bình thường → chứng minh đếm theo email, không theo IP
owner-login: 200
# 15 lần sai với 15 email khác nhau → audit id 29 → 44 (15 row), không có 429
# thêm 200 email khác → không gặp 429; audit id cuối 290 (gồm cả action khác trong phiên review)
# register 5 tài khoản liên tiếp: 201 201 201 201 201 (không throttle)
```

**Expected:** chống brute force nhưng **không** cho phép người ngoài khóa tài khoản người khác; cần giới hạn theo IP + theo tài khoản, backoff, và không chặn mật khẩu đúng của phiên hợp lệ (hoặc chấp nhận đánh đổi có ghi rõ).
**Actual:** 10 request ẩn danh đủ để khóa 15 phút (gia hạn được liên tục), nạn nhân không thể đăng nhập; kẻ tấn công brute-force/credential-stuffing **không** bị giới hạn vì mỗi email là một bộ đếm mới; mỗi lần sai ghi 1 audit row ⇒ làm phình DB/log bởi request ẩn danh.

**Tác động:** DoS đăng nhập (đặc biệt nghiêm trọng với ứng dụng theo dõi sức khỏe cần truy cập cảnh báo), và không có kiểm soát thực chất với password spraying.
**Đề xuất:** giới hạn kép (IP + tài khoản), chỉ đếm sau khi xác thực sai, dùng cửa sổ trượt có backoff, trả 429 kèm `Retry-After`; giới hạn/aggregate audit cho `auth.login` failed (hoặc ghi audit theo IP/threshold); rate limit cả `/auth/register` và `/invitations/:token`; lưu bộ đếm ở store chia sẻ (Redis/DB) khi chạy nhiều instance.

---

### P2-2 — User enumeration: đăng ký trả 409 cho email tồn tại; login có timing oracle rõ ràng

**Vị trí:** `apps/api/src/auth/auth.service.ts:43,60` (`409 Email này đã được sử dụng.`), `:87` (`verifyPassword` chỉ chạy khi user tồn tại).

**Tái hiện (output thật)**
```
POST /auth/register (email đã có) -> 409 {"code":"CONFLICT","message":"Email này đã được sử dụng."}
# timing login, 5 mẫu mỗi bên (curl %{time_total})
email không tồn tại: 0.0077 0.0055 0.0064 0.0104 0.0049  (TB ~7 ms)
email tồn tại:       0.0777 0.0896 0.0846 0.0735 0.0714  (TB ~79 ms)
```
**Expected:** thông báo trung tính và không lộ qua thời gian/khác biệt mã (docs/04 khuyến nghị thống nhất 404 cho tài nguyên riêng tư để tránh dò tồn tại).
**Actual:** xác định được email đã đăng ký chỉ bằng một request (409) hoặc bằng đo thời gian (~10× khác biệt do scrypt).
**Tác động:** dò danh sách người dùng để tấn công có mục tiêu (kết hợp P2-1 → khóa tài khoản), lộ thông tin "email này có tài khoản trong hệ thống sức khỏe".
**Đề xuất:** trả cùng một thông báo cho register trùng (ví dụ 202 "nếu email hợp lệ, hướng dẫn sẽ được gửi" + email xác minh), hoặc chấp nhận 409 nhưng thêm rate limit theo IP và ghi rõ trong tài liệu; ở login, chạy `verifyPassword` với hash giả khi user không tồn tại để cân bằng thời gian.

---

### P2-3 — `historyDays`/`sharedFrom` không áp cho alerts và SSE replay (khác với measurements/export/AI)

**Vị trí:** `apps/api/src/incidents/incidents.service.ts:639-660` — `listAlerts` chỉ `requireSubject` + `receive_alerts`, **không** `requireHistory`; `:683-710` `getAlert` cũng không; `apps/api/src/realtime/realtime.controller.ts:29-38` + `realtime.service.ts:63-80` — SSE đọc `realtime_events` từ `cursor` (mặc định `0`) không lọc theo `sharedFrom`/`historyDays`.

**Tái hiện (output thật)** — caregiver `care6-sec` vừa accept, `historyDays=1`, `sharedFrom=2026-11-14T23:57:50.076Z`:
```
GET /subjects/aaaaaaaa-…/alerts?state=closed
2026-11-14T23:56:00.000Z resolved sos  7f16c575-…
2026-11-14T23:29:02.788Z resolved fall ffffffff-…   (trước sharedFrom)
2026-11-12T23:54:02.788Z resolved fall f2222222-…   (ngoài 1 ngày)
2026-11-11T23:54:02.788Z cancelled fall f1111111-…  (ngoài 1 ngày)
GET /alerts/f1111111-… -> 200 (chi tiết đầy đủ events/actions)
# SSE của caregiver care5 (sharedFrom = thời điểm accept) replay từ cursor 0:
id: 1 alert.updated {"state":"open",…,"incidentId":"ffffffff-…","occurredAt":"2026-11-14T23:29:02.788Z"}  ← trước khi được chia sẻ
id: 2 care.accepted {"linkId":"0e163225-…","caregiverUserId":"8d6be765-…"}                                ← lộ userId caregiver khác
id: 3 alert.updated {"state":"acknowledged",…}
id: 4 notification.sent {"id":"2e572900-…","incidentId":"ffffffff-…"}
```
**Expected:** docs/06 "Người thân không mặc định truy cập toàn bộ dữ liệu trước ngày chia sẻ"; measurements/export/AI đã bị chặn đúng (`from` cũ hơn `effectiveFrom` → 403).
**Actual:** alerts/SSE bỏ qua cả `sharedFrom` và `historyDays`; dữ liệu sự kiện (`fall`/`sos`, thời điểm, trạng thái, event type, tên actor) đọc được ngoài phạm vi được cấp. Payload SSE còn lộ `caregiverUserId` của người khác và id notification.
**Tác động:** vi phạm share boundary (P2 — metadata sự kiện, không có HR/steps, xem §4 "SSE payload").
**Đề xuất:** áp `requireHistory` cho `listAlerts`/`getAlert` (kẹp `detectedAt >= effectiveFrom`, hoặc 403 như measurements), thêm điều kiện thời gian vào truy vấn `realtime_events` (cửa sổ = `max(sharedFrom, now-historyDays)`), và không replay `care.*`/`notification.sent` cho caregiver mới.

---

### P2-4 — Cursor alerts không validate → 500 kèm log SQL/params (docs/04 yêu cầu 422)

**Vị trí:** `apps/api/src/incidents/incidents.service.ts:648-656` — `new Date(cursor['detectedAt'])` không kiểm `NaN`; `id` không kiểm UUID; so sánh với cột `uuid`/`timestamp` của drizzle. Đối chiếu: measurements đã validate đúng (`measurements.service.ts:decodeMeasurementCursor`).

**Tái hiện (output thật)**
```
cursor = base64({"detectedAt":"zzz","id":"ffffffff-…"})
GET /subjects/aaaaaaaa-…/alerts?cursor=… -> 500 {"code":"INTERNAL","message":"Có lỗi xảy ra. Vui lòng thử lại sau.",…}
  log: RangeError: Invalid time value  at PgTimestamp.mapToDriverValue
cursor = base64({"detectedAt":"2026-11-14T00:00:00Z","id":"not-a-uuid"})
GET /subjects/aaaaaaaa-…/alerts?cursor=… -> 500
  log: Error: Failed query: select … from "incidents" where … ; params: aaaaaaaa-…,open,acknowledged,2026-11-14T00:00:00.000Z,…,not-a-uuid,51
```
**Expected:** 422 `VALIDATION_FAILED` (như measurements); không lộ SQL/params.
**Actual:** 500, stack + câu SQL + tham số bị ghi vào log. Không phải SQL injection (tham số hóa đúng), nhưng là lỗi xử lý input + tăng bề mặt log.
**Đề xuất:** dùng `isoDateTimeSchema` + `idSchema` để validate cursor như measurements (`measurements.service.ts:decodeMeasurementCursor`), hoặc tách helper dùng chung trong `common/pagination.ts`; thêm test cursor rác cho alerts/tasks/admin audit (tasks đã validate đúng, admin audit cũng đã validate).

---

### P2-5 — Logout/disable **không** ngắt SSE đang mở (vi phạm trực tiếp T-01)

**Vị trí:** `apps/api/src/realtime/realtime.service.ts:57-90` — vòng lặp chỉ kiểm `access.requireAction(userId, subjectId,'receive_alerts')`; **không** kiểm `sessions.revokedAt/expiresAt`; `realtime.controller.ts` chỉ xác thực phiên một lần khi mở stream. `docs/08` T-01 yêu cầu: "Không có phiên, phiên hết hạn, đăng xuất → API từ chối đúng; **không đọc dữ liệu còn lại qua stream**".

**Tái hiện (output thật)**
```
login minh -> 200; mở SSE: GET /subjects/aaaaaaaa-…/events?cursor=0
logout                -> 204
GET /me               -> 401        (phiên đã bị thu hồi đúng)
# sau đó thiết bị gửi fall.confirmed mới (ingest 202, incident 1b7b6422-…)
# stream vẫn nhận:
event: alert.updated data: {"state":"open",…,"incidentId":"1b7b6422-0651-4599-9e80-34c1b1d4bbcb",…}
event: notification.sent data: {"id":"20128336-…","incidentId":"1b7b6422-…"}
event: notification.sent data: {"id":"9aa10a3c-…","incidentId":"1b7b6422-…"}
(bytes=1213, stream chỉ tự đóng sau SSE_MAX_DURATION_MS = 5 phút)
```
**Expected:** stream đóng (hoặc gửi `revoked` rồi đóng) ngay khi phiên bị logout/disable/hết hạn.
**Actual:** tiếp tục nhận cảnh báo mới tối đa 5 phút sau khi `/me` đã 401.
**Tác động:** P2 — trên máy dùng chung hoặc khi admin khóa tài khoản bị xâm nhập, kẻ đang giữ stream vẫn thấy cảnh báo mới trong tối đa 5 phút; dữ liệu chỉ là metadata cảnh báo. Dù vậy đây là tiêu chí T-01 chưa đạt.
**Đề xuất:** trong vòng lặp SSE kiểm cả session (`AuthService.resolveSession` theo `tokenHash`, hoặc truyền `sessionId` và kiểm `revokedAt/expiresAt`); giảm `SSE_MAX_DURATION_MS` cho phiên ngắn; thêm test T-01 (logout giữa stream → không nhận event mới).

---

### P2-6 — Thiếu security headers, thiếu `Cache-Control` cho dữ liệu sức khỏe, cookie `Secure` phụ thuộc `NODE_ENV`, CSRF chỉ dựa trên SameSite + Origin-presence

**Vị trí:** `apps/api/src/configure-app.ts:1-23` (không dùng `helmet`; `helmet` không phải dependency); `apps/api/src/auth/session-cookie.ts:5-13` (`secure: env.NODE_ENV === 'production'`); `apps/api/src/config/env.ts:9` (`NODE_ENV` mặc định `development`); `apps/api/src/common/origin-check.middleware.ts:20-27` (request **không có** `Origin` được cho qua).

**Tái hiện (output thật)**
```
GET /api/v1/health  (và /me, /measurements) headers:
HTTP/1.1 200 OK
X-Powered-By: Express
x-request-id: …
Content-Type: application/json; charset=utf-8
ETag: W/"290-…"
(thiếu: Strict-Transport-Security, X-Content-Type-Options, Content-Security-Policy,
 X-Frame-Options/frame-ancestors, Referrer-Policy, Permissions-Policy, Cache-Control)

POST /subjects không có Origin  -> 201 (được ghi bằng cookie phiên)
POST /subjects Origin: https://evil.example -> 403
GET  /subjects Origin: https://evil.example -> 200
```
**Expected:** API trả header an toàn tối thiểu; response chứa dữ liệu sức khỏe phải `Cache-Control: no-store` (hoặc `private, no-store`); cookie phiên phải `Secure` bất kể `NODE_ENV` khi chạy qua TLS; thao tác ghi dùng cookie nên có CSRF token hoặc yêu cầu `Origin` bắt buộc.
**Actual:** không có header nào ở trên, `X-Powered-By` lộ Express; request ghi **không có** `Origin` vẫn được chấp nhận (chỉ dựa vào `SameSite=Lax`); nếu triển khai quên `NODE_ENV=production`, cookie không có `Secure` và HSTS không có để bù.
**Tái hiện thêm (dev server web, ngoài phạm vi API):** `curl -I http://localhost:5173/` cũng không có CSP/X-Frame-Options (Vite dev; production static host chưa cấu hình trong repo) — cần chốt khi triển khai.
**Tác động:** P2 hardening: rủi ro clickjacking/MIME sniffing/leak qua referrer, cache trung gian lưu dữ liệu sức khỏe, cookie bị gửi plaintext nếu cấu hình sai, và CSRF chỉ còn một lớp phòng thủ (không có token; middleware bỏ qua khi thiếu header).
**Đề xuất:** thêm `helmet` với CSP phù hợp SPA, HSTS (khi TLS), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'`; đặt `Cache-Control: no-store` cho mọi response chứa dữ liệu cá nhân (measurements, alerts, assistant, export, notifications); bật `Secure` theo cấu hình TLS tường minh (không suy từ `NODE_ENV`), dùng tiền tố `__Host-`; yêu cầu `Origin` khớp cho mọi method ghi có cookie (hoặc thêm double-submit CSRF token) và ghi rõ ngoại lệ `Origin` trống chỉ dành cho client không dùng cookie; gỡ `X-Powered-By`.

---

### P2-7 — Admin không có care link vẫn đọc + đóng được task bảo trì gắn hồ sơ (bất đối xứng với danh sách)

**Vị trí:** `apps/api/src/maintenance/maintenance.service.ts:170-186` — admin bỏ qua kiểm tra hồ sơ trong `closeTask`; `:131-150` — `listTasks` với admin chỉ trả task `subjectId IS NULL`; `:209` trả `toSummary(task)` gồm `title`, `notes`, `subjectId`.

**Tái hiện (output thật)**
```
# owner thấy task gắn hồ sơ An
GET /maintenance-tasks (owner) -> 66050def-… | subjectId=aaaaaaaa-… | title="Kiểm tra tín hiệu vòng đeo tay tại nhà" | notes="Dữ liệu bị thiếu hai khoảng trong tuần…"
GET /maintenance-tasks (admin) -> {"items":[]}                  ← admin không thấy
POST /maintenance-tasks/66050def-…/close (admin, reason="admin closes without care link") -> 200
   audit: action=maintenance_task.close actor=33333333-… (admin) target=66050def-…
   (response dùng maintenanceTaskSummarySchema → có title/notes/subjectId của hồ sơ)
POST …/close (caregiver có link) -> 403 "Chỉ chủ hồ sơ hoặc quản trị viên…"
POST …/close (người lạ)          -> 404
```
**Expected (docs/02 FR-11):** "Quản trị viên … quản lý tài khoản, thiết bị, cấu hình và audit; **không mặc định được đọc dữ liệu sức khỏe**"; nếu admin không được xem task gắn hồ sơ trong danh sách thì cũng không nên đọc/ghi qua id.
**Actual:** admin đọc nội dung task (title/notes có ngữ cảnh sức khỏe/thiết bị) và đổi trạng thái, dù danh sách bị ẩn.
**Tác động:** P2 — cần biết UUID task (khó đoán) và quyền admin; nhưng là bất đối xứng quyền rõ ràng và đi ngược chính sách "admin không đọc dữ liệu sức khỏe".
**Đề xuất:** chốt chính sách: hoặc admin được xem toàn bộ task (bỏ lọc `subjectId IS NULL` và ghi rõ trong docs/FR-11), hoặc `closeTask` của admin chỉ áp cho task **không** gắn hồ sơ; ẩn `notes`/`title` khi admin không có quyền hồ sơ; thêm test quyền cho cặp (admin, task có subject).

---

### P2-8 — Password policy chỉ kiểm độ dài; mật khẩu toàn khoảng trắng được chấp nhận

**Vị trí:** `packages/contracts/src/auth.ts:7` — `password: z.string().min(10).max(200)`; `apps/api/src/auth/password.ts` chỉ hash, không kiểm chất lượng.

**Tái hiện (output thật)**
```
POST /auth/register password="aaaaaaaaaa"   -> 201
POST /auth/register password="1234567890"   -> 201
POST /auth/register password="          "   -> 201   ← 10 dấu cách
POST /auth/register password="short"        -> 422
```
**Expected:** chính sách mật khẩu tối thiểu (không chỉ độ dài): từ chối toàn khoảng trắng, danh sách phổ biến, và/hoặc yêu cầu độ dài lớn hơn cho tài khoản có quyền xem dữ liệu sức khỏe; ghi rõ trong tài liệu.
**Actual:** mật khẩu 10 dấu cách hợp lệ; không có kiểm tra độ mạnh/breach; kết hợp P2-1 (không rate limit theo IP) và P2-2 (enumeration) làm tăng khả năng chiếm tài khoản.
**Đề xuất:** `z.string().trim().min(12)` + `superRefine` chặn toàn khoảng trắng/ký tự lặp + danh sách mật khẩu phổ biến (offline list nhỏ) hoặc `zxcvbn`-style score; thêm test biên.

---

### P2-9 — Cửa sổ mặc định của `export.csv` và `assistant/ask` trả 403 oan cho caregiver vừa được chia sẻ (đối chiếu P2-1 cũ — **không** đóng)

**Vị trí:** `apps/api/src/measurements/measurements.service.ts:221-228` (`exportCsv` lấy `from` mặc định = now-24h rồi `requireHistory(..., from)` → 403 khi `sharedFrom` mới hơn); `apps/api/src/assistant/assistant.service.ts:330-336` (`from = now - ASK_WINDOW_MS` = 7 ngày → 403 tương tự); so sánh: `measurements.list` đã được kẹp mềm (`measurements.service.ts:73-83`), `dailySummary` cũng kẹp.

**Tái hiện (output thật)** — `care6-sec`, `historyDays=1`, `sharedFrom=2026-11-14T23:57:50Z`:
```
GET /subjects/:id/measurements            -> 200 (kẹp về sharedFrom)
GET /subjects/:id/export.csv              -> 403 {"message":"Khoảng thời gian yêu cầu vượt quá quyền xem lịch sử được chia sẻ.","details":{"effectiveFrom":"2026-11-14T23:57:50.076Z"}}
GET /subjects/:id/export.csv?from=<now-30m> -> 403   (dù 30 phút nằm trong quyền)
POST /subjects/:id/assistant/ask          -> 403 (cùng lý do)
GET /subjects/:id/assistant/summary       -> 200 (đã kẹp)
GET /subjects/:id/daily-summary?date=<2 ngày trước> -> 403 (đúng vì ngoài historyDays=1)
```
**Expected:** với quyền `historyDays` đã cấp, cửa sổ mặc định phải hoạt động (kẹp về `effectiveFrom`) như `measurements`/`summary`; hoặc nếu chọn chính sách "chỉ dữ liệu sau sharedFrom" thì phải áp **đồng nhất** cho mọi đường và ghi trong docs/04.
**Actual:** cùng một mốc `sharedFrom` cho ba hành vi khác nhau: kẹp mềm (list/summary), 403 (export/ask), không áp (alerts/SSE — P2-3). Người thân mới được chia sẻ **không** xuất được CSV và không hỏi được trợ lý trong ~1 chu kỳ chia sẻ, dù owner vừa cấp `historyDays`.
**Tác động:** P2 (sai/hẹp quyền đã cấp, ảnh hưởng FR-10/FR-14); đây là phần **còn lại** của P2-1 trong review 14/11 (reviewer cũ chỉ ghi nhận list measurements), tôi không đóng finding đó.
**Đề xuất:** dùng một helper chung `resolveEffectiveWindow(userId, subjectId, requestedFrom?)` trả `effectiveFrom` và kẹp cho mọi endpoint (list/export/ask/summary/alerts); thêm test ma trận endpoint × `sharedFrom` mới.

---

### P2-10 — Bề mặt DoS có xác thực: query 31 ngày không giới hạn, export không giới hạn dòng, SSE không giới hạn kết nối, claim code không throttle

**Vị trí**
- `apps/api/src/measurements/measurements.service.ts:105-124` — `windowRows` lấy **toàn bộ** `measuredAt` trong cửa sổ (tối đa 31 ngày) không `limit` (chỉ page có `limit`); `computeGaps` duyệt toàn bộ mảng.
- `apps/api/src/measurements/measurements.service.ts:230-254` — `exportCsv` không giới hạn số dòng; dựng toàn bộ CSV trong RAM.
- `apps/api/src/realtime/realtime.service.ts:35` + `:57-90` — mỗi kết nối poll DB 1 lần/giây, không giới hạn số stream/người dùng.
- `apps/api/src/devices/devices.service.ts:200-247` + `device-codes.ts` — `POST /subjects/:id/devices/claim` với code sai trả 422, **không** rate limit (31^9 ≈ 2.6e13 nên brute force không thực tế, nhưng không có backoff/lockout).

**Tái hiện (output thật)**
```
# export 3 ngày: 920 dòng, 98.534 byte (5 phút/mẫu). Với ingest 60 msg/phút (policy hiện tại) × 31 ngày ≈ 2,7 triệu dòng → 1 request của một caregiver có thể dựng chuỗi CSV hàng trăm MB.
GET /subjects/aaaaaaaa-…/export.csv?from=<now-3d> -> 200, 920 dòng
# 6 stream SSE đồng thời của cùng 1 phiên: tất cả được mở (200), mỗi stream poll DB 1 lần/giây
for i in 1..6: timeout 6 curl -N -b cj-owner.txt …/events?cursor=999999  -> cả 6 kết nối mở, không 429
# claim code sai 25 lần liên tiếp (trong hạn mức tài khoản): 422 × 25, không 429
```
**Expected:** giới hạn tài nguyên theo người dùng/hồ sơ (ROW LIMIT + cursor cho export, đếm dòng tối đa và trả 413/422 kèm hướng dẫn chia nhỏ; giới hạn N stream/người dùng; throttle claim).
**Actual:** không có giới hạn nào; đây là DoS do người dùng hợp lệ (kể cả caregiver bị hạn chế quyền) gây được, không cần lỗ hổng khác.
**Tác động:** P2 vận hành (PGlite đơn tiến trình càng dễ nghẽn); chưa benchmark nên tôi **không** kết luận về ngưỡng cụ thể.
**Đề xuất:** export theo batch + giới hạn `maxRows`/khoảng ngày nhỏ hơn cho caregiver; `windowRows` thay bằng đếm/aggregate trong SQL (hoặc chỉ lấy timestamp có `LIMIT` theo interval); giới hạn SSE theo user (ví dụ 2) và tăng `pollMs` khi nhiều kết nối; thêm rate limit cho claim + log thất bại theo tài khoản/IP.

---

### P3 (nhóm hardening, không chặn demo)

1. **Health endpoint công khai** (`apps/api/src/health/health.controller.ts:14-28`): trả `version`, `database` up/down, `ai: provider_configured|template_fallback`. Không có dữ liệu cá nhân, nhưng giúp dò môi trường; nên tách `/health/live` (không chi tiết) và `/health/ready` (nội bộ) hoặc bỏ `version`/`ai`.
2. **`X-Request-Id` do client đặt** (`common/request-id.middleware.ts:14`): regex `^[A-Za-z0-9_-]{8,64}$` chấp nhận giá trị client → có thể làm nhiễu/giả correlation trong log/audit (`requestId` lưu ở `audit_logs`, `alert_actions`). Nên dùng UUID server sinh hoặc prefix riêng cho client.
3. **Log lỗi 500 ghi URL đầy đủ + SQL/params** (`common/api-exception.filter.ts:64-68`): URL chứa path param, vd `/api/v1/invitations/<token>` nếu route đó gặp lỗi 500 → token lời mời vào log (docs/04 yêu cầu "không ghi token vào log"). Hiện các lỗi quan sát được là 4xx nên chưa xảy ra; đề xuất log route pattern thay vì `req.url` và redact param nhạy cảm.
4. **Audit lưu email** (`auth.service.ts:96`, `metadata.emailNormalized`) cho mọi lần đăng nhập sai, kể cả email không tồn tại → PII trong audit, có thể bị lạm dụng để dò; cân nhắc hash/rút gọn hoặc chỉ lưu khi user tồn tại + rate limit.
5. **`GET /alerts/:id` trả `recipients` (tên + bộ quyền của caregiver khác) và `actions` (tên actor)** cho mọi người có `receive_alerts`: lộ cấu trúc chia sẻ giữa các caregiver; cân nhắc chỉ trả cho owner hoặc rút gọn.
6. **Không có danh sách phiên/logout-all**: login nhiều lần tạo nhiều session cùng sống 168 h (đã kiểm: session cũ vẫn 200 sau login mới), logout chỉ thu hồi session hiện tại. Không sai hợp đồng nhưng nên có "đăng xuất mọi thiết bị" + hiển thị phiên cho tài khoản xem dữ liệu sức khỏe.
7. **Không có bảng đếm/ghi nhận cho rate limit**: 3 bộ đếm trong bộ nhớ (`auth`, `ingest`, `assistant`) không chia sẻ giữa instance và mất khi restart; đã ghi trong docs/14 là giới hạn, nhưng cần chốt trước khi chạy nhiều tiến trình.
8. **`GET /subjects/:id/status` trả `lastHeartRateBpm` cho caregiver chỉ có link (kể cả `canReceiveAlerts=false`)**: đã kiểm — `care2-sec` (`canReceiveAlerts=false, historyDays=7`) gọi `/status` → 200 `[{"serial":"AN-2026-001","online":true,"lastHeartRateBpm":70,"lastMeasuredAt":"2026-11-15T00:01:00.000Z"}]`; `/measurements` mặc định → 200. Đúng mô hình "link = xem hồ sơ", nhưng nên ghi rõ trong docs/02 rằng quyền xem giá trị mới nhất không phụ thuộc `historyDays`/`canReceiveAlerts`; nếu không, đây là đường đọc ngoài cửa sổ lịch sử (chỉ 1 giá trị mới nhất).

---

## 6. Phần **chưa** kiểm / giới hạn

- **HTTPS/TLS thật, HSTS, reverse proxy**: không dựng; các kết luận header/cookie là trên HTTP dev.
- **Mosquitto thật + TLS + ACL/password_file**: chỉ chạy broker `aedes` nội bộ mô phỏng `allow_anonymous true`; chưa kiểm broker thật, chưa kiểm MQTT ACK ngược (v1 chưa publish ACK).
- **PostgreSQL thật/nhiều instance**: rate limit, SSE, CAS, khóa dòng chỉ kiểm trên PGlite một tiến trình.
- **Load/stress**: không đo p95/ngưỡng DoS; các con số ở P2-10 là suy ra từ cấu hình + dữ liệu seed, không phải kết quả đo tải.
- **Web Push/email/SMS**: không có transport ngoài nên không kiểm.
- **Phía web (5173)**: chỉ kiểm header của dev server; không kiểm UI sau revoke/SSE, không chụp ảnh — ngoài trọng tâm backend.
- **Firmware/thiết bị thật, provisioning certificate**: ngoài phạm vi.
- Không kiểm `apps/web` test/build; không chạy typecheck toàn repo (chỉ build contracts + api).
- Không kiểm lỗ hổng dependency (`pnpm audit`) — cần chạy riêng nếu muốn kết luận supply chain.
- Ghi chú ngoài bảo mật (không tính finding): tên hồ sơ seed bị double-encode UTF-8 (JSON trả `"B\u00c3\u00a0 Tr\u00e1\u00ba\u00a7n…"` = "BÃ  Tráº§n…") — cần xác nhận bằng `od` trước khi kết luận là lỗi dữ liệu hay chỉ là hiển thị.

---

## 7. Đề xuất thứ tự xử lý

1. **P1-1, P1-2** — sửa ở lớp `AccessService`/`IncidentsService`/`NotificationsService` + thêm test ma trận permission (`canReceiveAlerts` × `canAcknowledge` × `canResolve`, và revoke × endpoint). Hai lỗi này ảnh hưởng trực tiếp tiêu chí nghiệm thu NFR-01/FR-02/FR-07.
2. **P1-3** — nếu bật MQTT: xác thực thiết bị ở adapter (dùng chung `DeviceAuthService`), bỏ `allow_anonymous`, đưa bản tin chưa xác thực vào cách ly; nếu chưa bật MQTT, ghi rõ "không bật cho tới khi có ACL/TLS" trong README + compose.
3. **P2-1, P2-2, P2-8** — hardening auth (rate limit kép, timing/enumeration, password policy) vì đây là bề mặt ẩn danh duy nhất.
4. **P2-3, P2-9** — thống nhất một helper cửa sổ dữ liệu cho measurements/export/ask/alerts/SSE; thêm test ma trận endpoint × `sharedFrom`/`historyDays`.
5. **P2-5, P2-4** — kiểm phiên trong vòng lặp SSE (T-01) và validate cursor alerts.
6. **P2-6, P2-7, P2-10** — header/cookie/cache, chốt chính sách admin–task, giới hạn tài nguyên export/SSE/claim.
7. **P3** — dọn log/health/request-id/audit PII.

Mọi mục trên cần test hồi quy ở lớp sở hữu hành vi (service/integration), và reviewer độc lập chạy lại trên DB/API riêng — không dùng "đã sửa" trong báo cáo handoff làm bằng chứng.

---

## 8. Tóm tắt 5 dòng

1. Đã review bảo mật/phân quyền tại HEAD `8434d66` trên API+DB riêng (PGlite `.data/review-sec*`, cổng 3245/3246, broker aedes 1885), chạy lại jest API 14/14 suite – 100/100 test pass; không sửa code/docs và không đụng môi trường lead.
2. **0 P0, 3 P1**: thu hồi care link không chặn `/notifications`; `canAcknowledge`/`canResolve` một mình đủ để ghi trạng thái cảnh báo khi `canReceiveAlerts=false` và API trả 403 sau khi đã commit; ingest MQTT không xác thực khóa thiết bị + broker mẫu `allow_anonymous true` cho phép chèn dữ liệu sức khỏe giả.
3. **10 P2**: lockout DoS qua rate limit đăng nhập, enumeration email (409 + timing ~7 ms vs ~79 ms), share boundary không áp cho alerts/SSE, cursor alerts lỗi 500, logout/disable không ngắt SSE (vi phạm T-01), thiếu security headers/`Cache-Control`, admin đóng task gắn hồ sơ không cần care link, password 10 dấu cách hợp lệ, `export.csv`/`assistant/ask` 403 oan với caregiver mới, và các bề mặt DoS có xác thực (export/SSE/claim).
4. Đã kiểm **không** lỗi: IDOR/REST cho người lạ và admin không care link (404 toàn bộ), revoke REST có hiệu lực ngay (trừ notifications), CSRF/origin/CORS, dedupe+schema ingest HTTP, rotate device key, token lời mời dùng một lần/không lộ email, CSV không có bề mặt formula injection, log/audit không lộ secret hay HR.
5. Còn lại: chưa kiểm TLS/mosquitto thật/PostgreSQL nhiều instance/load test; đề xuất xử lý P1 (test ma trận permission + revoke, xác thực MQTT), rồi thống nhất helper cửa sổ dữ liệu và các hardening P2 trước khi dùng dữ liệu thật.
