# Fix worker — UX P0/P1 từ review visual

Bạn là worker sửa lỗi trên worktree riêng. Đọc `AGENTS.md`, `reports/qa/v2-ux-visual.md` P0-1/P1-1/P1-2/P1-5/P1-8, `docs/06`, code Dashboard/AppShell/SharePage/Landing + CSS.

Chỉ sửa: `apps/web/src/features/dashboard/DashboardPage.tsx` (+test nếu có), `apps/web/src/app/AppShell.tsx` (+test), `apps/web/src/features/share/SharePage.tsx` + css share, `apps/web/src/pages/LandingPage.tsx` + landing css, `apps/web/src/styles/layout.css` (chỉ rule liên quan), test web tương ứng. Không sửa API/router/contracts/docs, không sửa logic quyền/dữ liệu. Cài install + contracts build; chạy test web + typecheck + build.

Yêu cầu:
1. **P0 dashboard:** khối cảnh báo đang mở phải render **độc lập** với query status/daily-summary. Khi status/summary đang tải hoặc lỗi, cảnh báo vẫn hiện (hoặc lỗi cảnh báo riêng), không bị ẩn sau `PageLoader`/`ErrorState` toàn trang. Loading từng vùng; không bịa số.
2. **P1 scroll:** đổi pathname trong `/app` đưa focus/scroll về đầu nội dung (main hoặc H1) nhưng không phá back/forward/hash; không scroll khi query param cùng trang nếu không cần.
3. **P1 invite overflow:** khối “Đã tạo lời mời”/link/mã không tràn ngang ở 390/360; dùng `overflow-wrap:anywhere`, `min-width:0`, nút wrap; kiểm 1280/390/360/chữ lớn.
4. **P1 mobile labels:** nhãn “Bản demo · dữ liệu mô phỏng” và câu “Cảnh báo chỉ hiển thị khi trang đang mở...” phải đọc được trên mobile (topbar hoặc footer), không bị ẩn; desktop sidebar không bị cắt xấu.
5. **P1 landing header:** ở 360/390 logo + CTA/nav không xuống dòng vỡ; bố cục rõ, chạm được, không tràn ngang.
6. Giữ nguyên copy H1/landing đang được test; nếu đổi phải cập nhật test đúng ý định (không nới).
7. Kiểm ảnh thật bằng Playwright 1280x900/390x844/360x740/chữ lớn; lưu ảnh ngoài repo, ghi kết quả.
Handoff `reports/handoffs/v2-fix-ux-p0-p1.md`; commit nhánh riêng. Báo commit hash, test counts, ảnh/kích thước, điểm chưa sửa.
