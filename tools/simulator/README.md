# Simulator thiết bị

CLI TypeScript gửi telemetry và sự kiện incident vào API ingest bằng đúng đường dành cho thiết bị
(header `x-device-id` + `x-device-key`), dùng cho demo và kiểm lỗi mạng/trùng trước khi có phần cứng.

- Không tự đăng nhập, không dùng cookie, không có đường tắt bỏ kiểm quyền thiết bị.
- Mọi payload được validate bằng zod từ `@heart-iot/contracts/telemetry` trước khi gửi.
- Không in khóa thiết bị ra stdout/stderr.
- Dữ liệu là tổng hợp, `firmware_version` mặc định `0.0.0-sim`; không đại diện firmware đã build.

## Chạy

```bash
# từ thư mục tools/simulator
pnpm typecheck
npm test

# từ root repo
pnpm demo
```

Biến môi trường:

| Biến | Mặc định | Ghi chú |
| --- | --- | --- |
| `ANNHIEN_BASE_URL` | `http://localhost:3000/api/v1` | Đã gồm prefix `/api/v1` |
| `ANNHIEN_DEVICE_ID` | — | Bắt buộc cho lệnh gửi |
| `ANNHIEN_DEVICE_KEY` | — | Bắt buộc cho lệnh gửi; không bị ghi log |
| `ANNHIEN_FIRMWARE` | `0.0.0-sim` | Ghi vào `firmware_version` |

Ví dụ:

```bash
export ANNHIEN_DEVICE_ID=sim-device-1
export ANNHIEN_DEVICE_KEY=<khóa do admin tạo, chỉ dùng ở local>
tsx src/cli.ts telemetry --count 10 --interval-ms 1000 --profile normal
```

## Lệnh

```
tsx src/cli.ts <command> [options]
```

Mỗi lệnh có `--help`. Tham số sai hoặc thiếu biến môi trường trả **exit code 2**; lỗi gửi/rejected
trả **exit code 1**; thành công trả **0**.

### `telemetry --count N --interval-ms M --profile normal|poor|gap|reset`

| Profile | Hành vi |
| --- | --- |
| `normal` | HR 68–82, `quality.heart_rate: valid`, steps tăng, pin 80 |
| `poor` | 2/3 mẫu `poor_signal` với `heart_rate_bpm: null` (không dùng 0) |
| `gap` | Bỏ 3 mẫu liên tiếp bắt đầu từ mẫu thứ 3; `sequence` vẫn tăng, mẫu kế tiếp vẫn gửi |
| `reset` | Sau 3 mẫu: `boot_id` mới, `sequence` về 1, `steps_since_boot` về 0 (mô phỏng reboot) |

`measured_at` là UTC RFC3339 theo thời gian chạy thật; `--interval-ms 0` để test nhanh.
Mỗi phản hồi in một dòng JSON (`event: ack` / `retry` / `boot`), cuối cùng là `event: summary`.

### `fall --mode cancel|confirm|duplicate|late|sos --cancel-window-ms 3000`

| Mode | Chuỗi |
| --- | --- |
| `cancel` | `fall.candidate` rev1 → chờ cửa sổ → `fall.cancelled` rev2, cùng `incident_id` |
| `confirm` | `fall.candidate` rev1 → chờ cửa sổ → `fall.confirmed` rev2 kèm `evidence.algorithm_version` |
| `duplicate` | Gửi cùng một envelope `fall.confirmed` hai lần y nguyên `message_id`; ACK thứ hai phải là `duplicate` |
| `late` | Candidate `clock_status: unsynced`, `measured_at: null`; confirmed khi đã có giờ |
| `sos` | `sos.confirmed` rev1, `incident_type: sos`, không chờ cửa sổ |

`incident_id` mới mỗi lần chạy dạng `sim-<uuid>` (trừ `duplicate` dùng lại envelope đã gửi).
`sequence` tăng chung cho mọi bản tin trong một boot.

### `demo [--fast]`

Kịch bản: 5 telemetry `normal` → 3 `poor` → fall candidate/cancelled → 8 telemetry normal (có gap)
→ fall candidate/confirmed. Chỉ gửi thiết bị, không đăng nhập.

`--fast` giảm interval còn 100ms và cửa sổ hủy còn 200ms cho test. Dừng ngay và trả exit code 1 nếu
có ACK `rejected` hoặc lỗi gửi.

## Client và hàng đợi

- `src/client.ts`: `postTelemetry` → `POST /ingest/telemetry`, `postIncident` → `POST /ingest/events`;
  JSON, timeout 10s, đọc cả body lỗi, trả `{ status, body }` (status 0 khi lỗi mạng/timeout).
- `src/queue.ts`: hàng đợi hữu hạn (mặc định 50 bản tin).
  - Lỗi mạng/timeout/5xx/429: retry với backoff ngắn (200/500/1000ms, tối đa 4 lần thử) và
    **giữ nguyên `message_id`** nên server khử trùng đúng.
  - 4xx khác: bỏ ngay, không retry.
  - Khi đầy: bỏ telemetry cũ nhất trước, ưu tiên giữ sự kiện; mỗi lần bỏ in `queue_drop` kèm tổng số mất.

**Giới hạn:** hàng đợi chỉ nằm trong bộ nhớ. Tắt process là mất phần chưa gửi; đây không phải buffer
bền của firmware và không thay thế kiểm T-09. Chưa có MQTT, chưa có đồng bộ đồng hồ thật.

## Kiểm thử

`npm test` chạy `node:test` + `tsx` với mock server `node:http`, không gọi API thật:

1. Header/body telemetry đúng hợp đồng, schema parse, sequence tăng.
2. `poor`: HR null khi quality không valid, không dùng 0.
3. `gap`: sequence nhảy, không gửi mẫu thiếu.
4. `reset`: boot_id mới, steps về 0, sequence reset.
5. `cancel`: hai event cùng incident, revision 1→2 đúng thứ tự.
6. `confirm`: ACK rejected → exit code 1.
7. `duplicate`: cùng `message_id`, body giống hệt.
8. Queue: 500 → retry cùng `message_id`; 4xx không retry; đầy hàng đợi ưu tiên incident.
9. Không in device key ra stdout/stderr (kể cả khi mất mạng).
10. `demo --fast`: đủ 16 telemetry + 4 event, exit code 0; có rejected → exit code 1.

## Chưa làm

- Buffer bền qua restart (chỉ có hàng đợi trong bộ nhớ).
- MQTT publish và provisioning/rotation khóa thật.
- Đồng bộ đồng hồ thật; `late` chỉ mô phỏng unsynced → synced, không tạo `measured_at` lùi.
- Mô phỏng rate limit, mất gói từng phần, hoặc tải lớn.

Tham chiếu: [hợp đồng dữ liệu](../../docs/04-du-lieu-va-giao-tiep.md),
[phần cứng/firmware](../../docs/05-phan-cung-va-firmware.md),
[kiểm thử](../../docs/08-kiem-thu-va-danh-gia.md), [kế hoạch v1](../../docs/14-ke-hoach-trien-khai-phan-mem.md).
