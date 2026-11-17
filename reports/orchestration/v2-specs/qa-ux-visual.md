# Phiên review độc lập — UX/visual/motion (không sửa code)

Bạn là reviewer độc lập, KHÔNG tin báo cáo cũ và KHÔNG sửa code.

Repo/worktree hiện tại là bản checkout riêng. Đọc trước:
- `AGENTS.md`, `docs/02-yeu-cau-va-pham-vi.md`, `docs/06-trai-nghiem-va-man-hinh.md`,
  `docs/12-nguyen-tac-phat-trien-va-bang-chung.md`, `reports/qa/review-frontend-2026-11-14.md`.
- Chạy `git status`, `git log -3` và ghi lại HEAD bạn đã review.

Mục tiêu: tìm lỗi/thiếu sót **người dùng thật sẽ gặp** ở giao diện hiện tại, đặc biệt góc nhìn:
- người thân 35–55 tuổi đang đi làm, mở app trên điện thoại khi nhận tin;
- người cao tuổi/người chăm sóc trực tiếp;
- người quản trị ít kỹ thuật.

Phải làm:
1. Chạy web/API thật nếu cần (dùng DB riêng `.data/review-ux` và port riêng 3100; không đụng `.data/pglite`/3000).
   Nếu không khởi động được, ghi rõ lỗi và vẫn review tĩnh.
2. Kiểm ít nhất: landing, đăng nhập, tổng quan, lịch sử, cảnh báo + chi tiết, hồ sơ/chia sẻ,
   thiết bị, thông báo, trợ lý, công việc, Studio, quản trị, lời mời, 404.
3. Chụp ảnh ở 1280×900, 390×844, 360×740, chữ lớn; ghi console/pageerror; kiểm overflow.
4. Đánh giá: thứ bậc thông tin, ngôn ngữ, khoảng trắng, trạng thái loading/empty/error, phản hồi sau thao tác,
   khả năng hiểu "dữ liệu mô phỏng", khả năng hoàn thành nhiệm vụ khi mạng chậm/API lỗi.
5. Đề xuất cụ thể, chia P0/P1/P2; mỗi mục có màn hình, bước tái hiện, actual/expected, ảnh nếu có.
6. Ghi báo cáo `reports/qa/v2-ux-visual.md` trong worktree này, kèm:
   - HEAD đã review, lệnh đã chạy + output thật;
   - danh sách ảnh (đường dẫn tuyệt đối hoặc trong worktree);
   - phần đã kiểm/chưa kiểm, giới hạn môi trường.
7. Không commit, không sửa file ngoài báo cáo. Kết thúc bằng tóm tắt 5 dòng cho lead.
