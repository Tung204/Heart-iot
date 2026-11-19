# v8-care-BE — lịch nhắc chăm sóc + phiếu đi khám (backend)

Bạn là worker **backend** (NestJS + Drizzle + PGlite). Chỉ backend + contracts + seed + test API. **Không sửa web.**

Đọc trước: `reports/orchestration/v8/decisions.md`, `docs/02-yeu-cau-va-pham-vi.md` (FR-15/16/22), `docs/04-du-lieu-va-giao-tiep.md`, `docs/14` §13, và các module mẫu `apps/api/src/maintenance/*`, `apps/api/src/measurements/*`, `apps/api/src/access/access.service.ts`.

## 1. Contract mới

Thêm `packages/contracts/src/reminders.ts` + `packages/contracts/src/reports.ts`, export trong `packages/contracts/package.json` (`./reminders`, `./reports`) và build.

### Reminder

```ts
kind: 'medication' | 'activity' | 'measurement' | 'other'
{
  id, subjectId,
  kind,
  title: string (2..120),
  note: string | null (<=500),
  times: string[]  // 'HH:MM', 1..6 phần tử, tăng dần, unique
  weekdays: number[] // 1=T2..7=CN, 1..7 phần tử, unique, tăng dần
  startsOn: 'YYYY-MM-DD',
  endsOn: 'YYYY-MM-DD' | null,
  active: boolean,
  createdAt, updatedAt
}
```
Tạo/sửa: cùng field trừ id/timestamps/subjectId. `endsOn >= startsOn`. Không có field liều lượng.

### Occurrence hôm nay

```ts
{ date: 'YYYY-MM-DD', timezone: string,
  items: [{ reminder: ReminderSummary, time: 'HH:MM',
            status: 'pending'|'done'|'skipped',
            completion: { status, completedAt, completedBy:{userId,displayName} } | null }] }
```
Chỉ sinh occurrence nếu ngày đó thuộc `weekdays`, trong `[startsOn, endsOn]`, reminder `active`. Sắp theo giờ rồi tiêu đề.

### Phiếu đi khám

`GET /subjects/:id/visit-report?from=YYYY-MM-DD&to=YYYY-MM-DD`
```ts
{ subject: { id, displayName, timezone },
  period: { from, to, days },
  generatedAt,
  summary: {
    measurementCount, daysWithData, coveragePercent,
    heartRate: { avg, min, max } | null,
    steps: { total, avgPerDay } | null,
    gaps: [{ from, to, hours }]   // khoảng >= 6 giờ không có mẫu, trong kỳ
  },
  incidents: { total, falls, sos, open,
               items: [{ id, type:'fall'|'sos', state, detectedAt }] },
  attentionPoints: [{ date: 'YYYY-MM-DD', label, detail }], // <=5
  simulated: boolean,
  disclaimer: string // cố định: chỉ số liệu tham khảo, không thay khám/chẩn đoán
}
```
`from/to` mặc định 30 ngày gần nhất theo timezone hồ sơ; tối đa 92 ngày; áp `sharedFrom`/`historyDays` như các API đo hiện có; nếu kỳ không có ngày hợp lệ → 422.

**Điểm chú ý (deterministic, không chẩn đoán):** chọn tối đa 5 theo thứ tự ưu tiên, chỉ khi có dữ liệu:
1. Số lần ngã > 0 (ngày gần nhất).
2. Khoảng thiếu dài nhất (>=6h).
3. Ngày có nhịp tim thấp nhất / cao nhất trong kỳ (nêu số + ngày).
4. Ngày ít bước nhất trong các ngày có dữ liệu.
5. Độ phủ < 80% (nêu % và số ngày thiếu).
Câu chữ trung tính, chỉ số liệu + ngày; **không** “nguy hiểm/suy tim/bất thường”.

## 2. DB

Migration mới:
- `care_reminders` (id uuid pk, subject_id fk cascade, kind text, title text, note text null, times jsonb, weekdays jsonb, starts_on date, ends_on date null, active boolean default true, created_at/updated_at).
- `care_reminder_completions` (id uuid pk, reminder_id fk cascade, subject_id fk cascade, occurrence_date date, scheduled_time text 'HH:MM', status text check done/skipped, completed_by user fk set null, completed_at timestamptz, unique(reminder_id, occurrence_date, scheduled_time)).
Index `(subject_id, starts_on)` và `(reminder_id, occurrence_date)`.

## 3. API

Theo mẫu controller hiện có (SessionGuard, ZodValidationPipe, AppError/404/403):

- `GET /subjects/:id/reminders` — chủ hồ sơ hoặc thành viên có `canViewMeasurements`; sắp theo `createdAt`.
- `POST /subjects/:id/reminders` — **chỉ chủ hồ sơ**.
- `PATCH /subjects/:id/reminders/:reminderId` — chỉ chủ hồ sơ.
- `DELETE /subjects/:id/reminders/:reminderId` — chỉ chủ hồ sơ, 204.
- `GET /subjects/:id/reminders/today?date=` — như quyền xem; date mặc định hôm nay theo timezone hồ sơ; trả occurrence như trên.
- `POST /subjects/:id/reminders/:reminderId/completions` body `{date,time,status:'done'|'skipped'}` — chủ hồ sơ hoặc `canViewMeasurements`; idempotent theo unique key (ghi đè trạng thái/người/thời điểm); 200.
- `DELETE /subjects/:id/reminders/:reminderId/completions?date=&time=` — như trên, 204; không có → 404.
- `GET /subjects/:id/visit-report` — chủ hồ sơ hoặc `canViewMeasurements`.

Authz dùng `AccessService` hiện có; admin không link hồ sơ → 404; thiếu quyền đo → 403 với message nghiệp vụ như các API measurements.

## 4. Seed

Thêm 2 reminder demo cho Bà An (idempotent): “Uống thuốc huyết áp” 08:00 hằng ngày (note “Thuốc do gia đình tự đặt, không phải chỉ định của hệ thống”), “Đi bộ nhẹ buổi chiều” 16:00 các ngày T2–T6. Không seed completion.

## 5. Test bắt buộc (API)

- CRUD + validation times/weekdays/endsOn.
- Quyền: owner tạo/sửa/xoá; caregiver `canViewMeasurements` xem + complete nhưng 403 khi tạo/sửa/xoá; caregiver không quyền 403; admin không link 404.
- Today: đúng weekdays, startsOn/endsOn, timezone (một ca `Asia/Ho_Chi_Minh` + một ca `UTC`), occurrence ngoài ngày không lẫn.
- Completion: idempotent, undo, unique key, người/thời điểm đúng.
- Report: mặc định 30 ngày, clamp 92, `sharedFrom`/`historyDays`, coverage/gaps/incidents/attentionPoints (>=1 case có ngã + gap), simulated=true khi seed, không chứa từ chẩn đoán.
- Không làm hỏng 219 test API cũ; chạy full `pnpm --filter @heart-iot/api test`.

## 6. Cổng

`pnpm build:contracts`, `pnpm --filter @heart-iot/api typecheck`, full API test, `pnpm --filter @heart-iot/api build`. Chạy seed + API cổng **3017** (`PGLITE_DATA_DIR=.data/v8be`, `WEB_ORIGIN=http://127.0.0.1:4365`) và curl 4 endpoint để chứng minh; dán lệnh + kết quả thật trong handoff. Không cần chạy web/E2E.

## 7. Bàn giao

Commit branch `v8-care-be` (từ master), **không merge/push**. `reports/handoffs/v8-care-be.md`: file đổi, endpoint + ví dụ JSON thật, số test, phần chưa làm (FR-17/18/19/20/21/23, phần thiết bị của FR-15), provider/model.
