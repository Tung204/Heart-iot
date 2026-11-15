# Fix worker v4 — cập nhật E2E theo IA mới

Base master (sau merge v4). Chỉ sửa `apps/web/e2e/*.spec.ts` (và helper nếu cần); không sửa app code/API/docs.

## Việc

`pnpm --filter @annhien/web test:e2e` hiện 5 fail:
- `alerts.spec.ts:175` — test cũ kỳ vọng dashboard/cảnh báo ở `/app`; v4 `/app` là Hôm nay, `/app/overview` là Sức khỏe.
- `assistant.spec.ts:160` — kỳ vọng “tóm tắt/cột bối cảnh” đã bị bỏ.
- `assistant.spec.ts:196` — kỳ vọng nav “Trợ lý”/“Tổng quan” cũ; v4 nav “Hôm nay” đầu.
- `history.spec.ts:105` — test 60s refetch có thể phụ thuộc màn cũ.
- `history.spec.ts:128` — nút “Hiện thêm 50 dòng”/400 dòng đã đổi; xem UI mới.

Cập nhật test theo hành vi v4 thật, không nới assertion vô nghĩa:
- `/app` H1 `Hôm nay`, trạng thái cảnh báo/quyền, ô hỏi `Gửi`, không còn “Bối cảnh/Độ phủ/bản tin”.
- `/app/overview` H1 `Sức khỏe`, link `← Hôm nay`; nav đầu `Hôm nay` quay về `/app`.
- `/app/alerts` vẫn cảnh báo; `/app/history` dùng nút tải thật (kiểm DOM trước khi sửa).
- Test phải kiểm hành vi (URL, heading, nút, dữ liệu) không chỉ chữ; không xóa test.
Chạy lại E2E (cần web 5173/API 3000 đang chạy; nếu chưa, khởi động theo docs/14), typecheck. Commit branch riêng; không merge; handoff `reports/handoffs/v4-fix-e2e.md`.
