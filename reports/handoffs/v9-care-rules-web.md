# Handoff — V9.2 web preview cấu hình nhắc chủ động

Ngày 20/11/2026. Nhánh `v9-care-rules-web`, tách từ master sau backend `e405996`; commit `0ebf2f2`. **Chưa hợp nhất, chưa push; chờ người dùng chấp nhận 5 ảnh.**

## Đã làm

- `CareRulesSection.tsx`: section “Nhắc chủ động” chỉ render cho chủ hồ sơ, hai thẻ inactivity/care_digest.
- Bật/tắt, ngày trong tuần, khung giờ, số bước tối thiểu, thời gian chờ, giờ bản tin; lưu tạo version mới.
- Xem trước 7 ngày theo cấu hình **đã lưu**, không ghi; disclaimer rõ không phải dự đoán sức khỏe.
- Validate phía client (ngày, thứ tự giờ, giờ kết thúc + chờ ≤ 24:00) + lỗi server 422/500.
- `api.ts` thêm `fetchCareRule`/`updateCareRule`/`previewCareRule`; `query.ts` thêm key và invalidation.
- `CarePage` chỉ render section khi `isOwner`; caregiver không thấy và không gọi API.
- Test fixtures/handler care-rules trong `test/utils.tsx`; `CareRulesSection.test.tsx` 4 test; `CarePage.test.tsx` thêm assert caregiver.
- Script ảnh thủ công `apps/web/e2e/v9-care-rules-visual.mjs` + 5 ảnh/metrics.

## Bằng chứng

Chạy ngày 20/11/2026:

- `pnpm --filter @heart-iot/web exec vitest run` → **44 file / 390 test pass**.
- `pnpm --filter @heart-iot/web build` → pass.
- `pnpm --filter @heart-iot/web test:e2e` → **26/26 pass**.
- Ảnh `reports/qa/evidence/v9-care-rules/`: default 1280/390, preview 1280/390, digest 390; tất cả `overflow=0`, `h1=1`, `smallTargets=0` (đo button/link/label/input).
- API/Vite smoke: seed `.data/v9rules`; lưu bật inactivity qua UI → `version=1/source=database`; preview 7 ngày; ảnh chụp sau khi lưu.

## Giới hạn

- Chỉ Chromium; chưa Firefox/WebKit/screen reader; chưa kiểm người cao tuổi thật.
- Ảnh time input hiển thị 12h theo locale Chromium en-US; giá trị gửi vẫn `HH:MM`. Không sửa định dạng native input ở lát cắt này.
- Chưa E2E tự động đặt rule → scheduler gửi thông báo; scheduler đã có test backend.
- Chưa hợp nhất/push; chưa cập nhật trạng thái docs thành “đã hợp nhất”.

## File chính

- `apps/web/src/features/care/CareRulesSection.tsx`
- `apps/web/src/features/care/CareRulesSection.test.tsx`
- `apps/web/src/features/care/CarePage.tsx`
- `apps/web/src/features/care/api.ts`, `apps/web/src/lib/query.ts`
- `apps/web/src/features/care/care.css`
- `apps/web/e2e/v9-care-rules-visual.mjs`
- `reports/qa/evidence/v9-care-rules/`
