# Review v7 W4 — kiểm độc lập trên bản hợp nhất

**Ngày:** 18/11/2026 (Asia/Ho_Chi_Minh).
**Người kiểm:** Pi · provider/model thực tế `moxuna / deepseek-v4.1-flash` (không phải `dola/gpt-6.1-sol`).
**Worktree:** `C:/Users/nguye/orca/workspaces/DATN/v7-w4-review` · branch `Tung204/v7-w4-review`
· HEAD `ff8b116`. `git diff HEAD master -- apps packages` rỗng: code giống master `b0f49d9`;
hai commit sau chỉ là tài liệu.
**Không sửa sản phẩm.** Chỉ đọc, chạy, chụp, ghi báo cáo + ảnh.

## 0. Kết luận ngắn

- **Không tái hiện P1/P2 nào** trên 26 route × 4 viewport: không tràn ngang, đúng 1 H1,
  0 target <44×44, không còn nền kem/serif/Newsreader, nav 4 mục đúng.
- Các hành vi bắt buộc đã kiểm thật và đạt: invite 422, mark-read + reload, banner mới mở
  đúng incident, ack danh sách 2 bước + 409 CAS, share caregiver 0 request owner-only,
  devices caregiver không có claim/release, tasks đóng có lý do, admin non-admin 0 request,
  Studio data không nhãn “Dữ liệu thật”, publish bị khoá khi draft đổi.
- Còn **2 P3** (ack ở trang chi tiết không hỏi lại; Studio subject-scope thiếu dòng nhận diện
  hồ sơ) và **1 phép kiểm chưa xong** (đổi hồ sơ xoá thread/số liệu). Vì vậy:
  **W3 đóng được; W2 đóng được về giao diện đo được, nhưng chưa nên tuyên bố nghiệm thu
  toàn v7** cho tới khi 5 điều kiện ở §8 xong.

## 1. Môi trường và sai lệch có chủ ý

| Thành phần | Giá trị thực |
| --- | --- |
| Web | `http://127.0.0.1:4360` — Vite 8.3.8, `VITE_API_BASE_URL=http://127.0.0.1:3011/api/v1` |
| API | `http://127.0.0.1:3011` — Nest dev, `WEB_ORIGIN=http://127.0.0.1:4360` |
| DB | PGlite cục bộ trong worktree: `apps/api/.data/w4`; seed demo (3 user, 2 hồ sơ, 1 thiết bị, 1.681 telemetry, 3 incident, 2 việc, 2 outbox) |
| Browser | Playwright 1.65.1 / Chromium for Testing 159.0.8154.6, headless, DPR 1, locale `vi-VN`, timezone `Asia/Ho_Chi_Minh` |
| Node/pnpm | Node 24.22.2 · pnpm 12.5.1 |

**Sai lệch cổng 3010:** cổng 3010 đang bị API của worktree `v7-p` chiếm (PID 31876, xác minh
`netstat`/`Win32_Process`), nên API review dùng **3011** thay vì 3010. Không dùng, không dừng,
không sửa API/DB của phiên khác. Web vẫn đúng 4360. Không sửa source API/contract.

Dữ liệu thêm trong lúc kiểm hành vi (incident mới, đóng việc, mark-read) chỉ nằm trong PGlite
của worktree. **Ảnh ma trận được chụp trước các mutation này**, trên seed sạch; ảnh hành vi
(`alerts-ack-confirmed-1280x900.png`) chụp sau và ghi rõ trạng thái.

## 2. Cổng kỹ thuật — tự chạy, không tin handoff

| Lệnh | Exit | Kết quả thật |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | **0** | lockfile hợp lệ, không cài thêm |
| `pnpm build:contracts` + `pnpm --filter @heart-iot/web typecheck` | **0** | `tsc --noEmit` sạch |
| `pnpm exec vitest run --no-file-parallelism --maxWorkers=1` | **0** | **38 file / 346 test pass**, 115,87 s |
| `pnpm --filter @heart-iot/web build` | **0** | Vite build xong; entry 272,31 kB (gzip 83,66 kB) |
| `pnpm --filter @heart-iot/web test:e2e` | **0** | **26/26 pass**, 5,8 s; config chỉ Chromium, mọi spec mock `page.route` |

Số 291–308 trong handoff lane là của nhánh chưa hợp nhất; bản hợp nhất là **346**. Không có
`skip/only` mới. Không chạy test API (không sửa API); đây là review presentation/hành vi web.

## 3. Ma trận route × viewport — số đo tự động

Ảnh: `reports/qa/evidence/v7-w4/screens/` — **104 ảnh viewport** (26 route × 4 viewport)
+ 5 ảnh full-page 390 (`alerts`, `overview`, `history`, `admin-users`, `studio-detail`)
+ 2 ảnh register 360 chữ lớn (pristine/errors) + 1 ảnh ack đã xác nhận.
Số liệu thô: `reports/qa/evidence/v7-w4/metrics.json`.

Viewport: `1280×900`, `390×844`, `360×740`, `390×844` chữ lớn (`html[data-text-size=large]`, root 20px).

| Chỉ số | Kết quả | Ghi chú |
| --- | --- | --- |
| `scrollWidth ≤ clientWidth` (html + body) | **104/104**, `overflowX = 0` | Không trang nào tràn ngang |
| Đúng một H1 | **104/104** | Kể cả 404, 5 tab admin, 3 route Studio |
| Action đứng riêng < 44×44 | **0** trên **104/104** | Quét `a[href]`, `button`, `select`, `summary`, `[role=menuitem]`, checkbox/radio; loại link inline trong câu |
| H1 sản phẩm mobile | **24 px** ở 390/360; **30 px** ở 390 chữ lớn | Desktop 32 px; landing 40 / 28 / 35 px |
| Font | `"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif` toàn bộ | **0 request Newsreader/WOFF serif**; 9 request font Be Vietnam Pro |
| Nền | `rgb(244, 247, 251)` | Không còn nền kem `#faf6ed` |
| Lỗi API ngoài dự kiến | **0** | Chỉ 23×401 `/me` của khách và 4×422 `/invitations/abc1234567` (đúng F01) |

### 3.1. Dòng ngữ cảnh hồ sơ (`role=group aria-label="Người được theo dõi"`)

| Nhóm route | Số dòng | Nhận xét |
| --- | --- | --- |
| `/app`, `/app/assistant`, `/app/alerts`, `/app/alerts/:id`, `/app/overview`, `/app/history`, `/app/devices` | **1** ở cả 4 viewport | Shell render `selected`; alert detail render `pinned` |
| `/app/subjects`, `/app/subjects/:id/share`, `/app/tasks` | **1** | `collection`/`pinned` do trang render; nhãn phạm vi |
| `/app/alerts?view=notifications` | **0** | Đúng: inbox không có select hồ sơ |
| `/app/settings`, `/app/admin*`, `/app/studio*` | **0** | Settings/admin đúng spec; Studio xem P3-02 |

Không có trang nào render hai dòng. Không còn `<span>Bà Năm</span>` rời trên `/app`.

### 3.2. Điều hướng và `aria-current`

- `/app`, `/app/assistant` → **Hôm nay**; `/app/alerts`, `/app/alerts/:id` → **Cảnh báo**;
  `/app/overview`, `/app/history` → **Sức khỏe**; `/app/subjects`, `/app/subjects/:id/share`,
  `/app/devices` → **Người thân**. Đúng cả 4 viewport.
- `/app/tasks`, `/app/settings`, `/app/studio*` → không mục nav nào; admin → **Quản trị**.
- Trong `?view=notifications`, tab **Thông báo đã nhận** có `aria-current="page"`; tab
  **Cảnh báo** không. Nav **Cảnh báo** vẫn active (đúng nhóm).
- Rail desktop và bottom-nav mobile là hai bản của cùng nav; ở mỗi viewport cả hai đều mang
  `aria-current` (bản còn lại bị CSS ẩn). Không thấy nav thứ năm hoặc link Studio trong menu.

### 3.3. Tương phản token đo trên giao diện render

| Cặp | Tỷ lệ | Ngưỡng |
| --- | --- | --- |
| Chữ chính `#18263D` / nền app `#F4F7FB` | **14,13:1** | AA/AAA |
| Chữ chính / trắng | **15,18:1** | AAA |
| Chữ phụ `#526176` / nền app | **5,87:1** | AA |
| Trắng / action `#174BC5` | **7,37:1** | AAA |
| Trắng / rail `#15253E` | **15,37:1** | AAA |
| Trắng / nav active `#284976` | **9,11:1** | AAA |
| Danger `#B42318` / danger-soft | **6,05:1** | AA |
| Warning `#835100` / warning-soft | **6,27:1** | AA |
| Success `#166246` / success-soft | **6,71:1** | AA |

Đây là tỷ lệ từ **màu computed của token đã render**, không phải audit axe toàn bộ text.

### 3.4. Focus, reduced-motion, 200% zoom

- **Focus rail:** Tab qua brand + 4 nav + avatar cho outline **trắng 3 px, offset 3 px**
  (`behaviour-2.json` → `focus-ring-actual.railRings`), không phải xanh trên nền mực.
- **Focus nền sáng:** `Gọi`, textarea câu hỏi, `Gửi` cho outline **`rgb(23,75,197)` 3 px**
  (offset 2–3 px). Không thấy ring bị clipping trong viewport 1280.
- **Reduced-motion:** với `prefers-reduced-motion: reduce`, `.shell__route`, `.button`,
  `.page-title`, `a` đều có animation/transition **`1e-05s` (0,01 ms)** — tắt thực tế,
  không còn slide/pulse. Ghi đúng giá trị, không làm tròn thành 0.
- **200% zoom (emulate 640×450 CSS px):** `/app`, `/app/overview`, `/app/admin?tab=users`
  có `overflowX = 0`, 1 H1. Đây là emulate viewport, **không phải zoom trình duyệt thật**.
- **Register 360×740 chữ lớn:** nút submit `y=548,25, height=55`, đáy 603 < 740;
  submit rỗng focus `register-name`, 3 lỗi field. Đúng regression W2.

## 4. Lời khai/thiết kế → cách kiểm → kết quả thật

### 4.1. Đã kiểm lại

| Lời khai / thiết kế | Cách kiểm | Kết quả thật |
| --- | --- | --- |
| Toàn bộ presentation đổi: sans, nền lạnh, rail mực, không card kem/serif | Ảnh 26 route + computed style | Đúng; không Newsreader, không `#faf6ed`, không card “Hồ sơ đang xem” |
| Nav đúng 4 mục, account ở avatar, không “Thêm”/Studio | DOM `aria-current`, ảnh rail/bottom-nav | Đúng 4 mục; account menu chỉ Tài khoản/Quản trị/Aa/Đăng xuất; Studio chỉ deep link |
| Context 1 dòng ở 5 trang subject-scoped, trên H1; inbox 0 | Đếm `role=group` + ảnh | Đúng; alert detail/share/tasks dùng `pinned`/`collection`; inbox 0 |
| Mỗi màn 1 H1; H1 mobile 24 px, chữ lớn 30 px | DOM 104 tổ hợp | Đúng 104/104; landing 28/35 px |
| Mọi action đứng riêng ≥44×44 (kể cả sm/link phụ/brand/select) | bbox toàn bộ action 104 tổ hợp | **0 target <44** (kể cả brand 145,8×44, link auth 44, select) |
| Không tràn ngang 1280/390/360/chữ lớn | `scrollWidth-clientWidth` html+body | 0 ở 104/104 |
| Contrast text/action/nav/focus | Tính WCAG từ computed color | 5,87–15,37:1; action 7,37:1; rail 15,37:1; active 9,11:1 |
| Reduced-motion tắt animation | Emulate `reducedMotion: reduce` | 0,01 ms cho route/button/title/link |
| Invite 422 là lỗi dữ liệu, không phải lỗi kết nối | `/invite/abc1234567` + network | GET **422**, H1 “Lời mời không hợp lệ”, không nút Thử lại; F01 đóng |
| Inbox mark-read optimistic + reload còn đúng | Bấm Đánh dấu đã đọc, reload | POST `/notifications/:id/read` **204**, pill “Đã đọc”, reload vẫn đọc, 0 nút mark-read |
| Banner thông báo mới mở đúng incident | Ingest `fall.candidate` + `fall.confirmed` thật | Banner “Có thông báo mới cho hồ sơ Bà Trần Thị An” → href `/app/alerts/9dcb…`; mở đúng H1 “Nghi ngã” + context An |
| Ack danh sách 2 bước | Bấm “Tôi đang hỗ trợ” rồi “Có, tôi đang hỗ trợ” | Chưa confirm: **0 POST**; confirm: POST **200**, body `{expectedVersion:2}`, hàng “Đã xác nhận bởi Trần Thị An” |
| Ack 409 khi version lệch | UI giữ v2, API ack trước thành v3, bấm confirm | UI POST `{expectedVersion:2}` → **409**; hiện “Cảnh báo đã có người xác nhận”; không success giả; hàng có người xác nhận |
| Share: caregiver không gọi API owner-only | Network khi caregiver mở share | **0** request `/invitations`, `/care-links`; 0 nút “Mời người thân”; có “Chỉ chủ hồ sơ quản lý chia sẻ” |
| Devices: claim/release chỉ owner | Caregiver mở `/app/devices` | 0 nút “Gắn thiết bị”, 0 “Tháo gắn”; có ghi chú chỉ đọc |
| Tasks đóng có lý do | Owner đóng việc seed | POST `/close` **200**, body `{"reason":"W4 review: …"}`; success hiện |
| Admin non-admin 0 request admin | Owner mở `/app/admin?tab=overview` | **0** request `/api/v1/admin/`; hiện “Không có quyền truy cập” |
| Studio data không “Dữ liệu thật” | Mở `/app/studio/:id/data` | Không có chuỗi “Dữ liệu thật”; có **“Dữ liệu hồ sơ · Bà Trần Thị An”** + **“Dữ liệu mô phỏng”** |
| Studio publish chặn khi draft đổi | Sửa tiêu đề widget rồi kiểm nút | Trước sửa: bật (auto-preview); sau sửa: **disabled**; sau lưu + preview: bật lại; **0 POST publications** |
| Login UI thật qua origin 4360 | Điền form, submit | Vào `/app`, H1 “Hôm nay”, cookie `an_session`; API CORS/origin đúng |
| E2E đồng bộ v7 | `pnpm test:e2e` | **26/26 pass**, không skip/retry |

### 4.2. Không kiểm được / chưa xong

| Mục | Lý do / trạng thái |
| --- | --- |
| **Đổi hồ sơ xoá thread + số liệu cũ** | Script chọn `Gửi` sai accessible name (`aria-label="Gửi câu hỏi"`), timeout trước khi gửi câu hỏi. Chưa có kết luận sản phẩm. Debug xác nhận caregiver có select 2 hồ sơ An/Bình, nhưng **chưa kiểm hành vi** |
| Studio publish **409 digest thật** trên server | Chỉ kiểm UI khoá nút + 0 POST; chưa gửi digest cũ để nhận 409 |
| Caregiver permission matrix đầy đủ trên browser | Chỉ kiểm share + devices; chưa kiểm receive-only, measurement-only, 403, empty/error/offline/stale bằng browser |
| Banner khác hồ sơ | Seed chỉ có 1 thiết bị gắn An; chưa tạo dữ liệu B để banner nói B khi active A |
| `/app/alerts/:id` ack 2 bước | Trang chi tiết ack một bước — xem P3-01; không phải “không kiểm”, nhưng không đạt nếu yêu cầu 2 bước áp cho mọi surface |
| Firefox/WebKit | Config chỉ Chromium; chưa cài/chạy |
| Screen reader thật / axe | Chỉ đo DOM/ARIA/focus/ảnh; chưa chạy NVDA/VoiceOver/axe |
| CI | Repo chưa có CI; toàn bộ số liệu chạy cục bộ Windows |
| Dữ liệu đo thật | Chỉ seed tổng hợp/simulator; không có dữ liệu người thật |

## 5. Finding

### P1 — không có

Không tái hiện được lỗi mất chức năng, tràn ngang, sai quyền hoặc H1/heading hỏng trên
ma trận đo. Không suy đoán P1 từ ảnh.

### P2 — không có

Không có lỗi mức P2 tái hiện được. Các luồng ghi chính (ack, resolve form, tasks close,
policy preview, invite accept) không thấy success giả/auto-retry; 409 ack hiển thị đúng.

### P3-01 — Ack ở trang chi tiết cảnh báo là một bước, không hỏi lại như danh sách

- **Route + viewport:** `/app/alerts/<id>` tại 1280×900 và 390×844; incident mới tạo bằng
  ingest thật (id `9dcb6293-3757-4bc8-a88a-6ffe5d3fd189` trong phiên kiểm).
- **Repro:** mở chi tiết cảnh báo đang `open`, bấm **“Tôi đang hỗ trợ”**. Trên danh sách
  `/app/alerts`, cùng thao tác mở nhóm “Bạn đã liên hệ và đang hỗ trợ?” và chỉ POST sau khi
  bấm “Có, tôi đang hỗ trợ”.
- **Mong đợi:** nếu quy tắc “xác nhận nhanh giữ bước hỏi lại trước POST” của
  `design-system.md` §5.5 áp cho mọi ack, chi tiết phải hỏi lại trước khi đổi trạng thái.
- **Thực tế:** `AlertDetailPage.tsx:318-321` gắn trực tiếp
  `onClick={() => acknowledge.mutate()}`; không có `role=group` xác nhận. Lần chạy thử
  chờ nhóm xác nhận timeout 30 s trong khi mutation đã xảy ra. Danh sách thì đúng 2 bước
  (`AlertsPage.tsx:395-410`), đã đo 0 POST trước confirm và 200 sau confirm.
- **Ảnh/metric:** `screens/alert-detail-390x844.png`, `screens/alerts-ack-confirmed-1280x900.png`;
  `behaviour.json` step `alert-ack-2step-success` (fail vì chờ confirm ở detail),
  `behaviour-3.json` step `alert-list-ack-2step-success` (pass).
- **Mức:** P3 vì §5.5 nói “xác nhận nhanh” ở danh sách, không nói rõ detail; nhưng đây là
  bất nhất quán thao tác ghi cùng loại. Cần chốt: áp 2 bước cho detail, hoặc ghi rõ ngoại lệ.

### P3-02 — Studio subject-scope không hiện dòng nhận diện hồ sơ ở editor

- **Route + viewport:** `/app/studio/26c03294-1fbb-4a1b-9540-8cc632202848` tại 1280×900 và
  360×740; view scope `subject` của Bà Trần Thị An.
- **Repro:** mở route; xem hàng meta dưới H1 và panel preview. Không có dòng
  “Theo dõi: …”, không có select, không có tên hồ sơ; chỉ có badge **“Theo hồ sơ”**.
- **Mong đợi:** `design-system.md` §3.3 nói share URL, alert detail và **Studio subject-scope**
  ghim theo đối tượng từ API/URL, “hiển thị cùng kiểu dòng nhận diện nhưng không có select tự do”.
- **Thực tế:** `routeScope.ts:71-72` trả `context: 'pinned'` cho `/app/studio/` (shell không
  render), nhưng `StudioViewDetailPage.tsx` không render `SubjectContextLine`; metrics đếm
  **0** dòng context ở cả 4 viewport. Data route `/app/studio/:id/data` có bù thông tin bằng
  **“Dữ liệu hồ sơ · Bà Trần Thị An”** (`widgets.tsx:39`), nên lỗi chỉ ở editor/list context.
- **Ảnh/metric:** `screens/studio-detail-1280x900.png`, `screens/studio-detail-360x740.png`,
  `screens/studio-data-1280x900.png`; `metrics.json` contextCount = 0.
- **Mức:** P3 — không lộ dữ liệu sai, nhưng người dùng nhiều hồ sơ phải mở preview/data mới
  biết view thuộc ai. Đề nghị thêm dòng pinned hoặc ghi tên hồ sơ cạnh badge “Theo hồ sơ”.

### Đã biết, không tính finding mới

- Breadcrumb của `PageHeader` là link trực tiếp, không bọc `<nav aria-label="Đường dẫn">`.
- Định dạng ngày giữa các khối chưa nhất quán (ví dụ “01:38 18 thg 11, 2026” và “18/11/2026”).
- Mũi tên “→” trong một số link hiển thị như gạch rời.
- `/app/settings` có dòng “Tài khoản của …” nhưng không phải context hồ sơ; đúng §5.11.
- `tasks` hiển thị mã thiết bị rút gọn (`dddddddd…`) thay vì serial; API task summary chỉ có
  device id nên UI không có nguồn khác — không coi là lỗi presentation.

## 6. Ảnh đã mở và đối chiếu trực tiếp

Đã xem trực tiếp (không chỉ tin JSON): `landing-1280x900`, `landing-390x844-large`,
`login-390x844`, `register-360x740`, `invite-invalid-390x844`, `today-1280x900`,
`today-390x844`, `today-390x844-large`, `alerts-1280x900`, `alerts-390x844`,
`alerts-inbox-1280x900`, `alert-detail-390x844`, `overview-390x844`, `history-390x844`,
`subjects-390x844`, `share-390x844`, `share-360x740`, `devices-390x844`, `tasks-390x844`,
`tasks-360x740`, `settings-390x844-large`, `admin-overview-1280x900`,
`admin-overview-390x844`, `admin-users-360x740`, `admin-users-390x844-full`,
`admin-policy-1280x900`, `admin-policy-360x740`, `admin-audit-1280x900`,
`admin-audit-360x740`, `admin-audit-390x844-large`, `studio-list-1280x900`,
`studio-detail-1280x900`, `studio-detail-360x740`, `studio-data-1280x900`,
`notfound-390x844`.

Nhận xét thẩm mỹ/IA: presentation đã đổi thật (sans, nền lạnh, rail mực, hàng/dải thay card
kem, hero không ảnh stock). Không thấy dấu vết card full-width “Hồ sơ đang xem”, Newsreader
hay “An Nhiên”.

## 7. Phần không kiểm

- Firefox, WebKit, Safari; screen reader thật (NVDA/VoiceOver); axe toàn trang; CI.
- 200% zoom thật trong Chrome (chỉ emulate 640×450 CSS px).
- Dữ liệu đo thật/production; API/DB chia sẻ; SSE mất kết nối lâu dài; 429; 5xx provider AI.
- Luồng đổi hồ sơ xoá thread/số liệu (xem §4.2) — **không kết luận đạt/không đạt**.
- Studio publish 409 digest thật; rollback; policy publish CAS thật trên UI.
- Permission matrix caregiver đầy đủ (receive-only/measurement-only/403) trên browser.

## 8. Kết luận đóng W2/W3

- **W3 (đồng bộ E2E): đóng được.** `typecheck` 0, `vitest` 38/346, `build` 0, `test:e2e`
  26/26, không skip/retry; spec đã theo giao diện v7.
- **W2 (5 lane presentation): đóng được về giao diện đo được.** 104 tổ hợp không P1/P2,
  target/overflow/H1/nav/context/contrast/focus đạt; các luồng ack, inbox, banner, share,
  devices, tasks, admin, invite, Studio data đã kiểm thật.
- **Chưa nên tuyên bố nghiệm thu toàn v7** vì còn phép kiểm đổi hồ sơ và 2 P3 chưa chốt.

**Điều kiện tối đa 6 mục trước khi đóng hẳn:**

1. Chạy lại browser đổi hồ sơ A→B: thread/câu hỏi biến mất, số liệu A không còn dưới B,
   context + quyền B đúng; ghi ảnh/metric.
2. Chốt P3-01: áp bước hỏi lại cho ack ở trang chi tiết, hoặc ghi ngoại lệ rõ trong
   `design-system.md`; nếu sửa, thêm test 2 bước cho `AlertDetailPage`.
3. Chốt P3-02: thêm dòng nhận diện hồ sơ (pinned) ở Studio subject-scope, hoặc nâng badge
   “Theo hồ sơ” thành tên hồ sơ; thêm test context 1 dòng.
4. Kiểm publish Studio bằng digest cũ → server 409/APPROVAL_STALE, UI không tạo publication
   mới và hiện tải lại; không chỉ kiểm nút disabled.
5. Chạy browser cho caregiver receive-only/measurement-only/403 + empty/error/offline/stale,
   tối thiểu `/app`, `/app/overview`, `/app/alerts`, `/app/history`.
6. Ghi rõ miễn trừ hoặc chạy Firefox/WebKit + screen reader/axe + CI; hiện chưa có bằng chứng.

## 9. Bằng chứng và cách chạy lại

- Báo cáo: `reports/qa/v7-w4-review.md`.
- Ảnh: `reports/qa/evidence/v7-w4/screens/` (112 PNG).
- Số đo: `reports/qa/evidence/v7-w4/metrics.json`.
- Hành vi: `behaviour.json` (invite, login, inbox, banner, share, devices, tasks, admin,
  studio, zoom, register), `behaviour-2.json` (ack 409 ở danh sách, focus, reduced-motion),
  `behaviour-3.json` (ack 2 bước thành công).
- Lệnh chính:
  ```bash
  pnpm build:contracts
  pnpm --filter @heart-iot/web typecheck
  pnpm --filter @heart-iot/web exec vitest run --no-file-parallelism --maxWorkers=1
  pnpm --filter @heart-iot/web build
  pnpm --filter @heart-iot/web test:e2e
  # API (cổng 3010 bận, dùng 3011)
  cd apps/api && PGLITE_DATA_DIR=.data/w4 PORT=3011 WEB_ORIGIN=http://127.0.0.1:4360 pnpm seed
  PGLITE_DATA_DIR=.data/w4 PORT=3011 WEB_ORIGIN=http://127.0.0.1:4360 pnpm exec nest start
  # Web
  cd apps/web && VITE_API_BASE_URL=http://127.0.0.1:3011/api/v1 pnpm exec vite --port 4360 --host 127.0.0.1
  ```
- Không commit `.review/`, `apps/web/.w4/`, DB PGlite, cookie/session hoặc secret.
