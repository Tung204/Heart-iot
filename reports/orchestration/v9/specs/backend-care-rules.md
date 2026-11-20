# v9.2b — quy tắc chăm sóc chủ động + scheduler (backend)

Ngày 20/11/2026. **Trạng thái: đã triển khai backend, chờ web preview.** Phạm vi: `subject_rules`, `job_runs`, scheduler một tiến trình, quy tắc `inactivity` và bản tin `care_digest`; chưa có UI cấu hình. Không tạo incident, không Web Push, không AI.

## Quyết định D3

Chốt dùng lại `canViewMeasurements` cho quy tắc/bản tin chăm sóc trong V9; **không thêm `canViewCare`** ở lát cắt này. Người nhận là chủ hồ sơ + care link active còn `canViewMeasurements`, kiểm lại ở worker. Nếu sau này tách `canViewCare`, đổi `recipients()` + notification helper cùng lúc.

## Dữ liệu

- `subject_rules`: `subject_id`, `kind` (`inactivity|care_digest`), `version`, `config jsonb`, `active`, `created_by_user_id`, `created_at`; unique `(subject, kind, version)`, partial unique một bản active.
- `job_runs`: `job_key`, `run_key`, `started_at`, `finished_at`, `outcome`, `counters`; unique `(job_key, run_key)`.
- Migration `0005_blue_polaris.sql`, không backfill dữ liệu nghiệp vụ; rule mặc định không tồn tại = tắt.

## Contract/API

- Contract `@heart-iot/contracts/care-rules`: config inactivity/digest, view có version/source, preview 7 ngày.
- `GET/PUT /subjects/:id/care-rules/:kind` — chỉ chủ hồ sơ; `PUT` tạo version mới trong transaction, khóa hồ sơ.
- `POST /subjects/:id/care-rules/:kind/previews` — chỉ đọc, trả lịch kiểm tra 7 ngày + disclaimer, không ghi.
- Không có endpoint xóa; tắt bằng `enabled:false`.

## Scheduler

- `CareSchedulerService` tick 60 giây, `NODE_ENV=test` không chạy; `runOnce(now)` cho test.
- `job_runs.run_key` theo phút; chạy lại cùng phút = skipped. Chạy phút sau vẫn không nhân đôi nhờ `dedupe_key`.
- Chỉ xử lý hồ sơ chưa lưu trữ, rule active; chủ hồ sơ phải active.
- Inactivity: đúng thứ, trong `[windowEnd, windowEnd+grace]`; có assignment mở + device active; `lastSeenAt` trong `offlineAfterSeconds`; có mẫu trong khung; mẫu cuối không `not_worn`; tổng bước theo delta < `minSteps`. Thiếu dữ liệu/offline/not_worn/đủ bước → audit `care_rule.skipped` một lần/ngày/lý do, không gửi.
- Digest: tới `time` theo timezone; dùng `RemindersService.dayForSubject` (chỉ việc đã tới giờ) + `MeasurementsService.dailySummary(owner, date, now)` + đếm incident `open|acknowledged`; template xác định, ghi rõ dữ liệu thiếu/mô phỏng.
- Ghi outbox `kind=care_rule|care_digest`, `incident_id=null`, `title/body`; dedupe `care:{subjectId}:{date}:{recipient}:in_app:{kind}`. Worker hiện có kiểm lại quyền, gửi qua SSE/inbox; mất quyền → superseded.

## Kiểm

- Hàm thuần: múi giờ/khung grace, preview 7 ngày, cộng bước bỏ reset/gap.
- API: mặc định tắt; owner 200, caregiver 403, ngoài 404; version tăng, một active; 422 không tạo version; preview không ghi.
- Scheduler: gửi đúng owner+caregiver; chạy lại không nhân đôi; offline/not_worn/không mẫu/đủ bước không gửi + audit; digest template; thu hồi quyền giữa chờ → superseded; không tạo incident.
- Chưa kiểm: PostgreSQL thật, nhiều instance, job lỗi/retry dài, UI.

## Giới hạn

- Giả định một tiến trình; chưa có advisory lock. `job_runs` chỉ chống trùng theo phút trong cùng DB.
- `job_runs` không có job dọn dẹp; bảng tăng mỗi phút khi scheduler chạy.
- Chưa có UI cấu hình; chưa có E2E đặt rule → nhận bản tin.
- Digest/inactivity là template mặc định, chưa phải nội dung y khoa/AI; ngưỡng do người dùng đặt và mặc định tắt.
