# Handoff — v2-feat-account (Cài đặt tài khoản)

- **Thời điểm:** 2026-11-15 (Asia/Ho_Chi_Minh)
- **Worker:** feature `feat-account`, worktree riêng trên nhánh `feat-account`
- **Môi trường:** Windows, Node v24.22.2, pnpm 12.5.1, PGlite in-memory cho test
- **Commit code:** `4cea10a805e5878169a372e07de71e51f12a6b46` (`feat(auth): cài đặt tài khoản — hồ sơ, mật khẩu, phiên đăng nhập`)
- **Vùng ghi:** `packages/contracts/src/auth.ts` (không đổi), `apps/api/src/auth/**`, `apps/api/test/account.spec.ts`,
  `apps/web/src/features/auth/api.ts` (chỉ thêm hàm), `apps/web/src/features/settings/**`, file này.

## Đã làm

### API (`apps/api/src/auth/`)

| Endpoint | Hành vi |
| --- | --- |
| `PATCH /me` | 200 `{user}`; `displayName` trim 1..120 (schema hợp đồng), trả user sau lưu; audit `auth.profile_update`. |
| `POST /me/password` | 204; xác minh `currentPassword`; mật khẩu mới ≥10 và khác cũ; lưu hash mới + thu hồi mọi phiên khác **trong cùng transaction**; giữ phiên hiện tại; audit `auth.password_change`. |
| `GET /me/sessions` | `{items:[{id,createdAt,expiresAt,current}]}` — chỉ phiên còn hiệu lực của chính mình, mới nhất trước (`createdAt DESC`, tie-break `id DESC`), không trả token/tokenHash. |
| `DELETE /me/sessions/:id` | 204; chỉ phiên của mình; phiên hiện tại → 400 kèm thông điệp; không tồn tại/người khác → 404; phiên đã thu hồi → 204 idempotent. |
| `POST /me/sessions/revoke-others` | 204; thu hồi tất cả trừ phiên hiện tại; audit `auth.sessions_revoke_others` kèm `{revokedSessions}`. |

- Mọi id người dùng/phiên lấy từ `req.sessionId` do `SessionGuard` gắn; không đọc id từ body.
- Lỗi qua `AppError`; riêng 400 dùng `new AppError('VALIDATION_FAILED', message, 400)` vì `common/app-error.ts`
  nằm ngoài vùng được sửa. `ApiExceptionFilter` đã map 400 → `VALIDATION_FAILED` sẵn.
- Audit đổi mật khẩu thất bại ghi `outcome: 'failed'` + `{reason:'current_password_mismatch'|'same_password'}`;
  audit thành công chỉ ghi `{revokedSessions}`. Không có mật khẩu/hash/tên cũ-mới trong audit.
- Hash mật khẩu dùng `hashPassword`/`verifyPassword` sẵn có (scrypt), không thêm dependency.

### Web (`apps/web/src/features/settings/**`)

- `SettingsPage` tiếng Việt, 3 card: **Hồ sơ**, **Mật khẩu**, **Phiên đăng nhập**; export named `SettingsPage` để lead nối
  (không sửa route/nav).
- Hồ sơ: `TextField` có label/hint/`aria-describedby`; lỗi tại chỗ; nút disabled khi gửi; thành công cập nhật ngay
  query `me` (`queryClient.setQueryData`) nên mọi màn hình dùng chung thấy tên mới; không gọi API khi tên không đổi.
- Mật khẩu: validate `currentPassword`/`newPassword` bằng `changePasswordSchema` (đọc `minLength` từ hợp đồng),
  kiểm nhập lại + trùng mật khẩu cũ ở client; sau thành công **không đăng xuất**, chỉ tải lại danh sách phiên.
- Phiên: "Thiết bị này" cho `current`; phiên khác có nút "Thu hồi" + xác nhận ngay trong dòng; thêm
  "Thu hồi tất cả phiên khác" có xác nhận; ngày giờ `formatDateTime` (vi-VN), `time dateTime`; lỗi có nút thử lại.
- Không phụ thuộc màu (pill luôn có chữ), không dùng dữ liệu sức khỏe, không đổi `layout.css`/`tokens.css`.
- `features/auth/api.ts`: chỉ thêm `updateProfile`, `changePassword`, `fetchSessions`, `revokeSession`,
  `revokeOtherSessions` và re-export type/schema; các export cũ (`loginSchema`, `registerSchema`, `LoginInput`,
  `RegisterInput`) giữ nguyên.
- Key truy vấn phiên đặt cục bộ trong feature: `['auth','me','sessions']` (không sửa `lib/query.ts` ngoài vùng).
- CSS riêng `settings.css`, import trong `SettingsPage` (pattern giống `studio.css`).

### Kiểm thử

- **API** `apps/api/test/account.spec.ts` (8 test): 401 khi chưa đăng nhập cho cả 5 endpoint; trim + audit + validate
  tên rỗng/quá dài/khoá lạ; sai mật khẩu hiện tại 400 và mật khẩu cũ vẫn dùng được; mật khẩu mới trùng cũ 400,
  quá ngắn 422; đổi thành công giữ phiên hiện tại + phiên khác 401 + mật khẩu cũ không đăng nhập được + audit không
  chứa mật khẩu/hash; sessions không lộ token, đúng thứ tự mới nhất trước, loại phiên hết hạn; thu hồi phiên hiện
  tại 400, phiên người khác/không tồn tại 404, phiên mình 204; revoke-others giữ phiên hiện tại + audit số lượng +
  idempotent.
- **Web** `SettingsPage.test.tsx` (10 test): render 3 phần + danh sách phiên có tên truy cập; accessible
  name/description của trường; validate tên rỗng không gọi PATCH; mật khẩu ngắn/nhập lại sai không gọi API; submit
  tên/mật khẩu đúng body và có thông báo, không gọi logout; lỗi 422 gắn lỗi tại trường, 400 hiện banner; thu hồi
  phiên khác qua xác nhận trong dòng; hủy không gọi DELETE; thu hồi tất cả phiên khác.

## Lệnh đã chạy (kết quả thật)

| Lệnh (thư mục) | Kết quả |
| --- | --- |
| `pnpm install --prefer-offline --frozen-lockfile` (root) | thành công, 711 package, 48.4s |
| `pnpm --filter @annhien/contracts build` (root) | exit 0 |
| `pnpm -r typecheck` (root, lần cuối sau mọi sửa) | contracts/api/web/simulator đều `Done`, exit 0 |
| `cd apps/api && pnpm test` | **15 suites / 108 test pass**, 138.2s (gồm `account.spec` 8 test) |
| `cd apps/api && pnpm test -- auth.spec account.spec` | **2 suites / 14 test pass**, 17.2s |
| `cd apps/web && pnpm test` | **21 file / 83 test pass**, 15.8s |
| `cd apps/web && pnpm build` | exit 0, `tsc --noEmit` + `vite build` thành công |
| Preview kỹ thuật (harness tạm, đã xóa) | Chromium headless: 1280×900, 390×844, 360×740 và 390/360 với `data-text-size=large`; **tràn ngang 0px ở cả 5 trường hợp**; ảnh lưu ngoài repo (`%TEMP%/settings-preview`), không commit |

- Preview dùng harness tạm `settings-preview.html` + stub `fetch` với dữ liệu tổng hợp; đã xóa cả hai file trước commit,
  `git status` sạch trước khi commit. Đây là kiểm layout kỹ thuật, **chưa phải nghiệm thu khả dụng** của người dùng.
- Vì route chưa nối, `vite build` không sinh chunk `SettingsPage`; `tsc` vẫn kiểm toàn bộ file. Sau khi lead nối route,
  build sẽ tách chunk như các trang khác.

## Quyết định và lý do

1. **Không sửa hợp đồng**: `updateProfileSchema`, `changePasswordSchema`, `sessionSummarySchema`, `sessionListSchema`,
   `meSchema` đã đủ. Không sửa migration (bảng `sessions` có sẵn `created_at`, `expires_at`, `revoked_at`).
2. **Status 400** cho sai mật khẩu hiện tại / mật khẩu mới trùng cũ / thu hồi phiên hiện tại: dùng
   `AppError('VALIDATION_FAILED', ..., 400)` tại chỗ vì `common/app-error.ts` ngoài vùng ghi; envelope vẫn
   `{code,message,requestId}`. `code` là `VALIDATION_FAILED` (danh sách `ErrorCode` không có mã 400 riêng); client nên
   dựa vào status + message.
3. **Phiên đã thu hồi**: `GET` loại khỏi danh sách; `DELETE` lặp lại trả 204 (idempotent), không audit lặp. Phiên hết
   hạn nhưng chưa thu hồi vẫn thu hồi được (204) — vô hại và tránh lỗi đua.
4. **Giữ phiên hiện tại khi đổi mật khẩu** dựa trên `req.sessionId` (không so token trong body); transaction gồm
   update hash + thu hồi phiên khác + audit, nên nếu audit lỗi thì không đổi mật khẩu (fail-closed).
5. **Không thêm route/nav** đúng giao kèo; component export named để lead tự nối.
6. **Key phiên cục bộ** thay vì thêm vào `lib/query.ts` (ngoài vùng ghi). Nếu lead muốn tập trung, thêm
   `sessions: ['auth','me','sessions']` và thay import trong `useAccountSettings.ts`.

## Impact map (đã rà)

| Nguồn/đường gọi | Ảnh hưởng | Xử lý | Bằng chứng |
| --- | --- | --- | --- |
| `AuthService` dùng bởi register/login/logout/care | Thêm method, không đổi method cũ | Chạy full API suite | 15 suites/108 test pass |
| `AuthController` + `AuthModule` (đã import trong `AppModule`) | Endpoint mới **đã hoạt động khi merge**, không cần lead nối API | Không sửa `app.module.ts` | `account.spec` 8 test pass qua AppModule thật |
| `features/auth/api.ts` | Chỉ thêm hàm, giữ export cũ | Kiểm `LoginPage`/`RegisterPage`/`useAuth` vẫn dùng được | web typecheck + full web suite |
| `SettingsPage` | Chưa có route/nav nên chưa vào bundle | Lead nối router + AppShell | chunk chưa sinh trong build hiện tại |
| `queryKeys.me` | Đổi tên cập nhật ngay cache; không đổi `useMe` | `setQueryData` trong hook mới | web test đổi tên; không có thay đổi hành vi cũ |

## Việc lead cần nối

1. **API**: không cần nối thêm — `AuthModule` đã có trong `app.module.ts`; 5 endpoint chạy ngay sau merge.
2. **Router** (`apps/web/src/app/router.tsx`, ngoài vùng worker):

```tsx
const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
// trong children của AppShell:
{ path: 'settings', element: page(<SettingsPage />) },
```

3. **Nav** (`apps/web/src/app/AppShell.tsx`): thêm mục "Cài đặt tài khoản" → `/app/settings` (desktop + `moreItems` mobile),
   giữ pattern hiện có; kiểm lại tiêu đề/aria.
4. **Preview + chấp nhận frontend**: chạy lại 360/390/chữ lớn sau khi nối route bằng Playwright; đây là bước preview sản
   phẩm cần người dùng/lead chấp nhận (worker chỉ kiểm kỹ thuật bằng harness tạm).
5. **Tài liệu** (ngoài vùng worker): cập nhật `docs/04` mục API dự kiến và `docs/06` danh sách màn hình nếu muốn ghi
   endpoint/trang mới; sinh lại `docs/html` bằng `tools/docs/build.py` + `--check`.
6. **Tuỳ chọn**: chuyển `sessionsQueryKey` vào `lib/query.ts` khi lead sở hữu file đó.

## Rủi ro / chưa làm

- **Chưa rate-limit riêng** `POST /me/password`; hiện dựa vào phiên hợp lệ + audit. Nếu cần chống thử mật khẩu cũ
  trong phiên bị chiếm, nên thêm bộ đếm như login (char 15', 10 lần) — chưa nằm trong phạm vi.
- **Phiên không có thông tin thiết bị** (bảng `sessions` không lưu user-agent/IP), nên UI chỉ nói "Thiết bị này/khác"
  và thời gian; không hiển thị "Chrome trên Windows". Muốn có phải thêm cột + migration (ngoài vùng).
- **Đổi mật khẩu thu hồi phiên khác kể cả phiên của chính người dùng trên thiết bị khác** — đúng yêu cầu, UI có
  thông báo trước khi thu hồi.
- **Không kiểm E2E thật** vì route chưa nối; test API chạy app đầy đủ qua `createTestApp` (AppModule) và test web render
  trang với `fetch` giả.
- **Kiểm layout** bằng Chromium headless với dữ liệu tổng hợp, chưa kiểm với dữ liệu thật/người dùng thật; đã sửa một lỗi
  thật phát hiện khi preview: `flex-basis` của cột phiên áp lên chiều cao ở mobile (đã đổi `flex: 0 1 auto` trong media
  query ≤30rem).
- **Không đổi email / không xoá tài khoản**: ngoài phạm vi, UI nói rõ bản demo chưa hỗ trợ đổi email.
- **Audit 400**: envelope dùng chung `VALIDATION_FAILED` cho cả 400 và 422; nếu client cần phân biệt phải đọc status.
- Không sửa `app.module.ts`, `router.tsx`, `AppShell.tsx`, `layout.css`, `tokens.css`, README/docs/HTML, package export,
  migration, contract — đúng vùng được giao.

## Kết luận ngắn

- **Commit code:** `4cea10a805e5878169a372e07de71e51f12a6b46` (nhánh `feat-account`, không merge master).
- **Test:** API full **108/108 pass** (riêng account **8/8**); web full **83/83 pass** (riêng settings **10/10**);
  `pnpm -r typecheck` và `apps/web build` đều đạt.
- **File lead cần nối:** `apps/web/src/app/router.tsx` (lazy route `settings`) và `apps/web/src/app/AppShell.tsx` (nav);
  API không cần nối. Tài liệu/HTML và preview chấp nhận thuộc lead.
- **Điểm chưa làm:** rate-limit đổi mật khẩu, thông tin thiết bị theo phiên, E2E sau khi nối route, nghiệm thu khả dụng.
