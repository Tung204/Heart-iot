import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ReminderCompletionStatus,
  ReminderDay,
  ReminderSummary,
} from '@heart-iot/contracts/reminders';
import { queryKeys } from '../../lib/query';
import { completeReminder, undoReminderCompletion } from './api';

interface CompleteVariables {
  reminder: ReminderSummary;
  date: string;
  time: string;
  status: ReminderCompletionStatus;
}

interface UndoVariables {
  reminderId: string;
  date: string;
  time: string;
}

function occurrenceKey(reminderId: string, time: string): string {
  return `${reminderId}|${time}`;
}

/**
 * Đánh dấu / bỏ qua / hoàn tác occurrence hôm nay — dùng chung cho trang
 * Nhắc chăm sóc và thẻ "Nhắc hôm nay" trên Hôm nay.
 *
 * Tối ưu trước (mark-read hiện có): sửa cache `remindersToday` ngay, hoàn lại
 * ảnh chụp nếu API lỗi, và invalidate sau khi xong để tải lại đúng từ máy chủ.
 * Hai nơi dùng cùng query key nên chỉ một lần tải và một nguồn trạng thái.
 */
export function useReminderCompletion(subjectId: string | null) {
  const queryClient = useQueryClient();
  const key = subjectId ? queryKeys.remindersToday(subjectId) : null;

  const patchOccurrence = (
    reminderId: string,
    time: string,
    patch: (day: ReminderDay) => ReminderDay,
  ): void => {
    if (!key) return;
    queryClient.setQueryData<ReminderDay>(key, (previous) =>
      previous ? patch(previous) : previous,
    );
  };

  const write = useMutation({
    mutationFn: (variables: CompleteVariables) => {
      if (!subjectId) throw new Error('Chưa chọn hồ sơ.');
      return completeReminder(subjectId, variables.reminder.id, {
        date: variables.date,
        time: variables.time,
        status: variables.status,
      });
    },
    onMutate: async (variables) => {
      if (!key) return { previous: undefined };
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ReminderDay>(key);
      patchOccurrence(variables.reminder.id, variables.time, (day) => ({
        ...day,
        items: day.items.map((item) =>
          item.reminder.id === variables.reminder.id && item.time === variables.time
            ? {
                ...item,
                status: variables.status,
                completion: {
                  status: variables.status,
                  completedAt: new Date().toISOString(),
                  completedBy: null,
                },
              }
            : item,
        ),
      }));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (key && context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      if (key) void queryClient.invalidateQueries({ queryKey: key });
      if (subjectId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.careAdherenceAll(subjectId) });
      }
    },
  });

  const undo = useMutation({
    mutationFn: (variables: UndoVariables) => {
      if (!subjectId) throw new Error('Chưa chọn hồ sơ.');
      return undoReminderCompletion(subjectId, variables.reminderId, {
        date: variables.date,
        time: variables.time,
      });
    },
    onMutate: async (variables) => {
      if (!key) return { previous: undefined };
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ReminderDay>(key);
      patchOccurrence(variables.reminderId, variables.time, (day) => ({
        ...day,
        items: day.items.map((item) =>
          item.reminder.id === variables.reminderId && item.time === variables.time
            ? { ...item, status: 'pending', completion: null }
            : item,
        ),
      }));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (key && context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      if (key) void queryClient.invalidateQueries({ queryKey: key });
      if (subjectId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.careAdherenceAll(subjectId) });
      }
    },
  });

  const pendingKey = write.isPending
    ? occurrenceKey(write.variables.reminder.id, write.variables.time)
    : undo.isPending
      ? occurrenceKey(undo.variables.reminderId, undo.variables.time)
      : null;

  return {
    complete: (reminder: ReminderSummary, date: string, time: string) =>
      write.mutate({ reminder, date, time, status: 'done' }),
    skip: (reminder: ReminderSummary, date: string, time: string) =>
      write.mutate({ reminder, date, time, status: 'skipped' }),
    undo: (reminderId: string, date: string, time: string) =>
      undo.mutate({ reminderId, date, time }),
    isPending: (reminderId: string, time: string) =>
      pendingKey === occurrenceKey(reminderId, time),
    error: write.error ?? undo.error,
    reset: () => {
      write.reset();
      undo.reset();
    },
    occurrenceKey,
  };
}
