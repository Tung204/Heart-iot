# v7 W0 gate — phản biện độc lập thiết kế và inventory

**Ngày:** 17/11/2026 (Asia/Ho_Chi_Minh) · **Người thực hiện:** Pi worker `task_cb1418223d33` · **Model/provider thực tế của phiên:** `moxuna / deepseek-v4.1-flash`. Mandate chọn `dola / gpt-6.1-sol`; phiên này không chạy model đó, nên các kết luận dưới đây là đọc source/tài liệu, không phải nghiệm thu của model được chỉ định.
**Baseline khảo sát:** `e4c8965` trên nhánh `Tung204/v7-w0-gate` (không commit vào master).
**Phạm vi:** chỉ đọc `reports/orchestration/v7-specs/mandate.md`, `design-system.md`, `implementation-plan.md`, `migration-inventory.md`, `w1-foundation.md`, `reports/qa/v6-review.md`, `docs/06`, router/shell/features/tests/CSS/contracts liên quan. **Không chạy** unit/typecheck/build/browser/API; mọi kết luận là suy ra từ source, không phải kết quả thực thi. Không sửa code/test/thiết kế; không ghi Obsidian.

**Quy ước mức:** **P1** = phải chốt trước W2 vì có thể mất chức năng/quyền/trạng thái, vi phạm yêu cầu người dùng, hoặc làm một cổng không chạy được. **P2** = mơ hồ/thiếu ownership hoặc thiếu contract, gây rework/lệch giữa lane. **P3** = cải thiện đo lường, tài liệu, nhất quán. Không đặt quota số finding.

## 0. Kết luận ngắn

Thiết kế phủ **đủ tên route** trong router hiện tại, kể cả các đường dễ bị bỏ: notifications/mark-read, tasks, Studio trực tiếp, policy/audit, invite/404, share/contacts, archive/deletion, sessions. Khoảng trống chính không phải “thiếu màn”, mà là **thiếu mô tả trạng thái shell** (banner mất SSE/mất quyền), **active-nav cho một số route**, **Studio chỉ có URL/bookmark** (design nói rõ, cần chốt), và **cách chia file/CSS chưa đóng** giữa W1 với plan. Cổng W1 hiện **không chạy được như văn bản** vì origin API, vị trí ảnh ngoài workspace, thiếu DB/admin cho ảnh, và ma trận đo hẹp hơn plan. Các mục P1 dưới đây cần lead chốt trước khi W2 mở; W1 đang chạy song song nên cần gửi điều chỉnh sớm. **P1:** C2 (ảnh ngoài workspace), R1 (CSS), R2 (shared interface), R4 (context), R12 (cache revoke), G1 (origin 4350); **P2:** C1, C3-C5, R3, R5-R8, R10, G2-G6; **P3:** C6, R9, R11, G7-G8.

Các route đã đối chiếu với source: `apps/web/src/app/router.tsx:73-105`; alias assistant `:93`; redirect notifications `:92`; app 404 `:100`; public 404 `:105`.

## 1. Phủ route → nhiệm vụ → logic/quyền phải giữ → nơi thiết kế mô tả

### 1.1. Công khai, auth, invite, khung `/app`

| Route / capability | Source (đã đọc) | Nhiệm vụ và logic/quyền phải giữ | Nơi thiết kế/plan mô tả | Thiếu/lệch |
| --- | --- | --- | --- | --- |
| `/` landing | `apps/web/src/app/router.tsx:73`; `src/pages/LandingPage.tsx:106-141` | `useMe`; phân biệt pending / 401 khách / lỗi mạng-5xx; CTA đúng trạng thái; không tự điền tài khoản demo; không hứa năng lực y tế | design §5.1 (`design-system.md:150-158`); plan §1.2 | Có mô tả. W1 không sửa page; P lane W2. |
| `/login`, `/register` | `router.tsx:74-75`; `features/auth/*` | `useSafeNext` chỉ URL nội bộ; validation/focus lỗi; pending chống gửi hai lần; giữ `next` xuyên login/register/invite | design §5.2 (`:160-167`) | Có mô tả. |
| `/invite/:token` | `router.tsx:76`; `features/invitations/InvitePage.tsx:77` | GET preview/POST accept; **422/400 token sai định dạng khác 404/5xx/mạng**; không lộ email/token/số đo; quyền accept | design §5.3 (`:170-177`) | Có mô tả, đã sửa đúng F01 v6. |
| `*` công khai | `router.tsx:105`; `src/pages/NotFoundPage.tsx` | H1, đường về, hướng dẫn kiểm link mời; không dùng auth-card cũ | design §5.14 (`:298-300`) | Có mô tả. |
| `/app/*` guard | `router.tsx:78`; `app/ProtectedRoute.tsx:16-40` | 401 → `/login?next=pathname+search`; lỗi mạng/5xx **không** suy ra logout; retry | design §5.14 (`:303`); plan §1.2 | Có mô tả. |
| Shell `/app` | `app/AppShell.tsx:438-667` | 4 mục nav + account avatar; badge cảnh báo mở; selection/SSE; banner/reload; skip link/focus; admin-only exception | design §3 (`:81-105`), §3.3 (`:107-115`), §3.4 (`:117-123`) | Thiếu mô tả banner shell (**R6**), active nav một số route (**G5**), chống render trùng context (**R4**). |

### 1.2. Không gian người dùng

| Route / capability | Source | Nhiệm vụ và logic/quyền phải giữ | Nơi thiết kế mô tả | Thiếu/lệch |
| --- | --- | --- | --- | --- |
| `/app` Hôm nay | `router.tsx:84`; `features/assistant/AssistantPage.tsx:145-176, 230-235` | Chỉ hỏi khi đủ quyền; không auto-summary; alerts độc lập AI; thread/reset/late-answer; POST schema; nguồn/disclaimer | design §5.4 (`:179-192`); plan §5.1 | Có mô tả. Context đang nằm trong page (`:447`) → **R4**. |
| `/app/assistant` alias | `router.tsx:93` | Cùng `AssistantPage`, cùng dữ liệu/quyền/thread | design §3.2 (`:92`), §5.4 | Có mô tả; active nav chưa kiểm (**G5**). |
| `/app/overview` Sức khỏe | `router.tsx:85`; `features/dashboard/DashboardPage.tsx:90-111` | Query status/summary/open-alerts; alert không chờ summary/AI; null/coverage/source; hiện query chỉ `enabled: Boolean(subjectId)`, **chưa gác permission đã biết** | design §5.7 (`:216-221`); plan §1.1 | Có mô tả; H phải thêm known-permission gate theo design. |
| `/app/history` | `router.tsx:86`; `features/history/HistoryPage.tsx:193-234, 317, 378, 521` | `sharedFrom`/historyDays; clamp GET+CSV; 10/50/400; một biến thể mobile; chỉ HR hợp lệ; **nhãn dữ liệu mô phỏng** đang có ở `:521` | design §5.7 (`:223-229`) | Thiếu dòng bảo toàn nhãn nguồn mô phỏng trong design lịch sử → **R7**; active nav nhóm Sức khỏe → **G5**. |
| Insights (component, không route) | `features/insights/useInsights.ts:1-29`; `RecentInsightsCard.tsx` | `keepPreviousData` phải ràng identity; null/ngày thiếu; nguồn | design §3.4 (`:119-120`), §5.7 | Có mô tả; H sở hữu. |
| `/app/alerts` danh sách | `router.tsx:87`; `features/alerts/AlertsPage.tsx:96-103` | Đọc theo subject; ack cần **receive + acknowledge**; CAS `expectedVersion`; 409; empty/no-permission; stale/SSE giữ list | design §5.5 (`:194-202`) | Có mô tả. |
| Inbox `?view=notifications` + mark-read | `design-system.md:198, 204`; `features/notifications/NotificationsPage.tsx:29-57, 92-130`; **router chưa mount page** | Account-wide; mark-read optimistic + rollback; không ack/resolve; click item phải mở đúng `incidentId` | design §5.5 (`:204`); plan §1.2, §3.1 (`:94`) | Design mô tả; W1 cho phép redirect không kèm view → **C4**; banner shell → **R5**. |
| `/app/alerts/:id` | `router.tsx:88`; `features/alerts/AlertDetailPage.tsx:73-78` | Quyền/context theo `detail.subjectId`, **không** theo selection; CAS; contacts không chặn ack; timeline không bịa giờ | design §5.6 (`:206-213`) | Có mô tả. |
| `/app/subjects` + form | `router.tsx:89`; `features/subjects/SubjectsPage.tsx:48-60, 158-205` | Tạo/sửa; archive không xóa + revoke share; deletion chỉ `recorded`; role owner; chọn subject trước navigate | design §5.8 (`:232-239`); plan §5.1 | **API archive/deletion nằm inline trong page**, không ở `subjects/api.ts` → **R3**. |
| `/app/subjects/:id/share` + contacts | `router.tsx:90`; `features/share/SharePage.tsx:83-95, 199` | Owner-only; GET invitations/care-links **không chạy trước khi xác minh owner**; cờ quyền độc lập; token một lần; contacts 5/primary/`tel:` | design §5.9 (`:241-248`) | Có mô tả; R phải đổi thứ tự query (`:83-95` đang trước `:199`). |
| `/app/devices` | `router.tsx:91`; `features/devices/DevicesPage.tsx:116, 177-192, 213-250` | Metadata/redaction; claim/release **owner-only** (source chưa gate role); freshness live/stale/offline/never; claim≠online | design §5.10 (`:252-256`) | Có mô tả; R phải thêm owner gate và giữ redaction; active nav nhóm Người thân → **G5**. |
| `/app/tasks` | `router.tsx:94`; `features/tasks/TasksPage.tsx:82-83, 122, 316-319` | Account-wide, key không theo subject; owner tạo; đóng owner/admin; conflict/409; task admin `subjectId=null` | design §3.2 (`:96`), §5.10 (`:258-263`) | Design có entry; **source không có bất kỳ link tới `/app/tasks`** (grep chỉ thấy comment `TasksPage.tsx:78`) → R phải thêm. |
| `/app/settings` + sessions | `router.tsx:95`; `features/settings/SettingsPage.tsx:16, 41-43`; `SessionsCard.tsx:18-46, 115-139` | Tên user/password; session hiện tại không revoke; revoke từng/all-others hai bước; 401/refresh | design §5.11 (`:265-271`) | Có mô tả. |
| `/app/notifications` URL cũ | `router.tsx:92` | Redirect replace; không mất inbox/read | design §3.2 (`:101`) | **C4**: W1 cho phép bỏ `?view=notifications`. |
| `/app/*` 404 | `router.tsx:100` | Giữ shell, một H1, về Hôm nay; admin-only chọn đích an toàn | design §5.14 (`:301-303`) | Có mô tả. |

### 1.3. Quản trị và Studio

| Route / capability | Source | Nhiệm vụ và logic/quyền phải giữ | Nơi thiết kế mô tả | Thiếu/lệch |
| --- | --- | --- | --- | --- |
| `/app/admin` + tabs | `router.tsx:96`; `features/admin/AdminPage.tsx:141-153, 1461-1491, 1496` | Non-admin **không gọi API admin**; tab/query URL reload/back; users lock; devices one-time secret; policy preview/digest/CAS; audit panel/filter | design §5.12 (`:273-284`) | Có mô tả nội dung; canonical URL cho 5 mục mới chưa chốt → **R9**. |
| `/app/studio`, `/:id`, `/:id/data` | `router.tsx:97-99`; `StudioViewsPage.tsx:42, 105-106`; `StudioViewDetailPage.tsx`; `StudioViewDataPage.tsx` | List/create scope; draft→preview→publish/rollback CAS; data chỉ publication active; sample≠publication; quyền owner/global admin | design §3.2 (`:99`), §5.13 (`:286-297`) | Presentation có mô tả; **không có đường vào trong sản phẩm** → **C1**; nhãn “Dữ liệu thật” → **R7**. |

### 1.4. Route/capability không thiếu hẳn, nhưng thiếu mô tả hoặc thiếu contract

- **Không có route nào trong `router.tsx` vắng khỏi design-system.** Các mục dưới đây là thiếu mô tả/contract, không phải thiếu màn:
  - Banner shell: mất SSE, mất quyền xem hồ sơ, thông báo mới (dismiss/priority/placement) — design không có mục riêng; chỉ có `Notice` chung (`design-system.md:134`). → **R6**.
  - Active-nav cho `/app/history`, `/app/devices`, alias `/app/assistant`: design xếp History vào nhóm **Sức khỏe**, Devices vào nhóm **Người thân**, alias là **Hôm nay** (`:92-96`); source `AppShell.tsx:531-556` dùng `NavLink` exact path nên các route này không active. Tasks/settings/admin/Studio không nằm trong primary nav, nên chỉ cần ghi rõ “không active” thay vì thêm map. → **G5**.
  - Studio: route trực tiếp có mô tả nhưng **không có entry** trong primary nav, avatar, menu, admin local nav hay bất kỳ page nào. → **C1**.
  - Admin policy/audit: design đổi nhãn thành 5 mục nhưng để “có thể ánh xạ” URL cũ; chưa chốt URL canonical. → **R9**.
  - Nhãn nguồn dữ liệu History và nhãn data Studio: design chỉ nói nguồn mô phỏng ở Sức khỏe (`:221`) và phân biệt sample/preview (`:293`), chưa nói thay “Dữ liệu thật” ở data route. → **R7**.
  - Redirect `/app/notifications`: design ghi rõ `?view=notifications` (`:101`), nhưng W1 để tuỳ chọn. → **C4**.

## 2. Xung đột/yêu cầu người dùng bị vi phạm hoặc bị làm mờ

### C1 — P2 — Studio có route nhưng không có đường vào: cần chốt cách hiểu “trực tiếp”

- **Bằng chứng:**
  - Design chỉ cho phép trực tiếp: `design-system.md:99` — “giữ deep link/bookmark, không thêm vào primary nav/avatar/menu người dùng”; `:103` — “Không có menu Thêm”.
  - `router.tsx:97-99` có ba route; tìm trong source chỉ thấy link nội bộ giữa các trang Studio và test: `grep -rn "app/studio"` → `AppShell.test.tsx:291-296`, `StudioViewDetailPage.tsx:332,385`, `StudioViewDataPage.tsx:71,112,125`, `StudioViewsPage.tsx:70,264,269`. Không có link từ shell/people/devices/admin/settings.
  - `AppShell.tsx:531-556` chỉ render bốn mục; menu tài khoản `:327-417` chỉ Tài khoản/Quản trị/chữ lớn/Đăng xuất; test xác nhận không có Studio (`AppShell.test.tsx:291-296`).
  - `StudioViewsPage.tsx:42,105-106` cho thấy **user thường (owner) cũng tạo/quản lý view**, không chỉ admin; design cũng ghi “Studio vẫn trực tiếp cho tài khoản đủ quyền; không chỉ admin” (`:105`).
  - Mandate: “Studio không đưa vào menu người dùng. **Chức năng phụ vẫn có đường truy cập theo ngữ cảnh rõ nghĩa**” (`mandate.md:19`).
- **Vì sao P2:** đây là điểm căng giữa hai câu của cùng mandate: scope ghi “quản trị và **Studio trực tiếp**” (có thể hiểu là URL-only, ủng hộ design), còn ràng buộc nav ghi “chức năng phụ vẫn có đường truy cập theo ngữ cảnh rõ nghĩa”. Design `:99`/`:105` đã chọn URL-only cho Studio, nên **chưa đủ cơ sở coi là vi phạm**; nhưng owner không phải admin hiện không có entry nào và spec W0 chưa ghi quyết định này, nên cần lead chốt để cổng “không route/capability bị bỏ” (`implementation-plan.md:103`) có tiêu chí rõ.
- **Đề xuất:** lead chốt một trong hai, ghi quyết định vào spec W0:
  1. Thêm entry **không** thuộc 4 mục/avatar/menu người dùng: một mục trong local nav Quản trị (cho admin) và một link ngữ cảnh ở trang Tài khoản/section “Màn hình tuỳ chỉnh” (cho owner có quyền tạo view); hoặc
  2. Ghi rõ “Studio chỉ dùng qua URL/bookmark” là deviation có lý do, kèm điều kiện người dùng chấp nhận; khi đó không tuyên bố “mọi chức năng phụ có đường vào”.

### C2 — P1 — Cổng W1 bắt ghi ảnh ra ngoài workspace, trái mandate và plan

- **Bằng chứng:** `w1-foundation.md:46` — “Ảnh lưu `C:/tmp/v7-foundation/`”; mandate `:32` — “Không ghi ngoài workspace”; plan `:176` — “screenshot lưu vùng QA trong workspace”; v6 từng dùng `C:/tmp` nhưng v7 mandate mới siết lại.
- **Vì sao P1:** vi phạm trực tiếp ràng buộc người dùng; ảnh ngoài repo không kiểm lại được (chính `docs/06:96` đã ghi “Repo chưa có artifact nên người khác không tự kiểm lại được”).
- **Đề xuất:** đổi sang `reports/qa/evidence/v7-foundation/<route>-<viewport>-<state>.png` (thư mục đã tồn tại) hoặc vùng QA trong workspace; ghi SHA/route/viewport/state vào tên hoặc manifest; nếu ảnh lớn thì để untracked nhưng vẫn trong workspace.

### C3 — P2 — W1 yêu cầu “đúng 4 mục” nhưng không nêu ngoại lệ admin không hồ sơ

- **Bằng chứng:** `w1-foundation.md:35` — “**đúng 4 mục** Hôm nay/Cảnh báo/Sức khỏe/Người thân”; design `:105` — “Admin không có hồ sơ giữ ngoại lệ hiện có: `/app` về `/app/admin`, điều hướng theo không gian quản trị, không bày bốn trang sức khỏe trống”; source `AppShell.tsx:531-537` (adminOnly → chỉ Quản trị), test `AppShell.test.tsx:376-389`.
- **Vì sao P2:** F đọc W1 theo nghĩa tuyệt đối sẽ phá ngoại lệ/test; nếu giữ ngoại lệ thì W1 sai chữ. Cần chốt để không tranh cãi ở review.
- **Đề xuất:** sửa W1 thành “4 mục với người dùng có hồ sơ; admin không hồ sơ giữ ngoại lệ Quản trị theo design §3.2”; thêm test cho cả hai trạng thái.

### C4 — P2 — W1 cho phép làm mất inbox khi redirect `/app/notifications`

- **Bằng chứng:** design `:101` — redirect tới `/app/alerts?view=notifications`, “không làm mất đánh dấu đã đọc hoặc hộp thông báo toàn tài khoản”; design `:204` mô tả inbox; `w1-foundation.md:37` — “`/app/notifications` → Cảnh báo (**hoặc** `?view=notifications` nếu bạn chọn, ghi rõ)”; source `router.tsx:92` đang `Navigate to="/app/alerts"` không có query.
- **Vì sao P2:** nếu F chọn redirect trơn, bookmark/link cũ mở danh sách cảnh báo thay vì inbox; capability mark-read vẫn còn nhưng mất một bước và trái câu chữ design.
- **Đề xuất:** bắt buộc `?view=notifications` trong W1/W3; F sửa redirect; C đọc `useSearchParams` để render inbox trong `AlertsPage`; thêm router test cho cả URL cũ và `?view=notifications`.

### C5 — P2 — W1 “bỏ boot/theme-color/noscript” trái design yêu cầu boot mới

- **Bằng chứng:** `w1-foundation.md:33` — “bỏ boot CSS/theme-color/noscript theo phong cách cũ”; design `:303` — “`index.html` cũng đổi theme-color, inline boot/noscript: nền `#F4F7FB`, chữ `#18263D`, skeleton tĩnh xanh xám, không shimmer/cream flash trước React”; source `index.html:7` (theme-color kem), `:19-93` (boot CSS/shimmer), `:100-113` (skeleton/noscript).
- **Vì sao P2:** nếu F xoá cả boot/noscript, mất trạng thái chống màn trắng trên mạng chậm (lý do v2 P1-4) và trái design; nếu giữ nguyên thì còn màu kem/shimmer.
- **Đề xuất:** W1 ghi rõ **thay** theme-color sang `#F4F7FB`, **thay** skeleton tĩnh xanh xám không shimmer, **giữ** noscript với copy trung thực; thêm kiểm tra first paint/JS-disabled hoặc ít nhất kiểm `index.html` chứa asset mới.

### C6 — P3 — `docs/06` còn mô tả nav “Thêm”, badge chưa đọc và caregiver đóng task

- **Bằng chứng:** `docs/06:101` — “Nav 4 mục: Hôm nay, Cảnh báo, Người thân, **Thêm**…”; `:94` — “thanh dưới 5 mục… mục phụ trong Thêm”; `:89` — “badge chưa đọc trên sidebar/menu Thêm”; `:91` — “caregiver… đóng nếu có quyền”; đối chiếu source `AppShell.tsx:531-556` (không Thêm), badge là cảnh báo mở (`:504-505`), `TasksPage.tsx:316-319` (caregiver không đóng).
- **Vì sao P3:** D dự kiến cập nhật docs sau tích hợp (`implementation-plan.md:82`), nhưng nếu reviewer/QA đọc `docs/06` trong W2/W3 sẽ có tiêu chí nghiệm thu mâu thuẫn.
- **Đề xuất:** trong W0 decision, ghi “design-system + source là nguồn W2; docs/06 chỉ lịch sử”; D cập nhật các dòng này **trước** W4 review ảnh, không đợi sau hợp nhất.

## 3. Rủi ro triển khai trong cách chia file/thứ tự

Đã đối chiếu bảng owner `implementation-plan.md:74-82`: **không thấy hai lane cùng ghi một file** trong danh sách. Các điểm “cùng vùng” thật là cùng thư mục (`features/subjects` do F/R, `features/notifications` do F/C) và `layout.css` không có owner sau F1; rủi ro chính là **import chéo một chiều vào file độc quyền** (R2) và **file legacy dùng chung không ai nhận** (R1), không phải vòng import trực tiếp. Các mục dưới đây nêu đúng chỗ cần sửa ownership/thứ tự/contract, không viết lại plan.

### R1 — P1 — W1 và plan mâu thuẫn về tách CSS; sau F1 `layout.css` không có owner

- **Bằng chứng:**
  - Plan `:57-60`: “Bước nền F1… chuyển các block đang còn dùng khỏi `layout.css`/`*-simple.css` sang file source owner”; “Việc tách CSS là một commit nguyên tử với `main` và imports: trong build **không bao giờ nạp đồng thời** `layout.css`/`*-simple.css` và bản thay”; “`main.tsx` cuối chỉ import fonts/tokens/base/primitives/shell”.
  - `w1-foundation.md:38`: “tách presentation foundation khỏi `layout.css`… **Phần CSS của feature để nguyên cho lane sau** … chưa tách; lane tự lo”.
  - Plan `:75` (ownership F) chỉ liệt kê `src/styles/{fonts,tokens,base,shell}.css`, **không** có `layout.css`; W1 `:19` cho F quyền sửa `layout.css` trong W1.
  - Plan `:112` (cổng F1) yêu cầu “**không double CSS**”; `layout.css` hiện 3.509 dòng và `main.tsx:2-8` vẫn import nó cùng ba file `*-simple`.
- **Vì sao P1:** hai văn bản không thể cùng đúng. Nếu W1 giữ feature CSS trong `layout.css` thì `main.tsx` vẫn import legacy, nên không thể chứng minh “không double CSS”; nếu F xoá block foundation khỏi `layout.css` nhưng để feature, thì sau F1 không ai được giao `layout.css` để các lane xoá block của mình. Cả hai đường đều dẫn tới hai định nghĩa `.button`/`.field`/`.card`/shell hoặc làm hỏng màn chưa chuyển.
- **Đề xuất chốt trước commit W1 (chọn một):**
  - **(A) Theo plan:** F1 tách toàn bộ block còn dùng sang file feature owner, import tạm từ `main`, xoá import legacy trong cùng cut-over; `layout.css` bị xoá ở F1. Đây là việc lớn nhưng đúng “một source cho mỗi selector”.
  - **(B) Thu hẹp F1 có kiểm:** F1 chỉ retire **selector foundation** khỏi legacy (`.button*`, `.field*`, `.card*`, `.alert*`, `.pill*`, shell…), giữ feature block; `layout.css` vẫn được import **trước** foundation mới; giao `layout.css` cho F với hàng đợi patch từ lane; chuyển gate “không double CSS” sang W3. Kèm ledger selector → owner → trạng thái và điều kiện không còn hai định nghĩa foundation.
  - Không chấp nhận phương án “để cả hai rồi thêm override”.

### R2 — P1 — Nhiều module dùng chung nằm trong vùng độc quyền của lane khác nhưng plan không đóng băng interface

- **Bằng chứng import chéo (source thật):**
  - `app/AppShell.tsx:23-24` import `useMe/useLogout` từ `features/auth/useAuth` (**P sở hữu**) và `fetchOpenAlerts` từ `features/dashboard/api` (**H sở hữu**).
  - `app/ProtectedRoute.tsx:5` import `useMe` (**P**).
  - `features/notifications/useUnreadNotifications.ts:5` import `fetchNotifications` từ `features/notifications/api` (**C**).
  - `features/assistant/AssistantPage.tsx:12-19` import `dashboard/api` (**H**), `contacts/phone`, `contacts/useEmergencyContacts` (**R**), `subjects/selection`, `subjects/useSubjects`, `SubjectSwitcher` (**F**).
  - `features/alerts/AlertDetailPage.tsx:25-26` import `subjects/useSubjects` (**F**), `contacts/EmergencyContactCard` (**R**).
  - `features/studio/widgets.tsx:2` và `features/notifications/NotificationsPage.tsx:13` import `alerts/labels` (**C**) từ hai lane khác.
  - `features/share/SharePage.tsx:21-22` (**R**) import `subjects`/`contacts` (F/R); `features/tasks/TasksPage.tsx:19` (**R**) import `subjects` (F).
  - Plan ownership `:75-82`; contract §3.1 `:88-94` chỉ khoá `Button/TextField/PageHeader/Empty/Error/SubjectContextLine`, **không** liệt kê các module trên; quy tắc hiện có chỉ nói “shared change cần gửi patch/yêu cầu cho owner” (`:71`), không cấm đổi signature.
- **Vì sao P1:** các lane W2 chạy song song từ F1; nếu P đổi `useAuth`, H đổi `dashboard/api`, C đổi `alerts/labels`/`notifications/api`, F đổi `selection/useSubjects`, R đổi `contacts/phone` thì lane khác vỡ typecheck/test ngay khi ghép. Đây là lỗi cấu trúc của cách chia file, không phải lỗi code.
- **Đề xuất:** thêm bảng “F1 shared interface freeze” vào plan §3.1, tối thiểu các module trên + `src/test/utils.tsx`; quy tắc **chỉ thêm, không đổi tên/chữ ký/xoá export** trong W2; nếu buộc đổi, phải có patch F + thông báo tất cả lane + rerun test liên quan. Cân nhắc chuyển `alerts/labels.ts`, `contacts/phone.ts`, `contacts/useEmergencyContacts.ts` sang `src/lib` (F sở hữu) hoặc re-export ổn định.

### R3 — P2 — API archive/deletion nằm inline trong `SubjectsPage`; lane R viết lại page có thể làm mất endpoint

- **Bằng chứng:** `features/subjects/SubjectsPage.tsx:48-60` định nghĩa `archiveSubject`/`requestSubjectDeletion` bằng `apiRequest` inline; `:158-205` mutation archive/deletion; `features/subjects/api.ts` chỉ export `fetchSubjects/createSubject/updateSubject` (grep `export`); inventory §2.2 ghi “Archive/deletion API hiện **nằm trong SubjectsPage**, không chỉ `api.ts`”; design `:238` chỉ mô tả UX.
- **Vì sao P2:** R sở hữu cả page và `subjects/api.ts`, nên không xung đột writer, nhưng một bản viết lại JSX “sạch” dễ bỏ hai call này hoặc đổi payload; design không nhắc vị trí code.
- **Đề xuất:** trước khi R thay JSX, tách hai function sang `subjects/api.ts` + test payload/`recorded` semantics; lane gate yêu cầu assertion mutation archive/deletion (không chỉ text UI).

### R4 — P1 — F render context ở shell khi C còn render ở page: trùng context và vỡ test C sở hữu

- **Bằng chứng:** design `:111` — shell render selected context cho 5 loại trang, “page bỏ dòng subject cục bộ”; plan `:93` — shell render; `w1-foundation.md:35-36` — F render selected; **nhưng** W1 `:26` cấm F sửa page feature; source `features/assistant/AssistantPage.tsx:19,447` vẫn render `SubjectContextLine`; test C sở hữu `features/assistant/AssistantPage.test.tsx:560` dùng `screen.getByRole('combobox', { name: 'Chọn hồ sơ' })`; component hiện tại `SubjectSwitcher.tsx:15-95` render `<span>Bà Năm</span>`/`select`.
- **Vì sao P1:** ngay sau F1, `/app` có hai context (shell + page) và hai combobox khi nhiều hồ sơ. `AssistantPage.test` render page đơn lẻ qua `renderPage` nên **không** thấy shell, nhưng E2E/ảnh `/app` sẽ thấy trùng; rủi ro đỏ trực tiếp của test C là design `:110` đổi accessible name thành **Người được theo dõi**, làm locator `Chọn hồ sơ` ở `:560` vỡ nếu F đổi `SubjectSwitcher` mà không được sửa test C. W1 gate `:44` **không** liệt kê `AssistantPage` test, nên W1 có thể bàn giao locator đỏ không owner.
- **Đề xuất:** chốt thứ tự: (a) F chỉ bật shell context sau commit C xoá local line; hoặc (b) lead pre-approve cho F một patch tối thiểu xoá `SubjectContextLine` khỏi `AssistantPage` + sửa locator test C, ghi rõ test diff; đồng thời design chốt DOM order (context trước hay sau H1 — source page đặt sau H1, design `:183` đặt context trước H1) và accessible name. Gate W1 phải có assertion “đúng một context line” trên `/app`, `/app/overview`, `/app/history`, `/app/alerts`, `/app/devices`.

### R5 — P2 — Banner thông báo mới chưa mở đúng incident và bị ẩn trên mọi trang Cảnh báo

- **Bằng chứng:** design `:204` — “Banner toàn tài khoản mở **đúng incident** hoặc đúng chế độ thông báo; không đưa về list của subject A khi banner nói B”; source `AppShell.tsx:463-470` dismiss banner khi `pathname.startsWith('/app/alerts')`; `:617-635` banner chỉ có `ButtonLink to="/app/alerts"` (`:626`); `useUnreadNotifications` trả `newNotification` có `incidentId` (contract `packages/contracts/src/notifications.ts:10-12`).
- **Vì sao P2:** đang ở list cảnh báo của A, thông báo mới cho B bị dismiss, người dùng không thấy; nếu không dismiss, nút chỉ về list A — đúng điều design cấm. Không phải lỗi mất dữ liệu nhưng là mất cảnh báo (yêu cầu “cảnh báo độc lập”).
- **Đề xuất:** F sửa banner: link `/app/alerts/{newNotification.incidentId}`; chỉ suppress khi pathname là chính incident đó hoặc đang ở inbox `?view=notifications`; test “A đang mở, notification B → banner hiện, bấm mở đúng B”; C đảm bảo detail/inbox tôn trọng `detail.subjectId`.

### R6 — P2 — Design không mô tả banner mất SSE và banner mất quyền — trạng thái an toàn dễ bị bỏ khi viết shell mới

- **Bằng chứng:** `AppShell.tsx:602-616` render `Alert` “Bạn đã mất quyền xem hồ sơ” + “Đã hiểu”; `:638-647` banner “Mất cập nhật trực tiếp — đang thử lại” kèm câu “Cảnh báo đã tải vẫn giữ nguyên…”. Design không có mục tương ứng: `grep -n "Mất cập nhật\|mất quyền"` trên `design-system.md` không thấy; chỉ có `Notice` chung `:134` và câu revoke dữ liệu `:122`; W1 `:35` chỉ nói “Giữ banner mất SSE và banner thông báo mới nếu đang có” (không có tiêu chí/copy/priority).
- **Vì sao P2:** đây là hai thông điệp an toàn (dữ liệu có thể cũ; quyền đã mất). Nếu F viết shell mới theo design, dễ bỏ hoặc gộp vào Notice, mất phân biệt stale/offline/permission mà mandate yêu cầu. Không có gate nào kiểm.
- **Đề xuất:** thêm mục §3.5 “Banner shell” vào design: thứ tự ưu tiên (mất quyền > thông báo mới > mất SSE), placement trên H1/dưới skip link, `role=status` vs `alert`, dismiss/không dismiss, copy giữ nguyên nghĩa, đồng thời với subject context; F sở hữu, C/Q kiểm ảnh từng trạng thái.

### R7 — P2 — Nhãn nguồn dữ liệu ở History và Studio data chưa được design chốt

- **Bằng chứng:** `features/history/HistoryPage.tsx:521` có “Dữ liệu hiển thị là dữ liệu mô phỏng.”; design §5.7 Lịch sử `:223-229` **không** nhắc nhãn nguồn, chỉ Sức khỏe `:221` nhắc “nguồn mô phỏng”; `features/studio/widgets.tsx:19-24` `DataModeBadge` ghi “Dữ liệu thật” khi `sample=false`; `StudioViewDataPage.test.tsx:94-117` khẳng định text này; design `:293` chỉ phân biệt “Dữ liệu mẫu”/“Dữ liệu mô phỏng” trong Preview, không nói data route thay “Dữ liệu thật” bằng gì; inventory §3 ghi measurement response không có provenance từng point.
- **Vì sao P2:** mandate yêu cầu nguồn mô phỏng/giới hạn trung thực (`mandate.md:22`). Một lane viết lại History/Studio theo design có thể bỏ nhãn hoặc giữ “Dữ liệu thật” cho telemetry synthetic — sai nghĩa, dù API không đổi.
- **Đề xuất:** design thêm một dòng cho History: giữ câu nguồn mô phỏng cạnh khối dữ liệu/CSV; với Studio data: chốt text “Dữ liệu hồ sơ” + “Dữ liệu mô phỏng” khi `summary.source` synthetic (theo inventory), không dùng “Dữ liệu thật”; A cập nhật test `StudioViewDataPage.test.tsx` bằng test diff được reviewer đọc.

### R8 — P2 — Contract primitive/state chưa đủ cho 5 lane; state labels nằm trong vùng C nhưng A dùng

- **Bằng chứng:** design §4 `:127-140` yêu cầu `Notice`, `Status`, `Conflict`, `Permission`, `Menu/disclosure`, xác nhận inline; plan §3.1 `:88-94` chỉ khoá `Button/TextField/PageHeader/Section/Empty/Error/SubjectContextLine`; `alerts/labels.ts:7-16` (C sở hữu `alerts/*`) được A import ở `studio/widgets.tsx:2`; `.confirm-box` hiện chỉ là CSS trong `layout.css` (không có component dùng chung).
- **Vì sao P2:** mỗi lane tự làm `Notice`/`Status`/confirm/label sẽ tạo 5 biến thể cùng trạng thái, lệch copy/icon/role; A có thể vỡ khi C đổi label. Đây là “mỗi worker tự chọn design system” mà mandate cấm (`mandate.md:28`).
- **Đề xuất:** F1 công bố thêm: `Notice` (hoặc map `Alert` có tone/role rõ), `Status`/tone mapping, `ConfirmInline` (tên đối tượng + Hủy + focus), `Breadcrumb`; chuyển label map alert sang `src/lib` hoặc tuyên bố export của `alerts/labels.ts` là frozen và C không xoá/đổi tên trong W2.

### R9 — P3 — Chưa chốt URL canonical cho 5 mục admin mới

- **Bằng chứng:** design `:277` — “Local navigation đặt tên thật Tổng quan/Người dùng/Thiết bị/Chính sách/Nhật ký… Giữ compatibility `?tab=advanced&view=policy|audit`; **có thể** ánh xạ hai mục cuối vào URL cũ”; source `AdminPage.tsx:141-153` (`Tab` chỉ có `advanced`, `AdvancedView` policy/audit), `:1461-1491` parse/`selectTab`/`selectAdvancedView`; `selectAdvancedView('policy')` hiện **xoá** `view`, nên URL canonical của policy là `?tab=advanced`, còn `?tab=advanced&view=policy` chỉ là URL tương thích; test hiện dùng `?tab=advanced` và `?tab=advanced&view=audit` (`AdminPage.test.tsx:608-614`).
- **Vì sao P3:** A có thể chọn `?tab=policy` không map ngược, làm gãy deep link/bookmark và test; nhưng design đã cho phép giữ URL cũ nên rủi ro thấp nếu đọc kỹ.
- **Đề xuất:** chốt canonical là URL cũ `?tab=advanced&view=policy|audit` cho cả hai nhãn mới; nav “Chính sách/Nhật ký” set đúng cặp param; thêm test reload/back cho cả URL cũ và URL mới (nếu có).

### R10 — P2 — Thiếu ledger selector và cổng chống xoá rule còn dùng

- **Bằng chứng:** plan `:57` yêu cầu “ledger selector → nơi dùng → file mới”; plan `:65` cổng cuối “không duplicate định nghĩa primitive”; `w1-foundation.md:38` chỉ yêu cầu “ghi rõ file nào còn rule cũ”, `:44` không có test/ledger; `AppShell.test.tsx:91-92, 883-901` đọc trực tiếp `layout.css`/`tokens.css`.
- **Vì sao P2:** lane không biết block nào trong `layout.css` thuộc mình để xoá; F xoá theo grep dễ mất class động/modifier; test đọc CSS cũ có thể xanh giả hoặc đỏ vì file bị retire.
- **Đề xuất:** bắt buộc ledger trong handoff F1 (selector → file cũ → owner/lane → trạng thái retire), kèm bằng chứng grep cho dynamic class; cập nhật `AppShell.test` đọc file mới hoặc chuyển kiểm computed/reduced-motion qua browser; gate W3 xác nhận `layout.css` không còn import và không còn selector foundation.

### R11 — P3 — Vị trí `primitives.css` chưa nhất quán giữa plan và scope W1

- **Bằng chứng:** plan `:47` đặt `components/primitives.css`; `w1-foundation.md:26` chỉ nói “Được tạo file CSS foundation mới trong `src/styles/`”, trong khi `src/components/*` cũng nằm trong scope. Nếu F đặt primitive vào `base.css` thay vì `components/primitives.css`, plan §2.1/`main.tsx` import khác đi.
- **Vì sao P3:** không mất chức năng, nhưng dễ sinh hai nơi định nghĩa primitive hoặc lane không biết import.
- **Đề xuất:** W1 ghi rõ `src/components/primitives.css` **hoặc** `styles/base.css` (một nơi duy nhất), cập nhật `main.tsx`/handoff tương ứng.

### R12 — P1 — Ranh giới cache khi revoke chưa đủ; Studio/tasks/notifications nằm ngoài prefix bị xoá

- **Bằng chứng:** design `:122` yêu cầu “Thu hồi quyền gỡ dữ liệu/cache nhạy cảm cả REST, AI, CSV, Studio/notifications theo boundary hiện có”; plan §6.5 (`:212-220`) yêu cầu kiểm cache ngoài `['subjects',id]` (Studio/tasks/notifications/alert detail) “đúng scope, không purge bừa toàn app”; source `features/realtime/useSubjectEvents.ts:77-84` chỉ `removeQueries(['subjects', id])` và `removeQueries(['alerts'])`; `features/studio/api.ts:34-40` dùng prefix `['studio', ...]`; `features/tasks/api.ts:19-22` dùng `['maintenance-tasks', ...]`; `lib/query.ts:20` notifications là key toàn tài khoản.
- **Vì sao P1:** revoke B có thể để lại cache Studio/task/notifications của B (dữ liệu sức khỏe), trong khi `['alerts']` lại xoá **toàn bộ** alert list/detail của mọi subject (mất UI A). Không có test nào kiểm cross-cache; đây là rủi ro quyền/dữ liệu, không chỉ presentation.
- **Đề xuất:** F công bố registry query key có `subjectId` + hàm `purgeSubjectData(subjectId)`; C/A/R đưa key alerts list/detail, Studio, tasks vào registry; notifications account-wide chỉ purge item của subject hoặc invalidate; acceptance “revoke B khi form A đang mở: form A còn, cache B mất” + test `useSubjectEvents`; không purge toàn app.

## 4. Cổng kiểm W1 có đo được không

### 4.1. Bảng đối chiếu từng mục `w1-foundation.md` §Cổng kiểm

| Mục W1 | Có lệnh/tiêu chí rõ? | Thiếu hoặc không đo được | Đề xuất |
| --- | --- | --- | --- |
| Typecheck (`:43`) | Có script `typecheck` trong `apps/web/package.json`; lệnh đúng package | Không yêu cầu ghi exit code/version; “thành công” không kèm output | Ghi lệnh + exit code + Node/pnpm; chạy trước test. |
| Unit test (`:44`) | Có tên file; các file tồn tại (đã liệt kê `find`) | Không có đường dẫn/command; không nói chạy tuần tự; thiếu `AssistantPage`/`SubjectsPage`/primitive tests; test C-owned có thể đỏ vì R4 | Dùng `pnpm --filter @annhien/web exec vitest run <file...>` với flag tuần tự đúng Vitest 5.1.0 (`--no-file-parallelism --maxWorkers=1`), ghi exit code; thêm `AssistantPage.test` vào diện kiểm hoặc chốt ownership patch. |
| Build (`:45`) | Có script `build` | Build không chứng minh graph CSS không double/không import legacy; không kiểm font/Newsreader | Thêm kiểm asset/import graph + ledger; gate “không còn import legacy” chỉ mở khi chọn phương án R1. |
| Dev server 4350 + login (`:46`) | Có port; có ngoại lệ login | **Không chạy được** với API mặc định: `env.ts:11` `WEB_ORIGIN=http://localhost:5173`; `origin-check.middleware.ts:19-22` trả 403 khi Origin khác; v6 §3 đã gặp đúng lỗi ở 4346 | Pin `WEB_ORIGIN=http://127.0.0.1:4350` cho process API (hoặc chạy web 5173/localhost), ghi env/URL; thêm precondition “login UI thành công, không bypass Origin”; không dùng HTTP cài cookie thủ công làm bằng chứng UI. |
| Ảnh `/`, `/login`, `/app`, `/app/alerts`, `/app/subjects`, `/app/admin` | Có danh sách route/viewport | **Ghi ra `C:/tmp` ngoài workspace** (C2); thiếu DB seed/admin (`.data` không có trong worktree); thiếu 360×740 chữ lớn và 200% zoom (plan §6.2); thiếu `/app/overview`, `/app/history`, `/app/devices` — 3 trong 5 trang có context shell; không có tiêu chí active nav/đúng một context | Dùng `reports/qa/evidence/v7-foundation/`; nêu DB PGlite cục bộ được seed thế nào (không DB chia sẻ) + tài khoản admin; ma trận đủ theo plan §6.2; thêm assertion active nav/một context. |
| `scrollWidth <= clientWidth`, CTA trong viewport, target ≥44 (`:46`) | Có phép đo sơ bộ | “Target chính” hẹp hơn design `:71` (`sm` cũng ≥44) và v6 F02 (link brand/auth 20-28px, `reports/qa/v6-review.md:25-32`); không có công thức bbox như plan §6.3 (`:187-201`); không đo contrast/focus/reduced-motion như plan §6.4 (`:203-211`) | Dùng đúng công thức plan §6.3 (`bottom <= bottomNav.top - 8`, `getBoundingClientRect`), đo cả `sm`, brand/header, auth switch, select; đo computed contrast/focus ring/disabled/nav; kiểm reduced-motion; ghi DPR. |
| `grep "An Nhiên"` (`:47`) | Có lệnh; scope web | Không kiểm “nền kem/serif Newsreader” (design §1/§2; `tokens.css:41`, `fonts.css:89-104`), không kiểm `#faf6ed`; “0 ngoài test âm bản” là lọc tay, không phải exit code; brand còn trong prompt API (`apps/api/src/assistant/assistant.service.ts:127,141`) — ngoài scope web | Thêm `grep -rn "Newsreader\|#faf6ed\|--font-display"` với kỳ vọng cụ thể; ghi rõ pipeline lọc test; quyết định riêng cho prompt API (không sửa UI để che). |
| Menu tài khoản bàn phím (`:46`) | Có yêu cầu mở/đóng | Không có tiêu chí Escape/outside/focus return/arrow/`aria-expanded` (dù W1 việc 4 có nêu); menu hiện chứa `TextSizeToggle` là button `aria-pressed` trong `role=menu` (`AppShell.tsx` + `TextSizeToggle.tsx:5-19`), chưa chốt APG | Ghi rõ 4 tiêu chí + role/menuitem cho toggle hoặc chuyển thành disclosure; kiểm bằng bàn phím thật trên Chromium, không chỉ jsdom. |

### 4.2. Các finding đo lường bổ sung

- **G1 — P1 — Cổng 4350 không chạy được với origin mặc định.** Bằng chứng: `w1-foundation.md:46`; `apps/api/src/config/env.ts:11`; `apps/api/src/common/origin-check.middleware.ts:19-22`; `apps/web/vite.config.ts` proxy `/api` → `localhost:3000`; `reports/qa/v6-review.md` §3 mục 2 ghi đúng 403 origin ở cổng 4346. **Đề xuất:** pin `WEB_ORIGIN` cho API process hoặc dùng 5173/localhost; ghi vào handoff; không bypass origin.
- **G2 — P2 — Thiếu điều kiện DB/admin cho ảnh `/app`.** Bằng chứng: `w1-foundation.md:46` nói API “chỉ đọc”, nhưng ảnh `/app`/`/app/admin` cần phiên; README `:34-41` yêu cầu `pnpm seed`; worktree hiện không có `apps/api/.data` (đã kiểm `ls`). **Đề xuất:** cho phép seed PGlite **cục bộ trong worktree** và ghi rõ, hoặc cấp DB đã seed; dùng tài khoản admin demo; không seed DB chia sẻ.
- **G3 — P2 — Ma trận ảnh W1 hẹp hơn plan.** Bằng chứng: W1 `:46` chỉ 1280/390/360 + 390 large; plan §6.2 `:178-186` yêu cầu mỗi viewport cỡ thường **và** chữ lớn + zoom 200%, mọi nhóm route; W1 thiếu 360 large, overview/history/devices/share/settings/studio/invite/404. **Đề xuất:** lập bảng matrix W1 tối thiểu: 5 trang context + admin/studio/invite/404; ghi DPR/state.
- **G4 — P2 — “Target chính ≥44” hẹp hơn contract design và v6 F02.** Bằng chứng: design `:71` yêu cầu `sm` cũng ≥44 và link hành động độc lập ≥44×44; `styles/layout.css:89-90` đang đặt `.button--sm` min-height `2.5rem` (40px); v6 F02 đo link phụ 20-28px (`reports/qa/v6-review.md:25-32`); W1 `:46` chỉ yêu cầu “target chính ≥44px”. **Đề xuất:** đo mọi action đứng riêng (CTA, `sm`, brand/header, auth switch, select, disclosure) bằng bbox ≥44×44; ghi locator/state; không chỉ đo CTA.
- **G5 — P2 — Thiếu kiểm active nav cho History/Devices/alias và “đúng một context”.** Bằng chứng: design `:92-96` xếp **Lịch sử** vào nhóm Sức khỏe, **Thiết bị** vào nhóm Người thân, alias `/app/assistant` là Hôm nay; `AppShell.tsx:531-556` dùng `NavLink` exact path (`/app` có `end`, `/app/overview`, `/app/subjects`), nên history/devices/alias không có active; W1 `:35` chỉ nói “active nav theo route”; không có test. Tasks/settings/admin/Studio không thuộc primary nav nên không cần active. **Đề xuất:** thêm assertion `aria-current`/active cho history, devices, alias, alert detail (Cảnh báo), share (Người thân), và đếm context line = 1 trên 5 trang; ghi rõ tasks/settings/admin/Studio không active.
- **G6 — P2 — Thiếu kiểm token/contrast/serif/cream.** Bằng chứng: design `:46` (contrast token), plan §6.4 `:203-211` (đo computed), plan `:65` (không Newsreader request), W1 `:46-47` chỉ scroll/target/brand grep. **Đề xuất:** đo computed cho text/action/nav/disabled/error/focus; kiểm focus ring; kiểm không request Newsreader/không nền `#faf6ed` ở `/` và `/app`; kiểm reduced-motion.
- **G7 — P3 — Test command/serial chưa chốt.** Bằng chứng: W1 `:44`; plan §7 `:233` nói đọc `vitest --help` 5.1.0 và chạy tuần tự; repo AGENTS yêu cầu test tuần tự mặc định. **Đề xuất:** ghi lệnh cụ thể + exit code từng file, không dựa vào `pnpm test` mặc định (parallel) cho bằng chứng lane.
- **G8 — P3 — Badge `20+` chưa được W1 yêu cầu.** Bằng chứng: design `:103` yêu cầu ghi rõ khi count có cursor `20+`; `AppShell.tsx:60, 504-505` chỉ lấy `items.length` và label `${n} cảnh báo đang mở`; `IncidentList.nextCursor` có trong contract `packages/contracts/src/incidents.ts:126`. **Đề xuất:** W1 item 4 ghi rõ badge dùng `nextCursor` để hiện `20+`, không trộn unread; thêm test.

## 5. Việc phải chốt trước khi mở W2 (theo thứ tự)

1. **Sửa hợp đồng cổng W1 và gửi ngay cho worker F** (vì W1 đang chạy): origin/`WEB_ORIGIN` (G1), DB seed/admin (G2), ảnh trong `reports/qa/evidence/v7-foundation/` (C2), ma trận 360 large/200% + 5 trang context + admin/studio/invite/404 (G3), target gồm `sm`/brand/auth/select (G4), contrast/serif/cream (G6), active nav/một context (G5). Không bypass Origin.
2. **Chốt mô hình CSS F1** (R1): chọn (A) tách toàn bộ block như plan §2.2 hoặc (B) thu hẹp F1 + ledger + `layout.css` do F sở hữu với hàng đợi patch; chuyển gate “không double CSS” tới W3 nếu chọn B. Kèm ledger selector (R10).
3. **Đóng băng interface dùng chung** (R2): bảng module F1 (auth/useAuth, dashboard/api, notifications/api, alerts/labels, contacts/phone + hook, subjects/selection + useSubjects, queryKeys, test/utils) và quy tắc chỉ-thêm; chuyển label/phone/shared state sang `src/lib` nếu cần. Công bố thêm `Notice/Status/ConfirmInline` (R8).
4. **Chốt sequence context shell vs page** (R4): thời điểm F bật shell context, ai sửa `AssistantPage`/test C, DOM order trước/sau H1, accessible name `Người được theo dõi`; thêm assertion “một context” vào gate.
5. **Chốt registry cache + purge khi revoke** (R12): F công bố key có subject + `purgeSubjectData`; C/A/R đưa alerts list/detail, Studio, tasks vào; test revoke B khi A mở; không purge `['alerts']` toàn bộ.
6. **Chốt inbox/legacy/banner** (C4, R5, R6): bắt buộc `?view=notifications`; banner mở `/app/alerts/{incidentId}`; chỉ suppress đúng incident/inbox; thêm mục banner shell (mất quyền/mất SSE/thông báo mới) với priority/copy/role.
7. **Chốt Studio entry và ngoại lệ admin-only nav** (C1, C3): một quyết định bằng văn bản cho đường vào Studio (không thêm mục thứ năm/không menu người dùng) và câu chữ W1 về 4 mục + ngoại lệ admin không hồ sơ; ghi vào spec trước dispatch W2.
8. **Chốt các contract route còn mở trước lane R/A**: tách archive/deletion sang `subjects/api.ts` + test payload (R3); URL canonical admin policy/audit (R9); nhãn nguồn History + Studio data (R7); badge `20+` (G8).

## 6. Bằng chứng đã đối chiếu và phần không kiểm

- Đã đọc source: `apps/web/src/app/{router,AppShell,ProtectedRoute}.tsx` + tests; các feature `assistant/alerts/notifications/subjects/share/contacts/devices/tasks/settings/admin/studio/dashboard/history/insights` (file page/api/test liên quan); `apps/web/src/lib/{api,query}.ts`; `styles/{tokens,fonts,layout}.css`; `index.html`; `packages/contracts/{notifications,incidents,admin,measurements}`; `apps/api/src/config/env.ts`, `common/origin-check.middleware.ts`; `docs/06`; `reports/qa/v6-review.md`.
- Đã kiểm: route list khớp `router.tsx:73-105`; notifications page có mark-read nhưng không mount (`router.tsx:92`, `NotificationsPage.tsx:29-57`); tasks không có link trong source (grep `/app/tasks` chỉ thấy comment `TasksPage.tsx:78`); Studio chỉ có link nội bộ/test; archive/deletion inline (`SubjectsPage.tsx:48-60`); share GET trước owner guard (`SharePage.tsx:83-95` vs `:199`); devices chưa gate owner (`DevicesPage.tsx:116, 177-192`); dashboard chưa gate permission (`DashboardPage.tsx:90-111`); revoke chỉ xoá subjects/alerts (`useSubjectEvents.ts:77-84`).
- **Không kiểm:** không chạy typecheck/unit/build/E2E/browser; không đăng nhập hay gọi API; không xác minh pixel/contrast/overflow; không kiểm runtime 422/404 invite, SSE, CAS; không kiểm model `dola/gpt-6.1-sol` vì phiên này chạy `moxuna/deepseek-v4.1-flash`. Các kết luận “thiếu/chưa đo” không phải kết luận sản phẩm lỗi runtime, chỉ là thiếu bằng chứng tại thời điểm review.
