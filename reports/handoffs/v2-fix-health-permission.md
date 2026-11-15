# Handoff — v2-fix-health-permission (quyền xem số đo tách khỏi quyền nhận cảnh báo)

- **Thời điểm:** 2026-11-15 (Asia/Ho_Chi_Minh, UTC+7)
- **Worker:** fix-health-permission (dispatched), worktree `C:/Users/nguye/orca/workspaces/DATN/fix-health-permission`
- **Nhánh:** `fix-health-permission` (chưa merge, chưa push)
- **Base:** `b5a2577` — `docs(orchestration): spec quyền xem số đo`
- **Nguồn finding:**
  - `reports/qa/v2-privacy-ethics.md` **P1-2** (quyền trong lời mời không gác dữ liệu sức khỏe; dashboard người thân hỏng) và **P2-6** (copy đồng ý không nói phạm vi dữ liệu/CSV, quyền nhạy cảm bật sẵn).
  - `reports/qa/v2-product-gaps.md` (hành trình người thân/đồng thuận).
  - `docs/02-yeu-cau-va-pham-vi.md` FR-02/FR-14; `docs/04-du-lieu-va-giao-tiep.md` (`care_links.permissions`, “kiểm lại trước khi gửi dữ liệu”); `docs/06-trai-nghiem-va-man-hinh.md` (“Người thân không mặc định truy cập toàn bộ dữ liệu trước ngày chia sẻ”).
- **Commit code + test:** `12d542fd228923ad0c86047d4470bf188b0fd964` — `fix(privacy): tách quyền xem số đo khỏi quyền nhận cảnh báo`.

## Vấn đề trước khi sửa

`CarePermissions` chỉ có `historyDays` + 4 quyền hành động, không có quyền đọc số đo. Vì vậy caregiver được mời với `canReceiveAlerts:false, canAcknowledge:false, canResolve:false, canViewAi:false` **vẫn** đọc được
`/status` (HR, `lastMeasuredAt`), `/devices`, `/measurements`, `/daily-summary`, `/export.csv`, `/insights`.
Ngược lại dashboard gộp lỗi 403 của cảnh báo vào vùng tổng quan nên hiện “Không tải được dữ liệu tổng quan”
dù vùng an toàn (alerts) là thứ cần thấy nhất. Trang chia sẻ không nói rõ chia sẻ loại dữ liệu gì (kể cả CSV).

## Đã sửa

### `packages/contracts/src/core.ts`

- `carePermissionsSchema` thêm `canViewMeasurements: z.boolean().default(true)`; `DEFAULT_CARE_PERMISSIONS` và
  `OWNER_PERMISSIONS` đặt `true`.
- `CarePermissions` đổi sang `z.input` (trường có thể vắng ở jsonb cũ) và thêm `ResolvedCarePermissions` (`z.output`,
  luôn đủ trường) cho giá trị đã chuẩn hóa. Lý do: `care_links.permissions` là jsonb không migration; nếu bắt buộc
  trường ở kiểu lưu, mọi fixture/seed cũ vỡ typecheck dù dữ liệu cũ vẫn đọc được.
- `normalizeCarePermissions(input)` parse jsonb và điền mặc định; `canViewMeasurements(permissions)` coi thiếu = `true`,
  chỉ `false` tường minh mới chặn.
- **Không migration**: trường nằm trong jsonb.

### `apps/api/src/access/access.service.ts`

- `SubjectAccess.permissions` là `ResolvedCarePermissions`; `resolve`/`listAccessibleSubjects` chuẩn hóa jsonb khi đọc.
- `canViewMeasurements(access)`: owner luôn `true`, caregiver theo quyền (thiếu = true).
- `requireMeasurements` / `assertMeasurements`: thiếu quyền → **403** `FORBIDDEN`,
  message `Chủ hồ sơ không chia sẻ số đo và lịch sử với bạn.`, `details.reason='measurements_not_shared'`
  (không 404 vì người thân vẫn có quyền truy cập hồ sơ và nhận cảnh báo).
- `requireMeasurementsHistory` = kiểm quyền số đo + tính `effectiveFrom` trong một lần resolve; `requireHistory`
  giữ nguyên hành vi cũ (chỉ giới hạn khoảng) cho alerts/notifications/assistant.

### `apps/api/src/measurements/measurements.service.ts`

- `list`, `dailySummary`, `insights`, `exportCsv` dùng `requireMeasurementsHistory` → caregiver thiếu quyền nhận 403
  nghiệp vụ trước mọi xử lý khác; owner không đổi. `dailySummary` bỏ một lần resolve trùng.

### `apps/api/src/care/care.service.ts`

- Mọi chỗ trả/ghi `permissions` từ jsonb đi qua `normalizeCarePermissions` (invitation summary, public preview,
  care-link summary, link tạo khi accept). Lời mời/ link cũ thiếu trường được đọc là `true`; link mới lưu đủ trường.

### `apps/api/src/devices/devices.service.ts` + `device-status.ts`

- `/status` và `/devices` truyền `healthDataVisible = access.canViewMeasurements(access)`.
- `computeDeviceStatus(..., healthDataVisible)`:
  - `false` → `healthDataVisible:false`, `lastHeartRateBpm/lastHeartRateQuality/lastMeasuredAt = null`,
    `clockStatus='unknown'`; **không** dùng `lastRow` để tính freshness.
  - `freshness` khi ẩn dữ liệu chỉ theo kết nối: chưa từng thấy → `never`, quá `offlineAfterSeconds` → `offline`,
    còn online → `live` (cờ “Trực tuyến”). Đây là lựa chọn có chủ ý: nói “chưa cập nhật gần đây” khi thiết bị vẫn
    gửi dữ liệu mỗi 15 giây sẽ sai; “live” ở đây là kết nối hiện tại, không phải số đo.
  - `batteryPercent`/`firmwareVersion`/`online`/`lastSeenAt` vẫn trả nếu nằm trong cửa sổ được phép — spec cho phép
    giữ pin/online; không kèm số đo.
- `deviceStatusSchema` thêm `healthDataVisible: z.boolean().default(true)` để UI phân biệt “không có mẫu” với
  “không được chia sẻ”; phản hồi cũ/studio không phải sửa.

### `packages/contracts/src/incidents.ts` (ngoài danh sách file chính — bắt buộc)

- `incidentRecipientSchema.permissions` là object `.strict()` riêng, thiếu `canViewMeasurements` nên parse chi tiết
  cảnh báo ném lỗi 500 khi link đã có trường mới. Thêm `canViewMeasurements: z.boolean().default(true)` để hợp đồng
  cảnh báo độc lập với quyền số đo; không đổi logic alerts/notifications.

### Web

- `features/share/SharePage.tsx`:
  - Checkbox **“Cho phép xem số đo và lịch sử”** mặc định bật (lấy từ `DEFAULT_CARE_PERMISSIONS`).
  - Hint nêu rõ: nhịp tim, số bước chân, lịch sử đo, tệp CSV; tắt thì chỉ còn cảnh báo/trạng thái kết nối/pin.
  - Tắt → ô “Số ngày lịch sử được xem” bị `disabled` kèm giải thích; payload gửi `canViewMeasurements:false`.
    Tắt luôn khả năng bật “Xem tóm tắt AI” (AI đọc dữ liệu đo) và payload ép `canViewAi:false`.
  - Danh sách lời mời/người nhận hiển thị `không xem số đo` hoặc `xem số đo N ngày`.
  - Thêm câu cảnh báo CSV/thu hồi: bản đã tải/chụp không thu hồi được.
- `features/dashboard/DashboardPage.tsx`: 403 của `daily-summary` và `healthDataVisible=false` của `/status`
  → `Alert` “Chủ hồ sơ không chia sẻ số đo” thay cho `RegionError`/số 0 giả; vùng cảnh báo vẫn render độc lập.
  Card thiết bị khi bị ẩn chỉ còn dòng “Kết nối”, không hiện “chưa có mẫu hợp lệ”.
- `features/history/HistoryPage.tsx`: nếu hồ sơ báo `canViewMeasurements:false` → không gọi `/measurements`, hiện
  `EmptyState` “Chủ hồ sơ không chia sẻ số đo” (không có nút CSV). Nếu API trả 403 (quyền vừa đổi) → cùng thông báo,
  không hiện lỗi kỹ thuật.

## Ma trận hành vi sau sửa

| Đường đọc | Owner | Caregiver `canViewMeasurements=true` (hoặc link cũ thiếu trường) | Caregiver `false` |
| --- | --- | --- | --- |
| `/measurements` | 200 | 200, kẹp `sharedFrom`/`historyDays` | **403** message nghiệp vụ |
| `/daily-summary` | 200 | 200, kẹp cửa sổ | **403** |
| `/export.csv` | 200 | 200, kẹp cửa sổ | **403** |
| `/insights` | 200 | 200, cắt cửa sổ | **403** |
| `/status`, `/devices` | 200 đầy đủ | 200 đầy đủ trong cửa sổ | 200, `healthDataVisible=false`, HR/giờ đo `null`, `freshness` theo kết nối |
| `/alerts`, notifications, contacts | theo quyền cũ | theo quyền cũ | theo quyền cũ (không đổi) |

## Quyết định cần lead biết

1. **Mặc định `canViewMeasurements=true`** cho dữ liệu cũ (không migration): không thu hẹp quyền đã cấp ngoài ý muốn;
   chỉ lời mời mới (UI) mặc định bật checkbox nhưng chủ hồ sơ thấy rõ và có thể tắt. Hệ quả: link cũ vẫn xem được số đo
   như trước, đúng yêu cầu “coi thiếu = true”.
2. **403 chứ không 404** khi thiếu quyền số đo: đây không phải dò tài nguyên (người thân vẫn thấy hồ sơ để nhận cảnh báo);
   message hướng dẫn liên hệ chủ hồ sơ. Chi tiết máy đọc: `details.reason='measurements_not_shared'`.
3. **`freshness` khi ẩn dữ liệu dựa trên kết nối**, không dựa mẫu cũ (mẫu 5 phút vẫn đủ điều kiện tính nhưng bị ẩn).
   Nếu chính sách muốn “stale” thay vì “live”, chỉ cần đổi một nhánh trong `computeDeviceStatus` + test tương ứng.
4. **Giữ pin/online/lastSeenAt** (trong cửa sổ được phép) khi `healthDataVisible=false`; pin là trạng thái thiết bị,
   không phải số đo sức khỏe, và spec cho phép. `clockStatus` bị đặt `unknown` để không tiết lộ nhịp nhận số đo.
5. **Tắt số đo thì UI tắt luôn AI** (checkbox AI bị disable, payload `canViewAi:false`). Lý do: AI tóm tắt từ dữ liệu đo,
   để AI bật sẽ là đường rò dữ liệu sức khỏe ngoài ý muốn. API vẫn cho phép client tự gửi `canViewAi:true` cùng
   `canViewMeasurements:false` — xem rủi ro 1.
6. **Không áp cổng số đo cho assistant/notifications** vì spec giới hạn vùng sửa; các đường này vẫn theo quyền cũ.

## Test

- **API (`apps/api`, jest, `--runInBand`): 18 suites / 173 tests pass.**
  - `test/care.spec.ts` (+1 test, 6 total): link/lời mời cũ thiếu `canViewMeasurements` đọc/ghi ra `true`.
  - `test/measurements.spec.ts` (+2 test, 11 total): caregiver `false` → `measurements/daily-summary/export.csv/insights`
    403 đúng message + `details.reason`; `/alerts` 200; owner không đổi; link cũ thiếu trường vẫn đọc số đo/insights 200.
  - `test/devices.spec.ts` (+1 test, 13 total): `healthDataVisible:false`, HR/chất lượng/giờ đo `null`, `freshness` theo
    kết nối (mẫu 5 phút nhưng online → `live`), pin giữ; `/devices` cùng redaction; owner vẫn `healthDataVisible:true`,
    HR/giờ đo/pin đầy đủ.
- **Web (`apps/web`, vitest): 26 files / 137 tests pass.**
  - `SharePage.test.tsx` (mới): checkbox mặc định bật + hint CSV; tắt → disable số ngày/AI, payload
    `canViewMeasurements:false, canViewAi:false`; danh sách người nhận hiện `không xem số đo`.
  - `DashboardPage.test.tsx` (+1): summary 403 + status `healthDataVisible:false` → thông báo quyền, alerts vẫn hiện,
    không “1234 bước”/“73 bpm”/“chưa có mẫu hợp lệ”.
  - `HistoryPage.test.tsx` (+2): hồ sơ báo `false` → không gọi measurements, không CSV, không lỗi kỹ thuật;
    API 403 → cùng thông báo quyền.
- **Typecheck:** `pnpm typecheck` pass cho contracts, apps/api, apps/web, tools/simulator.
- Lệnh đã chạy:
  - `pnpm build:contracts`
  - `cd apps/api && node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand`
  - `cd apps/web && npx vitest run`
  - `pnpm typecheck`

## Rủi ro / việc tiếp theo (ngoài phạm vi được giao)

1. **AI chưa bị cổng số đo ở API:** caregiver có `canViewAi:true` + `canViewMeasurements:false` vẫn gọi được
   `/assistant/summary` và nhận tổng hợp từ dữ liệu đo (assistant dùng `requireHistory` + `view_ai`). UI chia sẻ đã
   ngăn đường bật này, nhưng client API trực tiếp vẫn làm được. Cần quyết định: thêm `assertMeasurements` vào
   assistant hoặc coi AI là quyền độc lập có đồng thuận riêng. **Không sửa** vì spec cấm chạm assistant.
2. **Copy trang lời mời công khai (`features/invitations/InvitePage.tsx`) chưa cập nhật:** vẫn nói
   “xem lịch sử tối đa N ngày” kể cả khi `canViewMeasurements:false`; người được mời có thể hiểu sai phạm vi.
   Nằm ngoài danh sách file được sửa; nên sửa cùng đợt P2-6 nếu lead đồng ý.
3. **`DevicesPage` (web)** hiện `chưa có mẫu hợp lệ` khi status bị redact thay vì thông báo quyền; chưa sửa vì ngoài
   phạm vi (Dashboard/History đã xử lý). API đã trả `healthDataVisible` để trang này xử lý sau.
4. **Không sửa `docs/`**: contract/ý nghĩa quyền mới được ghi trong handoff + JSDoc; nếu quy trình yêu cầu cập nhật
   `docs/02`/`docs/04`, cần một thay đổi tài liệu riêng (và chạy `tools/docs/build.py`).
5. Không đổi hành vi alerts/notifications/contacts; test incidents/notifications/sse vẫn pass sau khi thêm trường vào
   schema recipient.
