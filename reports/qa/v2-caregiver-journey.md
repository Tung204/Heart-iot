# QA hành trình caregiver — An Nhiên v1.1 (15/11/2026)

- **Reviewer:** QA độc lập (agent pi), worktree `C:/Users/nguye/orca/workspaces/DATN/qa-caregiver-journey`.
- **HEAD:** `8434d66cb8ecb3d92a9a054f87f843d16dbaa3e7` — `perf(web): tách chunk theo route và thống nhất quyền xem cảnh báo` (15/11/2026 06:44 +07).
- **Thời gian kiểm:** 2026-11-15 06:55 → 07:18 +07 (UTC 2026-11-14 23:55 → 2026-11-15 00:18). Giờ API ghi UTC; giờ UI ghi +07.
- **Môi trường:** Windows; Node v24.22.2; pnpm 12.5.1; API NestJS 11.2.10, PGlite tại `.data/review-caregiver-q`, cổng **3266**, `WEB_ORIGIN=http://localhost:5188`; web Vite 8.3.8 cổng **5188**, `VITE_API_BASE_URL=http://localhost:3266/api/v1`; Playwright 1.65.1, Chromium headless 1280×900. API :3000 và web :5173 của lead **không bị đụng**.
- **Dữ liệu:** DB seed có 3 user, 2 subject, 1.681 telemetry, 3 incident, 2 task, 2 outbox; reviewer tạo thêm link/incident test trong DB riêng. Không dùng dữ liệu thật.
- **Cổng đã chạy:** `pnpm install --prefer-offline --frozen-lockfile`, `pnpm build:contracts`, `pnpm --filter @annhien/api build`, `pnpm --filter @annhien/api typecheck` → **exit 0**, `pnpm --filter @annhien/web typecheck` → **exit 0**. Không chạy toàn bộ test suite; mọi kết luận hành vi dưới đây đến từ API/UI thật.
- **Phạm vi:** AGENTS.md; docs/02, 03, 04, 06, 08, 12, 14; source API/web/contracts; báo cáo review 14/11 để đối chiếu. Chỉ tạo file báo cáo này; không sửa code/docs, không commit.
- **Ghi chú cô lập:** lần đầu đặt cổng 3201 nhưng cổng đã bị một instance khác chiếm; một lệnh tạo invitation duy nhất đã gửi vào instance đó trước khi phát hiện. Từ đó chuyển sang 3266 + DB riêng; không thao tác care link/revoke trên instance 3201. Không đụng API :3000/web :5173.

## 0. Kết luận tổng thể

- **P0: 0. P1: 1. P2: 5.** Có 2 phần chưa kết luận được (xem mục 5).
- **Luồng hạnh phúc chạy được:** preview lời mời không lộ email; đăng nhập/đăng ký đúng email; accept; dashboard caregiver; nhận cảnh báo/SSE; xác nhận hỗ trợ; thu hồi giữa stream; URL trực tiếp sau thu hồi trả 404.
- **Vấn đề chính:** (1) cảnh báo **đã đóng** không bị giới hạn bởi `historyDays`/`sharedFrom`, caregiver 1 ngày đọc được incident 2–3 ngày trước kèm lý do kết thúc; (2) notification vẫn hiện sau khi thu hồi; (3) trang lịch sử 403 với link vừa accept; (4) trợ lý `ask` 403 với link mới dù có `canViewAi`; (5) dashboard hỏng toàn bộ khi không có quyền cảnh báo; (6) SSE replay lộ metadata `care.accepted`/`notification.sent` ngoài phạm vi.
- **Đối chiếu báo cáo trước:** P2-1 của `review-backend-2026-11-14.md` (lịch sử 403 với link mới) **vẫn mở**, báo cáo này không đóng mà bổ sung nguyên nhân phía web. P1 SSE thiếu quyền của báo cáo trước đã được lead sửa và tôi tái kiểm đúng (403); P2-2 403/404 cảnh báo nay nhất quán.

## 1. Bảng kiểm

| Hạng mục | Kỳ vọng | Thực tế | Bằng chứng | Kết quả |
|---|---|---|---|---|
| Preview lời mời khi chưa đăng nhập | 200; chỉ tên hồ sơ/người mời/quyền/hạn; không email người được mời, không dữ liệu sức khỏe | Đúng; `email` không xuất hiện trong JSON | `GET /invitations/:token`; response ở mục 3.1 | PASS |
| Accept khi chưa đăng nhập / sai tài khoản | 401 / 403 | 401 / 403, message "Tài khoản đăng nhập không khớp..." | mục 3.1 | PASS |
| Đăng ký đúng email được mời rồi accept | 201; tạo care link `active`, `sharedFrom` = lúc accept | 201; `sharedFrom=2026-11-15T00:17:48.142Z` | mục 3.1 | PASS |
| Dùng lại token sau accept | 404 | 404 "Lời mời không tồn tại hoặc đã hết hạn." | mục 3.1 | PASS |
| UI: login/register đúng email → accept → `/app` | Vào dashboard với hồ sơ "người thân" | Đúng; sidebar "HỒ SƠ ĐANG XEM · NGƯỜI THÂN", tên hồ sơ | `invite-signed-in.png`, `dashboard-after-accept.png` | PASS |
| SSE live update | Không reload, số cảnh báo mở tăng | 4 → 5 trong **518 ms**; request `GET /subjects/:id/events` 200 | `sse-focus.log`, `sse-focus.png` | PASS (link demo 30 ngày) |
| Xác nhận hỗ trợ | 200; state `acknowledged`, version tăng | 200; notification/alert thể hiện `acknowledged`, revision 3 | mục 3.2; `live-alert-before-ack.png`, `live-alert-after-ack.png` | PASS |
| Thu hồi giữa stream | Stream nhận `event: revoked` rồi đóng; UI xóa dữ liệu | Đúng: `event: revoked`, `data: {}`; UI banner; `/subjects` rỗng; localStorage null; alert detail 404 | mục 3.3; `after-revoke-dashboard.png` | PASS |
| URL trực tiếp khi không có quyền | Có link nhưng thiếu `receive_alerts` → 403; không có link → 404 | 403 / 404 đúng; UI hiện lỗi quyền (chưa phân biệt đẹp) | mục 3.4 | PASS (bảo mật) / P2-4 (UX) |
| Notification trước thu hồi | 2 thông báo, đúng người nhận | 2 item, `unreadCount=2` | `notifications-before-revoke.png` | PASS |
| Tóm tắt trợ lý | Chỉ đọc từ `sharedFrom`; không bịa số | 200; `periodStart=sharedFrom`; "Không có dữ liệu đo..." | mục 3.5 | PASS |
| Lịch sử trong hạn chia sẻ | Không 403 với link mới; hiện phần từ `sharedFrom` | 403 "Khoảng thời gian yêu cầu vượt quá..." | mục 3.6; `history-7d-after-accept.png` | **FAIL — P2-2** |
| Cảnh báo đã đóng trước `sharedFrom`/`historyDays` | Ẩn hoặc 403/404 | 200; xem được incident 2–3 ngày trước, kèm lý do kết thúc | mục 3.7; `closed-alerts-boundary.png`, `closed-alert-detail-boundary.png` | **FAIL — P1-1** |
| Notification sau thu hồi | Ẩn/tombstone; không đọc được subject name/incident type | Vẫn 200, hiện 2 item có tên hồ sơ; mark-read 204 | mục 3.8; `notifications-after-revoke.png` | **FAIL — P2-1** |
| Trợ lý `ask` với link mới | Trả lời trong cửa sổ sau `sharedFrom`, hoặc "chưa đủ dữ liệu" | 403 vì `from=now-7d` trước `sharedFrom` | mục 3.9 | **FAIL — P2-3** |
| Dashboard khi không có `receive_alerts` | Vẫn hiện trạng thái/tổng hợp được phép; ẩn cảnh báo | Toàn bộ dashboard báo lỗi quyền; nav Cảnh báo vẫn dẫn tới 403 | `noperm-dashboard.png`, `noperm-alerts.png` | **FAIL — P2-4** |
| SSE replay metadata | Chỉ sự kiện thuộc người dùng/phạm vi | Replay `care.accepted` của link khác và `notification.sent` của người khác | mục 3.10 | **FAIL — P2-5** |
| Mobile 390/360 cho hành trình caregiver | Không tràn, thao tác được | Chưa chạy trong phiên này | — | Chưa kiểm |
| SSE live trên link vừa accept | Tăng số cảnh báo không reload | Chưa kết luận: script cũ chờ nhầm text "3 cần chú ý"; link đã bị thu hồi trước khi kiểm lại | `ui-journey3-result.json` | Chưa kiểm |
| CSV với link mới | Tải được phần sau `sharedFrom` | Chưa bấm; cùng cửa sổ `from` như lịch sử nên dự kiến 403 | — | Chưa kiểm |

## 2. Findings

### P1-1 — Cảnh báo đã đóng không bị giới hạn bởi `historyDays`/`sharedFrom`; caregiver 1 ngày đọc được incident 2–3 ngày trước

**Mức:** P1 — vi phạm ranh giới quyền đã cam kết, đọc được nội dung kết thúc/giải thích của incident trước khi được chia sẻ.

**Vị trí:**
- `apps/api/src/incidents/incidents.service.ts:639-681` (`listAlerts`): chỉ `requireSubject` + `assertAction('receive_alerts')`; **không gọi `requireHistory`**, không lọc `detectedAt` theo `effectiveFrom`.
- `apps/api/src/incidents/incidents.service.ts:683-708` (`getAlert` / `loadVisibleIncident`): chỉ `requireSubject` + `assertAction`; không kiểm `sharedFrom`/`historyDays`.
- `apps/api/src/measurements/measurements.service.ts:180-192` (`dailySummary`): telemetry dùng `windowFrom` (đã kẹp `sharedFrom`, dòng 159/174) nhưng `incidentRows` lại dùng `from` = đầu ngày, nên đếm cả incident trước khi chia sẻ.
- `apps/api/src/devices/devices.service.ts:236-242` (`getSubjectStatus`): chỉ `requireSubject`; trả `lastMeasuredAt`/`lastHeartRateBpm` trước `sharedFrom` (xem "quan sát" bên dưới).
- `apps/api/src/realtime/realtime.service.ts:72-82`: đọc toàn bộ `realtime_events` theo `subjectId`, không lọc thời gian/người nhận.
- Contract có `sharedFrom`: `packages/contracts/src/subjects.ts:33`.

**Tái hiện API (link `historyDays=1`):**

```bash
B=http://localhost:3266/api/v1
S=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
# Owner tạo invitation historyDays=1, canReceiveAlerts=true; user đăng ký đúng email, accept.
# Kết quả accept:
# sharedFrom 2026-11-15T00:15:48.724Z; historyDays 1; canReceiveAlerts true
```

```bash
curl -s -b cj-hist.txt "$B/subjects/$S/alerts?state=closed"
# HTTP 200
# items:
#  f2222222-... detectedAt 2026-11-12T23:55:28.090Z, state resolved,
#    resolutionReason "Đã gọi điện và xác nhận bà An an toàn."
#  f1111111-... detectedAt 2026-11-11T23:55:28.090Z, state cancelled
curl -s -o /dev/null -w '%{http_code}\n' -b cj-hist.txt "$B/alerts/f2222222-2222-4222-8222-222222222222"
# 200 — chi tiết đầy đủ
curl -s -o /dev/null -w '%{http_code}\n' -b cj-hist.txt \
  "$B/subjects/$S/measurements?from=2026-11-13T00:00:00Z&to=2026-11-13T01:00:00Z"
# 403, details.effectiveFrom=2026-11-15T00:15:48.724Z
```

**Kỳ vọng:** caregiver `historyDays=1`, vừa accept lúc `00:15:48Z`, không được đọc incident phát hiện `11/11`–`12/11` (2–3 ngày trước); list phải rỗng hoặc 403, detail phải 403/404. Cùng người dùng, measurements `13/11` đã bị 403 — chứng tỏ chính sách lịch sử **có** hiệu lực với measurements nhưng **không** áp cho incidents.

**Thực tế:** list 200 với 2 incident cũ; detail 200; response còn trả `resolutionReason`, `resolutionOutcome`, `detectedAt`, `resolvedAt`.

**UI (cùng link `historyDays=1`):**
- `/app/alerts` → tab **Đã đóng** hiển thị:
  - "Nghi ngã · phát hiện 06:55 13 thg 11, 2026 · **Kết quả: Đã gọi điện và xác nhận bà An an toàn.** · Đã đóng"
  - "Nghi ngã · phát hiện 06:55 12 thg 11, 2026 · Đã hủy"
- Bấm Chi tiết → "Phát hiện 06:55 13 thg 11, 2026 (**2 ngày trước**)" + "Kết quả: Đã hỗ trợ người được theo dõi — Đã gọi điện và xác nhận bà An an toàn."
- Ảnh: `C:/tmp/qa-shots/closed-alerts-boundary.png`, `C:/tmp/qa-shots/closed-alert-detail-boundary.png`.
- Script `C:/tmp/closed-ui.js` chạy hết các bước; exit 1 chỉ vì có một console 401 của bước kiểm phiên trên trang login, không phải lỗi trang.

**Tổng hợp ngày (cùng root cause, cần chốt):**
- Link boundary `historyDays=7`, `sharedFrom=2026-11-15T00:08:31.502Z`:
```bash
curl -s -b cj-boundary.txt "$B/subjects/$S/daily-summary?date=2026-11-15"
# incidents.total=5; coverage.from=2026-11-15T00:08:31.502Z; observedCount=0
curl -s -b cj-boundary.txt "$B/subjects/$S/status"
# devices[0].lastMeasuredAt=2026-11-14T23:55:28.090Z; lastHeartRateBpm=61
curl -s -N --max-time 3 -b cj-boundary.txt -H 'Last-Event-ID: 0' "$B/subjects/$S/events"
# id:1 alert.updated occurredAt=2026-11-14T23:30:28.090Z; id:2 care.accepted link 98a7...
```
- Cả 5 incident mở đều phát hiện **trước** `sharedFrom`: `00:04:54`, `00:04:14`, `00:03:29`, `23:56:48`, `23:30:28`.
  - UI cùng link: "Cảnh báo hôm nay: 5 (đã đóng 0)" trong khi "Độ phủ dữ liệu 0% · 0 mẫu".
- Đây là count của incident trước khi chia sẻ. Nếu team coi **cảnh báo đang mở** là ngoại lệ an toàn, cần ghi rõ trong docs và gắn nhãn "xảy ra trước khi bạn tham gia"; nếu không, phải lọc `detectedAt >= effectiveFrom`.

**Quan sát cùng root cause (chưa xếp P1 vì có thể là ngoại lệ an toàn):**
- `GET /subjects/$S/status` với link boundary trả `lastMeasuredAt=2026-11-14T23:55:28.090Z`, `lastHeartRateBpm=61` — trước `sharedFrom` 13 phút; UI hiện "Lần đo gần nhất 06:55", "Nhịp tim gần nhất 61 bpm".
- SSE replay từ cursor 0 của link boundary có:
  - `id: 1 / event: alert.updated / data.occurredAt=2026-11-14T23:30:28.090Z` (incident mở trước share);
  - `id: 2 / event: care.accepted` của **link khác** (`98a7...`) — xem P2-5.
- Nếu chính sách cho phép hiện cảnh báo đang mở/trạng thái hiện tại, cần tách rõ "current safety state" khỏi "history"; hiện UI không phân biệt.

**Tác động:** caregiver mới biết được người thân đã ngã và cách xử lý từ 2–3 ngày trước, dù chủ hồ sơ chỉ chia sẻ 1 ngày; vi phạm docs/06 dòng 39 ("Người thân không mặc định truy cập toàn bộ dữ liệu trước ngày chia sẻ"), docs/04 dòng 11 (`shared_from`, "kiểm lại trước khi gửi dữ liệu") và FR-02. Nội dung `resolutionReason` có thể chứa thông tin sức khỏe/hoàn cảnh.

**Đề xuất:**
1. Thêm một helper dùng chung, ví dụ `requireIncidentHistory(userId, subjectId, detectedAt)` trả `effectiveFrom`; owner bỏ qua.
2. `listAlerts`: với caregiver, thêm `gte(incidents.detectedAt, effectiveFrom)` cho state `closed` (và quyết định rõ cho `open`); `loadVisibleIncident`: nếu `detectedAt < effectiveFrom` và incident đã đóng → 403 kèm `details.effectiveFrom`; nếu open và chấp nhận ngoại lệ an toàn → gắn cờ/label.
3. `dailySummary`: dùng `windowFrom` thay `from` cho `incidentRows`; nếu muốn đếm cảnh báo mở trước share, tách trường `beforeShareOpenCount` và ghi chú.
4. `getSubjectStatus`: hoặc chỉ trả dữ liệu sau `effectiveFrom`, hoặc redact `lastHeartRateBpm/lastMeasuredAt` trước share; ghi rõ quyết định vào docs/04.
5. SSE: thêm `occurredAt`/`visibleFrom` cho event và lọc; không chỉ dựa vào quyền mở stream (xem P2-5).
6. Test: link `historyDays=1`, accept mới, closed list/detail 403; link `sharedFrom=now`, daily summary không đếm incident trước; UI tab Đã đóng rỗng/không có nút chi tiết.

**Không đóng finding trước:** P1 SSE thiếu quyền của review 14/11 đã được sửa đúng (`realtime.controller.ts:24` và vòng poll dùng `requireAction`); finding này là **ranh giới thời gian/lịch sử**, không mở lại P1 cũ.

### P2-1 — Notification vẫn đọc được và hiển thị sau khi thu hồi care link

**Mức:** P2 — dữ liệu còn lại sau thu hồi; không phải measurement sức khỏe mới, nhưng vi phạm yêu cầu xóa dữ liệu nhạy cảm khỏi bộ nhớ hiển thị.

**Vị trí:**
- `apps/api/src/notifications/notifications.service.ts:184-229` (`listNotifications`): chỉ lọc `recipientUserId` + `status='sent'`; join incident/subject nhưng **không kiểm care link còn active/không kiểm `sharedFrom`**.
- `apps/api/src/notifications/notifications.service.ts:231-246` (`markRead`): chỉ kiểm `recipientUserId` + `status`; không kiểm quyền hiện tại.
- `apps/web/src/app/AppShell.tsx:102-112`: khi `revoked` chỉ `invalidateQueries(['subjects'])` và set active subject null; không xóa `['notifications']`.
- `apps/web/src/features/realtime/useSubjectEvents.ts:77-87`: chỉ `removeQueries(['subjects', id])` và `['alerts']`; không đụng `['notifications']`.
- `apps/web/src/features/notifications/NotificationsPage.tsx:30-59, 88-108`: query toàn cục `queryKeys.notifications`, render mọi item, không lọc theo subject còn quyền.
- `apps/web/src/lib/query.ts:20`: key `notifications` tách khỏi subject.

**Bằng chứng API (link đã thu hồi):**
- Link `98a7fb64-a44e-40ec-83f2-d7e06393fdaa`, `sharedFrom=2026-11-14T23:56:11.490Z`, `revokedAt=2026-11-14T23:57:16.418Z`.
- Notification tạo lúc `23:56:49.928Z` và `23:56:58.395Z` (trước thu hồi). Dùng cookie jar của caregiver đã bị thu hồi:
```bash
COOKIE=/tmp/r-caregiver.txt
curl -s -b "$COOKIE" "$B/notifications"
# HTTP 200:
# items[0] subjectName "Bà Trần Thị An", incidentType "sos", state "acknowledged",
#           createdAt 2026-11-14T23:56:58.395Z, readAt 2026-11-14T23:57:35.023Z
# items[1] cùng subject/incident, createdAt 2026-11-14T23:56:49.928Z, readAt null
# unreadCount 1 (một item đã được mark-read trước đó)
curl -s -o /dev/null -w '%{http_code}\n' -b "$COOKIE" \
  -X POST "$B/notifications/ab566838-034c-4da0-ab59-7928cb5a57eb/read"
# 204
curl -s -o /dev/null -w '%{http_code}\n' -b "$COOKIE" \
  "$B/alerts/3a059e47-57af-4a22-9535-681d167cce48"
# 404
```
**Kỳ vọng:** sau `revokedAt`, `GET /notifications` không trả item của subject đó (hoặc tombstone không tên/loại cảnh báo); `POST .../read` 403/404; UI không hiện.
**Thực tế:** 200 với đầy đủ `subjectName`, `incidentType`, `state`; mark-read vẫn 204; chỉ link "Xem cảnh báo" là 404.

**Bằng chứng UI (UI2):**
- Link `d96743b3-...`, `sharedFrom=2026-11-15T00:03:19.177Z`, `revokedAt=2026-11-15T00:04:14.880Z`.
- Sau thu hồi, banner hiện: "Bạn đã mất quyền xem hồ sơ ... Dữ liệu của hồ sơ này đã được xóa khỏi màn hình và các luồng đang mở đã đóng." (`after-revoke-text`).
- Nhưng `/app/notifications` hiện "Chưa có hồ sơ nào" + "Bạn có 2 thông báo chưa đọc" + 2 item "Yêu cầu trợ giúp — Bà Trần Thị An ... Đã xác nhận" + nút "Đánh dấu đã đọc" (`notifications-after-revoke.png`).
- Đây là mâu thuẫn trực tiếp với banner và docs/06 dòng 43 ("giao diện người thân xóa dữ liệu nhạy cảm khỏi bộ nhớ hiển thị"), docs/04 dòng 19 ("mất quyền thì không đọc lại qua cache").

**Tác động:** người đã bị thu hồi vẫn thấy tên hồ sơ, loại cảnh báo, trạng thái và thời điểm; có thể tưởng vẫn theo dõi được; nút "Xem cảnh báo" dẫn tới 404. Không lộ measurement, nhưng là residual metadata và dead-end.

**Đề xuất:**
1. `listNotifications`: join `care_links` active hoặc lọc `subjectIds` người dùng còn quyền; owner luôn thấy.
2. `markRead`: kiểm lại quyền của subject/incident trước khi update.
3. Web: khi `revoked`, `removeQueries({queryKey: queryKeys.notifications})`; hoặc invalidate + filter client theo `useSubjects`.
4. Nếu muốn giữ lịch sử thông báo: trả tombstone không có `subjectName`/`incidentType`, vô hiệu hóa nút; ghi rõ chính sách.
5. Test: link nhận 2 notification → revoke → list rỗng/không có subject name; mark-read 403/404; UI notification page rỗng.

### P2-2 — Trang lịch sử 403 với link vừa accept dù hiển thị "tối đa 7 ngày" (P2-1 cũ vẫn mở)

**Mức:** P2 — chặn toàn bộ màn hình lịch sử trong 24 giờ đầu (và tới 7 ngày nếu chọn cửa sổ 7 ngày); đề nghị cân nhắc nâng P1 vì đây là bước bắt buộc của hành trình demo.

**Vị trí:**
- `apps/web/src/features/history/HistoryPage.tsx:64-84`: luôn gửi `from` được tính từ `now - clampedHours`; không dùng `activeSubject.sharedFrom`.
- `apps/web/src/lib/format.ts:98-108` (`clampRangeToHistoryDays`): chỉ kẹp theo `historyDays`, không kẹp theo `sharedFrom`.
- `apps/api/src/access/access.service.ts:97-111`: `from < effectiveFrom` → 403 (hành vi có chủ đích, comment dòng 95).
- `apps/api/src/measurements/measurements.service.ts:72-81`: nếu **không** truyền `from`, backend kẹp về `effectiveFrom` và trả 200; nếu truyền `from` sớm hơn → 403.
- Báo cáo trước: `reports/qa/review-backend-2026-11-14.md:160` (P2-1). **Không đóng finding này.**

**Bằng chứng UI:**
- UI2 `sharedFrom=2026-11-15T00:03:19.177Z`, `historyDays=7`; trang Lịch sử hiện "Quyền hiện tại cho phép xem tối đa 7 ngày"; mặc định 24 giờ; chọn 7 ngày cũng lỗi; 30 ngày bị khóa.
- Lỗi: "Không tải được dữ liệu đo — Khoảng thời gian yêu cầu vượt quá quyền xem lịch sử được chia sẻ. Hãy thử lại." (`history-7d-after-accept.png`).
- Trang không hiện "dữ liệu bắt đầu từ 07:03" hay nút gợi ý; người dùng chỉ thấy lỗi và nút Thử lại (không bao giờ thành công trong 24 giờ đầu).

**Bằng chứng API (link vừa accept ở 3.1, `historyDays=7`, `sharedFrom=00:17:48.142Z`):**
```bash
COOKIE=/tmp/cj-accept.txt   # cookie của caregiver vừa accept
curl -s -b "$COOKIE" "$B/subjects/$S/measurements?from=2026-11-14T20:00:00Z&to=2026-11-15T00:20:00Z"
# 403 {"message":"Khoảng thời gian yêu cầu vượt quá quyền xem lịch sử được chia sẻ.",
#      "details":{"effectiveFrom":"2026-11-15T00:17:48.142Z"}}
curl -s -b "$COOKIE" "$B/subjects/$S/measurements"
# 200; coverage.from = 2026-11-15T00:17:48.142Z (hoặc mốc mới hơn), items []
```
**Kỳ vọng:** link mới vẫn xem được phần dữ liệu từ `sharedFrom`; 24h/7 ngày hiển thị empty/partial, không 403.
**Thực tế:** 403; không có lịch sử, không có CSV (nút CSV dùng cùng `from`).

**Đề xuất:**
1. Truyền `activeSubject.sharedFrom` vào `clampRangeToHistoryDays`; `max(from, sharedFrom)` trước khi gửi.
2. Hoặc bỏ `from` khi `sharedFrom` mới hơn `from` và để backend kẹp (nhưng cần vẫn gửi `to`).
3. Hiển thị "Dữ liệu bắt đầu từ 07:03 15/11" thay vì chỉ "tối đa 7 ngày".
4. Test UI: link accept trong 1 phút, mở Lịch sử 24h/7 ngày → 200, empty/partial, không 403.
5. Giữ nguyên quyết định API strict (không tự nới) cho đến khi docs/04 chốt; sửa web trước.

### P2-3 — Trợ lý `ask` 403 với link vừa accept dù có `canViewAi`; lỗi bị báo nhầm là lỗi lịch sử

**Mức:** P2 — tính năng AI không dùng được trong 7 ngày đầu; thông báo quyền gây hiểu nhầm.

**Vị trí:**
- `apps/api/src/assistant/assistant.service.ts:329-336`: `from = now - ASK_WINDOW_MS` (7 ngày) rồi `requireHistory(user, subject, from)`; nếu `sharedFrom` mới hơn 7 ngày → 403 trước khi `assertAction('view_ai')`.
- `apps/web/src/features/assistant/AssistantPage.tsx:392-400`: hiển thị `getApiErrorMessage` + "Hãy thử lại." cho mọi lỗi không phải `RATE_LIMITED`.
- `apps/api/src/access/access.service.ts:97-111`: nguồn 403.

**Bằng chứng API:**
- Link `ask-1794701209@review.local`, `sharedFrom=2026-11-15T00:06:49.610Z`, `canViewAi=true`.
```bash
curl -s -b cj-ask.txt "$B/subjects/$S/assistant/summary"
# 200; periodStart=2026-11-15T00:06:49.610Z; status degraded; "Không có dữ liệu đo..."
curl -s -b cj-ask.txt -H 'Content-Type: application/json' \
  -d '{"question":"Pin thiết bị gần nhất còn bao nhiêu?"}' \
  "$B/subjects/$S/assistant/ask"
# 403 {"message":"Khoảng thời gian yêu cầu vượt quá quyền xem lịch sử được chia sẻ.",
#      "details":{"effectiveFrom":"2026-11-15T00:06:49.610Z"}}
```
- Với caregiver `canViewAi=false`, `ask` cũng trả 403 lịch sử (không phải 403 `view_ai`) nếu link mới; lỗi quyền bị che.
- Tóm tắt (`/assistant/summary`) đã đúng: dùng `requireHistory(..., undefined)` và `periodStart=sharedFrom`; đây là pattern nên áp cho `ask`.

**Kỳ vọng:** `ask` lấy cửa sổ `max(now-ASK_WINDOW_MS, effectiveFrom)`; nếu không có dữ liệu, trả degraded "chưa có dữ liệu" thay vì 403; nếu thiếu `view_ai`, trả 403 với message quyền AI.
**Thực tế:** 403 lịch sử; UI báo "Khoảng thời gian..." + "Hãy thử lại" (retry vô ích trong 7 ngày).

**Đề xuất:**
1. `const { effectiveFrom } = await this.access.requireHistory(userId, subjectId, undefined);`
2. `const from = new Date(Math.max(now - ASK_WINDOW_MS, effectiveFrom.getTime()));`
3. `assertAction(access, 'view_ai')`; nếu thiếu quyền, 403 `FORBIDDEN` message quyền AI.
4. UI map 403 `details.effectiveFrom` thành thông báo "Dữ liệu chỉ có từ ..." + ẩn nút Thử lại hoặc nút "Xem tóm tắt".
5. Test API/UI với link accept mới, `canViewAi=true` và `false`.

### P2-4 — Không có quyền cảnh báo làm hỏng toàn bộ dashboard; nav Cảnh báo vẫn dẫn tới 403

**Mức:** P2 — UX/quyền hiểu nhầm; dữ liệu được phép (status, daily summary) bị ẩn.

**Vị trí:**
- `apps/web/src/features/dashboard/DashboardPage.tsx:95`: `anyError = status.isError || summary.isError || openAlerts.isError`.
- `...:126-139`: một `ErrorState` chung; message lấy lỗi đầu tiên + "Kiểm tra kết nối và thử lại."
- `apps/web/src/app/AppShell.tsx:165-168`: nav "Cảnh báo" luôn render, không kiểm `canReceiveAlerts`.
- `apps/web/src/features/alerts/AlertsPage.tsx:134-139`: lỗi 403 chung "Không tải được cảnh báo".
- `apps/web/src/features/alerts/AlertDetailPage.tsx:132-138`: lỗi 403 chung "Không tải được cảnh báo".
- API: `access.service.ts:86-90` trả 403 "Quyền được chia sẻ không cho phép thao tác này." — đúng; vấn đề là UI.

**Bằng chứng:**
- Link `noperm-20261114235745@review.local`, `historyDays=3`, `canReceiveAlerts=false`, `canAcknowledge/canResolve/canViewAi=false`, `sharedFrom=2026-11-14T23:57:46.116Z`.
- API: `/subjects/$S/status` 200; `/daily-summary?date=2026-11-15` 200; `/measurements` 200 (default clamp); `/alerts` 403; `/alerts/ffff...` 403; `/assistant/summary` 403.
- UI dashboard: "Không tải được dữ liệu tổng quan — Quyền được chia sẻ không cho phép thao tác này. Kiểm tra kết nối và thử lại." (`noperm-dashboard.png`); không hiện trạng thái thiết bị/tổng hợp dù được phép.
- UI alerts: "Không tải được cảnh báo — Quyền được chia sẻ không cho phép thao tác này. Hãy thử lại." (`noperm-alerts.png`); alert detail 403 (`noperm-alert-detail.png`).
- Sidebar vẫn có "Cảnh báo"; người dùng bấm vào chỉ thấy lỗi.

**Kỳ vọng:** dashboard hiển thị phần được phép (thiết bị, tổng hợp ngày) và một khối "Bạn không có quyền nhận cảnh báo" thay vì lỗi toàn trang; nav Cảnh báo ẩn/khóa theo quyền; URL trực tiếp có thông báo đúng quyền + lối về.
**Thực tế:** một query 403 làm hỏng cả trang; thông báo "kiểm tra kết nối" sai bản chất.

**Đề xuất:**
1. Tách `anyError` theo khối; dùng `Promise.allSettled`/nhiều `ErrorState` nhỏ; không chặn status/summary.
2. `enabled: Boolean(subjectId) && activeSubject.permissions.canReceiveAlerts` cho `openAlerts`; nếu false, render placeholder quyền.
3. `AppShell`: gate nav Cảnh báo theo `subjectsData.some(s => s.role==='owner' || s.permissions.canReceiveAlerts)`; tương tự nút "Tất cả cảnh báo" trên dashboard.
4. Map `FORBIDDEN` + message quyền thành lời giải thích ngắn; bỏ "Kiểm tra kết nối" cho 403.
5. Test: caregiver no-alert-perm thấy dashboard có status/summary, không có alert list, nav ẩn; URL trực tiếp có CTA về tổng quan.

### P2-5 — SSE replay lộ metadata `care.accepted`/`notification.sent` của link/người nhận khác

**Mức:** P2 — metadata (ID, không phải nội dung sức khỏe) nhưng vượt phạm vi người dùng; đề xuất của review 14/11 về lọc event vẫn còn giá trị.

**Vị trí:**
- `apps/api/src/realtime/realtime.service.ts:72-82`: query chỉ theo `subjectId`, trả mọi `realtime_events` sau cursor; không lọc `recipientUserId`/`linkId`/`occurredAt`.
- Payload `care.accepted` hiện có `linkId` + `caregiverUserId`; `notification.sent` có `id` + `incidentId` (xem stream).

**Bằng chứng (link boundary `0dfa...`, sharedFrom `00:08:31`):**
```bash
curl -s -N --max-time 3 -b cj-boundary.txt -H 'Last-Event-ID: 0' \
  "$B/subjects/$S/events" | head
# id: 1
# event: alert.updated
# data: {"...","incidentId":"ffff...","occurredAt":"2026-11-14T23:30:28.090Z",...}
# id: 2
# event: care.accepted
# data: {"linkId":"98a7fb64-a44e-40ec-83f2-d7e06393fdaa","caregiverUserId":"b3450a8c-..."}
# ... notification.sent của các incident 3a059e47...
```
Link `98a7...` là của caregiver khác, không phải link boundary `0dfa...`; người dùng mới vẫn thấy `linkId`/`caregiverUserId` của người khác. Các `notification.sent` trong replay thuộc incident `3a059e47` tạo lúc `23:56`, **trước** khi boundary accept (`00:08:31`), nên không thể là notification của boundary; payload lại không có `recipientUserId` để client tự lọc.

**Kỳ vọng:** chỉ phát event thuộc quyền/người dùng hiện tại, hoặc tối thiểu ẩn `care.*`/`notification.sent` với người không phải owner/recipient; `alert.updated` lọc theo `occurredAt`/`effectiveFrom`.
**Thực tế:** stream subject-wide; người mới thấy metadata của link khác và notification ID của người khác.

**Tác động:** rò thông tin quan hệ chăm sóc (có người khác vừa tham gia), ID notification/incident; không lộ số đo. Vi phạm tinh thần NFR-01 và đề xuất lọc event của review trước.

**Đề xuất:**
1. Thêm `recipientUserId`/`linkId`/`occurredAt` vào payload hoặc bảng event; filter trong `stream` theo user.
2. `care.*`: chỉ owner hoặc người gắn với `linkId`; nếu không, bỏ.
3. `notification.sent`: chỉ recipient; hoặc thay bằng event `notification` không ID.
4. `alert.updated`: filter theo incident `detectedAt >= effectiveFrom` (trừ khi chốt ngoại lệ open).
5. Test SSE: caregiver A không thấy `care.accepted` của B; không thấy `notification.sent` của C; owner thấy đủ.

## 3. Bằng chứng chi tiết

### 3.1. Lời mời / accept

```bash
B=http://localhost:3266/api/v1
S=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
# Owner tạo invitation (cookie r-owner.txt) rồi:
curl -s -X POST "$B/invitations/$TOKEN/accept"                 # 401 (chưa đăng nhập)
curl -s -b cj-demo-care.txt -X POST ".../accept"               # 403 (sai tài khoản)
# đăng ký đúng email rồi accept:
# 201 {"caregiver":{...},"permissions":{"historyDays":7,...},
#      "status":"active","sharedFrom":"2026-11-15T00:17:48.142Z"}
# dùng lại token:
# 404 {"code":"NOT_FOUND","message":"Lời mời không tồn tại hoặc đã hết hạn."}
```

Preview công khai:

```json
{"subjectName":"Bà Trần Thị An","inviterName":"Trần Thị An",
 "permissions":{"historyDays":7,"canReceiveAlerts":true,"canAcknowledge":true,
                "canResolve":false,"canViewAi":true},
 "expiresAt":"2026-11-16T00:08:20.209Z","status":"pending"}
```

Không có `email`, không có dữ liệu sức khỏe. Ảnh UI: `invite-preview.png`, `invite-signed-in.png`.

### 3.2. Xác nhận hỗ trợ

- Device ingest SOS `sos.confirmed` → 202, `incidentId`; alert detail trả recipients.
- Caregiver `canAcknowledge=true`, `canResolve=false`:
  - `POST /alerts/:id/acknowledge` → 200, state `acknowledged`, version 3;
  - `POST /alerts/:id/resolve` → 403 `FORBIDDEN` (đúng).
- UI: `live-alert-before-ack.png`, `live-alert-after-ack.png`; nút "Đóng cảnh báo" không hiện, có dòng "Bạn không có quyền đóng cảnh báo".

### 3.3. Thu hồi giữa stream

```bash
# stream mở bằng cookie caregiver, sau đó owner DELETE care link:
curl -s -o /dev/null -w '%{http_code}\n' -b r-owner.txt \
  -X DELETE "$B/subjects/$S/care-links/$LINK"     # 204
# stream:
# id: 36 event: care.accepted ...
# event: revoked
# data: {}
```
- Sau thu hồi: `/subjects` → `{"items":[]}` 200; `/alerts/ffff...` → 404; localStorage `an:active-subject-id` = null; URL `/app`; banner "Bạn đã mất quyền xem hồ sơ..." (`after-revoke-text`, `after-revoke-dashboard.png`).
- Đây là phần **đạt**; notification residue là P2-1.

### 3.4. 403/404

- Stranger (không có link): subject/status/alerts/measurements/export/assistant/alert detail/events → 404.
- Caregiver có link nhưng `canReceiveAlerts=false`: alerts list 403, alert detail 403, events 403; status/measurements 200.
- Caregiver bị thu hồi: subject/status/alerts/measurements/export/assistant/alert detail → 404; `/subjects` rỗng.
- Nhất quán 403/404 như hiện tại là đúng hướng; phần UX của 403 nằm ở P2-4.

### 3.5. Trợ lý tóm tắt

- Boundary link `sharedFrom=00:08:31`: `GET /assistant/summary` → 200; `periodStart=00:08:31.502Z`; headline "Không có dữ liệu đo..."; không đọc pre-share.
- Đây là pattern đúng; `ask` chưa áp dụng (P2-3).

### 3.6. Lịch sử

- UI2 `sharedFrom=00:03:19.177Z`; `history-7d-after-accept.png` hiển thị "tối đa 7 ngày" nhưng lỗi 403.
- API bỏ `from` → 200, `coverage.from=sharedFrom`; API có `from` cũ → 403 `effectiveFrom`. Nguyên nhân nằm ở web (P2-2).

### 3.7. Incident trước `sharedFrom`/`historyDays`

- Link `historyDays=1`, `sharedFrom=00:15:48.724Z`; closed list/detail 200 với incident 12/11, 11/11; measurements 13/11 403.
- UI tab Đã đóng hiện 13/11, 12/11 + lý do; `closed-alerts-boundary.png`, `closed-alert-detail-boundary.png`.
- Link boundary `historyDays=7`, `sharedFrom=00:08:31`; daily summary `incidents.total=5`, coverage từ `sharedFrom`, 0 mẫu; UI "Cảnh báo hôm nay: 5".

### 3.8. Notification sau thu hồi

- API: 2 item, `subjectName`, `incidentType`, `state`; mark-read 204; alert detail 404.
- UI2: banner + notifications 2 item (`notifications-after-revoke.png`); mâu thuẫn.

### 3.9. Trợ lý `ask`

- `ask` link `canViewAi=true`, sharedFrom `00:06:49.610Z`; summary 200, ask 403 `effectiveFrom`; UI generic "Hãy thử lại" (`AssistantPage.tsx:392-400`).

### 3.10. SSE metadata

- Boundary stream cursor 0: `alert.updated` pre-share + `care.accepted` của link `98a7...` + `notification.sent`; xem P2-5.

## 3bis. Đã kiểm và đạt (không phải finding)

- Preview lời mời không lộ email/dữ liệu sức khỏe; accept sai email 403; token reuse 404.
- UI login/register đúng email → accept → dashboard; sidebar hiển thị "người thân" và tên hồ sơ.
- SSE live update trên link demo 30 ngày: 4 → 5 trong 518 ms, không reload; stream 200.
- Ack đúng quyền; resolve thiếu quyền 403.
- Revoke giữa stream: `event: revoked`, UI banner, subjects rỗng, localStorage null, direct URL 404.
- 403/404 hiện nhất quán giữa list/detail/không link.
- Assistant summary kẹp đúng `sharedFrom`.
- Typecheck API/web exit 0; build API/contracts exit 0; `git status` sạch trước khi tạo báo cáo (không sửa code/docs).

## 4. Quan sát khác (không xếp finding)

1. **Quyền sau accept chưa đầy đủ:** `SubjectsPage.tsx:110-114` chỉ hiện `historyDays` + `canReceiveAlerts`; `InvitePage.tsx:18-23` mô tả đủ 5 quyền. No-perm UI: "Xem lịch sử tối đa 3 ngày · Nhận cảnh báo: không" (`noperm-subjects.png`), không nói không được xác nhận/đóng/xem AI. Đề xuất dùng lại `describePermissions` ở trang hồ sơ hoặc panel "Quyền của tôi".
2. **Empty state trùng:** khi không còn hồ sơ (sau revoke), `SubjectSwitcher.tsx:51-58` và `DashboardPage.tsx:85-92` cùng render "Chưa có hồ sơ nào"; ảnh `after-revoke-dashboard.png` / `dashboard-reload-after-revoke.png` có 2 card. Không phải lỗi bảo mật; nên gộp.
3. **Status trước `sharedFrom`:** `lastMeasuredAt=23:55:28`, HR 61 trước share; nếu là ngoại lệ an toàn, cần ghi docs và nhãn; nếu không, redact.
4. **CORS scalar:** instance 3201 trả `Access-Control-Allow-Origin: http://localhost:5173` cố định, không echo origin; chỉ là ghi chú môi trường, không phải lỗi sản phẩm.
5. **Console 401 trên trang login:** bước kiểm phiên `/me` khi chưa đăng nhập; không phải page error; script test ghi nhận nhưng không ảnh hưởng kết quả.

## 5. Chưa kiểm / giới hạn

- **SSE live trên link vừa accept:** chưa kết luận. Script `journey3` chờ nhầm text "3 cần chú ý" nên không chứng minh tăng; link đã bị thu hồi trước khi kiểm lại. Đã chứng minh SSE live trên link demo 30 ngày (4→5, 518 ms), nhưng chưa lặp lại sạch với link mới.
- **Mobile 390/360** cho hành trình caregiver: chưa chạy trong phiên này (review frontend trước có 360 cho owner, không thay thế).
- **Assistant `ask` UI:** mới kiểm API; đọc code `AssistantPage.tsx:392-400` để suy ra thông báo, chưa bấm gửi trên UI.
- **CSV với link mới:** chưa bấm; dùng cùng `from` như History nên dự kiến 403, nhưng chưa có bằng chứng.
- **Multi-tab / reconnect / offline cache sau revoke:** chưa kiểm; code chỉ invalidate `subjects`, remove `subjects/:id` + `alerts`; rủi ro cache `subjects` list nếu refetch lỗi (chưa tái hiện).
- **Invitation hết hạn / thu hồi pending:** chưa kiểm; mới kiểm token reuse 404.
- **Đa hồ sơ (A/B) và hoán đổi active subject:** chưa kiểm trong phiên này; dùng 1 subject + stranger/no-link.
- Không chạy toàn bộ test suite; không load/stress test.

## 6. Đề xuất thứ tự sửa

1. **P1-1:** lọc incident theo `effectiveFrom`/`historyDays` cho list/detail (ít nhất state đã đóng); sửa `dailySummary` dùng `windowFrom`; test API + UI.
2. **P2-2:** kẹp `from` theo `sharedFrom` ở web (nhanh, mở khóa hành trình); test UI link mới.
3. **P2-1:** lọc notification theo care link active; xóa cache notification khi revoke; chặn mark-read; test.
4. **P2-3:** `ask` dùng `effectiveFrom`, trả degraded khi không có dữ liệu; test.
5. **P2-4:** tách lỗi dashboard, gate nav/alerts query; test caregiver no-alert.
6. **P2-5:** lọc SSE theo recipient/link/time; test A/B.
7. Quan sát: status policy, permission summary, empty state trùng.

## 7. Tóm tắt 5 dòng

1. HEAD `8434d66` (v1.1): hành trình mời → đăng nhập/đăng ký đúng email → accept → dashboard → ack → thu hồi chạy được; P0=0, P1=1, P2=5.
2. P1: caregiver `historyDays=1` vừa accept vẫn đọc được incident đã đóng 2–3 ngày trước kèm lý do kết thúc; `sharedFrom`/`historyDays` không áp cho incidents, và daily-summary đếm cả cảnh báo trước share.
3. P2: notification vẫn hiện tên hồ sơ/loại cảnh báo sau thu hồi; History 403 với link mới dù ghi "7 ngày"; assistant `ask` 403 với link mới dù có `canViewAi`.
4. P2: dashboard no-alert-perm hỏng toàn trang dù status/summary được phép; SSE replay lộ `care.accepted`/`notification.sent` của link/người nhận khác.
5. Báo cáo không sửa code/docs, không commit; P2-1 lịch sử của review 14/11 vẫn mở, không bị đóng bởi phiên này; bằng chứng UI ở `C:/tmp/qa-shots/`, log API/Playwright ở `C:/tmp/`.
