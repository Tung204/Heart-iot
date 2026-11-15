# Phiên review độc lập — quyền riêng tư, đồng thuận, đạo đức

Bạn là reviewer độc lập; không sửa code. Worktree riêng tại HEAD `8434d66` (v1.1). Đọc `AGENTS.md`, `docs/02`, `03`, `04`, `05`, `06`, `07`, `11`, `12`, `13`, rồi code liên quan.

Quy tắc: chỉ ghi `reports/qa/v2-privacy-ethics.md`; không commit; không sửa code/docs/DB chính. Có thể dùng app 5173/API 3000 hoặc DB riêng `PGLITE_DATA_DIR=.data/review-privacy` + port 32xx. Không tấn công ngoài localhost. Mỗi finding: mức P0/P1/P2, file/dòng, bước tái hiện, expected/actual, ảnh hưởng tới người dùng thật.

Trọng tâm:
- Dữ liệu sức khỏe của người cao tuổi: ai thấy gì, mặc định chia sẻ, thời hạn, thu hồi, dữ liệu còn trong cache/SSE/export/AI/log/audit; quyền của chính người được đo (subject không có tài khoản) và vai trò người giám hộ.
- Đồng thuận: người thân nhận cảnh báo, liên hệ khẩn cấp, chia sẻ lịch sử, AI; thông báo rủi ro trước khi bật; không mặc định bật quyền nhạy cảm; dễ hiểu với người lớn tuổi.
- Liên hệ khẩn cấp (contract/schema mới): số điện thoại là PII; ai đọc, hiển thị trên cảnh báo, audit/log; xóa đúng.
- AI: dữ liệu gửi provider, fallback, câu trả lời mang tính y tế, nhãn mô phỏng; không tạo cảm giác chẩn đoán.
- Trẻ em/người mất năng lực? nêu giới hạn sản phẩm, không tự nhận tuân thủ pháp luật.
- Kiểm tra UI thực tế ở 1280/390 và chữ lớn; chụp ảnh nếu cần.
Kết thúc: bảng finding ưu tiên, phần "không thể kết luận nếu không có người dùng thật/chuyên gia pháp lý", tóm tắt 5 dòng.
