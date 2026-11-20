# v9.1-WEB — tổng hợp tuân thủ trên trang Nhắc chăm sóc

> **Trạng thái 20/11/2026:** đã triển khai bản preview trên nhánh `v9-adherence-web` (chưa hợp nhất); bằng chứng ở `reports/handoffs/v9-adherence-web.md`. Backend đã hợp nhất master tại `2879ef4`.

Bạn là worker **frontend** (React 19 + Vite + TanStack Query). Backend v9.1 đã có contract/endpoint (xem `reports/orchestration/v9/backend-handoff.md`). Chỉ sửa `apps/web`; không sửa API/contracts.

Đọc: `reports/orchestration/v9/decisions.md`, `docs/14` mục 14 (V9.1), `apps/web/src/features/care/*`, `apps/web/src/features/care/CarePage.test.tsx`, `apps/web/src/lib/query.ts`, `apps/web/src/lib/format.ts`, `apps/web/src/components/primitives.css`, `apps/web/src/app/routeScope.ts`, ảnh `reports/qa/evidence/v8-care/`.

## 1. API client + query key

- Thêm vào `apps/web/src/features/care/api.ts`:
  ```ts
  fetchCareAdherence(subjectId: string, days: 7 | 30, signal?: AbortSignal): Promise<CareAdherence>
  ```
  Gọi `GET /subjects/:id/care/adherence?days=`, parse bằng `careAdherenceSchema`.
- `apps/web/src/lib/query.ts`: `careAdherence: (id, days) => ['subjects', id, 'care', 'adherence', days] as const`.
- `useReminderCompletion` (và mutation tạo/sửa/archive nếu có): invalidate thêm `careAdherence` để số liệu cập nhật ngay; không optimistic cho adherence (dữ liệu tổng hợp, tránh sai).
- Không gọi endpoint nếu không có `canViewMeasurements` (dùng cùng nguồn quyền/`status` như trang hiện tại); 403 là trạng thái quyền, không retry.

## 2. UI trên `/app/care`

Chèn **một section mới** giữa “Hôm nay” và “Danh sách lịch nhắc”:

```text
Tổng hợp 7 ngày gần đây            [7 ngày | 30 ngày]
Đã làm 12 · Bỏ qua 2 · Chưa ghi nhận 3
Ghi nhận 82% · Hoàn thành 75%      (null → “—”)
[7 ô ngày: T2 17/11 · 2/2] ...     (30 ngày: nhóm theo tuần)
────────────────────────────────
Từng lịch:
  Uống thuốc huyết áp (Thuốc)  [Đã lưu trữ]
  Đã làm 8 · Bỏ qua 1 · Chưa ghi nhận 2
  Ghi nhận 82% · Hoàn thành 89%
```

Quy tắc hiển thị:

- **Không** dùng “quên/không tuân thủ/nguy cơ”; chỉ “chưa ghi nhận”. Câu giải thích ngắn một lần: “Chưa ghi nhận nghĩa là chưa có ai đánh dấu, không phải chưa làm.”
- Tỉ lệ `null` hiển thị “—”, không phải 0%.
- 7 ngày: lưới 7 ô, mỗi ô có thứ/ngày + `done/tổng` kèm nhãn chữ; ô 0 occurrence ghi “—”, không tô màu cảnh báo. Không chỉ dùng màu để phân biệt trạng thái.
- 30 ngày: nhóm 5 tuần (tuần cuối có thể thiếu ngày) với tổng done/skipped/pending; không vẽ 30 ô chật ở 390px.
- Từng lịch: hiển thị dạng thẻ có nhãn (không cần bảng ngang), tối đa 2 cột ≥720px, 1 cột dưới. Lịch `archived` có pill “Đã lưu trữ” và vẫn hiện lịch sử; không có nút sửa/xoá.
- Range selector: `role="group"` + `aria-pressed` (không gọi là ARIA tabs), nút ≥44px; đổi range đổi query, giữ dữ liệu cũ trong lúc tải (`placeholderData`) và có `aria-busy`/skeleton nhẹ.
- Empty (không có lịch/không có occurrence trong kỳ): câu “Chưa có lịch nhắc trong 7 ngày” + nút tạo cho owner; không hiện bảng 0.
- Lỗi 500: `ErrorState` + Thử lại; 403: câu nghiệp vụ, không nút Thử lại.
- Không đổi H1, không thêm nav; link/entry hiện có giữ nguyên.
- CSS trong `care.css`, dùng token/primitive sẵn có; không thêm thư viện chart/date.

## 3. Test bắt buộc

Mở rộng `CarePage.test.tsx` + `test/utils.tsx` (handler adherence mặc định; không phá handler cũ):

1. Render đủ tổng, hai tỉ lệ, 7 ô ngày; `null` → “—”; pending ghi “Chưa ghi nhận”.
2. Đổi 7 → 30: gọi đúng `days=30`, hiện nhóm tuần, không tràn; đổi lại 7.
3. Đánh dấu done/skipped/hoàn tác → invalidate adherence (mock gọi lại) và số liệu cập nhật; optimistic completion cũ vẫn rollback đúng.
4. Lịch archive: pill “Đã lưu trữ”, không nút sửa/xoá, vẫn hiện số liệu.
5. Caregiver `canViewMeasurements`: xem tổng hợp, không nút tạo/sửa/xoá; người thiếu quyền: không gọi API tổng hợp, hiện câu quyền.
6. 403 → câu nghiệp vụ, 0 retry; 500 → ErrorState + Thử lại gọi lại.
7. Empty state; loading skeleton; accessibility: section có `aria-labelledby`, nút range có `aria-pressed`, target ≥44, không chỉ dùng màu.
8. `routeScope` không đổi (không thêm test nếu không sửa).

## 4. Cổng

```bash
pnpm build:contracts
pnpm --filter @heart-iot/web typecheck
pnpm --filter @heart-iot/web exec vitest run --no-file-parallelism --maxWorkers=1
pnpm --filter @heart-iot/web build
pnpm --filter @heart-iot/web test:e2e
```

- E2E: thêm/chỉnh một luồng “đánh dấu hôm nay → tổng hợp đổi” nếu suite hiện có chỗ; không skip/retry.
- Chạy API 3019 + DB `.data/v9web` (seed), web **4366**, `WEB_ORIGIN=http://127.0.0.1:4366`, `VITE_API_BASE_URL=http://127.0.0.1:3019/api/v1`.
- Ảnh Chromium vào `reports/qa/evidence/v9-adherence/`: `/app/care` 1280/390 (owner, caregiver), range 30, empty, 403; tối thiểu 8 ảnh. Đo: 0 tràn ngang, 1 H1, target ≥44, phần tổng hợp không che bottom-nav.

## 5. Bàn giao

Commit branch `v9-adherence-web` (từ master sau backend), **không merge/push**. `reports/handoffs/v9-adherence-web.md`: file đổi, test diff, ảnh, phần chưa kiểm (Firefox/WebKit, screen reader, dữ liệu thật), provider/model.

## 6. Ngoài phạm vi

- Quy tắc nhắc chủ động/bản tin (V9.2), Web Push, AI.
- Đổi quyền chia sẻ (`canViewCare`), nav, trang Hôm nay (giữ thẻ nhắc hiện có).
- In PDF/phiếu đi khám (đã có ở v8).
