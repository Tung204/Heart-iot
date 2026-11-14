# Prompt wave 1 — sim (thiết bị mô phỏng)

Repo: `C:/MyFolder/Hoc_Tap/project/DATN`. Bạn là **worker sim**, không phải lead.

## Đọc trước khi code (bắt buộc)

1. `AGENTS.md`, `docs/12-nguyen-tac-phat-trien-va-bang-chung.md`.
2. `docs/14-ke-hoach-trien-khai-phan-mem.md` (mục 1, 8).
3. `docs/04-du-lieu-va-giao-tiep.md` (telemetry, incident, ACK), `docs/05-phan-cung-va-firmware.md` (buffer/sequence), `docs/09-lo-trinh-va-ho-so.md` (lát cắt demo).
4. `packages/contracts/src/{core,telemetry}.ts`, `tools/simulator/{package.json,tsconfig.json}`.
5. `reports/worklog/2026-11-14.md`.

## Vùng ghi được phép

- `tools/simulator/**` (trừ `package.json`, `tsconfig.json` — chỉ đọc)
- `reports/handoffs/wave1-sim.md`

Không sửa API, contracts, docs, root config. Không `git`, không `pnpm add`, không đổi `.env`.

## Mục tiêu

CLI thiết bị mô phỏng gửi đúng hợp đồng telemetry/sự kiện vào API, dùng được trong demo và kiểm lỗi mạng/trùng.

### CLI

`tsx src/cli.ts <command> [options]` (đã có script `pnpm demo`).

Biến môi trường mặc định:

- `ANNHIEN_BASE_URL` (mặc định `http://localhost:3000/api/v1`)
- `ANNHIEN_DEVICE_ID`, `ANNHIEN_DEVICE_KEY` (bắt buộc cho lệnh gửi)
- `ANNHIEN_FIRMWARE` (mặc định `0.0.0-sim`)

Lệnh:

1. `telemetry --count N --interval-ms M --profile normal|poor|gap|reset`
   - `normal`: HR 68–82, quality valid, steps tăng dần, battery 80.
   - `poor`: 2/3 mẫu quality `poor_signal`, `heart_rate_bpm: null`; không dùng 0.
   - `gap`: bỏ 3 mẫu liên tiếp (không gửi), sequence vẫn tăng; mẫu kế tiếp gửi.
   - `reset`: boot_id mới + steps về 0 sau vài mẫu (mô phỏng reboot); `sequence` reset theo boot.
   - `measured_at` UTC RFC3339; mỗi mẫu tăng theo thời gian chạy thật.
   - In mỗi phản hồi dạng một dòng JSON ngắn; tổng kết cuối.
2. `fall --mode cancel|confirm|duplicate|late|sos --cancel-window-ms 3000`
   - `cancel`: candidate revision 1 → chờ cửa sổ → cancelled revision 2, cùng `incident_id`.
   - `confirm`: candidate → chờ → confirmed revision 2; gửi kèm evidence/version.
   - `duplicate`: gửi cùng confirmed 2 lần y nguyên message_id; in trạng thái ack.
   - `late`: `clock_status=unsynced`, `measured_at=null` cho candidate rồi confirmed khi đã có giờ.
   - `sos`: `sos.confirmed` revision 1, không chờ.
   - Incident id mới mỗi lần chạy (trừ duplicate), dạng `sim-<uuid>`; `sequence` tăng.
3. `demo`
   - Kịch bản: 5 telemetry normal → 3 poor → fall cancel → 8 normal (có gap) → fall confirm.
   - Chờ ack accepted/duplicate; nếu rejected in lỗi và **exit code 1**.
   - Không tự đăng nhập/không dùng cookie; chỉ gửi thiết bị.
   - Có `--fast` để giảm interval cho test.
4. `--help` cho từng lệnh; lỗi tham số rõ ràng, exit code 2.

### Client/queue

- `src/client.ts`: `postTelemetry`, `postIncident` với header `x-device-id`, `x-device-key`, JSON; timeout 10s; đọc cả JSON lỗi; trả `{status, body}`.
- `src/queue.ts`: hàng đợi hữu hạn (mặc định 50) cho lỗi mạng/5xx; **giữ nguyên `message_id`** khi retry; backoff ngắn; bỏ qua 4xx không retry (trừ 429); log số mất mẫu nếu đầy. Không hứa bền qua process restart — ghi README.
- Validate payload bằng zod từ `@annhien/contracts/telemetry` trước khi gửi.
- Không log device key.

### Test (node:test + tsx)

Dùng `node:http` mock server (không gọi API thật):

1. Telemetry gửi đúng header/body, schema parse, sequence tăng.
2. Profile poor: HR null khi quality không valid.
3. Gap: sequence nhảy nhưng không gửi mẫu thiếu.
4. Reset: boot_id mới, steps về 0, sequence reset.
5. Fall cancel: 2 event cùng incident_id, revision 1→2, thứ tự đúng.
6. Fall confirm: ack rejected → exit code 1.
7. Duplicate: cùng message_id + body giống hệt.
8. Queue: server trả 500 lần đầu → retry cùng message_id; 4xx không retry.
9. Không in device key ra stdout/stderr.

Chạy:

```bash
cd tools/simulator
pnpm typecheck
npm test
```

(Không cần build nếu typecheck + test đạt; nếu `pnpm build` lỗi do config, ghi handoff.)

## Kết thúc

Handoff `reports/handoffs/wave1-sim.md`: file, lệnh + kết quả thật, phần chưa làm (buffer bền, MQTT, clock sync), rủi ro tích hợp API. Kẹt >15 phút ở một lỗi thì dừng và ghi handoff.
