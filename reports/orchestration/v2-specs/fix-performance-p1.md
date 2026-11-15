# Fix worker — hiệu năng P1 lịch sử/biểu đồ/font

Bạn là worker sửa lỗi trên worktree riêng. Đọc `AGENTS.md`, `reports/qa/v2-hieu-nang-va-on-dinh-tai-trang.md` P1-1..P1-4, P2-5/P2-7, `docs/06`, code History/Chart/format/main/index.css.

Chỉ sửa: `apps/web/src/features/history/**`, `apps/web/src/components/MeasurementChart.tsx` + css, `apps/web/src/lib/format.ts`, `apps/web/src/main.tsx`/`index.css`/font CSS, `apps/web/index.html` nếu cần, test web tương ứng. Không sửa API/contracts/router/AppShell/layout.css. Cài install/build contracts; test web + typecheck + build.

Yêu cầu:
- P1-1: bỏ việc reset query/trang mỗi 60 giây; cập nhật “bây giờ” chỉ cho nhãn/relative time, giữ trang đã tải; không refetch 112 kB/phút; test.
- P1-2: “Hiện tất cả” không render 1.681 dòng một lần gây long task. Giới hạn cửa sổ hiển thị (ví dụ tối đa 300–500 dòng) hoặc virtualize; nút “Hiện thêm” theo bước hợp lý; nói rõ CSV để xem toàn bộ; memo/cache format, tránh render hai biến thể bảng/thẻ; đo lại thời gian render nếu có.
- P1-3: giảm font weight không dùng (Newsreader 700 nếu không dùng; chỉ giữ weight cần), giảm bytes; không thay font family/token.
- P1-4: nếu chi phí thấp, thêm skeleton/loading shell tĩnh để giảm màn hình trắng; không thay đổi logic auth; nếu làm lớn, ghi handoff rõ chưa làm.
- P2-7: memo chart theo items, thay `Math.min(...values)` bằng reduce; P2-8: không log 401 /me trên trang công khai (nếu trong vùng).
- Giữ test cũ; thêm test 60s không reset/limit; ghi số đo thật trước/sau nếu chạy Playwright.
- Handoff `reports/handoffs/v2-fix-performance-p1.md`; commit nhánh riêng. Báo commit hash, test counts, số đo, phần chưa làm.
