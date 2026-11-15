# Fix worker — chỉ báo cảnh báo mới toàn tài khoản

Bạn là worker sửa lỗi trên worktree riêng. Đọc `AGENTS.md`, `reports/qa/v2-ux-visual.md` P1-6, `reports/qa/v2-product-gaps.md` P1-4, `reports/qa/v2-performance-...` P2-6, `docs/06`, code AppShell/notifications/realtime.

Chỉ sửa: `apps/web/src/app/AppShell.tsx` + test, `apps/web/src/features/notifications/**` (thêm hook đọc badge), `apps/web/src/features/realtime/useSubjectEvents.ts` + test, css `layout.css` chỉ rule badge/banner. Không sửa API/router/contracts/Dashboard (khác worker). Cài install/build contracts; test web + typecheck.

Yêu cầu:
- Badge số chưa đọc trên mục “Thông báo” (desktop sidebar + mobile bottom/more), có text ẩn cho screen reader (“N thông báo chưa đọc”), không chỉ màu; 0 thì ẩn badge nhưng vẫn có link.
- Tải unread count định kỳ (20–30s) hoặc khi SSE notification; không gọi API quá dày; dừng khi tab ẩn nếu dùng interval.
- Khi có thông báo mới (id/count tăng) và người dùng đang ở trang khác, hiện banner/toast `role="status"` “Có thông báo mới cho hồ sơ …”, nút xem/đóng; không chứa chi tiết sức khỏe; không tự điều hướng; không lặp vô hạn.
- SSE mất kết nối: hiện banner nhỏ “Mất cập nhật trực tiếp — đang thử lại” và ẩn khi nối lại; không làm mất cảnh báo đã tải.
- Không phá layout 360/390/chữ lớn; badge không đè icon; test mobile/desktop.
- Test: unread badge, banner xuất hiện/đóng, SSE error/online, accessibility name; mock fetch/EventSource. Không test bằng cách gọi API thật.
- Handoff `reports/handoffs/v2-fix-global-alerts.md`; commit nhánh riêng. Báo commit hash, test counts, giới hạn (chỉ in-app, không Web Push).
