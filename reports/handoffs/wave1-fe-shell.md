# Handoff — fe-shell (wave 1)

- Thời điểm: 2026-11-14 22:00 (Asia/Ho_Chi_Minh)
- Worker: fe-shell (wave 1)
- Vùng ghi: `apps/web/**` (trừ `package.json`, `tsconfig.json` — chỉ đọc), `reports/handoffs/wave1-fe-shell.md`
- Không sửa: `apps/api/**`, `packages/contracts/**`, docs, root config. Không chạy git, không `pnpm add`, không đổi `.env`, không ghi Obsidian.

## Đã làm

Dựng nền web **An Nhiên** chạy build được: landing, đăng nhập/đăng ký nối API thật theo
hợp đồng `@annhien/contracts/auth`, khung ứng dụng `/app` cho các wave sau.

### File tạo (apps/web)

- Cấu hình: `vite.config.ts` (React plugin, `server.proxy['/api'] → http://localhost:3000`,
  Vitest + jsdom + setup jest-dom, exclude `e2e/` khỏi unit test), `playwright.config.ts`
  (baseURL 5173, webServer `pnpm dev`), `index.html` (lang=vi, meta, title).
- Font self-host qua `@fontsource` (be-vietnam-pro body, newsreader tiêu đề), import trong
  `src/main.tsx`, không CDN. CSS token trong `src/styles/{tokens,base,layout}.css`:
  nền giấy ấm, mực xanh đậm, teal/brick/sand; body ≥ 17px; focus ring; skip-link;
  `prefers-reduced-motion`; chế độ "chữ lớn" (`<html data-text-size="large">`, localStorage).
- `src/lib/`: `api.ts` (base `/api/v1` + `VITE_API_BASE_URL`, `credentials: 'include'`,
  `ApiError{status,code,requestId,details}` parse envelope `{code,message,requestId}` từ
  contracts, lỗi mạng → `NETWORK_ERROR` giữ `cause`, không nuốt), `query.ts` (query keys
  tập trung, không retry 4xx, staleTime ≤ 30s — ghi rõ quy tắc cho dữ liệu sức khỏe wave 2),
  `text-size.ts`, `validation.ts` (lỗi zod → tiếng Việt theo trường, đọc min/max từ issue,
  map `details` của VALIDATION_FAILED), `format.ts`, `next.ts` (`useSafeNext` chặn open redirect).
- `src/features/auth/`: `api.ts` (GET /me, login/register/logout + zod parse phản hồi),
  `useAuth.ts`, `LoginPage.tsx` (label thật, autocomplete, lỗi field + lỗi API cụ thể,
  sau login điều hướng `next` rồi `/app`), `RegisterPage.tsx` (xác nhận mật khẩu), `AuthLayout.tsx`.
- `src/features/subjects/`: `api.ts` (schema **tạm thời** `{id, displayName}` + passthrough —
  xem mục rủi ro), `SubjectSwitcher.tsx`: 404 → "Chưa kết nối được dữ liệu hồ sơ" (không lỗi thô);
  rỗng → EmptyState + CTA tạo hồ sơ disabled; không hiện số 0 giả.
- `src/features/invitations/`: `InvitePage.tsx` — GET `/invitations/:token`, 404 → "lời mời
  không hợp lệ"; chưa đăng nhập → nút đăng nhập giữ `next`; đã đăng nhập → "Đồng ý tham gia"
  (accept 404 → disable + "sẽ hoàn thiện ở wave sau"). Không bịa quyền.
- `src/app/`: `router.tsx` (routes xuất riêng để test bằng memory router), `ProtectedRoute.tsx`
  (401 → `/login?next=...`; lỗi mạng → hiển thị lỗi + thử lại, KHÔNG suy đoán đã đăng xuất),
  `AppShell.tsx` (sidebar desktop ≥1024px / topbar + nav dưới mobile, tên người dùng, đăng
  xuất, chữ lớn, nhãn "Bản demo · dữ liệu mô phỏng"), `AppHomePage.tsx` (lời chào + thẻ "Bắt
  đầu" trỏ `/app/subjects/new`, `/app/devices/claim` — wave 2; không số liệu sức khỏe giả),
  `ComingSoonPage.tsx` (`/app/*` chưa có).
- `src/pages/`: `LandingPage.tsx` (vấn đề, 3 bước, ranh giới an toàn: không push khi đóng
  trình duyệt, không tự gọi cấp cứu, dữ liệu mô phỏng; CTA), `NotFoundPage.tsx`.
- `src/components/`: Button/ButtonLink, Field, Card, Alert (icon + chữ, màu không phải tín
  hiệu duy nhất), EmptyState, StatusPill, TextSizeToggle, SkipLink, PageLoader, ErrorState,
  DemoNotice, SiteHeader, SiteFooter.
- Test: `src/test/{setup,utils}.tsx`, `pages/LandingPage.test.tsx`,
  `features/auth/LoginPage.test.tsx`, `features/subjects/SubjectSwitcher.test.tsx`,
  `app/ProtectedRoute.test.tsx`, `components/TextSizeToggle.test.tsx`, `lib/api.test.ts`.
  E2E smoke: `e2e/smoke.spec.ts` (chưa chạy).
- `apps/web/README.md`: cập nhật lệnh, cấu trúc, trạng thái wave 1, schema tạm thời.

### Kiểm đã chạy (kết quả thật, lúc 21:56)

| Lệnh (trong `apps/web`) | Kết quả |
| --- | --- |
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 6 file, **17/17 passed** (~2.8s) |
| `pnpm build` | thành công; cảnh báo chunk 949 kB (chưa code-split — xem đề nghị) |
| `pnpm dev` + curl `/` | 200, HTML có tiêu đề "An Nhiên" (đã tắt server sau kiểm) |
| curl `/api/v1/me` qua proxy Vite | 502 vì API chưa chạy được (xem rủi ro) — proxy hoạt động đúng |

## Chưa làm / giới hạn

- **Login "chạy thật" với API** — chưa kiểm được: khi tôi khởi động `apps/api` để kiểm luồng
  thật, `nest start --watch` không biên dịch nổi vì worker be-core đang sửa dở `apps/api`
  (18→24 lỗi TS trong `apps/api/test/...` tại thời điểm kiểm, 21:55). Đây là vùng không được
  sửa. Unit test của web mock đúng hợp đồng đã xác nhận từ `auth.controller.ts`
  (POST login → `authSessionSchema`, GET /me → `{user}`, logout 204, cookie `an_session`).
  Đề nghị lead/mini-lead chạy lại kiểm login thật sau khi wave 1 backend merge.
- Route nghiệp vụ `/app/*` (hồ sơ, thiết bị, cảnh báo, biểu đồ) → wave 2; hiện trả
  ComingSoonPage.
- E2E Playwright: đã có config + 2 smoke test, **chưa chạy** (cần dev server + API đủ).
- Chưa kiểm thử với người dùng thật, chưa đo độ khả dụng người cao tuổi (ngoài phạm vi wave).
- Không có bảng/export trong wave 1 (theo prompt, chưa cần).

## Rủi ro tích hợp API

1. **`/subjects` chưa tồn tại ở API** (be-core đang xây): web dùng schema tạm thời
   `{id, displayName, role?}` + `.passthrough()`, ghi chú ngay trong `features/subjects/api.ts`.
   Khi contracts có `@annhien/contracts/subjects`, **thay import chính thức và bỏ schema cục bộ**
   (wave 2 hoặc mini-lead fe). Nếu be-core đặt tên trường khác (vd `name`), parse sẽ fail →
   hiển thị lỗi mềm, không vỡ UI — nhưng cần đối chiếu contract trước khi gộp.
2. **`GET /invitations/:token` / accept** chưa có: trang lời mời xử lý 404 đúng nghĩa
   "lời mời không hợp lệ". Chú ý: khi API chưa có endpoint, trang sẽ hiển thị nhánh này
   (đúng thiết kế). Khi be-core thêm endpoint, hành vi sẽ chuyển sang nhánh thành công;
   schema `invitationSchema` là tạm thời, chỉ đọc trường tùy chọn.
3. **Envelope lỗi**: web parse `{code,message,requestId}` (khớp contracts/core.ts). Nếu API
   wave 1 thay đổi tên trường (vd `request_id`) sẽ lệch — hiện code API dùng `requestId` (đã
   đối chiếu `api-exception.filter.ts`).
4. **Origin/CSRF**: fetch cùng origin qua proxy nên Origin = `http://localhost:5173` khớp
   `WEB_ORIGIN` mặc định của API; nếu lead đổi `WEB_ORIGIN` phải khớp cổng dev web.
5. **401 trên `/subjects` khi phiên bị thu hồi** giữa chừng: SubjectSwitcher hiện chỉ hiện
   "Không tải được + thử lại", chưa đẩy về login. Wave 2 nên xử lý 401 toàn cục (query client
   global onError) — ghi để mini-lead fe cân nhắc.
6. **Be-core đang sửa `apps/api`**: không được chạm; nếu họ đổi contract auth (không nên —
   wave 0 đã chốt), cần báo lead.

## Ảnh hưởng thiết kế

- Bảng màu/token đặt trong `styles/tokens.css`; component chỉ dùng class, không inline màu
  (trừ 1 chỗ margin inline trong InvitePage — nên chuyển class khi làm wave 2).
- Sidebar cố định 17rem từ 1024px; nav dưới mobile. Các màn wave 2 nên đặt nội dung trong
  `--max-content` (46rem) để giữ nhịp đọc.
- `TextSizeToggle` render 2 bản (sidebar + topbar), đồng bộ qua sự kiện window
  `an:text-size-change` — wave 2 nếu thêm nút chữ lớn ở nơi khác chỉ cần dùng lại `useTextSize()`.
- Quy tắc cache: `staleTime ≤ 30s` cho dữ liệu sức khỏe ghi ở `lib/query.ts`; wave 2 phải tuân thủ.
- Bundle 949 kB (React + Router + Query + fonts CSS): nếu cần, code-split theo route
  (`lazy()` trên `/app`) — chưa làm để giữ wave 1 đơn giản.

## Đề nghị lead

1. Chạy lại kiểm login thật (API + web dev + curl/trình duyệt) sau khi wave 1 backend merge,
   vì hiện tại be-core đang sửa dở `apps/api` nên không khởi động được API.
2. Khi contracts `./subjects` và `./care` xuất hiện: thay schema tạm thời trong
   `features/subjects/api.ts` và `features/invitations/api.ts` bằng import chính thức
   (đã ghi chú TODO ngay trong file).
3. Wave 2 nên lift SubjectSwitcher + xử lý 401 toàn cục + code-split routes.
