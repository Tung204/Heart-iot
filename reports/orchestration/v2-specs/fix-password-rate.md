# Fix worker — giới hạn thử mật khẩu hiện tại khi đổi mật khẩu

Bạn là worker bảo mật trên worktree riêng. Đọc `AGENTS.md`, `reports/qa/v2-rev-features.md` P2-1, code auth/session/audit/test.

Chỉ sửa: `apps/api/src/auth/auth.service.ts` (hoặc helper auth), `apps/api/src/auth/auth.controller.ts` nếu cần, `apps/api/test/auth.spec.ts`. Không sửa login flow/quyền/web/schema.

Yêu cầu:
- `POST /me/password` sai `currentPassword` quá ngưỡng (10 lần/15 phút, cùng cửa sổ login) → 429 `RATE_LIMITED`/`TOO_MANY_ATTEMPTS`, không kiểm/đổi mật khẩu; reset sau thành công hoặc hết hạn.
- Không dùng chung bucket email login (tránh khóa đăng nhập của user khác); bucket theo user id. Rate limit in-memory là chấp nhận cho demo, ghi rõ giới hạn một process.
- Mật khẩu đúng sau khi bị chặn vẫn 429 cho tới hết cửa sổ? (chọn hành vi an toàn, test); sau thành công reset.
- Audit failed/success giữ; không log mật khẩu.
- Test: 10 sai → lần 11 429; đúng trong cửa sổ → 429; sau reset/time → đổi được; user khác không bị ảnh hưởng; response không lộ hash.
- Chạy auth spec + typecheck; handoff `reports/handoffs/v2-fix-password-rate.md`; commit nhánh riêng.
