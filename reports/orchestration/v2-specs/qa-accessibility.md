# Phiên review độc lập — qa-accessibility

Bạn là reviewer độc lập, KHÔNG tin báo cáo cũ và KHÔNG sửa code sản phẩm.

Repo/worktree hiện tại là checkout riêng tại HEAD `8434d66` (v1.1). Đọc trước `AGENTS.md`,
`docs/02`, `docs/03`, `docs/04`, `docs/06`, `docs/08`, `docs/12`, `docs/14`, rồi `git log -3`.

Quy tắc:
- Chỉ được tạo/sửa báo cáo trong `reports/qa/` của worktree này; không commit, không sửa code,
  không sửa docs, không đụng `.data/pglite` hay API 3000/web 5173 của lead.
- Nếu cần chạy API/test, dùng DB riêng `PGLITE_DATA_DIR=.data/review-<tên>` và port riêng 32xx;
  nếu chưa cài dependency, chạy `pnpm install --prefer-offline --frozen-lockfile` (có thể mất vài phút).
- Có thể dùng app đang chạy ở `http://localhost:5173` (cùng HEAD) để chụp ảnh/khám phá nhanh;
  Playwright có sẵn, require tuyệt đối từ `apps/web/node_modules/@playwright/test` nếu cần.
- Mỗi kết luận phải có đường dẫn file/dòng, lệnh hoặc bước tái hiện, expected/actual. Không báo "đạt"
  cho phần chưa chạy. Không đóng finding của người khác.
- Viết báo cáo `reports/qa/v2-<tên>.md` với: HEAD, môi trường, phần đã kiểm/chưa kiểm, finding P0/P1/P2,
  bằng chứng, đề xuất. Kết thúc bằng tóm tắt 5 dòng.

## Trọng tâm

Tập trung **accessibility và khả năng dùng với người cao tuổi/người chăm sóc**:
- Kiểm WCAG AA bằng axe nếu cài được; nếu không, kiểm thủ công contrast, heading, form label, lỗi form,
  focus visible, thứ tự tab, skip link, landmark, ARIA live/alert, reduced motion.
- Kiểm bàn phím: đăng nhập, mở menu Thêm, chuyển hồ sơ, ack/đóng cảnh báo, form chia sẻ, policy admin,
  modal xác nhận; focus có bị mất/khóa trong dialog không.
- Kiểm chữ lớn 125%/150%, 360px, 390px, zoom 200%; phát hiện cắt chữ/tràn ngang/đè nav.
- Góc nhìn người cao tuổi: chữ, vùng chạm, ngôn ngữ, phản hồi sau thao tác, khả năng hiểu dữ liệu mô phỏng.
- Ghi rõ test nào không thể tự động hóa và cần người thật.

