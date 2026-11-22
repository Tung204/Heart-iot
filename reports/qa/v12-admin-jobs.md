# Quan sát job nền admin — bằng chứng

**Ngày:** 21/11/2026  
**Nhánh:** `v10-backend` (chưa merge/push)  
**Phạm vi:** backend only; không sửa UI.

## Đã làm

- Thêm `GET /admin/jobs` (admin-only) trả danh sách cố định 3 job:
  - `alert_escalation` — chu kỳ kỳ vọng 60 giây, ngưỡng stale 120 giây.
  - `care_scheduler` — chu kỳ kỳ vọng 60 giây, ngưỡng stale 120 giây.
  - `retention` — chu kỳ kỳ vọng 1 giờ, ngưỡng stale 2 giờ.
- Mỗi job trả:
  - `lastRun` (runKey, outcome, startedAt, finishedAt, counters vận hành);
  - `lastSuccessAt`, `lastFailureAt`;
  - `lastRunAgeSeconds`, `status` (`ok|failed|stale|never`).
- Chỉ đọc `job_runs`; **không** chạy lại job, không tạo `job_runs`, không ghi audit.
- Không trả nội dung sức khỏe, email, tên người dùng hay payload nghiệp vụ; chỉ counter vận hành.
- Không thêm migration: dùng bảng `job_runs` đã có.

## Hợp đồng

`packages/contracts/src/admin.ts`:

- `adminJobKeySchema`
- `adminJobRunSchema`
- `adminJobHealthStatusSchema`
- `adminJobHealthSchema`
- `adminJobsSchema`

`jobs` có đúng 3 phần tử; `status=never` không đồng nghĩa lỗi vì job có thể đang tắt (retention mặc định tắt).

## Test

| Kiểm | Kết quả |
| --- | --- |
| `backend/test/admin.spec.ts` | **11/11 test pass** (thêm 1 test job nền) |
| Full API | **34 suite / 317 test pass** |
| Randomized `--seed=20261121` | **317/317 pass** |
| Typecheck toàn monorepo | pass |
| `nest build` | pass |
| Docs `--check` | 369 liên kết / 296 ID / 22 mục |
| Payload mẫu | 5/5 |
| MQTT exposure | 16/16 (kiểm cấu hình tĩnh) |

Test mới kiểm:

1. User thường gọi `GET /admin/jobs` → 403.
2. Admin thấy đúng 3 job theo thứ tự cố định.
3. Alert có lần chạy gần nhất thất bại → `failed`; vẫn có `lastSuccessAt` cũ.
4. Care có lần chạy gần nhất thành công → `ok`; vẫn có `lastFailureAt` cũ.
5. Retention chưa có bản ghi → `never`, `lastRun=null`.
6. Bản ghi retention cũ hơn ngưỡng → `stale`.
7. Response không chứa email hay nội dung sức khỏe; key của job/run đúng tập đã công bố.

## Giới hạn

- Chỉ đọc bản ghi gần nhất; không chứng minh scheduler đang chạy, không thay health check tiến trình.
- `stale` là ngưỡng quan sát, không phải SLA; chưa có cảnh báo tự động khi job quá hạn.
- Chưa có UI admin; chưa kiểm scheduler thật, nhiều tiến trình hay PostgreSQL thật.
- Chưa có cơ chế đăng ký job động; thêm job phải sửa code + contract + test.
- Không thay thế log/metric; chưa đo p95 hay độ trễ job.
