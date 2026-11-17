# Handoff — v2 fix password rate (giới hạn thử mật khẩu hiện tại khi đổi mật khẩu)

- **Thời điểm:** 2026-11-15 09:03 (Asia/Ho_Chi_Minh, UTC+7)
- **Worker:** fix `fix-password-rate`, worktree riêng trên nhánh `fix-password-rate`
- **Base:** `3c93f17`; **commit code:** `3f71ab7a3e123bb2c40bc962f702ba6873d912b6`
- **Nguồn yêu cầu:** `reports/orchestration/v2-specs/fix-password-rate.md`; finding **P2-1** của
  `reports/qa/v2-rev-features.md`. File báo cáo này **không có trong worktree tại HEAD** (base chưa chứa);
  nội dung P2-1 được đọc từ commit `80e23ae` (`docs(qa): nhận báo cáo reviewer tính năng v2`).
- **Vùng sửa:** `apps/api/src/auth/auth.service.ts`, `apps/api/test/auth.spec.ts`, file handoff này.
  Không sửa login flow/quyền/web/schema/controller; `POST /me/password` hiện có đã đủ (204, user id lấy từ phiên).

## Đã làm

### Cơ chế giới hạn

- Thêm bucket riêng `passwordChangeAttempts` trong `AuthService`, **key = user id** (không dùng bucket email
  của login). Ngưỡng/cửa sổ dùng lại đúng hằng số login qua alias:
  `PASSWORD_CHANGE_MAX_ATTEMPTS = LOGIN_MAX_ATTEMPTS` (10), `PASSWORD_CHANGE_WINDOW_MS = LOGIN_WINDOW_MS`
  (15 phút).
- **Đếm trước khi verify** (`reservePasswordChangeAttempt`): 10 request đầu trong cửa sổ được kiểm mật khẩu;
  request thứ 11 trở đi trả **429 `RATE_LIMITED`** trước khi đọc user/verify/đổi mật khẩu. Nhờ vậy một burst
  song song cũng không vượt ngưỡng (có test 20 request song song).
- **Mật khẩu đúng trong lúc bị chặn vẫn 429** cho tới khi hết cửa sổ — chọn hành vi an toàn để kẻ có phiên
  bị chiếm không thể “chờ đúng lúc” rồi thử tiếp; người dùng hợp lệ bị chặn tối đa 15 phút.
- **Reset:** xác minh đúng `currentPassword` xóa bộ đếm (bao gồm đổi thành công; trường hợp `newPassword`
  trùng cũ cũng đã chứng minh biết mật khẩu hiện tại). Hết cửa sổ (`> 15 phút` tính từ lần đếm đầu) tự xóa.
- **Audit giữ nguyên:** mỗi lần sai `currentPassword` vẫn ghi `auth.password_change` / `failed` /
  `{reason:'current_password_mismatch'}`; thành công vẫn ghi `success` / `{revokedSessions}` trong transaction.
  Không ghi mật khẩu/hash vào log hay audit; audit vẫn giữ `actorUserId`/`targetId` như các bản ghi cũ.
  Request bị 429 **không ghi audit** (giống login đang
  bị chặn) để tránh khuếch đại ghi DB từ 429 lặp lại.
- **Không đụng bucket login:** 10 lần sai đổi mật khẩu không khóa đăng nhập của chính user, càng không ảnh hưởng
  user khác. Bucket theo user id nên user B vẫn đổi mật khẩu bình thường khi user A bị chặn.

### Giới hạn đã biết (chấp nhận cho demo)

- Bộ đếm **in-memory, chỉ đúng trong một tiến trình API**: restart làm mất bộ đếm và nhiều instance không chia sẻ
  trạng thái. Khi chạy nhiều process phải chuyển sang store chia sẻ (Redis/DB). Đã ghi chú ngay tại khai báo
  `passwordChangeAttempts` trong code.
- Không thêm giới hạn theo IP; phạm vi finding chỉ yêu cầu chặn brute-force `currentPassword` từ phiên đã đăng nhập.
- 429 không được audit; nếu reviewer muốn audit riêng cho hành vi bị chặn thì cần cơ chế aggregate để tránh
  ghi DB không giới hạn.
- Việc chặn cả mật khẩu đúng tạo khóa tạm 15 phút cho chức năng đổi mật khẩu của chính user (không ảnh hưởng
  đăng nhập/các chức năng khác). Đây là đánh đổi an toàn đã chọn và được test.

## Test mới (`apps/api/test/auth.spec.ts`)

1. Sai `currentPassword` 10 lần → cả 10 trả 400, lần 11 (dù nhập đúng) trả **429 `RATE_LIMITED`**; mật khẩu cũ
   vẫn đăng nhập được, mật khẩu “mới” bị 401; audit đúng 10 bản ghi failed `current_password_mismatch`, không có
   mật khẩu/hash trong metadata.
2. Đúng trong cửa sổ → 429; tua `Date.now` quá 15 phút → đổi được 204, mật khẩu mới đăng nhập 200, mật khẩu cũ 401.
3. Đổi thành công giữa cửa sổ reset bộ đếm: 5 lần sai → đổi 204; 9 lần sai tiếp vẫn 400 (nếu không reset thì lần
   sai thứ 11 của tổng sẽ 429); đổi lần hai 204.
4. Bucket theo user id: user A bị chặn 429 nhưng user B vẫn đổi mật khẩu 204; A vẫn đăng nhập 200 (bucket login tách).
5. 20 request sai song song → đúng **10 × 400 + 10 × 429**, không vượt ngưỡng.
6. Response của register/session, `GET /me`, 400 và 204 không chứa mật khẩu hay `scrypt$`/`passwordHash`.

## Lệnh đã chạy (kết quả thật)

| Lệnh (thư mục) | Kết quả |
| --- | --- |
| `pnpm install --prefer-offline --frozen-lockfile` (root) | thành công, 711 package, 17.9s |
| `pnpm build:contracts` (root) | exit 0 |
| `pnpm --filter @annhien/api typecheck` (root) | exit 0 (`tsc -p tsconfig.json --noEmit`, gồm cả test) |
| `pnpm --filter @annhien/api test -- auth.spec.ts` | **1 suite / 12 test pass**, 7.4s |
| `pnpm --filter @annhien/api test -- auth.spec.ts account.spec.ts` | **2 suite / 19 test pass**, 12.5s |

- Không chạy toàn bộ test API (ngoài phạm vi yêu cầu); `account.spec.ts` được chạy thêm vì cũng đi qua
  `changePassword` và đều pass.
- `git diff --check` sạch; `git status` sạch sau commit code (handoff ở commit riêng).

## Chưa làm / bước tiếp theo

- Reviewer/lead cần tái kiểm P2-1 trên commit này (10 sai → 429; đúng trong cửa sổ → 429; sau 15 phút → đổi được;
  user khác không ảnh hưởng) rồi mới đóng finding.
- Nếu chốt triển khai nhiều instance/PostgreSQL thật, thay bộ đếm in-memory bằng store chia sẻ và ghi giới hạn
  một-process vào tài liệu vận hành tương ứng (ngoài vùng sửa của worker này).
- Không thay đổi tài liệu sản phẩm hay web trong lượt này.
