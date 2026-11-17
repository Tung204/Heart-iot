# Handoff wave 1 — sim (thiết bị mô phỏng)

- Repo: `C:/MyFolder/Hoc_Tap/project/DATN`
- Vai trò: worker **sim** (không phải lead)
- Thời điểm ghi: 2026-11-14 21:45 (Asia/Ho_Chi_Minh)
- Prompt gốc: `reports/orchestration/prompts/wave1-sim.md`

## Trạng thái

Phần giao của wave 1 đã cài xong trong `tools/simulator`, typecheck và test chạy thật đều đạt.
**Chưa chạy end-to-end với API thật**: tại thời điểm làm bài, `apps/api/src/ingest` chưa tồn tại
(`ls apps/api/src/ingest` → không có), nên chỉ kiểm với mock server `node:http` và một mock server
tiến trình thật cho CLI.

Không sửa file ngoài `tools/simulator/**` (README simulator được phép) và file handoff này.
`package.json`, `tsconfig.json`, contracts, docs, API, root config: chỉ đọc. Không chạy `git`,
không `pnpm add`, không đổi `.env`.

## File đã tạo/cập nhật

| File | Nội dung |
| --- | --- |
| `tools/simulator/src/cli.ts` | Entry `tsx src/cli.ts`, gán `process.exitCode` từ `runCli` |
| `tools/simulator/src/app.ts` | `runCli`, 3 lệnh (`telemetry`, `fall`, `demo`), help, exit code 0/1/2 |
| `tools/simulator/src/args.ts` | Đọc `--flag value`/`--flag=value`, lỗi tham số rõ ràng |
| `tools/simulator/src/env.ts` | `ANNHIEN_BASE_URL/DEVICE_ID/DEVICE_KEY/FIRMWARE`, kiểm định dạng |
| `tools/simulator/src/device.ts` | `SimDevice` (boot/sequence/uptime/steps/pin) + `TelemetrySimulator` profile normal/poor/gap/reset |
| `tools/simulator/src/incident.ts` | Envelope sự kiện incident, `incident_id = sim-<uuid>`, evidence + `algorithm_version` |
| `tools/simulator/src/client.ts` | `postTelemetry`, `postIncident`, header thiết bị, timeout 10s, trả `{status, body}` |
| `tools/simulator/src/queue.ts` | Hàng đợi hữu hạn 50, retry giữ `message_id`, backoff, bỏ 4xx trừ 429, ưu tiên incident |
| `tools/simulator/src/runtime.ts` | Ghép client+queue, parse ACK, in mỗi phản hồi 1 dòng JSON, kết quả gửi chuẩn hóa |
| `tools/simulator/src/io.ts` | Io + lọc device key khỏi mọi dòng stdout/stderr |
| `tools/simulator/src/rng.ts` | PRNG có seed để kịch bản lặp lại được |
| `tools/simulator/README.md` | Cách chạy, profile, mode, giới hạn queue trong bộ nhớ, phần chưa làm |
| `tools/simulator/test/mock-server.ts`, `helpers.ts`, `capture.ts` | Mock server `node:http`, env mẫu, parse envelope, thu output |
| `tools/simulator/test/{telemetry,profiles,fall,queue,cli,redaction,demo}.test.ts` | 23 test `node:test` |

Không thêm dependency; chỉ dùng `zod`, `@annhien/contracts`, `tsx`, `typescript`, `@types/node` đã khai báo.

## Hành vi đã cài

- `telemetry --count N --interval-ms M --profile normal|poor|gap|reset [--seed S]`
  - `normal`: HR 68–82, `quality.heart_rate=valid`, steps tăng, pin 80.
  - `poor`: 2/3 mẫu `poor_signal` + `heart_rate_bpm: null` (không dùng 0).
  - `gap`: bỏ 3 mẫu liên tiếp bắt đầu từ mẫu thứ 3; `sequence` vẫn tăng; mẫu sau gap vẫn gửi.
  - `reset`: sau 3 mẫu reboot → `boot_id` mới, `sequence` về 1, `steps_since_boot` về 0.
  - `measured_at` = UTC RFC3339 (`toISOString`), tăng theo thời gian chạy thật; `uptime_ms` monotonic trong boot.
- `fall --mode cancel|confirm|duplicate|late|sos --cancel-window-ms 3000`
  - `cancel`/`confirm`: candidate rev1 → chờ cửa sổ → cancelled/confirmed rev2, cùng `incident_id`, `sequence` tăng.
  - `confirm` gửi `evidence.algorithm_version = sim-rules-v1` (cùng mọi event).
  - `duplicate`: dựng **một** envelope `fall.confirmed` rồi gửi hai lần y nguyên (cùng `message_id`, `sequence`, body); in ACK `accepted` rồi `duplicate`.
  - `late`: candidate `clock_status=unsynced`, `measured_at=null`; confirmed `synced` + `measured_at` hiện tại.
  - `sos`: `sos.confirmed` rev1, `incident_type=sos`, không chờ.
  - `incident_id` mới mỗi lần chạy dạng `sim-<uuid>` (trừ duplicate).
- `demo [--fast]`: 5 normal → 3 poor → cancel → 11 mẫu gap (8 gửi, 3 bỏ) → confirm; dừng + exit 1 khi gặp rejected/lỗi.
  Mặc định interval 1000ms, cửa sổ 3000ms (~22s); `--fast` = 100ms/200ms.
- Mỗi phản hồi một dòng JSON (`event: ack|retry|boot`), cuối là `event: summary`.
- Exit code: 0 thành công; 1 có rejected/failed/abandoned; 2 tham số hoặc env sai/thiếu.
- ACK được parse bằng `ingestAckSchema`; 2xx không đúng schema bị coi là lỗi (không "đạt" giả).

## Lệnh và kết quả thật

| Lệnh (cwd `tools/simulator`) | Kết quả |
| --- | --- |
| `pnpm typecheck` | exit 0, chỉ in `$ tsc -p tsconfig.json --noEmit` |
| `npm test` | **exit 0; 23 test / 23 pass, 0 fail**, ~4.7s (`node --import tsx --test test/*.test.ts`) |
| `pnpm build` | exit 0 nhưng **không sinh `dist/`** vì `tsconfig.json` có `"noEmit": true` (file ngoài vùng ghi, không sửa) |
| mock `node:http` + `pnpm exec tsx src/cli.ts demo --fast` | exit 0; 20 request (16 telemetry + 4 event); summary `generated:19, sent:20, skipped:3, accepted:20, rejected:0`; 21 dòng stdout JSON, stderr rỗng |
| `... fall --mode duplicate` | exit 0; 2 request cùng `message_id=12ff559c-…`; ACK 1 `accepted`, ACK 2 `duplicate`; summary `requests:2, accepted:1, duplicate:1` |
| `... telemetry --count 4 --interval-ms 50 --profile gap` | exit 0; 2 request; summary `generated:4, sent:2, skipped:2` (gap bắt đầu ở mẫu thứ 3 nên count 4 chỉ thấy 2 mẫu bị bỏ) |
| `... telemetry --profile nope` | exit 2; stderr `Lỗi: --profile không hợp lệ: "nope" (chấp nhận: normal\|poor\|gap\|reset)` |
| `... --help` | exit 0, in hướng dẫn |
| `grep -c <device key> /tmp/{demo,dup,gap}.{out,err}` | 0 ở mọi file — key không bị in |

Các lần chạy CLI thật ở trên dùng mock server tiến trình riêng (port 3987) trả ACK `accepted`,
`duplicate` theo `message_id` đã thấy; script mock nằm ở `/tmp/annhien-mock.cjs`, không commit.
Output đầy đủ ở `/tmp/demo.out`, `/tmp/dup.out`, `/tmp/gap.out`, `/tmp/sim-test.log`.
Không chạy với API thật vì endpoint ingest chưa có.

### Bản đồ test

| # yêu cầu trong prompt | Test |
| --- | --- |
| 1. Header/body, schema, sequence | `telemetry.test.ts` — T-sim-01 |
| 2. poor HR null | `profiles.test.ts` — T-sim-02 |
| 3. gap sequence nhảy, không gửi mẫu thiếu | `profiles.test.ts` — T-sim-03 |
| 4. reset boot/steps/sequence | `profiles.test.ts` — T-sim-04 |
| 5. fall cancel 2 event cùng incident, rev 1→2 | `fall.test.ts` — T-sim-05 |
| 6. confirm bị rejected → exit 1 | `fall.test.ts` — T-sim-06; demo rejected → `demo.test.ts` |
| 7. duplicate cùng message_id/body | `fall.test.ts` — T-sim-07 |
| 8. queue 500→retry cùng id; 4xx không retry | `queue.test.ts` — T-sim-08a/b; thêm 08c schema chặn trước khi gửi, 08d đầy queue ưu tiên incident, 08e giới hạn retry |
| 9. không in device key | `redaction.test.ts` — T-sim-09 (kể cả lỗi mạng) |
| phụ | `cli.test.ts` (help/exit 2), `demo.test.ts` (kịch bản đầy đủ, exit 1 khi rejected) |
| thêm | `fall.test.ts` cho `confirm` happy path, `late`, `sos` |

## Phần chưa làm (đúng như prompt, không báo đạt)

- **Buffer bền**: hàng đợi chỉ trong bộ nhớ; tắt process là mất phần chưa gửi. Không phải buffer
  hữu hạn có phục hồi sau reboot của firmware (docs 05) và không thay kiểm T-09.
- **MQTT**: chưa publish `v1/devices/{id}/telemetry|events`; chỉ HTTP ingest. Chưa kiểm QoS/retain/ACL.
- **Đồng bộ đồng hồ**: mọi telemetry là `synced`; mode `late` chỉ mô phỏng unsynced→synced, không
  tạo `measured_at` lùi để server gắn cờ trễ.
- Chưa mô phỏng rate limit 429, mất gói từng phần, tải lớn, nhiều thiết bị đồng thời.
- Chưa chạy với API thật/seed; chưa kiểm ACK thật của be-data/be-alerts.

## Rủi ro tích hợp API

1. **Route**: simulator gọi `POST {ANNHIEN_BASE_URL}/ingest/telemetry` và `/ingest/events` theo
   `docs/14` mục 6 và prompt be-data. Nếu be-data đặt tên khác, chỉ cần sửa 2 chuỗi trong
   `src/client.ts` (không rải rác).
2. **Tên trường ACK**: simulator parse `ingestAckSchema` (camelCase: `sourceMessageId`,
   `receivedAt`, `incidentId`, `acceptedRevision`). `docs/04` mô tả ACK snake_case; contracts là
   nguồn đang dùng. Nếu API trả snake_case, 2xx sẽ bị coi là ACK không hợp lệ và lệnh exit 1 —
   cần be-data/lead chốt trước demo.
3. **HTTP status cho rejected**: simulator coi 2xx + `status=rejected` (202 theo prompt be-data) là
   "đã nhận nhưng bị từ chối" → exit 1; coi 4xx là lỗi vĩnh viễn. Nếu API trả 4xx
   `DEVICE_NOT_CLAIMED` thay vì 202 rejected, demo vẫn exit 1 nhưng log khác (`ack_status: rejected`
   từ HTTP, không có `incident_id`). Không thay đổi kết quả nghiệp vụ.
4. **Dedup**: mode `duplicate` gửi cùng body nên khớp `payloadHash` nếu be-data hash
   `JSON.stringify(envelope)` như prompt; nếu server canonicalize khác, payload vẫn giống hệt từng byte.
5. **Điều kiện tiên quyết**: thiết bị phải được admin tạo + owner claim (khóa 32 byte base64url).
   Simulator không có đường tạo/claim thiết bị; thiếu bước này sẽ nhận `DEVICE_NOT_CLAIMED`.
6. **Sequence/boot**: mỗi lần chạy process sinh `boot_id` mới nên chạy lại an toàn; nếu chạy hai
   process cùng `device_id` đồng thời, mỗi process có boot riêng và sequence riêng — hợp lệ theo
   contract nhưng thứ tự thời gian có thể lẫn.
7. **Rate limit**: policy mặc định 240 telemetry/phút; `--interval-ms 0` với count lớn có thể bị 429
   (simulator retry). Demo mặc định 1 mẫu/giây nên không chạm ngưỡng.
8. **Incident late**: be-alerts có thể tính `detected_at` từ `received_at`; candidate unsynced
   không đặt được lên trục thời gian. Mode `late` chỉ chứng minh envelope hợp lệ, không chứng minh
   xử lý dữ liệu trễ phía server.
9. **Đo đạc**: chưa có số đo độ trễ end-to-end; chưa test trên PostgreSQL/PGlite thật.

## Ghi chú cho lead

- `tools/simulator/README.md` đã ghi rõ hàng đợi không bền qua restart, chưa có MQTT/clock sync.
- `pnpm build` của package hiện không tạo output vì `tsconfig.json` đặt `noEmit` (file chỉ đọc theo
  prompt). Nếu cần artifact build, lead sửa `tsconfig`/script; hiện typecheck + test đủ theo prompt.
- Chưa commit gì (không chạy git). Các file mới nằm trong `tools/simulator/src`, `tools/simulator/test`.
- Để chạy thật sau khi be-data xong: tạo/claim thiết bị, export `ANNHIEN_DEVICE_ID/KEY`,
  chạy `pnpm dev:api` rồi `pnpm demo` (hoặc `pnpm --filter @annhien/simulator demo --fast` khi cần nhanh).
- Nếu cần kiểm nhanh không cần API: `npm test` trong `tools/simulator` (mock server nội bộ).
