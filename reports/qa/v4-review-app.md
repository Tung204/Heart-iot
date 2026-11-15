# Review độc lập — ứng dụng khách hàng tối giản v4

**Nhánh kiểm:** `v4-simple-app` — code `bda9bb2`, base `b778486`, 19 file, +1.282/−1.415.
**Worktree kiểm:** `C:/Users/nguye/orca/workspaces/DATN/v4-simple-app` (cây làm việc sạch trước và sau khi kiểm; build chỉ sinh `apps/web/dist` đã ignore).
**Worktree báo cáo:** `C:/Users/nguye/orca/workspaces/DATN/v4-review-app` — file này.
**Ngày:** 2026-11-15, 16:50–17:10 (Asia/Ho_Chi_Minh).
**Người thực hiện:** reviewer độc lập; không dùng kết quả trong handoff, tự chạy lại build/test và tự đo bằng Chromium.

## 0. Kết luận ngắn

- **35 phát hiện UI/UX (F01–F35) + 4 phát hiện về test (T01–T04):** tổng 4 P1, 22 P2, 13 P3.
- Ba lỗi nặng nhất: **F01** người thân thiếu quyền cảnh báo vẫn đọc “Không có cảnh báo mở”; **F03** thiết bị ngoại tuyến 4 giờ vẫn hiện trạng thái êm “Dữ liệu cập nhật 12:12”; **F04** ở chi tiết cảnh báo, nút trong màn đầu là **Đóng cảnh báo** còn **Gọi** nằm dưới màn (390: nút Gọi ở y=899–950, viewport 844).
- Nhánh làm đúng phần lõi của v4 trên `/app`: không còn báo cáo tự động, 4 ô số, độ phủ, cột “Bối cảnh”; H1/nav/CTA đổi đúng; test và build chạy lại được. Nhưng mục tiêu “mỗi màn một mục đích, một hành động chính” còn hở ở Sức khỏe/Lịch sử/Cài đặt/Thông báo, và các từ kỹ thuật vẫn còn ngoài `/app`.
- Không merge trước khi xử lý F01, F03, F04 (an toàn) và F07 (một chạm xác nhận cảnh báo).

## 1. Phạm vi, môi trường, cách kiểm

- Web dev riêng **cổng 4342** (`npx vite --port 4342 --strictPort`, worktree `v4-simple-app`), proxy `/api` → API 3000 đang chạy sẵn. Không khởi động lại API, không sửa `.env`.
- API 3000 **chỉ đọc**: không bấm “Xác nhận”, không “Đóng cảnh báo”, không “Đánh dấu đã đọc”, không lưu tên/mật khẩu, không seed, không xoá dữ liệu. Trong lượt duyệt 9 màn khách hàng, **0 request non-GET** tới `/api/v1/*` (đo bằng `page.on('request')`).
- Đăng nhập chủ hồ sơ `ba-an@demo.annhien.local` qua `context.request` (không qua form) vì API đang đặt `WEB_ORIGIN=http://localhost:5173`: mọi POST từ origin `http://localhost:4342` bị `origin-check` trả **403 “Origin không được phép cho thao tác ghi.”**. Đã thử 5173 (qua), 4320/4342/127.0.0.1:5173 (403). Vì vậy các luồng có ghi (gửi câu hỏi) được kiểm bằng chặn phản hồi ngay trong trình duyệt, không ghi DB.
- Hệ quả cần ghi nhận: mỗi lần đăng nhập kiểm thử tạo thêm **phiên** và dòng `auth.login` trong audit (thấy trong tab Audit của quản trị). Không có dữ liệu sức khỏe/cảnh báo nào bị đổi.
- Viewport: 1280×900, 390×844, 360×740, và 390×844 **chữ lớn** (`localStorage.an:text-size=large`), DPR 1.
- Màn đã mở: `/app`, `/app/overview`, `/app/alerts`, `/app/alerts/:id`, `/app/subjects`, `/app/history`, `/app/devices`, `/app/notifications`, `/app/tasks`, `/app/settings`, `/app/admin` (5 tab), menu “Thêm”. Đo tự động 10 màn × 4 viewport + quản trị 4 viewport.
- Trạng thái hiếm được dựng bằng chặn phản hồi GET (không ghi gì): có cảnh báo, 0 cảnh báo, 20+ cảnh báo, cảnh báo 403, status 403, chưa có dữ liệu, thiết bị ngoại tuyến, hồ sơ ẩn số đo, caregiver không nhận cảnh báo, ask 403/429/500, phản hồi muộn khi đổi hồ sơ.
- Ảnh và số đo thô: `C:/tmp/rev-v4-app/` (`results.json`, `flow.json`, `flow2.json`, `*.png`), script `audit.mjs`, `flow.mjs`, `flow2.mjs`.

## 2. Diff test (đọc trước khi chạy)

Không có file test nào bị xoá. Số test tăng: Assistant 15 → 17, AppShell 20 → 26, router 4 → 4, Subjects 4 → 4; tổng web hiện 205.

| File | Thay đổi | Đánh giá |
| --- | --- | --- |
| `features/assistant/AssistantPage.test.tsx` | +297/−349, gần như viết lại theo màn Hôm nay | Bỏ 5 test gắn với tính năng đã xoá (tóm tắt 7 ngày, khối chất lượng dữ liệu, cột Bối cảnh, “thiếu quyền số đo → bối cảnh”, summary 403); thêm 7 test cho trạng thái mới; 10 test còn lại giữ hành vi nhưng đổi phạm vi (không còn call summary) | 
| `app/AppShell.test.tsx` | +130/−26 | Thay test IA cũ bằng 4 mục; thêm test badge, vai trò, admin-only, menu Thêm |
| `app/router.test.tsx` | +29/−16 | `/app` = Hôm nay, `/app/overview` = Sức khỏe, `/app/assistant` giữ |
| `features/dashboard/DashboardPage.test.tsx` | +3/−2 | H1 + breadcrumb |
| `features/subjects/SubjectsPage.test.tsx` | +11/−0 | Mở “Thêm thao tác” trước khi bấm, đúng disclosure mới |

### 2.1. Test bị nới hoặc đổi kỳ vọng (cụ thể)

- **T01 (P2) — test caregiver bị đổi để chấp nhận lỗi của F01.** Test cũ `caregiver thiếu canReceiveAlerts → không gọi API cảnh báo, hiện thông báo quyền` kiểm câu “Bạn không có quyền xem cảnh báo của hồ sơ này”. Bản mới `caregiver thiếu canReceiveAlerts → không gọi API cảnh báo` chỉ kiểm `Không có cảnh báo mở. Dữ liệu cập nhật …` — tức là test đang khoá đúng hành vi sai “không có cảnh báo” cho người không có quyền.
- **T02 (P2) — mất kiểm chứng disclaimer.** Import `ASSISTANT_DISCLAIMER` bị bỏ; các assertion `getAllByText(ASSISTANT_DISCLAIMER).length > 0` (2 test cũ) không còn. Hiện không test nào bảo đảm câu giới hạn y tế/nguồn mô phỏng của câu trả lời; chỉ còn một test đếm dòng cuối trang `Dữ liệu mô phỏng · không thay thế cấp cứu.` đúng 1 lần.
- **T03 (P3) — nới thông báo 429.** Test cũ đòi `…Vui lòng thử lại sau vài phút.` (UI tự thêm hướng dẫn); test mới chỉ đòi nguyên văn lỗi máy chủ `Bạn đã gửi quá nhiều câu hỏi, vui lòng thử lại sau.` — hướng dẫn “thử lại sau vài phút” không còn.
- **T04 (P3) — test bám CSS thay vì role, và thiếu phủ các lỗi mới.** `AppShell.test.tsx` đếm `document.querySelector('.shell__nav').querySelectorAll('a')`, `.shell__more`, `.shell__nav-badge`, `.shell__user-role`. Vì vậy test không bắt được: menu “Thêm” bị render **2 lần** trong DOM, kích thước thật 42×66 px, Escape/click-ngoài không đóng, và nhãn `Thêm` sát mép. Cũng không có test cho trạng thái “thiết bị ngoại tuyến/dữ liệu cũ” trên Hôm nay (F03) hay cho `role="log"` rỗng khi gửi lỗi (F28).

### 2.2. Điều test mới làm tốt hơn

- Test “mở app…không gọi tóm tắt” khẳng định `calls.assistant` rỗng và không còn “Bối cảnh/Độ phủ/bản tin” — chặn tái phát đúng mục tiêu v4.
- Có test cho 403 số đo là trạng thái quyền, không gọi status, không có “Thử lại”; test phản hồi muộn khi đổi hồ sơ vẫn giữ.
- Test nguồn số liệu + badge “Tóm tắt theo mẫu”/“Dữ liệu mô phỏng” còn; test nhiều lượt hỏi còn.

## 3. Chạy lại kiểm tra trong worktree sạch

```text
$ pnpm build:contracts
$ tsc -p tsconfig.json                      (exit 0)

$ pnpm --filter @annhien/web test
 Test Files  33/33, Tests 205/205, 0 lỗi, 9,17 s

$ pnpm --filter @annhien/web typecheck
$ tsc -p tsconfig.json --noEmit             (exit 0)

$ pnpm --filter @annhien/web build
✓ built in 436ms
dist/assets/index-B4X2lqwh.js  268.79 kB │ gzip: 82.58 kB   (exit 0)
```

Không có console error/pageerror trong cả lượt duyệt. `document.scrollWidth − clientWidth = 0` ở 10 màn × 4 viewport (không có tràn ngang cấp trang). Mọi màn có đúng một H1. Không màn khách hàng nào render email (`@…`) trong nội dung chính; trang Quản trị có email demo trong bộ lọc Audit (F26).

## 4. Phát hiện

Mức: **P1** sai trạng thái/an toàn hoặc chặn hành động khẩn cấp; **P2** mục tiêu UX còn hở, gây hiểu nhầm/khó dùng; **P3** copy, a11y, chi tiết.

### 4.1. Hôm nay (`/app`)

| # | Mức | Mong đợi | Thực tế | Bằng chứng |
| --- | --- | --- | --- | --- |
| **F01** | **P1** | Người không có quyền nhận cảnh báo thấy trạng thái quyền (“Bạn không có quyền xem cảnh báo”), như trang Cảnh báo đang làm | Hiện trạng thái êm **“Không có cảnh báo mở. Dữ liệu cập nhật 12:12 15 thg 11, 2026.”** dù hồ sơ **đang có 1 cảnh báo mở**; badge nav cũng biến mất | `AssistantPage.tsx` `buildStatus()`: `if (!canReceiveAlerts) return measurementStatus();` — `measurementStatus()` trả câu “Không có cảnh báo mở”. Đo tại 390 với hồ sơ `role=caregiver, canReceiveAlerts=false`. Test mới (T01) đang khoá hành vi này |
| **F02** | **P1** | Cảnh báo mở phải nói **loại + giờ** và cho **Gọi** ngay (v5 yêu cầu “1 cảnh báo: có thể bị ngã lúc 11:47. [Gọi] [Xem cảnh báo]”) | Chỉ có **“Có 1 cảnh báo chưa xử lý.”** + một nút **Xem cảnh báo**; không loại cảnh báo, không giờ phát hiện, không số liên hệ, không nút gọi | `/app` 1280/390/360/390-chữ-lớn; nút 83×58 px, hành động duy nhất trong thẻ |
| **F03** | **P1** | Thiết bị ngoại tuyến/dữ liệu cũ phải hiện cảnh báo độ tươi (“Thiết bị ngoại tuyến · dữ liệu cuối 12:12”) thay vì trạng thái êm | Với thiết bị `offline`, `lastSeenAt` cách 4 giờ, trạng thái vẫn là **“Không có cảnh báo mở. Dữ liệu cập nhật 12:12 15 thg 11, 2026.”** (tone `calm`); khi có cảnh báo mở thì dòng thời gian cập nhật biến mất hoàn toàn | Fixture `device-offline` + dữ liệu thật (Thiết bị ghi “Ngoại tuyến”, “4 giờ trước”); 390 và 1280 |
| **F13** | P2 | Một liên kết phụ “Sức khỏe 7 ngày”, Lịch sử gộp vào Sức khỏe | Hai liên kết **“Xem sức khỏe chi tiết →”** và **“Lịch sử đo →”**, cộng liên kết “Quản lý và chia sẻ” trong bộ chọn hồ sơ ở desktop = 3 đường phụ | `.today-links` 1280/390/360 |
| **F12** | P2 | Một dòng dữ liệu mô phỏng trên Hôm nay; màn phụ không lặp disclaimer | Màn đầu có **2 dòng**: `Dữ liệu mô phỏng · không thay thế cấp cứu.` **và** `Cảnh báo chỉ cập nhật khi ứng dụng đang mở.` (dòng sau còn lặp ở cuối **mọi** màn mobile, kể cả Cài đặt/Quản trị; desktop lặp lại trong sidebar) | 390/360/390-chữ-lớn; `hints[]` của mọi màn |
| **F30** | P3 | Gợi ý câu hỏi không bị cắt ở chữ lớn | 390-chữ-lớn: hàng chip `scrollWidth 341 / clientWidth 328`; ở 360-chữ-lớn chip “Pin?” kết thúc tại x=372 > 360 nên bị cắt sau mask, không có scrollbar | `.today-ask__suggestions` (`scrollbar-width:none` + mask) |
| **F31** | P3 | Ô hỏi cho gõ tối đa bằng giới hạn hợp lệ (500) | `maxlength=600` nhưng `assistantAskSchema` là `min(3).max(500)`: gõ 501–600 ký tự sẽ bị chặn ở bước submit với lỗi “Câu hỏi quá dài (tối đa 500 ký tự)” | `AssistantPage.tsx` dòng `maxLength={600}`, `packages/contracts/src/assistant.ts` |
| — | — | Ghi nhận | Ô hỏi + Gửi nằm trong màn đầu và trên bottom-nav ở **cả 4** điều kiện: Gửi 360–418 px với nav top 673 (360), 360–418/777 (390), 421–488/766 (chữ lớn). Chip không làm tăng chiều cao khối | Số đo `today.sendAboveNav=true`, `sendInFirstScreen=true` |
| — | — | Ghi nhận | Đổi hồ sơ khi đang chờ trả lời: hội thoại, câu đang chờ và ô hỏi được xoá; phản hồi về muộn **không** được nối vào hồ sơ mới | Chặn POST `assistant/ask` rồi `selectOption` hồ sơ 2; đo `thread=null, pending=false, value=""` |

### 4.2. Khung, điều hướng, menu “Thêm”

| # | Mức | Mong đợi | Thực tế | Bằng chứng |
| --- | --- | --- | --- | --- |
| **F09** | P2 | Mục thứ tư trên bottom-nav ≥44 px, có khoảng đệm, nhãn đầy đủ | **“Thêm” rộng 42 px** (cao 66/62), nhãn “Thêm” kết thúc ở x=388/390 và 358/360 — sát mép, icon `…` + chữ bị dồn; đây là mục duy nhất nhỏ hơn 44 px trên nav | 390/360/390-chữ-lớn (49 px khi chữ lớn) |
| **F10** | P2 | “Thêm” chỉ chứa việc tài khoản hoặc không có “Thêm” (v5 §2: 4 màn + menu tài khoản) | Vẫn là hộc tủ **5 đích** với chủ hồ sơ: Thiết bị, Thông báo (badge 2), Công việc, Cài đặt, Studio; code có thể thành 6 (thêm Quản trị) với admin có hồ sơ | Mở menu 390/360/1280; `moreItems` trong `AppShell.tsx` |
| **F11** | P2 | Menu mở một bản, đóng được bằng Escape và bấm ra ngoài; `aria-haspopup` khớp loại popup | **Escape không đóng, bấm ngoài không đóng**, `aria-expanded` vẫn `"true"`; menu được render **2 lần** trong DOM (sidebar + bottom-nav) và `aria-haspopup="true"` nhưng popup là `div` link thường, không `role="menu"` | 390: `expanded="true"` sau Escape và sau click (10,300); `querySelectorAll('.shell__more-menu').length = 2`. Tab vào menu vẫn đúng thứ tự |
| **F15** | P2 | Có “menu tài khoản”/avatar như v5 §2; đăng xuất hỏi lại | Không có menu tài khoản; **Đăng xuất** là nút trần ở topbar (mobile) và sidebar, một chạm, cạnh nút “Aa”. Trang Cài đặt lại hướng dẫn *“Dùng ‘Đăng xuất’ trong menu tài khoản…”* — chỉ tới nơi không tồn tại | Ảnh `390x844-today.png`; `SessionsCard.tsx:186` |
| — | — | Ghi nhận | Sidebar desktop vừa 900 px (không phải cuộn ngầm như v5 lỗi 5); logo chỉ còn “An Nhiên”; không lộ email | `sidebarBottom=900, scrollH=900`; `hasEmail=false` ở 10 màn khách hàng |

### 4.3. Cảnh báo (`/app/alerts`, `/app/alerts/:id`)

| # | Mức | Mong đợi | Thực tế | Bằng chứng |
| --- | --- | --- | --- | --- |
| **F04** | **P1** | Trong màn đầu phải có **Gọi** (liên hệ khẩn cấp) trước, rồi “Tôi đang hỗ trợ”, rồi mới “Đóng” | 390: nút **Đóng cảnh báo** ở y=589–641 (trong màn), tiêu đề “Liên hệ khẩn cấp” ở y=736 (sát nav), nút **Gọi** ở y=899–950 — **dưới viewport 844**. 360 tương tự: màn đầu chỉ thấy “Đóng cảnh báo” | ảnh `390x844-alert-detail.png`, `360x740-alert-detail.png`; `aria2.mjs` |
| **F06** | P2 | Liên hệ khẩn cấp là dữ liệu thật hoặc nói rõ “chưa có liên hệ”; serial/thiết bị không nằm ở tiêu đề | Hiện **“Người thân (demo) · Con trai · 0900000000”** và **“(AN-2026-001)”** ngay dòng phát hiện | 1280/390/360 |
| **F07** | P2 | Hành động đổi trạng thái phải hỏi lại, không nằm cạnh “Chi tiết” (v5 lỗi 17) | Code vẫn render nút **“Xác nhận”** một chạm ngay cạnh “Chi tiết” cho cảnh báo `open` chưa ai nhận; nhãn không nói xác nhận điều gì. Không bấm để kiểm vì phải giữ dữ liệu đọc-only; dữ liệu demo hiện tại ở trạng thái “Đã xác nhận” nên nút đang ẩn | `AlertsPage.tsx` `handleAcknowledge` + `<Button>Xác nhận</Button>` |
| **F08** | P2 | Một từ vựng trạng thái: “Hệ thống phát hiện / Bạn đang hỗ trợ / Đã đóng” | Cùng một sự việc có **4 cách gọi**: Hôm nay “1 cảnh báo **chưa xử lý**”; danh sách pill “**Đã xác nhận**” + “Đã xác nhận bởi Trần Thị An”; chi tiết “**Đang có người hỗ trợ**”; timeline “**Xác nhận ngã**”; người nhận “xác nhận: có · đóng: có” | `/app`, `/app/alerts`, `/app/alerts/:id` |
| **F05** | P3 | Tiêu đề không trộn trạng thái động; chép/đọc thô ra câu có khoảng cách | H1 gộp pill trạng thái: `Nghi ngã<span class="pill …">Đã xác nhận</span>`. **Tên truy cập có khoảng cách** (`ariaSnapshot: heading "Nghi ngã Đã xác nhận"`) nhưng `innerText`/copy ra **“Nghi ngãĐã xác nhận”**, và H1 đổi nội dung mỗi khi trạng thái đổi | `flow.json alertDetail`, `aria.mjs` |
| — | — | Ghi nhận | Đầu trang danh sách chỉ còn một câu “Cảnh báo của hồ sơ X.” (không nói đang có bao nhiêu, không CTA gọi); thẻ cảnh báo không có Gọi/hỗ trợ | 1280/390 |

### 4.4. Sức khỏe (`/app/overview`) và Lịch sử (`/app/history`)

| # | Mức | Mong đợi | Thực tế | Bằng chứng |
| --- | --- | --- | --- | --- |
| **F17** | P2 | Một giá trị hiện tại kèm giờ đo; pin một lần | Ba nhịp tim khác nhau trên cùng màn: **71 bpm** (Tổng hợp), **61 bpm** (Thiết bị), **68.3 bpm** (Xu hướng); pin **86%** hai lần; ba cách gọi thời điểm (“dữ liệu mới nhất”, “lần nhận cuối”, “lần đo gần nhất”) | 1280, `overview` text |
| **F18** | P2 | 3 số hiện tại, một cách đếm cảnh báo | Vẫn **4 ô số** (Nhịp tim, Vận động, Pin, **Độ phủ dữ liệu 72.4% / 147 mẫu**) + **ba cách đếm cảnh báo**: pill “1 cần chú ý”, “Cảnh báo hôm nay: 1 (đã đóng 0)”, “Cảnh báo trong kỳ: 3 (đã đóng 1)”, cộng pill “Đã xác nhận” trên thẻ | 1280/390; đếm trên `main.innerText` |
| **F19** | P2 | Tối đa hai câu giải thích; một nhãn “Dữ liệu mô phỏng” | **“mô phỏng” ×4**, **“mẫu” ×7**, **“độ phủ” ×3** trên một màn; cuối trang còn “Chỉ để theo dõi, không thay thế tư vấn y tế.” | 1280/390/360; đếm trên `main.innerText` |
| **F20** | P2 | Màn đầu 360 thấy 3 số hiện tại + biểu đồ 7 ngày vừa khung | Màn đầu 360 chỉ có bộ chọn hồ sơ, breadcrumb, H1, khối cảnh báo; số liệu nằm dưới màn. Biểu đồ không vừa: khung `insights-chart__scroll` 282 px chứa nội dung 349 px, phải vuốt ngang; ở 360 thấy 5 ngày và một phần ngày thứ 6, ngày 15/11 khuất (có dòng “Cuộn ngang biểu đồ…” nên không phải lỗi ẩn, nhưng vẫn là 7 ngày không vừa màn) | 360; `probe-overview-chart-360.png` |
| **F21** | P2 | Lịch sử: “Xem thêm” một nút, 5 dòng mặc định; từ kỹ thuật vào “Chi tiết kỹ thuật” | Còn **“Độ phủ: 80.6% · 232 mẫu đã nhận (mỗi 300s) · 1 khoảng thiếu · không có mẫu lệch đồng hồ”**, **“Bảng dữ liệu đo — thay thế cho biểu đồ.”**, **“Quyền hiện tại cho phép xem tối đa 3650 ngày.”**, hai nút **“Hiện thêm 50 dòng”** + **“Hiện tới 400 dòng”**, hai câu đếm dòng (đầu bảng “Đang hiển thị 20/232 dòng.”, cuối bảng “Đang hiện 20/232 dòng”). Mobile: 20 thẻ, trang **5.574–5.600 px**; SVG 620 px trong khung 333 px (cuộn ngang) | 1280/390/360 |
| **F35** | P2 | Mỗi màn phụ một mục đích; không lặp nội dung của màn khác | Trùng mục đích: `/app/overview` gộp cảnh báo + 4 số + thiết bị + xu hướng (cảnh báo đã có `/app/alerts`, số đo đã có `/app/history`); `/app/history` lặp lại đúng bộ số độ phủ/khoảng thiếu của overview; `/app/notifications` chép lại cảnh báo; `/app/devices` lặp thẻ thiết bị của overview | 1280/390/360 |
| — | — | Ghi nhận | H1 “Sức khỏe” + breadcrumb “← Hôm nay”, H1 “Lịch sử đo” + “← Sức khỏe”; khối “Giới hạn cần biết” và đoạn dài cuối Lịch sử đã bỏ | 1280 |

### 4.5. Người thân, Thiết bị, Công việc, Thông báo, Cài đặt

| # | Mức | Mong đợi | Thực tế | Bằng chứng |
| --- | --- | --- | --- | --- |
| **F14** | P2 | Nhóm phiên: “Phiên khác (N)” + “Thu hồi tất cả”; trang Cài đặt ngắn | Mỗi phiên một dòng “Thiết bị khác · Đăng nhập lúc… · Thu hồi”, **50 dòng** trong lượt kiểm; trang cao **8.979 px** (1280), **13.366 px** (390), **17.441 px** (390 chữ lớn) — khoảng 16 màn cuộn ở 390 và 21 màn ở chữ lớn | `/app/settings`; số phiên tăng do các lần đăng nhập kiểm thử trong ngày, nhưng cấu trúc không nhóm là của code |
| **F16** | P3 | Cấu trúc heading liên tục | H1 “Cài đặt” → **H3** “Hồ sơ”, “Mật khẩu”, “Phiên đăng nhập” (không có H2) | `headings` 1280/390 |
| **F22** | P2 | Serial/firmware trong “Thông tin kỹ thuật”; “Gỡ thiết bị”; nói rõ dữ liệu cũ vẫn giữ | Còn **“Serial AN-2026-001 · … · firmware 0.0.0-sim”**, nút **“Tháo gắn”**; không có câu giải thích dữ liệu đã đo có mất không | 1280/390/360 |
| **F23** | P3 | “Việc cần làm”, mức “Bình thường”, ẩn mã thiết bị | Còn **“Điểm ưu tiên 2/100 · … · thiết bị #dddddddd · hạn 12:12 16 thg 11, 2026”** | 1280/390 |
| **F24** | P2 | Gộp thông báo vào Cảnh báo, bỏ “đã đọc” (v5 lỗi 23) | Vẫn màn riêng “Thông báo”, hai mục **đều là “Nghi ngã … trạng thái Đã xác nhận”**, mỗi mục “Xem cảnh báo” + **“Đánh dấu đã đọc”**; badge “2” dẫn vào đây | 1280/390 |
| **F25** | P3 | Thẻ người thân cho biết thiết bị đang kết nối và số cảnh báo mở | Thẻ chỉ có tên + “Chủ hồ sơ · nhận cảnh báo” + 3 nút; tên hồ sơ xuất hiện **2 lần** trên cùng màn (bộ chọn + thẻ), tiêu đề “Thêm người” và nút “Tạo hồ sơ mới” nói cùng một việc | 1280/390 |
| — | — | Ghi nhận | “Thêm thao tác” đóng/mở đúng: Sửa tên/Lưu trữ/Yêu cầu xóa **không** render khi đóng (checkVisibility=false), hiện đủ khi mở; summary cao 35 px nhưng bề rộng 777 px | `flow.json subjectsDisclosure` |

### 4.6. Quản trị (`/app/admin`)

| # | Mức | Mong đợi | Thực tế | Bằng chứng |
| --- | --- | --- | --- | --- |
| **F26** | P2 | 4 số + “Cần chú ý”, 3 tab chính + “Nâng cao” (v5 lỗi 26) | Vẫn **5 tab** (Tổng quan/Người dùng/Thiết bị/Chính sách thiết bị/Audit), **9 số chia 3 nhóm**, câu mở đầu “audit, chính sách động…”. Tab Thiết bị: “policy v1… 900 giây”, serial, firmware, **UUID hồ sơ `aaaaaaaa-…`**; tab Chính sách: `device_runtime`, “telemetry/phút”, giây; tab Audit: `auth.login`, `workspace_view.publish`, “người dùng 33333333”, email demo trong bộ lọc. Ghi chú “Cảnh báo chỉ cập nhật khi ứng dụng đang mở.” vẫn ở sidebar admin | 1280/390/360/390 chữ lớn + 3 tab phụ ở 1280; 390 chữ lớn: 0 tràn ngang, 5 tab, nav 2 mục |
| — | — | Ghi nhận | Admin không hồ sơ: `/app` → `/app/admin`; nav chỉ “Quản trị” + “Cài đặt”, không có “Thêm” | `admin-today.path=/app/admin` |

### 4.7. Truy cập, bàn phím, kích thước mục tiêu

| # | Mức | Mong đợi | Thực tế | Bằng chứng |
| --- | --- | --- | --- | --- |
| **F27** | P2 | Mục tiêu chạm ≥44 px | **Chip gợi ý 37 px** (43 px khi chữ lớn); liên kết phụ trên Hôm nay **28 px**; “Quản lý và chia sẻ” **26 px**; “Xem cảnh báo” trong danh sách thông báo **22 px**; nút `size="sm"` (Thu hồi, Chi tiết, Cập nhật khoảng, Tải CSV, Tạo việc…) **43 px ở 1280**; summary “Thêm thao tác” **35 px**; “Thêm” **42 px** ngang | Đo toàn bộ `a,button,summary` tại 390/360/1280 |
| **F28** | P3 | Sau khi gửi lỗi, không để lại vùng live rỗng | Với 403/429/500: `hasConversation` vẫn đúng nên render `role="log" aria-label="Hội thoại"` **rỗng** (0 lượt, không nội dung) | `flow2.failedAskThread: {logCount:1, logText:null, turns:0}` |
| **F29** | P3 | Chỉ báo “chủ hồ sơ không chia sẻ số đo” khi đúng là lỗi quyền số đo | **Mọi** 403 của `assistant/ask` đều thành “Chủ hồ sơ không chia sẻ số đo / Bạn chưa được xem số đo…”. Gặp thật với 403 origin (`Origin không được phép cho thao tác ghi`) — thông báo sai nguyên nhân | `ask-403` khi origin-check chặn; `AssistantPage.tsx` `isForbiddenError` |
| — | — | Ghi nhận | Bàn phím: skip link → logo → nav → Thêm → Đăng xuất → Aa → bộ chọn hồ sơ → CTA → ô hỏi → Gửi → chip → liên kết → bottom-nav; **outline 3 px màu teal** hiện ở mọi điểm dừng (select 2 px), không có điểm dừng ẩn | Tab 18 bước tại 1280 và 390 |
| — | — | Ghi nhận | Không có tràn ngang cấp trang ở mọi màn/viewport; phần cuộn ngang chỉ nằm trong khung biểu đồ (Lịch sử 620/333; Sức khỏe 349/282) | `overflowX=0` toàn bộ |

### 4.8. Phát hiện phụ về hành vi/dữ liệu

- **F32 (P3):** `DashboardPage` đổi limit cảnh báo mở **5 → 20** để dùng chung cache với badge; nhưng danh sách “Cảnh báo đang mở” render **toàn bộ** `items` (không cắt, mỗi mục là một `.alert-row`), nhãn “N cần chú ý” lấy `items.length` (độ dài trang, không phải tổng). Với nhiều cảnh báo, Sức khỏe dài thêm tuyến tính theo số mục; chưa đo riêng chiều cao 20 cảnh báo.
- **F33 (P3):** Trên Hôm nay, dòng “Dữ liệu cập nhật **12:12 15 thg 11, 2026**” dùng định dạng ngày đầy đủ cho một màn “hôm nay” (v5 §2 đề “Dữ liệu cuối 12:12”). Cùng chuỗi này xuất hiện ở Hôm nay, Thiết bị, Lịch sử với ba cách gọi khác nhau (F17).
- **F34 (P3):** Với tài khoản không có hồ sơ nào (fixture trả `items: []`), `/app` hiện “Chưa có hồ sơ nào” + “Tạo hồ sơ” nhưng bottom-nav vẫn còn “Cảnh báo/Người thân” dẫn tới màn không có dữ liệu — cùng loại vấn đề “màn rỗng không nói vì sao”.

> Ghi chú: F34 gộp từ quan sát fixture; không phải lỗi chặn.

## 5. Đối chiếu `reports/orchestration/v5-plan-ux.md`

### 5.1. Phần nhánh đã giải quyết (theo kế hoạch v5)

- v5 lỗi 8, 9, 10 trên `/app`: **không** gọi API tóm tắt, **không** 4 ô số/độ phủ/số mẫu, **không** cột “Bối cảnh”, **không** eyebrow/“Làm mới”; hội thoại chỉ xuất hiện sau câu hỏi đầu (đã kiểm bằng network + DOM).
- v5 lỗi 11: H1 “Sức khỏe”, tên chỉ còn trong bộ chọn hồ sơ; bỏ eyebrow + câu mô tả.
- v5 lỗi 5, 6 (một phần): sidebar vừa 900 px, bỏ tagline/email, logo ngắn; nút chữ lớn không còn khuất.
- v5 lỗi 19, 20 (một phần): “Lưu trữ/Yêu cầu xóa” vào disclosure “Thêm thao tác”; H1 “Người thân”; bỏ múi giờ/3650 khỏi thẻ và đoạn hướng dẫn dài.
- v5 lỗi 21 (một phần): bỏ đoạn giải thích cửa sổ dữ liệu và disclaimer dài cuối Lịch sử.

### 5.2. Chỗ nhánh **chưa** giải quyết

| v5 | Nội dung còn lại |
| --- | --- |
| §2, lỗi 7 | Vẫn giữ “Thêm” làm mục thứ tư với 5–6 đích; **không** có menu tài khoản/avatar; “Thêm” là mục nhỏ nhất (42 px). |
| §2, §4 | Chưa gộp `history` vào `overview`, chưa gộp `notifications` vào `alerts`, chưa đưa `devices`/`tasks` vào thẻ Người thân — vẫn 8 route phụ ngoài 4 mục nav (overview, history, devices, notifications, tasks, settings, share, studio) cộng admin. |
| Lỗi 12, 13, 14, 15 | Sức khỏe vẫn 3 giá trị nhịp tim, pin ×2, 3 cách đếm cảnh báo, “Xem lịch sử và biểu đồ” ×2, thẻ cảnh báo không có Gọi, “mô phỏng” ×4. |
| Lỗi 16, 17, 18 | Cảnh báo: lead không nêu số việc; “Xác nhận” một chạm còn trong code; liên hệ demo + 4 nghĩa “xác nhận”; “Gọi” dưới màn ở chi tiết. |
| Lỗi 21 | Lịch sử vẫn “mỗi 300s”, độ phủ, khoảng thiếu, “3650 ngày”, 2 nút tải thêm, 20 thẻ/5.600 px, biểu đồ 620 px trong khung 333 px. |
| Lỗi 22 | Thiết bị vẫn serial/firmware/“Tháo gắn”, thiếu câu “dữ liệu đã đo vẫn giữ”. |
| Lỗi 23 | Thông báo vẫn là màn riêng có “Đánh dấu đã đọc”. |
| Lỗi 24 | Công việc còn “Điểm ưu tiên 2/100”, “thiết bị #dddddddd”. |
| Lỗi 25 | Cài đặt: 50 dòng phiên rời, không nhóm/thu hồi tất cả, copy “menu tài khoản” không tồn tại, heading nhảy cấp. |
| Lỗi 26 | Quản trị vẫn 5 tab, 9 số, policy/giây/UUID/digest/mã hành động, ghi chú người thân trên trang admin. |
| §4 — bốn luật đo | (1) một con số chỉ một lần/màn: **sai** ở Sức khỏe (F17/F18); (2) không UUID/serial/firmware ngoài “Thông tin kỹ thuật”: **sai** ở Thiết bị + chi tiết cảnh báo + Quản trị; (3) tối đa hai câu giải thích/màn: **sai** ở Sức khỏe/Lịch sử; (4) đúng một hành động chính/màn: **sai** ở Hôm nay (Xem cảnh báo + Gửi + 2 liên kết) và Sức khỏe (nhiều liên kết trùng). |
| §5 | Các việc “rủi ro thấp” đã làm; phần đổi cấu trúc (gộp màn, menu tài khoản, từ điển “hồ sơ/người thân”) chưa chốt nên chưa làm — đúng như kế hoạch dặn, nhưng nghĩa là mục tiêu “tối giản” mới đi được một nửa. |

### 5.3. Khác biệt giữa kế hoạch v5 và nhánh

- v5 đoán “Hôm nay ở 360 vẫn hơn một màn”: **đúng** — `docHeight 826` so với viewport 740 (phải cuộn 86 px mới thấy dòng cuối).
- v5 đề “Không có cảnh báo. Dữ liệu cuối 12:12.”: nhánh dùng “Không có cảnh báo **mở**. Dữ liệu cập nhật 12:12 15 thg 11, 2026.” — dài hơn và thêm ngày.
- v5 đề nút “Gọi” trên thẻ cảnh báo: nhánh **không** thêm ở Hôm nay/danh sách, chỉ có trong chi tiết (dưới màn ở mobile).
- v5 đề 4 mục không có “Thêm”: nhánh giữ “Thêm” (khác biệt có chủ ý theo spec v4-simple-app, nhưng là gốc của F09/F10).

## 6. Rủi ro và giới hạn kiểm chứng

1. **API 3000 đang khoá origin 5173.** Không thể tái hiện luồng gửi câu hỏi “thật” từ web 4342; mọi kiểm tra có POST đều dùng chặn phản hồi. Nếu môi trường nghiệm thu dùng cổng khác 5173, cần đặt `WEB_ORIGIN` tương ứng, nếu không mọi thao tác ghi sẽ 403 (và UI sẽ báo sai thành “chủ hồ sơ không chia sẻ số đo” — F29).
2. **Số phiên trong Cài đặt bị phồng** bởi các lần đăng nhập kiểm thử trong ngày (reviewer trước + lượt này). Con số 50 không phải dữ liệu seed; nhưng cách render từng dòng và không nhóm là của code.
3. **Không kiểm chứng được** luồng bấm “Xác nhận” cảnh báo (F07) và “Đánh dấu đã đọc” vì phải giữ API/dữ liệu đọc-only; kết luận F07 dựa trên đọc mã và trạng thái phần tử, không dựa trên thao tác ghi.
4. **Chưa chạy bộ Playwright e2e có sẵn** (cấu hình trỏ 5173, copy v3) — giống handoff; kiểm bằng script riêng trên 4342.
5. **Quản trị trong nhánh này là bản cũ** (nhánh tách từ `b778486`, không chứa `v4-simple-admin`). F26 phản ánh bản đang có trong `v4-simple-app`; sau khi merge nhánh admin, trang này sẽ khác — cần kiểm lại sau merge, không nên sửa ở nhánh app.
6. Không kiểm thông tin màu/contrast bằng công cụ đo; chỉ kiểm cấu trúc, chữ, kích thước, bàn phím và trạng thái.

## 7. Phụ lục

**Bảng đo chính**

| Màn | 1280×900 | 390×844 | 360×740 | 390 chữ lớn |
| --- | --- | --- | --- | --- |
| `/app` docHeight | 900 | 844 | **826** | **995** |
| Gửi (top–bottom) | 342–400 | 360–418 | 360–418 | 421–488 |
| Bottom-nav top | — | 777 | 673 | 766 |
| `/app/overview` docHeight | 1.933 | 3.368 | 3.613 | 4.467 |
| `/app/history` docHeight | 2.214 | 5.574 | 5.600 | 6.588 |
| `/app/settings` docHeight | 8.979 | 13.366 | 14.842 | 17.441 |
| Tràn ngang cấp trang | 0 | 0 | 0 | 0 |

**Ảnh tiêu biểu:** `1280x900-today.png`, `390x844-today.png`, `360x740-today.png`, `390x844-large-today.png`, `390x844-more-open.png`, `1280x900-overview.png`, `360x740-overview.png`, `1280x900-alerts.png`, `360x740-alerts.png`, `390x844-alert-detail.png`, `360x740-alert-detail.png`, `1280x900-subjects.png`, `1280x900-history.png`, `flow-settings.png`, `1280x900-admin.png`, `390x844-large-admin.png`, `admin-tab-*.png`, `state-*.png`, `flow-*.png`.

**Script đo:** `C:/tmp/rev-v4-app/audit.mjs` (10 màn × 4 viewport, menu, tab order, biến thể trạng thái), `flow.mjs` (gửi/đổi hồ sơ/phản hồi muộn/403/429), `flow2.mjs` (no-data/offline/menu keyboard/role=log), `probe*.mjs` (đo chi tiết biểu đồ, chip, switcher).

**Ghi chú trung thực:** mọi số liệu trong báo cáo này lấy từ lần chạy ngày 2026-11-15 trong worktree `v4-simple-app` tại `bda9bb2`; không dùng số liệu handoff. Những mục ghi “— Ghi nhận” là quan sát đo được, không phải kết luận review.
