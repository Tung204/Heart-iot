# Review sản phẩm độc lập v2 — An Nhiên

- **HEAD:** `8434d66cb8ecb3d92a9a054f87f843d16dbaa3e7` (`perf(web): tách chunk theo route và thống nhất quyền xem cảnh báo`), nhánh/worktree `qa-product-gaps`.
- **Thời điểm:** 2026-11-15 07:04 (Asia/Ho_Chi_Minh, UTC+7). Reviewer độc lập, chỉ đọc; **không sửa code, docs, schema hay DB của lead**.
- **Phạm vi:** đối chiếu sản phẩm với `docs/02`, `docs/03`, `docs/04`, `docs/06`, `docs/08`, `docs/11`, `docs/12`, `docs/14`; góc nhìn người thân, người cao tuổi, điều dưỡng/bác sĩ (không chẩn đoán), admin và người triển khai.
- **Lưu ý:** báo cáo này **không đóng** finding của review backend/frontend 14/11; các P1/P2 cũ vẫn giữ nguyên trạng thái trong báo cáo của họ. Đây là các khoảng trống sản phẩm mới, được kiểm độc lập trong phiên này.

## 1. Kết luận điều hành

Sản phẩm đã có một lát cắt kỹ thuật chạy được, có kiểm quyền, chống trùng, SSE, outbox và giao diện responsive. Tuy nhiên **chưa hoàn chỉnh như một sản phẩm theo dõi người thân**: ba hành trình an toàn cốt lõi vẫn thiếu hoặc hiển thị sai — ứng viên té ngã chưa có kết quả cuối bị ẩn, số bước có thể báo “0 bước · đủ dữ liệu” khi gần như không có dữ liệu, và cảnh báo của hồ sơ khác không xuất hiện khi người thân đang xem một hồ sơ khác.

Các phần “admin thiết bị”, “liên hệ thủ công”, “xóa/lưu trữ dữ liệu” được tài liệu mô tả nhưng chưa có đường sử dụng trên giao diện hoặc chưa có endpoint. Vì vậy **không thể coi v1 là hoàn chỉnh để dùng dữ liệu thật**, dù demo dữ liệu tổng hợp hoạt động.

Không có P0 trong môi trường demo synthetic; có **6 finding P1** và **8 finding P2** dưới đây. Các P1 an toàn sẽ thành P0 nếu dùng với người thật.

## 2. Môi trường và phương pháp

**Môi trường kiểm:**

- Windows, Node `v24.22.2`, pnpm `12.5.1`.
- `pnpm install --prefer-offline --frozen-lockfile` trong worktree; contracts build; API build.
- API riêng cổng **3212**, DB PGlite riêng `.data/review-product` (seed demo rồi sao chép sang DB kiểm UI), **không dùng API 3000 hay `.data/pglite` của lead**.
- Web dev riêng cổng **5175**, `VITE_API_BASE_URL=http://localhost:3212/api/v1`; Playwright Chromium chụp ảnh tại `reports/qa/evidence/`.
- Ảnh hưởng dữ liệu: chỉ DB review tự tạo; đã dừng API/web riêng và xóa `.data/review-*` sau khi kiểm. Không ghi vào DB/demo của lead.

**Đã chạy thật trong phiên:**

| Lệnh | Kết quả |
| --- | --- |
| `pnpm -r typecheck` | PASS — contracts, web, api, simulator đều `Done` |
| `pnpm --filter @annhien/web test` | PASS — 20 file / 73 test |
| `pnpm --filter @annhien/api test` | PASS — 14 suite / 100 test (PGlite in-memory) |
| `pnpm --filter @annhien/web build` | PASS — route đã tách chunk; bundle chính 264.55 kB |
| Playwright tự viết trên web 5175/API 3212 | Login owner/admin, dashboard, alerts, alert detail, Studio data, notifications, đổi hồ sơ, SOS liên hồ sơ |

**Chưa kiểm / không kết luận:**

- Không chạy lại E2E chính thức của repo; chỉ dùng kịch bản Playwright tự viết.
- Không kiểm firmware ESP32, MQTT broker/ACL/ACK thật, Web Push, PostgreSQL nhiều instance, backup/restore, TLS production, p95 NFR-07.
- Không kiểm khả dụng với người cao tuổi/người chăm sóc thật; không có nghiệm thu y khoa, không đánh giá độ chính xác phát hiện ngã.
- Không kiểm lại toàn bộ luồng caregiver/invitation/revoke trong phiên này; các kết luận về caregiver dựa trên code + dữ liệu seed, ghi rõ ở từng mục.
- Không đọc/không tin kết quả test trong handoff cũ; các test trên là do reviewer chạy lại.

## 3. Đối chiếu nhanh FR/NFR

Ký hiệu: **Có + đã kiểm** = có code và có bằng chứng chạy trong phiên; **Có code** = đọc code/UI, chưa chạy hết; **Thiếu** = không có đường sản phẩm.

| ID | Trạng thái thực tế | Ghi chú |
| --- | --- | --- |
| FR-01 | Có + đã kiểm một phần | Login/logout chạy; route bảo vệ đọc code, chưa kiểm lại phiên hết hạn trong phiên này; **không có quên/đổi mật khẩu, xác minh email, cài đặt tài khoản**. |
| FR-02 | Có code | Mời/chấp nhận/thu hồi có; **không thu hồi lời mời đang chờ, không gửi lại, không từ chối**; cảnh báo đa hồ sơ bị động (P1-4). |
| FR-03 | Có + đã kiểm claim qua API | Claim/release/rotate có endpoint; **admin không có UI thiết bị** (P1-5); copy “mỗi hồ sơ một thiết bị” sai so với backend (P2-6). |
| FR-04 | Có code + phát hiện lỗi | HR/quality có; **bước chân báo 0/complete khi chỉ có 1 mẫu** (P1-2); `clockStatus` không hiển thị trên thiết bị (P2-6). |
| FR-05 | Có + đã kiểm UI | Biểu đồ, gap, CSV có; **không có báo cáo tuần/tháng dạng người đọc**. |
| FR-06 | Có code nhưng sơ sài | State machine có; **suspected/unconfirmed bị ẩn** (P1-1); UI không có cửa sổ hủy (thiết bị ngoài phạm vi). |
| FR-07 | Có + đã kiểm UI | Ack/resolve/409 có; **cảnh báo hồ sơ khác không hiện khi đang xem hồ sơ này** (P1-4); thiếu liên hệ (P1-3). |
| FR-08 | Có code | Offline/stale/pin null có nhãn; **không có cảnh báo pin yếu/offline chủ động**, không hiện `clockStatus` trên thiết bị. |
| FR-09 | Có code ingest SOS + đã kiểm | SOS tạo incident; **không có liên hệ thủ công/sổ liên hệ** (P1-3); không có nút SOS trên web (đúng phạm vi thiết bị). |
| FR-10 | Có code, chưa mở lại UI | Template/AI summary có; **không đưa coverage/gap/last-seen vào summary** (P2-2); chưa cấu hình provider thật. |
| FR-11 | Có code + đã kiểm UI admin | Chỉ user/policy/audit/tổng quan; **không có danh sách thiết bị, claim code, rotate key, lỗi ingest** (P1-5). |
| FR-12 | Thiếu, đã tuyên bố ngoài phạm vi | Không có Web Push; UI có disclaimer. Đây là rủi ro an toàn đã biết, không phải finding mới. |
| FR-13 | Có code | Policy 5 trường có CAS; **không có ngưỡng sức khỏe/ngưỡng theo hồ sơ**; chưa chạy publish trong phiên này. |
| FR-14 | Thiếu một phần | CSV telemetry có; **không có archive, deletion-request, consent, retention, xóa AI/cache/backup** (P1-6). |
| NFR-01 | Có code, không chạy lại toàn bộ | Kiểm quyền theo hồ sơ có; reviewer không re-test cross-account trong phiên này. |
| NFR-02 | Có code, chưa chạy lại race | Dedupe/outbox có; không re-chạy toàn bộ race trong phiên này. |
| NFR-03 | Có code nhưng thiếu UI | Telemetry giữ `clock_status`; **incident không giữ clock status, dùng receivedAt làm detectedAt khi thiếu giờ** (P2-7). |
| NFR-04 | Thiếu bằng chứng | Có chữ lớn/responsive; **chưa thử người cao tuổi thật**, không được báo “đạt”. |
| NFR-05 | Thiếu một phần | Cookie HttpOnly, secret demo ngoài Git; **không có consent, xóa dữ liệu, log truy cập của người thân**. |
| NFR-06 | Thiếu | Outbox retry có; **chưa có backup/restore, chưa có bộ đếm mất mẫu trên UI**. |
| NFR-07 | Chưa kiểm | Không có phép đo p95; không kết luận đạt. |

## 4. Findings P1

### P1-1 — Ứng viên té ngã không có kết quả cuối bị ẩn hoàn toàn; hệ thống có thể báo “không có cảnh báo” trong tình huống nguy hiểm nhất

**Mức:** P1 an toàn (P0 nếu dùng người thật). Đây là finding quan trọng nhất.

**Vị trí:**

- `apps/api/src/incidents/incidents.service.ts:276` — mọi incident mới bắt đầu `state: 'suspected'`.
- `apps/api/src/incidents/incidents.service.ts:644-645` — danh sách “đang mở” chỉ lấy `['open','acknowledged']`; “đã đóng” lấy `['resolved','cancelled','unconfirmed']`, **không bao giờ lấy `suspected`**.
- `apps/api/src/incidents/incidents.service.ts:696-697` — chi tiết incident `suspected` trả **404**.
- `apps/api/src/incidents/incidents.service.ts:422-425` — SSE cũng không phát incident `suspected`.
- Trạng thái `unconfirmed` chỉ xuất hiện trong enum/label (`packages/contracts/src/core.ts:113`, `apps/web/src/features/alerts/labels.ts:13`), **không có chỗ nào set**; không có job timeout/reconciler cho `suspected`.
- Tài liệu yêu cầu ngược lại: `docs/03-kien-truc-he-thong.md:80` (“Candidate không có kết quả cuối — hiển thị ‘chưa xác định do thiếu dữ liệu’; không báo bình thường”), `docs/06-trai-nghiem-va-man-hinh.md:54` (trạng thái “Candidate thiếu kết quả — Chưa xác định”).

**Tái hiện (API riêng 3212, DB seed):**

```bash
# 1) Gửi chỉ fall.candidate cho thiết bị demo; không gửi confirmed/cancelled
curl -s -X POST "$B/ingest/events" \
  -H 'content-type: application/json' \
  -H "x-device-id: $DEMO_DEVICE_ID" -H "x-device-key: $DEMO_DEVICE_KEY" \
  -d '{"schema_version":"1.0","message_id":"qa-suspected-001","device_id":"...","boot_id":"qa-boot-1","sequence":9001,"measured_at":"2026-11-14T23:54:16.000Z","clock_status":"synced","uptime_ms":100000,"firmware_version":"qa-1.0","incident_id":"qa-inc-suspected-001","event_revision":1,"event_type":"fall.candidate","incident_type":"fall","evidence":{"algorithm_version":"qa","wear_location":"wrist","motion_quality":"valid","heart_rate_quality":"valid","heart_rate_bpm":80}}'
# → 202 accepted, incidentId=2ff5d301-b4a8-480b-a447-3f2892bf1d34

# 2) Danh sách cảnh báo
curl -s -b "$COOKIE" "$B/subjects/$SUBJECT/alerts?state=open"
# → chỉ có incident seed ffffffff..., KHÔNG có 2ff5d301...
curl -s -b "$COOKIE" "$B/subjects/$SUBJECT/alerts?state=closed"
# → chỉ có resolved/cancelled seed, KHÔNG có 2ff5d301...

# 3) Chi tiết incident vừa tạo
curl -s -o /tmp/detail.json -w '%{http_code}\n' -b "$COOKIE" "$B/alerts/2ff5d301-b4a8-480b-a447-3f2892bf1d34"
# → 404 {"code":"NOT_FOUND","message":"Không tìm thấy cảnh báo."}

# 4) Tổng hợp ngày lại đếm incident này
curl -s -b "$COOKIE" "$B/subjects/$SUBJECT/daily-summary?date=2026-11-15"
# → incidents.total=2 (seed open + suspected), resolved=0
```

**Bằng chứng UI:** `reports/qa/evidence/dashboard-owner.png` — dashboard hiện “Cảnh báo hôm nay: 2 (đã đóng 0)” nhưng mục “Cảnh báo đang mở” chỉ có **1** cảnh báo. Người dùng không có bất kỳ liên kết nào tới ứng viên thứ hai.

**Expected:** Ứng viên không có kết quả cuối phải xuất hiện ở trạng thái “Chưa xác định”, có thời điểm nhận/phát hiện, nằm trong lịch sử kỹ thuật; không được tính là “không có cảnh báo” và không được tự coi là an toàn.

**Actual:** Ứng viên bị ẩn khỏi danh sách, chi tiết 404, SSE không phát; chỉ còn một con số tổng hợp không bấm vào được. Kịch bản nguy hiểm: thiết bị gửi `fall.candidate`, sau đó người đeo bị ngã nặng/mất mạng/thiết bị hỏng nên `fall.confirmed` không tới; người thân thấy “Không có cảnh báo nào cần xử lý”.

**Đề xuất:** thêm job timeout (chính sách demo là sau cửa sổ hủy + timeout cấu hình) chuyển `suspected → unconfirmed`; hiển thị `unconfirmed` trong danh sách “Đã đóng/Chưa xác định” và cho phép mở chi tiết; banner riêng “có ứng viên chưa xác định, thiết bị không gửi kết quả”; sửa `daily-summary` để tách `suspected/unconfirmed` khỏi “cảnh báo đã đóng”; thêm test T-05/T-09.

---

### P1-2 — “0 bước · đủ dữ liệu” khi chỉ có một mẫu và độ phủ 1,2%

**Mức:** P1 tin cậy dữ liệu (P0 nếu dùng người thật).

**Vị trí:**

- `apps/api/src/measurements/measurements.service.ts:466` — mặc định `completeness: 'complete'`.
- `apps/api/src/measurements/measurements.service.ts:471-475` — mẫu đầu tiên của mỗi boot bị bỏ qua, không suy ra delta, nhưng **không đánh dấu partial/unavailable**.
- `apps/web/src/features/dashboard/DashboardPage.tsx:225-229` — `complete` được hiển thị “đủ dữ liệu”.
- Tài liệu yêu cầu: `docs/04-du-lieu-va-giao-tiep.md:57` (“Lần nhận đầu của boot sau một đoạn mất dữ liệu có thể không phân bổ chính xác theo ngày; đánh dấu chưa đủ dữ liệu thay vì cộng toàn bộ vào ngày nhận”).

**Tái hiện:** tạo subject/device mới, gửi **một** telemetry có `steps_since_boot=1234`, rồi gọi daily-summary. Output thật:

```json
{
  "steps": { "total": 0, "completeness": "complete", "notes": [] },
  "coverage": { "observedCount": 1, "expectedCount": 83, "percent": 1.2 },
  "gaps": [{ "from": "2026-11-14T17:00:00.000Z", "to": "2026-11-14T23:55:37.000Z", "reason": "no_data" }]
}
```

**Bằng chứng UI:** `reports/qa/evidence/dashboard-steps-partial.png` — cùng lúc hiện “0 bước / đủ dữ liệu”, “Độ phủ dữ liệu 1.2%”, “1 mẫu đã nhận”, “1 khoảng thiếu dữ liệu”.

**Expected:** khi chưa có ít nhất hai mẫu cùng boot hoặc khi độ phủ quá thấp/gap lớn, hiển thị “Chưa đủ dữ liệu để tính bước” / “Không đủ dữ liệu”, không hiển thị 0 như một kết quả đo.

**Actual:** báo 0 bước với nhãn “đủ dữ liệu”; người thân có thể hiểu là người cao tuổi không vận động, trong khi thực tế gần như không có dữ liệu. Đây là vi phạm FR-04/FR-05 và bài học “không coi thiếu dữ liệu là số 0”.

**Đề xuất:** tính completeness theo boot: nếu một boot chỉ có 0/1 mẫu trong ngày → `unavailable` hoặc `partial`; nếu coverage dưới ngưỡng cấu hình hoặc có gap lớn → hạ completeness; hiển thị “0 bước” chỉ khi có baseline và ít nhất một delta dương/0 hợp lệ; thêm test FR-04/T-04.

---

### P1-3 — Không có liên hệ thủ công trong chi tiết cảnh báo; danh sách người nhận không có số điện thoại/kênh liên hệ

**Mức:** P1 (an toàn/thao tác).

**Vị trí:**

- `apps/web/src/features/alerts/AlertDetailPage.tsx:224-242` — chỉ có nút “Tôi đang hỗ trợ” và “Đóng cảnh báo”; không có nút gọi/liên hệ.
- `apps/web/src/features/alerts/AlertDetailPage.tsx:315-318` — chỉ có câu “hãy gọi cấp cứu theo số khẩn cấp địa phương”, không có số của người thân/người chăm sóc.
- `apps/web/src/features/alerts/AlertDetailPage.tsx:380-390` — “Người nhận cảnh báo” chỉ hiện tên và quyền, không có số/email/kênh liên hệ.
- Schema `apps/api/src/database/schema.ts:142-156` (`subjects`) và `:158-180` (`care_links`) không có trường phone/contact; không có bảng contact book.
- Yêu cầu: `docs/02-yeu-cau-va-pham-vi.md:30` (FR-09 “liên hệ thủ công từ giao diện”); `docs/06-trai-nghiem-va-man-hinh.md:41` (luồng “chọn ‘Tôi đang hỗ trợ’ → liên hệ thủ công → kết thúc”).

**Tái hiện:** mở `/app/alerts/<id>` bằng owner; đọc các nút/links. Kết quả Playwright: `["Quản lý và chia sẻ","← Về danh sách cảnh báo","Tôi đang hỗ trợ","Đóng cảnh báo"]`; không có “Gọi”, “Nhắn”, “Liên hệ”. Ảnh `reports/qa/evidence/alert-detail-owner.png`.

**Expected:** từ cảnh báo, người thân gọi được người đang hỗ trợ/người chăm sóc chính (tel: link), xem ai là người liên hệ ưu tiên, và ghi nhận đã liên hệ; không tự gọi cấp cứu.

**Actual:** phải rời app, tự tìm số; danh sách “Người nhận” không giúp được gì để liên hệ. Với người cao tuổi/người thân đang hoảng, đây là ma sát lớn.

**Đề xuất:** sổ liên hệ theo hồ sơ (tên, quan hệ, số, thứ tự ưu tiên, đồng ý chia sẻ), nút `tel:`/SMS deep link, log “đã gọi lúc...”, và trạng thái “đang liên hệ/đã liên hệ”. Không đưa số vào notification mặc định nếu chủ hồ sơ không đồng ý.

---

### P1-4 — Cảnh báo của hồ sơ khác không xuất hiện khi người dùng đang xem một hồ sơ; không có badge/tín hiệu toàn cục

**Mức:** P1 (an toàn, đa hồ sơ).

**Vị trí:**

- `apps/web/src/app/AppShell.tsx:100-113` — chỉ mở `useSubjectEvents(activeSubject?.id)` cho **một** hồ sơ đang chọn.
- `apps/web/src/features/realtime/useSubjectEvents.ts:57-90` — stream chỉ gắn với một `subjectId`.
- `apps/web/src/features/notifications/NotificationsPage.tsx:61-86` — hộp thư chỉ tải khi mở trang; không có SSE toàn cục, không có badge số chưa đọc trên nav.
- `docs/02-yeu-cau-va-pham-vi.md` mục vai trò: một tài khoản có thể vừa có hồ sơ riêng, vừa là người thân của hồ sơ khác; `docs/06` yêu cầu “Người có quyền nhận sự kiện”.

**Tái hiện:** owner có 3 hồ sơ; chọn hồ sơ demo, mở `/app/history`; gửi `sos.confirmed` cho hồ sơ `PQA Steps Subject` qua API. Sau 4 giây, nội dung trang History **không đổi**, không có `aria-live`, không có badge; mở `/app/notifications` sau đó mới thấy “Bạn có 2 thông báo chưa đọc” và SOS của hồ sơ kia. Output Playwright: `hasSOS text on page: false`, `aria-live nodes: 0`; ảnh `reports/qa/evidence/notifications-owner.png` chỉ hiện khi mở trang (không lưu ảnh trang History vì script dừng ở bước đọc nav).

**Expected:** người có quyền nhận cảnh báo của mọi hồ sơ được chia sẻ phải thấy tín hiệu toàn cục (badge, toast/banner, đổi title/favicon, có thể âm thanh tùy chọn) khi đang ở bất kỳ trang nào.

**Actual:** cảnh báo chỉ “sống” ở trang Tổng quan/Cảnh báo của hồ sơ đang chọn hoặc khi tự mở hộp thư. Nếu người thân đang xem lịch sử hồ sơ A, SOS của hồ sơ B bị bỏ qua. Đây là lỗi sản phẩm so với mô hình đa hồ sơ, không chỉ là thiếu push.

**Đề xuất:** stream/notification toàn tài khoản (hoặc mở stream cho tất cả subject được phép), badge chưa đọc trên nav, banner “Cảnh báo mới — hồ sơ X”, test alert. Không cần Web Push để sửa lỗi này khi tab đang mở.

---

### P1-5 — Admin không có màn hình thiết bị/ingest; người triển khai không thể onboard hoặc chẩn đoán thiết bị bằng UI

**Mức:** P1 (vận hành/triển khai).

**Vị trí:**

- `apps/web/src/features/admin/AdminPage.tsx:54-60` — chỉ có tab `Tổng quan | Người dùng | Chính sách thiết bị | Audit`.
- `apps/web/src/features/admin/AdminPage.tsx:785-810` — render đúng 4 tab, không có tab thiết bị.
- Backend có endpoint nhưng không được web gọi: `apps/api/src/devices/devices.controller.ts:28-66` (`GET/POST /admin/devices`, `POST /admin/devices/:id/claim-code`, `POST /admin/devices/:id/rotate-key`); `grep` trong `apps/web/src` không thấy `admin/devices`.
- Yêu cầu: `docs/02-yeu-cau-va-pham-vi.md:32` (FR-11 “xem tình trạng tài khoản/thiết bị và audit”); `docs/06-trai-nghiem-va-man-hinh.md:20` (Admin: “thiết bị online/offline, phiên bản, lỗi ingest/gửi; audit đã lọc”).

**Tái hiện:** đăng nhập admin, mở `/app/admin`; text và ảnh `reports/qa/evidence/admin-overview.png` chỉ có 4 tab và các số tổng hợp. Không có danh sách serial, firmware, last seen, trạng thái online, nút tạo claim code/rotate key.

**Expected:** admin thấy danh sách/tình trạng từng thiết bị (serial, label, hồ sơ đang gán, firmware, last seen/freshness, pin), tạo claim code, rotate key, xem lỗi ingest/outbox gần đây; không thấy dữ liệu sức khỏe.

**Actual:** chỉ thấy “Thiết bị trực tuyến/ngoại tuyến” dạng đếm; muốn onboard thiết bị phải gọi API bằng tay. Người triển khai không có đường UI; support không có dữ liệu để chẩn đoán.

**Đề xuất:** thêm tab “Thiết bị” trong Admin, chi tiết thiết bị + claim code/rotate key + lỗi ingest/gửi; giữ nguyên ranh giới không đọc sức khỏe.

---

### P1-6 — FR-14 mới có CSV telemetry; chưa có archive, deletion-request, consent, retention

**Mức:** P1 trước dữ liệu thật (không chặn demo synthetic).

**Vị trí:**

- `docs/02-yeu-cau-va-pham-vi.md:35` — FR-14 P0 thiết kế, triển khai trước dữ liệu thật; phạm vi xóa gồm bản sao, AI, cache và backup.
- `docs/14-ke-hoach-trien-khai-phan-mem.md:24` — “v1 chỉ ghi audit cho yêu cầu xóa và nêu giới hạn”.
- `apps/api/src/database/schema.ts:153` — có `subjects.archived_at` nhưng không có service/endpoint set giá trị này.
- `grep -rni "deletion\|archive" apps/api/src apps/web/src packages/contracts/src` — không có route/action xóa hay lưu trữ cho `subjects`/`users`; `archived_at` chỉ được đọc trong access/list, còn `archived` là trạng thái của `workspace_views` (Studio), không liên quan hồ sơ.
- UI `SubjectsPage` chỉ có tạo/sửa tên/chia sẻ; `HistoryPage` chỉ CSV telemetry; không có “xuất toàn bộ dữ liệu”, “lưu trữ hồ sơ”, “xóa hồ sơ/tài khoản”.

**Expected:** tối thiểu trước dữ liệu thật: endpoint tạo yêu cầu xóa/lưu trữ có audit và trạng thái; export toàn bộ dữ liệu liên quan (telemetry, incident, AI summary, care links); chính sách retention/backup và thông báo giới hạn.

**Actual:** không có đường nào để chủ hồ sơ yêu cầu xóa/archive, dù docs/14 tuyên bố có audit. Điều này cũng có nghĩa không thể trả lời yêu cầu của người dùng/người giám hộ.

**Đề xuất:** ưu tiên trước khi dùng dữ liệu thật: `POST /subjects/:id/deletion-requests`, `POST /subjects/:id/archive`, export toàn bộ dữ liệu; worker xóa theo phạm vi; audit; test T-12.

## 5. Findings P2

### P2-1 — Studio gắn nhãn “Dữ liệu thật” cho dữ liệu mô phỏng của cùng hồ sơ demo

**Vị trí:** `apps/api/src/studio/studio.service.ts:424` luôn trả `sample: false` khi render subject; `apps/web/src/features/studio/widgets.tsx:19-25` hiển thị “Dữ liệu thật” khi `sample=false`; dashboard cùng hồ sơ lại hiện “Nguồn: dữ liệu mô phỏng” (`DashboardPage.tsx:199-201`), đúng `docs/06:35`.

**Tái hiện:** tạo/publish một view scope subject cho hồ sơ demo, mở `/app/studio/<id>/data`. Text UI: “Dữ liệu thật · Bà Trần Thị An”; ảnh `reports/qa/evidence/studio-data-owner.png`. Cùng thời điểm dashboard demo ghi “Nguồn: dữ liệu mô phỏng”.

**Expected:** nếu telemetry `source=simulator/synthetic`, badge phải là “Dữ liệu mô phỏng” (hoặc “Dữ liệu mẫu”) ở mọi nơi, kể cả Studio; nếu là dữ liệu thật mới dùng “Dữ liệu thật”.

**Actual:** mâu thuẫn nhãn trong cùng sản phẩm, có thể khiến người xem demo tin đây là số đo thật.

**Đề xuất:** trả `sample`/`source` theo dữ liệu thật (không hard-code false), hoặc tách `dataMode: subject` khỏi `source: synthetic`; test UI.

### P2-2 — Tóm tắt AI bỏ qua độ phủ, khoảng thiếu và lần nhận cuối; có thể mô tả 7 ngày “bình thường” từ vài mẫu

**Vị trí:** `apps/api/src/assistant/assistant.service.ts:123-134` — `FactsAggregate` chỉ có samples/HR/pin/steps/alerts/tasks; không có coverage, gaps, lastSeenAt, source/synthetic. `:532-537` — sources chỉ là nhãn chung, không có ID/khoảng dữ liệu cụ thể. `:540-564` — facts không nêu độ phủ.

**Tái hiện:** đọc code + gọi summary với hồ sơ chỉ có 1 mẫu; output template nói “Có 1 mẫu đo” nhưng không nói “1/83 mẫu, 1 khoảng thiếu 6 giờ”. UI assistant chỉ hiện “7 ngày gần nhất” và số mẫu, không có coverage. (Chưa mở lại UI trong phiên này; đây là kết luận từ code + daily-summary đã kiểm.)

**Expected:** mọi summary phải nêu khoảng dữ liệu, độ phủ/gap, lần nhận cuối, nguồn synthetic; nếu thiếu dữ liệu phải nói rõ trước khi nêu trung bình.

**Actual:** người thân/bác sĩ có thể đọc “nhịp tim trung bình 72” mà không biết chỉ có 1 mẫu trong 7 ngày. Vi phạm tinh thần FR-10 (“dẫn khoảng dữ liệu; thiếu dữ liệu thì nói rõ”) và docs/06 mục AI.

**Đề xuất:** thêm coverage/gaps/lastSeen/source vào `FactsAggregate`, prompt và template; hiển thị “Dữ liệu thiếu” ngay cạnh số; test T-11.

### P2-3 — Trạng thái gửi thông báo lỗi/đang thử/đã hết lượt không hiển thị cho người dùng

**Vị trí:** `apps/api/src/notifications/notifications.service.ts:197` và `:207` chỉ lấy `status='sent'`; `failed/superseded` không vào inbox. `docs/06:55` yêu cầu “Hộp cảnh báo vẫn lưu; hiển thị chưa gửi/đang thử/đã hết lượt thử”. Admin chỉ có count `outbox.failed`, không có danh sách/chi tiết (`AdminPage.tsx:100-103`).

**Expected:** người nhận/chủ hồ sơ thấy thông báo “chưa gửi được”/“đã hết lượt thử” cho cảnh báo; admin xem được hàng đợi lỗi.

**Actual:** lỗi gửi gần như vô hình; người dùng chỉ thấy không có thông báo, dễ hiểu là không có cảnh báo.

**Đề xuất:** hiển thị trạng thái giao trong hộp thư/chi tiết cảnh báo; trang admin outbox có filter/lastError; test T-07/T-13.

### P2-4 — Công việc bảo trì chỉ đọc/đóng; không có đường tạo, không có job sinh từ offline/pin yếu

**Vị trí:** `apps/api/src/maintenance/maintenance.service.ts:23-30` ghi rõ “Wave này không sinh task định kỳ — chỉ đọc và đóng”; chỉ có GET/POST close (`maintenance.controller.ts:26-34`). Task trong demo chỉ đến từ seed (`apps/api/src/database/seed.ts:483-520`). UI empty state nói “Khi thiết bị cần bảo trì, công việc sẽ xuất hiện tại đây” (`TasksPage.tsx:190`) nhưng không có producer.

**Expected:** có tác vụ tạo task từ sự kiện (offline lâu, pin thấp, clock unsync, lỗi ingest) hoặc admin/owner tạo tay; có assignee/trạng thái.

**Actual:** “Công việc bảo trì” chỉ là màn hình đóng task seed; trong vận hành thật sẽ trống mãi.

**Đề xuất:** job sinh task có dedupe, priority, due date; API tạo/assign; UI “Tạo công việc”; test NFR-06/FR-08.

### P2-5 — Vòng đời lời mời thiếu thu hồi/gửi lại/từ chối; chỉ định danh bằng email và không gửi email tự động

**Vị trí:** `apps/api/src/care/care.controller.ts:16-55` có tạo/list/get/accept và thu hồi care-link, **không có** DELETE invitation/resend/decline. `SharePage.tsx` phần “Lời mời đã gửi” chỉ render trạng thái, không có nút. Lời mời có hạn tới 720 giờ; token chỉ hiện một lần (`SharePage.tsx:286-300`). `care.service.ts:131-159` chỉ trả `acceptUrl`, không tạo outbox email; chủ hồ sơ phải tự sao chép link gửi đi.

**Expected:** chủ hồ sơ thu hồi được lời mời chưa dùng, gửi lại link, và người được mời từ chối được; không buộc phải chờ hết hạn hoặc tạo lời mời mới.

**Actual:** mời sai email/hết token phải tạo lời mời mới; lời mời pending nằm tới 30 ngày. Không có email tự động, người mời phải copy link; với người cao tuổi không quen email/link, đây là ma sát lớn.

**Đề xuất:** endpoint revoke/resend/decline; UI actions; hỗ trợ chia sẻ link/Zalo/SMS có thời hạn (không chỉ email).

### P2-6 — Trạng thái thiết bị thiếu clock; copy “mỗi hồ sơ một thiết bị” sai so với backend

**Vị trí:** `apps/web/src/features/devices/DevicesPage.tsx:230` ghi “Mỗi hồ sơ có thể gắn một thiết bị đeo. Tháo gắn thiết bị cũ trước khi gắn thiết bị khác.”; backend `apps/api/src/devices/devices.service.ts:183-190` chỉ chặn một assignment mở **trên mỗi thiết bị**, không giới hạn số thiết bị/hồ sơ. Contract `packages/contracts/src/telemetry.ts:138` có `clockStatus` nhưng `DevicesPage` không render; contract không có RSSI/mạng, `lastHeartRateQuality` chỉ là chất lượng mẫu HR nên không đánh giá thêm.

**Expected:** copy khớp chính sách thật; hiển thị clock synced/unsynced, firmware, last seen, pin (pin đã có); nếu nhiều thiết bị/hồ sơ thì nói rõ.

**Actual:** người dùng có thể tưởng không gắn được thiết bị thứ hai, hoặc không biết dữ liệu bị loại vì clock unsynced.

**Đề xuất:** sửa copy/validate theo policy; thêm clock/firmware vào card và cảnh báo khi unsynced.

### P2-7 — Incident không giữ clock status; cảnh báo trễ chỉ có nhãn, không nói “chưa rõ tình trạng hiện tại”

**Vị trí:** `apps/api/src/incidents/incidents.service.ts:266` — nếu `measured_at=null` thì `detectedAt=receivedAt`; `packages/contracts/src/incidents.ts` không có `clockStatus`/`detectedAtSource`. `toSummary` chỉ tính `late` (`:939-940`); UI chỉ thêm chuỗi “cảnh báo nhận trễ” (`AlertDetailPage.tsx:189`). `docs/03:77` cấm lấy giờ nhận làm giờ đo thật; `docs/03:84` yêu cầu thông báo “sự kiện nhận trễ, chưa rõ tình trạng hiện tại”.

**Expected:** hiển thị “giờ đo không xác định” nếu unsynced; với late, nói rõ “chưa rõ tình trạng hiện tại” và gửi thông báo cập nhật.

**Actual:** cảnh báo trông như xảy ra đúng giờ nhận; người thân có thể hiểu sai mức độ khẩn cấp.

**Đề xuất:** thêm `clock_status`/`detected_at_source` vào incident; UI banner; outbox “late/unconfirmed” theo docs/03.

### P2-8 — Thiếu cài đặt tài khoản tối thiểu: quên/đổi mật khẩu, xác minh email, xem ai đã truy cập dữ liệu

**Vị trí:** `apps/api/src/auth/auth.controller.ts` chỉ có register/login/logout/me; không có reset/change password, verify email, session list. Không có màn hình account/settings. Audit chỉ ghi một số hành động; đọc measurements thường không audit (`measurements.service.ts` chỉ audit export), nên chủ hồ sơ không thấy ai đã xem dữ liệu.

**Expected:** người dùng có thể khôi phục tài khoản, đổi mật khẩu, đăng xuất mọi phiên, xem lịch sử chia sẻ/truy cập.

**Actual:** quên mật khẩu là mất tài khoản; không có cách tự bảo vệ. Trước dữ liệu thật đây là P1 vận hành; trong demo xếp P2.

**Đề xuất:** reset qua email/token một lần, đổi mật khẩu, session management, access log cho chủ hồ sơ; test auth.

## 6. Góc nhìn người dùng và hành trình còn thiếu

### Người thân

- **Đã có:** xem dashboard, lịch sử, cảnh báo; ack/resolve; nhận thông báo trong app; quyền theo hồ sơ; thu hồi quyền.
- **Thiếu:** biết **ai** đang hỗ trợ và **gọi ai**; cảnh báo của hồ sơ khác khi đang xem một hồ sơ; nhắc lại khi ack nhưng chưa resolve; phân công ca trực/người phụ trách; thử cảnh báo; trạng thái gửi thất bại; báo cáo tuần cho gia đình/bác sĩ.
- **Hành trình thiếu:** “nhận cảnh báo → xác nhận → gọi/đến → ghi nhận đã hỗ trợ → đóng có kết quả”. Hiện chỉ có “xác nhận/đóng”, bỏ qua bước liên hệ và phối hợp.

### Người cao tuổi

- **Đã có:** hồ sơ tách khỏi tài khoản; giao diện chữ lớn; cảnh báo không chỉ dùng màu.
- **Thiếu:** chế độ người được theo dõi (không cần tài khoản) để tự xem “hôm nay của tôi”; nút SOS/hủy trên thiết bị chưa kiểm chứng; hướng dẫn setup bằng hình ảnh/âm thanh; xác nhận đã sạc/đeo; cách liên hệ người thân một chạm.
- **Rủi ro:** mọi cấu hình nằm ở người thân; nếu người cao tuổi không dùng email/điện thoại thông minh, sản phẩm vẫn phụ thuộc người khác. Đây là giả định cần chốt, không tự nhận đã phù hợp NFR-04.

### Điều dưỡng/bác sĩ (không chẩn đoán)

- **Đã có:** không có vai trò bác sĩ; AI từ chối chẩn đoán/kê đơn; summary có disclaimer.
- **Thiếu:** vai trò đọc-only có thời hạn; báo cáo có cấu trúc (khoảng ngày, độ phủ, gap, cảnh báo, nguồn) để dùng khi thăm khám; export incident/AI; không có raw CSV dễ dùng.
- **Không được làm:** không suy từ dữ liệu thiếu thành “bình thường”, không chẩn đoán; báo cáo phải ghi rõ dữ liệu thiếu và không thay khám lâm sàng.

### Admin/người triển khai

- **Đã có:** user list/disable, policy CAS, audit, tổng quan.
- **Thiếu:** danh sách/tình trạng thiết bị, claim code/rotate key, lỗi ingest/outbox, backup/restore, retention, tạo user/reset mật khẩu, chẩn đoán SSE/PGlite.
- **Hệ quả:** muốn onboard hoặc thay thiết bị phải gọi API; không có quy trình vận hành trên UI.

### Niềm tin dữ liệu

- Không nên hiển thị 0/complete khi thiếu baseline (P1-2).
- Không nên gắn “Dữ liệu thật” cho simulator (P2-1).
- Không nên ẩn ứng viên chưa xác định (P1-1).
- Không nên để summary AI bỏ qua coverage/gap (P2-2).

## 7. Đề xuất v2 có lý do

### Trước khi dùng dữ liệu thật (ưu tiên 1)

1. **Hoàn thiện vòng đời ứng viên ngã:** job `suspected → unconfirmed` theo timeout cấu hình; UI “Chưa xác định”; banner; sửa daily-summary; test T-05/T-09. Lý do: P1-1.
2. **Sửa ngữ nghĩa bước/coverage:** completeness theo boot + coverage; không hiển thị 0/complete khi thiếu baseline; test T-04. Lý do: P1-2.
3. **Sổ liên hệ + liên hệ thủ công:** phone/relationship/priority, `tel:`/SMS, log liên hệ; test FR-09. Lý do: P1-3.
4. **Trung tâm cảnh báo toàn tài khoản:** badge/toast/title cho mọi hồ sơ, test alert, phân công/leo thang; test T-05/T-13. Lý do: P1-4.
5. **Admin thiết bị/ingest:** danh sách, claim code, rotate, lỗi; test FR-11. Lý do: P1-5.
6. **FR-14 tối thiểu:** archive/deletion-request/export toàn bộ/consent/retention/audit; test T-12. Lý do: P1-6.

### Feature v2 (sau khi ổn định an toàn)

1. **Báo cáo tuần/tháng có cấu trúc (PDF/print)** cho gia đình/bác sĩ: khoảng ngày, coverage/gap, cảnh báo, nguồn, dữ liệu thiếu; không chẩn đoán. Lý do: hiện chỉ có CSV thô; docs/06 mục AI/Chi tiết hồ sơ.
2. **Chia sẻ read-only cho bác sĩ/điều dưỡng có thời hạn** (không phải admin, không xem chat AI), kèm watermark/audit; lý do: người thân cần đưa dữ liệu khi đi khám mà không đưa tài khoản.
3. **Cảnh báo pin yếu/offline/clock unsync + task bảo trì tự sinh** có dedupe/assignee; lý do: FR-08/FR-11, hiện task chỉ seed.
4. **Tùy chọn thông báo theo người nhận:** ca trực, quiet hours, primary/secondary, kênh (in-app/email/SMS/Zalo nếu được duyệt); trạng thái gửi; lý do: docs/06 “kênh thông báo lỗi”, thực tế chỉ in-app.
5. **Chế độ người được theo dõi:** màn hình đơn giản “hôm nay”, nút gọi người thân, xác nhận đeo/sạc; lý do: người cao tuổi không nên phụ thuộc hoàn toàn vào người thân.
6. **Test alert/dry-run và onboarding checklist:** tạo tài khoản → hồ sơ → claim → nhận dữ liệu thử → mời → thử cảnh báo; lý do: docs/06 luồng thiết lập, hiện người dùng phải tự đoán bước.
7. **Nhật ký truy cập/xuất dữ liệu cho chủ hồ sơ** và đổi mật khẩu/khôi phục tài khoản; lý do: niềm tin/quyền riêng tư.

## 8. Bằng chứng và cách tái hiện

### 8.1 Ảnh

Tất cả nằm trong `reports/qa/evidence/`:

- `dashboard-owner.png`: dashboard demo có “Cảnh báo hôm nay: 2 (đã đóng 0)” nhưng chỉ 1 cảnh báo mở; P1-1.
- `dashboard-steps-partial.png`: “0 bước / đủ dữ liệu”, “Độ phủ 1.2%”, “1 mẫu đã nhận”, 1 gap; P1-2.
- `alert-detail-owner.png`: chỉ có “Tôi đang hỗ trợ”/“Đóng cảnh báo”; không có liên hệ; P1-3.
- `notifications-owner.png`: thông báo chỉ thấy khi mở trang; P1-4.
- `admin-overview.png`: chỉ 4 tab, không có thiết bị; P1-5.
- `studio-data-owner.png`: “Dữ liệu thật” cho dữ liệu demo; P2-1.
- `alerts-owner.png`: chỉ cảnh báo seed, không có suspected; P1-1.

### 8.2 Lệnh tái hiện P1-1/P1-2

```bash
# DB riêng, không dùng .data/pglite của lead
PGLITE_DATA_DIR=.data/review-product PORT=3212 pnpm --filter @annhien/api seed
PGLITE_DATA_DIR=.data/review-product PORT=3212 node apps/api/dist/src/main.js

# login owner; gửi candidate; xem alerts/detail/summary (xem mục P1-1)
# tạo subject/device/claim; gửi 1 telemetry; gọi daily-summary (xem mục P1-2)
```

### 8.3 Giới hạn bằng chứng

- Các kết luận P1-1/P1-2/P1-3/P1-4/P1-5/P2-1 được kiểm trên API/web riêng và ảnh.
- P1-6/P2-2/P2-3/P2-4/P2-5/P2-6/P2-7/P2-8 dựa trên đọc code/contracts/docs; **chưa chạy hết UI/API tương ứng** — ghi rõ để không báo “đạt”.
- Không có kết luận y khoa; không đánh giá thuật toán ngã, firmware hay độ chính xác. Không dùng báo cáo này làm nghiệm thu sản phẩm.

## 9. Tóm tắt 5 dòng

1. Reviewer độc lập đã đọc yêu cầu, chạy lại typecheck/test/build và kiểm UI/API trên DB cổng 3212; không sửa code/docs và không đóng finding cũ.
2. Sản phẩm có lát cắt kỹ thuật tốt nhưng thiếu hoàn chỉnh: ứng viên té ngã chưa xác định bị ẩn, bước chân báo “0 · đủ dữ liệu” khi chỉ có 1 mẫu/1,2% coverage, và không có liên hệ thủ công.
3. Cảnh báo đa hồ sơ không hiện khi người thân đang xem hồ sơ khác; admin không có màn hình thiết bị/claim code; FR-14 archive/delete/consent chưa có đường thực hiện.
4. Các P2 đáng chú ý: Studio gắn “Dữ liệu thật” cho dữ liệu mô phỏng, AI summary bỏ qua coverage/gap, trạng thái gửi lỗi vô hình, task bảo trì chỉ seed, lời mời thiếu thu hồi/gửi lại.
5. Đề xuất trước dữ liệu thật: sửa vòng đời suspected/unconfirmed, ngữ nghĩa steps/coverage, sổ liên hệ, cảnh báo toàn tài khoản, admin thiết bị và FR-14; sau đó mới làm báo cáo PDF, chia sẻ read-only cho bác sĩ, task tự động và tùy chọn thông báo.
