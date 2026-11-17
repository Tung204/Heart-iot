# Handoff — v7 W2 lane P: công khai, đăng nhập, lời mời

**Task** `task_74c38a3a346b` · **Dispatch** `ctx_0b97702c8edb` · **Worker**
`term_10cedc0f-f5f6-4011-85ed-9d4ab968faa0` · **Coordinator**
`term_3f23340f-5395-401c-a4e2-f39372767efd`

- **Worktree**: `C:/Users/nguye/orca/workspaces/DATN/v7-p`
- **Branch**: `Tung204/v7-p` (chưa merge, chưa push)
- **Base**: `cf11c291e67151a36e5f84b8d88a2915ed50b1c6` — W1 foundation
  (`feat(web): nền tảng giao diện v7 — token, primitive, shell, CSS graph`)
- **Provider/model**: `moxuna / deepseek-v4.1-flash`
- **Môi trường đo**: web dev `http://127.0.0.1:4351`; API dev `http://127.0.0.1:3010`
  (`WEB_ORIGIN=http://127.0.0.1:4351`, `PGLITE_DATA_DIR=.data/qa-v7-p`, seed demo).
  Invite thật do owner tạo trên DB cục bộ: token 43 ký tự, email
  `nguoi-moi@example.com`, pending, hết hạn 2026-11-20. Không dùng credential
  trong UI/ảnh; không commit cookie/token.

## 1. Đã làm

### Landing `/` (`src/pages/LandingPage.tsx`, `src/styles/public.css`)
- H1 **Theo dõi sức khỏe người thân**; một câu đúng spec: “Xem dữ liệu thiết bị,
  xử lý cảnh báo và hỏi trợ lý AI.” Không “vẫn an tâm”, không hứa y khoa/AI.
- Hero 7/5 desktop: CTA **Tạo tài khoản** (primary) + **Đăng nhập** (secondary);
  signed-in chỉ **Mở ứng dụng**; pending chỉ `role=status aria-busy` không CTA;
  lỗi `/me` 5xx/network không suy ra logout: khối `.landing-session` riêng có
  Đăng nhập/Tạo tài khoản + **Thử lại**, hero không có CTA khách.
- Giữ nguyên `HERO_SAFETY_NOTE` (đủ 4 ý: dữ liệu mô phỏng; cảnh báo chỉ khi web
  kết nối; không tự gọi cấp cứu; không thay thế cấp cứu), không ẩn bằng CSS.
- Cột phải là sơ đồ chữ/vector 3 bước Thiết bị → Dữ liệu · Cảnh báo → Người hỗ
  trợ · Trợ lý AI (không ảnh stock/số giả). Dưới hero là **ba hàng thông tin**
  Theo dõi / Cảnh báo / Trợ lý AI, icon nét mảnh, không ba card.
- Không tự điền tài khoản demo; không thêm số liệu/credentials.

### Đăng nhập / đăng ký (`features/auth/*`, `src/styles/auth.css`)
- `AuthLayout` mới: topbar brand 44px + 4px padding block (52px mobile/desktop),
  cột form trắng canh trên max 32rem, dải phụ xanh nhạt bên phải max 28rem
  (≤40% desktop, chỉ một câu quyền/cảnh báo), mobile bỏ dải phụ. Bỏ thẻ nổi
  giữa nền kem; một dòng nguồn/giới hạn duy nhất cuối cột.
- Login: `loginSchema` + `fieldErrorMap`, focus field lỗi đầu tiên, lỗi server
  focus hộp lỗi; lỗi 401 sai thông tin ≠ lỗi mạng; **khoá ref chặn submit hai
  lần ngay trong cùng nhịp** (trước khi nút kịp disabled).
- Register: giữ đủ tên/email/mật khẩu/nhập lại, autocomplete, validation
  contract, focus first error, kiểm tra nhập lại; nhãn **Tên của bạn**; chuẩn
  hoá copy lỗi dùng chung “tên hiển thị” → “tên của bạn”; cùng khoá chống
  submit đôi.
- `next` nội bộ giữ xuyên login ↔ register (thêm `withNext`, `/app` là mặc định
  nên bỏ query); `useSafeNext` và `lib/next.ts` **không sửa**. Loader toàn trang
  khi `/me` pending (không nháy form/CTA, không vỡ test ProtectedRoute).
- Không thêm quên mật khẩu/social/checkbox pháp lý.

### Lời mời `/invite/:token` (`features/invitations/InvitePage.tsx`)
- GET preview trước, chỉ POST accept khi bấm; preview nêu người mời, người được
  theo dõi, vai trò **Người thân**, 5 quyền dạng label/value + hạn, rồi mới CTA.
- **400/422/VALIDATION_FAILED = lỗi dữ liệu link**: H1 “Lời mời không hợp lệ”,
  copy kiểm tra/thiếu ký tự/xin gửi lại + Về trang chủ, **không có Thử lại**
  (đóng v6 F01). 404 = không tồn tại/hết hạn/đã dùng, cùng đường về.
- 5xx/mạng = “Không kiểm tra được lời mời” + **Thử lại**; 401 `/me` là khách
  bình thường → **Đăng nhập để tiếp tục** giữ `next=/invite/<token>` và link
  đăng ký cũng giữ `next`.
- `canViewMeasurements=false` → “Không được xem số đo và lịch sử”, không suy ra
  “xem N ngày” từ `historyDays`; các quyền cảnh báo/hỗ trợ/đóng/AI đúng contract.
- Không render email người nhận/token thô/số đo/contacts. Accept lỗi 403/404/409
  giữ nguyên preview + thông điệp API; accept thành công → **Đã tham gia** +
  **Mở ứng dụng** (không hứa push). `key={token}` reset lỗi/khoá accept khi đổi
  link lời mời.

### 404 công khai (`src/pages/NotFoundPage.tsx`)
- Layout phẳng, nhãn phụ **Lỗi 404**, H1 **Không tìm thấy trang**, copy đường dẫn
  không tồn tại/đã chuyển + kiểm link lời mời đủ ký tự, **Về trang chủ**, một
  dòng dữ liệu mô phỏng. Không reuse auth-card. `/app/*` 404 (`AppNotFoundPage`)
  và route của F không đụng.

### CSS / phạm vi
- File mới `src/styles/public.css`, `src/styles/auth.css`; **import trực tiếp**
  trong `LandingPage`, `NotFoundPage`, `AuthLayout`, `InvitePage` (không sửa
  `main.tsx`/CSS graph của F). Khi F retire `public-simple.css`/legacy auth
  trong `layout.css`, các rule này vẫn nằm sau và thắng theo thứ tự bundle.
- `SiteHeader`/`SiteFooter` không sửa file; chỉ restyle bằng selector trong
  `public.css`. Không sửa `components/*`, `tokens/base/shell/primitives.css`,
  `app/*`, `lib/*`, `test/utils.tsx`; không đổi API/route/dependency.
- Breakpoint 900px, 768px; large-text dùng root 125%, nén khoảng cách nhưng
  không hạ target/chữ; tôn trọng reduced-motion của base.

## 2. Cổng kiểm — kết quả thật (cây cuối)

```text
$ pnpm --filter @heart-iot/web typecheck
tsc -p tsconfig.json --noEmit                         # exit 0

$ pnpm --filter @heart-iot/web exec vitest run \
    src/pages/LandingPage.test.tsx src/pages/NotFoundPage.test.tsx \
    src/features/auth/LoginPage.test.tsx src/features/auth/RegisterPage.test.tsx \
    src/features/invitations/InvitePage.test.tsx \
    --no-file-parallelism --maxWorkers=1
Test Files  5 passed (5)
     Tests  33 passed (33)

$ pnpm --filter @heart-iot/web exec vitest run --no-file-parallelism --maxWorkers=1
Test Files  38 passed (38)
     Tests  307 passed (307)

$ pnpm --filter @heart-iot/web build
✓ built in 298ms                                     # exit 0
```

- Baseline W1: 37 file / 291 test → **+1 file, +16 test** (Login 7→11,
  Register 2→6, Invite 3→10, Landing 5 giữ nguyên nội dung mới, NotFound 1 mới).
- `pnpm build:contracts` phải chạy một lần trong worktree mới trước typecheck
  (contracts `dist` chưa có); sau đó typecheck sạch.
- `grep` bundle production: không có email demo/mật khẩu demo; CSS public/auth
  nằm trong bundle index; không có `!important`.

## 3. Bằng chứng giao diện

Thư mục: `reports/qa/evidence/v7-p/`

### Matrix 6 route × 5 viewport — `measure-public.mjs`, `metrics.json`
`/`, `/login`, `/register`, `/invite/<token thật>`, `/invite/abc1234567` (422),
`/khong-ton-tai` × (1280×900, 390×844, 360×740, 390×844 chữ lớn, 360×740 chữ
lớn), DPR 1/2. Kết quả **30/30**:

- `h1Count = 1` mọi dòng; `overflowX = 0`, `bodyOverflowX = 0`.
- CTA chính nằm trọn màn đầu; CTA thấp nhất `bottom = 759` (390×844 chữ lớn,
  vẫn < 844); 360×740 chữ lớn thấp nhất 719 < 740.
- `smallTargets = 0` (mọi `a/button` không disabled ≥44×44); skip link 44px.
- 422 ghi nhận `GET /api/v1/invitations/abc1234567 → 422`, body hiển thị
  “Lời mời không hợp lệ” + hướng dẫn định dạng, **không có “Thử lại”**.
- Invite body không chứa `@`/token thô; login/register không có autofill demo.
- `pageErrors = 0`; console chỉ có 401 `/me` dự kiến của khách.

Tên ảnh: `<route>-<viewport>-<state>.png` (vd.
`landing-360x740-large-guest.png`, `invite-invalid-390x844-token-422.png`).

### Trạng thái bổ sung — `measure-states.mjs`, `states.json`
- Landing signed-in: chỉ **Mở ứng dụng**, không CTA khách.
- Landing lỗi phiên 5xx: `.landing-session` có Đăng nhập/Tạo tài khoản/Thử lại,
  `.landing-hero__actions` rỗng.
- Landing pending: `role=status aria-busy`, không CTA.
- Login field errors: focus `login-email`, lỗi cạnh field, nút vẫn thấy.
- Register 360×740 chữ lớn field errors: focus `register-name`, submit vẫn trong
  màn đầu.
- Ảnh: `landing-1280x900-signed-in.png`, `landing-390x844-session-error.png`,
  `landing-390x844-pending.png`, `login-390x844-field-errors.png`,
  `register-360x740-large-field-errors.png`.
- Desktop 1280: dải phụ auth hiện; mobile (390/360) ẩn hoàn toàn
  (`asideVisible=false`).

### E2E hiện trạng (không sửa — ngoài danh sách file lane)
Chạy 12 test landing/404 đã chọn (`playwright test e2e/smoke.spec.ts` với
`--grep "landing|Landing|404|điều hướng"`): **11 pass, 1 fail** tại assertion H1
cũ. Các test 320×640, 320×640 chữ lớn, 360/375/390 nhiều chiều cao **đều pass**
(note vẫn trong màn đầu, không tràn). Các assertion còn lại sẽ fail tiếp sau khi
sửa H1: title cũ, copy trợ lý AI cũ, selector `.hero__session`/`.hero__actions`
cũ. Patch đề xuất cho lead (file `apps/web/e2e/smoke.spec.ts`, ngoài phạm vi được
ghi):

```diff
-    page.getByRole('heading', { level: 1, name: /Người thân ở nhà/ }),
+    page.getByRole('heading', { level: 1, name: 'Theo dõi sức khỏe người thân' }),
-  await expect(page).toHaveTitle(/trợ lý AI/i);
+  await expect(page).toHaveTitle('Theo dõi sức khỏe');
-    page.getByText('Trợ lý AI trả lời câu hỏi về số liệu của người thân.'),
+    page.getByText('Hỏi trợ lý AI về số liệu của người thân.'),
-    const loading = page.locator('.hero__session[aria-busy="true"]');
+    const loading = page.locator('.landing-session[role="status"][aria-busy="true"]');
-    await expect(page.locator('.hero__session').getByRole('button', { name: 'Thử lại' })).toBeVisible();
-    await expect(page.locator('.hero__actions a')).toHaveCount(0);
+    await expect(page.locator('.landing-session').getByRole('button', { name: 'Thử lại' })).toBeVisible();
+    await expect(page.locator('.landing-hero__actions a')).toHaveCount(0);
```

## 4. Test/locator diff (unit) cho lead

| Cũ | Mới |
| --- | --- |
| Landing H1 `/Người thân ở nhà/` | **Theo dõi sức khỏe người thân** |
| `.hero__*` | `.landing-hero__*`; trạng thái phiên `.landing-session*` |
| Auth `.auth-card*`, `.auth-main`, `.auth-footer`, `.auth-note` | `.auth-panel*`, `.auth-body`, `.auth-switch`, `.auth-footnote` |
| Register label “Tên hiển thị” | **Tên của bạn** |
| Invite quyền đóng “Đóng cảnh báo” | **Có thể đóng cảnh báo** (tránh lặp dt/dd) |
| Invite context là dt/dd | Câu intro + bảng quyền; token/email không render |
| Auth loader trong layout | Loader toàn trang khi `/me` pending |

Test unit đã cập nhật theo các thay đổi này; không nới/bỏ assertion hợp lệ.
Không đổi `useSafeNext`, API contract, route hay dependency.

## 5. Ghi chú / giới hạn

- **E2E smoke chưa được sửa** vì file không thuộc danh sách lane P; đã nêu
  patch chính xác ở §3. Nếu lead muốn, chỉ cần áp 5 cụm thay đổi trên.
- Trạng thái lỗi token (400/422/404) dùng H1 **Lời mời không hợp lệ** thay vì
  giữ H1 “Lời mời theo dõi” + alert. Vẫn một H1/trang, copy yêu cầu đủ; nếu
  design muốn H1 cố định, đổi 2 chỗ trong `InvitePage` và test tương ứng.
- `useSafeNext` chỉ chặn `//` và yêu cầu bắt đầu `/`; edge `/\host` vẫn nằm ở
  `lib/next.ts` (F sở hữu). Không sửa trong lane này; nếu lead muốn harden thì
  xử lý ở lib + test chung.
- Measurement dùng Chromium/Playwright, dev server + DB PGlite cục bộ; không
  phải đo production build hay API thật. Các số 30/30, 33 test, 307 test là
  output thật của cây cuối, không phải ước lượng.
- Chưa chạy E2E full vì các test đăng ký/đăng nhập có thể ghi vào API 3000 của
  lane khác; chỉ chạy nhóm landing/404 (không ghi dữ liệu) như trên.
