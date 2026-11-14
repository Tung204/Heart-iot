# Prompt wave 1 — be-data (thiết bị, ingest, đo lường)

Repo: `C:/MyFolder/Hoc_Tap/project/DATN`. Bạn là **worker backend be-data**, không phải lead.

## Đọc trước khi code (bắt buộc)

1. `AGENTS.md`, `docs/12-nguyen-tac-phat-trien-va-bang-chung.md`.
2. `docs/14-ke-hoach-trien-khai-phan-mem.md` mục 4–8.
3. `docs/03-kien-truc-he-thong.md` (luồng cảnh báo, mạng/đồng hồ/dữ liệu cũ), `docs/04-du-lieu-va-giao-tiep.md` toàn bộ (telemetry, topic, ACK, retention), `docs/reviews/01-thiet-ke-v0.1.md` (R-02, R-03, R-04).
4. `reports/worklog/2026-11-14.md` mục 21:26.
5. Code nền: `apps/api/src/{database,access,auth,devices/device-auth*,common}`, `apps/api/test/test-app.ts`, `packages/contracts/src/{core,telemetry}.ts`.

## Vùng ghi được phép

- `apps/api/src/devices/**` (trừ 4 file `device-auth.*` đã có — chỉ đọc)
- `apps/api/src/ingest/**`
- `apps/api/src/measurements/**`
- `apps/api/src/policy/**`
- `packages/contracts/src/devices.ts`, `measurements.ts`, `policies.ts`
- `apps/api/test/devices.spec.ts`, `ingest.spec.ts`, `measurements.spec.ts`
- `reports/handoffs/wave1-be-data.md`

**Không sửa** `app.module.ts`, `database/schema.ts`, `device-auth.*`, `access/**`, `auth/**`, `package.json`, docs. Không chạy `git`, không `pnpm add`, không đổi `.env`.

## Hợp đồng

### `packages/contracts/src/devices.ts`

- `createDeviceSchema` (admin): `{ serial: string 3..64 regex [A-Za-z0-9._-], label: string 1..80 }` strict.
- `deviceCreatedSchema`: `{ device: deviceAdminSummarySchema, deviceKey: string, claimCode: string, claimCodeExpiresAt: isoDateTime }` — khóa và claim code chỉ trả một lần.
- `deviceAdminSummarySchema`: `id, serial, label, status, firmwareVersion nullable, lastSeenAt nullable, createdAt, assignedSubjectId nullable`.
- `claimDeviceSchema`: `{ claimCode: string 6..128 }` strict.
- `claimResultSchema`: `{ device: deviceAdminSummarySchema, assignmentId: uuid, subjectId: uuid }`.
- `releaseDeviceSchema`: `{ reason?: string 0..300 }` strict (optional).
- `rotateDeviceKeySchema` (không body) → `{ deviceKey }`.
- `newClaimCodeResponseSchema`: `{ claimCode, expiresAt }`.
- `deviceListSchema`: `{ items: deviceAdminSummarySchema[] }`.

### `packages/contracts/src/policies.ts`

- `policyValueSchema`: `{ heartbeatIntervalSeconds: int 5..300, offlineAfterSeconds: int 10..3600, dataFreshAfterSeconds: int 5..600, lateEventMinutes: int 1..1440, maxTelemetryPerMinute: int 1..6000 }`.
- `DEFAULT_POLICY_VALUE` = heartbeat 15, offline 45, fresh 30, late 5, maxTelemetry 240.
- `policySchema`: `{ key, version, source: 'default'|'database', value, digest }`.
- `policyKeys = ['device_runtime'] as const`.

### `packages/contracts/src/measurements.ts`

- `measurementPointSchema`: `measuredAt nullable, receivedAt, heartRateBpm nullable, heartRateQuality, motionQuality, stepsSinceBoot, batteryPercent nullable, isLate, isQuarantined`.
- `measurementGapSchema`: `{ from: isoDateTime, to: isoDateTime, reason: 'no_data'|'clock_unsynced'|'quarantined' }`.
- `measurementsResponseSchema`: `{ items, nextCursor nullable, coverage: { from, to, expectedIntervalSeconds, observedCount, expectedCount, percent }, gaps, excludedUnsyncedCount, nextCursorMeta? }`.
- `dailySummarySchema`: `{ date (YYYY-MM-DD), timezone, heartRate: {avg,min,max,validSamples,invalidSamples}|null, steps: {total, completeness:'complete'|'partial'|'unavailable', notes: string[]}, coverage: {...}, gaps, incidents: {total, resolved}, lastSeenAt nullable, batteryPercent nullable, source: 'synthetic'|'device' }`.
- `subjectStatusResponseSchema`: dùng `deviceStatusSchema` từ `telemetry.ts` + `policy` + `asOf`.

**Semantics v1 (ghi trong comment file contracts):** mỗi envelope là **snapshot** tại `measured_at`; coverage tính trên snapshot hợp lệ theo `expectedIntervalSeconds`; không gộp average mẫu. Bản ghi `measured_at: null`/`clock_status: unsynced` không đặt được lên trục thời gian → đếm `excludedUnsyncedCount` và tạo gap lý do `clock_unsynced` nếu cả khoảng không có mốc tin cậy. Không bịa mẫu.

## Route/nghiệp vụ

Prefix `/api/v1` đã cấu hình toàn cục.

### Thiết bị (owner/admin)

- `POST /admin/devices` (admin, dùng `AccessService.requireAdmin`): tạo serial unique, sinh `deviceKey` 32 byte base64url + `claimCode` 9 ký tự (A-Z2-9, dễ đọc) hết hạn sau 15 phút; lưu sha256; audit `device.create`. Trả 201 `deviceCreatedSchema`.
- `GET /admin/devices` (admin): danh sách + assignment đang mở.
- `POST /admin/devices/:id/claim-code` (admin): tạo claim code mới, trả một lần; audit.
- `POST /admin/devices/:id/rotate-key` (admin): sinh key mới, trả một lần; audit.
- `POST /subjects/:id/devices/claim` (owner): body `claimCode`; kiểm hash + hạn trong transaction; nếu thiết bị đã có assignment mở → 409; tạo assignment; xóa claim code; audit `device.claim`; trả 201.
- `GET /subjects/:id/devices` (access.requireSubject): danh sách thiết bị đang gán + trạng thái online/freshness.
- `POST /devices/:id/release` (owner của subject đang gán): đóng assignment (`endedAt`), audit `device.release`; giữ lịch sử dữ liệu gắn assignment cũ.
- `GET /subjects/:id/status` (access.requireSubject): `subjectStatusResponseSchema`, dùng policy active (fallback default), last telemetry.

### Ingest telemetry

`POST /ingest/telemetry` với `@UseGuards(DeviceAuthGuard)` + `ZodValidationPipe(telemetryEnvelopeSchema)`:

- Tìm assignment mở của thiết bị. Không có → HTTP 202, ack `rejected`, code `DEVICE_NOT_CLAIMED`, không ghi telemetry.
- Tính `payloadHash = sha256(JSON.stringify(envelope))`.
- Insert transaction:
  - Nếu trùng `(device_id,message_id)`: payloadHash giống → `duplicate`; khác → HTTP 409 `CONFLICT` kèm chi tiết (không ghi đè).
  - Nếu trùng `(device_id,boot_id,sequence)` nhưng message_id khác → 409 protocol conflict.
  - Thành công → 202 ack `accepted`, `receivedAt`.
- `isLate`: `measured_at` khác null và `received_at - measured_at > lateEventMinutes`.
- `isQuarantined`: false khi đã xác định assignment; ghi rõ giới hạn trong handoff (đổi chủ khi có event chưa gửi chưa được giải quyết — R-02/R-03 vẫn mở).
- Cập nhật `devices.last_seen_at`, `last_boot_id`, `firmware_version`.
- Rate limit đơn giản trong bộ nhớ theo device (maxTelemetryPerMinute) → 429. Chỉ áp dụng cho ingest.
- MQTT: `src/ingest/mqtt-ingest.service.ts` dùng `mqtt` (đã cài). Nếu `MQTT_URL` trống → không làm gì. Nếu có: subscribe `v1/devices/+/telemetry`, xác thực topic ↔ `payload.device_id`, gọi cùng service ingest. **Không** dựa vào khóa thiết bị trong MQTT; ghi rõ giới hạn ACL broker chưa kiểm. Chỉ unit-test parser, không mở kết nối thật trong test.

### Đo lường

- `GET /subjects/:id/measurements?from&to&limit&cursor`:
  - `access.requireHistory` (từ chối from sớm hơn quyền).
  - Mặc định from = now-24h, to = now; tối đa 31 ngày; limit 1..1000 (default 500), cursor theo `(measuredAt,id)` ổn định.
  - Chỉ snapshot có `measured_at` hợp lệ vào timeline; sắp xếp tăng dần.
  - Coverage/gaps theo semantics trên. Không tính trung bình trong endpoint này.
- `GET /subjects/:id/daily-summary?date=YYYY-MM-DD`:
  - Timezone hồ sơ; tính khoảng ngày UTC tương ứng.
  - HR chỉ mẫu `quality.heart_rate='valid'` và `heart_rate_bpm != null`; nếu 0 mẫu → `heartRate: null`, không trả 0.
  - Steps: tổng delta `steps_since_boot` trong cùng boot, chỉ khi tăng; reset giảm → bỏ delta, `completeness='partial'` + note. Qua nhiều boot cùng ngày: cộng delta từng boot; mẫu đầu boot không suy ra delta. Không bao giờ âm.
  - Đếm incidents trong ngày.
- `GET /subjects/:id/export.csv?from&to`: cùng kiểm quyền history, tối đa 31 ngày; audit `measurement.export`; CSV UTF-8 BOM, header tiếng Việt không dấu? Dùng header ASCII (`measured_at,heart_rate_bpm,...`) + cột `is_synthetic`. Không trả dữ liệu ngoài quyền.
- `PolicyService`: đọc `policy_configs` active mới nhất key `device_runtime`, parse `policyValueSchema`; fallback default + digest; export cho module khác. Không cần endpoint admin update.

## Test bắt buộc

Dùng `createModuleTestApp` + `createAdmin`/`registerUser`/`loginUser`. Có thể chèn device/assignment qua DB để test ingest (nhưng phải test ít nhất một luồng admin create → claim thật).

Tối thiểu:

1. Admin tạo thiết bị, owner claim; claim sai/hết hạn/đã claim bị từ chối; owner khác không claim được.
2. Telemetry hợp lệ → 202 accepted, DB có row; gửi lặp cùng message → duplicate; cùng message khác payload → 409; sequence trùng khác message → 409.
3. Thiết bị chưa gán → rejected DEVICE_NOT_CLAIMED, không tạo row.
4. Thiết bị sai khóa/không tồn tại → 401; `device_id` payload khác header → 403.
5. `measured_at=null` + `clock_status=unsynced` lưu được, không thành điểm 0; metrics HR không hợp lệ phải null (schema đã chặn).
6. Measurements: quyền cross-subject 404; from ngoài history 403; gaps đúng khi thiếu mẫu; unsynced bị loại khỏi timeline.
7. Daily summary: HR null khi không mẫu hợp lệ; steps không âm khi reset; đếm incident.
8. CSV: có audit, đúng header, từ chối khi không quyền.
9. Status: offline/freshness đúng theo policy; pin null hiển thị null.
10. MQTT parser: topic/device mismatch bị từ chối.

Chạy:

```bash
cd apps/api
pnpm typecheck
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/devices.spec.ts test/ingest.spec.ts test/measurements.spec.ts
```

Không mở server dài hạn, không kết nối mạng thật, không để timer mở.

## Kết thúc

Handoff `reports/handoffs/wave1-be-data.md`: file, lệnh + kết quả thật, phần chưa làm (đặc biệt R-02/R-03, MQTT broker/ACL, rate limit đa tiến trình), rủi ro tích hợp. Kẹt >15 phút ở một lỗi thì dừng và ghi handoff.
