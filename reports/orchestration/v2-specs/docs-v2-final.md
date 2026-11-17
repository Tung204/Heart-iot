# Docs worker — cập nhật tài liệu cuối v2

Bạn là worker tài liệu trên worktree riêng. Đọc `AGENTS.md`, toàn bộ `docs/01..14`, `README.md`, `docs/README.md`, `apps/api/README.md`, `apps/web/README.md`, `reports/qa/v2-*.md` (các report đã có), `reports/handoffs/v2-*.md`, code hiện tại. Mục tiêu: tài liệu khớp sản phẩm sau v2, không phóng đại.

Chỉ sửa: `README.md`, `docs/**` Markdown, `apps/api/README.md`, `apps/web/README.md`, `packages/contracts/README.md`, `tools/docs/**` nếu cần mapping/example. Không sửa code/test, không sửa `reports/**`, không commit HTML thủ công.

Cập nhật tối thiểu:
- `README.md`: tính năng hiện có (tài khoản/session, insights 7–30 ngày, liên hệ khẩn cấp, tạo việc, lưu trữ hồ sơ + yêu cầu xóa, quyền xem số đo, badge/banner thông báo, admin thiết bị, Studio publish/rollback, quarantine ingest, SSE thu hồi); lệnh chạy/seed/test; số test thật **API 205 test/20 suite, web 176 test/32 file** (ghi ngày đo); giới hạn rõ: chưa có firmware ESP32, chưa có độ chính xác té ngã, MQTT thử nghiệm, chưa Web Push, chưa xóa vĩnh viễn dữ liệu (chỉ ghi nhận yêu cầu), AI template fallback.
- `docs/02`: bảng FR/trạng thái cập nhật cho tính năng v2; phân biệt đã làm/một phần/chưa làm; bổ sung quyền `canViewMeasurements`, lưu trữ hồ sơ, đồng thuận/giới hạn.
- `docs/03`: luồng ingest sự kiện theo assignment tại `measured_at`, quarantine; SSE revoke; MQTT experimental qua ACL, HTTP là đường chính thức.
- `docs/04`: endpoint mới/field mới/error code: `PATCH/DELETE /me`, `GET /me/sessions`, insights, emergency contacts, task create, subject archive/deletion-request, admin devices claim/rotate, history `canViewMeasurements`, `healthDataVisible`, `QUARANTINED` event; JSON ví dụ phải validate bằng `tools/docs/check-examples.mjs`.
- `docs/06`: màn hình/UX v2 (settings, insights, contacts, tạo việc, archive, admin devices, badge/banner, health notice, Studio preview/publish; mobile/large text); ghi phần chỉ là mô phỏng.
- `docs/07`/`docs/12`: bảo mật/quyền riêng tư: quyền số đo tách cảnh báo, AI không vượt quyền, retention/delete chưa tự động, dữ liệu trẻ em/người cao tuổi; không tuyên bố tuân thủ pháp lý.
- `docs/08`: bảng bằng chứng test thật (API 20 suite/205, web 32/176, randomized seed ghi nếu có, E2E); nêu phần chưa chạy.
- `docs/14`: trạng thái v2, nhật ký thay đổi ngắn, việc còn lại; không đánh dấu firmware/accuracy đã xong.
- Chạy `python tools/docs/build.py` và `--check`; sửa mọi link/JSON lỗi; kiểm HTML có section mới.
- Không sửa output HTML bằng tay; commit nhánh riêng; handoff `reports/handoffs/v2-docs-final.md` ghi file, lệnh build/check, số section/link, lỗi còn lại.

Quy tắc: tiếng Việt, không bịa số đo/giá/độ chính xác; không nói giảng viên đã duyệt; không đóng finding QA khi chưa sửa.
