import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import {
  CLOSED_TASK_STATUSES,
  OPEN_TASK_STATUSES,
  maintenanceTaskListSchema,
  maintenanceTaskSummarySchema,
  type CloseTask,
  type CreateTaskInput,
  type MaintenanceTaskList,
  type MaintenanceTaskQuery,
  type MaintenanceTaskSummary,
} from '@heart-iot/contracts/tasks';
import type { UserSummary } from '@heart-iot/contracts';
import { DB, type AppDb } from '../database/database';
import { deviceAssignments, maintenanceTasks } from '../database/schema';
import { AccessService } from '../access/access.service';
import { AuditService } from '../access/audit.service';
import { AppError } from '../common/app-error';
import { decodeCursor, encodeCursor } from '../common/pagination';

type TaskRow = typeof maintenanceTasks.$inferSelect;

/**
 * MaintenanceService — xem/tạo/đóng công việc bảo trì.
 *
 * Quyền xem (dùng lại AccessService, không tự viết lại luật hồ sơ):
 * - Lọc theo `subjectId`: chủ hồ sơ thấy task của hồ sơ; caregiver cần
 *   `canReceiveAlerts` (thiếu → 403 vì đã có link, chỉ thiếu quyền);
 *   người ngoài và admin không có link → 404.
 * - Không truyền `subjectId`: người thường thấy task của mọi hồ sơ mình
 *   sở hữu/chăm sóc có `canReceiveAlerts`; admin chỉ thấy task KHÔNG gắn
 *   hồ sơ (`subjectId IS NULL`).
 * Đóng task: chỉ chủ hồ sơ (có `subjectId`) hoặc admin; task đã đóng → 409.
 * Tạo task thủ công: chỉ chủ hồ sơ; thiết bị phải đang gắn với đúng hồ sơ
 * (`device_assignments.ended_at IS NULL`); hạn xử lý nếu có phải ở tương lai.
 * Không sinh task định kỳ.
 */

/** Sai số cho phép khi so `dueAt` với hiện tại (đồng hồ máy khách lệch nhẹ). */
const DUE_AT_PAST_TOLERANCE_MS = 60_000;

function statusFilterFor(status: MaintenanceTaskQuery['status']): SQL | undefined {
  if (status === 'open') return inArray(maintenanceTasks.status, [...OPEN_TASK_STATUSES]);
  if (status === 'closed') return inArray(maintenanceTasks.status, [...CLOSED_TASK_STATUSES]);
  return undefined;
}

function toSummary(row: TaskRow): MaintenanceTaskSummary {
  return maintenanceTaskSummarySchema.parse({
    id: row.id,
    deviceId: row.deviceId,
    subjectId: row.subjectId,
    kind: row.kind,
    title: row.title,
    status: row.status,
    priority: row.priority,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    closeReason: row.closeReason,
  });
}

@Injectable()
export class MaintenanceService {
  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async listTasks(user: UserSummary, query: MaintenanceTaskQuery): Promise<MaintenanceTaskList> {
    const filters: Array<SQL | undefined> = [statusFilterFor(query.status)];
    if (query.deviceId) filters.push(eq(maintenanceTasks.deviceId, query.deviceId));

    if (query.subjectId) {
      // Chủ hồ sơ/caregiver có link; người ngoài (và admin không có link) → 404.
      const subjectAccess = await this.access.requireSubject(user.id, query.subjectId);
      if (subjectAccess.role !== 'owner') {
        this.access.assertAction(subjectAccess, 'receive_alerts');
      }
      filters.push(eq(maintenanceTasks.subjectId, query.subjectId));
    } else if (user.role === 'admin') {
      filters.push(isNull(maintenanceTasks.subjectId));
    } else {
      const accessible = await this.access.listAccessibleSubjects(user.id);
      const subjectIds = accessible
        .filter((item) => item.role === 'owner' || item.permissions.canReceiveAlerts)
        .map((item) => item.subject.id);
      filters.push(
        subjectIds.length > 0 ? inArray(maintenanceTasks.subjectId, subjectIds) : sql`false`,
      );
    }

    if (query.cursor) filters.push(this.cursorFilter(query.cursor));

    const rows = await this.db
      .select()
      .from(maintenanceTasks)
      .where(and(...filters.filter((item): item is SQL => item !== undefined)))
      .orderBy(
        desc(maintenanceTasks.priority),
        sql`${maintenanceTasks.dueAt} asc nulls last`,
        desc(maintenanceTasks.id),
      )
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const lastRow = page[page.length - 1];
    const nextCursor =
      hasMore && lastRow
        ? encodeCursor({
            priority: lastRow.priority,
            dueAt: lastRow.dueAt ? lastRow.dueAt.toISOString() : 'null',
            id: lastRow.id,
          })
        : null;
    return maintenanceTaskListSchema.parse({
      items: page.map(toSummary),
      nextCursor,
    });
  }

  /** Cursor theo thứ tự sắp xếp: priority desc, dueAt asc nulls last, id desc. */
  private cursorFilter(cursorValue: string): SQL | undefined {
    const cursor = decodeCursor(cursorValue);
    const priority = typeof cursor['priority'] === 'number' ? cursor['priority'] : null;
    const id = typeof cursor['id'] === 'string' ? cursor['id'] : null;
    const dueAtRaw = typeof cursor['dueAt'] === 'string' ? cursor['dueAt'] : undefined;
    if (priority === null || id === null || dueAtRaw === undefined) {
      throw AppError.validation('Cursor phân trang không hợp lệ.');
    }
    const dueAt = dueAtRaw !== 'null' ? new Date(dueAtRaw) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) {
      throw AppError.validation('Cursor phân trang không hợp lệ.');
    }

    const afterWithinPriority: SQL | undefined =
      dueAt !== null
        ? or(
            // dueAt lớn hơn (đến sau), rồi tới các dòng dueAt null (nulls last)...
            and(isNotNull(maintenanceTasks.dueAt), gt(maintenanceTasks.dueAt, dueAt)),
            isNull(maintenanceTasks.dueAt),
            // ...và cùng dueAt thì id nhỏ hơn.
            and(
              isNotNull(maintenanceTasks.dueAt),
              eq(maintenanceTasks.dueAt, dueAt),
              lt(maintenanceTasks.id, id),
            ),
          )
        : // Cursor ở dòng dueAt null: chỉ còn các dòng dueAt null có id nhỏ hơn.
          and(isNull(maintenanceTasks.dueAt), lt(maintenanceTasks.id, id));

    return or(
      lt(maintenanceTasks.priority, priority),
      and(eq(maintenanceTasks.priority, priority), afterWithinPriority),
    );
  }

  /**
   * POST /maintenance-tasks — chủ hồ sơ tạo việc bảo trì cho thiết bị đang gắn.
   *
   * - Hồ sơ không tồn tại/đã archive hoặc người ngoài → 404 (không lộ tồn tại).
   * - Người thân có link (caregiver) → 403; admin không phải chủ hồ sơ → 404.
   * - Thiết bị không đang gắn với hồ sơ → 400 kèm thông điệp rõ.
   * - `dueAt` ở quá khứ (ngoài sai số 1 phút) → 400.
   */
  async createTask(user: UserSummary, input: CreateTaskInput): Promise<MaintenanceTaskSummary> {
    const subjectAccess = await this.access.resolve(user.id, input.subjectId);
    if (!subjectAccess) {
      throw AppError.notFound('Không tìm thấy hồ sơ hoặc bạn không có quyền truy cập.');
    }
    if (subjectAccess.role !== 'owner') {
      throw AppError.forbidden('Chỉ chủ hồ sơ mới được tạo công việc bảo trì cho hồ sơ này.');
    }

    const assignmentRows = await this.db
      .select({ id: deviceAssignments.id })
      .from(deviceAssignments)
      .where(
        and(
          eq(deviceAssignments.deviceId, input.deviceId),
          eq(deviceAssignments.subjectId, input.subjectId),
          isNull(deviceAssignments.endedAt),
        ),
      )
      .limit(1);
    if (!assignmentRows[0]) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Thiết bị chưa được gắn với hồ sơ này (hoặc đã được tháo). Chọn thiết bị đang gắn của hồ sơ.',
        400,
        { field: 'deviceId' },
      );
    }

    const now = new Date();
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (dueAt && dueAt.getTime() < now.getTime() - DUE_AT_PAST_TOLERANCE_MS) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Hạn xử lý phải ở thời điểm sau hiện tại. Chọn ngày khác hoặc để trống.',
        400,
        { field: 'dueAt' },
      );
    }

    const inserted = await this.db
      .insert(maintenanceTasks)
      .values({
        deviceId: input.deviceId,
        subjectId: input.subjectId,
        kind: input.kind,
        title: input.title,
        status: 'open',
        priority: input.priority,
        dueAt,
        // `createTaskSchema` đã trim; chuỗi rỗng nghĩa là người dùng không nhập ghi chú.
        notes: input.notes ? input.notes : null,
        dedupeKey: `manual:${randomUUID()}`,
      })
      .returning();
    const row = inserted[0];
    if (!row) throw new Error('Không tạo được công việc bảo trì.');

    await this.audit.record({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'maintenance_task.create',
      targetType: 'maintenance_task',
      targetId: row.id,
      outcome: 'success',
      // Chỉ metadata kỹ thuật — không chứa ghi chú sức khỏe của người dùng.
      metadata: { kind: row.kind, priority: row.priority, deviceId: row.deviceId },
    });

    return toSummary(row);
  }

  async closeTask(
    user: UserSummary,
    taskId: string,
    input: CloseTask,
  ): Promise<MaintenanceTaskSummary> {
    const rows = await this.db
      .select()
      .from(maintenanceTasks)
      .where(eq(maintenanceTasks.id, taskId))
      .limit(1);
    const task = rows[0];
    if (!task) throw AppError.notFound('Không tìm thấy công việc bảo trì.');

    if (user.role !== 'admin') {
      // Admin được đóng task bất kể gắn hồ sơ nào; người thường phải qua quyền hồ sơ.
      if (!task.subjectId) {
        throw AppError.notFound('Không tìm thấy công việc bảo trì.');
      }
      const subjectAccess = await this.access.resolve(user.id, task.subjectId);
      if (!subjectAccess) {
        throw AppError.notFound('Không tìm thấy công việc bảo trì.');
      }
      if (subjectAccess.role !== 'owner') {
        throw AppError.forbidden('Chỉ chủ hồ sơ hoặc quản trị viên mới được đóng công việc này.');
      }
    }

    if (
      task.closedAt !== null ||
      (CLOSED_TASK_STATUSES as readonly string[]).includes(task.status)
    ) {
      throw AppError.conflict('Công việc đã được đóng trước đó.', {
        status: task.status,
        closedAt: task.closedAt ? task.closedAt.toISOString() : null,
      });
    }

    const now = new Date();
    await this.db
      .update(maintenanceTasks)
      .set({ status: 'done', closedAt: now, closeReason: input.reason })
      .where(eq(maintenanceTasks.id, taskId));
    await this.audit.record({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'maintenance_task.close',
      targetType: 'maintenance_task',
      targetId: task.id,
      outcome: 'success',
      metadata: { status: 'done' },
    });

    return toSummary({ ...task, status: 'done', closedAt: now, closeReason: input.reason });
  }
}
