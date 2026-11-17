# Review độc lập — Quản trị tối giản v4

**Nhánh:** `v4-simple-admin` — code `a4d6929`, handoff `fe31dec`, base `b778486`.
**Worktree kiểm:** `C:/Users/nguye/orca/workspaces/DATN/v4-simple-admin` (không sửa file nguồn/tracked; lệnh build chỉ tạo `apps/web/dist` đã nằm trong ignore).
**Worktree báo cáo:** `C:/Users/nguye/orca/workspaces/DATN/v4-review-admin` — file này.
**Ngày:** 2026-11-15 (Asia/Ho_Chi_Minh).
**Người thực hiện:** reviewer độc lập; không dùng output handoff làm kết quả, tự chạy lại test/build và tự đo bằng trình duyệt.
**Phạm vi:** chỉ giao diện `/app/admin`. Không đổi trạng thái user, không publish policy, không seed/xoá DB, không đụng `.data/pglite`, không sửa code/docs.

## 0. Kết luận ngắn

- **18 phát hiện:** 2 P1, 11 P2, 5 P3. Không có P0 trong phạm vi UI; báo cáo này không kết luận về phân quyền backend.
- Mục tiêu “4 tab, 4 ô tổng quan, bớt copy” đã thành hình; số liệu tổng quan khớp API thật và không còn copy demo/đồ án/giảng viên.
- Ba lỗi nặng nhất: **F01** metadata audit không đọc được trong ô bảng; **F02** lỗi/409 của policy nằm ngoài viewport mobile; **F03** bảng Nhật ký mobile giấu cột Kết quả/Thời gian/Chi tiết.
- Không nên merge trước khi xử lý F01/F02; F03–F17 nên xử lý trong cùng đợt vì đều là hậu quả của việc “đơn giản hoá bằng cách bỏ chữ/thu gọn bảng”.

## 1. Phạm vi diff và diff test (đọc trước khi chạy)

`git diff b778486..a4d6929` chỉ có 4 file, +805/−224:

| File | +/− | Nhận xét |
| --- | --- | --- |
| `apps/web/src/features/admin/AdminPage.tsx` | +240/−185 | 5 tab → 4 tab; 9 nhóm số → 4 KPI; audit list → bảng 5 cột; policy Card → panel; bỏ nhiều hint/giải thích |
| `apps/web/src/features/admin/AdminPage.test.tsx` | +131/−25 | 15 → 18 test; viết lại test tổng quan; thêm 3 test; đổi nhãn policy/audit |
| `apps/web/src/features/admin/AdminDevicesTab.tsx` | +1/−13 | chỉ bỏ 2 đoạn copy mở đầu (ngưỡng offline, ghi chú sức khỏe/pin) |
| `apps/web/src/styles/admin-simple.css` | +433/−1 | CSS mới cho 4 tab, KPI, card user, policy, audit |

Không có thay đổi API/contracts/schema. Vì vậy mọi lỗi dữ liệu dưới đây là lỗi hiển thị/UX, không phải lỗi backend.

### 1.1. Diff test — những gì bị đổi

- Không xoá test nào. `AdminPage.test.tsx` từ 15 lên 18 `it`.
- Test tổng quan cũ `admin → tổng quan hiển thị số liệu đúng` (assert `12`, `2`, `5`, `7`, nhãn `Thiết bị ngoại tuyến`, `Thông báo đang chờ gửi`) được thay bằng test 4 KPI + khối Cần chú ý. Assertion `2` (users.disabled) và `5` (subjects.total) **biến mất cùng UI**; không còn test nào chạm 4 số `users.disabled`, `subjects.total`, `tasks.open`, `outbox.pending`.
- Test mới có một assertion **rỗng về nghĩa**: fixture để `outbox.failed: 0` rồi
  `expect(screen.queryByText(/thông báo gửi lỗi/)).not.toBeInTheDocument()`. Câu này xanh kể cả khi dòng “thông báo gửi lỗi” trong Cần chú ý không bao giờ được render; không có test cho `failed > 0`.
- Test khoá user mới kiểm body PATCH, lý do rỗng, bảng tải lại — tốt. Nhưng không kiểm lý do toàn khoảng trắng, không kiểm giới hạn 500 ký tự (textarea cho gõ 600), không kiểm vị trí thông báo thành công (xem F09).
- Test policy được cập nhật nhãn; các assertion publish/409/digest giữ nguyên (14 chỗ nhắc `digest` trong file test). Không có test cho phần **hiển thị** digest/expectedVersion đã bị bỏ (trước đây cũng không có), không có test mở `Lịch sử phiên bản` nên lỗi copy F04 lọt.
- Test “khung trang” chủ yếu kiểm chữ/nút và `aria-pressed` của tab con; không kiểm nội dung tab con đổi, không kiểm URL/state, không kiểm tab cũ đã biến mất.
- Test audit chỉ kiểm `admin.user.disable`, “Thành công”, mở “Xem chi tiết” và chuỗi `"reason"` trong JSON. Hàm mới `actorLabel` (user/device/ai/system + fallback id ngắn) **không có test**; target “subject aaaaaaaa” cũng không được kiểm.
- Các test cũ của Thiết bị giữ nguyên; chỉ đổi cách mở tab. Không có test nào chạm CSS mobile (card user, bảng audit 782px, JSON trong ô).

## 2. Chạy lại trong worktree sạch (không dùng output handoff)

Đã chạy trong `v4-simple-admin`; `git status` trước/sau đều sạch (report nằm ở worktree reviewer).

| Lệnh | Kết quả |
| --- | --- |
| `pnpm build:contracts` | exit 0, `tsc -p tsconfig.json` không lỗi |
| `pnpm --filter @annhien/web test` | **33 file / 200 test xanh**, 10.43s (`vitest run`) |
| `pnpm --filter @annhien/web typecheck` | exit 0, `tsc --noEmit` |
| `pnpm --filter @annhien/web build` | exit 0, `✓ built in 224ms`; `AdminPage-*.js` 30.59 kB |

Không chạy `pnpm test:e2e` (Playwright repo trỏ 5173 và đang có server khác; xem mục 6).

## 3. Kiểm bằng trình duyệt thật (web 4341, API 3000)

- Web: Vite từ `v4-simple-admin/apps/web`, `--port 4341`; API có sẵn ở 3000; Chromium 1.65.1 headless.
- Viewport: 1280×900, 390×844, 360×740; mỗi viewport mở 5 màn: Tổng quan, Người dùng, Thiết bị, Nâng cao/Chính sách, Nâng cao/Nhật ký; thêm trạng thái mở form khoá, mở chi tiết audit, preview policy.
- Ảnh và số đo nằm ngoài repo: `%TEMP%\v4-admin-audit\shots\*.png`, `results.json`, `viewport.json` (không commit).
- 0 `console error`, 0 `pageerror` ở cả 3 viewport.
- `document.scrollWidth == clientWidth` ở cả 15 lượt đo màn hình (không tràn trang); mọi `<button>` trong `.admin-page` có cạnh ≥44px (đo được 44×44 nhỏ nhất). Outline focus là `3px solid rgb(12, 110, 99)` (token `--color-focus`), kể cả trên tab và summary.
- Dữ liệu API thật lúc kiểm: users 3 active/0 disabled; subjects 2; devices 0 online/1 offline; alerts 1 mở; tasks 1 mở; outbox 0 pending/0 failed. UI hiện `3 / 0 / 1 / 0`; Cần chú ý hiện “1 cảnh báo đang mở” + “1 thiết bị ngoại tuyến” — **khớp**.
- Lọc user: gõ `Minh` + Lọc → 1 dòng Nguyễn Văn Minh; lọc `Đã khóa` → EmptyState; audit 20 dòng/trang, `assistant.summary` 20 dòng khi lọc; policy v1, history 1 bản; thiết bị 1 (AN-2026-001, offline).
- Form khoá: bấm Xác nhận khi lý do rỗng hiện đúng “Vui lòng nhập lý do thay đổi trạng thái.” và **không** gửi PATCH; tôi không gửi PATCH thật.
- Policy: `Xem trước` chỉ gọi preview (service ghi rõ không ghi DB), không publish. Hai luồng PATCH thành công và 409 được **mô phỏng ở tầng route** (không chạm API/DB) để đo vị trí thông báo.

### 3.1. Chữ và thuật ngữ

- Không thấy copy “demo / đồ án / giảng viên / nghiệm thu” trong `.admin-page` (grep cả `AdminPage.tsx`, `AdminDevicesTab.tsx`, `admin-simple.css`).
- “Audit” đã thành **“Nhật ký”** — dễ hiểu hơn; “Chính sách thiết bị” và “Tổng quan” giữ nguyên và đúng nghĩa. Vấn đề còn lại là nội dung Nhật ký vẫn là mã kỹ thuật (F12), không phải tên tab.
- Chữ thừa kiểu mô tả dài đã được bỏ đúng hướng; các chỗ còn lại là **thiếu chữ/không rõ** (F15) hoặc **sai** (F04), không phải thừa.

> Giới hạn môi trường: `WEB_ORIGIN` của API đang là `http://localhost:5173`, nên đăng nhập/POST từ web 4341 bị 403 “Origin không được phép cho thao tác ghi”. Tôi dùng phiên admin seed sẵn (đăng nhập qua API bằng cookie) để xem; không đổi env, không restart API. Vì vậy 2 luồng ghi trong UI được đo bằng route mock. Việc này chỉ ảnh hưởng cách kiểm, không ảnh hưởng các lỗi giao diện dưới đây.

## 4. Findings

Mức: **P1** = chặn/che một việc quản trị cốt lõi, nên sửa trước merge; **P2** = sai lệch rõ về thông tin/khả dụng/a11y, sửa trong đợt; **P3** = nhỏ, dọn sau. “Nguồn” ghi phát hiện do v4 hay có từ trước.

| ID | Tab | Viewport | Hành vi | Mong đợi | Thực tế | Mức | Nguồn |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **F01** | Nâng cao → Nhật ký | 1280×900, 390×844, 360×740 | Mở “Xem chi tiết” ở dòng `assistant.summary` | JSON/metadata đọc được, mở rộng đủ ngang hoặc panel riêng | `<pre>` chỉ rộng **121px** (1280) / **67px** (390, 360); chữ bị bẻ từng mảnh (`stat us`, `degr aded`, `prov ider`); dòng cao **468px** (1280), **904px** (360); trang 360 dài **3285px** | **P1** | Mới (v4 chuyển list → bảng) |
| **F02** | Nâng cao → Chính sách | 360×740 (đo) | (a) sửa “Chu kỳ nhịp tim” = 0 rồi Xem trước; (b) mô phỏng 409 rồi Xem trước | Lỗi/409 và nút “Tải lại” phải nhìn thấy ngay tại chỗ bấm, hoặc focus/scroll tới lỗi | (a) lỗi field ở **y = −253**, focus vẫn ở nút, không có summary; lỗi field có role=alert nên screen reader nghe, nhưng người nhìn không thấy phản hồi. (b) cảnh báo ở **y = −516**, nút “Tải lại” ở **y = −377**, chỉ còn dòng “Xem trước để bật Phát hành.” | **P1** | Có từ trước (vị trí), v4 không sửa |
| **F03** | Nâng cao → Nhật ký | 390×844, 360×740; thêm 768 và 1024 | Mở tab, xem kết quả/thời gian/chi tiết | Thông tin chính (Kết quả, Thời gian) nhìn thấy, hoặc card/sticky cột; hint khi bảng cần cuộn | Khung 365/335px chứa bảng **782px**; 3/5 cột (Kết quả x=384, Thời gian x=518, Chi tiết x=703) nằm ngoài màn hình. Tại 768 hint `display:none` nhưng bảng vẫn 782 > 743; tại 1024 khung 582 < 782, hint vẫn ẩn | **P2** | Mới (v4) |
| **F04** | Nâng cao → Chính sách | Mọi viewport | Mở “Lịch sử phiên bản (1)” khi policy v1 đang active | Chỉ nói “Chưa có bản phát hành” khi history rỗng; nếu có thì “Giá trị mặc định (dùng khi chưa có bản phát hành)” | Hiện đúng chữ **“Chưa có bản phát hành:”** ngay trên nút “Điền giá trị mặc định”, dù history có v1 active | **P2** | Mới (v4) |
| **F05** | Nâng cao → Chính sách | Mọi viewport | Xem trước hợp lệ | Giữ bằng chứng preview như bản cũ: digest ràng buộc, expectedVersion, “preview không ghi gì” | Chỉ còn “Giá trị hợp lệ / Có thể phát hành bản này.”; digest, version nền và câu “không ghi” đã bị bỏ; admin không kiểm được nội dung nào sẽ được gửi kèm `previewDigest` | **P2** | Mới (v4) |
| **F06** | Tổng quan | Mọi viewport | Xem 4 ô | 4 ô theo yêu cầu, nhưng tín hiệu vận hành còn lại phải xem được ở đâu đó | API có `tasks.open=1`, `subjects.total=2`, `outbox.pending=0`, `users.disabled=0`; UI bỏ cả 4; `/app/admin` không còn hiện `tasks.open`/`pending`, còn `/app/tasks` là màn theo hồ sơ chứ không phải chỉ số hệ thống. Outbox kẹt `pending>0` mà `failed=0` sẽ vô hình | **P2** | Mới (v4) |
| **F07** | Tổng quan | Mọi viewport | Xem “Cần chú ý” | Khối này thêm thông tin hoặc hành động | “1 cảnh báo đang mở” lặp nguyên KPI cùng màn; 2/4 KPI là 0; không có link tới tab liên quan; chỉ “1 thiết bị ngoại tuyến” là thông tin mới | **P3** | Mới (v4) |
| **F08** | Người dùng | Mọi viewport | Xem/lọc danh sách | Giữ ngày tạo hoặc nơi xem chi tiết; hint cho tìm kiếm/trạng thái | Bỏ cột “Tạo” (không còn `createdAt` trong tab); bỏ hint “Tìm theo email hoặc tên hiển thị”, “Bao gồm cả tài khoản đã khóa”; bộ lọc vẫn chạy nhưng không còn manh mối phạm vi | **P2** | Mới (v4) |
| **F09** | Người dùng | 360×740 (đo) | Nhập lý do + xác nhận khoá (mô phỏng PATCH thành công) | Thông báo thành công nhìn thấy gần hành động, focus quay lại | Dòng đổi đúng sang “Đã khóa”/“Kích hoạt” nhưng thông báo ở **y = −410** (ngoài màn); focus thành `BODY`; role=status chỉ screen reader nghe | **P2** | Có từ trước (vị trí), v4 làm trang dài hơn |
| **F10** | Người dùng | 360×740 (đo) | Mở form “Tạm khóa”; bấm “Hủy” | Focus vào ô lý do khi mở; trả focus về nút khi hủy; lý do bắt buộc được thông báo | `activeElement = BODY` sau cả mở và hủy; textarea không có `required`/`aria-required`, dấu `*` bị `aria-hidden`; a11y snapshot chỉ là `textbox "Lý do"`, đến khi submit mới `[invalid]` | **P2** | Có từ trước (v4 không sửa) |
| **F11** | Người dùng (mobile) | 360×740 (đo) | Đọc bảng user bằng screen reader | Nhãn cột chỉ hiển thị, không đọc lặp | `::before { content: attr(data-label) }` làm cell đọc “Vai trò Quản trị”, “Trạng thái Hoạt động”, “Hành động Tạm khóa”; cấu trúc table vẫn còn nhưng thông tin bị lặp | **P2** | Mới (v4) |
| **F12** | Nâng cao → Nhật ký | Mọi viewport | Đọc/lọc nhật ký | Mã hành động có nhãn người đọc; target là tên/đối tượng; bộ lọc có gợi ý | 100/100 dòng là `auth.login`, `assistant.summary`, `incident.acknowledge`; target “subject aaaaaaaa”, “incident ffffffff”; bỏ hint ví dụ của ô “Hành động” nên phải biết đúng mã; actor picker `limit: 100` — quá 100 user sẽ hiện “Người dùng 8-ký-tự” | **P2** | Một phần mới (bảng/label), phần lớn có từ trước |
| **F13** | Khung trang | Mọi viewport | Đổi tab, reload, đổi bộ lọc rồi quay lại | URL giữ tab (deep link) hoặc ít nhất giữ state; không mất bộ lọc | URL luôn `/app/admin`; reload về Tổng quan; “Nâng cao” luôn về Chính sách; bộ lọc audit `action` về rỗng sau khi sang Chính sách rồi quay lại; tìm kiếm user cũng mất (component unmount) | **P2** | Mới (v4 gộp tab con) |
| **F14** | Khung trang | Mọi viewport | Tab bằng bàn phím/screen reader | `tablist/tab/tabpanel` hoặc link có URL; mỗi màn có heading | `role="group"` + `aria-pressed`; ArrowRight không đổi tab; không có `aria-controls/tabpanel`; màn Người dùng và Nhật ký chỉ có H1, không có H2 (Thiết bị/Chính sách có) | **P3** | Mới (v4) |
| **F15** | Nâng cao → Chính sách | Mọi viewport | Đọc 5 nhãn | Nhãn nói rõ đối tượng/đơn vị và tác động | “Ngoại tuyến sau (giây)”, “Dữ liệu tươi (giây)”, “Telemetry tối đa/phút”, “Chu kỳ nhịp tim (giây)” — mất “gửi/ngưỡng”, “dữ liệu tươi” và “telemetry” là thuật ngữ; không còn câu giải thích nào | **P3** | Mới (v4) |
| **F16** | Thiết bị | Mọi viewport | Xem thẻ thiết bị | Hồ sơ hiển thị tên; trạng thái offline có ngưỡng/giải thích | “Hồ sơ đang gắn aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa”; “Ngoại tuyến” không nói ngưỡng 900s; nếu policy lỗi, “Chưa rõ kết nối” không còn lời giải thích (đã bỏ ở v4) | **P3** | UUID có trước; copy bị bỏ ở v4 |
| **F17** | Test (jsdom) | — | Đọc diff test + chạy | Test bắt được hành vi mới và chỗ dễ hồi quy | Assertion “thông báo gửi lỗi” rỗng nghĩa; không test `failed>0`, `actorLabel`, lịch sử policy, URL/state, CSS mobile; 4 số bị bỏ khỏi UI không còn test nào; textarea cho 600 nhưng chặn ở 500 không test | **P2** | Mới/một phần |
| **F18** | Nâng cao → Nhật ký | 1280×900 | Bấm “Xem chi tiết” | Vùng bấm ≥44px | `summary` cao **26px** ở desktop (mobile 53px) | **P3** | Mới (v4) |

### 4.1. F01 — “Xem chi tiết” audit không đọc được (P1)

**Vị trí:** `AdminPage.tsx:837-839` đặt `<details><pre>{JSON.stringify(...)}</pre></details>` trong `<td>` của bảng 5 cột; `admin-simple.css:309-311` chỉ đặt `max-width: 22rem`; `layout.css:2187-2200` dùng `white-space: pre-wrap; overflow-wrap: anywhere`.

**Đo thật:**

| Viewport | `<td>` | `<pre>` | Số dòng JSON | Chiều cao dòng | Chiều cao trang |
| --- | --- | --- | --- | --- | --- |
| 1280×900 | 147px | 121px | 18 | 468px | 2229px |
| 390×844 | 93px | 67px | 36 | 904px | 3285px |
| 360×740 | 93px | 67px | 36 | 904px | 3285px |

Ảnh: `%TEMP%\v4-admin-audit\shots\details-1280.png`, `details-360.png`, `mobile360-advanced-audit-details.png`. Chữ bị bẻ giữa từ (`stat` / `us`, `degr` / `aded`, `prov` / `ider`, `temp` / `late`), nên metadata coi như không đọc được. Bản trước hiển thị details trong một `<li>` full-width nên không có lỗi này — đây là **hồi quy do chuyển sang bảng**.

**Mong đợi:** details mở thành một dòng full-width (`<tr><td colSpan={5}>`), hoặc panel/dialog; đặt `min-width` cho `<pre>`; nếu vẫn để trong ô thì ít nhất `overflow-x:auto` + `white-space:pre` (không bẻ từ) và có nút mở rộng.

### 4.2. F02 — Policy báo lỗi/409 ngoài viewport (P1)

**Vị trí:** `AdminPage.tsx:562-578` đặt cảnh báo `staleInfo` ở đầu panel; nút “Xem trước”/“Phát hành” ở cuối form (`606-612`). `validateValue` (`505-529`) chỉ `setFieldErrors`, không scroll/focus; `TextField` có `role="alert"` cho lỗi field nên screen reader nghe, nhưng người nhìn không thấy.

**Đo tại 360×740:**

- Sửa `Chu kỳ nhịp tim = 0` → bấm Xem trước: lỗi “Chu kỳ nhịp tim (giây): giá trị không hợp lệ.” ở `top = −253px`; focus vẫn ở nút; không có thông báo tổng. Ảnh `v360-policy-invalid.png`.
- Mô phỏng 409 `APPROVAL_STALE` → bấm Xem trước: cảnh báo “Chính sách đã thay đổi” ở `top = −516px`, nút “Tải lại” ở `top = −377px`, `scrollY = 952`; màn hình chỉ còn form. Ảnh `v360-policy-stale.png`.

**Mong đợi:** lỗi field đầu tiên được focus + scroll vào tầm nhìn; thêm summary lỗi cạnh nút; 409 đặt cạnh hành động hoặc toast cố định kèm “Tải lại”, không phụ thuộc việc người dùng tự cuộn lên đầu panel.

### 4.3. F03 — Nhật ký mobile giấu cột chính (P2)

**Vị trí:** `admin-simple.css:290-292` đặt `min-width: 46rem` cho `.adm-table--audit`; hint `.adm-table-hint` chỉ hiện ≤767px (`352-355`), trong khi bảng vẫn cần cuộn ở 768 và 1024 (khung hẹp do sidebar).

**Đo:**

| Viewport | Khung `.adm-table-wrap` | Bảng | Vị trí cột Kết quả / Thời gian / Chi tiết | Hint |
| --- | --- | --- | --- | --- |
| 390 | 365px | 782px | x = 384 / 518 / 703 | hiện |
| 360 | 335px | 782px | x = 384 / 518 / 703 | hiện |
| 768 | 743px | 782px | — | **ẩn** |
| 1024 | 582px | 782px | — | **ẩn** |

Không tràn toàn trang (đúng yêu cầu “cuộn trong khung”) nhưng thông tin quyết định (kết quả, thời gian) nằm ngoài màn; muốn mở “Xem chi tiết” phải vuốt ngang rồi cuộn dọc. Ảnh `mobile360-advanced-audit.png`, `v390-viewport-audit.png`.

**Mong đợi:** card cho audit dưới 768 (như user), hoặc sticky cột “Hành động”, hoặc chỉ giữ 3 cột chính + details mở full-width; hint hiện ở mọi width mà `scrollWidth > clientWidth`.

### 4.4. F04 — Copy sai “Chưa có bản phát hành” (P2)

**Vị trí:** `AdminPage.tsx:669-679`. Nhánh `history.length === 0` mới có EmptyState, nhưng câu “Chưa có bản phát hành:” render vô điều kiện trước nút “Điền giá trị mặc định”. Với dữ liệu thật (v1 active, history 1), ảnh `desktop-advanced-policy.png` và text đo được:

```
Lịch sử phiên bản (1)
Chưa có bản phát hành:
Điền giá trị mặc định
v1 · đang hoạt động
12:12 15 thg 11, 2026
```

**Mong đợi:** “Giá trị mặc định (dùng khi chưa có bản phát hành)” như bản cũ, hoặc chỉ hiện câu “Chưa có bản phát hành” khi `history.length === 0`; nút này nên nằm ngoài `<details>` hoặc có nhãn rõ.

### 4.5. F05 — Mất bằng chứng preview (P2)

**Vị trí:** `AdminPage.tsx:625-641`; bản cũ in `previewResult.digest.slice(0,12)` + `expectedVersion` + “Preview không ghi gì vào hệ thống”. Nay chỉ “Có thể phát hành bản này.”, trong khi publish vẫn gửi `previewDigest` (`450-460`) và `expectedVersion`. Admin không thấy digest/version nền nên không thể đối chiếu khi có 409 hoặc khi nghi ngờ nội dung đã đổi. Test không bắt vì trước đây cũng không assert phần hiển thị này.

**Mong đợi:** giữ một dòng ngắn “Bản xem trước cho v{N} · digest {12}… · không ghi dữ liệu” dưới alert; hoặc link “Xem chi tiết kỹ thuật” mở các giá trị này.

### 4.6. F06 — Tổng quan bỏ 4 số vận hành (P2)

Dữ liệu API thật tại thời điểm kiểm:

```json
{"users":{"active":3,"disabled":0},"subjects":{"total":2},
 "devices":{"online":0,"offline":1},"alerts":{"open":1},
 "tasks":{"open":1},"outbox":{"pending":0,"failed":0}}
```

UI chỉ còn `users.active`, `devices.online`, `alerts.open`, `outbox.failed`. `tasks.open = 1` là việc bảo trì đang mở nhưng `/app/admin` không còn hiện (và `/app/tasks` là màn theo hồ sơ, không phải chỉ số hệ thống); `outbox.pending` biến mất nên hàng đợi kẹt (pending tăng, failed = 0) không có tín hiệu; `subjects.total` và `users.disabled` cũng không còn chỗ xem (disabled còn lọc được ở tab Người dùng, subjects không). Test cũ từng assert `2`/`5`; test mới bỏ hẳn.

**Mong đợi:** 4 ô vẫn là mặc định, nhưng thêm `pending`/`tasks` vào “Cần chú ý” hoặc một dòng “Chi tiết vận hành” gấp lại; ít nhất đừng bỏ tín hiệu `tasks.open`/`pending`.

### 4.7. F09/F10 — Thông báo và focus ở tab Người dùng (P2)

- **F09:** mô phỏng PATCH thành công tại 360×740 (route 200, không gọi API): dòng Minh đổi sang “Đã khóa” + nút “Kích hoạt” (đúng), nhưng `notice` ở `top = −410` so với viewport; `activeElement = BODY`. Vị trí notice ở đầu `UsersTab` (`AdminPage.tsx:193`), trong khi hành động ở cuối card trên mobile. Bản cũ cũng đặt notice ở đầu tab, nhưng v4 làm danh sách cao hơn (3 card = 862px) nên khoảng cách tới notice tăng.
- **F10:** mở form “Tạm khóa” → `activeElement = BODY`; bấm “Hủy” → `BODY`; Tab kế tiếp nhảy vào textarea. Textarea (`AdminPage.tsx:275-286`) không có `required`/`aria-required`; dấu `*` bị `aria-hidden`; a11y snapshot: `textbox "Lý do"` (không required), sau submit mới `[invalid]` + alert.

**Mong đợi:** focus vào textarea khi mở form, trả focus về nút vừa bấm khi hủy/thành công; notice là toast gần hành động hoặc đặt trên dòng vừa đổi; textarea có `required`/`aria-required` và `aria-describedby` tới lỗi.

### 4.8. F11 — Nhãn cột mobile bị đọc lặp (P2)

`admin-simple.css:409-414` dùng `::before { content: attr(data-label) }`. A11y snapshot tại 360:

```
row "Nguyễn Văn Minh ... Vai trò Người dùng Trạng thái Hoạt động Hành động Tạm khóa"
  cell "Vai trò Người dùng"
  cell "Trạng thái Hoạt động"
  cell "Hành động Tạm khóa"
```

Cấu trúc table vẫn được giữ (tốt), nhưng mỗi cell bị đọc lặp nhãn. **Mong đợi:** nhãn mobile là `<span aria-hidden="true">` (không dùng pseudo-element), hoặc dùng `aria-labelledby`/header ẩn đúng cách.

### 4.9. F12 — Nhật ký vẫn là nội dung kỹ thuật (P2)

- 100/100 bản ghi mới nhất là `auth.login` (31), `assistant.summary` (68), `incident.acknowledge` (1); cột chính là mã máy, không có nhãn “Đăng nhập / Tóm tắt trợ lý / Xác nhận cảnh báo”.
- Target hiện `subject aaaaaaaa`, `incident ffffffff` — loại tiếng Anh + UUID 8 ký tự, đặt ngay dưới tên người thực hiện nên dễ nhầm actor/target.
- Bộ lọc “Hành động” mất hint; admin phải biết đúng mã. Actor picker vẫn `fetchAdminUsers({ limit: 100 })` (`AdminPage.tsx:712`); quá 100 user, tên actor rơi về “Người dùng 8-ký-tự” (`735-749`). Với seed 3 user hiện tại thì tên hiện đủ, nhưng đây là lỗi tiềm ẩn đã ghi ở review v2.
- “Xem chi tiết” vẫn là JSON thô (xem F01).

**Mong đợi:** map nhãn cho các action phổ biến + giữ mã trong tooltip; target hiện tên/loại người đọc; gợi ý action (datalist) hoặc select; actor lấy đủ danh sách/không fallback UUID.

### 4.10. F13/F14 — URL, state và nghĩa tab (P2/P3)

- URL luôn `http://localhost:4341/app/admin`; reload → Tổng quan (`pressedTabs: ["Tổng quan"]`); “Nâng cao” luôn mở Chính sách; bộ lọc audit mất khi sang Chính sách rồi quay lại (`actionValue: ""`, 20 dòng); tìm kiếm user mất khi đổi tab. Không “lẫn” state nhưng không thể chia sẻ link tới policy/nhật ký hay quay lại đúng màn sau reload.
- Tab là `button` trong `role="group"` + `aria-pressed`; ArrowRight không đổi tab (đo được `focused: "Tổng quan"`, `pressed: "Tổng quan"`); không có `aria-controls`/`tabpanel`. Màn Người dùng và Nhật ký không có H2; heading chỉ có H1. Focus ring 3px vẫn hiện đủ trên tab và summary — điểm này ổn.

**Mong đợi:** dùng `?tab=users` / `?tab=advanced&view=audit` (hoặc router lồng) để deep link + reload giữ state; dùng `role="tablist"`/`tab`/`tabpanel` + roving tabindex, hoặc chuyển tab thành link; thêm H2 cho từng màn.

### 4.11. F15/F16 — Nhãn policy và thẻ thiết bị (P3)

- Policy: “Dữ liệu tươi (giây)” là dịch sát “fresh data”, “Telemetry tối đa/phút” là tiếng Anh; “Ngoại tuyến sau (giây)” thiếu “không nhận dữ liệu”; không còn câu giải thích nào nên người mới không biết 5 số này điều khiển gì. Test đã codify các nhãn này (`AdminPage.test.tsx` dòng 328, 433, 487...).
- Thiết bị: “Hồ sơ đang gắn” in nguyên UUID (`AdminDevicesTab.tsx:325-330`); “Ngoại tuyến” không nói ngưỡng (policy 900s); v4 bỏ đoạn hint giải thích ngưỡng/”chưa rõ kết nối khi policy lỗi”, nên trạng thái “Chưa rõ kết nối” không còn lý do hiển thị. Ảnh `mobile390-devices.png`.

**Mong đợi:** tên hồ sơ thay UUID (API có thể trả kèm, hoặc link tới hồ sơ); tooltip/dòng ngắn “Ngoại tuyến sau 900s không nhận dữ liệu”; giữ thông báo khi policy lỗi.

### 4.12. F17 — Lỗ hổng test (P2)

- Assertion rỗng: `failed: 0` + `queryByText(/thông báo gửi lỗi/).not.toBeInTheDocument()`. Nếu dòng thứ ba của “Cần chú ý” không bao giờ render, test vẫn xanh. Không có test `outbox.failed: 1` → “1 thông báo gửi lỗi”.
- Không test `actorLabel` cho device/ai/system và fallback id; không test target “subject …”; không test mở `Lịch sử phiên bản`/copy F04; không test `preview` còn digest/expectedVersion (F05); không test `history` rỗng vs có bản (chỉ có một fixture history 2 bản nhưng không mở).
- Test “khung trang” chỉ đọc chữ/nút; không kiểm nội dung tab con, không kiểm tab cũ đã mất, không kiểm URL.
- Bỏ 4 số khỏi UI kéo theo **không còn test** cho `users.disabled`, `subjects.total`, `tasks.open`, `outbox.pending`; nếu ai đó vô tình thêm lại/đổi công thức, không có lưới.
- `textarea maxLength={600}` nhưng validate chặn 500; không test trường hợp 501–600 (dễ gây “gõ được nhưng submit lỗi”).
- Không test CSS mobile (jsdom không chạy layout) — chấp nhận được, nhưng các lỗi F01/F03/F11 chỉ phát hiện được bằng đo trình duyệt; nên có ít nhất một ảnh/Playwright smoke cho audit details.

### 4.13. F07/F18 — Chi tiết nhỏ (P3)

- Cần chú ý lặp KPI, không có hành động (ảnh `desktop-overview.png`); 2/4 KPI bằng 0 nên khối “Cần chú ý” chỉ thêm 1 dòng.
- `summary` “Xem chi tiết” cao 26px ở desktop (mobile 53px), dưới ngưỡng chạm 44px; nếu coi summary là control thì nên tăng.
- CSS chết còn lại: `.adm-stat-group`, `.adm-stat-list`, `.adm-history-digest`, `.adm-table__caption` (không còn markup) — dọn sau, không ảnh hưởng hiển thị.

## 5. Sai lệch với handoff

- Handoff nói “nút hành động full chiều rộng thẻ” ở mobile; đo thực tế nút “Tạm khóa” rộng **188px** trong card **335px** (chỉ full cột nội dung sau nhãn 6.5rem), không full card.
- Handoff nói “0 nút nào trong `.admin-page` thấp hơn 44px” — đúng với `<button>` (đo 44×44), nhưng không nói `summary` “Xem chi tiết” chỉ 26px ở desktop (F18).
- Handoff ghi “17 lượt đo, scrollWidth − clientWidth = 0, 0 pageerror” — tôi đo lại 5 màn × 3 viewport = 15 lượt cũng 0 tràn trang/0 pageerror, nhưng phép đo đó **không mở audit details, không kiểm policy lỗi/409, không kiểm notice thành công**, nên không phát hiện F01/F02/F09.
- Handoff mô tả “bảng audit 5 cột ... metadata mở được qua Xem chi tiết” mà không nói độ rộng `<pre>` bị bóp còn 67–121px.
- Handoff nói ảnh chụp ở cổng 4330; tôi kiểm độc lập ở 4341, cùng seed API 3000. Không dùng output/ảnh của handoff.
- Các điểm khác của handoff khớp: 4 file sửa, 4 tab + 2 mục con, KPI 3/0/1/0, Cần chú ý 1+1, 33 file/200 test, không sửa API/contracts/docs, không tạo thêm phụ thuộc.

## 6. Giới hạn của lần kiểm

- Không chạy `pnpm test:e2e` (Playwright repo trỏ 5173, đang có server khác; E2E không nằm trong yêu cầu).
- Không có screen reader thật (NVDA/VoiceOver); a11y dựa trên `ariaSnapshot` của Chromium và computed style, nên F11/F10 là bằng chứng cấu trúc, chưa phải trải nghiệm screen reader đầy đủ.
- Không đo contrast bằng axe/Lighthouse; chỉ đọc token và ảnh.
- Không kiểm 320px, Firefox/Safari, bàn phím ảo iOS, zoom 200%.
- Không publish policy thật, không PATCH trạng thái user, không seed/xoá DB. Luồng thành công/409 của PATCH/preview được mô phỏng ở tầng route (không chạm API/DB); preview thật đã gọi nhưng service không ghi DB.
- API đang chạy với `WEB_ORIGIN=5173`; đăng nhập/POST từ 4341 bị 403, nên phiên xem dùng cookie admin seed (một bản ghi `auth.login` được thêm vào audit — không phải thay đổi trạng thái user/policy). Không đổi env/restart API.
- Chỉ kiểm một seed (3 user, 2 hồ sơ, 1 thiết bị, 1 cảnh báo, 1 task). Các lỗi phụ thuộc dữ liệu lớn (`>100` user ở audit actor picker) chưa tái hiện được với seed này; ghi theo code + review v2 trước.

## 7. Thứ tự xử lý đề xuất

1. **F01:** đưa details audit ra full-width row/panel; đặt `min-width` và không `overflow-wrap:anywhere` cho JSON; thêm test Playwright mở details ở 360.
2. **F02:** summary lỗi policy + focus field đầu tiên; đưa cảnh báo 409 và nút “Tải lại” cạnh nút hành động/toast; test ở 360.
3. **F03:** card audit dưới 768 hoặc sticky cột; hint theo `scrollWidth > clientWidth`, không chỉ 767.
4. **F04/F05:** sửa copy lịch sử; trả digest/expectedVersion/“không ghi” vào preview (ngắn).
5. **F06/F07:** thêm `tasks.open`/`outbox.pending` vào Cần chú ý hoặc mục gấp; bỏ dòng lặp.
6. **F09/F10/F11:** focus/notice/toast; `required`/`aria-required`; bỏ pseudo-element label hoặc `aria-hidden`.
7. **F12/F13:** nhãn action/target, actor đủ danh sách; URL state cho tab + filter.
8. **F17:** test cho `failed>0`, actorLabel, history copy, URL; test mobile bằng Playwright cho audit details.
9. **F08/F15/F16/F18:** ngày tạo/hint, nhãn policy, tên hồ sơ, 44px summary.

## 8. Tóm tắt 5 dòng

1. Đã đọc diff + diff test trước, chạy lại contracts build, 33 file/200 test web, typecheck, build trong worktree sạch; tất cả exit 0 / xanh.
2. Đã mở 5 màn ở 1280/390/360, đăng nhập admin, đo overflow/button/focus, lọc user, mở audit details, preview policy; không đổi trạng thái user, không publish, không đụng DB.
3. 18 phát hiện: 2 P1 (metadata audit không đọc được; lỗi/409 policy ngoài viewport mobile), 11 P2, 5 P3; số KPI khớp API và không còn copy demo, nhưng nhiều thông tin cũ bị bỏ mà không có chỗ thay.
4. Ba lỗi nặng nhất: F01 audit details 67–121px, F02 policy feedback ngoài màn, F03 bảng Nhật ký mobile giấu Kết quả/Thời gian/Chi tiết.
5. Báo cáo: `reports/qa/v4-review-admin.md` (worktree reviewer); nhánh `v4-simple-admin` không bị sửa.
