# Handoff — wave4-fe-admin-ai

- **Thời điểm:** 2026-11-15 (Asia/Ho_Chi_Minh), sau wave 3 fe-studio
- **Worker:** fe-admin-ai
- **Vùng ghi:** `apps/web/src/features/{assistant,tasks,admin}/**`, `apps/web/src/app/router.tsx`,
  `apps/web/src/app/AppShell.tsx`, `apps/web/src/styles/layout.css` (chỉ thêm section cuối),
  `apps/web/src/**/*.test.tsx` cho 3 miền trên, `apps/web/README.md`, file này.
  Không sửa API/contracts/package.json/tsconfig/vite/playwright config/docs/.env; không git/pnpm add.

## Đã làm

### `features/assistant/` — `/app/assistant`

- `api.ts` (parse qua `@annhien/contracts/assistant`), `AssistantPage.tsx`:
  - Tóm tắt 7 ngày mặc định qua `GET /subjects/:id/assistant/summary`: headline, sections/facts,
    sources, disclaimer luôn hiển thị; badge **"Tóm tắt theo mẫu"** khi `status=degraded` hoặc
    `provider=template`, **"AI"** khi openai-compatible; `degradedReason` hiển thị nguyên văn tiếng Việt.
  - Không có mẫu đo trong khoảng → thông báo "Chưa có đủ dữ liệu để tóm tắt", không bịa số.
  - Form hỏi đáp 3..500 (validate client bằng `assistantAskSchema`, lỗi tại field, không gửi);
    429 `RATE_LIMITED` → thông báo giới hạn + thử lại sau; lỗi mạng → nút thử lại qua ErrorState/Alert.
  - Chỉ gọi API khi hồ sơ đang chọn có `role=owner` hoặc `permissions.canViewAi`; ngược lại trang
    thông báo quyền và **không gọi API** (có test đếm số lần gọi = 0). Nav cũng ẩn theo quyền này.
  - Answer/summary render text thuần (`white-space: pre-line`), không có HTML/không có nút chẩn đoán.

### `features/tasks/` — `/app/tasks`

- `api.ts`, `TasksPage.tsx`: `GET /maintenance-tasks?status=open` mặc định, lọc open/closed
  (2 nút aria-pressed), phân trang cursor bằng `useInfiniteQuery` + nút "Tải thêm".
  Mỗi task hiện: tiêu đề, trạng thái, ưu tiên, hồ sơ (tên từ danh sách hồ sơ), thiết bị (id rút gọn
  vì hợp đồng task không có tên thiết bị), hạn, ghi chú, lý do đóng khi đã đóng.
- Đóng task: lý do 3..500 bắt buộc (validate `closeTaskSchema`, lỗi tại field, không gọi API),
  xác nhận hai bước; 409 → "Công việc đã thay đổi" + nút tải lại, không tự gửi lại.
  Chủ hồ sơ (`role=owner`) và admin thấy nút đóng; caregiver chỉ xem (pill "Chỉ xem").
  Audit không hiển thị cho user (không có UI audit ở trang này).

### `features/admin/` — `/app/admin` (chỉ admin)

- `api.ts`, `AdminPage.tsx` với 4 tab (role=tablist, aria-selected):
  - **Tổng quan**: 9 ô số liệu từ `GET /admin/overview`.
  - **Người dùng**: tìm theo email/tên + lọc status + cursor; tạm khóa/kích hoạt có xác nhận +
    lý do bắt buộc (1..500); không cho tự khóa mình (hiện ghi chú, không hiện nút; API 409 vẫn là
    lớp chặn thật); PATCH `{status, reason}`.
  - **Policy `device_runtime`**: active + defaults + lịch sử; form 5 trường số (validate
    `policyValueSchema` client, lỗi kèm min/max); **Xem trước** → `POST .../previews` hiện warnings +
    effectiveDiff (chỉ đọc, không ghi); **Phát hành** → `PUT` gửi `{value, expectedVersion, note?}`
    (không gửi digest); 409 `APPROVAL_STALE` → hiện version hiện tại + nút tải lại. Không có nút
    rollback trực tiếp: lịch sử hiển thị + nút "Điền giá trị mặc định" + giải thích nhập lại giá trị
    cũ rồi phát hành bản mới (lịch sử API không trả giá trị phiên bản cũ — ghi rõ cho người dùng).
  - **Audit**: lọc theo action (text) + actor (select từ danh sách người dùng) + cursor; bảng gọn;
    metadata JSON trong `<details><pre>` (text thuần). Không hiển thị hash/session/token (backend
    không trả, UI không thêm).

### Điều hướng

- `router.tsx`: thêm `assistant`, `tasks`, `admin`; giữ nguyên route khác.
- `AppShell.tsx`: nav gồm **6 mục chính** (Tổng quan, Lịch sử, Cảnh báo, Thiết bị, Thông báo, Hồ sơ)
  + menu phụ **"Thêm"** (disclosure có aria-expanded, đóng khi chọn): Trợ lý (owner/canViewAi),
  Công việc (owner/canReceiveAlerts hoặc admin), Studio (owner/admin — quy tắc wave 3), Quản trị
  (chỉ admin). Mobile bottom-nav không quá 6 mục; desktop sidebar dùng cùng menu phụ.

### CSS

- `styles/layout.css`: thêm section cuối "Wave 4 fe-admin-ai" (menu phụ nav, ai-*, task-*, adm-*),
  dùng token hiện có; bảng admin có overflow-x; 360px không tràn (wrap + min-width bảng + cuộn ngang).

## Kiểm đã chạy (kết quả thật)

| Lệnh (thư mục `apps/web`) | Kết quả |
| --- | --- |
| `pnpm typecheck` | exit 0 |
| `pnpm test` (3 miền + nav) | 17 test mới pass; toàn bộ **19 files, 72/72 pass** |
| `pnpm build` | exit 0 (cảnh báo chunk >500 kB có từ trước) |
| `pnpm test:e2e` (suite hiện có) | 4/4 pass |
| Playwright thật (login → assistant → tasks → admin, API 3000 + web 5173 đang chạy, seed demo) | pass — chi tiết bên dưới |

Kịch bản trình duyệt thật (headless Chromium qua @playwright/test, không commit spec):
- Login `ba-an@demo.annhien.local` → `/app/assistant`: badge **"Tóm tắt theo mẫu"** (AI chưa cấu hình
  → template), headline thật ("1697 mẫu đo, nhịp tim trung bình 68.4 bpm…"); hỏi đáp trả lời theo mẫu
  "Trợ lý AI hiện chưa sẵn sàng…" kèm badge mẫu.
- `/app/tasks`: 1 công việc seed "Kiểm tra tín hiệu vòng đeo tay tại nhà" hiển thị.
- Login admin (`demo-admin-2026`) → `/app/admin`: 9 ô số liệu tổng quan.
- Login user thường → `/app/admin`: hiển thị "Không có quyền truy cập".
- Menu phụ: owner thấy Trợ lý/Công việc/Studio (không Quản trị); admin thấy Công việc/Studio/Quản trị
  (không Trợ lý vì admin không có hồ sơ canViewAi — đúng quy tắc).

## Chưa làm / giới hạn

- Không có spec Playwright mới commit vào repo (prompt yêu cầu "chạy", đã chạy script thật ngoài repo).
- Admin: actor filter của audit lấy từ trang đầu danh sách người dùng (limit 100) — actor ngoài 100
  người dùng đầu không chọn được qua UI (vẫn lọc được bằng cách nhập thẳng action/target).
- Policy "rollback về giá trị cũ": API lịch sử không trả `value` của bản cũ nên UI chỉ đưa đường nhập
  lại thủ công + giá trị mặc định; không dựng giá trị cũ từ phía client.
- Task hiển thị id thiết bị rút gọn (hợp đồng `maintenanceTaskSummarySchema` không có label/serial
  thiết bị); tên hồ sơ map từ danh sách `/subjects` — hồ sơ đã mất quyền hiện "Hồ sơ đã bị thu hồi quyền".

## Rủi ro tích hợp

1. `maintenanceTaskQuerySchema.limit` có `default(20)` ở server nhưng là **bắt buộc** khi parse
   response query? Client luôn gửi `limit` tường minh nên không phụ thuộc default.
2. Admin là người có hồ sơ chia sẻ vẫn không thấy mục Trợ lý nếu không có hồ sơ nào `canViewAi` —
   đúng backend (`view_ai` theo hồ sơ, không theo role admin).
3. Menu phụ "Thêm" hiện ở cả sidebar và bottom-nav (cùng state) — nếu lead muốn sidebar hiển thị
   phẳng tất cả mục thì chỉ cần bỏ menu phụ ở sidebar, không đổi logic quyền.
4. `useActiveSubject` fallback về hồ sơ đầu tiên: nếu hồ sơ đầu không có `canViewAi`, trang Trợ lý
   hiện thông báo chọn hồ sơ khác (đúng yêu cầu "không gọi API").

## Bước tiếp theo gợi ý (chưa cam kết)

- Lead chốt có cần spec Playwright chính thức cho luồng login → assistant → tasks/admin hay không.
- Nếu muốn rollback policy trọn vẹn, cần API trả `value` trong lịch sử policy (phía be-admin).
