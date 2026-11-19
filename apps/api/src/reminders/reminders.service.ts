import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import type { SubjectAccess } from '../access/access.service';
import type { UserSummary } from '@heart-iot/contracts';
import {
  reminderCompletionResultSchema,
  reminderCompletionSchema,
  reminderDaySchema,
  reminderListSchema,
  reminderSchema,
  type CreateReminderInput,
  type ReminderCompletion,
  type ReminderCompletionResult,
  type ReminderCompletionWrite,
  type ReminderDay,
  type ReminderList,
  type ReminderSummary,
  type UpdateReminderInput,
} from '@heart-iot/contracts/reminders';
import { DB, type AppDb } from '../database/database';
import {
  careReminderCompletions,
  careReminders,
  users,
  type CareReminderRow,
} from '../database/schema';
import { AccessService } from '../access/access.service';
import { AuditService } from '../access/audit.service';
import { AppError } from '../common/app-error';
import { isoWeekday } from '../common/local-date';
import { localDateKey } from '../measurements/insights';

/**
 * Lịch nhắc chăm sóc (FR-15 phần web).
 *
 * Quyền (dùng lại AccessService, không tự viết lại luật hồ sơ):
 * - Xem danh sách/occurrence hôm nay, đánh dấu đã thực hiện/bỏ đánh dấu:
 *   chủ hồ sơ hoặc người thân có `canViewMeasurements`; thiếu quyền → 403 với
 *   thông điệp nghiệp vụ giống các API đo; người ngoài/admin không có link → 404.
 * - Tạo/sửa/xoá lịch nhắc: chỉ chủ hồ sơ (người thân có quyền xem → 403).
 *
 * Bất biến dữ liệu:
 * - Occurrence chỉ sinh cho ngày thuộc `weekdays`, nằm trong
 *   `[startsOn, endsOn]` và reminder đang `active`.
 * - Khoá đánh dấu là `(reminderId, date, time)`; ghi lại là ghi đè trạng thái,
 *   người và thời điểm — không tạo bản ghi trùng.
 * - Không gợi ý liều/kê thuốc: mọi nội dung do người dùng tự nhập.
 */
@Injectable()
export class RemindersService {
  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async list(user: UserSummary, subjectId: string): Promise<ReminderList> {
    const access = await this.access.requireMeasurements(user.id, subjectId);
    const rows = await this.db
      .select()
      .from(careReminders)
      .where(eq(careReminders.subjectId, subjectId))
      .orderBy(asc(careReminders.createdAt), asc(careReminders.id));
    return reminderListSchema.parse({ items: rows.map(toReminder) });
  }

  /** Chỉ chủ hồ sơ; caregiver có link → 403, người ngoài/admin không link → 404. */
  async create(
    user: UserSummary,
    subjectId: string,
    input: CreateReminderInput,
  ): Promise<ReminderSummary> {
    const access = await this.access.requireSubject(user.id, subjectId);
    this.assertOwner(access, 'tạo lịch nhắc cho hồ sơ này');
    const rows = await this.db
      .insert(careReminders)
      .values({
        subjectId,
        kind: input.kind,
        title: input.title,
        note: input.note ? input.note : null,
        times: input.times,
        weekdays: input.weekdays,
        startsOn: input.startsOn,
        endsOn: input.endsOn ?? null,
        active: input.active,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('Không tạo được lịch nhắc.');
    await this.audit.record({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'care_reminder.create',
      targetType: 'care_reminder',
      targetId: row.id,
      outcome: 'success',
      // Chỉ metadata kỹ thuật: tiêu đề/ghi chú là nội dung người dùng tự nhập.
      metadata: { subjectId, kind: row.kind, active: row.active },
    });
    return toReminder(row);
  }

  async update(
    user: UserSummary,
    subjectId: string,
    reminderId: string,
    input: UpdateReminderInput,
  ): Promise<ReminderSummary> {
    const access = await this.access.requireSubject(user.id, subjectId);
    this.assertOwner(access, 'sửa lịch nhắc của hồ sơ này');
    const existing = await this.requireReminder(subjectId, reminderId);

    // PATCH có thể chỉ gửi một trong hai mốc → kiểm ràng buộc trên giá trị đã gộp.
    const startsOn = input.startsOn ?? existing.startsOn;
    const endsOn = input.endsOn !== undefined ? input.endsOn : existing.endsOn;
    if (endsOn && endsOn < startsOn) {
      throw AppError.validation('Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.', {
        field: 'endsOn',
      });
    }

    const patch: Partial<typeof careReminders.$inferInsert> = { updatedAt: new Date() };
    if (input.kind !== undefined) patch.kind = input.kind;
    if (input.title !== undefined) patch.title = input.title;
    if (input.note !== undefined) patch.note = input.note ? input.note : null;
    if (input.times !== undefined) patch.times = input.times;
    if (input.weekdays !== undefined) patch.weekdays = input.weekdays;
    if (input.startsOn !== undefined) patch.startsOn = input.startsOn;
    if (input.endsOn !== undefined) patch.endsOn = input.endsOn;
    if (input.active !== undefined) patch.active = input.active;

    const rows = await this.db
      .update(careReminders)
      .set(patch)
      .where(and(eq(careReminders.id, reminderId), eq(careReminders.subjectId, subjectId)))
      .returning();
    const row = rows[0];
    if (!row) throw AppError.notFound('Không tìm thấy lịch nhắc.');
    await this.audit.record({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'care_reminder.update',
      targetType: 'care_reminder',
      targetId: row.id,
      outcome: 'success',
      metadata: { subjectId, kind: row.kind, active: row.active },
    });
    return toReminder(row);
  }

  async remove(user: UserSummary, subjectId: string, reminderId: string): Promise<void> {
    const access = await this.access.requireSubject(user.id, subjectId);
    this.assertOwner(access, 'xoá lịch nhắc của hồ sơ này');
    await this.requireReminder(subjectId, reminderId);
    await this.db
      .delete(careReminders)
      .where(and(eq(careReminders.id, reminderId), eq(careReminders.subjectId, subjectId)));
    await this.audit.record({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'care_reminder.delete',
      targetType: 'care_reminder',
      targetId: reminderId,
      outcome: 'success',
      metadata: { subjectId },
    });
  }

  // ---------------------------------------------------------------------------
  // Occurrence hôm nay
  // ---------------------------------------------------------------------------

  /**
   * Occurrence của `date` (mặc định hôm nay theo `subject.timezone`).
   * Sắp theo giờ rồi tiêu đề; đánh dấu lấy đúng khoá `(reminderId, date, time)`
   * nên đánh dấu của ngày khác không lẫn sang.
   */
  async day(user: UserSummary, subjectId: string, dateRaw?: string): Promise<ReminderDay> {
    const access = await this.access.requireMeasurements(user.id, subjectId);
    const timezone = access.subject.timezone;
    const date = dateRaw ?? localDateKey(new Date(), timezone);
    const weekday = isoWeekday(date);

    const rows = await this.db
      .select()
      .from(careReminders)
      .where(
        and(
          eq(careReminders.subjectId, subjectId),
          eq(careReminders.active, true),
          lte(careReminders.startsOn, date),
          or(isNull(careReminders.endsOn), gte(careReminders.endsOn, date)),
        ),
      )
      .orderBy(asc(careReminders.createdAt), asc(careReminders.id));

    const scheduled = rows.filter((row) => row.weekdays.includes(weekday));
    const completions = await this.loadCompletions(
      subjectId,
      date,
      scheduled.map((row) => row.id),
    );

    const items: ReminderDay['items'] = [];
    for (const reminder of scheduled) {
      // `times` đã được hợp đồng bảo đảm tăng dần; sort lại để phòng dữ liệu cũ.
      for (const time of [...reminder.times].sort()) {
        const completion = completions.get(completionKey(reminder.id, time)) ?? null;
        items.push({
          reminder: toReminder(reminder),
          time,
          status: completion ? completion.status : 'pending',
          completion,
        });
      }
    }
    items.sort((a, b) => {
      if (a.time !== b.time) return a.time < b.time ? -1 : 1;
      return (
        a.reminder.title.localeCompare(b.reminder.title, 'vi') ||
        a.reminder.id.localeCompare(b.reminder.id)
      );
    });

    return reminderDaySchema.parse({ date, timezone, items });
  }

  // ---------------------------------------------------------------------------
  // Đánh dấu đã thực hiện / bỏ đánh dấu
  // ---------------------------------------------------------------------------

  /** Idempotent theo `(reminderId, date, time)`: ghi đè trạng thái/người/thời điểm. */
  async complete(
    user: UserSummary,
    subjectId: string,
    reminderId: string,
    input: ReminderCompletionWrite,
  ): Promise<ReminderCompletionResult> {
    await this.access.requireMeasurements(user.id, subjectId);
    const reminder = await this.requireReminder(subjectId, reminderId);
    assertScheduledOccurrence(reminder, input.date, input.time);

    const now = new Date();
    const rows = await this.db
      .insert(careReminderCompletions)
      .values({
        reminderId,
        subjectId,
        occurrenceDate: input.date,
        scheduledTime: input.time,
        status: input.status,
        completedByUserId: user.id,
        completedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          careReminderCompletions.reminderId,
          careReminderCompletions.occurrenceDate,
          careReminderCompletions.scheduledTime,
        ],
        set: {
          status: input.status,
          completedByUserId: user.id,
          completedAt: now,
        },
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('Không ghi được đánh dấu lịch nhắc.');

    await this.audit.record({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'care_reminder.complete',
      targetType: 'care_reminder',
      targetId: reminderId,
      outcome: 'success',
      metadata: { subjectId, date: input.date, time: input.time, status: input.status },
    });

    return reminderCompletionResultSchema.parse({
      reminderId,
      date: row.occurrenceDate,
      time: row.scheduledTime,
      status: row.status,
      completedAt: row.completedAt.toISOString(),
      completedBy: { userId: user.id, displayName: user.displayName },
    });
  }

  /** Bỏ đánh dấu; chưa có đánh dấu → 404 để nút "Hoàn tác" biết trạng thái đã đổi. */
  async uncomplete(
    user: UserSummary,
    subjectId: string,
    reminderId: string,
    date: string,
    time: string,
  ): Promise<void> {
    await this.access.requireMeasurements(user.id, subjectId);
    await this.requireReminder(subjectId, reminderId);
    const deleted = await this.db
      .delete(careReminderCompletions)
      .where(
        and(
          eq(careReminderCompletions.reminderId, reminderId),
          eq(careReminderCompletions.subjectId, subjectId),
          eq(careReminderCompletions.occurrenceDate, date),
          eq(careReminderCompletions.scheduledTime, time),
        ),
      )
      .returning({ id: careReminderCompletions.id });
    if (!deleted[0]) {
      throw AppError.notFound('Chưa có đánh dấu cho lịch nhắc này ở ngày và giờ đã chọn.');
    }
    await this.audit.record({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'care_reminder.uncomplete',
      targetType: 'care_reminder',
      targetId: reminderId,
      outcome: 'success',
      metadata: { subjectId, date, time },
    });
  }

  // ---------------------------------------------------------------------------
  // Nội bộ
  // ---------------------------------------------------------------------------

  private assertOwner(access: SubjectAccess, action: string): void {
    if (access.role !== 'owner') {
      // Đã có link hồ sơ nhưng không đủ quyền ghi → 403 (không phải 404).
      throw AppError.forbidden(`Chỉ chủ hồ sơ mới được ${action}.`);
    }
  }

  /** Lịch nhắc phải thuộc đúng hồ sơ; khác hồ sơ/không tồn tại → 404. */
  private async requireReminder(
    subjectId: string,
    reminderId: string,
  ): Promise<CareReminderRow> {
    const rows = await this.db
      .select()
      .from(careReminders)
      .where(and(eq(careReminders.id, reminderId), eq(careReminders.subjectId, subjectId)))
      .limit(1);
    const row = rows[0];
    if (!row) throw AppError.notFound('Không tìm thấy lịch nhắc.');
    return row;
  }

  private async loadCompletions(
    subjectId: string,
    date: string,
    reminderIds: string[],
  ): Promise<Map<string, ReminderCompletion>> {
    const result = new Map<string, ReminderCompletion>();
    if (reminderIds.length === 0) return result;
    const rows = await this.db
      .select({
        reminderId: careReminderCompletions.reminderId,
        scheduledTime: careReminderCompletions.scheduledTime,
        status: careReminderCompletions.status,
        completedAt: careReminderCompletions.completedAt,
        userId: users.id,
        displayName: users.displayName,
      })
      .from(careReminderCompletions)
      .leftJoin(users, eq(users.id, careReminderCompletions.completedByUserId))
      .where(
        and(
          eq(careReminderCompletions.subjectId, subjectId),
          eq(careReminderCompletions.occurrenceDate, date),
          inArray(careReminderCompletions.reminderId, reminderIds),
        ),
      );
    for (const row of rows) {
      result.set(
        completionKey(row.reminderId, row.scheduledTime),
        reminderCompletionSchema.parse({
          status: row.status,
          completedAt: row.completedAt.toISOString(),
          completedBy:
            row.userId && row.displayName
              ? { userId: row.userId, displayName: row.displayName }
              : null,
        }),
      );
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toReminder(row: CareReminderRow): ReminderSummary {
  return reminderSchema.parse({
    id: row.id,
    subjectId: row.subjectId,
    kind: row.kind,
    title: row.title,
    note: row.note,
    times: row.times,
    weekdays: row.weekdays,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function completionKey(reminderId: string, time: string): string {
  return `${reminderId}|${time}`;
}

/**
 * Chỉ nhận đánh dấu cho một occurrence thật của lịch: giờ nằm trong `times`,
 * ngày trong `[startsOn, endsOn]` và đúng thứ trong `weekdays`.
 * Ngày không đúng lịch → 422 (không tạo dữ liệu mồ côi ngoài lịch).
 */
function assertScheduledOccurrence(
  reminder: CareReminderRow,
  date: string,
  time: string,
): void {
  if (!reminder.times.includes(time)) {
    throw AppError.validation('Giờ đánh dấu không nằm trong lịch nhắc này.', { field: 'time' });
  }
  if (date < reminder.startsOn) {
    throw AppError.validation('Ngày đánh dấu nằm trước ngày bắt đầu của lịch nhắc.', {
      field: 'date',
      startsOn: reminder.startsOn,
    });
  }
  if (reminder.endsOn && date > reminder.endsOn) {
    throw AppError.validation('Ngày đánh dấu nằm sau ngày kết thúc của lịch nhắc.', {
      field: 'date',
      endsOn: reminder.endsOn,
    });
  }
  if (!reminder.weekdays.includes(isoWeekday(date))) {
    throw AppError.validation('Ngày đánh dấu không thuộc các ngày trong tuần của lịch nhắc.', {
      field: 'date',
      weekdays: reminder.weekdays,
    });
  }
}
