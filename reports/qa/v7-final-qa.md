# QA chốt v7 — kiểm 3 phép còn thiếu và 2 P3 sau review W4

**Ngày:** 18/11/2026 (Asia/Ho_Chi_Minh).
**Người kiểm:** Pi · provider/model thực tế `moxuna / deepseek-v4.1-flash`
(`PI_PROVIDER`/`PI_MODEL`, không phải model trong prompt).
**Worktree:** `C:/Users/nguye/orca/workspaces/DATN/v7-final-qa`
· branch `Tung204/v7-final-qa` · HEAD `db2d47c` (đã gồm merge fix 2 P3 `57ac34e`).
**Không sửa sản phẩm/test.** Chỉ thêm báo cáo, ảnh, script trong `reports/qa/` và handoff.

## 0. Kết luận ngắn

- **3 phép kiểm còn thiếu đã chạy thật**: đổi hồ sơ A→B xoá thread + số liệu (đạt);
  Studio publish bằng digest cũ nhận **409 `APPROVAL_STALE`**, 0 publication mới (đạt);
  ma trận quyền caregiver **70/70 tổ hợp không màn trắng, không lộ dữ liệu ngoài quyền**
  (đạt phần quyền; còn 3 P3 mới về thông báo, xem §7).
- **2 P3 của review W4 đã đóng thật trên browser**: `/app/alerts/:id` xác nhận 2 bước
  (0 POST trước xác nhận, 1 POST sau, 409 đúng); `/app/studio/:id` subject-scope có đúng
  **1** dòng “Theo dõi: Bà Trần Thị An”, **0** select. Có 5 test mới trong full vitest.
- **Cổng xanh**: typecheck 0, vitest **38 file / 351 test**, build 0, E2E **26/26**.
- **Không có P1/P2 tái hiện được.** Có **3 P3 mới** (P3-03 SSE 403 ở caregiver không nhận
  cảnh báo; P3-04 `/app/overview` gọi `/alerts` trái quyền rồi hiện lỗi kỹ thuật;
  P3-05 copy “Trực tuyến” nhưng “chưa từng kết nối” ở receive-only).
- **Kết luận đóng v7:** **đóng được** theo tiêu chí đã dùng cho W2/W3 (không P1/P2, cổng xanh,
  5/5 điều kiện W4 có bằng chứng, 2 P3 W4 đã đóng). **Không** tuyên bố “không còn lỗi”:
  3 P3 mới cần vào backlog; P3-04 làm điều kiện “thông báo đúng” của ma trận quyền chưa đạt
  tuyệt đối. Nếu chủ dự án yêu cầu 0 P3 trước nghiệm thu thì **chưa đóng**.

## 0.1. Bảng điều kiện → cách kiểm → kết quả thật

| # | Điều kiện (review W4 §8) | Cách kiểm | Kết quả thật | Trạng thái |
| --- | --- | --- | --- | --- |
| 1 | Đổi hồ sơ A→B xoá thread/câu hỏi/số liệu A, context + quyền B đúng | Browser `/app/assistant`, hỏi A, đổi select sang B, đo DOM/network/ảnh | Thread 0, câu hỏi/đáp A biến mất, 0 số liệu A, 0 POST ask sau đổi; B owner đúng quyền | **ĐẠT** |
| 2 | P3-01: ack `/app/alerts/:id` 2 bước | Browser bấm “Tôi đang hỗ trợ” → “Có…”; đo POST; dựng 409 | 0 POST trước xác nhận, 1 POST `expectedVersion=2` → 200; 409 `CONFLICT` + tải lại đúng | **ĐÓNG P3** |
| 3 | P3-02: `/app/studio/:id` subject-scope 1 dòng nhận diện | Browser đếm `.subject-context`/select ở 1280/390 | Đúng 1 dòng “Theo dõi: Bà Trần Thị An”; 0 select | **ĐÓNG P3** |
| 4 | Studio publish digest cũ → 409/APPROVAL_STALE, 0 publication | Preview, sửa draft bằng API, bấm publish với digest cũ; đếm publication | 409 thật, `APPROVAL_STALE`, 0→0 publication; UI báo tải lại/preview lại | **ĐẠT** |
| 5 | Ma trận quyền receive-only/measurement-only + 403/empty/error/offline/stale | 4 route × 2 viewport × trạng thái, API thật + inject | 70/70 ô không màn trắng/không lộ dữ liệu; 3 P3 thông báo mới | **ĐẠT PHẦN QUYỀN; 3 P3** |
| 6 | Firefox/WebKit + screen reader/axe + CI | — | Chưa chạy; ghi miễn trừ §8 | **MIỄN TRỪ** |

## 1. Môi trường và dữ liệu kiểm

| Thành phần | Giá trị thực |
| --- | --- |
| Web | `http://127.0.0.1:4361` — Vite 8.3.8 |
| API | `http://127.0.0.1:3013` — Nest dev, `WEB_ORIGIN=http://127.0.0.1:4361` |
| DB | PGlite cục bộ trong worktree: `apps/api/.data/final`; seed demo (3 user, 2 hồ sơ, 1 thiết bị, 1.681 telemetry, 3 incident, 2 việc, 2 outbox) |
| Web env | `VITE_API_BASE_URL=http://127.0.0.1:3013/api/v1` |
| Browser | Playwright 1.65.1 / Chromium, headless, DPR 1, locale `vi-VN`, timezone `Asia/Ho_Chi_Minh` |
| Viewport | `1280×900`, `390×844` |
| Node/pnpm | Node 24.22.2 · pnpm 12.5.1 |

**Cổng đã dùng:** 3013/4361 vì 3010, 3011, 4360 đang bị worktree/phiên khác chiếm
(`netstat` lúc bắt đầu: 3010 PID 31876, 3011 PID 50820, 4360 PID 42712). Không dùng,
không dừng, không sửa API/DB của phiên khác. Không sửa source API/contract.

**Dữ liệu thêm trong lúc kiểm (chỉ trong `.data/final`):**
- 2 tài khoản QA qua API công khai + 2 care link với quyền cụ thể (xem §5.1):
  `qa-receive-only@demo.heart-iot.local`, `qa-measurement-only@demo.heart-iot.local`
  (mật khẩu dùng trong script `qa-permission-2026`).
- 1 Studio view `qa-final-subject` (`68c03421-e519-43e6-8b97-74a86bcd6963`, scope subject
  Bà An) để kiểm 409/context.
- Incident mới qua `POST /ingest/events` (device seed) để kiểm ack 2 bước/409; nhiều incident
  đã acknowledged. Vì vậy ảnh baseline có 6–9 thông báo/cảnh báo, không phải seed sạch.
- `sharedFrom` của 2 care link mới là thời điểm chạy setup (~02:52 18/11). Điều này làm
  `daily-summary`/`measurements` của measurement-only **rỗng trong cửa sổ 24h** (dữ liệu seed
  kết thúc trước mốc chia sẻ) — đây là hành vi đúng của cửa sổ chia sẻ, không phải lỗi.
  Vì vậy trạng thái `stale` của Lịch sử dùng fixture mẫu cũ (ghi rõ ở §5.4).

**Ảnh:** `reports/qa/evidence/v7-final/` — **78 PNG**, đặt tên
`route-viewport-account-trạng-thái.png` (ví dụ
`overview-1280x900-measurement-only-baseline.png`).
**Số đo/hành vi:** 6 JSON cùng thư mục (`setup.json`, `assistant-switch.json`, `studio-409.json`,
`p3-verify.json`, `permission-matrix.json`, `sse-permission.json`).

## 2. Cổng kỹ thuật — tự chạy, số thật

| Lệnh | Exit | Kết quả thật |
| --- | --- | --- |
| `pnpm --filter @heart-iot/web typecheck` | **0** | `tsc -p tsconfig.json --noEmit` sạch |
| `pnpm --filter @heart-iot/web exec vitest run --no-file-parallelism --maxWorkers=1` | **0** | **38 file / 351 test pass**, 109,34 s; không skip/only; +5 test từ fix 2 P3 (346 → 351) |
| `pnpm --filter @heart-iot/web build` | **0** | Vite build xong; entry `index-CLATQT9d.js` **272,31 kB** (gzip 83,65 kB), built 224 ms |
| `pnpm --filter @heart-iot/web test:e2e` | **0** | **26/26 pass**, 5,3 s; Chromium, mọi spec mock `page.route`, không retry |

Không chạy test API vì không sửa API; đây là QA presentation/hành vi web.
Repo không có script lint/CI; không có CI để chạy.

## 3. Điều kiện 1 — đổi hồ sơ xoá thread + số liệu/insight

**Cách kiểm:** tài khoản người thân seed `minh@demo.heart-iot.local` (có 2 hồ sơ:
Bà An được chia sẻ 20 ngày, Ông Bình sở hữu). Mở `/app/assistant`, chọn A (Bà An), gửi
“Nhịp tim tuần này thế nào?”, chờ câu trả lời thật; đổi sang B (Ông Bình) bằng select
`#active-subject-select`; đo DOM/network trước–sau.
Script: `reports/qa/scripts/v7-final-assistant-switch.mjs`.

| Điều kiện | Kết quả 1280×900 | Kết quả 390×844 |
| --- | --- | --- |
| A có câu trả lời | **Có**, 132 ms; “Chỉ từ **1681 mẫu**, độ phủ **83.4%**, **3 khoảng thiếu**… Trợ lý AI hiện chưa sẵn sàng…” | **Có**, 137 ms, cùng nội dung |
| Đổi sang B | Select value `bbbb…`, text “Ông Nguyễn Văn Bình” | Như 1280 |
| Câu hỏi còn trên trang | **Không** | **Không** |
| Câu trả lời A còn trên trang | **Không** | **Không** |
| `role=log` hội thoại | **0** node | **0** node |
| Số liệu A còn lại | **0**: trước có `83.4%`; sau `bpm=[]`, `bước=[]`, `% = []` | Như 1280 |
| Request `assistant/ask` sau khi đổi | **0** | **0** |
| Request của B sau khi đổi | `GET B/status 200`, `GET B/alerts?state=open&limit=20 200`, `GET B/events 200`; **không** request A nào | Như 1280 |
| Quyền/context B | `role=owner`, `historyDays 3650`, `canViewMeasurements=true`, `canViewAi=true`; form gửi **bật**; không hint quyền | Như 1280 |
| Ảnh | `assistant-1280x900-before-switch.png`, `assistant-1280x900-after-switch.png` | `assistant-390x844-before-switch.png`, `assistant-390x844-after-switch.png` |

**Kết quả: ĐẠT.** Thread/câu hỏi/câu trả lời/số liệu của A biến mất ngay; context và quyền
của B đúng. Không thấy phản hồi muộn của A chen vào (lần này phản hồi đã về trước khi đổi;
kiểm “đổi khi request còn bay” vẫn là mục chưa kiểm, xem §8).

## 4. Điều kiện 4 — Studio publish bằng digest cũ

**Cách kiểm:** mở `/app/studio/68c03421-e519-43e6-8b97-74a86bcd6963` (scope subject Bà An),
để trang preview và bật nút công bố; sau đó **đổi draft bằng API ở “tab khác”** (`PUT
/workspace-views/:id/draft` với `baseRevision` hiện tại); bấm “Công bố bản nháp” với
`draftRevision`/`digest` cũ còn giữ trong tab.
Script: `reports/qa/scripts/v7-final-studio-409.mjs`.

| Số đo | 1280×900 | 390×844 |
| --- | --- | --- |
| Draft trước / sau khi tab khác sửa | r6 → **r7** | r7 → **r8** |
| Digest trước (UI gửi) | `9f96adbe…` | `e0b5e4c6…` |
| Body publish UI gửi | `{"draftRevision":6,"digest":"9f96…","baseRevision":0}` | `{"draftRevision":7,"digest":"e0b5…","baseRevision":0}` |
| HTTP publish | **409** | **409** |
| Response | `code=APPROVAL_STALE`, `details.currentDraftRevision=7`, digest mới `e0b5…`, `currentBaseRevision=0` | `code=APPROVAL_STALE`, `currentDraftRevision=8`, digest mới `8d32…`, base 0 |
| Publication trước / sau | **0 / 0** | **0 / 0** |
| UI sau 409 | Banner **“Bản đã thay đổi ở máy chủ”** + “Bản đã duyệt không còn khớp trạng thái hiện tại, hãy preview lại.” + “Trạng thái hiện tại: draft hiện tại r7 · digest e0b5e4c6… · base r0” + nút **Tải lại**; không có success giả; lịch sử “Chưa có bản công bố nào” | Như 1280 với r8/digest 8d32… |
| Sau bấm Tải lại | Form **“Soạn nháp · lần sửa r7”**, tiêu đề widget mới; **0 POST** trong lúc tải lại; không còn banner stale; nút công bố bật lại do trang tự preview lại — **chưa tạo publication** cho tới khi bấm tay | r8, cùng hành vi |
| Ảnh | `studio-publish-1280x900-ready.png`, `…-409.png`, `…-reloaded.png` | `studio-publish-390x844-ready.png`, `…-409.png`, `…-reloaded.png` |

**Kết quả: ĐẠT.** Server chặn CAS đúng bằng `409/APPROVAL_STALE`; không tạo publication mới;
UI hiện trạng thái hiện tại và yêu cầu tải lại/preview lại. Đây là 409 **thật trên server**,
không phải chỉ kiểm nút disabled. (Đổi draft bằng API là “tab khác” hợp lệ theo yêu cầu;
không mở hai tab browser thật — xem §8.)

## 5. Điều kiện 5 — ma trận quyền caregiver

### 5.1. Tài khoản và quyền

| Tài khoản | Vai trò trên Bà An | `historyDays` | `canReceiveAlerts` | `canAcknowledge` | `canResolve` | `canViewAi` | `canViewMeasurements` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `qa-receive-only@…` | caregiver | 30 | **true** | true | false | false | **false** |
| `qa-measurement-only@…` | caregiver | 30 | **false** | false | false | false | **true** |

Cả hai chỉ thấy Bà An; `sharedFrom` = lúc setup (~02:52 18/11).

### 5.2. Tổng hợp ma trận — 70 tổ hợp

Mỗi tài khoản × 4 route × 2 viewport. Trạng thái áp dụng theo endpoint trang **thật sự gọi**:
- `baseline`: API thật.
- `403`, `empty`, `error` (500), `offline` (abort route): chỉ inject trên endpoint **được phép**
  của tài khoản; endpoint bị cấm vẫn trả 403 thật.
- `stale` (dữ liệu cũ): chỉ ở nơi UI có tín hiệu cũ đọc được (`overview` qua status/daily-summary;
  `history` qua measurements). Các ô không gọi API dữ liệu được ghi **N/A** thay vì bịa trạng thái.

| Tài khoản | Route | 1280×900 | 390×844 |
| --- | --- | --- | --- |
| receive-only | `/app` | baseline, 403, empty, error, offline — **5/5 đạt** | 5/5 đạt |
| receive-only | `/app/overview` | baseline, 403, empty, error, offline, stale — **6/6 đạt an toàn**; anomaly copy thiết bị P3-05 | 6/6 đạt an toàn |
| receive-only | `/app/alerts` | baseline, 403, empty, error, offline — **5/5 đạt** | 5/5 đạt |
| receive-only | `/app/history` | baseline — **đạt**; 4 trạng thái còn lại **N/A** (trang chỉ hiện trạng thái quyền, không gọi API số đo) | như 1280 |
| measurement-only | `/app` | baseline, 403, empty, error, offline — **5/5 đạt an toàn**; anomaly SSE P3-03 | 5/5 đạt an toàn |
| measurement-only | `/app/overview` | baseline, 403, empty, error, offline, stale — **6/6 đạt an toàn**; anomaly `/alerts` 403 + SSE P3-04/P3-03 | 6/6 đạt an toàn |
| measurement-only | `/app/alerts` | baseline — **đạt an toàn**; anomaly SSE P3-03; 4 trạng thái còn lại **N/A** (trang không gọi API cảnh báo) | như 1280 |
| measurement-only | `/app/history` | baseline, 403, empty, error, offline, stale — **6/6 đạt an toàn**; anomaly SSE P3-03 | 6/6 đạt an toàn |

**Tổng: 70/70 ô `ok`** theo bất biến an toàn (anomaly thông báo được ghi riêng, không tính là fail bất biến): đúng 1 H1, không màn trắng (text main 239–1.073 ký tự),
không lộ số liệu ngoài quyền, không lộ danh sách cảnh báo ngoài quyền, có thông báo lỗi/quyền/
empty tương ứng. **8 anomaly baseline** (không làm fail bất biến) là 3 P3 ở §7.

### 5.3. Bằng chứng không lộ dữ liệu ngoài quyền

- **receive-only (34 ô):**
  - **0** request tới `/measurements`, `/daily-summary`, `/insights` trong toàn bộ 34 ô.
  - **0** chuỗi số đo (`bpm`, `bước`, `%`) trong text main.
  - Request chỉ có `status`, `alerts`, `emergency-contacts`; 31 request alerts 200 (dữ liệu
    cảnh báo được phép), 14 request alerts 403 ở các ô inject 403.
  - `/app/overview` hiện đúng “Chủ hồ sơ không chia sẻ số đo” + “Số đo … ẩn theo quyền”;
    `/app/history` hiện “Chủ hồ sơ không chia sẻ số đo” và không gọi API.
- **measurement-only (36 ô):**
  - **0** request `/alerts` trả 200; **0** link `a[href^="/app/alerts/"]`; **0** text item
    “Nghi ngã/Đã xác nhận bởi/Phát hiện …” trong mọi ô.
  - Số đo chỉ xuất hiện ở nơi được phép (`history` stale: 70–72 bpm, 25%, 80%;
    `overview`: 0% độ phủ). 12 request `/alerts` trả 403 ở `overview` — xem P3-04.
  - `/app/alerts` hiện đúng “Bạn không có quyền xem cảnh báo của hồ sơ này”.

### 5.4. 403 / empty / error / offline / stale — kết quả thật

- **403:** UI hiện thông điệp quyền hoặc lỗi có “Thử lại”, không màn trắng; không lộ dữ liệu.
- **empty:** status `devices:[]`, alerts `items:[]`, summary/insights/measurements rỗng;
  UI hiện “Chưa gắn thiết bị”, “Không có cảnh báo”, “Chưa có dữ liệu”…; không màn trắng.
- **error (500):** “Không tải được …” + nút thử lại; vùng khác vẫn hiện; không màn trắng.
- **offline (abort route):** như error; không có request treo; nút thử lại có mặt.
- **stale:** `overview` hiện “Dữ liệu mới nhất 3 ngày trước (03:06 15 thg 11, 2026)” và
  thiết bị “Chưa cập nhật gần đây”; `history` hiện 3 dòng cũ **15/11 02:56–03:06** dù hôm nay
  18/11, kèm độ phủ 25%; không màn trắng. Đây là fixture đo “UI có dán nhãn/không giấu dữ liệu
  cũ”, không phải server thật trả dữ liệu trước `sharedFrom`.

### 5.5. Kết quả theo route — thông báo thấy được

| Route | receive-only | measurement-only |
| --- | --- | --- |
| `/app` | “Bạn chưa được xem số đo của hồ sơ này.” + “Trợ lý chưa được bật…”; không gọi status/summary | “Bạn không có quyền xem cảnh báo của hồ sơ này.” + “Trợ lý chưa được bật…”; status 200 nhưng **bị thông báo quyền cảnh báo che**; có banner SSE 403 (P3-03) |
| `/app/overview` | “Chủ hồ sơ không chia sẻ số đo”; cảnh báo mở vẫn hiện; thiết bị hiện “Trực tuyến” + “chưa từng kết nối” (P3-05) | Số liệu + xu hướng hiện đúng; **đồng thời** “Không tải được cảnh báo đang mở — Quyền được chia sẻ không cho phép thao tác này. Kiểm tra kết nối và thử lại.” (P3-04); banner SSE 403 |
| `/app/alerts` | Danh sách cảnh báo 200, có nút 2 bước | Chỉ thông báo quyền; **không** gọi API cảnh báo; banner SSE 403 |
| `/app/history` | Chỉ thông báo quyền; **không** gọi API số đo | Lịch sử đo 200 (rỗng do cửa sổ chia sẻ) hoặc dữ liệu cũ ở fixture stale; banner SSE 403 |

## 6. Xác nhận 2 P3 của review W4

### 6.1. P3-01 — `/app/alerts/:id` xác nhận 2 bước

Script: `reports/qa/scripts/v7-final-p3.mjs`; incident tạo thật qua `POST /ingest/events`
(`fall.candidate` r1 + `fall.confirmed` r2 → open, version 2).

| Số đo | 1280×900 | 390×844 |
| --- | --- | --- |
| Bấm “Tôi đang hỗ trợ” lần 1 | Nhóm `role=group aria-label="Xác nhận hỗ trợ cảnh báo"` hiện, câu “Bạn đã liên hệ và đang hỗ trợ?”; **0 POST** | Như 1280 |
| Bấm “Hủy” | Nhóm đóng, nút trở lại; **0 POST** | Như 1280 |
| Bấm “Có, tôi đang hỗ trợ” | **1 POST** `{"expectedVersion":2}` → **200**; state `acknowledged`, version **3**, “Trần Thị An đã xác nhận đang hỗ trợ” | Như 1280 |
| 409: tab khác ack trước | API ngoài ack 200 (v2→v3); UI vẫn giữ v2; bấm xác nhận → **1 POST** `{"expectedVersion":2}` → **409** `CONFLICT` `details.currentVersion=3`; UI “Cảnh báo đã thay đổi ở nơi khác” + “Tải lại cảnh báo”; sau tải lại hiện đúng người đã xác nhận, không ghi đè | Như 1280 |
| Ảnh | `alert-detail-1280x900-confirm/acked/409/409-reloaded.png` | `alert-detail-390x844-…` |

**P3-01: ĐÓNG.** Không còn ack một chạm ở trang chi tiết. Lưu ý: để tạo 409, tab kiểm
**chặn SSE** (`route.abort('/events')`) nhằm mô phỏng tab khác ack trước khi tab này nhận
cập nhật; với SSE bật, UI có thể tự refetch và mất nút trước khi bấm. Đây là cách dựng
trạng thái stale hợp lý, đã ghi rõ.

### 6.2. P3-02 — `/app/studio/:id` subject-scope có dòng nhận diện

| Số đo | 1280×900 | 390×844 |
| --- | --- | --- |
| `.subject-context` hiển thị | **1** | **1** |
| `role=group aria-label="Người được theo dõi"` | **1** | **1** |
| Text | **“Theo dõi: Bà Trần Thị An”** ngay dưới breadcrumb/trên H1 | Như 1280 |
| `select` trong dòng context | **0** | **0** |
| `#active-subject-select` toàn trang | **0** | **0** |
| H1 / badge | “QA chốt v7 — hồ sơ Bà An” / “Theo hồ sơ” | Như 1280 |
| Ảnh | `studio-detail-1280x900-subject-context.png` | `studio-detail-390x844-subject-context.png` |

**P3-02: ĐÓNG.** Đúng 1 dòng nhận diện, không select tự do. Test mới
`StudioViewDetailPage — dòng nhận diện hồ sơ` (2 test) pass trong full vitest.

## 7. Finding

### P1 — không có

Không tái hiện mất chức năng, tràn ngang, sai quyền ghi/đọc, màn trắng hoặc lộ dữ liệu
số đo/cảnh báo ngoài quyền trên 70 tổ hợp quyền và 2 luồng còn lại.

### P2 — không có

Không có lỗi mức P2 tái hiện được. Các luồng ghi (ack, publish CAS) đều fail-closed đúng:
409 không tạo publication/không đổi trạng thái giả; 403 không lộ dữ liệu.

### P3-03 — Caregiver không có `canReceiveAlerts` vẫn mở SSE, nhận 403 và banner “Mất cập nhật trực tiếp”

- **Route + viewport:** mọi route `/app`, `/app/overview`, `/app/alerts`, `/app/history` tại
  1280×900 và 390×844; tài khoản `qa-measurement-only` (`canReceiveAlerts=false`,
  `canViewMeasurements=true`).
- **Repro:** đăng nhập tài khoản measurement-only, mở `/app`. Network có
  `GET /subjects/<An>/events` → **403** (3 lần do retry); shell hiện banner
  **“Mất cập nhật trực tiếp — đang thử lại”**. Đo được **36/36 ô** measurement-only đều có
  banner này; script riêng `sse-permission.json` ghi 3×403.
- **Nguyên nhân:** `apps/web/src/app/AppShell.tsx:499` gọi
  `useSubjectEvents(activeSubject?.id ?? null, …)` cho mọi hồ sơ, không kiểm `canReceiveAlerts`;
  server `apps/api/src/realtime/realtime.service.ts:80` yêu cầu `receive_alerts` nên trả 403.
  `useSubjectEvents` coi lỗi EventSource là mất kết nối và retry.
- **Mong đợi:** với hồ sơ không có quyền nhận cảnh báo, không mở SSE hoặc SSE phải trả
  trạng thái “không có quyền” im lặng; không hiện banner mất kết nối.
- **Mức:** P3 — không lộ dữ liệu, không mất chức năng, nhưng mọi phiên measurement-only đều
  có trạng thái lỗi giả và retry 403 liên tục; trái tinh thần “quyền là trạng thái, không phải lỗi”
  (`docs/06`, `docs/07`).
- **Ảnh/metric:** `today-1280x900-measurement-only-baseline.png`,
  `overview-…`, `alerts-…`, `history-…`; `permission-matrix.json` (`sse403: true` 36 ô),
  `sse-permission.json`.

### P3-04 — `/app/overview` gọi `/alerts` khi thiếu `canReceiveAlerts`, hiện lỗi kỹ thuật thay vì trạng thái quyền

- **Route + viewport:** `/app/overview` 1280×900 và 390×844; tài khoản measurement-only.
- **Repro:** mở `/app/overview`; network có `GET /subjects/<An>/alerts?state=open&limit=20`
  → **403**; UI hiện **“Lỗi: Không tải được cảnh báo đang mở — Quyền được chia sẻ không cho
  phép thao tác này. Kiểm tra kết nối và thử lại.” + nút Thử lại**, trong khi trang vẫn hiện
  số đo bình thường. Không có item/link cảnh báo nào bị lộ.
- **Nguyên nhân:** `apps/web/src/features/dashboard/DashboardPage.tsx:124-131` bật query
  `openAlerts` chỉ với `enabled: Boolean(subjectId)`, thiếu điều kiện `canReceiveAlerts`
  (khác `AssistantPage` và `AlertsPage` đã kiểm đúng).
- **Mong đợi:** theo `docs/06-trai-nghiem-va-man-hinh.md` §“Quyền là trạng thái, không phải lỗi”
  và `docs/07-tro-ly-ai.md`, thiếu `canReceiveAlerts` phải hiện câu nghiệp vụ và **không gọi**
  API bị cấm; không biến 403 thành lỗi kết nối “Kiểm tra kết nối”.
- **Mức:** P3 — không lộ dữ liệu, nhưng thông báo sai bản chất (lỗi kỹ thuật thay vì quyền),
  gây retry vô ích; là ô duy nhất trong ma trận không đạt “thông báo đúng”.
- **Ảnh/metric:** `overview-1280x900-measurement-only-baseline.png`,
  `overview-390x844-measurement-only-baseline.png`; `permission-matrix.json` anomaly
  “overview gọi /alerts khi thiếu canReceiveAlerts → 403”, 12 request alerts 403.

### P3-05 — Receive-only thấy thiết bị “Trực tuyến” nhưng “chưa từng kết nối”

- **Route + viewport:** `/app/overview` 1280×900 và 390×844; tài khoản receive-only.
- **Repro:** mở `/app/overview`; panel Thiết bị hiện pill **“Trực tuyến”** nhưng dòng Kết nối
  **“chưa từng kết nối”**, Pin “chưa có thông tin”, Số đo “Không được xem số đo…”.
- **Nguyên nhân:** server `apps/api/src/devices/device-status.ts:43-57` ẩn `lastSeenAt` nếu mốc
  trước `sharedFrom` (đúng quyền), nhưng vẫn trả `freshness='live'`/`online=true`; UI
  `DashboardPage.tsx` hiển thị `lastSeenAt === null ? 'chưa từng kết nối'` nên mâu thuẫn.
- **Mong đợi:** khi `healthDataVisible=false` và mốc bị ẩn do cửa sổ chia sẻ, copy phải nói
  “không hiển thị mốc kết nối theo quyền chia sẻ” (hoặc tương đương), không nói “chưa từng
  kết nối” khi thiết bị đang trực tuyến.
- **Mức:** P3 — không lộ dữ liệu, nhưng thông tin kết nối sai, ảnh hưởng quyết định gọi/kiểm tra thiết bị.
- **Ảnh/metric:** `overview-1280x900-receive-only-baseline.png`,
  `overview-390x844-receive-only-baseline.png`; text trong `permission-matrix.json`.

## 8. Chưa kiểm / miễn trừ

- **Firefox, WebKit/Safari**: config chỉ Chromium; chưa cài/chạy.
- **Screen reader thật (NVDA/VoiceOver), axe toàn trang**: chỉ đo DOM/ARIA/focus/ảnh.
- **CI**: repo chưa có pipeline; toàn bộ số liệu chạy cục bộ Windows.
- **200% zoom thật trong Chrome**: kế thừa giới hạn review W4 (chỉ emulate CSS px).
- **AI provider thật**: chưa cấu hình `AI_*`; câu trả lời là fallback template
  (“Trợ lý AI hiện chưa sẵn sàng”), không kiểm chất lượng model/stream/timeout thật.
- **Revoke quyền giữa phiên / SSE `revoked` + dọn cache**: không làm trong lượt này.
- **Hai tab browser thật**: publish 409 dùng API “tab khác”; ack 409 dùng SSE bị chặn để giữ
  version cũ. Chưa kiểm race hai tab thật có SSE.
- **Permission matrix chỉ hồ sơ Bà An**; không kiểm hồ sơ Bình/không có hồ sơ/ archived,
  caregiver bị thu hồi, owner chuyển hồ sơ, hay 429/5xx thật từ API (403/500/offline là inject).
- **Studio publish thành công/rollback** trên bản này: chỉ kiểm nhánh 409 theo yêu cầu;
  review W4 đã kiểm khoá nút/0 POST trước đó.
- **Dữ liệu đo thật/production, MQTT event, Web Push, đa trình duyệt**: ngoài phạm vi.

## 9. Kết luận đóng v7

- **W3 (E2E) và W2 (presentation) vẫn đóng**: cổng xanh, 26/26 E2E, 38/351 vitest, build 0.
- **5/5 điều kiện W4 đã có bằng chứng thật**:
  1. Đổi hồ sơ A→B xoá thread/số liệu — **đạt**.
  2. P3-01 ack chi tiết 2 bước — **đóng**.
  3. P3-02 Studio subject-scope 1 dòng — **đóng**.
  4. Studio publish digest cũ → 409, 0 publication — **đạt**.
  5. Ma trận quyền receive-only/measurement-only — **70/70 ô an toàn, không lộ dữ liệu**;
     còn 3 P3 thông báo (P3-03/04/05).
- **Không có P1/P2.** Vì vậy **v7 đóng được** theo tiêu chí đã dùng cho W2/W3.
- **Nhưng không tuyên bố “không còn lỗi”**: 3 P3 mới tái hiện được; P3-04 làm điều kiện
  “thông báo đúng” của ma trận quyền chưa đạt tuyệt đối. Nếu chủ dự án yêu cầu 0 P3 trước
  nghiệm thu, **chưa đóng** — cần sửa ít nhất P3-04 (một điều kiện `canReceiveAlerts` ở
  `DashboardPage`) và nên sửa P3-03 (chỉ mở SSE khi có quyền) trước demo.

## 10. Bằng chứng và cách chạy lại

- **Ảnh:** `reports/qa/evidence/v7-final/` (78 PNG).
- **Số đo:** `setup.json`, `assistant-switch.json`, `studio-409.json`, `p3-verify.json`,
  `permission-matrix.json`, `sse-permission.json`.
- **Script:**
  - `reports/qa/scripts/v7-final-setup.mjs` — tạo 2 tài khoản/care link + Studio view qua API.
  - `reports/qa/scripts/v7-final-assistant-switch.mjs` — điều kiện 1.
  - `reports/qa/scripts/v7-final-studio-409.mjs` — điều kiện 4.
  - `reports/qa/scripts/v7-final-permission-matrix.mjs` — điều kiện 5.
  - `reports/qa/scripts/v7-final-p3.mjs` — xác nhận 2 P3 W4.
  - `reports/qa/scripts/v7-final-sse-permission.mjs` — đo riêng SSE 403.
- **Lệnh môi trường:**
  ```bash
  pnpm build:contracts
  # API (cổng 3013; 3010/3011 bận)
  cd apps/api
  PGLITE_DATA_DIR=.data/final PORT=3013 WEB_ORIGIN=http://127.0.0.1:4361 pnpm seed
  PGLITE_DATA_DIR=.data/final PORT=3013 WEB_ORIGIN=http://127.0.0.1:4361 pnpm exec nest start
  # Web (cổng 4361; 4360 bận)
  cd apps/web
  VITE_API_BASE_URL=http://127.0.0.1:3013/api/v1 pnpm exec vite --port 4361 --host 127.0.0.1
  # QA scripts
  node reports/qa/scripts/v7-final-setup.mjs
  node reports/qa/scripts/v7-final-assistant-switch.mjs
  node reports/qa/scripts/v7-final-studio-409.mjs
  node reports/qa/scripts/v7-final-permission-matrix.mjs
  node reports/qa/scripts/v7-final-p3.mjs
  node reports/qa/scripts/v7-final-sse-permission.mjs
  ```
- **Cổng:**
  ```bash
  pnpm --filter @heart-iot/web typecheck
  pnpm --filter @heart-iot/web exec vitest run --no-file-parallelism --maxWorkers=1
  pnpm --filter @heart-iot/web build
  pnpm --filter @heart-iot/web test:e2e
  ```
- Không commit `.data/`, cookie/session, secret hoặc dữ liệu người thật; DB PGlite chỉ nằm
  trong worktree.
