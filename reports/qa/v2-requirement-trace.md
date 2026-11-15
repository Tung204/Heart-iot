# Truy vết yêu cầu v2 — An Nhiên (review độc lập)

- **Phiên:** `qa-requirement-trace`, worker `task_f93367be4ce5`, ngày 15/11/2026 (Asia/Ho_Chi_Minh).
- **Vai trò:** reviewer độc lập, chỉ đọc và chạy lại; **không sửa code/docs/DB**. Báo cáo này là file duy nhất được ghi trong repo.
- **HEAD thực tế:** `ffb6d87` — **không phải** `8434d66` như spec phiên. `8434d66` là v1.1; sau đó có 4 commit:
  - `0d669a1` thêm **contracts/schema/migration v2** (tài khoản, insights, liên hệ khẩn cấp, tạo task) — **chưa có API/UI**.
  - `9d480f3`, `a5ce598`, `ffb6d87` chỉ thêm tài liệu orchestration.
  Vì vậy mọi kết luận dưới đây coi `8434d66` là mốc sản phẩm v1.1; phần v2 chỉ được ghi nhận là “hợp đồng trước”, không tính là đã triển khai.
- **Môi trường kiểm:** Windows, Node 24.22.2, pnpm 12.5.1; Chromium qua Playwright 1.65.1; PGlite tạm `%LOCALAPPDATA%\Temp\annhien-v2trace\pglite`; API riêng cổng **3457**, web riêng cổng **5273**. Không đụng API 3000/web 5173 của lead; không dùng `.data/pglite` của repo.
- **Artifact:** ảnh và JSON bằng chứng nằm ngoài repo tại `%LOCALAPPDATA%\Temp\annhien-v2trace\` (`shots\*.png`, `api-check.json`, `ui-check*.json`, `api.log`). Ảnh tạm không commit; nếu cần lưu lâu phải chuyển vào vùng bằng chứng được phép ở phiên khác.
- **Nguyên tắc đọc báo cáo:** `đã kiểm` = hành vi đã được chạy lại trong phiên này (test hoặc UI/API thật); `đã kiểm một phần` = có bằng chứng cho một phần, phần còn lại ghi rõ; `chưa kiểm` = chưa có bằng chứng thực thi; `thiếu` = chưa có implementation; `không thuộc v1` = docs/14 §2 đã loại khỏi v1. Không dùng “đạt” cho phần chỉ có code/đặc tả.

---

## 1. Cổng đã chạy lại (output thật)

| Lệnh | Kết quả trong phiên này |
| --- | --- |
| `pnpm install --frozen-lockfile` | exit 0, 23 s (chỉ tạo `node_modules`, không đổi manifest/lockfile) |
| `pnpm build:contracts` | exit 0 |
| `pnpm -r typecheck` | contracts/api/web/simulator: **Done**, không lỗi |
| `cd apps/api && pnpm test` | **14 suites / 100 tests pass**, 143.042 s |
| `cd apps/web && pnpm test` | **20 files / 73 tests pass**, 10.80 s |
| `cd apps/web && pnpm build` | thành công; `index-DHpWuntm.js` **264.75 kB** (gzip 81.31 kB), các trang tách chunk (Dashboard/History/Admin/Studio…); **không còn cảnh báo chunk >500 kB** |
| `cd tools/simulator && npm test` | **23 tests pass** (gồm retry/queue/key không lộ) |
| E2E repo (`smoke.spec.ts`, `alerts.spec.ts`) | **4 tests pass** qua config tạm trỏ `http://localhost:5273` (không dùng webServer mặc định vì cổng 3000 đang bận) |
| `pnpm --filter @annhien/api seed` lần 1 | users 3, subjects 2, devices 1, assignments 1, careLinks 1, telemetry 1681, incidents 3, tasks 2, outbox 2 |
| Seed lần 2 (cùng DB tạm) | devices 0, incidents 0, tasks 0, outbox 0; telemetry 1681 (không nhân bản) → **idempotent**; lưu ý `assignments/careLinks` trong summary bị hard-code `1` (xem §7.3) |
| `python tools/docs/build.py --check` | **không chạy được**: `ModuleNotFoundError: No module named 'markdown'` → cổng HTML chưa được xác minh trong phiên này |

**Giới hạn của cổng:** chưa có lint script; chưa chạy PostgreSQL thật, MQTT broker, Web Push, TLS, backup/restore, đo p95. Không chạy E2E mặc định của repo vì `playwright.config.ts` sẽ mở web 5173 và proxy sang API 3000 của lead; đã dùng config tạm và ghi rõ ở trên.

---

## 2. Môi trường và luồng đã chạy trực tiếp

- **API thật** trên PGlite tạm, seed demo; **web thật** (Vite dev) trên 5273, proxy sang API 3457; Chromium thật ở 1280×900 và 390×844.
- **Đã chạy trong phiên:**
  - Đăng nhập sai/đúng cho owner, caregiver, admin; `GET /me` 401 khi chưa có phiên.
  - Tạo lời mời bằng UI → mở link công khai → đăng ký tài khoản mới → chấp nhận → vào dashboard; token chỉ hiện một lần; dùng lại token bị từ chối.
  - Thu hồi care link khi caregiver đang mở trang: SSE phát `revoked`, UI xóa dữ liệu hồ sơ và hiện “Bạn đã mất quyền xem hồ sơ”; REST/export/AI/measurements sau thu hồi đều 404.
  - SOS `sos.confirmed` qua đúng đường thiết bị: 202 accepted, tạo cảnh báo trực tiếp; gửi lặp cùng `message_id`: duplicate; ack version sai: 409; resolve thiếu lý do: 422; resolve lần hai: 409.
  - Admin tạo thiết bị + claim code qua API; owner claim và release trên UI; claim lại bằng mã cũ: 422.
  - Admin đổi policy `offlineAfterSeconds` qua UI (preview → publish, có warning/diff/audit); dashboard owner chuyển thiết bị sang “Ngoại tuyến”.
  - Telemetry mới với `battery_percent=null`, `heart_rate=null`, `quality=poor_signal`: dashboard/hiển thị “chưa có thông tin pin”, “chưa có mẫu hợp lệ”.
  - Lịch sử 7 ngày: 3 khoảng thiếu/83.4% coverage; 24 giờ: 0 khoảng thiếu.
  - Admin: overview/users/policy/audit; `/app/history` của admin không lộ hồ sơ; subject detail/alerts của admin 404.
- **Không đụng:** API 3000, web 5173, `.data/pglite`, không commit, `git status --porcelain` sạch sau phiên.

---

## 3. Bảng truy vết yêu cầu chức năng (FR-01…FR-14)

| ID | P | Yêu cầu rút gọn (docs/02) | Trạng thái | Bằng chứng đã chạy trong phiên | Khoảng trống / ghi chú |
| --- | --- | --- | --- | --- | --- |
| FR-01 | P0 | Trang giới thiệu, đăng ký/đăng nhập/đăng xuất; API xác minh phiên phía server | **đã kiểm** | `apps/api/test/auth.spec.ts` (6 test) pass; live landing `01-landing`, sai mật khẩu `02-login-error` (“Không đăng nhập được — Email hoặc mật khẩu không đúng”); login owner/caregiver/admin vào `/app`; `session-cookie.ts` HttpOnly/SameSite/Secure khi production; `GET /me` 401 khi không phiên | RegisterPage/Logout chưa có test UI riêng; không có xác minh email/quên mật khẩu (không nằm trong FR-01). |
| FR-02 | P0 | Mời, chấp nhận, giới hạn quyền, thu hồi; realtime mất quyền ngay | **đã kiểm một phần** | `apps/api/test/care.spec.ts` (5), `sse.spec.ts` S1/S2; live chuỗi UI `29`→`34`; thu hồi realtime `38`/`39`; sau thu hồi alerts/export/AI/measurements = 404; SSE `event: revoked` | **F1:** caregiver vừa chấp nhận bị 403 lịch sử/CSV. `39` còn lỗi 2 empty state trùng. Chưa rõ “yêu cầu tiếp theo” trong docs/02 là flow nào; chưa có flow xin thêm quyền. |
| FR-03 | P0 | Gắn, thu hồi, chuyển thiết bị; chứng minh quyền ghép; không chuyển dữ liệu cũ | **đã kiểm một phần** | `apps/api/test/devices.spec.ts` (claim/release/rotate/freshness; release giữ dữ liệu cũ); live admin tạo thiết bị + claim code qua API, owner claim/release qua UI `43`/`44`; mã cũ sau release 422 `45` | **F2:** không có UI admin tạo thiết bị/claim code/rotate; sau release không thể claim lại nếu không gọi API admin. Chưa có test/flow “chuyển chủ” hoàn chỉnh; UI ghi “mỗi hồ sơ một thiết bị” nhưng claim thêm được nhiều thiết bị (`43`). |
| FR-04 | P0 | Nhịp tim, bước chân, chất lượng tín hiệu; thiếu/sai không thành 0; reset bước không âm | **đã kiểm** | `measurements.spec.ts` (HR null, steps reset, daily summary); live `03` (HR 70, 246 bước, pin 86%); live `41` (pin null → “chưa có thông tin pin”, HR poor → “chưa có mẫu hợp lệ”); UI `HistoryPage.tsx:237-275` | Lỗi chữ “tín hiệu tín hiệu kém” (`41`); khi nhiều thiết bị, summary pin lấy mẫu cuối ngày nên có thể “Chưa có thông tin pin” dù thiết bị khác 86% (`measurements.service.ts:212`). |
| FR-05 | P0 | Biểu đồ/thống kê; lọc ngày/khoảng; đoạn thiếu; không tính trung bình từ mẫu không hợp lệ | **đã kiểm một phần** | `measurements.spec.ts` (gap no_data, unsynced, cursor, coverage, average chỉ mẫu valid); live 7 ngày `24`: “3 khoảng thiếu”, 83.4%, 1681 mẫu; 24 giờ `04`: 0 khoảng thiếu; chart + bảng thay thế | Chỉ có preset 24h/7d/30d, không có chọn ngày tùy ý (docs/06 ghi “khoảng thời gian”); **F1** làm caregiver mới không mở được lịch sử. |
| FR-06 | P0 | Nghi té ngã/hủy báo nhầm; cửa sổ hủy tại thiết bị; trạng thái cuối; gửi trùng không tạo cảnh báo | **đã kiểm một phần** | `incidents.spec.ts` T1/T3/T4/T5/T6/T10 (candidate→cancel/confirmed, revision cũ, duplicate, conflict); simulator `fall --mode confirm` live: 2 ack accepted; live SOS/duplicate | Không có firmware/thiết bị thật nên “cửa sổ hủy tại thiết bị” và chống bấm nhầm chưa kiểm. Candidate bị ẩn khỏi list/detail (404), không có UI “Chưa xác định” như docs/06 §49-55. |
| FR-07 | P0 | Hộp cảnh báo, xác nhận/đóng có lý do; hai người xác nhận đồng thời không mất lịch sử | **đã kiểm** | `incidents.spec.ts` T7/T8/T9 (CAS, 409, 422, audit); live `06`/`07`: ack 409 khi version cũ, resolve thiếu lý do 422, resolve lần hai 409; `notifications.spec.ts` N1–N3 pass | UI chi tiết cảnh báo không hiển thị trạng thái gửi thông báo; notifications API chỉ trả item `sent` (`notifications.service.ts:197`), không có “chưa gửi/đang thử/hết lượt”. |
| FR-08 | P0 | Offline, dữ liệu cũ, pin; phân biệt không dữ liệu với bình thường; pin chưa đo = chưa biết | **đã kiểm** | `devices.spec.ts` freshness offline/stale theo policy; live publish policy → dashboard `28` hiện “Ngoại tuyến”, “lần nhận cuối”; telemetry pin null `41` hiện “chưa có thông tin” | “Dữ liệu cũ” chỉ suy ra từ freshness/lastSeen, không có nhãn “dữ liệu cũ” riêng; trạng thái offline trong phiên do đổi policy demo (10 s), không phải mất mạng thật. |
| FR-09 | P0 đề xuất thêm | SOS bỏ qua cửa sổ nghi ngã; xác nhận chống bấm nhầm; **liên hệ thủ công từ giao diện** | **thiếu một phần** | `incidents.spec.ts` T11 `sos.confirmed` mở trực tiếp; live SOS tạo cảnh báo `sos`; nút “Tôi đang hỗ trợ”/đóng hoạt động | **F3:** không có danh bạ/liên hệ khẩn cấp, không có `tel:`/số điện thoại trong `AlertDetailPage.tsx:316-317`; `GET/POST /subjects/:id/contacts` 404; chỉ có contract/bảng v2. Chống bấm nhầm và nút SOS trên thiết bị chưa có firmware/simulator tương ứng. |
| FR-10 | P0 giới hạn | AI tóm tắt/giải thích; dựa dữ liệu được phép, dẫn khoảng; thiếu dữ liệu nói rõ; tắt AI không ảnh hưởng cảnh báo | **đã kiểm một phần** | `assistant.spec.ts` 13 test (fallback, quyền, HR null, từ chối chẩn đoán, rate limit, audit, fake adapter); live summary `12`, empty range trả “Không có dữ liệu đo trong khoảng…”, câu hỏi chẩn đoán bị từ chối; AI 404 sau thu hồi; SOS vẫn tạo cảnh báo khi AI degraded | **F5:** schema/live summary không có `coverage`, `missing_data`, `limitations` như docs/07 §27; summary 7 ngày không nêu 3 khoảng thiếu/83.4% (dù lịch sử có). Không có nút/toggle tắt AI trên UI (chỉ `AI_BASE_URL` env). Không có test prompt injection (docs/08 T-11), không có RAG (ngoài v1). |
| FR-11 | P0 | Admin tối thiểu: tài khoản, thiết bị, cấu hình, audit; không xem sức khỏe bằng role admin | **đã kiểm một phần** | `admin.spec.ts` T1–T7, `tasks.spec.ts` T1–T7; live `20` overview/users/policy/audit; `21` admin `/app/history` không lộ hồ sơ; admin subject detail/alerts 404; policy preview/publish `26`/`27` có audit | **F2:** AdminPage chỉ có 4 tab `Tổng quan/Người dùng/Chính sách/Audit` (`AdminPage.tsx:54-61`), không có tab thiết bị dù API `GET/POST /admin/devices`, claim-code, rotate-key có thật. Overview chỉ có số online/offline, không có firmware/lỗi ingest/gửi như docs/06. Tạo task chỉ có contract v2, chưa có API/UI. |
| FR-12 | P1 | Thông báo khi đóng trình duyệt (Web Push) | **không thuộc v1** | Không có service worker/Web Push trong `apps/web/src`/`apps/api/src`; outbox channel mặc định `in_app`; UI ghi rõ “chỉ hiển thị khi trang đang mở” (`DashboardPage.tsx:343-345`, `AppShell.tsx:262`); docs/14 §2 loại Web Push khỏi v1 | Đúng là chưa làm; chỉ sai nếu báo cáo nghiệm thu nói đã có. Cần chốt có đưa vào phạm vi bảo vệ hay không. |
| FR-13 | P1 | Ngưỡng chỉ số cấu hình được; có nguồn/phiên bản, chống lặp; không cài ngưỡng y khoa tùy ý | **thiếu** | `docs/02:34`; chỉ có policy `device_runtime` (`packages/contracts/src/policies.ts`, `policyKeys = ['device_runtime']`); live `GET /admin/policies/alert_thresholds` và `fall_detection` = 404; admin T4/T5/T7 gắn nhãn FR-13 cho policy thiết bị; web alerts/SSE cũng gắn nhãn FR-13 | **F7:** không có ngưỡng chỉ số sức khỏe/ngưỡng phát hiện ngã; “FR-13” bị dùng cho 3 hành vi khác nhau (policy device_runtime, 409 cảnh báo, SSE). Cần chốt “ngưỡng chỉ số” là vận hành thiết bị hay y khoa. |
| FR-14 | P0 thiết kế, trước dữ liệu thật | Xuất, lưu trữ, xóa; kiểm quyền; phạm vi gồm bản sao/AI/cache/backup | **thiếu một phần** | Export CSV: `measurements.spec.ts` (header/BOM/audit/quyền), live caregiver 200 + audit `measurement.export`; UI `HistoryPage.tsx:153-160`; xóa/lưu trữ: `POST /subjects/:id/deletion-requests` 404, `DELETE /subjects/:id` 404, không có audit action xóa; docs/04:97 có endpoint dự kiến; docs/14:24 nói “v1 chỉ ghi audit cho yêu cầu xóa” | **F4:** không có yêu cầu xóa/lưu trữ/retention, không có UI/API; câu docs/14 §2 chưa khớp thực tế. Export caregiver mới chấp nhận share bị 403 (F1); export là CSV đồng bộ, không phải job có hạn/tiến trình như docs/04. |

---

## 4. Bảng truy vết yêu cầu chất lượng (NFR)

| ID | Yêu cầu | Trạng thái | Bằng chứng đã chạy | Khoảng trống |
| --- | --- | --- | --- | --- |
| NFR-01 | Quyền theo hồ sơ cho REST, realtime, export, AI | **đã kiểm** | Live: caregiver không share → 404; admin subject → 404; sau thu hồi cả 4 đường 404; SSE `revoked`; test `care.spec.ts`, `subjects.spec.ts`, `assistant.spec.ts`, `sse.spec.ts` | Không có test xuyên 4 đường trong **một** kịch bản thu hồi; tôi đã chạy tay và ghi `api-check.json`. |
| NFR-02 | Trùng lặp, lỗi mạng, khởi động lại, thứ tự | **đã kiểm một phần** | `ingest.spec.ts` (duplicate/conflict/boot-sequence), `incidents.spec.ts` T5/T6, `notifications.spec.ts` N1–N3; live duplicate SOS | Chưa test worker crash/restart giữa transaction; chưa có broker/MQTT thật; retry outbox mới test trong DB, chưa qua tiến trình bị kill. |
| NFR-03 | Thời gian giải thích được: device/server clock, độ mới, nhận trễ | **đã kiểm một phần** | `ingest.spec.ts` unsynced/late; `HistoryPage.tsx:251-275` hiện “Không rõ giờ đo”, “Đồng hồ chưa đồng bộ”, “Nhận trễ”; `AlertDetailPage.tsx:189` hiện “cảnh báo nhận trễ” | Docs/06 yêu cầu cảnh báo trễ “nêu chưa rõ tình trạng hiện tại”; UI chỉ gắn pill, chưa có câu đó. |
| NFR-04 | Dễ thao tác với người cao tuổi, chữ rõ, không chỉ dùng màu, bàn phím | **chưa kiểm đầy đủ** | 390px overflow = 0 (`16`), skip link, focus-visible, `aria-pressed`, bảng có caption, màu kèm chữ; `TextSizeToggle.test.tsx`, `AppShell.test.tsx` | Chưa thử với người cao tuổi/người chăm sóc thật (docs/06 đã thừa nhận); chưa đo contrast; chưa thử 320px/Safari/Firefox. |
| NFR-05 | TLS, secret ngoài Git, log tối thiểu, giới hạn truy cập, thu hồi | **đã kiểm một phần** | Cookie HttpOnly/SameSite/Secure(prod), scrypt, CSRF Origin, không có `.env`/secret trong Git, audit lọc metadata; live role checks | Chưa có TLS/termination thật, chưa kiểm log production, chưa có secret rotation; docs/14 §2 đã loại TLS production khỏi v1. |
| NFR-06 | Backup/restore, retry hữu hạn, trạng thái gửi, bộ đếm mất mẫu | **đã kiểm một phần** | `notifications.spec.ts` N1–N3 (sent/superseded/failed), outbox attempts/backoff, admin overview có pending/failed; `ingest` rejected không tạo row | Không có backup/restore, không có job giám sát mất mẫu, không có cảnh báo vận hành; docs/14 §2 loại backup production. |
| NFR-07 | p95 ≤ 5 s từ server nhận confirmed đến dashboard online | **chưa kiểm** | Không có instrumentation p50/p95 trong `apps/api/src`/`apps/web/src`; không đo trong phiên | Chưa có số đo, chưa tách cửa sổ hủy/truyền/xử lý/hiển thị; docs/02 ghi là đích đề xuất. |

---

## 5. Đối chiếu tuyên bố docs/14 §10–11 với thực tế

| Tuyên bố (nguồn) | Thực tế kiểm được | Kết luận |
| --- | --- | --- |
| API có … auth, care, devices, ingest, measurements, incidents, outbox/SSE, studio, assistant, maintenance, admin policy (`docs/14:167-170`) | Có route/controller/service; 14 suite/100 test pass; live các luồng chính | **Đúng ở mức code + test**, trừ các khoảng trống FR-09/13/14. |
| Web có … landing, dashboard, history, alerts+SSE, subjects, devices, share, notifications, studio, assistant, tasks, admin; trạng thái rỗng/lỗi/mất quyền (`docs/14:168`) | Có route; live `01`–`34`; admin `20`–`27`; mất quyền `39` | **Đúng phần lớn**; thiếu trạng thái UI docs/06 (F8), admin device UI (F2), lỗi trùng empty state (F9). |
| Simulator `fall cancel/confirm/duplicate/late/sos`, queue retry, chạy end-to-end (`docs/14:169`) | `npm test` 23 pass; live `fall --mode confirm` 2 request accepted; code `app.ts` có 5 mode | **Đúng**; chưa có broker/firmware thật. |
| Seed idempotent: 3 user/2 hồ sơ/1 thiết bị/6 ngày telemetry/3 incident/2 task/2 outbox (`docs/14:170`) | Seed lần 1 đúng; lần 2 devices/incidents/tasks/outbox = 0, telemetry 1681; test `seed.spec.ts` pass | **Đúng idempotent**; summary seed hard-code `assignments:1`, `careLinks:1` nên dễ đọc sai là “thêm mới” (xem §7.3). |
| “Code-split frontend chưa làm; bundle >500 kB” (`README:90`, `docs/14:191`, `docs/14:208`) | `router.tsx` dùng `lazy()`; build main **264.75 kB**, trang tách chunk; commit `8434d66` có mục đích tách chunk; **không còn cảnh báo >500 kB** | **Sai/stale** — docs và README chưa cập nhật sau `8434d66`. |
| “Chưa có `agent_runs/run_steps`” (`docs/14:190`) | Schema có `agent_runs`, `run_steps`, `step_attempts`, `delegations`; migration `0000_zippy_khan.sql` tạo bảng; **chưa có API/runtime** | **Diễn đạt sai**: bảng có, tính năng chưa có. Cùng docs/14 §5 lại liệt kê các bảng này (`docs/14:74,83`). |
| “v1 chỉ ghi audit cho yêu cầu xóa và nêu giới hạn” (`docs/14:24`) | Không có endpoint deletion/archive, không có audit action xóa; `POST /deletion-requests` / `DELETE /subjects/:id` = 404; chỉ export có audit | **Không khớp thực tế** — nếu đây là chủ trương “chỉ ghi audit” thì phải ghi rõ chưa triển khai; cần sửa docs hoặc implement audit-only request. |
| §11: P2-1/P2-2/P2-3/P2-5 đã sửa (`docs/14:208`) | P2-1/P2-2/P2-5 xác nhận code + live (SharePage chặn non-owner; Admin tabs `role="group"` + `aria-pressed`; copy clipboard có thông báo lỗi); P2-3 xác nhận code `HistoryPage.tsx:54-60` refresh `now` mỗi phút nhưng chưa quan sát qua nửa đêm | **Đúng một phần**; P2-4 (code-split) đã làm nhưng docs còn ghi “việc tiếp theo”; P2-3 mới xác nhận code. |
| §11: lỗi 404 nhất thời trang lời mời “chưa kết luận” | Phiên này chạy đủ **mời → đăng ký → chấp nhận → thu hồi** qua UI, không tái hiện 404 nhất thời; token hợp lệ 200; token sai/ngắn trả 422/404 | **Không tái hiện**; nhưng token ngắn cho thông báo sai (F9). |
| Docs/14 §10 có hai mục “## 10” | `## 10. Định nghĩa hoàn thành v1` (`:153`) và `## 10. Trạng thái triển khai` (`:161`); §11 ở `:200` | **Lỗi cấu trúc tài liệu** — dễ trích dẫn sai mục. |
| `docs/04:97` có `POST /subjects/{id}/exports`, `deletion-requests`; lỗi `request_id` (`docs/04:100`) | Thực tế export là `GET /subjects/:id/export.csv` (docs/14 §6 đúng); lỗi trả `requestId` (camelCase), không phải `request_id` | **Lệch docs/04**; docs/14 là bản gần đúng hơn. |
| `docs/06:49-55` liệt kê 8 trạng thái UI | Có “chưa từng dữ liệu”, “pin chưa biết”, “offline”, “AI lỗi/bị tắt”; **thiếu** “Candidate thiếu kết quả/Chưa xác định”, “Kênh thông báo lỗi”, một phần “nhận cảnh báo trễ” | **Thiếu 3 trạng thái** (F8). |
| `docs/11:14,49,94,97` preview + người có quyền chấp nhận | Studio có draft/preview/publish/rollback + CAS; nhưng người tạo view tự publish, không có bước “người khác chấp nhận”; admin publish view global | **Có preview, thiếu approval độc lập** — cần chốt ai duyệt (F/ambiguity). |
| Docs/14 §10 “Chính sách ẩn suspected, ngưỡng trễ, quyền admin… cần chốt” | `suspected` bị ẩn khỏi list/detail (test T1); late threshold nằm trong policy `lateEventMinutes`; admin subject 404 | **Đã là quyết định kỹ thuật**, không còn “chưa làm”; vẫn cần giảng viên xác nhận chính sách. |

---

## 6. Yêu cầu bị mất giữa docs và UI/API

1. **FR-09 — liên hệ khẩn cấp/thủ công:** docs/02:30 và docs/06:17,41 yêu cầu “liên hệ thủ công”; UI chỉ có câu “gọi cấp cứu theo số địa phương” (`AlertDetailPage.tsx:316-317`), không có danh bạ, số điện thoại, `tel:`. Contract/bảng `emergency_contacts` mới chỉ ở v2 (`0d669a1`), API 404. Đây là yêu cầu P0 “đề xuất thêm” bị bỏ khỏi v1 mà không ghi rõ trong docs/14.
2. **FR-14 — xóa/lưu trữ/retention:** docs/04:97 có endpoint deletion-requests; docs/14:24 ghi audit-only; thực tế không có route/UI/audit. Export CSV có, nhưng không phải quy trình xóa/lưu trữ.
3. **FR-11/FR-03 — quản lý thiết bị admin:** docs/02:13 ghi admin quản lý thiết bị; docs/14:96 liệt kê `GET/POST /admin/devices`, claim-code, rotate-key; API có thật, **UI không có tab/thiết bị**. Hệ quả: chỉ thiết bị seed dùng được; sau release không có đường UI cấp mã mới; không chuyển thiết bị.
4. **FR-13 — ngưỡng chỉ số:** docs/02:34 yêu cầu ngưỡng có nguồn/version/chống lặp; chỉ có policy vận hành `device_runtime`; không có ngưỡng sức khỏe/ngã, không có UI/API key tương ứng. Đồng thời “FR-13” bị gắn sai cho cảnh báo/SSE/studio.
5. **docs/06 — trạng thái UI:** “Candidate thiếu kết quả/Chưa xác định” (docs/06:54) bị ẩn 404; “Kênh thông báo lỗi” (docs/06:55) không hiện vì API chỉ trả `sent`; “nhận cảnh báo trễ” thiếu câu “chưa rõ tình trạng hiện tại” (docs/06:53).
6. **docs/06 — danh sách hồ sơ của người thân:** yêu cầu “ai có cảnh báo, dữ liệu mới lúc nào, có quyền gì” (docs/06:15); `SubjectsPage.tsx` chỉ hiện role/permissions, không hiện cảnh báo/dữ liệu mới.
7. **docs/06 — admin tình trạng hệ thống:** yêu cầu thiết bị online/offline, phiên bản, lỗi ingest/gửi; admin overview chỉ có số đếm online/offline (`AdminPage.tsx:63-122`), không có danh sách/firmware/lỗi ingest.
8. **docs/11 — preview được chấp nhận:** Studio cho preview và publish nhưng người tạo tự publish; chưa có bước người có quyền khác chấp nhận. Cần chốt đây là “self-accept” hay thiếu approval.
9. **docs/11 — quản lý tài khoản/phiên:** contract v2 có `PATCH /me`, đổi mật khẩu, danh sách/thu hồi phiên (`0d669a1`), nhưng chưa có API/UI; docs/11 không đặt thành FR nên chỉ ghi nhận là backlog v2, không tính là thiếu v1.
10. **FR-10 — tắt AI:** chỉ có env `AI_BASE_URL`; không có toggle/UI/admin policy cho bật/tắt AI. Nếu yêu cầu “tắt AI” là thao tác người dùng/quản trị thì thiếu; nếu là cấu hình triển khai thì cần ghi rõ.

---

## 7. Top 10 khoảng trống ưu tiên

### F1 — P1: Caregiver vừa chấp nhận share bị 403 lịch sử và CSV

- **Yêu cầu liên quan:** FR-02, FR-05, FR-14; docs/02 “giới hạn khoảng lịch sử”, “quyền người yêu cầu được kiểm tra”.
- **Tái hiện (đã chạy):** owner tạo lời mời `historyDays=2` → tài khoản mới đăng ký → chấp nhận → mở `/app/history` ngay. UI hiện “Không tải được dữ liệu đo — Khoảng thời gian yêu cầu vượt quá quyền xem lịch sử được chia sẻ” (`35-history-new-caregiver.png`); CSV cũng 403.
- **Bằng chứng API:** `GET /subjects/A/measurements?from=now-24h` → 403; **không** gửi `from` → 200 và coverage bắt đầu từ `sharedFrom`; `GET /export.csv` → 403 (mặc định 24 h); `assistant/summary` → 200 và được kẹp (server) — cho thấy lỗi nằm ở client gửi `from` + export default.
- **Nguyên nhân code:** `HistoryPage.tsx:68` chỉ kẹp theo `historyDays`, không biết `sharedFrom`; `format.ts:98-109`; `access.service.ts:101-112` từ chối `from < effectiveFrom`; `measurements.service.ts:72-80` có chủ ý kẹp khi **không** truyền from (comment nói rõ “không 403 khi caregiver vừa accept”), nhưng UI luôn truyền; `exportCsv` (`:221-227`) không kẹp mặc định.
- **Hệ quả:** luồng mời/chấp nhận trông “đã chia sẻ” nhưng người thân không xem được lịch sử/không tải được CSV trong ít nhất 24 h; dashboard hiện “chưa nhận dữ liệu”/0% dù dữ liệu cũ tồn tại trước mốc share (`33-dashboard-new-caregiver.png`).
- **Đề xuất kiểm/sửa:** dùng `effectiveFrom` từ response/status hoặc bỏ `from` khi chưa có mốc; trả về khoảng khả dụng; export dùng cùng logic kẹp; thêm test E2E cho caregiver vừa accept. **Cần chốt** `sharedFrom` là mốc chấp nhận chính xác hay đầu ngày (xem §8).

### F2 — P1: Vòng đời thiết bị không hoàn tất trên UI

- **Yêu cầu:** FR-03, FR-11; docs/02:13; docs/14:96.
- **Bằng chứng:** API `GET/POST /admin/devices`, `POST /:id/claim-code`, `POST /:id/rotate-key` có thật (live tạo 201, claim 201); owner claim/release UI `43`/`44`; sau release mã cũ 422 `45`; nhưng `AdminPage.tsx:54-61` chỉ có 4 tab, không có thiết bị; không có nút tạo thiết bị/cấp mã/rotate.
- **Hệ quả:** từ DB rỗng, người dùng UI không thể tạo thiết bị mới; chỉ dùng thiết bị seed. “Chuyển thiết bị” = release + admin API cấp mã + claim, không có UI; owner không tự lấy được mã mới sau release. Demo FR-03 chỉ chạy được nhờ seed.
- **Đề xuất:** thêm tab Quản trị thiết bị (list/create/claim-code/rotate, audit) **hoặc** ghi rõ API-only và hạ phạm vi FR-03/11; thêm test chuyển chủ và dữ liệu cũ không sang hồ sơ mới.

### F3 — P1: Thiếu liên hệ khẩn cấp/thủ công trong chi tiết cảnh báo

- **Yêu cầu:** FR-09 P0 (đề xuất thêm), docs/06:17/41.
- **Bằng chứng:** `AlertDetailPage.tsx:316-317` chỉ có câu “gọi cấp cứu theo số khẩn cấp địa phương — ứng dụng không tự gọi”; không có số/`tel:`/danh bạ; `GET/POST /subjects/:id/contacts` = 404; `emergency_contacts` chỉ có schema/contract v2 (`0d669a1`); UI không có màn hình quản lý liên hệ.
- **Hệ quả:** hành trình “cảnh báo → chọn Tôi đang hỗ trợ → liên hệ thủ công → đóng” (docs/06:41) dừng ở bước liên hệ; người thân phải tự tìm số ngoài ứng dụng.
- **Đề xuất:** chốt có làm trong v1/v2; nếu làm: CRUD liên hệ có quyền theo hồ sơ, hiện trong alert detail với `tel:`, cảnh báo dữ liệu nhạy cảm; nếu không: ghi rõ ngoài phạm vi và bỏ khỏi tiêu chí P0.

### F4 — P1: Không có xóa/lưu trữ/retention; docs/14 §2 chưa khớp thực tế

- **Yêu cầu:** FR-14; docs/04:97; docs/14:24.
- **Bằng chứng:** endpoint deletion/archive 404; không có audit action xóa (danh sách action chỉ có auth/care/device/incident/export/policy/studio); không có UI; không có retention config; export CSV có audit (`measurement.export`).
- **Hệ quả:** không thể chứng minh “quyền người yêu cầu được kiểm tra; phạm vi xóa gồm bản sao, AI, cache, backup”. Câu trong docs/14 §2 dễ làm người đọc tin đã có audit-only request.
- **Đề xuất:** hoặc implement `POST /subjects/:id/deletion-requests` + audit + policy/retention (kể cả AI/cache/backup), hoặc sửa docs/14 §2 và ghi FR-14 là “export only, deletion out of v1”; không để tuyên bố trung gian.

### F5 — P1: AI summary không nêu coverage/missing data/limitations

- **Yêu cầu:** FR-10 “thiếu dữ liệu thì nói rõ”; docs/07:21,27; docs/08 T-11.
- **Bằng chứng:** `packages/contracts/src/assistant.ts` chỉ có `headline/sections/sources/degradedReason`, không có `coverage/missing_data/limitations`; live summary 7 ngày `12` nói “1681 mẫu đo, nhịp tim trung bình… 3 cảnh báo” nhưng **không** nêu 3 khoảng thiếu/83.4% (lịch sử `24` có); empty range mới nói “Không có dữ liệu đo trong khoảng…”.
- **Hệ quả:** tóm tắt có thể trông đầy đủ trong khi 16.6% thời gian thiếu; trái với yêu cầu “không suy luận sức khỏe bình thường từ dữ liệu thiếu” (docs/07).
- **Đề xuất:** thêm coverage/gaps/missingData vào contract + template/adapter facts; test ngày thiếu 80%, gap giữa kỳ, prompt injection; không cần RAG trong v1.

### F6 — P1: Docs/14 §10–11 và README lệch thực tế

- **Bằng chứng:** code-split đã có (`router.tsx` lazy; build 264.75 kB) nhưng `README:90`, `docs/14:191,208` nói chưa làm/>500 kB; `docs/14:190` nói chưa có `agent_runs/run_steps` trong khi schema/migration có; `docs/14:24` nói audit xóa nhưng không có; hai mục `## 10` (`:153`, `:161`); docs/04 `request_id` vs `requestId`; HTML `--check` không chạy được vì thiếu module `markdown`.
- **Hệ quả:** người chấm/người tiếp nhận không biết tuyên bố nào đúng; review trước đã đóng P2 nhưng docs chưa cập nhật.
- **Đề xuất:** sửa docs nguồn + regenerate HTML + chạy `--check`; gắn mục “đã kiểm/đã đóng” theo commit; không dùng worklog thay docs.

### F7 — P2: FR-13 bị hiểu sai/không có ngưỡng chỉ số

- **Bằng chứng:** `docs/02:34`; `policies.ts` chỉ `device_runtime`; live 404 cho `alert_thresholds`/`fall_detection`; admin T4/T5/T7 gắn FR-13 cho policy thiết bị; web alerts/SSE gắn FR-13 cho 409/SSE; `studio.spec` gắn FR-07; `DevicesPage.test` gắn FR-06; tasks gắn FR-11.
- **Hệ quả:** không biết FR-13 đã đáp ứng hay chưa; nếu giảng viên hỏi “ngưỡng chỉ số ở đâu” thì chỉ có ngưỡng vận hành thiết bị, không phải ngưỡng sức khỏe; ID trace không đáng tin.
- **Đề xuất:** chốt định nghĩa FR-13 (vận hành vs y khoa); nếu là y khoa, thêm config có nguồn/version/duyệt, không tự đặt ngưỡng; nếu là vận hành, sửa wording FR-13 và test ID.

### F8 — P2: Thiếu trạng thái UI docs/06

- **Bằng chứng:** `suspected` bị 404 khỏi list/detail (`incidents.service.ts:688-696`, test T1) → không có “Chưa xác định”; notifications API chỉ trả `status='sent'` (`notifications.service.ts:197`), UI không có “chưa gửi/đang thử/hết lượt”; alert detail chỉ thêm “cảnh báo nhận trễ” (`AlertDetailPage.tsx:189`), thiếu “chưa rõ tình trạng hiện tại”; subjects list không có cảnh báo/dữ liệu mới.
- **Hệ quả:** người dùng không phân biệt được “chưa có kết quả” với “an toàn”, không biết thông báo đã gửi hay chưa; trái docs/06.
- **Đề xuất:** hiện state cho suspected (hoặc ghi rõ ẩn có chủ đích), hiện outbox status/attempts cho người nhận/admin, bổ sung câu “chưa rõ tình trạng hiện tại”, bổ sung cột last-data/alert trong danh sách hồ sơ.

### F9 — P2: Lỗi UI quan sát được

- **Empty state trùng:** sau thu hồi, `SubjectSwitcher.tsx:54` và `DashboardPage.tsx:87` cùng render “Chưa có hồ sơ nào” + 2 nút “Tạo hồ sơ” (`39-caregiver-after-revoke.png`).
- **Chữ lặp:** “chưa có mẫu hợp lệ (tín hiệu tín hiệu kém)” do `HR_QUALITY_LABELS.poor_signal = 'tín hiệu kém'` + prefix `tín hiệu` (`DashboardPage.tsx:34,308`; `41`).
- **Copy một thiết bị vs nhiều thiết bị:** `DevicesPage.tsx:230` ghi “Mỗi hồ sơ có thể gắn một thiết bị đeo” nhưng UI cho claim thêm và hiển thị 3 thiết bị (`43`); API/schema không giới hạn.
- **Pin summary đa thiết bị:** `measurements.service.ts:212` lấy mẫu cuối ngày; khi thiết bị mới có pin null, summary hiện “Chưa có thông tin pin” dù thiết bị cũ 86% (`41`).
- **Token lời mời ngắn:** `invitationTokenSchema` min 20 (`packages/contracts/src/care.ts:5`) → token <20 ký tự trả 422; `InvitePage.tsx:70` chỉ nhánh 404 mới hiện “Lời mời không hợp lệ”, còn lại hiện “Không kết nối được máy chủ” (`23`). Token 20+ sai mới hiện đúng (`25`).
- **Đề xuất:** sửa copy/typography, mapping lỗi 422→“Lời mời không hợp lệ”, quyết định một/multi-device và logic battery theo thiết bị.

### F10 — P2: Khoảng trống truy vết và test

- **Bằng chứng:** docs/08 có T-01…T-14 nhưng không test nào chứa `T-0x`; test dùng T1…T12 trùng số giữa suite; FR ID bị gắn sai (F7); `docs/14:137` (cổng §8) yêu cầu ID trong tên test/handoff nhưng `devices.spec.ts`/`measurements.spec.ts` không gắn FR-03/04/05.
- **Thiếu test:** không có test cho `DashboardPage`, `SharePage`, `NotificationsPage`, `InvitePage`, `RegisterPage`; không có test FR-12 (P1, có thể chấp nhận out v1), FR-13, deletion/retention FR-14, NFR-04 (người cao tuổi), NFR-07 (p95); không có prompt injection; không có crash/restart outbox.
- **E2E:** repo chỉ 4 test (2 smoke, 2 alerts mock API); không có E2E thật cho login→dashboard→alert→share→revoke. Tôi phải viết script ngoài repo để kiểm.
- **Đề xuất:** lập bảng trace FR→test ID (một nguồn), thêm test trang thiếu, E2E thật với API riêng, ghi rõ phần out-of-scope.

---

## 8. Yêu cầu mơ hồ / cần chốt (không tự biến thành cam kết)

1. **FR-02 “yêu cầu tiếp theo”**: là flow xin thêm quyền của người thân, hay chỉ là bước chấp nhận lời mời? Hiện không có flow xin thêm quyền.
2. **`sharedFrom`**: mốc chấp nhận chính xác hay đầu ngày? Có cho caregiver xem dữ liệu/ cảnh báo trước mốc share trong cùng ngày không? Hiện code dùng đúng thời điểm accept, gây dashboard trống/403 (F1).
3. **FR-03 một thiết bị/hồ sơ**: docs/04 cho phép nhiều assignment; UI ghi một thiết bị. Cần chốt số thiết bị, quy tắc chuyển chủ, mã claim sau release.
4. **FR-05 lọc ngày**: preset 24h/7d/30d có đủ “lọc ngày/khoảng thời gian” không? Có cần chọn ngày tùy ý/so sánh hai khoảng?
5. **FR-09**: “liên hệ thủ công” là danh bạ trong app + `tel:`, hay chỉ hiển thị hướng dẫn gọi? “Xác nhận chống bấm nhầm” nằm trên thiết bị (firmware) hay app? P0 “đề xuất thêm” có bắt buộc trong v1?
6. **FR-10 tắt AI**: tắt bằng env triển khai đủ chưa, hay cần toggle theo hồ sơ/workspace + audit? Output bắt buộc coverage/missing_data/limitations? Câu hỏi cấp cứu có phải luôn kèm hướng dẫn liên hệ?
7. **FR-13**: “ngưỡng chỉ số” là ngưỡng sức khỏe (HR/ngã) hay ngưỡng vận hành (offline/freshness/rate)? Ai được sửa, nguồn nào, có cần duyệt y khoa, chống lặp thế nào?
8. **FR-14**: xóa cứng hay archive/soft-delete; xóa gì (telemetry, incident, AI summary, outbox, audit); retention bao lâu; backup/AI cache xử lý ra sao; export có hạn/tiến trình không? docs/12 đã cảnh báo không tự chọn soft-delete.
9. **FR-11**: admin có được xem dữ liệu sức khỏe khi có lý do hỗ trợ không? Hiện 404 tuyệt đối; cần xác nhận với giảng viên.
10. **FR-12**: Web Push có nằm trong phạm vi bảo vệ không? Nếu có, cần nền tảng mục tiêu, trạng thái gửi thất bại, không hứa “đã đọc”.
11. **Studio approval**: ai là người chấp nhận view cá nhân/view dùng chung? Hiện người tạo tự publish; docs/11:97 vẫn mở.
12. **Suspected visibility**: ẩn hoàn toàn hay hiện “Chưa xác định” cho người có quyền? docs/06:54 nghiêng về hiện; code đang ẩn.
13. **Task bảo trì**: không có FR riêng trong docs/02; là phần FR-11 hay yêu cầu bổ sung? Tạo task mới chỉ có contract v2.
14. **NFR-04/07**: cần bao nhiêu người thử, tình huống nào, p95 đo trên mạng/dữ liệu nào? Docs chỉ là đích đề xuất.

---

## 9. Ghi chú kỹ thuật khác (không xếp top 10)

- **HEAD lệch spec:** worktree `ffb6d87` thay vì `8434d66`; v2 contracts/schema (`0d669a1`) đã có trước API/UI. Trong báo cáo này, mọi endpoint v2 (`insights`, `contacts`, `PATCH /me`, `sessions`, `POST /maintenance-tasks`) đều 404 — không được tính là “đã có tính năng”.
- **`apps/api/package.json:31`** khai báo `"@nestjs/testing": null` trong `dependencies` (và đúng version ở `devDependencies:35`). pnpm bỏ qua nhưng đây là manifest không hợp lệ với npm; nên xóa dòng null.
- **Seed summary** (`seed.ts:188-198`) hard-code `assignments: 1`, `careLinks: 1`; lần seed thứ hai vẫn in 1 dù không thêm mới, dễ đọc sai idempotency. Test `seed.spec.ts` vẫn đúng.
- **Build:** `ErrorState` chunk 230.68 kB (do shared import), main 264.75 kB; không còn cảnh báo >500 kB nhưng nên xem lại chunk name/tách vendor.
- **Docs HTML:** `tools/docs/build.py --check` không chạy do thiếu Python `markdown`; không kết luận HTML khớp nguồn. HTML hiện vẫn chứa tuyên bố bundle >500 kB/code-split cũ (cùng nguồn docs).
- **Không có** `.github/workflows`/CI; các cổng trong docs/14 §8 là chạy tay. Không có lint script.
- **Không thấy** service worker/Web Push, TLS termination, backup/restore, metrics/p95 — đúng như docs/14 §2 đã loại, nhưng phải giữ là “chưa có” khi báo cáo.

---

## 10. Phụ lục ảnh / artifact (ngoài repo)

Thư mục: `%LOCALAPPDATA%\Temp\annhien-v2trace\`

| Ảnh | Nội dung | Kết quả |
| --- | --- | --- |
| `shots\01-landing.png` | Landing, nhãn demo | Bình thường |
| `shots\02-login-error.png` | Sai mật khẩu | Thông báo lỗi đúng |
| `shots\03-dashboard-owner.png` | Dashboard owner | Cảnh báo mở, HR/steps/pin, nhãn mô phỏng |
| `shots\04-history-24h.png` | Lịch sử 24h | 0 khoảng thiếu, bảng + chart |
| `shots\24-history-7d.png` | Lịch sử 7 ngày | 3 khoảng thiếu, 83.4%, chú giải chữ |
| `shots\06-alerts-list.png`, `07-alert-detail.png` | Cảnh báo + chi tiết | Ack/resolve; **không có liên hệ/điện thoại** |
| `shots\09-share-owner.png` | Chia sẻ owner | Form mời + quyền |
| `shots\29`–`34` | Mời → đăng ký → chấp nhận → token dùng lại | Luồng UI chạy được; token một lần |
| `shots\35-history-new-caregiver.png` | Caregiver vừa accept, lịch sử 24h | **403 “vượt quá quyền xem lịch sử”** (F1) |
| `shots\38`/`39` | Trước/sau thu hồi | SSE revoked, dữ liệu xóa; **2 empty state trùng** (F9) |
| `shots\41-dashboard-two-devices-null-pin.png` | 2 thiết bị, pin null, HR poor | “tín hiệu tín hiệu kém”; summary pin “Chưa có thông tin” dù thiết bị khác 86% |
| `shots\42-devices-two-devices.png` | Danh sách 2 thiết bị | Copy “mỗi hồ sơ một thiết bị” mâu thuẫn |
| `shots\43`–`45` | Claim/release/claim lại | Claim/release UI OK; claim lại mã cũ 422; không có UI cấp mã mới (F2) |
| `shots\26`/`27` | Policy preview/publish | Có warning/diff/version/audit; FR-13 vận hành |
| `shots\28-dashboard-offline-policy.png` | Offline sau policy 10 s | “Ngoại tuyến”, last seen rõ |
| `shots\20`/`21` | Admin overview/history | Admin không lộ hồ sơ; 4 tab, không có thiết bị |
| `shots\23`/`25` | Token lời mời ngắn/20+ | Ngắn: báo “không kết nối”; 20+: “Lời mời không hợp lệ” |
| `api-check.json` | 40+ status API (quyền, share, revoke, SOS, policy, endpoint thiếu) | Dùng cho F1/F3/F4/F7 |
| `ui-check.json`…`ui-check8.json` | Text/console/HTTP lỗi của các luồng UI | Dùng cho F9, F10 |

**Không kết luận:** độ chính xác phát hiện ngã, thời lượng pin, BOM/giá, độ khả dụng người cao tuổi, PostgreSQL/MQTT production, Web Push, TLS/backup, p95. Đây là các giới hạn đã nêu trong docs/14 §2 và README, không phải “đã đạt”.

---

## 11. Tóm tắt 5 dòng

1. Đã chạy lại typecheck, 100 test API, 73 test web, 23 test simulator, 4 E2E và các luồng UI/API thật trên DB tạm; phần lớn FR-01/04/07/08, NFR-01/02/03 có bằng chứng thực thi.
2. Khoảng trống nặng nhất: caregiver vừa chấp nhận share bị 403 lịch sử/CSV (F1); thiếu UI quản lý thiết bị/claim-code khiến FR-03/11 chỉ chạy được nhờ seed (F2); thiếu liên hệ khẩn cấp (F3); thiếu xóa/lưu trữ dù docs/14 §2 ghi có audit (F4); AI summary không nêu coverage/gaps (F5).
3. Docs/14 §10–11 và README còn tuyên bố stale/sai (code-split đã làm, bundle 264.75 kB, `agent_runs` có bảng, deletion audit không có, hai mục `## 10`); HTML `--check` chưa chạy được vì thiếu Python `markdown`.
4. FR-13 bị dùng cho ba hành vi khác nhau và chưa có ngưỡng chỉ số; docs/06 còn thiếu trạng thái “Chưa xác định”, “kênh thông báo lỗi”, một phần “cảnh báo trễ”; test trace thiếu T-xx và test cho các trang/FR còn lại.
5. Chưa đủ bằng chứng để báo v1 “đạt đầy đủ”; cần chốt các điểm mơ hồ ở §8, sửa F1–F4, cập nhật docs/HTML và bổ sung trace/test trước khi dùng dữ liệu thật hoặc bảo vệ đồ án.
