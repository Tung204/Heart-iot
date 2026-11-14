# Prompt worker — fe-admin-ai (wave 4, sau fe-studio)

Bạn là worker frontend tiếp theo của An Nhiên, làm tiếp trong repo `C:/MyFolder/Hoc_Tap/project/DATN`.
Đọc prompt này rồi **thực thi ngay**.

## Bắt buộc đọc

1. `packages/contracts/src/{assistant,tasks,admin}.ts` — schema chính xác.
2. Controller tương ứng: `apps/api/src/{assistant,maintenance,admin}/*.controller.ts`.
3. `apps/web/src` hiện có: `app/router.tsx`, `AppShell.tsx`, `features/studio` (mẫu UI mới),
   `lib/api.ts`, `lib/query.ts`, `components/*`, `features/subjects/useSubjects`.
4. `docs/11-nen-tang-ai-va-cau-hinh-dong.md`, `docs/13-dac-ta-thuc-thi-ai-va-cau-hinh.md`
   (ranh giới AI: không chẩn đoán/kê đơn; preview trước publish).

## Vùng ghi

- `apps/web/src/features/assistant/**`, `features/tasks/**`, `features/admin/**`
- `apps/web/src/app/router.tsx`, `apps/web/src/app/AppShell.tsx`
- `apps/web/src/styles/layout.css` (chỉ thêm section mới ở cuối)
- `apps/web/src/**/*.test.tsx` cho 3 miền trên, `apps/web/README.md`
- `reports/handoffs/wave4-fe-admin-ai.md`

Không sửa API/contracts/package.json/tsconfig/vite/playwright config/docs/.env; không `git`/`pnpm add`.

## Phải làm

### 1. `/app/assistant` — Trợ lý (owner hoặc caregiver có `canViewAi`)

- Gọi `GET /subjects/:id/assistant/summary` (7 ngày mặc định). Hiển thị headline, sections/facts,
  `sources`, disclaimer; badge rõ **"Tóm tắt theo mẫu"** khi `status=degraded`/`provider=template`,
  "AI" khi provider openai-compatible; `degradedReason` bằng tiếng Việt dễ hiểu.
- Form hỏi đáp: textarea 3..500, gửi `POST /ask`; hiển thị answer + sources + disclaimer;
  429 → thông báo giới hạn tần suất + thử lại sau; lỗi mạng → thử lại.
- Không hiển thị HTML từ answer (chỉ text, giữ xuống dòng). Không thêm nút "chẩn đoán".
- Nếu không có quyền `canViewAi`: ẩn menu + trang thông báo không có quyền (không gọi API).
- Không có dữ liệu: nói "Chưa có đủ dữ liệu để tóm tắt", không bịa số.

### 2. `/app/tasks` — Công việc bảo trì

- `GET /maintenance-tasks?status=open` mặc định; lọc open/closed; phân trang `nextCursor`.
- Mỗi task: tiêu đề, thiết bị/hồ sơ, ưu tiên, hạn, ghi chú, trạng thái.
- Đóng task: bắt buộc lý do 3..500, xác nhận; 409 → tải lại; audit không hiển thị cho user.
- Empty/loading/error; owner thấy nút đóng, caregiver chỉ xem (không có endpoint đóng cho caregiver).

### 3. `/app/admin` — Quản trị (chỉ role admin)

- Nếu user không phải admin: hiển thị "Không có quyền" và không gọi API admin.
- Tổng quan: `GET /admin/overview` (users/subjects/devices/alerts/tasks/outbox).
- Người dùng: `GET /admin/users` (search, status), nút tạm khóa/kích hoạt với xác nhận +
  lý do; không cho tự khóa mình (API 409, UI disable nút).
- Policy `device_runtime`: hiển thị active + defaults; form sửa 5 trường số; nút **Xem trước**
  gọi `/previews` (hiện warnings + diff, không ghi), sau đó **Phát hành** gửi `expectedVersion`
  + value (không gửi digest; server tự tính) + note; 409 hiện version hiện tại + tải lại.
  Không có nút "rollback" trực tiếp: chọn history rồi phát hành lại giá trị cũ.
- Audit: `GET /admin/audit` với filter action/actor + cursor; bảng gọn, metadata JSON
  trong `<details>` (text, không render HTML).
- Không hiển thị hash/session/token.

### 4. Điều hướng

- Thêm mục "Trợ lý", "Công việc" cho mọi user có quyền phù hợp (ẩn nếu không có hồ sơ/quyền).
- Thêm mục "Quản trị" chỉ khi `user.role === 'admin'` (dùng `useAuth`).
- Giữ nguyên route hiện có; mobile bottom-nav không quá 6 mục (đưa mục ít dùng vào menu phụ).

## Chất lượng

- Dùng component/token hiện có; CSS mới thêm cuối `layout.css` hoặc file riêng import một lần.
- Loading/empty/error/401 (query client đã xử lý 401 toàn cục); không số 0 giả.
- Keyboard + focus visible; chữ lớn; 360px không tràn; bảng có overflow ngang.
- Không dùng màu làm tín hiệu duy nhất; disclaimer AI luôn hiển thị.

## Kiểm phải chạy

```bash
cd apps/web
pnpm typecheck
pnpm test
pnpm build
```

Test mới:
1. Assistant degraded hiện badge "Tóm tắt theo mẫu" + disclaimer; form hỏi gửi đúng body;
   429 hiện thông báo.
2. Tasks empty/closed; đóng thiếu lý do → lỗi field, không gọi API; 409 hiện tải lại.
3. Admin: non-admin không thấy menu/không gọi API; overview render; policy preview hiện warning;
   publish gửi expectedVersion; 409 stale hiện thông báo.
4. Nav ẩn/hiện theo role/quyền.

Nếu API/web đang chạy, chạy thêm Playwright thật cho login → assistant → tasks; nếu không, ghi
"chưa chạy", không bịa.

Ghi handoff với lệnh + kết quả thật. Kẹt >15 phút ở một lỗi thì dừng, ghi handoff trung thực.
