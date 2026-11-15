# Handoff — Fix worker v4: sửa lỗi review giao diện công khai

- **Ngày:** 2026-11-15 17:03 +07 (Asia/Ho_Chi_Minh)
- **Branch:** `fix-v4-public`, cắt từ `feat/v4-simple-public` (`49c3ac9`); **không merge**.
- **Commit code:** `1d4ca1d` — `fix(web): sửa lỗi review giao diện công khai v4`
- **Báo cáo nguồn:** `C:/MyFolder/Hoc_Tap/project/DATN/reports/qa/v4-review-public.md`
- **Phạm vi:** chỉ web công khai + test/E2E. Không đổi API/contract, route, quyền, dependency; không sửa `AppShell.tsx`, `router.tsx`, `layout.css`, `tokens.css`, admin/app CSS, docs/README (theo phạm vi spec v4). Không đụng DB, không seed, không ghi API.

## Đã sửa theo từng phát hiện

| Mục | Thay đổi |
| --- | --- |
| P1-1, P1-3 | Hero có đúng một dòng nhỏ ngay dưới CTA: `Dữ liệu mô phỏng · cảnh báo chỉ hiện khi web mở · không tự gọi cấp cứu.` Footer chỉ còn `An Nhiên — theo dõi người thân từ xa.`, không lặp disclaimer. Test kiểm tồn tại đúng 1 lần, nằm trong `.hero`, sau CTA trong DOM; E2E đo `getBoundingClientRect` để chắc dòng này nằm trong viewport đầu. |
| P1-2 | Hero thêm câu `Trợ lý AI trả lời câu hỏi về số liệu của người thân.`; thẻ thứ ba đổi thành `Hỏi trợ lý` / `Hỏi trợ lý AI về số liệu của người thân.`; title thành `An Nhiên — theo dõi người thân và trợ lý AI`, meta description nêu thiết bị đeo + trợ lý AI. |
| P1-4 | `apps/web/e2e/smoke.spec.ts` không còn tìm `Mở trợ lý`; kiểm CTA `Tạo tài khoản`/`Đăng nhập` (khách), title, disclaimer trong màn đầu và geometry 390×844. Trạng thái `/me` được mock 401 để smoke không phụ thuộc API/DB. |
| P1-6 | Giữ test hồi quy cho thông điệp an toàn; thêm test đúng một link mỗi đích và test focus field lỗi. |
| P2-1, P2-2 | `SiteHeader` chỉ còn logo (bỏ CTA và `useMe`). Hero là nơi duy nhất có CTA: khách có đúng một `Tạo tài khoản` + một `Đăng nhập`; đã đăng nhập chỉ một `Mở ứng dụng`. Test/E2E dùng `toHaveLength(1)`, không dùng `length > 0`. |
| P2-3 | Giảm padding/khoảng cách khung auth; thêm override cho `html[data-text-size='large']` (padding khung, title, margin field, padding input). Nút submit nằm trong màn đầu ở 390×844 chữ lớn, 360×740 chữ lớn và 360×740 thường; không cắt field. |
| P2-4 | Lời mời lỗi: `Lời mời này không tồn tại, đã hết hạn hoặc đã được dùng. Hãy kiểm tra lại link hoặc nhờ người mời gửi lời mời mới.` (2 câu). 404 thêm một câu hướng dẫn link lời mời. |
| P2-5 | `Về trang chủ` ở lời mời lỗi dùng `ButtonLink` (51,6px thường / 60px chữ lớn, cùng kiểu 404). Link chéo `Tạo tài khoản mới` / `Đăng nhập` trong câu được underline rõ (đậm + dày 1,5px + offset 4px). Lời mời lỗi và lỗi tải lời mời có dòng `Dữ liệu mô phỏng · không thay thế cấp cứu.` |
| P2-6 | `<details>` tài khoản trải nghiệm đóng được bằng Escape và trả focus về `summary`. Có test. |
| P2-7 | Khi `/me` đang tải: không render CTA khách. Khi `/me` lỗi không phải 401: hiện `Không kiểm tra được phiên đăng nhập.` + link `Đăng nhập`, không giả làm khách. Có test cho cả pending và 500. |
| P2-8 | Hero dùng `nhịp tim và vận động từ thiết bị đeo của người thân`; không thêm đoạn dài. |
| P2-9 | Quyền lời mời là danh sách ngắn 5 dòng, dùng thuật ngữ `trợ lý AI`; bỏ chuỗi run-on ` · ` và nhãn `không xem AI`. |
| P2-10 | Hook `useFocusFirstError` đưa focus tới field lỗi đầu tiên ở login/register; vẫn giữ `aria-invalid`, `aria-describedby`, `role=alert`. Test kiểm `document.activeElement`. |

## Tệp đã đổi

| Tệp | Thay đổi |
| --- | --- |
| `apps/web/src/pages/LandingPage.tsx` | Hero (thiết bị đeo + trợ lý AI), CTA theo phiên, disclaimer dưới CTA, trạng thái pending/500; thẻ `Hỏi trợ lý`; header/footer mới |
| `apps/web/src/pages/LandingPage.test.tsx` | Viết lại/chặt hơn: đúng một CTA mỗi đích, header chỉ logo, disclaimer trong hero sau CTA, card mới, pending/500 |
| `apps/web/src/components/SiteHeader.tsx` | Chỉ logo |
| `apps/web/src/components/SiteFooter.tsx` | Một dòng tên + mô tả |
| `apps/web/src/styles/public-simple.css` | Header/hero note/footer; khoảng cách auth; large-text compact; underline link chéo; danh sách quyền lời mời |
| `apps/web/src/features/auth/LoginPage.tsx` | Focus field lỗi đầu tiên; Escape đóng `<details>` |
| `apps/web/src/features/auth/RegisterPage.tsx` | Focus field lỗi đầu tiên |
| `apps/web/src/features/auth/useFocusFirstError.ts` | Hook dùng chung cho hai form (mới) |
| `apps/web/src/features/auth/LoginPage.test.tsx` | Thêm assert focus + test Escape |
| `apps/web/src/features/auth/RegisterPage.test.tsx` | Test mới: lỗi field, focus field đầu, khung tối giản |
| `apps/web/src/features/invitations/InvitePage.tsx` | Copy lỗi 2 câu, nút về trang chủ, disclaimer, quyền dạng danh sách |
| `apps/web/src/features/invitations/InvitePage.test.tsx` | Test mới: lỗi 404, lời mời hợp lệ, lỗi 500 |
| `apps/web/src/pages/NotFoundPage.tsx` | Thêm một câu hướng dẫn link lời mời + dòng dữ liệu mô phỏng |
| `apps/web/e2e/smoke.spec.ts` | CTA mới, đúng một link, geometry disclaimer/CTA, register 390/360 thường + chữ lớn |
| `apps/web/index.html` | Title/meta description nêu trợ lý AI và thiết bị đeo |

## Kiểm chứng đã chạy (output thật)

Chuẩn bị: worktree sạch, `pnpm install --frozen-lockfile --offline` (711 package), build contracts trước khi typecheck/build web:

```text
$ pnpm --filter @annhien/contracts build
$ tsc -p tsconfig.json
(exit 0)
```

### Unit test

```text
$ pnpm --filter @annhien/web test

 Test Files  35 passed (35)
      Tests  207 passed (207)
   Duration  15.44s
(exit 0)
```

Tăng từ 33 file/199 test (baseline nhánh) lên 35 file/207 test; không xóa/nới assertion cũ.

### Typecheck

```text
$ pnpm --filter @annhien/web typecheck
$ tsc -p tsconfig.json --noEmit
(exit 0, không in thêm)
```

### Build

```text
$ pnpm --filter @annhien/web build
$ tsc -p tsconfig.json --noEmit
vite v8.3.8 building for production...
dist/assets/index-B57kA-tU.js  266.50 kB │ gzip: 81.86 kB
✓ built in 320ms
(exit 0)
```

### E2E smoke (chạy thật, Chromium)

Dev server riêng `vite --port 4341 --strictPort`; config Playwright tạm ngoài commit trỏ `baseURL 4341`. Không dùng server 5173 có sẵn (tránh đọc code worktree khác).

```text
$ pnpm exec playwright test --config=<config tạm>

Running 6 tests using 1 worker

ok 1 landing hiển thị tên sản phẩm, trợ lý AI và dữ liệu mô phỏng trong màn đầu
ok 2 điều hướng tới trang đăng nhập từ landing
ok 3 landing 390×844 › CTA và dòng cảnh báo nằm trong màn đầu, không tràn ngang
ok 4 register 390×844 chữ lớn › nút tạo tài khoản nằm trong màn đầu, không tràn ngang
ok 5 register 360×740 chữ lớn › nút tạo tài khoản vẫn nằm trong màn đầu
ok 6 register 360×740 chữ lớn › nút tạo tài khoản nằm trong màn đầu ở cỡ thường

6 passed (12.9s)
```

Output đầy đủ: `C:/Users/nguye/orca/workspaces/DATN/.artifacts/v4-fix-public/smoke-output.txt`.

## Ảnh và số đo

Ảnh/JSON **ngoài repo**, không commit: `C:/Users/nguye/orca/workspaces/DATN/.artifacts/v4-fix-public/`
- 30 ảnh viewport: `landing|register|login|notfound|invite-{1280x900,390x844,360x740,390x844-large,360x740-large,1280x900-large}.png`
- `measure.json`, `measure-console.txt`, `smoke-output.txt`, `measure-fix-v4.mjs` (script đo, không commit)

Đo bằng Chromium, mock `/me` 401 và `/invitations/*` 404:

| Viewport | `scrollWidth-clientWidth` | Hero note bottom / viewport | Register submit bottom / in viewport |
| --- | --- | --- | --- |
| 1280×900 | 0 | 470.9 / 900 | 722.9 / có |
| 390×844 | 0 | 500.5 / 844 | 691.8 / có |
| 360×740 | 0 | 521.8 / 740 | 663.4 / có |
| 390×844 chữ lớn | 0 | 698.9 / 844 | 717.8 / có |
| 360×740 chữ lớn | 0 | 723.9 / 740 | 717.8 / có |
| 1280×900 chữ lớn | 0 | 544.9 / 900 | 727.0 / có |

Không có phần tử nào vượt `innerWidth` ở cả 6 điều kiện (danh sách rỗng, trừ skip link offscreen có chủ đích).

Kiểm trực tiếp khác:

| Hạng mục | Kết quả |
| --- | --- |
| Link landing | Chỉ `An Nhiên`, `Tạo tài khoản` (`/register`), `Đăng nhập` (`/login`); header đúng 1 link; body text mỗi CTA xuất hiện một lần |
| Footer landing | `An Nhiên — theo dõi người thân từ xa.`; không còn disclaimer cũ |
| Disclaimer | Đúng 1 lần trên `/` ở mọi viewport; nằm sau CTA, trong `.hero`; bottom < viewport |
| `Hỏi trợ lý` | Card 3 hiện đúng heading + `Hỏi trợ lý AI về số liệu của người thân.`; không còn `Hỏi đáp` |
| Thiết bị đeo | Hero có `thiết bị đeo` |
| Title | `An Nhiên — theo dõi người thân và trợ lý AI` |
| Focus lỗi | Login rỗng → `INPUT#login-email`; Register rỗng → `INPUT#register-name`; error id tương ứng tồn tại |
| Escape details | `open=false`, active element `SUMMARY` |
| Lời mời lỗi | `Về trang chủ` là `.button`, cao 51,6px thường / 60px chữ lớn; có dòng dữ liệu mô phỏng |
| 404 | `Về trang chủ` `.button` 51,6px / 60px; có câu hướng dẫn link lời mời |
| Chữ cấm | Không có `bản demo/đồ án/giảng viên/nghiệm thu/chưa được duyệt` trong body text các màn đã kiểm |

## Chưa làm / giới hạn

- **P1-5 chưa sửa:** trang `/login` vẫn có nút điền tài khoản quản trị từ seed. Đây là hành vi có từ trước, nằm ngoài danh sách sửa của lượt này và spec v4 yêu cầu giữ 3 nút vai trò; cần quyết định sản phẩm trước khi triển khai công khai (tắt trên bản public hoặc bỏ credential khỏi bundle).
- Chỉ kiểm Chromium/Playwright; chưa kiểm Firefox/WebKit, thiết bị thật, zoom trình duyệt, `forced-colors`.
- Chỉ chạy smoke E2E; các E2E cần đăng nhập/seed (`alerts`, `assistant`, `history`) không chạy để không ghi DB.
- Không sửa docs/README theo phạm vi spec v4; nếu cần ghi hiện trạng v4 vào `docs/06`, lead có thể cập nhật sau khi merge.
- Không merge, không đụng `reports/qa/v4-review-public.md`.
