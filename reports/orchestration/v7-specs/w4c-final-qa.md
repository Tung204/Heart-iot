# v7 W4c — kiểm chốt các điều kiện còn lại sau review W4

Bạn là worker **QA độc lập**. Không sửa sản phẩm/test. Chỉ thêm báo cáo + ảnh + script trong `reports/qa/`.

Bối cảnh: `reports/qa/v7-w4-review.md` kết luận không P1/P2, còn 2 P3 (đã fix ở nhánh `v7-fix`, cần kiểm lại) và 3 phép kiểm chưa xong. Nhiệm vụ: chạy đúng 3 phép kiểm còn thiếu + xác nhận 2 P3 đã đóng.

## Môi trường

- Worktree riêng, web **4361**, API **3013**, PGlite `.data/final` (seed demo), `WEB_ORIGIN=http://127.0.0.1:4361`, `VITE_API_BASE_URL=http://127.0.0.1:3013/api/v1`.
- Chromium headless, locale `vi-VN`, timezone `Asia/Ho_Chi_Minh`; viewport 1280×900 và 390×844.
- Không dùng/chạm API hay DB của phiên khác; nếu cổng bận, đổi cổng và ghi rõ.

## Việc

1. **Đổi hồ sơ xoá thread + số liệu (điều kiện 1).** Tài khoản caregiver có ≥2 hồ sơ (seed): mở `/app/assistant`, gửi 1 câu hỏi cho hồ sơ A, xác nhận có câu trả lời; đổi sang hồ sơ B; kiểm: thread/câu hỏi biến mất, không còn số liệu/insight của A, context + quyền B đúng. Ghi network + ảnh trước/sau. Nếu không tái hiện được đường UI, ghi rõ “chưa kiểm được” + lý do.
2. **Studio publish 409 digest cũ (điều kiện 4).** Mở view subject-scope, preview để có digest; thay đổi draft (tab/API khác) làm digest cũ; bấm publish → phải nhận **409/APPROVAL_STALE**, không tạo publication mới, UI hiện thông báo tải lại/preview lại. Ảnh + response.
3. **Ma trận quyền caregiver (điều kiện 5).** Với caregiver receive-only (không `canViewMeasurements`) và caregiver measurement-only: mở `/app`, `/app/overview`, `/app/alerts`, `/app/history` ở 1280/390; kiểm 403/empty/error/offline (abort route)/stale (dữ liệu cũ) — không lộ số liệu ngoài quyền, không màn trắng, có thông báo đúng. Ghi từng tổ hợp.
4. **Xác nhận 2 P3 đã đóng.** `/app/alerts/:id` ack phải 2 bước (0 POST trước xác nhận, 1 POST sau, 409 đúng); `/app/studio/:id` subject-scope có đúng 1 dòng nhận diện hồ sơ, không select. Nếu fix chưa đạt, ghi finding kèm repro.

## Cổng

- `pnpm --filter @heart-iot/web typecheck`, vitest full, build, E2E 26/26 — tự chạy, dán số thật.
- Ảnh: `reports/qa/evidence/v7-final/` (đặt tên route-viewport-trạng-thái).
- Báo cáo `reports/qa/v7-final-qa.md`: bảng “điều kiện → cách kiểm → kết quả thật”, finding P1/P2/P3 (chỉ cái tái hiện được), mục “chưa kiểm”, kết luận v7 đóng được hay chưa. Viết tăng dần, không chờ cuối.
- Không sửa `apps/`, `packages/`, `tools/`; không merge/push.

## Bàn giao

Commit branch `v7-final-qa`, handoff `reports/handoffs/v7-final-qa.md` (provider/model thật, cổng, seed, phần chưa kiểm).
