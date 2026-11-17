# v7 W1 — foundation: tokens, primitive, shell, CSS graph

Bạn là worker **F (foundation)** cho đợt xây lại giao diện v7. Provider/model ghi trong handoff theo thực tế phiên. Chỉ đọc phần cần thiết, không đọc lại toàn repo.

## Nguồn bắt buộc đọc (theo thứ tự)

1. `reports/orchestration/v7-specs/mandate.md` — yêu cầu người dùng, phạm vi, ràng buộc.
2. `reports/orchestration/v7/design-system.md` — **đặc tả duy nhất** về màu, chữ, spacing, layout, component, state. Không tự chọn palette/font/IA khác.
3. `reports/orchestration/v7/implementation-plan.md` §2, §3, §3.1, §4 (W1), §5.1, §6 — kiến trúc CSS thay thế, quyền sở hữu file, hợp đồng primitive, cổng kiểm.
4. `reports/orchestration/v7/migration-inventory.md` §1, §2.1 (chỉ phần public/shell/shared) — chức năng phải giữ.
5. `reports/qa/v6-review.md` §4 — hai rủi ro phải không tái phạm: invite 422 bị coi là lỗi mạng; target link phụ <44px.

Nếu bất kỳ file nào mâu thuẫn với mandate, mandate thắng; ghi mâu thuẫn vào handoff.

## Phạm vi được sửa (chỉ những file này)

- `apps/web/index.html`
- `apps/web/src/main.tsx`
- `apps/web/src/styles/{fonts,tokens,base}.css` + **file shell CSS mới** (`src/styles/shell.css` hoặc tên tương đương) và `src/styles/layout.css` (được phép thu gọn/retire có kiểm)
- `apps/web/src/components/*` **trừ** `MeasurementChart*`
- `apps/web/src/app/*` (router, AppShell, ProtectedRoute, ComingSoon + test của chúng)
- `apps/web/src/lib/*`
- `apps/web/src/features/subjects/{SubjectSwitcher.tsx,SubjectSwitcher.test.tsx,selection.ts,useSubjects.ts}`
- `apps/web/src/features/realtime/*`, `apps/web/src/features/notifications/useUnreadNotifications*`
- `apps/web/src/test/{setup.ts,utils.tsx}`
- Được tạo file CSS foundation mới trong `src/styles/`. **Không** sửa page feature (Landing/Login/Register/Assistant/Alerts/Dashboard/History/Subjects/Share/Devices/Tasks/Settings/Admin/Studio), `features/*/api.ts` nghiệp vụ, `packages/contracts`, `apps/api`, `tools/*`.

Không xoá test hợp lệ. Không nới assertion. Không thêm dependency (fonts hiện có: `@fontsource/be-vietnam-pro`; nếu design-system yêu cầu họ chữ khác chưa cài thì dùng biến thể có sẵn và ghi rõ, **không `pnpm add`**).

## Việc phải làm

1. **Tokens/fonts/base:** thay hệ màu/chữ/spacing/radius/focus/motion theo design-system §2; bỏ nền kem + serif Newsreader khỏi đường render chính; giữ `prefers-reduced-motion`, chế độ chữ lớn (`lib/text-size.ts`), contrast AA cho text thường và focus ring rõ.
2. **`index.html`:** bỏ boot CSS/theme-color/noscript theo phong cách cũ, thay metadata trung tính `Theo dõi sức khỏe`; không nhãn “An Nhiên”, không hứa năng lực chưa có; giữ `#root`, lang vi, viewport, font preload hợp lý.
3. **Primitive:** `Button`/`ButtonLink` (variants + `sm|md`, target ≥44px, ref, native props), `TextField` (label/error/hint/required, giữ id liên kết), `Card`, `Alert`, `EmptyState`, `ErrorState`, `PageLoader`, `StatusPill`, `SkipLink`, `PageHeader`/`Section` nếu design-system cần. Mọi primitive phải có test hiện có chạy tiếp hoặc test mới cho hành vi mới; giữ heading level linh hoạt để không lồng H1.
4. **Shell:** rail desktop + header/thanh dưới mobile theo design-system; **đúng 4 mục** Hôm nay/Cảnh báo/Sức khỏe/Người thân (không “Thêm”), badge cảnh báo giữ, menu tài khoản ở avatar (Tài khoản/Quản trị nếu admin/Aa chữ lớn/Đăng xuất; **không Studio**), đóng bằng Escape/click ngoài/focus-out, arrow keys, `aria-expanded`, focus trả về trigger, skip link tới nội dung, active nav theo route. Giữ banner mất SSE và banner thông báo mới nếu đang có.
5. **Context hồ sơ gọn:** một dòng/khối nhỏ theo design-system, scope rõ `selected|pinned|collection|none`; không card full-width “Hồ sơ đang xem”; shell chỉ render `selected` cho trang subject-scoped; đổi hồ sơ không lộ dữ liệu/thread cũ (giữ cơ chế reset hiện có, bổ sung nếu thiếu). Không thêm provider mới nếu chỉ để đẩy tên lên shell — dùng route scope rõ ràng.
6. **Router:** giữ lazy chunks, `/app/notifications` → Cảnh báo (hoặc `?view=notifications` nếu bạn chọn, ghi rõ), alias `/app/assistant`, 404, ProtectedRoute, admin guard. Không đổi đường dẫn nghiệp vụ khác. Giữ query keys/SSE không đổi hành vi.
7. **CSS graph:** tách presentation foundation khỏi `layout.css` 3.5k dòng: tạo `shell.css` + phần primitive trong `base.css`; **retire** rule cũ đã thay (không để hai định nghĩa chồng), cập nhật `main.tsx` import đúng thứ tự. Phần CSS của feature để nguyên cho lane sau (có thể tạm tách file feature rỗng? **không** — chưa tách; lane tự lo). Ghi rõ trong handoff file nào còn rule cũ của feature để lane biết.
8. **Không** fake dữ liệu, không hard-code số liệu, không sửa API/quyền, không seed DB.

## Cổng kiểm trước khi báo xong

- `pnpm --filter @annhien/web typecheck` pass.
- Test liên quan: `AppShell`, `router`, `ProtectedRoute`, `TextSizeToggle`, `AppErrorBoundary`, `useSubjectEvents`, unread notifications, `SubjectSwitcher` (+ any primitive test bạn thêm) — chạy và dán output thật.
- `pnpm --filter @annhien/web build` pass (bắt CSS hỏng).
- Chạy dev server cổng riêng **4350** (API 3000 chỉ đọc, login demo là ngoại lệ duy nhất), chụp ảnh Chromium 1280×900, 390×844, 360×740, 390×844 chữ lớn: `/`, `/login`, `/app`, `/app/alerts`, `/app/subjects`, `/app/admin` (admin) — đo `scrollWidth <= clientWidth`, CTA/hành động chính trong viewport đầu, target chính ≥44px, menu tài khoản mở/đóng bằng bàn phím. Ảnh lưu `C:/tmp/v7-foundation/`; báo số đo thật, không nói “ổn”.
- `grep -rn "An Nhiên" apps/web/src apps/web/index.html` → 0 ngoài test âm bản.

## Bàn giao

- Commit nhỏ theo phase trên branch `v7-foundation` (tên worktree), **không merge**, không đụng master.
- `reports/handoffs/v7-foundation.md`: branch/SHA, file đã đổi, API primitive đã khoá (chữ ký component), CSS đã retire còn sót gì cho lane sau, số đo ảnh, test/build thật, phần chưa làm/không kiểm được, provider/model thật.
- Nếu bị chặn (thiếu quyền, API cần thay ngoài scope, provider lỗi): commit phần đang sạch, ghi blocker cụ thể, báo `worker_done` với trạng thái thật — **không** báo xong khi cổng chưa chạy.

Không tự mở worker khác, không ghi Obsidian, không push remote.

## Điều chỉnh sau cổng W0 (đã gửi worker `msg_8941c5acada8`)

Áp dụng `reports/orchestration/v7/decisions.md`. Thay các chỗ trái trong spec gốc:

- Ảnh: `reports/qa/evidence/v7-foundation/`, **không** `C:/tmp`.
- CSS: chỉ retire selector foundation khỏi `layout.css`; giữ block feature; `layout.css` do F sở hữu tới W3; cổng “không double CSS” dời W3; kèm ledger selector→file cũ→owner→trạng thái.
- Context: shell-only cho 5 trang, trên H1, tên “Người được theo dõi”; F được patch tối thiểu `AssistantPage.tsx` + locator test C.
- “Đúng 4 mục” chỉ với tài khoản có hồ sơ; admin không hồ sơ giữ nav Quản trị + `/app` → `/app/admin`.
- `index.html`: giữ boot/noscript, chỉ đổi theme-color `#F4F7FB` + skeleton tĩnh xanh xám không shimmer.
- `/app/notifications` → `/app/alerts?view=notifications` (bắt buộc).
- Banner: link `/app/alerts/{incidentId}`; ẩn chỉ khi đúng incident/inbox; ưu tiên mất quyền > thông báo mới > mất SSE.
- Import CSS: fonts → tokens → base → legacy `layout.css` (feature) → shell; primitive CSS tại `src/components/primitives.css`.
- Purge cache: registry key có subjectId + `purgeSubjectData`; không xoá toàn bộ `['alerts']`.
- QA: pin `WEB_ORIGIN=http://127.0.0.1:4350`, seed PGlite cục bộ; đo mọi action đứng riêng ≥44×44; active nav History/Devices/alias; grep Newsreader/`#faf6ed`/`--font-display`.
