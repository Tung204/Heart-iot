# Fix worker — Studio data tôn trọng mốc chia sẻ và quyền

Bạn là worker sửa lỗi bảo mật trên worktree riêng. Đọc `AGENTS.md`, `reports/qa/v2-rev-security.md` P1-2, `docs/06`, `docs/04` care_links, code `studio/studio.service.ts`, `access`, measurements, test studio.

Chỉ sửa: `apps/api/src/studio/studio.service.ts` (+ helper studio), `apps/api/test/studio.spec.ts` và test mới nếu cần. Không sửa router/contracts/schema/measurements/devices/web.

Yêu cầu:
- `GET /workspace-views/:id/data` phải gọi `access.requireHistory(userId, subjectId, requestedFrom)` (hoặc cùng logic measurements) để lấy `effectiveFrom`; caregiver mới chỉ thấy dữ liệu từ `sharedFrom` (và trong `historyDays`), không mặc định 24h trước share.
- Cửa sổ dữ liệu: `windowStart = max(now-24h, effectiveFrom)`; series/metrics/summary/chart chỉ từ mẫu hợp lệ (đã lọc quarantine/future) và `measuredAt >= effectiveFrom`, `<= now`.
- Alert/incident trong Studio: chỉ `detectedAt >= effectiveFrom`, `<= now`; count `alertsTotal/alertsResolved` cùng điều kiện. Nếu caregiver thiếu `canReceiveAlerts` thì không trả alerts/count (rỗng/0), không 403 toàn view nếu widget khác không cần alert.
- `cg` không link → 404 như cũ; owner → toàn bộ; caregiver có `sharedFrom` cũ → thấy đúng.
- Không trả dữ liệu sức khỏe trước share qua bất kỳ widget/config nào (kể cả widget tùy biến dùng metrics/series).
- Test: share mới có mẫu trước/sau → chỉ sau; alert trước share không lọt, đang mở trước share? giữ nhất quán với incidents (chỉ alert đang mở có thể hiện? nếu hiện thì flag?); caregiver không `canReceiveAlerts` → alerts rỗng; owner không đổi; data endpoint vẫn CAS digest.
- Chạy studio spec + typecheck; handoff `reports/handoffs/v2-fix-studio-data-boundary.md`; commit nhánh riêng.
