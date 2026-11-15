# Fix worker — accessibility P1/P2 chính

Bạn là worker sửa lỗi trên worktree riêng. Đọc `AGENTS.md`, `reports/qa/v2-accessibility-nguoi-cao-tuoi.md` F-P1-1/F-P1-2, các P2 ưu tiên, `docs/06`, code alerts/notifications/chart/tokens.

Chỉ sửa: `apps/web/src/styles/tokens.css`, `apps/web/src/features/alerts/AlertsPage.tsx` + test, `AlertDetailPage.tsx` + test, `apps/web/src/features/notifications/NotificationsPage.tsx` + test, `MeasurementChart.tsx` + css feature (không layout.css). Không sửa app/router/AppShell/API/docs. Cài install/build contracts; test web + typecheck.

Yêu cầu:
- F-P1-1: tăng tương phản chữ phụ trên `paper-deep` đạt >=4.5:1 (đo lại bằng axe/contrast hoặc công thức WCAG), không làm xấu token khác; kiểm dòng cảnh báo an toàn.
- F-P1-2: xác nhận cảnh báo thất bại không phải 409 phải hiện lỗi thân thiện, có `role="alert"`/live region, giữ trạng thái; không im lặng.
- F-P2-4: sửa heading nhảy cấp ở chi tiết cảnh báo/Chính sách (H1→H3) — chỉ phần alert detail; tab chính sách ngoài vùng, ghi handoff.
- F-P2-5: chấm chưa đọc dùng `role="img"`/text ẩn hoặc bỏ aria-label trên span không role.
- F-P2-7: đã acknowledged thì không hiện nút Xác nhận; nếu bấm lại hiện thông điệp đúng (không “phiên bản cũ”).
- F-P2-6: chart scroll container focusable (`tabIndex=0`), có nhãn, `scroll-padding-bottom` để nav không che khi focus; không phá chart.
- Thêm test tương ứng; giữ test cũ. Kiểm axe/Playwright nếu có; ghi output thật.
- Handoff `reports/handoffs/v2-fix-a11y-p1.md`; commit nhánh riêng. Báo commit hash, test counts, P2 chưa làm.
