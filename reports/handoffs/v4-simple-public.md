# Handoff — Worker v4: giao diện công khai tối giản

- Branch: `feat/v4-simple-public` (cắt từ `b778486`, **không merge**)
- Commit code: `f572ef4` — `feat(web): giao diện công khai tối giản v4`
- Phạm vi: chỉ các tệp được liệt kê trong spec. Không sửa `AppShell.tsx`, `router.tsx`,
  `layout.css`, `tokens.css`, `docs/`, `README`, `apps/api`, contracts, `package.json`.
  Không đổi API, route, quyền, dependency.

## Tệp đã đổi

| Tệp | Thay đổi |
| --- | --- |
| `apps/web/src/pages/LandingPage.tsx` | Viết lại: hero 1 màn (H1, 2 câu, CTA thật, hình trang trí thuần SVG), một section “An Nhiên làm gì” với đúng 3 thẻ, bỏ 5 section cũ |
| `apps/web/src/pages/LandingPage.test.tsx` | Viết lại assertion theo cấu trúc mới (không nới lỏng: vẫn kiểm copy, href, số thẻ, số dòng dữ liệu mô phỏng, trạng thái đã đăng nhập) |
| `apps/web/src/pages/NotFoundPage.tsx` | Chỉ rút gọn 1 câu mô tả |
| `apps/web/src/components/SiteHeader.tsx` | Logo + 1 CTA: khách → link “Đăng nhập”; đã đăng nhập → “Mở ứng dụng” |
| `apps/web/src/components/SiteFooter.tsx` | 2 dòng: tên + mô tả, một dòng “Dữ liệu mô phỏng · không thay thế cấp cứu.” |
| `apps/web/src/features/auth/AuthLayout.tsx` | Bỏ `demo-notice` dài, thay bằng một dòng `.auth-note` dùng chung; thẻ giữa màn hình |
| `apps/web/src/features/auth/LoginPage.tsx` | Intro 1 câu; `<details>` “Tài khoản trải nghiệm” chỉ 3 nút vai trò (bỏ email khỏi nút, bỏ đoạn giải thích) |
| `apps/web/src/features/auth/LoginPage.test.tsx` | Thêm 2 test: khung tối giản/1 dòng dữ liệu mô phỏng; chọn vai trò điền email+mật khẩu và không hiện email trên nút |
| `apps/web/src/features/auth/RegisterPage.tsx` | Intro 1 câu; bỏ hint “Tên của bạn, hiển thị với người thân.”; giữ hint mật khẩu ≥10 ký tự |
| `apps/web/src/features/invitations/InvitePage.tsx` | Chỉ rút gọn copy: bỏ 2 dòng lặp Hồ sơ/Người mời, câu lỗi/ thông báo ngắn, dòng cuối dùng `.auth-note` |
| `apps/web/src/styles/public-simple.css` | Điền toàn bộ CSS công khai: header, hero, 3 thẻ, footer, khung auth, nút vai trò |
| `apps/web/index.html` | Title/meta description ngắn; dòng chờ tải dùng đúng một câu mô phỏng |

## Kiểm chứng đã chạy (output thật)

Chuẩn bị: worktree mới chưa có `packages/contracts/dist` nên `typecheck`/`build` của web báo
thiếu module `@annhien/contracts`. Đã build contracts trước (không sửa nguồn contracts):

```
$ pnpm --filter @annhien/contracts build
$ tsc -p tsconfig.json
```

### Test

```
$ pnpm --filter @annhien/web test
 Test Files  33 passed (33)
      Tests  199 passed (199)
   Start at  13:23:01
   Duration  8.02s
```

Riêng hai tệp test đã sửa (verbose):

```
✓ LandingPage > một màn giới thiệu: h1, CTA thật và đúng một dòng dữ liệu mô phỏng
✓ LandingPage > chỉ còn section "An Nhiên làm gì" với đúng 3 thẻ một câu
✓ LandingPage > đã đăng nhập thì CTA chính mở ứng dụng, không còn CTA tạo tài khoản
✓ LoginPage > giữ khung tối giản: một câu dẫn và đúng một dòng dữ liệu mô phỏng
✓ LoginPage > chọn vai trò ở “Tài khoản trải nghiệm” thì điền email/mật khẩu, nút không hiện email
Test Files  2 passed (2)
     Tests  9 passed (9)
```

### Typecheck

```
$ pnpm --filter @annhien/web typecheck
$ tsc -p tsconfig.json --noEmit
```

Không có lỗi (exit 0, không in gì thêm).

### Build

```
$ pnpm --filter @annhien/web build
$ tsc -p tsconfig.json --noEmit
vite v8.3.8 building for production...
dist/assets/index-Cf35e8n6.js  265.20 kB │ gzip: 81.54 kB
✓ built in 242ms
```

## Ảnh đã chụp và số đo tràn ngang

Dev chạy cổng riêng (không dùng 5173; CLI ghi đè port trong `vite.config.ts`, không sửa config):

```
apps/web$ ./node_modules/.bin/vite --port 4310 --strictPort
```

Chụp bằng Playwright 1.65.1 (Chromium), mỗi ảnh đo
`document.documentElement.scrollWidth - clientWidth` và quét mọi phần tử vượt viewport.
Dev đã tắt sau khi chụp; API 3000 không bị đụng tới.

Ảnh lưu ngoài repo (không commit, vì `reports/` chỉ nhận handoff):
`C:/Users/nguye/orca/workspaces/DATN/.artifacts/v4-simple-public/`

| Ảnh | Viewport | Tràn ngang (px) | Phần tử vượt viewport | Đáy CTA chính | `h1` |
| --- | --- | --- | --- | --- | --- |
| `landing-1280x900.png` | 1280×900 | 0 | 0 | 471 / 900 | 1 |
| `landing-390x844.png` | 390×844 | 0 | 0 | 394 / 844 | 1 |
| `landing-360x740.png` | 360×740 | 0 | 0 | 385 / 740 | 1 |
| `login-1280x900.png` | 1280×900 | 0 | 0 | 573 / 900 | 1 |
| `login-390x844.png` | 390×844 | 0 | 0 | 542 / 844 | 1 |
| `login-360x740.png` | 360×740 | 0 | 0 | 490 / 740 | 1 |
| `register-390x844.png` | 390×844 | 0 | 0 | 709 / 844 | 1 |
| `landing-large-text-390x844.png` | 390×844, `html[data-text-size=large]` | 0 | 0 | 543 / 844 | 1 |

“Đáy CTA chính” là đáy nút submit (form auth) hoặc nút hero, đo bằng `getBoundingClientRect`;
tất cả nằm trong màn đầu. Số đo máy đọc ở `measure.json` cùng thư mục.

Ảnh bổ sung để kiểm tra (cùng thư mục, cùng phép đo tràn = 0):

- `landing-full-1280x900.png`, `landing-full-390x844.png` — toàn trang, kiểm footer 2 dòng.
- `login-open-390x844.png`, `login-open-360x740.png` — `<details>` mở: 3 nút cao 47px, rộng đều,
  không hiện email; text “Dữ liệu mô phỏng · không thay thế cấp cứu.” có đúng 1 lần.
- `notfound-390x844.png` — 404 ngắn, tràn ngang 0.

## Quyết định khi spec có chỗ trùng

- **Dòng “Dữ liệu mô phỏng · không thay thế cấp cứu.”** spec đặt ở cả hero và footer, nhưng
  nguyên tắc 1 cấm lặp giữa hero/section/footer và nguyên tắc 3 nói “đúng một dòng … ở
  footer/khung đăng nhập”. Đã giữ **đúng một lần mỗi màn**: landing → footer; `/login`,
  `/register`, `/invite` → `.auth-note` cuối khung. Hero không lặp lại câu này.
- **Header khi chưa đăng nhập** chỉ còn link “Đăng nhập”; “Tạo tài khoản” là CTA chính trong hero
  nên không lặp ở header. Khi đã đăng nhập header hiện “Mở ứng dụng”.
- **AuthLayout** vẫn giữ các lớp `.auth-header/.auth-main/.auth-card` để `/invite` và 404 dùng
  chung một khung; chỉ thay phần notice dài bằng `.auth-note`.
- **InvitePage** bỏ hai dòng “Hồ sơ/Người mời” vì đã nằm trong câu dẫn ngay trên — chỉ rút gọn
  copy, không đổi luồng gọi API.
- **`index.html`**: ngoài title/meta, dòng “đang tải” cũng được rút còn một câu mô phỏng cho khớp
  quy tắc copy.

## Truy cập

- Skip link giữ ở mọi trang công khai; `h1` duy nhất mỗi màn (đo bằng DOM: 1 ở cả 8 ảnh).
- Input có label thật (`TextField`), focus ring 3px từ `base.css` (Tab đầu tiên vào skip link có
  `outline: 3px solid`).
- Nút ≥44px: hero/ form 48px; link “Đăng nhập” ở header, summary và nút vai trò 46–47px.
- Ảnh minh hoạ và icon đều `aria-hidden`; danh sách 3 thẻ có `role="list"`.

## Điều chưa làm

1. **E2E chưa cập nhật (ngoài phạm vi cho phép):** `apps/web/e2e/smoke.spec.ts:12` còn
   `getByRole('link', { name: 'Mở trợ lý' })` — nút này đã đổi thành “Tạo tài khoản”/“Mở ứng dụng”.
   `pnpm --filter @annhien/web test:e2e` sẽ fail ở assertion đó cho tới khi lead sửa e2e.
   Không chạy e2e trong lượt này (cần dev server + API theo docs/14 và tệp e2e không thuộc phạm vi).
2. Không chụp `/invite/:token` vì cần token thật; trang này chỉ được rút gọn copy và dùng chung
   khung auth, chưa kiểm bằng mắt với dữ liệu thật (không sửa DB, không seed).
3. Không cập nhật `docs/` (ngoài phạm vi). Đã rà nhanh: `docs/06` không nhắc tên các section cũ
   (“Vì sao An Nhiên?”, “Ranh giới an toàn”, …) nên không phát hiện chỗ lệch trực tiếp.
4. Không merge, không tạo preview/duyệt trước (theo yêu cầu); branch chỉ nằm cục bộ.
