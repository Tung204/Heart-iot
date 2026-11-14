# Feature worker — feat-account

Bạn là **feature worker** trên worktree riêng, làm một phần dọc (API + UI + test), không làm cả sản phẩm.

Trước khi làm: đọc `AGENTS.md`, `docs/02`, `docs/03`, `docs/04`, `docs/06`, `docs/12`, `docs/14`, code liên quan, `git log -3`.
Chạy `pnpm install --prefer-offline --frozen-lockfile` và `pnpm --filter @annhien/contracts build` nếu worktree chưa có dependency/dist. HEAD đã có contract nền; không sửa contract ngoài file được giao, không sửa migration.

Quy tắc: chỉ sửa vùng được giao; **không** sửa `apps/api/src/app.module.ts`, `apps/web/src/app/router.tsx`, `apps/web/src/app/AppShell.tsx`, `apps/web/src/styles/layout.css`, `tokens.css`, README/docs/HTML hoặc package export — lead sẽ nối. Không sửa/xóa test hợp lệ để làm xanh; không bịa số liệu; không báo đã chạy nếu chưa chạy. Chạy test hẹp nhất + typecheck. Commit trên nhánh riêng, không merge master. Viết `reports/handoffs/v2-feat-account.md` với file, lệnh/kết quả, quyết định, rủi ro, việc lead cần nối. Kết thúc báo cáo ngắn: commit hash, test counts, file cần nối, điểm chưa làm.

## Mục tiêu
Trang **Cài đặt tài khoản** đủ dùng thật: đổi tên hiển thị, đổi mật khẩu, xem/thu hồi các phiên đăng nhập khác.

## Vùng được sửa
- `packages/contracts/src/auth.ts` (đã có schema; chỉ sửa nếu cần, giữ tương thích)
- `apps/api/src/auth/auth.service.ts`, `auth.controller.ts`; có thể thêm file trong `apps/api/src/auth/`
- `apps/api/test/account.spec.ts` (mới)
- `apps/web/src/features/settings/**` (mới)
- `apps/web/src/features/auth/api.ts` (chỉ thêm hàm gọi API; không đổi hành vi cũ)

## API (theo contract đã có)
- `PATCH /me` body `{displayName}` → 200 `{user}`; trim, 1..120; audit `auth.profile_update`.
- `POST /me/password` body `{currentPassword,newPassword}` → 204; xác minh mật khẩu hiện tại, mật khẩu mới ≥10, khác cũ; **giữ phiên hiện tại**, thu hồi mọi phiên khác; audit `auth.password_change` (không ghi mật khẩu/hash).
- `GET /me/sessions` → `{items:[{id,createdAt,expiresAt,current}]}` chỉ phiên còn hiệu lực của chính mình, không trả token; sắp xếp mới nhất trước.
- `DELETE /me/sessions/:id` → 204; chỉ phiên của mình; phiên hiện tại → 400 kèm thông điệp; không tồn tại/người khác → 404.
- `POST /me/sessions/revoke-others` → 204; thu hồi tất cả trừ phiên hiện tại; audit số lượng.
- Dùng `req.sessionId` từ SessionGuard; không tin id từ body. Lỗi dùng AppError nhất quán.

## UI
- `SettingsPage` tiếng Việt, card: Hồ sơ, Mật khẩu, Phiên đăng nhập.
- Form có label, `aria-describedby` cho hint/lỗi, lỗi tại chỗ; nút disabled khi đang gửi; thông báo thành công rõ.
- Sau đổi tên, cập nhật query `me` ngay; sau đổi mật khẩu không đăng xuất.
- Danh sách phiên: "Thiết bị này" cho current; nút "Thu hồi" cho phiên khác, xác nhận trong dòng; ngày giờ dễ đọc.
- Responsive 360/390 và chữ lớn; không phụ thuộc màu; không dùng dữ liệu sức khỏe.
- Không tự thêm route/nav; export component để lead nối.

## Kiểm thử tối thiểu
API: chưa đăng nhập 401; đổi tên trim/validation; đổi mật khẩu sai hiện tại 400; mật khẩu mới trùng cũ 400; sau đổi, phiên khác bị 401 nhưng phiên hiện tại còn; không thu hồi được phiên người khác (404); sessions không lộ token.
Web: render 3 phần; validate lỗi; submit thành công gọi API đúng; thu hồi phiên khác; accessible name.
