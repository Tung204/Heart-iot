# Handoff V9.1 web — tổng hợp tuân thủ trên `/app/care`

Ngày: 20/11/2026. Nhánh: `v9-adherence-web`, tách từ master sau backend `2879ef4`. **Chưa hợp nhất, chưa push, chờ người dùng chấp nhận preview.** Phạm vi chỉ `apps/web` + ảnh/handoff; không sửa API/contracts.

## Đã làm

- `apps/web/src/features/care/api.ts`: `fetchCareAdherence(subjectId, 7|30)`, parse `careAdherenceSchema`.
- `apps/web/src/lib/query.ts`: `careAdherence(id, days)` và tiền tố `careAdherenceAll(id)`.
- `apps/web/src/features/care/useReminderCompletion.ts`: sau đánh dấu/hoàn tác, invalidate thêm tổng hợp (không optimistic cho dữ liệu tổng hợp).
- `CarePage.tsx`: chèn `CareAdherenceSection` giữa “Hôm nay” và “Lịch nhắc”; tạo/sửa/lưu trữ cũng invalidate tổng hợp + occurrence hôm nay.
- `CareAdherenceSection.tsx`:
  - chọn 7/30 ngày bằng `role="group"` + `aria-pressed`; giữ dữ liệu cũ khi đang tải (`placeholderData`) và `aria-busy`.
  - tổng `Đã làm · Bỏ qua · Chưa ghi nhận`; hai tỉ lệ tách biệt; `null` → `—`.
  - 7 ngày: 7 ô có thứ/ngày + `done/tổng` + nhãn chữ; ô 0 occurrence ghi “— / Không có lịch”.
  - 30 ngày: 5 nhóm 7 ngày, nhóm 0 occurrence ghi “Không có lịch trong tuần này”.
  - thẻ từng lịch 1 cột <720px, 2 cột ≥720px; pill “Đã lưu trữ”/“Đang tắt”; không nút sửa/xoá.
  - 403: câu quyền, không Thử lại; lỗi khác: `ErrorState` + Thử lại; empty: câu “Chưa có lịch nhắc trong 7/30 ngày” + nút tạo cho owner; loading: `PageLoader`.
  - câu giải thích “Chưa ghi nhận nghĩa là chưa có ai đánh dấu, không phải chưa làm.” một lần.
- `care.css`: style section/ngày/tuần/thẻ bằng token sẵn có; không thêm thư viện.
- Test: `CarePage.test.tsx` 9 → 17 test; `test/utils.tsx` thêm fixture 7/30 ngày + handler `onAdherence`; test cũ không đổi assertion.
- Script ảnh: `apps/web/e2e/v9-adherence-visual.mjs` (thủ công, không thuộc Playwright suite).

## Bằng chứng chạy thật (20/11/2026)

Từ repo root:

```text
pnpm build:contracts                              → pass
pnpm --filter @heart-iot/web typecheck            → pass
pnpm --filter @heart-iot/web exec vitest run \
  --no-file-parallelism --maxWorkers=1            → 43 file / 385 test pass (159,6 s)
pnpm --filter @heart-iot/web build                → pass (Vite)
pnpm --filter @heart-iot/web test:e2e             → 26/26 pass (9,3 s)
```

Smoke UI thật (API 3019 + PGlite `.data/v9web` seed + Vite 4366):

```text
node apps/web/e2e/v9-adherence-visual.mjs
→ 9 ảnh; overflow=0, h1=1, smallTargets=0 ở cả 9 ảnh
```

Ảnh tại `reports/qa/evidence/v9-adherence/`:

- `care-adherence-owner-1280.png`, `care-adherence-owner-390.png`
- `care-adherence-owner-30d-1280.png`, `care-adherence-owner-30d-390.png`
- `care-adherence-caregiver-1280.png`, `care-adherence-caregiver-390.png`
- `care-adherence-empty-390.png`
- `care-adherence-forbidden-390.png`
- `care-adherence-loading-390.png`
- `metrics.json`

Nguồn dữ liệu ảnh: owner/caregiver demo; một lịch “Đo huyết áp buổi sáng” được tạo + đánh dấu hôm trước + lưu trữ thật qua API để thấy pill; empty dùng tài khoản mới + hồ sơ trống; **403 được mô phỏng bằng route trả 403** (demo không có caregiver thiếu quyền); **loading được mô phỏng bằng delay 4 giây**. Không dùng ảnh để tuyên bố dữ liệu thật.

## Khác biệt / quyết định

- Giữ nguyên `canViewMeasurements` (D3 chưa chốt); chưa thêm `canViewCare`.
- Không đổi H1/nav/routeScope; không đụng trang Hôm nay.
- Không thêm E2E care vì suite hiện chỉ có smoke công khai, không có harness đăng nhập/API cho luồng `/app/care`; spec cho phép bỏ qua nếu không có chỗ. 26/26 smoke vẫn chạy.
- 30 ngày nhóm theo 7 ngày liên tiếp từ đầu cửa sổ, không theo tuần ISO; nhóm 0 occurrence dùng câu “Không có lịch” thay vì bảng 0.

## Chưa kiểm / giới hạn

- Chưa chạy Firefox/WebKit; chỉ Chromium.
- Chưa kiểm trình đọc màn hình thật (chỉ cấu trúc heading/region/aria-pressed/aria-busy).
- Chưa chấp nhận preview; **chưa merge/push**.
- Chưa kiểm với dữ liệu thật/PostgreSQL; ảnh dùng DB seed PGlite.
- Chưa có review độc lập cho quyền/ngày giờ (phần backend cũng đang chờ).
- Chưa chạy E2E có đăng nhập thật (không có harness).

## Việc tiếp theo

1. Người dùng xem 9 ảnh + thử `/app/care` trên nhánh; chấp nhận hoặc yêu cầu chỉnh.
2. Nếu chấp nhận: merge `v9-adherence-web` vào master, cập nhật docs trạng thái “đã hợp nhất”, push.
3. Sau đó chốt D3 trước V9.2 (quy tắc nhắc chủ động/bản tin).
