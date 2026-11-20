# v9.1-BE — tổng hợp tuân thủ chăm sóc (backend)

Bạn là worker **backend** (NestJS 11 + Drizzle + PGlite). Chỉ backend + contracts + migration + seed + test API. **Không sửa `apps/web`.**

Đọc trước: `reports/orchestration/v9/decisions.md`, `docs/14` mục 14 (V9.1), `docs/02` (FR-15), `apps/api/src/reminders/*`, `apps/api/src/database/schema.ts` (bảng `care_reminders`, `care_reminder_completions`), `apps/api/src/measurements/time-utils.ts`, `apps/api/src/common/local-date.ts`, `apps/api/src/access/access.service.ts`, `apps/api/src/database/seed.ts`, `apps/api/test/reminders.spec.ts`, `apps/api/test/seed.spec.ts`.

## 1. Contract (thêm vào `packages/contracts/src/reminders.ts`)

Không tạo package mới; export đã có. Thêm:

```ts
export const careAdherenceQuerySchema = z
  .object({ days: z.coerce.number().int().min(1).max(30).default(7) })
  .strict();

export const adherencePercentSchema = z.number().int().min(0).max(100).nullable();

export const careAdherenceTotalsSchema = z.object({
  scheduled: z.number().int().min(0),
  done: z.number().int().min(0),
  skipped: z.number().int().min(0),
  pending: z.number().int().min(0),
  recordedPercent: adherencePercentSchema, // (done+skipped)/scheduled
  completionPercent: adherencePercentSchema, // done/(done+skipped)
});

export const careAdherenceDaySchema = z.object({
  date: isoDateSchema,
  scheduled: z.number().int().min(0),
  done: z.number().int().min(0),
  skipped: z.number().int().min(0),
  pending: z.number().int().min(0),
});

export const careAdherenceReminderSchema = z.object({
  reminderId: idSchema,
  title: z.string().min(2).max(120),
  kind: reminderKindSchema,
  active: z.boolean(),
  archived: z.boolean(),
  scheduled: z.number().int().min(0),
  done: z.number().int().min(0),
  skipped: z.number().int().min(0),
  pending: z.number().int().min(0),
  recordedPercent: adherencePercentSchema,
  completionPercent: adherencePercentSchema,
});

export type CareAdherenceTotals = z.infer<typeof careAdherenceTotalsSchema>;
export type CareAdherenceDay = z.infer<typeof careAdherenceDaySchema>;
export type CareAdherenceReminder = z.infer<typeof careAdherenceReminderSchema>;

export const careAdherenceSchema = z.object({
  subjectId: idSchema,
  timezone: z.string().min(1),
  from: isoDateSchema,
  to: isoDateSchema,
  days: z.number().int().min(1).max(30),
  totals: careAdherenceTotalsSchema,
  series: z.array(careAdherenceDaySchema), // đúng `days` phần tử, cũ → mới
  reminders: z.array(careAdherenceReminderSchema),
});
export type CareAdherence = z.infer<typeof careAdherenceSchema>;
```

`careAdherenceQuerySchema` parse ở controller. Không đổi `reminderSchema` (không expose `archived_at`).

## 2. DB + migration

Thêm vào `apps/api/src/database/schema.ts`:

- `careReminders.archivedAt` (`archived_at timestamptz null`), index `(subject_id, archived_at)` hoặc dùng index sẵn có; bắt buộc lọc `isNull`.
- Bảng `care_reminder_periods`:
  - `id uuid pk defaultRandom`
  - `reminder_id uuid not null fk care_reminders on delete cascade`
  - `active_from date not null`
  - `active_to date null`
  - `created_at`
  - index `(reminder_id, active_from)`
  - check `active_to is null or active_to >= active_from`

Migration mới (`drizzle-kit generate`, tên `0003_*`):

1. `ALTER TABLE care_reminders ADD COLUMN archived_at timestamptz`.
2. Tạo bảng + index/check.
3. Backfill một lần (ghi chú xấp xỉ ngày UTC):
   ```sql
   INSERT INTO care_reminder_periods (reminder_id, active_from, active_to)
   SELECT id,
          GREATEST(starts_on, created_at::date),
          CASE WHEN active THEN NULL
               ELSE GREATEST(GREATEST(starts_on, created_at::date), updated_at::date)
          END
   FROM care_reminders;
   ```
   Không chạy backfill lần hai nếu bảng đã có dữ liệu (migration chỉ chạy một lần; test từ DB rỗng).

Cập nhật `toReminder` nếu cần `archivedAt` nội bộ; **không** thêm vào response `reminderSchema`.

## 3. Nghiệp vụ khoảng hiệu lực

Tạo helper trong `apps/api/src/reminders/reminder-periods.ts` (hoặc trong service, có test):

- `localToday(now, timezone)` dùng `localDateKey`.
- Khi **tạo**:
  - nếu `active=true`: mở khoảng `active_from = max(startsOn, localToday)`; `active_to=null`.
  - nếu `active=false`: không tạo khoảng.
- Khi **PATCH đổi `active`**:
  - `true → false`: đóng khoảng đang mở (nếu có) bằng `active_to = localToday` (ngày tắt vẫn tính).
  - `false → true`: nếu khoảng gần nhất có `active_to >= localToday` thì mở lại (`active_to=null`); nếu không, tạo khoảng mới từ `localToday`.
  - Nếu không đổi `active`, không sửa khoảng.
- `startsOn`/`endsOn` vẫn là biên toàn cục; không sửa khoảng khi đổi hai mốc này.
- **Archive** (`DELETE`): đặt `archived_at=now`, `active=false`, đóng khoảng mở tại `localToday`. Không xoá row/completion.
- Không mở endpoint unarchive.

## 4. API

Thêm vào `RemindersController` (dùng `SessionGuard`, `ZodValidationPipe`, `AppError`):

```text
GET /subjects/:id/care/adherence?days=7
```

- Quyền: `AccessService.requireMeasurements(user.id, subjectId)` — owner hoặc người có `canViewMeasurements`; thiếu quyền 403 đúng message nghiệp vụ hiện có; admin/người ngoài 404.
- `days` mặc định 7; từ chối ngoài 1..30 (422 qua zod).
- `from = addDays(localToday, -(days-1))`, `to = localToday` theo `subject.timezone`.
- Không audit (chỉ đọc), không gọi AI, không tạo notification/incident.

### Cách tính (hàm thuần, test riêng)

Tạo `apps/api/src/reminders/care-adherence.ts` export `buildCareAdherence(input)`; service chỉ tải dữ liệu và gọi hàm.

Input: `now`, `timezone`, `days`, `reminders[]` (gồm archived + periods), `completions[]` trong `[from,to]`.

Với mỗi `date` từ `from`→`to`:

- `weekday = isoWeekday(date)`; bỏ nếu không nằm trong `weekdays`.
- Bỏ nếu ngoài `[startsOn, endsOn]`.
- Bỏ nếu `date` không nằm trong **bất kỳ** khoảng `[active_from, active_to]` (null = mở).
- Với mỗi `time` trong `times`:
  - `scheduledAt = zonedToUtc(y,m,d,hh,mm,0,timezone)`.
  - **Chỉ tính occurrence đã qua**: `scheduledAt <= now`. Occurrence tương lai trong hôm nay không vào `scheduled`; completion sớm (nếu có) cũng không được tính cho đến khi tới giờ.
  - Có completion `(reminderId,date,time)` → `done` hoặc `skipped`; không có → `pending`.

Tổng hợp:

- `series`: đúng `days` phần tử, kể cả ngày 0 occurrence (số 0).
- `reminders`: chỉ giữ reminder có `scheduled > 0` **hoặc** có completion trong kỳ (để thấy lịch sử của lịch đã lưu trữ); sắp theo `createdAt, id` như `list`.
- `totals` cộng từ tất cả reminder.
- `recordedPercent = scheduled === 0 ? null : Math.round(100*(done+skipped)/scheduled)`.
- `completionPercent = (done+skipped) === 0 ? null : Math.round(100*done/(done+skipped))`.
- Không nội suy ngày thiếu; ngày không có occurrence là 0, không phải “không tuân thủ”.

Truy vấn: tối đa 3 query (reminders, periods theo `inArray`, completions theo subject + khoảng ngày). Không N+1. Nếu reminder chưa có period (dữ liệu cũ), fallback coi `[startsOn, null]` là một khoảng để không mất dữ liệu; ghi chú trong code.

### Archive thay cho xoá

- `DELETE /subjects/:id/reminders/:reminderId` giữ route/204 nhưng **archive**; audit `care_reminder.archive` (không phải `.delete`).
- `list()` và `day()` lọc `archived_at is null`.
- `update()`/`complete()`/`uncomplete()` với reminder đã archive → 404 (không sửa lịch sử đã lưu trữ).
- `archive` idempotent? Gọi lần hai → 404 (đã archive) để không giả vờ xoá lần nữa; test.

## 5. Seed

Trong `apps/api/src/database/seed.ts`:

- Giữ 2 reminder demo. Sau khi có reminder, seed completion mẫu cho **3 ngày gần nhất** theo timezone hồ sơ:
  - “Uống thuốc huyết áp” 08:00: ngày -1 `done`, ngày -2 `done`, ngày -3 `skipped` (nếu đúng weekday và trong khoảng hiệu lực).
  - “Đi bộ nhẹ buổi chiều” 16:00: ngày -1 `done` nếu là T2–T6.
- Idempotent: dùng `onConflictDoNothing` theo unique `(reminder_id, occurrence_date, scheduled_time)`; không seed nếu ngày không phải occurrence hợp lệ.
- Cập nhật `SeedSummary` (ví dụ `reminderCompletions`) và test seed idempotent (chạy hai lần không nhân bản).

## 6. Test bắt buộc

Tạo `apps/api/test/care-adherence.spec.ts` (integration theo pattern hiện có) + unit cho hàm thuần nếu tách được:

1. 7 ngày, lịch 08:00 hằng ngày, completion done/skipped/pending → `scheduled` đúng, hai tỉ lệ đúng, `null` khi mẫu số 0.
2. Chỉ tính occurrence **đã qua**: hôm nay có 08:00 và 20:00, `now` 10:00 → 08:00 tính, 20:00 không; completion sớm của 20:00 không vào `done`.
3. `weekdays`/`startsOn`/`endsOn` lọc đúng; ngày không có occurrence không bị coi là thiếu.
4. Tắt/bật lại: ngày tắt không tính; bật lại cùng ngày không tạo khoảng trùng; bật lại ngày khác tạo khoảng mới.
5. Archive: `DELETE` 204, list/today ẩn, adherence vẫn giữ lịch sử trong kỳ, `update/complete` trên lịch archive → 404; completion còn trong DB.
6. Timezone: hồ sơ `Asia/Tokyo` và một vùng có DST (`Europe/Paris`) quanh ngày đổi giờ; không lệch ngày/occurrence.
7. Quyền: owner xem; caregiver `canViewMeasurements` xem; caregiver thiếu quyền 403; admin không link 404.
8. `days=1`, `days=30`, `days=0/31` (422); mặc định 7.
9. Hồ sơ chưa có lịch → totals 0, series `days` ngày, reminders rỗng.
10. Seed: có completion mẫu, chạy seed hai lần không nhân bản; test cũ không hỏng.

Không nới assertion cũ; cập nhật test v8 nếu `DELETE` đổi từ xoá cứng sang archive (kiểm row còn + `archived_at`).

## 7. Cổng

```bash
pnpm build:contracts
pnpm --filter @heart-iot/api typecheck
pnpm --filter @heart-iot/api test
pnpm --filter @heart-iot/api build
```

Chạy thêm:

- Migration + seed từ DB rỗng (`PGLITE_DATA_DIR=.data/v9be`), seed lần hai.
- API cổng **3019** (`WEB_ORIGIN=http://127.0.0.1:4366`), curl:
  - `GET /subjects/:id/care/adherence?days=7`
  - `GET /subjects/:id/reminders`
  - `GET /subjects/:id/reminders/today`
  - `DELETE` một reminder, gọi lại list/adherence để thấy archive giữ lịch sử.
- Dán lệnh + JSON thật (đã lọc) vào handoff.

## 8. Bàn giao

Commit branch `v9-adherence-be` (từ master), **không merge/push**. `reports/handoffs/v9-adherence-be.md`: file đổi, contract/migration, endpoint + ví dụ JSON thật, số test, phần chưa làm (V9.2, push, AI, thiết bị), quyết định backfill xấp xỉ, provider/model.

## 9. Ngoài phạm vi

- Scheduler/job, quy tắc nhắc chủ động, bản tin, notification subject-level (V9.2).
- `canViewCare`, đổi lời mời/chia sẻ (D3, V9.2).
- Xoá cứng/retention, backup (V12).
- Bất kỳ kết luận y khoa hoặc gợi ý liều.
