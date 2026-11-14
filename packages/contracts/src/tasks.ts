import { z } from 'zod';
import { idSchema, isoDateTimeSchema, pageSchema } from './core';

/**
 * Công việc bảo trì thiết bị — wave 3 be-admin.
 *
 * Task gắn với thiết bị; có thể gắn với hồ sơ (`subjectId`) hoặc không gắn hồ sơ
 * nào (task toàn hệ thống, chỉ admin thấy). Quyền xem theo hồ sơ qua AccessService:
 * chủ hồ sơ thấy task của thiết bị thuộc hồ sơ mình; người thân cần quyền
 * `canReceiveAlerts`; admin không có link hồ sơ → 404 (trừ task không gắn subject).
 * Wave này không tự sinh task định kỳ — chỉ xem và đóng.
 */

export const maintenanceTaskStatusSchema = z.enum(['open', 'in_progress', 'done', 'cancelled']);
export type MaintenanceTaskStatus = z.infer<typeof maintenanceTaskStatusSchema>;

export const OPEN_TASK_STATUSES: readonly MaintenanceTaskStatus[] = ['open', 'in_progress'];
export const CLOSED_TASK_STATUSES: readonly MaintenanceTaskStatus[] = ['done', 'cancelled'];

/** GET /maintenance-tasks — lọc theo trạng thái, hồ sơ, thiết bị + phân trang cursor. */
export const maintenanceTaskQuerySchema = z.object({
  status: z.enum(['open', 'closed', 'all']).default('open'),
  subjectId: idSchema.optional(),
  deviceId: idSchema.optional(),
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type MaintenanceTaskQuery = z.infer<typeof maintenanceTaskQuerySchema>;

export const maintenanceTaskSummarySchema = z.object({
  id: idSchema,
  deviceId: idSchema,
  subjectId: idSchema.nullable(),
  kind: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  status: maintenanceTaskStatusSchema,
  priority: z.number().int().min(0).max(100),
  dueAt: isoDateTimeSchema.nullable(),
  notes: z.string().max(2000).nullable(),
  createdAt: isoDateTimeSchema,
  closedAt: isoDateTimeSchema.nullable(),
  closeReason: z.string().max(500).nullable(),
});
export type MaintenanceTaskSummary = z.infer<typeof maintenanceTaskSummarySchema>;

export const maintenanceTaskListSchema = pageSchema(maintenanceTaskSummarySchema);
export type MaintenanceTaskList = z.infer<typeof maintenanceTaskListSchema>;

/** POST /maintenance-tasks/:id/close — lý do đóng 3..500 ký tự. */
export const closeTaskSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();
export type CloseTask = z.infer<typeof closeTaskSchema>;
