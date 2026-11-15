# Fix worker — đo mới nhất theo measured_at

Bạn là worker sửa lỗi trên worktree riêng. Đọc `AGENTS.md`, báo cáo `reports/qa/v2-data-integrity.md` mục P1-4, `docs/03`, `docs/04`, `docs/06`, code `apps/api/src/devices/devices.service.ts` + `device-status.ts`.

Chỉ sửa: `apps/api/src/devices/devices.service.ts`, `device-status.ts` nếu cần, `apps/api/test/devices.spec.ts` (hoặc file test thiết bị hiện có). Không sửa schema/migration/app.module/web. Chạy `pnpm install --prefer-offline --frozen-lockfile`, `pnpm --filter @annhien/contracts build`; chạy test file liên quan + typecheck.

Yêu cầu:
- `loadLastTelemetry` chọn mẫu **đã đồng bộ, không quarantine**, theo `measured_at DESC NULLS LAST, received_at DESC, id DESC` — không theo `received_at` đơn thuần.
- `lastHeartRateBpm`, `batteryPercent`, `lastMeasuredAt`, `freshness` cùng lấy từ dòng mới nhất đó; mẫu đến trễ không được thay mẫu mới.
- Nếu không có mẫu measuredAt hợp lệ, trả null/stale như hợp đồng hiện có, không bịa.
- Giữ nguyên shape response và test cũ; thêm test: mẫu mới 23:54 (HR70/pin80) rồi mẫu cũ 23:35 (HR50/pin20) → API trả 70/80/23:54, freshness đúng.
- Ghi handoff `reports/handoffs/v2-fix-last-telemetry.md`; commit nhánh riêng, không merge. Báo commit hash, test counts, file thay đổi, rủi ro.
