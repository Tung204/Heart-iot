# Fix worker — cửa sổ chia sẻ cho lịch sử, cảnh báo, trợ lý

Bạn là worker sửa lỗi trên worktree riêng. Đọc `AGENTS.md`, báo cáo `reports/qa/v2-caregiver-journey.md` P1-1/P2-2/P2-3, `reports/qa/v2-owner-journey.md` P1-1/P1-2 (phần incidents/assistant/history), `docs/02` FR-02/FR-05, `docs/04`, `docs/06`, code access/history/alerts/assistant.

Chỉ sửa: `apps/api/src/incidents/incidents.service.ts`, `apps/api/src/assistant/assistant.service.ts`, `packages/contracts/src/incidents.ts` (chỉ thêm field tối thiểu nếu cần), `apps/api/test/incidents.spec.ts`, `assistant.spec.ts`; web `apps/web/src/features/history/HistoryPage.tsx`, `apps/web/src/lib/format.ts` + tests history; có thể `AlertDetailPage.tsx`/`AlertsPage.tsx` để hiện nhãn “bắt đầu trước khi bạn được chia sẻ”. **Không** sửa measurements.service, devices.service, notifications, app.module/router/layout.css. Cài dependency/build contracts; test incidents+assistant+history, typecheck.

Yêu cầu:
- Helper dùng `AccessService.requireHistory` / `effectiveFrom`; owner bỏ qua.
- `listAlerts` caregiver: ẩn incident **đã đóng/hủy/unconfirmed** có `detectedAt < effectiveFrom`; **giữ** incident open/acknowledged đang hoạt động (an toàn hiện tại) nhưng đánh dấu rõ `startedBeforeShare` (field optional) để UI hiện “Bắt đầu trước khi bạn được chia sẻ quyền — vẫn đang mở”.
- `getAlert` caregiver: closed trước mốc → 403 kèm `details.effectiveFrom`; open trước mốc → 200 + cờ; không lộ resolutionReason của incident đóng trước share.
- Assistant `ask`: dùng `effectiveFrom` thay `now-7d`; không 403 chỉ vì mốc share mới; nếu không đủ dữ liệu trả lời trung thực (không bịa); summary giữ nguyên hành vi đúng.
- Web History: `from` luôn `max(now - range, sharedFrom)` khi caregiver; nút range không xem được bị disable kèm giải thích; CSV dùng cùng khoảng; không gửi from sớm hơn sharedFrom. Dùng `SubjectSummary.sharedFrom`.
- UI alerts/detail hiện nhãn beforeShare nếu API trả; không đổi câu chữ test cũ nếu không cần.
- Test API: caregiver historyDays=1 không thấy closed cũ, open cũ vẫn thấy/cờ, detail closed 403/open 200; owner thấy tất cả; assistant không 403. Web: sharedFrom giữa 24h clamp; nút disable.
- Handoff `reports/handoffs/v2-fix-caregiver-window.md`; commit nhánh riêng. Báo commit hash, test counts, quyết định open-incident, file lead cần nối.
