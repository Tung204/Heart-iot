# Handoff — wave1-be-alerts (incident, outbox, SSE)

- Thời điểm: 2026-11-14 22:15 (Asia/Ho_Chi_Minh)
- Worker: be-alerts (pi, deepseek-v4-pro)
- Vùng ghi đã dùng (đúng hạn mức prompt): `apps/api/src/incidents/**`, `apps/api/src/notifications/**`, `apps/api/src/realtime/**`, `packages/contracts/src/{incidents,notifications}.ts`, `apps/api/test/{incidents,notifications,sse}.spec.ts`, file này.

## Đã làm

### Contracts (`packages/contracts`)
- `src/incidents.ts`: `incidentSummarySchema`, `incidentEventViewSchema`, `alertActionViewSchema`, `incidentDetailSchema` (summary + events + actions + recipients), `incidentListSchema`, `alertsQuerySchema`, `acknowledgeAlertSchema` (expectedVersion ≥ 0, strict), `resolveAlertSchema` (reason trim 3–500, outcome enum), `alertUpdatedEventSchema`, `LATE_EVENT_MINUTES = 5` (ghi rõ là chính sách demo CHƯA CHỐT). Re-export `incidentStateSchema`/`incidentTypeSchema`/`incidentEventTypeSchema`.
- `src/notifications.ts`: `notificationItemSchema`, `notificationListSchema` (items + unreadCount).

### `apps/api/src/incidents`
- `incidents.service.ts` — `ingestEvent(device, envelope)`:
  - Tìm assignment mở; không có → ack `rejected` + code `DEVICE_NOT_CLAIMED` + audit (202, ack nói outcome).
  - Transaction: khóa/tạo incident theo namespace `(device_id, device_incident_id)` (R-02); tạo mới state `suspected`, `lastRevision = event_revision`, `detectedAt = measured_at ?? received_at`, version 1 rồi áp transition đồng nhất.
  - Revision `< last`: không lùi. Vì schema có unique `(incident_id, event_revision)` (không được sửa schema), hành vi: slot revision còn trống → lưu event `applied=false, conflictReason=stale_revision`; slot đã có → so fingerprint: giống → `accepted` (acceptedRevision = lastRevision), khác → `rejected` CONFLICT + audit.
  - Revision `= last`: so vân tay nội dung (canonical JSON + sha256, bỏ qua thứ tự khóa jsonb) → `duplicate` hoặc `rejected` CONFLICT + audit, không ghi thêm.
  - Revision `>`: áp bảng transition: candidate chỉ tạo mới (`candidate_on_existing`); cancelled chỉ `suspected → cancelled` (`already_confirmed`/`terminal_state`); confirmed/sos mở, không mở lại terminal; `user.cancel_requested`: open/acknowledged → `resolved` (outcome `cancelled_by_user`, reason mặc định theo prompt), suspected → cancelled. Không lùi/hạ cấp state. Version +1 khi state đổi.
  - Realtime `alert.updated` cùng transaction khi state/revision đổi — **chỉ khi state sau không còn suspected** (tránh lộ suspected qua stream người thân; ghi chú trong code).
  - Outbox cùng transaction: vào `open` → `kind=alert` cho owner + care link active có `canReceiveAlerts`; acknowledged/resolved → `kind=update` cho recipient đã `sent` (hoặc owner + active recipients nếu chưa ai nhận); terminal → mọi pending `superseded` (giữ lại bản update vừa tạo). `dedupeKey = incidentId:revision:recipientId:in_app:kind`; `revision` trong outbox = business `version` (tăng mỗi lần đổi state) để ack rồi resolve không đụng unique key — LƯU Ý: prompt nói "revision hiện tại" không rõ là event revision hay version; chọn version, ghi comment trong code.
  - `listAlerts` (owner luôn thấy; caregiver cần `canReceiveAlerts` nếu không 403; người ngoài 404), state=open mặc định; closed = resolved/cancelled/unconfirmed; suspected không bao giờ trả. Cursor (detectedAt,id) desc.
  - `getAlert`: 404 nếu không tồn tại/suspected/không có quyền xem.
  - `acknowledgeAlert`/`resolveAlert`: transaction + `SELECT ... FOR UPDATE`; version sai → 409 + `alert_actions` outcome `conflict` được ghi NGOÀI transaction (để không bị rollback) + audit; hai người đồng thời → đúng một applied (PGlite xếp hàng transaction độc quyền, FOR UPDATE chặn). Resolve: reason/outcome 422 khi sai; state không cho phép → 409; thành công ghi resolvedAt/resolvedByUserId/outcome, outbox update + supersede, realtime, audit `incident.acknowledge`/`incident.resolve`.
- `incidents.controller.ts`: `POST /ingest/events` (Public + DeviceAuthGuard, 202 + ack); `GET /subjects/:id/alerts`; `GET /alerts/:id`; `POST /alerts/:id/acknowledge`; `POST /alerts/:id/resolve`.
- `incidents.module.ts`: imports DeviceAuthModule + AuthModule; **đăng ký APP_GUARD SessionGuard + APP_FILTER ApiExceptionFilter để chạy độc lập trong `createModuleTestApp`** (xem rủi ro tích hợp).

### `apps/api/src/notifications`
- `notifications.service.ts`: `processPending(limit=20)` — transaction + `for('update', {skipLocked:true})` (PGlite chạy được); kiểm lại quyền recipient (owner hoặc link active + canReceiveAlerts) → mất quyền `superseded`; incident terminal + `kind=alert` chưa gửi → `superseded` (R-01); gửi in-app thành công → `sent` + sentAt + realtime `notification.sent`; lỗi → backoff 1s/5s/30s, attempts ≥ 5 → `failed`, lastError lọc ≤ 500 ký tự. Interval 5s chỉ khi `NODE_ENV !== 'test'`; `onModuleDestroy` clear. `listNotifications` (sent của user, join incident/subject, desc, unreadCount) và `markRead` (chỉ recipient, 404).
- `notifications.controller.ts`: `GET /notifications`, `POST /notifications/:id/read` (204).
- LƯU Ý: schema outbox **không có cột `kind`** (không được sửa schema) → kind được mã hóa ở segment cuối `dedupe_key` (`outboxKind()`), đúng định dạng dedupeKey prompt đưa.

### `apps/api/src/realtime`
- `realtime.controller.ts`: `GET /subjects/:id/events`; kiểm quyền trước khi mở stream (401/404), cursor từ `Last-Event-ID` hoặc `?cursor` (mặc định 0); header `Cache-Control: no-cache`, `X-Accel-Buffering: no`; gửi `id/event/data`.
- `realtime.service.ts`: vòng poll `pollMs` (field public để test ghi đè; mặc định 1000ms), kiểm lại `access.requireSubject` mỗi vòng → mất quyền gửi `event: revoked` rồi đóng; heartbeat `: ping` 15s; đóng sau tối đa 5 phút để client reconnect; tự đóng khi client hủy kết nối.

## Kiểm đã chạy (kết quả thật)

```bash
cd apps/api
pnpm typecheck
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/incidents.spec.ts test/notifications.spec.ts test/sse.spec.ts
```

- `pnpm typecheck`: **exit 0** tại thời điểm chạy lần cuối với đầy đủ các file của tôi. LƯU Ý: trong lúc tôi làm, worker khác đã thêm `test/studio.spec.ts` (wave sau) và hiện `pnpm typecheck` **đỏ do đúng file đó** (3 lỗi TS trong studio.spec.ts, không liên quan vùng của tôi — đã verify: chỉ mỗi file đó có lỗi).
- Jest 3 file: **3 suites passed, 17/17 tests passed** (~6.7s), không warning open handle.
  - incidents.spec.ts (12): T1 candidate ẩn (list rỗng, detail 404) · T2 confirmed mở + outbox đúng người nhận + 403/404 quyền · T3 cancel trước confirmed, confirmed muộn không mở lại · T4 confirmed trước candidate không lùi · T5 duplicate/resend, stale revision (accepted, không lùi, lưu stale_revision), cùng revision khác payload → rejected + audit · T6 hai thiết bị cùng incident_id → namespace riêng, incident A không đổi (R-02) · T7 acknowledge đúng version/applied, version cũ 409 + action conflict, 2 request đồng thời 1 applied/1 conflict · T8 caregiver thiếu canAcknowledge 403, admin không link 404 · T9 resolve 422/200/supersede/409/audit · T10 user.cancel_requested sau confirmed → resolved(cancelled_by_user) + supersede alert cũ · T11 sos mở trực tiếp · T12 thiết bị chưa gán → rejected DEVICE_NOT_CLAIMED + audit.
  - notifications.spec.ts (3): N1 worker sent (sentAt + realtime notification.sent) + recipient mất quyền → superseded · N2 incident terminal → pending alert superseded · N3 list chỉ của mình, mark read giảm unreadCount, đọc của người khác 404.
  - sse.spec.ts (2): S1 fetch + AbortController (timeout 10s): nhận `alert.updated` thật khi incident mở, thu hồi care link → `event: revoked` và stream đóng · S2 không phiên 401, không quyền 404.
- Hồi quy: `node ... jest.js --runInBand test/auth.spec.ts` → **6/6 pass**. `pnpm -r typecheck` exit 0 vào thời điểm chạy (trước khi `test/studio.spec.ts` của worker khác xuất hiện).

## Chưa làm / giới hạn

- **R-01**: đã xử lý supersede khi terminal + kiểm quyền lại trước dispatch. CHƯA kiểm: hủy ngay trong lúc dispatch (v1 in-app không có transport ngoài nên không có cửa sổ "đang gửi dở" thật); worker restart sau hủy chưa test (logic là idempotent theo status).
- **R-02**: namespace `(device_id, device_incident_id)` + đối chiếu thiết bị đã xác thực với assignment tại thời điểm ingest (T6). Chưa test: thiết bị A gửi bản tin cũ sau khi đổi assignment (assignment mở hiện tại thắng; dữ liệu lịch sử theo assignment bất biến vì incident giữ assignmentId — cần test tích hợp với be-data).
- **SSE đa instance**: bảng `realtime_events` + cursor chung nên đúng về logic khi nhiều instance đọc chung DB; CHƯA chạy với 2 process thật.
- **Outbox `sending` khi crash**: không dùng trạng thái `sending` — v1 gửi in-app là đánh dấu sent trong cùng transaction với realtime, nên không có trạng thái gửi dở. Nếu wave sau thêm transport ngoài (email/push), cần chuyển pending → sending → sent + cơ chế thu hồi sending khi crash. Cột `sending` đã có sẵn trong enum schema.
- Chưa kiểm: heartbeat 15s và đóng sau 5 phút (cần chờ 15s/5 phút, không đưa vào test bắt buộc; hằng số `SSE_HEARTBEAT_MS`/`SSE_MAX_DURATION_MS`); phân trang cursor list alerts; `unconfirmed` (chưa có đường tạo trong wave này); sự kiện late > 5 phút chỉ tính cờ `late` từ `lastEventAt - detectedAt`, chưa có thông báo riêng "nhận trễ" (cần chốt với lead/giảng viên).
- Backoff/retry của worker chỉ được viết, chưa có test ép lỗi (kênh in-app không có điểm lỗi tự nhiên).

## Rủi ro tích hợp

1. **APP_GUARD/APP_FILTER trong `IncidentsModule`**: đăng ký `SessionGuard` + `ApiExceptionFilter` để module test độc lập không cần AppModule. Khi lead nối vào AppModule (đã có global guard/filter), SessionGuard sẽ chạy 2 lần mỗi request (idempotent nhưng thừa 1 truy vấn phiên) và filter chạy 2 lần (filter đầu bắt hết). Đề nghị lead gỡ 2 dòng `APP_GUARD`/`APP_FILTER` trong `incidents.module.ts` khi nối AppModule (có comment sẵn trong file).
2. **Route `GET /subjects/:id/alerts` + `GET /subjects/:id/events`** cùng tiền tố với be-core (`subjects/**`) — controllers khác module, path không đụng nhau; đã verify qua test nhưng cần chạy app đầy đủ sau khi lead ghép.
3. **`@Public()` trên `POST /ingest/events`**: đúng thiết kế (thiết bị không có session), guard thiết bị tự lo xác thực; đừng gỡ nhầm.
4. **PGlite giới hạn**: transaction chạy độc quyền (queue); mọi truy vấn phải dùng `tx` bên trong transaction (không gọi `this.db`/AccessService bên trong — sẽ deadlock). Đã tuân thủ; cần giữ quy tắc này khi lead sửa.
5. **`revision` trong outbox = business version** (không phải `lastRevision` của thiết bị) để dedupe ack→resolve không đụng unique key; `notificationItemSchema.revision` trả giá trị này. Nếu lead/chốt đặc tả muốn event revision thì cần đổi lại cả dedupe.
6. **Outbox `kind` suy từ `dedupe_key`** (không có cột `kind` trong schema; không được sửa schema). Nếu sau này đổi định dạng dedupeKey phải cập nhật `outboxKind()`.
7. Cần rebuild contracts trước khi dùng: `pnpm --filter @annhien/contracts build` (exports `./incidents`, `./notifications` đã khai báo sẵn trong package.json từ wave 0; giờ đã có file nguồn + dist).

## Đề nghị lead

- Gỡ APP_GUARD/APP_FILTER trong IncidentsModule khi ghép AppModule; thêm IncidentsModule/NotificationsModule/RealtimeModule vào AppModule rồi chạy lại 3 spec qua `createTestApp` (AppModule) để xác nhận không xung đột guard 2 lớp.
- Chốt với giảng viên: chính sách ẩn suspected, ngưỡng `LATE_EVENT_MINUTES=5`, cách gửi thông báo "sự kiện nhận trễ" (docs/03) — hiện chỉ có cờ `late` trên summary.
- Wave 2 (be-ai/be-studio/fe-features) dùng `IncidentsService` + `NotificationService` đã export; transport ngoài (email/push) cần thiết kế `sending` trước khi thêm.
