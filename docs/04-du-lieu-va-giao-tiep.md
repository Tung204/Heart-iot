# Dữ liệu và giao tiếp

**Trạng thái:** hợp đồng v1. Envelope telemetry, sự kiện incident và ACK đã được zod schema trong [`packages/contracts`](../packages/contracts/README.md) thực thi; OpenAPI/JSON Schema máy sinh từ một nguồn **chưa có**, nên khi tài liệu và schema lệch thì schema là nguồn kiểm. Ba payload mẫu trong `packages/contracts/examples` parse được bằng schema tương ứng (`pnpm build:contracts` rồi `node tools/docs/check-examples.mjs`), chỉ dùng dữ liệu tổng hợp.

## Mô hình dữ liệu

| Thực thể | Trường chính dự kiến | Ràng buộc quan trọng |
| --- | --- | --- |
| `users` | id, auth identity, trạng thái | Không dùng role toàn cục thay kiểm quyền trên hồ sơ |
| `subjects` | id, owner_user_id, tên hiển thị, timezone | Tách người được theo dõi khỏi tài khoản đăng nhập |
| `care_links` | subject_id, caregiver_user_id, permissions, shared_from, accepted_at, revoked_at | Chỉ active sau chấp nhận; giới hạn lịch sử được xem; kiểm lại trước khi gửi dữ liệu |
| `devices` | id, credential_ref, firmware_version, last_seen_at | Không lưu secret thô trong log hoặc hợp đồng công khai |
| `device_assignments` | id, device_id, subject_id, started_at, ended_at | Các khoảng không chồng nhau trên một thiết bị; không viết lại lịch sử khi đổi chủ |
| `telemetry` | message_id, device_id, assignment_id, boot_id, sequence, measured_at, received_at, metrics, quality | Chống trùng; assignment được server xác định và giữ nguyên |
| `incidents` | id, assignment_id, type, state, last_revision, detected_at, resolved_at | State transition kiểm tra trong transaction; không cho sự kiện cũ mở lại incident đã đóng |
| `incident_events` | message_id, incident_id, event_revision, type, payload, received_at | Lưu lịch sử bất biến; unique incident_id + event_revision |
| `alert_actions` | incident_id, actor_id, action, reason, created_at | Ai xác nhận/đóng và vì sao; bảo vệ tranh chấp bằng version/transaction |
| `notification_outbox` | incident_id, revision, recipient_id, channel, kind, status, attempts, next_attempt_at | Unique theo incident/revision/người nhận/kênh/**loại** (`kind`: `alert`/`update`), hiện thực bằng `dedupe_key`; kiểm quyền lại lúc gửi |
| `ai_summaries` | subject_id, period, aggregate_ref, source_ids, model_version, status | Chỉ lưu theo chính sách được đồng ý; mất quyền thì không đọc lại qua cache |
| `audit_logs` | actor_id, action, target_ref, outcome, created_at | Không chứa toàn bộ payload sức khỏe, credentials hay prompt riêng tư |

```mermaid
erDiagram
    USERS ||--o{ SUBJECTS : owns
    USERS ||--o{ CARE_LINKS : receives
    SUBJECTS ||--o{ CARE_LINKS : grants
    SUBJECTS ||--o{ DEVICE_ASSIGNMENTS : has
    DEVICES ||--o{ DEVICE_ASSIGNMENTS : assigned
    DEVICE_ASSIGNMENTS ||--o{ TELEMETRY : produces
    DEVICE_ASSIGNMENTS ||--o{ INCIDENTS : concerns
    INCIDENTS ||--o{ INCIDENT_EVENTS : records
    INCIDENTS ||--o{ ALERT_ACTIONS : tracks
    INCIDENTS ||--o{ NOTIFICATION_OUTBOX : schedules
```

Khóa/index dự kiến: unique `(device_id, message_id)`, unique `(device_id, boot_id, sequence)` cho envelope thiết bị; index `(assignment_id, measured_at)` cho truy vấn biểu đồ và `(state, detected_at)` cho cảnh báo. `message_id` phải được giữ nguyên khi retry; `sequence` tăng chung cho các bản tin trong một boot. Cùng key nhưng khác nội dung là xung đột, không âm thầm overwrite.

## Hợp đồng telemetry

| Trường | Quy tắc |
| --- | --- |
| `schema_version` | `1.0` cho bản dự thảo này; version không hỗ trợ bị từ chối/cách ly có lý do |
| `message_id`, `device_id`, `boot_id` | Định danh không chứa tên/số điện thoại; ví dụ dùng ID minh họa |
| `sequence` | Số nguyên không âm; tăng trong cùng boot, giữ khi gửi lại |
| `measured_at` | RFC 3339 UTC hoặc `null` khi chưa có đồng hồ tin cậy |
| `clock_status` | `synced` hoặc `unsynced`; `unsynced` đi với `measured_at: null` |
| `uptime_ms` | Thời gian monotonic tính từ boot; không so trực tiếp giữa hai boot |
| `metrics.heart_rate_bpm` | Số hoặc `null`; chỉ số không hợp lệ phải là `null`, không dùng 0 giả |
| `metrics.steps_since_boot` | Tổng bước của boot hiện tại, số nguyên không âm; không phải tổng ngày |
| `quality.heart_rate` | `valid`, `poor_signal`, `not_worn` hoặc `sensor_error` |
| `quality.motion` | `valid` hoặc `sensor_error`; lỗi cảm biến không tự thành ít vận động |
| `battery_percent` | Số 0–100 hoặc `null` khi chưa có phép đo/cấu hình chuyển đổi |
| `firmware_version` | Phiên bản tạo payload; phiên bản demo không đại diện firmware đã build |

Server bổ sung `received_at`, `assignment_id` và cờ dữ liệu trễ. Firmware không được tự khai người được theo dõi. Khi không đủ bằng chứng để gán dữ liệu vào lịch sử assignment, giữ bản tin ở vùng cách ly; không tự gán vào chủ hiện tại.

Tổng bước theo ngày được tính từ delta trong từng boot và gán vào khoảng có thời gian tin cậy. Lần nhận đầu của boot sau một đoạn mất dữ liệu có thể không phân bổ chính xác theo ngày; đánh dấu chưa đủ dữ liệu thay vì cộng toàn bộ vào ngày nhận. Khi counter giảm trong cùng boot, ghi lỗi dữ liệu. Ngày hiển thị theo timezone hồ sơ; lưu timestamp UTC.

## Topic và giao nhận MQTT

| Topic | Hướng | Payload/chính sách |
| --- | --- | --- |
| `v1/devices/{device_id}/telemetry` | Thiết bị → backend | Envelope telemetry; QoS 1 đề xuất, có thể tổng hợp mẫu để giảm băng thông |
| `v1/devices/{device_id}/events` | Thiết bị → backend | `fall.candidate`, `fall.cancelled`, `fall.confirmed`, `user.cancel_requested`, `sos.confirmed`; QoS 1 |
| `v1/devices/{device_id}/status` | Thiết bị/broker → backend | Presence/heartbeat gồm boot_id, uptime, firmware, pin nếu có; LWT chỉ là gợi ý mất kết nối |
| `v1/devices/{device_id}/acks` | Backend → thiết bị | ACK ứng dụng cho sự kiện quan trọng sau commit |

Không retain telemetry hoặc sự kiện té ngã: subscriber mới không được hiểu một sự kiện cũ là mới. Có thể retain presence, nhưng phải kiểm thời gian nhận. Topic status dùng cùng envelope định danh khi do thiết bị gửi; LWT do broker gửi phải được nhận diện riêng và không đưa vào bảng dữ liệu đo.

ACL buộc `device_id` trong topic và payload khớp định danh đã cấp. Subscriber backend không tin một device_id chỉ vì JSON hợp lệ. Certificate/credential provisioning và rotation được chọn khi dựng broker; không dùng chung một tài khoản thiết bị cho mọi board.

## Incident và ACK

Sự kiện dùng envelope như telemetry, thay `metrics` bằng `incident_id`, `event_revision`, `event_type` và `evidence`. `event_revision` bắt đầu 1 ở candidate, tăng theo từng thay đổi của incident và cần phục hồi được sau reboot nếu incident còn mở. `fall.confirmed` phải mang đủ dữ liệu để xử lý khi candidate chưa đến.

`evidence.algorithm_version`, vị trí đeo và cờ chất lượng giúp giải thích nguyên nhân; không gọi một điểm heuristic là “xác suất té ngã” nếu chưa hiệu chuẩn.

ACK dùng camelCase như mọi response HTTP: `status` (`accepted`/`duplicate`/`rejected`), `sourceMessageId`, `receivedAt`, `incidentId` (ID server dạng UUID, khác `incident_id` do thiết bị sinh), `acceptedRevision` và `code`/`message` (`null` khi không lỗi). `accepted` nghĩa server đã ghi bền; `duplicate` nghĩa bản tin giống hệt đã được ghi; `rejected` kèm `code` lý do để không retry vô hạn. Thiết bị chỉ xóa sự kiện khỏi hàng đợi sau ACK accepted/duplicate đúng định danh; bản tin bị reject chuyển vùng lỗi hữu hạn để kiểm tra. Schema thực thi là `ingestAckSchema`; adapter MQTT hiện chỉ subscribe telemetry nên **chưa publish ACK** — xem [docs/14](14-ke-hoach-trien-khai-phan-mem.md) mục 11.

Nếu revision mới tới trước revision cũ, server lưu lịch sử và áp dụng transition hợp lệ theo revision mới; bản cũ tới sau không làm lùi trạng thái. Hai payload khác nhau cùng revision là lỗi giao thức cần audit. Chuyển `cancelled` sang `open` bằng dữ liệu cũ bị cấm.

## API v1

Prefix `/api/v1`. Phần lớn endpoint dưới đây **đã chạy** trong `apps/api` (NestJS) và được web/simulator dùng; chỉ dòng ghi rõ "chưa triển khai" là thiết kế. Bảng rút gọn theo nhóm — danh sách đầy đủ lấy từ controller trong `apps/api/src/*/*.controller.ts`, request/response chi tiết ở `packages/contracts`.

| Nhóm | Endpoint | Trạng thái / kiểm quyền |
| --- | --- | --- |
| Health | `GET /health` | Đã có; công khai, trả trạng thái DB và AI |
| Phiên | `POST /auth/register`, `/auth/login`, `/auth/logout`; `GET /me` | Đã có; cookie HttpOnly + SameSite=Lax, kiểm Origin cho thao tác ghi, rate limit đăng nhập sai |
| Hồ sơ | `GET/POST /subjects`, `GET/PATCH /subjects/:id`, `GET /subjects/:id/status` | Đã có; chỉ hồ sơ sở hữu/được chia sẻ |
| Chia sẻ | `GET/POST /subjects/:id/invitations`; `GET /invitations/:token`; `POST /invitations/:token/accept`; `GET /subjects/:id/care-links`; `DELETE /subjects/:id/care-links/:linkId` | Đã có; chủ hồ sơ tạo/thu hồi; token dùng một lần, có hạn; không ghi token vào log |
| Thiết bị | `POST /subjects/:id/devices/claim`; `GET /subjects/:id/devices`; `POST /devices/:id/release` | Đã có; bằng chứng ghép thiết bị dùng một lần; assignment đóng/mở đúng thời điểm |
| Thiết bị (admin) | `GET/POST /admin/devices`; `POST /admin/devices/:id/claim-code`; `POST /admin/devices/:id/rotate-key` | Đã có; khóa thiết bị không trả lại dạng thô sau khi tạo |
| Ingest | `POST /ingest/telemetry`, `POST /ingest/events` (header `x-device-id`, `x-device-key`) | Đã có; xác thực khóa thiết bị, không dùng cookie người dùng |
| Đo | `GET /subjects/:id/measurements?from=&to=&cursor=`; `GET /subjects/:id/daily-summary?date=`; `GET /subjects/:id/export.csv` | Đã có; giới hạn khoảng, pagination và quyền lịch sử |
| Cảnh báo | `GET /subjects/:id/alerts`; `GET /alerts/:id`; `POST /alerts/:id/acknowledge`; `POST /alerts/:id/resolve` | Đã có; ack/resolve compare-and-set; 403 khi có link nhưng thiếu quyền nhận cảnh báo, 404 khi không có link hoặc incident đang `suspected` |
| Realtime | `GET /subjects/:id/events` (SSE) | Đã có; xác thực stream, kiểm lại quyền mỗi vòng, reconnect bằng cursor/`Last-Event-ID` |
| Thông báo | `GET /notifications`; `POST /notifications/:id/read` | Đã có; outbox giao trong ứng dụng |
| AI | `GET /subjects/:id/assistant/summary`; `POST /subjects/:id/assistant/ask` | Đã có; kiểm quyền trước tổng hợp và trước trả kết quả; fallback template khi chưa cấu hình provider |
| Bảo trì | `GET /maintenance-tasks`; `POST /maintenance-tasks/:id/close` | Đã có; đóng task cần lý do |
| Studio | `GET/POST /workspace-views`; `GET /workspace-views/:id`; `PUT /workspace-views/:id/draft`; `POST /workspace-views/:id/previews`; `POST /workspace-views/:id/publications`; `POST /workspace-views/:id/rollback`; `GET /workspace-views/:id/publications`; `GET /workspace-views/:id/data` | Đã có; preview chỉ đọc, publish CAS `baseRevision + digest` |
| Admin | `GET /admin/users`; `PATCH /admin/users/:id/status`; `GET /admin/audit`; `GET /admin/policies/:key`; `POST /admin/policies/:key/previews`; `PUT /admin/policies/:key`; `GET /admin/overview` | Đã có; không cấp payload sức khỏe mặc định cho admin kỹ thuật |
| Dữ liệu cá nhân | `POST /subjects/:id/exports`; `POST /subjects/:id/deletion-requests` | **Chưa triển khai** trong v1: hiện chỉ có `GET /subjects/:id/export.csv`; yêu cầu xóa mới ghi audit, chưa có quy trình xóa xuyên backup/cache (xem [docs/14](14-ke-hoach-trien-khai-phan-mem.md) mục 2) |

Lỗi API dùng envelope `{ "code": "...", "message": "...", "requestId": "..." }`; không trả stack trace hoặc thông tin hồ sơ khác. Dùng `401` khi không có phiên, `403` khi bị cấm theo chính sách, `409` khi xung đột trạng thái/version theo contract nghiệp vụ, `422` khi payload không phù hợp hợp đồng, `429` khi vượt giới hạn. Nếu dùng conditional update với `If-Match`/strong ETag, precondition không thỏa thì trả `412 Precondition Failed`, không thay bằng `409`. Quy ước này đối chiếu RFC 9110; endpoint phải nói rõ ETag thuộc tài nguyên nào, xem [đặc tả AI, mục 9](13-dac-ta-thuc-thi-ai-va-cau-hinh.md). Với cảnh báo, quy ước đã chạy ở v1.1: có link hồ sơ nhưng thiếu `canReceiveAlerts` → `403`; không có link hoặc incident đang `suspected` → `404` để không dò tồn tại.

## Retention và xóa

Trước dữ liệu thật, chốt thời hạn cho raw signal, telemetry tổng hợp, audit, AI và backup. Raw IMU/PPG chỉ thu trong phiên thử có mục đích, không truyền/lưu liên tục mặc định. Một yêu cầu xóa phải xét database, file export, cache, tóm tắt AI và vòng đời backup; không ghi “đã xóa hết” khi mới ẩn trên giao diện.

Tài khoản người thân đã bị thu hồi không nhận notification còn trong hàng đợi và không đọc bản tóm tắt cache. Dữ liệu đã xuất ra ngoài cần được giải thích trong chính sách chia sẻ trước khi sử dụng thực tế.
