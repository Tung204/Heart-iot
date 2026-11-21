import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router-dom';
import { resolveAlertSchema, type ResolveAlert } from '@heart-iot/contracts/incidents';
import { RESOLUTION_OUTCOMES } from '@heart-iot/contracts/incidents';
import { Alert } from '../../components/Alert';
import { Button, ButtonLink } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { formatDateTime, formatRelativeTime } from '../../lib/format';
import { getApiErrorMessage, isConflictError, isNotFoundError } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { zodFieldErrorMap } from '../../lib/validation';
import { SubjectContextLine } from '../subjects/SubjectSwitcher';
import { useSubjects } from '../subjects/useSubjects';
import { EmergencyContactCard } from '../contacts/EmergencyContactCard';
import { acknowledgeAlert, fetchAlert, resolveAlert } from './api';
import {
  ALERT_STATE_LABELS,
  ALERT_TYPE_LABELS,
  INCIDENT_EVENT_LABELS,
  describeAlertAction,
  isActionableState,
} from './labels';
import '../../styles/alerts.css';

/** resolutionOutcome là string tự do trong hợp đồng — tra theo nhãn đã biết, fallback giá trị gốc. */
const OUTCOME_LABELS: Record<string, string> = {
  supported: 'Đã hỗ trợ người được theo dõi',
  no_action: 'Không cần hành động thêm',
  false_alarm: 'Báo động nhầm',
  other: 'Khác',
};

/** Lý do xung đột 409 hiển thị thân thiện, kèm nút tải lại. */
function ConflictNotice({ onReload }: { onReload: () => void }) {
  return (
    <Alert tone="warning" title="Cảnh báo đã thay đổi ở nơi khác">
      Có người khác đã xác nhận/đóng cảnh báo này hoặc dữ liệu đã cập nhật. Tải lại để xem
      trạng thái mới nhất rồi thử lại nếu vẫn cần.
      <div>
        <Button variant="secondary" size="sm" onClick={onReload}>
          Tải lại cảnh báo
        </Button>
      </div>
    </Alert>
  );
}

/**
 * `/app/alerts/:id` — chi tiết cảnh báo để phối hợp xử lý rồi ghi kết quả.
 * - Quyền và dòng ngữ cảnh ghim theo `detail.subjectId`, KHÔNG theo lựa chọn
 *   hồ sơ đang xem (mở cảnh báo của B khi đang chọn A vẫn đọc đúng B).
 * - Liên hệ khẩn cấp đứng trước thao tác đổi trạng thái trong cây DOM; lỗi tải
 *   liên hệ không chặn xác nhận/đóng và ngược lại.
 * - Xác nhận/đóng mang `expectedVersion`; 409 → thông báo + tải lại, không tự
 *   ghi đè bằng phiên bản mới.
 * - Timeline chỉ hiển thị mốc API trả về: giờ xảy ra (nếu có), giờ nhận, và
 *   đánh dấu sự kiện không áp dụng. Không sáng tác thời điểm.
 */
export function AlertDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const subjects = useSubjects();
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  // Không xác nhận một chạm — mở bước hỏi lại trước khi gọi API, như danh sách.
  const [ackConfirmOpen, setAckConfirmOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState<(typeof RESOLUTION_OUTCOMES)[number]>('supported');
  const [resolveErrors, setResolveErrors] = useState<{
    fields: Record<string, string>;
    general: string[];
  }>({ fields: {}, general: [] });
  const outcomeRef = useRef<HTMLSelectElement>(null);
  const resolveToggleRef = useRef<HTMLButtonElement>(null);
  const ackToggleRef = useRef<HTMLButtonElement>(null);
  const ackConfirmRef = useRef<HTMLButtonElement>(null);

  const detail = useQuery({
    queryKey: queryKeys.alert(id),
    queryFn: ({ signal }) => fetchAlert(id, signal),
    enabled: id.length > 0,
    staleTime: 15_000,
  });

  // Quyền hiển thị nút phải theo đúng hồ sơ của cảnh báo, không theo lựa chọn đang xem.
  const alertSubject = detail.data
    ? (subjects.data?.find((item) => item.id === detail.data?.subjectId) ?? null)
    : null;
  const viewerPermissions = alertSubject?.permissions ?? null;

  const acknowledge = useMutation({
    mutationFn: () => acknowledgeAlert(id, { expectedVersion: detail.data?.version ?? 0 }),
    onSuccess: (updated) => {
      setConflictMessage(null);
      queryClient.setQueryData(queryKeys.alert(id), updated);
      if (updated.subjectId) {
        void queryClient.invalidateQueries({ queryKey: ['subjects', updated.subjectId, 'alerts'] });
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
    onError: (error) => {
      if (isConflictError(error)) {
        setConflictMessage('Có người khác đã thao tác trên cảnh báo này trước bạn.');
      }
    },
  });

  const resolve = useMutation({
    mutationFn: (input: ResolveAlert) => resolveAlert(id, input),
    onSuccess: (updated) => {
      setConflictMessage(null);
      setResolveOpen(false);
      setReason('');
      queryClient.setQueryData(queryKeys.alert(id), updated);
      if (updated.subjectId) {
        void queryClient.invalidateQueries({ queryKey: ['subjects', updated.subjectId, 'alerts'] });
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
    onError: (error) => {
      if (isConflictError(error)) {
        setResolveOpen(false);
        setConflictMessage('Có người khác đã đóng hoặc thay đổi cảnh báo này trước bạn.');
      }
    },
  });

  // Mở form đóng: focus field đầu; Hủy trả focus về nút mở.
  useEffect(() => {
    if (resolveOpen) outcomeRef.current?.focus();
  }, [resolveOpen]);

  // Mở bước xác nhận: focus nút xác nhận để Escape dùng được ngay.
  useEffect(() => {
    if (ackConfirmOpen) ackConfirmRef.current?.focus();
  }, [ackConfirmOpen]);

  /** Đóng bước hỏi lại và trả focus về nút "Tôi đang hỗ trợ". */
  const closeAckConfirm = () => {
    setAckConfirmOpen(false);
    requestAnimationFrame(() => ackToggleRef.current?.focus());
  };

  const handleAcknowledge = () => {
    setAckConfirmOpen(false);
    acknowledge.mutate();
  };

  const state = (location.state ?? null) as
    | { alertsView?: 'alerts' | 'notifications'; alertsFilter?: 'open' | 'closed' }
    | null;
  const backTo = state?.alertsView === 'notifications' ? '/app/alerts?view=notifications' : '/app/alerts';

  if (detail.isPending || (detail.data && subjects.isPending)) {
    return <PageLoader label="Đang tải cảnh báo…" />;
  }

  if (detail.isError) {
    if (isNotFoundError(detail.error)) {
      return (
        <div className="alert-detail">
          <Link className="alert-detail__back" to={backTo}>
            ← Về danh sách cảnh báo
          </Link>
          <EmptyState
            title="Không tìm thấy cảnh báo"
            headingLevel={2}
            description="Cảnh báo này không tồn tại, bạn không có quyền xem, hoặc đang ở trạng thái nghi ngờ chưa xác nhận."
            action={<ButtonLink to={backTo}>Về danh sách cảnh báo</ButtonLink>}
          />
        </div>
      );
    }
    return (
      <ErrorState
        title="Không tải được cảnh báo"
        message={getApiErrorMessage(detail.error)}
        onRetry={() => void detail.refetch()}
      />
    );
  }

  const alert = detail.data;
  // Ghi cảnh báo cần **cả** quyền nhận cảnh báo và quyền hành động tương ứng
  // (`canAcknowledge`/`canResolve` không suy ra `canReceiveAlerts`). Ẩn nút khi
  // chắc chắn API sẽ trả 403 và nói rõ lý do thay vì để người dùng bấm rồi lỗi.
  const canReceiveAlerts = Boolean(
    alertSubject && (alertSubject.role === 'owner' || viewerPermissions?.canReceiveAlerts),
  );
  const canAcknowledge = canReceiveAlerts && Boolean(viewerPermissions?.canAcknowledge);
  const canResolve = canReceiveAlerts && Boolean(viewerPermissions?.canResolve);

  // Quay lại đúng nhóm danh sách: ưu tiên ngữ cảnh đã đi, fallback theo trạng thái.
  const fallbackFilter = isActionableState(alert.state) ? 'open' : 'closed';
  const backState =
    state?.alertsView === 'notifications'
      ? undefined
      : { alertsFilter: state?.alertsFilter ?? fallbackFilter };

  const handleResolveSubmit = (event: FormEvent) => {
    event.preventDefault();
    const input = { expectedVersion: alert.version, reason, outcome };
    const parsed = resolveAlertSchema.safeParse(input);
    if (!parsed.success) {
      setResolveErrors(
        zodFieldErrorMap(parsed.error, input, {
          reason: (issue, value) => {
            if (String(value ?? '').trim() === '') return 'Vui lòng nhập lý do đóng cảnh báo.';
            if (issue.code === 'too_small') return `Lý do cần ít nhất ${issue.minimum} ký tự.`;
            if (issue.code === 'too_big') return `Lý do quá dài (tối đa ${issue.maximum} ký tự).`;
            return 'Lý do chưa hợp lệ.';
          },
          outcome: () => 'Vui lòng chọn kết quả xử lý.',
        }),
      );
      return;
    }
    setResolveErrors({ fields: {}, general: [] });
    resolve.mutate(parsed.data);
  };

  const actionable = isActionableState(alert.state);
  const notFoundSubject = subjects.isSuccess && !alertSubject;

  return (
    <div className="alert-detail">
      <Link className="alert-detail__back" to={backTo} state={backState}>
        ← Về danh sách cảnh báo
      </Link>

      <header className="alert-detail__head">
        {/* Ghim theo đối tượng của cảnh báo (detail.subjectId), không phải selection. */}
        {alertSubject ? (
          <SubjectContextLine
            scope="pinned"
            subject={{ displayName: alertSubject.displayName, role: alertSubject.role }}
          />
        ) : null}
        <div className="alert-detail__title-row">
          <h1 className="page-title">{ALERT_TYPE_LABELS[alert.type]}</h1>
          <StatusPill
            tone={
              alert.state === 'open'
                ? 'brick'
                : alert.state === 'acknowledged'
                  ? 'teal'
                  : 'neutral'
            }
          >
            {ALERT_STATE_LABELS[alert.state]}
          </StatusPill>
        </div>
        <p className="alert-detail__meta">
          Phát hiện {formatDateTime(alert.detectedAt)} (
          {formatRelativeTime(alert.detectedAt) ?? 'chưa rõ thời điểm'}) · thiết bị{' '}
          {alert.device.label} {alert.device.serial ? `(${alert.device.serial})` : ''}
          {alert.late ? ' · cảnh báo nhận trễ' : ''}
        </p>
        {alert.startedBeforeShare ? (
          <Alert tone="info" title="Cảnh báo bắt đầu trước khi bạn được chia sẻ quyền">
            Cảnh báo này vẫn đang mở nên được hiển thị như trạng thái an toàn hiện tại. Lịch
            sử chi tiết trước thời điểm bạn được chia sẻ quyền không được cung cấp.
          </Alert>
        ) : null}
        {alert.resolutionReason || alert.resolutionOutcome ? (
          <p className="alert-detail__meta">
            Kết quả:{' '}
            {alert.resolutionOutcome
              ? (OUTCOME_LABELS[alert.resolutionOutcome] ?? alert.resolutionOutcome)
              : ''}
            {alert.resolutionReason ? ` — ${alert.resolutionReason}` : ''}
          </p>
        ) : null}
        {subjects.isError ? (
          <Alert tone="warning" announce="status" title="Chưa xác minh được quyền của hồ sơ">
            Không tải được danh sách hồ sơ nên chưa thể xác nhận quyền xác nhận/đóng cảnh báo.
            Thử lại để tiếp tục.
            <div>
              <Button variant="secondary" size="sm" onClick={() => void subjects.refetch()}>
                Thử lại
              </Button>
            </div>
          </Alert>
        ) : null}
        {notFoundSubject ? (
          <Alert tone="warning" title="Không còn quyền xem hồ sơ của cảnh báo này">
            Cảnh báo vẫn hiển thị nhưng tài khoản của bạn không còn trong danh sách người xem hồ
            sơ. Không thể xác nhận/đóng cho tới khi chủ hồ sơ chia sẻ lại quyền.
          </Alert>
        ) : null}
      </header>

      {conflictMessage ? (
        <ConflictNotice
          onReload={() => {
            setConflictMessage(null);
            void detail.refetch();
          }}
        />
      ) : null}

      {actionable ? (
        <section className="alert-detail__action" aria-labelledby="alert-action-heading">
          <h2 id="alert-action-heading" className="alert-detail__section-title">
            {alert.state === 'acknowledged'
              ? 'Đang có người hỗ trợ'
              : 'Cảnh báo cần hành động'}
          </h2>
          {alert.acknowledgedBy ? (
            <p>
              <strong>{alert.acknowledgedBy.displayName}</strong> đã xác nhận đang hỗ trợ. Người
              khác có quyền vẫn có thể phối hợp hoặc đóng cảnh báo.
            </p>
          ) : (
            <p>Chưa có người xác nhận hỗ trợ.</p>
          )}

          {/*
            Liên hệ khẩn cấp đứng TRƯỚC thao tác đổi trạng thái trong DOM để trong
            viewport đầu (390/360) nút Gọi thấy được trước "Tôi đang hỗ trợ".
            Card tự ẩn khi đang tải/lỗi nên không chặn xác nhận/đóng.
          */}
          {alertSubject && canReceiveAlerts ? (
            <EmergencyContactCard
              subjectId={alert.subjectId}
              isOwner={alertSubject.role === 'owner'}
              enabled={canReceiveAlerts}
            />
          ) : null}

          <div className="alert-detail__actions">
            {!alert.acknowledgedBy && alert.state === 'open' && canAcknowledge ? (
              ackConfirmOpen ? (
                <div
                  className="alert-detail__confirm"
                  role="group"
                  aria-label="Xác nhận hỗ trợ cảnh báo"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.stopPropagation();
                      closeAckConfirm();
                    }
                  }}
                >
                  <p className="alert-detail__confirm-question">
                    Bạn đã liên hệ và đang hỗ trợ?
                  </p>
                  <div className="alert-detail__confirm-actions">
                    <Button
                      ref={ackConfirmRef}
                      disabled={acknowledge.isPending}
                      onClick={handleAcknowledge}
                    >
                      Có, tôi đang hỗ trợ
                    </Button>
                    <Button
                      variant="subtle"
                      disabled={acknowledge.isPending}
                      onClick={closeAckConfirm}
                    >
                      Hủy
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  ref={ackToggleRef}
                  onClick={() => setAckConfirmOpen(true)}
                  disabled={acknowledge.isPending}
                >
                  {acknowledge.isPending ? 'Đang gửi…' : 'Tôi đang hỗ trợ'}
                </Button>
              )
            ) : null}
            {!alert.acknowledgedBy &&
            alert.state === 'open' &&
            canReceiveAlerts &&
            !canAcknowledge ? (
              <p className="alerts-row__hint">
                Bạn không có quyền xác nhận cảnh báo này (do chủ hồ sơ cài đặt).
              </p>
            ) : null}
            {canResolve ? (
              <Button
                ref={resolveToggleRef}
                variant="secondary"
                aria-expanded={resolveOpen}
                aria-controls="resolve-form"
                onClick={() =>
                  setResolveOpen((open) => {
                    if (open) requestAnimationFrame(() => resolveToggleRef.current?.focus());
                    return !open;
                  })
                }
              >
                {resolveOpen ? 'Thu gọn' : 'Đóng cảnh báo'}
              </Button>
            ) : null}
            {canReceiveAlerts && !canResolve ? (
              <p className="alerts-row__hint">
                Bạn không có quyền đóng cảnh báo — hãy liên hệ chủ hồ sơ.
              </p>
            ) : null}
          </div>

          {!canReceiveAlerts && viewerPermissions ? (
            <p className="alerts-row__hint">
              Chủ hồ sơ không chia sẻ quyền nhận cảnh báo với bạn, nên bạn không thể xác nhận
              hoặc đóng cảnh báo này. Liên hệ chủ hồ sơ nếu bạn cần được cấp quyền.
            </p>
          ) : null}

          {acknowledge.isError && !isConflictError(acknowledge.error) ? (
            <Alert tone="error" title="Chưa gửi được xác nhận">
              {getApiErrorMessage(acknowledge.error)} Cảnh báo vẫn giữ nguyên trạng thái.
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => acknowledge.mutate()}
                  disabled={acknowledge.isPending}
                >
                  Thử lại
                </Button>
              </div>
            </Alert>
          ) : null}
          {resolve.isError && !isConflictError(resolve.error) ? (
            <Alert tone="error" title="Chưa đóng được cảnh báo">
              {getApiErrorMessage(resolve.error)} Cảnh báo vẫn giữ nguyên trạng thái.
            </Alert>
          ) : null}

          {resolveOpen ? (
            <form
              className="alert-detail__resolve"
              id="resolve-form"
              onSubmit={handleResolveSubmit}
              noValidate
            >
              <div className="field">
                <label className="field__label" htmlFor="resolve-outcome">
                  Kết quả xử lý
                </label>
                <select
                  ref={outcomeRef}
                  id="resolve-outcome"
                  className="field__input"
                  value={outcome}
                  onChange={(event) =>
                    setOutcome(event.target.value as (typeof RESOLUTION_OUTCOMES)[number])
                  }
                  aria-invalid={resolveErrors.fields.outcome ? true : undefined}
                  aria-describedby={
                    resolveErrors.fields.outcome ? 'resolve-outcome-error' : undefined
                  }
                >
                  {RESOLUTION_OUTCOMES.map((value) => (
                    <option key={value} value={value}>
                      {OUTCOME_LABELS[value]}
                    </option>
                  ))}
                </select>
                {resolveErrors.fields.outcome ? (
                  <p className="field__error" id="resolve-outcome-error" role="alert">
                    {resolveErrors.fields.outcome}
                  </p>
                ) : null}
              </div>
              <div className="field">
                <label className="field__label" htmlFor="resolve-reason">
                  Lý do đóng cảnh báo <span aria-hidden="true">*</span>
                </label>
                <textarea
                  id="resolve-reason"
                  className="field__input"
                  rows={3}
                  value={reason}
                  maxLength={500}
                  aria-invalid={resolveErrors.fields.reason ? true : undefined}
                  aria-describedby={
                    resolveErrors.fields.reason ? 'resolve-reason-error' : undefined
                  }
                  onChange={(event) => setReason(event.target.value)}
                />
                {resolveErrors.fields.reason ? (
                  <p className="field__error" id="resolve-reason-error" role="alert">
                    {resolveErrors.fields.reason}
                  </p>
                ) : null}
              </div>
              <div className="alert-detail__resolve-actions">
                <Button type="submit" disabled={resolve.isPending}>
                  {resolve.isPending ? 'Đang đóng…' : 'Xác nhận đóng cảnh báo'}
                </Button>
                <Button
                  type="button"
                  variant="subtle"
                  disabled={resolve.isPending}
                  onClick={() => {
                    setResolveOpen(false);
                    requestAnimationFrame(() => resolveToggleRef.current?.focus());
                  }}
                >
                  Hủy
                </Button>
              </div>
            </form>
          ) : null}
        </section>
      ) : (
        <section className="alert-detail__panel alert-detail__panel--ended" aria-labelledby="alert-ended-heading">
          <h2 id="alert-ended-heading" className="alert-detail__section-title">
            Cảnh báo đã kết thúc
          </h2>
          <p>
            Trạng thái: {ALERT_STATE_LABELS[alert.state]}
            {alert.cancelledAt ? ` · hủy lúc ${formatDateTime(alert.cancelledAt)}` : ''}
            {alert.resolvedAt ? ` · đóng lúc ${formatDateTime(alert.resolvedAt)}` : ''}
          </p>
        </section>
      )}

      <section aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="alert-detail__section-title">
          Diễn biến sự kiện
        </h2>
        {alert.events.length === 0 ? (
          <p className="alerts-row__hint">Chưa có sự kiện thiết bị nào được ghi nhận.</p>
        ) : (
          <ol className="alert-detail__timeline">
            {alert.events.map((event) => (
              <li
                key={event.eventRevision}
                className={`alert-detail__event${
                  event.applied ? '' : ' alert-detail__event--skipped'
                }`}
              >
                <p className="alert-detail__event-title">
                  {INCIDENT_EVENT_LABELS[event.eventType]}
                  {event.applied ? '' : ' — không áp dụng'}
                </p>
                <p className="alert-detail__event-meta">
                  {event.measuredAt ? (
                    event.measuredAt === event.receivedAt ? (
                      <>
                        Xảy ra và nhận{' '}
                        <time dateTime={event.receivedAt}>
                          {formatDateTime(event.receivedAt)}
                        </time>
                      </>
                    ) : (
                      <>
                        Xảy ra{' '}
                        <time dateTime={event.measuredAt}>
                          {formatDateTime(event.measuredAt)}
                        </time>
                        {' · '}
                        Nhận{' '}
                        <time dateTime={event.receivedAt}>
                          {formatDateTime(event.receivedAt)}
                        </time>
                      </>
                    )
                  ) : (
                    <>
                      Nhận{' '}
                      <time dateTime={event.receivedAt}>
                        {formatDateTime(event.receivedAt)}
                      </time>
                    </>
                  )}
                  {event.conflictReason ? ` · ${event.conflictReason}` : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading" className="alert-detail__section-title">
          Hành động của người hỗ trợ
        </h2>
        {alert.actions.length === 0 ? (
          <p className="alerts-row__hint">Chưa có ai thao tác trên cảnh báo này.</p>
        ) : (
          <ul className="alert-detail__log">
            {alert.actions.map((action) => (
              <li key={action.id}>{describeAlertAction(action)}</li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recipients-heading">
        <h2 id="recipients-heading" className="alert-detail__section-title">
          Người nhận cảnh báo
        </h2>
        {alert.recipients.length === 0 ? (
          <p className="alerts-row__hint">Chưa có người nhận.</p>
        ) : (
          <ul className="alert-detail__recipients">
            {alert.recipients.map((recipient) => (
              <li key={recipient.userId} className="alert-detail__recipient">
                <span className="alert-detail__recipient-name">{recipient.displayName}</span>
                <span className="alert-detail__recipient-perms">
                  xác nhận: {recipient.permissions.canAcknowledge ? 'có' : 'không'} · đóng:{' '}
                  {recipient.permissions.canResolve ? 'có' : 'không'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
