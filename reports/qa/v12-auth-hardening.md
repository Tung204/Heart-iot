# Auth hardening — giới hạn đăng nhập theo IP/cặp IP+email và `Cache-Control`

**Ngày:** 23/11/2026  
**Nhánh:** `v10-backend` (chưa merge)  
**Phạm vi:** backend API; không sửa UI, không đổi schema, không thêm dependency.

## Vấn đề

Review bảo mật v2 ghi P2-1/P2-5: giới hạn đăng nhập sai chỉ đếm theo email trong bộ nhớ, nên kẻ tấn công có thể gửi 10 lần sai để khóa mật khẩu đúng của nạn nhân (targeted lockout), không có giới hạn theo IP, và register/login vẫn có thể bị lạm dụng. P2-6 ghi thiếu `Cache-Control` cho dữ liệu sức khỏe; security headers trước đó chưa đặt cache.

## Đã làm

- Đổi giới hạn đăng nhập từ **một bucket theo email** sang:
  - **cặp IP + email:** tối đa **10 lần sai / 15 phút**;
  - **IP:** tối đa **30 lần sai / 15 phút** trên mọi email (chặn spray).
- Không còn bucket toàn tài khoản theo email. Vì vậy 10 lần sai từ IP của kẻ tấn công **không** chặn mật khẩu đúng từ IP khác; đăng nhập đúng xóa bộ đếm của cặp IP+email.
- `AuthController.login` lấy `req.ip` (fallback `req.socket.remoteAddress`), chuẩn hóa IPv4-mapped (`::ffff:`).
- Map đếm có giới hạn **20.000 khóa/bucket**, xóa entry hết hạn khi map ≥1.000; tránh phình bộ nhớ do email/IP rác.
- Thêm `Cache-Control: no-store` cho mọi response API (JSON/SSE), cạnh các security headers hiện có.
- Giữ nguyên audit `auth.login` cho lần sai thực tế; request bị 429 không ghi audit để tránh khuếch đại DB.

## Kiểm

| Kiểm | Kết quả |
| --- | --- |
| `backend/test/auth.spec.ts` | thêm 5 test: 10 sai → 429 kể cả mật khẩu đúng; IP khác vẫn đăng nhập đúng; đăng nhập đúng reset cặp; 30 lần sai/IP → 429; burst 20 request song song chỉ 10 lần được kiểm |
| `backend/test/security-headers.spec.ts` | 200 và 401 đều có `Cache-Control: no-store` cùng CSP/nosniff/DENY/no-referrer/Permissions-Policy |
| API toàn bộ | **36 suite / 331 test pass** (23/11/2026) |
| API randomized `--seed=20261121` | **331/331 pass** |
| Live API (PGlite mới + seed, port 3036) | `valid-before=200`; 10 lần sai → `401`; mật khẩu đúng ngay sau → **429 RATE_LIMITED**; response health có `Cache-Control: no-store` |
| Typecheck + build API | pass |

## Giới hạn

- Bộ đếm **trong bộ nhớ, một tiến trình**; nhiều instance có thể vượt ngưỡng hoặc không chia sẻ trạng thái. Chưa dùng Redis/DB.
- Ngưỡng 10 cặp/IP và 30/IP là **chọn demo, chưa hiệu chuẩn** với người dùng thật. Sau reverse proxy, `req.ip` có thể là IP proxy nếu không cấu hình `trust proxy`; cần chốt cách lấy IP ở môi trường triển khai.
- Cùng NAT/proxy dùng chung vẫn có thể bị ảnh hưởng; kẻ tấn công phân tán nhiều IP vẫn có thể thử tiếp. Đây không phải WAF/bot protection.
- Chưa xử lý enumeration qua register (409) hay timing login; chưa giới hạn register theo IP.
- `Cache-Control: no-store` chỉ là header; chưa kiểm cache CDN/proxy thật. HSTS vẫn chờ TLS.
- Không phải security audit độc lập; chưa tái kiểm toàn bộ finding P2.
