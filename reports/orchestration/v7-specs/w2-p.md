# v7 W2 — lane P: công khai, đăng nhập, lời mời

Đọc `w2-common.md` trước. Cổng riêng: port **4351**.

## File được ghi

`apps/web/src/pages/{LandingPage,LoginPage,RegisterPage,NotFoundPage}.tsx` (+ test), `features/auth/*` (giữ export frozen), `features/invitations/*`, `styles/public.css`, `styles/auth.css`. Trang 404 trong `/app` thuộc F/router — chỉ sửa 404 công khai.

## Giữ nguyên hành vi

- `useSafeNext` chỉ nhận URL nội bộ; giữ `next` xuyên login → register → invite; không open-redirect.
- Landing phân biệt: đang tải / khách 401 / lỗi mạng-5xx; CTA đúng trạng thái; **không** tự điền tài khoản demo; không hứa năng lực y tế/AI chưa có.
- Login/Register: validation + focus lỗi, chống gửi hai lần, thông báo lỗi đúng loại (sai mật khẩu ≠ mất mạng).
- Invite: preview GET rồi accept POST; **422/400 token sai định dạng là lỗi dữ liệu, không phải “không kiểm tra được lời mời”** (v6 F01); 404 hết hạn; 5xx/mạng có retry; không lộ email/token; hiển thị đúng vai trò được mời.
- Giữ route/redirect hiện có; không đổi API calls.

## Giao diện

Theo `design-system.md` §5.1–5.3, §5.14. Landing: một H1, một câu giá trị, hành động chính rõ, không hero tim đập/cream/serif; không khối “tính năng” dài. Auth: form gọn một cột, lỗi cạnh field, link chuyển đổi ≥44px. Invite: trạng thái loading/lỗi/hợp lệ rõ, một CTA. 404: về trang chủ + gợi ý kiểm link mời.

## Ảnh + đo

`/`, `/login`, `/register`, `/invite/<token hợp lệ>`, `/invite/<token 10 ký tự>`, `/khong-ton-tai` × 4 viewport. Đo: một H1; CTA đầu viewport; target ≥44×44; không tràn ngang; lỗi 422 hiển thị đúng chữ (không phải lỗi kết nối). Ghi test diff nếu đổi locator.
