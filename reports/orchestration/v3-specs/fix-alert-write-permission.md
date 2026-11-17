# Fix worker v3 — không cho ghi cảnh báo khi thiếu quyền nhận cảnh báo

Bạn là worker sửa lỗi trên worktree riêng. Đọc `AGENTS.md`, `reports/qa/v2-security-authz.md` P1-2 (dòng 143–176), `docs/02` FR-07, `docs/06` mục quyền cảnh báo, code incidents/alerts.

## Lỗi cần sửa

Tại `apps/api/src/incidents/incidents.service.ts`, `loadVisibleIncident(userId, alertId, action)` chỉ kiểm `assertAction(access, action)` khi có `action`; vì vậy caregiver có `canAcknowledge=true`/`canResolve=true` nhưng `canReceiveAlerts=false` vẫn **ghi** được trạng thái cảnh báo, rồi `getAlert()` sau commit ném 403. Request trả 403 nhưng dữ liệu, `alert_actions` và outbox đã đổi.

## Phạm vi được sửa

- `apps/api/src/incidents/incidents.service.ts`
- `apps/api/test/incidents.spec.ts`
- `apps/web/src/features/alerts/AlertDetailPage.tsx` + `AlertDetailPage.test.tsx`
- `apps/web/src/features/alerts/AlertsPage.tsx` + `AlertsPage.test.tsx`
- `reports/handoffs/v3-fix-alert-write-permission.md`

Không sửa contracts/schema/migration, `app.module.ts`, router/AppShell/CSS nền, docs/HTML, package exports.

## Yêu cầu

1. Mọi thao tác ghi cảnh báo (`acknowledge`, `resolve`) phải yêu cầu **cả** `receive_alerts` **và** quyền hành động tương ứng. Thiếu một quyền → 403 **trước** transaction/trước mọi ghi; state, version, `alert_actions`, outbox không đổi.
2. Không đổi semantics đọc: owner vẫn luôn được; caregiver đủ quyền vẫn nhận 200 + detail sau khi ghi (không còn 403 sau commit).
3. UI chi tiết: chỉ hiện nút “Tôi đang hỗ trợ”/“Đóng cảnh báo” khi viewer có `canReceiveAlerts` **và** quyền tương ứng. Nếu thiếu `canReceiveAlerts`, hiện lý do rõ (không chỉ ẩn im lặng).
4. UI danh sách: không hiện nút “Xác nhận” nhanh nếu viewer thiếu `canReceiveAlerts` hoặc `canAcknowledge`.
5. Test API tối thiểu:
   - `canReceiveAlerts=false, canAcknowledge=true`: POST acknowledge → 403; đọc lại state/version không đổi; không có `alert_actions` outcome `applied`.
   - `canReceiveAlerts=false, canResolve=true`: POST resolve → 403; state/version không đổi; không có action applied.
   - `canReceiveAlerts=true, canAcknowledge=true`: ack → 200, state acknowledged.
   - `canReceiveAlerts=true, canResolve=true`: resolve → 200, state resolved.
6. Test web: detail/list ẩn nút và hiện giải thích đúng khi thiếu `canReceiveAlerts` dù cờ action=true; trường hợp đủ quyền vẫn bấm được.
7. Chạy tối thiểu: API `incidents.spec.ts` + typecheck API; web `AlertDetailPage.test.tsx` + `AlertsPage.test.tsx` + typecheck web; chạy full API/web nếu thời gian cho phép. Không báo pass cho phần chưa chạy.

## Bàn giao

- Commit trên nhánh riêng, không merge master.
- Handoff ghi lệnh + kết quả thật, file/line đã sửa, test nào chạy/chưa chạy, DB/cổng riêng đã dùng.
- Không sửa hoặc đóng finding của reviewer khác.
