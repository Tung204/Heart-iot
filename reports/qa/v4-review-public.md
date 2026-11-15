# Review độc lập v4 — giao diện công khai

- **Ngày:** 2026-11-15 13:40 +07 (Asia/Ho_Chi_Minh)
- **Worktree review:** `C:/Users/nguye/orca/workspaces/DATN/v4-review-public`
- **Nhánh review cục bộ:** `review/v4-public-f572ef4`, checkout đúng code commit `f572ef4`
- **Nhánh cần soi:** `feat/v4-simple-public` — code `f572ef4`, handoff `49c3ac9`, base `b778486`
- **Vai trò:** reviewer độc lập; không sửa code, không merge, không đụng docs/README/DB. Chỉ thêm báo cáo này.
- **Kết quả:** **16 phát hiện — 6 P1, 10 P2**. Không xếp P0 cho lỗi giao diện; P1-5 là rủi ro bảo mật có sẵn, cần chốt trước khi triển khai công khai.

## 0. Kết luận nhanh

Giao diện mới gọn hơn thật, bố cục mobile ổn và không tràn ngang ở các cỡ đã đo. Nhưng bản tối giản đã bỏ luôn hai thứ không nên bỏ: **ranh giới cảnh báo/cấp cứu** (docs/02 yêu cầu phải nói rõ) và **vai trò trợ lý AI** (sản phẩm v3 lấy trợ lý làm không gian mặc định). Ngoài ra còn CTA trùng, E2E còn đỏ và một số chỗ copy/khung trang chưa thống nhất.

**Ba lỗi nặng nhất**

1. **P1-1 — bỏ ranh giới cảnh báo khỏi trang chủ.** Người dùng có thể hiểu “rồi báo bạn khi có bất thường” là báo nền/cấp cứu, trong khi hệ thống chỉ hiển thị khi web đang mở và kết nối.
2. **P1-2 — hero không nói rõ trợ lý AI.** “Hỏi đáp” và “Bạn hỏi nhanh tình hình” có thể bị hiểu là FAQ/hỗ trợ; “trợ lý” chỉ xuất hiện trong câu “không phụ thuộc trợ lý” mà không được giới thiệu.
3. **P1-3 — dòng “Dữ liệu mô phỏng · không thay thế cấp cứu.” chỉ nằm ở footer, ngoài màn đầu.** Đo được `top` 1015/900 ở 1280×900, 1334/844 ở 390×844, 1679/844 ở 390 chữ lớn; CTA chính nằm trong màn đầu nhưng disclaimer thì không.

Ngoài ra **P1-4**: `apps/web/e2e/smoke.spec.ts:12` vẫn tìm link `Mở trợ lý`; chạy smoke trên nhánh cho **1 failed / 1 ok**, nên nhánh chưa thể coi là xanh E2E.

## 1. Phạm vi, môi trường, cách kiểm

### 1.1. Đã đọc

- `git diff b778486..feat/v4-simple-public` (13 tệp, gồm handoff) và `git diff b778486..f572ef4` (12 tệp code/docs).
- Toàn bộ hai tệp test thay đổi: `apps/web/src/pages/LandingPage.test.tsx`, `apps/web/src/features/auth/LoginPage.test.tsx`; đối chiếu test cũ trong diff.
- `LandingPage.tsx`, `SiteHeader.tsx`, `SiteFooter.tsx`, `AuthLayout.tsx`, `LoginPage.tsx`, `RegisterPage.tsx`, `InvitePage.tsx`, `NotFoundPage.tsx`, `public-simple.css`, `index.html`.
- `reports/orchestration/v4-specs/v4-simple-public.md`, `docs/02-yeu-cau-va-pham-vi.md`, `docs/06-trai-nghiem-va-man-hinh.md`.
- Handoff `reports/handoffs/v4-simple-public.md` chỉ để đối chiếu; **không dùng output/ảnh trong handoff làm bằng chứng**.

### 1.2. Môi trường chạy

| Mục | Giá trị |
| --- | --- |
| OS / runtime | Windows 11, Node `v24.22.2`, pnpm `12.5.1` |
| Cài dependency | `pnpm install --frozen-lockfile --offline` trong worktree sạch; 711 package |
| Web review | Vite dev server riêng `http://localhost:4340` (`vite --port 4340 --strictPort`) |
| API | `http://localhost:3000`, chỉ gọi đọc `GET /api/v1/me` → `401`; không đăng nhập, không ghi DB, không seed, không đụng `.data/pglite` |
| Browser | Chromium Playwright `1.65.1`; ảnh và JSON đo ở `C:/Users/nguye/orca/workspaces/DATN/.artifacts/v4-review-public/` (ngoài repo, không commit) |
| Trạng thái API khi kiểm | `GET /api/v1/me` trả `401 {"code":"UNAUTHENTICATED"}`; các trạng thái đăng nhập/lỗi/lời mời được giả lập bằng `page.route`, không gọi API ghi |

### 1.3. Cách kiểm

- Đo `document.documentElement.scrollWidth - clientWidth` và quét phần tử có `getBoundingClientRect().right > innerWidth` hoặc `left < 0` ở 1280×900, 390×844, 360×740, 390×844 chữ lớn (`html[data-text-size=large]`).
- Đo CTA chính bằng `getBoundingClientRect` (`bottom <= innerHeight`), kích thước target, thứ tự heading, số `h1`, link/button trùng tên.
- Tab bàn phím: skip link, focus ring, Enter trên skip link, thứ tự focus; `<details>` click/Enter/Escape; nút điền tài khoản.
- Form: submit rỗng, email/mật khẩu sai, lỗi API giả lập; kiểm `aria-invalid`, `aria-describedby`, `role=alert`.
- Trạng thái phiên: `/me` 401, `/me` 200 (đã đăng nhập), `/me` 500, `/me` chậm 2 giây.
- `/invite/:token` hợp lệ/không hợp lệ bằng response giả lập đúng schema; `/invite` trần đi vào 404 toàn cục.

## 2. Kết quả lệnh chạy lại

```text
$ pnpm --filter @annhien/contracts build
$ tsc -p tsconfig.json
(exit 0)

$ pnpm --filter @annhien/web test
Test Files  33 (33)
     Tests  199 (199)
  Duration  21.72s
(exit 0)

$ pnpm --filter @annhien/web typecheck
$ tsc -p tsconfig.json --noEmit
(exit 0, không in thêm)

$ pnpm --filter @annhien/web build
vite v8.3.8 building for production...
✓ built in 224ms
dist/assets/index-Cf35e8n6.js  265.20 kB │ gzip: 81.54 kB
(exit 0)
```

E2E smoke, chạy Playwright với dev server 4340 và config tạm ngoài repo (baseURL 4340, không dựng webServer 5173):

```text
Running 2 tests using 1 worker
x  1 [chromium] › e2e\smoke.spec.ts:5:1 › landing hiển thị tên sản phẩm và nhãn dữ liệu mô phỏng
ok 2 [chromium] › e2e\smoke.spec.ts:16:1 › điều hướng tới trang đăng nhập từ landing
1 failed, 1 ok

Error: expect(locator).toBeVisible() failed
Locator: getByRole('link', { name: 'Mở trợ lý' })
> 12 | await expect(page.getByRole('link', { name: 'Mở trợ lý' })).toBeVisible();
```

Không chạy toàn bộ E2E còn lại vì cần đăng nhập/seed API, nằm ngoài giới hạn “không đăng nhập, không ghi DB” của lượt review này.

## 3. Bảng phát hiện

| # | Mức | Màn hình | Viewport | Hành vi | Mong đợi | Thực tế |
| --- | --- | --- | --- | --- | --- | --- |
| P1-1 | P1 | `/` | 1280×900, 390×844, 360×740, 390 chữ lớn | Hero nói “rồi báo bạn khi có bất thường”; footer chỉ còn “không thay thế cấp cứu”. Không còn câu cảnh báo chỉ hiển thị khi web mở/kết nối, không tự gọi cấp cứu, không thông báo khi trình duyệt đóng. | Phải nói rõ giới hạn cảnh báo theo docs/02: chỉ quan sát khi đang kết nối; không hứa báo thức nền/cuộc gọi tự động. | Nội dung giới hạn bị bỏ hẳn; test cũ kiểm “không tự gọi cấp cứu”/“khi trình duyệt đã đóng” cũng bị xóa. |
| P1-2 | P1 | `/` | Tất cả | Hero: “Bạn hỏi nhanh tình hình ngay trong ứng dụng.” Thẻ “Hỏi đáp”: “Hỏi về số liệu của người thân bằng câu ngắn.” Không có chữ “trợ lý AI”, không nói ai trả lời. | Người phổ thông phải hiểu sản phẩm có trợ lý AI trả lời dựa trên số liệu, tách khỏi cảnh báo. | “Hỏi đáp” có thể là FAQ/hỗ trợ; “trợ lý” chỉ xuất hiện trong câu “không phụ thuộc trợ lý” mà chưa được giới thiệu. `<title>`/meta cũng bỏ “trợ lý”. |
| P1-3 | P1 | `/` | 1280×900, 390×844, 360×740, 390 chữ lớn | Chỉ có footer chứa “Dữ liệu mô phỏng · không thay thế cấp cứu.”; hero không có dòng nhỏ này. | Spec mục “Trang chủ / Hero” ghi rõ một dòng nhỏ ở hero; hoặc ít nhất disclaimer phải nằm trong màn đầu cạnh CTA. | Đo `top` của `.site-footer__note`: 1015/900 (1280), 1334/844 (390), 1326/740 (360), 1679/844 (390 chữ lớn). Không viewport nào thấy disclaimer trong màn đầu. |
| P1-4 | P1 | `/` (E2E) | Chromium desktop | `apps/web/e2e/smoke.spec.ts:12` vẫn tìm link `Mở trợ lý`; UI mới đã đổi thành `Tạo tài khoản`/`Mở ứng dụng`. | E2E smoke phải được cập nhật theo CTA mới trước khi merge; hoặc giữ CTA tương thích. | Chạy smoke: 1 failed / 1 ok. Handoff có ghi “sẽ fail” nhưng không sửa; nhánh để lại test đỏ. |
| P1-5 | P1 | `/login` | Tất cả | Mở “Tài khoản trải nghiệm”, bấm “Quản trị” điền một lần `admin@demo.annhien.local` / `demo-admin-2026`; email không hiện trên nút. | Không đưa credential quản trị lên trang công khai, hoặc phải chặn/tắt trên môi trường công khai và cảnh báo rõ. | Trang công khai tự điền tài khoản quản trị đang tồn tại trong seed; mật khẩu nằm trong bundle client. **Có từ trước, spec v4 yêu cầu giữ 3 nút; nhánh không tạo mới nhưng vẫn là rủi ro thật nếu deploy ngoài demo.** |
| P1-6 | P1 | Test | N/A | Test cũ kiểm ranh giới an toàn bị xóa, không có test thay thế; test mới dùng `getAllByRole('link', { name: 'Đăng nhập' }).length > 0` và `findAllByRole('link', { name: 'Mở ứng dụng' })` nên cho phép CTA trùng. | Giữ một test hồi quy cho thông điệp an toàn P0 và khẳng định đúng một CTA/điểm vào. | Test 199 vẫn xanh dù P1-1 và CTA trùng tồn tại; test chỉ kiểm chữ/href/số heading, không kiểm vị trí/trùng. |
| P2-1 | P2 | `/` | 1280×900, 390×844, 360×740, 390 chữ lớn | Header khách có link “Đăng nhập” (`/login`, 112×46.8 ở 390) và hero cũng có nút “Đăng nhập” (`/login`, 339×51.6 ở 390). | Một điểm vào “Đăng nhập” trong màn đầu; header có thể là “Tạo tài khoản” hoặc hero dùng câu “Đã có tài khoản?”. | Hai link cùng tên, cùng đích, cùng màn đầu; danh sách link của screen reader có “Đăng nhập” hai lần. |
| P2-2 | P2 | `/` đã đăng nhập | 1280×900, 390×844, 360×740, 390 chữ lớn | Header hiện nút outline “Mở ứng dụng” và hero hiện nút primary “Mở ứng dụng”, cùng `/app`. | Chỉ một CTA chính; header có thể là “Vào ứng dụng”/tài khoản để không lặp nhãn. | Hai link cùng tên, cùng đích; `body.innerText` có “Mở ứng dụng” hai lần. Test logged-in chỉ kiểm `length > 0`, không kiểm trùng. |
| P2-3 | P2 | `/register` | 390×844, chữ lớn | Nút submit “Tạo tài khoản” có `bottom` 860.2 > 844; ảnh viewport cắt mất phần dưới nút. | Spec yêu cầu nút chính và form nằm trong màn đầu ở mobile, kể cả chữ lớn. | Ở 390 thường nút kết thúc 708.8/844; ở 390 chữ lớn vượt 16.2px, người dùng phải cuộn mới thấy hết nút. |
| P2-4 | P2 | `/invite/token-khong-hop-le`, `/invite`, 404 | 390×844, 360×740, 1280×900 | Lời mời lỗi báo “Lời mời này không tồn tại hoặc đã hết hạn.”; 404 toàn cục bỏ câu hướng dẫn cho người mở link lời mời bị thiếu ký tự. | Nêu cả trạng thái “đã được dùng/đã được chấp nhận” (backend 404 gộp nhiều lý do) và giữ hướng dẫn kiểm tra link lời mời ở 404. | Copy cũ có “đã được dùng” và hướng dẫn link lời mời; copy mới rút gọn làm mất hai thông tin này. |
| P2-5 | P2 | `/invite/token-khong-hop-le`, `/login`, `/register` | 390×844, 360×740 | Khung invite lỗi không dùng `AuthLayout`, không có dòng “Dữ liệu mô phỏng…” (đếm 0); “Về trang chủ” là link text cao 20px, trong khi 404 dùng `ButtonLink` cao 51.6px. Các link chéo “Tạo tài khoản mới”/“Đăng nhập” cũng cao 20px. | Cùng một khung công khai, có disclaimer, và link hồi phục dễ chạm (≥24px WCAG 2.2, hoặc 44px theo quy ước nút của spec). | Khung và target không thống nhất; link “Về trang chủ” 20px là target đứng riêng, không thuộc exception inline. |
| P2-6 | P2 | `/login` | 390×844, 360×740, 1280×900 | `<details>` mở bằng click và Enter; sau khi mở, bấm Escape vẫn `open === true` sau 250ms. | Disclosure nên đóng được bằng Escape nếu theo pattern bàn phím đầy đủ; nếu không, phải ghi rõ chỉ click/Enter. | Native `<details>` không có handler Escape; người dùng phải Tab về summary và Enter hoặc click lại. Task kiểm Esc/Enter nên ghi nhận. |
| P2-7 | P2 | `/` | 390×844, 1280×900 | Khi `/me` chậm 2 giây, landing hiện ngay “Đăng nhập” + “Tạo tài khoản” rồi mới đổi sang “Mở ứng dụng”. Khi `/me` 500, landing giữ nguyên CTA khách, không có lỗi/retry. | Phân biệt đang tải, 401 và lỗi máy chủ; người đã đăng nhập không thấy CTA khách; lỗi 500 có thông báo/retry. | Cả pending và 500 đều render nhánh guest; người dùng có phiên trên máy chậm có thể bấm “Tạo tài khoản” trước khi state đúng. |
| P2-8 | P2 | `/` | Tất cả | Hero nói “An Nhiên ghi nhịp tim và vận động của người thân”; thẻ “Theo dõi” nói “kết nối thiết bị”. Không còn chữ “thiết bị đeo”, “đeo”. | Người phổ thông phải hiểu dữ liệu đến từ một thiết bị đeo nhỏ trên người thân, không phải điện thoại tự đo. | “Kết nối thiết bị” mơ hồ; trang bỏ mất bước “Gắn thiết bị đeo” của bản cũ. |
| P2-9 | P2 | `/invite/token-hop-le` | 390×844, 390 chữ lớn | Dòng “Quyền khi chấp nhận: xem lịch sử tối đa 30 ngày · nhận cảnh báo · xác nhận hỗ trợ · không đóng cảnh báo · không xem AI” chạy thành 4 dòng, thuật ngữ “AI” khác “trợ lý”. | Quyền đồng ý nên dễ quét (danh sách ngắn) và dùng cùng một thuật ngữ với sản phẩm (“trợ lý AI”). | Một câu run-on, nhiều phủ định; người dùng có thể bấm đồng ý mà không hiểu “không xem AI” nghĩa là gì. |
| P2-10 | P2 | `/login`, `/register` | 390×844, 360×740 | Submit rỗng: lỗi hiện đúng (`role=alert`, `aria-invalid`, `aria-describedby`) nhưng focus vẫn ở nút submit, không chuyển tới field lỗi đầu tiên. | Với form dài, đưa focus/scroll tới field lỗi đầu tiên hoặc thông báo tổng; role alert chỉ hỗ trợ screen reader. | `document.activeElement` là `BUTTON` sau submit; người dùng bàn phím phải Tab ngược lên mới sửa được. |

## 4. Chi tiết P1

### P1-1 — Ranh giới cảnh báo bị bỏ khỏi trang công khai

- **Màn hình:** `/` (landing).
- **Viewport:** 1280×900, 390×844, 360×740, 390 chữ lớn.
- **Hành vi:** Hero nói “An Nhiên ghi nhịp tim và vận động của người thân, rồi báo bạn khi có bất thường.” `SiteFooter` chỉ còn “Dữ liệu mô phỏng · không thay thế cấp cứu.” Không còn câu nào về cảnh báo chỉ hiển thị khi web đang mở/kết nối, không gửi thông báo khi trình duyệt đóng, không tự gọi cấp cứu.
- **Mong đợi:** `docs/02-yeu-cau-va-pham-vi.md:39` yêu cầu: “Giao diện phải nói rõ cảnh báo trong ứng dụng chỉ được quan sát khi đang kết nối; không hứa báo thức nền hoặc cuộc gọi tự động.” Bản cũ có 4 dòng “Ranh giới an toàn”, trong đó có “Cảnh báo chỉ hiển thị khi trang web đang mở và kết nối với máy chủ” và “Hệ thống không tự gọi cấp cứu và không gửi thông báo khi trình duyệt đã đóng.”
- **Thực tế:** Nội dung giới hạn bị xóa cùng section “Ranh giới an toàn”; câu “báo bạn” không nêu kênh/thời điểm. Người dùng có thể hiểu là báo nền hoặc có người gọi cấp cứu, trong khi FR-12 (Web Push) vẫn “Chưa làm” trong `docs/02`.
- **Bằng chứng:** body text landing không có “đang mở”, “kết nối”, “tự gọi”, “trình duyệt”; test cũ `nêu rõ ranh giới: không tự gọi cấp cứu, không push khi đóng trình duyệt` bị xóa trong `LandingPage.test.tsx`.
- **Mức:** P1 — rủi ro an toàn/niềm tin, không chỉ là copy.

### P1-2 — Hero không nói rõ trợ lý AI, “trợ lý” xuất hiện như thuật ngữ mồ côi

- **Màn hình:** `/`.
- **Viewport:** tất cả.
- **Hành vi:** Hero chỉ nói “Bạn hỏi nhanh tình hình ngay trong ứng dụng.”; 3 thẻ là “Theo dõi”, “Báo khi cần”, “Hỏi đáp”; thẻ “Hỏi đáp” nói “Hỏi về số liệu của người thân bằng câu ngắn.” Không có “trợ lý AI”, không nói ai trả lời, không nói câu trả lời dựa trên dữ liệu gì.
- **Mong đợi:** Sản phẩm v3 lấy trợ lý làm không gian mặc định `/app` (`docs/06`, dòng 5 và 14); FR-10 là AI tóm tắt/giải thích dữ liệu. Trang công khai phải nói rõ đây là trợ lý AI, khác với cảnh báo hệ thống.
- **Thực tế:** “Hỏi đáp” có thể bị hiểu là FAQ/hỗ trợ khách hàng. “Trợ lý” chỉ xuất hiện trong câu “Cảnh báo do hệ thống tạo, không phụ thuộc trợ lý.” — người đọc chưa biết “trợ lý” là gì. `<title>` và meta cũng bỏ “trợ lý” (`index.html:10-12`).
- **Bằng chứng:** body text landing không có “AI”; chỉ có “trợ lý” ở thẻ “Báo khi cần”. Test cũ kiểm `Trợ lý ở trung tâm`/`Cảnh báo không phụ thuộc AI` bị thay bằng test 3 thẻ, không còn assertion nào về trợ lý.
- **Mức:** P1 — người dùng phổ thông không hiểu sản phẩm làm gì, đúng vấn đề người dùng đã bác v3.

### P1-3 — Disclaimer chỉ ở footer, ngoài màn đầu, không cạnh CTA

- **Màn hình:** `/`.
- **Viewport:** 1280×900, 390×844, 360×740, 390 chữ lớn.
- **Hành vi:** Dòng “Dữ liệu mô phỏng · không thay thế cấp cứu.” chỉ nằm trong `.site-footer__note`; hero không có dòng nhỏ nào. Footer nằm sau section 3 thẻ.
- **Mong đợi:** Spec `v4-simple-public.md` mục “Hero” ghi rõ “Một dòng nhỏ: `Dữ liệu mô phỏng · không thay thế cấp cứu.`”. Handoff chọn bỏ ở hero để tránh lặp, nhưng như vậy disclaimer rời khỏi màn đầu và xa CTA.
- **Thực tế:** Đo `getBoundingClientRect().top` của `.site-footer__note`:
  - 1280×900: `1015` (viewport 900).
  - 390×844: `1334` (viewport 844).
  - 360×740: `1326` (viewport 740).
  - 390 chữ lớn: `1679` (viewport 844).
  Người dùng có thể bấm “Tạo tài khoản” mà chưa từng thấy dòng này.
- **Bằng chứng:** `LandingPage.tsx:116-127` chỉ có CTA; `SiteFooter.tsx:8` là nơi duy nhất; số đo trong `more-facts.json` (`landing-geometry`).
- **Mức:** P1 — đây là disclaimer sức khỏe/cấp cứu, không phải footer pháp lý thông thường.

### P1-4 — E2E smoke còn đỏ vì CTA cũ

- **Màn hình:** `apps/web/e2e/smoke.spec.ts`.
- **Viewport:** Chromium desktop (Playwright).
- **Hành vi:** Test vẫn `getByRole('link', { name: 'Mở trợ lý' })`; UI mới chỉ có “Tạo tài khoản”, “Đăng nhập”, “Mở ứng dụng”.
- **Mong đợi:** Cập nhật E2E theo CTA mới trước khi merge; hoặc giữ một link tương thích nếu cần.
- **Thực tế:** Chạy smoke với dev 4340: test 1 fail ở dòng 12; test 2 (điều hướng đăng nhập) ok. Handoff `49c3ac9` tự ghi “sẽ fail”, nhưng nhánh vẫn để nguyên.
- **Bằng chứng:** output Playwright ở mục 2; `apps/web/e2e/smoke.spec.ts:12`.
- **Mức:** P1 — cổng E2E của repo đỏ; không thể coi nhánh là ứng viên merge.

### P1-5 — Trang đăng nhập công khai điền một cú bấm tài khoản quản trị

- **Màn hình:** `/login`.
- **Viewport:** tất cả; kiểm ở 390×844.
- **Hành vi:** Mở `<details>` “Tài khoản trải nghiệm”, bấm “Quản trị” → email `admin@demo.annhien.local`, mật khẩu `demo-admin-2026` được điền vào form; email không hiện trên nút.
- **Mong đợi:** Với một trang công khai, không được cung cấp credential quản trị; nếu đây là môi trường demo, phải tắt trên bản public hoặc cảnh báo rõ và không đưa mật khẩu vào bundle client.
- **Thực tế:** `LoginPage.tsx:14-18` chứa cả 3 tài khoản, gồm admin; `apps/api/src/database/seed.ts:28-46` và `README.md:45-47` xác nhận tài khoản admin tồn tại. **Đây là hành vi có từ trước, spec v4 yêu cầu giữ 3 nút; nhánh không tạo mới, nhưng review độc lập vẫn phải nêu vì đang nằm trên giao diện công khai.**
- **Bằng chứng:** Playwright bấm “Quản trị” → `email=admin@demo.annhien.local`, `mật khẩu=demo-admin-2026`; body text không có email nhưng input hiển thị. Không đăng nhập, không gọi `/auth/login`.
- **Mức:** P1 nếu triển khai ngoài demo; với đồ án chạy local có dữ liệu tổng hợp, đây là rủi ro cần chốt, không phải lỗi mới của diff.

### P1-6 — Test an toàn bị xóa, test mới không bắt CTA trùng

- **Màn hình:** `apps/web/src/pages/LandingPage.test.tsx`.
- **Viewport:** N/A (jsdom).
- **Hành vi:** Diff xóa nguyên test:
  - `it('nêu rõ ranh giới: không tự gọi cấp cứu, không push khi đóng trình duyệt', ...)`
  - `expect(screen.getAllByText(/không tự gọi cấp cứu/i).length).toBeGreaterThan(0);`
  - `expect(screen.getAllByText(/khi trình duyệt đã đóng/i).length).toBeGreaterThan(0);`
  Không có test thay thế cho thông điệp an toàn. Test mới cho khách chỉ `getAllByRole('link', { name: 'Đăng nhập' }).length > 0` (dòng 19); test logged-in `findAllByRole('link', { name: 'Mở ứng dụng' })` rồi `length > 0` (dòng 51) — cả hai đều cho phép nhiều link trùng.
- **Mong đợi:** Giữ test hồi quy cho nội dung P0 (cảnh báo chỉ khi đang kết nối/không tự gọi cấp cứu) và khẳng định đúng một CTA/điểm vào. Có thể cập nhật câu chữ nhưng không bỏ assertion an toàn.
- **Thực tế:** 199 test vẫn xanh trong khi P1-1 và CTA trùng tồn tại; test chỉ kiểm chữ/href/số heading, không kiểm vị trí CTA, target size, trùng lặp hay disclaimer trong màn đầu.
- **Bằng chứng:** `git diff b778486..f572ef4 -- apps/web/src/pages/LandingPage.test.tsx`; `LandingPage.test.tsx:19,51`.
- **Mức:** P1 — mất lưới hồi quy cho đúng lỗi đã xảy ra.

## 5. Bằng chứng bổ sung cho P2

- **P2-1:** 390×844, header `a.site-header__login` 112×46.8 tại `x=261, y=12.8`; hero `a.button--secondary` 339×51.6 tại `y=406.5`; cả hai `href=/login`; body text có “Đăng nhập” hai lần. 1280×900: header 112×46.75, hero 147.3×51.6.
- **P2-2:** `/me` 200 giả lập; header `Mở ứng dụng` 116.7×46.8, hero 339×51.6; cả hai `href=/app`; đếm body text = 2.
- **P2-3:** `/register` 390×844, `data-text-size=large`; submit 339×60, `bottom=860.2`, viewport 844; ảnh `register-390x844-large-viewport.png` cắt đáy nút. 390 thường: `bottom=708.8`; 360 thường: `708/740`.
- **P2-4:** `InvitePage.tsx:74-79` copy mới; diff cũ có “đã được dùng” và “Hãy kiểm tra lại đường dẫn hoặc nhờ người mời gửi lời mời mới.” `NotFoundPage.tsx` bỏ câu hướng dẫn link lời mời.
- **P2-5:** `/invite/token-khong-hop-le` có 0 dòng disclaimer; link “Về trang chủ” 98.8×20 tại `y=501`; `/404` cùng CTA là `ButtonLink` 162.9×51.6. `/login` “Tạo tài khoản mới” 139.8×20; `/register` “Đăng nhập” 85.2×20.
- **P2-6:** `/login` 390, mở details, `Escape` sau 250ms vẫn `open=true`; `Enter` trên summary toggle; click toggle. `summary` cao 46.75, các nút vai trò 46.8.
- **P2-7:** `/me` trả 200 sau 2 giây: trước đó header “Đăng nhập”, hero “Tạo tài khoản Đăng nhập”; sau đó “Mở ứng dụng” cả hai. `/me` 500: landing giống hệt 401, không có alert/retry; `/login` vẫn hiện form.
- **P2-8:** body text landing chỉ có “kết nối thiết bị”; không có “đeo/thiết bị đeo”. Bản cũ có mục “Gắn thiết bị đeo”.
- **P2-9:** 390×844, dòng quyền chiếm 4 dòng; `describePermissions` sinh chuỗi phân tách ` · ` và “không xem AI”; không có danh sách.
- **P2-10:** `/login` và `/register` submit rỗng: `role=alert`, `aria-invalid=true`, `aria-describedby` đúng, nhưng `document.activeElement` là `BUTTON` submit; không focus field lỗi đầu.

## 6. Soi test thay đổi

### 6.1. Tệp test thay đổi

Chỉ 2 tệp test thay đổi: `LandingPage.test.tsx`, `LoginPage.test.tsx`. Không có test mới cho `/register`, `/invite`, 404, vị trí footer, target size, CTA trùng, `/me` lỗi/chậm, hay E2E.

### 6.2. Assertion bị xóa/nới

- **Xóa test an toàn** đã nêu ở P1-6.
- **Xóa assertion “Mở trợ lý”** khỏi unit test (phù hợp UI mới) nhưng E2E vẫn giữ → P1-4.
- **Giữ assertion yếu cho CTA trùng:** dòng 19 và 51 chỉ `length > 0`.
- **Test mới kiểm chữ:** 3 thẻ, 3 heading, 3 câu mô tả, href; không kiểm vị trí trên màn hình, kích thước, thứ tự thị giác hay việc có đúng một CTA.
- **Test mới kiểm disclaimer:** đúng 1 text trong DOM, nhưng không kiểm nó có nằm trong màn đầu/không bị footer che; P1-3 vẫn lọt.
- **Login test mới** mở `<details>` bằng cách gán trực tiếp `details.open = true` (jsdom không tự mở khi click), nên không kiểm được click/Enter/Escape thật; browser check của reviewer mới phát hiện Escape không đóng.
- **Không có test cho `/register` chữ lớn**, nên P2-3 lọt; handoff chỉ chụp `/register` 390 thường.
- **Không có test nào chạy viewport/overflow/CTA position**; handoff dựa vào ảnh ngoài repo. Reviewer tự đo mới thấy disclaimer ngoài màn và register large.
- **Không có test logged-in với `/me` chậm/500**; P2-7 lọt.

### 6.3. E2E

`apps/web/e2e/smoke.spec.ts:12` còn `Mở trợ lý`; ngoài ra test 2 click “Đăng nhập” đầu tiên vẫn chạy được vì còn link header. Không sửa file theo yêu cầu; chỉ ghi finding.

## 7. Những gì đã kiểm trực tiếp (không phải kết luận chung)

| Hạng mục | Kết quả đo trên nhánh `f572ef4` |
| --- | --- |
| Tràn ngang | `scrollWidth - clientWidth = 0` ở `/`, `/login`, `/register`, `/khong-ton-tai`, `/invite`, `/invite/token-*` tại 1280×900, 390×844, 360×740, 390 chữ lớn; danh sách phần tử vượt viewport rỗng (trừ skip link offscreen có chủ đích) |
| `h1` | 1 ở mọi màn đã mở (`/`, `/login`, `/register`, 404, `/invite` lỗi/hợp lệ) |
| Thứ tự heading | `/`: `h1 → h2 → h3 ×3`; các màn còn lại chỉ `h1` (không nhảy cấp) |
| Skip link | Tab đầu tiên vào `.skip-link`, `transform` về 0, outline 3px; Enter → `#main`, `activeElement = main`, `scrollY=73` ở 390 |
| CTA chính | Landing `bottom=393.8/844` (390), `385.3/740` (360), `471.3/900` (1280), `543/844` (390 chữ lớn); login `541.6/844`; 404 `485/844`; invite hợp lệ `569/844`; register thường `708.8/844`; **register chữ lớn `860.2/844` (P2-3)** |
| Kích thước nút | CTA chính 51.6px (60px chữ lớn); header login 46.8; nút vai trò 46.8; summary 46.75 — đều ≥44px |
| Link text | “Tạo tài khoản mới” 20px; “Đăng nhập” cross-link 20px; “Về trang chủ” invite lỗi 20px; brand 28px; “Về trang chủ” 404 51.6px |
| Validation | Login rỗng: “Vui lòng nhập email.”, “Vui lòng nhập mật khẩu.”; Register rỗng: tên/email/mật khẩu; `role=alert`, `aria-invalid=true`, `aria-describedby` đúng; API login 401 hiện “Email hoặc mật khẩu không đúng.”; API register 500 hiện “Máy chủ đang gặp lỗi…” |
| Details | Click mở; Enter toggle; Escape **không** đóng; 3 nút vai trò điền đúng email/mật khẩu; email không nằm trên nút |
| Trạng thái phiên | `/me` 401 → CTA khách; `/me` 200 → “Mở ứng dụng” (2 link); `/me` 500 → CTA khách, không lỗi; `/me` chậm 2s → CTA khách trước, rồi đổi |
| Disclaimer | 1 lần ở `/`, `/login`, `/register`, 404, invite hợp lệ; 0 lần ở invite lỗi/ErrorState; trên `/` luôn nằm ngoài màn đầu (P1-3) |
| Chữ cấm | Body text ban đầu không còn “bản demo/đồ án/giảng viên/nghiệm thu/chưa được duyệt”; sau khi bấm vai trò, input email có `@demo.annhien.local` (dữ liệu tài khoản, không phải copy) |

## 8. Giới hạn của lượt review

- Chỉ Chromium/Playwright; chưa kiểm Firefox/WebKit, Safari iOS, 320px, zoom trình duyệt 200%, `prefers-reduced-motion`, `forced-colors`.
- Không đăng nhập, không seed, không ghi DB; `/invite` hợp lệ và các trạng thái phiên được giả lập bằng `page.route`, không phải dữ liệu thật. `/invite` lỗi thật được giả lập 404 đúng schema; `/invite` trần đi vào 404 toàn cục.
- Không chạy toàn bộ E2E còn lại (cần API/seed/đăng nhập); chỉ chạy smoke spec liên quan.
- Không đo contrast bằng axe/Pa11y; chỉ đọc token/contrast comment và kiểm thị giác. Không kiểm với người cao tuổi/người chăm sóc thật.
- Ảnh/measure của worker trong handoff không dùng làm bằng chứng; số liệu trong báo cáo này do phiên review tự chạy. Ảnh/JSON của reviewer nằm ngoài repo, không commit.
- Không sửa code, không merge, không đụng docs/README. Tệp duy nhất thêm vào repo là báo cáo này.

## 9. Tệp thay đổi và artifact

- Báo cáo: `reports/qa/v4-review-public.md` (chỉ tệp này).
- Ảnh/đo ngoài repo: `C:/Users/nguye/orca/workspaces/DATN/.artifacts/v4-review-public/`
  - `landing-{1280x900,390x844,360x740,390x844-large}.png`
  - `register-390x844{-large,-large-viewport}.png`
  - `login-open-{390x844,360x740}.png`
  - `extra-invite-success-390x844.png`, `extra-invite-invalid-390x844.png`, `extra-404-390x844.png`
  - `review-metrics.json`, `extra-facts.json`, `more-facts.json`
- Code commit được review: `f572ef4`; handoff: `49c3ac9`; base: `b778486`.
