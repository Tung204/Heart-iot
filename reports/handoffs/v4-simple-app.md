# Handoff — v4-simple-app (giao diện khách hàng tối giản)

- **Thời điểm:** 2026-11-15 (Asia/Ho_Chi_Minh)
- **Nhánh:** `v4-simple-app` (không merge)
- **Phạm vi:** chỉ các file trong danh sách worker app; không sửa API/contracts/package.json,
  `pages/*`, `features/admin/*`, `main.tsx`, `layout.css`, `tokens.css`, `public-simple.css`,
  `admin-simple.css`, docs/README/HTML, `reports/` ngoài file này.
- **Thay thế trực tiếp:** không làm preview theo yêu cầu.

## Đã làm

### Điều hướng — `app/AppShell.tsx`

- Desktop sidebar và mobile bottom-nav còn **4 mục**: `Hôm nay` (`/app`), `Cảnh báo`
  (`/app/alerts`, badge số cảnh báo đang mở), `Người thân` (`/app/subjects`), `Thêm`.
- `Thêm` (menu phụ, `aria-expanded`): `Thiết bị`, `Thông báo` (badge chưa đọc),
  `Công việc`, `Cài đặt`, `Studio` (owner/admin), `Quản trị` (admin).
- Bỏ `Tổng quan`, `Lịch sử`, `Trợ lý` khỏi nav chính; hai trang đầu mở từ liên kết trong
  Hôm nay (và `Xem sức khỏe` trong Người thân).
- Logo chỉ còn tên `An Nhiên`, dẫn `/app`; bỏ tagline dài.
- Khu người dùng: tên hiển thị + vai trò (`Chủ hồ sơ` / `Người thân` / `Quản trị`) + đăng xuất;
  **không render email thô** (kiểm bằng `sidebarEmail=false` trên trình duyệt thật).
- Admin chỉ có vai trò, không có hồ sơ: sidebar chỉ `Quản trị` + `Cài đặt`; `/app` vẫn
  chuyển `/app/admin` qua `AssistantPage` (route cũ giữ nguyên).
- Giữ skip link, nút chữ lớn, banner thông báo mới/mất SSE, xử lý thu hồi quyền và cuộn đầu trang.

### `/app` — `features/assistant/AssistantPage.tsx` (Hôm nay)

- H1 `Hôm nay`; ngay dưới là `SubjectSwitcher` (giữ nguyên hành vi). Shell không render
  switcher lần thứ hai trên trang này.
- Một thẻ trạng thái, một câu, lấy từ dữ liệu hiện có (`status` + `/alerts?state=open`):
  - có cảnh báo mở → `Có N cảnh báo chưa xử lý.` + `Xem cảnh báo`;
  - không cảnh báo, có dữ liệu → `Không có cảnh báo mở. Dữ liệu cập nhật {thời gian}.`;
  - chưa có dữ liệu → `Chưa nhận dữ liệu từ thiết bị.` + `Kiểm tra thiết bị`;
  - 403 số đo → `Bạn chưa được xem số đo của hồ sơ này.` (trạng thái quyền);
  - lỗi API → `Chưa tải được tình trạng.` / `Chưa tải được cảnh báo.` + `Thử lại`, không bịa số.
- Ô hỏi trợ lý ngay dưới trạng thái: textarea + nút `Gửi` (aria-label `Gửi câu hỏi`), 3 gợi ý
  ngắn `Nhịp tim?`, `Cảnh báo?`, `Pin?` trên một hàng cuộn ngang.
- **Không gọi API tóm tắt** và không hiển thị báo cáo 7 ngày/độ phủ/số mẫu/pin/khoảng thiếu.
  Hội thoại chỉ xuất hiện sau câu hỏi đầu tiên; giữ nhiều lượt, trạng thái đang trả lời, lỗi,
  403, reset khi đổi hồ sơ và chặn phản hồi cũ ghi vào hội thoại mới.
- Hai liên kết phụ `Xem sức khỏe chi tiết` → `/app/overview`, `Lịch sử đo` → `/app/history`.
- Một dòng cuối trang: `Dữ liệu mô phỏng · không thay thế cấp cứu.`

### Các trang còn lại

- `dashboard/DashboardPage.tsx` (`/app/overview`): H1 `Sức khỏe`, link `← Hôm nay`; bỏ eyebrow/lead
  và khối “Giới hạn cần biết” dài; giữ cảnh báo, chỉ số, thiết bị, biểu đồ/tổng hợp và nhãn nguồn
  mô phỏng. Đổi limit cảnh báo mở về 20 để dùng chung cache với badge ở shell.
- `history/HistoryPage.tsx`: H1 `Lịch sử đo`, link `← Sức khỏe`; bỏ đoạn giải thích cửa sổ dữ liệu
  và disclaimer cuối trang; giữ bộ lọc/biểu đồ/bảng/CSV/giới hạn quyền.
- `alerts/AlertsPage.tsx`: lead còn một câu `Cảnh báo của hồ sơ …`; giữ lọc, xác nhận, 409, quyền
  và phân trang. `alerts/AlertDetailPage.tsx`: bỏ disclaimer mô phỏng/cấp cứu lặp ở cuối.
- `subjects/SubjectsPage.tsx`: H1 `Người thân`; mỗi hồ sơ là thẻ ngắn (tên, vai trò, `Xem sức khỏe`,
  `Chia sẻ`, `Thiết bị`); `Sửa tên`/`Lưu trữ hồ sơ`/`Yêu cầu xóa dữ liệu` nằm trong
  `<details>Thêm thao tác</details>`; tạo hồ sơ ở nút phụ `Tạo hồ sơ mới`; bỏ đoạn hướng dẫn/disclaimer.
- `devices/DevicesPage.tsx`: bỏ lead và mô tả dài; giữ trạng thái, gắn/tháo thiết bị.
- `tasks/TasksPage.tsx`: H1 `Công việc`; bỏ lead/description dài; giữ tạo/đóng/lọc/phân trang.
- `settings/SettingsPage.tsx`: H1 `Cài đặt`; `ProfileCard` thay email thô bằng
  `Email đăng nhập đã xác thực.`; giữ mật khẩu/phiên.
- `share/SharePage.tsx`: H1 `Chia sẻ quyền xem`; rút gọn lead và ghi chú CSV.

### CSS — `styles/app-simple.css`

- Thêm style cho thẻ trạng thái (4 tông), ô hỏi + nút gửi, hàng gợi ý cuộn ngang, hội thoại,
  liên kết phụ, dòng giới hạn, vai trò người dùng, `Thêm thao tác` của Người thân.
- Mobile 390/360 và chữ lớn: nút `Gửi` nằm trong màn đầu và trên bottom-nav; không tràn ngang.

## Kiểm chứng thật

Chạy trong `v4-simple-app`, API dev ở cổng 3000 (không seed, không xóa DB):

```text
$ pnpm --filter @annhien/web test
 Test Files  33 passed (33)
      Tests  205 passed (205)

$ pnpm --filter @annhien/web typecheck
$ tsc -p tsconfig.json --noEmit
(exit 0)

$ pnpm --filter @annhien/web build
✓ built in 229ms
dist/assets/index-B4X2lqwh.js  268.79 kB │ gzip: 82.58 kB
(exit 0)
```

Dev riêng cổng **4320** (`vite --port 4320 --strictPort`), đăng nhập tài khoản demo
`ba-an@demo.annhien.local`; không thao tác xác nhận/đóng cảnh báo (alert vẫn mở).

### Trình duyệt thật (Playwright/Chromium)

Ảnh: `C:/tmp/ui-v4-simple/` (script kiểm: `C:/tmp/ui-v4-simple/check.mjs`,
`extra.mjs`).

| Trang | Cỡ | overflow `scrollWidth-clientWidth` | ghi chú |
| --- | --- | --- | --- |
| `/app` | 1280×900 | 0 | H1 Hôm nay, 1 cảnh báo mở, có `Xem cảnh báo` |
| `/app` | 390×844 | 0 | bottom-nav 4 mục; `Gửi` 360–418 px, nav top 777 px |
| `/app` | 360×740 | 0 | `Gửi` 360–418 px, nav top 673 px |
| `/app` | 390×844 chữ lớn | 0 | `Gửi` 421–488 px, nav top 766 px |
| `/app/overview` | 1280×900 | 0 | H1 Sức khỏe + `← Hôm nay` |
| `/app/alerts` | 1280×900 | 0 | H1 Cảnh báo, một câu mô tả |
| `/app/subjects` | 1280×900 | 0 | H1 Người thân, thẻ ngắn, `Thêm thao tác` |
| `/app/history` | 1280×900 | 0 | H1 Lịch sử đo + `← Sức khỏe` |
| `/app/settings`, `/app/devices`, `/app/notifications` | 1280×900 | 0 | không còn email demo |

- `sendAboveNav=true` và `inFirstScreen=true` ở cả 390/360/chữ lớn; nút gửi luôn trên bottom-nav.
- `navItems=4` trên mobile ở mọi cỡ; menu `Thêm` mở đúng: Thiết bị, Thông báo, Công việc,
  Cài đặt, Studio (user thường; admin có thêm Quản trị).
- Không còn `Bối cảnh`, `Độ phủ`, `bản tin` trên `/app`; không còn `bản demo/đồ án/giảng viên/
  nghiệm thu/chưa được duyệt` trên các trang đã chụp; sidebar không lộ email (`@`).
- Không có console error trong lần kiểm.
- Mở `Thêm thao tác` trên `/app/subjects`: hiện đủ `Sửa tên`, `Lưu trữ hồ sơ`,
  `Yêu cầu xóa dữ liệu` (ảnh `subjects-actions-1280x900.png`).

## Test đã cập nhật (không nới assertion)

- `app/AppShell.test.tsx`: thay test nav v3 bằng IA 4 mục; kiểm thứ tự/route, bottom-nav 4 mục,
  badge cảnh báo, tên + vai trò không email, admin-only, menu Thêm; giữ nguyên các test cuộn,
  banner thông báo, SSE, chuyển động; các test thông báo mở menu `Thêm` trước khi tìm link.
- `app/router.test.tsx`: `/app` là Hôm nay; `/app/overview` là Sức khỏe; `/app/assistant` vẫn Hôm nay;
  admin-only vẫn chuyển `/app/admin`.
- `features/assistant/AssistantPage.test.tsx`: viết lại theo màn Hôm nay — trạng thái (cảnh báo,
  không cảnh báo, chưa dữ liệu, 403 số đo, lỗi API, 403 cảnh báo), không gọi summary, hội thoại
  chỉ sau câu hỏi đầu, đúng body, nhiều lượt, 429, 403, đổi hồ sơ, phản hồi muộn, nguồn mô phỏng.
- `features/dashboard/DashboardPage.test.tsx`: H1 `Sức khỏe` + link `← Hôm nay`.
- `features/subjects/SubjectsPage.test.tsx`: mở `Thêm thao tác` trước khi bấm lưu trữ/yêu cầu xóa,
  phản ánh đúng disclosure mới; giữ nguyên toàn bộ assertion hành vi.

## Chưa làm / lưu ý

- Không chạy bộ Playwright e2e có sẵn (cấu hình trỏ cổng 5173 và copy v3); chỉ chạy script kiểm
  trình duyệt riêng ở 4320 như trên.
- Không sửa docs/README/HTML, không merge, không đổi API/hợp đồng/dependency.
- Đếm cảnh báo mở lấy tối đa 20 mục (API không trả tổng); khi còn trang sau hiển thị `N+`.
- `Cảnh báo`/`Thông báo` không còn ở nav chính theo IA mới; deep link cũ vẫn mở đúng trang.
