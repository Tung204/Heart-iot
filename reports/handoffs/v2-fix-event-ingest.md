# Handoff — v2-fix-event-ingest (P1-1 review bảo mật)

- **Ngày:** 2026-11-15 (Asia/Ho_Chi_Minh)
- **Worker:** fix-event-ingest (dispatched), worktree `C:/Users/nguye/orca/workspaces/DATN/fix-event-ingest`
- **Nhánh:** `fix-event-ingest` (không merge, không push)
- **Base:** `cddacc4 docs(orchestration): spec sự kiện và Studio theo mốc chia sẻ`
- **Commit sửa:** `3f5b2000c61fa8869ace7427267e438631166f09` (test T24 bổ sung ở commit kế tiếp trên cùng nhánh)
- **Nguồn finding:** `reports/qa/v2-rev-security.md` mục P1-1 (đọc từ worktree `rev-v2-security` vì báo cáo chưa có trong nhánh này): `POST /ingest/events` gán sự kiện cũ cho chủ hiện tại và nhận timestamp tương lai.
- **Hợp đồng tham chiếu:** `docs/03` mục “Mạng, đồng hồ và dữ liệu cũ” (gán bằng lịch sử assignment tại thời điểm xảy ra; không chắc thời gian thì cách ly), `docs/04` mục mô hình dữ liệu/telemetry (“không tự gán vào chủ hiện tại”), `docs/08` T-03.

## Quyết định thiết kế

1. **Tra toàn bộ lịch sử `device_assignments` theo `measured_at`**, không chỉ assignment đang mở. Sự kiện trong assignment đã kết thúc vẫn thuộc chủ cũ; chủ mới không thấy incident/outbox/SSE.
2. **Khoảng assignment là nửa mở `[started_at, ended_at)` và kiểm tra chính xác**, không nới dung sai ở biên chuyển chủ. Mốc đo sát biên chưa đủ chắc chắn nên cách ly an toàn hơn gán sang chủ khác.
3. **Chỉ áp `MAX_CLOCK_SKEW_SECONDS` cho hướng tương lai** (mặc định 120 giây). `measured_at` vượt hiện tại quá ngưỡng bị cách ly.
4. **`measured_at` null bị cách ly**, không fallback sang assignment đang mở/chủ hiện tại. Khác telemetry có chủ đích: incident là cảnh báo sức khỏe, gán sai chủ nguy hiểm hơn việc yêu cầu thiết bị gửi lại sau khi đồng bộ giờ.
5. **Dedupe chạy trước khi xét assignment**: bản tin đã accepted trả `duplicate` đúng incident cũ kể cả khi thiết bị vừa chuyển chủ; không đổi `subject_id`/`assignment_id` của incident.
6. **Chặn ghi chéo chủ vào incident cũ:** nếu incident đã tồn tại nhưng assignment theo `measured_at` thuộc hồ sơ khác, trả `rejected` + audit `incident.quarantined` lý do `assignment_mismatch` thay vì thêm sự kiện vào incident của chủ trước.
7. **Quarantine không tạo dữ liệu rác:** không insert `incidents`/`incident_events`, không outbox, không realtime/SSE. Chỉ ghi audit `incident.quarantined` với `reason`, id bản tin, mốc thời gian và độ lệch; metadata không chứa `evidence`, nhịp tim, điện thoại hay payload sức khỏe.

## Đã sửa

### `apps/api/src/incidents/event-assignment.ts` (mới)

- `resolveAssignmentForEventTime()`: trả `assigned` hoặc `quarantined` với lý do:
  - `missing_measured_at`
  - `clock_skew_future`
  - `before_first_assignment`
  - `outside_assignment`
- Type `EventQuarantineReason` còn có `assignment_mismatch` cho nhánh incident đã lưu thuộc hồ sơ khác.

### `apps/api/src/incidents/incidents.service.ts`

- Bỏ truy vấn chỉ assignment `ended_at IS NULL`.
- Transaction ingest: dedupe trước → đọc lịch sử assignment theo `started_at` → resolve theo `measured_at` → quarantine nếu không xác định được → tạo/khóa incident bằng `assignment.subjectId` + `assignment.id`.
- `detectedAt` lấy từ `measured_at`; không còn fallback `receivedAt` cho sự kiện thiếu giờ (nhánh null đã bị từ chối).
- `DEVICE_NOT_CLAIMED` giữ nguyên khi thiết bị **chưa từng** có assignment; audit chuyển vào cùng transaction.
- Thêm `quarantineEvent()` trả HTTP 202 `status:'rejected'`, `code:'QUARANTINED'`, `incidentId:null`, `acceptedRevision:null`, message tiếng Việt; audit `incident.quarantined`, `outcome='failed'`.
- Giữ nguyên state machine, revision/dedupe, outbox, SSE cho các sự kiện được chấp nhận.

### `apps/api/test/incidents.spec.ts`

Helper `createReassignedFixture()`: thiết bị thuộc A đến 4 ngày trước, B mở từ 2 ngày trước, có khoảng trống ở giữa.

5 test mới (T19–T23) và 1 test chặn ghi chéo chủ (T24), tổng incidents spec **25 test**:

| Test | Nội dung |
| --- | --- |
| T19 | Bản tin accepted khi A còn giữ thiết bị; sau khi chuyển B, gửi lại vẫn `duplicate` cùng incident A. Sự kiện mới đo trong A nhưng nhận sau khi B giữ thiết bị → incident thuộc A; B không thấy; outbox không tới B. |
| T20 | Trước assignment đầu tiên và `measured_at:null` + `unsynced` → 202 `rejected`/`QUARANTINED`; không incident/outbox/SSE; audit có reason; metadata không chứa HR 188/phone `0901234567`/`evidence`. |
| T21 | `measured_at` +1 năm → `rejected`/`QUARANTINED`; audit reason `clock_skew_future`, `clockSkewSeconds > 120`. |
| T22 | `measured_at` trong khoảng trống giữa A và B → `rejected`/`QUARANTINED`; audit reason `outside_assignment`. |
| T23 | Sự kiện bình thường trong assignment B đang mở → `accepted`, incident thuộc B/`assignment_id` B; B thấy, A không thấy; outbox có chủ B. |
| T24 | Incident tạo ở A, thiết bị chuyển B rồi gửi revision mới đo trong B → `rejected`/`QUARANTINED` lý do `assignment_mismatch`; incident A giữ nguyên chủ/trạng thái/version, không nhận event mới. |

## Kiểm chứng đã chạy

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --prefer-offline --frozen-lockfile` | 711 package, pass |
| `pnpm build:contracts` | pass |
| `pnpm --filter @annhien/api typecheck` | pass |
| `jest --runInBand test/incidents.spec.ts` | **25/25 test pass**, 1 suite |
| `jest --runInBand test/notifications.spec.ts test/sse.spec.ts` | **19/19 test pass**, 2 suite (đường ingest sự kiện dùng chung) |
| `jest --runInBand` (toàn bộ API) | **20/20 suite, 198/198 test pass** |

## File thay đổi

- `apps/api/src/incidents/event-assignment.ts` (mới)
- `apps/api/src/incidents/incidents.service.ts`
- `apps/api/test/incidents.spec.ts`
- `reports/handoffs/v2-fix-event-ingest.md` (file này)

Không sửa schema/migration/measurements/studio/realtime/web/contracts/docs.

## Rủi ro và việc còn lại

1. **Sát biên chuyển chủ bị cách ly:** sự kiện đo trước `started_at`/sau `ended_at` dù chỉ vài chục giây (do lệch đồng hồ) sẽ bị từ chối thay vì gán sang chủ bên cạnh. Đây là lựa chọn an toàn có chủ đích; nếu vận hành thấy thiết bị lệch giờ nhiều, cần chính sách dung sai riêng có kiểm chứng.
2. **Telemetry vẫn khác semantics:** telemetry `unsynced`/`measured_at:null` vẫn gán vào assignment đang mở (lưu mẫu thiếu giờ), còn incident null bị cách ly. Khác biệt có chủ đích và đã ghi trong helper; nếu muốn đồng nhất phải sửa telemetry/read path ngoài phạm vi này.
3. **Incident đã tạo trước bản fix không được migrate:** dữ liệu cũ gán sai chủ (nếu có) vẫn còn trong DB; task này chỉ chặn đường ingest mới, không sửa lịch sử.
4. **Không sửa `docs/04` để liệt kê code `QUARANTINED` cho `/ingest/events`:** tài liệu hiện đã nêu nguyên tắc “không chắc thời gian thì cách ly”, nhưng bảng ACK chưa có ví dụ sự kiện quarantine; nếu lead muốn, bổ sung ở task tài liệu riêng.
5. **Chưa merge/push/deploy.** Cần lead review diff `3f5b200` cùng worker Studio P1-2 trước khi hợp nhất.

## Trạng thái

- Commit trên nhánh riêng `fix-event-ingest`, chưa merge, chưa push.
- Sẵn sàng review; finding P1-1 phần `/ingest/events` đã có test hồi quy.
