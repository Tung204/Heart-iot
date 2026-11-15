# Review độc lập hành trình chủ hồ sơ — An Nhiên v1.1

**HEAD:** `8434d66` — `perf(web): tách chunk theo route và thống nhất quyền xem cảnh báo`
**Thời điểm chạy:** 15/11/2026, ~06:50–07:25 (Asia/Ho_Chi_Minh, UTC+7)
**Người thực hiện:** reviewer độc lập (worker), không sửa code/docs, không commit.
**Phạm vi:** `apps/web`, `apps/api`, `packages/contracts`, `tools/simulator`; đối chiếu `docs/02`, `03`, `04`, `06`, `08`, `12`, `14`.
**Nguyên tắc:** không dùng kết luận trong `reports/qa/review-*` hay handoff làm bằng chứng; mọi finding dưới đây được tái hiện trong phiên này trên app thật.

## 1. Môi trường và cách dựng (không đụng dịch vụ của lead)

| Thành phần | Giá trị |
| --- | --- |
| OS/shell | Windows, Git Bash; Node `v24.22.2`, pnpm `12.5.1` |
| Repo | worktree riêng tại HEAD `8434d66`; `git status` sạch trước khi ghi báo cáo |
| DB | PGlite riêng `PGLITE_DATA_DIR=.data/review-owner` (gitignore `.data/`); seed demo lúc 06:50 |
| API | `PORT=3200 PGLITE_DATA_DIR=.data/review-owner WEB_ORIGIN=http://localhost:3220 pnpm --filter @annhien/api start` → `{"status":"ok","database":"up"}` |
| Web | `pnpm --filter @annhien/web build` rồi phục vụ `apps/web/dist` tại `http://localhost:3220` bằng static server + proxy `/api → 3200` đặt ngoài repo (`%TEMP%\qa-v2\server.cjs`). Đây là bundle production của cùng HEAD, không phải dev server 5173 của lead. |
| Thiết bị | Admin tạo `QA-V2-002` qua API (`POST /api/v1/admin/devices`), chủ hồ sơ claim qua UI bằng claim code 9 ký tự; telemetry/incident gửi bằng `tools/simulator` với `ANNHIEN_BASE_URL=http://localhost:3200/api/v1` |
| Browser | Playwright `1.65.1`, Chromium headless, locale `vi-VN`, viewport 1280×900 và 390×844 |

Không chạy lại `pnpm test:e2e` của repo; dùng 12 kịch bản Playwright tự viết (lưu `%TEMP%\qa-v2\s*.cjs`), không đặt file trong repo.

## 2. Toolchain đã chạy (output thật)

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --prefer-offline --frozen-lockfile` | OK, 16.8s sau khi resolve (reuse store) |
| `pnpm build:contracts` | OK |
| `pnpm --filter @annhien/api typecheck` | OK, exit 0 |
| `pnpm --filter @annhien/web typecheck` | OK, exit 0 |
| `pnpm --filter @annhien/web test` | **PASS** 20 files / 73 tests, 13.66s |
| `pnpm --filter @annhien/web build` | OK, route-level chunks; lớn nhất `index-DxULU1N-.js 264.55 kB` + `ErrorState 230.68 kB`; **không còn cảnh báo >500 kB** |

## 3. Phần đã kiểm trên app thật

| Bước hành trình | Cách chạy | Kết quả |
| --- | --- | --- |
| Đăng ký tài khoản mới | `/register` → submit | OK: vào `/app`; dashboard trống |
| Tạo hồ sơ | `/app/subjects` → `Bà QA V2` | OK: hồ sơ mới thành hồ sơ đang xem |
| Gắn thiết bị | Admin API tạo `QA-V2-002` + claim code → `/app/devices` | OK: hiện serial, “Chưa từng kết nối”, chưa có pin/nhịp tim giả |
| Nhận dữ liệu | simulator `telemetry --count 6` | OK: dashboard 74 bpm (68–79), 40 bước, pin 80%, “lần nhận cuối …” |
| Tổng quan | `/app` | OK với dữ liệu; cảnh báo mở ưu tiên trước số liệu; nhãn “dữ liệu mô phỏng” |
| Lịch sử + CSV | `/app/history`, “Tải CSV” | Owner OK: 6/6 dòng, CSV 775 B, có BOM UTF-8, header khớp contract |
| Nhận cảnh báo | simulator `fall --mode confirm` | OK: danh sách hiện cảnh báo “Nghi ngã — cần chú ý”, SSE tự cập nhật |
| Xác nhận/đóng cảnh báo | `/app/alerts/:id` | Owner OK: ack → “Đã xác nhận”, đóng thiếu lý do bị chặn, đóng thành công có lý do; tab “Đã đóng” đúng |
| Quyền người thân với cảnh báo | caregiver `canAcknowledge=true`, `canResolve=false` | OK: ack được, không có nút đóng + ghi rõ “Bạn không có quyền đóng cảnh báo” |
| Thông báo | `/app/notifications` | OK: đếm unread, “Đánh dấu đã đọc” giảm đúng 1 |
| Mời người thân | `/app/subjects/:id/share` | OK: tạo lời mời, token/acceptUrl chỉ hiện một lần; danh sách pending/accepted đúng |
| Chấp nhận lời mời | `/invite/:token` | OK: hiện người mời, quyền, hạn; “Đồng ý tham gia” → hồ sơ xuất hiện với badge “Người thân xem hộ” |
| Thu hồi quyền | owner bấm “Thu hồi quyền” → xác nhận | OK: caregiver đang mở dashboard nhận banner “Bạn đã mất quyền xem hồ sơ” qua SSE, dữ liệu bị xóa; reload vẫn mất quyền |
| Studio tạo view | `/app/studio` | OK: draft → lưu → preview (nhãn “Dữ liệu mẫu”) → công bố r1 → sửa/công bố r2 → rollback tạo r3; lịch sử giữ r1/r2 |
| Studio xem dữ liệu | `/app/studio/:id/data` | **Có lỗi** — xem P2-2 |
| Trợ lý | `/app/assistant` | OK: tóm tắt template từ 6 mẫu; câu hỏi y khoa bị từ chối đúng phạm vi; câu hỏi thường trả “Trợ lý AI hiện chưa sẵn sàng” (chưa cấu hình AI) |
| Công việc | `/app/tasks` trên chủ hồ sơ seed `ba-an` | OK: đóng task thiếu lý do bị chặn; đóng có lý do thành công; chủ hồ sơ mới **luôn rỗng** (xem P2-5) |
| Mobile 390×844 | dashboard, history | Không tràn ngang (`scrollWidth-clientWidth = 0` cả hai) |

## 4. Findings

### P0

Không phát hiện P0 trong phạm vi hành trình đã chạy.

### P1-1 — Người thân không xem được lịch sử/CSV theo khoảng mặc định (403 do `sharedFrom`)

**Vị trí**
- `apps/web/src/features/history/HistoryPage.tsx:67-72` — luôn gọi `clampRangeToHistoryDays(now - clampedHours*3600*1000, now, historyDays)`, tức chỉ kẹp theo `historyDays`, không theo `sharedFrom`.
- `apps/web/src/lib/format.ts:98-108` — `clampRangeToHistoryDays` chỉ so `historyDays`, không nhận `sharedFrom`.
- `apps/api/src/access/access.service.ts:97-113` — `requireHistory` từ chối nếu `from < max(now - historyDays, sharedFrom)`.
- `apps/api/src/measurements/measurements.service.ts:72-80` — API có ý định kẹp cửa sổ mặc định theo `effectiveFrom` khi client **không** gửi `from`; nhưng frontend luôn gửi `from`.

**Bước tái hiện A (tài khoản seed có sẵn)**
1. Đăng nhập `minh@demo.annhien.local / demo-an-nhien-2026` (care link `sharedFrom` = 20 ngày trước, `historyDays=30`).
2. Mở `/app/history`, bấm “30 ngày”.

**Expected:** xem được 30 ngày (quyền ghi “tối đa 30 ngày”), hoặc nút bị vô hiệu/thu hẹp khoảng trước khi gọi API.
**Actual:** `ErrorState` “Không tải được dữ liệu đo — Khoảng thời gian yêu cầu vượt quá quyền xem lịch sử được chia sẻ.”; request `.../measurements?from=2026-10-16T00%3A06%3A13.164Z&to=2026-11-15T00%3A06%3A13.164Z&limit=500` → **HTTP 403**. Nút “Tải CSV” dùng cùng `from/to` nên cũng bị chặn bởi cùng kiểm tra quyền.
**Bằng chứng:** `%TEMP%\qa-v2\shots\42-minh-history-30d.png`; `%TEMP%\qa-v2\s6.json` (diag 403).

**Bước tái hiện B (người thân vừa chấp nhận)**
1. Chủ hồ sơ mời `historyDays=2`, caregiver chấp nhận lúc `2026-11-15T00:05:40Z`.
2. Mở `/app/history` ngay sau đó (mặc định “24 giờ”).

**Expected:** 24h < 2 ngày nên phải xem được (ít nhất phần từ `sharedFrom` đến nay), hoặc UI tự thu hẹp khoảng.
**Actual:** request `from = now-24h` (00:04Z) < `sharedFrom` (00:05:40Z) → **403**; các nút 7/30 ngày bị disable vì quyền 2 ngày, nên trong 24h đầu người thân **không xem được bất kỳ khoảng nào**, kể cả CSV.
**Bằng chứng:** `%TEMP%\qa-v2\s5.json` (step `caregiver-history`, HTTP 403); `%TEMP%\qa-v2\shots\37-caregiver-history.png`; `curl .../export.csv?from=<now-24h>` → 403 body `{"code":"FORBIDDEN",...,"details":{"effectiveFrom":"2026-11-15T00:05:40.319Z"}}`.

**Hệ quả:** FR-05 (lọc khoảng, xuất dữ liệu) không đạt với người thân mới; đây là bước chính của hành trình “nhận cảnh báo → xem lịch sử”.
**Đề xuất:** dùng `SubjectSummary.sharedFrom` (đã có trong `packages/contracts/src/subjects.ts:33`, `apps/api/src/subjects/subjects.service.ts:42`) hoặc `error.details.effectiveFrom` để kẹp `from` trước khi query; disable nút không thể xem; áp dụng cùng logic cho CSV; thêm test với `sharedFrom` giữa ngày.

### P1-2 — Ranh giới `sharedFrom` áp dụng không nhất quán: lộ mẫu sức khỏe/incident trước khi chia sẻ, UI tự mâu thuẫn

**Vị trí**
- `apps/api/src/devices/devices.service.ts:304-336` — `loadLastTelemetry` lấy mẫu mới nhất theo `deviceId + assignmentId`, **không lọc `measuredAt >= sharedFrom`**; `getSubjectStatus` (`:236-244`) trả nguyên cho caregiver.
- `apps/api/src/incidents/incidents.service.ts:639-673` — `listAlerts` chỉ lọc `subjectId + state`, **không lọc `detectedAt`** theo mốc chia sẻ.
- Đối chiếu: `apps/api/src/measurements/measurements.service.ts:146-160` (`dailySummary`) và trợ lý (`periodStart = sharedFrom`) **có** kẹp mốc chia sẻ.
- UI: `apps/web/src/features/dashboard/DashboardPage.tsx` render cả “Tổng hợp hôm nay” (bị kẹp) và card “Thiết bị” (không bị kẹp).

**Bước tái hiện**
1. Caregiver chấp nhận lúc `00:05:40Z`; telemetry cuối cùng trước đó lúc `00:00:43Z`; incident trước đó lúc `00:02:12Z`.
2. Gọi API bằng cookie caregiver:
   - `GET /subjects/<id>/status` → `lastMeasuredAt:"2026-11-15T00:00:43.335Z"`, `lastHeartRateBpm:68`, `batteryPercent:80`, `lastSeenAt:"...00:00:43.341Z"`.
   - `GET /subjects/<id>/alerts?state=closed` → incident `detectedAt:"2026-11-15T00:02:12.632Z"`, `resolutionReason` đầy đủ.
   - `GET /subjects/<id>/daily-summary?date=2026-11-15` → `heartRate:null`, `steps.total:0`, `coverage.from:"2026-11-15T00:05:40.319Z"`, `incidents.total:1` (incident trước mốc vẫn được đếm).
   - `GET /subjects/<id>/assistant/summary` → `periodStart:"2026-11-15T00:05:40.319Z"`, “Không có cảnh báo nào trong khoảng”, “Không có mẫu đo nào”.

**Expected:** theo `docs/06-trai-nghiem-va-man-hinh.md:39` (“Người thân không mặc định truy cập toàn bộ dữ liệu trước ngày chia sẻ”) và `docs/04-du-lieu-va-giao-tiep.md:11` (care_links “giới hạn lịch sử được xem; kiểm lại trước khi gửi dữ liệu”), mọi đường REST/AI phải áp cùng mốc; UI phải thống nhất.
**Actual:** card “Thiết bị” hiển thị “Nhịp tim gần nhất 68 bpm / Pin 80% / Lần đo gần nhất 07:00” trong khi khối “Tổng hợp hôm nay” nói “Chưa có mẫu nhịp tim hợp lệ hôm nay / Độ phủ 0% / 0 mẫu đã nhận”; lịch sử cảnh báo vẫn trả incident trước mốc; assistant/daily-summary chặn.
**Bằng chứng:** `%TEMP%\qa-v2\shots\36-caregiver-dashboard.png`; JSON status/alerts/summary (mục này); `%TEMP%\qa-v2\s5.json`.
**Hệ quả:** vi phạm ranh giới quyền riêng tư đã ghi trong docs/06 + docs/04 (care_links); caregiver thấy dữ liệu sức khỏe phát sinh trước khi được chia sẻ; dashboard mâu thuẫn làm giảm tin cậy.
**Đề xuất:** kẹp `loadLastTelemetry` và `listAlerts` theo `effectiveFrom` (hoặc ghi rõ nếu cố ý cho xem “trạng thái hiện tại”, và tách dữ liệu sức khỏe khỏi trạng thái thiết bị); thống nhất card thiết bị với tổng hợp; thêm test cho `status`/`alerts` khi `sharedFrom` ở giữa ngày.

### P2-1 — Trạng thái rỗng “Chưa có hồ sơ nào” hiển thị hai lần

**Vị trí:** `apps/web/src/features/subjects/SubjectSwitcher.tsx:53` (EmptyState khi danh sách rỗng) và `apps/web/src/features/dashboard/DashboardPage.tsx:87` (EmptyState thứ hai). Cả hai có cùng tiêu đề, mô tả và CTA “Tạo hồ sơ”.
**Tái hiện:** đăng ký tài khoản mới (`qa2-empty-…`) → `/app`; đếm `getByText('Chưa có hồ sơ nào', {exact:true})` = **2**. Cùng hiện tượng sau khi caregiver bị thu hồi quyền (ảnh 40).
**Expected:** một empty state duy nhất, một CTA.
**Actual:** hai card giống nhau, hai nút “Tạo hồ sơ”.
**Bằng chứng:** `%TEMP%\qa-v2\shots\58-empty-new-account.png` (DOM count 2), `%TEMP%\qa-v2\shots\40-caregiver-after-revoke-live.png`.
**Đề xuất:** chỉ render empty state ở một lớp (bỏ ở switcher hoặc dashboard khi shell đã xử lý), hoặc dùng biến thể gọn khác nhau.

### P2-2 — “Xem dữ liệu đã công bố” của Studio hiển thị config **draft** cho chủ view

**Vị trí:** `apps/api/src/studio/studio.service.ts:879-893` — với `kind === 'owner' || 'admin'`, `config = view.draftConfig`; nhánh người xem khác mới dùng `active.config`. UI `apps/web/src/features/studio/StudioViewDataPage.tsx:82-90` ghi “Bản công bố rN (digest …)”, còn `:149` hiển thị `data.digest` (draft).
**Tái hiện (owner QA V2 sau khi rollback):** publication active r3 digest `60b44d26…`; `GET /workspace-views/<id>/data?subjectId=<id>` trả `digest 588e41b8…`, widget title “Nhịp tim QA lần 2” (draft), trong khi r3 đang công bố là config r1 “Nhịp tim QA”. Ảnh `59-studio-data-selected.png` hiển thị cùng lúc “Bản công bố r3 (60b44d26…)” và “digest 588e41b8…”, “Nhịp tim QA lần 2”.
**Expected:** trang “dữ liệu đã công bố” render config của publication active (và digest active); preview draft phải là màn hình/label riêng.
**Actual:** editor thấy draft chưa công bố được gắn nhãn “đã công bố”, đặc biệt sai sau rollback.
**Bằng chứng:** `%TEMP%\qa-v2\shots\59-studio-data-selected.png`; JSON curl ở mục này; code refs trên.
**Đề xuất:** `/data` luôn dùng `activePublication.config`; nếu cần xem dữ liệu thật cho draft, tách endpoint/nhãn “Xem trước bằng dữ liệu thật” và hiển thị digest tương ứng.

### P2-3 — Chủ hồ sơ mới không có đường lấy mã gắn thiết bị trong app

**Vị trí:** `apps/web/src/features/devices/DevicesPage.tsx:236-253` yêu cầu “Mã gắn thiết bị (9 ký tự …)”; `apps/api/src/devices/devices.service.ts` chỉ cho admin `createDevice`/`issueClaimCode`; `apps/web/src/features/admin/AdminPage.tsx` không có UI tạo thiết bị/cấp mã (chỉ overview/users/audit/policy).
**Tái hiện:** tài khoản mới → tạo hồ sơ → `/app/devices` hiện form claim; không có liên kết/hướng dẫn lấy mã; phải gọi `curl POST /api/v1/admin/devices` (admin) để có `claimCode` rồi mới claim được qua UI.
**Expected (docs/06:39):** claim bằng bằng chứng dùng một lần từ thiết bị/bộ kit; demo cần đường rõ ràng để lấy mã.
**Actual:** hành trình “đăng ký → tạo hồ sơ → gắn thiết bị” không hoàn tất được bằng UI cho tài khoản mới; chỉ tài khoản seed đã có thiết bị.
**Bằng chứng:** `%TEMP%\qa-v2\shots\07-devices-empty.png`, `13-device-claimed.png`; `device2.json` (claim code do API admin tạo).
**Đề xuất:** thêm màn hình admin tạo thiết bị/cấp claim code, hoặc nút “hướng dẫn demo” trong form claim; ghi rõ mã do quản trị cấp.

### P2-4 — Link “Quản lý và chia sẻ” hiện cho người thân (không có quyền quản lý)

**Vị trí:** `apps/web/src/features/subjects/SubjectSwitcher.tsx:102-108` render link vô điều kiện; link trỏ `/app/subjects`.
**Tái hiện:** caregiver đang xem hồ sơ được chia sẻ → header “HỒ SƠ ĐANG XEM · NGƯỜI THÂN” vẫn có “Quản lý và chia sẻ”; mở trang chia sẻ trực tiếp thì hiện đúng “Chỉ chủ hồ sơ quản lý chia sẻ” (phần này đã đúng).
**Expected:** người thân chỉ thấy hành động họ có quyền (hoặc nhãn “Hồ sơ được chia sẻ”).
**Actual:** lối vào gợi ý quyền quản lý mà người thân không có; dễ đi vào ngõ cụt.
**Bằng chứng:** `%TEMP%\qa-v2\shots\36-caregiver-dashboard.png`; step `caregiver-share-direct` trong `s5.json`.
**Đề xuất:** ẩn/đổi nhãn theo `role` (owner mới hiện “Quản lý và chia sẻ”).

### P2-5 — “Công việc bảo trì” chỉ có dữ liệu seed; chủ hồ sơ mới luôn thấy rỗng

**Vị trí:** API chỉ có `GET /maintenance-tasks` và `POST /maintenance-tasks/:id/close` (`apps/api/src/maintenance/maintenance.service.ts`), task chỉ được tạo trong `apps/api/src/database/seed.ts:483-520`; UI `/app/tasks` (`TasksPage.tsx`) không có tạo task.
**Tái hiện:** chủ hồ sơ QA V2 (mới) mở `/app/tasks` sau khi đã nhận telemetry/cảnh báo → “Không có công việc đang mở”; chủ seed `ba-an` có 1 task đang mở (seed tạo 2: 1 open + 1 done) và đóng được (đã kiểm).
**Expected:** với tính năng “công việc” trong docs/06, cần nêu rõ nguồn tạo task hoặc có hành động tạo/ghi nhận.
**Actual:** tính năng chỉ trình diễn được bằng dữ liệu seed; không có cách tạo trong app.
**Bằng chứng:** `%TEMP%\qa-v2\s8.json`, `%TEMP%\qa-v2\shots\28-tasks-after-resolve.png`, `55-seeded-tasks.png`.
**Đề xuất:** ghi rõ “task do hệ thống/seed tạo” trong UI demo, hoặc bổ sung luồng tạo task tối thiểu (kèm quyền).

### P2-6 — Copy quyền lịch sử của chủ hồ sơ gây khó hiểu (“3650 ngày”)

**Vị trí:** `packages/contracts/src/core.ts:76-82` (`OWNER_PERMISSIONS.historyDays = 3650`), hiển thị ở `apps/web/src/features/history/HistoryPage.tsx:130` (“Quyền hiện tại cho phép xem tối đa 3650 ngày”).
**Tái hiện:** chủ hồ sơ mở `/app/history` → thấy “tối đa 3650 ngày”.
**Expected:** với owner nên là “toàn bộ lịch sử” hoặc ẩn giới hạn; con số 3650 ngày không có nghĩa với người dùng.
**Actual:** copy kỹ thuật lộ ra UI; không sai nghiệp vụ nhưng gây nhiễu.
**Bằng chứng:** `%TEMP%\qa-v2\shots\16-history-24h.png`.
**Đề xuất:** nhánh copy theo `role === 'owner'`.

### P2-7 — README/docs/14 còn ghi “chưa code-split, bundle >500 kB” trong khi HEAD đã tách chunk

**Vị trí:** `README.md:90`, `docs/14-ke-hoach-trien-khai-phan-mem.md:191` và `:208`.
**Tái hiện:** `pnpm --filter @annhien/web build` → các chunk theo route (`DashboardPage`, `HistoryPage`, `AdminPage`, …), lớn nhất `index-DxULU1N-.js 264.55 kB`, `ErrorState 230.68 kB`; **không có cảnh báo >500 kB** (grep “warn” rỗng).
**Expected:** tài liệu là một phần của thay đổi (AGENTS.md, docs/12); commit `8434d66` tách chunk phải cập nhật tuyên bố cũ.
**Actual:** tài liệu vẫn nói chưa làm, dẫn người đọc sai về hiện trạng.
**Bằng chứng:** output build ở mục 2.
**Đề xuất:** cập nhật README/docs/14 (hoặc ghi rõ “đã tách theo route, còn vendor ~230 kB”) trong cùng thay đổi.

## 5. Chưa kiểm / giới hạn

- Không chạy lại bộ `pnpm test:e2e` của repo hay Jest API; chỉ chạy typecheck + Vitest web. Các kịch bản Playwright riêng không nằm trong repo.
- Không kiểm: đăng xuất/đăng nhập lại sau logout, tháo gắn thiết bị, chuyển thiết bị giữa hồ sơ, trạng thái offline sau 900s, dữ liệu trễ/đồng hồ chưa đồng bộ, chống trùng ingest, race ack/resolve 409 (đã có review backend riêng, không tái chạy).
- AI thật không kiểm: `AI_BASE_URL` trống nên chỉ có template fallback; câu hỏi thường trả “chưa sẵn sàng” — đúng thiết kế nhưng chưa chứng minh trợ lý hỏi đáp hoạt động với provider.
- Không kiểm Firefox/Safari, 320px, screen reader, đo contrast bằng công cụ; không kiểm Web Push/thông báo khi đóng trình duyệt (ngoài MVP).
- Không kiểm Admin UI tạo thiết bị vì không tồn tại; chỉ dùng API.
- Không đánh giá P2-1 cũ (form mời cho caregiver) như “đã đóng”: phiên này xác nhận trang chia sẻ trực tiếp đã hiển thị đúng “Chỉ chủ hồ sơ quản lý chia sẻ”, nhưng lối vào/label vẫn còn vấn đề (P2-4 mới).

## 6. Ghi chú dữ liệu demo trong phiên

Chỉ thay đổi DB riêng `.data/review-owner` (gitignored), không đụng `.data/pglite`, API 3000 hay web 5173 của lead:
- Tạo user `qa2-owner-…`, `qa2-care-…`, `qa2-empty-…`; hồ sơ “Bà QA V2”; thiết bị `QA-V2-001/002` (001 do lỗi encoding label khi curl, không dùng; 002 dùng cho journey).
- 6 mẫu telemetry, 2 incident (một đã đóng, một mới nhất đang “đã xác nhận” bởi caregiver); 1 view Studio `qa-v2-tong-quan` đã publish/rollback; 1 task seed của `ba-an` đã đóng kèm lý do; vài lời mời `qa2-*`.
- Đây là dữ liệu tổng hợp phục vụ kiểm thử, không phải dữ liệu đo thật.

## 7. Đề xuất thứ tự xử lý

1. **P1-1** (chặn người thân xem lịch sử/CSV): sửa clamp theo `sharedFrom` + test; đây là lỗi chặn hoàn thành nhiệm vụ rõ nhất.
2. **P1-2** (ranh giới quyền không nhất quán): kẹp `status`/`alerts` theo `effectiveFrom` hoặc tách dữ liệu sức khỏe khỏi trạng thái thiết bị; thống nhất UI.
3. **P2-2** (Studio data hiển thị draft) vì dễ gây hiểu “đã công bố” sai sau rollback.
4. P2-1 (empty state lặp), P2-3 (đường claim), P2-4 (label quyền), P2-5 (task seed-only), P2-6 (copy 3650 ngày), P2-7 (docs lệch).
5. Khi sửa xong, chạy lại các kịch bản `s1`–`s8` (đặc biệt hai tài khoản caregiver: seed `minh` và caregiver mới chấp nhận trong ngày).

## 8. Tóm tắt 5 dòng

- Đã đi hết hành trình chủ hồ sơ trên bản build production của HEAD `8434d66` với DB riêng: đăng ký → hồ sơ → gắn thiết bị (admin API) → dữ liệu → lịch sử/CSV → cảnh báo ack/đóng → mời/chấp nhận/thu hồi → Studio publish/rollback → trợ lý → công việc; web typecheck + 73 test đạt.
- **Không có P0**; có **2 P1**: (1) người thân bị 403 khi xem lịch sử/CSV do frontend gửi `from` sớm hơn `sharedFrom` (seed `minh` 30 ngày và caregiver vừa accept 24h đều fail), (2) ranh giới `sharedFrom` không áp cho `/status` và `/alerts`, làm lộ nhịp tim/incident trước khi chia sẻ và dashboard hiển thị “0%” cạnh “68 bpm”.
- **7 P2**: empty state lặp hai lần; trang “dữ liệu đã công bố” của Studio trả config draft (digest draft ≠ publication active) sau rollback; không có UI/provisioning claim code; link “Quản lý và chia sẻ” hiện cho người thân; task chỉ có dữ liệu seed; copy “3650 ngày” cho owner; README/docs/14 còn nói chưa code-split dù build đã tách chunk (lớn nhất 264.55 kB).
- Luồng quyền cốt lõi khác hoạt động đúng trên app thật: caregiver không đóng được cảnh báo, thu hồi qua SSE xóa dữ liệu ngay, token mời một lần, nhãn dữ liệu mô phỏng, CSV có BOM, mobile 390px không tràn.
- Chưa kiểm: e2e/Jest của repo, device release/offline/late/race 409, AI provider thật, trình duyệt khác/screen reader/Web Push; cần lead cập nhật docs và xử lý P1 trước khi coi v1.1 là “đạt hành trình chủ hồ sơ”.
