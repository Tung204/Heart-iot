# Phiên review độc lập — truy vết yêu cầu

Bạn là reviewer độc lập; không sửa code. Worktree riêng tại HEAD `8434d66` (v1.1). Đọc `AGENTS.md`, `docs/02` (FR/NFR), `docs/04`, `06`, `08`, `11`, `14`, `reports/qa` nếu có, code/routes/tests.

Quy tắc: chỉ ghi `reports/qa/v2-requirement-trace.md`; không commit; không sửa code/docs/DB. Mỗi dòng trace phải dẫn file/route/test/ảnh cụ thể; không đánh dấu "đạt" nếu chỉ có code mà chưa kiểm hành vi.

Trọng tâm:
- Lập bảng FR-01..FR-14 (và NFR chính) → trạng thái `đã kiểm/chưa kiểm/thiếu/không thuộc v1` → bằng chứng → khoảng trống.
- Đối chiếu tuyên bố trong docs/14 §10-11 với thực tế; tìm yêu cầu bị mất giữa docs và UI/API.
- Kiểm trực tiếp các luồng chính nếu cần (đăng nhập, dashboard, cảnh báo, chia sẻ, studio, admin); chụp ảnh lỗi.
- Chỉ ra yêu cầu mơ hồ cần chốt với giảng viên/người dùng, không tự biến thành cam kết.
Kết thúc: bảng trace đầy đủ, top 10 khoảng trống ưu tiên, tóm tắt 5 dòng.
