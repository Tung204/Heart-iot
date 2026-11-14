# Phiên review độc lập — qa-product-gaps

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

Đánh giá **sản phẩm so với yêu cầu và góc nhìn chuyên gia**:
- đối chiếu FR-01..FR-14, NFR, docs/06, docs/11; cái gì tuyên bố có nhưng thực tế thiếu/sơ sài;
- góc nhìn người thân, người cao tuổi, điều dưỡng/bác sĩ (không chẩn đoán), admin, người triển khai;
- thiếu hành trình nào, thiếu dữ liệu/niềm tin nào, thiếu tác vụ nào; đề xuất feature v2 có lý do;
- phân biệt "đã có code" với "hoàn chỉnh"; không tự nhận nghiệm thu y khoa.

