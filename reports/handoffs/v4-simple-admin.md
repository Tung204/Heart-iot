# Handoff — v4-simple-admin

- **Thời điểm:** 2026-11-15 khoảng 13:30 (Asia/Ho_Chi_Minh), worktree
  `v4-simple-admin`.
- **Nhánh:** `v4-simple-admin` (không merge master). Base `b778486`.
- **Commit code:** `a4d6929bc57c10819a352e738e90e8d9ed06f68c`
  `feat(web): quản trị tối giản bốn tab` (4 file).
- **Commit handoff:** file này là commit riêng ngay sau commit code.
- **Phạm vi đã sửa:** `apps/web/src/features/admin/AdminPage.tsx`,
  `AdminPage.test.tsx`, `AdminDevicesTab.tsx` (chỉ bỏ copy mở đầu),
  `apps/web/src/styles/admin-simple.css`. Không sửa `AppShell.tsx`, `router.tsx`,
  `main.tsx`, `layout.css`, `tokens.css`, `app-simple.css`, `public-simple.css`,
  public pages, API/contracts/docs/README/package.json; không thêm dependency.

## Kết quả chính

### Khung trang

- H1 `Quản trị` + đúng một câu `Theo dõi hệ thống và xử lý tài khoản.`
- Bốn tab cấp 1: `Tổng quan`, `Người dùng`, `Thiết bị`, `Nâng cao`.
- `Nâng cao` có hai nút con `Chính sách` và `Nhật ký` (audit), mặc định
  `Chính sách`; không thêm tab cấp 1.
- Bỏ toàn bộ page lead cũ, banner/ghi chú kỹ thuật dài ở các tab.

### Tổng quan

- Chỉ 4 ô số: `Người dùng hoạt động`, `Thiết bị trực tuyến`,
  `Cảnh báo đang mở`, `Thông báo lỗi` (outbox failed). Desktop một hàng;
  mobile 2×2 (grid 2 cột ≤767px).
- Khối `Cần chú ý` chỉ render khi có bất thường, tối đa 3 dòng và chỉ các dòng
  có số > 0: cảnh báo đang mở, thiết bị ngoại tuyến, thông báo gửi lỗi.
- Không còn 9 nhóm số cũ (`Tài khoản`, `Hồ sơ và thiết bị`, `Vận hành`).

### Người dùng

- Giữ tìm kiếm, lọc trạng thái, phân trang, tạm khóa/kích hoạt và bắt buộc lý do.
- Form lọc một hàng trên desktop (mobile: ô tìm full dòng, trạng thái + `Lọc`
  cùng hàng); bỏ hint dài.
- Bảng còn `Người dùng`, `Vai trò`, `Trạng thái`, `Hành động`; bỏ cột `Tạo`.
- Mobile ≤767px: bảng chuyển thành thẻ có nhãn cột qua `data-label`, không cuộn
  ngang; nút hành động full chiều rộng thẻ.
- Thông báo thành công một dòng, ví dụ `Đã tạm khóa tài khoản Ngọc.`

### Thiết bị

- Giữ nguyên chức năng: danh sách, trạng thái, tạo mã gắn, đổi khóa có xác nhận,
  tải lại, mã/khóa chỉ hiện một lần.
- Bỏ hai đoạn mở đầu dài (giải thích policy/offline, ghi chú sức khỏe/pin);
  giữ tiêu đề, nút tải lại, danh sách và hành động.

### Nâng cao → Chính sách

- Giữ đủ 5 trường policy, nút `Xem trước` / `Phát hành`, ràng buộc preview–digest,
  xử lý 409 `APPROVAL_STALE`, cảnh báo/diff thật từ server.
- Lưới 2 cột desktop, 1 cột ≤639px; nhãn rút gọn; ghi chú phát hành full dòng.
- Bỏ đoạn giải thích dài; chỉ còn một dòng ngắn `Xem trước để bật Phát hành.`
- Lịch sử phiên bản + `Điền giá trị mặc định` gấp trong `<details>` để không
  chiếm màn; bỏ digest khỏi danh sách hiển thị.

### Nâng cao → Nhật ký

- Giữ bảng audit và bộ lọc hành động/người thực hiện + phân trang.
- Bảng 5 cột: Hành động, Người thực hiện, Kết quả, Thời gian, Chi tiết; tên
  người thực hiện lấy từ danh sách user (fallback id ngắn), target hiển thị dưới
  tên; metadata vẫn mở được qua `Xem chi tiết`.
- Mobile: bảng cuộn ngang trong `.adm-table-wrap` (không tràn trang), có dòng
  `Vuốt ngang để xem đủ cột.` chỉ hiện ≤767px.

## Bằng chứng chạy (output thật)

Môi trường: Windows, Node v24.22.2, pnpm 12.5.1; đã chạy
`pnpm build:contracts` trước khi typecheck/build.

| Lệnh | Kết quả |
| --- | --- |
| `pnpm --filter @annhien/web test -- AdminPage` | pass — **33 file / 200 test**, 19.10s. Lưu ý: Vitest nhận `--` thành pattern nên lệnh này chạy toàn bộ web suite. |
| `pnpm --filter @annhien/web exec vitest run AdminPage` | pass — **1 file / 18 test**, 4.92s. |
| `pnpm --filter @annhien/web test` | pass — **33 file / 200 test**, 10.11s (baseline 197). |
| `pnpm --filter @annhien/web typecheck` | exit 0 (`tsc -p tsconfig.json --noEmit`). |
| `pnpm --filter @annhien/web build` | exit 0, `✓ built in 483ms`. |
| Playwright đo overflow (script tạm đã xoá) | **17 lượt đo, `scrollWidth - clientWidth = 0` ở tất cả**, 0 pageerror. |

### Test đã thêm/cập nhật

- Tổng quan: đúng 4 số + nhãn mới; `Cần chú ý` hiện dòng bất thường, ẩn khi
  mọi số bất thường bằng 0; không còn nhóm số cũ.
- Người dùng: khóa tài khoản buộc nhập lý do (không gọi PATCH khi thiếu lý do),
  body PATCH đúng `{status, reason}`, bảng tải lại trạng thái mới.
- Khung trang: 4 tab chính + 2 mục con `Chính sách`/`Nhật ký`.
- Policy/audit: cập nhật tab mới, nhãn policy mới và thông điệp tiếng Việt; giữ
  nguyên các assertion publish, 409 stale, preview hết hiệu lực, audit metadata.
- Test thiết bị giữ nguyên hành vi và chỉ đổi assertion tab cấp 1.

## Ảnh kiểm tra

Thư mục: `C:/tmp/ui-v4-admin`.

- Bắt buộc: `overview-1280x900.png`, `overview-390x844.png`,
  `overview-360x740.png`, `users-1280x900.png`, `devices-1280x900.png`,
  `policy-1280x900.png`, `audit-1280x900.png`.
- Kiểm thêm mọi tab ở mobile: `users-390x844.png`, `devices-390x844.png`,
  `policy-390x844.png`, `audit-390x844.png` và bộ `*-360x740.png` tương ứng.
- `results.json`: kích thước đo, viewport, `scrollWidth/clientWidth`, danh sách
  phần tử tràn ngoài vùng bảng và lỗi console.
- Ảnh chụp dùng API thật ở cổng 3000, dev web cổng **4330** (không dùng 5173):
  tại thời điểm chụp overview là 3 người dùng hoạt động, 0 thiết bị trực tuyến,
  1 cảnh báo mở, 0 thông báo lỗi; `Cần chú ý` hiện 1 cảnh báo và 1 thiết bị
  ngoại tuyến.
- Đăng nhập bằng tài khoản admin seed sẵn theo README; chỉ phát sinh bản ghi
  `auth.login` trong audit. **Không seed/xoá DB**, không publish policy thật.
- Không có nút nào trong `.admin-page` thấp hơn 44px (script đo và in ra danh
  sách rỗng).

## Phần chưa làm / giới hạn

- Chưa chạy Playwright E2E của repo (không nằm trong yêu cầu; config mặc định
  trỏ 5173 đang có server khác). Kiểm giao diện thực hiện bằng script
  Playwright tạm, đã xoá khỏi worktree.
- Chưa publish policy thật để tránh ghi DB; luồng preview/publish và 409 đã được
  kiểm bằng unit test với mock.
- Bảng audit trên mobile vẫn cuộn ngang trong vùng bảng (đúng spec), không
  chuyển thành thẻ; bảng người dùng thì chuyển thành thẻ.
- Header/nav/public pages giữ nguyên thiết kế cũ vì ngoài phạm vi worker này.
- Ảnh full-page người dùng mobile có artifact của bottom-nav cố định; ảnh
  viewport là ảnh dùng để duyệt bố cục.
