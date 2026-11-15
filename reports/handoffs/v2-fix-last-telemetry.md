# Handoff — v2-fix-last-telemetry (P1-4)

- **Ngày:** 2026-11-15 (Asia/Ho_Chi_Minh)
- **Worker:** fix-last-telemetry (dispatched), worktree `C:/Users/nguye/orca/workspaces/DATN/fix-last-telemetry`
- **Nhánh:** `fix-last-telemetry` (không merge)
- **Base:** `c796f2e docs(orchestration): spec 5 fix worker từ review v2`
- **Commit sửa:** `332558e8a365ad948d8ccd03e800f9645923719c`
- **Nguồn finding:** `reports/qa/v2-data-integrity.md` mục P1-4
- **Hợp đồng tham chiếu:** `docs/03` (sự kiện đến muộn giữ giờ gốc; chưa đồng bộ giờ không lấy giờ nhận làm giờ đo), `docs/04` (`measured_at` chỉ có nghĩa khi `clock_status=synced`), `docs/06` (“Nhịp tim mới nhất”, “thời điểm đo cuối hợp lệ”)

## Đã sửa

### `apps/api/src/devices/devices.service.ts` — `loadLastTelemetry`

Trước: `WHERE device_id AND assignment_id ORDER BY received_at DESC LIMIT 1` → mẫu đến trễ thay mẫu mới.

Sau:

- Chỉ lấy mẫu `clock_status = 'synced'`, `is_quarantined = false`, `measured_at IS NOT NULL`.
- Sắp `measured_at DESC NULLS LAST, received_at DESC, id DESC` rồi `LIMIT 1`.
- Không có mẫu hợp lệ → trả `null` (không fallback sang `received_at`).
- `lastHeartRateBpm`, `lastHeartRateQuality`, `batteryPercent`, `lastMeasuredAt`, `freshness` vẫn do `computeDeviceStatus` lấy từ đúng dòng mới nhất đó; `device-status.ts` không cần sửa.
- Shape response `DeviceStatus`/`SubjectStatusResponse` không đổi; phạm vi assignment hiện tại giữ nguyên.

## Kiểm chứng

| Lệnh | Kết quả |
| --- | --- |
| `pnpm install --prefer-offline --frozen-lockfile` | 711 package, không lỗi |
| `pnpm --filter @annhien/contracts build` | pass |
| `pnpm --filter @annhien/api typecheck` | pass |
| `jest --runInBand test/devices.spec.ts` | **11/11 test pass**, 1 suite |
| `jest --runInBand` (toàn bộ API) | **14/14 suite, 102/102 test pass** |

**Đối chứng âm (negative control):** chạy test mới trên code cũ (chỉ hoàn nguyên `devices.service.ts`) → fail đúng lỗi P1-4: trả `HR=50`, `pin=20`, `lastMeasuredAt` của mẫu cũ, `freshness='stale'` thay vì `70/80/mẫu mới/live`; sau đó áp lại patch và test pass.

## Test mới trong `apps/api/test/devices.spec.ts`

1. **“mẫu đến trễ không thay mẫu mới”** — gửi mẫu mới (HR70/pin80) trước, rồi mẫu cũ hơn 19 phút (HR50/pin20) đến trễ; xác nhận bản ghi đến trễ có `is_late=true`, nhưng `/subjects/:id/status` trả `70/80`, `lastMeasuredAt` đúng mẫu mới, `freshness='live'`.
   - Dùng mốc thời gian tương đối (`now - 5s` và `now - 19 phút`) thay vì literal 23:54/23:35 để không tạo mẫu tương lai khi chạy test (P1-1 chưa sửa); khoảng cách 19 phút tương đương kịch bản QA.
2. **“không có mẫu synced hợp lệ”** — chỉ có mẫu `unsynced/measured_at=null`; `/status` trả `lastHeartRateBpm=null`, `batteryPercent=null`, `lastMeasuredAt=null`, `clockStatus='unknown'`, `freshness='stale'`, không lấy giờ nhận làm giờ đo.

## File thay đổi

- `apps/api/src/devices/devices.service.ts`
- `apps/api/test/devices.spec.ts`
- `reports/handoffs/v2-fix-last-telemetry.md` (file này)

Không sửa schema/migration/app.module/web/contracts/docs.

## Rủi ro và việc còn lại

1. **P1-1 chưa sửa (ngoài phạm vi):** `measured_at` tương lai vẫn được ingest nhận. Vì trạng thái giờ chọn `measured_at` lớn nhất, một mẫu tương lai sẽ thành “mới nhất”; cần validate/quarantine ở ingest hoặc chặn ở truy vấn theo policy trước khi coi P1-4 là kín hoàn toàn.
2. **`is_quarantined` hiện chưa có nguồn tạo (P1-2):** filter đã sẵn sàng nhưng runtime chưa có dòng quarantine để kiểm chứng; cần test tích hợp sau khi có vùng cách ly.
3. **Studio còn truy vấn riêng:** `apps/api/src/studio/studio.service.ts` (~dòng 240–303) tự chọn mẫu gần nhất theo `measured_at DESC, id DESC`, không lọc `clock_status='synced'`/`is_quarantined`, không tie-break `received_at`; Studio có thể lệch với `/subjects/:id/status`. Ngoài file được phép sửa trong task này — đề nghị worker/fix riêng.
4. **Thay đổi hành vi có chủ đích:** thiết bị chỉ có mẫu `unsynced` trước đây trả số đo kèm `clockStatus='unsynced'`; nay trả `null`/`unknown`/`stale`. Đúng docs/04 nhưng UI cần kiểm lại nhãn “chưa có mẫu hợp lệ”.
5. **Hai nguồn thời gian trên dashboard vẫn khác nhau:** `daily-summary.lastSeenAt` vẫn theo `received_at` (“dữ liệu mới nhất”), còn status dùng `measured_at` (“lần đo gần nhất”). Không sửa web trong task này; nếu muốn tránh hiểu nhầm nên đổi nhãn hoặc bổ sung “nhận lúc” khi `is_late`.
6. **P1-2 không thay đổi:** mẫu trước assignment vẫn do ingest gán theo assignment đang mở; `loadLastTelemetry` chỉ lọc trong assignment hiện tại.

## Trạng thái

- Commit trên nhánh riêng, chưa merge, chưa push.
- Sẵn sàng để lead review diff `332558e` và quyết định các việc P1-1/P1-2/Studio.
