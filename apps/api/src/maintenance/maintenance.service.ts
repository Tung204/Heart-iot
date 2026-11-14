import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import {
  CLOSED_TASK_STATUSES,
  OPEN_TASK_STATUSES,
  maintenanceTaskListSchema,
  maintenanceTaskSummarySchema,
  type CloseTask,
  type MaintenanceTaskList,
  type MaintenanceTaskQuery,
  type MaintenanceTaskSummary,
} from '@annhien/contracts/tasks';
import type { UserSummary } from '@annhien/contracts';
import { DB, type AppDb } from '../database/database';
import { maintenanceTasks } from '../database/schema';
import { AccessService } from '../access/access.service';
import { AuditService } from '../access/audit.service';
import { AppError } from '../common/app-error';
import { decodeCursor, encodeCursor } from '../common/pagination';

type TaskRow = typeof maintenanceTasks.$inferSelect;

/**
 * MaintenanceService — xem/đóng công việc bảo trì.
 *
 * Quyền xem (dùng lại AccessService, không tự viết lại luật hồ sơ):
 * - Lọc theo `subjectId`: chủ hồ sơ thấy task của hồ sơ; caregiver cần
 *   `canReceiveAlerts` (thiếu → 403 vì đã có link, chỉ thiếu quyền);
 *   người ngoài và admin không có link → 404.
 * - Không truyền `subjectId`: người thường thấy task của mọi hồ sơ mình
 *   sở hữu/chăm sóc có `canReceiveAlerts`; admin chỉ thấy task KHÔNG gắn
 *   hồ sơ (`subjectId IS NULL`).
 * Đóng task: chỉ chủ hồ sơ (có `subjectId`) hoặc admin; task đã đóng → 409.
 * Wave này không sinh task định kỳ — chỉ đọc và đóng.
 */

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
