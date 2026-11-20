import {
  careAdherenceSchema,
  reminderCompletionResultSchema,
  reminderDaySchema,
  reminderListSchema,
  reminderSchema,
  type CareAdherence,
  type CreateReminderInput,
  type ReminderDay,
  type ReminderList,
  type ReminderSummary,
  type ReminderCompletionResult,
  type ReminderCompletionStatus,
  type ReminderCompletionWrite,
  type UpdateReminderInput,
} from '@heart-iot/contracts/reminders';
import {
  careRulePreviewSchema,
  careRuleViewSchema,
  type CareRuleConfig,
  type CareRuleKind,
  type CareRulePreview,
  type CareRuleView,
} from '@heart-iot/contracts/care-rules';
import { apiRequest, parseResponse } from '../../lib/api';

/**
 * API client lịch nhắc chăm sóc (FR-15 phần web).
 *
 * Quyền do server quyết định: chủ hồ sơ tạo/sửa/xoá; người có
 * `canViewMeasurements` xem danh sách + occurrence hôm nay và đánh dấu.
 * Client không tự suy ra quyền từ dữ liệu tải về.
 */

/** GET /subjects/:id/reminders — danh sách lịch nhắc (sắp theo createdAt). */
export async function fetchReminders(
  subjectId: string,
  signal?: AbortSignal,
): Promise<ReminderList> {
  const data = await apiRequest<unknown>(`/subjects/${subjectId}/reminders`, { signal });
  return parseResponse(reminderListSchema, data);
}

/** GET /subjects/:id/reminders/today — occurrence hôm nay theo timezone hồ sơ. */
export async function fetchTodayReminders(
  subjectId: string,
  signal?: AbortSignal,
): Promise<ReminderDay> {
  const data = await apiRequest<unknown>(`/subjects/${subjectId}/reminders/today`, { signal });
  return parseResponse(reminderDaySchema, data);
}

/** GET /subjects/:id/care/adherence?days=7|30 — tổng hợp tuân thủ (V9.1). */
export async function fetchCareAdherence(
  subjectId: string,
  days: 7 | 30,
  signal?: AbortSignal,
): Promise<CareAdherence> {
  const data = await apiRequest<unknown>(
    `/subjects/${subjectId}/care/adherence?days=${days}`,
    { signal },
  );
  return parseResponse(careAdherenceSchema, data);
}

/** POST /subjects/:id/reminders — chỉ chủ hồ sơ. */
export async function createReminder(
  subjectId: string,
  input: CreateReminderInput,
): Promise<ReminderSummary> {
  const data = await apiRequest<unknown>(`/subjects/${subjectId}/reminders`, {
    method: 'POST',
    body: input,
  });
  return parseResponse(reminderSchema, data);
}

/** PATCH /subjects/:id/reminders/:reminderId — chỉ chủ hồ sơ; gửi trường đã đổi. */
export async function updateReminder(
  subjectId: string,
  reminderId: string,
  input: UpdateReminderInput,
): Promise<ReminderSummary> {
  const data = await apiRequest<unknown>(`/subjects/${subjectId}/reminders/${reminderId}`, {
    method: 'PATCH',
    body: input,
  });
  return parseResponse(reminderSchema, data);
}

/** DELETE /subjects/:id/reminders/:reminderId — chỉ chủ hồ sơ, 204. */
export async function deleteReminder(subjectId: string, reminderId: string): Promise<void> {
  await apiRequest<void>(`/subjects/${subjectId}/reminders/${reminderId}`, {
    method: 'DELETE',
  });
}

/** POST /subjects/:id/reminders/:reminderId/completions — upsert theo ngày + giờ. */
export async function completeReminder(
  subjectId: string,
  reminderId: string,
  input: ReminderCompletionWrite,
): Promise<ReminderCompletionResult> {
  const data = await apiRequest<unknown>(
    `/subjects/${subjectId}/reminders/${reminderId}/completions`,
    { method: 'POST', body: input },
  );
  return parseResponse(reminderCompletionResultSchema, data);
}

/** DELETE /subjects/:id/reminders/:reminderId/completions?date=&time= — 204/404. */
export async function undoReminderCompletion(
  subjectId: string,
  reminderId: string,
  occurrence: { date: string; time: string },
): Promise<void> {
  const search = new URLSearchParams({ date: occurrence.date, time: occurrence.time });
  await apiRequest<void>(
    `/subjects/${subjectId}/reminders/${reminderId}/completions?${search.toString()}`,
    { method: 'DELETE' },
  );
}

/** Nhãn chữ cho trạng thái occurrence; màu không phải tín hiệu duy nhất. */
export const REMINDER_STATUS_LABELS: Record<
  ReminderCompletionStatus | 'pending',
  string
> = {
  pending: 'Chưa đánh dấu',
  done: 'Đã thực hiện',
  skipped: 'Đã bỏ qua',
};


/** GET /subjects/:id/care-rules/:kind — chỉ chủ hồ sơ (V9.2). */
export async function fetchCareRule(
  subjectId: string,
  kind: CareRuleKind,
  signal?: AbortSignal,
): Promise<CareRuleView> {
  const data = await apiRequest<unknown>(`/subjects/${subjectId}/care-rules/${kind}`, { signal });
  return parseResponse(careRuleViewSchema, data);
}

/** PUT /subjects/:id/care-rules/:kind — tạo version mới, chỉ chủ hồ sơ. */
export async function updateCareRule(
  subjectId: string,
  kind: CareRuleKind,
  config: CareRuleConfig,
): Promise<CareRuleView> {
  const data = await apiRequest<unknown>(`/subjects/${subjectId}/care-rules/${kind}`, {
    method: 'PUT',
    body: config,
  });
  return parseResponse(careRuleViewSchema, data);
}

/** POST /subjects/:id/care-rules/:kind/previews — lịch 7 ngày, không ghi. */
export async function previewCareRule(
  subjectId: string,
  kind: CareRuleKind,
): Promise<CareRulePreview> {
  const data = await apiRequest<unknown>(
    `/subjects/${subjectId}/care-rules/${kind}/previews`,
    { method: 'POST' },
  );
  return parseResponse(careRulePreviewSchema, data);
}
