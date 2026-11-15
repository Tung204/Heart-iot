# Worker v4 — quản trị tối giản

## Bối cảnh

Người dùng bác giao diện hiện tại vì quá nhiều chữ và nhiều khối. Trang quản trị cũng phải sửa cùng nguyên tắc: nhìn vào hiểu, một màn một mục đích, không nhồi.

Chỉ sửa trong phạm vi. Không sửa `AppShell.tsx`, `router.tsx`, `main.tsx`, `layout.css`, `tokens.css`, `app-simple.css`, `public-simple.css`, public pages, API/contracts/docs/README/package.json, `reports/` trừ handoff.

## Phạm vi file

- `apps/web/src/features/admin/AdminPage.tsx`
- `apps/web/src/features/admin/AdminPage.test.tsx`
- `apps/web/src/features/admin/AdminDevicesTab.tsx` (chỉ copy/aria nếu cần)
- `apps/web/src/features/admin/api.ts` (chỉ nếu cần đổi kiểu hiển thị; không đổi endpoint)
- `apps/web/src/styles/admin-simple.css` (được tạo sẵn, điền vào đây)
- `apps/web/src/features/admin/admin-devices.css` (chỉ khi cần layout thiết bị)

Không thêm dependency, không đổi backend.

## Thiết kế bắt buộc

### Khung trang

- H1 `Quản trị`.
- Một câu duy nhất: `Theo dõi hệ thống và xử lý tài khoản.`
- Bốn tab, nhãn ngắn:
  1. `Tổng quan`
  2. `Người dùng`
  3. `Thiết bị`
  4. `Nâng cao`
- `Nâng cao` chứa hai mục con `Chính sách` và `Nhật ký` (audit). Có thể dùng hai nút con trong tab, không cần thêm tab cấp 1.
- Bỏ mọi đoạn mô tả dài, banner lặp lại, ghi chú kỹ thuật không cần cho thao tác.

### Tổng quan

Chỉ 4 ô số chính, một hàng (mobile 2×2):

- `Người dùng hoạt động`
- `Thiết bị trực tuyến`
- `Cảnh báo đang mở`
- `Thông báo lỗi` (outbox failed)

Bên dưới, chỉ khi có bất thường, một khối `Cần chú ý` tối đa 3 dòng:
- `N cảnh báo đang mở`
- `N thiết bị ngoại tuyến`
- `N thông báo gửi lỗi`
Không hiển thị 9 nhóm số như hiện tại. Không thêm biểu đồ mới.

### Người dùng

- Giữ tìm kiếm/lọc/bảng/khóa-mở khóa và lý do.
- Rút gọn form lọc còn một hàng; bỏ hint dài.
- Bảng giữ cột cần thiết: Người dùng, Vai trò, Trạng thái, Hành động. Cột `Tạo` có thể bỏ nếu không cần; không mất dữ liệu chức năng.
- Thông báo lỗi/thành công ngắn, một dòng.

### Thiết bị

- Giữ nguyên chức năng hiện có (danh sách, trạng thái, hành động).
- Bỏ đoạn mở đầu dài; chỉ giữ bảng + hành động.

### Nâng cao → Chính sách

- Giữ đầy đủ 5 trường và nút xem trước/lưu.
- Xếp trường thành lưới 2 cột desktop, 1 cột mobile; nhãn ngắn.
- Không thêm giải thích dài; chỉ giữ cảnh báo thật khi publish lỗi/xung đột.

### Nâng cao → Nhật ký

- Giữ bảng audit, bộ lọc hiện có; bỏ mô tả dài.
- Nếu bảng quá rộng trên mobile, cho cuộn ngang trong vùng bảng, không tràn toàn trang.

## Nguyên tắc

- Không dùng “demo”, “đồ án”, “giảng viên”, “nghiệm thu”.
- Không bịa số. Giữ dữ liệu thật từ API.
- Mỗi vùng chỉ một tiêu đề; không lặp “Quản trị hệ thống” nhiều lần.
- Nút ≥44px, focus rõ, label đầy đủ.
- Mobile 390×844/360×740 không tràn ngang.
- Cập nhật test theo tab mới; giữ test hành vi (khóa user cần lý do, policy publish, audit). Không nới assertion.

## Kiểm và bàn giao

1. `pnpm --filter @annhien/web test -- AdminPage` (và toàn bộ web test).
2. `pnpm --filter @annhien/web typecheck`
3. `pnpm --filter @annhien/web build`
4. Dev cổng riêng 4330 (không 5173), API 3000; đăng nhập admin, chụp:
   - `/app/admin` Tổng quan 1280×900, 390×844, 360×740
   - Người dùng, Thiết bị, Nâng cao/Chính sách, Nâng cao/Nhật ký 1280×900
   - kiểm `scrollWidth - clientWidth === 0`
5. Không seed/xóa DB. Commit branch riêng; không merge.
6. Ghi `reports/handoffs/v4-simple-admin.md`: file đổi, output thật, ảnh, overflow, phần chưa làm.
