import {
  closeTaskSchema,
  maintenanceTaskListSchema,
  type CloseTask,
  type MaintenanceTaskList,
  type MaintenanceTaskStatus,
} from '@annhien/contracts/tasks';
import { apiRequest, parseResponse } from '../../lib/api';

/**
 * API client công việc bảo trì (wave 4 fe-admin-ai).
 * Chỉ xem theo quyền hồ sơ và đóng task (chủ hồ sơ/admin) — không sinh task định kỳ.
 */
export const tasksQueryKeys = {
  list: (status: MaintenanceTaskStatus | 'open' | 'closed' | 'all') =>
    ['maintenance-tasks', status] as const,
};

export interface TaskListParams {
  status?: 'open' | 'closed' | 'all';
  cursor?: string;
  limit?: number;
}

/** GET /maintenance-tasks — mặc định status=open; phân trang cursor. */
export async function fetchMaintenanceTasks(
  params: TaskListParams = {},
  signal?: AbortSignal,
): Promise<MaintenanceTaskList> {
  const search = new URLSearchParams();
  search.set('status', params.status ?? 'open');
  search.set('limit', String(params.limit ?? 20));
  if (params.cursor) search.set('cursor', params.cursor);
  const data = await apiRequest<unknown>(`/maintenance-tasks?${search.toString()}`, { signal });
  return parseResponse(maintenanceTaskListSchema, data);
}

/** POST /maintenance-tasks/:id/close — lý do đóng 3..500; 409 khi task đã đóng. */
export async function closeMaintenanceTask(
  taskId: string,
  input: CloseTask,
): Promise<unknown> {
  const data = await apiRequest<unknown>(`/maintenance-tasks/${taskId}/close`, {
    method: 'POST',
    body: input,
  });
  return data;
}

export { closeTaskSchema };
