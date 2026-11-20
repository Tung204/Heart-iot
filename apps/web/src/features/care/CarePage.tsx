import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type {
  CreateReminderInput,
  ReminderOccurrence,
  ReminderSummary,
  UpdateReminderInput,
} from '@heart-iot/contracts/reminders';
import { Alert } from '../../components/Alert';
import { Button, ButtonLink } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { formatDateTime } from '../../lib/format';import { getApiErrorMessage, isApiError } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { useActiveSubject } from '../subjects/selection';
import { useSubjects } from '../subjects/useSubjects';
import {
  REMINDER_STATUS_LABELS,
  createReminder,
  deleteReminder,
  fetchReminders,
  fetchTodayReminders,
  updateReminder,
} from './api';
import {
  REMINDER_KIND_LABELS,
  formatReminderRange,
  formatReminderTimes,
  formatWeekdays,
} from './labels';
import {
  ReminderForm,
  type ReminderFormErrors,
} from './ReminderForm';
import { CareAdherenceSection } from './CareAdherenceSection';
import { CareRulesSection } from './CareRulesSection';
import { useReminderCompletion } from './useReminderCompletion';
import '../../styles/people.css';
import './care.css';

const CARE_DISCLAIMER = 'Chỉ là nhắc việc bạn tự đặt, không thay tư vấn y tế.';

/** 403 là trạng thái quyền, không phải lỗi kỹ thuật. */
function isForbiddenError(error: unknown): boolean {
  return isApiError(error) && (error.status === 403 || error.code === 'FORBIDDEN');
}

/**
 * Đọc `details: [{ path, message }]` của lỗi 422 thành lỗi theo trường.
 * `times.0`/`weekdays.2` gắn về vùng tương ứng để form chỉ hiện một lỗi mỗi vùng.
 */
function apiReminderErrors(error: unknown): ReminderFormErrors | null {
  if (!isApiError(error) || error.code !== 'VALIDATION_FAILED' || !Array.isArray(error.details)) {
    return null;
  }
  const fields: Record<string, string> = {};
  const general: string[] = [];
  for (const raw of error.details) {
    const item = raw as { path?: unknown; message?: unknown };
    const path = typeof item.path === 'string' ? item.path : '';
    const message = typeof item.message === 'string' ? item.message : 'Giá trị chưa hợp lệ.';
    const field = path.startsWith('times')
      ? 'times'
      : path.startsWith('weekdays')
        ? 'weekdays'
        : path;
    if (field) fields[field] ??= message;
    else general.push(message);
  }
  return { fields, general };
}

function completionLine(occurrence: ReminderOccurrence): string {
  const completion = occurrence.completion;
  if (!completion) return '';
  const who = completion.completedBy?.displayName ?? 'Không xác định tài khoản';
  return `${REMINDER_STATUS_LABELS[completion.status]} lúc ${formatDateTime(completion.completedAt)} · ${who}`;
}

function TodayOccurrences({
  subjectId,
  date,
  items,
}: {
  subjectId: string;
  date: string;
  items: ReminderOccurrence[];
}) {
  const completion = useReminderCompletion(subjectId);

  return (
    <section className="care-section" aria-labelledby="care-today-heading">
      <div className="care-section__head">
        <h2 id="care-today-heading" className="care-section__title">
          Hôm nay
        </h2>
        <p className="care-section__meta">{items.length} việc theo lịch</p>
      </div>

      {items.length === 0 ? (
        <p className="care-muted">
          Hôm nay không có lịch nhắc nào. Lịch đã tắt hoặc không áp dụng cho ngày hôm nay sẽ
          không xuất hiện ở đây.
        </p>
      ) : (
        <ul className="care-today-list">
          {items.map((occurrence) => {
            const pending = completion.isPending(occurrence.reminder.id, occurrence.time);
            return (
              <li
                key={`${occurrence.reminder.id}-${occurrence.time}`}
                className="care-today-item"
              >
                <div className="care-today-item__main">
                  <p className="care-today-item__time">{occurrence.time}</p>
                  <div className="care-today-item__body">
                    <p className="care-today-item__title">{occurrence.reminder.title}</p>
                    <p className="care-today-item__meta">
                      {REMINDER_KIND_LABELS[occurrence.reminder.kind]}
                      {occurrence.reminder.note ? ` · ${occurrence.reminder.note}` : ''}
                    </p>
                    <p className="care-today-item__status">
                      {completionLine(occurrence) ||
                        `${REMINDER_STATUS_LABELS[occurrence.status]}`}
                    </p>
                  </div>
                </div>
                <div className="care-today-item__actions">
                  {occurrence.status === 'pending' ? (
                    <>
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          completion.complete(occurrence.reminder, date, occurrence.time)
                        }
                      >
                        Đã thực hiện
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          completion.skip(occurrence.reminder, date, occurrence.time)
                        }
                      >
                        Bỏ qua
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        completion.undo(occurrence.reminder.id, date, occurrence.time)
                      }
                    >
                      Hoàn tác
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {completion.error ? (
        <Alert tone="error" title="Chưa cập nhật được đánh dấu">
          {getApiErrorMessage(completion.error)}
        </Alert>
      ) : null}
    </section>
  );
}

/**
 * `/app/care` — Nhắc chăm sóc (FR-15 phần web).
 *
 * - Vào từ header Người thân hoặc thẻ "Nhắc hôm nay" trên Hôm nay; không thêm nav.
 * - Chủ hồ sơ tạo/sửa/xoá; người có `canViewMeasurements` xem và đánh dấu.
 *   Thiếu quyền là trạng thái nghiệp vụ: không gọi API bị cấm.
 * - "Hôm nay" và danh sách lịch tách hai vùng; câu giới hạn chỉ hiện một lần.
 * - Nội dung tự do, không gợi ý liều/lịch y khoa.
 */
export function CarePage() {
  const subjects = useSubjects();
  const activeSubject = useActiveSubject(subjects.data);
  const queryClient = useQueryClient();

  const subjectId = activeSubject?.id ?? null;
  const isOwner = activeSubject?.role === 'owner';
  const canView =
    activeSubject !== null &&
    (isOwner || activeSubject.permissions.canViewMeasurements !== false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ReminderSummary | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Đổi hồ sơ thì đóng form/xác nhận của hồ sơ trước để không gửi nhầm.
  useEffect(() => {
    setCreateOpen(false);
    setEditing(null);
    setDeletingId(null);
  }, [subjectId]);

  const reminders = useQuery({
    queryKey: subjectId
      ? queryKeys.reminders(subjectId)
      : (['subjects', 'none', 'reminders'] as const),
    queryFn: ({ signal }) => (subjectId ? fetchReminders(subjectId, signal) : null),
    enabled: Boolean(subjectId) && canView,
    staleTime: 15_000,
  });

  const today = useQuery({
    queryKey: subjectId
      ? queryKeys.remindersToday(subjectId)
      : (['subjects', 'none', 'reminders', 'today'] as const),
    queryFn: ({ signal }) => (subjectId ? fetchTodayReminders(subjectId, signal) : null),
    enabled: Boolean(subjectId) && canView,
    staleTime: 15_000,
  });

  const invalidate = () => {
    if (!subjectId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.reminders(subjectId) });
    // Sửa lịch/đổi trạng thái làm đổi occurrence hôm nay và tổng hợp lịch sử.
    void queryClient.invalidateQueries({ queryKey: queryKeys.remindersToday(subjectId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.careAdherenceAll(subjectId) });
  };

  const create = useMutation({
    mutationFn: (input: CreateReminderInput) => {
      if (!subjectId) throw new Error('Chưa chọn hồ sơ.');
      return createReminder(subjectId, input);
    },
    onSuccess: () => {
      setCreateOpen(false);
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateReminderInput }) => {
      if (!subjectId) throw new Error('Chưa chọn hồ sơ.');
      return updateReminder(subjectId, id, input);
    },
    onSuccess: () => {
      setEditing(null);
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (reminderId: string) => {
      if (!subjectId) throw new Error('Chưa chọn hồ sơ.');
      return deleteReminder(subjectId, reminderId);
    },
    onSuccess: () => {
      setDeletingId(null);
      invalidate();
    },
  });

  const openCreate = () => {
    setEditing(null);
    setCreateOpen(true);
    setDeletingId(null);
  };

  const openEdit = (reminder: ReminderSummary) => {
    setCreateOpen(false);
    setEditing(reminder);
    setDeletingId(null);
  };

  const closeForm = () => {
    setCreateOpen(false);
    setEditing(null);
    create.reset();
    update.reset();
  };

  const formMutation = editing ? update : create;
  const formServerErrors: ReminderFormErrors | null = formMutation.isError
    ? (apiReminderErrors(formMutation.error) ?? {
        fields: {},
        general: [getApiErrorMessage(formMutation.error, 'Không lưu được lịch nhắc.')],
      })
    : null;

  const back = (
    <Link to="/app/subjects" className="button button--subtle button--sm care-back">
      ← Người thân
    </Link>
  );

  if (subjects.isPending) {
    return (
      <div className="stack care-page">
        <PageHeader title="Nhắc chăm sóc" breadcrumb={back} />
        <PageLoader label="Đang tải hồ sơ…" />
      </div>
    );
  }

  if (subjects.isError) {
    return (
      <div className="stack care-page">
        <PageHeader title="Nhắc chăm sóc" breadcrumb={back} />
        <ErrorState
          title="Không tải được danh sách hồ sơ"
          message={getApiErrorMessage(subjects.error)}
          onRetry={() => void subjects.refetch()}
          headingLevel={2}
        />
      </div>
    );
  }

  if (!activeSubject) {
    return (
      <div className="stack care-page">
        <PageHeader title="Nhắc chăm sóc" breadcrumb={back} />
        <EmptyState
          title="Chưa có hồ sơ để đặt nhắc"
          description="Tạo hồ sơ cho người cần theo dõi rồi quay lại đây để đặt lịch nhắc."
          action={<ButtonLink to="/app/subjects">Tạo hồ sơ</ButtonLink>}
        />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="stack care-page">
        <PageHeader title="Nhắc chăm sóc" breadcrumb={back} />
        <EmptyState
          title="Chủ hồ sơ không chia sẻ nhắc chăm sóc"
          description="Bạn chưa được xem số đo của hồ sơ này nên cũng không xem được lịch nhắc. Liên hệ chủ hồ sơ nếu cần."
          action={<ButtonLink to="/app/subjects">← Người thân</ButtonLink>}
        />
        <p className="care-disclaimer">{CARE_DISCLAIMER}</p>
      </div>
    );
  }

  const reminderItems = reminders.data?.items ?? [];
  const todayItems = today.data?.items ?? [];
  const todayForbidden = today.isError && isForbiddenError(today.error);
  const remindersForbidden = reminders.isError && isForbiddenError(reminders.error);

  return (
    <div className="stack care-page">
      <PageHeader
        title="Nhắc chăm sóc"
        breadcrumb={back}
        actions={
          isOwner ? (
            <Button
              onClick={openCreate}
              aria-expanded={createOpen}
              aria-controls="care-form-panel"
            >
              {createOpen ? 'Đóng form' : 'Tạo lịch nhắc'}
            </Button>
          ) : null
        }
      />
      <p className="care-disclaimer">{CARE_DISCLAIMER}</p>

      {createOpen || editing ? (
        <section
          id="care-form-panel"
          className="care-surface"
          aria-labelledby="care-form-heading"
        >
          <h2 id="care-form-heading" className="care-surface__title">
            {editing ? `Sửa lịch nhắc “${editing.title}”` : 'Tạo lịch nhắc'}
          </h2>
          <ReminderForm
            key={editing?.id ?? 'create'}
            mode={editing ? 'edit' : 'create'}
            subjectTimezone={activeSubject.timezone}
            initial={editing ?? undefined}
            pending={formMutation.isPending}
            serverErrors={formServerErrors}
            onSubmit={(input) => {
              if (editing) {
                update.mutate({ id: editing.id, input });
              } else {
                create.mutate(input);
              }
            }}
            onCancel={closeForm}
            onEdit={() => formMutation.reset()}
          />
        </section>
      ) : null}

      {remindersForbidden || todayForbidden ? (
        <EmptyState
          title="Chủ hồ sơ không chia sẻ nhắc chăm sóc"
          description="Quyền xem số đo của hồ sơ này vừa thay đổi. Tải lại trang hoặc liên hệ chủ hồ sơ."
          action={<ButtonLink to="/app/subjects">← Người thân</ButtonLink>}
        />
      ) : (
        <>
          {today.isPending ? (
            <PageLoader label="Đang tải lịch hôm nay…" />
          ) : today.isError ? (
            <ErrorState
              title="Không tải được lịch hôm nay"
              message={getApiErrorMessage(today.error)}
              onRetry={() => void today.refetch()}
              headingLevel={2}
            />
          ) : today.data ? (
            <TodayOccurrences
              subjectId={activeSubject.id}
              date={today.data.date}
              items={todayItems}
            />
          ) : null}

          <CareAdherenceSection
            subjectId={activeSubject.id}
            isOwner={isOwner}
            onCreate={openCreate}
          />

          {isOwner ? <CareRulesSection subjectId={activeSubject.id} /> : null}

          <section className="care-section" aria-labelledby="care-list-heading">
            <div className="care-section__head">
              <h2 id="care-list-heading" className="care-section__title">
                Lịch nhắc
              </h2>
              {reminderItems.length > 0 ? (
                <p className="care-section__meta">{reminderItems.length} lịch</p>
              ) : null}
            </div>

            {reminders.isPending ? (
              <PageLoader label="Đang tải lịch nhắc…" />
            ) : reminders.isError ? (
              <ErrorState
                title="Không tải được lịch nhắc"
                message={getApiErrorMessage(reminders.error)}
                onRetry={() => void reminders.refetch()}
                headingLevel={2}
              />
            ) : reminderItems.length === 0 ? (
              <EmptyState
                title="Chưa có lịch nhắc nào"
                description={
                  isOwner
                    ? 'Tạo lịch nhắc đầu tiên để nhắc uống thuốc, vận động hoặc đo chỉ số.'
                    : 'Chủ hồ sơ chưa đặt lịch nhắc nào cho hồ sơ này.'
                }
                action={
                  isOwner ? (
                    <Button onClick={openCreate}>Tạo lịch nhắc đầu tiên</Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="care-list">
                {reminderItems.map((reminder) => {
                  const confirming = deletingId === reminder.id;
                  const deleting = remove.isPending && remove.variables === reminder.id;
                  return (
                    <li key={reminder.id} className="care-item">
                      <div className="care-item__main">
                        <div className="care-item__head">
                          <h3 className="care-item__title">{reminder.title}</h3>
                          <StatusPill tone={reminder.active ? 'success' : 'neutral'}>
                            {reminder.active ? 'Đang bật' : 'Đang tắt'}
                          </StatusPill>
                        </div>
                        <p className="care-item__meta">
                          <span>{REMINDER_KIND_LABELS[reminder.kind]}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatReminderTimes(reminder.times)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatWeekdays(reminder.weekdays)}</span>
                        </p>
                        <p className="care-item__meta">
                          {formatReminderRange(reminder)}
                        </p>
                        {reminder.note ? (
                          <p className="care-item__note">{reminder.note}</p>
                        ) : null}
                      </div>
                      {isOwner ? (
                        <div className="care-item__actions">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openEdit(reminder)}
                            aria-label={`Sửa lịch nhắc ${reminder.title}`}
                          >
                            Sửa
                          </Button>
                          {confirming ? (
                            <div
                              className="care-confirm"
                              role="group"
                              aria-label={`Xác nhận xoá ${reminder.title}`}
                            >
                              <p className="care-confirm__text">
                                Xoá lịch nhắc này? Các đánh dấu đã ghi của lịch cũng bị xoá.
                              </p>
                              <div className="care-confirm__actions">
                                <Button
                                  variant="danger"
                                  size="sm"
                                  disabled={deleting}
                                  onClick={() => remove.mutate(reminder.id)}
                                >
                                  {deleting ? 'Đang xoá…' : 'Xác nhận xoá'}
                                </Button>
                                <Button
                                  variant="subtle"
                                  size="sm"
                                  disabled={deleting}
                                  onClick={() => setDeletingId(null)}
                                >
                                  Huỷ
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              variant="danger-quiet"
                              size="sm"
                              onClick={() => {
                                setDeletingId(reminder.id);
                                remove.reset();
                              }}
                              aria-label={`Xoá lịch nhắc ${reminder.title}`}
                            >
                              Xoá
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            {remove.isError && deletingId ? (
              <Alert tone="error" title="Chưa xoá được lịch nhắc">
                {getApiErrorMessage(remove.error)}
              </Alert>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

