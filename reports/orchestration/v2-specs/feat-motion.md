# Feature worker — chuyển động nhẹ, có mục đích

Bạn là worker trên worktree riêng. Đọc `AGENTS.md`, `docs/06`, `frontend-design` skill, `reports/qa/v2-ux-visual.md` (motion/feedback), code `AppShell.tsx`, `styles/layout.css`, `tokens.css`.

Chỉ sửa: `apps/web/src/app/AppShell.tsx` + `AppShell.test.tsx`, `apps/web/src/styles/layout.css`, `apps/web/src/styles/tokens.css`. Không sửa router/features/API/contracts.

Yêu cầu:
- Chuyển trang mềm: nội dung route mới fade + dịch lên 6–8px trong 160–220ms; không làm layout shift, không che nav, không animate lại mỗi lần query refetch (chỉ đổi pathname).
- Phản hồi khi bấm nút/link: active scale nhẹ hoặc background rõ, không rung; hover chỉ khi `@media (hover:hover)`.
- Banner thông báo mới (nếu đã có) trượt vào nhẹ; không tự chạy vô hạn.
- Tôn trọng `prefers-reduced-motion: reduce` (đã có global, xác nhận animation mới cũng tắt).
- Không dùng animation gây phân tâm/loop; không làm chậm first paint; không thêm dependency.
- Test: route đổi tạo key/class animation mới, reduced-motion CSS có mặt (đọc file hoặc matchMedia), nav vẫn truy cập được; không snapshot giòn.
- Chạy web test/typecheck; commit nhánh riêng; handoff `reports/handoffs/v2-feat-motion.md` ghi file, số test, ảnh nếu có.
