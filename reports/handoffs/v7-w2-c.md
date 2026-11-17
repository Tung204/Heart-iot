# v7 W2 lane C — cảnh báo, hộp thư thông báo, trợ lý

- Lane: **W2-C**, branch `Tung204/v7-c`, worktree `C:/Users/nguye/orca/workspaces/DATN/v7-c`
- Base: `cf11c29` (head `v7-foundation`); master đã tiến tới `54786de` (merge lane H) sau khi lane này tách nhánh — **không rebase** theo `w2-common.md`
- Provider/model: `moxuna` / `deepseek-v4.1-flash`
- Cổng: web dev `4352`, API `3012` với `WEB_ORIGIN=http://localhost:4352`, PGlite `.data/qa-v7-c`
- Trạng thái: xong phần lane C, **chưa merge**; còn 1 dòng E2E v6 cần lead sửa (§6) và các việc ngoài phạm vi ở §8

## 1. File thay đổi

Sửa (8):

| File | +/- |
| --- | --- |
| `apps/web/src/features/alerts/AlertsPage.tsx` | +352/−229 |
| `apps/web/src/features/alerts/AlertsPage.test.tsx` | +162/−35 |
| `apps/web/src/features/alerts/AlertDetailPage.tsx` | +231/−111 |
| `apps/web/src/features/alerts/AlertDetailPage.test.tsx` | +145/−2 |
| `apps/web/src/features/notifications/NotificationsPage.tsx` | +173/−77 |
| `apps/web/src/features/notifications/NotificationsPage.test.tsx` | +172/−8 |
| `apps/web/src/features/assistant/AssistantPage.tsx` | +77/−69 |
| `apps/web/src/features/assistant/AssistantPage.test.tsx` | +85/−9 |

`git diff --stat`: **8 file, 1397 insertions, 540 deletions**.

Thêm (3): `apps/web/src/styles/alerts.css` (447 dòng), `apps/web/src/styles/assistant.css` (312), `apps/web/src/features/notifications/notifications.css` (147).

Bằng chứng: `reports/qa/evidence/v7-c/` — `qa.mjs`, 26 PNG, `metrics.json`, `behaviour.json` (log API cục bộ `api-dev.log` không commit vì `.gitignore` khớp `*.log`).

Không sửa: `features/alerts/labels.ts` (đóng băng), `app/*`, `lib/*`, `components/*`, `test/utils.tsx`, `styles/layout.css`, `apps/api`, `packages/contracts`, route/query key. Không thêm dependency. Không đổi API/SSE/quyền.

## 2. Hành vi giữ nguyên

- **Đọc cảnh báo theo hồ sơ đang chọn** (`useAlerts(activeSubjectId)`); quyền tính từ hồ sơ đó: `canReceiveAlerts = role owner || permissions.canReceiveAlerts`, `canAcknowledge` chỉ khi có receive.
- Ack gửi `POST /subjects/:id/alerts/:alertId/acknowledge` (đúng endpoint hiện có) với `expectedVersion = item.version`; 409 → refetch danh sách, hiện người đã xác nhận nếu có, không báo thành công giả; lỗi khác → giữ danh sách + nút thử lại.
- SSE/stale: `refetch` giữ danh sách đang có, không xoá trắng; hiện "Cập nhật lúc …" và ghi chú dữ liệu có thể cũ.
- Inbox: dùng `queryKeys.notifications` (account-wide, không subject), mark-read qua mutation sẵn có, không ack/resolve, link đúng `incidentId`, không phụ thuộc AI.
- Chi tiết: quyền + ngữ cảnh theo `detail.subjectId` (không theo hồ sơ đang chọn ở shell); `EmergencyContactCard` lỗi/đang tải không chặn ack; timeline chỉ dựng từ `events` thật.
- Trợ lý: `/app` là **Hôm nay**; `POST assistant/ask` theo `subjectId` đang chọn; không auto-summary khi mount; reset thread khi đổi hồ sơ; câu trả lời đến muộn của hồ sơ cũ bị bỏ; cảnh báo trên Hôm nay độc lập với AI.
- Không đổi query key nào: `lib/query.ts` không bị chạm; inbox dùng key cấp tài khoản đã có, các key subject-scoped đã đăng ký từ trước (D4).

## 3. Hành vi thay đổi (theo `design-system.md` §5.4–5.6)

**AlertsPage**

- Hai tab thật: `Cảnh báo` (`/app/alerts`) và `Thông báo đã nhận` (`/app/alerts?view=notifications`), kèm chip số chưa đọc; `aria-current="page"` theo tab; reload/back giữ URL và tab.
- `?view=notifications` render `NotificationsPage` **trong cùng trang** (H1 "Cảnh báo" duy nhất, H2 "Thông báo đã nhận"); lead và bộ lọc mức độ ẩn ở nhánh inbox.
- Ack hai bước: nút **Tôi đang hỗ trợ** → khối hỏi lại "Bạn đã liên hệ và đang hỗ trợ?" với `Có, tôi đang hỗ trợ` / `Hủy` (design:200 yêu cầu giữ bước hỏi lại trước POST). Hàng chờ đóng cảnh báo giữ nguyên `Đóng cảnh báo`.
- Hàng cảnh báo: tiêu đề = link chi tiết; trạng thái bằng **chữ + màu** (`cần chú ý`, `Đang mở`/`Đã đóng`), dải đỏ trái cho cảnh báo cần chú ý; nhãn `chưa có người xác nhận`, `đến muộn`, `xảy ra trước khi chia sẻ`; bỏ tên hồ sơ khỏi meta vì trang đã subject-scoped (`Phát hiện <thời điểm>`).
- Nút ack trong hàng dùng variant primary; link **Xem chi tiết** vẫn là hành động phụ.

**NotificationsPage**

- Mark-read **optimistic**: giảm `unreadCount`/đổi trạng thái ngay, rollback đầy đủ khi lỗi, giữ nút thử lại; chỉ giảm khi mục đích thực sự chưa đọc.
- Chấm chưa đọc `aria-hidden` + nhãn ẩn "Chưa đọc"; sau khi đọc hiện pill **Đã đọc** thay nút.
- Thời gian tương đối + tuyệt đối khi hover/focus-within (`24 phút trước (00:15 18 thg 11, 2026)`); prop `now` để test tất định.
- Ghi chú "Đánh dấu đã đọc không xác nhận hay đóng cảnh báo."; empty state "Bạn đã đọc hết thông báo.".
- Link **Xem cảnh báo** mang `state.alertsView = 'notifications'` để trang chi tiết quay lại đúng tab hộp thư (không rơi về tab Cảnh báo).

**AlertDetailPage**

- `SubjectContextLine scope="pinned"` lấy từ `detail.subjectId`; đổi hồ sơ ở shell không đổi quyền/ngữ cảnh trang chi tiết.
- Thứ tự §5.6: breadcrumb → meta → ngữ cảnh cảnh báo → **liên hệ chính + Gọi** → một chỗ hành động (`Tôi đang hỗ trợ`, `Đóng cảnh báo`) → timeline → người nhận/hành động. Nút quay lại lấy từ `location.state` (`/app/alerts` hoặc `/app/alerts?view=notifications`) và mang theo bộ lọc.
- Timeline không bịa mốc: chỉ hiện "Xảy ra …" khi có `measuredAt`; nếu `measuredAt === receivedAt` gộp "Xảy ra và nhận …"; thiếu `measuredAt` ghi "Xảy ra: không áp dụng" kèm `conflictReason`; luôn có "Nhận …".
- 404 → EmptyState; mất quyền giữa phiên → thông báo quyền, không hiện nút ghi.

**AssistantPage (`/app`, `/app/assistant`)**

- Bỏ `SubjectContextLine` cục bộ — shell là nguồn duy nhất (đúng 1 dòng ngữ cảnh/trang).
- Ba gợi ý đúng nhãn thiết kế: **Nhịp tim tuần này**, **Cảnh báo đang mở**, **Pin thiết bị**; bấm chỉ **điền** câu hỏi, không tự gửi.
- Không gọi summary khi mount; thread chỉ xuất hiện sau câu hỏi đầu; `role="log"` có tên "Hội thoại".
- Câu trả lời hiện badge provider (`AI` hoặc `Tóm tắt theo mẫu`), pill `Dữ liệu mô phỏng` cho nguồn synthetic, disclaimer giới hạn AI, danh sách **Nguồn số liệu**.
- 403 phân biệt "không có quyền xem số đo" với "yêu cầu bị chặn do origin/ghi"; `RATE_LIMITED` có câu riêng, không mời thử lại vô ích khi thiếu quyền; admin không có hồ sơ → `/app/admin`.
- Chống trả lời muộn: đổi hồ sơ reset thread + tăng `threadEpoch`; `onSuccess` chỉ nhận kết quả nếu đúng `subjectId` + epoch (test A→B→A).
- Thứ tự DOM §5.4: ngữ cảnh → H1 → vùng tín hiệu → **Hỏi trợ lý AI** + composer + gợi ý → thread → link **Sức khỏe 7 ngày** + "Dữ liệu mô phỏng · không thay thế cấp cứu.".

**CSS**

- Chỉ class namespace riêng của feature (`.alerts-*`, `.inbox*`, `.today-*`), import ở gốc feature; không định nghĩa lại primitive.
- Một ngoại lệ có chủ đích: `textarea.today-ask__input` đặt `min-height` cho ô hỏi, vì `layout.css` (F) còn rule legacy `textarea.field__input { min-height: calc(var(--control-min) + 1.5rem) }` = **90px** ở chữ lớn, làm nút Gửi rơi dưới bottom-nav ở 360×740. Selector chỉ áp cho ô hỏi của trang, không đụng `.field__input` toàn cục; khi F bỏ block legacy ở W3 rule này vẫn đúng.

## 4. Test diff

| File | Số test | Thay đổi |
| --- | --- | --- |
| `features/alerts/AlertsPage.test.tsx` | 13 | Thêm: tab đúng href/`aria-current`, `?view=notifications` mount inbox trong trang (1 H1 + H2, không có nút ack/resolve trong inbox), ack hai bước + Hủy không POST, 409 có tên người xác nhận, refetch giữ danh sách + thông báo cũ, lỗi 500 + thử lại, ma trận quyền (không receive → không gọi API; chỉ receive → chỉ gợi ý), empty/error. Test cũ "một click → POST" đổi thành hai bước theo design:200. |
| `features/alerts/AlertDetailPage.test.tsx` | 12 | Thêm: ngữ cảnh/quyền theo `detail.subjectId` khi shell chọn hồ sơ khác, contacts 500 không chặn ack, back link theo state (list vs inbox), timeline thiếu `measuredAt` chỉ có "Nhận" + "không áp dụng" + lý do xung đột. Test cũ vẫn giữ cho luồng ack/resolve/404. |
| `features/notifications/NotificationsPage.test.tsx` | 8 | Viết lại: ngữ nghĩa chấm chưa đọc, thời gian tương đối + tuyệt đối (`now`), href đúng `incidentId`, mark-read optimistic **sống sau remount** (fake server có trạng thái), rollback 500 + thử lại, không có ack/resolve, error state; link chi tiết mang state để quay lại tab hộp thư. |
| `features/notifications/useUnreadNotifications.test.tsx` | 4 | Không đổi. |
| `features/assistant/AssistantPage.test.tsx` | 28 | Cập nhật nhãn gợi ý theo design:188; thêm: đúng 1 H1 + H2 "Hỏi trợ lý AI", label theo hồ sơ, không gọi summary khi mount, kịch bản A→B→A bỏ câu trả lời muộn, thứ tự note row **sau** composer/thread (design:183). |

Không nới assertion nào; test cũ chỉ đổi khi hành vi/copy được thiết kế mới quy định (ghi rõ ở trên).

## 5. Cổng kiểm — output thật (chạy lại sau thay đổi cuối)

```
$ pnpm --filter @heart-iot/web typecheck
$ tsc -p tsconfig.json --noEmit
TYPECHECK_EXIT=0

$ pnpm --filter @heart-iot/web exec vitest run src/features/alerts src/features/notifications src/features/assistant --no-file-parallelism --maxWorkers=1
 Test Files  5 passed (5)
      Tests  65 passed (65)
LANE_EXIT=0

$ pnpm --filter @heart-iot/web exec vitest run
 Test Files  37 passed (37)
      Tests  307 passed (307)
FULL_EXIT=0

$ pnpm --filter @heart-iot/web build
✓ built in 260ms
BUILD_EXIT=0
```

Per-file lane: AlertsPage 13, AlertDetailPage 12, NotificationsPage 8, useUnreadNotifications 4, AssistantPage 28.

## 6. E2E hiện có: 4 pass / 1 fail do copy v6

```
$ pnpm --filter @heart-iot/web exec playwright test e2e/alerts.spec.ts e2e/assistant.spec.ts --reporter=line
 1 failed
    [chromium] › e2e/assistant.spec.ts:187 › getByRole('button', { name: 'Nhịp tim?' })
 4 passed (9.1s)
```

Nguyên nhân: `design-system.md:188` chốt nhãn gợi ý là **Nhịp tim tuần này** (spec v6 dùng "Nhịp tim?"). `e2e/alerts.spec.ts` pass nguyên vẹn (vẫn thấy "Tôi đang hỗ trợ", "chưa có người xác nhận", "Diễn biến sự kiện").

**Patch cần lead/F áp (1 dòng, ngoài phạm vi ghi của lane):**

```diff
-  await expect(page.getByRole('button', { name: 'Nhịp tim?' })).toBeVisible();
+  await expect(page.getByRole('button', { name: 'Nhịp tim tuần này' })).toBeVisible();
```

## 7. Bằng chứng thị giác

- Chromium **159.0.8154.6**, Playwright 1.65.1, DPR **1**; root font 16px (20px ở viewport "chữ lớn"). Dev server lane (Vite `4352`, API `3012`, PGlite `.data/qa-v7-c`, tài khoản owner seed `ba-an@demo.heart-iot.local`) còn đang chạy để lead mở lại; dừng tuỳ ý.
- **26 ảnh viewport** trong `reports/qa/evidence/v7-c/`: 20 ảnh ma trận (5 route × 1280×900, 390×844, 360×740, 390×844 chữ lớn) + 2 ảnh probe 360×740 chữ lớn + 4 ảnh tương tác (`alerts-ack-confirm`, `alert-detail-resolve`, `alerts-inbox-read`, `today-thread`). Không dùng ảnh full-page (tránh artifact của bottom-nav cố định).
- **338 target** đo được trên 25 bản ghi `metrics.json`: nhỏ nhất **44×52,8 px**, **0 target <44**.
- `scrollWidth − clientWidth = 0` ở **cả 20 lượt ma trận** (và 2 lượt probe).
- `h1.length === 1` ở **mọi** route/viewport; context line: **1** ở `/app`, `/app/assistant`, `/app/alerts`, `/app/alerts/<id>`; **0** ở nhánh inbox — khớp `behaviour.json`.
- Tab: trước `/app/alerts` (`aria-current` = "Cảnh báo"), sau click `/app/alerts?view=notifications` ("Thông báo đã nhận"), reload giữ URL + H1 "Cảnh báo"/H2 "Thông báo đã nhận", back về `/app/alerts` đúng tab.
- Mark-read: unread **1 → 0**, pill **Đã đọc**, sau reload "Bạn đã đọc hết thông báo.", `persisted: true`.
- Hành động chính trong viewport đầu (scroll 0), `bottom` so với mép trên bottom-nav:

| Viewport | `/app` Gửi | nav top | `/app/alerts` action hàng | nav top |
| --- | --- | --- | --- | --- |
| 1280×900 | 409,9 | — (không có bottom-nav) | 400,7 | — |
| 390×844 | 504,2 | 779 | 587,6 | 779 |
| 360×740 | 504,2 | 675 | 587,6 | 675 |
| 390×844 chữ lớn | 629,3 | 746,8 | 732,9 | 746,8 |
| 360×740 chữ lớn (probe) | 629,3 | 642,8 | 733 / 798 | 642,8 |

## 8. Chưa kiểm / giới hạn

- **360×740 + chữ lớn trên `/app/alerts`**: hàng "Tôi đang hỗ trợ"/"Xem chi tiết" bắt đầu dưới bottom-nav (678/743 so với 642,8). Ngoài ma trận bắt buộc (390×844 chữ lớn pass, sát ngưỡng 13,9px); không tràn ngang, không mất nội dung, chỉ phải cuộn. Chưa xử lý vì muốn giữ đúng thứ tự/kt tra của §5.5; nếu lead muốn đạt cả 360+chữ lớn thì cần giảm thêm chiều cao header hoặc gộp status vào hàng tiêu đề.
- **409 thật** chưa tạo được trên API (chỉ test unit giả lập 409); **submit ack/resolve thật** chưa bấm (chỉ mở form/focus để giữ dữ liệu seed cho bằng chứng mark-read) — POST body/endpoint đã có test unit.
- Chưa chạy **axe**, chưa kiểm **Safari/Firefox**, chưa thử tài khoản caregiver thật trên trình duyệt (ma trận quyền chỉ ở unit test).
- Thời gian tương đối trong inbox tính lúc render, không tự tick theo phút.
- CSS legacy của alerts/notifications/assistant vẫn còn trong `layout.css`/`app-simple.css` (F sở hữu, dự kiến dọn ở W3); `EmergencyContactCard` (R) tạo surface lồng trong card chi tiết — không sửa vì ngoài phạm vi.
- Chưa có patch request nào khác ngoài dòng E2E §6.

## 9. Ghi chú Obsidian

Đã ghi `1. PROJECT/Đồ án sức khỏe IoT/Nhật ký/v7-wave2-lane-c-canh-bao.md` và thêm liên kết vào `Ghi chú.md` (đọc lại sau khi ghi).
