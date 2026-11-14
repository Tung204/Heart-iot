# Prompt wave 1 — be-alerts (incident, outbox, SSE)

Repo: `C:/MyFolder/Hoc_Tap/project/DATN`. Bạn là **worker backend be-alerts**, không phải lead.

## Đọc trước khi code (bắt buộc)

1. `AGENTS.md`, `docs/12-nguyen-tac-phat-trien-va-bang-chung.md`.
2. `docs/14-ke-hoach-trien-khai-phan-mem.md` mục 4–8.
3. `docs/03-kien-truc-he-thong.md` (state diagram, outbox, realtime, thu hồi quyền), `docs/04-du-lieu-va-giao-tiep.md` (incident/ACK, R-01), `docs/reviews/01-thiet-ke-v0.1.md` (R-01, R-02), `docs/02-yeu-cau-va-pham-vi.md` (FR-06/07/08/09).
4. `reports/worklog/2026-11-14.md` mục 21:26.
5. Code nền: `apps/api/src/database/schema.ts` (bảng incidents/incident_events/alert_actions/notification_outbox/realtime_events), `access/**`, `devices/device-auth*`, `test/test-app.ts`, `packages/contracts/src/{core,telemetry}.ts`.

## Vùng ghi được phép

- `apps/api/src/incidents/**`
- `apps/api/src/notifications/**`
- `apps/api/src/realtime/**`
- `packages/contracts/src/incidents.ts`, `notifications.ts`
- `apps/api/test/incidents.spec.ts`, `notifications.spec.ts`, `sse.spec.ts`
- `reports/handoffs/wave1-be-alerts.md`

**Không sửa** `app.module.ts`, `database/schema.ts`, `access/**`, `auth/**`, `devices/device-auth*`, `package.json`, docs. Không `git`, không `pnpm add`, không đổi `.env`.

## Hợp đồng

### `packages/contracts/src/incidents.ts`

- `incidentStateSchema`, `incidentTypeSchema`, `incidentEventTypeSchema` đã có trong `core.ts`/`telemetry.ts` — re-export hoặc import.
- `incidentSummarySchema`: `id, subjectId, device: {id,label,serial}, type, state, lastRevision, detectedAt, lastEventAt, createdAt, cancelledAt nullable, resolvedAt nullable, resolutionReason nullable, resolutionOutcome nullable, version, late: boolean, acknowledgedBy: {userId, displayName} | null`.
- `incidentEventViewSchema`: `eventRevision, eventType, measuredAt nullable, receivedAt, applied, conflictReason nullable`.
- `alertActionViewSchema`: `id, action, outcome, reason nullable, actor: {id, displayName} | null, stateBefore, stateAfter, createdAt`.
- `incidentDetailSchema`: summary + `events[]` + `actions[] + recipients: Array<{userId, displayName, permissions}>`.
- `incidentListSchema`: `{ items, nextCursor nullable }`.
- `acknowledgeAlertSchema`: `{ expectedVersion: int >=0 }` strict.
- `resolveAlertSchema`: `{ expectedVersion: int >=0, reason: string.trim().min(3).max(500), outcome: z.enum(['supported','no_action','false_alarm','other']) }` strict.
- `alertUpdatedEventSchema`: `{ incidentId, subjectId, state, version, lastRevision, occurredAt }`.
- `LATE_EVENT_MINUTES = 5` (chính sách demo; ghi rõ chưa chốt).

### `packages/contracts/src/notifications.ts`

- `notificationItemSchema`: `{ id, incidentId, subjectId, subjectName, incidentType, state, revision, kind: 'alert'|'update', sentAt nullable, readAt nullable, createdAt }`.
- `notificationListSchema`: `{ items, unreadCount }`.
- (Không cần endpoint tạo notification thủ công.)

## Nghiệp vụ

### State machine (transaction + revision)

Hàm `IncidentService.ingestEvent(device, envelope)`:

1. Kiểm payload `device_id` khớp đã do guard làm. Tìm assignment mở; không có → ack `rejected`, `DEVICE_NOT_CLAIMED`.
2. Trong transaction:
   - Khóa/tạo incident theo `(device_id, device_incident_id)`. Nếu tạo: state `suspected`, lastRevision = event_revision, detectedAt = `measured_at ?? received_at`, version 1. Type từ `incident_type`.
   - Nếu incident đã tồn tại: kiểm event_revision so với `lastRevision`.
     - `< lastRevision`: lưu event `applied=false`, `conflictReason='stale_revision'`, không đổi state; ack `accepted`, acceptedRevision = lastRevision.
     - `= lastRevision`: nếu đã có event cùng revision → `duplicate` nếu payload giống (so hash/serialized), ngược lại `rejected` code `CONFLICT` + audit; không ghi thêm.
     - `> lastRevision`: chèn event, áp dụng theo bảng dưới.
   - Cập nhật `lastRevision = max`, `lastEventAt`, `version + 1` nếu state đổi; không lùi state.
3. Áp dụng:
   - `fall.candidate`: chỉ tạo mới; nếu incident đã open/ack/resolved/cancelled → không đổi state.
   - `fall.cancelled`: chỉ chuyển `suspected → cancelled`; nếu đã confirmed trở lên → ghi event nhưng không đổi (không hạ cấp), conflictReason `already_confirmed`.
   - `fall.confirmed`: `suspected → open`; tạo mới → open; `open/acknowledged` giữ nguyên; `resolved/cancelled` không mở lại (conflictReason `terminal_state`).
   - `sos.confirmed`: tạo mới → open; `suspected → open`; không mở lại terminal.
   - `user.cancel_requested`: nếu `open` hoặc `acknowledged` → `resolved`, resolutionOutcome `cancelled_by_user`, reason `Thiết bị yêu cầu hủy sau khi đã xác nhận`; nếu `suspected` → cancelled; terminal giữ nguyên.
4. Ghi `realtime_events` trong cùng transaction khi state/revision đổi: type `alert.updated`, entityId incidentId, payload `alertUpdatedEventSchema`.
5. Outbox trong cùng transaction:
   - Khi vào `open`: tạo `kind=alert` cho owner + care link active có `canReceiveAlerts`.
   - Khi `acknowledged`/`resolved`: tạo `kind=update` cho các recipient đã có bản ghi `sent` trước đó (hoặc owner + active recipients nếu chưa có), với revision hiện tại.
   - `dedupeKey = incidentId:revision:recipientId:in_app:kind` (unique).
   - Khi terminal (`resolved`/`cancelled`): mọi outbox `pending` cùng incident → `superseded` + `supersededAt` (không để cảnh báo mở cũ gửi sau khi đóng).
   - Trả ack `accepted`/`duplicate`/`rejected`, `incidentId`, `acceptedRevision`.
6. Không đưa `suspected` ra API người thân (chưa confirmed): list/detail trả 404 với suspected (trừ khi chính chủ sở hữu? giữ đơn giản: ẩn với mọi API người dùng; ghi chú).

### Route

- `POST /ingest/events`: `@UseGuards(DeviceAuthGuard)`, body `incidentEnvelopeSchema`; trả 202 ack.
- `GET /subjects/:id/alerts?state=open|closed&limit&cursor` (access.requireSubject; caregiver cần `canReceiveAlerts` để thấy; owner luôn thấy). Mặc định `state=open` = open/acknowledged. `closed` = resolved/cancelled/unconfirmed. Không trả suspected.
- `GET /alerts/:id` (kiểm subject access; 404 nếu không có quyền hoặc suspected).
- `POST /alerts/:id/acknowledge` (cần `canAcknowledge`):
  - Body expectedVersion; transaction khóa incident. Nếu version khác → 409 `CONFLICT` + current version, ghi `alert_actions` outcome `conflict` (không đổi state). Nếu state không phải open → 409.
  - Thành công: state acknowledged, version+1; insert alert_action applied; audit `incident.acknowledge`; outbox update; realtime event.
  - Hai người đồng thời: đúng một applied, một conflict; lịch sử giữ cả hai; trả người thắng trong detail.
- `POST /alerts/:id/resolve` (cần `canResolve`): như trên, yêu cầu reason + outcome; state open/acknowledged → resolved; nếu đã resolved trả 409. Outbox update + supersede pending; realtime.
- `GET /subjects/:id/events` SSE:
  - Header/query cursor (`Last-Event-ID` hoặc `cursor`), mặc định 0.
  - Mỗi vòng 1s: `access.requireSubject`; nếu mất quyền → gửi `event: revoked` + kết thúc; query `realtime_events` subject + id > cursor, gửi `id: <id>`, `event: <type>`, `data: json`.
  - Heartbeat `: ping` mỗi 15s. Đóng sau tối đa 5 phút để client reconnect. `Cache-Control: no-cache`, `X-Accel-Buffering: no`.
  - Không giữ request vô hạn trong test; cho phép inject interval để test nhanh (hàm service nhận `pollMs`).
- Notifications:
  - `GET /notifications` (đăng nhập): các outbox `sent` của user, join incident/subject, sắp xếp mới nhất; `unreadCount` = sent + readAt null.
  - `POST /notifications/:id/read`: chỉ recipient, set readAt; 404 nếu không phải của mình.
- Worker `NotificationService.processPending(limit=20)`:
  - chọn `pending`, `nextAttemptAt <= now`, `for update skip locked` (nếu driver hỗ trợ; PGlite hỗ trợ).
  - Kiểm lại quyền recipient (owner/link active + canReceiveAlerts). Mất quyền → `superseded`.
  - Nếu incident terminal và kind=alert chưa gửi → `superseded`.
  - Thành công → `sent`, sentAt; lỗi → attempts+1, `pending` với backoff (1s, 5s, 30s) tối đa 5 lần rồi `failed`; lưu lastError đã lọc (không payload sức khỏe).
  - Ghi realtime `notification.sent` (payload id, incidentId) để UI cập nhật.
  - Interval 5s chỉ chạy khi `NODE_ENV !== 'test'`; `onModuleDestroy` clear.

## Test bắt buộc

Fixture trực tiếp bằng DB (không phụ thuộc module be-core/be-data): tạo user owner/caregiver/admin, subject, device (credentialHash = sha256(key)), assignment. Dùng `createModuleTestApp([IncidentsModule, NotificationsModule, RealtimeModule, DeviceAuthModule])` và `loginUser` cho request người dùng (hoặc gọi service trực tiếp khi SSE).

Tối thiểu:

1. Candidate tạo suspected, **không** xuất hiện trong alerts list/detail (404).
2. Candidate → confirmed mở open; outbox có alert cho owner + caregiver đủ quyền, không có cho caregiver thiếu `canReceiveAlerts`.
3. Candidate → cancelled; confirmed không đến; không có alert; sau đó confirmed đến muộn không mở lại (terminal).
4. Confirmed đến trước candidate; candidate muộn không lùi state.
5. Gửi lặp cùng message → duplicate, 1 incident, 1 event; revision cũ → accepted + không lùi; cùng revision khác payload → rejected, audit.
6. Thiết bị B dùng incident_id trùng của A → tạo incident riêng (namespace theo device) hoặc bị từ chối rõ; không đổi incident A.
7. Acknowledge: đúng version → acknowledged + action applied + outbox update; version cũ → 409, action conflict; hai request đồng thời → 1 applied/1 conflict.
8. Caregiver thiếu `canAcknowledge` bị 403; admin không tự xác nhận nếu không có link.
9. Resolve: reason thiếu/sai → 422; thành công → resolved, pending alert cũ `superseded`, outbox update; resolve lần hai 409; audit.
10. Outbox worker: mất quyền recipient → superseded, không `sent`; sent thành công ghi sentAt; incident terminal làm alert pending superseded.
11. Notifications: chỉ thấy của mình; đánh dấu đọc; unreadCount giảm.
12. SSE: mở stream, tạo incident mới → nhận `alert.updated`; thu hồi care link → nhận `revoked` và stream đóng (dùng fetch + AbortController, timeout 10s).

Chạy:

```bash
cd apps/api
pnpm typecheck
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/incidents.spec.ts test/notifications.spec.ts test/sse.spec.ts
```

Không để interval/socket mở sau test. Không sửa schema; nếu thiếu cột cần thiết, ghi handoff thay vì sửa.

## Kết thúc

Handoff `reports/handoffs/wave1-be-alerts.md`: file, lệnh + kết quả thật, phần chưa làm (đặc biệt R-01/R-02, SSE đa instance, outbox `sending` khi crash), rủi ro tích hợp. Kẹt >15 phút ở một lỗi thì dừng và ghi handoff.
