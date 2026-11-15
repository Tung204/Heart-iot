# Fix worker — ranh giới thông báo và read idempotent

Bạn là worker sửa lỗi trên worktree riêng. Đọc `AGENTS.md`, báo cáo `reports/qa/v2-data-integrity.md` P2-1/P2-4, `docs/02` NFR-01, `docs/04` care_links/notification, code notifications.

Chỉ sửa: `apps/api/src/notifications/**`, `apps/api/test/notifications.spec.ts`; không sửa measurements/incidents/app.module/contracts (nếu cần contract, ghi handoff cho lead). Cài dependency/build contracts; chạy test notifications + typecheck.

Yêu cầu:
- `listNotifications` và `markRead` kiểm lại quyền **hiện tại** của user với subject của incident: chỉ khi còn care link active/permission receive_alerts; nếu mất quyền/không link → không trả notification (list) và 404 (mark read), không lộ subjectName/type/state.
- Áp dụng cửa sổ chia sẻ: incident xảy ra trước `sharedFrom` hoặc ngoài `historyDays` không được trả/đánh dấu đọc; dùng AccessService.requireHistory hoặc logic tương đương, test boundary.
- `markRead` idempotent: chỉ set `readAt` khi đang null; gọi lại giữ nguyên mốc; vẫn 204.
- Unread count phải tính trên tập đã lọc quyền.
- Test: caregiver mới accept không thấy notification cũ; thu hồi → list rỗng/404 read; read hai lần giữ readAt; owner vẫn thấy; admin không link 404/không thấy.
- Handoff `reports/handoffs/v2-fix-notification-boundary.md`; commit nhánh riêng. Báo commit hash/test counts/rủi ro.
