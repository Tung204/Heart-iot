# Handoff — be-data (wave 1: thiết bị, ingest, đo lường)

- **Thời điểm:** 2026-11-14 22:01 (Asia/Ho_Chi_Minh)
- **Vùng ghi:** `apps/api/src/{devices,ingest,measurements,policy}`, `packages/contracts/src/{devices,measurements,policies}.ts`, `apps/api/test/{devices,ingest,measurements}.spec.ts`
- **Không sửa:** `app.module.ts`, `database/schema.ts`, `device-auth.*`, `access/**`, `auth/**`, `package.json`, docs, HTML. Không chạy git, không `pnpm add`, không đổi `.env`.

## Đã làm

### Contracts (`packages/contracts/src/`)

- `devices.ts`: `createDeviceSchema` (serial 3..64 regex `[A-Za-z0-9._-]`, label 1..80, strict), `deviceCreatedSchema` (deviceKey + claimCode + hạn trả một lần), `deviceAdminSummarySchema`, `claimDeviceSchema` (claimCode 6..128, strict), `claimResultSchema`, `releaseDeviceSchema` (reason tùy chọn 0..300, strict), `rotateDeviceKeySchema` → `{ deviceKey }`, `newClaimCodeResponseSchema` → `{ claimCode, expiresAt }`, `deviceListSchema`; thêm `releaseResultSchema` (response của release, hợp đồng prompt không quy định).
- `policies.ts`: `policyValueSchema` đúng các khoảng trong prompt, `DEFAULT_POLICY_VALUE` = heartbeat 15 / offline 45 / fresh 30 / late 5 / maxTelemetry 240, `policySchema`, `policyKeys = ['device_runtime'] as const`.
- `measurements.ts`: `measurementPointSchema`, `measurementGapSchema` (`no_data|clock_unsynced|quarantined`), `measurementsResponseSchema` (items, nextCursor, coverage, gaps, excludedUnsyncedCount, nextCursorMeta?), `dailySummarySchema`, `subjectStatusResponseSchema` (deviceStatusSchema + policy + asOf), `subjectDevicesResponseSchema` (dùng cho GET /subjects/:id/devices), query schemas cho measurements/daily-summary/export. Ghi comment semantics v1 (snapshot, không gộp average, không bịa mẫu).

### `apps/api/src/policy/`

- `PolicyService`: đọc `policy_configs` active (key=device_runtime, scope=global, status=active, version mới nhất), parse `policyValueSchema`; thiếu/không hợp lệ → fallback `DEFAULT_POLICY_VALUE` (source='default', version=0, digest tính từ canonical JSON thứ tự khóa cố định). `PolicyModule` global, không có endpoint admin cập nhật.

### `apps/api/src/devices/`

- Admin: `POST /admin/devices` (deviceKey 32 byte base64url, claimCode 9 ký tự bảng con A-Z2-9 bỏ 0/1/I/O, hết hạn 15 phút, lưu sha256, audit `device.create`, serial trùng 409), `GET /admin/devices` (kèm assignment đang mở), `POST /admin/devices/:id/claim-code` (thay code cũ), `POST /admin/devices/:id/rotate-key`. `AccessService.requireAdmin`.
- Chủ hồ sơ: `POST /subjects/:id/devices/claim` (chỉ owner; kiểm hash + hạn trong transaction, unique index chống gán đôi; đã có assignment mở → 409; xóa claim code; audit `device.claim`; 201), `GET /subjects/:id/devices` (danh sách đang gán + online/freshness), `POST /devices/:id/release` (đóng `endedAt`, giữ dữ liệu lịch sử, audit `device.release`; không có assignment mở → 404; caregiver 403; người ngoài 404), `GET /subjects/:id/status` (policy active + asOf + deviceStatusSchema).
- `device-status.ts`: online theo `offlineAfterSeconds`; freshness live/stale/offline/never theo `dataFreshAfterSeconds` + lastSeenAt; "bản tin cuối" chọn theo `received_at` desc.

### `apps/api/src/ingest/`

- `POST /ingest/telemetry` (`@Public()` + `DeviceAuthGuard` + `ZodValidationPipe(telemetryEnvelopeSchema)`): tìm assignment mở; không có → 202 ack `rejected` `DEVICE_NOT_CLAIMED`, không ghi; `payloadHash = sha256(JSON.stringify(envelope))`; transaction: trùng `(device_id,message_id)` cùng hash → `duplicate` (vẫn cập nhật last_seen_at), khác hash → 409 `CONFLICT` (details kind `message_id_conflict`); trùng `(device_id,boot_id,sequence)` khác message → 409 (kind `sequence_conflict`); thành công → 202 `accepted` + receivedAt, cập nhật `last_seen_at/last_boot_id/firmware_version`. Unique violation do ghi đua được phân loại lại (không 500). `isLate` khi `received_at - measured_at > lateEventMinutes`; `isQuarantined` luôn false (đã xác định assignment — xem giới hạn R-02/R-03).
- Rate limit trong bộ nhớ theo device (cửa sổ trượt 60 giây, `maxTelemetryPerMinute` từ policy) → 429; chỉ áp dụng ingest.
- `MqttIngestService`: chỉ kết nối khi `MQTT_URL` không trống; subscribe `v1/devices/+/telemetry` QoS 1; xử lý qua `handleIncoming(topic, payload)` tách riêng để test không cần broker. Kiểm topic ↔ `payload.device_id` (uuid hợp lệ + tồn tại + active), sau đó gọi cùng `TelemetryIngestService` với source `mqtt`. **Không** xác thực khóa thiết bị trên MQTT; không publish ACK ngược trong wave này.

### `apps/api/src/measurements/`

- `GET /subjects/:id/measurements?from&to&limit&cursor`: `requireHistory` (from ngoài quyền → 403), mặc định now-24h → now, tối đa 31 ngày (422), limit 1..1000 mặc định 500, cursor `(measuredAt, id)` base64url ổn định; timeline chỉ snapshot `measured_at` hợp lệ, tăng dần; coverage theo `expectedIntervalSeconds` (heartbeatIntervalSeconds), percent clamp 100; gap khi hai điểm liên tiếp cách > 1.5×interval hoặc đầu/cuối cửa sổ; bản ghi `measured_at:null/unsynced` đếm `excludedUnsyncedCount`; nếu cả cửa sổ không có mốc tin cậy → gap `clock_unsynced` (ngược lại `no_data`).
- `GET /subjects/:id/daily-summary?date`: khoảng ngày UTC theo timezone hồ sơ (chuyển local→UTC có lặp xử lý DST, `time-utils.ts`); ngày tương lai → 422. HR chỉ mẫu `quality.heart_rate='valid'` + bpm khác null, 0 mẫu → `heartRate: null`. Steps: delta `steps_since_boot` trong từng boot, chỉ cộng khi tăng, mẫu đầu boot không suy delta, giảm → bỏ delta + `partial` + note, nhiều boot cộng riêng, không bao giờ âm. Incidents đếm theo `detected_at` trong ngày (total/resolved). `batteryPercent` = pin của snapshot cuối ngày. `source` = `synthetic` nếu có bản ghi nào nguồn simulator/synthetic.
- `GET /subjects/:id/export.csv`: cùng kiểm quyền history, tối đa 31 ngày; CSV UTF-8 BOM, header ASCII `measured_at,received_at,heart_rate_bpm,heart_rate_quality,motion_quality,steps_since_boot,battery_percent,clock_status,is_late,is_quarantined,source,is_synthetic`; gồm cả bản ghi unsynced (received_at trong cửa sổ, measured_at rỗng); audit `measurement.export` (không chứa payload sức khỏe, chỉ rowCount + khoảng).

## Kiểm đã chạy (kết quả thật)

| Lệnh | Kết quả |
| --- | --- |
| `pnpm --filter @annhien/contracts build` | exit 0 (cần để typecheck API nhìn thấy dist của 3 file contracts mới) |
| `cd apps/api && pnpm typecheck` | exit 0, sạch toàn repo (lúc đầu có lỗi ở file của be-alerts chạy song song, sau khi worker kia sửa thì sạch hoàn toàn) |
| `pnpm -r typecheck` (root) | exit 0 — contracts, api, web, simulator đều Done |
| `cd apps/api && node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/devices.spec.ts test/ingest.spec.ts test/measurements.spec.ts` | **3 suites passed, 27/27 tests passed**, exit 0, ~5.9s, không để timer/kết nối mở |

Phủ test theo yêu cầu: (1) admin tạo/claim sai/hết hạn/đã claim/owner khác; (2) accepted/duplicate/409 message/409 sequence; (3) DEVICE_NOT_CLAIMED không ghi row; (4) 401 sai khóa + không tồn tại, 403 device_id lệch header; (5) unsynced lưu được + không vào timeline + HR không hợp lệ phải null (422); (6) cross-subject 404, from ngoài history 403, gap đúng, unsynced bị loại; (7) HR null khi không mẫu hợp lệ, steps không âm khi reset (partial + note), đếm incident; (8) CSV có audit/header/BOM, từ chối khi không quyền; (9) status offline/stale/live/never theo policy, pin null hiển thị null; (10) MQTT parser: topic/device mismatch bị từ chối, hợp lệ thì gọi cùng service ingest (không mở kết nối thật).

## Chưa làm / giới hạn đã biết

- **R-02/R-03 (review v0.1) vẫn mở:** `is_quarantined` luôn false vì v1 chỉ gán theo assignment đang mở tại thời điểm nhận; đổi chủ thiết bị khi còn bản tin chưa gửi chưa được giải quyết — bản tin từ buffer cũ sau khi release sẽ bị `DEVICE_NOT_CLAIMED` (không gán nhầm chủ mới, nhưng cũng chưa có vùng cách ly có trạng thái/đường tái xử lý).
- **MQTT:** không xác thực khóa thiết bị trên MQTT (chỉ topic ↔ payload + tồn tại/active); ACL broker buộc thiết bị chỉ publish topic của nó **chưa kiểm** (`infra/mosquitto/mosquitto.conf` chỉ là mẫu); không publish ACK ngược thiết bị; chưa test với broker thật (aedes có trong devDeps nhưng chưa dùng).
- **Rate limit** là Map trong bộ nhớ — chỉ bảo vệ một tiến trình; nhiều worker/instance thì mỗi instance đếm riêng.
- `payloadHash = sha256(JSON.stringify(envelope))` phụ thuộc **thứ tự khóa JSON**: thiết bị phải retry bản tin byte-tương đương để được tính duplicate; cùng message khác thứ tự khóa sẽ bị coi là conflict (an toàn, không mất dữ liệu nhưng cần ghi rõ trong hợp đồng firmware).
- Trạng thái "bản tin cuối" cho status chọn theo `received_at` desc — bản tin đến muộn có thể làm giá trị hiển thị cũ đi; đây là lựa chọn có chủ đích (trạng thái gần nhất theo thứ tự nhận), cần đối chiếu khi làm dashboard.
- Policy digest: chỉ đọc digest từ DB, không verify lại so với value; bản ghi policy parse lỗi fallback mặc định.
- Không có endpoint admin cập nhật policy (đúng phạm vi prompt).
- Chưa chạy: build production (`nest build`), seed, E2E với web/simulator.

## Rủi ro tích hợp (cho lead)

1. **`app.module.ts` chưa nối module mới.** Lead cần import `DevicesModule`, `IngestModule`, `MeasurementsModule`, `PolicyModule` (PolicyModule là `@Global`, nên import một lần ở AppModule). Sau khi nối, test lại 3 file spec vẫn xanh.
2. **SessionGuard đặt ở controller** (`@UseGuards(SessionGuard)`) vì `createModuleTestApp` không nạp APP_GUARD từ AppModule. Khi tích hợp, mỗi request phiên sẽ chạy guard **2 lần** (global + controller) — đúng hành vi nhưng tốn thêm 1 truy vấn session. Lead có thể bỏ APP_GUARD ở AppModule hoặc bỏ `@UseGuards` ở controller sau khi nối; hiện giữ để test module độc lập.
3. **APP_FILTER test-only:** AppModule đăng ký `ApiExceptionFilter` qua APP_FILTER, module test không có nên 3 spec tự định nghĩa `TestFiltersModule` nhỏ (APP_FILTER useClass ApiExceptionFilter) — chỉ nằm trong file test, không ảnh hưởng production.
4. **Contracts dist:** typecheck API phụ thuộc `packages/contracts/dist` (build đã chạy). Máy sạch phải `pnpm --filter @annhien/contracts build` trước khi typecheck API.
5. **Route `/subjects/:id/devices/claim`** yêu cầu subjects tồn tại trong DB (chưa có subjects module khi worker này chạy — test tạo subject trực tiếp qua DB). Khi be-core hoàn thiện subjects module, rà trùng route `/subjects/:id/status` nếu be-core cũng làm (prompt wave1-be-data giao endpoint này cho be-data).
6. `care_links.shared_from` + `requireHistory` (mã của lead): caregiver vừa được chia sẻ sẽ bị 403 với cửa sổ mặc định 24h vì `sharedFrom = now`; test xử lý bằng cách đặt `sharedFrom` về quá khứ. Cần quyết định chính sách: mặc định cửa sổ có nên tự co theo `effectiveFrom` thay vì từ chối không.

## Đề nghị lead

- Import 4 module vào `app.module.ts`, chạy lại `pnpm typecheck` + 3 file spec + auth.spec (hồi quy).
- Chốt hướng xử lý R-02/R-03 với be-alerts (namespace incident `(device_id, device_incident_id)` đã có unique index trong schema; phần cách ly telemetry đổi chủ vẫn mở).
- Khi viết hợp đồng firmware: quy định retry byte-tương đương (cùng thứ tự khóa JSON) để idempotency hoạt động.
