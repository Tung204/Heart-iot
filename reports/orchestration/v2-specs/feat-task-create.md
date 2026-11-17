# Feature worker — feat-task-create

Bạn là **feature worker** trên worktree riêng, làm một phần dọc (API + UI + test), không làm cả sản phẩm.

Trước khi làm: đọc `AGENTS.md`, `docs/02`, `docs/03`, `docs/04`, `docs/06`, `docs/12`, `docs/14`, code liên quan, `git log -3`.
Chạy `pnpm install --prefer-offline --frozen-lockfile` và `pnpm --filter @annhien/contracts build` nếu worktree chưa có dependency/dist. HEAD đã có contract nền; không sửa contract ngoài file được giao, không sửa migration.

Quy tắc: chỉ sửa vùng được giao; **không** sửa `apps/api/src/app.module.ts`, `apps/web/src/app/router.tsx`, `apps/web/src/app/AppShell.tsx`, `apps/web/src/styles/layout.css`, `tokens.css`, README/docs/HTML hoặc package export — lead sẽ nối. Không sửa/xóa test hợp lệ để làm xanh; không bịa số liệu; không báo đã chạy nếu chưa chạy. Chạy test hẹp nhất + typecheck. Commit trên nhánh riêng, không merge master. Viết `reports/handoffs/v2-feat-task-create.md` với file, lệnh/kết quả, quyết định, rủi ro, việc lead cần nối. Kết thúc báo cáo ngắn: commit hash, test counts, file cần nối, điểm chưa làm.

## Mục tiêu
Chủ hồ sơ **tạo được việc bảo trì** cho thiết bị đã gắn, không chỉ xem/đóng.

## Vùng được sửa
- `packages/contracts/src/tasks.ts` (đã có `createTaskSchema`; chỉ dùng)
- `apps/api/src/maintenance/maintenance.service.ts`, `maintenance.controller.ts`, `maintenance.module.ts`
- `apps/api/test/task-create.spec.ts` (mới)
- `apps/web/src/features/tasks/TasksPage.tsx`, `apps/web/src/features/tasks/api.ts`, `TasksPage.test.tsx`, file css riêng nếu cần
- Không sửa app.module/router/layout.css.

## API
`POST /maintenance-tasks` body `createTaskSchema` → 201 `maintenanceTaskSummary`.
- Chỉ **chủ hồ sơ** được tạo (caregiver có link → 403; người ngoài → 404 để không lộ hồ sơ); admin không tạo thay chủ hồ sơ.
- `subjectId` phải tồn tại, chưa archive; `deviceId` phải đang được gán cho đúng hồ sơ (`device_assignments.endedAt IS NULL`), nếu không → 400 thông điệp rõ (không 500).
- `dueAt` nếu có phải ở tương lai (cho phép sai số 1 phút); `title` trim; `priority` 0..100; `notes` trim/rỗng → null.
- Sinh `dedupeKey` duy nhất `manual:<uuid>`; audit `maintenance_task.create` metadata kind/priority/deviceId (không chứa ghi chú sức khỏe).
- Trả đúng `maintenanceTaskSummarySchema`; task mới status `open`, `closedAt/closeReason` null.

## UI
- Nút "Tạo việc" chỉ hiện với chủ hồ sơ; mở form trong card/dialog (không dùng `window.prompt`).
- Chọn hồ sơ (nếu nhiều) → tải thiết bị đang gắn của hồ sơ; hồ sơ không có thiết bị hiện hint và disable submit.
- Trường: loại việc (select có nhãn tiếng Việt), tiêu đề, ưu tiên (0–100 giải thích), hạn (date, không bắt buộc), ghi chú; validate tại chỗ bằng contract schema.
- Submit thành công: đóng form, thông báo, invalidate danh sách; lỗi 400/403/404 hiển thị thân thiện, giữ dữ liệu form.
- Bàn phím/focus, 360/390/chữ lớn; không phá luồng đóng task hiện có.
- Test cũ phải giữ; thêm test owner/caregiver và validation.

## Kiểm thử tối thiểu
API: owner tạo thành công; caregiver 403; outsider 404; device không thuộc hồ sơ 400; hồ sơ archived 404; dueAt quá khứ 400; validation; audit; task xuất hiện trong list.
Web: owner thấy nút, caregiver không; mở/đóng form; không có thiết bị disable; submit gọi API; lỗi server giữ form; accessible label.
