# Prompt wave 1 — fe-shell (nền tảng web, landing, đăng nhập, khung ứng dụng)

Repo: `C:/MyFolder/Hoc_Tap/project/DATN`. Bạn là **worker frontend fe-shell**, không phải lead.

## Đọc trước khi code (bắt buộc)

1. `AGENTS.md`, `docs/12-nguyen-tac-phat-trien-va-bang-chung.md`.
2. `docs/14-ke-hoach-trien-khai-phan-mem.md` (mục 1, 6, 8).
3. `docs/02-yeu-cau-va-pham-vi.md` (FR-01, NFR-04), `docs/06-trai-nghiem-va-man-hinh.md` toàn bộ, `docs/11-nen-tang-ai-va-cau-hinh-dong.md` mục preview.
4. `reports/worklog/2026-11-14.md`, `reports/orchestration/README.md`.
5. `packages/contracts/src/{core,auth}.ts`, `apps/web/package.json`, `tsconfig.json`. API auth nằm ở `apps/api/src/auth/auth.controller.ts`.

## Vùng ghi được phép

- `apps/web/**` (toàn bộ, trừ `package.json` và `tsconfig.json` — chỉ đọc; nếu thiếu dependency, ghi handoff)
- `reports/handoffs/wave1-fe-shell.md`

**Không sửa** `apps/api/**`, `packages/contracts/**`, docs, root config. Không `git`, không `pnpm add`, không đổi `.env`.

## Mục tiêu wave 1

Dựng nền web **chạy build được**, có bản sắc thiết kế rõ ràng, kết nối API thật cho auth, và khung ứng dụng cho các wave sau. Không bịa số liệu sức khỏe.

### Bắt buộc kỹ thuật

- React 19 + TypeScript + Vite (đã cài), React Router 7, TanStack Query 5, zod contracts.
- `vite.config.ts`: plugin React, `server.proxy['/api'] = 'http://localhost:3000'`, test config Vitest + jsdom + setup `@testing-library/jest-dom/vitest`.
- API client `src/lib/api.ts`: base `/api/v1` (cho phép `VITE_API_BASE_URL`), `credentials: 'include'`, parse lỗi `{code,message,requestId}`, không nuốt lỗi mạng. `ApiError` có `status/code/requestId`.
- Auth: `GET /me` khi tải app; login/register/logout; hiển thị lỗi cụ thể; sau login điều hướng `/app`. Route bảo vệ `/app/*` chuyển `/login` khi 401 (giữ `next`).
- Query keys rõ ràng; không cache dữ liệu sức khỏe quá 30s.
- Loading/empty/error states; không hiển thị số 0 thay cho "chưa có dữ liệu".

### Thiết kế

- Tên sản phẩm: **An Nhiên**. Định hướng: điềm tĩnh, ấm, dễ đọc cho người cao tuổi và người thân; không phải dashboard SaaS chung chung.
- Font self-host: `@fontsource/be-vietnam-pro` (body) và `@fontsource/newsreader` (tiêu đề) — import trong `main.tsx`/CSS, không CDN.
- Bảng màu bằng CSS custom properties: nền sáng ấm (giấy), mực xanh đậm, teal cho bình thường, đỏ gạch cho cảnh báo, vàng cát cho cảnh báo nhẹ. Không dùng màu làm tín hiệu duy nhất.
- Typography lớn (body ≥ 16px, tiêu đề editorial), khoảng thở rộng, focus ring rõ, `prefers-reduced-motion`, skip-link, điều hướng bàn phím, contrast AA.
- Responsive 390px và 1280px: sidebar chuyển drawer/nav dưới; bảng chỉ trong trang sau, chưa cần.
- Chế độ "chữ lớn" (toggle) lưu localStorage, áp dụng `<html data-text-size="large">`.
- Trang công khai có nhãn rõ: **bản demo dùng dữ liệu tổng hợp**, cảnh báo trong web chỉ quan sát khi đang kết nối, không hứa push/gọi cấp cứu.

### Trang/route wave 1

- `/` — landing: vấn đề, cách hoạt động (3 bước), ranh giới an toàn, CTA đăng nhập/đăng ký, dải "Dữ liệu mô phỏng".
- `/login`, `/register` — form có label thật, autocomplete, lỗi field và lỗi API; link chéo.
- `/app` — shell: sidebar/topbar, tên người dùng, đăng xuất, chuyển hồ sơ (gọi `/subjects`, chưa có thì hiển thị empty + CTA tạo hồ sơ disabled? Nếu API `/subjects` chưa có, hiển thị trạng thái "chưa kết nối được dữ liệu hồ sơ" thay vì lỗi thô).
- `/app` nội dung tạm: lời chào, thẻ "Bắt đầu" (tạo hồ sơ, gắn thiết bị) trỏ tới route sẽ làm ở wave 2; không hiển thị số liệu giả.
- `/invite/:token` — trang xem lời mời (gọi `GET /invitations/:token` nếu API có; nếu 404 hiển thị lời mời không hợp lệ) + nút đăng nhập/đồng ý (accept gọi API; nếu chưa có thì disable kèm ghi chú "sẽ hoàn thiện ở wave sau"). Không bịa quyền.
- `*` — 404 thân thiện.

### Cấu trúc gợi ý

```text
src/
  app/ (router, providers, shell)
  features/auth/ (api, hooks, pages)
  features/subjects/ (api list, switcher)
  components/ (Button, Field, Card, Alert, EmptyState, StatusPill, AppShell)
  lib/ (api, query, format)
  styles/ (tokens.css, base.css, layout.css)
  test/setup.ts
```

### Test

- Vitest + Testing Library: render landing; form login thiếu email/password hiển thị lỗi; login thành công điều hướng `/app` (mock fetch); `/app` khi chưa đăng nhập chuyển `/login`; empty state hồ sơ không hiện số 0 giả; toggle chữ lớn đổi attribute.
- `playwright.config.ts` (chưa cần chạy E2E; API chưa đủ): baseURL `http://localhost:5173`, webServer `pnpm dev`. Không bật server trong test unit.
- Chạy:

```bash
cd apps/web
pnpm typecheck
pnpm test
pnpm build
```

Nếu build lỗi do contracts chưa build: chạy `pnpm --filter @annhien/contracts build` ở root (không sửa contracts).

## Kết thúc

Handoff `reports/handoffs/wave1-fe-shell.md`: file, lệnh + kết quả thật, phần chưa làm (route nghiệp vụ, E2E), rủi ro tích hợp API (endpoint chưa tồn tại), ảnh hưởng thiết kế. Kẹt >15 phút ở một lỗi thì dừng và ghi handoff.
