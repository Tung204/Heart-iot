# v6 shell — bỏ Thêm, menu tài khoản, nav 4 màn, bỏ tên tự đặt

Base master `08fd3b5`. Chỉ sửa `apps/web/src/app/AppShell.tsx`, `apps/web/src/app/router.tsx`, `AppShell.test.tsx`, `router.test.tsx` và CSS shell (`app-simple.css`/`layout.css` nếu cần). Không sửa API, public pages, AssistantPage/SubjectsPage (worker khác).

## Việc bắt buộc

1. **Bỏ hoàn toàn mục “Thêm”/MoreMenu** khỏi shell và bottom-nav. Nav chính còn đúng 4:
   - Hôm nay `/app`
   - Cảnh báo `/app/alerts` (badge mở)
   - Sức khỏe `/app/overview`
   - Người thân `/app/subjects`
   Không thêm mục thứ 5 trên nav. Các màn cũ vẫn giữ route để mở từ ngữ cảnh.
2. **Menu tài khoản ở avatar/topbar** (desktop: góc phải topbar hoặc cuối sidebar; mobile: topbar):
   - Tên + vai trò (không email).
   - `Tài khoản` → `/app/settings`.
   - `Studio` chỉ chủ hồ sơ/admin; `Quản trị` chỉ admin.
   - `Đăng xuất` có bước hỏi lại; `Aa` chữ lớn đặt trong menu hoặc cạnh avatar, không thành nút trần ở sidebar.
   - Đóng bằng Escape/click ngoài, `aria-expanded`, focus trả về trigger. Không render 2 bản menu.
3. **Bỏ SubjectSwitcher khỏi shell** (không còn card “HỒ SƠ ĐANG XEM” trên mọi trang). Worker app sẽ đặt bộ chọn gọn ở Hôm nay.
4. **Bỏ brand “An Nhiên” khỏi UI shell**; thay bằng chữ trung tính `Theo dõi sức khỏe` (không tự đặt brand mới). Link về `/app`.
5. `/app/notifications` **redirect** sang `/app/alerts` (hoặc giữ route nhưng không có mục nav; ưu tiên redirect). `/app/history`, `/app/devices`, `/app/tasks`, `/app/studio` vẫn mở được từ ngữ cảnh/nút.
6. Admin-only: nav Quản trị + Cài đặt trong menu tài khoản; không hiện Cảnh báo/Người thân rỗng.
7. Bỏ khối account footer nặng (Đăng xuất/Aa trần) ở sidebar; thay bằng menu tài khoản gọn. Không làm sidebar cao quá viewport 900.

## Không làm

- Không đổi API/quyền/dữ liệu; không thêm feature; không sửa trang public/Assistant/Subjects; không merge.
- Không dùng “An Nhiên” trong text/aria/title mới.

## Kiểm

Web test/typecheck/build; ảnh 1280×900, 390×844, 360×740, 390 chữ lớn; 0 tràn ngang; nav đúng 4; menu đóng/mở/focus; mobile không còn “Thêm”. Handoff `reports/handoffs/v6-shell.md`; commit branch `v6-shell`.
