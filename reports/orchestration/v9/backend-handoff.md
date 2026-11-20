# Handoff V9.1 backend — tổng hợp tuân thủ chăm sóc

Ngày: 20/11/2026. Nhánh: `v9-adherence-be` (tách từ master sau `48e8957`). Phạm vi: contracts + migration + API + seed + test API; **không sửa web**.

## Đã làm

- Contract `packages/contracts/src/reminders.ts`: `careAdherenceQuerySchema` (`days` 1..30, mặc định 7), `careAdherenceSchema` và các schema con; hai tỉ lệ nullable khi mẫu số 0.
- Schema `apps/api/src/database/schema.ts`: `care_reminders.archived_at`; bảng `care_reminder_periods` (`reminder_id`, `active_from`, `active_to`, unique `(reminder_id, active_from)`, check range); index `care_reminders(subject_id, archived_at)`.
- Migration `apps/api/drizzle/0003_loving_justin_hammer.sql`: tạo bảng/cột/index; backfill khoảng cho reminder cũ (`active_from = starts_on`; `active_to = null` nếu active, ngược lại `greatest(starts_on, updated_at::date)`). Đây là xấp xỉ một lần, ghi ở mục giới hạn.
- Hàm thuần `apps/api/src/reminders/care-adherence.ts`: occurrence theo `subject.timezone`, `startsOn`/`endsOn`, ISO weekday và các khoảng hiệu lực; chỉ tính mốc đã qua; `pending` không bị coi là “không làm”; `scheduled=0` → hai tỉ lệ `null`; chuỗi `series` đúng `days` phần tử cũ → mới; reminder không có occurrence bị bỏ, sort theo `createdAt`.
- `RemindersService`:
  - `list()`/`day()` ẩn reminder đã lưu trữ.
  - `create()` trong transaction, mở khoảng từ `startsOn` nếu active.
  - `update()` trong transaction, tắt → đóng khoảng ở hôm nay (ngày tắt vẫn tính), bật lại → mở lại khoảng đóng hôm nay hoặc tạo khoảng mới; audit dùng cùng transaction.
  - `remove()` đổi từ xoá cứng sang **lưu trữ mềm**: `archived_at`, `active=false`, đóng khoảng, audit `care_reminder.archive`; completion còn nguyên.
  - `complete()` kiểm tra ngày nằm trong khoảng hiệu lực; reminder đã lưu trữ trả 404.
  - `adherence()` dùng `requireMeasurements` (giữ nguyên quyền v8), đọc reminder + period + completion trong khoảng, gọi hàm thuần và parse lại bằng contract.
- Controller: `GET /api/v1/subjects/:id/care/adherence?days=7|30`.
- Seed: lịch demo bắt đầu 7 ngày trước; thêm period cho hai lịch; completion mẫu cho 3 ngày trước (thuốc done/done/skipped; đi bộ done nếu hôm trước là ngày làm việc); **không** đánh dấu hôm nay. Chạy lại idempotent.
- Test: `apps/api/test/care-adherence.spec.ts` (11 test: quyền 200/403/404, validation, archive, toggle, rỗng, future, Tokyo, DST Paris, period gap); cập nhật `reminders.spec.ts` cho lưu trữ mềm; cập nhật `seed.spec.ts`.

## Bằng chứng chạy thật (20/11/2026)

Từ `C:/MyFolder/Hoc_Tap/project/DATN`:

```text
pnpm --filter @heart-iot/api typecheck        → pass
pnpm --filter @heart-iot/api build            → pass (nest build)
pnpm --filter @heart-iot/api test             → 23 suite, 256 test pass (104 s)
pnpm -r typecheck                             → contracts, api, simulator, web pass
```

Smoke API với PGlite sạch (`.data/v9fresh`, cổng 3019):

```text
PGLITE_DATA_DIR=.data/v9fresh pnpm seed
→ reminders 2, reminderCompletions 4, telemetry 1681
chạy seed lần 2 → reminders 0, reminderCompletions 0

GET /care/adherence?days=7   → scheduled 12, done 3, skipped 1, pending 8, recorded 33%, completion 75%
GET /care/adherence?days=30  → 30 phần tử series, scheduled 14, done 3, skipped 1
GET /care/adherence?days=31  → 422
tạo lịch 18/11, đánh dấu 19/11 done, DELETE → 204
→ GET /reminders không còn lịch; adherence vẫn có row archived=true, scheduled=3, done=1
```

Ảnh hưởng UI: **chưa có**; trang `/app/care` chưa gọi endpoint này.

## Sai lệch so với spec / quyết định

1. **Khoảng đầu tiên mở từ `startsOn`, không phải `max(startsOn, hôm nay)`.** Lý do: người dùng backdate `startsOn` thì lịch sử trước hôm nay vẫn thuộc lịch (có thể hiện `pending` nếu chưa đánh dấu); seed cần 7 ngày lịch sử. Đã cập nhật `decisions.md` V9.1-5, spec và migration backfill tương ứng.
2. **DELETE là lưu trữ mềm** (D9) — thay đổi hành vi so với v8. Reminder đã lưu trữ 404 khi sửa/đánh dấu; adherence vẫn tính với `archived=true`. Xoá cứng để V12.
3. Seed đổi `startsOn` của hai lịch từ hôm nay thành 7 ngày trước và thêm completion mẫu; test seed cũ được cập nhật, không nới assertion.
4. Backfill migration dùng ngày UTC của DB, chỉ xấp xỉ; dữ liệu thật cần kiểm lại nếu có reminder tạo trước `starts_on` bất thường.
5. Seed chỉ thêm completion mẫu nếu ngày đó nằm trong `startsOn..endsOn` của reminder. Trên DB v8 cũ (lịch demo `startsOn` = ngày tạo), seed sẽ **không** thêm completion lịch sử — đúng với dữ liệu, nhưng demo cũ sẽ không có sẵn tổng hợp 3 ngày; DB seed mới thì có.

## Chưa kiểm / giới hạn

- Chưa chạy PostgreSQL thật; chỉ PGlite. Chưa chạy migration 0003 trên bản sao DB v8 có dữ liệu thật (backfill mới chỉ chạy trên DB sạch).
- Chưa có review độc lập cho thay đổi quyền/ngày giờ (theo quy ước dự án, cần người khác tái kiểm trước khi coi là đóng).
- Chưa có UI, chưa có E2E/ảnh chụp cho tổng hợp tuân thủ.
- Chưa chạy lại web test/E2E sau thay đổi contract (chỉ thêm schema, `pnpm -r typecheck` pass).
- Chưa chạy MQTT/AI provider; không liên quan lát cắt này.

## Việc tiếp theo

1. Merge backend (contracts + API + migration + seed + test) sau khi review diff.
2. Làm web theo `reports/orchestration/v9/specs/web-adherence.md` trên nhánh `v9-adherence-web`, chụp ảnh 1280/390.
3. Cập nhật docs/14 trạng thái web + README + HTML + Obsidian bằng số test thật.
