# v9.2a — hạ tầng thông báo theo hồ sơ (backend)

Ngày 20/11/2026. **Trạng thái: đã triển khai và hợp nhất (20/11/2026)** — handoff tại [`reports/handoffs/v9-notification-subject.md`](../../../handoffs/v9-notification-subject.md). Đây là **điều kiện tiên quyết** của V9.2, chưa phải quy tắc nhắc chủ động/bản tin. Không đổi quyền chia sẻ (`canViewCare`/D3 vẫn mở); chưa có producer tự động.

## Mục tiêu

`notification_outbox` hiện gắn chặt với `incidents` (`incident_id` NOT NULL, `revision` NOT NULL, list join inner). Thêm khả năng thông báo **theo hồ sơ** cho `care_rule`/`care_digest` mà không tạo incident giả.

## Schema/migration

- `notification_outbox`:
  - `subject_id uuid` nullable, FK `subjects(id) ON DELETE cascade`, backfill từ `incidents.subject_id`.
  - `incident_id` và `revision` cho phép NULL (alert/update vẫn có).
  - `kind text NOT NULL DEFAULT 'alert'`, check `alert|update|escalation|care_digest|care_rule`.
  - `title text`, `body text` nullable — snapshot nội dung cho thông báo không có incident; alert để NULL và UI suy từ incident.
  - index `(subject_id, kind)`.
- Migration `0004_*` thêm cột/constraint, backfill `subject_id` từ incident và `kind='update'` cho bản ghi cũ có `dedupe_key` kết thúc `:update`; không xoá dữ liệu alert.
- Vì `subject_id` nullable để tương thích insert cũ, service luôn ghi subject cho row mới; list chỉ trả row có subject.

## Contract

- `notificationKindSchema` thêm `escalation`, `care_digest`, `care_rule`.
- `notificationItemSchema`:
  - `incidentId`, `incidentType`, `state`, `revision` → nullable.
  - `title`, `body` → nullable/optional.
  - Giữ `subjectId`, `subjectName`, `kind`, `sentAt`, `readAt`, `createdAt`.
- Không đổi endpoint.

## Service

- Worker dùng `row.kind`, không suy từ `dedupeKey`; bỏ `outboxKind`.
- Alert/update: incident bắt buộc; terminal vẫn supersede như cũ.
- Care kind: không cần incident; quyền gửi/đọc tạm dùng `canViewMeasurements` (đúng phạm vi dữ liệu care v8). Khi D3 chốt `canViewCare`, đổi đúng một helper.
- Danh sách/đánh dấu đọc dùng `subject_id`; cửa sổ `historyDays/sharedFrom` áp cho cả care, mốc thời gian là `incident.detectedAt ?? outbox.createdAt`.
- Row care thiếu `subject_id` → failed (không lặp vô hạn), không lộ dữ liệu.
- Realtime `notification.sent` dùng `entityId = incidentId ?? outbox.id`; payload có `kind`.

## UI

- Hộp thông báo hiển thị care bằng `title/body` + tên hồ sơ; không dùng nhãn cảnh báo/trạng thái incident.
- Alert giữ nguyên link chi tiết; care không có link sâu (chưa có route theo notification), chỉ đánh dấu đọc.
- Fixture cũ vẫn hợp lệ nhờ field mới optional.

## Test

- API: owner thấy care notification; caregiver `canViewMeasurements` thấy; caregiver thiếu quyền không thấy và markRead 404; alert cũ vẫn list/read; worker gửi care khi đủ quyền, supersede khi mất quyền; care thiếu subject → failed.
- Web: care item hiện title/body, không render link cảnh báo; alert item giữ link; mark read care.
- Chạy API 256+ test, web 385+ test, typecheck/build.

## Ngoài phạm vi

- `subject_rules`, `job_runs`, scheduler, rule inactivity, digest, Web Push, D3/`canViewCare`, route `/app/care` theo notification.
