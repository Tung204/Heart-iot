# Handoff — Fix vòng 2 giao diện công khai v4

- **Ngày:** 2026-11-15 17:55 +07 (Asia/Ho_Chi_Minh)
- **Branch:** `fix-v4-public-2`, cắt từ `fix-v4-public` (`71a86ba`); **không merge**.
- **Commit code:** `496f6e6` — sửa R-01..R-05; commit tài liệu/handoff theo sau.
- **Báo cáo nguồn:** `reports/qa/v4-rereview-public.md` (có trên nhánh review `review/v4-rereview-public-dd1fbd5`; không chép vào nhánh này).
- **Phạm vi:** chỉ web công khai + test + CSS public + E2E smoke. Không đổi API/route/quyền, không thêm dependency, không đụng DB/seed, không sửa `AppShell.tsx`/`router.tsx`/`layout.css`/`tokens.css`.
- **Quyết định cũ giữ nguyên:** khối “Tài khoản trải nghiệm” (P1-5) **đã bị xóa** khỏi UI và bundle; trang đăng nhập bắt đầu trống. Handoff lịch sử `v4-simple-public.md`/`v4-fix-public.md` không bị sửa.

## Đã sửa theo từng mục re-review

### R-02 — dòng an toàn đủ nghĩa

- `/` dùng đúng một khối chữ dưới CTA:
  `Dữ liệu mô phỏng · cảnh báo chỉ hiện khi web đang kết nối · không tự gọi cấp cứu · không thay thế cấp cứu.`
- Không còn chuỗi rút gọn `cảnh báo chỉ hiện khi web mở`; vẫn giữ `không thay thế cấp cứu` (khớp meta description và disclaimer ở login/register/lời mời/404).
- Khối chữ xuống dòng tự nhiên (3 dòng ở cỡ thường, 4 dòng ở chữ lớn trên mobile); không ẩn, không cắt, không bỏ ý.
- Test đơn vị và E2E đều khẳng định **cả** `đang kết nối` **và** `không thay thế cấp cứu`; bỏ assertion cấm dòng disclaimer cũ (R-15).

### R-01 — chữ lớn trên màn thấp

- Thêm media query `@media (max-height: 800px)` + `html[data-text-size='large']` trong `public-simple.css`: giảm padding-block hero, gap hero/copy/actions, line-height title/lead/note, min-height nút trong hero, và bỏ margin âm của dòng an toàn. **Không ẩn chữ, không giảm font-size của chế độ chữ lớn.**
- Số đo Chromium (mock `/me` 401, ảnh ngoài repo):

| Viewport | Cỡ chữ | CTA bottom | Dòng an toàn bottom | Ghi chú |
| --- | --- | --- | --- | --- |
| 375×667 | chữ lớn | 460,1 | **569,6** | trong màn (667) |
| 390×667 | chữ lớn | 460,1 | **569,6** | trong màn |
| 360×640 | chữ lớn | 477,8 | **587,3** | trong màn |
| 360×740 | chữ lớn | 477,8 | **587,3** | trong màn |
| 390×700 | chữ lớn | 460,1 | **569,6** | trong màn |
| 390×844 | chữ lớn | 596,0 | **718,5** | trong màn (không cần compact) |
| 320×640 | chữ lớn | 477,8 | **587,3** | trong màn |
| 320×640 | thường | 499,4 | **603,5** | trong màn |
| 1280×720 | chữ lớn | 389,2 | **449,9** | trong màn |

- `scrollWidth − clientWidth = 0` ở mọi viewport trên; không phần tử nào tràn ngang.
- E2E smoke mới đo chính các tổ hợp này (7 viewport chữ lớn + 320×640 thường).

### R-03/R-04 — `/me` đang tải và 500

- **Đang tải:** hero chỉ hiện `role=status`, `aria-busy="true"`, spinner + `Đang kiểm tra phiên đăng nhập…`; `.hero__actions` rỗng — CTA không nhấp nháy, không render CTA khách.
- **Lỗi máy chủ:** hiện `Không kiểm tra được phiên đăng nhập.` + **cả** `Đăng nhập` (`/login`) và `Tạo tài khoản` (`/register`) + nút `Thử lại` gọi `me.refetch()` (đổi chữ thành `Đang thử lại…` khi đang gọi). Các link nằm trong `.hero__session`, không nằm trong `.hero__actions` → không giả làm khách.
- Nếu bộ đệm đã có người dùng (refetch nền lỗi) thì chỉ hiện thông báo + `Thử lại`, không mời đăng nhập/đăng ký lại.
- Test đơn vị: pending (aria-busy, không CTA, resolve 401 → CTA), 500 (đủ 3 hành động, thử lại → 401 → trạng thái khách). E2E thêm 2 test tương ứng.

### R-05 — focus khi lỗi API đăng nhập

- Hook mới `useFocusErrorAlert` (cùng tệp `useFocusFirstError.ts`) focus vào hộp lỗi khi có lỗi máy chủ và không có lỗi field; login và register đều dùng.
- `role=alert` giữ nguyên; lỗi field vẫn ưu tiên focus field lỗi đầu tiên.
- Đo thật: `document.activeElement` = `DIV.auth-card__form-error` (chứa `[role="alert"]`), `isBody=false`. Test đơn vị và E2E đều kiểm `document.activeElement`.

### R-06 — tài liệu

- `reports/orchestration/v4-specs/v4-simple-public.md`: bỏ yêu cầu `<details>`/3 nút vai trò; ghi rõ khối trải nghiệm đã bị xóa (P1-5, fix vòng 2); cập nhật dòng an toàn 4 ý; thêm tiêu chí chữ lớn + màn thấp và các trạng thái phiên/focus.
- `README.md`: bảng tài khoản demo ghi rõ **chỉ dùng khi chạy seed local, không hiện trong UI**; gõ tay ở trang đăng nhập; chuỗi credential không có trong bundle web.
- `docs/html/index.html` sinh lại từ nguồn (README là nguồn của chương “Cấu trúc”); `python tools/docs/build.py --check` báo khớp nguồn.
- Không sửa handoff lịch sử; quyết định bỏ khối trải nghiệm được ghi trong handoff này và trong spec.

## Test đã thêm/siết

| Tệp | Thay đổi |
| --- | --- |
| `apps/web/src/pages/LandingPage.test.tsx` | Dòng an toàn đủ 4 ý (kiểm `đang kết nối`, `không thay thế cấp cứu`, không còn câu “web mở”); pending có `aria-busy`/spinner/không CTA; 500 có đủ `Đăng nhập` + `Tạo tài khoản` + `Thử lại`, không nằm trong `.hero__actions`, thử lại → 401 → khách; bỏ assertion cấm disclaimer cũ |
| `apps/web/src/features/auth/LoginPage.test.tsx` | Thêm test lỗi API 401: `role=alert`, `document.activeElement` là hộp lỗi, không phải BODY |
| `apps/web/e2e/smoke.spec.ts` | Dòng an toàn mới; 7 viewport chữ lớn (375×667, 390×667, 360×640, 360×740, 390×700, 390×844, 320×640) đo CTA + note trong màn đầu và tràn ngang; 320×640 cỡ thường; `/me` pending + 500 (thử lại); focus lỗi API login; 404 (R-13) |

## Tệp đã đổi

| Tệp | Thay đổi |
| --- | --- |
| `apps/web/src/pages/LandingPage.tsx` | `HERO_SAFETY_NOTE` 4 ý; trạng thái pending (spinner + aria-busy); lỗi phiên có 2 đường vào + `Thử lại`; guard theo user trong bộ đệm |
| `apps/web/src/pages/LandingPage.test.tsx` | Test mới/siết theo R-01, R-02, R-03, R-04, R-15 |
| `apps/web/src/features/auth/LoginPage.tsx` | Focus hộp lỗi máy chủ; wrapper `tabIndex=-1` |
| `apps/web/src/features/auth/RegisterPage.tsx` | Cùng cách focus hộp lỗi máy chủ |
| `apps/web/src/features/auth/LoginPage.test.tsx` | Test focus lỗi API |
| `apps/web/src/features/auth/useFocusFirstError.ts` | Thêm hook `useFocusErrorAlert` |
| `apps/web/src/styles/public-simple.css` | Style trạng thái phiên/spinner; media query chữ lớn + max-height 800px; nút khôi phục gọn hơn |
| `apps/web/e2e/smoke.spec.ts` | 12 test mới (7 viewport + 320 thường + pending + 500 + focus + 404) và dòng an toàn mới |
| `reports/orchestration/v4-specs/v4-simple-public.md` | Cập nhật quyết định bỏ khối trải nghiệm, dòng an toàn, tiêu chí viewport/trạng thái |
| `README.md` | Ghi chú credential chỉ dùng seed local, không hiện trong UI |
| `docs/html/index.html` | Sinh lại từ nguồn (README thay đổi) |
| `reports/handoffs/v4-fix-public-2.md` | Handoff này |

## Kiểm chứng đã chạy (output thật)

Chuẩn bị: `pnpm install --frozen-lockfile --offline` (711 package), `pnpm --filter @annhien/contracts build`.

```text
$ pnpm --filter @annhien/web test
 Test Files  35 passed (35)
      Tests  207 passed (207)
   Duration  16.62s
(exit 0)

$ pnpm --filter @annhien/web typecheck
$ tsc -p tsconfig.json --noEmit
(exit 0, không in thêm)

$ pnpm --filter @annhien/web build
$ tsc -p tsconfig.json --noEmit && vite build
dist/assets/index-BPedMrIU.js  266.58 kB │ gzip: 81.78 kB
✓ built in 386ms
(exit 0)
```

So với baseline nhánh `fix-v4-public`: 206 → **207 test** (thêm test focus lỗi API; test pending/500 được viết lại và siết hơn, không nới assertion nào).

E2E thật trên dev server riêng `vite --port 4312 --strictPort` (config Playwright tạm ngoài repo, baseURL 4312; mock `/me` 401 trong `beforeEach`):

```text
Running 26 tests using 1 worker
ok 1  landing hiển thị tên sản phẩm, trợ lý AI và dữ liệu mô phỏng trong màn đầu
ok 2  điều hướng tới trang đăng nhập từ landing
ok 3  landing 390×844 › CTA và dòng cảnh báo nằm trong màn đầu, không tràn ngang
ok 4  register 390×844 chữ lớn › nút tạo tài khoản nằm trong màn đầu, không tràn ngang
ok 5  register 360×740 chữ lớn › nút tạo tài khoản vẫn nằm trong màn đầu
ok 6  register 360×740 chữ lớn › nút tạo tài khoản nằm trong màn đầu ở cỡ thường
ok 7–13 landing {375×667, 390×667, 360×640, 360×740, 390×700, 390×844, 320×640} chữ lớn
ok 14 landing 320×640 cỡ chữ thường: dòng an toàn vẫn trong màn đầu
ok 15 /me chậm hoặc lỗi › đang kiểm phiên: chỉ báo tải có aria-busy, chưa hiện CTA khách
ok 16 /me chậm hoặc lỗi › lỗi máy chủ: giữ đăng nhập, tạo tài khoản và thử lại được
ok 17 lỗi API đăng nhập: focus vào hộp lỗi, không rơi về BODY
ok 18 404 giữ hướng dẫn link lời mời và đường về trang chủ
ok 19–26 alerts/assistant/history hiện có (chạy lại, không đổi)
26 passed (19.0s)
(exit 0)
```

Tài liệu:

```text
$ tools/docs/.venv/Scripts/python.exe tools/docs/build.py
Validated 339 links and 251 unique IDs; 21 sections.
Wrote docs\html\index.html (452,652 bytes).

$ tools/docs/.venv/Scripts/python.exe tools/docs/build.py --check
Validated 339 links and 251 unique IDs; 21 sections.
Generated HTML matches current sources.
(exit 0)
```

## Trạng thái phiên đo thêm (390×844, chữ lớn)

| Trạng thái | Nội dung hero | Dòng an toàn bottom |
| --- | --- | --- |
| `/me` đang tải | `aria-busy`, spinner + `Đang kiểm tra phiên đăng nhập…`; không link CTA | 634,5 / 844 |
| `/me` 401 (khách) | `Tạo tài khoản` + `Đăng nhập` | 718,5 / 844 |
| `/me` 500 | `Không kiểm tra được phiên đăng nhập.` + `Đăng nhập` + `Tạo tài khoản` + `Thử lại`; `.hero__actions` không có link | 810,4 / 844 |
| `/me` 200 | `Mở ứng dụng` | 643,5 / 844 |

## Ảnh/artifact (ngoài repo, không commit)

`C:/Users/nguye/orca/workspaces/DATN/.artifacts/v4-fix-public-2/`

- Ảnh landing: `landing-{375x667,390x667,360x640,360x740,390x700,390x844,320x640}-large.png`, `landing-{390x844,360x640}-default.png`, `landing-1280x900-default.png`
- Trạng thái phiên: `state-{pending,401,500,200}-390x844-large.png`
- Auth: `login-{375x667,320x640}-large.png`, `register-{375x667,320x640}-large.png`, `login-401-focus-390x844.png`
- Số đo: `verify-final.json` (geometry/overflow/activeElement), `measure-before.json`, `measure-after-note.json`
- Lệnh chạy: `e2e-final2.txt`, `final-checks2.txt`, `verify.mjs`, `measure.mjs`, `playwright.4312.config.mjs`

## Chưa làm / giới hạn

- **P3 chưa sửa** (không nằm trong R-01..R-05, giữ phạm vi public):
  - R-09: dòng dữ liệu mô phỏng ở `/register` vẫn dưới màn đầu khi chữ lớn (851,6/844) và 360 thường (787,9/740) — spec chỉ yêu cầu “ở cuối”, không phải tiêu chí nghiệm thu.
  - R-10: `.auth-note` vẫn nằm trong card ở lời mời/404, ngoài card ở login/register; `InvitePage.tsx` còn `style` inline.
  - R-11: CSS chết `.site-header__nav`/`.site-footer__note` trong `layout.css` — không sửa vì ngoài phạm vi public của spec v4.
  - R-12: `/login`, `/register` khi `/me` chậm vẫn dùng `PageLoader` thay cả `AuthLayout` (mất khung/disclaimer trong lúc tải).
  - R-14: `TextField` bỏ hint khỏi `aria-describedby` khi có lỗi (component dùng chung toàn app, ngoài phạm vi public).
- Chỉ kiểm Chromium/Playwright headless; chưa kiểm Firefox/WebKit, thiết bị thật, xoay ngang, zoom trình duyệt 200%, `forced-colors`. Ở landscape thấp (ví dụ 667×375) hero vẫn có thể vượt màn đầu — ngoài bộ viewport đã chốt.
- Không đăng nhập/seed/ghi DB; `/me` 200/500/chậm và login 401 được mock bằng `page.route` với schema đúng hợp đồng.
- E2E alerts/assistant/history chạy lại và xanh nhưng không thuộc phạm vi sửa; không coi là bằng chứng cho thay đổi này.
- **Không merge**; không sửa `reports/qa/v4-rereview-public.md` (báo cáo của reviewer).
