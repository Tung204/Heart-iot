# Worker v4 — ứng dụng khách hàng tối giản

## Bối cảnh

Người dùng bác giao diện hiện tại: quá nhiều thông tin, quá nhiều chữ, nhiều màn hình nhồi vào một chỗ. Không làm preview. Thay trực tiếp bằng giao diện cho người dùng phổ thông: mở lên hiểu ngay, không cần hướng dẫn.

Chỉ sửa các file trong phạm vi. Không sửa `apps/web/src/pages/*` (worker công khai sở hữu), `apps/web/src/features/admin/*` (worker admin sở hữu), `apps/web/src/main.tsx`, `apps/web/src/styles/layout.css`, `tokens.css`, `public-simple.css`, `admin-simple.css`, `docs/`, README, API/contracts/package.json, `reports/` trừ handoff.

## Phạm vi file

- `apps/web/src/app/AppShell.tsx`, `AppShell.test.tsx`
- `apps/web/src/app/router.tsx`, `router.test.tsx`
- `apps/web/src/features/assistant/AssistantPage.tsx`, `AssistantPage.test.tsx`
- `apps/web/src/features/dashboard/DashboardPage.tsx`, `DashboardPage.test.tsx`
- `apps/web/src/features/alerts/AlertsPage.tsx`, `AlertsPage.test.tsx`
- `apps/web/src/features/alerts/AlertDetailPage.tsx`, `AlertDetailPage.test.tsx`
- `apps/web/src/features/subjects/SubjectsPage.tsx`, `SubjectsPage.test.tsx`
- `apps/web/src/features/subjects/SubjectSwitcher.tsx` (chỉ copy/nhãn nếu cần)
- `apps/web/src/features/history/HistoryPage.tsx`, `HistoryPage.test.tsx`
- `apps/web/src/features/devices/DevicesPage.tsx`, `DevicesPage.test.tsx`
- `apps/web/src/features/notifications/NotificationsPage.tsx`, `NotificationsPage.test.tsx`
- `apps/web/src/features/tasks/TasksPage.tsx`, `TasksPage.test.tsx`
- `apps/web/src/features/settings/SettingsPage.tsx`, `SettingsPage.test.tsx`, `ProfileCard.tsx`, `PasswordCard.tsx`, `SessionsCard.tsx`
- `apps/web/src/features/share/SharePage.tsx`, `SharePage.test.tsx`
- `apps/web/src/styles/app-simple.css`

Không đổi API/hook/contract. Không thêm dependency. Không đổi backend.

## Nguyên tắc bắt buộc

1. Mỗi màn một mục đích. Không lặp lại cùng một thông tin ở nhiều khối.
2. Không quá **1 câu mô tả** dưới mỗi tiêu đề trang. Bỏ mọi đoạn giải thích quy trình, “lưu ý”, disclaimer lặp lại. Disclaimer chỉ xuất hiện một lần ở nơi thật cần.
3. Không dùng “demo”, “đồ án”, “giảng viên”, “nghiệm thu”, “chưa được duyệt”. Không hiện email `@demo…` trong sidebar; hiện tên + vai trò.
4. Không hiển thị toàn bộ báo cáo ngay khi mở app. Trang đầu chỉ trả lời: **ai, hôm nay thế nào, cần làm gì, hỏi ở đâu**.
5. Giữ hành vi: quyền 403, đổi hồ sơ reset hội thoại, phản hồi cũ không ghi vào hội thoại mới, alert không auto-ack, dữ liệu mô phỏng được ghi nguồn.
6. Mobile 390×844, 360×740, chữ lớn: không tràn ngang; ô hỏi + nút gửi nằm trong màn đầu; bottom-nav ≤4 mục.
7. Test copy thay đổi phải cập nhật đúng; không nới assertion.

## Điều hướng mới

### Desktop sidebar

Chỉ 4 mục chính:

1. `Hôm nay` → `/app`
2. `Cảnh báo` → `/app/alerts` (badge mở)
3. `Người thân` → `/app/subjects`
4. `Thêm` → menu phụ

`Thêm` chứa: `Thiết bị`, `Thông báo`, `Công việc`, `Cài đặt`, `Studio` (nếu có quyền), `Quản trị` (admin). Không đưa `Tổng quan`, `Lịch sử` vào menu chính; hai trang này mở từ liên kết trong Hôm nay/Người thân.

- Người dùng chỉ admin, không có hồ sơ: sidebar chỉ `Quản trị` + `Cài đặt`; logo dẫn `/app/admin`. Router hiện có chuyển `/app` → `/app/admin`, giữ.
- Logo/brand dẫn `/app`; bỏ dòng mô tả dài dưới logo, chỉ giữ tên sản phẩm.
- Khu người dùng cuối sidebar: tên hiển thị + vai trò (`Chủ hồ sơ` / `Người thân` / `Quản trị`), nút đăng xuất. Không hiện email thô.
- Giữ nút chữ lớn và skip link.

### Mobile bottom-nav

4 mục: `Hôm nay`, `Cảnh báo`, `Người thân`, `Thêm`. `Thêm` mở danh sách phụ. Không nhét Trợ lý/Tổng quan/Lịch sử/Thiết bị/Thông báo vào bottom-nav.

## Trang Hôm nay `/app` (thay AssistantPage)

Đây là trang mặc định. **Không** còn bản tin 7 ngày, 4 ô chỉ số, dòng độ phủ, `<details>` báo cáo, cột “Bối cảnh” bên phải, hay lời chào dài.

Bố cục còn:

```text
Hôm nay
Bà Trần Thị An

[ Trạng thái — một câu ]
[ hành động chính nếu cần ]

Hỏi về bà An…
[ Nhập câu hỏi… ] [ Gửi ]
Nhịp tim?  Cảnh báo?  Pin?

Xem sức khỏe chi tiết →   Lịch sử đo →
```

1. H1 `Hôm nay`; dưới là tên hồ sơ đang xem (SubjectSwitcher giữ nguyên).
2. **Một thẻ trạng thái** lấy từ dữ liệu hiện có (summary/status/alerts), chỉ một câu:
   - Có cảnh báo mở: `Có N cảnh báo chưa xử lý.` + nút chính `Xem cảnh báo`.
   - Không cảnh báo, có dữ liệu: `Không có cảnh báo mở. Dữ liệu cập nhật {thời gian}.`
   - Chưa có dữ liệu: `Chưa nhận dữ liệu từ thiết bị.` + link `Kiểm tra thiết bị`.
   - 403 quyền xem số đo: `Bạn chưa được xem số đo của hồ sơ này.` — là trạng thái quyền, không phải lỗi tải.
   - Không tự bịa số/câu trạng thái nếu API lỗi; hiện trạng thái lỗi ngắn.
3. **Ô hỏi trợ lý** ngay dưới trạng thái:
   - textarea/input + nút `Gửi` (mobile hiện chữ `Gửi`, aria-label `Gửi câu hỏi`).
   - 3 gợi ý ngắn, một hàng cuộn ngang: `Nhịp tim?`, `Cảnh báo?`, `Pin?`.
   - Hội thoại chỉ xuất hiện sau khi người dùng gửi câu hỏi đầu tiên. Không tự gọi API tóm tắt để đổ báo cáo dài lên màn đầu.
   - Giữ hội thoại nhiều lượt, trạng thái đang trả lời, lỗi, 403, reset khi đổi hồ sơ, chống phản hồi cũ.
4. Hai liên kết phụ: `Xem sức khỏe chi tiết` → `/app/overview`; `Lịch sử đo` → `/app/history`.
5. Một dòng nhỏ cuối trang: `Dữ liệu mô phỏng · không thay thế cấp cứu.` Không lặp lại ở từng thẻ.
6. Không hiển thị pin, độ phủ, số mẫu, khoảng thiếu trên màn đầu.

## Các trang còn lại — rút gọn, liên kết

- `/app/overview`: H1 `Sức khỏe`. Giữ các chỉ số/cảnh báo/biểu đồ hiện có nhưng bỏ đoạn mở đầu dài; có link `← Hôm nay`. Đây là nơi xem chi tiết.
- `/app/history`: H1 `Lịch sử đo`; giữ bộ lọc/biểu đồ/CSV; bỏ đoạn giải thích dài; link `← Sức khỏe`.
- `/app/alerts`: H1 `Cảnh báo`; một câu ngắn; giữ danh sách, hành động; không lặp disclaimer dài.
- `/app/alerts/:id`: giữ chi tiết và quyền; rút gọn copy.
- `/app/subjects`: H1 `Người thân`. Mỗi hồ sơ là một thẻ ngắn: tên, vai trò/quan hệ, hành động `Xem sức khỏe`, `Chia sẻ`, `Thiết bị`. Tạo hồ sơ/mời người thân giữ chức năng nhưng đặt dưới `Thêm thao tác`/`<details>` hoặc nút phụ, không chiếm màn đầu. Bỏ đoạn hướng dẫn dài.
- `/app/devices`: H1 `Thiết bị`; trạng thái + hành động; bỏ giải thích dài. Vẫn giữ route, chỉ vào từ `Thêm`/Người thân.
- `/app/notifications`: H1 `Thông báo`; bảng ngắn; route vẫn giữ nhưng không nằm nav chính.
- `/app/tasks`: H1 `Công việc`; giữ tạo/đóng; bỏ mô tả dài.
- `/app/settings`: H1 `Cài đặt`; giữ tài khoản/mật khẩu/phiên; bỏ email demo khỏi phần hiển thị hồ sơ nếu có thể, thay bằng `Email đăng nhập đã xác thực` hoặc tên tài khoản.
- `/app/subjects/:id/share`: H1 `Chia sẻ quyền xem`; giữ chức năng; rút gọn.

Không xóa route đang có để không làm hỏng deep link. Không thêm màn mới nếu không cần.

## Kiểm và bàn giao

1. `pnpm --filter @annhien/web test` — cập nhật test copy/nav; không nới assertion. Nếu test cũ yêu cầu nav cũ, sửa test theo IA mới, không xóa hành vi.
2. `pnpm --filter @annhien/web typecheck`
3. `pnpm --filter @annhien/web build`
4. Chạy dev cổng riêng 4320 (không dùng 5173); API 3000 dùng chung, không seed/không xóa DB.
5. Chụp và kiểm:
   - `/app` owner 1280×900, 390×844, 360×740, chữ lớn 390
   - `/app/overview`, `/app/alerts`, `/app/subjects`, `/app/history` 1280×900
   - bottom-nav và ô hỏi/nút Gửi trên 390/360: nút phải nằm trên bottom-nav
   - `scrollWidth - clientWidth === 0` trên tất cả
   - không còn chữ `Bối cảnh`, `Độ phủ`, `bản tin` trên màn Hôm nay
6. Commit branch riêng; không merge. Không sửa docs/README/HTML.
7. Ghi `reports/handoffs/v4-simple-app.md`: file đổi, output test/typecheck/build thật, ảnh, số đo overflow/vị trí nút, phần chưa làm.
