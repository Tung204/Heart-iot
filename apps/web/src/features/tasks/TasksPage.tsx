import { useState } from 'react';
import type { FormEvent } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { MaintenanceTaskSummary } from '@annhien/contracts/tasks';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { formatDateTime, formatRelativeTime } from '../../lib/format';
import { getApiErrorMessage, isConflictError } from '../../lib/api';
import { zodFieldErrorMap } from '../../lib/validation';
import { useMe } from '../auth/useAuth';
import { useSubjects } from '../subjects/useSubjects';
import { closeMaintenanceTask, closeTaskSchema, fetchMaintenanceTasks, tasksQueryKeys } from './api';

const STATUS_LABELS: Record<MaintenanceTaskSummary['status'], string> = {
  open: 'Mở',
  in_progress: 'Đang làm',
  done: 'Xong',
  cancelled: 'Đã hủy',
};

const STATUS_TONES: Record<MaintenanceTaskSummary['status'], 'sand' | 'teal' | 'neutral'> = {
  open: 'sand',
  in_progress: 'sand',
  done: 'teal',
  cancelled: 'neutral',
};

type Filter = 'open' | 'closed';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'open', label: 'Đang mở' },
  { value: 'closed', label: 'Đã đóng' },
];

const PAGE_SIZE = 20;

/**
 * /app/tasks — công việc bảo trì thiết bị:
 * - Lọc open/closed, phân trang cursor (Tải thêm).
 * - Đóng task bắt buộc lý do 3..500 ký tự, có xác nhận hai bước; 409 → tải lại.
 * - Chủ hồ sơ (role owner) và admin thấy nút đóng; caregiver chỉ xem.
 * - Admin thấy cả task không gắn hồ sơ (subjectId null).
 */
export function TasksPage() {
  const me = useMe();
  const subjects = useSubjects();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<Filter>('open');
  const [closing, setClosing] = useState<MaintenanceTaskSummary | null>(null);
  const [reason, setReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ fields: Record<string, string>; general: string[] }>({
    fields: {},
    general: [],
  });
  const [staleInfo, setStaleInfo] = useState<string | null>(null);
  const [closeNotice, setCloseNotice] = useState<string | null>(null);

  const user = me.data?.user;
  const isAdmin = user?.role === 'admin';

  const tasks = useInfiniteQuery({
    queryKey: tasksQueryKeys.list(filter),
    queryFn: ({ signal, pageParam }) =>
      fetchMaintenanceTasks({ status: filter, cursor: pageParam, limit: PAGE_SIZE }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    staleTime: 15_000,
  });

  const closeTask = useMutation({
    mutationFn: () => {
      if (!closing) throw new Error('Chưa chọn công việc để đóng.');
      return closeMaintenanceTask(closing.id, { reason });
    },
    onSuccess: () => {
      const title = closing?.title ?? '';
      setClosing(null);
      setReason('');
      setFieldErrors({ fields: {}, general: [] });
      setStaleInfo(null);
      setCloseNotice(`Đã đóng công việc "${title}".`);
      void queryClient.invalidateQueries({ queryKey: tasksQueryKeys.list(filter) });
    },
    onError: (error) => {
      if (isConflictError(error)) {
        setStaleInfo(getApiErrorMessage(error, 'Công việc đã thay đổi ở nơi khác.'));
      }
    },
  });

  const subjectNameById = new Map((subjects.data ?? []).map((subject) => [subject.id, subject.displayName]));

  const pages = tasks.data?.pages ?? [];
  const items = pages.flatMap((page) => page?.items ?? []);
  const nextCursor = pages.at(-1)?.nextCursor ?? null;

  const handleCloseSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = closeTaskSchema.safeParse({ reason });
    if (!parsed.success) {
      setFieldErrors(
        zodFieldErrorMap(parsed.error, { reason }, {
          reason: (issue, value) => {
            const text = String(value ?? '').trim();
            if (text === '') return 'Vui lòng nhập lý do đóng công việc.';
            if (issue.code === 'too_small') return 'Lý do quá ngắn (tối thiểu 3 ký tự).';
            if (issue.code === 'too_big') return 'Lý do quá dài (tối đa 500 ký tự).';
            return 'Lý do chưa hợp lệ.';
          },
        }),
      );
      return;
    }
    setFieldErrors({ fields: {}, general: [] });
    closeTask.mutate();
  };

  const canClose = (task: MaintenanceTaskSummary) => {
    const subjectRole = subjects.data?.find((subject) => subject.id === task.subjectId)?.role;
    return task.subjectId === null ? isAdmin : subjectRole === 'owner' || isAdmin;
  };

  const handleReload = () => {
    setStaleInfo(null);
    setCloseNotice(null);
    setClosing(null);
    void queryClient.invalidateQueries({ queryKey: tasksQueryKeys.list(filter) });
  };

  return (
    <div className="stack">
      <header>
        <h1 className="page-title">Công việc bảo trì</h1>
        <p className="page-lead">
          Công việc gắn với thiết bị của hồ sơ bạn theo dõi. Chủ hồ sơ (và admin) có thể đóng công
          việc kèm lý do; người thân chỉ xem.
        </p>
      </header>

      {staleInfo ? (
        <Alert tone="warning" title="Công việc đã thay đổi">
          {staleInfo}
          <div style={{ marginTop: '0.75rem' }}>
            <Button variant="secondary" size="sm" onClick={handleReload}>
              Tải lại
            </Button>
          </div>
        </Alert>
      ) : null}
      {closeNotice ? <Alert tone="success">{closeNotice}</Alert> : null}

      <div className="segmented" role="group" aria-label="Lọc theo trạng thái">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`segmented__item${filter === option.value ? ' is-active' : ''}`}
            aria-pressed={filter === option.value}
            onClick={() => {
              setFilter(option.value);
              setClosing(null);
              setStaleInfo(null);
              setCloseNotice(null);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tasks.isPending ? (
        <PageLoader label="Đang tải công việc…" />
      ) : tasks.isError ? (
        <ErrorState
          title="Không tải được danh sách công việc"
          message={getApiErrorMessage(tasks.error)}
          onRetry={() => void tasks.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={filter === 'open' ? 'Không có công việc đang mở' : 'Không có công việc đã đóng'}
          description={
            filter === 'open'
              ? 'Khi thiết bị cần bảo trì, công việc sẽ xuất hiện tại đây.'
              : 'Công việc đã đóng hoặc hủy sẽ hiển thị tại đây.'
          }
        />
      ) : (
        <ul className="task-list" aria-label="Danh sách công việc">
          {items.map((task) => {
            const subjectName = task.subjectId
              ? subjectNameById.get(task.subjectId) ?? 'Hồ sơ đã bị thu hồi quyền'
              : null;
            return (
              <li key={task.id} className="task-card">
                <div className="task-card__main">
                  <p className="task-card__title">
                    {task.title}
                    <StatusPill tone={STATUS_TONES[task.status]}>{STATUS_LABELS[task.status]}</StatusPill>
                  </p>
                  <p className="task-card__meta">
                    Điểm ưu tiên {task.priority}/100
                    {subjectName ? ` · ${subjectName}` : ' · không gắn hồ sơ'}
                    {' · '}thiết bị #{task.deviceId.slice(0, 8)}
                    {task.dueAt ? ` · hạn ${formatDateTime(task.dueAt)}` : ' · không có hạn'}
                  </p>
                  {task.notes ? <p className="task-card__notes">{task.notes}</p> : null}
                  {task.closedAt && task.closeReason ? (
                    <p className="task-card__meta">
                      Đóng lúc {formatDateTime(task.closedAt)} — {task.closeReason}
                    </p>
                  ) : null}
                </div>
                <div className="task-card__side">
                  {closing?.id === task.id ? (
                    <form className="task-close-form" onSubmit={handleCloseSubmit} noValidate>
                      <div className="field">
                        <label className="field__label" htmlFor={`task-reason-${task.id}`}>
                          Lý do đóng <span className="field__required" aria-hidden="true"> *</span>
                        </label>
                        <p className="field__hint" id={`task-reason-${task.id}-hint`}>
                          3–500 ký tự. Ví dụ: "Đã thay pin và kiểm tra lại thiết bị hoạt động ổn định."
                        </p>
                        <textarea
                          id={`task-reason-${task.id}`}
                          className={`field__input${fieldErrors.fields.reason ? ' field__input--error' : ''}`}
                          aria-invalid={fieldErrors.fields.reason ? true : undefined}
                          aria-describedby={`task-reason-${task.id}-hint`}
                          rows={3}
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          maxLength={600}
                        />
                        {fieldErrors.fields.reason ? (
                          <p className="field__error" role="alert">
                            {fieldErrors.fields.reason}
                          </p>
                        ) : null}
                      </div>
                      <div className="task-close-form__actions">
                        <Button type="submit" variant="danger" size="sm" disabled={closeTask.isPending}>
                          {closeTask.isPending ? 'Đang đóng…' : 'Xác nhận đóng'}
                        </Button>
                        <Button
                          variant="subtle"
                          size="sm"
                          disabled={closeTask.isPending}
                          onClick={() => {
                            setClosing(null);
                            setReason('');
                            setFieldErrors({ fields: {}, general: [] });
                          }}
                        >
                          Hủy
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      {task.status === 'open' || task.status === 'in_progress' ? (
                        canClose(task) ? (
                          <Button variant="secondary" size="sm" onClick={() => setClosing(task)}>
                            Đóng công việc
                          </Button>
                        ) : (
                          <StatusPill tone="neutral">Chỉ xem</StatusPill>
                        )
                      ) : (
                        <span className="task-card__meta">
                          {task.createdAt ? `Tạo ${formatRelativeTime(task.createdAt)}` : ''}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor ? (
        <div className="task-load-more">
          <Button
            variant="secondary"
            onClick={() => void tasks.fetchNextPage()}
            disabled={tasks.isFetchingNextPage}
          >
            {tasks.isFetchingNextPage ? 'Đang tải…' : 'Tải thêm'}
          </Button>
        </div>
      ) : null}

      {closeTask.isError && !staleInfo ? (
        <Alert tone="error" title="Không đóng được công việc">
          {getApiErrorMessage(closeTask.error)}
        </Alert>
      ) : null}
    </div>
  );
}
