import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateTaskInput, MaintenanceTaskSummary } from '@heart-iot/contracts/tasks';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { TextField } from '../../components/Field';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { formatDateTime, formatRelativeTime } from '../../lib/format';
import { getApiErrorMessage, isApiError, isConflictError } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { zodFieldErrorMap } from '../../lib/validation';
import { useMe } from '../auth/useAuth';
import { fetchSubjectDevices } from '../devices/api';
import { SubjectContextLine } from '../subjects/SubjectSwitcher';
import { useSubjects } from '../subjects/useSubjects';
import {
  closeMaintenanceTask,
  closeTaskSchema,
  createMaintenanceTask,
  createTaskSchema,
  fetchMaintenanceTasks,
  tasksQueryKeys,
} from './api';
import '../../styles/people.css';
import './tasks.css';

const STATUS_LABELS: Record<MaintenanceTaskSummary['status'], string> = {
  open: 'Đang mở',
  in_progress: 'Đang làm',
  done: 'Đã đóng',
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

const KIND_OPTIONS: ReadonlyArray<{ value: CreateTaskInput['kind']; label: string }> = [
  { value: 'maintenance', label: 'Bảo trì định kỳ' },
  { value: 'signal_check', label: 'Kiểm tra tín hiệu' },
  { value: 'battery_check', label: 'Kiểm tra pin' },
  { value: 'device_check', label: 'Kiểm tra thiết bị' },
  { value: 'other', label: 'Việc khác' },
];

type TaskFormErrors = { fields: Record<string, string>; general: string[] };
const EMPTY_FORM_ERRORS: TaskFormErrors = { fields: {}, general: [] };

/** Thông điệp thân thiện cho lỗi tạo việc; 400/422 dùng message đã rõ của server. */
function createErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 403) {
      return 'Bạn không có quyền tạo việc cho hồ sơ này. Chỉ chủ hồ sơ mới có thể tạo.';
    }
    if (error.status === 404) {
      return 'Không tìm thấy hồ sơ hoặc thiết bị phù hợp. Quyền truy cập có thể vừa thay đổi — tải lại trang và thử lại.';
    }
  }
  return getApiErrorMessage(error, 'Không tạo được công việc. Vui lòng thử lại.');
}

/**
 * /app/tasks — công việc bảo trì thiết bị, phạm vi **tất cả hồ sơ có quyền**:
 * - Vào từ hàng Người thân / header Thiết bị; không phải mục nav thứ năm.
 * - Lọc open/closed, phân trang cursor (Tải thêm).
 * - Chủ hồ sơ tạo việc cho thiết bị đang gắn (form tại chỗ, validate contract).
 * - Đóng task bắt buộc lý do 3..500 ký tự, có xác nhận hai bước; 409 → tải lại.
 * - Chủ hồ sơ (role owner) và admin thấy nút đóng; caregiver chỉ xem.
 * - Task không gắn hồ sơ (admin/kỹ thuật) được tách thành nhóm riêng.
 */
export function TasksPage() {
  const me = useMe();
  const subjects = useSubjects();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<Filter>('open');
  const [closing, setClosing] = useState<MaintenanceTaskSummary | null>(null);
  const [reason, setReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState<TaskFormErrors>(EMPTY_FORM_ERRORS);
  const [staleInfo, setStaleInfo] = useState<string | null>(null);
  const [closeNotice, setCloseNotice] = useState<string | null>(null);

  const user = me.data?.user;
  const isAdmin = user?.role === 'admin';

  const [createOpen, setCreateOpen] = useState(false);
  const [createSubjectId, setCreateSubjectId] = useState<string | null>(null);
  const [createDeviceId, setCreateDeviceId] = useState('');
  const [createKind, setCreateKind] = useState<CreateTaskInput['kind']>('maintenance');
  const [createTitle, setCreateTitle] = useState('');
  const [createPriority, setCreatePriority] = useState('50');
  const [createDueDate, setCreateDueDate] = useState('');
  const [createNotes, setCreateNotes] = useState('');
  const [createErrors, setCreateErrors] = useState<TaskFormErrors>(EMPTY_FORM_ERRORS);
  const [createServerError, setCreateServerError] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState<string | null>(null);
  const createButtonRef = useRef<HTMLButtonElement | null>(null);
  const createTitleRef = useRef<HTMLInputElement | null>(null);
  const closeReasonRef = useRef<HTMLTextAreaElement | null>(null);
  /** Focus trả về đúng nút “Đóng công việc” của task vừa huỷ xác nhận. */
  const closeTriggerRefs = useRef(new Map<string, HTMLButtonElement | null>());
  /** Id cần focus lại khi nút được mount lại sau khi huỷ xác nhận. */
  const pendingFocusRef = useRef<string | null>(null);

  // Chỉ chủ hồ sơ mới tạo được việc; caregiver/admin không sở hữu hồ sơ thì không thấy nút.
  const ownerSubjects = (subjects.data ?? []).filter((subject) => subject.role === 'owner');
  const canCreate = ownerSubjects.length > 0;

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
      void queryClient.invalidateQueries({ queryKey: tasksQueryKeys.all });
    },
    onError: (error) => {
      if (isConflictError(error)) {
        setStaleInfo(getApiErrorMessage(error, 'Công việc đã thay đổi ở nơi khác.'));
      }
    },
  });

  // Thiết bị đang gắn của hồ sơ được chọn trong form tạo việc.
  const createDevices = useQuery({
    queryKey: createSubjectId
      ? queryKeys.subjectDevices(createSubjectId)
      : (['subjects', 'none', 'devices'] as const),
    queryFn: ({ signal }) =>
      createSubjectId ? fetchSubjectDevices(createSubjectId, signal) : Promise.resolve(null),
    enabled: createOpen && Boolean(createSubjectId),
    staleTime: 15_000,
  });
  const createDeviceItems = createDevices.data?.items ?? [];
  const createDeviceUnavailable =
    createDevices.isPending || createDevices.isError || createDeviceItems.length === 0;

  // Đổi hồ sơ thì chọn lại thiết bị đầu tiên còn đang gắn; không giữ id của hồ sơ trước.
  useEffect(() => {
    if (!createOpen) return;
    const items = createDevices.data?.items ?? [];
    setCreateDeviceId((current) =>
      items.some((device) => device.deviceId === current) ? current : (items[0]?.deviceId ?? ''),
    );
  }, [createOpen, createDevices.data]);

  useEffect(() => {
    if (createOpen) createTitleRef.current?.focus();
  }, [createOpen]);

  useEffect(() => {
    if (closing) closeReasonRef.current?.focus();
  }, [closing]);

  const createTaskMutation = useMutation({
    mutationFn: createMaintenanceTask,
    onSuccess: (task) => {
      setCreateOpen(false);
      setCreateNotice(`Đã tạo công việc "${task.title}".`);
      setCreateErrors(EMPTY_FORM_ERRORS);
      setCreateServerError(null);
      setCreateKind('maintenance');
      setCreateTitle('');
      setCreatePriority('50');
      setCreateDueDate('');
      setCreateNotes('');
      if (filter === 'closed') setFilter('open');
      void queryClient.invalidateQueries({ queryKey: tasksQueryKeys.all });
      createButtonRef.current?.focus();
    },
    onError: (error) => {
      // Giữ nguyên dữ liệu form để người dùng sửa và gửi lại.
      setCreateServerError(createErrorMessage(error));
    },
  });

  const openCreateForm = () => {
    if (!canCreate) return;
    setCreateSubjectId((current) =>
      ownerSubjects.some((subject) => subject.id === current)
        ? current
        : (ownerSubjects[0]?.id ?? null),
    );
    setCreateDeviceId('');
    setCreateErrors(EMPTY_FORM_ERRORS);
    setCreateServerError(null);
    setCreateNotice(null);
    setCreateOpen(true);
  };

  const closeCreateForm = () => {
    setCreateOpen(false);
    setCreateErrors(EMPTY_FORM_ERRORS);
    setCreateServerError(null);
    createButtonRef.current?.focus();
  };

  const handleCreateKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape' && !createTaskMutation.isPending) {
      event.stopPropagation();
      closeCreateForm();
    }
  };

  const cancelClose = () => {
    if (closing) pendingFocusRef.current = closing.id;
    setClosing(null);
    setReason('');
    setFieldErrors({ fields: {}, general: [] });
  };

  const handleCloseKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape' && !closeTask.isPending) {
      event.stopPropagation();
      cancelClose();
    }
  };

  const handleCreateSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!createSubjectId) {
      setCreateErrors({ fields: {}, general: ['Chọn hồ sơ trước khi tạo việc.'] });
      return;
    }
    if (createDeviceUnavailable) return;

    let dueAt: string | undefined;
    if (createDueDate) {
      const parsedDate = new Date(`${createDueDate}T23:59:59`);
      if (Number.isNaN(parsedDate.getTime())) {
        setCreateErrors({ fields: { dueAt: 'Hạn xử lý chưa hợp lệ.' }, general: [] });
        return;
      }
      dueAt = parsedDate.toISOString();
    }

    const priorityValue = createPriority.trim() === '' ? Number.NaN : Number(createPriority);
    const values = {
      subjectId: createSubjectId,
      deviceId: createDeviceId,
      kind: createKind,
      title: createTitle,
      priority: priorityValue,
      dueAt,
      notes: createNotes,
    };
    const parsed = createTaskSchema.safeParse(values);
    if (!parsed.success) {
      setCreateErrors(
        zodFieldErrorMap(parsed.error, values, {
          subjectId: () => 'Chọn hồ sơ cần tạo việc.',
          deviceId: () => 'Chọn thiết bị đang gắn với hồ sơ.',
          kind: () => 'Chọn loại việc.',
          title: (issue, value) => {
            if (String(value ?? '').trim() === '') return 'Vui lòng nhập tiêu đề công việc.';
            if (issue.code === 'too_small') return 'Tiêu đề quá ngắn (tối thiểu 4 ký tự).';
            if (issue.code === 'too_big') return 'Tiêu đề quá dài (tối đa 200 ký tự).';
            return 'Tiêu đề chưa hợp lệ.';
          },
          priority: (issue, value) => {
            if (String(value ?? '').trim() === '' || Number.isNaN(Number(value))) {
              return 'Vui lòng nhập ưu tiên từ 0 đến 100.';
            }
            if (issue.code === 'too_small') return 'Ưu tiên thấp nhất là 0.';
            if (issue.code === 'too_big') return 'Ưu tiên cao nhất là 100.';
            return 'Ưu tiên phải là số nguyên từ 0 đến 100.';
          },
          dueAt: () => 'Hạn xử lý chưa hợp lệ.',
          notes: (issue) =>
            issue.code === 'too_big' ? 'Ghi chú quá dài (tối đa 2000 ký tự).' : 'Ghi chú chưa hợp lệ.',
        }),
      );
      return;
    }
    setCreateErrors(EMPTY_FORM_ERRORS);
    setCreateServerError(null);
    createTaskMutation.mutate(parsed.data);
  };

  const subjectNameById = new Map(
    (subjects.data ?? []).map((subject) => [subject.id, subject.displayName]),
  );

  const pages = tasks.data?.pages ?? [];
  const items = pages.flatMap((page) => page?.items ?? []);
  const nextCursor = pages.at(-1)?.nextCursor ?? null;
  const subjectTasks = items.filter((task) => task.subjectId !== null);
  const technicalTasks = items.filter((task) => task.subjectId === null);

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
    void queryClient.invalidateQueries({ queryKey: tasksQueryKeys.all });
  };

  const renderTask = (task: MaintenanceTaskSummary) => {
    const subjectName = task.subjectId
      ? subjectNameById.get(task.subjectId) ?? 'Hồ sơ đã bị thu hồi quyền'
      : 'Việc kỹ thuật không gắn hồ sơ';
    return (
      <li key={task.id} className="people-row">
        <div className="people-row__identity">
          <p className="people-row__name">
            <span>{task.title}</span>
            <StatusPill tone={STATUS_TONES[task.status]}>{STATUS_LABELS[task.status]}</StatusPill>
          </p>
          <dl className="people-kv">
            <dt>Hồ sơ</dt>
            <dd>{subjectName}</dd>
            <dt>Mã thiết bị</dt>
            <dd className="people-code">
              <span title={task.deviceId}>{task.deviceId.slice(0, 8)}…</span>
            </dd>
            <dt>Ưu tiên</dt>
            <dd>{task.priority}/100</dd>
            <dt>Hạn xử lý</dt>
            <dd>{task.dueAt ? formatDateTime(task.dueAt) : 'Không có hạn'}</dd>
            {task.closedAt ? (
              <>
                <dt>Đóng lúc</dt>
                <dd>
                  {formatDateTime(task.closedAt)}
                  {task.closeReason ? ` — ${task.closeReason}` : ''}
                </dd>
              </>
            ) : task.createdAt ? (
              <>
                <dt>Tạo</dt>
                <dd>{formatRelativeTime(task.createdAt)}</dd>
              </>
            ) : null}
          </dl>
          {task.notes ? <p className="people-meta">{task.notes}</p> : null}
        </div>
        <div className="people-row__actions">
          {closing?.id === task.id ? (
            <form
              className="people-confirm task-close-form"
              role="group"
              aria-label="Xác nhận đóng công việc"
              onSubmit={handleCloseSubmit}
              onKeyDown={handleCloseKeyDown}
              noValidate
            >
              <div className="field">
                <label className="field__label" htmlFor={`task-reason-${task.id}`}>
                  Lý do đóng <span className="field__required" aria-hidden="true"> *</span>
                </label>
                <p className="field__hint" id={`task-reason-${task.id}-hint`}>
                  3–500 ký tự. Ví dụ: "Đã thay pin và kiểm tra lại thiết bị hoạt động ổn định."
                </p>
                <textarea
                  id={`task-reason-${task.id}`}
                  ref={closeReasonRef}
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
              <div className="people-form__actions">
                <Button type="submit" variant="danger" size="sm" disabled={closeTask.isPending}>
                  {closeTask.isPending ? 'Đang đóng…' : 'Xác nhận đóng'}
                </Button>
                <Button
                  variant="subtle"
                  size="sm"
                  disabled={closeTask.isPending}
                  onClick={cancelClose}
                >
                  Hủy
                </Button>
              </div>
            </form>
          ) : task.status === 'open' || task.status === 'in_progress' ? (
            canClose(task) ? (
              <Button
                ref={(element) => {
                  if (!element) return;
                  closeTriggerRefs.current.set(task.id, element);
                  if (pendingFocusRef.current === task.id) {
                    pendingFocusRef.current = null;
                    element.focus();
                  }
                }}
                variant="secondary"
                size="sm"
                onClick={() => setClosing(task)}
              >
                Đóng công việc
              </Button>
            ) : (
              <StatusPill tone="neutral">Chỉ xem</StatusPill>
            )
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <div className="stack people-page">
      {/*
        Breadcrumb đặt ngoài PageHeader: trên desktop primitive xếp breadcrumb
        thành flex item ngang nên H1 bị đẩy vào giữa. Đã báo ở handoff lane R.
      */}
      <Link className="people-breadcrumb" to="/app/subjects">
        ← Người thân
      </Link>
      <PageHeader
        title="Công việc bảo trì"
        context={
          <SubjectContextLine scope="collection" collectionLabel="Tất cả hồ sơ có quyền" />
        }
        actions={
          canCreate ? (
            <Button
              ref={createButtonRef}
              variant={createOpen ? 'secondary' : 'primary'}
              aria-expanded={createOpen}
              aria-controls={createOpen ? 'task-create-form' : undefined}
              onClick={() => (createOpen ? closeCreateForm() : openCreateForm())}
            >
              {createOpen ? 'Đóng form tạo việc' : 'Tạo việc'}
            </Button>
          ) : null
        }
      />

      {staleInfo ? (
        <Alert tone="warning" title="Công việc đã thay đổi">
          {staleInfo}
          <div className="task-notice__action">
            <Button variant="secondary" size="sm" onClick={handleReload}>
              Tải lại
            </Button>
          </div>
        </Alert>
      ) : null}
      {closeNotice ? <Alert tone="success">{closeNotice}</Alert> : null}
      {createNotice ? <Alert tone="success">{createNotice}</Alert> : null}

      {createOpen ? (
        <div id="task-create-form" className="people-surface task-create">
          <h2 className="people-surface__title">Tạo việc</h2>
          <form
            className="people-form"
            aria-label="Form tạo việc bảo trì"
            onSubmit={handleCreateSubmit}
            onKeyDown={handleCreateKeyDown}
            noValidate
          >
            {ownerSubjects.length > 1 ? (
              <div className="field">
                <label className="field__label" htmlFor="task-create-subject">
                  Hồ sơ
                </label>
                <select
                  id="task-create-subject"
                  className="field__input"
                  value={createSubjectId ?? ''}
                  onChange={(event) => {
                    setCreateSubjectId(event.target.value);
                    setCreateDeviceId('');
                  }}
                >
                  {ownerSubjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.displayName}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="people-meta people-meta--strong">
                Hồ sơ: {ownerSubjects[0]?.displayName ?? '—'}
              </p>
            )}

            {createDevices.isPending ? (
              <p className="field__hint">Đang tải thiết bị đang gắn…</p>
            ) : createDevices.isError ? (
              <Alert tone="error" title="Không tải được thiết bị">
                {getApiErrorMessage(createDevices.error)}
                <div className="task-notice__action">
                  <Button variant="secondary" size="sm" onClick={() => void createDevices.refetch()}>
                    Thử lại
                  </Button>
                </div>
              </Alert>
            ) : createDeviceItems.length === 0 ? (
              <Alert tone="info" title="Hồ sơ chưa gắn thiết bị">
                Gắn thiết bị cho hồ sơ trước khi tạo việc bảo trì.{' '}
                <Link to="/app/devices">Gắn thiết bị</Link>
              </Alert>
            ) : (
              <div className="field">
                <label className="field__label" htmlFor="task-create-device">
                  Thiết bị <span className="field__required" aria-hidden="true"> *</span>
                </label>
                <select
                  id="task-create-device"
                  className={`field__input${createErrors.fields.deviceId ? ' field__input--error' : ''}`}
                  value={createDeviceId}
                  aria-invalid={createErrors.fields.deviceId ? true : undefined}
                  onChange={(event) => setCreateDeviceId(event.target.value)}
                >
                  {createDeviceItems.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || device.serial} ({device.serial})
                    </option>
                  ))}
                </select>
                {createErrors.fields.deviceId ? (
                  <p className="field__error" role="alert">
                    {createErrors.fields.deviceId}
                  </p>
                ) : null}
              </div>
            )}

            <div className="field">
              <label className="field__label" htmlFor="task-create-kind">
                Loại việc <span className="field__required" aria-hidden="true"> *</span>
              </label>
              <select
                id="task-create-kind"
                className={`field__input${createErrors.fields.kind ? ' field__input--error' : ''}`}
                value={createKind}
                aria-invalid={createErrors.fields.kind ? true : undefined}
                onChange={(event) =>
                  setCreateKind(event.target.value as CreateTaskInput['kind'])
                }
              >
                {KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {createErrors.fields.kind ? (
                <p className="field__error" role="alert">
                  {createErrors.fields.kind}
                </p>
              ) : null}
            </div>

            <TextField
              id="task-create-title"
              label="Tiêu đề"
              required
              ref={createTitleRef}
              value={createTitle}
              maxLength={200}
              hint="Mô tả ngắn việc cần làm, tối thiểu 4 ký tự."
              error={createErrors.fields.title}
              onChange={(event) => setCreateTitle(event.target.value)}
            />

            <div className="task-create__pair">
              <TextField
                id="task-create-priority"
                label="Ưu tiên (0–100)"
                required
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={1}
                value={createPriority}
                hint="Số càng cao càng được xếp trước. 0 = thấp, 100 = khẩn cấp."
                error={createErrors.fields.priority}
                onChange={(event) => setCreatePriority(event.target.value)}
              />
              <TextField
                id="task-create-due"
                label="Hạn xử lý (không bắt buộc)"
                type="date"
                value={createDueDate}
                hint="Để trống nếu không có hạn. Hạn được tính đến cuối ngày."
                error={createErrors.fields.dueAt}
                onChange={(event) => setCreateDueDate(event.target.value)}
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="task-create-notes">
                Ghi chú (không bắt buộc)
              </label>
              <p className="field__hint" id="task-create-notes-hint">
                Tối đa 2000 ký tự. Chỉ ghi thông tin cần cho việc bảo trì.
              </p>
              <textarea
                id="task-create-notes"
                className={`field__input${createErrors.fields.notes ? ' field__input--error' : ''}`}
                rows={3}
                maxLength={2000}
                value={createNotes}
                aria-invalid={createErrors.fields.notes ? true : undefined}
                aria-describedby={
                  createErrors.fields.notes ? 'task-create-notes-error' : 'task-create-notes-hint'
                }
                onChange={(event) => setCreateNotes(event.target.value)}
              />
              {createErrors.fields.notes ? (
                <p className="field__error" id="task-create-notes-error" role="alert">
                  {createErrors.fields.notes}
                </p>
              ) : null}
            </div>

            {createErrors.general.length > 0 ? (
              <Alert tone="error">{createErrors.general.join(' ')}</Alert>
            ) : null}
            {createServerError ? (
              <Alert tone="error" title="Không tạo được công việc">
                {createServerError}
              </Alert>
            ) : null}

            <div className="people-form__actions">
              <Button
                type="submit"
                disabled={createTaskMutation.isPending || createDeviceUnavailable}
              >
                {createTaskMutation.isPending ? 'Đang tạo…' : 'Tạo việc'}
              </Button>
              <Button
                variant="subtle"
                disabled={createTaskMutation.isPending}
                onClick={closeCreateForm}
              >
                Hủy
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="people-filter" role="group" aria-label="Lọc theo trạng thái">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="people-filter__item"
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
          headingLevel={2}
          title="Không tải được danh sách công việc"
          message={getApiErrorMessage(tasks.error)}
          onRetry={() => void tasks.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          headingLevel={2}
          title={filter === 'open' ? 'Không có công việc đang mở' : 'Không có công việc đã đóng'}
          description={
            filter === 'open'
              ? 'Khi thiết bị cần bảo trì, công việc sẽ xuất hiện tại đây.'
              : 'Công việc đã đóng hoặc hủy sẽ hiển thị tại đây.'
          }
        />
      ) : (
        <>
          {subjectTasks.length > 0 ? (
            <ul className="people-list" aria-label="Danh sách công việc">
              {subjectTasks.map(renderTask)}
            </ul>
          ) : null}
          {technicalTasks.length > 0 ? (
            <section aria-labelledby="task-technical-heading" className="task-technical">
              <h2 id="task-technical-heading" className="page-section__title">
                Việc kỹ thuật không gắn hồ sơ
              </h2>
              <p className="people-meta">
                Công việc do quản trị tạo cho thiết bị chưa gán hồ sơ. Chỉ admin đóng được.
              </p>
              <ul className="people-list" aria-label="Việc kỹ thuật không gắn hồ sơ">
                {technicalTasks.map(renderTask)}
              </ul>
            </section>
          ) : null}
        </>
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
