# Handoff — sửa P1/P2 ứng dụng khách hàng v4

**Nhánh:** `fix-v4-app` (tách từ `v4-simple-app`, base `bda9bb2`).
**Commit code:** `a1066f3` — `fix(web): sửa P1/P2 ứng dụng khách hàng v4`.
**Phạm vi:** chỉ web khách hàng (`apps/web/src`), không sửa backend/API/contracts/router/public/admin/layout. Không merge.
**Ngày đo:** 15/11/2026 (Asia/Ho_Chi_Minh).

## 1. Đã sửa

### P1

| Mã | Thay đổi | Bằng chứng |
| --- | --- | --- |
| **F01** | `AssistantPage` không còn rơi về trạng thái “Không có cảnh báo mở” khi caregiver thiếu `canReceiveAlerts`; luôn hiện `Bạn không có quyền xem cảnh báo của hồ sơ này.` (tone `muted`, không calm). Badge cảnh báo vẫn bị ẩn vì shell không bật query khi thiếu quyền. Khôi phục test T01 kiểm đúng câu quyền và không gọi API cảnh báo. | Test `caregiver thiếu canReceiveAlerts → nói rõ thiếu quyền, không gọi API cảnh báo`; đo Chromium 390: `.today-status__text` = câu quyền, `today-status--muted`, 0 `.shell__nav-badge`; ảnh `390x844-today-f01.png`. |
| **F03** | Thêm `deviceWarning`: thiết bị `online=false`, `freshness` `offline`/`stale`, hoặc `lastSeenAt` cũ hơn `policy.offlineAfterSeconds` (mốc `asOf` của server) → thẻ trạng thái nói `Thiết bị ngoại tuyến · dữ liệu cuối HH:mm` tone cảnh báo. Khi đang có cảnh báo mở, cảnh báo vẫn là dòng chính và cảnh báo độ tươi nằm ở dòng phụ. Giữ nguyên trạng thái “Chưa nhận dữ liệu” và 403. | Test `thiết bị ngoại tuyến…` và `lastSeenAt cũ hơn ngưỡng policy dù online…`; dữ liệu thật (device offline, lastSeen 05:12, asOf 10:28): detail `Thiết bị ngoại tuyến · dữ liệu cuối 12:12`; fixture không cảnh báo: `Thiết bị ngoại tuyến · dữ liệu cuối 13:37`, tone `alert`, nút `Kiểm tra thiết bị`; ảnh `390x844-today-f03*.png`. |
| **F04** | Đưa card `Liên hệ khẩn cấp` lên trước card hành động trong `AlertDetailPage`; thứ tự DOM: `Gọi` → `Tôi đang hỗ trợ` → `Đóng cảnh báo`. Không đổi API/backend; dùng contact API hiện có. | Test `Gọi liên hệ khẩn cấp đứng trước Tôi đang hỗ trợ và Đóng cảnh báo`; đo 390/360 (viewport 390×844, 360×740): `Gọi` y≈600, `Tôi đang hỗ trợ` y≈909, `Đóng cảnh báo` y≈973; `callBeforeSupport=true`, `supportBeforeClose=true`, `Gọi` nằm trong màn đầu; ảnh `390x844-alert-detail.png`, `360x740-alert-detail.png`. |
| **F07** | Bỏ xác nhận một chạm ở danh sách: bấm `Xác nhận` chỉ mở bước hỏi lại `Bạn đã liên hệ và đang hỗ trợ?`, chỉ gọi API sau khi bấm `Có, tôi đang hỗ trợ`; có `Hủy`. Giữ nguyên luồng 409/500/retry. | Test `AlertsPage` cập nhật: lần bấm đầu không có POST, sau xác nhận mới POST; các test 409/500 vẫn chạy. Browser: `ackOneTapButton=false` (không còn nút một chạm tự gửi). |

### P2

- **F02:** thẻ cảnh báo Hôm nay có loại + giờ (`Nghi ngã lúc 11:47 · 1 cảnh báo đang mở.`), luôn có `Xem cảnh báo`; nếu contact API có liên hệ chính thì thêm `Gọi` (`tel:0900000000`). Không bịa dữ liệu; chỉ gọi contact API khi thật sự có cảnh báo mở.
- **F12:** bỏ câu `Cảnh báo chỉ cập nhật khi ứng dụng đang mở.` khỏi sidebar và cuối nội dung mobile; chỉ còn một bản ở đầu màn Cảnh báo. Hôm nay còn đúng một dòng `Dữ liệu mô phỏng · không thay thế cấp cứu.` (đo: Today 0 câu giới hạn cảnh báo, Alerts 1).
- **F13:** Hôm nay chỉ còn một liên kết `Sức khỏe 7 ngày →` trỏ `/app/overview`; bỏ `Lịch sử đo →`; History vẫn mở từ trong Sức khỏe.
- **F09/F11:** `.shell__more` trên bottom-nav `flex: 1 1 0`; `Thêm` đo được 91,5×62 px (390), 84×62 px (360), 84×72,8 px (360 chữ lớn), nhãn cách mép phải 19–23 px. Menu chỉ render **một** bản theo breakpoint (`useIsDesktop`), `aria-haspopup="menu"`, popup `role="menu"`, mục `role="menuitem"`; Escape đóng và trả focus, click ngoài đóng (test + đo Chromium).
- **F15:** bỏ câu Cài đặt chỉ tới “menu tài khoản” không tồn tại; nút Đăng xuất (sidebar/topbar) có bước hỏi lại `Đăng xuất khỏi tài khoản?` với `Hủy`, chỉ gọi `/auth/logout` sau xác nhận. Không thêm menu tài khoản/avatar toàn bộ.
- **F19:** giảm lặp trên Sức khỏe: bỏ nhãn nguồn trùng ở card Tổng hợp, gộp notice nguồn mô phỏng thành một nhãn, đổi các từ kỹ thuật “mẫu” sang “lần đo/lần nhận” và “độ phủ dữ liệu” ở lead sang “dữ liệu nhận được”. Đo `main.innerText` 390: `mô phỏng` 4→2, `mẫu` 7→0, `độ phủ` 3→1; vẫn giữ đủ số liệu và ghi chú API.
- **F21:** Lịch sử bỏ `3650 ngày`, `mỗi 300s`, `thay thế cho biểu đồ` khỏi màn đầu; độ phủ/khoảng thiếu đưa vào `Chi tiết kỹ thuật` (details); còn một nút `Hiện thêm N dòng`, bỏ `Hiện tới 400 dòng` và dòng đếm lặp cuối bảng; giữ CSV + bảng (1280: 1 table, 1 CSV).
- **F30/F31:** `maxlength=500` khớp `assistantAskSchema`; chip gợi ý `flex-wrap: wrap`, bỏ mask/scroll ẩn. Đo 360 chữ lớn: container `scrollWidth=clientWidth=298`, chip phải nhất kết thúc x≈291,8 < 360, không cắt.

## 2. Test đã sửa/thêm

- `AssistantPage.test.tsx`: khôi phục kiểm quyền cảnh báo (T01); khôi phục assertion `ASSISTANT_DISCLAIMER` cho câu trả lời (T02); khôi phục yêu cầu `Vui lòng thử lại sau vài phút.` cho 429 (T03); thêm cảnh báo có loại+giờ, nút Gọi, offline/aging, một liên kết Sức khỏe, `maxlength=500`.
- `AppShell.test.tsx`: cập nhật kỳ vọng bỏ câu giới hạn lặp; menu một bản/aria/Escape/click ngoài; đặt menu sidebar ở desktop; đăng xuất hỏi lại; caregiver không badge/không gọi alerts.
- `AlertsPage.test.tsx`: luồng xác nhận hai bước, xác nhận không POST ở lần bấm đầu; giữ test 409/500/quyền.
- `AlertDetailPage.test.tsx`: thứ tự DOM Gọi → Tôi đang hỗ trợ → Đóng.
- `HistoryPage.test.tsx`: một nút Hiện thêm tới trần 400, vẫn kiểm CSV.
- `RecentInsightsCard.test.tsx`: cập nhật copy “lần đo” và một nhãn nguồn.
- `router.test.tsx`: kỳ vọng một liên kết Sức khỏe 7 ngày, không còn link Lịch sử trên Hôm nay.

Không nới test để chấp nhận lỗi; các assertion cũ về quyền/disclaimer/429 được khôi phục hoặc làm chặt hơn.

## 3. Kiểm chứng đã chạy

```text
pnpm build:contracts                 exit 0
pnpm --filter @annhien/web typecheck exit 0
pnpm --filter @annhien/web test       33 file / 216 test, 0 lỗi
pnpm --filter @annhien/web build      exit 0; index ~270,32 kB (gzip 83,06 kB)
```

Trình duyệt: Chromium headless, Vite cổng 4342, API 3000 chỉ đọc. Đăng nhập bằng `context.request` (tài khoản seed `ba-an@demo.annhien.local`); không bấm xác nhận/đóng cảnh báo, không sửa dữ liệu. Trạng thái hiếm (F01, F03, alert open) dựng bằng chặn response GET trong trình duyệt.

Ảnh và số đo thô: `C:/tmp/v4-fix-app/` (`results.json`, `run.log`, `verify-v4.mjs`, các ảnh):
`1280x900-today|alerts|overview|history|settings|alert-detail.png`,
`390x844-today|today-f01|today-f03|today-f03-no-alert|alerts|overview|history|settings|alert-detail|more-open.png`,
`360x740-today|today-large|alert-detail|more-open.png`.

Không có console error/pageerror; `scrollWidth − clientWidth = 0` ở các màn đã đo.

## 4. Chưa làm trong đợt này

- **F05/F06/F08/F10/F17/F18/F20/F35** chưa xử lý (đúng danh sách không bắt buộc). Cụ thể: tiêu đề còn pill trạng thái; contact/serial vẫn ở chi tiết cảnh báo; từ vựng trạng thái chưa gộp; “Thêm” vẫn 5–6 đích; Sức khỏe còn 3 giá trị nhịp tim/4 ô số/3 cách đếm cảnh báo; màn 360 chưa thấy số liệu + biểu đồ trong màn đầu; chưa gộp notifications/devices/tasks.
- F24/F27 và các P3 khác ngoài danh sách cũng chưa làm.

## 5. Hạn chế / rủi ro cần biết

1. **F04:** `Gọi` đã ở màn đầu và đứng trước; `Tôi đang hỗ trợ`/`Đóng cảnh báo` nằm dưới màn (y≈909/973 ở 390×844) nhưng đúng thứ tự sau `Gọi`. Nếu yêu cầu nghiệm thu là **cả ba** hành động phải thấy trong viewport đầu, cần thu gọn header/card liên hệ hoặc đưa cụm hành động lên trước card chi tiết — chưa làm vì sẽ lặp nút Gọi.
2. **F19:** nhãn UI nguồn chỉ còn một, nhưng ghi chú do API trả (`Có 7 ngày chứa dữ liệu mô phỏng; chỉ dùng để kiểm thử.`) vẫn chứa từ “mô phỏng”; không sửa nội dung API.
3. Chưa chạy bộ Playwright e2e có sẵn (cấu hình trỏ 5173); kiểm bằng script Chromium riêng trên 4342 như các lượt review trước.
4. Mỗi lần đăng nhập kiểm thử tạo thêm phiên/audit `auth.login`; không có dữ liệu sức khỏe/cảnh báo bị đổi. Không merge nhánh này.
