# Handoff — v2-fix-status-boundary (trạng thái thiết bị theo mốc chia sẻ)

- **Thời điểm:** 2026-11-15 07:51 (Asia/Ho_Chi_Minh, UTC+7)
- **Worker:** fix-status-boundary (dispatched), worktree `C:/Users/nguye/orca/workspaces/DATN/fix-status-boundary`
- **Nhánh:** `fix-status-boundary` (chưa merge, chưa push)
- **Base:** `0d5b18aca12e0b1d4cb2352cb79a09aa7863434c` — `docs(orchestration): spec status boundary`
- **Commit code + test:** `26a5aa5753a6bf8a9be0a2a0ac2a30581bbf4b20`
- **Nguồn finding:**
  - `reports/qa/v2-owner-journey.md` **P1-2** (card “Thiết bị” không kẹp `sharedFrom`, mâu thuẫn “Tổng hợp hôm nay”).
  - `reports/qa/v2-caregiver-journey.md` **P1-1** (phần quan sát `GET /subjects/:id/status` trả `lastMeasuredAt`/`lastHeartRateBpm` trước `sharedFrom`).
  - `docs/04-du-lieu-va-giao-tiep.md:11` (`care_links.shared_from`, “kiểm lại trước khi gửi dữ liệu”);
    `docs/06-trai-nghiem-va-man-hinh.md:39` (“Người thân không mặc định truy cập toàn bộ dữ liệu trước ngày chia sẻ”).
- **Vùng ghi:** `apps/api/src/devices/devices.service.ts`, `apps/api/src/devices/device-status.ts`,
  `apps/api/test/devices.spec.ts`, file handoff này.
  **Không** sửa measurements/incidents/contracts/app.module/web/docs.

## Vấn đề trước khi sửa

`loadLastTelemetry` chỉ lọc `device_id + assignment_id`, không lọc `measured_at` theo mốc chia sẻ; `getSubjectStatus`
trả nguyên `DeviceStatus` cho người thân. Vì vậy caregiver vừa accept vẫn thấy mẫu sức khỏe, pin và
`lastSeenAt` phát sinh **trước** `sharedFrom`, trong khi `daily-summary`/assistant đã kẹp mốc. Cùng dữ liệu này còn
lộ qua `GET /subjects/:id/devices` vì hai route dùng chung `loadSubjectDevices`/`DeviceStatus`.

## Đã sửa

### `apps/api/src/devices/devices.service.ts`

- `getSubjectStatus` và `listSubjectDevices` gọi
  `AccessService.requireHistory(user.id, subjectId, undefined)` để lấy đúng mốc hiệu lực dùng chung với lịch sử:
  `effectiveFrom = max(now - permissions.historyDays, sharedFrom)`. Truyền `undefined` nên **không** từ chối khoảng;
  chỉ dùng phép tính mốc, không nhân bản công thức `DAY_MS` trong `devices`.
- `statusVisibleFrom(access, effectiveFrom)`: **owner → `null`** (không giới hạn, giữ nguyên hành vi cũ, vẫn thấy mẫu
  trước mốc chia sẻ); **caregiver → `effectiveFrom`**.
- `loadLastTelemetry(..., visibleFrom)` thêm `gte(telemetry.measured_at, visibleFrom)` khi có mốc. Giữ nguyên các bộ lọc
  sẵn có: `clock_status='synced'`, `is_quarantined=false`, `measured_at IS NOT NULL`; sắp xếp `measured_at DESC`,
  `received_at DESC`, `id DESC` để mẫu đến trễ không thay mẫu mới.
- Không có mẫu trong cửa sổ → trả `null` thay vì lấy mẫu trước mốc chia sẻ.

### `apps/api/src/devices/device-status.ts`

- Thêm tham số optional `visibleFrom: Date | null = null`; `studio` và caller cũ không đổi hành vi.
- `lastSeenAt` chỉ trả khi `visibleFrom === null` hoặc `lastSeenAt >= visibleFrom`; mốc nhận cuối trước khi chia sẻ
  bị ẩn (`null`).
- `lastHeartRateBpm`, `lastHeartRateQuality`, `lastMeasuredAt`, `batteryPercent` lấy từ `lastRow` đã lọc; không có
  mẫu trong cửa sổ thì lần lượt `null`/`null`/`null`/`null` và `clockStatus='unknown'`.
- `freshness`: `never` khi chưa từng thấy thiết bị; `offline` khi quá `offlineAfterSeconds`; còn online nhưng không có
  mẫu trong cửa sổ → `stale` (trạng thái thiếu dữ liệu, **không** dùng mẫu cũ để tính `live`).

### Hành vi sau sửa

| Tình huống | Owner | Caregiver |
| --- | --- | --- |
| Mẫu mới nhất `measured_at >= effectiveFrom` | Như cũ | Trả mẫu mới nhất đó (HR/pin/giờ đo/lastSeen/freshness như policy) |
| Không có mẫu trong cửa sổ, thiết bị im lặng từ trước mốc | Như cũ (vẫn thấy mẫu cũ) | HR/pin/giờ đo `null`, `clockStatus='unknown'`, `lastSeenAt=null`, `freshness='offline'` (hoặc `never` nếu chưa từng thấy) |
| Không có mẫu trong cửa sổ, thiết bị vẫn online | Như cũ | `online=true` (cờ kết nối hiện tại), `freshness='stale'`, `lastSeenAt=null` nếu mốc nhận cuối trước `visibleFrom`, không kèm HR/pin |

## Quyết định cần lead biết

1. **Pin: ẩn hoàn toàn khi mẫu mới nhất trước mốc chia sẻ** (`batteryPercent=null`), không coi pin là “trạng thái thiết bị
   hiện tại” để hiển thị. Lý do: pin chỉ có trong telemetry; lấy pin từ mẫu trước share vẫn là dữ liệu trước mốc, không có
   nhu cầu an toàn tương đương cảnh báo đang mở. UI hiện có nhánh “chưa có thông tin” cho `null`, đúng `docs/06`
   (“Pin chưa biết”).
2. **Giữ cờ `online` dựa trên `last_seen_at`** vì đây là trạng thái kết nối hiện tại, không phải số đo sức khỏe; vẫn hữu ích
   cho caregiver biết thiết bị có đang gửi dữ liệu. Không kèm mốc nhận (`lastSeenAt=null`) khi mốc đó trước `visibleFrom`.
   Nếu chính sách muốn ẩn tuyệt đối cả trạng thái kết nối của thiết bị trước share, cần đổi thêm `online=false` và
   `freshness='never'` — hiện **không** làm vì sẽ báo sai “chưa từng kết nối” cho thiết bị đang online.
3. **`lastSeenAt` là dữ liệu bị ẩn theo mốc**, không chỉ HR/pin. Lý do: QA P1-2 nêu rõ caregiver thấy `lastSeenAt` trước
   `sharedFrom`; mốc nhận cuối là lịch sử kết nối, không cần cho người thân mới.
4. **`freshness='stale'` khi online nhưng không có mẫu trong cửa sổ** (không phải `never`), để không nói dối “chưa từng thấy
   thiết bị” với thiết bị đã từng kết nối trước khi chia sẻ; `never` chỉ dành cho `last_seen_at IS NULL`.
5. **Áp cùng ranh giới cho `GET /subjects/:id/devices`**, không chỉ `/status`: hai route trả cùng `DeviceStatus` và cùng
   gọi `loadSubjectDevices`; chỉ sửa `/status` sẽ còn lỗ rò tương đương qua đường kia.
6. Dùng `AccessService.requireHistory` thay vì tự tính `max(historyDays, sharedFrom)` trong service thiết bị để mốc
   `effectiveFrom` chỉ có một nguồn, khớp measurements/incidents/assistant.
7. **Không đổi ingest**: mẫu tương lai đã bị cách ly `clock_skew_future`; `is_quarantined=false` đã có trong truy vấn. Test
   không thêm hành vi mới cho hai trường hợp này.

## Test mới — `apps/api/test/devices.spec.ts`

Test **“người thân chỉ thấy mẫu sau sharedFrom: ẩn HR/pin/lastSeen trước mốc; owner giữ mẫu cũ; link mới không lộ”**:

1. Tạo hồ sơ + thiết bị, đẩy `assignment.started_at` về trước mẫu cũ (nếu không, ingest cách ly
   `before_first_assignment` — đúng `docs/03`).
2. Ingest mẫu cũ `measured_at = now - 2h` (HR 58, pin 40), đặt `devices.last_seen_at = now - 2h`; tạo care link
   `sharedFrom = now - 1h`, `historyDays=7` (mốc chia sẻ ở giữa ngày).
3. **Owner:** vẫn thấy `58 bpm`, pin `40`, `lastMeasuredAt`/`lastSeenAt` của mẫu cũ, `freshness='offline'`.
4. **Caregiver trước mốc:** `/status` trả `lastHeartRateBpm=null`, `lastHeartRateQuality=null`,
   `lastMeasuredAt=null`, `batteryPercent=null`, `lastSeenAt=null`, `clockStatus='unknown'`, `freshness='offline'`;
   toàn bộ JSON body không chứa ISO của mẫu cũ. `/devices` cũng không lộ các trường này.
5. **Sau mốc:** ingest mẫu `measured_at = now - 5s` (HR 71, pin 77) → caregiver `/status` trả đúng HR 71, pin 77,
   `lastMeasuredAt` mới, `freshness='live'`, `lastSeenAt` có giá trị.
6. **Link mới accept sau dữ liệu:** `sharedFrom` sau cả hai mẫu, `last_seen_at` trước `sharedFrom` → HR/pin/giờ đo/
   `lastSeenAt` đều `null`, `clockStatus='unknown'`, `online=true` (còn trong 45s), `freshness='stale'`; JSON không chứa
   ISO của cả hai mẫu.

## Kiểm chứng (kết quả thật)

| Lệnh (thư mục) | Kết quả |
| --- | --- |
| `pnpm install --prefer-offline --frozen-lockfile` (root) | 711 package, 23,5s, exit 0 |
| `pnpm build:contracts` (root) | exit 0 |
| `pnpm --filter @annhien/api typecheck` (root, sau sửa cuối) | exit 0 (`tsc --noEmit`) |
| `pnpm test -- devices.spec.ts` (`apps/api`, sau sửa cuối) | **1 suite / 12 test pass**, ~4,9s |
| `pnpm test` (`apps/api`, toàn bộ, sau thay đổi logic) | **18 suite / 162 test pass**, ~168,8s |

**Đối chứng âm:** tạm hoàn nguyên riêng `apps/api/src/devices/` về base, chạy lại `devices.spec.ts` → **1 test fail đúng lỗi
P1-2**: caregiver nhận `lastHeartRateBpm=58`, `lastSeenAt` của mẫu trước `sharedFrom` thay vì `null`; sau đó áp lại patch
và test pass. Thay đổi cuối chỉ wrap dòng import/format; đã chạy lại typecheck + devices spec.

## Rủi ro và việc còn lại

1. **Nhãn UI chưa phân biệt “ẩn vì chưa được chia sẻ” với “chưa từng kết nối”.** `DashboardPage.tsx` và `DevicesPage.tsx`
   hiện render `lastSeenAt === null` thành “chưa từng kết nối”; với caregiver mới, `freshness` có thể là `offline`/`stale`
   nhưng `lastSeenAt=null`. Đề nghị web đổi nhãn thành “chưa có dữ liệu được chia sẻ” khi `freshness !== 'never'`
   (ngoài vùng được sửa của worker này).
2. **Cờ `online` vẫn lộ trạng thái kết nối hiện tại** (không kèm giờ/HR/pin). Đây là quyết định có chủ đích, đã ghi ở mục
   “Quyết định” 2; nếu lead muốn ẩn tuyệt đối thì cần đổi `device-status.ts` + test.
3. **Ngoài phạm vi, vẫn còn rò ranh giới thời gian:** `daily-summary` đếm incident trước `sharedFrom`;
   `incidents.listAlerts/getAlert` (worker `fix-caregiver-window` đã sửa một phần); SSE replay metadata; Studio có truy vấn
   riêng (`studio.service.ts`) và gọi `computeDeviceStatus` với `visibleFrom=null` nên **không** được kẹp bởi fix này.
4. **`device.last_seen_at` là mức thiết bị**, không theo assignment; nếu thiết bị đổi chủ, mốc này vẫn có thể phản ánh lần
   nhận trước đó. Không sửa schema trong task này.
5. **Test dùng mốc tương đối** (`now - 1h/2h/5s`) vì DB test không seed ngày cố định; “sharedFrom giữa ngày” được mô phỏng
   bằng mốc chia sẻ 1 giờ trước, không phải đầu ngày. Test kiểm đúng quan hệ `measuredAt < sharedFrom < measuredAt`.
6. Không chạy lại Playwright/e2e trên app thật; bằng chứng là test PGlite in-memory + typecheck. Không đụng API/web demo
   của lead.

## Trạng thái

- Code + test đã commit trên nhánh riêng `fix-status-boundary` tại `26a5aa5`; handoff commit riêng sau đó.
- Không merge, không push. Sẵn sàng để lead review diff `26a5aa5` và quyết định nhãn UI / mức ẩn `online` (mục rủi ro 1–2).
