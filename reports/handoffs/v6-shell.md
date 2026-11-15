# Handoff — gọn shell v6: bỏ “Thêm”, menu tài khoản, nav 4 mục

**Nhánh:** `v6-shell` (base `08fd3b5`).
**Commit code:** `4a03045` — `feat(web): gọn shell v6 — nav 4 mục, menu tài khoản, bỏ Thêm`.
**Phạm vi:** `apps/web/src/app/AppShell.tsx`, `apps/web/src/app/router.tsx`, `AppShell.test.tsx`, `router.test.tsx`, `apps/web/src/styles/layout.css`, `apps/web/src/styles/app-simple.css`. Không sửa API, contracts, public pages, `AssistantPage`, `SubjectsPage`, `SubjectSwitcher`; không merge.
**Ngày đo:** 15/11/2026 (Asia/Ho_Chi_Minh).

## 1. Đã làm

| Yêu cầu | Cách làm | Bằng chứng |
| --- | --- | --- |
| Bỏ hoàn toàn “Thêm”/MoreMenu | Xóa component `MoreMenu`, type `MoreItem`, state/ref/effect và toàn bộ CSS `.shell__more*`. Hai thanh nav chỉ còn link. | `AppShell.test.tsx`: không có `button` tên “Thêm”, không có `.shell__more`, `.shell__more-toggle`; visual check `noMore=true` ở 4 kích thước. |
| Nav chính đúng 4 | Hôm nay `/app`, Cảnh báo `/app/alerts` (badge cảnh báo mở), Sức khỏe `/app/overview`, Người thân `/app/subjects`. Không thêm mục thứ năm. | Ảnh `app-1280x900.png`, `app-390x844.png`, `app-360x740.png`; `nav4=true`, `navRoutes=true`, `bottom4=true` ở mọi kích thước. |
| Menu tài khoản ở avatar/topbar | Một component `AccountMenu` duy nhất, render theo breakpoint: cuối sidebar ở desktop, góc phải topbar ở mobile. Nội dung: tên + vai trò (không email), `Tài khoản` → `/app/settings`, `Studio` cho chủ hồ sơ/admin, `Quản trị` cho admin, `Aa` chữ lớn trong menu, `Đăng xuất` hỏi lại. Có `role="menu"`, `aria-haspopup`, `aria-expanded`, `aria-controls`; mở thì focus mục đầu, mũi tên/Home/End di chuyển, Tab ra ngoài đóng, Escape/click ngoài đóng và Escape trả focus về trigger. | Test `AppShell — menu tài khoản một bản, đóng được`; ảnh `app-menu-*`; visual check `oneMenu=true`, `expanded=true`, `escapeClosed=true`, `menuFits=true`, `menuNoEmail=true`. |
| Bỏ SubjectSwitcher khỏi shell | Không còn import/render `SubjectSwitcher` trong `AppShell`; bỏ biến `onTodayPage` và CSS phụ thuộc. Bộ chọn hồ sơ trên nội dung Hôm nay vẫn do `AssistantPage` của worker app xử lý, ngoài phạm vi này. | Test `không còn card “Hồ sơ đang xem” (SubjectSwitcher) trên khung`; visual check `.shell__content > .subject-switcher` không có. |
| Bỏ brand “An Nhiên” khỏi shell | Sidebar và topbar dùng chữ trung tính `Theo dõi sức khỏe`, cùng link `/app`; thêm style riêng để chữ vừa sidebar 17rem và topbar 360. | Test brand trung tính; visual check `noBrand=true`, `neutralBrand=true`. |
| Redirect `/app/notifications` | Route giữ đường dẫn nhưng render `<Navigate to="/app/alerts" replace />`; bỏ lazy import `NotificationsPage` khỏi router. Banner “Xem thông báo” trỏ thẳng `/app/alerts`. | `router.test.tsx`: `/app/notifications → /app/alerts`; visual check `notificationsRedirect=true`. |
| Admin-only | Admin không có hồ sơ: nav chỉ `Quản trị`; `Tài khoản` trong menu; không render Cảnh báo/Người thân rỗng. Admin có hồ sơ vẫn nav 4, `Quản trị` nằm trong menu tài khoản. | Test `admin không có hồ sơ → nav chỉ Quản trị…`; ảnh `app-admin-1280x900.png`; visual check admin `navOnlyAdmin=true`, `noEmptyNav=true`, `menuSettings=true`, `menuAdmin=true`, `menuStudio=true`. |
| Bỏ khối account footer nặng | Xóa `LogoutControl`, nút Đăng xuất/Aa trần, khối `.shell__user*`, `.shell__topbar-logout`, `.shell__logout-confirm--topbar`; thay bằng trigger tài khoản gọn ở cuối sidebar. Sidebar không cuộn quá viewport 900. | Visual check 1280×900: `sidebarFits=true` (`scrollHeight <= clientHeight`, trigger bottom ≤ 900); ảnh `app-1280x900.png`. |

## 2. Test đã sửa/thêm

- `AppShell.test.tsx`: bốn mục nav + route; không còn “Thêm”; menu tài khoản một bản theo breakpoint; đóng bằng Escape/click ngoài/focusout; focus trả trigger; mũi tên/Home/End; `Aa` trong menu; đăng xuất hỏi lại + Hủy giữ phiên; tên/vai trò không email; brand trung tính; bỏ card hồ sơ khỏi shell; banner thông báo/gộp Cảnh báo; admin-only.
- `router.test.tsx`: thêm kiểm tra link `Sức khỏe` → `/app/overview`, nav Hôm nay/Người thân và redirect `/app/notifications` → `/app/alerts`.
- Không nới test để che lỗi; các test quyền, badge, SSE, cuộn đầu trang, chuyển động và “không lặp disclaimer” vẫn giữ.

## 3. Kiểm chứng đã chạy

```text
pnpm build:contracts                        exit 0
pnpm --filter @annhien/web typecheck        exit 0
pnpm --filter @annhien/web test             35 file / 253 test pass
pnpm --filter @annhien/web build            exit 0
```

Trình duyệt: Chromium headless qua Playwright, API riêng cổng 3001 với PGlite `.data/pglite-v6-shell`, web Vite cổng 5180 (cổng 3000/5173 đang bận bởi tiến trình khác, không dùng). Đăng nhập bằng `context.request` với tài khoản seed `ba-an@demo.annhien.local` (owner) và `admin@demo.annhien.local`; không bấm xác nhận/đóng cảnh báo, không sửa dữ liệu.

Kết quả tự động (mọi điều kiện đều PASS):

| Điều kiện | overflow ngang | Nav | Menu | Sidebar |
| --- | --- | --- | --- | --- |
| 1280×900 | 0 | 4 đúng route | một bản, đóng/focus đúng | vừa viewport, không cuộn |
| 390×844 | 0 | 4 đúng route | một bản, đóng/focus đúng | — |
| 360×740 | 0 | 4 đúng route | một bản, đóng/focus đúng | — |
| 390×844 chữ lớn | 0 | 4 đúng route | một bản, đóng/focus đúng | — |

Ảnh và số đo thô ở `C:/tmp/v6-shell/`:
`app-1280x900.png`, `app-menu-1280x900.png`, `app-390x844.png`, `app-menu-390x844.png`,
`app-360x740.png`, `app-menu-360x740.png`, `app-390x844-large.png`, `app-menu-390x844-large.png`,
`app-admin-1280x900.png`; tổng hợp trong `results.json`.

## 4. Chưa làm / cần biết

- `AssistantPage` ở base hiện vẫn tự render `SubjectSwitcher` trên Hôm nay; đúng phạm vi worker app v6 sẽ thay bằng bộ chọn gọn. Shell đã bỏ card này, nên trang khác không còn “HỒ SƠ ĐANG XEM”.
- Tài khoản admin seed có `displayName` là “Quản trị An Nhiên”; menu hiển thị tên tài khoản này như dữ liệu, không phải brand shell. Không sửa seed/API theo yêu cầu.
- Chưa chạy bộ Playwright E2E có sẵn (cấu hình trỏ cổng 5173 và chỉ kiểm public); kiểm shell bằng script Chromium riêng nêu trên.
- Không merge; không đổi API/quyền/dữ liệu.
