# Handoff — fe-features (wave 2)

- Thời điểm: 2026-11-14 22:55 (Asia/Ho_Chi_Minh)
- Worker: fe-features (wave 2)
- Vùng ghi đã dùng: `apps/web/src/**`, `apps/web/e2e/**`, `apps/web/README.md`,
  `reports/handoffs/wave2-fe-features.md` (đúng giới hạn; không sửa package.json/tsconfig/vite/playwright
  config, không sửa API/contracts/docs/.env, không chạy git, không `pnpm add`).
- Prompt: `reports/orchestration/prompts/wave2-fe-features.md`.

## Tóm tắt

Hoàn thành toàn bộ màn hình nghiệp vụ theo thứ tự ưu tiên: **cảnh báo + SSE → tổng quan/lịch sử
→ hồ sơ/thiết bị/chia sẻ/thông báo**. Toàn bộ schema tạm wave 1 đã được thay bằng hợp đồng
chính thức `@annhien/contracts/{subjects,care,incidents,measurements,devices,notifications}`
(đọc thẳng schema zod thật, không đoán tên trường).

## File đã tạo/sửa (apps/web)

### lib (nền dùng chung)

- `lib/query.ts` — thêm query keys theo miền; **401 tập trung** ở QueryCache + MutationCache:
  bất kỳ query/mutation nghiệp vụ nào bị 401 → `/login?next=...` qua `redirectToLogin`.
  **Ngoại lệ**: query `['auth','me']` (kiểm phiên của trang công khai — header, trang lời mời)
  KHÔNG chuyển hướng vì 401 ở đó là tín hiệu "chưa đăng nhập" bình thường (đã phát hiện bằng
  E2E: landing bị đẩy sang /login nếu không có ngoại lệ này).
- `lib/session.ts` (mới) — `redirectToLogin`/`navigateSafely`, chỉ nhận đường dẫn nội bộ,
  no-op trong môi trường test.
- `lib/api.ts` — export `API_BASE` (dùng cho EventSource + URL export CSV), thêm
  `isConflictError` (409/CONFLICT).
- `lib/format.ts` — thêm `formatDate`, `formatTime`, `formatRelativeTime` (null khi không có
  mốc), `todayInTimeZone` (Intl theo timezone hồ sơ), `clampRangeToHistoryDays`.
- `lib/validation.ts` — thêm `zodFieldErrorMap` generic (lỗi zod → theo trường + override
  thông điệp tiếng Việt), dùng cho form hồ sơ/claim/resolve.

### subjects (hợp đồng thật + selection dùng chung)

- `features/subjects/api.ts` — **xóa schema tạm wave 1**, thay bằng `subjectListSchema`/
  `subjectDetailSchema`/`createSubjectSchema`/`updateSubjectSchema` từ `@annhien/contracts/subjects`.
- `features/subjects/selection.ts` (mới) — store lựa chọn hồ sơ đang xem (localStorage +
  `useSyncExternalStore`), dùng chung giữa SubjectSwitcher và mọi trang nghiệp vụ.
- `features/subjects/SubjectSwitcher.tsx` — dùng store; rỗng → EmptyState + CTA tạo hồ sơ
  thật (link `/app/subjects`), thêm link "Quản lý hồ sơ và chia sẻ".
- `features/subjects/SubjectForm.tsx` (mới) + `SubjectsPage.tsx` (mới) — tạo hồ sơ (tên +
  timezone mặc định Asia/Ho_Chi_Minh), sửa tên, vai trò/quyền hiển thị rõ; validate bằng
  đúng schema hợp đồng.

### alerts (ưu tiên 1)

- `features/alerts/api.ts` — list (state/cursor/limit), detail, acknowledge, resolve với
  `incidentDetailSchema`/`incidentListSchema`; `labels.ts` — nhãn tiếng Việt cho state/type/
  event type/action (màu/icon chỉ hỗ trợ, chữ là tín hiệu chính).
- `features/alerts/AlertsPage.tsx` — `/app/alerts`: lọc Đang mở/Đã đóng, phân trang cursor
  (`useInfiniteQuery`, nút "Tải thêm"), xác nhận nhanh trên dòng (dùng `version` của list làm
  `expectedVersion`), 409 → banner "Danh sách có thể chưa cập nhật" + tải lại; mức cao nổi bật
  bằng icon + chữ "cần chú ý" (không chỉ màu).
- `features/alerts/AlertDetailPage.tsx` — `/app/alerts/:id`: timeline sự kiện thiết bị, lịch
  sử hành động (kể cả conflict/forbidden), người nhận (tên + quyền, không email), ack/resolve;
  resolve bắt buộc reason (min 3, theo `resolveAlertSchema`) + outcome; 409 → ConflictNotice +
  nút "Tải lại cảnh báo"; nút ẩn khi thiếu quyền theo permissions của ĐÚNG hồ sơ cảnh báo
  (không theo lựa chọn đang xem); ghi chú không tự gọi cấp cứu.

### realtime (SSE)

- `features/realtime/sse.ts` (mới, logic thuần) — `parseSseBlock` (id/event/data, bỏ comment,
  JSON sai → null), `handleRealtimeEvent` (alert.updated hợp lệ → refetch alerts/status/devices;
  notification.sent → refetch notifications; revoked → đóng + xóa cache; payload lệch hợp đồng
  → bỏ qua), `nextBackoffMs` (1s→2s→4s… chặn 30s).
- `features/realtime/useSubjectEvents.ts` (mới) — hook mở stream theo hồ sơ đang xem:
  `withCredentials`, mất kết nối → mở lại có backoff, gửi `cursor=<lastEventId>` (server bù
  sự kiện đã lỡ); `revoked` → đóng stream + `removeQueries` hồ sơ/cảnh báo + gọi `onRevoked`;
  tab ẩn → đóng stream, hiện lại → mở lại; môi trường không EventSource (jsdom) → idle.
- `app/AppShell.tsx` — gắn SSE theo hồ sơ đang xem; `onRevoked` → banner "mất quyền" +
  invalidate subjects + bỏ lựa chọn + điều hướng an toàn về `/app`.

### dashboard + history

- `features/dashboard/DashboardPage.tsx` (thay `app/AppHomePage.tsx`, đã xóa file cũ) — thẻ
  trạng thái thiết bị (live/stale/offline/never + lần nhận cuối + pin "chưa có thông tin" khi
  null), cảnh báo đang mở, lần đo gần nhất, tổng hợp hôm nay (HR chỉ khi có mẫu hợp lệ,
  steps + completeness, pin, coverage, sự cố); nhãn "Nguồn: dữ liệu mô phỏng" khi
  `source=synthetic`; không số 0 giả; key riêng `dashboardOpenAlerts` để không đụng bộ đệm
  trang cảnh báo (limit 5 vs 25).
- `features/history/HistoryPage.tsx` + `components/MeasurementChart.tsx` — khoảng 24h/7d/30d
  **clamp theo `permissions.historyDays`** (nút ngoài quyền disabled + ghi chú); bảng dữ liệu
  + biểu đồ SVG (không thêm thư viện) có nhãn trục, ô gap, `<title>` trên từng điểm; đánh dấu
  nhận trễ/đồng hồ chưa đồng bộ/cách ly; bảng là phương án thay thế cho screen reader
  (aria-label của SVG trỏ về bảng); tải CSV qua thẻ `<a>` cùng nguồn (cookie theo), server tự
  kiểm quyền history; rỗng → "Chưa có dữ liệu" kèm lý do (kể cả số mẫu unsynced bị loại).

### devices / share / notifications / invitations

- `features/devices/DevicesPage.tsx` — trạng thái thiết bị, claim code (validate
  `claimDeviceSchema` trước khi gửi, lỗi field), tháo gắn có xác nhận 2 bước.
- `features/share/SharePage.tsx` — mời qua email + quyền (historyDays, nhận/xác nhận/đóng
  cảnh báo, AI) + hạn (1–720h); `acceptUrl` + `token` hiển thị **một lần** kèm cảnh báo không
  xem lại được + nút sao chép; danh sách lời mời + care links; thu hồi có xác nhận 2 bước.
  Email đầy đủ chỉ hiển thị ở màn hình owner quản lý chia sẻ này.
- `features/notifications/NotificationsPage.tsx` — hộp thư, số chưa đọc, đánh dấu đã đọc
  (optimistic có rollback khi lỗi).
- `features/invitations/api.ts` — **xóa schema tạm**, dùng `publicInvitationSchema`/
  `careLinkSummarySchema`; `InvitePage.tsx` hiển thị quyền sẽ được cấp, accept thành công →
  invalidate subjects/notifications.

### Shell / styles / docs

- `app/router.tsx` — thêm routes: `history`, `alerts` + `alerts/:id`, `subjects`,
  `subjects/:id/share`, `devices`, `notifications`; giữ `/invite/:token` và `*`.
- `app/AppShell.tsx` — nav đầy đủ (sidebar + bottomnav 6 mục), SSE + banner mất quyền.
- `styles/layout.css` — thêm section wave 2 (segmented, alert list, timeline, chart SVG,
  data-table, device/invite/notification cards, confirm-box, metric grid…), responsive từ
  360px, mobile-first, dùng token chung.
- `apps/web/README.md` — cập nhật cấu trúc, route, quy ước wave 2, trạng thái.
- `e2e/alerts.spec.ts` (mới) — 2 kịch bản E2E mock API bằng `page.route` (không cần API thật).

## Kiểm đã chạy (kết quả thật)

| Lệnh (trong `apps/web`) | Kết quả |
| --- | --- |
| `pnpm typecheck` | exit 0 |
| `pnpm test` | **12 file, 39/39 passed** (thêm 9 test mới, xem dưới) |
| `pnpm build` | thành công; cảnh báo chunk 946 kB (giữ nguyên từ wave 1, chưa code-split) |
| `pnpm test:e2e` | **4/4 passed** (2 smoke wave 1 + 2 mới) — chạy trên **bản build qua `vite preview` cổng 5173**; xem rủi ro "dev server" bên dưới |

Test mới theo yêu cầu prompt:

- `features/alerts/AlertsPage.test.tsx` — empty (không số 0 giả) / error có thử lại /
  **ack 409 → banner phiên bản cũ + nút tải lại**.
- `features/alerts/AlertDetailPage.test.tsx` — **ack 409 ở chi tiết → "đã thay đổi ở nơi
  khác" + "Tải lại cảnh báo", giữ trạng thái cũ, không đoán**.
- `features/realtime/sse.test.ts` — parser khối SSE (id/event/data, comment, JSON sai),
  reducer (alert.updated hợp lệ/lệch hợp đồng, notification.sent, revoked, unknown), backoff.
- `features/subjects/SubjectForm.test.tsx` — **lỗi field** (tên trống, giới hạn 120 ký tự từ
  hợp đồng, timezone mặc định Asia/Ho_Chi_Minh, submit đúng giá trị).
- `features/devices/DevicesPage.test.tsx` — **claim code**: mã ngắn → lỗi field không gọi API;
  mã hợp lệ → POST đúng body.
- `features/history/HistoryPage.test.tsx` — **"Chưa có dữ liệu"** kèm hướng dẫn, không bảng,
  nêu rõ số mẫu đồng hồ chưa đồng bộ bị loại.

### Test cũ đã cập nhật (ghi rõ lý do — không phải nới test để xanh)

- `app/ProtectedRoute.test.tsx`, `features/auth/LoginPage.test.tsx`: wave 1 assert lời chào
  "Xin chào, Ngọc" của **AppHomePage — trang tạm đã bị thay bằng DashboardPage theo đúng
  prompt wave 2**. Assert mới: sau login về `/app` hiển thị shell (tên người dùng + nav).
- `features/subjects/SubjectSwitcher.test.tsx`: wave 1 assert CTA tạo hồ sơ **disabled +
  nhãn "wave 2"** — wave 2 đã có trang hồ sơ thật nên CTA thành link `/app/subjects`;
  assert bằng `getAllBy` vì cả bộ chuyển hồ sơ lẫn dashboard đều báo "Chưa có hồ sơ nào".

## Chưa làm / giới hạn (trung thực)

- **SSE hook chưa có test component trực tiếp** — hook dùng `EventSource` thật; đã test phần
  logic thuần (parser/reducer/backoff) theo yêu cầu prompt. EventSource không tồn tại trong
  jsdom nên hook chạy ở chế độ idle trong unit test; hành vi thật (mở/reconnect/revoked) cần
  kiểm tay hoặc E2E với API thật.
- **E2E chưa chạy với API thật** (API không chạy trong phiên; không khởi động được vì ngoài
  vùng ghi). Đã chạy 4 E2E với API mock qua `page.route` trên bản build.
- **Nhãn "nguồn: mô phỏng" cho từng điểm đo**: hợp đồng `measurementPointSchema` KHÔNG có
  trường `source` (chỉ `dailySummary` có). Dashboard hiển thị nhãn đúng khi
  `dailySummary.source === 'synthetic'`; trang lịch sử hiển thị ghi chú demo chung. Nếu muốn
  gắn nhãn theo điểm, cần thêm trường vào contracts (ngoài vùng ghi của tôi).
- **Khoảng thời gian lịch sử**: chỉ 3 nút 24h/7d/30d (theo prompt); chưa có date picker.
- **Chưa code-split** theo route (bundle ~946 kB, cảnh báo từ wave 1).
- **Lời mời hết hạn**: API không có endpoint thu hồi lời mời pending — trang chỉ hiển thị
  trạng thái (đúng hợp đồng hiện có).
- **Web Push/khoá màn hình**: ngoài phạm vi, không báo là đã làm.

## Ảnh hưởng contract

- KHÔNG sửa `packages/contracts/**`; chỉ tiêu thụ. Phát hiện cần ghi cho lead:
  1. `packages/contracts/src/incidents.ts` không re-export **type** `IncidentState`/
     `IncidentType`/`IncidentEventType` (chỉ re-export schema) — web phải import type từ
     `@annhien/contracts` (core) và `@annhien/contracts/telemetry`. Đề nghị re-export type để
     tiện dùng.
  2. `measurementPointSchema` thiếu `source` (xem mục chưa làm).
  3. `subjectListSchema` là `{items}` (không có nextCursor) — đúng như API trả, web đã theo.

## Rủi ro tích hợp

1. **Dev server `pnpm dev` không chạy được module contracts** (lỗi
   `packages/contracts/dist/core.js` — CJS — "does not provide an export named
   'apiErrorSchema'"). Đây là lỗi interop CJS/ESM **có từ wave 1** (wave 1 chỉ curl HTML nên
   không phát hiện; E2E wave 1 chưa từng chạy). Build + preview + Vitest vẫn chạy tốt vì
   bundler/test runner xử lý CJS khác. **Sửa thuộc vùng lead**: thêm
   `optimizeDeps.include: ['@annhien/contracts']` ở `vite.config.ts` hoặc xuất ESM cho
   contracts — tôi không được sửa 2 file đó. Vì vậy E2E trong phiên này chạy trên
   `vite preview` (bản build) với `reuseExistingServer` của Playwright, không đổi config.
2. **401 toàn cục**: ngoại lệ `['auth','me']` là bắt buộc (landing/trang lời mời kiểm phiên
   công khai). Nếu wave sau thêm query công khai nào khác cần ngoại lệ tương tự thì để ý.
3. **SSE + StrictMode dev**: effect mở/đóng 2 lần khi mount trong dev — đã xử lý cleanup
   đúng, không rò rỉ kết nối.
4. **`alerts?state=open`** của API chỉ trả `open/acknowledged` (suspected ẩn, `closed` =
   resolved/cancelled/unconfirmed) — UI dùng nhãn "Chưa xác định" cho unconfirmed nhưng
   suspected không bao giờ xuất hiện trong list/detail (detail 404) — đúng thiết kế backend,
   không phải lỗi UI.
5. **Chia sẻ**: `acceptUrl` là URL tương đối do API trả — sao chép được dùng nguyên văn; nếu
   demo chạy trên máy khác cần ghép origin (chưa làm vì chưa biết public origin).
6. **E2E chạy với API thật** (luồng login → tạo hồ sơ → cảnh báo) vẫn cần mini-lead/fe-lead
   wave 3 chạy lại — mock `page.route` không thay thế được kiểm hợp đồng thật.

## Đề nghị

- Lead sửa interop dev server (rủi ro 1) trước khi dùng `pnpm dev` để demo.
- Mini-lead fe chạy lại E2E với API thật và rà UI theo docs/06 (độ tương phản, chữ lớn,
  bàn phím) — đã giữ focus-visible/aria-label/bảng thay thế biểu đồ nhưng chưa có kiểm thử
  người dùng.
