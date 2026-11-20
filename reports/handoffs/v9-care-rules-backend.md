# Handoff — V9.2b quy tắc chăm sóc chủ động (backend)

Ngày 20/11/2026. Phạm vi: scheduler, cấu hình quy tắc, nhắc sinh hoạt và bản tin cuối ngày. **Chưa có UI cấu hình**; web preview làm ở lát cắt sau. Không tạo incident, không Web Push, không AI.

## Đã làm

- Contract `@heart-iot/contracts/care-rules`: config `inactivity`/`care_digest`, view có version/source, preview 7 ngày.
- Bảng `subject_rules` (version, partial unique một active) và `job_runs` (unique job/run key); migration `apps/api/drizzle/0005_blue_polaris.sql`.
- API:
  - `GET/PUT /subjects/:id/care-rules/:kind` — chỉ chủ hồ sơ;
  - `POST /subjects/:id/care-rules/:kind/previews` — chỉ đọc, 7 ngày, disclaimer;
  - `PUT` tạo version mới trong transaction, khóa hồ sơ, audit `care_rule.update`.
- Scheduler `CareSchedulerService`: tick 60 giây, `runOnce(now)` cho test; `job_runs` chống chạy lại cùng phút.
- Quy tắc `inactivity`: đúng thứ/khung giờ + grace, assignment mở, device active + `lastSeenAt` trong ngưỡng offline, có mẫu, mẫu cuối không `not_worn`, tổng bước delta < `minSteps`; skip có audit một lần/ngày/lý do.
- Bản tin `care_digest`: template xác định từ `RemindersService.dayForSubject` + `MeasurementsService.dailySummary` + incident đang mở; ghi rõ dữ liệu thiếu/mô phỏng.
- Outbox care: `incident_id=null`, `kind=care_rule|care_digest`, `title/body`, dedupe theo ngày/người nhận; worker hiện có kiểm quyền lại, mất quyền → superseded.
- D3 chốt dùng lại `canViewMeasurements`, không thêm `canViewCare` trong V9.

## Bằng chứng

Chạy ngày 20/11/2026:

- `pnpm --filter @heart-iot/api test` → **273 test / 27 suite pass** (thêm 12 test: care-rules 4, care-scheduler 4, care-rule-schedule 4).
- `pnpm --filter @heart-iot/api typecheck` → pass.
- `pnpm -r typecheck` → pass.
- `pnpm --filter @heart-iot/api build` → pass.
- Smoke DB mới `.data/v9care`: seed `subjects=2`, `telemetry=1681`, `outbox=2`; `GET` rule mặc định `enabled=false/version=0`; `PUT` → version 1, `source=database`; `POST preview` → 7 ngày, dòng đầu `applies=true`, không ghi thêm.
- Scheduler test: gửi owner + caregiver, chạy lại cùng/khác phút không nhân đôi; offline/not_worn/no_data/enough_steps đều không gửi và có audit; digest template; thu hồi quyền giữa chờ → caregiver `superseded`; không tạo incident.

## Sai lệch / giới hạn

- Giả định **một tiến trình**; `job_runs` chỉ chống trùng theo phút trong cùng DB, chưa có advisory lock cho nhiều instance.
- `job_runs` tăng mỗi phút, chưa có job dọn dẹp.
- Chưa có web UI; chưa có E2E đặt quy tắc → nhận bản tin.
- Ngưỡng là ví dụ do người dùng đặt, mặc định tắt, không phải ngưỡng y khoa; nội dung là template, chưa dùng AI.
- Chưa chạy PostgreSQL thật/CI; chưa kiểm DST cho scheduler (hàm ngày/giờ đã có test timezone cơ bản).
- Bản tin dùng `dailySummary` của chủ hồ sơ; không thay đổi quyền xem dữ liệu.

## File chính

- `packages/contracts/src/care-rules.ts`
- `apps/api/src/care-rules/care-rule-schedule.ts`
- `apps/api/src/care-rules/care-rules.service.ts`
- `apps/api/src/care-rules/care-rules.controller.ts`
- `apps/api/src/care-rules/care-scheduler.service.ts`
- `apps/api/drizzle/0005_blue_polaris.sql`
- `apps/api/test/care-rules.spec.ts`, `care-scheduler.spec.ts`, `care-rule-schedule.spec.ts`
