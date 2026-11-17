# Handoff — v6 public: bỏ tên “An Nhiên”

- **Ngày:** 2026-11-15 19:50 +07 (Asia/Ho_Chi_Minh)
- **Branch:** `v6-public`, cắt từ master `08fd3b5`; **không merge**.
- **Commit code:** `3b1e381` — `fix(web-public): bỏ tên "An Nhiên", dùng tên trung tính "Theo dõi sức khỏe"`. Commit handoff theo sau.
- **Phạm vi gốc:** `SiteHeader.tsx`, `SiteFooter.tsx`, `pages/LandingPage.tsx` + test, `features/auth/LoginPage.tsx`/`RegisterPage.tsx` + test, `public-simple.css`, `apps/web/index.html`. Không đổi API/route/quyền/seed/credentials.
- **Ngoại lệ đã được coordinator chốt trong task này:** cho phép sửa `features/auth/AuthLayout.tsx`, `features/invitations/InvitePage.tsx`, `features/share/SharePage.tsx` và mọi chuỗi UI công khai còn tên cũ — vì brand ở `/login`, `/register` do `AuthLayout` render và trang lời mời có header riêng. Package name `@annhien/*` giữ nguyên.

## Đã làm

| Vị trí | Trước | Sau |
| --- | --- | --- |
| `SiteHeader.tsx` (mọi trang công khai) | An Nhiên | `Theo dõi sức khỏe` (link `/`) |
| `SiteFooter.tsx` | **An Nhiên** — theo dõi người thân từ xa. | **Theo dõi sức khỏe** — người thân từ xa. |
| `LandingPage.tsx` hero lead | “An Nhiên ghi nhịp tim…” | “Theo dõi sức khỏe người thân từ xa: nhịp tim và vận động từ thiết bị đeo, báo bạn khi có bất thường. Trợ lý AI trả lời câu hỏi về số liệu của người thân.” |
| `LandingPage.tsx` tiêu đề section | “An Nhiên làm gì” | “Theo dõi sức khỏe làm gì” |
| `RegisterPage.tsx` câu dẫn | “Theo dõi người thân cùng An Nhiên.” | “Theo dõi sức khỏe người thân cùng trợ lý AI.” |
| `AuthLayout.tsx` (login/register) | An Nhiên | `Theo dõi sức khỏe` |
| `InvitePage.tsx` header | An Nhiên | `Theo dõi sức khỏe` |
| `SharePage.tsx` hint email | “…đăng ký tài khoản An Nhiên với email này…” | “…đăng ký tài khoản với email này…” |
| `index.html` title | “An Nhiên — theo dõi người thân và trợ lý AI” | “Theo dõi sức khỏe — người thân và trợ lý AI” |
| `index.html` meta description | “An Nhiên theo dõi nhịp tim…” | “Theo dõi sức khỏe người thân từ xa: nhịp tim và vận động…” (giữ nguyên phần dữ liệu mô phỏng/không thay thế cấp cứu) |
| `index.html` khung tải tĩnh | An Nhiên | `Theo dõi sức khỏe` |

- 404 công khai (`NotFoundPage`) dùng chung `SiteHeader`/`SiteFooter` nên đã sạch tên, không phải sửa thêm.
- Giữ nguyên bố cục: hero + 3 thẻ + dòng an toàn; login/register một thẻ, một dòng dữ liệu mô phỏng. Không thêm khối, không đổi CSS vì tên mới vẫn vừa một dòng (đo bên dưới). `public-simple.css` không cần sửa.
- Không còn “An Nhiên” trong text/aria/title người dùng thấy của web công khai. Còn lại ngoài phạm vi: `app/AppShell.tsx` (worker `v6-shell`), comment đầu 3 tệp CSS `base/layout/tokens` (không render), tên package `@annhien/*`, README/tài liệu.

## Test đã cập nhật (không nới test khác)

| Tệp | Thay đổi |
| --- | --- |
| `pages/LandingPage.test.tsx` | Bỏ `getAllByText('An Nhiên')`; khẳng định không còn chuỗi này trong nội dung, header có đúng link tên trung tính; cập nhật heading section; đổi kiểm “Vì sao An Nhiên?” thành không có heading nào chứa “An Nhiên” (siết hơn). |
| `features/auth/RegisterPage.test.tsx` | Cập nhật câu dẫn mới; thêm `queryByText(/An Nhiên/)` phải null. |
| `features/invitations/InvitePage.test.tsx` | Thêm kiểm header tên trung tính + không còn chuỗi cũ. |
| `e2e/smoke.spec.ts` | Đổi assertion tên hiển thị sang `Theo dõi sức khỏe`; giữ nguyên các kiểm CTA/dòng an toàn/tràn ngang. |

Tổng số test không đổi (250) — chỉ sửa/thêm assertion, không bỏ test.

## Kiểm chứng đã chạy (output thật)

```text
$ pnpm --filter @annhien/web test
 Test Files  35 passed (35)
      Tests  250 passed (250)
   Duration  20.56s
(exit 0)

$ pnpm --filter @annhien/web typecheck
$ tsc -p tsconfig.json --noEmit
(exit 0, không in thêm)

$ pnpm --filter @annhien/web build
✓ built in 393ms
dist/assets/index-DvvAfFzN.js  266.95 kB │ gzip: 82.20 kB
(exit 0)
```

E2E smoke chạy riêng trên dev server của nhánh (`vite --port 4321 --strictPort`, mock `/me` 401; **không** dùng server 5173 đang bận của worktree khác):

```text
Running 18 tests using 1 worker
ok landing hiển thị tên sản phẩm, trợ lý AI và dữ liệu mô phỏng trong màn đầu
ok điều hướng tới trang đăng nhập từ landing
ok landing 390×844, register 390×844/360×740 chữ lớn, 7 viewport landing chữ lớn, 320×640 thường
ok /me chậm hoặc lỗi (pending + 500), focus lỗi API đăng nhập, 404
18 passed (10.2s)
(exit 0)
```

Đo giao diện (Chromium headless; ảnh trong `C:/Users/nguye/orca/workspaces/DATN/.artifacts/v6-public/`):

| Màn | Viewport | CTA bottom | Dòng an toàn bottom | Tràn ngang | Tên hiển thị |
| --- | --- | --- | --- | --- | --- |
| Landing | 1280×900 | 436 | 492 | 0 | `Theo dõi sức khỏe` |
| Landing | 390×844 | 405 | 549 | 0 | `Theo dõi sức khỏe` |
| Landing | 320×640 | 465 | 633 | 0 | `Theo dõi sức khỏe` |
| Login | 390×844 | — | — | 0 | `Theo dõi sức khỏe` (rộng 209 px, không tràn) |
| Register | 390×844 | — | — | 0 | `Theo dõi sức khỏe` |
| 404 | 390×844 | — | — | 0 | `Theo dõi sức khỏe` |

- CTA và dòng an toàn nằm trong màn đầu ở cả 1280, 390, 320; dòng an toàn nằm sau CTA.
- `document.title` = `Theo dõi sức khỏe — người thân và trợ lý AI`; `body.innerText` không chứa “An Nhiên” ở cả 6 lần đo.
- Ảnh: `landing-1280x900.png`, `landing-390x844.png`, `landing-320x640.png`, `login-390x844.png`, `register-390x844.png`, `notfound-390x844.png`; số đo `verify-result.json`; log e2e `e2e-smoke.txt`.

## Chưa làm / giới hạn

- **Không merge**, không sửa spec/handoff lịch sử, không đổi API/seed/credentials/CSS.
- `app/AppShell.tsx` vẫn còn “An Nhiên” ở sidebar/mobile brand — thuộc worker `v6-shell` theo spec `v6-shell.md`; chưa sửa để tránh đụng file của worker khác. Vì vậy bundle ứng dụng vẫn còn chuỗi này cho tới khi nhánh shell vào.
- Comment đầu `styles/base.css`, `styles/layout.css`, `styles/tokens.css` còn tên cũ (comment, không render); ngoài phạm vi file và có thể trùng nhánh shell.
- Chỉ đo Chromium/Playwright headless; chưa kiểm Firefox/WebKit, thiết bị thật, zoom 200%.
- `git commit` in cảnh báo `failed to delete .../.git/worktrees/annhien-perf-before: Permission denied` khi dọn worktree cũ; commit vẫn tạo đúng (`3b1e381`), cây làm việc sạch. Không xử lý tiếp vì ngoài phạm vi task.
