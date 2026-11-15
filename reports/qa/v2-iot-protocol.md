# Review độc lập v2 — hợp đồng IoT và khả năng lên firmware

- **Reviewer:** reviewer độc lập (agent pi), chỉ đọc và chạy kiểm; **không sửa code/docs/DB chính, không commit**.
- **Thời điểm:** 2026-11-15, 07:06 → 07:30 (Asia/Ho_Chi_Minh, UTC+7). Giờ trong log/JSON là UTC.
- **Base:** worktree hiện tại **HEAD `ffb6d87`**, không phải `8434d66` như mô tả task. `git diff --stat 8434d66 HEAD` cho thấy 4 commit thêm vào chỉ chạm `docs/`, `reports/orchestration/`, `packages/contracts/package.json`, `packages/contracts/src/{auth,contacts,insights,tasks}.ts`, `apps/api/src/database/{schema.ts,drizzle/*}` cho feature tài khoản/xu hướng/liên hệ; **không chạm** `telemetry.ts`, `incidents.ts`, `devices/*`, `ingest/*`, `measurements/*`, `tools/simulator`. Vì vậy kết luận về hợp đồng IoT áp dụng cho cả `8434d66`.
- **Phạm vi:** `AGENTS.md`, `docs/03`, `04`, `05`, `07`, `08`, `12`, `14`, `packages/contracts` (schema + examples), `apps/api/src/{ingest,devices,incidents,measurements,policy}`, `tools/simulator`, `infra/`.
- **Môi trường kiểm riêng:** `PGLITE_DATA_DIR=.data/review-iot`, API cổng **3211** (HTTP) và **3212** (HTTP + `MQTT_URL`), broker aedes cục bộ **127.0.0.1:18830** mô phỏng `infra/mosquitto/mosquitto.conf`. Không đụng `.data/pglite`, cổng 3000, DB hay broker của người khác. Đã tắt toàn bộ process sau khi đo. `git status` sạch; chỉ file báo cáo này được ghi vào repo (kèm `node_modules/`, `dist/`, `.data/` đều đã gitignore).
- **Nhãn bằng chứng:**
  - **[ĐO]** — chạy thật trong phiên này trên localhost, DB review, dữ liệu tổng hợp.
  - **[CODE]** — suy luận từ đọc code/schema, chưa chạy.
  - **[CHƯA KIỂM]** — không có phần cứng/broker/TLS thật để kiểm.

> Báo cáo này **không** đánh giá độ chính xác phát hiện té ngã, nhịp tim, bước chân, thời lượng pin hay chất lượng cảm biến. Không có firmware ESP32 nào được build, nạp hay đo trong phiên này. Mọi phát biểu về firmware là yêu cầu suy ra từ hợp đồng, không phải kết quả trên thiết bị.

---

## 0. Kết luận tổng thể

| Mức | Số lượng | Ý nghĩa trong báo cáo này |
| --- | --- | --- |
| **P0** | 3 | Phải chốt/sửa trước khi viết firmware cho luồng thật; nếu không, hệ thống mất cảnh báo hoặc lộ dữ liệu sức khỏe giữa hai người |
| **P1** | 9 | Phải sửa trước khi firmware chạy trên người thật; firmware hiện không thể triển khai đúng hợp đồng đang công bố |
| **P2** | 8 | Cần làm rõ/hoàn thiện; có thể gây hiểu sai hoặc che lỗi |

- Simulator **trung thực ở phần đã khai báo** (dữ liệu tổng hợp, `firmware_version=0.0.0-sim`, queue chỉ trong RAM, không MQTT) và 23/23 test của nó pass. Nhưng nó **che lấp lỗi thật ở ba điểm**: (a) test dùng mock server dễ dãi nên không phát hiện ví dụ hợp đồng sai/`device_id` phải là UUID/429; (b) dữ liệu simulator chạy thật được ghi `source='http'` nên **không** được đánh dấu synthetic; (c) simulator không bao giờ tạo được ca `motion: sensor_error`, `not_worn`, `battery: null`, `measured_at: null` hay lệch giờ.
- Ba P0 đều nằm ở **đường truyền và quyền sở hữu dữ liệu**, không phải ở thuật toán: MQTT không xác thực, topic sự kiện không tồn tại, và telemetry đệm bị gán sang chủ mới.
- Kết quả dương tính đáng ghi nhận: chống trùng telemetry, xung đột `message_id`/`sequence`, `clock_status=unsynced` + `measured_at=null`, `DEVICE_NOT_CLAIMED`, sai khóa 401, `battery_percent: null` đều hoạt động đúng như mô tả trong code và test (mục 5).

---

## 1. Bảng finding

| ID | Mức | Tên | Bằng chứng |
| --- | --- | --- | --- |
| **P0-1** | P0 | MQTT không xác thực thiết bị; ai vào được broker cũng ghi được dữ liệu sức khỏe | [ĐO] chèn 199 bpm vào thiết bị demo, không cần khóa |
| **P0-2** | P0 | Không có ingest sự kiện `fall.*`/`sos.*` trên MQTT; publish bị bỏ im lặng, không ACK | [ĐO] `sos.confirmed` publish xong, 0 incident, không log |
| **P0-3** | P0 | Telemetry đệm trước khi đổi chủ bị gán cho chủ mới, không cách ly (FR-03) | [ĐO] mẫu 2 giờ trước khi chuyển hiện trong timeline người mới |
| **P1-1** | P1 | 2/3 payload mẫu công bố không parse được bằng schema đang chạy; ACK đảo naming | [ĐO] `safeParse` + POST thật → 422 |
| **P1-2** | P1 | Không có đường cấp/đổi khóa cho thiết bị; rotate vô hiệu hóa khóa cũ ngay | [ĐO] rotate → khóa cũ 401, khóa mới 202 |
| **P1-3** | P1 | Firmware không biết rate limit/nhịp gửi; 429 không có `Retry-After`; retry làm mất dữ liệu | [ĐO] 13/70 bản tin bị bỏ, exit 1 |
| **P1-4** | P1 | `clock_status` tự khai, không tiêu chí; server nhận `measured_at` tương lai | [ĐO] mẫu 2027-06-01 được nhận, `isLate=false` |
| **P1-5** | P1 | Candidate không có kết quả cuối không bao giờ thành `unconfirmed`; incident `suspected` vô hình | [CODE] |
| **P1-6** | P1 | Heartbeat/status chỉ có trên giấy: không schema, không ingest; "online" chỉ từ telemetry | [CODE] + [ĐO] |
| **P1-7** | P1 | `steps_since_boot` bắt buộc, không có `null`/quality → thiết bị không có pedometer phải gửi 0 | [CODE] |
| **P1-8** | P1 | Không nêu phạm vi duy nhất của `message_id`/`boot_id`; `message_id` theo `sequence` sẽ xung đột sau reboot | [ĐO] 409 `message_id_conflict`/`sequence_conflict` |
| **P1-9** | P1 | Simulator chạy thật ghi `source='http'` → không còn nhãn synthetic | [CODE] + [ĐO] API không trả `isSynthetic` |
| **P2-1** | P2 | `late` của incident tính `lastEventAt − detectedAt`, hardcode 5 phút, bỏ qua policy | [CODE] |
| **P2-2** | P2 | `heart_rate_bpm` min 20 loại giá trị sinh lý thấp nhưng quality vẫn `valid` → null im lặng | [CODE] |
| **P2-3** | P2 | Claim code: không throttle/lockout, không audit lần sai, không chuẩn hóa chữ hoa | [ĐO] 30/30 lần sai → 422 |
| **P2-4** | P2 | `ingestHeadersSchema` không dùng; không kiểm độ dài khóa; TLS/redaction header không được yêu cầu | [CODE] |
| **P2-5** | P2 | Không audit xác thực thiết bị thất bại/429/rejected-not-claimed ở đường telemetry | [CODE] |
| **P2-6** | P2 | `evidence` strict thiếu trường chẩn đoán (`detected_uptime_ms`, impact/fall duration) | [CODE] + [ĐO] 422 vì extra key |
| **P2-7** | P2 | `isQuarantined` luôn `false`; gap reason `quarantined` không bao giờ sinh | [CODE] |
| **P2-8** | P2 | Simulator thiếu ca biên và có sai lệch `uptime_ms`/`measured_at` khi retry | [CODE] |

---

## 2. Chi tiết P0

### P0-1 — MQTT không xác thực thiết bị; chèn được dữ liệu sức khỏe và cảnh báo giả

**Vị trí:** `apps/api/src/ingest/mqtt-ingest.service.ts:53-64` (subscribe không auth), `:98-125` (chỉ kiểm topic ↔ `payload.device_id` và thiết bị tồn tại/active); `infra/mosquitto/mosquitto.conf` (`allow_anonymous true`, `listener 1883 0.0.0.0`); `infra/compose.yaml` publish `1883:1883`. `docs/14:189` đã tự ghi "chưa xác thực khóa thiết bị trên MQTT".

**Bằng chứng [ĐO]:**
1. Dựng aedes tại `127.0.0.1:18830`, **không user/password, không ACL**, đúng tinh thần `mosquitto.conf`.
2. Chạy API với `MQTT_URL=mqtt://127.0.0.1:18830`; log broker: `client connected mqttjs_… username= null` (backend cũng nối anonymous).
3. Từ một client **không có credential** publish `v1/devices/dddddddd-…/telemetry` với payload hợp lệ:
   ```json
   {"message_id":"mqtt-inject-1","device_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    "metrics":{"heart_rate_bpm":199,"steps_since_boot":11},"battery_percent":42,
    "firmware_version":"mqtt-intruder","clock_status":"synced", "...":"..."}
   ```
4. `GET /subjects/<An>/status` trả về:
   ```json
   {"serial":"AN-2026-001","bpm":199,"battery":42,"firmware":"mqtt-intruder",
    "clock":"synced","freshness":"live"}
   ```
   và mẫu 199 bpm nằm trong timeline của hồ sơ bà An.

**Hệ quả:** bất kỳ ai vào được mạng broker (hoặc mọi thiết bị trong LAN khi chạy compose) đều **ghi/sửa dữ liệu nhịp tim, pin, firmware** của bất kỳ `device_id` nào biết được từ topic; có thể mở cảnh báo giả hoặc làm nhiễu cảnh báo thật. Không cần khóa thiết bị. Đây là lỗi toàn vẹn dữ liệu sức khỏe, không chỉ là "thiếu hardening".

**Đề xuất:**
- Chọn **mTLS** hoặc **username/password riêng từng thiết bị** ở broker, map credential → `device_id`, ACL chỉ cho `publish v1/devices/<id>/#` và `subscribe v1/devices/<id>/acks`; backend giữ nguyên kiểm tra chéo topic↔payload.
- Bỏ `allow_anonymous`, không publish 1883 ra ngoài loopback trong compose mặc định; bật TLS ở listener.
- Chặn ở CI: test aedes có auth (hoặc `mosquitto_passwd`) chứng minh client không credential **không kết nối được**, client sai topic bị từ chối, và không có row nào được ghi.
- Thêm audit cho mọi publish bị từ chối (hiện chỉ `logger.warn`).

### P0-2 — Không có ingest sự kiện fall/SOS trên MQTT; publish bị bỏ im lặng

**Vị trí:** `mqtt-ingest.service.ts:61` chỉ `subscribe('v1/devices/+/telemetry')`; `incidents.controller.ts:32-40` chỉ có `POST /ingest/events` qua HTTP. `docs/04:61-67` công bố topic `v1/devices/{device_id}/events` cho `fall.candidate|fall.cancelled|fall.confirmed|user.cancel_requested|sos.confirmed` và topic `acks`.

**Bằng chứng [ĐO]:** publish `sos.confirmed` (revision 1, `incident_type: sos`, JSON đúng schema) lên `v1/devices/dddddddd-…/events`:
- broker log: `publish topic=…/events bytes= 518 by= intruder-no-credentials`
- API log: **không có dòng nào** (không warn, không audit).
- `GET /subjects/<An>/alerts?state=open` → `open sos alerts: 0`.

**Hệ quả:** firmware làm đúng `docs/03` (sơ đồ "Device → MQTT broker → Ingest") sẽ nhận `PUBACK` của QoS 1 và coi như đã gửi, trong khi backend không hề biết. Không có ACK ứng dụng, không có lỗi, không có retry → **mất cảnh báo SOS/té ngã im lặng**. Với sản phẩm cảnh báo té ngã đây là lỗi chặn.

**Đề xuất:** chọn một trong hai hướng và ghi thành quyết định:
1. **Hiện thực** ingest `events` + `acks` trên MQTT dùng chung `IncidentsService.ingestEvent` (đảm bảo idempotency như HTTP), publish ACK sau commit, không retain;
2. Hoặc **tuyên bố HTTPS là đường thiết bị duy nhất** cho sự kiện, bỏ topic `events`/`acks` khỏi `docs/03/04/05`, sửa sơ đồ kiến trúc, và ghi rõ firmware phải dùng HTTP cho alert.
Kèm test: publish vào `events` khi chưa hỗ trợ → phải log/audit rõ, không im lặng.

### P0-3 — Dữ liệu đo trước khi đổi chủ bị gán cho chủ mới (FR-03)

**Vị trí:** `telemetry-ingest.service.ts:52-60` lấy assignment **đang mở tại thời điểm nhận**, `:116-134` ghi `assignmentId` đó và `isQuarantined: false`; comment `:20-21` tự ghi "trường hợp đổi chủ khi còn bản tin chưa gửi chưa được giải quyết (R-02/R-03 vẫn mở)". `docs/04:55` yêu cầu: "Khi không đủ bằng chứng để gán dữ liệu vào lịch sử assignment, giữ bản tin ở vùng cách ly; **không tự gán vào chủ hiện tại**". `docs/03:79` yêu cầu gán theo lịch sử assignment.

**Bằng chứng [ĐO]:** thiết bị `REV-IOT-002` đang thuộc hồ sơ An → release → admin cấp claim code → chủ hồ sơ Bình claim → gửi telemetry có `measured_at` **2 giờ trước** thời điểm chuyển:
```
ingest: 202 accepted
Bình timeline: [{"measuredAt":"2026-11-14T22:15:47.365Z","isQuarantined":false,"isLate":true}]
An timeline: 0 mẫu 155 bpm
Bình status: {"lastHeartRateBpm":155,"lastMeasuredAt":"2026-11-14T22:15:47.365Z",
              "firmwareVersion":"buffered-before-transfer"}
```

**Hệ quả:** dữ liệu sức khỏe của người A nằm trong hồ sơ người B và hiển thị cho chủ/caregiver của B. Trái FR-03 (P0) và NFR-05. Trong thực tế firmware **chắc chắn** có buffer qua reboot/mất mạng, nên đây không phải ca hiếm — nó xảy ra mỗi lần đổi chủ khi thiết bị còn dữ liệu chưa gửi.

**Đề xuất:** cần một quyết định thiết kế, không chỉ vá code:
- Server cấp **assignment epoch/token** khi claim (ghi vào NVS của thiết bị, giữ qua reboot), envelope mang epoch; ingest chỉ nhận khi epoch khớp assignment đang mở.
- Hoặc: nếu `measured_at` nằm ngoài khoảng `[assignment.startedAt, now]` (hoặc thiếu giờ tin cậy) → **quarantine**, không lộ cho bất kỳ timeline nào, có hàng đợi kiểm tra + audit.
- Test bắt buộc: mẫu đệm trước chuyển chủ → `isQuarantined=true`, không xuất hiện ở cả hai timeline; mẫu trong cửa sổ → nhận bình thường; mẫu `measured_at=null` trên thiết bị vừa chuyển → quarantine.

---

## 3. Chi tiết P1

### P1-1 — Payload mẫu công bố không parse được bằng schema đang chạy

**Vị trí:** `packages/contracts/examples/fall-confirmed.v1.json`, `examples/event-ack.v1.json` vs `packages/contracts/src/telemetry.ts:71-124`; `docs/04:78` mô tả ACK bằng snake_case.

**Bằng chứng [ĐO]:** parse 3 file mẫu bằng chính schema `dist/`:
```
telemetry.v1.json      : VALID
fall-confirmed.v1.json : INVALID
  incident_type => required ("fall"|"sos")
  evidence.wear_location/motion_quality/heart_rate_quality/heart_rate_bpm => required
  evidence => Unrecognized keys: detected_at, detected_uptime_ms, wear_position,
              cancel_window_ms, signal_quality
event-ack.v1.json      : INVALID
  sourceMessageId, receivedAt, incidentId, acceptedRevision, code, message => required
```
POST nguyên văn `fall-confirmed.v1.json` (chỉ đổi `device_id`) vào `/ingest/events` của API thật → **422 `VALIDATION_FAILED`** với đúng các path trên.

**Hệ quả:** người viết firmware theo tài liệu/`packages/contracts/README` sẽ bị từ chối ngay; phía thiết bị đọc ACK theo `docs/04` (`source_message_id`, `received_at`) sẽ **không parse được** ACK camelCase của server. Hai nguồn sự thật đang mâu thuẫn, và ví dụ là nguồn dễ tin nhất với người làm firmware.

Thêm: `schema_version` không hỗ trợ chỉ trả `422 VALIDATION_FAILED` chung, **không có mã riêng** để firmware phân biệt "sai định dạng" với "version quá mới/cũ" — dễ retry vô hạn hoặc bỏ im lặng.

**Đề xuất:** chọn một quy ước naming và sinh ví dụ từ schema; thêm test CI parse **mọi** `examples/*.json` + round-trip ACK; thêm mã lỗi `SCHEMA_UNSUPPORTED` (hoặc trường `supported_versions`) trong envelope lỗi/ACK.

### P1-2 — Không có đường cấp/đổi khóa cho thiết bị; rotate cắt quyền ngay lập tức

**Vị trí:** `devices.service.ts:137-154` (`rotateDeviceKey`, admin-only), `devices.controller.ts:60-64`; không có endpoint thiết bị nào để lấy/đổi credential. `device-auth.guard.ts:26-29` so `body.device_id` với **UUID trong DB**; cột `devices.id` là `uuid`.

**Bằng chứng [ĐO]:**
```
POST /admin/devices/<id>/rotate-key           -> 200, key mới dài 43
POST /ingest/telemetry (khóa cũ)              -> 401 DEVICE_AUTH_FAILED
POST /ingest/telemetry (khóa mới)             -> 202 accepted
```
`[CODE]` `device_id` trong envelope schema chỉ là string ≤128, nhưng server đòi trùng UUID nội bộ; ví dụ README simulator (`ANNHIEN_DEVICE_ID=sim-device-1`) sẽ 401.

**Hệ quả:** thiết bị đã ra hiện trường **không có cách nhận khóa mới**; rotate = mất telemetry vĩnh viễn cho tới khi tháo máy nạp lại bằng cáp. Không có `key_version`, không có giai đoạn chuyển (overlap); server có audit `device.rotate_key` nhưng không có trạng thái khóa nào phía thiết bị. Quy trình provision (ai nạp `device_id` + `device_key`, qua đâu) **không được mô tả ở bất kỳ tài liệu nào** — `docs/05` chỉ nói "secret provisioned ngoài source".

**Đề xuất:** viết một mục "Provisioning & key lifecycle" gồm: nơi lưu khóa (NVS/efuse), cách nạp ban đầu, endpoint rotate có xác thực thiết bị (old+new hoặc 2 khóa hợp lệ song song), `key_version`/`rotated_at`, thời hạn overlap, và cách thu hồi khi mất thiết bị. Firmware phải lưu được khóa mới **trước** khi khóa cũ hết hiệu lực.

### P1-3 — Firmware không biết nhịp gửi/rate limit; 429 không có `Retry-After`

**Vị trí:** `telemetry-ingest.service.ts:39-40, 209-222` (cửa sổ trong RAM, mỗi process); `policy.service.ts` + `seed.ts:205-222` (seed đặt **60 bản tin/phút**, mặc định code 240, `heartbeat 300s/offline 900s/dataFresh 600s`); không có endpoint cho thiết bị đọc policy (chỉ `PUT /admin/policies/:key`).

**Bằng chứng [ĐO]:**
```
tsx src/cli.ts telemetry --count 70 --interval-ms 0
-> accepted 57, abandoned 13, exit 1
-> {"event":"retry", "http_status":429, "attempt":1..3}
-> {"event":"abandoned", "attempts":4, "error":"HTTP 429"}

GET /subjects/<id>/status -> policy {heartbeat:300, offline:900, fresh:600, maxTelemetryPerMinute:60}
429 response headers: (không có Retry-After); body {"code":"RATE_LIMITED", ...}
```
`docs/03:82` đề xuất 15s/45s/30s — khác cả seed lẫn default code.

**Hệ quả:** firmware gửi cố định 1 mẫu/giây sẽ bị chặn sau 60 mẫu; retry 200/500/1000ms **không thể** vượt cửa sổ 60 giây nên mất dữ liệu (đúng như simulator đang làm). Admin đổi policy thành 1/phút là mọi thiết bị mất dữ liệu mà không có kênh thông báo. Bộ giới hạn trong RAM còn reset khi restart và không chia sẻ giữa nhiều process → không phải hàng rào bảo mật.

**Đề xuất:** thêm kênh cấu hình cho thiết bị (trả kèm ACK hoặc `GET /device/config`: `heartbeat_interval_s`, `max_telemetry_per_minute`, `late_event_minutes`, `policy_version/digest`); 429 phải có `Retry-After` (giây) và ACK có cờ `retryable`; backoff tối thiểu > cửa sổ rate limit; thống nhất số trong `docs/03`, `seed`, default; ghi rõ giới hạn in-memory nếu chưa thay.

### P1-4 — `clock_status` do thiết bị tự khai, không tiêu chí; server nhận thời gian tương lai

**Vị trí:** `packages/contracts/src/telemetry.ts:21-22` (và `:78-79` cho incident); `telemetry-ingest.service.ts:63-66` (chỉ tính `isLate` cho quá khứ, không có biên trên); `incidents.service.ts:266` (`detectedAt = measured_at ?? receivedAt`).

**Bằng chứng [ĐO]:** gửi mẫu `measured_at: "2027-06-01T03:00:00Z"`, `clock_status: "synced"` → **202 accepted**; truy vấn cửa sổ 2027 trả về `isLate: false`, `coverage.expectedCount: 576`, `observedCount: 1`, gaps quanh mốc đó. `daily-summary?date=2027-06-01` → 422 vì "ngày trong tương lai", nên dữ liệu sai **không** bị chặn ở ingest mà chỉ bị ẩn ở một màn hình.

**Hệ quả:** ESP32 không có RTC/SNTP đặt sai giờ (rất phổ biến) sẽ ghi dữ liệu vào ngày khác, làm sai coverage/gap, đặt `detectedAt` của incident ở tương lai và đảo thứ tự cảnh báo. `clock_status: synced` hiện là **lời khai**, không có bằng chứng nào phía server.

**Đề xuất:** định nghĩa quy tắc đồng bộ (SNTP lúc boot, cửa sổ hợp lệ, lưu "last trusted time", chống lùi), thêm biên hợp lý phía server (ví dụ ±5 phút → nhận; ngoài biên → cách ly kèm lý do `clock_implausible`), thêm trường `clock_source`/`clock_updated_at`, và test T-04/NFR-03 với các ca: tương lai 1 ngày, 1970, lùi 1 giờ, RTC mất pin.

### P1-5 — Candidate không có kết quả cuối không bao giờ thành `unconfirmed`

**Vị trí:** `incidents.service.ts:62-92` — `applyTransition` không bao giờ trả `unconfirmed`; không có job nào chuyển `suspected`; `:645` danh sách `open` = `open|acknowledged`, `closed` = `resolved|cancelled|unconfirmed`.

**Bằng chứng [CODE]:** `unconfirmed` chỉ xuất hiện trong enum, label UI và bộ lọc; không có nơi ghi. `docs/03:80` yêu cầu hiển thị "chưa xác định do thiếu dữ liệu" khi candidate không có kết quả cuối.

**Hệ quả:** ca nguy hiểm nhất — thiết bị mất nguồn/hỏng/wifi chết ngay sau khi phát hiện nghi ngã — tạo incident `suspected` **vĩnh viễn**, không nằm trong danh sách mở, không có trong danh sách đóng, không có thông báo. Người thân không biết; báo cáo cũng không có bản ghi "chưa xác định". Firmware không thể bù được vì server đã nhận candidate.

**Đề xuất:** job chuyển `suspected → unconfirmed` sau timeout cấu hình được (cửa sổ hủy + biên mạng + heartbeat), tạo outbox "chưa xác định, thiếu dữ liệu", audit, và hiển thị trong danh sách đóng. Test: candidate rồi im lặng → `unconfirmed` + notification; candidate → confirmed muộn (sau timeout) vẫn mở cảnh báo, không bị coi là bình thường.

### P1-6 — Heartbeat/status chỉ có trên giấy, không schema, không ingest

**Vị trí:** `docs/04:65-68` (topic `status`, presence/LWT); không có subscriber trong `mqtt-ingest.service.ts`; `device-status.ts:23-37` suy `online` từ `devices.lastSeenAt`, chỉ được cập nhật bởi telemetry; `deviceStatusSchema.clockStatus` lấy từ bản telemetry cuối.

**Bằng chứng [CODE] + [ĐO]:** mọi lần thiết bị thành "online" trong phiên đo đều nhờ telemetry; không có topic `status` nào được đọc. Docs nói heartbeat 15s nhưng seed đặt 300s, và không có bảng/cột nào lưu heartbeat riêng.

**Hệ quả:** firmware làm theo docs (heartbeat trên `status`, telemetry thưa hơn) sẽ **không bao giờ** được coi là online. Không phân biệt được "thiết bị còn sống nhưng không đo được" với "mất kết nối"; `freshness` trộn hai khái niệm `last_seen` và `last_measured`; cảnh báo "thiết bị offline" không có nguồn dữ liệu độc lập.

**Đề xuất:** chọn và ghi rõ: (a) thêm `heartbeat` vào envelope telemetry (không ghi measurement, chỉ cập nhật `last_seen`), hoặc (b) định nghĩa schema `status` + ingest riêng. Tách `last_seen_at` (bất kỳ bản tin) khỏi `last_measured_at` (chỉ mẫu đo). Xử lý LWT như tín hiệu riêng, không ghi vào bảng `telemetry`. Cập nhật `docs/03:78-84` cho khớp policy thực.

### P1-7 — `steps_since_boot` bắt buộc, không có `null`/quality → "0 bước" giả

**Vị trí:** `packages/contracts/src/telemetry.ts:26-27` (`steps_since_boot: int nonnegative`, không nullable); `measurements.service.ts:457-490` (`computeSteps` trả `total: 0, completeness: 'complete'` khi có mẫu).

**Bằng chứng [CODE]:** board không có thuật toán đếm bước, hoặc `motion: sensor_error`, **buộc** phải gửi `steps_since_boot: 0`; daily summary hiển thị `steps.total = 0`, `completeness = 'complete'`. Trái `FR-04` ("thiếu/sai tín hiệu không thành số 0") và tinh thần `FR-08`.

**Hệ quả:** báo cáo nói "0 bước hôm nay" như một phép đo thật, trong khi thực tế là "không đo được". Với người cao tuổi, đây là thông tin sức khỏe sai chứ không phải lỗi hiển thị.

**Đề xuất:** `steps_since_boot: int|null` + `quality.steps: valid|not_worn|sensor_error|unsupported`; map null/unsupported → `steps.completeness = 'unavailable'`; quyết định **trước** khi viết firmware vì đây là thay đổi hợp đồng (schema_version).

### P1-8 — Không nêu phạm vi duy nhất của `message_id`/`boot_id`; xung đột sau reboot

**Vị trí:** `docs/04:44-47` chỉ nói "sequence tăng trong cùng boot, giữ khi gửi lại"; unique index `schema.ts:305-306` là `(device_id, message_id)` và `(device_id, boot_id, sequence)`; `telemetry-ingest.service.ts:75-113` trả **409 apiError**, không phải ACK `rejected`.

**Bằng chứng [ĐO]:**
```
cùng message_id, khác nội dung        -> 409 {"code":"CONFLICT", details.kind="message_id_conflict"}
cùng (boot_id, sequence), khác msg_id -> 409 {"code":"CONFLICT", details.kind="sequence_conflict"}
```
`[CODE]` `message_id` không có ràng buộc định dạng (string ≤128). Firmware hay dùng `message_id = "m" + sequence` và reset `sequence` theo boot → boot thứ hai tái sử dụng `m1`, trùng `(device_id, message_id)` với boot trước, payload khác → 409. Trong simulator, 4xx bị coi là lỗi vĩnh viễn → **bỏ bản tin**.

**Hệ quả:** mất dữ liệu/cảnh báo sau reboot; firmware phải xử lý hai hình dạng lỗi (ACK `rejected` trong 202 và 409 apiError) và không có tài liệu nào nói phải làm gì với 409.

**Đề xuất:** ghi rõ trong `docs/04`: `message_id` **duy nhất theo thiết bị trong toàn vòng đời**, sinh từ CSPRNG, **không** suy ra từ `sequence`/`boot_id`; gửi lại phải giữ nguyên bộ giá trị đã parse (không tính lại `measured_at`); `boot_id` mới mỗi lần boot và không tái sử dụng. Map xung đột thành ACK `rejected` có `code` (`MESSAGE_ID_CONFLICT`, `SEQUENCE_CONFLICT`) hoặc ghi rõ "409 là lỗi vĩnh viễn, chuyển vùng lỗi".

### P1-9 — Simulator chạy thật ghi `source='http'` nên không còn nhãn synthetic

**Vị trí:** `telemetry-ingest.service.ts:133` (`source` = `'http'|'mqtt'`); `core.ts` `isSyntheticDataSource` chỉ nhận `'simulator'|'synthetic'`; `seed.ts:231` (`update telemetry set source='simulator'`) và `:303`; `measurements.service.ts:198,213`.

**Bằng chứng [CODE] + [ĐO]:** `GET /subjects/<id>/measurements` **không trả** `isSynthetic` (schema `measurementPointSchema` không có trường này, zod strip); daily summary `source: "synthetic"` trong phiên đo chỉ vì seed đã ghi đè `source='simulator'` cho dữ liệu seed. Mẫu do simulator/HTTP gửi thật có `source='http'`.

**Hệ quả:** trên DB sạch (không seed), `pnpm demo` tạo dữ liệu được API coi là `source: "device"` và web hiển thị như dữ liệu thật. `docs/14:170` ("telemetry ghi `source='simulator'` và hiển thị `is_synthetic=true`") chỉ đúng với seed, không đúng với đường ingest thật. Đây đúng là kiểu "simulator che lấp lỗi thật": demo trông giống thiết bị và được dán nhãn là thiết bị.

**Đề xuất:** đánh dấu provenance ngay ở ingest (header `X-Data-Source: simulator` chỉ chấp nhận ở môi trường dev, hoặc suy từ `firmware_version` có hậu tố `-sim` theo allowlist), trả `isSynthetic` trong `measurementPoint` và `dailySummary`, test rằng đường simulator thật **luôn** bị gắn nhãn. Sửa lại `docs/14:170` cho khớp.

---

## 4. Chi tiết P2

### P2-1 — `late` của incident sai nghĩa và hardcode 5 phút
`incidents.service.ts:939-940`: `late = lastEventAt − detectedAt > LATE_EVENT_MINUTES`, trong đó `detectedAt` lấy từ `measured_at` của sự kiện đầu, `lastEventAt = receivedAt` của sự kiện mới nhất. Vì vậy một incident mở 10 phút rồi mới resolve bị gắn "nhận trễ", trong khi một sự kiện thực sự đến muộn chỉ bị bắt nhờ trùng hợp. Ngưỡng hardcode, **không dùng** `policy.lateEventMinutes` (admin sửa được, và telemetry dùng policy). Đề xuất: tính `late` tại thời điểm nhận sự kiện đầu (`receivedAt − measured_at > policy`), lưu vào incident; tách "long-running" khỏi "late"; test T-09.

### P2-2 — `heart_rate_bpm` min 20 làm mất giá trị sinh lý thấp
`telemetry.ts:26` (và `:92` cho `evidence.heart_rate_bpm`) đều `min(20)`. Nhịp 18 bpm (nhịp chậm nặng) là giá trị thật nhưng không gửi được; nếu chất lượng cảm biến `valid`, firmware buộc gửi `null` và mẫu bị tính `invalidSamples`. Đề xuất: nới biên hoặc thêm `quality` riêng cho "ngoài dải sinh lý" kèm ghi chú nguồn y khoa; không im lặng biến giá trị nguy hiểm thành "không có dữ liệu".

### P2-3 — Claim code: không throttle, không audit, không chuẩn hóa chữ hoa
[ĐO] 30 lần claim sai liên tiếp → `{"422":30}`, không lockout, không audit (audit chỉ ghi khi thành công), không có độ trễ. Không gian `32^9` nên dò là không thực tế, nhưng thiếu lớp chống lạm dụng và thiếu dấu vết. Bảng chữ là chữ hoa nhưng input không `trim().toUpperCase()` → người dùng gõ chữ thường bị từ chối. Đề xuất: giới hạn số lần theo user/thiết bị, audit lần sai, chuẩn hóa input.

### P2-4 — Header hợp đồng không dùng, không kiểm độ dài khóa, thiếu yêu cầu TLS/redaction
`ingestHeadersSchema` (`x-device-key` min 16) **không được guard dùng** — guard chỉ kiểm có/không. Khóa là bearer token trong header; `docs/03` chỉ nói TLS cho MQTT, không nói HTTPS bắt buộc cho ingest HTTP (thực tế phải có reverse proxy TLS). Không có quy tắc redaction header thiết bị khi log. Đề xuất: dùng schema trong guard, ghi yêu cầu TLS termination + redaction, test khóa ngắn bị từ chối và log không chứa khóa.

### P2-5 — Không audit thất bại xác thực/giới hạn ở đường telemetry
`DeviceAuthService` ném lỗi mà không ghi audit; telemetry `DEVICE_NOT_CLAIMED` trả ACK mà không audit (incidents thì có). Không thấy dấu hiệu thiết bị nạp sai khóa, bị thu hồi, hay bị dò. Đề xuất: audit `device.auth_failed`/`telemetry.rejected`/`rate_limited` với bộ đếm tổng hợp để không làm ngập log.

### P2-6 — `evidence` strict thiếu trường chẩn đoán
Schema `incidentEnvelopeSchema.evidence` bắt buộc `algorithm_version`, `wear_location`, `motion_quality`, `heart_rate_quality`, `heart_rate_bpm` và `.strict()` — ví dụ công bố dùng `detected_uptime_ms`, `cancel_window_ms`, `wear_position`, `signal_quality` đều bị 422. `docs/05` lại yêu cầu giải thích được nguyên nhân (thời điểm, cửa sổ hủy, đặc trưng IMU). Đề xuất: `evidence` có nhóm optional cho chẩn đoán (`detected_uptime_ms`, `impact`, `free_fall_ms`, `cancel_window_ms`) hoặc `evidence.extra` có version; chốt cùng lúc với P1-1.

### P2-7 — `isQuarantined` luôn `false`; gap reason `quarantined` chết
`telemetry-ingest.service.ts:131` luôn `false`; `measurementGapReasonSchema` có `quarantined` nhưng không nơi nào sinh. Liên quan trực tiếp P0-3; khi sửa P0-3 phải dùng lại đường này.

### P2-8 — Simulator: khoảng trống ca biên và sai lệch `uptime_ms`
- Profile `poor` chỉ tạo `poor_signal`; **không** có `motion: sensor_error`, `heart_rate: not_worn`, `battery_percent: null`, telemetry `measured_at: null`.
- Không mô phỏng lệch giờ, mất gói, độ trễ; `gap` là bỏ mẫu trước khi gửi, không phải mất gói/retry.
- `steps` tăng 7–13 **mỗi mẫu**, không theo thời gian → tổng ngày phụ thuộc số mẫu, không phụ thuộc thời lượng.
- `uptime_ms` tăng theo `intervalMs` cấu hình, còn `measured_at` lấy đồng hồ thật; khi queue retry/backoff chặn vòng lặp, hai giá trị lệch nhau — firmware thật sẽ không như vậy, và simulator không phát hiện được kiểm tra nhất quán.
- Test dùng mock server dễ dãi (README đã ghi), nên các lỗi thật ở mục P1-1/P1-2/P1-3 không thể lộ.
Đề xuất: thêm `--clock-skew`, `--drop-rate`, `--latency`, `--motion-error`, `--battery-null`; golden envelope; một script integration thật (seed + API 32xx + demo) chạy khi có DB; assert nhãn synthetic.

---

## 5. Các kiểm đã chạy và kết quả đạt (để đối chiếu, không phải finding)

| Phép kiểm | Kết quả [ĐO] |
| --- | --- |
| `pnpm build:contracts`, `pnpm -r typecheck` | exit 0, 4 package `Done` |
| `tools/simulator`: `npm test` | 23/23 pass (mock server) |
| `apps/api`: jest `ingest|devices|incidents` | 31/31 pass |
| Gửi lặp cùng `message_id`, cùng giá trị, **đảo thứ tự khóa** | `duplicate` (payloadHash sau khi zod parse chuẩn hóa thứ tự) |
| Cùng `message_id`, khác nội dung | `409` `message_id_conflict`, không ghi đè |
| Cùng `(boot_id, sequence)`, khác `message_id` | `409` `sequence_conflict` |
| `clock_status=unsynced` + `measured_at=null` | `202 accepted`; measurements loại khỏi timeline, `excludedUnsyncedCount=1` |
| Thiết bị chưa claim | `202` `rejected` `DEVICE_NOT_CLAIMED`, không ghi row |
| Sai khóa | `401 DEVICE_AUTH_FAILED` |
| `device_id` body ≠ thiết bị đã xác thực | `403 FORBIDDEN` |
| Rotate khóa | khóa cũ `401`, khóa mới `202` (xem P1-2) |
| Rate limit | 429 sau 60 bản tin/phút, **không** `Retry-After` |
| Simulator end-to-end với API thật | 3/3 telemetry accepted, exit 0 |
| `daily-summary` ngày tương lai | `422` (chặn đúng) |

Lưu ý: `payloadHash` được tính trên envelope **đã parse** (`JSON.stringify`) nên thứ tự khóa đầu vào không ảnh hưởng — docstring trong `telemetry-ingest.service.ts:23-24` nói "phải gửi lại byte-tương đương" là **sai/siêu chặt**, dễ làm firmware lo lắng không cần thiết; yêu cầu thật là "cùng bộ giá trị đã parse". Ngược lại, mọi thay đổi giá trị (kể cả tính lại `measured_at`) đều thành 409.

---

## 6. Checklist chặn firmware (phải chốt trước khi viết/nạp firmware thật)

Đánh dấu ✅ chỉ khi có quyết định trong tài liệu **và** hành vi kiểm được; hiện **chưa mục nào đạt**.

| # | Hạng mục | Hiện trạng | Chặn bởi |
| --- | --- | --- | --- |
| 1 | Chốt transport chính (MQTT hay HTTPS) cho telemetry **và** cảnh báo, kèm ACK ứng dụng sau commit | MQTT chỉ telemetry, không ACK; sự kiện MQTT bị bỏ im lặng | P0-1, P0-2 |
| 2 | Xác thực thiết bị ở broker (mTLS hoặc user/pass riêng) + ACL theo `device_id`; bỏ anonymous, TLS | `allow_anonymous true`, publish 1883 ra host | P0-1 |
| 3 | Quy trình provisioning: nạp `device_id` (UUID) + `device_key` vào NVS, bằng công cụ nào, ai làm | Không có tài liệu, không endpoint | P1-2 |
| 4 | Rotate khóa có overlap + `key_version` + audit; thiết bị nhận được khóa mới | Rotate cắt quyền ngay, không kênh nhận khóa | P1-2 |
| 5 | Định nghĩa "giờ tin cậy": nguồn (SNTP/RTC), tiêu chí `synced`, biên lệch, hành vi khi mất pin RTC | `synced` tự khai; server nhận năm 2027 | P1-4 |
| 6 | Quy tắc sinh `message_id`/`boot_id`/`incident_id`: CSPRNG, phạm vi duy nhất, giữ nguyên khi retry/reboot | Chưa nêu; `message_id` theo sequence sẽ 409 | P1-8 |
| 7 | Bảng mã lỗi cho firmware: 202 accepted/duplicate/rejected (+code), 409, 401, 403, 429 + `Retry-After`, backoff tối thiểu | Hai hình dạng lỗi, không `Retry-After` | P1-3, P1-8 |
| 8 | Kênh cấu hình cho thiết bị (nhịp heartbeat, rate limit, ngưỡng trễ, policy version) | Không có; admin đổi policy vô hình với thiết bị | P1-3 |
| 9 | Heartbeat/status: schema + ingest + LWT, tách `last_seen` khỏi `last_measured` | Chỉ có trên giấy | P1-6 |
| 10 | `steps` nullable + quality; `battery` null; quality cho từng cảm biến; quy tắc "không đo được ≠ 0" | `steps` bắt buộc, không null | P1-7 |
| 11 | Chính sách thời gian dùng chung: `lateEventMinutes` cho cả incident; timeout `suspected → unconfirmed` | Hardcode 5 phút; không có timeout | P2-1, P1-5 |
| 12 | Chuyển chủ: assignment epoch/token hoặc quarantine theo cửa sổ assignment | Gán thẳng cho chủ hiện tại | P0-3 |
| 13 | Hàng đợi bền trên thiết bị: dung lượng, ưu tiên incident, hành vi khi đầy, đếm mẫu mất, fsync/NVS, phục hồi sau mất nguồn | Chỉ có queue RAM của simulator; `docs/03/05` nói phải tự hiện thực, **chưa có thiết kế hay số đo** | — |
| 14 | Sinh & kiểm ví dụ payload từ schema; chốt naming ACK | 2/3 ví dụ sai | P1-1 |
| 15 | Đánh dấu dữ liệu simulator ở ingest và hiển thị | Ghi `source='http'` | P1-9 |
| 16 | Bằng chứng phần cứng: board/SDK/ESP-MQTT version, pin mapping, dòng tiêu thụ, vị trí đeo | **Chưa có** (firmware/README và hardware/README đã ghi đúng là chưa có) | — |

> Chưa có mục nào về **độ chính xác phát hiện ngã, BPM, bước chân hay thời lượng pin** trong checklist này vì chưa có dữ liệu đo — không được suy ra từ báo cáo này.

---

## 7. Đề xuất test hợp đồng/simulator cụ thể

Ưu tiên đặt ở lớp sở hữu invariant; mã `CT-*` là đề xuất mới, ánh xạ tới `docs/08` để không tạo hai nguồn.

| Mã | Kịch bản | Kỳ vọng | Ánh xạ docs/08 |
| --- | --- | --- | --- |
| CT-01 | Parse **mọi** `packages/contracts/examples/*.json` bằng schema; round-trip ACK qua parser phía thiết bị | 100% valid; CI fail nếu lệch | mới (P1-1) |
| CT-02 | Envelope: `unsynced`+`null`, `bpm:null`+`poor_signal`, `steps:null`+`unsupported`, field lạ, `schema_version` lạ | Đúng 202/422 với mã lý do phân biệt được | T-04 |
| CT-03 | Gửi lại sau reboot: cùng bộ giá trị → `duplicate`; `message_id` suy từ `sequence` ở boot 2 → `rejected`/409 có tài liệu | Không mất bản tin, firmware biết phải làm gì | T-06, NFR-02 |
| CT-04 | Đổi chủ: mẫu đệm trước chuyển (có giờ / không giờ) | `isQuarantined=true`, không hiện ở timeline A hoặc B | T-03 |
| CT-05 | Lệch giờ: +1 ngày, −1 giờ, 1970, RTC mất pin | Cách ly kèm lý do; daily summary/gaps không bị lệch | T-04, NFR-03 |
| CT-06 | Rate limit: 429 có `Retry-After`; simulator chờ và gửi đủ; hai instance API chia sẻ giới hạn (nếu multi-process) | 0 bản tin bị bỏ | T-09, NFR-06 |
| CT-07 | Auth: thiếu khóa, khóa ngắn, khóa sai, khóa đã rotate, `device_id` lệch | 401/403, không ghi row, có audit | T-01, T-12 |
| CT-08 | MQTT: không credential → bị từ chối; publish topic thiết bị khác → bị từ chối; publish `events` → ingest + ACK hoặc lỗi rõ; LWT không thành measurement | Không có row lạ, không mất sự kiện | T-05, T-10 |
| CT-09 | Heartbeat: chỉ heartbeat → online nhưng không có measurement; ngừng heartbeat → offline đúng policy; `clockStatus` phản ánh đúng | Phân biệt "không đo" với "mất kết nối" | T-09, FR-08 |
| CT-10 | Vòng đời candidate: candidate rồi im lặng → `unconfirmed` + thông báo; candidate→confirmed muộn; confirmed đến trước candidate; replay | Không mở lại incident đã đóng, không mất cảnh báo | T-05, T-06 |
| CT-11 | Nhãn synthetic: ingest từ simulator → `isSynthetic=true` ở measurements + daily summary + CSV | Không thể nhầm với dữ liệu thiết bị | mới (P1-9) |
| CT-12 | Simulator honesty: golden run có số mẫu/tổng bước biết trước; 429/500 → gửi đủ; `uptime_ms` nhất quán với delta `measured_at` | Kịch bản demo tái lập được và không "xanh giả" | T-06, T-09 |

Ghi chú thực thi: `npm test` của simulator hiện chỉ dùng mock server; CT-01/CT-03/CT-06/CT-11 nên chạy với API thật trên DB tạm (`.data/…`) trong CI khi có Postgres/PGlite, tách khỏi unit test để không phụ thuộc mạng.

---

## 8. Giới hạn của review này

- **[CHƯA KIỂM]** Không có phần cứng: không có board ESP32, cảm biến, pin, vị trí đeo, không có firmware build. Không kết luận gì về độ nhạy/độ chính xác, độ trễ thực, dòng tiêu thụ, thời lượng pin hay hành vi khi mất nguồn thật.
- **[CHƯA KIỂM]** Không có TLS/mTLS, không có Mosquitto thật: broker dùng trong phiên là aedes cục bộ mô phỏng `allow_anonymous` của `mosquitto.conf`; kết luận P0-1 là về **cấu hình và code**, không phải về một broker production cụ thể.
- **[CHƯA KIỂM]** Không chạy tải lớn, không kiểm race đa process cho rate limit (chỉ đọc code thấy Map trong RAM).
- Không kiểm MQTT ACK, không kiểm retain/LWT thật, không kiểm QoS 1 trùng lặp ở broker.
- Không đánh giá nội dung `docs/05` về thuật toán (free-fall/impact/bất động) — chỉ đối chiếu phần hợp đồng dữ liệu mà thuật toán đó cần gửi lên.
- Các kết luận P1-5, P1-7, P2-1, P2-2, P2-4, P2-5, P2-7 là **[CODE]**; chưa dựng kịch bản runtime cho từng ca.
- Phiên đo dùng dữ liệu seed tổng hợp và vài thiết bị review; không có dữ liệu người thật.

---

## 9. Tóm tắt 5 dòng

1. Ba lỗi chặn firmware: MQTT không xác thực (đã chèn 199 bpm vào thiết bị demo từ client không credential), topic sự kiện `fall/SOS` không tồn tại (publish bị bỏ im lặng, không ACK), và telemetry đệm trước khi đổi chủ bị gán cho chủ mới thay vì cách ly (FR-03).
2. Chín P1 khiến firmware không thể triển khai đúng hợp đồng đang công bố: 2/3 payload mẫu sai schema (422 thật), không có đường cấp/rotate khóa cho thiết bị, không có kênh cấu hình/rate limit và 429 thiếu `Retry-After` (simulator mất 13/70 bản tin), `clock_status` tự khai và server nhận timestamp 2027, candidate không bao giờ thành `unconfirmed`, heartbeat chỉ có trên giấy, `steps` bắt buộc nên thiếu pedometer thành "0 bước", `message_id` theo sequence sẽ 409 sau reboot, và dữ liệu simulator chạy thật không được đánh dấu synthetic.
3. Simulator trung thực ở những gì đã khai báo (dữ liệu tổng hợp, queue RAM, không MQTT, 23/23 test pass) nhưng che lỗi thật vì test dùng mock server, không tạo được ca `not_worn/sensor_error/battery null/lệch giờ/mất gói`, và ghi `source='http'` nên demo trông như thiết bị thật.
4. Đã chạy thật: typecheck 4 package, 23 test simulator, 31 test API ingest/devices/incidents, hơn 100 request trên API cổng 3211/3212 với DB `.data/review-iot`, broker aedes cục bộ; đã tắt toàn bộ process, chỉ file báo cáo này là thay đổi trong repo (untracked), không commit.
5. Chưa có bằng chứng phần cứng nào: báo cáo này chỉ chốt hợp đồng, bảo mật thiết bị và các test cần bổ sung trước khi làm firmware thật.
