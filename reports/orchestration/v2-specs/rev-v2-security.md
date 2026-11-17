# Reviewer độc lập — tái kiểm bảo mật sau v2

Bạn là reviewer bảo mật độc lập, không sửa code. Worktree riêng tại HEAD hiện tại. Đọc `reports/qa/v2-backend-security.md` (nếu có), `v2-admin-ops`, `v2-data-integrity`, `v2-privacy-ethics`, `v2-iot-protocol`, `v2-caregiver-journey`, code các fix.

Tự tấn công localhost trên DB/API riêng (`.data/review-sec2`, port 34xx), tạo user/hồ sơ/thiết bị thử; không tấn công ngoài máy. Kiểm lại tối thiểu:
- SSE sau khi admin khóa user/thu hồi session/care link: có nhận `revoked`, đóng, không lộ event sau đó.
- Ingest: tương lai/assignment cũ/synced+null/quarantine; không lọt measurements/daily/status/insights/assistant/studio.
- Share boundary: alert closed/detail, daily incidents, notifications/read, status HR/pin, assistant ask; owner vs caregiver mới/thu hồi.
- Contacts: ai đọc/ghi/xóa, phone trong audit/log/SSE, primary race, max 5.
- Policy: publish thiếu/sai digest, preview cũ, 409, audit; không bypass bằng request thủ công.
- Admin devices: rotate/claim code lộ một lần, quyền admin, không lộ health.
- Auth/session: cookie, session revoke, password change, CSRF/origin, enumeration, rate limit.
- MQTT/compose: không anonymous/public (đọc config, không cần Docker).
Mỗi finding: severity, file/dòng, request/bước tái hiện, expected/actual, ảnh hưởng. Nếu finding cũ đã đóng, ghi rõ bằng chứng đóng; không đóng thay người khác.
Chỉ ghi `reports/qa/v2-rev-security.md`; không commit/sửa code. Kết thúc bảng finding + tóm tắt 5 dòng.
