# Review độc lập v2 — quyền riêng tư, đồng thuận, đạo đức

**Đối tượng review:** worktree `qa-privacy-ethics`, HEAD `8434d66` (v1.1) — cây sản phẩm không đổi so với HEAD hiện tại `ffb6d87` (chỉ thêm tài liệu/spec v2 và contract mới chưa có implementation).
**Vai trò:** reviewer độc lập, **không sửa code/docs/DB chính**; chỉ ghi file này.
**Thời điểm chạy:** 15/11/2026, 07:05–07:30 (UTC+7). Mọi kết quả dưới đây là output thật của phiên này.
**Tài liệu đã đọc:** `AGENTS.md`, `docs/02`, `03`, `04`, `05`, `06`, `07`, `11`, `12`, `13` + các file code được dẫn trong từng finding.

## 0. Cách chạy và mức độ bằng chứng

DB và cổng riêng, không dùng chung với phiên khác (cổng 3000/5174 đang bị phiên khác chiếm):

| Thành phần | Giá trị dùng trong phiên |
| --- | --- |
| DB | `PGLITE_DATA_DIR=.data/review-privacy` (migrate + seed mới) |
| API | `http://localhost:3210/api/v1` (`WEB_ORIGIN=http://localhost:5181`) |
| Web | `http://localhost:5181` (`VITE_API_BASE_URL=http://localhost:3210/api/v1`) |
| AI provider | server giả `http://localhost:3299/v1` ghi lại request thật để xem dữ liệu gửi đi |
| Tài khoản | `ba-an@` (chủ hồ sơ), `minh@` (người thân seed), `admin@`, và 2 tài khoản tạo mới để thử luồng mời |

Đã chạy: API thật + web thật + Playwright (1280×900, 390×844, chế độ chữ lớn). Ảnh chụp lưu ngoài repo tại `C:\tmp\qa-priv\` (`share-1280.png`, `share-390.png`, `share-1280-large.png`, `cg-*.png`, `owner-dashboard-1280.png`, `alert-detail-1280.png`, `assistant-1280.png`).

**Không chạy:** kiểm với người dùng thật/người cao tuổi thật; kiểm với thiết bị thật; kiểm pháp lý; kiểm đa tiến trình; kiểm Web Push (không có trong v1).

Mức ưu tiên dùng trong báo cáo:

- **P0** — lộ dữ liệu sức khỏe cho người không có quyền, hoặc chặn dùng trên dữ liệu thật. *Không có finding P0 trong phiên này.*
- **P1** — sai lệch ranh giới đồng thuận/quyền/dữ liệu ở mức **phải sửa trước khi cho người thật dùng**, dù bản demo hiện chỉ có dữ liệu tổng hợp.
- **P2** — rò rỉ phụ, thiếu nhãn/giải thích, hành vi gây hiểu sai, hoặc lỗi UX có hệ quả về quyền riêng tư.

## 1. Bảng finding ưu tiên

| ID | Mức | Khu vực | Tóm tắt | File/dòng chính | Ảnh hưởng người dùng thật |
| --- | --- | --- | --- | --- | --- |
| P1-1 | P1 | Lịch sử cảnh báo | Người thân vừa được chia sẻ đọc được cảnh báo té ngã **xảy ra trước mốc chia sẻ** và ngoài `historyDays` | `apps/api/src/incidents/incidents.service.ts:639-661`, `:683-709` | Gia đình thấy lịch sử ngã của người cao tuổi mà chủ hồ sơ chưa từng cấp; trái `docs/06` (“không mặc định truy cập toàn bộ dữ liệu trước ngày chia sẻ”) |
| P1-2 | P1 | Ma trận quyền | Tắt hết quyền nhạy cảm khi mời **vẫn** cho xem nhịp tim hiện tại, lịch sử đo, thiết bị; đồng thời dashboard người thân hỏng | `packages/contracts/src/core.ts:57-74`, `apps/api/src/measurements/measurements.service.ts:74-80`, `apps/web/src/features/dashboard/DashboardPage.tsx:94-97,124-132` | Chủ hồ sơ tin mình chia sẻ “chỉ cảnh báo” nhưng thực tế chia sẻ dữ liệu sức khỏe; người thân nhận màn hình lỗi nhưng vẫn thấy BPM |
| P1-3 | P1 | Đồng thuận AI | Dữ liệu sức khỏe tổng hợp được gửi tới provider AI ngoài mà **không có thông báo, không có đồng ý, không có bản ghi đồng ý** | `apps/api/src/assistant/assistant.service.ts:258-306`, `apps/api/src/assistant/assistant-adapter.ts:71-95`, `apps/web/src/features/assistant/AssistantPage.tsx:213-214` | Người được đo và chủ hồ sơ không biết dữ liệu rời hệ thống; trái `docs/07` (“phải xác định cơ sở đồng ý … trước”) |
| P1-4 | P1 | Quyền của người được đo | Người được đo **không có tài khoản, không nhận thông báo, không biết ai đang xem, không thu hồi được**; “chủ hồ sơ” tự nhận vai trò người đại diện | `apps/api/src/database/schema.ts:142-152`, `apps/api/src/care/care.service.ts:328-370` | Người cao tuổi bị theo dõi và chia sẻ sức khỏe mà không có đường đồng ý/phản đối — rủi ro đạo đức cao nhất của mô hình |
| P1-5 | P1 | Chính sách dữ liệu | Không có chính sách riêng tư/điều khoản/đồng ý ở đăng ký; **không có thời hạn lưu, không có yêu cầu xóa**; `ai_summaries` phình theo mỗi lần xem | `apps/web/src/features/auth/RegisterPage.tsx:66-70`, `apps/api/src/assistant/assistant.service.ts:829-848`, `apps/api/src/auth/auth.service.ts:155-156` | Không thể thực hiện quyền xóa/thu hồi trước khi dùng dữ liệu thật; trái `docs/02` FR-14, `docs/04` mục “Retention và xóa” |
| P2-1 | P2 | Liên hệ khẩn cấp | Contract + bảng `emergency_contacts` đã vào DB nhưng **tại HEAD này** không có API/UI/audit/quy tắc đọc; số điện thoại lưu plaintext và trả nguyên số | `apps/api/src/database/schema.ts:212-232`, `apps/api/drizzle/0001_pretty_caretaker.sql:1-16`, `packages/contracts/src/contacts.ts:1-42` | Khi hợp nhất/triển khai: số điện thoại người thứ ba vào DB không kiểm soát, không có đường xóa/che số |
| P2-2 | P2 | Cảnh báo | Chi tiết cảnh báo trả **tên + toàn bộ quyền của mọi người nhận** cho bất kỳ ai có `receive_alerts` | `apps/api/src/incidents/incidents.service.ts:1023-1060` | Người thân biết ai khác đang theo dõi và được cấp quyền gì — thông tin chủ hồ sơ không định chia sẻ |
| P2-3 | P2 | SSE | Stream phát `care.accepted`/`care.revoked` kèm `caregiverUserId`, `linkId` cho mọi người nhận cảnh báo | `apps/api/src/care/care.service.ts:289-296, 346-352`, `apps/api/src/realtime/realtime.service.ts:72-82` | Biết ai vừa được cấp/thu quyền, kèm định danh nội bộ |
| P2-4 | P2 | Thu hồi quyền | Thu hồi chỉ xóa cache khi stream **đang mở**; nếu tab ẩn/offline, kết nối lại nhận 403 → retry vô hạn, không có tín hiệu `revoked`, dữ liệu cũ vẫn hiển thị | `apps/web/src/features/realtime/useSubjectEvents.ts:127-146`, `apps/api/src/realtime/realtime.controller.ts:24` | Dữ liệu sức khỏe còn trên màn hình người đã bị thu hồi quyền |
| P2-5 | P2 | Audit | Không ghi audit khi bị từ chối truy cập hồ sơ người khác (7 request 404 → 0 bản ghi); admin đọc audit map được hồ sơ ↔ người chăm sóc | `apps/api/src/access/access.service.ts:74-88`, `/admin/audit` (output thật bên dưới) | Không phát hiện được dò quét dữ liệu; admin kỹ thuật suy ra quan hệ chăm sóc |
| P2-6 | P2 | Copy đồng thuận | Trang chia sẻ **không nói** sẽ chia sẻ loại dữ liệu gì, không nêu rủi ro, không nói thu hồi không thu hồi được bản đã tải; quyền nhạy cảm bật sẵn | `apps/web/src/features/share/SharePage.tsx:56-60, 194-196, 253-272`, `packages/contracts/src/core.ts:68-74` | Chủ hồ sơ (thường là người già/người thân) đồng ý mà không hiểu phạm vi |
| P2-7 | P2 | Người thân vừa được chia sẻ | 24 giờ đầu (và tới 30 ngày nếu chọn “30 ngày”) mọi cửa sổ lịch sử + CSV trả 403 kèm thông báo sai ngữ cảnh | `apps/api/src/measurements/measurements.service.ts:221-227`, `apps/web/src/features/history/api.ts:11-24`, `apps/web/src/features/history/HistoryPage.tsx:130` | Luồng chính “mời người thân hôm nay” hỏng ngay ngày đầu; trùng finding P2-1 của `reports/qa/review-backend-2026-11-14.md` (thêm bằng chứng CSV + copy UI) |
| P2-8 | P2 | AI | Từ chối câu hỏi y tế chỉ bằng so khớp chuỗi; **không kiểm hậu kiểm** nội dung model trả về; tóm tắt dữ liệu mô phỏng không mang nhãn nguồn | `apps/api/src/assistant/assistant.service.ts:76-92, 170-204, 620-660` | Câu trả lời có thể mang tính diễn giải y tế mà vẫn qua validator; dữ liệu mô phỏng bị đọc như số đo thật |
| P2-9 | P2 | Nhãn kỹ thuật | Thông báo từ chối dùng khóa nội bộ `canViewAi`; empty-state nói “chưa có hồ sơ nào” khi thực chất hồ sơ đang xem bị tắt AI | `apps/web/src/features/assistant/AssistantPage.tsx` (nhánh `canViewAi=false`, text: “Bạn chưa có hồ sơ nào bật quyền xem AI … bật canViewAi”) | Người lớn tuổi không hiểu; gợi ý sai hành động |
| P2-10 | P2 | API hồ sơ | `GET /subjects` trả `ownerUserId` cho người thân | `packages/contracts/src/subjects.ts:28` | Rò rỉ định danh nội bộ không cần thiết |
| P2-11 | P2 | Lời mời công khai | Preview không cần đăng nhập trả tên chủ hồ sơ + tên người mời từ token, không rate limit | `apps/api/src/care/care.controller.ts:32-36`, `apps/api/src/care/care.service.ts:167-201` | Ai có link biết “ai đang bị theo dõi sức khỏe”; token rò qua lịch sử trình duyệt/referrer |

## 2. Chi tiết finding P1

### P1-1 — Lịch sử cảnh báo không bị giới hạn bởi mốc chia sẻ/`historyDays`

**Bước tái hiện (đã chạy):**

```bash
# 1) Chủ hồ sơ mời người thân với historyDays=1
curl -b owner.txt -H 'Content-Type: application/json' \
  -d '{"email":"chi-hai@demo.annhien.local","permissions":{"historyDays":1,"canReceiveAlerts":true,"canAcknowledge":true,"canResolve":false,"canViewAi":false},"expiresInHours":72}' \
  $API/subjects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/invitations
# 2) Người được mời đăng ký + chấp nhận (sharedFrom = 2026-11-15T00:12:46Z)
# 3) Người thân đọc cảnh báo đã đóng
curl -b cg3.txt "$API/subjects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/alerts?state=closed"
curl -b cg3.txt "$API/alerts/f1111111-1111-4111-8111-111111111111"
```

**Actual:**

```
count 2
f2222222-... fall resolved 2026-11-13T00:08:47.727Z
f1111111-... fall cancelled 2026-11-12T00:08:47.727Z
```

Chi tiết trả 200 kèm `device.serial = AN-2026-001`, `device.label`, toàn bộ `events` (`fall.candidate`, `fall.cancelled`). Hai sự kiện này xảy ra **2–3 ngày trước** thời điểm chấp nhận lời mời, và ngoài `historyDays=1`.

**Expected:** áp cùng quy tắc như số đo — ẩn hoặc 403 với dữ liệu trước `max(sharedFrom, now − historyDays)`; `docs/06` “Người thân không mặc định truy cập toàn bộ dữ liệu trước ngày chia sẻ”, `docs/02` “Quyền theo từng hồ sơ **và khoảng lịch sử**”.

**Nguyên nhân:** `listAlerts` chỉ `requireSubject` + `assertAction('receive_alerts')` (`incidents.service.ts:639-660`); `loadVisibleIncident` không gọi `requireHistory` (`:689-709`). `AccessService.requireHistory` (`access.service.ts:97-112`) chỉ được dùng ở measurements và assistant.

**Ảnh hưởng người dùng thật:** đây là dữ liệu sức khỏe nhạy cảm nhất (té ngã). Một người thân mới được mời “xem tình hình từ hôm nay” vẫn đọc được tiền sử ngã của bố/mẹ mình, kể cả các lần đã hủy mà chủ hồ sơ có thể không muốn kể. Nghịch lý kèm theo: P2-7 cho thấy *số đo* bị chặn quá chặt, còn *cảnh báo* thì không chặn gì.

**Đề nghị:** truyền `effectiveFrom` vào truy vấn incident (`detectedAt >= effectiveFrom`) và vào `loadVisibleIncident`; thêm test biên (sharedFrom hôm nay, incident 3 ngày trước → 404/403).

### P1-2 — Quyền trong lời mời không gác dữ liệu sức khỏe

**Bước tái hiện:** tạo lời mời với `{historyDays:1, canReceiveAlerts:false, canAcknowledge:false, canResolve:false, canViewAi:false}`, chấp nhận, rồi gọi các endpoint người thân dùng:

```
status        -> 200  {"lastHeartRateBpm":61,"lastHeartRateQuality":"valid","batteryPercent":86,"serial":"AN-2026-001","label":"Vòng đeo tay của bà An"}
devices       -> 200  (cùng dữ liệu thiết bị + BPM mới nhất)
measurements  -> 200  (lịch sử đo bị kẹp theo sharedFrom)
daily-summary -> 200
alerts        -> 403
```

Trên UI (`C:\tmp\qa-priv\cg-dashboard-1280.png`):

```
Tổng quan — Bà Trần Thị An
Lịch sử đo · Tất cả cảnh báo
Không tải được dữ liệu tổng quan
Quyền được chia sẻ không cho phép thao tác này. Kiểm tra kết nối và thử lại.
```

**Expected:** một trong hai hướng rõ ràng — (a) có quyền riêng “xem số đo/thiết bị” trong `CarePermissions` và UI phản ánh đúng; hoặc (b) UI nói thẳng “mời = chia sẻ toàn bộ dữ liệu đo + thiết bị” và bỏ các toggle gây hiểu sai. Dashboard phải hiển thị được khi thiếu quyền cảnh báo (chỉ ẩn khối cảnh báo), không sập toàn trang.

**Actual:** `CarePermissions` (`core.ts:57-65`) chỉ có `historyDays` + 4 hành động, **không có quyền đọc số đo/thiết bị**; `/status`, `/devices`, `/measurements`, `/daily-summary` chỉ gọi `requireSubject`. `DashboardPage.tsx:94` gộp `status|summary|openAlerts` vào `anyError` nên một 403 cảnh báo làm hỏng cả tổng quan.

**Ảnh hưởng người dùng thật:** chủ hồ sơ tưởng đã tắt chia sẻ dữ liệu, nhưng người thân vẫn thấy nhịp tim và thiết bị của người già; ngược lại người thân bị “khóa” phần an toàn nhất (cảnh báo) và nhận màn hình lỗi. Ranh giới đồng thuận không khớp với điều khiển trên UI.

### P1-3 — Dữ liệu sức khỏe gửi provider AI không có thông báo/đồng ý

**Bước tái hiện:** chạy API với `AI_BASE_URL=http://localhost:3299/v1`, provider giả ghi lại request; mở `/app/assistant` hoặc gọi `GET /subjects/:id/assistant/summary`.

**Dữ liệu thật đã gửi đi** (trích `C:\tmp\qa-priv\ai-requests.log`):

```json
{"model":"fake-model","messages":[{"role":"system","content":"…"},{"role":"user","content":
"Khoảng thời gian: …\nHồ sơ: hồ sơ được theo dõi (không cung cấp tên).\nDữ liệu tổng hợp duy nhất được dùng…:
{\"samples\":1681,\"heartRate\":{\"validSamples\":1549,\"min\":59,\"avg\":68.3,\"max\":77},
 \"batteryPercent\":86,\"steps\":5068,\"alerts\":{\"byState\":{\"cancelled\":1,\"resolved\":1,\"open\":1},
 \"latest\":{\"type\":\"fall\",…}},…}"}]}
```

**Điểm tốt (đã kiểm):** **không** gửi tên, email, số điện thoại, `subject_id`, telemetry thô; adapter không đưa lỗi mạng/URL/key vào message; audit chỉ lưu `provider/status/period`, không lưu prompt.

**Vấn đề:** (1) không có thông báo nào trong UI rằng dữ liệu được gửi tới nhà cung cấp ngoài — grep toàn bộ `apps/web/src` không có chuỗi “nhà cung cấp/provider/gửi tới”; trang chỉ nói “Trợ lý không chẩn đoán, không kê đơn” (`AssistantPage.tsx:213-214`). (2) Không có bản ghi đồng ý: `subjects` không có trường consent, `ai_summaries` không có `actor_user_id`, chỉ có `canViewAi` do **chủ hồ sơ** cấp cho người thân (`core.ts:57-65`). (3) `AI_BASE_URL` nhận mọi host, kể cả `http://` (không kiểm TLS/allowlist) — `assistant-adapter.ts:71-75`; `AI_API_KEY` không bắt buộc. (4) Mỗi lần **GET** summary đều ghi một bản ghi mới chứa toàn bộ aggregate (10 bản ghi chỉ sau vài lần xem trong phiên này) — xem P1-5.

**Expected:** theo `docs/07` (“Không … gửi dữ liệu sức khỏe thật sang dịch vụ bên ngoài mặc định; phải xác định cơ sở đồng ý và chính sách lưu dữ liệu trước”) và `docs/13` mục 10: thông báo rõ trước khi bật, ghi nhận đồng ý theo hồ sơ + phiên bản chính sách, và có công tắc tắt.

**Ảnh hưởng người dùng thật:** người cao tuổi (và người trả tiền/giám hộ) không biết nhịp tim, số bước, số lần ngã của mình đã được gửi cho một dịch vụ AI bên thứ ba. Với dữ liệu thật, đây là căn cứ đồng thuận thiếu, không phải lỗi kỹ thuật nhỏ.

### P1-4 — Người được đo không có quyền gì

**Bằng chứng code:** `subjects.ownerUserId` (`schema.ts:142-152`) là quan hệ duy nhất tới con người; `AccessService.resolve` chỉ trả `owner` hoặc `caregiver` (`access.service.ts:29-72`); toàn bộ endpoint nghiệp vụ đòi `SessionGuard` + `requireSubject`; bảng thông báo chỉ có `recipient_user_id` trỏ `users` (`schema.ts` `notificationOutbox`) nên **không có kênh nào để thông báo cho người được đo**. `RegisterPage.tsx:69` mô tả đăng ký là “để bắt đầu theo dõi người thân” — sản phẩm không có vai trò “tôi là người được đo”.

**Hệ quả:** người cao tuổi bị gắn thiết bị, bị chia sẻ dữ liệu, bị gửi dữ liệu sang AI, nhưng: không biết ai đang xem, không biết chia sẻ tới ngày nào, không thu hồi được, không xóa được, không phản đối được. `docs/02` đã ghi đúng rằng “mô hình người đại diện khi người cao tuổi không có tài khoản là vấn đề cần xác nhận, **không tự cho người thân quyền sở hữu**” — code hiện cho chủ hồ sơ toàn quyền (`OWNER_PERMISSIONS`, `core.ts:76-82`) mà không có bước xác nhận nào của người được đo.

**Đề nghị (thiết kế, cần chốt với người dùng thật):** tối thiểu ghi nhận “cơ sở đại diện” (ai, căn cứ nào, ngày), thông báo cho người được đo bằng kênh không cần tài khoản (thiết bị/loa/giấy do người chăm sóc ký xác nhận), và màn hình “ai đang xem dữ liệu của tôi” đọc được trên thiết bị.

### P1-5 — Không có chính sách, thời hạn lưu, hay đường xóa

**Đã kiểm:**

- Không có trang/nút chấp thuận điều khoản/chính sách riêng tư ở đăng ký (`grep -rn "riêng tư|privacy|điều khoản|terms|đồng ý" apps/web/src` chỉ ra 1 dòng trong `InvitePage.tsx`).
- Không có endpoint xóa/thu hồi dữ liệu: chỉ có `GET /subjects/:id/export.csv` (`measurements.controller.ts:47-60`). Đã thử: `POST /subjects/aaaa…/deletion-requests` → **404**, `DELETE /subjects/aaaa…` → **404**.
- Tác vụ dọn dẹp duy nhất: `deleteExpiredSessions` (`auth.service.ts:155-156`) và hiện **không được schedule** ở đâu; không có retention cho `telemetry`, `incident_events`, `audit_logs`, `ai_summaries`, `realtime_events`.
- `ai_summaries` tăng mỗi lần xem, không có `actor_user_id` (`schema.ts:545-564`), nội dung chứa nguyên aggregate sức khỏe:

```json
{"content":{"headline":"Dữ liệu theo dõi 2026-11-08–2026-11-15: 1681 mẫu đo, nhịp tim trung bình 68.3 bpm, 3 cảnh báo.",…},
 "aggregate":{"samples":1681,"heartRate":{"min":59,"avg":68.3,"max":77},…}}
```

**Ảnh hưởng:** trái `docs/02` FR-14 (“Quyền người yêu cầu được kiểm tra; phạm vi xóa gồm bản sao, AI, cache và chính sách backup”) và `docs/04` mục “Retention và xóa”. Với dữ liệu tổng hợp hiện tại rủi ro thấp, nhưng đây là điều kiện chặn trước khi dùng dữ liệu thật; đồng thời bản thân việc demo-public mà không có chính sách dễ tạo cảm giác “đã đủ tuân thủ”.

## 3. Chi tiết finding P2

**P2-1 — Liên hệ khẩn cấp (contract/schema mới).** `emergency_contacts` đã có trong migration `0001_pretty_caretaker.sql` và `schema.ts:212-232` với `phone text NOT NULL` (plaintext), `uniqueIndex … where is_primary`, `index(subject_id)`. Contract `contacts.ts` trả `phone` nguyên số, `items.max(5)` chỉ ở tầng zod. **Tại HEAD này** không có controller/service/UI/audit: `GET /subjects/:id/emergency-contacts` → **404**, 0 dòng trong DB (nhánh `feat-emergency-contacts` đã có code nhưng chưa hợp nhất — finding này là danh sách điều kiện phải giữ khi hợp nhất). Comment contract nói “người thân chỉ đọc khi được chia sẻ quyền nhận cảnh báo”, nhưng quyết định đó chưa được hiện thực và **chưa có quyết định ai được thấy số**: nếu hiện `tel:` trên cảnh báo cho mọi người có `receive_alerts` thì số của một người thứ ba (có thể không đồng ý) bị phát cho cả gia đình. Đề nghị chốt trước khi hợp nhất: ai đọc (owner/caregiver/admin), có che số ở danh sách không, ghi audit mỗi lần đọc/xuất, chuẩn hóa E.164, và đường xóa (hiện chỉ xóa được nếu xóa hồ sơ, mà xóa hồ sơ cũng không có).

**P2-2 / P2-3 — Rò rỉ chéo giữa những người thân.** `buildRecipients` trả `displayName + permissions` của mọi recipient cho mọi người có `receive_alerts`; UI in ra “Người nhận cảnh báo / Trần Thị An xác nhận: có · đóng: có”. Stream SSE phát lại `care.accepted` với `{"linkId":…,"caregiverUserId":…}`. Không phải dữ liệu sức khỏe, nhưng là PII của người thứ ba + cấu hình chia sẻ của chủ hồ sơ.

**P2-4 — Thu hồi quyền phụ thuộc việc stream đang mở.** `useSubjectEvents.ts:77-88` chỉ xóa cache khi nhận event `revoked`. Nếu tab ẩn/offline lúc thu hồi, lần mở lại gọi SSE và nhận **403 trước khi mở stream** (`realtime.controller.ts:24`), nên `onerror` chỉ chạy vòng retry/backoff vô hạn (`:127-146`), không có `revoked`, không xóa `queryClient`. Trạng thái “đã thu hồi” đúng chỉ khi stream đang mở — phiên này xác nhận nhánh đó hoạt động (nhận `event: revoked` ngay sau DELETE, các endpoint sau đó 404). *Chưa tái hiện được nhánh tab ẩn bằng Playwright; kết luận này dựa trên đọc code.*

**P2-5 — Audit.** `AccessService` ném lỗi mà không ghi audit (`requireSubject/requireAction`), nên không có dấu vết khi một tài khoản dò `subjectId` của người khác. Bằng chứng: id audit mới nhất trước khi dò là `37`; sau **7 request bị từ chối** (3× `subjects/<uuid lạ>/measurements`, 3× `subjects/aaaa…/measurements` bằng tài khoản đã bị thu hồi, 1× `alerts/f1111…`) id mới nhất **vẫn là 37** — không có bản ghi `denied` nào. `/admin/audit` trả `metadata` chứa `subjectId`, `caregiverUserId`, `rowCount` của export, kỳ AI — đủ để admin kỹ thuật dựng lại “ai chăm sóc ai, ai xuất dữ liệu khi nào”. Với `docs/02` FR-11 (admin không xem sức khỏe) thì đây là vùng xám cần chốt: metadata nào được phép.

**P2-6 — Copy đồng thuận trên trang chia sẻ.** Ảnh `share-1280.png`: form mời chỉ có email, “Số ngày lịch sử được xem”, hạn lời mời, 4 checkbox. Không có: danh sách loại dữ liệu được chia sẻ (nhịp tim, số bước, té ngã, thiết bị, vị trí đeo), cảnh báo rằng người thân có thể tải CSV, cảnh báo rằng thu hồi **không** thu hồi được bản đã tải/chụp, và không có bất kỳ câu nào về sự đồng ý của người được đo. Nhãn “Số ngày lịch sử được xem” dễ hiểu sai thành “cho xem 30 ngày trước” trong khi `sharedFrom` chặn dữ liệu trước khi chấp nhận (`access.service.ts:104-106`) — cần nói rõ. Mặc định `canReceiveAlerts: true`, `canAcknowledge: true`, `historyDays: 30` (`core.ts:68-74` → `SharePage.tsx:56-60`): việc “nhận cảnh báo” là mục đích của lời mời nên hợp lý, nhưng `canAcknowledge` là **hành động nhận trách nhiệm hỗ trợ** (docs/03: “chỉ có nghĩa đã nhận trách nhiệm”), bật sẵn mà không giải thích là mặc định quyền nhạy cảm. `canResolve`, `canViewAi` mặc định tắt — đúng.

**P2-7 — Người thân mới nhận lỗi thay vì cửa sổ bị kẹp.** `exportCsv` không kẹp `from` theo `effectiveFrom` như `list` (`measurements.service.ts:221-227` so với `:74-80`), và client luôn gửi `from` (`history/api.ts:11-24`). Kết quả thật: `measurements?from=now-24h` → 403; `export.csv` → 403 `{"code":"FORBIDDEN","message":"Khoảng thời gian yêu cầu vượt quá quyền xem lịch sử được chia sẻ.","details":{"effectiveFrom":"2026-11-15T00:12:46.583Z"}}`; UI hiện “Quyền hiện tại cho phép xem tối đa 1 ngày” ngay cạnh dòng lỗi. Đã báo ở review backend 14/11 (P2-1); phiên này bổ sung bằng chứng CSV + copy UI và đề nghị sửa theo hướng kẹp (`clamp`) thay vì 403, hoặc bỏ `from` ở client.

**P2-8 — AI: chặn theo từ khóa, không hậu kiểm.** `OUT_OF_SCOPE_PATTERNS` + `isOutOfScopeQuestion` (`assistant.service.ts:76-92, 185-190`) chặn theo substring (“bệnh”, “thuốc”, “nguy cơ”, “risk”…): chặn nhầm câu hỏi dữ liệu hợp lệ, và câu không chứa từ khóa (ví dụ “nhịp tim 95 khi nghỉ có sao không?”) vẫn đi tới model; đầu ra chỉ được `stripHtml/truncate` + schema, **không có kiểm nội dung tư vấn y tế**. Disclaimer có mặt ở mọi bản tóm tắt/câu trả lời (`ASSISTANT_DISCLAIMER`, `AssistantPage.tsx:50-53, 95, 336`) — đây là điểm tốt. Ngoài ra tóm tắt AI không mang nhãn “dữ liệu mô phỏng” trong nội dung, trong khi dashboard ghi “Nguồn: dữ liệu mô phỏng” và CSV có cột `is_synthetic`: cùng một con số, hai mức minh bạch khác nhau, dễ làm người đọc AI tưởng là số đo thật của người thật.

**P2-9/P2-10/P2-11** — chi tiết nhỏ: thông báo “Chủ hồ sơ có thể bật `canViewAi` khi chia sẻ quyền theo dõi” (khóa kỹ thuật) và “Bạn chưa có hồ sơ nào bật quyền xem AI” (sai ngữ cảnh khi đang có hồ sơ); `GET /subjects` trả `ownerUserId` cho người thân; preview lời mời công khai trả `subjectName`/`inviterName` cho bất kỳ ai có token, không rate limit.

## 4. Đã kiểm và đạt (đối chứng dương)

Ghi lại để không báo “đạt” chung chung và để phiên sau không làm mất các hành vi này:

| Hành vi | Cách kiểm | Kết quả |
| --- | --- | --- |
| Người ngoài không đọc được sức khỏe qua role admin | `admin.txt` gọi `/subjects/aaaa…/measurements` | **404** (đúng `docs/02` FR-11) |
| Thu hồi có hiệu lực tức thời trên REST + SSE đang mở | DELETE care-link khi stream mở | `event: revoked` rồi `measurements`/`alert detail` → **404** |
| `canReceiveAlerts=false` chặn cảnh báo và stream | `cg2` gọi `/alerts`, `/alerts/:id`, `/events` | **403** cho cả ba (finding P1-1 của review backend 14/11 đã được đóng, tái xác nhận) |
| `canViewAi=false` chặn trợ lý | `cg2` gọi `/assistant/summary` | **403** |
| Biên lịch sử số đo đúng | người thân `sharedFrom` −20 ngày: `from` −19d → 200; −25d, −40d → 403 | đúng |
| AI không gửi PII | đọc `ai-requests.log` | chỉ aggregate; không tên/email/phone/subject_id/telemetry thô |
| AI lỗi/không cấu hình → fallback, cảnh báo vẫn chạy | `AI_BASE_URL` trỏ server trả JSON sai | `status=degraded`, `provider=template`, không 500 |
| Audit không chứa dữ liệu sức khỏe | `/admin/audit` | metadata chỉ id/kỳ/đếm; `auth.login` không có email |
| Nhãn mô phỏng | dashboard owner, landing, footer cảnh báo | “Nguồn: dữ liệu mô phỏng”, “Bản demo · dữ liệu mô phỏng”, “ứng dụng không tự gọi cấp cứu” |
| Không có endpoint sức khỏe nào không cần đăng nhập | duyệt `@Public()` + `APP_GUARD` | chỉ auth/invite preview/health/device ingest |
| Giao diện 1280/390/chữ lớn | Playwright | không tràn ngang: `scrollWidth == clientWidth` ở 390 và ở chữ lớn (20px) |
| Không tuyên bố tuân thủ pháp luật | grep “tuân thủ/Nghị định/GDPR/HIPAA” | không có trong UI/docs đã đọc — **giữ nguyên**, không được thêm khi chưa có căn cứ |

## 5. Không thể kết luận nếu không có người dùng thật / chuyên gia pháp lý

1. **Chủ hồ sơ có thực sự hiểu mình đang chia sẻ gì không?** Cần kiểm khả dụng với người cao tuổi/người chăm sóc thật (đọc hiểu câu “xem 30 ngày lịch sử”, hiểu hậu quả thu hồi). Phiên này chỉ chứng minh copy **thiếu**, không chứng minh người dùng hiểu sai ở mức nào.
2. **Mô hình người đại diện có chấp nhận được về mặt đạo đức/pháp lý không?** Cần chuyên gia pháp lý Việt Nam (dữ liệu sức khỏe, người cao tuổi, người mất năng lực, căn cứ đại diện) và ý kiến của chính người được đo. Sản phẩm hiện **không** được mô tả là tuân thủ bất kỳ khung pháp lý nào — không được tự nhận.
3. **Rủi ro thực của AI provider:** phụ thuộc hợp đồng/điều khoản lưu trữ của nhà cung cấp thật; phiên này chỉ kiểm nội dung payload với provider giả.
4. **Chất lượng khuyến nghị của AI** (có tạo cảm giác chẩn đoán không) chỉ đo được bằng bộ đánh giá có chuyên gia y tế, không bằng đọc prompt.
5. **Trẻ em/người mất năng lực:** code hiện không phân biệt độ tuổi/năng lực; không có trường nào cho biết người được đo là trẻ em hay người cần giám hộ. Không đủ căn cứ để nói sản phẩm dùng được cho các nhóm này — nên tuyên bố rõ **ngoài phạm vi** cho tới khi có luồng đồng ý riêng.
6. **Rà soát pháp lý về liên hệ khẩn cấp:** số điện thoại của người thứ ba (không phải người dùng) là PII; cần ý kiến trước khi hiển thị trên cảnh báo.
7. Ba điểm chưa kiểm được bằng máy trong phiên: nhánh tab ẩn khi bị thu hồi (P2-4), retention thực tế theo thời gian dài (P1-5), và multi-instance cho rate limit AI (`assistant.service.ts` ghi rõ `scope: single_process_memory`).

## 6. Giới hạn sản phẩm cần nói rõ (đạo đức)

- Sản phẩm là **demo dữ liệu tổng hợp**, không phải thiết bị y tế, không gọi cấp cứu, không thông báo khi đóng trình duyệt — landing và footer đã nói đúng, cần giữ.
- **Không** dùng được cho trẻ em, người mất năng lực, hoặc làm căn cứ ra quyết định y tế, cho tới khi có: cơ chế đại diện được ghi nhận, chính sách dữ liệu, thời hạn lưu, đường xóa, và kiểm với người dùng thật.
- Cảnh báo “người thân đã xác nhận hỗ trợ” **không** đồng nghĩa người được đo an toàn (`docs/03`); UI hiện đã ghi “Chưa có người xác nhận hỗ trợ”, cần giữ cảnh báo tương tự khi đã xác nhận.
- Không được tuyên bố “tuân thủ” bất kỳ luật/nghị định nào trong báo cáo đồ án khi chưa có đánh giá pháp lý.

## 7. Đề nghị thứ tự xử lý

1. P1-1 (chặn cảnh báo trước `sharedFrom`) — nhỏ, sửa được ngay, chặn rò rỉ thật.
2. P1-2 (quyền đọc số đo/thiết bị + dashboard không sập) — cần chốt mô hình quyền trước khi sửa UI.
3. P2-6 (copy đồng thuận + mặc định) — nội dung phải viết cùng P1-4.
4. P1-3/P1-5 (đồng ý AI, chính sách, retention, xóa) — điều kiện để cho người thật dùng.
5. P1-4 (quyền của người được đo) — cần quyết định thiết kế + ý kiến người dùng thật.
6. P2-1 (liên hệ khẩn cấp) — chốt chính sách trước khi viết API/UI.
7. Còn lại: P2-2/3/4/5/7/8/9/10/11.

## 8. Tóm tắt 5 dòng

1. Ranh giới chia sẻ dữ liệu sức khỏe bị lệch hai chiều: **cảnh báo té ngã trước mốc chia sẻ vẫn đọc được** (P1-1), còn **số đo của người thân vừa được mời thì bị 403** (P2-7).
2. Bốn toggle trong lời mời không gác dữ liệu: tắt hết vẫn xem được nhịp tim hiện tại, thiết bị và lịch sử đo, trong khi dashboard người thân sập vì thiếu quyền cảnh báo (P1-2).
3. Dữ liệu sức khỏe tổng hợp được gửi tới provider AI ngoài mà không có thông báo hay bản ghi đồng ý; `AI_BASE_URL` nhận cả `http://` (P1-3).
4. Người được đo không có tài khoản, không được thông báo, không thu hồi được; không có chính sách riêng tư, thời hạn lưu hay đường xóa; `ai_summaries` phình theo mỗi lần xem (P1-4, P1-5).
5. Phần làm tốt giữ nguyên: admin không đọc được sức khỏe, thu hồi ngắt stream ngay, SSE chặn `canReceiveAlerts=false`, AI không gửi PII, nhãn mô phỏng và disclaimer có mặt — nhưng **chưa được coi là đủ** cho dữ liệu người thật.

---

### Phụ lục A — lệnh tái lập nhanh

```bash
pnpm build:contracts
PGLITE_DATA_DIR=.data/review-privacy pnpm --filter @annhien/api db:migrate
PGLITE_DATA_DIR=.data/review-privacy pnpm --filter @annhien/api seed
PGLITE_DATA_DIR=.data/review-privacy PORT=3210 WEB_ORIGIN=http://localhost:5181 \
  AI_BASE_URL=http://localhost:3299/v1 pnpm --filter @annhien/api dev
cd apps/web && VITE_API_BASE_URL=http://localhost:3210/api/v1 node node_modules/vite/bin/vite.js --port 5181
```

Mật khẩu seed: owner/caregiver `demo-an-nhien-2026`, admin `demo-admin-2026` (`apps/api/src/database/seed.ts:29-31`).

### Phụ lục B — ảnh và log (ngoài repo)

- `C:\tmp\qa-priv\share-1280.png` — form mời: mặc định bật “Nhận cảnh báo”, “Xác nhận đang hỗ trợ”, 30 ngày; không có mô tả dữ liệu/rủi ro.
- `C:\tmp\qa-priv\share-390.png`, `share-1280-large.png` — 390 và chữ lớn: không tràn ngang.
- `C:\tmp\qa-priv\cg-dashboard-1280.png` — dashboard người thân `canReceiveAlerts=false` sập.
- `C:\tmp\qa-priv\cg-history-1280.png` — lỗi biên lịch sử + copy “cho phép xem tối đa 1 ngày”.
- `C:\tmp\qa-priv\alert-detail-1280.png` — danh sách người nhận kèm quyền; không có liên hệ khẩn cấp.
- `C:\tmp\qa-priv\assistant-1280.png` — tóm tắt AI không nêu provider/nhãn mô phỏng trong nội dung.
- `C:\tmp\qa-priv\ai-requests.log` — payload thật gửi provider giả.
- `C:\Users\nguye\AppData\Local\Temp\qa-priv\api.log` — log API phiên này.
