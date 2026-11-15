# Handoff — v2 fix Studio data tôn trọng mốc chia sẻ và quyền

- **Thời điểm:** 2026-11-15 01:27 (Asia/Ho_Chi_Minh)
- **Worker:** fix-studio-data-boundary (worktree riêng `fix-studio-data-boundary`)
- **Nhánh:** `fix-studio-data-boundary`, base `cddacc4`
- **Vùng ghi:** `apps/api/src/studio/studio.service.ts`,
  `apps/api/test/studio.spec.ts`, file này.
  **Không** sửa router/controller, contracts, schema/migration, measurements,
  devices, web hay app.module.
- **Nguồn yêu cầu:** `reports/orchestration/v2-specs/fix-studio-data-boundary.md`
  (từ `reports/qa/v2-rev-security.md` P1-2 — file QA này không có trong worktree);
  `docs/06-trai-nghiem-va-man-hinh.md:39` ("Người thân không mặc định truy cập
  toàn bộ dữ liệu trước ngày chia sẻ"); `docs/04-du-lieu-va-giao-tiep.md:11`
  (`care_links.shared_from`, "kiểm lại trước khi gửi dữ liệu") và `:105`
  (danh sách API Studio).

## Đã làm

### API — `StudioService.renderSubjectData()` (`studio.service.ts`)

Đây là đường đọc dùng chung cho `POST /workspace-views/:id/previews` (chế độ
subject) và `GET /workspace-views/:id/data`.

- Thay `access.requireSubject(...)` bằng
  `access.requireHistory(userId, subjectId, null)` để lấy `access` + `effectiveFrom`
  = `max(now - historyDays, sharedFrom)`. Truyền `from = null` vì endpoint không
  nhận khoảng lịch sử cụ thể: link mới **không bị 403** mà chỉ bị cắt cửa sổ.
- `windowStart = max(now - 24h, effectiveFrom)`; trả trong
  `summary.windowStart`. Với caregiver mới, cửa sổ bắt đầu đúng `sharedFrom`,
  không còn mặc định 24h trước share. Owner có `sharedFrom = null` nên vẫn là
  `now - 24h` như trước.
- `series`, `metrics`, `summary` (avg/min/max/lastSeenAt) chỉ lấy mẫu:
  `is_quarantined = false`, `clock_status = 'synced'`, `measured_at` không null,
  `>= windowStart` và `<= now`. Các truy vấn này giữ nguyên bộ lọc quarantine/
  future/unsynced sẵn có, chỉ thay mốc dưới bằng `windowStart`.
- `latestByDevice` (dùng cho freshness/battery của widget thiết bị) thêm
  `measured_at >= effectiveFrom` vì truy vấn này trước đây không có mốc dưới.
- Gọi `computeDeviceStatus(..., now, visibleFrom)` với
  `visibleFrom = access.role === 'owner' ? null : effectiveFrom` để
  `devices[].lastSeenAt` không lộ mốc kết nối trước share (cùng semantics
  `devices.service.ts`). `online` vẫn là trạng thái kết nối hiện tại, không phải
  số đo sức khỏe.
- Alert/incident:
  - Điều kiện chung `alertWindow`: `subjectId`, `detectedAt >= effectiveFrom`,
    `detectedAt <= now`.
  - Danh sách `data.alerts` dùng `alertWindow` + các state sẵn có
    (`suspected/open/acknowledged/resolved/cancelled`), sắp xếp theo
    `detectedAt` desc thay vì `lastEventAt`.
  - `summary.alertsTotal` và `alertsResolved` dùng **cùng** `alertWindow`.
    `alertsResolved` vẫn là state `resolved`.
  - Caregiver thiếu `canReceiveAlerts`: **không truy vấn incidents**, trả
    `alerts: []`, `alertsTotal: 0`, `alertsResolved: 0`; các widget khác vẫn
    200 bình thường (không 403 toàn view).
- Không đổi `data()`: vẫn đọc publication active, trả `config`/`digest` của
  publication đó (CAS digest giữ nguyên), `view` dựng theo góc nhìn người xem.
- `cg` không link vẫn 404 qua `requireHistory` → `requireSubject`; owner giữ
  nguyên hành vi 24h; link cũ hơn 24h nhưng còn `historyDays` thấy đủ 24h.

### Test — `apps/api/test/studio.spec.ts`

- `shareSubject` nhận thêm `sharedFrom`/`permissions` tuỳ chọn; thêm helper
  `insertIncident` để đặt `detectedAt`/`state` tuỳ ý.
- **T12 (mới):** caregiver `sharedFrom` cách 2h, dữ liệu mẫu 3h/90m/30m và 4
  incident (open/resolved trước share, resolved/open sau share):
  - caregiver chỉ thấy 2 mẫu sau share; `metrics`, avg/min/max, `lastSeenAt`,
    battery đều từ mẫu sau share; `summary.windowStart = sharedFrom`;
  - alerts chỉ gồm 2 incident sau share; `alertsTotal = 2`,
    `alertsResolved = 1`;
  - **cảnh báo open trước share cũng không lọt** vào Studio (xem quyết định 1);
  - `devices[0].lastSeenAt = null` khi `last_seen_at` của thiết bị trước share;
  - owner thấy đủ 3 mẫu + cả 4 incident, `windowStart` vẫn `now - 24h`,
    `lastSeenAt` thiết bị vẫn hiện;
  - caregiver link 10 ngày trước (còn trong `historyDays`) thấy đủ 24h;
  - `digest`/`config` trả về vẫn là bản publication active.
- **T13 (mới):** hai caregiver cùng hồ sơ, một người `canReceiveAlerts=false`:
  - người đủ quyền thấy alert và count 1/0 (control);
  - người thiếu quyền nhận 200, thấy metrics/series bình thường, `alerts: []`,
    `alertsTotal/alertsResolved = 0` — không 403 toàn view.

## Quyết định cần lead biết

1. **Cảnh báo đang mở phát hiện trước `sharedFrom` bị loại khỏi Studio.**
   Yêu cầu ghi rõ chỉ `detectedAt >= effectiveFrom`; contract `studioAlertSchema`
   không có field `startedBeforeShare` và vùng được phép sửa không gồm contracts.
   Vì vậy không thể hiển thị cảnh báo đó mà vẫn gắn cờ như trang Cảnh báo. Trang
   Cảnh báo (`incidents.service.ts`) vẫn giữ cảnh báo open trước mốc kèm
   `startedBeforeShare`; Studio là widget tóm tắt phụ nên chọn ẩn tuyệt đối.
   Nếu lead muốn Studio hiện cảnh báo open trước mốc, cần thêm field contract
   (ngoài phạm vi fix này) và đổi test T12.
2. **`alertsTotal` vẫn đếm mọi state trong `alertWindow`**, không chỉ state đang
   hiển thị; `alertsResolved` đếm `resolved`. Đây là semantics cũ, chỉ thay mốc
   thời gian và điều kiện quyền. Test T12 khẳng định count không lọt incident
   trước share.
3. **Không lọc `tasks` theo mốc chia sẻ.** Task hiện là công việc bảo trì
   (không phải số đo sức khỏe) và không được tạo từ incident trong code hiện tại;
   nếu sau này task gắn dữ liệu sức khỏe/incident thì cần lọc thêm.
4. **`devices[].online` vẫn theo `devices.last_seen_at` hiện tại** dù
   `lastSeenAt` bị ẩn trước share — theo đúng ghi chú của
   `computeDeviceStatus`: online là trạng thái kết nối hiện tại, không phải lịch
   sử sức khỏe.
5. `source` synthetic trong summary dùng `receivedAt >= windowStart`; giá trị này
   chỉ là nhãn nguồn, không chứa số đo, và đã nằm trong cửa sổ được phép.

## Kiểm đã chạy (kết quả thật)

| Lệnh | Kết quả |
| --- | --- |
| `pnpm build:contracts` (root) | exit 0 |
| `pnpm --filter @annhien/api typecheck` | exit 0 |
| `pnpm --filter @annhien/api test -- studio.spec.ts` | **1 suite, 14/14 pass** (~12,9 s) |
| `pnpm --filter @annhien/api test` (toàn bộ API) | **20 suite, 194/194 pass** (~132,6 s) |

Không chạy web test/e2e hay app thật vì thay đổi chỉ ở API Studio và không sửa
web. Không chạy lại kịch bản tấn công localhost; bằng chứng là test PGlite
in-memory + typecheck.

## Chưa làm / phần lead cần nối

- Không cập nhật `docs/` (ngoài vùng được phép ghi). Nếu muốn tài liệu mô tả
  ranh giới dữ liệu Studio, docs owner có thể bổ sung vào `docs/04` mục API
  Studio hoặc `docs/06` phần widget.
- Chưa có test HTTP cho trường hợp `sharedFrom` ở tương lai (accept luôn đặt
  `sharedFrom = now`, DB default `now()`), nên service giữ đúng công thức
  `windowStart = max(...)` mà không clamp thêm.
- Không đụng semantics cảnh báo toàn tài khoản/SSE/notifications; các phần đó
  vẫn do các fix worker khác quản lý.
