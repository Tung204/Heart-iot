# Handoff — v2 feat-task-create

- **Thời điểm:** 2026-11-15 (Asia/Ho_Chi_Minh)
- **Worker:** feature worker `feat-task-create`, nhánh `feat-task-create`
- **Commit code + test:** `8df36e1aaba5045d8aa0dc5098f2b8da190e0fc0`
  (`feat(tasks): chủ hồ sơ tạo việc bảo trì cho thiết bị đang gắn`)
- **Vùng ghi:** `apps/api/src/maintenance/{maintenance.service,maintenance.controller}.ts`,
  `apps/api/test/task-create.spec.ts`, `apps/web/src/features/tasks/{TasksPage.tsx,TasksPage.test.tsx,api.ts,tasks.css}`.
  Không sửa `packages/contracts`, migration, `app.module.ts`, `router.tsx`, `AppShell.tsx`,
  `layout.css`, `tokens.css`, README/docs/HTML, package export.

## Đã làm

### API — `POST /maintenance-tasks` → 201 `maintenanceTaskSummary`

- Body dùng đúng `createTaskSchema` có sẵn (không sửa contract); pipe trả 422 khi sai hợp đồng.
- **Quyền tạo:** dùng lại `AccessService.resolve`:
  - chủ hồ sơ → tạo được;
  - caregiver có link active → 403 (kể cả khi thiếu `canReceiveAlerts`);
  - người ngoài, admin không sở hữu hồ sơ, hồ sơ không tồn tại/đã archive → 404 (không lộ tồn tại);
  - admin **là** chủ hồ sơ thì tạo được với vai trò owner; admin không tạo thay chủ hồ sơ khác.
- **Thiết bị:** phải có `device_assignments` với `deviceId + subjectId` và `ended_at IS NULL`.
  Thiết bị của hồ sơ khác, thiết bị đã tháo, thiết bị chưa gắn, deviceId không tồn tại → **400**
  (`VALIDATION_FAILED`, `details.field = 'deviceId'`, message tiếng Việt rõ) — không 500.
- **`dueAt`:** nếu có phải `>= now - 60 giây` (sai số 1 phút); quá khứ hơn 1 phút → **400**
  (`details.field = 'dueAt'`).
- Giữ nguyên semantics contract: `title` trim 4..200, `priority` int 0..100, `notes` trim ≤2000.
  `notes` sau trim rỗng → lưu `null`.
- Lưu task mới: `status='open'`, `closedAt/closeReason` để null, `dedupeKey = manual:<uuid>`
  (unique index sẵn có), `subjectId`/`deviceId` đúng input.
- Audit `maintenance_task.create`, `targetType='maintenance_task'`, `targetId=task.id`,
  `metadata` **chỉ** `{ kind, priority, deviceId }` — không có title/notes/ghi chú sức khỏe.
- Trả `maintenanceTaskSummarySchema.parse(row)`; task xuất hiện ngay trong `GET /maintenance-tasks`
  của chủ hồ sơ và caregiver có `canReceiveAlerts`.
- `maintenance.module.ts` không cần đổi (controller/service đã được khai báo sẵn).

### Web — `/app/tasks`

- Nút **“Tạo việc”** chỉ render khi người dùng có ít nhất một hồ sơ `role='owner'`;
  caregiver chỉ xem không thấy nút. Nút là toggle (`aria-expanded`, `aria-controls`) và đổi nhãn
  “Đóng form tạo việc” khi form mở.
- Form nằm trong `Card` tại chỗ (repo chưa có hạ tầng dialog; không dùng `window.prompt`),
  `aria-label="Form tạo việc bảo trì"`, `noValidate` và validate bằng `createTaskSchema`.
- Chọn hồ sơ khi có >1 hồ sơ sở hữu → đổi hồ sơ sẽ tải lại `GET /subjects/:id/devices`
  (dùng lại `fetchSubjectDevices` + `queryKeys.subjectDevices`), tự chọn thiết bị đầu tiên còn gắn.
  Hồ sơ không có thiết bị → hint “Hồ sơ chưa gắn thiết bị”, disable submit. Lỗi tải thiết bị →
  Alert + nút “Thử lại”, disable submit.
- Trường: **loại việc** (select nhãn tiếng Việt: Bảo trì định kỳ / Kiểm tra tín hiệu / Kiểm tra pin /
  Kiểm tra thiết bị / Việc khác), **tiêu đề**, **ưu tiên 0–100** (giải thích “số càng cao càng được
  xếp trước”), **hạn xử lý** (date, không bắt buộc), **ghi chú** (không bắt buộc). Mọi trường có
  label thật; lỗi gắn `aria-invalid` + `aria-describedby`/`role="alert"`.
- Hạn date được đổi thành `23:59:59` **giờ địa phương của trình duyệt** rồi gửi ISO; bỏ trống thì
  không gửi `dueAt`.
- Submit thành công: đóng form, reset trường, thông báo “Đã tạo công việc …”, nếu đang lọc
  “Đã đóng” thì chuyển về “Đang mở”, invalidate tiền tố `['maintenance-tasks']`, trả focus về nút
  “Tạo việc”.
- Lỗi server: 400 hiển thị message rõ của server; 403/404 hiển thị thông điệp thân thiện cố định;
  form và dữ liệu đã nhập được giữ nguyên. `422` (ngoài form) hiển thị message của server.
- Bàn phím/focus: mở form focus vào ô Tiêu đề; `Escape` đóng form (trừ khi đang submit) và trả focus
  về nút mở; nút Hủy cũng trả focus.
- CSS riêng `tasks.css` (import trong `TasksPage.tsx`), chỉ dùng token sẵn có; mobile xếp dọc,
  ≥640px hai cột cho Ưu tiên/Hạn, ≥768px header ngang.
- Luồng đóng task hiện có giữ nguyên hành vi; chỉ mở rộng invalidate từ `list(filter)` sang tiền tố
  `tasksQueryKeys.all` để danh sách mọi bộ lọc đồng bộ sau tạo/đóng.

## Kiểm đã chạy (kết quả thật)

| Lệnh (từ thư mục gốc repo) | Kết quả |
| --- | --- |
| `pnpm install --prefer-offline --frozen-lockfile` | thành công, 711 package (worktree chưa có dependency) |
| `pnpm --filter @annhien/contracts build` | exit 0, sinh `packages/contracts/dist` |
| `pnpm --filter @annhien/api typecheck` | exit 0 |
| `pnpm --filter @annhien/web typecheck` | exit 0 |
| `cd apps/api && node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/task-create.spec.ts test/tasks.spec.ts` | **2 suite, 13/13 pass** (task-create 6, tasks 7) |
| `cd apps/api && pnpm test` | **15 suite, 106/106 pass** (~115 s, PGlite in-memory) |
| `cd apps/web && pnpm exec vitest run src/features/tasks/TasksPage.test.tsx` | **1 file, 10/10 pass** |
| `cd apps/web && pnpm test` | **20 file, 79/79 pass** |

Test API mới `apps/api/test/task-create.spec.ts` phủ: owner tạo thành công + trim/notes null/dedupeKey
`manual:` + audit metadata + task trong list; caregiver 403; người ngoài/admin 404; chưa đăng nhập 401;
4 kiểu thiết bị không hợp lệ → 400; hồ sơ archive → 404 và không tạo task; `dueAt` quá khứ → 400,
lệch 20 giây vẫn nhận; 6 case validation → 422 và không ghi task.

Test web mới phủ: owner thấy nút, caregiver không; mở/đóng form, focus tiêu đề và trả focus; label
đầy đủ cho cả 6 trường + option loại việc; chọn nhiều hồ sơ tải lại thiết bị; hồ sơ không thiết bị →
hint + disable submit; validation tiêu đề trống/ngắn không gọi API; submit gửi đúng body, đóng form,
thông báo, invalidate list; lỗi 400 rồi 403 giữ nguyên form + dữ liệu.

### Preview trình duyệt (script tạm, không commit)

Chạy Playwright với API mock (route intercept), Vite dev server riêng cổng 5217; file spec/config tạm
đã xóa sau khi chạy, không nằm trong commit:

- 1280×900, 390×844, 360×740: form mở, focus vào Tiêu đề, `Escape` đóng và trả focus về nút
  “Tạo việc”; `documentElement.scrollWidth - innerWidth <= 0` (không tràn ngang).
- 360×740 + chế độ **chữ lớn** (`an:text-size=large`): không tràn ngang.
- 360×740 cuộn cuối trang: nút submit và card cuối nằm trên thanh điều hướng dưới
  (`buttonBottom 205 < navTop 650`), không bị che.
- Ảnh chụp lưu tạm ngoài repo (thư mục Temp Windows), không phải artifact bàn giao.

## Quyết định

1. **400 cho lỗi nghiệp vụ thiết bị/hạn** bằng `new AppError('VALIDATION_FAILED', msg, 400, { field })`
   để giữ envelope lỗi chung; `ZodValidationPipe` vẫn trả 422 cho sai hợp đồng. Không thêm helper vào
   `common/` vì ngoài vùng giao.
2. **Admin không tạo thay:** dựa vào `AccessService.resolve` (chỉ trả owner/caregiver có link), không
   thêm nhánh admin. Admin đồng thời là chủ hồ sơ vẫn tạo được với tư cách owner.
3. **`notes` rỗng → null** ở service vì contract chỉ trim, không transform rỗng thành null.
4. **`dedupeKey` `manual:<randomUUID>`** theo yêu cầu; không thêm retry khi trùng unique (xác suất
   không đáng kể).
5. **Audit tối thiểu** đúng 3 khóa `kind/priority/deviceId`; không ghi `title`, `notes`, `subjectId`
   để tránh mang nội dung sức khỏe vào audit.
6. **UI form tại chỗ trong Card** thay vì dialog vì repo chưa có component dialog/focus-trap dùng
   chung; giữ thay đổi trong file được giao và không sửa `layout.css`.
7. **Date → 23:59:59 giờ trình duyệt**: đủ cho demo timezone `Asia/Ho_Chi_Minh`; không thêm thư viện
   timezone chỉ để đổi một trường.
8. **Invalidate tiền tố** `['maintenance-tasks']`: thêm `tasksQueryKeys.all`; không đổi key list hiện
   có nên test cũ không phải sửa.

## Impact map

| Nguồn quy tắc/đường gọi | Hành vi bị ảnh hưởng | Thay đổi / lý do | Bằng chứng | Trạng thái |
| --- | --- | --- | --- | --- |
| `MaintenanceController` | Thêm route `POST /maintenance-tasks` | Thêm handler; route GET/close giữ nguyên | Jest task-create T1–T6 | Đạt |
| `MaintenanceService` | Tạo task + audit + kiểm thiết bị/hạn | Thêm `createTask`; list/close không đổi | Jest task-create, tasks.spec | Đạt |
| `AccessService` | Quyền owner/caregiver/ngoài | Không đổi, dùng lại `resolve` | Jest T2/T4 | Đạt |
| `device_assignments` | Thiết bị phải đang gắn | Query `endedAt IS NULL`, không sửa schema/migration | Jest T3 | Đạt |
| `audit_logs` | Audit tạo việc | Thêm action text mới, không đổi schema | Jest T1 metadata | Đạt |
| `TasksPage` / `tasks/api.ts` | UI tạo việc + invalidate list | Thêm form/mutation; luồng đóng giữ nguyên | Vitest 10 test tasks, full web 79 | Đạt |
| `tasks/tasks.css` | Layout form responsive | File CSS mới theo feature | Playwright 360/390/1280/chữ lớn | Đạt |
| `app.module.ts`, `router.tsx`, `AppShell`, `layout.css` | Không cần đổi | Module/route đã nối sẵn; CSS riêng | `git diff` không chứa các file này | Không đổi |

## Rủi ro và giới hạn

- **Comment contract lệch hành vi:** `packages/contracts/src/tasks.ts` đang ghi “chủ hồ sơ/admin tạo”,
  trong khi yêu cầu và code chỉ cho chủ hồ sơ. Không sửa contract theo phạm vi; lead nên cập nhật
  comment khi rà hợp đồng.
- **Timezone của hạn:** date được hiểu là cuối ngày theo giờ trình duyệt, không theo `subject.timezone`.
  Với demo `Asia/Ho_Chi_Minh` và trình duyệt cùng múi giờ là đúng; nếu người dùng ở múi giờ khác, thời
  điểm hạn có thể lệch. Chưa thử múi giờ khác.
- **Preview trình duyệt dùng API mock**, không phải API thật + DB; phần API được kiểm riêng bằng Jest
  + PGlite. Chưa chạy E2E thật xuyên API/web trong lượt này.
- **Audit không nằm trong transaction với insert task** (theo pattern `closeTask` hiện có): nếu insert
  audit lỗi hiếm gặp, task đã tạo nhưng request trả 500. Không thêm transaction vì ngoài phạm vi và
  cần thay đổi cách service hiện có ghi audit.
- **Không retry khi `dedupeKey` trùng** (UUID gần như không xảy ra) và **không rate-limit** endpoint
  tạo việc; API hiện chưa có rate limit chung.
- UI chỉ hiện nút tạo khi tải được danh sách hồ sơ; lỗi tải `/subjects` thì không có lối tạo (trang
  vẫn báo lỗi danh sách công việc tương ứng). Không có màn hình quản trị tạo hộ (đúng yêu cầu).
- Chưa kiểm screen reader thật; mới kiểm label/focus/Escape/không tràn ngang bằng Playwright + Vitest.

## Việc lead cần nối / quyết

- **Không cần nối code:** `MaintenanceModule` đã có trong `apps/api/src/app.module.ts`; `TasksPage` đã
  có route `/app/tasks` trong `router.tsx`; CSS được import trong trang. Không sửa các file lead giữ.
- Cập nhật tài liệu nguồn khi hợp nhất: `docs/14` bảng API nhóm Bảo trì thêm `POST /maintenance-tasks`;
  `docs/06`/mô tả màn hình công việc nêu chủ hồ sơ tạo việc; sau đó sinh lại `docs/html` và chạy
  `--check` (worker không sửa docs/HTML theo phạm vi).
- Cân nhắc sửa comment `createTaskSchema` trong `packages/contracts/src/tasks.ts` cho khớp luật
  “chỉ chủ hồ sơ” (hiện ghi “chủ hồ sơ/admin”).
- Nếu muốn chốt timezone hạn theo hồ sơ, cần quyết định và bổ sung cách đổi local date → UTC theo
  IANA timezone (thư viện hoặc Temporal); hiện chưa làm.

## Tóm tắt cuối

- **Commit code + test:** `8df36e1aaba5045d8aa0dc5098f2b8da190e0fc0` (báo cáo này ở commit riêng trên
  cùng nhánh).
- **Test:** API 15 suite/106 test pass (mới 6 test tạo việc); web 20 file/79 test pass (TasksPage 10
  test, thêm 6 test tạo việc); typecheck API + web pass; preview Playwright 1280/390/360/chữ lớn không
  tràn ngang, focus/Escape đạt (script tạm, không commit).
- **File cần nối:** không có — module, route và CSS đã nối sẵn trong HEAD; lead chỉ cần rà diff, cập
  nhật docs/HTML và xử lý comment contract.
- **Chưa làm:** E2E thật xuyên API/web; chốt timezone hạn theo hồ sơ; kiểm screen reader thật.
