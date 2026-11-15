# Re-review v4 — ứng dụng khách hàng sau sửa P1

- **Ngày:** 2026-11-15, 17:44–18:10 (Asia/Ho_Chi_Minh).
- **Worktree báo cáo:** `C:/Users/nguye/orca/workspaces/DATN/v4-rereview-app` — nhánh `v4-rereview-app`; tệp duy nhất được thêm là báo cáo này.
- **Worktree code được kiểm:** `C:/Users/nguye/orca/workspaces/DATN/fix-v4-app`, checkout đúng `594ee28` (handoff), code `a1066f3`, base `v4-simple-app` `bda9bb2`. Không merge, không sửa code.
- **Vai trò:** reviewer độc lập; không dùng số đo/ảnh/kết luận trong handoff làm bằng chứng. Mọi số dưới đây do lượt này tự chạy lại.
- **Kết quả:** **24 phát hiện còn lại/rủi ro — 1 P1, 16 P2, 7 P3.** Bốn P1 gốc: F01, F03 (nhánh offline), F04 và F07 (danh sách) đã được xử lý đúng ở kịch bản gốc; **F03 còn một nhánh P1 mới** (`freshness=stale`, thiết bị vẫn online nhưng số đo cũ) và **F07 còn lỗ hổng P2 ở trang chi tiết**.

## 0. Kết luận ngắn

Bản sửa làm đúng phần lõi và không nới test: số test tăng 205 → 216, không xoá test nào; T01 (quyền cảnh báo) và T03 (429) được khôi phục, T02 (disclaimer) khôi phục một phần; F01, F03 (offline thật), F04 (thứ tự Gọi) và F07 (danh sách hai bước) có bằng chứng đo lại. Contracts build, typecheck, 216 test và build web đều exit 0.

Nhưng còn các điểm phải xử lý trước khi coi là xong:

1. **F03 còn sai trạng thái ở nhánh “dữ liệu cũ”**: thiết bị **online** nhưng `freshness='stale'` bị gán nhãn **“Thiết bị ngoại tuyến · dữ liệu cuối 17:47”**, trong khi “dữ liệu cuối” là mốc heartbeat 1 phút trước, còn lần đo thật là 17:20. Đo được ở 390; test mới đang khoá đúng câu sai này.
2. **F15 tạo lỗi mới trên topbar mobile**: hộp hỏi lại đăng xuất rộng 208 px, đẩy mép phải tới x=396 → tràn ngang **36 px ở 360**, 6 px ở 390; chữ “Đăng xuất khỏi tài khoản?” và nút “Hủy” bị cắt; topbar cao 60 → 112 px.
3. **F19 đổi chỗ nhãn nguồn thay vì giữ nhãn**: khối “Tổng hợp hôm nay” (dữ liệu `source=synthetic`) mất nhãn “dữ liệu mô phỏng”; nhãn duy nhất còn lại nằm trong card “Xu hướng gần đây” (tập dữ liệu khác) ở phía dưới.
4. **F12 bỏ câu giới hạn khỏi Hôm nay**, chỉ còn ở `/app/alerts`; test mới còn khẳng định câu này **không được** xuất hiện trong khung.
5. **F04 đưa card liên hệ lên vô điều kiện**, nên cảnh báo **đã đóng** vẫn có “Gọi” là hành động đầu màn, trước cả “Cảnh báo đã kết thúc”.

## 1. Phạm vi, môi trường, cách kiểm

### 1.1. Đã đọc

- `git diff bda9bb2..fix-v4-app` (17 tệp, +903/−211 gồm handoff). **Đọc toàn bộ diff test trước** khi đọc code: `AssistantPage.test.tsx`, `AppShell.test.tsx`, `router.test.tsx`, `AlertDetailPage.test.tsx`, `AlertsPage.test.tsx`, `HistoryPage.test.tsx`, `RecentInsightsCard.test.tsx`.
- Code thay đổi: `AssistantPage.tsx`, `AlertDetailPage.tsx`, `AlertsPage.tsx`, `AppShell.tsx`, `DashboardPage.tsx`, `HistoryPage.tsx`, `RecentInsightsCard.tsx`, `SessionsCard.tsx`, `app-simple.css`.
- Hợp đồng/logic liên quan: `packages/contracts/src/{assistant,contacts,incidents,telemetry,policies}.ts`, `apps/api/src/devices/device-status.ts`, `apps/api/src/common/origin-check.middleware.ts`, `apps/api/src/database/seed.ts`.
- `reports/qa/v4-review-app.md`, `reports/orchestration/v5-plan-ux.md`, `reports/orchestration/v4-specs/v4-rereview-app.md`; handoff `v4-fix-app.md` chỉ để đối chiếu, không dùng làm bằng chứng.

### 1.2. Môi trường

| Mục | Giá trị |
| --- | --- |
| OS / runtime | Windows 11, Node `v24.22.2`, pnpm `12.5.1` |
| Cài dependency | `pnpm install --frozen-lockfile --prefer-offline` trong worktree code; 711 package |
| Web review | Vite dev riêng **`http://localhost:4345`** (`npx vite --port 4345 --strictPort`) |
| API | `http://localhost:3000`; **chỉ đọc**. Không bấm/không gửi thao tác ghi |
| Browser | Chromium Playwright `1.65.1` (headless), DPR 1 |
| Viewport | 1280×900, 390×844, 360×740, 360×740 + chữ lớn, 390×844 + chữ lớn (`localStorage.an:text-size=large`) |
| Artifact | `C:/tmp/rev-v4-rereview-app/` (JSON đo, script probe, ảnh) |

### 1.3. Cách kiểm và giới hạn ghi

- Đăng nhập chủ hồ sơ `ba-an@demo.annhien.local` và người thân `minh@demo.annhien.local` bằng `context.request` (không qua form), rồi đi 10 màn.
- **Không request non-GET nào tới `/api/v1` từ trình duyệt** trong các lượt đo (ghi bằng `page.on('request')`): audit1/2/3/4/6 rỗng; audit5 chỉ có POST `assistant/ask` bị `page.route` chặn và trả tại chỗ, không tới server. Các lần bấm “Xác nhận”, “Đăng xuất” đều dừng ở bước hỏi lại rồi “Hủy”; kiểm chứng không có POST tương ứng.
- Trạng thái hiếm được dựng bằng **chặn response GET** với fixture đúng schema: caregiver thiếu `canReceiveAlerts`, thiết bị offline/stale/never/nhiều thiết bị, cảnh báo `open` (dữ liệu seed hiện là `acknowledged`), 0 cảnh báo, 20 cảnh báo, 403 cảnh báo, 403 `assistant/ask`, `nextCursor` trang đo. Không ghi DB.
- Mỗi context đăng nhập một lần: lượt này tạo **63 phiên** cho chủ hồ sơ (tổng hiện 124) và một số phiên người thân; không thu hồi. Hệ quả: chiều cao trang Cài đặt bị phồng, **không dùng số tuyệt đối của trang này làm bằng chứng code**.
- Không chạy bộ Playwright e2e có sẵn (config trỏ 5173, cần seed/ghi); dùng script Chromium riêng trên 4345.

## 2. Chạy lại kiểm tra (worktree `fix-v4-app`, 594ee28)

```text
$ pnpm build:contracts
$ tsc -p tsconfig.json
exit 0

$ pnpm --filter @annhien/web typecheck
$ tsc -p tsconfig.json --noEmit
exit 0 (không in thêm)

$ pnpm --filter @annhien/web test
 Test Files  33 passed (33)
      Tests  216 passed (216)
   Duration  16,58s
exit 0

$ pnpm --filter @annhien/web build
dist/assets/index-DnZI6qUx.js   270,32 kB │ gzip: 83,06 kB
✓ built in 453ms
exit 0
```

Không có `console.error`/`pageerror` trong các lượt đo. Không có script lint ở root/web (không có `lint` trong `package.json`); typecheck là bước tĩnh duy nhất của toolchain.

## 3. Soi diff test trước

### 3.1. Số lượng và tệp

Base `bda9bb2`: 33 tệp / **205** test. Head `594ee28`: 33 tệp / **216** test. Không tệp test nào bị xoá; tăng ở `AppShell.test.tsx` 25 → 30, `AssistantPage.test.tsx` 17 → 22, `AlertDetailPage.test.tsx` 6 → 7.

| Tệp | Thay đổi chính | Đánh giá |
| --- | --- | --- |
| `AssistantPage.test.tsx` (+118/−5) | Khôi phục T01 (câu quyền), T02 (1 assertion disclaimer), T03 (429 “vài phút”); thêm cảnh báo có loại+giờ, nút Gọi, offline, ngưỡng `lastSeenAt`, một liên kết Sức khỏe, `maxlength=500` | T01/T03 tốt; T02 chỉ khôi phục **một trong hai** assertion cũ; test ngưỡng `online + freshness='live'` lại khẳng định câu **“Thiết bị ngoại tuyến”** cho thiết bị online |
| `AppShell.test.tsx` (+152/−41) | Đổi mục tiêu menu sang `menuitem`; thêm menu một bản/Escape/click ngoài, menu desktop, caregiver không badge, đăng xuất hỏi lại; đổi test “câu giới hạn” từ `>=2` sang **`0`** trong khung | Phủ được F11/F15; **không** phủ topbar mobile (jsdom chọn nút sidebar đầu tiên); test cũ P1-5 bị đảo thành cấm câu giới hạn trong shell |
| `AlertDetailPage.test.tsx` (+38) | Test thứ tự DOM `Gọi` → `Tôi đang hỗ trợ` → `Đóng` | Đúng hướng; không thay được phép đo viewport (browser phải đo) và không phủ trạng thái `resolved` |
| `AlertsPage.test.tsx` (+16) | Chèn bước hỏi lại; khẳng định lần bấm đầu **không POST** | Tốt, đúng F07 danh sách; không kiểm focus/aria sau khi bấm |
| `HistoryPage.test.tsx` (+9/−6) | Vòng lặp 8 lần “Hiện thêm” tới 400; bỏ “Hiện tới 400” | Khớp hành vi mới; mọi fixture `nextCursor: null` nên **không** phủ trường hợp hai nút tải thêm |
| `RecentInsightsCard.test.tsx` (+7/−6) | Đổi copy “lần đo”, gộp nhãn nguồn | Khớp thay đổi; không còn kiểm câu “không phải dữ liệu đo thật” như một câu riêng |
| `router.test.tsx` (+4/−6) | Một liên kết “Sức khỏe 7 ngày”, không còn “Lịch sử đo” | Khớp F13 |

### 3.2. Đánh giá T01–T04

- **T01 (đã đóng):** test caregiver thiếu `canReceiveAlerts` đòi `Bạn không có quyền xem cảnh báo của hồ sơ này.`, cấm `/Không có cảnh báo mở/`, và vẫn đòi `calls.alerts` rỗng. Đây là câu đúng, không phải câu “êm”.
- **T02 (đóng một phần):** có lại `getAllByText(ASSISTANT_DISCLAIMER).length > 0` ở test câu trả lời ready; **test degraded vẫn không có assertion disclaimer** dù trước đây có. Component render disclaimer cho mọi `AnswerView`, nên rủi ro thấp, nhưng không còn đủ như mô tả “2 test cũ”.
- **T03 (đã đóng):** test 429 đòi cả nguyên văn lỗi máy chủ và `Vui lòng thử lại sau vài phút.`
- **T04 (còn một phần):** `AppShell.test.tsx` vẫn đếm/định vị bằng `.shell__nav`, `.shell__more-menu`, `.shell__user-role`, `.shell__nav-badge`; thiếu test cho topbar mobile, cho menu khi Tab ra ngoài, cho `role=menu` + mũi tên, và cho lỗi 403 ở `/app/alerts`.

### 3.3. Test đang khoá hành vi sai (chi tiết)

- `AssistantPage.test.tsx:240` và `:263-272`: fixture thứ hai có `online: true, freshness: 'live'` nhưng vẫn mong đợi **“Thiết bị ngoại tuyến · dữ liệu cuối …”**. Nếu sửa câu chữ cho đúng (thiết bị online, số đo cũ), test này đỏ. Đây là test khoá lỗi F03 còn lại.
- `AssistantPage.test.tsx:198`: sau khi có cảnh báo mở, test khẳng định **không** có `/Dữ liệu cập nhật/`. Như vậy nhánh “có cảnh báo + thiết bị khoẻ” vẫn không có mốc dữ liệu; F03 gốc từng nêu “khi có cảnh báo mở thì dòng thời gian cập nhật biến mất hoàn toàn”. Hành vi này giờ được test giữ nguyên.
- `AppShell.test.tsx:583-592`: cấm câu `Cảnh báo chỉ cập nhật khi ứng dụng đang mở.` trong shell (`toHaveLength(0)`), nên không thể đưa câu này trở lại Hôm nay mà test vẫn xanh.

## 4. Đối chiếu bốn P1 gốc

### 4.1. F01 — caregiver không có quyền cảnh báo

**Đo lại (390, fixture `role=caregiver, canReceiveAlerts=false`):**

- `.today-status__text` = `Bạn không có quyền xem cảnh báo của hồ sơ này.`; class `today-status--muted`; không có `/Không có cảnh báo mở/` trong body.
- Không có `.shell__nav-badge`; chỉ còn `.shell__more-dot` (thông báo chưa đọc) — đúng là không có badge cảnh báo.
- Không có request `/subjects/:id/alerts` trong network (query bị tắt).

**Còn lại:** mục “Cảnh báo” vẫn nằm trong nav cho người này; bấm vào nhận trang lỗi 403 (xem R-04). F01 trên Hôm nay đã đóng; F01 trên màn Cảnh báo chưa.

### 4.2. F03 — thiết bị ngoại tuyến/dữ liệu cũ

**Đo lại (390, chặn GET `/status` và `/alerts`, không cảnh báo mở):**

| Fixture | Kết quả |
| --- | --- |
| Thiết bị thật `online=false`, `freshness=offline`, lastSeen 12:12, asOf 17:48 | `Thiết bị ngoại tuyến · dữ liệu cuối 12:12`; tone `alert`; nút `Kiểm tra thiết bị` cao 44 px — **đúng** |
| `online=true`, `freshness=live`, lastSeen 17:48 | `Không có cảnh báo mở. Dữ liệu cập nhật 17:48 15 thg 11, 2026.`; tone `calm` — **đúng** |
| `online=true`, `freshness=stale`, lastSeen 17:47, lastMeasured 17:20 | `Thiết bị ngoại tuyến · dữ liệu cuối 17:47`; tone `alert` — **sai**: thiết bị đang online, mốc 17:47 là heartbeat chứ không phải số đo cuối |
| `online=false`, `freshness=never`, lastSeen null | `Chưa nhận dữ liệu từ thiết bị.` + `Kiểm tra thiết bị` — **đúng** |
| Hai thiết bị: một offline lastSeen 13:00, một online 17:48 (giờ VN) | `Thiết bị ngoại tuyến · dữ liệu cuối 17:48` — **sai thiết bị/mốc** |
| `healthDataVisible=false` (caregiver không xem số đo), thiết bị offline | `Bạn chưa được xem số đo của hồ sơ này.` — không có tín hiệu ngoại tuyến |

Nguyên nhân: `AssistantPage.tsx:259-280` gộp ba khái niệm vào một câu: `online=false`, `freshness='offline'` **và** `freshness='stale'`; `device-status.ts:69-81` định nghĩa `stale` = **còn online** nhưng lần đo cuối cũ hơn `dataFreshAfterSeconds` (600 s). Mốc `lastSeenAt` là mốc nhận cuối, không phải `lastMeasuredAt`. Khi nhiều thiết bị, `latest` lấy mốc lớn nhất trong **tất cả** thiết bị, kể cả thiết bị đang online.

**Kết luận F03:** nhánh “offline thật” đã đóng; nhánh “dữ liệu cũ nhưng thiết bị vẫn online” còn **P1** (R-01).

### 4.3. F04 — Gọi là hành động đầu trong màn đầu

**Đo lại (cảnh báo `open`, 1 liên hệ chính + 2 liên hệ khác thu gọn):**

| Viewport | Gọi | Tôi đang hỗ trợ | Đóng cảnh báo | Thứ tự DOM |
| --- | --- | --- | --- | --- |
| 390×844 | y=601, h=52, **trong màn** | y=981, ngoài màn | y=1045, ngoài màn | Gọi < hỗ trợ < đóng |
| 360×740 | y=601, h=52, **trong màn** | y=981, ngoài màn | y=1045, ngoài màn | đúng |
| 390×844 chữ lớn | y=744, h=60, **trong màn** (đáy 804 < 844) | y=1283 | y=1358 | đúng |
| Cảnh báo đã xác nhận (dữ liệu thật) | y=601, trong màn | không có | y=965, ngoài màn | — |
| Cảnh báo đã đóng | y=667, **trong màn** | không có | không có | — |

Không còn trường hợp “Đóng đứng đầu”. **Nhưng** với cảnh báo `resolved`, card liên hệ vẫn được render vô điều kiện trước card “Cảnh báo đã kết thúc” (R-05). Với 0 liên hệ, không có Gọi; nút đầu màn là “Thêm liên hệ khẩn cấp” (R-07).

### 4.4. F07 — xác nhận một chạm

**Danh sách (`/app/alerts`, fixture cảnh báo `open`):**

- Bấm `Xác nhận` → hiện nhóm `role=group aria-label="Xác nhận hỗ trợ cảnh báo"` với câu `Bạn đã liên hệ và đang hỗ trợ?`, nút `Có, tôi đang hỗ trợ` + `Hủy`.
- **0 POST** sau lần bấm đầu (đo cả bằng `fetchMock` trong test và `page.on('request')` ở 390/360/390-large); chỉ POST nếu bấm nút xác nhận lần hai (không thực hiện).
- `Hủy` đóng bước hỏi lại; `Escape` **không** đóng.
- Sau khi bấm `Xác nhận`, `document.activeElement` = `BODY` (nút cũ unmount, không có focus/aria-live), người dùng bàn phím mất vị trí.

**Trang chi tiết:** nút `Tôi đang hỗ trợ` vẫn đổi trạng thái **một chạm**, không có bước hỏi lại — khác với danh sách (R-08).

## 5. Đối chiếu các P2 được giao

| Mã | Kỳ vọng | Đo lại trên `594ee28` |
| --- | --- | --- |
| **F02** | Loại + giờ + Gọi/Xem | Thẻ Hôm nay: `Nghi ngã lúc 16:47 · 2 cảnh báo đang mở.` + `Gọi` (`tel:0900000000`) + `Xem cảnh báo`, cả hai trong màn 390/360/390-large. Còn lỗi: chỉ nêu cảnh báo đầu, SOS cũ hơn bị ẩn; cảnh báo đã có người xác nhận vẫn hiện như “đang mở” + Gọi (R-06/R-07) |
| **F09** | Mục thứ tư ≥44 px, có đệm | `Thêm` 92×62 (390), 84×62 (360), 84×73 (360 chữ lớn); nhãn cách mép phải 27/23/19 px; 4 mục đều 1 dòng ở 360/390 (360 chữ lớn: “Người thân” xuống 2 dòng) |
| **F11** | Một bản, Escape/click ngoài, aria khớp | 1 `.shell__more-menu`; `aria-haspopup="menu"`, popup `role=menu`, mục `role=menuitem`; Escape đóng + trả focus; click ngoài đóng. Còn: mũi tên không di chuyển focus, Tab ra ngoài menu vẫn mở (R-18) |
| **F12** | Một dòng, không lặp | `/app/alerts` 1 câu; 8 màn còn lại 0 câu; **Hôm nay cũng 0** — câu giới hạn bị rút khỏi màn chính (R-10) |
| **F13** | Một liên kết Sức khỏe | `/app` chỉ còn `Sức khỏe 7 ngày →` → `/app/overview`; không còn `Lịch sử đo →`; test router khớp |
| **F15** | Hỏi lại đăng xuất; không copy “menu tài khoản” | Có `Đăng xuất khỏi tài khoản?` + `Hủy`; chỉ gọi `/auth/logout` sau xác nhận; `SessionsCard` đổi thành “nút ‘Đăng xuất’ trong ứng dụng”; không còn chuỗi “menu tài khoản”. Còn: tràn ngang topbar 360 (R-09), không có menu tài khoản/avatar (R-14) |
| **F19** | Giảm lặp từ kỹ thuật | 390/1280 Sức khỏe: `mô phỏng` 2 (trước 4), `mẫu` 0 (trước 7), `độ phủ` 1 (trước 3). **Nhưng** nhãn nguồn ở khối Tổng hợp bị xoá (R-11); Overview vẫn 3 nhịp tim, 4 ô số, 3 cách đếm cảnh báo (R-12) |
| **F21** | Một nút, bỏ từ kỹ thuật khỏi màn đầu | `Chi tiết kỹ thuật` là `<details>` đóng mặc định; không còn `3650 ngày`, `mỗi 300s`, “thay thế cho biểu đồ”; 1 nút “Hiện thêm 50 dòng”; 1 bảng/1 CSV ở 1280. Còn: 20 dòng mặc định, 8 lần bấm mới tới 400, **hai** nút tải thêm khi `nextCursor` khác null (R-16) |
| **F30** | Chip không bị cắt | 360 chữ lớn: container `scrollWidth=clientWidth=298`; chip phải nhất kết thúc x≈292 < 360; chip “Pin?” xuống dòng 2, không bị mask/cắt |
| **F31** | `maxlength` khớp 500 | `maxlength=500`; `assistantAskSchema` `min(3).max(500)`; test mới kiểm attribute |

## 6. Phát hiện còn lại / rủi ro

Mức: **P1** = sai trạng thái/an toàn hoặc chặn hành động khẩn cấp; **P2** = mục tiêu UX/layout chưa đóng, gây hiểu nhầm hoặc lỗi a11y đáng kể; **P3** = copy, a11y, chi tiết.

### 6.1. P1

| # | Màn/vị trí | Bằng chứng | Vì sao | Đề xuất |
| --- | --- | --- | --- | --- |
| **R-01** | Hôm nay, `AssistantPage.tsx:259-280` | Fixture `online=true, freshness='stale', lastSeenAt=17:47, lastMeasuredAt=17:20, asOf=17:48` → `.today-status__text` = `Thiết bị ngoại tuyến · dữ liệu cuối 17:47`, tone `alert`. `device-status.ts:69-81`: `stale` = còn online, lần đo cũ hơn `dataFreshAfterSeconds=600s`. Test `AssistantPage.test.tsx:263-272` đang khẳng định đúng câu này | Nhãn “ngoại tuyến” sai trạng thái và tự mâu thuẫn: “dữ liệu cuối 17:47” (1 phút trước) trong khi lần đo cuối là 17:20. Trạng thái này xảy ra bình thường khi thiết bị vẫn kết nối nhưng người dùng không tạo số đo mới; màn an toàn chính nói sai nguyên nhân | Tách hai tín hiệu: `freshness='offline'`/`online=false` → “Thiết bị ngoại tuyến · dữ liệu cuối …”; `stale` → “Chưa có số đo mới · lần đo cuối …”. Dùng `lastMeasuredAt` cho câu dữ liệu, `dataFreshAfterSeconds` cho ngưỡng; thêm test cho `stale` và bỏ assertion khoá câu sai |

### 6.2. P2

| # | Màn/vị trí | Bằng chứng | Vì sao | Đề xuất |
| --- | --- | --- | --- | --- |
| **R-02** | Hôm nay, nhiều thiết bị | Fixture 2 thiết bị: offline lastSeen 13:00, online lastSeen 17:48 (giờ VN) → `Thiết bị ngoại tuyến · dữ liệu cuối 17:48`. Code chọn mốc lớn nhất trong **mọi** thiết bị (`AssistantPage.tsx:274-278`) | Câu nói một thiết bị ngoại tuyến nhưng thời gian lại của thiết bị đang online; người dùng không biết thiết bị nào cần kiểm tra | Chọn mốc của chính thiết bị gây cảnh báo; nếu nhiều thiết bị, nêu số lượng + mốc cũ nhất/thiết bị cụ thể |
| **R-03** | Hôm nay, caregiver không xem số đo | `canViewMeasurements=false` → `status` query tắt (`AssistantPage.tsx:134-139`), `deviceWarning` trả null; body chỉ còn `Bạn chưa được xem số đo của hồ sơ này.` dù thiết bị offline | Người thân nhận cảnh báo nhưng không biết thiết bị đang mất kết nối; đúng lúc họ cần biết vì sao không có cảnh báo | Tải trạng thái kết nối (online/lastSeen) không kèm số đo; hiện “Thiết bị ngoại tuyến” như tín hiệu thiết bị, không phải số đo sức khỏe |
| **R-04** | `/app/alerts` khi thiếu quyền | Caregiver `canReceiveAlerts=false` vẫn thấy mục “Cảnh báo”; GET alerts 403 (fixture đúng envelope) → `Không tải được cảnh báo` + `Bạn không có quyền xem cảnh báo của hồ sơ này.` + nút `Thử lại`; trang có **2 H1** (`Cảnh báo`, `Không tải được cảnh báo`) | F01 mới đóng ở Hôm nay. Màn Cảnh báo biến trạng thái quyền thành lỗi tải + retry luôn thất bại; nav vẫn mời bấm vào | Ẩn/khóa mục nav khi thiếu quyền; dùng `ErrorState` không H1 (hoặc H2) cho lỗi 403 và không hiện `Thử lại` với 403 |
| **R-05** | Chi tiết cảnh báo đã đóng | `state='resolved'` → card `Liên hệ khẩn cấp` + `Gọi` (y=667) nằm trong màn đầu, **trước** nội dung “Cảnh báo đã kết thúc”; `AlertDetailPage.tsx:229-234` render vô điều kiện | Cảnh báo đã kết thúc nhưng hành động nổi bật nhất vẫn là gọi khẩn cấp; gây hiểu nhầm còn nguy hiểm và làm nhiễu trang | Chỉ đưa card lên trước khi cảnh báo còn hành động (`open/acknowledged`); với `resolved/cancelled`, đặt trong “Chi tiết” hoặc sau phần kết quả |
| **R-06** | Thẻ cảnh báo Hôm nay | Fixture 2 cảnh báo: `fall` 16:47 (mới) + `sos` 16:30 (cũ) → chỉ `Nghi ngã lúc 16:47 · 2 cảnh báo đang mở.`; không nêu SOS. Dữ liệu thật: cảnh báo đã xác nhận vẫn hiện `1 cảnh báo đang mở` + nút Gọi, không nói “đã có người hỗ trợ” | Cảnh báo khẩn cấp (SOS) có thể bị ẩn sau một cú ngã mới hơn; người dùng không biết ai đang hỗ trợ nên có thể gọi lại | Nêu loại cảnh báo mức cao nếu có (SOS ưu tiên), hoặc liệt kê tối đa 2 loại + trạng thái hỗ trợ; thêm dòng “Trần Thị An đang hỗ trợ” khi có `acknowledgedBy` |
| **R-07** | Hôm nay + chi tiết, không có liên hệ/lỗi tải | `/emergency-contacts` trả `items:[]` → không có `Gọi`; card chi tiết hiện `Chưa có liên hệ khẩn cấp. Thêm ngay…`; test chỉ kiểm “không bịa nút Gọi” | Khi có cảnh báo mở, hành động khẩn cấp duy nhất biến mất nếu chủ hồ sơ chưa thêm liên hệ hoặc API lỗi; không có phương án gọi thay thế | Giữ một nút gọi cấp cứu/đường dẫn khẩn cấp khi chưa có liên hệ; nói rõ vì sao không gọi được thay vì im lặng |
| **R-08** | `/app/alerts/:id` + bước hỏi lại danh sách | Chi tiết: `Tôi đang hỗ trợ` một chạm, không hỏi lại (khác danh sách). Sau bấm `Xác nhận` ở danh sách: `activeElement=BODY`, nhóm hỏi lại không `aria-live`; Escape không hủy; nút 43 px | Hai luồng cùng đổi trạng thái nhưng một luồng có bảo vệ, một luồng không; người bàn phím mất focus đúng lúc cần xác nhận | Thống nhất bước hỏi lại ở cả hai nơi (hoặc đổi nhãn chi tiết thành hành động có chủ đích rõ), đưa focus vào nút xác nhận/nhóm, thêm `role=status`, cho Escape = Hủy |
| **R-09** | Topbar mobile, hộp hỏi lại đăng xuất | 390: group 208×94 tại `right=396` → `overflowX=6`; 360: cùng `right=396` → `overflowX=36`; chữ “Đăng xuất khỏi tài khoản?” và nút `Hủy` bị cắt; topbar `height 60 → 112`, `main.top 60 → 112`; nút 121×43/69×43 | Lỗi layout mới do F15: mở hộp xác nhận làm tràn ngang trang và che mất chữ/nút; người dùng có thể không bấm được `Hủy` | Đưa hộp xác nhận xuống một hàng riêng full-width (dưới topbar-row), hoặc dùng dialog; đặt `min-width:0`, cho chữ xuống dòng; đo lại 360/390 |
| **R-10** | Hôm nay / khung | `Cảnh báo chỉ cập nhật khi ứng dụng đang mở.` chỉ còn 1 lần ở `/app/alerts`; Hôm nay 0; test `AppShell.test.tsx:583-592` khẳng định 0 trong shell | Câu giới hạn quan trọng nhất (cảnh báo không tự đẩy khi app đóng) bị rút khỏi màn người dùng đang xử lý cảnh báo; test mới khoá việc rút | Đặt một câu ngắn trên Hôm nay khi có cảnh báo (hoặc cạnh thẻ trạng thái), không lặp ở mọi màn; đổi test thành “có ở màn Hôm nay/Cảnh báo, không lặp ở màn phụ” |
| **R-11** | `/app/overview`, khối Tổng hợp | Diff bỏ `demo-notice` (`DashboardPage.tsx`); `daily-summary` trả `source:"synthetic"`; text trang chỉ còn `Dữ liệu mô phỏng · không phải số đo thật` trong card Xu hướng (dữ liệu insights), không có nhãn ở 71 bpm/432 bước/86% | Người đọc khối “Tổng hợp hôm nay” không biết số liệu là mô phỏng; nhãn còn lại nằm dưới và thuộc tập dữ liệu khác | Giữ một nhãn nguồn ở cấp trang hoặc cạnh khối Tổng hợp khi `source=synthetic`; gộp nhãn Xu hướng nếu cùng nguồn |
| **R-12** | `/app/overview` (và `/app/history`) | Text 1280: `71 bpm` (Tổng hợp), `61 bpm` (Thiết bị), `68.3 bpm` (Xu hướng); 4 ô số gồm `Dữ liệu nhận được 68.7% / 147 lần nhận`; 3 cách đếm: `1 cần chú ý`, `Cảnh báo hôm nay: 1 (đã đóng 0)`, `Cảnh báo trong kỳ: 3 (đã đóng 1)`; 2 link `Xem lịch sử và biểu đồ →` | F17/F18/F35 chưa đóng: một màn vẫn có 3 giá trị nhịp tim, 4 ô số và 3 cách đếm cảnh báo; người dùng không biết số nào là hiện tại | Chọn một giá trị hiện tại + giờ đo; bỏ ô “Dữ liệu nhận được” khỏi màn chính; một cách đếm cảnh báo; gộp history vào Sức khỏe |
| **R-13** | `/app/overview` 360 / 360 chữ lớn | 360: metric Nhịp tim top 738 (viewport 740), Vận động 854, Pin 969; cảnh báo chiếm màn đầu; chart `top 2717`, khung `282` chứa `349`; 360-large: Nhịp tim top 1017, doc 4485 | F20 chưa đóng: màn đầu Sức khỏe ở 360 không thấy số liệu; biểu đồ vẫn phải vuốt ngang trong khung 282 | Rút header/cảnh báo, đưa 3 số hiện tại + biểu đồ vừa khung vào màn đầu; hoặc thu gọn cảnh báo thành một dòng |
| **R-14** | Nav “Thêm”, tài khoản | Menu 5 mục: Thiết bị, Thông báo (badge 2), Công việc, Cài đặt, Studio; không có menu tài khoản/avatar; `Đăng xuất` vẫn là nút trần ở topbar (91×38) và sidebar, cạnh `Aa`; màn danh sách vẫn tên “Người thân”, không có nhãn “Sổ hồ sơ” | F10/F15 chưa đóng: “Thêm” vẫn là hộc tủ 5 đích; đăng xuất vẫn lộ ở mọi màn; từ “người thân” vừa là vai trò vừa là màn | Chuyển Cài đặt/Studio/Quản trị/Đăng xuất vào menu tài khoản sau avatar; giữ nav 4 mục không có “Thêm” như v5, hoặc nói rõ “Thêm” là gì |
| **R-15** | `/app/settings` | 124 phiên chủ hồ sơ (63 do lượt này), mỗi phiên một dòng `Thiết bị khác · Đăng nhập lúc… · Thu hồi`; `Thu hồi tất cả phiên khác` nằm sau 63 dòng (char ~6824); doc 16.207 px (390), 30.810 px (360 chữ lớn) — **số tuyệt đối bị phồng bởi lượt review** | F14 chưa đóng: không nhóm “Phiên khác (N)”, nút thu hồi tất cả ở cuối danh sách dài; người dùng khó tìm | Nhóm phiên khác thành một mục gập + nút thu hồi tất cả ở đầu; giữ danh sách chi tiết trong `<details>` |
| **R-16** | `/app/history` | Fixture `nextCursor='cursor-2'` → đồng thời `Hiện thêm 50 dòng` **và** `Tải thêm từ máy chủ`; `INITIAL_VISIBLE_ROWS=20`; 390 doc 5.144 px (không tính trang có nextCursor: 5.221) | F21 mới bỏ “Hiện tới 400”, nhưng khi API còn trang thì lại có 2 nút tải thêm như lỗi cũ; 20 dòng mặc định vẫn dài hơn v5 (5 dòng) | Một nút duy nhất (tự tải thêm từ server khi hết trang đã tải) hoặc phân biệt rõ “50 dòng đã tải” vs “tải từ server”; giảm mặc định còn 5–10 dòng |
| **R-17** | `/app/overview`, chữ lớn | 360×740 large: `document.scrollWidth=404`, `clientWidth=360` → **tràn ngang 44 px**; 390 large: 404/390 → **14 px**; phần tử vượt: `span.pill.pill--sand` “Dữ liệu mô phỏng · không phải số đo thật” rộng 358 px, `white-space: nowrap`; container `.insights-card__notice` chỉ 268/298 px | Lỗi tràn ngang cấp trang mới, do F19 gộp hai câu thành một pill dài không xuống dòng; trước đây 0 px ở mọi màn/viewport | Cho pill xuống dòng (`white-space: normal`) hoặc tách lại hai dòng; đo lại 360/390 large và thêm test CSS/overflow |

### 6.3. P3

| # | Màn/vị trí | Bằng chứng | Vì sao | Đề xuất |
| --- | --- | --- | --- | --- |
| **R-18** | Menu “Thêm” | `ArrowDown` sau khi mở bằng Enter: `activeElement=BUTTON|Thêm` (không vào `menuitem`); Tab qua 5 mục rồi ra ngoài: menu vẫn mở, `aria-expanded=true` ở bước 6–7 (focus đã sang skip link) | `role=menu` nhưng thiếu roving tabindex/mũi tên và không đóng khi focus rời — không khớp ARIA APG, menu có thể che nội dung | Thêm xử lý Arrow/Home/End, `tabIndex=-1` cho mục, đóng khi `focusout` ra ngoài |
| **R-19** | Hôm nay 360 khi có cảnh báo + offline | 360: `Gửi` 511–568 (nav 673), link `Sức khỏe 7 ngày` 653–681 (8 px cuối sau nav), dòng `Dữ liệu mô phỏng…` 698–721 **nằm sau** nav; 360 large: `Gửi` 624–691 trong khi nav bắt đầu 635 → **phần lớn nút Gửi bị nav che**, doc 1.130 px | Thêm dòng `detail` + hai nút xếp dọc làm Hôm nay dài thêm; ở chữ lớn 360 nút gửi không dùng được ở màn đầu | Thu gọn thẻ trạng thái (một dòng + hành động ngang), hoặc giảm chiều cao khối hỏi; giữ `Gửi` trên nav ở mọi viewport |
| **R-20** | `/app/history` | Câu dưới biểu đồ: `Bảng/danh sách dữ liệu bên dưới liệt kê từng mẫu.`; `Chi tiết kỹ thuật` chứa `220 mẫu đã nhận`, `không có mẫu lệch đồng hồ`; body `mẫu` = 1 ở 390/1280 | F19 mới đổi phần lớn từ “mẫu”, còn sót câu mô tả ngoài details | Đổi “từng mẫu” → “từng lần đo”; giữ từ kỹ thuật trong details nếu cần |
| **R-21** | Gửi câu hỏi 403 | `POST` 403 (fixture `Origin không được phép cho thao tác ghi`) → alert `Chủ hồ sơ không chia sẻ số đo` + `Bạn chưa được xem số đo…`; `[role=log]` vẫn render nhưng rỗng (`logCount=1, text=""`) dù chủ hồ sơ có quyền xem số đo | F29/F28 chưa đóng: báo sai nguyên nhân (origin/quyền ghi ≠ quyền số đo) và để lại vùng live rỗng | Phân biệt 403 origin/quyền ghi với 403 quyền số đo; chỉ render `role=log` khi có ít nhất một lượt hoặc thông báo |
| **R-22** | H1 chi tiết cảnh báo | `h1.innerText` = `Nghi ngãĐang mở`, `Nghi ngãĐã xác nhận`, `Nghi ngãĐã đóng`; accessible name có khoảng cách nhưng copy/innerText dính | F05 chưa đóng: tiêu đề trộn pill trạng thái, chép ra câu dính chữ và đổi nội dung khi trạng thái đổi | Tách pill ra khỏi `h1` (đặt sau tiêu đề), giữ H1 chỉ là loại cảnh báo |
| **R-23** | Các màn phụ | `/app/settings`: H1 → H3 (Hồ sơ/Mật khẩu/Phiên), không H2; `/app/notifications`: màn riêng, 2 mục đều “Đã xác nhận”, `Đánh dấu đã đọc`, badge 2 dẫn vào; `/app/devices`: `Serial AN-2026-001 · firmware 0.0.0-sim`, `Tháo gắn`, không nói dữ liệu cũ có mất; `/app/tasks`: `Điểm ưu tiên 2/100 · thiết bị #dddddddd`; mục tiêu chạm: chip 37, link phụ 28, “Xem cảnh báo” 22, `Đăng xuất` 38, select 32, `size="sm"` 43 | F16/F22/F23/F24/F27 chưa đóng (ngoài phạm vi đợt sửa, nhưng vẫn là rủi ro của bản giao) | Đưa từng mục vào kế hoạch vòng sau; ưu tiên notifications/devices vì liên quan cảnh báo |
| **R-24** | CSS / lỗi trang / test | `app-simple.css:233` comment “... menu Thêm, **tìm kiếm**” nhưng không có tìm kiếm; `OFFLINE_FALLBACK_SECONDS=300` không thể xảy ra vì `policyValueSchema.offlineAfterSeconds` bắt buộc; `/app/alerts` 403 có 2 H1; test: T02 1/2, không test topbar confirm, không test `stale`/`overflow`/`nextCursor`, test khoá câu “Thiết bị ngoại tuyến” cho online | Chi tiết gây hiểu nhầm khi bảo trì và lỗ hổng hồi quy không được lưới test bắt | Xoá comment/nhánh chết, sửa heading lỗi; bổ sung test viewport/–topbar/stale/two-button hoặc ghi rõ test nào do browser đảm nhiệm |

## 7. Kiểm hồi quy

| Hạng mục | Kết quả đo trên `594ee28` |
| --- | --- |
| Nav 4 mục | 390/360: Hôm nay, Cảnh báo (badge 1), Người thân, Thêm; 1280: 3 link + Thêm trong sidebar; bottom-nav ẩn ở desktop |
| “Thêm” | 92×62 (390), 84×62 (360), 84×73 (360 large); menu 1 bản; 5 mục |
| Hôm nay | H1 “Hôm nay” duy nhất; thẻ trạng thái + Gọi/Xem cảnh báo (khi có cảnh báo); 1 link Sức khỏe; 1 dòng mô phỏng; `maxlength=500` |
| Sổ hồ sơ / Người thân | Không có nhãn “Sổ hồ sơ”; `/app/subjects` H1 “Người thân”; chủ hồ sơ thấy 1 thẻ; caregiver thấy 2 thẻ, phân vai “Người thân xem hộ”/“Chủ hồ sơ” |
| Đổi hồ sơ | Caregiver đổi An → Bình: select đổi, H1 giữ “Hôm nay”, trạng thái `Chưa nhận dữ liệu từ thiết bị.`, `role=log=null` (hội thoại bị xoá), link Sức khỏe giữ |
| 403 | Caregiver vào `/app/admin`: H1 “Quản trị”, “Không có quyền truy cập”, “Không có dữ liệu quản trị nào được tải” — tốt. `/app/alerts` 403: lỗi tải + retry (R-04). `assistant/ask` 403: sai nguyên nhân + log rỗng (R-21) |
| Chữ lớn | `html[data-text-size=large]`: chip wrap, `maxlength` giữ; Hôm nay 360 large `Gửi` bị nav che (R-19); Sức khỏe 360/390 large tràn ngang (R-17) |
| Bàn phím | Tab order 390: skip → logo → Aa → Đăng xuất → select → (Kiểm tra thiết bị) → textarea → Gửi → chip → link → 4 mục nav; outline 3 px teal (select 2 px); skip link Enter → main. Focus rơi `BODY` sau xác nhận cảnh báo và sau mở hộp đăng xuất; menu không đóng khi Tab ra ngoài |
| Tràn ngang | 0 ở 9 màn × 390/360/1280; **44 px** ở `/app/overview` 360 large, **14 px** ở 390 large (R-17); **36 px** ở 360 khi mở hộp đăng xuất (R-09) |
| H1 | Mỗi màn khách hàng 1 H1; `/app/alerts` khi 403 có 2 H1 (R-04); H1 chi tiết cảnh báo dính pill (R-22) |
| Console / mạng | Không console error/pageerror; 0 request non-GET tới `/api/v1` (trừ login ngoài trang); POST `assistant/ask` trong audit5 bị route chặn tại chỗ |
| Bundle / test | 33 tệp / 216 test; `index-DnZI6qUx.js` 270,32 kB (gzip 83,06) |

## 8. Đối chiếu nhanh với handoff

| Handoff nói | Đo lại |
| --- | --- |
| 216 test, 33 tệp | Đúng |
| Build 270,32 kB | Đúng |
| F01 câu quyền + không badge + không gọi API cảnh báo | Đúng ở Hôm nay; màn Cảnh báo còn R-04 |
| F03 offline thật `12:12` + tone alert | Đúng; nhánh `stale`/nhiều thiết bị sai (R-01/R-02) |
| F04 Gọi trước, trong màn 390/360 | Đúng (y=601); cảnh báo đã đóng vẫn Gọi (R-05) |
| F07 không còn một chạm ở danh sách | Đúng; chi tiết vẫn một chạm (R-08) |
| F09 `Thêm` 91,5×62 | Đúng (92×62; 84×62 ở 360) |
| F12 chỉ còn 1 câu ở Cảnh báo | Đúng số đếm; nhưng Hôm nay mất câu (R-10) |
| F19 `mô phỏng` 4→2, `mẫu` 7→0, `độ phủ` 3→1 | Đúng số đếm; nhãn nguồn khối Tổng hợp bị xoá (R-11) |
| F21 một nút “Hiện thêm” | Đúng khi `nextCursor=null`; có `nextCursor` lại 2 nút (R-16) |
| F30 chip 360 large kết thúc ≈292 | Đúng |
| F31 `maxlength=500` | Đúng |
| Không có console error, `scrollWidth−clientWidth=0` | Đúng ở 9 màn × 3 viewport thường; sai ở chữ lớn Sức khỏe (R-17) và topbar confirm (R-09) |

## 9. Giới hạn của lượt review

- Chỉ Chromium headless; chưa kiểm Firefox/WebKit/Safari iOS, thiết bị thật, xoay ngang, zoom trình duyệt 200%, `forced-colors`, `prefers-reduced-motion`.
- Không đo contrast bằng axe/Pa11y; không kiểm với trình đọc màn hình thật. Các kết luận a11y dựa trên DOM/ARIA/kích thước/focus.
- Trạng thái `stale`/nhiều thiết bị/403/quyền bị chặn được dựng bằng `page.route` với fixture đúng hợp đồng; **không ghi DB**. Riêng `stale` dựa trên định nghĩa `device-status.ts:69-81`, không phải dòng DB thật.
- Cảnh báo `open` là fixture; cảnh báo seed hiện ở `acknowledged`. Không bấm `Có, tôi đang hỗ trợ`, không đóng cảnh báo, không đánh dấu đã đọc, không thu hồi phiên, không lưu hồ sơ.
- Login kiểm thử tạo 63 phiên mới cho chủ hồ sơ (tổng 124) + phiên người thân; chiều cao Cài đặt bị phồng, không dùng làm bằng chứng code.
- Không chạy bộ Playwright e2e có sẵn (config 5173, cần seed); dùng script riêng trên 4345.
- Không kiểm bundle production trên trình duyệt thật (chỉ build + chạy dev 4345).

## 10. Tệp thay đổi và artifact

- Báo cáo: `reports/qa/v4-rereview-app.md` (tệp duy nhất thêm vào repo).
- Code được review: `a1066f3` + handoff `594ee28`; base `bda9bb2`.
- Artifact ngoài repo `C:/tmp/rev-v4-rereview-app/`:
  - JSON: `audit1.json` (9 màn × 4 viewport), `audit2.json` (F01/F03/F02/F07), `audit3.json`/`audit3b.json` (menu/đăng xuất/F04), `audit4.json` (chữ lớn 360, Lịch sử, 403, nav/đổi hồ sơ, Tab, F12), `audit5.json` (badge 0, disclaimer, topbar, overview, chi tiết đã xác nhận), `audit6.json` (menu Tab-out, 20 cảnh báo, caregiver không xem số đo).
  - Probe: `probe-overflow.mjs`, `probe-pill.mjs`, `probe-resolved.mjs`, `probe-history-buttons.mjs`, `probe-more-label.mjs`, `probe-today-fold.mjs`, `probe-403.mjs`.
  - Ảnh: `390-_app.png`, `F01-390-today.png`, `F01-390-alerts.png`, `F03-*.png`, `F02-*.png`, `F04-owner-*.png`, `detail-{resolved,acknowledged,open}.png`, `F09-*.png`, `logout-*.png`, `390large-overview-overflow.png`, `answer-disclaimer.png`, `alerts20-confirm-360.png`, `history-two-buttons.png`, `alerts-403-flat.png`, `caregiver-no-measure.png`.

## 11. Trả lời ngắn

- **Số phát hiện:** 24 (1 P1, 16 P2, 7 P3).
- **P1 còn lại:** 1 — F03 nhánh “dữ liệu cũ nhưng thiết bị vẫn online” (`freshness=stale`) bị gọi là “Thiết bị ngoại tuyến” kèm mốc heartbeat. F01, F04 và F07 danh sách đã đóng; F07 chi tiết còn một chạm ở mức P2.
- **Tệp:** `reports/qa/v4-rereview-app.md`.

> Ghi chú trung thực: mọi số liệu trong báo cáo này lấy từ lần chạy ngày 2026-11-15 trong worktree `fix-v4-app` tại `594ee28`; không dùng số đo handoff. Các mục “đã đóng” chỉ nói về kịch bản gốc được nêu; không phải kết luận chung cho cả nhánh.
