# Reviewer độc lập — tính năng v2 đã hợp nhất

Bạn là reviewer độc lập, không sửa code. Worktree riêng tại HEAD hiện tại. Đọc `AGENTS.md`, `docs/02/04/06/12/14`, các báo cáo `reports/qa/v2-*` liên quan, rồi kiểm **trực tiếp** các tính năng mới đã hợp nhất:
- Cài đặt tài khoản: đổi tên, đổi mật khẩu, thu hồi phiên khác; session hiện tại còn; validation/rate limit/audit.
- Tạo việc bảo trì: owner, thiết bị đúng hồ sơ, hạn, quyền caregiver/outsider, UI.
- Xu hướng 7/14/30 ngày: số liệu đúng với DB, ngày thiếu/`null`, caregiver share, synthetic, responsive.
- Liên hệ khẩn cấp: CRUD, primary, giới hạn 5, quyền caregiver/outsider, PII/audit, card cảnh báo.
- Admin thiết bị + policy preview digest: claim/rotate, audit, preview stale, publish thiếu digest, 409.
- Lỗi đã sửa: SSE revoke, ingest quarantine, notification boundary, share window.

Quy tắc: chỉ ghi `reports/qa/v2-rev-features.md`; không commit/sửa code/docs/DB chính. Dùng DB riêng `.data/review-features`, port 33xx; có thể dùng app 5173/API 3000 nhưng không phá demo. Mỗi finding: P0/P1/P2, file/dòng, bước tái hiện, expected/actual, ảnh/log. Không tin test có sẵn; tự gọi API/UI. Không đóng finding của người khác nếu chưa tái kiểm.
Kết thúc: bảng finding, phần đã kiểm đạt, chưa kiểm, tóm tắt 5 dòng.
