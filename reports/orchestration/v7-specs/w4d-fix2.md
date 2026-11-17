# v7 W4d — sửa 3 P3 quyền từ QA chốt

Bạn là worker **FIX**. Nguồn: `reports/qa/v7-final-qa.md` §7. Chỉ sửa 3 P3 dưới, không mở rộng.

## File được sửa

- `apps/web/src/app/AppShell.tsx` (+ `AppShell.test.tsx`)
- `apps/web/src/features/dashboard/DashboardPage.tsx` (+ test)
- CSS feature nếu cần (không sửa token/base/shell).

## Việc

1. **P3-03 — không mở SSE khi hồ sơ không có quyền nhận cảnh báo.**
   - `AppShell.tsx:499` đang `useSubjectEvents(activeSubject?.id ?? null, …)` cho mọi hồ sơ. Chỉ truyền id khi người xem là owner hoặc `permissions.canReceiveAlerts === true`; ngược lại truyền `null` (không EventSource, không banner “Mất cập nhật trực tiếp”).
   - Test: caregiver `canReceiveAlerts=false` → 0 request `/events`, không banner; caregiver có quyền → vẫn mở như cũ.
2. **P3-04 — `/app/overview` không gọi `/alerts` khi thiếu quyền.**
   - Thêm `canReceiveAlerts` (owner hoặc permission true) và `enabled: Boolean(subjectId) && canReceiveAlerts` cho `openAlerts`.
   - Khi không có quyền: vùng “Cảnh báo đang mở” hiện câu nghiệp vụ (ví dụ “Chủ hồ sơ không chia sẻ cảnh báo với bạn.”), **không** nút Thử lại, **không** link “Xem tất cả cảnh báo”; không gọi API. Các vùng số đo vẫn như cũ.
   - Test: measurement-only → 0 request `/alerts`, có câu quyền; owner → query chạy bình thường.
3. **P3-05 — copy kết nối thiết bị khi mốc bị ẩn theo quyền.**
   - Trong `DashboardPage.tsx` (~dòng 405-411): nếu `device.healthDataVisible === false` và `lastSeenAt` null → ghi “mốc kết nối ẩn theo quyền chia sẻ” (không nói “chưa từng kết nối”); nếu `healthDataVisible !== false` và null → giữ “chưa từng kết nối”.
   - Không đổi API/contract; không đổi pill freshness.
   - Test: device `healthDataVisible=false`, `lastSeenAt=null`, freshness live → copy ẩn theo quyền, không có “chưa từng kết nối”; device bình thường null → giữ copy cũ.

## Cổng

- `pnpm --filter @heart-iot/web typecheck` exit 0.
- vitest full (`--no-file-parallelism --maxWorkers=1`) — dán số file/test.
- `pnpm --filter @heart-iot/web build`.
- E2E 26/26.
- Ảnh Chromium 4362 (API 3014 + DB riêng, `WEB_ORIGIN=http://127.0.0.1:4362`): measurement-only `/app` và `/app/overview` 1280/390 (không banner SSE, câu quyền cảnh báo), receive-only `/app/overview` (copy kết nối). Ảnh vào `reports/qa/evidence/v7-fix2/`.

## Bàn giao

Commit branch `v7-fix2`, không merge/push. `reports/handoffs/v7-fix2.md`: file đổi, test diff, ảnh, chưa kiểm, provider/model thật.
