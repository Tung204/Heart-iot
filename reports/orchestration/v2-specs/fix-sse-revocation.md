# Fix worker — ngắt SSE khi tài khoản/session bị thu hồi

Bạn là worker sửa lỗi trên worktree riêng. Đọc `AGENTS.md`, báo cáo `reports/qa/v2-admin-ops.md` P1-1, `docs/02` NFR-01, `docs/03` thu hồi stream, code `apps/api/src/realtime/realtime.service.ts`, auth/session, admin disable.

Chỉ sửa: `apps/api/src/realtime/**`, `apps/api/test/sse.spec.ts` (hoặc test realtime hiện có); có thể thêm method đọc session/status trong auth service nhưng không đổi hành vi HTTP. Không sửa app.module/web/contracts. Cài dependency/build contracts; chạy test SSE + auth/admin liên quan + typecheck.

Yêu cầu:
- Mỗi vòng poll/stream kiểm **session hiện tại còn hiệu lực và user.status='active'**, không chỉ care link; nếu bị thu hồi/khóa → gửi `event: revoked` (payload tối thiểu, không dữ liệu sức khỏe) rồi đóng stream.
- Không làm tăng tải quá mức: kiểm session/status theo nhịp poll hiện có, không query mỗi event; vẫn kiểm quyền care link.
- Token/ sessionId không log; không lộ qua event.
- Test: mở stream caregiver → admin disable user (hoặc revoke session) → stream nhận revoked/đóng, không nhận alert mới sau đó; session hết hạn → đóng; care link revoke vẫn đóng như cũ; owner bình thường vẫn nhận event.
- Handoff `reports/handoffs/v2-fix-sse-revocation.md`; commit nhánh riêng. Báo commit hash, test counts, rủi ro.
