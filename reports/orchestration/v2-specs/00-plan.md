# Kế hoạch v2 — làm lại theo hướng nhiều phiên độc lập

## Mục tiêu

Không chấp nhận "test xanh là xong". Mỗi phần có người làm và người review khác nhau, trên worktree riêng.
Lead chỉ chốt phạm vi, tích hợp, kiểm bằng chứng và ghi quyết định.

## Nguyên tắc

1. Reviewer không sửa code; worker không tự review phần mình làm.
2. Mỗi phiên có worktree riêng, DB/port riêng nếu chạy API; không tin kết quả của phiên khác.
3. Mỗi finding phải có đường dẫn, tình huống tái hiện, lệnh/ảnh, expected/actual.
4. Không báo "đạt" cho phần chưa chạy; không đóng finding khi chưa có lần chạy lại.
5. Ưu tiên lỗi người dùng thấy, lỗi quyền/dữ liệu, lỗi khôi phục; sau đó mới polish.
6. Feature lớn phải có: user story, trạng thái trống/lỗi/quyền, test, docs, ảnh chụp.

## Sóng dự kiến

- Sóng A — review độc lập 8–10 phiên: UX người thân/người cao tuổi, visual/motion, accessibility,
  backend security, data integrity, performance, test gaps, requirements gaps, docs consistency.
- Sóng B — chốt backlog và làm foundation contracts/schema (1–2 phiên), sau đó feature workers.
- Sóng C — 6–10 feature/fix workers trên worktree riêng, mỗi phần có owner.
- Sóng D — reviewer mới cho từng feature + bug hunt tự do (6–10 phiên), fixer riêng.
- Sóng E — lead tích hợp, chạy cổng cuối, docs/HTML, worklog/Obsidian.

## Ứng viên feature v2 (chốt sau review)

- Cài đặt tài khoản: đổi tên, đổi mật khẩu, xem/thu hồi phiên đang đăng nhập.
- Xu hướng 7 ngày: tổng hợp nhịp tim/bước/độ phủ/cảnh báo, có nhãn thiếu dữ liệu.
- Liên hệ khẩn cấp của hồ sơ: CRUD, hiện ở chi tiết cảnh báo, `tel:` và quyền riêng tư.
- Tạo công việc bảo trì: owner/admin tạo, validate thiết bị/hồ sơ, audit.
- Motion/interaction: skeleton, page transition, toast, modal xác nhận, reduced-motion.
- Onboarding theo vai trò và empty state có hành động thực.

## Cổng cuối

- `pnpm -r typecheck`; API full test; web test/build; E2E; simulator; docs `--check`.
- Playwright thật ở 1280/390/360/chữ lớn, không tràn ngang; ảnh và console errors lưu bằng chứng.
- Mỗi feature có report review độc lập; finding P0/P1 đóng hoặc ghi rõ chưa đóng.
