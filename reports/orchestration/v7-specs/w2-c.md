# v7 W2 — lane C: cảnh báo, hộp thông báo, trợ lý

Đọc `w2-common.md` trước. Cổng riêng: port **4352**.

## File được ghi

`features/alerts/*` (trừ `labels.ts` — frozen, chỉ thêm), `features/notifications/{NotificationsPage.tsx,NotificationsPage.test.tsx,notifications.css}`, `features/assistant/*`, `styles/alerts.css`, `styles/assistant.css`.

## Việc phải làm

1. **AlertsPage** giữ: đọc theo subject, ack cần receive+acknowledge, CAS `expectedVersion`, 409 reload, stale/SSE giữ list, empty/no-permission. Thêm nhánh `?view=notifications` render `NotificationsPage` trong cùng trang (mount lần đầu — hiện chưa được mount); tab “Cảnh báo”/“Thông báo” rõ, URL giữ khi reload/back.
2. **NotificationsPage**: mark-read optimistic + rollback, không ack/resolve; click item mở đúng `incidentId`; account-wide.
3. **AlertDetailPage**: quyền/context theo `detail.subjectId` (không theo selection); CAS; contacts không chặn ack; timeline không bịa giờ; nút quay lại đúng list.
4. **AssistantPage**: bỏ `SubjectContextLine` cục bộ (shell đã có — F đã patch, kiểm lại), giữ thread reset khi đổi hồ sơ, không auto-summary, không hỏi khi thiếu quyền, nguồn + giới hạn AI, xử lý câu trả lời đến muộn; cảnh báo không phụ thuộc AI.
5. Không đổi API/query key; nếu cần key mới có subject, đăng ký theo D4.

## Giao diện

`design-system.md` §5.4–5.6. Danh sách cảnh báo dạng hàng, mức độ phân biệt bằng chữ + màu (không chỉ màu), trạng thái ack rõ. Inbox: chưa đọc/đã đọc, thời gian tương đối + tuyệt đối khi hover/focus. Chi tiết: một H1, hành động chính một chỗ, timeline đọc được trên mobile.

## Ảnh + đo

`/app/alerts`, `/app/alerts?view=notifications`, `/app/alerts/<id>`, `/app`, `/app/assistant` × 4 viewport. Đo: đúng 1 H1, đúng 1 context line; tab active; target ≥44; không tràn ngang; mark-read đổi trạng thái rồi reload còn đúng.
