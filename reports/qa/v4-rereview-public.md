# Re-review v4 — giao diện công khai sau sửa

- **Ngày:** 2026-11-15 17:22 +07 (Asia/Ho_Chi_Minh)
- **Worktree review:** `C:/Users/nguye/orca/workspaces/DATN/v4-rereview-public`
- **Nhánh review cục bộ:** `review/v4-rereview-public-dd1fbd5`, checkout đúng `71a86ba` (handoff thứ hai); code cần soi là `dd1fbd5`.
- **Nhánh cần soi:** `fix-v4-public` — code `1d4ca1d` + follow-up `dd1fbd5`, handoff `1249b9b` và `71a86ba`, base `feat/v4-simple-public` (`f572ef4`).
- **Vai trò:** reviewer độc lập; không sửa code, không merge, không đụng docs/README/DB. Chỉ thêm báo cáo này.
- **Kết quả:** **15 phát hiện còn lại — 0 P1 theo đúng bộ viewport đã chốt ở báo cáo gốc, 8 P2 (trong đó 1 rủi ro cao cùng lớp P1-3), 7 P3.** Không dùng output/ảnh/số đo trong handoff làm bằng chứng; mọi số dưới đây do lượt review này tự chạy.

## 0. Kết luận ngắn

Bản sửa đã xử lý đúng phần lớn lỗi gốc: hero nói rõ trợ lý AI, E2E xanh lại, CTA mỗi đích còn đúng một, khối tự điền tài khoản quản trị đã biến mất khỏi UI và bundle web, disclaimer nằm trong màn đầu ở đúng bốn viewport báo cáo gốc dùng để đo, footer không lặp. Test được siết lại (đúng một link, vị trí note sau CTA, focus field lỗi); không thấy test nào bị nới thành `length > 0`; chỗ bị bỏ là test tự điền tài khoản trải nghiệm, tương ứng với tính năng đã bị xóa khỏi UI và được thay bằng test khẳng định khối này không còn.

Nhưng vẫn còn các điểm phải xử lý trước khi coi là xong:

1. **Dòng an toàn bị viết lại và làm mất một phần nghĩa.** `/` chỉ còn `Dữ liệu mô phỏng · cảnh báo chỉ hiện khi web mở · không tự gọi cấp cứu.` — mất `không thay thế cấp cứu` (vẫn còn trên login/register/404/invite và trong meta description), và không nói `đang kết nối` như `docs/02` yêu cầu. Test mới còn khẳng định dòng cũ **không được** xuất hiện trên `/`.
2. **Cùng lỗi P1-3 vẫn tái hiện ngoài bốn viewport đã chốt.** Ở chữ lớn trên chiều cao thấp thực tế (375×667, 390×667, 360×640), CTA còn trong màn đầu nhưng dòng cảnh báo thì không (bottom 698.9/667; 723.9/640). Ở 360×740 chữ lớn chỉ còn 16,1px biên; 390×700 chữ lớn còn 1,1px.
3. **Trạng thái phiên chưa rõ làm mất đường vào chính.** Khi `/me` đang tải, hero không còn CTA nào và không có chỉ báo tải/`aria-busy`; khi `/me` lỗi 5xx, khách mất luôn `Tạo tài khoản`, chỉ còn một dòng chữ nhỏ `Không kiểm tra được phiên đăng nhập. Đăng nhập` (không retry). Người đã đăng nhập bấm link đó sẽ thấy form đăng nhập trống, không phải ứng dụng.
4. **P2-10 mới đóng một nửa.** Lỗi field do client đưa focus đúng (`INPUT#login-email`, `INPUT#register-name`), nhưng lỗi máy chủ (401) làm `activeElement` về `BODY`: focus rơi khỏi form, người dùng bàn phím phải Tab lại từ skip link.
5. **Tài liệu chưa theo kịp quyết định bỏ khối trải nghiệm.** `reports/orchestration/v4-specs/v4-simple-public.md:60` vẫn yêu cầu giữ 3 nút vai trò; `reports/handoffs/v4-simple-public.md` vẫn mô tả khối này; `README.md:41-47` vẫn liệt kê 3 tài khoản demo nhưng không còn đường bấm nào trong UI.

Báo cáo này không đưa ra kết luận chung cho cả nhánh; từng mục dưới đây là bằng chứng đo được và phần còn lại tương ứng.

## 1. Phạm vi, môi trường, cách kiểm

### 1.1. Đã đọc

- `git diff f572ef4..fix-v4-public` (17 tệp, gồm 2 handoff và 2 tệp spec/handoff cũ được mang theo từ `49c3ac9`).
- **Toàn bộ diff test trước khi đọc code:** `apps/web/e2e/smoke.spec.ts`, `LandingPage.test.tsx`, `LoginPage.test.tsx`, `RegisterPage.test.tsx` (mới), `InvitePage.test.tsx` (mới). Đối chiếu từng assertion cũ trong base `f572ef4`.
- Code: `LandingPage.tsx`, `SiteHeader.tsx`, `SiteFooter.tsx`, `AuthLayout.tsx`, `LoginPage.tsx`, `RegisterPage.tsx`, `useFocusFirstError.ts`, `InvitePage.tsx`, `NotFoundPage.tsx`, `Field.tsx`, `api.ts`, `useAuth.ts`, `public-simple.css`, `layout.css` (phần liên quan), `index.html`.
- `reports/qa/v4-review-public.md`, `reports/orchestration/v4-specs/v4-simple-public.md`, `docs/02-yeu-cau-va-pham-vi.md:39`, `docs/06-trai-nghiem-va-man-hinh.md`.
- Handoff `v4-fix-public.md`, `v4-simple-public.md` chỉ để đối chiếu; **không dùng số đo/ảnh trong đó**.

### 1.2. Môi trường chạy

| Mục | Giá trị |
| --- | --- |
| OS / runtime | Windows 11, Node `v24.22.2`, pnpm `12.5.1` |
| Cài dependency | `pnpm install --frozen-lockfile --offline` trong worktree sạch; 711 package |
| Web review | Vite dev server riêng `http://localhost:4343` (`vite --port 4343 --strictPort`) |
| API | `http://localhost:3000`, chỉ đọc: `GET /api/v1/me` → `401 {"code":"UNAUTHENTICATED"}`; không đăng nhập, không seed, không ghi DB |
| Browser | Chromium Playwright `1.65.1` (headless), locale `vi-VN` |
| Artifact | `C:/Users/nguye/orca/workspaces/DATN/.artifacts/v4-rereview-public/` (ngoài repo, không commit) |

Một lần duy nhất trong `states.mjs` trang `/invite/token-hop-le` không mock endpoint lời mời nên có gọi thật `GET /api/v1/invitations/...` qua proxy — chỉ đọc, trả lỗi, không ghi DB; mọi trạng thái phiên/lời mời khác đều mock bằng `page.route`.

### 1.3. Cách kiểm

- Đo `document.documentElement.scrollWidth - clientWidth` và quét mọi phần tử có `right > innerWidth + 1` hoặc `left < -1` tại 320×640, 360×740, 390×844, 768×1024, 1280×720, 1280×900, 1366×768, 1440×900, 1920×1080 (một số tổ hợp có chữ lớn).
- Đo `getBoundingClientRect` của CTA, `.hero__note`, `.hero__session`, `.auth-note`, submit, footer; kiểm tra `bottom <= innerHeight`.
- Bàn phím: Tab đầu tiên, đợi hết transition rồi đo skip link; Enter trên skip link; thứ tự Tab; focus ring; submit rỗng; submit lỗi API; lỗi confirm password.
- Trạng thái phiên: `/me` 401, 200 (đúng schema `userSummary`), 500, chậm 2 giây; `/me` 500 trên `/login`; lời mời 404/200/500, `/me` pending trên lời mời, lời mời khi đã đăng nhập.
- Chạy lại smoke thật với config tạm ngoài repo, `baseURL 4343`, không dựng `webServer 5173`.

## 2. Kết quả lệnh chạy lại (output của lượt này)

```text
$ pnpm --filter @annhien/contracts build
$ tsc -p tsconfig.json
(exit 0)

$ pnpm --filter @annhien/web test
Test Files  35 passed (35)
     Tests  206 passed (206)
  Duration  22.43s
(exit 0)

$ pnpm --filter @annhien/web typecheck
$ tsc -p tsconfig.json --noEmit
(exit 0, không in thêm)

$ pnpm --filter @annhien/web build
vite v8.3.8 building for production...
✓ built in 396ms
dist/assets/index-B_34oClD.js  265.75 kB │ gzip: 81.60 kB
(exit 0)
```

Smoke E2E, chạy thật trên dev 4343 (config tạm ngoài repo, mock `/me` 401 trong spec):

```text
Running 6 tests using 1 worker
ok 1 landing hiển thị tên sản phẩm, trợ lý AI và dữ liệu mô phỏng trong màn đầu
ok 2 điều hướng tới trang đăng nhập từ landing
ok 3 landing 390×844 › CTA và dòng cảnh báo nằm trong màn đầu, không tràn ngang
ok 4 register 390×844 chữ lớn › nút tạo tài khoản nằm trong màn đầu, không tràn ngang
ok 5 register 360×740 chữ lớn › nút tạo tài khoản vẫn nằm trong màn đầu
ok 6 register 360×740 chữ lớn › nút tạo tài khoản nằm trong màn đầu ở cỡ thường
6 passed (4.1s)
```

Bundle web (build từ đúng code `dd1fbd5`):

```text
$ grep -rl "demo-admin-2026\|admin@demo.annhien.local\|demo-an-nhien-2026" apps/web/dist
(không có tệp nào)
$ grep -rn "Mở trợ lý" apps/web
(không có kết quả)
```

## 3. Soi diff test trước

### 3.1. Tệp test thay đổi

| Tệp | Loại | Ghi nhận |
| --- | --- | --- |
| `apps/web/e2e/smoke.spec.ts` | sửa lớn (+120/−9) | Mock `/me` 401 trong `beforeEach`; 6 test: landing 1280, điều hướng login, landing 390×844, register 390 large, register 360 large, register 360 thường |
| `apps/web/src/pages/LandingPage.test.tsx` | sửa (+78/−21) | Đúng một link mỗi đích, header 1 link, note trong `.hero` sau CTA, trợ lý AI, pending, 500 |
| `apps/web/src/features/auth/LoginPage.test.tsx` | sửa (+19/−16) | Thêm focus field lỗi; thay test tự điền tài khoản bằng test khẳng định khối này không còn |
| `apps/web/src/features/auth/RegisterPage.test.tsx` | mới | Lỗi field + focus field đầu + một dòng dữ liệu mô phỏng |
| `apps/web/src/features/invitations/InvitePage.test.tsx` | mới | Lời mời 404, lời mời hợp lệ (danh sách quyền), lỗi 500 |

Không có tệp test nào khác bị sửa; không có test bị xóa ngoài hai chỗ thay thế hợp lý (khối tài khoản trải nghiệm đã bị bỏ; test copy disclaimer cũ trên landing được thay bằng test mới).

### 3.2. Assertion bị siết / bị đổi

- **Siết:** `getAllByRole('link', { name: 'Đăng nhập' }).length > 0` → `toHaveLength(1)`; `findAllByRole('link', { name: 'Mở ứng dụng' }).length > 0` → `toHaveLength(1)`; thêm `within(header).getAllByRole('link')).toHaveLength(1)`.
- **Siết:** note phải nằm trong `.hero` và sau CTA trong DOM; thêm test pending không hiện CTA khách; thêm test 500 hiện thông báo + link đăng nhập, không có `Tạo tài khoản`/`Mở ứng dụng`.
- **Mới:** `RegisterPage.test.tsx` khẳng định `INPUT#register-name` có focus, `aria-invalid`, `aria-describedby`; `InvitePage.test.tsx` khẳng định đúng 5 mục quyền, không còn chuỗi `không xem AI`, nút `Về trang chủ` có class `button`.
- **Đổi hướng assertion disclaimer trên `/`:** test cũ của base khẳng định **có** `Dữ liệu mô phỏng · không thay thế cấp cứu.`; test mới khẳng định **không có** dòng đó (`LandingPage.test.tsx:43`), đồng thời khẳng định `HERO_NOTE` mới (`:11`, `:40`). Đây không phải test yếu hơn, nhưng nó khóa luôn việc không được đưa dòng "không thay thế cấp cứu" trở lại landing — xem R-01/R-15.
- **Không còn test tự điền tài khoản:** thay bằng test khẳng định `buttons` = 1, `details` = 0, input rỗng, không có `@demo.annhien.local`/`demo-admin-2026` trong DOM. Phù hợp với việc bỏ tính năng; nhưng xóa luôn test luồng đăng nhập demo bằng một cú bấm (nay không còn luồng đó).
- **Còn thiếu (không bị nới, nhưng lọt vùng):** không có test/E2E cho landing 360 hoặc landing chữ lớn; không có E2E cho `/me` pending/500; không có test cho `NotFoundPage`; không có test cho lỗi API đăng nhập làm mất focus; không có test cho `/register` ở chữ lớn về vị trí dòng dữ liệu mô phỏng.

### 3.3. E2E

- `Mở trợ lý` đã biến mất khỏi `apps/web` (kể cả E2E), smoke chạy 6/6 trên 4343.
- Test 2 kiểm cả P1-5: không còn `Tài khoản trải nghiệm`, không có nút `Quản trị`, email rỗng.
- Test 1/3 đo `bottom` của note trong viewport; test 4–6 đo `bottom` của submit. **Không có test đo note ở landing 360/large**, nên R-03 không bị lưới test bắt.
- Mock `/me` 401 ở `beforeEach` khiến smoke không phụ thuộc API/DB — tốt cho CI, nhưng cũng nghĩa là smoke không bao giờ kiểm nhánh đã đăng nhập hay nhánh lỗi máy chủ.

## 4. Đối chiếu từng P1 của báo cáo gốc

| Mục | Bằng chứng lượt này | Phần còn lại |
| --- | --- | --- |
| **P1-1** — ranh giới cảnh báo | `/` có `Dữ liệu mô phỏng · cảnh báo chỉ hiện khi web mở · không tự gọi cấp cứu.` trong `.hero__note` (`LandingPage.tsx:138-140`); body text chứa `cảnh báo chỉ hiện khi web mở`, `không tự gọi cấp cứu`; footer chỉ còn `An Nhiên — theo dõi người thân từ xa.` (không lặp) | Câu không nói `đang kết nối` như `docs/02:39`; `/` không còn `không thay thế cấp cứu` trong khi meta description và các trang auth vẫn có — R-01, R-02 |
| **P1-2** — trợ lý AI | Hero: `... Trợ lý AI trả lời câu hỏi về số liệu của người thân.`; thẻ 3 `Hỏi trợ lý` / `Hỏi trợ lý AI về số liệu của người thân.`; `<title>` `An Nhiên — theo dõi người thân và trợ lý AI`; meta nêu `trợ lý AI` | Không có |
| **P1-3** — disclaimer trong màn đầu | `bottom` của `.hero__note`: 1280×900 `470.9`; 1280×720 `470.9`; 390×844 `500.5`; 360×740 `521.8`; 390×844 large `698.9`; 360×740 large `723.9` — đều `< viewport`; note nằm sau CTA (`actions.bottom` 436.1 / 439.4 / 460.7 / 596 / 621.1); footer không còn note | Ngoài bốn viewport đã chốt, chữ lớn trên chiều cao thấp vẫn làm note rơi khỏi màn đầu (375×667 `698.9`; 390×667 `698.9`; 360×640 `723.9`; CTA vẫn trong màn: 596/621) — R-03 |
| **P1-4** — E2E đỏ | `Mở trợ lý` không còn trong `apps/web`; smoke 6/6 trên dev 4343; test điều hướng login chạy thật | Không có |
| **P1-5** — tài khoản trải nghiệm | `document.querySelectorAll('details').length = 0`, `buttons = 1` (submit), email/mật khẩu rỗng ở 390/360/1280/large; `LoginPage.test.tsx` khẳng định không còn 3 nút/không còn `Quản trị`/không có `demo-admin-2026`; bundle `dist` không chứa cả 3 chuỗi credential | Credential vẫn ở `README.md:41-47`, `seed.ts`, `e2e/visual-check.mjs` (chủ đích demo local); spec/handoff chưa cập nhật quyết định — R-08 |
| **P1-6** — test an toàn/CTA | Test mới khẳng định `toHaveLength(1)` cho từng đích, header 1 link, note trong `.hero` sau CTA, pending/500; `RegisterPage`/`InvitePage` có test mới; 206 test xanh | Lưới test vẫn thiếu landing 360/large, `/me` pending/500 ở E2E, 404, lỗi API làm mất focus — R-07; test cấm dòng disclaimer cũ — R-15 |

## 5. Đối chiếu từng P2 của báo cáo gốc

| Mục | Bằng chứng | Phần còn lại |
| --- | --- | --- |
| **P2-1** — trùng "Đăng nhập" | `/` khách: `linkCounts` chỉ có 1 `Tạo tài khoản` → `/register`, 1 `Đăng nhập` → `/login`; header chỉ 1 link `An Nhiên` | Không có |
| **P2-2** — trùng "Mở ứng dụng" | `/me` 200: chỉ 1 link `Mở ứng dụng` → `/app`; header không CTA | Không có |
| **P2-3** — register chữ lớn | Submit `bottom`: 390×844 `691.8`; 360×740 `663.4`; 390 large `717.8`; 360 large `717.8` — đều trong màn | Dòng disclaimer cuối form vẫn ngoài màn ở 360 thường (`787.9/740`) và 360/390 large (`851.6/740`, `851.6/844`) — R-09 |
| **P2-4** — copy lời mời/404 | Lời mời lỗi: `Lời mời này không tồn tại, đã hết hạn hoặc đã được dùng. Hãy kiểm tra lại link hoặc nhờ người mời gửi lời mời mới.`; 404 có câu kiểm tra link lời mời (`NotFoundPage.tsx:17-18`); test mới kiểm cả hai | Không có test cho 404 — R-13 |
| **P2-5** — khung/target lời mời | `Về trang chủ` lời mời lỗi là `ButtonLink` cao `51.6` (390), `60` (large); 404 cùng `51.6`; note dữ liệu mô phỏng có đúng 1 lần; link chéo 20px là link trong câu (được underline đậm 1,5px, offset 4px) | `.auth-note` nằm trong card ở lời mời/404 nhưng ngoài card ở login/register; style inline mới — R-10 |
| **P2-6** — Escape `<details>` | `details = 0` trên mọi màn công khai đã mở; không còn disclosure nào để kiểm Escape | Không áp dụng |
| **P2-7** — `/me` pending/500 | Pending: không còn CTA khách (`hero__actions` rỗng ở 350ms và tới 2,6s); 500: `role=status` `Không kiểm tra được phiên đăng nhập.` + `Đăng nhập`, không có `Tạo tài khoản`/`Mở ứng dụng`; test đơn vị cho cả hai | Không có chỉ báo tải/`aria-busy`, không retry, khách mất đường đăng ký khi 5xx; `/login` khi `/me` lỗi hiện form trống cho người đã đăng nhập — R-04, R-05 |
| **P2-8** — thiết bị đeo | Hero: `... từ thiết bị đeo của người thân ...`; meta có `thiết bị đeo` | Card `Theo dõi` vẫn `kết nối thiết bị` (đúng copy spec) |
| **P2-9** — quyền lời mời | `<ul class="invite-permissions">` 5 mục: `Xem lịch sử tối đa 30 ngày`, `Nhận cảnh báo`, `Xác nhận hỗ trợ`, `Đóng cảnh báo`, `Không xem tóm tắt từ trợ lý AI`; `không xem AI` không còn; test khẳng định đúng mảng | Không có |
| **P2-10** — focus field lỗi | Submit rỗng login → `INPUT#login-email`; register → `INPUT#register-name`; confirm lệch → `INPUT#register-confirm`; `aria-describedby` đúng id; `role=alert` giữ | Lỗi API 401 làm focus về `BODY` — R-06; hint mật khẩu bị bỏ khỏi `aria-describedby` khi có lỗi — R-14 |

## 6. Phát hiện còn lại / rủi ro

| # | Mức | Vùng | Bằng chứng | Rủi ro / mong đợi |
| --- | --- | --- | --- | --- |
| R-01 | P2 | `/` | `LandingPage.tsx:139` dùng `không tự gọi cấp cứu`; `LandingPage.test.tsx:43` khẳng định `Dữ liệu mô phỏng · không thay thế cấp cứu.` là `null`; meta description vẫn `... không thay thế cấp cứu.`; đo body: `/` `hasEmergencyPhrase=false`, login/register/404/invite `true` | Trang được xem nhiều nhất mất câu "không thay thế cấp cứu"; ba trang công khai còn lại và meta giữ câu này → không nhất quán về disclaimer y tế. Nên giữ một câu chứa cả "không thay thế cấp cứu" và giới hạn cảnh báo, hoặc tách hai câu rõ ràng |
| R-02 | P2 | `/` | Note: `cảnh báo chỉ hiện khi web mở`; `docs/02-yeu-cau-va-pham-vi.md:39`: "chỉ được quan sát khi đang kết nối" | Tab mở nhưng mất mạng vẫn không có cảnh báo; câu hiện tại không nói `kết nối`, dễ bị hiểu là "mở web là có cảnh báo" |
| R-03 | P2 (rủi ro cao, cùng lớp P1-3) | `/` chữ lớn | `bottom` note: 375×667 `698.9`; 390×667 `698.9`; 360×640 `723.9`; CTA cùng lúc `596`/`621`; 360×740 large `723.9/740` (biên 16,1px); 390×700 large `698.9/700` (biên 1,1px) | Đúng bốn viewport báo cáo gốc không còn tái hiện, nhưng trên chiều cao thực tế của iPhone SE/8 và Android nhỏ, chữ lớn vẫn làm disclaimer rơi khỏi màn đầu trong khi CTA vẫn thấy. Nếu danh sách thiết bị hỗ trợ gồm 375×667/360×640, đây là P1 cùng lớp P1-3; E2E hiện không đo trường hợp này |
| R-04 | P2 | `/` khi `/me` chậm | `hero__actions` rỗng ở 350ms và đến 2,6s; không có `aria-busy`, không text "đang kiểm tra", không skeleton trong hero; test đơn vị chỉ khẳng định không có CTA khách | Người mới vào trên mạng chậm thấy hero không có hành động chính; không có phản hồi cho biết đang tải. Nên có trạng thái tải rõ hoặc giữ CTA khách có nhãn "đang kiểm tra phiên" |
| R-05 | P2 | `/` khi `/me` 5xx/offline | Chỉ còn 1 link `Đăng nhập`; không `Tạo tài khoản`, không retry; thông báo nằm trong `.hero__session` màu `--color-ink-muted`, `role=status` (không phải `alert`); `/login` khi `/me` 500 render form trống (`hasForm=true`) | Khách không thể bắt đầu đăng ký khi API lỗi; người đã đăng nhập bấm `Đăng nhập` thấy form đăng nhập thay vì ứng dụng/hồi phục. Nên có retry và phân biệt "không kiểm tra được phiên" với "chưa đăng nhập" |
| R-06 | P2 | `/login` lỗi API | Sau submit sai mật khẩu (mock 401): `document.activeElement` = `BODY`; `role=alert` ở `top 229.5` nhưng focus không vào alert/field; `scrollY=0` | Người dùng bàn phím bị đưa về đầu trang, phải Tab lại từ skip link. P2-10 đã đóng cho lỗi client nhưng chưa cho lỗi máy chủ; nên focus vào alert hoặc field đầu tiên |
| R-07 | P2 | Test/E2E | `smoke.spec.ts` chỉ có landing 1280×720, landing 390×844, register 390/360; không có landing 360, không có landing large, không có `/me` pending/500, không có 404; `LandingPage.test` kiểm DOM, không kiểm viewport | R-03 và R-04 không có lưới hồi quy; một thay đổi CSS/copy nhỏ có thể làm disclaimer rơi khỏi màn mà test vẫn xanh |
| R-08 | P2 | Tài liệu/spec | `reports/orchestration/v4-specs/v4-simple-public.md:60` vẫn yêu cầu `<details>` + 3 nút; `reports/handoffs/v4-simple-public.md:19,53` mô tả khối này; `README.md:41-47` liệt kê 3 tài khoản demo nhưng UI không còn nút điền; `apps/web/e2e/visual-check.mjs:111` vẫn POST credential chủ hồ sơ | Quyết định bỏ khối trải nghiệm (P1-5) không được ghi vào spec/docs/README; người làm tiếp có thể khôi phục theo spec cũ, hoặc không biết cách đăng nhập demo nhanh. Cần một quyết định/ghi chú thay thế (ví dụ README hướng dẫn gõ tay + cảnh báo demo) |
| R-09 | P3 | `/register` | `.auth-note` bottom: 360×740 `787.9`; 360/390 large `851.6`; submit cùng lúc `663.4`/`717.8` | Dòng dữ liệu mô phỏng ngoài màn đầu trên trang tạo tài khoản (spec chỉ yêu cầu "ở cuối" nên không phải lỗi chấp nhận; nhưng cùng lớp với P1-3, nên biết khi siết tiêu chí) |
| R-10 | P3 | Lời mời/404 | `.auth-note` nằm trong `.auth-card` ở lời mời (`InvitePage.tsx:89,98,169`) và 404 (`NotFoundPage.tsx:21`) nhưng ngoài card ở `AuthLayout.tsx:32`; `InvitePage.tsx:86` thêm `style={{ marginTop: '1.25rem' }}` thay vì class | Cùng một câu, ba vị trí/khung khác nhau; style inline mới khó bảo trì và lệch quy ước CSS của repo |
| R-11 | P3 | CSS | `layout.css:357,380,384,397,401` còn `.site-header__nav`; `layout.css:412` còn `.site-footer__note`; không còn JSX nào dùng; comment `public-simple.css` "hai CTA" trong khi hero có 0/1/2 tùy phiên | CSS chết và comment sai dễ gây hiểu nhầm khi sửa header/footer sau này |
| R-12 | P3 | `/login`, `/register` khi `/me` chậm | Trong 2 giây: body chỉ có `Đang kiểm tra phiên đăng nhập…`; `h1=null`, `hasForm=false`, không brand, không skip link, không disclaimer (PageLoader thay cả AuthLayout) | Trạng thái tải của trang auth mất cấu trúc/khung và disclaimer; có từ trước, không do diff này, nhưng cùng nhóm pending với R-04 |
| R-13 | P3 | 404 | `NotFoundPage` không có test nào (`grep` không thấy `Không tìm thấy trang` trong test); copy mới chỉ được kiểm bằng mắt/đo của reviewer | Câu hướng dẫn link lời mời có thể bị xóa khi refactor mà không ai báo |
| R-14 | P3 | Field | `TextField` đặt `aria-describedby` = errorId khi có lỗi, bỏ hint: đo `#register-password` khi lỗi chỉ còn `register-password-error`, mất `register-password-hint` | Người dùng screen reader mất hint "Tối thiểu 10 ký tự" đúng lúc cần sửa lỗi; pre-existing, không do diff này |
| R-15 | P3 | Test thiết kế | `LandingPage.test.tsx:43` cấm dòng `Dữ liệu mô phỏng · không thay thế cấp cứu.` trên `/` | Nếu sửa R-01 bằng cách đưa câu đó trở lại hero (đúng spec v4), test sẽ đỏ dù hành vi đúng; nên đổi thành khẳng định "có disclaimer y tế + giới hạn cảnh báo trong màn đầu" thay vì cấm một chuỗi |

## 7. Kiểm hồi quy

| Hạng mục | Kết quả đo trên `dd1fbd5` |
| --- | --- |
| Tràn ngang | `scrollWidth - clientWidth = 0` ở `/`, `/login`, `/register`, `/khong-ton-tai`, `/invite`, `/invite/token-hop-le` tại 320×640, 360×740, 390×844, 768×1024, 1280×720, 1280×900, 1366×768, 1440×900, 1920×1080; danh sách phần tử vượt `innerWidth` rỗng (trừ skip link offscreen có chủ đích) |
| `h1` / heading | 1 `h1` trên mọi màn đã mở; `/`: `h1 → h2 → h3 ×3`; các màn còn lại `h1` (+ `h2`/`h3` khi có danh sách quyền) |
| Skip link | Tab đầu vào `.skip-link`; ngay sau Tab còn `transform: translateY(-214px)`, sau 400ms `top=17`, `transform: matrix(1,0,0,1,0,0)`, `outline 3px solid`; Enter → `#main`, `activeElement=MAIN`, `scrollY=55` |
| Tab order | `/`: skip → `An Nhiên` → `Tạo tài khoản` → `Đăng nhập`; `/login`: skip → brand → email → mật khẩu → submit → `Tạo tài khoản mới` |
| Focus ring | CTA và input đều `outline: 3px solid rgb(12,110,99)`, `outline-offset 2px`; input đổi border teal |
| CTA / target | CTA chính `51.6px` (60px chữ lớn); `Về trang chủ` lời mời/404 `51.6px`/`60px`; link chéo trong câu `20px` (lớn: 24px hoặc 54.9px khi xuống dòng); brand `28px` |
| Trạng thái phiên | 401 → `Tạo tài khoản` + `Đăng nhập`; 200 → chỉ `Mở ứng dụng`; 500 → status + `Đăng nhập`, không CTA khách; chậm 2s → rỗng rồi `Mở ứng dụng` |
| `/me` 200 hợp lệ | Mock `user` đúng `userSummary` (id/email/displayName/role/status/createdAt); CTA và note cập nhật đúng |
| Form | Login rỗng: 2 lỗi field, `aria-invalid`, `aria-describedby`, `role=alert`, focus `#login-email`; Register rỗng: 3 lỗi, focus `#register-name`; confirm lệch: focus `#register-confirm`; API login 401: `role=alert` hiện đúng thông báo nhưng focus về `BODY` (R-06) |
| Lời mời | Lỗi 404: đúng copy, nút `Về trang chủ` 51.6px, 1 disclaimer; hợp lệ: 5 mục quyền, CTA `Đăng nhập để tiếp tục` 51.6/60px, link chéo theo `next`; 500: `Thử lại` 51.6px + disclaimer; `/me` pending: hiện `Đang kiểm tra trạng thái đăng nhập…` rồi CTA; `/me` 200: nút `Đồng ý tham gia` 51.6px, không input |
| 404 | `/khong-ton-tai` và `/invite` trần: `h1` 404, `Về trang chủ` 51.6px, câu hướng dẫn link lời mời, 1 disclaimer, footer 1 dòng |
| Chữ lớn | `html[data-text-size=large]`: landing note `92.8px` cao (390), submit register 60px; không tràn ngang; không cắt chữ |
| Footer/header | `/`: header chỉ `An Nhiên` (1 link), footer `An Nhiên — theo dõi người thân từ xa.` (1 dòng, không note); 404 dùng cùng footer, không lặp note |
| Chữ cấm | Không có `bản demo`, `đồ án`, `giảng viên`, `nghiệm thu`, `chưa được duyệt` trong body text các màn đã kiểm; `@demo.annhien.local` không còn trong DOM/form mặc định |
| Console | Chỉ log lỗi mạng của các response mock 401/404/500; không có React error/pageerror |
| Bundle | `apps/web/dist` không chứa `demo-admin-2026`, `demo-an-nhien-2026`, `admin@demo.annhien.local` |

## 8. Giới hạn của lượt review

- Chỉ Chromium/Playwright headless; chưa kiểm Firefox/WebKit, Safari iOS, thiết bị thật, xoay ngang, zoom trình duyệt 200%, `forced-colors`, `prefers-reduced-motion`.
- Không đo contrast bằng axe/Pa11y; chỉ tính tay `--color-ink-muted` trên paper/paper-deep là `6.13:1`/`5.52:1` và đọc token. Không kiểm với người cao tuổi/người chăm sóc thật.
- Không đăng nhập, không seed, không ghi DB; `/me` 200/500/chậm, lời mời 200/404/500 được mock bằng `page.route` với schema đúng hợp đồng; lời mời 404 thật và 500 thật không được tạo từ dữ liệu thật.
- Không chạy toàn bộ E2E còn lại (`alerts`, `assistant`, `history`) vì cần đăng nhập/seed; chỉ chạy smoke spec.
- Không kiểm bundle production trên trình duyệt thật (chỉ `grep` bundle và chạy dev 4343).
- Không sửa code, không merge, không đụng docs/README/DB; tệp duy nhất thêm vào repo là báo cáo này.

## 9. Tệp thay đổi và artifact

- Báo cáo: `reports/qa/v4-rereview-public.md` (chỉ tệp này).
- Ảnh/đo ngoài repo: `C:/Users/nguye/orca/workspaces/DATN/.artifacts/v4-rereview-public/`
  - `landing-d1280.png`, `landing-d1280x720.png`, `landing-m390.png`, `landing-m360.png`, `landing-m390-large.png`, `landing-390-me500.png`, `landing-390-loggedin.png`
  - `register-{390,360,390-large,360-large,1280}.png`, `login-{390,360,390-large,1280}.png`, `404-{390,360,1280}.png`
  - `invite-{invalid-390,invalid-360,ok-390,ok-390-large,500-390}.png`, `invite-loggedin-390.png`, `invite-bare.png`
  - `note-*.png` (1280×900, 1366×768, 1920×1080, 390×844, 390×844 large, 360×740, 360×740 large, 320×640), `state-*.png`
  - `review-metrics.json`, `extra-facts.json`, `metrics.mjs`, `extra.mjs`, `states.mjs`, `focus-api.mjs`, `note-check.mjs`, `shortvp.mjs`, `playwright.4343.config.mjs`
- Code được review: `dd1fbd5` (gồm `1d4ca1d`); handoff: `1249b9b`, `71a86ba`; base: `f572ef4`.
