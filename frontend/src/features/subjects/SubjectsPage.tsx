import { Fragment, useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { ZodIssue } from 'zod';
import {
  archiveSubjectSchema,
  deletionRequestSchema,
  type ArchiveSubjectInput,
  type CreateSubjectInput,
  type DeletionRequestInput,
  type DeletionRequestRecorded,
  type SubjectSummary,
  type UpdateSubjectInput,
} from '@heart-iot/contracts/subjects';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';
import { TextField } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { PageLoader } from '../../components/PageLoader';
import { formatDateTime } from '../../lib/format';
import { getApiErrorMessage, isConflictError, isNotFoundError } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { zodFieldErrorMap } from '../../lib/validation';
import {
  archiveSubject,
  createSubject,
  requestSubjectDeletion,
  updateSubject,
} from './api';
import { setActiveSubjectId, useActiveSubject } from './selection';
import { SubjectContextLine } from './SubjectSwitcher';
import { SubjectForm } from './SubjectForm';
import { useSubjects } from './useSubjects';
import '../../styles/people.css';
import './subjects.css';

type DangerMode = 'archive' | 'deletion';
type DangerTarget = { subject: SubjectSummary; mode: DangerMode };
type FormErrors = { fields: Record<string, string>; general: string[] };

const EMPTY_FORM_ERRORS: FormErrors = { fields: {}, general: [] };

/** Cùng quy tắc với server: trim + Unicode NFC + không phân biệt hoa/thường. */
function normalizeName(value: string): string {
  return value.trim().normalize('NFC').toLowerCase();
}

/**
 * Trạng thái chia sẻ của hồ sơ, viết bằng chữ (không dùng màu/chấm làm tín hiệu
 * duy nhất). Chỉ mô tả quyền mà API danh sách thực sự trả về.
 */
function shareSummary(
  role: SubjectSummary['role'],
  permissions: SubjectSummary['permissions'],
): string[] {
  // Chủ hồ sơ không có "cửa sổ lịch sử" được chia sẻ — đừng bịa ra con số đó.
  const parts =
    role === 'owner'
      ? []
      : [
          permissions.canViewMeasurements === false
            ? 'không xem số đo'
            : `xem số đo ${permissions.historyDays} ngày`,
        ];
  parts.push(permissions.canReceiveAlerts ? 'nhận cảnh báo' : 'không nhận cảnh báo');
  if (role !== 'owner' && permissions.canAcknowledge) parts.push('xác nhận hỗ trợ');
  if (role !== 'owner' && permissions.canResolve) parts.push('đóng cảnh báo');
  return parts;
}

function dangerReasonMessages(mode: DangerMode) {
  return (issue: ZodIssue, value: unknown): string => {
    const label = mode === 'archive' ? 'lý do lưu trữ' : 'lý do yêu cầu xóa';
    if (String(value ?? '').trim() === '') return `Vui lòng nhập ${label}.`;
    if (issue.code === 'too_small') return `Lý do cần ít nhất ${issue.minimum} ký tự.`;
    if (issue.code === 'too_big') return `Lý do quá dài (tối đa ${issue.maximum} ký tự).`;
    return 'Lý do chưa hợp lệ.';
  };
}

function DangerConsequences({ mode }: { mode: DangerMode }) {
  if (mode === 'archive') {
    return (
      <ul className="people-danger__list">
        <li>Hồ sơ biến khỏi danh sách, tổng quan và cảnh báo của bạn và người thân.</li>
        <li>Mọi liên kết chia sẻ đang hiệu lực bị thu hồi ngay; stream đang mở sẽ đóng.</li>
        <li>
          Số đo, cảnh báo và bản xuất <strong>không bị xóa</strong> — phiên bản hiện tại chưa có
          quy trình xóa và không có hoàn tác trên giao diện.
        </li>
      </ul>
    );
  }
  return (
    <ul className="people-danger__list">
      <li>
        Đây là <strong>ghi nhận thủ công</strong>, không xóa dữ liệu ngay khi bạn gửi.
      </li>
      <li>
        Yêu cầu chỉ được ghi vào nhật ký kiểm toán; dữ liệu số đo, cảnh báo, bản xuất,
        cache/backup vẫn còn.
      </li>
      <li>
        Phiên bản hiện tại chưa có tác vụ xóa tự động hay thời hạn xử lý — việc này cần được
        xử lý khi vận hành.
      </li>
    </ul>
  );
}

/**
 * /app/subjects — danh sách hồ sơ người được theo dõi, không phải danh sách
 * account đăng nhập:
 * - H1 + primary `Thêm người` + lối vào theo ngữ cảnh `Công việc bảo trì`.
 * - Mỗi hồ sơ là một hàng: tên, vai trò/quyền ngắn dạng chữ và các action
 *   `Xem sức khỏe`, `Thiết bị`, owner có `Chia sẻ và liên hệ`.
 * - Thao tác quản trị (sửa/lưu trữ/yêu cầu xóa) nằm trong disclosure
 *   `Quản lý hồ sơ` cuối đúng hàng, không ngang hàng nút thường.
 * - Lưu trữ = giữ dữ liệu + thu hồi chia sẻ; yêu cầu xóa = chỉ ghi nhận
 *   `recorded`, chưa xóa. Không dùng window.confirm/prompt.
 * - Không hiển thị dữ liệu sức khỏe trên màn này.
 */
export function SubjectsPage() {
  const subjects = useSubjects();
  const queryClient = useQueryClient();
  const activeSubject = useActiveSubject(subjects.data);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [dangerTarget, setDangerTarget] = useState<DangerTarget | null>(null);
  const [dangerReason, setDangerReason] = useState('');
  const [dangerConfirmName, setDangerConfirmName] = useState('');
  const [dangerErrors, setDangerErrors] = useState<FormErrors>(EMPTY_FORM_ERRORS);
  const [dangerServerError, setDangerServerError] = useState<string | null>(null);
  const [archiveNotice, setArchiveNotice] = useState<string | null>(null);
  const [deletionResult, setDeletionResult] = useState<{
    subjectId: string;
    subjectName: string;
    result: DeletionRequestRecorded;
  } | null>(null);
  const dangerReasonRef = useRef<HTMLTextAreaElement | null>(null);
  const dangerTriggerRef = useRef<HTMLButtonElement | null>(null);

  const create = useMutation({
    mutationFn: (input: CreateSubjectInput) => createSubject(input),
    onSuccess: (created) => {
      setFormError(null);
      setCreateOpen(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjects });
      // Chọn ngay hồ sơ vừa tạo để dashboard hiển thị.
      setActiveSubjectId(created.id);
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSubjectInput }) =>
      updateSubject(id, input),
    onSuccess: () => {
      setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjects });
    },
  });

  const archive = useMutation({
    mutationFn: ({ subject, input }: { subject: SubjectSummary; input: ArchiveSubjectInput }) =>
      archiveSubject(subject.id, input),
    onSuccess: (_data, { subject }) => {
      closeDangerForm();
      setArchiveNotice(
        `Đã lưu trữ hồ sơ “${subject.displayName}”. Hồ sơ không còn hiển thị và liên kết chia sẻ đã bị thu hồi; dữ liệu số đo/cảnh báo vẫn được giữ, không bị xóa.`,
      );
      setDeletionResult(null);
      // Chuyển sang hồ sơ còn lại nếu hồ sơ đang xem bị lưu trữ.
      const remaining = (queryClient.getQueryData<SubjectSummary[]>(queryKeys.subjects) ?? [])
        .filter((item) => item.id !== subject.id);
      if (activeSubject?.id === subject.id) {
        setActiveSubjectId(remaining[0]?.id ?? null);
      }
      // Xóa mọi cache con của hồ sơ (status/alerts/measurements/...) rồi tải lại danh sách.
      queryClient.removeQueries({ queryKey: queryKeys.subject(subject.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjects });
    },
    onError: (error) => {
      if (isConflictError(error)) {
        setDangerServerError(
          'Hồ sơ đã được lưu trữ trước đó. Danh sách có thể đang cũ — đang tải lại.',
        );
        void queryClient.invalidateQueries({ queryKey: queryKeys.subjects });
        return;
      }
      if (isNotFoundError(error)) {
        setDangerServerError(
          'Không tìm thấy hồ sơ hoặc quyền truy cập vừa thay đổi. Đang tải lại danh sách.',
        );
        void queryClient.invalidateQueries({ queryKey: queryKeys.subjects });
        return;
      }
      setDangerServerError(getApiErrorMessage(error));
    },
  });

  const deletion = useMutation({
    mutationFn: ({ subject, input }: { subject: SubjectSummary; input: DeletionRequestInput }) =>
      requestSubjectDeletion(subject.id, input),
    onSuccess: (result, { subject }) => {
      closeDangerForm();
      setDeletionResult({ subjectId: subject.id, subjectName: subject.displayName, result });
    },
    onError: (error) => {
      if (isNotFoundError(error)) {
        setDangerServerError(
          'Không tìm thấy hồ sơ hoặc quyền truy cập vừa thay đổi. Đang tải lại danh sách.',
        );
        void queryClient.invalidateQueries({ queryKey: queryKeys.subjects });
        return;
      }
      setDangerServerError(getApiErrorMessage(error));
    },
  });

  const dangerPending = archive.isPending || deletion.isPending;

  useEffect(() => {
    if (dangerTarget) dangerReasonRef.current?.focus();
  }, [dangerTarget]);

  function closeDangerForm(options: { restoreFocus?: boolean } = {}): void {
    setDangerTarget(null);
    setDangerReason('');
    setDangerConfirmName('');
    setDangerErrors(EMPTY_FORM_ERRORS);
    setDangerServerError(null);
    if (options.restoreFocus) dangerTriggerRef.current?.focus();
  }

  function openDangerForm(
    subject: SubjectSummary,
    mode: DangerMode,
    trigger: HTMLButtonElement | null,
  ): void {
    dangerTriggerRef.current = trigger;
    setDangerTarget({ subject, mode });
    setDangerReason('');
    setDangerConfirmName('');
    setDangerErrors(EMPTY_FORM_ERRORS);
    setDangerServerError(null);
  }

  function handleDangerKeyDown(event: KeyboardEvent<HTMLElement>): void {
    // Escape huỷ xác nhận nguy hiểm, không gửi gì và trả focus về nút đã mở.
    if (event.key !== 'Escape' || dangerPending) return;
    event.preventDefault();
    event.stopPropagation();
    closeDangerForm({ restoreFocus: true });
  }

  function handleDangerSubmit(event: FormEvent): void {
    event.preventDefault();
    if (!dangerTarget || dangerPending) return;

    const isArchive = dangerTarget.mode === 'archive';
    const schema = isArchive ? archiveSubjectSchema : deletionRequestSchema;
    const values = { reason: dangerReason, confirmationName: dangerConfirmName };
    const parsed = schema.safeParse(values);
    const errors: FormErrors = parsed.success
      ? { fields: {}, general: [] }
      : zodFieldErrorMap(parsed.error, values, {
          reason: dangerReasonMessages(dangerTarget.mode),
          confirmationName: (issue, value) => {
            if (String(value ?? '').trim() === '') {
              return 'Vui lòng gõ đúng tên hồ sơ để xác nhận.';
            }
            if (issue.code === 'too_big') return 'Tên xác nhận quá dài.';
            return 'Tên xác nhận chưa hợp lệ.';
          },
        });

    if (dangerConfirmName.trim() === '') {
      errors.fields.confirmationName ??= 'Vui lòng gõ đúng tên hồ sơ để xác nhận.';
    } else if (
      normalizeName(dangerConfirmName) !== normalizeName(dangerTarget.subject.displayName)
    ) {
      errors.fields.confirmationName = `Tên xác nhận không khớp với “${dangerTarget.subject.displayName}”.`;
    }

    if (!parsed.success || errors.fields.confirmationName) {
      setDangerErrors(errors);
      setDangerServerError(null);
      return;
    }

    setDangerErrors(EMPTY_FORM_ERRORS);
    setDangerServerError(null);
    if (isArchive) {
      archive.mutate({
        subject: dangerTarget.subject,
        input: parsed.data as ArchiveSubjectInput,
      });
    } else {
      deletion.mutate({
        subject: dangerTarget.subject,
        input: parsed.data as DeletionRequestInput,
      });
    }
  }

  // Loading/error chỉ thay phần danh sách: H1 và lối vào vẫn còn rõ.
  if (subjects.isPending) {
    return (
      <div className="stack people-page">
        <PageHeader
          title="Người thân"
          context={<SubjectContextLine scope="collection" />}
        />
        <PageLoader label="Đang tải danh sách hồ sơ…" />
      </div>
    );
  }

  if (subjects.isError) {
    return (
      <div className="stack people-page">
        <PageHeader
          title="Người thân"
          context={<SubjectContextLine scope="collection" />}
        />
        <ErrorState
          headingLevel={2}
          title="Không tải được danh sách hồ sơ"
          message="Kiểm tra kết nối với máy chủ và thử lại."
          onRetry={() => void subjects.refetch()}
        />
      </div>
    );
  }

  const items = subjects.data;

  return (
    <div className="stack people-page">
      <PageHeader
        title="Người thân"
        context={<SubjectContextLine scope="collection" />}
        actions={
          <div className="people-header__actions">
            <Button
              variant="primary"
              onClick={() => setCreateOpen((value) => !value)}
              aria-expanded={createOpen}
              aria-controls="subject-create-form"
            >
              {createOpen ? 'Đóng' : 'Thêm người'}
            </Button>
            <Link className="people-textlink" to="/app/tasks">
              Công việc bảo trì
            </Link>
            <Link className="people-textlink" to="/app/care">
              Nhắc chăm sóc
            </Link>
          </div>
        }
      />

      {createOpen ? (
        <section
          id="subject-create-form"
          className="people-surface"
          aria-labelledby="subject-create-heading"
        >
          <h2 id="subject-create-heading" className="people-surface__title">
            Thêm người
          </h2>
          {formError ? <Alert tone="error">{formError}</Alert> : null}
          <SubjectForm
            mode="create"
            pending={create.isPending}
            onCancel={() => setCreateOpen(false)}
            onSubmit={(values) => create.mutate(values)}
          />
        </section>
      ) : null}

      {items.length === 0 ? (
        <p className="people-empty">
          Chưa có hồ sơ nào. Dùng <strong>Thêm người</strong> để tạo hồ sơ đầu tiên. Người nhận
          lời mời cần đăng ký đúng email và mở đầy đủ liên kết trong lời mời.
        </p>
      ) : (
        <section aria-labelledby="subject-list-heading" className="people-list-block">
          <h2 id="subject-list-heading" className="visually-hidden">
            Danh sách người thân
          </h2>
          {archiveNotice ? (
            <Alert tone="success" title="Đã lưu trữ hồ sơ">
              <p>{archiveNotice}</p>
              <Button
                variant="subtle"
                size="sm"
                className="people-notice__dismiss"
                onClick={() => setArchiveNotice(null)}
              >
                Đóng thông báo
              </Button>
            </Alert>
          ) : null}
          <ul className="people-list">
            {items.map((item) => {
              const isOwner = item.role === 'owner';
              const dangerOpen = dangerTarget?.subject.id === item.id;
              const panelId = `subject-danger-${item.id}`;
              const headingId = `subject-danger-heading-${item.id}`;
              const reasonId = `subject-danger-reason-${item.id}`;
              const confirmId = `subject-danger-confirm-${item.id}`;
              return (
                <li key={item.id} className="people-row">
                  <div className="people-row__identity">
                    <p className="people-row__name">{item.displayName}</p>
                    <p className="people-row__meta">
                      <span>{item.role === 'caregiver' ? 'Người thân xem hộ' : 'Chủ hồ sơ'}</span>
                      {shareSummary(item.role, item.permissions).map((part) => (
                        <Fragment key={part}>
                          <span aria-hidden="true">·</span>
                          <span>{part}</span>
                        </Fragment>
                      ))}
                    </p>
                  </div>
                  <div className="people-row__actions">
                    <Link
                      className="people-row__action"
                      to="/app/overview"
                      onClick={() => setActiveSubjectId(item.id)}
                    >
                      Xem sức khỏe
                    </Link>
                    <Link
                      className="people-row__action"
                      to="/app/devices"
                      onClick={() => setActiveSubjectId(item.id)}
                    >
                      Thiết bị
                    </Link>
                    {isOwner ? (
                      <Link
                        className="people-row__action"
                        to={`/app/subjects/${item.id}/share`}
                      >
                        Chia sẻ và liên hệ
                      </Link>
                    ) : null}
                    {isOwner && editingId !== item.id ? (
                      <details className="people-row__manage">
                        <summary className="people-row__manage-summary">Quản lý hồ sơ</summary>
                        <div className="people-row__manage-body">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingId(item.id)}
                            aria-label={`Sửa hồ sơ ${item.displayName}`}
                          >
                            Sửa hồ sơ
                          </Button>
                          <div
                            className="people-danger__actions"
                            role="group"
                            aria-label="Thao tác dữ liệu"
                          >
                            <Button
                              variant="danger-quiet"
                              size="sm"
                              aria-expanded={dangerOpen && dangerTarget?.mode === 'archive'}
                              aria-controls={
                                dangerOpen && dangerTarget?.mode === 'archive'
                                  ? panelId
                                  : undefined
                              }
                              onClick={(event) =>
                                openDangerForm(item, 'archive', event.currentTarget)
                              }
                            >
                              Lưu trữ hồ sơ
                            </Button>
                            <Button
                              variant="danger-quiet"
                              size="sm"
                              aria-expanded={dangerOpen && dangerTarget?.mode === 'deletion'}
                              aria-controls={
                                dangerOpen && dangerTarget?.mode === 'deletion'
                                  ? panelId
                                  : undefined
                              }
                              onClick={(event) =>
                                openDangerForm(item, 'deletion', event.currentTarget)
                              }
                            >
                              Yêu cầu xóa dữ liệu
                            </Button>
                          </div>
                        </div>
                      </details>
                    ) : null}
                  </div>

                  {isOwner && editingId === item.id ? (
                    <div className="people-row__edit people-surface">
                      <h3 className="people-surface__title">Sửa hồ sơ</h3>
                      <SubjectForm
                        mode="edit"
                        initial={{ displayName: item.displayName, timezone: item.timezone }}
                        pending={update.isPending}
                        submitLabel="Lưu"
                        onCancel={() => setEditingId(null)}
                        onSubmit={(values) => update.mutate({ id: item.id, input: values })}
                      />
                      {update.isError ? (
                        <Alert tone="error">{getApiErrorMessage(update.error)}</Alert>
                      ) : null}
                    </div>
                  ) : null}

                  {isOwner && dangerOpen && dangerTarget ? (
                    <section
                      id={panelId}
                      className="people-danger"
                      aria-labelledby={headingId}
                      onKeyDown={handleDangerKeyDown}
                    >
                      <form className="people-danger__form" onSubmit={handleDangerSubmit} noValidate>
                        <h3 id={headingId} className="people-danger__title">
                          {dangerTarget.mode === 'archive'
                            ? `Lưu trữ hồ sơ “${item.displayName}”`
                            : `Ghi nhận yêu cầu xóa dữ liệu cho “${item.displayName}”`}
                        </h3>
                        <p className="people-danger__lead">
                          {dangerTarget.mode === 'archive'
                            ? 'Thao tác này đóng quyền truy cập của mọi người, kể cả bạn. Hãy đọc kỹ trước khi xác nhận.'
                            : 'Thao tác này chỉ ghi nhận yêu cầu. Dữ liệu vẫn còn cho tới khi có quy trình xóa được duyệt và chạy.'}
                        </p>
                        <DangerConsequences mode={dangerTarget.mode} />

                        <div className="field">
                          <label className="field__label" htmlFor={reasonId}>
                            {dangerTarget.mode === 'archive'
                              ? 'Lý do lưu trữ'
                              : 'Lý do yêu cầu xóa'}{' '}
                            <span className="field__required" aria-hidden="true">
                              *
                            </span>
                          </label>
                          <p className="field__hint" id={`${reasonId}-hint`}>
                            {dangerTarget.mode === 'archive'
                              ? '3–500 ký tự. Ví dụ: đã bàn giao thiết bị, đổi người theo dõi.'
                              : '10–1000 ký tự. Ví dụ: gia đình yêu cầu xóa sau khi ngừng theo dõi.'}
                          </p>
                          <textarea
                            id={reasonId}
                            ref={dangerReasonRef}
                            className={`field__input${dangerErrors.fields.reason ? ' field__input--error' : ''}`}
                            aria-invalid={dangerErrors.fields.reason ? true : undefined}
                            aria-describedby={`${reasonId}-hint`}
                            rows={3}
                            value={dangerReason}
                            maxLength={dangerTarget.mode === 'archive' ? 500 : 1000}
                            onChange={(event) => setDangerReason(event.target.value)}
                          />
                          {dangerErrors.fields.reason ? (
                            <p className="field__error" role="alert">
                              {dangerErrors.fields.reason}
                            </p>
                          ) : null}
                        </div>

                        <TextField
                          id={confirmId}
                          label={`Gõ đúng tên “${item.displayName}” để xác nhận`}
                          required
                          value={dangerConfirmName}
                          error={dangerErrors.fields.confirmationName}
                          hint="Không phân biệt hoa/thường; khoảng trắng đầu/cuối được bỏ qua."
                          onChange={(event) => setDangerConfirmName(event.target.value)}
                          autoComplete="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          maxLength={120}
                        />

                        {dangerServerError ? (
                          <Alert tone="error" title="Chưa thực hiện được thao tác">
                            {dangerServerError}
                          </Alert>
                        ) : null}

                        <div className="people-danger__form-actions">
                          <Button type="submit" variant="danger" disabled={dangerPending}>
                            {dangerPending
                              ? 'Đang gửi…'
                              : dangerTarget.mode === 'archive'
                                ? 'Xác nhận lưu trữ'
                                : 'Ghi nhận yêu cầu xóa'}
                          </Button>
                          <Button
                            variant="subtle"
                            type="button"
                            disabled={dangerPending}
                            onClick={() => closeDangerForm({ restoreFocus: true })}
                          >
                            Hủy
                          </Button>
                        </div>
                      </form>
                    </section>
                  ) : null}

                  {deletionResult?.subjectId === item.id ? (
                    <div className="people-danger__result">
                      <Alert tone="info" title="Đã ghi nhận yêu cầu xóa — dữ liệu chưa bị xóa">
                        <p>{deletionResult.result.note}</p>
                        <p className="people-danger__result-meta">
                          Mã ghi nhận: <code>{deletionResult.result.id}</code> · Ghi lúc{' '}
                          {formatDateTime(deletionResult.result.recordedAt)}
                        </p>
                        <Button
                          variant="subtle"
                          size="sm"
                          onClick={() => setDeletionResult(null)}
                        >
                          Đóng thông báo
                        </Button>
                      </Alert>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
