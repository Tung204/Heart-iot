# Fix worker — quyền xem số đo tách khỏi quyền nhận cảnh báo

Bạn là worker sửa lỗi trên worktree riêng. Đọc `AGENTS.md`, `reports/qa/v2-privacy-ethics.md` P1-2/P2-6, `reports/qa/v2-product-gaps.md`, `docs/02` FR-02/FR-14, `docs/04` care_links, `docs/06`, code care/access/measurements/devices/dashboard/share.

Chỉ sửa: `packages/contracts/src/core.ts` (thêm `canViewMeasurements`), `care.ts`/`subjects.ts`/`telemetry.ts` nếu cần, `apps/api/src/access/access.service.ts`, `apps/api/src/care/**`, `apps/api/src/measurements/measurements.service.ts` (gate), `apps/api/src/devices/devices.service.ts` (redact status), test care/measurements/devices; web `features/share/SharePage.tsx`, `DashboardPage.tsx` (chỉ xử lý quyền), `HistoryPage.tsx` (chỉ trạng thái quyền), test tương ứng. Không sửa app.module/router/AppShell/layout.css/ingest/incidents/assistant. Cài install/build contracts; test API + web + typecheck.

Yêu cầu:
- `CarePermissions` thêm `canViewMeasurements: boolean` mặc định **true** cho tương thích; lưu/đọc jsonb; helper `canViewMeasurements(access)` coi thiếu = true. OWNER true. Không migration.
- API measurements list/daily-summary/export.csv/insights: caregiver thiếu quyền → 403 thông điệp rõ “Chủ hồ sơ không chia sẻ số đo…” (không 404); owner luôn được. Alerts/notifications/contacts vẫn theo quyền cũ.
- `GET /subjects/:id/status`: caregiver thiếu quyền → mỗi device `healthDataVisible:false`, `lastHeartRateBpm/lastHeartRateQuality/lastMeasuredAt=null`, `freshness` không dựa mẫu cũ; pin/online có thể giữ nhưng không kèm số đo. Thêm field `healthDataVisible` vào `deviceStatusSchema` (default true) để UI phân biệt. Owner true; caregiver đủ quyền true.
- SharePage: checkbox “Cho phép xem số đo và lịch sử” mặc định bật, hint rõ gồm nhịp tim/bước chân/lịch sử/CSV, tắt thì ẩn/disable “Số ngày lịch sử” và payload `canViewMeasurements:false`; hiển thị quyền hiện tại ở danh sách người nhận.
- Dashboard: nếu status trả healthDataVisible false hoặc summary 403 → hiện thông báo “Chủ hồ sơ không chia sẻ số đo” thay vì crash/0 giả; alerts vẫn hiển thị. History: trạng thái quyền tương tự, không hiện lỗi kỹ thuật.
- Test API: old care link thiếu field đọc như true; false → measurements/daily/export/insights 403, status redacted, alerts 200; owner unaffected; UI chia sẻ gửi false, dashboard/history hiển thị thông báo.
- Handoff `reports/handoffs/v2-fix-health-permission.md`; commit nhánh riêng. Báo commit hash, test counts, quyết định mặc định, rủi ro.
