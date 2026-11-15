# Fix worker — trạng thái thiết bị không lộ mẫu trước mốc chia sẻ

Bạn là worker sửa lỗi trên worktree riêng. Đọc `AGENTS.md`, `reports/qa/v2-owner-journey.md` P1-2, `reports/qa/v2-caregiver-journey.md` P1-1, `docs/04` care_links, `docs/06`, code `devices.service.ts`/`device-status.ts`.

Chỉ sửa: `apps/api/src/devices/devices.service.ts`, `device-status.ts` nếu cần, `apps/api/test/devices.spec.ts`. Không sửa measurements/incidents/contracts/app.module/web. Cài install/build contracts; test devices + typecheck.

Yêu cầu:
- Với caregiver, `GET /subjects/:id/status` chỉ dùng telemetry có `measured_at >= effectiveFrom` (max(historyDays, sharedFrom)); nếu mẫu mới nhất trước mốc → `lastHeartRateBpm=null`, `lastMeasuredAt=null`, `clockStatus='unknown'`, freshness theo trạng thái thiếu dữ liệu (không lấy mẫu trước share).
- Không lộ `lastSeenAt`/pin/HR trước mốc chia sẻ; nếu cần giữ trạng thái online hiện tại, chỉ trả cờ thiết bị không kèm số đo cũ và ghi rõ. Owner giữ nguyên hành vi.
- Lọc `is_quarantined=false` (đã có) và mẫu tương lai (đã có ở ingest).
- Test: link sharedFrom giữa ngày, mẫu trước share + mẫu sau share; trước share không trả HR/pin/lastSeen; sau share trả mẫu mới; owner thấy mẫu cũ; link mới không lộ.
- Handoff `reports/handoffs/v2-fix-status-boundary.md`; commit nhánh riêng. Báo commit hash, test counts, quyết định giữ/ẩn pin.
