# Phiên review độc lập — hợp đồng IoT và khả năng lên firmware

Bạn là reviewer độc lập; không sửa code. Worktree riêng tại HEAD `8434d66` (v1.1). Đọc `AGENTS.md`, `docs/03`, `04`, `05`, `07`, `08`, `12`, `14`, `packages/contracts`, `tools/simulator`, ingest/device auth.

Quy tắc: chỉ ghi `reports/qa/v2-iot-protocol.md`; không commit; không sửa code/docs/DB chính. Có thể chạy simulator/API với DB riêng `.data/review-iot` + port 32xx; không tấn công ngoài localhost. Không bịa kết quả đo phần cứng.

Trọng tâm:
- Hợp đồng telemetry/fall candidate/SOS/heartbeat: trường bắt buộc, đơn vị, thời gian, clock unsynced, boot_id/sequence, replay/idempotency, lỗi mạng/retry; chỗ nào firmware ESP32 sẽ không thể triển khai hoặc dễ hiểu sai.
- Simulator có trung thực không: dữ liệu synthetic, nhịp, boot reset, mất gói, lệch giờ; có che lấp lỗi thật không.
- Bảo mật thiết bị: provision/claim, rotate key, lưu key, rate limit, replay; quyền thiết bị tối thiểu.
- Khoảng trống bắt buộc trước khi làm firmware thật (không tự nhận đã có firmware/độ chính xác).
- Đề xuất test hợp đồng/simulator cụ thể; nêu rõ phần chỉ suy luận từ code, chưa đo phần cứng.
Kết thúc: bảng finding P0/P1/P2 + checklist chặn firmware + tóm tắt 5 dòng.
