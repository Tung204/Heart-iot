# Handoff — v2 fix notification boundary (P2-1 phần notification, P2-4)

- **Thời điểm:** 2026-11-15 07:19 (Asia/Ho_Chi_Minh)
- **Worker:** fix-notification-boundary (worktree riêng `fix-notification-boundary`)
- **Nhánh:** `fix-notification-boundary`
- **Commit code + test:** `d0a231c` — `fix(api): áp ranh giới chia sẻ và read idempotent cho notifications`
- **Vùng ghi:** `apps/api/src/notifications/**`, `apps/api/test/notifications.spec.ts`, file này.
  Không sửa measurements/incidents/app.module/contracts; dùng `AccessModule` global và
  `AccessService.requireHistory` sẵn có nên không cần đổi contract.
- **Nguồn yêu cầu:** `reports/qa/v2-data-integrity.md` P2-1 (phần notification) + P2-4;
  `docs/02` NFR-01; `docs/04` bảng `care_links`/`notification_outbox` và mục thu hồi;
  `docs/06` luồng thu hồi.

## Đã làm

### `apps/api/src/notifications/notifications.service.ts`

- Inject `AccessService` (không sửa `notifications.module.ts`/`app.module.ts`;
  `AccessModule` là `@Global`).
- Thêm `visibleWindows(userId, subjectIds)`:
  - Mỗi subject gọi `AccessService.requireHistory(userId, subjectId, null)` → dùng đúng công thức
    `max(now - historyDays, sharedFrom)` như measurements/daily-summary.
  - Chủ hồ sơ: cửa sổ `null` (không giới hạn lịch sử).
  - Người thân: chỉ giữ khi link còn `active` (requireHistory đã lọc `revokedAt`) **và**
    `permissions.canReceiveAlerts = true`.
  - Không có link/hồ sơ lưu trữ (404 từ `requireSubject`): bỏ subject khỏi map — không lộ tồn tại.
- `listNotifications`:
  - Lấy thêm `incidents.detectedAt`; lọc theo cửa sổ **trước** khi map/slice 200.
  - `unreadCount` tính trên chính tập đã lọc quyền (bỏ câu `count(*)` riêng trước đây).
  - Mốc so sánh là thời điểm incident xảy ra (`detectedAt`), không phải `notification_outbox.created_at`
    (thời điểm gửi), để cùng semantics với alerts/daily-summary.
- `markRead`:
  - Đọc notification kèm `incidents.subjectId/detectedAt`; kiểm lại quyền + cửa sổ tại thời điểm đọc.
  - Không thấy/không còn quyền/ngoài cửa sổ → **404** (không lộ subjectName/type/state).
  - Đã có `readAt` → trả luôn (204), **không** ghi đè.
  - Update có thêm `isNull(readAt)` để hai request đồng thời vẫn giữ mốc đọc đầu tiên.

### `apps/api/test/notifications.spec.ts`

Giữ N1–N3; thêm N4–N10:

| Test | Nội dung |
| --- | --- |
| N4 | Caregiver accept lại sau incident (`sharedFrom` mới muộn hơn `detectedAt`) không thấy notification cũ, `markRead` 404; owner vẫn thấy và unread = 1 |
| N5 | Thu hồi care link → list rỗng, `unreadCount = 0`, `markRead` 404 |
| N6 | `markRead` hai lần (cách 15 ms) → vẫn 204, `readAt` giữ nguyên mốc đầu |
| N7 | Biên `sharedFrom`: `detectedAt == sharedFrom` còn thấy; `sharedFrom = detectedAt + 1 ms` → list rỗng, read 404 |
| N8 | `historyDays = 1`: incident 25 h trước bị ẩn/read 404, incident gần thấy; `unreadCount = 1` trên tập đã lọc; owner vẫn thấy cả 2 |
| N9 | Link còn active nhưng `canReceiveAlerts = false` → không thấy/read 404; owner vẫn thấy |
| N10 | Admin không có link: outbox row trỏ tới admin vẫn không hiện, read 404; đọc notification của owner cũng 404 |

## Kiểm đã chạy (kết quả thật)

| Lệnh (thư mục) | Kết quả |
| --- | --- |
| `pnpm install --prefer-offline --frozen-lockfile` (root) | 711 package, exit 0 |
| `pnpm build:contracts` (root) | exit 0 |
| `pnpm typecheck` (`apps/api`) | exit 0 |
| `pnpm test -- notifications.spec.ts` (`apps/api`) | **1 suite, 10/10 pass** (~7,2 s) |
| `pnpm test -- notifications.spec.ts incidents.spec.ts sse.spec.ts care.spec.ts` | **4 suite, 29/29 pass** (~43,5 s) |
| `pnpm test` (`apps/api`, toàn bộ) | **14 suite, 107/107 pass** (~143 s) |
| Đối chứng ngược: tạm khôi phục service ở HEAD rồi chạy `notifications.spec.ts` | N4–N10 **fail 7**, N1–N3 pass → test mới bắt đúng lỗi cũ |

Không chạy lại kịch bản HTTP/PGlite thủ công ngoài jest; các test dùng PGlite in-memory và
`createModuleTestApp` nên không đụng DB demo/lead.

## Chưa làm / giới hạn

- **P2-1 còn phần ngoài notifications:** `incidents.listAlerts`/`loadVisibleIncident` vẫn chưa áp
  `sharedFrom/historyDays`; `daily-summary.incidents` vẫn đếm theo `from..to` của ngày thay vì
  `windowFrom`. Hai chỗ này thuộc `incidents/**` và `measurements/**` — ngoài vùng được phép sửa,
  cần lead hoặc worker khác xử lý (dùng cùng `requireHistory`).
- `NotificationService.processPending` → `recipientAllowed` vẫn chỉ kiểm link active +
  `canReceiveAlerts`, chưa kiểm `sharedFrom/historyDays`. Hệ quả: một alert `pending` từ trước khi
  re-accept có thể được đánh dấu `sent` cho caregiver mới, nhưng list/read đã ẩn nên **không lộ dữ
  liệu**, chỉ tạo bản ghi không ai đọc được. Nếu muốn sạch outbox, thêm kiểm `detectedAt >=
  effectiveFrom` ở worker (vẫn trong `notifications/**`).
- `listNotifications` đọc toàn bộ notification `sent` của user rồi lọc trong bộ nhớ để
  `unreadCount` khớp tập hiển thị. Hợp đồng hiện không có cursor nên chưa phân trang; hộp thư rất
  lớn cần đẩy điều kiện quyền xuống SQL hoặc thêm cursor.
- Mỗi request list/markRead gọi `requireHistory` theo từng subject (N+1 theo số hồ sơ, thực tế nhỏ).
- Không thêm audit cho hành động đọc (P2-4 chỉ yêu cầu giữ mốc `readAt`; audit hiện chưa có loại này).
- `markRead` trên notification đã đọc nhưng **đã mất quyền** trả 404 (không trả 204) — đúng yêu cầu
  "thu hồi → 404 read", khác với trường hợp còn quyền.

## Rủi ro tích hợp

- Không đổi contract/UI: web vẫn nhận `NotificationList`; chỉ khác là danh sách/unread có thể giảm
  ngay sau thu hồi hoặc accept lại — đúng NFR-01.
- Admin chỉ thấy notification của hồ sơ mà admin là owner hoặc có care link; role admin không tự
  cấp quyền đọc (giữ nguyên nguyên tắc subject-scoped của `AccessService`).
- Cửa sổ dùng `now` tại thời điểm request, nên incident nằm sát biên `historyDays` có thể đổi trạng
  thái giữa hai lần gọi — nhất quán với measurements/daily-summary hiện có.
- Nếu lead sửa `AccessService.requireHistory` sau này, notification tự theo chính sách mới (không
  có công thức riêng trong notifications).

## Bước tiếp theo gợi ý (chưa cam kết)

1. Áp `requireHistory` cho `listAlerts`/`getAlert` và dùng `windowFrom` khi đếm incident trong
   `daily-summary` để đóng hẳn P2-1.
2. Quyết định có thêm kiểm `sharedFrom/historyDays` vào `recipientAllowed` của worker outbox.
3. Bổ sung test T-02 (docs/08) cho alert list/detail sau thu hồi để phủ cùng ma trận với notification.
