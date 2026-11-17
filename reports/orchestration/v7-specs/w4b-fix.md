# v7 W4b — đóng 2 P3 từ review độc lập

Bạn là worker **FIX**. Review W4 (`reports/qa/v7-w4-review.md`) kết luận không P1/P2, còn 2 P3 cần chốt. Không mở rộng scope.

## File được sửa

- `apps/web/src/features/alerts/AlertDetailPage.tsx` + `AlertDetailPage.test.tsx`
- `apps/web/src/features/studio/StudioViewDetailPage.tsx` + test của nó
- CSS feature tương ứng nếu cần (`alerts.css`, `studio.css`, `studio/studio.css`) — không sửa `components/*`, `styles/tokens|base|shell`, router.

## Việc

1. **P3-01 — ack ở chi tiết cảnh báo phải hỏi lại như danh sách.**
   - Hiện `AlertDetailPage.tsx:318-321` gọi `acknowledge.mutate()` ngay khi bấm “Tôi đang hỗ trợ”.
   - Làm giống `AlertsPage.tsx:395-410`: bấm lần 1 mở nhóm xác nhận (“Bạn đã liên hệ và đang hỗ trợ?” + “Có, tôi đang hỗ trợ” + Huỷ), chỉ POST khi xác nhận; giữ `expectedVersion`/CAS/409 và thông báo lỗi hiện có; Escape/Huỷ đóng nhóm, focus trở lại nút đầu.
   - Thêm test: 0 POST trước xác nhận, 1 POST đúng body sau xác nhận, 409 hiển thị đúng trạng thái.
2. **P3-02 — Studio subject-scope phải có dòng nhận diện hồ sơ.**
   - View scope `subject` (editor `/app/studio/:id`): thêm dòng **“Theo dõi: {tên}”** dùng primitive `SubjectContextLine`/pattern hiện có, **không select tự do** (pinned), đặt trên H1 hoặc ngay dưới H1 theo §3.3.
   - View scope global/account: không thêm dòng.
   - Test: 1 dòng context khi scope subject, 0 khi global; tên lấy từ API view config chứ không hard-code.
3. Không đổi API/contract/quyền; không đổi route.

## Cổng

- `pnpm --filter @heart-iot/web typecheck` exit 0.
- `pnpm --filter @heart-iot/web exec vitest run --no-file-parallelism --maxWorkers=1` — dán số file/test.
- `pnpm --filter @heart-iot/web build`.
- Ảnh Chromium cổng **4356** (API 3010/3011 của phiên khác có thể bận — dùng API 3012 + DB riêng trong worktree, `WEB_ORIGIN=http://127.0.0.1:4356`): `/app/alerts/<id>` 1280/390 và `/app/studio/<id>` 1280/390, chứng minh bước xác nhận và dòng “Theo dõi”. Ảnh lưu `reports/qa/evidence/v7-fix/`.
- Không sửa test để né hành vi; test diff ghi trong handoff.

## Bàn giao

Commit trên branch `v7-fix`, không merge/push. `reports/handoffs/v7-fix.md`: file đổi, test diff, ảnh, phần chưa kiểm, provider/model thật.
