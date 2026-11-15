import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { ZodIssue } from 'zod';
import {
  archiveSubjectSchema,
  deletionRequestRecordedSchema,
  deletionRequestSchema,
  type ArchiveSubjectInput,
  type CreateSubjectInput,
  type DeletionRequestInput,
  type DeletionRequestRecorded,
  type SubjectSummary,
  type UpdateSubjectInput,
} from '@annhien/contracts/subjects';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';
import { TextField } from '../../components/Field';
import { PageLoader } from '../../components/PageLoader';
import { formatDateTime } from '../../lib/format';
import {
  apiRequest,
  getApiErrorMessage,
  isConflictError,
  isNotFoundError,
  parseResponse,
} from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { zodFieldErrorMap } from '../../lib/validation';
import { createSubject, updateSubject } from './api';
import { setActiveSubjectId, useActiveSubject } from './selection';
import { SubjectForm } from './SubjectForm';
import { useSubjects } from './useSubjects';
import './subjects.css';

type DangerMode = 'archive' | 'deletion';
type DangerTarget = { subject: SubjectSummary; mode: DangerMode };
type FormErrors = { fields: Record<string, string>; general: string[] };

const EMPTY_FORM_ERRORS: FormErrors = { fields: {}, general: [] };

/**
 * Gọi endpoint FR-14 ngay trong feature page theo phạm vi file worker được sửa
 * (`SubjectsPage.tsx`); không mở rộng `api.ts` dùng chung của feature.
 */
async function archiveSubject(id: string, input: ArchiveSubjectInput): Promise<void> {
  await apiRequest<unknown>(`/subjects/${id}/archive`, { method: 'POST', body: input });
}

async function requestSubjectDeletion(
  id: string,
  input: DeletionRequestInput,
): Promise<DeletionRequestRecorded> {
  const data = await apiRequest<unknown>(`/subjects/${id}/deletion-requests`, {
    method: 'POST',
    body: input,
  });
  return parseResponse(deletionRequestRecordedSchema, data);
}

/** Cùng quy tắc với server: trim + Unicode NFC + không phân biệt hoa/thường. */
function normalizeName(value: string): string {
  return value.trim().normalize('NFC').toLowerCase();
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
      <ul className="subject-danger-list">
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
    <ul className="subject-danger-list">
      <li>
        Đây là <strong>ghi nhận thủ công</strong>, không xóa dữ liệu ngay khi bạn gửi.
      </li>
      <li>
        Yêu cầu chỉ được ghi vào nhật ký kiểm toán; dữ liệu số đo, cảnh báo, bản xuất,
        cache/backup vẫn còn.
      </li>
      <li>Phiên bản hiện tại chưa có tác vụ xóa tự động hay thời hạn xử lý — việc này cần được xử lý khi vận hành.</li>
    </ul>
  );
}

/**
 * /app/subjects — quản lý hồ sơ theo dạng hàng gọn:
 * - Header một hàng: H1 + nút `Thêm người`; form tạo chỉ mở khi bấm.
 * - Mỗi hồ sơ: tên, vai trò, trạng thái quyền và ba lối tắt Xem sức khỏe /
 *   Chia sẻ / Thiết bị; `Xem sức khỏe` và `Thiết bị` đặt hồ sơ đó làm hồ sơ
 *   đang xem trước khi điều hướng.
 * - `Thêm thao tác` gộp Sửa tên / Lưu trữ / Yêu cầu xóa ở cuối hàng.
 * - Lưu trữ hồ sơ và ghi nhận yêu cầu xóa dữ liệu (FR-14): form tại chỗ có
 *   xác nhận gõ đúng tên, chỉ chủ hồ sơ thấy; không dùng window.confirm/prompt.
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

  function closeDangerForm(): void {
    setDangerTarget(null);
    setDangerReason('');
    setDangerConfirmName('');
    setDangerErrors(EMPTY_FORM_ERRORS);
    setDangerServerError(null);
  }

  function openDangerForm(subject: SubjectSummary, mode: DangerMode): void {
    setDangerTarget({ subject, mode });
    setDangerReason('');
    setDangerConfirmName('');
    setDangerErrors(EMPTY_FORM_ERRORS);
    setDangerServerError(null);
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

  if (subjects.isPending) {
    return <PageLoader label="Đang tải danh sách hồ sơ…" />;
  }

  if (subjects.isError) {
    return (
      <ErrorState
        title="Không tải được danh sách hồ sơ"
        message="Kiểm tra kết nối với máy chủ và thử lại."
        onRetry={() => void subjects.refetch()}
      />
    );
  }

  const items = subjects.data;

  return (
    <div className="stack">
      <header className="subjects-page__header">
        <h1 className="page-title">Người thân</h1>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setCreateOpen((value) => !value)}
          aria-expanded={createOpen}
          aria-controls="subject-create-form"
        >
          {createOpen ? 'Đóng' : 'Thêm người'}
        </Button>
      </header>

      {createOpen ? (
        <section
          id="subject-create-form"
          className="subjects-page__create"
          aria-labelledby="subject-create-heading"
        >
          <h2 id="subject-create-heading" className="visually-hidden">
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
        <p className="subjects-page__empty">
          Chưa có hồ sơ nào. Thêm người cần theo dõi để bắt đầu nhận dữ liệu và mời người thân
          cùng xem.
        </p>
      ) : (
        <>
          <section aria-labelledby="subject-list-heading">
            <h2 id="subject-list-heading" className="visually-hidden">
              Danh sách người thân
            </h2>
            {archiveNotice ? (
              <Alert tone="success" title="Đã lưu trữ hồ sơ">
                <p>{archiveNotice}</p>
                <Button
                  variant="subtle"
                  size="sm"
                  className="subject-danger-notice__button"
                  onClick={() => setArchiveNotice(null)}
                >
                  Đóng thông báo
                </Button>
              </Alert>
            ) : null}
            <ul className="subject-list">
              {items.map((item) => {
                const isOwner = item.role === 'owner';
                const dangerOpen = dangerTarget?.subject.id === item.id;
                const panelId = `subject-danger-${item.id}`;
                const headingId = `subject-danger-heading-${item.id}`;
                const reasonId = `subject-danger-reason-${item.id}`;
                const confirmId = `subject-danger-confirm-${item.id}`;
                return (
                  <li key={item.id} className="subject-list__item">
                    <div className="subject-list__row">
                      <div className="subject-list__info">
                        <p className="subject-list__name">{item.displayName}</p>
                        <p className="subject-list__meta">
                          <span>
                            {item.role === 'caregiver' ? 'Người thân xem hộ' : 'Chủ hồ sơ'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {item.permissions.canReceiveAlerts
                              ? 'nhận cảnh báo'
                              : 'không nhận cảnh báo'}
                          </span>
                          {item.permissions.canViewMeasurements === false ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>không xem số đo</span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <div className="subject-list__actions">
                        <Link
                          className="subject-list__action"
                          to="/app/overview"
                          onClick={() => setActiveSubjectId(item.id)}
                        >
                          Xem sức khỏe
                        </Link>
                        {isOwner ? (
                          <Link
                            className="subject-list__action"
                            to={`/app/subjects/${item.id}/share`}
                          >
                            Chia sẻ
                          </Link>
                        ) : null}
                        <Link
                          className="subject-list__action"
                          to="/app/devices"
                          onClick={() => setActiveSubjectId(item.id)}
                        >
                          Thiết bị
                        </Link>
                        {isOwner && editingId !== item.id ? (
                          <details className="subject-list__more">
                            <summary className="subject-list__more-summary">Thêm thao tác</summary>
                            <div className="subject-list__more-body">
                              <Button
                                variant="subtle"
                                size="sm"
                                onClick={() => setEditingId(item.id)}
                                aria-label={`Sửa tên hồ sơ ${item.displayName}`}
                              >
                                Sửa tên
                              </Button>
                              <div
                                className="subject-danger-actions"
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
                                  onClick={() => openDangerForm(item, 'archive')}
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
                                  onClick={() => openDangerForm(item, 'deletion')}
                                >
                                  Yêu cầu xóa dữ liệu
                                </Button>
                              </div>
                            </div>
                          </details>
                        ) : null}
                      </div>
                    </div>

                    {isOwner && editingId === item.id ? (
                      <div className="subject-list__edit">
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
                        className="subject-danger-panel"
                        aria-labelledby={headingId}
                      >
                        <form className="subject-danger-form" onSubmit={handleDangerSubmit} noValidate>
                          <h3 id={headingId} className="subject-danger-form__title">
                            {dangerTarget.mode === 'archive'
                              ? `Lưu trữ hồ sơ “${item.displayName}”`
                              : `Ghi nhận yêu cầu xóa dữ liệu cho “${item.displayName}”`}
                          </h3>
                          <p className="subject-danger-form__lead">
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

                          <div className="subject-danger-form__actions">
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
                              onClick={closeDangerForm}
                            >
                              Hủy
                            </Button>
                          </div>
                        </form>
                      </section>
                    ) : null}

                    {deletionResult?.subjectId === item.id ? (
                      <div className="subject-danger-result">
                        <Alert
                          tone="info"
                          title="Đã ghi nhận yêu cầu xóa — dữ liệu chưa bị xóa"
                        >
                          <p>{deletionResult.result.note}</p>
                          <p className="subject-danger-result__meta">
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
        </>
      )}
    </div>
  );
}
