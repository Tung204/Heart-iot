# Re-review độc lập — Quản trị sau sửa (v4)

**Nhánh kiểm:** `fix-v4-admin` — code `d6e59d2`, handoff `7b31ef4`, base `v4-simple-admin` (`fe31dec`).
**Worktree kiểm:** `C:/Users/nguye/orca/workspaces/DATN/fix-v4-admin` (không sửa file nguồn; build chỉ tạo `apps/web/dist` đã ignore).
**Worktree báo cáo:** `C:/Users/nguye/orca/workspaces/DATN/v4-rereview-admin` — file này.
**Ngày:** 2026-11-15 (Asia/Ho_Chi_Minh). **Người thực hiện:** reviewer độc lập, không dùng output/ảnh của handoff.
**Nguồn lỗi:** `reports/qa/v4-review-admin.md` (18 phát hiện: 2 P1, 11 P2, 5 P3).
**Phạm vi:** giao diện `/app/admin`; không merge, không sửa code, không publish policy, không PATCH trạng thái user thật, không seed/xoá DB.

## 0. Kết luận ngắn

- **18 phát hiện còn lại: 0 P1, 8 P2, 10 P3** (bảng R01–R18). Không có P1 chặn merge trong ba viewport bắt buộc 1280/390/360.
- **F01 và F02 đã xử lý đúng ở ba viewport bắt buộc**: JSON audit rộng 811/337/307px, không bẻ từ; lỗi field policy được focus + cuộn vào màn; cảnh báo 409 và nút “Tải lại” nằm trong viewport 360.
- **Nhưng F01 vẫn còn lỗi ở 768/1024** (dòng chi tiết bị chính khung bảng cuộn ngang cắt mất 35–200px đầu), và **F09 vừa sửa đã tạo hồi quy**: thông báo thành công biến mất khi bộ lọc đang bật làm dòng vừa đổi rời danh sách.
- **F06 chỉ xử lý một phần**: `tasks.open`/`outbox.pending` đã hiện, nhưng `subjects.total`/`users.disabled` vẫn không có chỗ xem, và `devices.offline` có thể bị “Cần chú ý” cắt mất dù không có ô KPI tương ứng.
- **F13/F17 còn một phần** (bộ lọc vẫn mất khi đổi tab; test không bắt được layout tablet, focus 409, focus lỗi PATCH và hồi quy thông báo theo bộ lọc).

## 1. Diff và diff test (đọc trước khi chạy)

`git diff fe31dec..fix-v4-admin` gồm 6 file, +1540/−229 (5 file code + handoff):

| File | +/− | Ghi chú |
| --- | --- | --- |
| `AdminPage.tsx` | +527/−151 | nhãn action/target, focus/notice, summary lỗi policy, audit full-width row, tab URL, tablist |
| `AdminPage.test.tsx` | +539/−60 | 200 → 214 test; không xoá `it` nào |
| `AdminDevicesTab.tsx` | +17/−3 | hint ngưỡng offline, “Mã hồ sơ” thay UUID trần |
| `admin-simple.css` | +192/−15 | card audit/user, label aria-hidden, pre không bẻ từ, table-layout fixed |
| `admin-devices.css` | +13 | style hint/Mã hồ sơ |
| `reports/handoffs/v4-fix-admin.md` | +252 | handoff |

Không có thay đổi API/contracts/schema, không thêm dependency, không sửa `AppShell/router/layout/tokens`.

### 1.1. Diff test — không xoá test, nhưng có assertion bị nới

- `AdminPage.test.tsx`: **18 → 32 `it`** trong file (tổng repo 200 → **214 test / 33 file**, đã chạy lại). Không có `it` nào bị xoá; test audit cũ được viết lại, test “bốn tab” đổi `button` → `tab`, nhãn policy đổi theo tên mới.
- **Hai chỗ nới đáng chú ý:**
  1. Test tổng quan mặc định (dòng 246–275) **bỏ assertion `3 thiết bị ngoại tuyến`** dù fixture `OVERVIEW` vẫn có `devices.offline: 3`. Lý do là “Cần chú ý” mới cắt còn 3 dòng và xếp `alerts.open` trước `devices.offline`, nên thiết bị ngoại tuyến bị ẩn. Đây không chỉ là đổi test: hành vi hiển thị đã đổi theo hướng mất tín hiệu (xem R01).
  2. Test “Người dùng” cũ assert `ASSIGNED_SUBJECT_ID` (UUID đầy đủ) trong thẻ thiết bị; nay thay bằng `getByTitle(ASSIGNED_SUBJECT_ID)` + `queryByText(UUID)` không tồn tại. Thay đổi này **đúng hướng F16**, không phải nới ẩu.
- Test mới có ích: `Cần chú ý` tối đa 3 dòng; `failed > 0`; focus/hủy form lý do + `required`/`aria-required`/`maxLength=500`; field policy focus + summary; preview evidence; lịch sử policy; ArrowRight/URL deep link; audit `colspan=5`, nhãn action/actor/target, hint theo `scrollWidth`, nhãn cell `aria-hidden`; hint + ngày tạo user.
- **Lỗ hổng test còn lại (F17):** test hint dùng `vi.spyOn(HTMLElement.prototype,'scrollWidth')` nên không đo layout thật; test chi tiết chỉ assert `colspan`/nội dung `<pre>`, không bắt được việc dòng bị cắt ở 768/1024; test 409 không assert focus/scroll (chỉ assert chữ + nút “Tải lại”); không test lỗi PATCH, không test thông báo thành công khi dòng rời bộ lọc, không test bộ lọc mất khi đổi tab, không test `subjects.total`/`users.disabled`/`devices.offline` bị cắt.

## 2. Chạy lại trong worktree sạch (không dùng output handoff)

Chạy tại `fix-v4-admin`, `git status` trước/sau đều sạch (report nằm ở worktree reviewer).

| Lệnh | Kết quả |
| --- | --- |
| `pnpm build:contracts` | exit 0, `tsc -p tsconfig.json` không lỗi |
| `pnpm --filter @annhien/web test` | **33 file / 214 test không lỗi**, 21,67s |
| `pnpm --filter @annhien/web typecheck` | exit 0 (`tsc --noEmit`) |
| `pnpm --filter @annhien/web build` | exit 0, `✓ built in 295ms`; `AdminPage-*.js` **38,75 kB** (handoff ghi 38,75 kB) |

## 3. Cách kiểm bằng trình duyệt

- Web Vite từ `fix-v4-admin/apps/web`, **cổng 4344**; API thật ở **3000**; Chromium 1.65.1 headless.
- Đăng nhập admin bằng cookie phiên lấy từ `POST /api/v1/auth/login` (API đang chạy nhận mật khẩu seed cũ `demo-admin-2026`, không phải `demo-an-nhien-2026` trong `seed.ts` hiện tại; xem mục 7). Chỉ đọc dữ liệu admin.
- Viewport: **1280×900, 390×844, 360×740**; thêm **768×900, 1024×900** cho bảng Nhật ký; thêm bộ chữ lớn 20px (125%) và 32px (200%).
- Màn đo: Tổng quan, Người dùng (mở/hủy form, thông báo thành công, lỗi PATCH), Thiết bị, Chính sách (lỗi field, preview thật, 409 preview/publish), Nhật ký (lọc action, mở chi tiết).
- Luồng ghi **được mock ở tầng route** (`page.route`): PATCH 200/500, preview 409, publish 409; **không gọi API ghi**. Preview thật có gọi `POST /previews` (service không ghi DB), chỉ override header `Origin` để đi qua `WEB_ORIGIN=5173` của API đang chạy; đã kiểm policy vẫn `version=1`, `updatedAt` không đổi sau preview.
- 0 `pageerror`; console chỉ có 3 dòng 409 do mock cố ý. `document.scrollWidth == clientWidth` ở mọi lượt đo (0 tràn trang).
- Ảnh/JSON đo ngoài repo: `%TEMP%\v4-rereview\shots\*.png`, `phaseA..G.json`.

## 4. Kiểm lại từng phát hiện F01–F18

| ID | Kết quả kiểm lại | Bằng chứng chính | Còn lại |
| --- | --- | --- | --- |
| **F01** | **Đã xử lý ở 1280/390/360** | `<td>` 838/365/335px; `<pre>` **811/337/307px**, cao 137px; JSON đủ 6 dòng, không bẻ từ; `scrollWidth 327 > clientWidth 307` tại 360 (cuộn ngang trong ô, không bẻ) | **R02**: 768/1024 dòng chi tiết bị khung bảng cuộn ngang cắt đầu |
| **F02** | **Đã xử lý phần chính** | 360: field lỗi y 290–348, focus `policy-heartbeatIntervalSeconds`, outline 3px; 409: cảnh báo y 247–275, nút “Tải lại” y 368–419 trong viewport 740, focus `.adm-policy-status` | **R04/R05/R11/R12**: summary lỗi ngoài màn 360; lỗi cũ không tự xoá khi sửa; 2 alert; không thấy focus ring |
| **F03** | **Đã xử lý** | <768: bảng audit thành card, không cuộn ngang (335/335); 768: khung 743 / bảng 782 → hint hiện; 1024: 582/782 → hint hiện; 1280: 838/838 → hint ẩn | **R02/R16**: 1024 vẫn phải cuộn; card dài |
| **F04** | **Đã xử lý** | `Giá trị mặc định (dùng khi chưa có bản phát hành)` + `v1 · đang hoạt động`; không còn “Chưa có bản phát hành:” | — |
| **F05** | **Đã xử lý** | Preview thật: `Bản xem trước cho v1 · digest ba1a4981d61f · không ghi dữ liệu`; publish mock gửi `previewDigest` đủ 64 ký tự; policy không đổi sau preview | — |
| **F06** | **Một phần** | `1 công việc đang mở`, `1 thông báo đang chờ gửi` hiện trong “Cần chú ý” | **R01**: `subjects.total`/`users.disabled` vẫn vô hình; `devices.offline` bị cắt khi có 3 tín hiệu ưu tiên cao hơn |
| **F07** | **Một phần** | Thứ tự ưu tiên tín hiệu chưa có KPI; cap 3 dòng | **R17**: dòng “cảnh báo đang mở” vẫn lặp KPI; không có link tới tab liên quan |
| **F08** | **Đã xử lý** | “Tạo 15 thg 11, 2026” mỗi dòng; hint tìm `Tìm theo email hoặc tên hiển thị.`; hint lọc `“Tất cả” gồm cả tài khoản đã khóa.` | — |
| **F09** | **Đã xử lý luồng thường** | 360: notice y 390–443 trong 740, `role=status`, focus về “Kích hoạt”, dòng đổi “Đã khóa” | **R03**: mất notice khi dòng rời bộ lọc; **R12**: focus BODY khi lỗi PATCH |
| **F10** | **Đã xử lý** | Mở form focus `status-reason-…`; Hủy focus “Tạm khóa”; `required`, `aria-required=true`, `aria-describedby` gồm hint+lỗi, `maxLength=500`; lý do toàn khoảng trắng vẫn báo lỗi | **R06**: lỗi PATCH bị bóp 114px và focus BODY |
| **F11** | **Đã xử lý** | A11y snapshot 360: `cell "Quản trị"`, `cell "Hoạt động"`, `cell "Tạm khóa"`; 0 `[data-label]`; nhãn là `<span aria-hidden>` | — |
| **F12** | **Một phần** | Nhãn 25 action (Đăng nhập, Tóm tắt bằng trợ lý, Khóa tài khoản…), target “Hồ sơ aaaaaaaa” + `title` UUID, hint/datalist cho lọc, mã gốc trong phần chi tiết | **R13**: 16 mã action chưa có nhãn; actor vẫn `limit:100` + fallback “Người dùng 8-ký-tự” |
| **F13** | **Một phần** | `?tab=users`, `?tab=advanced&view=audit` giữ sau reload/chia sẻ; ArrowRight đổi URL; Back về đúng tab | **R07**: bộ lọc user/audit mất khi đổi tab; **R08**: `?tab=users&view=audit` giữ param lạ, click active tab đẩy history trùng |
| **F14** | **Đã xử lý phần chính** | `tablist/tab/tabpanel`, `aria-selected`, `aria-controls`, roving tabindex; ArrowLeft/Right/Home/End đổi tab + focus; H2 mỗi màn | **R10**: `aria-controls` của tab không active trỏ tới phần tử không tồn tại; panel không `tabindex=0` |
| **F15** | **Một phần** | Nhãn mới rõ hơn: “Gửi nhịp tim mỗi (giây)”, “Ngoại tuyến khi không nhận dữ liệu (giây)”, “Dữ liệu được coi là mới trong (giây)”, “Nhận sự kiện trễ trong (phút)” | **R14**: “Giới hạn telemetry mỗi phút” vẫn tiếng Anh; không còn câu giải thích tác động |
| **F16** | **Một phần** | “Mã hồ sơ aaaaaaaa”, `title` UUID đầy đủ; “Không nhận dữ liệu hơn 900 giây…” lấy từ policy; “Chưa rõ kết nối” có lý do | **R14**: không phải tên hồ sơ; “Mã hồ sơ” lặp nhãn “Hồ sơ đang gắn” |
| **F17** | **Một phần** | 214 test, 13 test mới + 1 test audit viết lại; `failed>0`, actorLabel ai/device/system/fallback, lịch sử policy, URL, details `colspan`, hint đều có test | **R09**: assertion offline bị bỏ; test không bắt layout tablet/focus 409/lỗi PATCH/thông báo theo bộ lọc |
| **F18** | **Đã xử lý** | “Xem chi tiết” là `<button>` 116×44; không còn `summary` 26px | — |

## 5. Phát hiện còn lại

Mức: **P1** = chặn/che việc quản trị cốt lõi; **P2** = sai lệch rõ về thông tin/khả dụng/a11y; **P3** = nhỏ, dọn sau. Không có P1 trong danh sách dưới đây.

| ID | Mức | Nơi | Hành vi | Mong đợi | Bằng chứng | Nguồn |
| --- | --- | --- | --- | --- | --- | --- |
| **R01** | **P2** | Tổng quan | Xem “Cần chú ý” khi có nhiều tín hiệu | Không bỏ mất tín hiệu không có ô KPI (`devices.offline`), và không bỏ `subjects.total`/`users.disabled` khỏi toàn màn | Mock `failed=1,pending=1,tasks=1,offline=3,alerts=0`: 3 dòng chỉ còn `1 thông báo gửi lỗi / 1 thông báo đang chờ gửi / 1 công việc đang mở`; **không có “3 thiết bị ngoại tuyến”** ở bất kỳ đâu; `subjects.total=7`, `users.disabled=2` cũng không hiện. Code `attention` xếp `failed → pending → tasks → alerts → offline` rồi `.slice(0,3)` (`AdminPage.tsx:188-196`), trong khi `devices.offline` không có KPI | Mới (fix F06) |
| **R02** | **P2** | Nhật ký 768/1024 | Mở “Xem chi tiết” | Dòng `colSpan=5` đọc được ngay, không bị cắt đầu | 768: khung 743/bảng 782, sau khi bấm toggle khung `scrollLeft=35`, `<td>` x=**−22**, `<pre>`/meta x=**−8** (mất 35px đầu mỗi dòng JSON). 1024: nút “Xem chi tiết” x=**1027** (ngoài viewport 1024), bấm phải cuộn khung `scrollLeft=200`, `<td>` x=166 so với khung x=366 → **mất 200px đầu**. Cuộn khung về 0 thì `<td>` x=13, meta x=27 (đọc được) | Mới (F01 chưa phủ tablet) |
| **R03** | **P2** | Người dùng | Đang lọc `Trạng thái = Hoạt động`, khóa Minh | Vẫn thấy thông báo thành công (hoặc đặt ở chỗ không phụ thuộc dòng) | Trước 2 dòng, sau 1 dòng; `noticeCount=0`, `noticeVisible=false`; `activeElement=BODY`. Code đặt notice trong `<td>` của dòng (`AdminPage.tsx:405`), dòng rời danh sách do invalidate + filter → notice biến mất | Mới (hồi quy của F09) |
| **R04** | **P2** | Chính sách | Sau lỗi field, sửa lại giá trị hợp lệ nhưng chưa bấm Xem trước | Lỗi cũ tự xoá hoặc ít nhất không còn nói “1 giá trị chưa hợp lệ” | `summaryCount=1`, vẫn “1 giá trị chưa hợp lệ… Gửi nhịp tim mỗi (giây): tối thiểu 5.”; input vẫn `aria-invalid=true`; đo ở cả 360 và 1280. `clearPreview()` không xoá `fieldErrors` | Có từ trước, summary mới làm nặng hơn |
| **R05** | **P2** | Chính sách 360 | Bấm Xem trước khi field sai | Summary lỗi nhìn thấy cùng lúc với ô lỗi | Field được focus/scroll (y 290), nhưng summary ở **y 1022–1124** trong viewport 740 (trang cuộn `scrollY=183`); tại 1280 summary y 860–936, đáy viewport 900 → vẫn bị cắt 36px. Summary nằm sau nút, không “ngay cạnh nút” trong tầm nhìn | Mới (F02 chưa trọn) |
| **R06** | **P2** | Người dùng 360 | PATCH lỗi 500 | Lỗi đọc được, focus/scroll tới lỗi | Alert “Không đổi được trạng thái” rộng **114px** (x=202, y=641–720) trong cột hành động; `activeElement=BODY`; `scrollY=731`. Thông báo dài hơn sẽ tràn xuống dưới viewport, không có focus/scroll tới alert | Mới/tiền lệ F09 |
| **R07** | **P2** | Khung trang | Lọc user/audit rồi đổi tab | Giữ bộ lọc hoặc đưa vào URL | User: lọc `Minh` → 1 dòng; sang Thiết bị rồi về → ô tìm `""`, 3 dòng. Audit: lọc `assistant.summary` → 20 dòng; sang Chính sách rồi về → action `""`, 20 dòng. Handoff có ghi “chưa làm”, nhưng F13 yêu cầu “không mất bộ lọc” nên vẫn là thiếu sót | Có từ trước/một phần |
| **R08** | P3 | Khung trang/URL | Param lạ, bấm lại tab đang chọn | Param lạ bị bỏ hoặc không ảnh hưởng tab con; không đẩy history trùng | `?tab=users&view=audit` → hiện Người dùng nhưng giữ `view=audit`; bấm “Nâng cao” mở thẳng **Nhật ký** (bỏ qua Chính sách). `?tab=bogus` → hiện Tổng quan nhưng URL vẫn `?tab=bogus`. Bấm lại tab “Người dùng” đang chọn rồi Back: URL không đổi (history trùng) | Mới (F13) |
| **R09** | **P2** | Test | Đọc diff test + chạy | Test bắt được hồi quy thật, không nới assertion để khớp hành vi xấu | Không xoá `it`, nhưng bỏ `3 thiết bị ngoại tuyến` khỏi test tổng quan mặc định (dòng 266–268) đúng lúc hành vi bỏ tín hiệu này; test “ưu tiên tín hiệu chưa có KPI” lại xếp `alerts` (có KPI) trước `offline` (không KPI). Không test: cắt chi tiết ở 768/1024, focus/scroll 409 (test 409 chỉ assert chữ + nút), lỗi PATCH, notice khi bộ lọc làm dòng biến mất, bộ lọc theo tab, `subjects.total`/`users.disabled` | Mới/một phần |
| **R10** | P3 | Khung trang/a11y | Tab không active | `aria-controls` trỏ tới panel tồn tại; panel có `tabindex=0` khi cần | Đo 6 tab: 4 tab không active có `targetExists=false` (chỉ panel đang chọn được render); `role=tabpanel` không có `tabindex`. Nút “Xem chi tiết” cũng `aria-controls` tới id chưa tồn tại khi đang đóng | Mới (F14) |
| **R11** | P3 | Chính sách/a11y | Một field sai | Một thông báo lỗi, không đọc lặp | `role=alert` = **2** (lỗi field + summary), nên screen reader nghe cùng nội dung hai lần | Mới (F02) |
| **R12** | P3 | Chính sách/Người dùng/a11y | 409, “Tải lại”, PATCH lỗi | Focus nhìn thấy và không rơi về BODY | 409: focus `.adm-policy-status` nhưng `:focus-visible=false`, outline `3px none` (không có vòng focus); sau “Tải lại” focus = **BODY**; sau PATCH lỗi focus = **BODY** | Mới/một phần |
| **R13** | P3 | Nhật ký | Đọc action/actor | Nhãn cho các action quản trị phổ biến; actor đủ danh sách | 25 nhãn / 41 mã API; còn 16 mã hiện nguyên: `maintenance_task.create/close`, `device.rotate_key`, `device.claim_code_issued`, `emergency_contact.*`, `workspace_view.*`, `care_link.revoke`, `subject.deletion_request`, `incident.suspected_timeout`. Actor vẫn `fetchAdminUsers({limit:100})` (`AdminPage.tsx:941`) và fallback `Người dùng 8-ký-tự` (`:991`) | Một phần (F12) |
| **R14** | P3 | Chính sách/Thiết bị | Đọc nhãn | Không còn thuật ngữ tiếng Anh; hồ sơ hiện tên | “Giới hạn telemetry mỗi phút” vẫn là “telemetry”; thiết bị hiện `Hồ sơ đang gắn / Mã hồ sơ / aaaaaaaa` (lặp nhãn, không phải tên hồ sơ); API chỉ trả `assignedSubjectId` | Một phần (F15/F16) |
| **R15** | P3 | Chữ lớn | 1280 với font 32px (200%) | Bảng audit còn dùng được, chi tiết không bị cắt | Ở 200% (32px) tại 1280: sidebar chiếm ~680px, nội dung còn **448px**; bảng audit **1472px** (hint hiện) → phải cuộn ngang rất nhiều; không tràn trang, control ≥44px. Ở 125% (20px): khung 760/bảng 920, chi tiết 920px; tại 360 `<pre>` 298/420 | Rủi ro cross-cutting (không do fix) |
| **R16** | P3 | Nhật ký 360 | Danh sách 20 bản ghi | Duyệt nhanh, không quá dài | 20 card = **5042px**; nút “Xem chi tiết” đầu tiên ở y=850 (ngoài viewport 740); “Tải thêm” nằm cuối 5000px. Card 5 dòng/bản ghi không có chế độ gọn | Mới (đánh đổi F03) |
| **R17** | P3 | Tổng quan | “Cần chú ý” | Không lặp KPI; có hành động/link | Dữ liệu thật: `1 công việc đang mở`, `1 cảnh báo đang mở` (lặp KPI “Cảnh báo đang mở”), `1 thiết bị ngoại tuyến`; không có link tới tab Người dùng/Thiết bị/Nhật ký | Một phần (F07) |
| **R18** | P3 | Nhật ký/UX nhỏ | Lọc người thực hiện; hint 1024 | Cùng một quy tắc áp dụng; câu hint đúng thiết bị | `select` actor tự gọi lại query ngay, còn ô “Hành động” phải bấm “Lọc”; hint ghi “vuốt ngang” ở 1024 desktop (nên “kéo/cuộn ngang”) | Có từ trước/mới |

### 5.1. Chi tiết bằng chứng các lỗi nặng

**R02 — dòng chi tiết vẫn bị cắt ở tablet.** Bảng audit giữ `min-width: 46rem` (782px tại root 17px) và `table-layout: fixed`; dòng chi tiết nằm *trong* `.adm-table-wrap` nên chịu chung `scrollLeft`. Để bấm “Xem chi tiết” ở cột cuối, trình duyệt buộc cuộn khung sang phải (768: 35px; 1024: 200px), rồi dòng `colSpan=5` mở ra với mép trái nằm ngoài vùng nhìn: 768 `<td>.x=-22`, `<pre>.x=-8`; 1024 `<td>.x=166` trong khi khung bắt đầu x=366. Người dùng phải vuốt ngược lại mới đọc được “Mã hành động …” và đầu mỗi dòng JSON. Đây là hệ quả của việc đặt details trong bảng cuộn, không phải lỗi `<pre>` (bản thân `<pre>` đã `white-space: pre`, `overflow-x:auto`).

**R03 — thông báo thành công phụ thuộc dòng.** Với bộ lọc `Trạng thái = Hoạt động`, PATCH 200 đổi Minh sang `disabled`; `invalidateQueries` trả danh sách đã lọc (không còn Minh); `<tr>` chứa `role=status` unmount, nên không còn thông báo nào và `activeElement` về `BODY`. Trước v4, notice nằm đầu tab nên vẫn thấy. Cần đặt notice ngoài dòng (đầu tab, toast cố định, hoặc `aria-live` toàn cục) và vẫn giữ focus ở nơi hợp lý.

**R01 — “Cần chú ý” tự mâu thuẫn với mục tiêu của nó.** Comment trong code nói “tín hiệu không có ô số riêng được ưu tiên trước; hai dòng cuối đã có KPI”, nhưng `devices.offline` nằm trong “hai dòng cuối” mà **không có KPI** (`Thiết bị trực tuyến` chỉ là `online`). Vì thứ tự là `failed → pending → tasks → alerts → offline` và cắt 3, khi có 3 tín hiệu đầu thì thiết bị ngoại tuyến biến mất khỏi màn Tổng quan; test mặc định đã bỏ assertion này. Đồng thời `subjects.total` và `users.disabled` vẫn không được render ở bất kỳ đâu (chỉ lọc được disabled ở tab Người dùng).

**R04/R05 — summary lỗi mới chưa trọn.** `validateValue()` đặt lỗi rồi `focusById` field đầu tiên; summary được render sau hàng nút. Ở 360, field được cuộn vào giữa (y 290) nhưng summary ở y 1022 → người dùng chỉ thấy lỗi từng ô, không thấy “1 giá trị chưa hợp lệ” và danh sách link. Sửa giá trị xong, summary + `aria-invalid` vẫn còn cho tới lần bấm “Xem trước” kế tiếp, tức UI nói sai trạng thái hiện tại.

**R09 — test không bảo vệ hành vi mới.** Test mới thêm nhiều giá trị, nhưng ba chỗ dễ hồi quy nhất lại không có lưới: (a) vị trí/cắt của dòng chi tiết trong bảng cuộn (jsdom không layout, và test chỉ assert `colspan`); (b) focus/scroll khi 409 (test hiện chỉ assert chữ và nút “Tải lại”); (c) notice khi dòng rời bộ lọc. Ngoài ra test hint dùng spy `scrollWidth` toàn cục nên không mô phỏng `ResizeObserver`/khung thật.

## 6. Kiểm hồi quy

| Hạng mục | Kết quả đo |
| --- | --- |
| 4 tab + 2 mục Nâng cao | Có; `tablist` “Các mục quản trị” 4 tab, tab con 2; đổi tab bằng chuột/Arrow/Home/End; URL đổi theo |
| 4 ô KPI | `3 / 0 / 1 / 0` khớp API thật; không còn 9 nhóm cũ; “Cần chú ý” 3 dòng |
| Khóa user có lý do | Lý do rỗng/khoảng trắng bị chặn, không gửi PATCH; `required`/`aria-required`; `maxLength=500`; focus textarea; hủy trả focus; thành công đổi trạng thái + notice trong dòng (trừ R03) |
| Policy preview/publish/409 | Preview thật trả `valid=true`, digest/version hiện đúng; publish mock gửi `previewDigest`; 409 preview hiện cảnh báo + “Tải lại” trong viewport; 409 publish content-mismatch hiện cảnh báo, khóa Phát hành, không có “Tải lại” (đúng thiết kế) |
| Audit lọc | Lọc `assistant.summary` trả 20 dòng cùng loại; actor select lọc ngay; bộ lọc mất khi đổi tab (R07) |
| Thiết bị | 1 thiết bị, “Mã hồ sơ aaaaaaaa”, offline + ngưỡng 900 giây, firmware/lần thấy cuối; không có dữ liệu sức khỏe |
| Mobile 360/390 | Không tràn trang; user/audit thành card; nhãn không đọc lặp; form/notice/409 trong viewport; audit card dài (R16) |
| Chữ lớn | 125% không tràn, control ≥44px; 200% nội dung admin còn 448px, bảng audit 1472px (R15) |
| Bàn phím | Arrow/Home/End đổi tab + focus; roving tabindex; focus ring 3px trên tab/button; panel không tabindex (R10) |
| Overflow | `document.scrollWidth == clientWidth` ở mọi lượt đo; 0 `pageerror` |

## 7. Giới hạn của lần kiểm

- **API 3000 đang chạy không khớp hoàn toàn với mã nhánh:** prefix `/api/v1`, mật khẩu seed nhận `demo-admin-2026` trong khi `seed.ts` hiện tại ghi `demo-an-nhien-2026`; có thể API được build từ commit/DB cũ. Vì vậy chỉ dùng API để đọc dữ liệu tổng hợp và gọi preview; các luồng PATCH/409 được mock ở tầng route.
- `WEB_ORIGIN` của API là `5173`, nên web 4344 không POST được (403). Tôi dùng cookie admin lấy qua API và chỉ override `Origin` cho **một** request preview thật (endpoint không ghi DB); không đổi env/restart API.
- Đăng nhập admin tạo bản ghi audit `auth.login` (một lần sai mật khẩu do seed cũ, sau đó đúng); không PATCH user, không publish, không seed/xoá DB. Preview thật đã kiểm policy không đổi `version/updatedAt`.
- Không chạy `pnpm test:e2e` (Playwright repo trỏ 5173 đang có server khác; E2E ngoài yêu cầu). Không có screen reader thật (NVDA/VoiceOver): a11y dựa trên `ariaSnapshot` Chromium + computed style.
- Không đo contrast bằng axe/Lighthouse; không kiểm Firefox/Safari, bàn phím ảo iOS, zoom trình duyệt 200% (chỉ mô phỏng bằng font-size 32px), 320px.
- Chỉ một seed (3 user, 2 hồ sơ, 1 thiết bị, 1 cảnh báo, 1 task); lỗi phụ thuộc >100 user ở actor picker chỉ ghi theo code/review trước, chưa tái hiện.

## 8. Tóm tắt 5 dòng

1. Đã đọc diff + diff test trước, chạy lại contracts build, **33 file/214 test**, typecheck, build trong worktree sạch; tất cả exit 0.
2. Đã mở 5 màn ở 1280/390/360 (+768/1024, chữ lớn), đăng nhập admin, lọc user/audit, mở details, preview thật, mock PATCH 200/500 và 409; không đổi trạng thái user/policy/DB.
3. **18 phát hiện còn lại: 0 P1, 8 P2, 10 P3**; F01/F02/F03–F05/F08–F11/F14/F18 đã xử lý đúng phần chính, F06/F07/F12/F13/F15/F16/F17 còn một phần.
4. Hai lỗi đáng chú ý nhất: **R02** dòng chi tiết audit bị cắt 35–200px ở 768/1024; **R03** thông báo thành công biến mất khi bộ lọc làm dòng vừa đổi rời danh sách.
5. Báo cáo: `reports/qa/v4-rereview-admin.md` (worktree reviewer); nhánh `fix-v4-admin` không bị sửa/merge.
