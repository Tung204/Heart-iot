# Handoff — v2 fix cửa sổ chia sẻ cho lịch sử, cảnh báo, trợ lý

- **Thời điểm:** 2026-11-15 00:32 (Asia/Ho_Chi_Minh)
- **Worker:** fix-caregiver-window (worktree riêng `fix-caregiver-window`, base `7c51293`)
- **Nhánh:** `fix-caregiver-window`
- **Vùng ghi:** `apps/api/src/incidents/incidents.service.ts`,
  `apps/api/src/assistant/assistant.service.ts`, `packages/contracts/src/incidents.ts`,
  `apps/api/test/incidents.spec.ts`, `apps/api/test/assistant.spec.ts`,
  `apps/web/src/features/history/HistoryPage.tsx`, `apps/web/src/lib/format.ts`,
  `apps/web/src/features/history/HistoryPage.test.tsx`,
  `apps/web/src/features/alerts/AlertsPage.tsx`, `apps/web/src/features/alerts/AlertDetailPage.tsx`,
  file này.
  **Không** sửa measurements/devices/notifications/app.module/router/layout.css.
- **Nguồn yêu cầu:** `reports/qa/v2-caregiver-journey.md` P1-1, P2-2, P2-3;
  `reports/qa/v2-owner-journey.md` P1-1/P1-2 (phần incidents/history/assistant);
  `docs/02` FR-02/FR-05; `docs/04` (`care_links.shared_from`, "kiểm lại trước khi gửi dữ liệu");
  `docs/06` ("Người thân không mặc định truy cập toàn bộ dữ liệu trước ngày chia sẻ").

## Đã làm

### API — incidents (`incidents.service.ts`)

- `listAlerts` dùng `AccessService.requireHistory(userId, subjectId, undefined)` thay
  `requireSubject`; mốc hiệu lực = `max(now - historyDays, sharedFrom)` (owner bỏ qua giới hạn).
- Caregiver + `state=closed`: thêm `gte(incidents.detectedAt, effectiveFrom)` vào truy vấn
  → **ẩn** incident `resolved`/`cancelled`/`unconfirmed` phát hiện trước mốc chia sẻ,
  kể cả `resolutionReason`.
- Caregiver + `state=open`: **giữ** incident `open`/`acknowledged` phát hiện trước mốc
  (quyết định: đây là trạng thái an toàn hiện tại, ẩn đi có thể bỏ sót người đang gặp nguy),
  nhưng gắn `startedBeforeShare: true` để UI nói rõ.
- `getAlert`/`loadVisibleIncident`: caregiver + incident đã đóng (`resolved`/`cancelled`/
  `unconfirmed`) trước mốc → **403** `FORBIDDEN` kèm `details.effectiveFrom`; incident đang mở
  trước mốc → **200** + `startedBeforeShare`; owner luôn 200 và không có cờ.
  `acknowledge`/`resolve` dùng cùng kiểm tra nên không thao tác được trên incident đã đóng
  trước mốc, nhưng vẫn hỗ trợ incident đang mở trước mốc nếu đủ quyền.
- `buildSummaries`/`toSummary`/`buildDetail` nhận `effectiveFrom`/`startedBeforeShare`;
  field chỉ xuất hiện khi `true` (JSON gọn, owner không bị đổi payload).

### Contract (`packages/contracts/src/incidents.ts`)

- Thêm field optional `startedBeforeShare?: boolean` vào `incidentSummarySchema` (và do
  `extend` nên có ở `incidentDetailSchema`). Không đổi field bắt buộc nào.

### API — assistant (`assistant.service.ts`)

- `ask`: bỏ `requireHistory(..., now-7d)`; dùng `requireHistory(..., undefined)` và
  `from = max(now - 7 ngày, effectiveFrom)` → link vừa accept **không còn 403 lịch sử**;
  thiếu `view_ai` vẫn 403 đúng message quyền.
- Nếu cửa sổ không có mẫu đo, cảnh báo hay công việc mở: trả `NO_DATA_ANSWER` (template,
  `degraded`, `degradedReason` nêu "Chưa có dữ liệu") và **không gọi model** để tránh bịa.
  Audit ghi code `no_data_in_window`.
- `getSummary`: **không đổi** hành vi (đã đúng: `periodStart = max(now-7d, effectiveFrom)`).

### Web — lịch sử (`HistoryPage.tsx`, `lib/format.ts`)

- `clampRangeToHistoryDays` nhận thêm `sharedFromMs` optional; `from = max(now - range,
  now - historyDays, sharedFrom)`.
- `HistoryPage` đọc `SubjectSummary.sharedFrom` khi `role === 'caregiver'`; `from`/`to` và
  URL CSV dùng cùng khoảng đã kẹp → không gửi `from` sớm hơn mốc chia sẻ.
- Nút range có cửa sổ đầy đủ bắt đầu trước `sharedFrom` bị **disable** kèm `title`
  "Chỉ xem được dữ liệu từ …"; thêm hint "Dữ liệu chỉ bắt đầu từ …" khi khoảng bị cắt.
- Owner (`sharedFrom = null`) giữ nguyên hành vi cũ.

### Web — cảnh báo

- `AlertsPage`: dòng có `startedBeforeShare` hiện "Bắt đầu trước khi bạn được chia sẻ quyền —
  vẫn đang mở".
- `AlertDetailPage`: hiện `Alert` info giải thích cảnh báo vẫn mở là trạng thái an toàn hiện tại,
  lịch sử trước mốc chia sẻ không được cung cấp.

## Quyết định cần lead biết

1. **Open/acknowledged trước mốc chia sẻ vẫn hiển thị** (kèm cờ + nhãn UI) vì là an toàn hiện tại.
   Nếu chính sách muốn ẩn tuyệt đối, chỉ cần bỏ nhánh open trong `listAlerts` và trả 403 ở
   `loadVisibleIncident`; test T13 sẽ cần đổi kỳ vọng.
   *Hệ quả cần biết:* incident mở trước mốc nhưng bị đóng **sau** mốc vẫn ẩn khỏi tab Đã đóng và
   detail trả 403, vì cửa sổ lịch sử tính theo `detectedAt` (đúng yêu cầu "detectedAt < effectiveFrom").
   Nếu muốn caregiver xem được kết quả của incident họ đã phối hợp, cần đổi tiêu chí riêng cho
   trường hợp mở-trong-cửa-sổ sang `resolvedAt`/`cancelledAt`.
2. **Đóng trước mốc = 403, không 404**, để UI phân biệt "ngoài cửa sổ lịch sử" với "không tồn tại"
   và có `details.effectiveFrom` (đúng pattern `requireHistory` của measurements).
3. **Không đủ dữ liệu ở `ask`**: trả template "Chưa có dữ liệu…" thay vì gọi AI. Với owner có dữ
   liệu, hành vi AI giữ nguyên; với app chưa cấu hình AI và không có dữ liệu, câu trả lời đổi từ
   "AI chưa sẵn sàng" sang "Chưa có dữ liệu" (trung thực hơn).
4. `isHistoryClosedState` coi `unconfirmed` là đã đóng với người xem lịch sử (cùng tập state của
   tab "Đã đóng").

## Kiểm đã chạy (kết quả thật)

| Lệnh (thư mục) | Kết quả |
| --- | --- |
| `pnpm install --prefer-offline --frozen-lockfile` (root) | exit 0 |
| `pnpm build:contracts` (root) | exit 0 |
| `pnpm --filter @annhien/api typecheck` | exit 0 |
| `pnpm --filter @annhien/web typecheck` | exit 0 |
| `pnpm test -- incidents.spec.ts assistant.spec.ts` (`apps/api`) | **2 suite, 27/27 pass** (~17,6 s) |
| `pnpm test` (`apps/api`, toàn bộ) | **17 suite, 130/130 pass** (~99 s) |
| `pnpm test` (`apps/web`, toàn bộ) | **22 file, 99/99 pass** (~10,8 s) |
| `npx vitest run src/features/history/HistoryPage.test.tsx` (`apps/web`) | **4/4 pass** (2 test mới) |

Test mới:

- Incidents **T13**: caregiver `historyDays=1`, `sharedFrom` cách 1 giờ; incident open/acknowledged
  trước mốc vẫn thấy + `startedBeforeShare=true`; resolved/cancelled/unconfirmed trước mốc bị ẩn;
  detail closed trước mốc 403 + `details.effectiveFrom`, open trước mốc 200 + cờ; owner thấy đủ
  và không có cờ.
- Assistant: caregiver vừa accept (`sharedFrom` 5 phút trước) `ask` → 200, template "Chưa có dữ
  liệu", không gọi AI; caregiver `canViewAi=false` → 403 message quyền AI (không phải lỗi lịch sử).
- Web History: `sharedFrom` trong 24 giờ → `from` và CSV bắt đầu tại `sharedFrom` (không sớm hơn,
  sai lệch < 5 s); `sharedFrom` 3 ngày trước → nút 7 ngày/30 ngày disable kèm `title`, nút 24 giờ
  vẫn dùng được.

## Chưa làm / phần lead cần nối

- **Ngoài vùng được phép sửa, vẫn còn rò ranh giới thời gian:**
  - `apps/api/src/measurements/measurements.service.ts` (`dailySummary`): `incidentRows` vẫn đếm
    theo đầu ngày thay vì `windowFrom` → tổng hợp ngày còn đếm cảnh báo trước `sharedFrom`
    (P1-1/P1-2 owner-journey).
  - `apps/api/src/devices/devices.service.ts` (`getSubjectStatus`/`loadLastTelemetry`): vẫn trả
    `lastHeartRateBpm`/`lastMeasuredAt` trước `sharedFrom`; card "Thiết bị" trên dashboard mâu thuẫn
    với tổng hợp ngày.
  - `apps/api/src/realtime/realtime.service.ts`: replay `alert.updated` vẫn có thể phát incident
    trước `sharedFrom` (metadata ID/state, không có `resolutionReason`); `care.*`/`notification.sent`
    vẫn subject-wide (P2-5 caregiver-journey).
- **UI assistant**: chưa map `403` cũ thành hướng dẫn "dữ liệu chỉ có từ …"; sau fix API, trường hợp
  link mới không còn 403 nên không chặn demo. Nếu lead muốn, xử lý ở `AssistantPage.tsx`.
- Không chạy lại kịch bản Playwright/HTTP trên app thật; bằng chứng là test PGlite in-memory +
  Vitest. Không đụng API :3000/web :5173 hay DB demo.
- `pnpm test:e2e` không chạy (không nằm trong yêu cầu; tránh chiếm cổng của lead).
