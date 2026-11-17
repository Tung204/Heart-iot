# Review độc lập v2 — tính năng đã hợp nhất

**Ngày:** 15/11/2026 (Asia/Ho_Chi_Minh) · **Reviewer:** phiên worker độc lập (dispatch `task_a07c352a95dd` / `ctx_2504c5ef20f0`) · **Vai trò:** chỉ đọc, chỉ ghi báo cáo này; không sửa code/docs/DB chính, không commit.

**HEAD:** `bf63f03` — `docs(orchestration): spec 2 reviewer độc lập v2`; worktree `C:/Users/nguye/orca/workspaces/DATN/rev-v2-features`.

## 1. Môi trường và phạm vi

| Mục | Giá trị |
| --- | --- |
| OS / runtime | Windows 11, Node `v24.22.2`, pnpm `12.5.1`, PGlite `0.5.16` |
| DB review | `.data/review-features/pglite` (seed demo: 3 user, 2 hồ sơ, 1 thiết bị, 1.681 telemetry, 3 incident, 2 task; dữ liệu test tạo thêm trong DB này) |
| API review | `http://localhost:3310/api/v1` (`node apps/api/dist/src/main.js`, `PGLITE_DATA_DIR=.data/review-features/pglite`, `WEB_ORIGIN=http://localhost:5174`) |
| Web review | `http://localhost:5174` (`vite` trong `apps/web`, `VITE_API_BASE_URL=http://localhost:3310/api/v1`) |
| App demo của lead | API `3000`, web `5173` — chỉ kiểm health/200, **không gọi thao tác ghi, không sửa DB** |
| Browser | Chromium Playwright `1.65.1`; ảnh ở `C:/Users/nguye/AppData/Local/Temp/rev-features/shots/` |
| Test hiện có | `pnpm -r typecheck` đạt; API **18 suite / 167 test** đạt; web **24 file / 123 test** đạt. Các test này chỉ dùng để đối chiếu, không thay cho kiểm trực tiếp bên dưới |

**Phạm vi đã kiểm trực tiếp:** (1) cài đặt tài khoản; (2) tạo việc bảo trì; (3) xu hướng 7/14/30 ngày; (4) liên hệ khẩn cấp; (5) thiết bị admin + preview/publish policy; (6) tái kiểm 4 lỗi đã sửa: SSE revoke, ingest quarantine, ranh giới notification, cửa sổ chia sẻ của caregiver.

**Cách kiểm:** gọi HTTP thật bằng cookie phiên (curl), đọc lại DB/API để đối chiếu, thao tác UI thật bằng Playwright, đo tràn ngang/ARIA và chụp ảnh. Các con số dưới đây là output của lần chạy này, không lấy từ handoff/test.

**Giới hạn môi trường:** PGlite một tiến trình, chưa chạy PostgreSQL thật; chưa kiểm đồng thời nhiều instance, MQTT broker/ACL/ACK, Web Push/email/SMS, Safari/Firefox/320px, đo contrast hay khả dụng người cao tuổi. DB review là DB dùng một lần; các thay đổi test (user ngoài, thiết bị, task, contact, policy v2–v4, `sharedFrom`/quyền của care link) chỉ nằm trong DB này và đã khôi phục các trường cần thiết.

## 2. Tóm tắt finding

| # | Mức | Nội dung ngắn | Trạng thái |
| --- | --- | --- | --- |
| P1-1 | **P1** | `daily-summary` vẫn ghi `steps.completeness='complete'` và cộng bước bắc qua đoạn mất dữ liệu, trong khi `insights` báo `partial` và bỏ delta bắc gap → hai số liệu người dùng thấy không khớp. Đây là P1-3 của `v2-data-integrity` tái hiện, chưa được đóng. | Mở (tái hiện) |
| P2-1 | **P2** | `POST /me/password` không có rate-limit/lockout: 20 lần sai mật khẩu hiện tại liên tiếp đều 400, sau đó vẫn đổi được bằng mật khẩu đúng; bỏ qua bộ đếm 10 lần/15 phút của login. | Mới |
| P2-2 | **P2** | Admin vẫn tạo được claim code cho thiết bị **đang gán**; code này còn hiệu lực sau khi release và dùng lại để claim thành công. UI cũng không khóa nút “Tạo mã gắn thiết bị” khi thiết bị đã gán. | Mới |
| P2-3 | **P2** | Tài liệu trạng thái v2 sai: `docs/14:174` nói “chưa có endpoint/UI tương ứng; không được báo là đã có”, trong khi các endpoint/UI đã hợp nhất; bảng API `docs/04` và danh sách màn hình `docs/06` chưa có các mục mới. | Mới (tài liệu) |

**P0: 0.** Không thấy mất dữ liệu, lộ dữ liệu sức khỏe/PII, leo thang quyền hay bypass xác thực trong phạm vi đã kiểm.

## 3. Chi tiết finding

### P1-1 — Daily summary báo “đủ dữ liệu” và cộng bước bắc qua gap; insights thì báo thiếu

**Vị trí**

- `apps/api/src/measurements/measurements.service.ts:226` gọi `computeSteps(dayRows)`; hàm `computeSteps` ở `:570-601` chỉ dựa vào delta dương của `steps_since_boot`, không biết gap/`excludedUnsyncedCount`.
- `apps/api/src/measurements/insights.ts:151-214` (v2) có xử lý gap: delta có `elapsedMs > STEPS_GAP_INTERVALS * interval` bị bỏ và ngày bị đánh `partial`.
- Yêu cầu: `docs/04-du-lieu-va-giao-tiep.md:57` — “Lần nhận đầu của boot sau một đoạn mất dữ liệu có thể không phân bổ chính xác theo ngày; đánh dấu chưa đủ dữ liệu thay vì cộng toàn bộ vào ngày nhận.”

**Tái hiện** (chủ hồ sơ An, ngày địa phương 10/11/2026):

```bash
GET /api/v1/subjects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/daily-summary?date=2026-11-10
# steps: {"total":790,"completeness":"complete","notes":[]}
# gaps: 2026-11-09T19:00:58.194Z → 2026-11-09T21:05:58.194Z (no_data), dài 2 giờ 5 phút
# coverage: observed 264 / expected 297 = 88.9%

GET /api/v1/subjects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/insights?days=7
# ngày 2026-11-10: steps {"total":780,"completeness":"partial"}, cùng coverage 264/297
# notes: "Số bước của 1 ngày là ước tính một phần do thiếu mốc thời gian hoặc counter bị đặt lại."
```

Đối chiếu chéo bằng chính dữ liệu `measurements` của cùng cửa sổ (264 mẫu): tổng delta dương **trong ngày, bỏ delta bắc gap** là **778**; delta bắc gap là **12**. `daily-summary` trả 790 = 778 + 12, tức đã cộng bước bắc gap vào ngày nhận. `insights` trả 780 (chênh 2 bước do biên ngày, nhưng đúng hướng là `partial` và không cộng toàn bộ delta gap).

**Expected:** ngày có gap 2 giờ phải `partial` (hoặc `unavailable` nếu không đủ mốc), note giải thích; không cộng 12 bước bắc gap vào ngày nhận.
**Actual:** `complete`, `notes=[]`, tổng 790; dashboard daily-history hiển thị “đủ dữ liệu” trong khi card xu hướng cùng ngày hiển thị 780 và note “ước tính một phần”.
**Ảnh hưởng:** người dùng thấy hai con số vận động khác nhau cho cùng ngày; finding P1-3 cũ vẫn mở. Đây không phải lỗi mới của endpoint insights — insights làm đúng hơn — nhưng việc không áp dụng cùng quy tắc cho daily-summary làm feature 3 không nhất quán với màn Lịch sử.

### P2-1 — Đổi mật khẩu không có rate-limit, có thể thử mật khẩu cũ không giới hạn

**Vị trí:** `apps/api/src/auth/auth.service.ts:154-225` (`changePassword`): chỉ `verifyPassword`, ghi audit failed rồi trả 400; không có bộ đếm như `assertLoginRate`/`recordFailedLogin` ở `:34` và `:383-400`. Controller: `apps/api/src/auth/auth.controller.ts:96-105`.

**Tái hiện**

1. Đăng nhập owner, giữ cookie phiên.
2. Gửi 20 lần `POST /me/password` với `currentPassword` sai, `newPassword` hợp lệ.
3. Gửi một lần với `currentPassword` đúng.

**Kết quả thật:** 20/20 lần sai đều `400` (`VALIDATION_FAILED`, “Mật khẩu hiện tại không đúng.”), không có `429`, không khóa, không delay; lần đúng vẫn `204` và thu hồi phiên khác. Audit có 39 bản ghi `auth.password_change` failed (`current_password_mismatch`) trong lượt test. Sau đó đã đổi lại mật khẩu demo.

**Expected:** sau ngưỡng (ví dụ 10 lần/15 phút như login) trả `429`/tạm khóa; hoặc ít nhất cùng bộ đếm với login.
**Actual:** không giới hạn; người giữ cookie phiên có thể brute-force mật khẩu hiện tại để đổi mật khẩu và chiếm tài khoản, trong khi login đã có chặn 10 lần/15 phút. Handoff `v2-feat-account.md` cũng ghi điểm này là “chưa làm”, nhưng đây là kiểm chứng độc lập trên HEAD.

### P2-2 — Claim code cho thiết bị đang gán vẫn được tạo và còn dùng được sau release

**Vị trí**

- `apps/api/src/devices/devices.service.ts:117-135` (`issueClaimCode`): không kiểm tra assignment đang mở, luôn ghi `claimCodeHash` mới và trả 201.
- `apps/api/src/devices/devices.service.ts:245-283` (`releaseDevice`): chỉ đóng assignment, không xóa/ghi đè `claimCodeHash`; code cũ vẫn nằm trong DB.
- UI: `apps/web/src/features/admin/AdminDevicesTab.tsx:363-371` chỉ disable theo `issueClaim.isPending`/`rotate.isPending`, không theo `assignedSubjectId`; ảnh `admin-claim-code-1280.png` cho thấy mã được tạo cho thiết bị **đã gán** hồ sơ `3e1b1496-…`.

**Tái hiện** (review DB, ngày 15/11):

1. Admin tạo `RV-CODE-LEAK-02`, nhận `C1`; owner claim `C1` → 201 (thiết bị đang gán).
2. Admin gọi `POST /admin/devices/<id>/claim-code` khi thiết bị đang gán → **201**, nhận `C2` (hết hạn sau 15 phút).
3. Owner gọi `POST /devices/<id>/release` → 200.
4. Owner gọi `POST /subjects/<subject>/devices/claim` với `C2` → **201**, thiết bị được gán lại.

**Expected:** tạo mã khi thiết bị đang gán phải `409`/khóa nút; release phải vô hiệu hóa claim code đang chờ (hoặc mã chỉ dùng được một lần và gắn với trạng thái chưa gán).
**Actual:** 201 và code dùng lại được sau release; UI vẫn hiện nút “Tạo mã gắn thiết bị” trên thiết bị đã gán (ảnh `admin-claim-code-1280.png`). Mức P2 vì chỉ admin tạo được mã, mã 15 phút và là bí mật; nhưng vòng đời pairing không còn là “một lần” như thông điệp UI.

### P2-3 — Tài liệu trạng thái v2 vẫn nói các tính năng chưa tồn tại

**Vị trí**

- `docs/14-ke-hoach-trien-khai-phan-mem.md:174`: “Nền hợp đồng v2 (`0d669a1`, chưa giao tính năng) … **Chưa có endpoint/UI tương ứng; không được báo là đã có các tính năng v2.**”
- `docs/04-du-lieu-va-giao-tiep.md:88-107`: bảng endpoint không có `/me/password`, `/me/sessions`, `/subjects/:id/insights`, `/subjects/:id/emergency-contacts`, `POST /maintenance-tasks`; dòng Bảo trì chỉ có `GET` và `close`.
- `docs/06-trai-nghiem-va-man-hinh.md:1-14`: danh sách màn hình baseline không có Cài đặt tài khoản, Xu hướng, Liên hệ khẩn cấp, tab Thiết bị admin.

**Actual:** code/UI đã hợp nhất và chạy được: `SettingsPage` (`/app/settings`), card xu hướng trên dashboard, mục liên hệ ở trang chia sẻ, tab Thiết bị trong `/app/admin`, các endpoint tương ứng. `tools/docs/build.py --check` (venv có `Markdown==3.7`) báo “Generated HTML matches current sources”, nhưng nguồn Markdown vẫn sai nội dung — đây không phải lỗi HTML stale mà là nguồn chưa cập nhật.

**Expected:** docs nguồn phản ánh tính năng đã hợp nhất; `docs/14` §10 yêu cầu “Docs nguồn được cập nhật; HTML build `--check` đạt”.
**Actual:** docs/14 nói ngược; bảng API/DS màn hình thiếu mục mới. Ảnh hưởng: người đọc/giảng viên có thể kết luận v2 chưa có; không ảnh hưởng runtime. Mức P2 vì là tài liệu, không phải lỗi chức năng.

## 4. Đã kiểm và đạt

Trong bảng dưới, “Đạt” là output thật khớp yêu cầu; các sai lệch đã ghi thành finding hoặc mục “chưa kiểm”.

### 4.1 Cài đặt tài khoản

| Kịch bản | Expected | Actual | Kết luận |
| --- | --- | --- | --- |
| Đổi tên: rỗng, 121 ký tự, field lạ | 422, không đổi | 422 cả ba; tên cũ giữ nguyên | Đạt |
| Đổi tên hợp lệ có khoảng trắng | Trim và lưu | 200, trả `"Trần Thị An"`; đã khôi phục | Đạt |
| Đổi mật khẩu: sai hiện tại / trùng hiện tại | 400, audit failed | 400, reason `current_password_mismatch` / `same_password` | Đạt |
| Mật khẩu mới <10, field lạ | 422 | 422 | Đạt |
| Đổi mật khẩu hợp lệ | 204; phiên hiện tại sống, phiên khác 401; mật khẩu cũ 401, mới 200 | Đúng; `revokedSessions` trong audit; đã đổi lại demo | Đạt |
| Danh sách phiên | Chỉ phiên sống của mình, đúng `current`, mới nhất trước | 200; đúng; không trả token/hash | Đạt |
| Thu hồi phiên hiện tại | 400 kèm thông báo | 400 “Không thể thu hồi phiên đang dùng…” | Đạt |
| Thu hồi phiên khác / lặp / id không tồn tại | 204 / 204 idempotent / 404 | Đúng; phiên bị thu hồi gọi `/me` → 401 | Đạt |
| Thu hồi tất cả trừ phiên hiện tại | 204, chỉ còn current | Đúng; audit `auth.sessions_revoke_others` | Đạt |
| Audit | Có success/failed, không có mật khẩu/token | `auth.profile_update`, `auth.password_change`, `auth.session_revoke`, `auth.sessions_revoke_others`; metadata chỉ reason/số phiên | Đạt |
| Không đăng nhập | 401 | `/me`, `/me/sessions`, `/me/password`, revoke → 401 | Đạt |
| UI | Trang Cài đặt có 3 mục, responsive | Render đủ Hồ sơ/Mật khẩu/Phiên; 360/390/chữ lớn không tràn ngang; ảnh `owner-settings-1280.png`, `owner-settings-360.png`, `large-settings-390.png` | Đạt (chưa bấm đổi mật khẩu qua browser — xem §6) |

### 4.2 Tạo việc bảo trì

| Kịch bản | Expected | Actual | Kết luận |
| --- | --- | --- | --- |
| Owner tạo task hợp lệ | 201, task xuất hiện | 201; list owner/caregiver thấy | Đạt |
| Caregiver tạo | 403 “Chỉ chủ hồ sơ…” | 403 đúng thông báo | Đạt |
| Người ngoài / admin không có link / subject không tồn tại | 404 | 404 cả ba | Đạt |
| Thiết bị không thuộc hồ sơ / không tồn tại | 400, `details.field=deviceId` | 400 đúng field | Đạt |
| `dueAt` đã qua | 400, `details.field=dueAt` | 400 đúng field; biên 20 giây tới → 201 | Đạt |
| Field lạ / title quá ngắn | 422 | 422 | Đạt |
| UI owner | Form mở, title autofocus, tạo xong hiện task | Đạt; ảnh `owner-tasks-form-1280.png`, `owner-task-created.png` | Đạt |
| UI caregiver | Chỉ xem, không có nút owner | Thấy nhãn “Chỉ xem”, không có action owner | Đạt |
| Caregiver sở hữu hồ sơ chưa gắn thiết bị | Không tạo được, giải thích | Nút submit disabled + “Hồ sơ chưa gắn thiết bị”; ảnh `care-task-form-owned-no-device.png` | Đạt |
| Mobile | Không tràn | 360/390 không tràn; ảnh `owner-tasks-360.png`, `large-tasks-390.png` | Đạt |

### 4.3 Xu hướng 7/14/30 ngày

| Kịch bản | Expected | Actual | Kết luận |
| --- | --- | --- | --- |
| `days=7/14/30` | 200, đúng số ngày | 7/14/30 đều 200; `days` trả đúng; dữ liệu 7 ngày seed | Đạt |
| `days=6/31/0/-1/abc` | 4xx | 400 `VALIDATION_FAILED` cả năm | Đạt (xem ghi chú API: 400 thay vì 422) |
| Người ngoài / chưa đăng nhập | 404 / 401 | Đúng | Đạt |
| Tổng hợp 7 ngày | Khớp dữ liệu ngày | `dataDays=7`, `avgHeartRate` 68.4, `totalSteps=5056`, `avgCoveragePercent=89.4`, `syntheticDays=7`; khớp phép tính độc lập | Đạt |
| 14/30 ngày thiếu mẫu | Chỉ đếm ngày có dữ liệu, note số ngày thiếu | 14 ngày: 7 ngày dữ liệu, coverage 46.4%, note “7/14 ngày không có mẫu”; 30 ngày: 30.9%, note “23/30” | Đạt |
| Ngày rỗng | HR `null`, steps `unavailable`, coverage 0/0 | Đúng (ngày 08/11: `hasData=false`, `heartRate=null`, `steps={0,unavailable}`, coverage 0/0, source `device`) | Đạt |
| Nhãn dữ liệu mô phỏng | Có chip/note | API `source=synthetic`, `syntheticDays=7`; UI chip “Dữ liệu mô phỏng” + note; ảnh `owner-dashboard-1280.png` | Đạt |
| Quyền caregiver | Cắt theo `sharedFrom`, không 403 | Các ngày trước mốc có `expectedCount=0`, không lộ dữ liệu; tổng chỉ trong cửa sổ | Đạt |
| UI | Số khớp API, toggle 7/14/30, responsive | 1280 hiển thị đúng; nút 30 ngày `aria-pressed=true`; 360/390/chữ lớn không tràn; ảnh `owner-dashboard-360.png`, `large-dashboard-390.png` | Đạt |
| Số bước ngày có gap | Phải `partial` | **Không đạt — P1-1** | Không đạt |

Ghi chú API: `days` không hợp lệ trả **400** trong khi quy ước payload chung của repo là 422; UI chỉ gửi 7/14/30 nên không ảnh hưởng người dùng, nhưng client khác có thể nhầm. Không xếp finding riêng.

### 4.4 Liên hệ khẩn cấp

| Kịch bản | Expected | Actual | Kết luận |
| --- | --- | --- | --- |
| Owner/caregiver có `canReceiveAlerts` đọc | 200 | 200; sắp primary trước | Đạt |
| Caregiver tạo/sửa/xóa | 403 | 403 | Đạt |
| Người ngoài / admin không link | 404 | 404 | Đạt |
| Tạo 5 liên hệ | 201; liên hệ đầu primary | Đúng; contact 1 primary | Đạt |
| Tạo liên hệ thứ 6 | 409, `details.limit=5` | 409 đúng | Đạt |
| 8 request tạo song song | Không vượt 5 | 5×201 + 3×409; list còn 5 | Đạt trên PGlite (xem §6 về PostgreSQL) |
| Bỏ primary khi còn liên hệ khác | 400 | 400 | Đạt |
| Đặt primary khác | 200, primary cũ bị bỏ | Đúng | Đạt |
| Xóa primary | Primary được chuyển sang liên hệ còn lại | Đúng: “Lien he 1” thành primary | Đạt |
| Tên/số điện thoại sai | 422 | 422 | Đạt |
| Id contact không thuộc hồ sơ | 404 | 404 | Đạt |
| Audit | Có create/update/primary_change/delete, **không có tên/số điện thoại** | Đúng; metadata chỉ `subjectId`, `isPrimary`, id; audit 11 bản ghi create không chứa `090/091` hay tên | Đạt |
| Log API | Không có số điện thoại/tên | Quét 745 dòng log, không thấy phone/name/token | Đạt |
| UI | Giới hạn 5, thêm/xóa, `tel:` | Đạt; ở 5 liên hệ nút “Thêm liên hệ” ẩn, thông báo giới hạn; xóa 2 bước; `tel:` đúng; ảnh `owner-share-limit5-1280.png`, `owner-share-after-delete-1280.png` | Đạt |
| Card cảnh báo | Hiện liên hệ cho người nhận cảnh báo | Caregiver thấy card + `tel:`; ảnh `care-alert-1280.png` | Đạt |

### 4.5 Thiết bị admin, preview/publish policy

| Kịch bản | Expected | Actual | Kết luận |
| --- | --- | --- | --- |
| Non-admin tạo/claim-code/rotate | 403 | 403 | Đạt |
| Admin tạo thiết bị | 201, key + claim code một lần | 201; response có `deviceKey`, `claimCode`, hạn; list không trả key/code | Đạt |
| Claim sai / claim hợp lệ / dùng lại code | 422 / 201 / 422 | Đúng; claim gán đúng hồ sơ | Đạt |
| Claim thiết bị đã gán | 409 | 409 | Đạt |
| Tạo claim code khi đã gán | Không nên; 409/khóa | **201 + code còn dùng sau release — P2-2** | Không đạt |
| Rotate key | 200; key cũ 401, key mới ingest 202 | Đúng; audit `device.rotate_key`; caregiver rotate 403 | Đạt |
| Release | 200; ingest sau release `DEVICE_NOT_CLAIMED` | Đúng; audit `device.release` | Đạt |
| Audit thiết bị | Có create/claim/claim_code_issued/rotate/release, không lộ key/code | Đúng; metadata không chứa key/code | Đạt |
| UI thiết bị | List, rotate xác nhận 2 bước, key hiện một lần, claim code một lần | Đạt; ảnh `admin-devices-1280.png`, `admin-rotate-confirm-1280.png`, `admin-rotate-result-1280.png`; mobile 360 không tràn | Đạt (trừ P2-2) |
| Policy: non-admin preview | 403 | 403 | Đạt |
| Policy: thiếu `expectedVersion` | 422 | 422 | Đạt |
| Policy: version cũ | 409 `APPROVAL_STALE`, reason `version_mismatch` | Đúng | Đạt |
| Preview | 200, digest 64 hex, không ghi DB | Đúng; lịch sử vẫn version cũ sau preview | Đạt |
| Publish không digest | 409 `preview_missing`, policy không đổi | Đúng | Đạt |
| Publish sai digest / sửa giá trị sau preview | 409 `preview_mismatch`, không đổi | Đúng cả hai | Đạt |
| Publish đúng | 200 version mới; version cũ `retired` | Đúng: v2, v1 retired | Đạt |
| Replay digest cũ | 409 `version_mismatch` | Đúng | Đạt |
| Hai admin publish song song | 1×200, 1×409, không mất version | A 200 v3, B 409 `version_mismatch` | Đạt |
| Audit policy | success/conflict, key/version/digest/reason, không full value | Đúng | Đạt |
| UI policy | Preview mới bật publish; sửa field khóa publish; tab cũ 409 có banner | Đạt; ảnh `admin-policy-preview-1280.png`, `admin-policy-stale-1280.png` | Đạt |

### 4.6 Tái kiểm 4 lỗi đã sửa

| Lỗi | Cách kiểm | Kết quả | Kết luận |
| --- | --- | --- | --- |
| SSE revoke khi khóa tài khoản | Mở SSE caregiver, admin `PATCH /admin/users/:id/status` (đúng route `/status`) | Nhận `event: revoked`, stream đóng sạch; REST caregiver 401; không còn alert sau đó | Đạt |
| SSE revoke khi thu hồi phiên | Mở SSE ở phiên A, phiên B `DELETE /me/sessions/:id` | `event: revoked`, stream đóng; phiên bị thu hồi gọi API → 401 | Đạt |
| Ingest quarantine | Future +10 phút; mẫu 60 ngày trước assignment; `synced` + `measured_at=null`; mẫu cũ trong assignment; gửi lặp | Future → 202 `QUARANTINED` (`clock_skew_future`); ancient → `QUARANTINED` (`before_first_assignment`); synced+null → 422; mẫu cũ hợp lệ → accepted; lặp → `DUPLICATE`; audit có `reason`, `clockSkewSeconds`, `messageId`, `sequence`, `assignmentId`; mẫu cách ly không vào measurements/daily-summary/insights, `lastSeenAt` không bị đẩy lên future | Đạt |
| Notification boundary | Đặt `sharedFrom` mới (sau incident đã đóng), mở lại caregiver; sau đó đặt `sharedFrom` cũ | Mới: alert đã đóng ẩn/không list; detail 403 kèm `effectiveFrom`; alert đang mở có `startedBeforeShare:true`; notification trước mốc ẩn, `unread=0`, markRead 404. Cũ: alert mở + notification hiện, `unread=1`. `canReceiveAlerts=false`: alerts/contacts/tasks/SSE 403; insights/measurements/assistant vẫn 200; notifications rỗng. Đã khôi phục quyền/`sharedFrom` | Đạt phần đã kiểm |
| Cửa sổ chia sẻ caregiver | Gọi measurements/export/daily-summary trước `sharedFrom`; owner cùng cửa sổ; insights | Caregiver 403 kèm `effectiveFrom`; owner 200; insights chỉ trả cửa sổ sau mốc, ngày trước mốc `expectedCount=0` | Đạt phần đã kiểm |

**Ghi chú SSE UI:** khi admin khóa tài khoản, stream cũng gửi `revoked`; AppShell hiện thông báo “Quyền xem hồ sơ … đã bị thu hồi” (cùng thông điệp với thu hồi chia sẻ). Đây là vấn đề câu chữ P3 đã được handoff đề xuất, không xếp P0–P2 trong báo cáo này.

### 4.7 UI, responsive và ảnh

- Owner 1280: card “Tổng hợp hôm nay” + “Xu hướng gần đây” hiển thị đúng số API; chip dữ liệu mô phỏng; toggle 7/14/30; ảnh `owner-dashboard-1280.png`.
- 360/390 và `data-text-size=large`: dashboard, settings, tasks, share, alert, admin không tràn ngang (`scrollWidth` bằng viewport); ảnh `owner-dashboard-360.png`, `owner-settings-360.png`, `care-alert-360.png`, `large-dashboard-390.png`, `admin-360.png`.
- Admin policy stale: banner 409, nút publish bị khóa; ảnh `admin-policy-stale-1280.png`.
- Owner/caregiver share: giới hạn 5, xóa 2 bước, `tel:`; ảnh `owner-share-limit5-1280.png`, `owner-share-after-delete-1280.png`.

## 5. Tái kiểm finding cũ — không đóng khi chưa đủ bằng chứng

| Finding cũ | Kết quả lần này | Trạng thái |
| --- | --- | --- |
| **P1-3** `v2-data-integrity` — steps `complete` dù bỏ/cộng delta bắc gap | Tái hiện đầy đủ ở P1-1: daily 790 `complete`, insights 780 `partial`, gap 2h | **Vẫn mở** (không đóng) |
| **P2-2** `v2-admin-ops` — rotate key không bắt buộc lý do | API vẫn nhận `POST /admin/devices/:id/rotate-key` không body → 200; audit `device.rotate_key` metadata `{}`; UI chỉ xác nhận 2 bước, không nhập lý do | **Vẫn mở** (không đóng) |
| **P2-3** `v2-data-integrity` — daily-summary bỏ mẫu `clock_status=unsynced` | Ingest `synced+null` đã 422 (đóng phần ingest), nhưng daily-summary hôm nay vẫn không có `excludedUnsyncedCount`, gap cuối ngày là `no_data` dù có mẫu unsynced | **Một phần vẫn mở** (không đóng) |
| **P2-1** `v2-data-integrity` — notification/alert vượt `shared_from` | Alerts + notifications đã đúng ở §4.6; **chưa tái kiểm** số incident trong `daily-summary` (đoạn này vẫn dùng `from..to` của ngày, không dùng `windowFrom`) | **Chưa đóng** — cần kiểm riêng |
| **P2-4** `v2-data-integrity` — đọc lại notification ghi đè `read_at` | Không tái kiểm trong lượt này | **Chưa đóng** |

## 6. Chưa kiểm / giới hạn

- **PostgreSQL thật và đồng thời:** PGlite một tiến trình serialize transaction nên test 8 request tạo contact chỉ chứng minh trên PGlite. Trên PostgreSQL Read Committed, `SELECT count` + `INSERT` trong transaction không tự khóa hàng; giới hạn 5 và “đúng một primary” có thể bị vượt khi hai request thật song song. Chưa có môi trường PostgreSQL để tái hiện, nên không xếp finding.
- **Claim/rotate đồng thời, nhiều instance SSE/CAS**, MQTT broker/ACL/ACK, Web Push/email/SMS: chưa kiểm.
- **UI end-to-end:** đã kiểm render/validation/limit/responsive và các thao tác owner task, contact, admin claim/rotate, policy; **chưa bấm đổi tên/đổi mật khẩu/thu hồi phiên qua browser** (đã kiểm đầy đủ bằng API), chưa bấm đổi primary qua UI.
- **Trạng thái lỗi/mất mạng** của insights/contacts/settings chưa kiểm riêng; chưa kiểm Safari/Firefox/320px/contrast/khả dụng người cao tuổi.
- **Assistant với cửa sổ chia sẻ mới:** chưa gọi lại `assistant/ask` sau khi đặt `sharedFrom` mới; chỉ kiểm alerts/notifications/measurements/export/daily-summary/insights.
- **Daily-summary incident boundary** và **notification `read_at`** (finding cũ) chưa tái kiểm; không đóng.
- **Test hiện có:** API 18/167 và web 24/123 đều pass, nhưng không phát hiện P1-1/P2-1/P2-2 (không có test rate-limit đổi mật khẩu, claim code sau release, hay steps qua gap ở daily-summary).

## 7. Kết luận 5 dòng

1. **0 P0, 1 P1, 3 P2** trong phạm vi tính năng v2 đã kiểm; happy path của cả 5 nhóm tính năng và 4 lỗi đã sửa đều chạy đúng trên DB/API/UI riêng.
2. **P1-1** là P1-3 cũ tái hiện: `daily-summary` vẫn `complete` và cộng bước bắc gap, trong khi `insights` báo `partial`; người dùng thấy 790 so với 780 cho cùng ngày.
3. **P2-1** đổi mật khẩu thiếu rate-limit (20 lần sai vẫn 400, không 429), **P2-2** claim code cho thiết bị đang gán còn dùng được sau release, **P2-3** docs/14 vẫn nói v2 chưa có endpoint/UI.
4. Các điểm đã đạt: validation/quyền/audit tài khoản, task owner-only và due date, insights 7/14/30 + synthetic + share window, contact limit 5/primary/audit không PII, admin claim/rotate/audit, policy digest/CAS/409, SSE revoke, quarantine, notification/share boundary.
5. Không sửa code/docs/DB chính, không commit; các finding cũ P1-3, P2-2, P2-3 (daily-summary unsynced), P2-1 (incident boundary), P2-4 (`read_at`) **không được đóng** trong báo cáo này.
