# Review frontend độc lập — An Nhiên web (2026-11-14)

**Người thực hiện:** reviewer frontend độc lập (không phải worker, chỉ đọc + chạy kiểm, không sửa code/git/docs).
**Phạm vi:** `apps/web`, `packages/contracts`, đối chiếu `docs/06`, `docs/11`, `docs/12`, `docs/14`; kiểm thật trên API `http://localhost:3000` và web dev `http://localhost:5173` (cả hai đang chạy, health 200).
**Nguyên tắc:** không tin kết quả trong handoff; mọi kết luận dưới đây đều từ lệnh/output tôi tự chạy trong phiên này (kịch bản Playwright tự viết, lưu ngoài repo ở `%TEMP%\annhien-qa\*.cjs`, không đụng vào `apps/web/e2e`).

## 1. Kết quả chạy toolchain (output thật)

| Lệnh | Kết quả |
| --- | --- |
| `cd apps/web && pnpm typecheck` | **PASS** — exit 0, không có lỗi (tsc -p tsconfig.json --noEmit) |
| `cd apps/web && pnpm test` | **PASS** — 19 files / 72 tests, 7.32s (Vitest 5.1.0, jsdom) |
| `cd apps/web && pnpm build` | **PASS** — build OK, nhưng cảnh báo chunk `index-CxXD8uLB.js 613.93 kB` (> 500 kB). Đã biết, docs/14 ghi "code-split chưa làm" |

Bộ `pnpm test:e2e` của repo (2 spec) **không chạy lại trong phiên này**; thay vào đó tôi tự viết 6 kịch bản Playwright (chromium thật, chạy trên server đang chạy) — xem phụ lục A.

## 2. Tổng hợp findings

**P0: 0. P1: 0 (đã xác nhận). P2: 5. Vấn đề mở chưa kết luận: 1.**

### P2-1. Trang chia sẻ hiện form mời cho người không phải chủ hồ sơ (backend vẫn chặn)
- **Vị trí:** `apps/web/src/features/share/SharePage.tsx:154-260` (section "Mời người thân" + form invite render vô điều kiện, không kiểm tra `role === 'owner'` trước khi render). Nút liên kết tới trang này đã ẩn đúng cho caregiver (`SubjectsPage.tsx:131` chỉ hiện khi owner) — nhưng truy cập thẳng URL thì form hiện đầy đủ.
- **Bằng chứng:** đăng nhập `minh@demo.annhien.local`, mở `http://localhost:5173/app/subjects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/share` → field "Email người được mời" + nút "Tạo lời mời" hiển thị, KHÔNG có thông báo "không phải chủ hồ sơ". Submit hợp lệ → API trả `403 {"code":"FORBIDDEN","message":"Chỉ chủ hồ sơ được quản lý chia sẻ."}`. Các danh sách (lời mời/care-links) có hiện ErrorState với message 403, nhưng form vẫn dùng được trông như hợp lệ.
- **Hệ quả:** người thân bị gây hiểu nhầm có thể mời người khác; vi phạm nguyên tắc docs/11 "ẩn nút không thay kiểm quyền backend" ở chiều ngược lại (backend an toàn, UI không phản ánh quyền).
- **Đề xuất:** nếu không phải owner → render trạng thái "Chỉ chủ hồ sơ quản lý chia sẻ" (giống màn hình mất quyền), không render form.

### P2-2. Admin tabs dùng `role="tab"` nhưng không theo mẫu ARIA APG
- **Vị trí:** `apps/web/src/features/admin/AdminPage.tsx:765-772` — `<div role="tablist">` chứa các `<Button role="tab" aria-selected>`; không có `aria-controls`/`tabpanel`, không điều hướng phím mũi tên, không `roving tabindex`.
- **Bằng chứng:** DOM thật khi mở `/app/admin`; các nút vẫn là `<button>` nên `getByRole('button')` không khớp còn `getByRole('tab')` khớp — trình đọc màn hình hiểu đây là tab nhưng bàn phím không hoạt động theo chuẩn tab.
- **Đề xuất:** hoặc thêm aria-controls/tabpanel + phím mũi tên, hoặc bỏ `role="tab"` và dùng nút + `aria-pressed` như các màn hình khác.

### P2-3. `HistoryPage` chốt mốc "now" bằng `useMemo(..., [rangeKey])`
- **Vị trí:** `apps/web/src/features/history/HistoryPage.tsx:54`.
- **Hệ quả:** mốc thời gian chỉ được tính lại khi đổi khoảng (24h/7d/30d). Để trang mở nhiều giờ (đặc biệt qua nửa đêm) thì khoảng 24h bị cũ, khác với `todayInTimeZone` của dashboard được tính mỗi render. Không gây sai số liệu API nhưng lệch UX khoảng thời gian.
- **Đề xuất:** tính `now` khi query khởi chạy (ví dụ trong `queryFn` hoặc dùng `Date.now()` trực tiếp kèm `useMemo` deps hợp lý) — hoặc chấp nhận có chủ đích và ghi chú.

### P2-4. Bundle chính 613.93 kB (> 500 kB), chưa code-split
- **Bằng chứng:** `pnpm build` — `dist/assets/index-CxXD8uLB.js 613.93 kB │ gzip: 177.22 kB`, cảnh báo rolldown. Đã được ghi nhận trong docs/14 ("bundle web còn cảnh báo >500 kB"). Giữ là P2 đã biết, không phát hiện mới.

### P2-5. Nút "Sao chép đường dẫn" im lặng thất bại khi clipboard không khả dụng
- **Vị trí:** `apps/web/src/features/share/SharePage.tsx:137-146` — nếu `navigator.clipboard?.writeText` thiếu hoặc reject, chỉ `setCopied(false)`, người dùng không biết phải tự bôi đen/coppy tay trong khi đường dẫn "chỉ hiển thị một lần".
- **Đề xuất:** hiện thông báo "Không sao chép được — hãy bôi đen và sao chép thủ công" khi lỗi.

### Vấn đề mở (chưa kết luận được trong phiên) — GET `/invitations/:token` trả 404 nhất thời
- **Hiện tượng:** trong kịch bản tạo lời mời qua UI rồi mở URL mời ở context trình duyệt mới, 3 lần reload đều nhận `HTTP 404` từ `GET /api/v1/invitations/<token>` (trang hiện "Lời mời không hợp lệ"). Cùng token đó, `curl` trực tiếp và qua Vite proxy **đều 200** ngay lập tức; vài phút sau, chính trình duyệt cũng nhận 200 với cùng URL/header. API trả danh sách lời mời vẫn `pending`.
- **Bằng chứng đã thu:** log `[new ctx] HTTP 404 http://localhost:5173/api/v1/invitations/XIG95...` (3 lần liên tiếp) vs `curl → 200` cùng thời điểm; `debug-invite5` (chạy sau) → 200. Không thấy header nào khác biệt gây ảnh hưởng (đã thử giả lập header browser bằng curl → vẫn 200).
- **Ảnh hưởng:** luồng "mời → chấp nhận" qua trình duyệt có thể thất bại thoáng qua; chưa đủ bằng chứng kết luận thuộc frontend hay backend/môi trường. **Cần điều tra tiếp** (gợi ý: log requestId của response 404 để xác định process, kiểm tra khi có 2 API process/PGlite).
- **Hệ quả kiểm chứng:** vì lỗi này, phần cuối luồng thu hồi quyền qua SSE (mục 4.3) **chưa chạy được đến bước revoke**; xem phần "chưa kiểm".

## 3. Kiểm thử Playwright đã chạy (output tóm tắt thật)

### 3.1. Auth & điều hướng — PASS
- Sai mật khẩu → alert "Không đăng nhập được — Email hoặc mật khẩu không đúng".
- Vào `/app/alerts` khi chưa đăng nhập → redirect `http://localhost:5173/login?next=%2Fapp%2Falerts` (401 toàn cục hoạt động, `lib/query.ts` + `ProtectedRoute.tsx`).
- Đăng nhập owner → `/app`; logout → về `/`.
- Open redirect: `useSafeNext` (`lib/next.ts`) chỉ nhận path bắt đầu `/`, chặn `//` — đọc code xác nhận + đã chạy qua redirect thật.

### 3.2. Owner: dashboard/history/CSV/devices/notifications/assistant/tasks/studio/subjects — 32/33 PASS (1 FAIL do trạng thái dữ liệu, đã kiểm bù)
- Dashboard: tên hồ sơ, pill "Bản demo · dữ liệu mô phỏng", trạng thái thiết bị "Trực tuyến" + "lần nhận cuối X phút trước", pin `86%`, cảnh báo mở + "chưa có người xác nhận", chữ "cần chú ý" kèm ⚠ (màu không phải tín hiệu duy nhất), khối "Giới hạn của bản demo". Không thấy số 0 giả (pin/hR null đều có nhãn "chưa có...").
- History: bảng dữ liệu có dòng; SVG chart có `role="img"` + aria-label; bảng có caption "thay thế cho biểu đồ"; tải CSV thật qua sự kiện download → header `measured_at,received_at,heart_rate_bpm,...` (có BOM UTF-8 — tốt cho Excel); nhãn "dữ liệu mô phỏng".
- Devices: serial `AN-2026-001`, freshness bằng chữ, claim code rỗng → "Vui lòng nhập mã gắn thiết bị." (validation zod + aria).
- Notifications: đánh dấu đã đọc — số unread giảm đúng 1 (7→6), page-lead "Bạn có 6 thông báo chưa đọc." (kiểm lại bằng `debug-notif.cjs`).
- Assistant: badge "Tóm tắt theo mẫu" (degraded/template), disclaimer, hỏi đáp trả lời fallback rõ ràng "Trợ lý AI hiện chưa sẵn sàng...".
- Tasks: task mở hiển thị; đóng với lý do rỗng → "Vui lòng nhập lý do đóng công việc."
- Studio: tạo view mới qua UI → trang soạn draft + preview có nhãn "Dữ liệu mẫu". (Dữ liệu demo đã bị thay đổi: tạo view `to-quan-review` — ghi nhận.)
- Subjects: danh sách + validation form tạo.
- **360×740:** dashboard overflow = 0px, bottom nav hiển thị; history overflow = 0px (bảng cuộn trong vùng riêng). Ảnh: `owner-360px.png`.
- **Chế độ chữ lớn:** bật → `html[data-text-size="large"]`, font-size 20px (từ 17px); nút có `aria-pressed`.

### 3.3. Alerts: ack / 409 / resolve — 12/12 PASS
- Simulator tạo fall confirmed (2 request accepted, HTTP 202) → 1 cảnh báo mở trong danh sách.
- Ack thành công → trạng thái "Đã xác nhận".
- **409:** tab thứ hai giữ bản cũ bấm "Xác nhận" → alert "Cảnh báo đã thay đổi ở nơi khác... hãy tải lại" + nút "Tải lại danh sách"; tải lại → thấy trạng thái mới. API xác nhận `POST /alerts/:id/acknowledge` với `expectedVersion` cũ → `409 CONFLICT` kèm `details.currentVersion`.
- Chi tiết: timeline sự kiện thiết bị, "đã xác nhận đang hỗ trợ", danh sách người nhận chỉ tên + quyền (không email).
- Resolve: lý do rỗng → validation; đóng thành công → "Cảnh báo đã kết thúc" + kết quả; filter "Đã đóng" hiện cảnh báo kèm "Kết quả: ...". (Đã đóng 3 cảnh báo demo trong phiên — ghi nhận thay đổi dữ liệu demo.)

### 3.4. SSE live update — 6/7 PASS (1 check tự viết sai, đã xác minh lại đạt)
- Request `GET /subjects/:id/events` mở thật khi vào trang alerts.
- Đang ở danh sách alerts (0 dòng), chạy `tools/simulator` `fall --mode sos` (1 request accepted) → **danh sách tự thêm dòng mới không cần reload** (0 → 1), hiển thị "Yêu cầu trợ giúp"; hộp thư có thông báo mới chưa đọc; mở chi tiết cảnh báo mới có timeline.
- Check "đánh dấu đã đọc" ban đầu tưởng FAIL do còn nhiều mục unread khác — kiểm lại đúng cách: giảm đúng 1.

### 3.5. Caregiver + admin — 17/18 PASS (1 FAIL = P2-1 đã ghi)
- Caregiver `minh`: xem dashboard hồ sơ chia sẻ; menu "Thêm" có Trợ lý + Công việc + Studio (đúng: minh là chủ hồ sơ riêng `bbbbbbbb...`), không có Quản trị; history nêu "xem tối đa 30 ngày", nút 30 ngày không khóa; alert detail **không có nút "Đóng cảnh báo"** và nêu rõ "Bạn không có quyền đóng cảnh báo" (seed `canResolve=false`); xem được tóm tắt AI (`canViewAi=true`); trang chia sẻ hồ sơ của chủ khác → **FAIL (P2-1)**.
- Admin: nav chỉ có Quản trị (không có trang sức khỏe); `/app/history` → "Chưa có hồ sơ" (không lộ dữ liệu sức khỏe); tổng quan số liệu; danh sách người dùng + email (quyền admin, hợp lệ); policy `device_runtime` v1 — sửa giá trị + "Xem trước" → "Giá trị hợp lệ. Preview không ghi gì vào hệ thống." + diff `heartbeatIntervalSeconds` (đã test preview, không publish); audit hiển thị bản ghi có outcome bằng chữ.

### 3.6. Luồng mời/chấp nhận/thu hồi — chạy được đến "tạo lời mời", kẹt ở vấn đề mở
- Tạo lời mời qua UI: hiện `acceptUrl` + token **đúng một lần**; sau reload token không hiển thị lại; lời mời pending trong danh sách với trạng thái chữ "Đang chờ chấp nhận".
- Trang công khai `/invite/:token` (khi API trả 200): hiện tên người mời + hồ sơ + quyền ("xem lịch sử tối đa 2 ngày · nhận cảnh báo · xác nhận hỗ trợ · không đóng · không xem AI"), **không lộ email người được mời**, không có dữ liệu sức khỏe.
- Bước tiếp theo (đăng ký → chấp nhận → thu hồi qua SSE) bị chặn bởi 404 nhất thời ở mục "Vấn đề mở" — **chưa kiểm xong**.

## 4. Đối chiếu API ↔ zod contracts (script `api-contract.cjs`, 39 phép kiểm)

**38/39 PASS.** Điểm khác biệt duy nhất: `GET /subjects/:id/export.csv?from=x&to=y` với tham số sai trả `422 VALIDATION_FAILED` (tôi kỳ vọng 400) — đây là lựa chọn zod-consistent, frontend xử lý lỗi chung OK, không tính là lỗi.
- Đạt: `/me`, `/subjects`, subject status, daily-summary, measurements, alerts list/detail, notifications, maintenance-tasks, assistant summary, subject devices, invitations, care-links, workspace-views (owner + admin), `/admin/overview`, `/admin/users`, `/admin/audit`, `/admin/policies/device_runtime`, export.csv (200, text/csv), SSE (200, `text/event-stream`, bytes đầu có `id:`/`event: alert.updated`).
- Quyền: caregiver gọi invitations của chủ khác → 403; admin đọc subject health → 404 (không lộ); anon `/me` và alerts → 401; login sai → 401; ack version cũ → 409 `CONFLICT` kèm `currentVersion`.
- Không tìm thấy mismatch field thiếu/thừa nào so với schema zod dùng chung (frontend parse đúng cùng schema).

## 5. Soi code (đã đọc toàn bộ `apps/web/src` + contracts liên quan)

**Không có vấn đề:**
- **XSS:** toàn bộ src không có `dangerouslySetInnerHTML`/`innerHTML`/`eval` (grep xác nhận). Câu trả lời AI render text thuần (`AssistantPage.tsx`), studio không render HTML từ config người dùng.
- **401 toàn cục:** tập trung `lib/query.ts` (QueryCache + MutationCache onError), ngoại lệ `['auth','me']` và trang `/login`, `/register`; redirect giữ `next` an toàn. Đã chạy thật.
- **Open redirect:** `lib/next.ts` chặn `//` và path ngoài; `lib/session.ts` cũng kiểm.
- **Lộ email/token:** trang mời công khai không có email người được mời (đã kiểm); token chỉ hiện 1 lần (đã kiểm reload); danh sách người nhận cảnh báo không có email; email caregiver chỉ hiện cho owner ở trang Share (đúng quyền); không có token/key thiết bị trong UI; không dùng localStorage cho phiên (chỉ lưu subject đang chọn + cỡ chữ).
- **SSE cleanup:** `useSubjectEvents.ts` — đóng stream khi unmount/tab ẩn, mở lại khi hiện, backoff 1s→30s, gửi lại `cursor` (Last-Event-ID), `revoked` → đóng stream + `removeQueries` dữ liệu hồ sơ + điều hướng `/app`; AppShell hiện cảnh báo "Bạn đã mất quyền xem hồ sơ" (đã xác minh hiển thị logic qua code; phần chạy thật bị chặn bởi vấn đề mở).
- **Query key/invalidation:** tập trung `lib/query.ts`; SSE invalidate theo prefix `['subjects', id, 'alerts']` phủ cả danh sách open/closed + dashboard; ack/resolve/resolve dùng `setQueryData` + invalidate đúng scope; logout xóa toàn bộ cache.
- **Form validation:** dùng đúng zod schema của contracts, lỗi theo trường có `aria-describedby` + `role="alert"`; min/max đọc từ issue thay vì hard-code (đúng docs/12).
- **Hiển thị ngày/giờ/null:** `Intl.DateTimeFormat('vi-VN')` theo giờ địa phương; `measuredAt=null` → "Không rõ giờ đo" + pill "Đồng hồ chưa đồng bộ"; pin/HR null → "chưa có..."; `formatRelativeTime` trả null không bịa số.
- **Nhãn dữ liệu mô phỏng:** sidebar "Bản demo · dữ liệu mô phỏng"; dashboard "Nguồn: dữ liệu mô phỏng"; studio "Dữ liệu mẫu"; assistant badge "Tóm tắt theo mẫu"; disclaimer y tế ở dashboard/assistant/history.
- **A11y cơ bản:** SkipLink đầu trang; `:focus-visible` outline 3px; label thật gắn input (`htmlFor`); bảng có `<caption>` + `th scope`; chart có bảng thay thế + aria-label; màu luôn kèm chữ (StatusPill, "cần chú ý" + ⚠); `aria-pressed` ở segmented/toggle; `prefers-reduced-motion` được tôn trọng.
- **Concurrency:** ack/resolve/policy/studio đều gửi `expectedVersion`/baseRevision và xử lý 409 có nút tải lại, không tự ghi đè (đã chạy thật ở alerts + policy preview).

## 6. Ghi chú môi trường & thay đổi dữ liệu demo trong phiên
- DB demo bị **seed lại từ bên ngoài lúc 17:15:56Z** (createdAt của users thay đổi, session cũ hết hạn) — không phải do code (API không có auto-seed/cron); các kết luận đã chạy lại sau đó.
- Các thay đổi dữ liệu do kiểm thử của tôi (chấp nhận được với DB demo): đóng 3 cảnh báo (có lý do "Kiểm thử review"), đánh dấu đọc vài thông báo, tạo view studio `to-quan-review`, tạo ~6 lời mời pending (email `rev-*@*.example.com`, token không ai dùng). Không thay đổi policy, không release device, không khóa user, không publish view.

## 7. Chưa kiểm / giới hạn
- Luồng **thu hồi quyền qua SSE** chưa chạy hết (kẹt ở 404 nhất thời của trang mời — mục "Vấn đề mở"). Code path đã đọc kỹ nhưng chưa có bằng chứng thực thi.
- `pnpm test:e2e` của repo không chạy lại (dùng kịch bản riêng); trace/ảnh chụp nằm ở `%TEMP%\annhien-qa\*.png`.
- Không kiểm Safari/Firefox, chỉ chromium; không kiểm 320px, chỉ 360px; không đo contrast màu bằng công cụ (chỉ rà quy ước); không kiểm CSRF/rate-limit chi tiết (thuộc backend, đã có review backend riêng).

## 8. Kết luận
- **Không có P0/P1.** Web hoạt động đúng hợp đồng ở mọi luồng đã chạy: auth/401 toàn cục, dashboard, history/CSV, alerts ack+409+resolve, SSE cập nhật thật từ simulator, quyền caregiver/admin, studio draft/preview, chữ lớn, 360px.
- **5 finding P2** (chủ yếu UX/a11y) và **1 vấn đề mở cần điều tra** (404 nhất thời trang lời mời) — chưa đủ bằng chứng để kết luận nghiêm trọng.
- Các điểm trọng yếu trong yêu cầu (quyền hiển thị, nhãn dữ liệu mô phỏng, không số 0 giả, 409, XSS, token một lần, bảng thay thế chart) **đều có bằng chứng thực thi trong phiên này** — không dựa vào handoff.
- Không kết luận "đạt hoàn toàn" vì còn P2 + vấn đề mở; khi fix xong P2-1, P2-2, P2-3 và làm rõ vấn đề mở thì nên chạy lại các kịch bản ở phụ lục A.

## Phụ lục A — Kịch bản đã chạy (lưu ở `%TEMP%\annhien-qa\`)
| File | Nội dung | Kết quả |
| --- | --- | --- |
| `api-contract.cjs` | 39 phép kiểm API vs zod | 38/39 (1 khác biệt 422 đã giải thích) |
| `ui-owner.cjs` | auth/dashboard/history/CSV/devices/notifications/assistant/tasks/studio/subjects/360px/chữ lớn/logout | 32/33 |
| `ui-alerts.cjs` | ack + 409 hai tab + resolve + filter | 12/12 |
| `ui-sse.cjs` | SSE live update bằng simulator (sos) + notification | 6/7 (check sai tự sửa, thực tế đạt) |
| `ui-caregiver-admin.cjs` | quyền caregiver + admin (overview/users/policy preview/audit) | 17/18 (1 = P2-1) |
| `ui-share.cjs` | mời → (kẹt 404) → chưa tới accept/revoke | chạy dở, ghi ở mục 3.6 |
