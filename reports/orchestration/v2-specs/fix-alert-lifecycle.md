# Fix worker — vòng đời cảnh báo suspected → unconfirmed

Bạn là worker sửa lỗi trên worktree riêng. Đọc `AGENTS.md`, báo cáo `reports/qa/v2-data-integrity.md` P2-5 và `reports/qa/v2-product-gaps.md` P1-1, `docs/03`, `docs/06`, code incidents.

Chỉ sửa: `apps/api/src/incidents/**`, `apps/api/src/config/env.ts`, `.env.example` (nếu thêm biến), `apps/api/test/incidents.spec.ts`/file test incidents; `apps/web/src/features/alerts/AlertsPage.tsx` + test alerts (chỉ thêm nhãn/trạng thái); không sửa DashboardPage, app.module, weekly worker files. Cài dependency/build contracts; chạy test incidents + alerts + typecheck.

Yêu cầu:
- Thêm cơ chế định kỳ (không chặn request) chuyển incident `suspected` quá hạn sang `unconfirmed`, mặc định 10 phút, cấu hình env `SUSPECTED_TIMEOUT_MINUTES` (1..120), tắt trong test trừ khi gọi thủ công. Ghi incident event `fall.candidate`? Không bịa event mới nếu enum không có; chỉ transition + audit/system metadata, hoặc thêm enum nếu cần nhưng phải migration? Tránh migration; dùng event type hiện có phù hợp hoặc không event.
- Không chuyển incident đã confirmed/cancelled; chạy idempotent; không phát SSE cho suspected trước timeout; sau unconfirmed phải xuất hiện trong `state=closed` và detail (không 404), hiển thị nhãn "Chưa xác định".
- Dashboard count phải khớp tập alert nhìn thấy: nếu chưa sửa DashboardPage, ghi rõ lead cần kiểm; API list/summary nhất quán.
- Thêm test: incident suspected cũ → unconfirmed; mới → vẫn suspected/không thấy; confirmed không bị đổi; list closed/detail hoạt động; permission giữ nguyên.
- Handoff `reports/handoffs/v2-fix-alert-lifecycle.md`; commit nhánh riêng. Báo commit hash, test counts, file lead cần nối.
