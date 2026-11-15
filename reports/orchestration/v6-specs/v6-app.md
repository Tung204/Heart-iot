# v6 app — bỏ card hồ sơ, gọn Hôm nay/Người thân

Base master `08fd3b5`. Chỉ sửa `AssistantPage.tsx/.test`, `SubjectsPage.tsx/.test`, `SubjectSwitcher.tsx/.test`, `subjects.css`, `app-simple.css` (phần app pages). Không sửa AppShell/router/public/API.

## Vấn đề người dùng chỉ ra

- Card `HỒ SƠ ĐANG XEM · CHỦ HỒ SƠ` full-width, link “Quản lý và chia sẻ” xa, dư thừa.
- Link “Sức khỏe 7 ngày” + disclaimer bị đẩy xuống đáy, mồ côi.
- Trang Người thân: card quản lý hồ sơ kiểu settings, “Thêm người” tách rời, khoảng trắng lớn.
- Nếu nhiều hồ sơ, “Xem sức khỏe” trong danh sách không đổi active subject (bug).

## Việc bắt buộc

1. **Bỏ SubjectSwitcher khỏi Hôm nay**. Thay bằng:
   - Một dòng ngữ cảnh gọn dưới H1: `Bà Trần Thị An` (vai trò nhỏ nếu cần). Nếu có >1 hồ sơ, dùng `<select>`/menu nhỏ cùng hàng; nếu 1 hồ sơ, chỉ chữ, không khung card, không label “Hồ sơ đang xem”, không link “Quản lý và chia sẻ”.
   - Không lặp tên 2 lần.
2. Hôm nay: đưa link `Sức khỏe 7 ngày` và dòng `Dữ liệu mô phỏng · không thay thế cấp cứu.` lên ngay dưới khối trạng thái/hỏi, không để trôi xuống đáy trang. Không thêm nội dung mới.
3. Người thân:
   - Header một hàng: H1 `Người thân` + nút `Thêm người` (mở form tại chỗ).
   - Danh sách hồ sơ dạng hàng gọn: tên, vai trò, trạng thái quyền; actions `Xem sức khỏe`, `Chia sẻ`, `Thiết bị` gọn; không card full-width kiểu settings.
   - **`Xem sức khỏe` phải `setActiveSubjectId(item.id)` trước khi điều hướng**; `Thiết bị` cũng set active.
   - Bỏ section `Thêm người`/`Tạo hồ sơ mới` tách rời; form chỉ hiện khi bấm nút.
   - `Thêm thao tác`/lưu trữ/xóa giữ quyền và xác nhận hiện có; đặt cuối hàng, không chiếm ưu thế.
4. Nếu SubjectSwitcher không còn dùng, xóa file/test hoặc thay bằng component compact mới; không để import chết.
5. Giữ các trạng thái 403/offline/stale/empty; không đổi API.

## Kiểm

Web test/typecheck/build; ảnh `/app`, `/app/subjects` ở 1280/390/360/large; 0 tràn ngang; click “Xem sức khỏe” đổi đúng subject; form thêm mở/đóng. Handoff `reports/handoffs/v6-app.md`; commit branch `v6-app`; không merge.
