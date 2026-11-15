# Fix worker — sự kiện vào đúng assignment, chặn dữ liệu cũ/tương lai

Bạn là worker sửa lỗi bảo mật trên worktree riêng. Đọc `AGENTS.md`, `reports/qa/v2-rev-security.md` P1-1, `docs/03` mục gán dữ liệu, `docs/04`, `docs/08` T-03, code `apps/api/src/incidents/incidents.service.ts`, `apps/api/src/ingest/telemetry-ingest.service.ts` (mẫu đúng), contracts telemetry, test incidents.

Chỉ sửa: `apps/api/src/incidents/incidents.service.ts`, helper incidents nếu cần, `apps/api/test/incidents.spec.ts`; có thể thêm file test mới. Không sửa schema/migration/measurements/studio/realtime/web (khác worker).

Yêu cầu:
- Khi nhận `POST /api/v1/ingest/events`, tra `device_assignments` **theo `measured_at`**, không chỉ assignment đang mở. Sự kiện nằm trong assignment đã kết thúc của chủ cũ → gắn incident cho đúng assignment/subject cũ; chủ mới không thấy.
- `measured_at` tương lai quá `MAX_CLOCK_SKEW_SECONDS`, trước assignment đầu tiên, hoặc rơi vào khoảng không có assignment → **không tạo incident**. Trả 202 `status:'rejected'`, `code:'QUARANTINED'` (hoặc `OUTSIDE_ASSIGNMENT`), message tiếng Việt, audit `incident.quarantined` với reason; metadata không chứa dữ liệu sức khỏe. Không lưu incident rác, không gửi thông báo/SSE.
- `measured_at` null/không đáng tin: nếu không xác định được assignment theo thời gian → rejected; không mặc định chủ hiện tại.
- Idempotency/dedupe giữ nguyên; sự kiện đã accepted trước đó không bị đổi chủ khi assignment đổi.
- Test: (1) event trong assignment A, sau khi chuyển B → incident thuộc A, B không thấy; (2) trước assignment đầu → rejected, không incident/notification; (3) tương lai +1 năm → rejected; (4) gap giữa 2 assignment → rejected; (5) event bình thường vẫn 202 accepted; (6) audit có reason, không lộ HR/phone. Chạy incidents spec + typecheck.
- Handoff `reports/handoffs/v2-fix-event-ingest.md`; commit nhánh riêng. Báo quyết định 202 rejected, mã lỗi, test count.
