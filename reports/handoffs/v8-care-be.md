# Handoff — v8-care-BE (backend)

- **Thời điểm:** 2026-11-19 (Asia/Ho_Chi_Minh)
- **Branch:** `v8-care-be` (tạo từ `master` @ `4229bbd`), **chưa merge/push**
- **Phạm vi:** backend NestJS + Drizzle + PGlite, contracts, seed, test API. Không sửa `apps/web`.
- **Provider/model:** `moxuna` / `deepseek-v4.1-flash`

## 1. File thay đổi

### Contracts

| File | Nội dung |
| --- | --- |
| `packages/contracts/src/reminders.ts` | Mới. `reminderKindSchema` (`medication/activity/measurement/other`), `reminderTimeSchema` (`HH:MM`), `reminderTimesSchema` (1..6, tăng dần, unique), `reminderWeekdaysSchema` (ISO 1=T2..7=CN), `reminderSchema`, `createReminderSchema`/`updateReminderSchema` (strict, `endsOn >= startsOn`), occurrence hôm nay (`reminderDaySchema`), ghi/hoàn tác đánh dấu (`reminderCompletionWriteSchema`, `reminderCompletionQuerySchema`, `reminderCompletionResultSchema`). Không có trường liều lượng. |
| `packages/contracts/src/reports.ts` | Mới. `visitReportSchema` (subject/period/summary/incidents/attentionPoints/simulated/disclaimer), `visitReportQuerySchema`, hằng số `VISIT_REPORT_MAX_DAYS=92`, `VISIT_REPORT_DEFAULT_DAYS=30`, `VISIT_REPORT_GAP_HOURS=6`, `VISIT_REPORT_LOW_COVERAGE_PERCENT=80`, `VISIT_REPORT_MAX_ATTENTION_POINTS=5`, `VISIT_REPORT_DISCLAIMER`. |
| `packages/contracts/package.json` | Thêm export `./reminders`, `./reports`. |

### DB

| File | Nội dung |
| --- | --- |
| `apps/api/src/database/schema.ts` | `careReminders`, `careReminderCompletions` + type `CareReminderRow`/`CareReminderCompletionRow`. |
| `apps/api/drizzle/0002_giant_bloodaxe.sql` (+ `meta/_journal.json`, `meta/0002_snapshot.json`) | Migration sinh bằng `drizzle-kit generate`: 2 bảng, FK cascade (`subject_id`, `reminder_id`), FK `completed_by_user_id … set null`, unique `(reminder_id, occurrence_date, scheduled_time)`, index `(subject_id, starts_on)` và `(reminder_id, occurrence_date)`, CHECK status `done/skipped`, CHECK `scheduled_time` đúng `HH:MM`. |

### API + seed

| File | Nội dung |
| --- | --- |
| `apps/api/src/reminders/reminders.service.ts` | Nghiệp vụ CRUD + occurrence hôm nay + đánh dấu/hoàn tác. Dùng `AccessService` (`requireSubject`/`requireMeasurements`), `AuditService`. |
| `apps/api/src/reminders/reminders.controller.ts`, `reminders.module.ts` | Route `/subjects/:id/reminders*`, `SessionGuard`, `ZodValidationPipe`, `AppError` 404/403/422. |
| `apps/api/src/visit-reports/visit-report.service.ts` | Tổng hợp phiếu đi khám + điểm chú ý, dùng lại helper insights (`aggregateStepsByWindow`, `insightHeartRate`, `findInsightWindow`, `localDateKey`) và `PolicyService` cho ngưỡng bước. |
| `apps/api/src/visit-reports/visit-report.controller.ts`, `visit-report.module.ts` | Route `GET /subjects/:id/visit-report`. |
| `apps/api/src/common/local-date.ts` | Mới. `addDays`, `isoWeekday`, `daysBetweenInclusive`, `formatDateVi` (số học lịch trên `YYYY-MM-DD`, không phụ thuộc TZ máy chủ). |
| `apps/api/src/app.module.ts` | Đăng ký `RemindersModule`, `VisitReportModule`. |
| `apps/api/src/database/seed.ts` | Thêm 2 lịch nhắc demo cho bà An (idempotent bằng id cố định + `onConflictDoNothing`), **không seed completion**; `SeedSummary.reminders`. |

### Test

| File | Nội dung |
| --- | --- |
| `apps/api/test/reminders.spec.ts` | Mới, 13 test. |
| `apps/api/test/visit-report.spec.ts` | Mới, 12 test. |
| `apps/api/test/seed.spec.ts` | +1 test (2 reminder demo, không completion, today `pending`, report `simulated=true`), thêm đếm reminder/completion vào test idempotent. |

## 2. Endpoint

| Method | Path | Quyền |
| --- | --- | --- |
| GET | `/subjects/:id/reminders` | chủ hồ sơ hoặc `canViewMeasurements`; sắp `createdAt` |
| POST | `/subjects/:id/reminders` | **chỉ chủ hồ sơ** (201) |
| PATCH | `/subjects/:id/reminders/:reminderId` | chỉ chủ hồ sơ |
| DELETE | `/subjects/:id/reminders/:reminderId` | chỉ chủ hồ sơ (204) |
| GET | `/subjects/:id/reminders/today?date=` | như quyền xem; `date` mặc định hôm nay theo `subject.timezone` |
| POST | `/subjects/:id/reminders/:reminderId/completions` | như quyền xem; body `{date,time,status:'done'\|'skipped'}`; 200 |
| DELETE | `/subjects/:id/reminders/:reminderId/completions?date=&time=` | như quyền xem; 204, không có → 404 |
| GET | `/subjects/:id/visit-report?from=&to=` | như quyền xem số đo |

Authz: admin/người ngoài không có link hồ sơ → **404**; thiếu `canViewMeasurements` → **403** đúng
`MEASUREMENTS_NOT_SHARED_MESSAGE` + `{reason:'measurements_not_shared'}` như các API measurements.

### Quyết định nghiệp vụ đã cài (để web/E2E bám theo)

- `times`/`weekdays` phải gửi **đã tăng dần, không trùng**; sai → 422 (API không tự sắp xếp lại).
- Đánh dấu chỉ nhận occurrence thật: `time ∈ times`, `date ∈ [startsOn, endsOn]`, đúng weekday → sai 422.
  Nhờ vậy không sinh bản ghi mồ côi ngoài lịch (kể cả khi lịch đã `active=false`).
- Ghi đánh dấu là upsert theo `(reminderId, date, time)`: ghi đè `status`, người, `completedAt`;
  `completedBy` là `null` nếu tài khoản đã bị xoá (FK `set null`).
- Phiếu: `coveragePercent` = % **ngày** có ≥1 mẫu hợp lệ (không phải coverage theo nhịp tim);
  `steps.avgPerDay` = tổng bước / **số ngày của kỳ**; `to` tương lai bị kéo về hôm nay;
  kỳ > 92 ngày bị cắt phần đầu (giữ `to`); kỳ hoàn toàn trước `sharedFrom`/`historyDays` → 422.
- Điểm chú ý: thứ tự ngã → khoảng thiếu dài nhất → nhịp tim thấp nhất → nhịp tim cao nhất →
  ngày ít bước nhất → độ phủ < 80%, cắt còn 5. Khi kỳ **không có mẫu nào** thì bỏ điểm
  "khoảng thiếu" (chỉ còn điểm độ phủ) để không lặp cùng một ý. Nhịp tim thấp/cao cùng ngày
  được gộp thành 1 điểm.
- Không có từ chẩn đoán trong `attentionPoints` (test chặn `nguy hiểm/suy tim/bất thường/chẩn đoán/bệnh lý/điều trị`).

## 3. Bằng chứng cổng

```text
$ pnpm build:contracts
$ pnpm --filter @heart-iot/contracts build   # tsc -p tsconfig.json (không lỗi)

$ pnpm --filter @heart-iot/api typecheck
$ tsc -p tsconfig.json --noEmit              # không lỗi

$ pnpm --filter @heart-iot/api test
Test Suites: 22 passed, 22 total
Tests:       245 passed, 245 total
Time:        64.883 s
# 219 test cũ vẫn xanh; +13 reminders +12 visit-report +1 seed = 245

$ pnpm --filter @heart-iot/api build
$ nest build                                 # không lỗi
```

### Seed + API thật (cổng 3017)

```text
$ PGLITE_DATA_DIR=.data/v8be WEB_ORIGIN=http://127.0.0.1:4365 pnpm --filter @heart-iot/api seed
Đã seed dữ liệu demo tổng hợp (chạy lại không nhân bản):
{ "users": 3, "subjects": 2, "devices": 1, "assignments": 1, "careLinks": 1,
  "telemetry": 1681, "incidents": 3, "tasks": 2, "outbox": 2, "reminders": 2 }

$ PORT=3017 PGLITE_DATA_DIR=.data/v8be WEB_ORIGIN=http://127.0.0.1:4365 node dist/src/main.js
[NestApplication] Nest application successfully started
[RoutesResolver] RemindersController {/api/v1}
[RoutesResolver] VisitReportController {/api/v1}
$ curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3017/api/v1/health
200
```

Đăng nhập chủ hồ sơ (cookie jar):

```sh
curl -s -c /tmp/v8be.jar -H 'Origin: http://127.0.0.1:4365' -H 'Content-Type: application/json' \
  -d '{"email":"ba-an@demo.heart-iot.local","password":"demo-heart-iot-2026"}' \
  http://127.0.0.1:3017/api/v1/auth/login
# {"user":{"id":"11111111-1111-4111-8111-111111111111","displayName":"Trần Thị An",...}}
```

**1) `GET /subjects/:id/reminders`** (nguyên văn)

```sh
curl -s -b /tmp/v8be.jar -H 'Origin: http://127.0.0.1:4365' \
  http://127.0.0.1:3017/api/v1/subjects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/reminders
```

```json
{"items":[{"id":"a1111111-1111-4111-8111-111111111111","subjectId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","kind":"medication","title":"Uống thuốc huyết áp","note":"Thuốc do gia đình tự đặt, không phải chỉ định của hệ thống","times":["08:00"],"weekdays":[1,2,3,4,5,6,7],"startsOn":"2026-11-19","endsOn":null,"active":true,"createdAt":"2026-11-19T05:01:08.227Z","updatedAt":"2026-11-19T05:01:08.227Z"},{"id":"a2222222-2222-4222-8222-222222222222","subjectId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","kind":"activity","title":"Đi bộ nhẹ buổi chiều","note":null,"times":["16:00"],"weekdays":[1,2,3,4,5],"startsOn":"2026-11-19","endsOn":null,"active":true,"createdAt":"2026-11-19T05:01:08.227Z","updatedAt":"2026-11-19T05:01:08.227Z"}]}
```

**2) `GET /subjects/:id/reminders/today`** — 2026-11-19 là thứ Năm (weekday 4) nên có cả hai lịch (rút gọn phần lặp `reminder`)

```sh
curl -s -b /tmp/v8be.jar -H 'Origin: http://127.0.0.1:4365' \
  http://127.0.0.1:3017/api/v1/subjects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/reminders/today
```

```json
{
  "date": "2026-11-19",
  "timezone": "Asia/Ho_Chi_Minh",
  "items": [
    {"time": "08:00", "title": "Uống thuốc huyết áp", "status": "pending", "completion": null},
    {"time": "16:00", "title": "Đi bộ nhẹ buổi chiều", "status": "pending", "completion": null}
  ]
}
```

**3) `POST /subjects/:id/reminders/:reminderId/completions`** (nguyên văn)

```sh
curl -s -b /tmp/v8be.jar -H 'Origin: http://127.0.0.1:4365' -H 'Content-Type: application/json' \
  -d '{"date":"2026-11-19","time":"08:00","status":"done"}' \
  http://127.0.0.1:3017/api/v1/subjects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/reminders/a1111111-1111-4111-8111-111111111111/completions
```

```json
{"reminderId":"a1111111-1111-4111-8111-111111111111","date":"2026-11-19","time":"08:00","status":"done","completedAt":"2026-11-19T05:01:32.649Z","completedBy":{"userId":"11111111-1111-4111-8111-111111111111","displayName":"Trần Thị An"}}
```

Sau đó `GET .../reminders/today` trả item 08:00 `status:"done"`, `completion` đúng người/thời điểm
(rút gọn):

```json
{"time":"08:00","title":"Uống thuốc huyết áp","status":"done",
 "completion":{"status":"done","completedAt":"2026-11-19T05:01:32.649Z",
               "completedBy":{"userId":"11111111-1111-4111-8111-111111111111","displayName":"Trần Thị An"}}}
```

Hoàn tác: `DELETE .../completions?date=2026-11-19&time=08:00` → `204`; gọi lại → `404`
`{"code":"NOT_FOUND","message":"Chưa có đánh dấu cho lịch nhắc này ở ngày và giờ đã chọn."}`.

**4) `GET /subjects/:id/visit-report`** — response thật, rút gọn `gaps`/`incidents.items` để vừa tài liệu

```sh
curl -s -b /tmp/v8be.jar -H 'Origin: http://127.0.0.1:4365' \
  http://127.0.0.1:3017/api/v1/subjects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/visit-report
```

```json
{
  "subject": {"id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "displayName": "Bà Trần Thị An", "timezone": "Asia/Ho_Chi_Minh"},
  "period": {"from": "2026-10-21", "to": "2026-11-19", "days": 30},
  "generatedAt": "2026-11-19T05:01:32.789Z",
  "summary": {
    "measurementCount": 1681,
    "daysWithData": 7,
    "coveragePercent": 23.3,
    "heartRate": {"avg": 68.3, "min": 59, "max": 77},
    "steps": {"total": 5056, "avgPerDay": 168.5},
    "gaps": [{"from": "2026-10-20T17:00:00.000Z", "to": "2026-11-13T05:01:07.930Z", "hours": 564}]
  },
  "incidents": {
    "total": 3, "falls": 3, "sos": 0, "open": 1,
    "items": [
      {"id": "ffffffff-ffff-4fff-8fff-ffffffffffff", "type": "fall", "state": "open", "detectedAt": "2026-11-19T04:36:07.930Z"},
      {"id": "f2222222-2222-4222-8222-222222222222", "type": "fall", "state": "resolved", "detectedAt": "2026-11-17T05:01:07.930Z"},
      {"id": "f1111111-1111-4111-8111-111111111111", "type": "fall", "state": "cancelled", "detectedAt": "2026-11-16T05:01:07.930Z"}
    ]
  },
  "attentionPoints": [
    {"date": "2026-11-19", "label": "Sự kiện ngã", "detail": "Ghi nhận 3 lần ngã trong kỳ; lần gần nhất ngày 19/11/2026."},
    {"date": "2026-10-21", "label": "Khoảng thiếu dữ liệu dài nhất", "detail": "Thiếu mẫu đo 564 giờ, từ 2026-10-21 00:00 đến 2026-11-13 12:01."},
    {"date": "2026-11-14", "label": "Nhịp tim thấp nhất theo ngày", "detail": "Ngày 14/11/2026 ghi nhận nhịp tim thấp nhất 59 bpm trong các mẫu hợp lệ."},
    {"date": "2026-11-13", "label": "Nhịp tim cao nhất theo ngày", "detail": "Ngày 13/11/2026 ghi nhận nhịp tim cao nhất 77 bpm trong các mẫu hợp lệ."},
    {"date": "2026-11-13", "label": "Ngày ít bước nhất", "detail": "Ngày 13/11/2026 ghi nhận 430 bước — thấp nhất trong 7 ngày có dữ liệu bước."}
  ],
  "simulated": true,
  "disclaimer": "Phiếu chỉ tổng hợp số liệu tham khảo từ dữ liệu thiết bị, không thay thế việc khám hoặc chẩn đoán của bác sĩ."
}
```

Ghi chú về số liệu: seed chỉ có telemetry 6 ngày gần nhất trong kỳ 30 ngày → `daysWithData=7`,
`coveragePercent=23.3`, khoảng thiếu đầu kỳ 564 giờ; 3 incident seed đều là `fall`
(1 open, 1 resolved, 1 cancelled). Đây là hình dạng dữ liệu seed, không phải số liệu người thật.

## 4. Test đã thêm (tóm tắt)

`apps/api/test/reminders.spec.ts` (13):

1. CRUD đầy đủ (create/list/patch từng phần/delete, 404 sau khi xoá).
2. Danh sách sắp theo `createdAt` (ép mốc thời gian để tất định).
3. 16 ca validation: times rỗng/quá 6/sai định dạng/ngoài 24h/trùng/không tăng dần; weekdays
   rỗng/ngoài 1..7/quá 7/trùng/không tăng dần; `endsOn < startsOn`; title ngắn; note > 500;
   kind lạ; trường lạ `dosage`; PATCH rỗng; PATCH đảo `endsOn`.
4. Không thao tác chéo hồ sơ (404).
5. Caregiver `canViewMeasurements`: xem/today/complete/undo 200–204, tạo/sửa/xoá 403.
6. Caregiver thiếu quyền: 403 + `MEASUREMENTS_NOT_SHARED_MESSAGE` ở list/today/complete.
7. Admin/người ngoài: 404 ở mọi route.
8. Today: đúng weekdays, `startsOn`/`endsOn`, `active`; không lẫn occurrence ngày kế; date sai → 422.
9. Today: sắp giờ rồi tiêu đề; timezone `Asia/Ho_Chi_Minh`.
10. Today mặc định: `Asia/Ho_Chi_Minh` và `UTC` (mỗi hồ sơ trả đúng ngày hiện tại của mình).
11. Completion: idempotent (1 dòng DB), ghi đè trạng thái/người/thời điểm, hoàn tác 204, undo lại 404,
    đánh dấu thứ Hai không lẫn thứ Ba.
12. Completion ngoài lịch: sai giờ/ngày/trước `startsOn`/sau `endsOn`/status lạ → 422, không tạo dòng.
13. Xoá lịch nhắc cascade xoá completion.

`apps/api/test/visit-report.spec.ts` (12):

1. Mặc định 30 ngày theo timezone hồ sơ + disclaimer + generatedAt.
2. `to` tương lai kéo về hôm nay; clamp 92 ngày; `from > to` 422; sai định dạng ngày 422.
3. Tổng hợp coverage/HR/bước/gaps/incidents + `simulated=false`.
4. Điểm chú ý đúng thứ tự, đúng ngày/số (ngã + gap 40h + HR min/max + ngày ít bước), không từ chẩn đoán.
5. `simulated=true` với nguồn `simulator`; kỳ 1 ngày.
6. Kỳ không có mẫu: không bịa HR/bước, gaps 1 khoảng toàn kỳ, chỉ 1 điểm độ phủ.
7. Mẫu `not_worn`: `heartRate=null` nhưng vẫn đếm mẫu/ngày.
8. Điểm chú ý tối đa 5, bỏ điểm độ phủ khi đã đủ ưu tiên cao hơn.
9. Có điểm "Độ phủ dữ liệu" (1/30 ngày = 3,3%, 29 ngày thiếu).
10. Quyền: caregiver xem 200, thiếu quyền 403 đúng message, admin/người ngoài 404.
11. `sharedFrom`/`historyDays` cắt kỳ; kỳ trước mốc chia sẻ 422; `historyDays=7` → kỳ 8 ngày.
12. Admin không link hồ sơ 404.

`apps/api/test/seed.spec.ts`: đếm 2 reminder/0 completion; kiểm nội dung 2 lịch, today `pending`,
report seed `simulated=true` và `measurementCount > 0`.

## 5. Phần chưa làm (ngoài phạm vi lát cắt v8)

- **FR-15 phần thiết bị:** chưa có hàng đợi lệnh downlink, chưa rung/nút xác nhận trên firmware,
  chưa nhận sự kiện "đã thực hiện" từ thiết bị. Lát cắt này chỉ làm phần web/backend.
- **FR-17** nhắc sinh hoạt bất thường, **FR-18** đế sạc/còi tìm thiết bị/nhắc quên đeo,
  **FR-19** GPS + SIM 4G, **FR-20** bản tin cuối ngày/tuần, **FR-21** AI tạo lịch nhắc có
  xem trước – xác nhận, **FR-23** hỏi đáp chăm sóc có trích nguồn: **chưa làm**.
- Chưa làm luồng in/PDF phía web (FR-16 UI) — backend chỉ trả JSON; web dùng print CSS.
- Chưa cập nhật `docs/02-yeu-cau-va-pham-vi.md` / `docs/14` §13 sang trạng thái "đã có backend"
  (để worker docs/lead cập nhật cùng lúc với UI để tránh lệch trạng thái).
- Không seed completion; không có job sinh occurrence trước (occurrence tính on-demand khi gọi today).

## 6. Rủi ro/ghi chú cho người tích hợp

- Contract `reminderCompletionSchema.completedBy` cho phép `null` bên trong (tài khoản bị xoá,
  FK `set null`) — web nên hiển thị "Không xác định" thay vì giả định luôn có tên.
- `PATCH` chỉ gửi `endsOn` hoặc `startsOn` vẫn được kiểm trên giá trị đã gộp; gửi `times`/`weekdays`
  phải đúng thứ tự tăng dần.
- API trả 422 (không phải 400) cho dữ liệu/query sai theo `AppError.validation` hiện có.
- `apps/api/src/common/local-date.ts` là helper mới dùng chung cho reminders/report; `localDateKey`
  vẫn tái dùng từ `measurements/insights` (một nguồn duy nhất cho ngày địa phương).
