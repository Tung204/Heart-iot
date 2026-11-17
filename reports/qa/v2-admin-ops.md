# Review độc lập hành trình quản trị — An Nhiên v1.1

**HEAD:** `8434d66cb8ecb3d92a9a054f87f843d16dbaa3e7` — `perf(web): tách chunk theo route và thống nhất quyền xem cảnh báo` (2026-11-15).
**Ngày kiểm:** 2026-11-15 (Asia/Ho_Chi_Minh).
**Người thực hiện:** reviewer độc lập; chỉ đọc, chạy kiểm và tạo báo cáo này. Không sửa code/docs, không commit, không ghi vào DB/API/web của lead (chỉ gọi health/root để xác nhận môi trường trước khi dựng stack riêng).
**Môi trường:** Windows; Node `v24.22.2`; pnpm `12.5.1`; PGlite `0.5.16`; Chromium Playwright `1.65.1`; API riêng `http://localhost:3203/api/v1`, web riêng `http://localhost:5187`, DB `PGLITE_DATA_DIR=.data/review-admin`. Seed tổng hợp: 3 user, 2 hồ sơ, 1 thiết bị, 1.681 telemetry, 3 incident, 2 task. Không đụng `.data/pglite`, API `3000` hay web `5173` của lead.
**Quan hệ với review cũ:** báo cáo này không đóng, không xác nhận lại và không sửa các finding trong `reports/qa/review-backend-2026-11-14.md` / `review-frontend-2026-11-14.md`.

## 1. Tóm tắt điều hành

**P0: 0. P1: 3. P2: 6. Chưa kết luận: 3 điểm cần chốt chính sách (mục 4).**

Ba vấn đề P1:

1. **SSE vẫn gửi dữ liệu cảnh báo sau khi admin khóa tài khoản** — phiên HTTP bị 401 ngay nhưng stream đang mở vẫn nhận `alert.updated`/`notification.sent` đến 5 phút.
2. **Web admin không có màn hình quản lý thiết bị/rotate key** — API `admin/devices` có và chạy được, nhưng UI chỉ có 4 tab Tổng quan/Người dùng/Chính sách/Audit. Không đáp ứng hành trình “device admin/rotate key” và tiêu chí FR-11 “xem tình trạng thiết bị”.
3. **Preview policy không gắn với nội dung được phát hành** — sửa giá trị sau khi preview nhưng preview cũ vẫn hiển thị; bấm Phát hành gửi giá trị mới. Có thể phát hành trực tiếp mà không cần Xem trước.

Các P2 chính: 409 ở user để lại dòng cũ/không reload; lý do khóa user và rotate key không bắt buộc ở backend; sau reload policy 409 vẫn còn lỗi cũ và header phiên bản cũ; bộ lọc actor audit chỉ tải 100 user (với 113 user, cả 3 tài khoản seed bị thiếu); trang Công việc của admin rỗng dù Tổng quan báo 1 task; bảng user trên mobile ẩn cột Hành động.

## 2. Đã kiểm và chưa kiểm

### Đã kiểm (có bằng chứng chạy thật)

Trong bảng dưới, “Đạt” nghĩa là actual khớp tiêu chí tương ứng trong `docs/02`, `docs/06`, `docs/14`; các sai lệch có expected/actual riêng ở mục 3.

| Khu vực | Kết quả |
| --- | --- |
| Đăng nhập admin, nav, quyền vào `/app/admin` | Đạt: đăng nhập bằng tài khoản demo; admin không có hồ sơ chỉ thấy mục Quản trị; caregiver gọi API admin → 403. |
| Tổng quan admin | Đạt về số liệu: users 3, subjects 2, devices 1 online/1 offline (thiết bị test chưa từng online), alerts open 1, tasks open 1. |
| Users: danh sách dài, tìm kiếm, empty, lỗi mạng | Đạt: 113 user, 20 dòng/trang, 5 lần “Tải thêm” → 113 email unique; tìm `minh@demo` → 1 dòng; từ khóa không tồn tại → EmptyState; abort request → ErrorState “Không kết nối được máy chủ” + nút Thử lại. |
| Users: khóa/mở, phiên cũ | Đạt một phần: khóa có xác nhận 2 bước + lý do; `/me` của caregiver → 401, login lại → 403, browser chuyển `/login?next=%2Fapp`; mở khóa lại được. **SSE là ngoại lệ P1-1.** |
| Users: 409 | Có xử lý nhưng UX sai: tab thứ hai gửi trạng thái cũ nhận 409 “Trạng thái tài khoản không thay đổi”, dòng vẫn hiện “Hoạt động” và form xác nhận vẫn mở, không có nút/đề nghị tải lại (P2-1). |
| Policy: get, preview, warning, diff, không ghi DB | Đạt: preview 3 cảnh báo + diff đúng; lịch sử vẫn v3 sau preview. |
| Policy: publish, 409, reload | **Không đạt đầy đủ**: publish trực tiếp không cần preview; preview cũ không bị vô hiệu khi sửa; sau 409 + reload còn alert lỗi cũ và header vẫn phiên bản cũ (P1-3, P2-3). |
| Audit: danh sách, phân trang, filter | Một phần: 149 bản ghi unique, 20 dòng/trang, tải thêm 40 dòng; filter action đúng nếu nhập chính xác; filter actor thiếu user (P2-4). |
| Audit: không lộ payload sức khỏe/token | Đạt: quét 140 bản ghi tại thời điểm kiểm, không thấy invitation token, device key, password, `heart_rate`/`bpm`, prompt/câu hỏi; metadata chỉ còn các khóa `digest, expiresInHours, from, key, note, outcome, periodEnd, periodStart, provider, reason, rowCount, serial, status, subjectId, to, version`. |
| Admin không đọc dữ liệu sức khỏe nếu không care link | Đạt ở REST: `/subjects` → `{"items":[]}`; measurements/alerts/export/daily-summary/assistant của subject An → 404; caregiver gọi admin API → 403. |
| Task: owner đóng task | Đạt: xác nhận 2 bước + lý do bắt buộc; đóng thành công, task biến khỏi danh sách mở. |
| Task: admin | Không đạt: Tổng quan báo “Công việc đang mở 1” nhưng `/app/tasks` báo “Không có công việc đang mở”; admin-only nav không có mục Công việc (P2-5). |
| Thiết bị: API admin | Đạt: tạo `REV-ADMIN-001`, nhận key/claim code một lần; list; rotate key → old key 401, new key 202; audit `device.rotate_key` metadata `{}`. |
| Thiết bị: UI admin | Không có: `rg "admin/devices|rotate-key|issueClaimCode|createDevice" apps/web/src` không có client admin; tab admin chỉ 4 mục (P1-2). |
| Mobile 390×844 | Không tràn trang (`scrollWidth=390`), nhưng bảng user rộng 680px trong khung 365px; cột Hành động nằm ngoài màn hình (P2-6). |

### Chưa kiểm / giới hạn

- Chưa chạy PostgreSQL thật, MQTT broker/ACL/ACK, nhiều instance, benchmark SSE/CAS; chỉ PGlite một tiến trình.
- Chưa kiểm Web Push, Safari/Firefox, 320px, đo contrast bằng công cụ; chưa kiểm khả dụng với người cao tuổi.
- Chưa kiểm rotate key qua UI vì UI không tồn tại; chưa kiểm đồng thời hai admin khóa nhau (không tạo được admin thứ hai qua API).
- Chưa kiểm task close 409 đồng thời (chỉ có 1 task mở; đã đóng trong phiên).
- Chưa chạy `pnpm test:e2e` của repo; các kịch bản UI dưới đây là Playwright tự viết, chạy ngoài repo.
- API đã chạy full Jest: **14 suite / 100 test pass**, gồm `admin.spec.ts` 7/7 và `sse.spec.ts` 2/2. Web Vitest: **20 file / 73 test pass**. `pnpm -r typecheck`: pass. Các test này **không** bao phủ khóa tài khoản khi SSE đang mở; `sse.spec.ts` chỉ kiểm thu hồi care link.

## 3. Findings

### P1-1. SSE vẫn gửi cảnh báo sức khỏe sau khi admin khóa tài khoản

- **Vị trí:** `apps/api/src/realtime/realtime.service.ts:57-70` — mỗi vòng poll chỉ gọi `this.access.requireAction(userId, subjectId, 'receive_alerts')`, không kiểm `user.status` hay session còn hiệu lực. `apps/api/src/auth/auth.service.ts:126-142` chỉ kiểm status khi `resolveSession` (request mới). `apps/api/src/admin/admin.service.ts:248-253` revoke session trong transaction khi disable; SSE đã mở không đi qua guard này nữa.
- **Tái hiện:**
  1. Đăng nhập caregiver, mở `GET /api/v1/subjects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/events?cursor=0` (curl `-N`).
  2. Admin `PATCH /api/v1/admin/users/2222.../status` → `{"status":"disabled","reason":"..."}`; sau đó `GET /me` cùng cookie → **401**, login lại → **403**.
  3. Gửi một `fall.confirmed` mới bằng thiết bị demo.
- **Expected:** stream nhận `event: revoked`, đóng; hoặc ít nhất dừng ngay khi user bị khóa (docs/02 NFR-01; docs/03:88 “Thu hồi quyền phải ngắt stream”).
- **Actual:** stream vẫn nhận sự kiện mới sau khi khóa:
  ```
  id: 5
  event: alert.updated
  data: {"state":"open",...,"incidentId":"ac919b2c-cb4e-40f9-862a-426443db8ddb",...}
  id: 6
  event: notification.sent
  ...
  ```
  Không có `event: revoked`. Stream tối đa 5 phút (`SSE_MAX_DURATION_MS`), sau đó reconnect sẽ bị 401.
- **Hệ quả:** tài khoản đã bị khóa vẫn đọc được cảnh báo sức khỏe mới trong tối đa 5 phút; vi phạm NFR-01 và kỳ vọng “phiên cũ bị thu hồi ngay”.
- **Đề xuất:** truyền `sessionId`/token vào stream và kiểm `resolveSession` + status mỗi vòng (hoặc kiểm status user trong `requireAction` cho stream); gửi `revoked` và đóng. Thêm test “admin disable while SSE open” vào `sse.spec.ts`.

### P1-2. Web admin không có quản lý thiết bị/rotate key; FR-11 chỉ đạt mức số đếm

- **Vị trí:** `apps/web/src/features/admin/AdminPage.tsx:793-810` chỉ render 4 tab `overview/users/policy/audit`; `apps/web/src/app/AppShell.tsx:147-155` admin không có hồ sơ chỉ thấy mục “Quản trị”. Không có file/page/client nào gọi `admin/devices` (grep `apps/web/src` không có `admin/devices`, `rotateDeviceKey`, `issueClaimCode`, `createDevice`). API đã có: `apps/api/src/devices/devices.controller.ts:28-70` (`POST/GET /admin/devices`, `POST /:id/claim-code`, `POST /:id/rotate-key`).
- **Expected:** theo `docs/02-yeu-cau-va-pham-vi.md:13,32` (quản trị viên quản lý thiết bị; FR-11 xem tình trạng thiết bị) và `docs/06-trai-nghiem-va-man-hinh.md:20` (Admin: thiết bị online/offline, phiên bản, lỗi ingest/gửi), admin phải xem được danh sách thiết bị và thực hiện được rotate key/claim code trên UI.
- **Actual:** UI chỉ có “Thiết bị trực tuyến/ngoại tuyến” dạng số đếm; không có serial/label/firmware/last seen/assignment, không có rotate key hay cấp claim code. Trang `/app/devices` là trang của chủ hồ sơ (claim/release), không phải admin device admin; admin không có hồ sơ nên trang này chỉ hiện “Chưa có hồ sơ để gắn thiết bị”.
- **Bằng chứng API (để phân biệt lỗi UI với thiếu backend):** tạo thiết bị trả key + claim code một lần; list trả device; rotate trả key mới, key cũ bị 401 khi ingest, key mới được 202; audit `device.rotate_key` không chứa key. Vậy phần thiếu là UI/hành trình, không phải endpoint.
- **Đề xuất:** thêm tab “Thiết bị” trong `AdminPage` (list + filter, firmware/lastSeen/assignment, tạo thiết bị, cấp claim code, rotate key có xác nhận/lý do, chỉ hiện secret một lần), không kèm dữ liệu sức khỏe. Thêm test UI/route.

### P1-3. Preview policy không ràng buộc nội dung phát hành; sửa sau preview vẫn phát hành giá trị mới

- **Vị trí:** `packages/contracts/src/admin.ts:116-123` — body publish chỉ có `value`, `expectedVersion`, `note`, không có digest/preview id. `apps/web/src/features/admin/AdminPage.tsx:514-517` khi đổi field chỉ `setValue`, không xóa `previewResult`; `:530-536` nút Phát hành luôn bật; `:399-407` gửi `value` hiện tại; `:544-575` vẫn render preview cũ.
- **Tái hiện (UI thật):**
  1. Policy active v4, `heartbeatIntervalSeconds=60`. Sửa thành `50`, bấm **Xem trước** → preview hiện `heartbeatIntervalSeconds: 60 → 50`.
  2. Sửa tiếp thành `55`, không bấm Xem trước lại. Preview **vẫn hiện 50** (`previewResult` còn nguyên).
  3. Bấm **Phát hành** → API nhận `55`, tạo **v5**; UI báo “Đã phát hành policy phiên bản 5”.
  - Kịch bản khác: từ v3, bấm **Phát hành** trực tiếp (không Xem trước) → tạo **v4** thành công; không có preview result.
- **Expected:** `docs/11-nen-tang-ai-va-cau-hinh-dong.md:71` (sửa sau duyệt thì bản duyệt cũ hết hiệu lực) và `docs/13-dac-ta-thuc-thi-ai-va-cau-hinh.md:162` (publish đúng nội dung đã duyệt; xung đột phải tạo diff mới + preview lại). Tối thiểu UI phải xóa preview khi sửa và chặn Phát hành nếu chưa preview đúng giá trị hiện tại. Lưu ý: docs/11 và docs/13 tự ghi là đề xuất chưa được duyệt; dù vậy, preview cũ không bị vô hiệu là lỗi UI hiện tại và UI đang tự mô tả quy trình Xem trước → Phát hành.
- **Actual:** preview là “trang trí”; publish dùng giá trị form hiện tại, không có digest/approval ràng buộc. Người vận hành có thể tin mình đang duyệt 50 nhưng thực tế phát hành 55.
- **Hệ quả:** ngưỡng toàn cục (offline, freshness, rate limit) có thể bị đổi khác nội dung đã xem; ảnh hưởng trạng thái online/offline và cảnh báo của mọi thiết bị.
- **Đề xuất:** trả `digest`/`previewId` từ preview, yêu cầu gửi kèm khi publish và so khớp; xóa preview + disable publish khi `value` đổi; bắt buộc preview trước publish; thêm test “sửa sau preview” và “publish không preview”.

### P2-1. 409 khi đổi trạng thái user để lại dữ liệu cũ, không reload

- **Vị trí:** `apps/web/src/features/admin/AdminPage.tsx:194-197` chỉ hiện `Alert` lỗi; invalidation chỉ chạy trong `onSuccess` (`:156-170`), không có trong `onError`. `handleStatusSubmit` (`:177-189`) không reset target/reason.
- **Tái hiện:** hai tab admin cùng mở Users. Tab A khóa caregiver thành công. Tab B (dữ liệu cũ) bấm “Tạm khóa”, nhập lý do, xác nhận → 409.
- **Expected:** báo “tài khoản đã được thay đổi ở nơi khác”, tự refetch hoặc có nút Tải lại, đóng/khóa form cũ để tránh gửi lặp.
- **Actual:** alert “Không đổi được trạng thái — Trạng thái tài khoản không thay đổi.”; dòng vẫn ghi “Hoạt động”; form lý do + “Xác nhận tạm khóa” vẫn mở. Không có chữ “tải lại”.
- **Đề xuất:** onError 409 → `invalidateQueries` danh sách + overview, đóng target, hiển thị trạng thái mới; hoặc thêm nút Tải lại và focus vào thông báo.

### P2-2. Lý do của thao tác phá hủy không được backend bắt buộc

- **Vị trí:** `packages/contracts/src/admin.ts:46-50` — `reason` là `.optional()`; `apps/api/src/admin/admin.service.ts:262` chỉ ghi metadata nếu có reason. `apps/api/src/devices/devices.service.ts:137-153` — `rotateDeviceKey` không nhận reason/confirmation, audit metadata rỗng.
- **Bằng chứng:**
  - `PATCH /admin/users/166f.../status` body `{"status":"disabled"}` → **200**; audit `admin.user.disable` có `metadata: {}`. UI có bắt lý do, nhưng client/API trực tiếp bỏ qua được.
  - `POST /admin/devices/5de9.../rotate-key` → **200**, trả key mới; audit `device.rotate_key` `metadata: {}`. Key cũ mất hiệu lực ngay (ingest 401), không có lý do/ghi chú.
- **Expected:** thao tác khóa tài khoản và rotate credential thiết bị cần lý do/xác nhận rõ; audit phải giữ lý do (như task close yêu cầu 3–500 ký tự).
- **Actual:** UI user lock có guardrail, nhưng backend không cưỡng chế; rotate không có guardrail ở cả API/UI.
- **Đề xuất:** bắt buộc `reason` (min/max) cho disable; thêm `reason` + confirm cho rotate; audit metadata chứa reason (không chứa key); test API từ chối body thiếu lý do.

### P2-3. Policy 409: reload vẫn còn lỗi cũ, header phiên bản cũ; publish lỗi không được audit

- **Vị trí:** `apps/web/src/features/admin/AdminPage.tsx:463-468` `handleReload` không `publish.reset()`; `:576-580` cứ `publish.isError` là hiện alert; `:498` header lấy `policyData.active.version` từ cache cũ. `apps/api/src/admin/admin.service.ts:448-494` throw `APPROVAL_STALE` trước khi `audit.record`, nên 409 không có audit.
- **Tái hiện:** UI đang v2, một phiên khác publish v3; UI bấm Phát hành → 409, alert nói hiện tại v3 nhưng header vẫn “đang áp dụng phiên bản 2”. Bấm **Tải lại** → header/form v3, nhưng alert đỏ “Không phát hành được — Phiên bản policy đã thay đổi, hãy tải lại trước khi công bố.” vẫn còn; giá trị đang sửa (100) bị thay bằng giá trị mới (90) không cảnh báo.
- **Expected:** sau reload, xóa lỗi 409 cũ, header/form cùng version, thông báo rõ nếu bỏ thay đổi chưa lưu; ghi audit `outcome=conflict` cho lần publish thất bại để điều tra.
- **Actual:** trạng thái lỗi và dữ liệu không nhất quán; `/admin/audit?action=policy.publish` chỉ có 2 bản success dù đã có ít nhất 2 lần 409.
- **Đề xuất:** reset mutation + staleInfo + preview khi reload; dùng version/digest mới; audit 409 trước khi throw; test reload sau 409.

### P2-4. Bộ lọc audit thiếu actor khi >100 user; action khớp tuyệt đối; dòng audit khó đọc

- **Vị trí:** `apps/web/src/features/admin/AdminPage.tsx:629-633` tải actor options bằng `fetchAdminUsers({ limit: 100 })`, không phân trang/tìm kiếm; `:664-671` action filter gửi nguyên chuỗi, API so sánh `eq`; `:715-721` chỉ hiện 8 ký tự UUID của actor/target.
- **Bằng chứng:** tạo 113 user; select actor có **101 option** (gồm “Tất cả”), **không có** `ba-an@demo`, `minh@demo`, `admin@demo` (3 user seed cũ nhất). API `GET /admin/audit?actorUserId=11111111...` vẫn trả **8 bản ghi** của owner. Tại thời điểm kiểm: nhập action `policy` → EmptyState dù có `policy.publish`; action `policy.publish` → 2 bản ghi.
- **Expected:** actor picker tìm được mọi user (server-side search hoặc tải đủ trang); action filter có gợi ý/khớp chứa; cột actor hiện tên/email hoặc link tới user thay vì chỉ UUID prefix.
- **Actual:** admin không thể lọc audit theo chính mình hoặc các tài khoản chính khi hệ thống >100 user; phải biết chính xác chuỗi action và tự map UUID.
- **Đề xuất:** endpoint search user cho picker hoặc phân trang; hiển thị tên actor/target; chuyển action filter sang select/datalist từ danh sách action đã biết hoặc dùng `contains` có kiểm soát.

### P2-5. Trang Công việc của admin rỗng, mâu thuẫn Tổng quan và nav

- **Vị trí:** `apps/api/src/maintenance/maintenance.service.ts:79-80` — admin không truyền `subjectId` chỉ thấy task `subjectId IS NULL`; seed tasks đều gắn subject (`apps/api/src/database/seed.ts:481-520`). `AdminPage.tsx:101` vẫn đếm mọi task mở. `AppShell.tsx:147-155` admin-only nav chỉ có Quản trị, không có Công việc.
- **Bằng chứng:** `/admin/overview` → `tasks.open=1`; `/app/tasks` (admin) → “Không có công việc đang mở”; page lead lại nói “Chủ hồ sơ (và admin) có thể đóng công việc”. Owner thấy task và đóng được; admin không thấy task nào.
- **Expected:** admin có danh sách task admin (kể cả task gắn subject, che dữ liệu sức khỏe nếu cần), hoặc nếu cố ý chỉ thấy task không gắn subject thì phải giải thích trên UI và số liệu Tổng quan phải khớp bộ lọc đó.
- **Actual:** metric và trang lệch nhau; admin không thể đóng task gắn subject qua UI dù source `maintenance.service.ts:170` cho phép admin đóng nếu biết ID (chưa chạy được qua UI vì không thấy task).
- **Đề xuất:** chốt phạm vi task admin với lead; nếu cho phép thì thêm filter/nhãn “task không gắn hồ sơ” + link; nếu không thì sửa page lead và metric.

### P2-6. Bảng Users trên mobile ẩn cột Hành động, không có layout thay thế

- **Vị trí:** `apps/web/src/styles/layout.css:1788-1795` — `.adm-table { min-width: 40rem }` trong wrapper `overflow-x: auto`; không có media query nào cho `.adm-table` để chuyển bảng sang card hay sticky action (chỉ có media query cho form policy `:2790`).
- **Bằng chứng:** viewport 390×844; `documentElement.scrollWidth=390` (không tràn trang) nhưng `.adm-table-wrap { scrollWidth:680, clientWidth:365 }`; ảnh chụp cho thấy cột “Hành động” (Tạm khóa/Kích hoạt) nằm ngoài khung, không có chỉ báo cuộn ngang. Các nút khóa/mở là thao tác chính của tab.
- **Expected:** bảng admin dùng được trên mobile theo docs/06 (responsive); action hiện rõ hoặc có card/sticky cột + chỉ báo cuộn.
- **Actual:** admin phải vuốt ngang trong bảng 20 dòng mới thấy nút; dễ bỏ sót thao tác.
- **Đề xuất:** card layout dưới 640px hoặc sticky cột hành động + hint “vuốt ngang”; giữ caption/aria.

## 4. Điểm cần chốt (chưa kết luận là lỗi)

- **Số cảnh báo mở trên Tổng quan admin:** `AdminPage.tsx:91-108` hiển thị `alerts.open` toàn hệ thống dù admin không có care link. Đây là số tổng hợp, không phải payload/nhịp tim, nhưng vẫn cho biết đang có cảnh báo sức khỏe. `docs/02:13` nói admin không mặc định đọc dữ liệu sức khỏe; `docs/06:20` màn Admin không liệt kê alerts. Cần chủ dự án chốt: giữ cho vận hành, ẩn, hay chỉ hiện khi có care link. Không xếp P1/P2 vì chưa có quyết định.
- **Audit metadata chứa `reason` free text** do admin nhập; hiện chưa có kiểm tra/redaction nếu admin gõ dữ liệu sức khỏe vào lý do. Cần policy nếu muốn cấm.
- **Admin device list trả `assignedSubjectId`** (không trả tên/sức khỏe). Đủ cho vận hành thiết bị nhưng cần chốt có được phép correlate với subject không.

## 5. Thay đổi dữ liệu trong DB review (cách ly)

Các thay đổi chỉ nằm trong `.data/review-admin` (PGlite riêng, seed tổng hợp), không đụng DB lead: tạo 110 user `review-user-*@example.test`; tạo thiết bị `REV-ADMIN-001` và rotate key; khóa/mở caregiver nhiều lần; khóa `review-user-110` không lý do để kiểm contract; tạo 1 invitation; xuất CSV/tóm tắt AI; tạo fall incident mới; đóng task seed của owner; publish policy v2–v5. Không có thay đổi code/docs/git; `git status` chỉ có báo cáo này. Ảnh chụp Playwright của phiên kiểm nằm ngoài repo ở `%TEMP%\adm-*.png`, `adm-users-*.png`, `adm-audit-*.png`, `adm-policy-*.png`, `adm-tasks-empty.png`, `task-close-*.png`, `care-*.png` (không commit).

## 6. Đề xuất thứ tự xử lý

1. **P1-1:** sửa kiểm status/session trong SSE + regression test; ưu tiên vì đây là lỗi quyền riêng tư.
2. **P1-2 + P2-2:** thêm tab Thiết bị admin, rotate/claim code có xác nhận + lý do; bắt buộc reason ở API.
3. **P1-3:** gắn preview với digest/nội dung publish, xóa preview khi sửa, chặn publish thiếu preview; test.
4. **P2-1/P2-3:** thống nhất xử lý 409 (refetch, reset lỗi, không mất dữ liệu im lặng), audit conflict.
5. **P2-4:** actor picker server-side/đầy đủ + action suggestions + tên actor.
6. **P2-5:** chốt phạm vi task admin và đồng bộ metric/nav/page lead.
7. **P2-6:** responsive bảng admin.
8. Chốt câu hỏi privacy ở mục 4 trước khi dùng dữ liệu thật.

## 7. Tóm tắt 5 dòng

1. Đã chạy lại toàn bộ hành trình admin trên API/web/DB riêng tại HEAD `8434d66`; typecheck, 100 test API và 73 test web đều pass, nhưng test hiện có không phủ SSE khi khóa tài khoản.
2. P1 lớn nhất: SSE đang mở vẫn nhận cảnh báo sức khỏe mới sau khi admin khóa user (HTTP đã 401), do stream chỉ kiểm care link mỗi vòng.
3. P1 thứ hai: web admin không có màn hình thiết bị/rotate key dù API có; P1 thứ ba: preview policy không ràng buộc nội dung publish, sửa sau preview vẫn phát hành giá trị mới.
4. P2: 409 user để lại dòng cũ/không reload; lý do khóa và rotate không bắt buộc ở backend; reload policy 409 còn lỗi cũ + header cũ; audit actor thiếu user khi >100; task admin rỗng/lệch metric; bảng user mobile ẩn nút hành động.
5. Không phát hiện P0; admin không đọc được dữ liệu sức khỏe qua REST nếu không có care link và audit không lộ token/payload sức khỏe trong 140 bản ghi đã quét. Cần chốt số cảnh báo mở trên Tổng quan admin trước khi dùng dữ liệu thật.
