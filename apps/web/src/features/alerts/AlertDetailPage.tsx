import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { resolveAlertSchema, type ResolveAlert } from '@annhien/contracts/incidents';
import { RESOLUTION_OUTCOMES } from '@annhien/contracts/incidents';
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
import { acknowledgeAlert, fetchAlert, resolveAlert } from './api';
import {
  ALERT_STATE_LABELS,
  ALERT_TYPE_LABELS,
  INCIDENT_EVENT_LABELS,
  describeAlertAction,
  isActionableState,
} from './labels';
import { useSubjects } from '../subjects/useSubjects';
import { EmergencyContactCard } from '../contacts/EmergencyContactCard';

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
      trạng thái mới nhất rồi thử lại nếu vẫn cần.{' '}
      <Button variant="secondary" size="sm" onClick={onReload}>
        Tải lại cảnh báo
      </Button>
    </Alert>
  );
}

/**
 * /app/alerts/:id — chi tiết cảnh báo:
 * - Timeline sự kiện thiết bị + lịch sử hành động của người hỗ trợ.
 * - Danh sách người nhận cảnh báo (tên + quyền, không có email).
 * - Xác nhận/đóng với expectedVersion; 409 → thông báo + tải lại.
 */
export function AlertDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const subjects = useSubjects();
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState<(typeof RESOLUTION_OUTCOMES)[number]>('supported');
  const [resolveErrors, setResolveErrors] = useState<{
    fields: Record<string, string>;
    general: string[];
  }>({ fields: {}, general: [] });

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

  if (detail.isPending) {
    return <PageLoader label="Đang tải cảnh báo…" />;
  }

  if (detail.isError) {
    if (isNotFoundError(detail.error)) {
      return (
        <EmptyState
          title="Không tìm thấy cảnh báo"
          description="Cảnh báo này không tồn tại, bạn không có quyền xem, hoặc đang ở trạng thái nghi ngờ chưa xác nhận."
          action={<ButtonLink to="/app/alerts">Về danh sách cảnh báo</ButtonLink>}
        />
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
  const canReceiveAlerts = viewerPermissions?.canReceiveAlerts ?? false;
  const canAcknowledge = canReceiveAlerts && (viewerPermissions?.canAcknowledge ?? false);
  const canResolve = canReceiveAlerts && (viewerPermissions?.canResolve ?? false);

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

  return (
    <div className="stack">
      <nav aria-label="Đường dẫn">
        <Link to="/app/alerts" className="breadcrumb">
          ← Về danh sách cảnh báo
        </Link>
      </nav>

      <header>
        <h1 className="page-title">
          {ALERT_TYPE_LABELS[alert.type]}
          <StatusPill
            tone={alert.state === 'open' ? 'brick' : alert.state === 'acknowledged' ? 'teal' : 'neutral'}
            className="alert-detail__state"
          >
            {ALERT_STATE_LABELS[alert.state]}
          </StatusPill>
        </h1>
        <p className="page-lead">
          Phát hiện {formatDateTime(alert.detectedAt)} (
          {formatRelativeTime(alert.detectedAt)}) · thiết bị {alert.device.label}{' '}
          {alert.device.serial ? `(${alert.device.serial})` : ''}
          {alert.late ? ' · cảnh báo nhận trễ' : ''}
        </p>
        {alert.startedBeforeShare ? (
          <Alert tone="info" title="Cảnh báo bắt đầu trước khi bạn được chia sẻ quyền">
            Cảnh báo này vẫn đang mở nên được hiển thị như trạng thái an toàn hiện tại.
            Lịch sử chi tiết trước thời điểm bạn được chia sẻ quyền không được cung cấp.
          </Alert>
        ) : null}
        {alert.resolutionReason || alert.resolutionOutcome ? (
          <p className="page-lead">
            Kết quả:{' '}
            {alert.resolutionOutcome
              ? (OUTCOME_LABELS[alert.resolutionOutcome] ?? alert.resolutionOutcome)
              : ''}
            {alert.resolutionReason ? ` — ${alert.resolutionReason}` : ''}
          </p>
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

      {/*
        F04 — liên hệ khẩn cấp đứng trước mọi hành động đổi trạng thái: trong
        viewport đầu 390/360, "Gọi" phải thấy được trước "Tôi đang hỗ trợ" và
        "Đóng cảnh báo". Card tự ẩn khi lỗi tải để không chặn nội dung cảnh báo.
      */}
      {alertSubject &&
      viewerPermissions &&
      (alertSubject.role === 'owner' || viewerPermissions.canReceiveAlerts) ? (
        <EmergencyContactCard
          subjectId={alert.subjectId}
          isOwner={alertSubject.role === 'owner'}
        />
      ) : null}

      {isActionableState(alert.state) ? (
        <section
          className="card alert-detail__action-card"
          aria-labelledby="alert-action-heading"
        >
          <h2 id="alert-action-heading" className="card__title">
            {alert.state === 'acknowledged'
              ? 'Đang có người hỗ trợ'
              : 'Cảnh báo cần hành động'}
          </h2>
          {alert.acknowledgedBy ? (
            <p>
              <strong>{alert.acknowledgedBy.displayName}</strong> đã xác nhận đang hỗ trợ.
              Người khác có quyền vẫn có thể phối hợp hoặc đóng cảnh báo.
            </p>
          ) : (
            <p>Chưa có người xác nhận hỗ trợ.</p>
          )}
          {viewerPermissions && !canReceiveAlerts ? (
            <p className="field__hint">
              Chủ hồ sơ không chia sẻ quyền nhận cảnh báo với bạn, nên bạn không thể xác nhận
              hoặc đóng cảnh báo này. Liên hệ chủ hồ sơ nếu bạn cần được cấp quyền.
            </p>
          ) : null}
          <div className="alert-detail__actions">
            {!alert.acknowledgedBy && alert.state === 'open' && canAcknowledge ? (
              <Button onClick={() => acknowledge.mutate()} disabled={acknowledge.isPending}>
                {acknowledge.isPending ? 'Đang gửi…' : 'Tôi đang hỗ trợ'}
              </Button>
            ) : !alert.acknowledgedBy && alert.state === 'open' && canReceiveAlerts ? (
              <p className="field__hint">
                Bạn không có quyền xác nhận cảnh báo này (do chủ hồ sơ cài đặt).
              </p>
            ) : null}
            {canResolve ? (
              <Button variant="secondary" onClick={() => setResolveOpen((v) => !v)}>
                {resolveOpen ? 'Thu gọn' : 'Đóng cảnh báo'}
              </Button>
            ) : canReceiveAlerts ? (
              <p className="field__hint">
                Bạn không có quyền đóng cảnh báo — hãy liên hệ chủ hồ sơ.
              </p>
            ) : null}
          </div>
          {acknowledge.isError && !isConflictError(acknowledge.error) ? (
            <Alert tone="error" title="Chưa gửi được xác nhận">
              {getApiErrorMessage(acknowledge.error)} Cảnh báo vẫn giữ nguyên trạng thái.{' '}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => acknowledge.mutate()}
                disabled={acknowledge.isPending}
              >
                Thử lại
              </Button>
            </Alert>
          ) : null}
          {resolve.isError && !isConflictError(resolve.error) ? (
            <Alert tone="error">{getApiErrorMessage(resolve.error)}</Alert>
          ) : null}
          {resolveOpen ? (
            <form className="resolve-form" onSubmit={handleResolveSubmit} noValidate>
              <div className="field">
                <label className="field__label" htmlFor="resolve-outcome">
                  Kết quả xử lý
                </label>
                <select
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
                  aria-describedby={resolveErrors.fields.reason ? 'resolve-reason-error' : undefined}
                  onChange={(event) => setReason(event.target.value)}
                />
                {resolveErrors.fields.reason ? (
                  <p className="field__error" id="resolve-reason-error" role="alert">
                    {resolveErrors.fields.reason}
                  </p>
                ) : null}
              </div>
              <div className="resolve-form__actions">
                <Button type="submit" disabled={resolve.isPending}>
                  {resolve.isPending ? 'Đang đóng…' : 'Xác nhận đóng cảnh báo'}
                </Button>
                <Button
                  type="button"
                  variant="subtle"
                  onClick={() => setResolveOpen(false)}
                  disabled={resolve.isPending}
                >
                  Hủy
                </Button>
              </div>
            </form>
          ) : null}
        </section>
      ) : (
        <section className="card" aria-labelledby="alert-ended-heading">
          <h2 id="alert-ended-heading" className="card__title">
            Cảnh báo đã kết thúc
          </h2>
          <p>
            Trạng thái: {ALERT_STATE_LABELS[alert.state]}
            {alert.cancelledAt ? ` · hủy lúc ${formatDateTime(alert.cancelledAt)}` : ''}
            {alert.resolvedAt ? ` · đóng lúc ${formatDateTime(alert.resolvedAt)}` : ''}
          </p>
        </section>
      )}

      {/*
        Liên hệ khẩn cấp đã được đặt phía trên (F04) để hành động gọi nằm trong
        màn đầu; ở đây chỉ còn phần diễn biến, hành động và người nhận.
      */}
      <section aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="section-title">
          Diễn biến sự kiện
        </h2>
        {alert.events.length === 0 ? (
          <p className="field__hint">Chưa có sự kiện thiết bị nào được ghi nhận.</p>
        ) : (
          <ol className="timeline">
            {alert.events.map((event) => (
              <li
                key={event.eventRevision}
                className={`timeline__item${event.applied ? '' : ' timeline__item--skipped'}`}
              >
                <p className="timeline__title">
                  {INCIDENT_EVENT_LABELS[event.eventType]}
                  {event.applied ? '' : ' — không áp dụng'}
                </p>
                <p className="timeline__meta">
                  {event.measuredAt ? `Xảy ra ${formatDateTime(event.measuredAt)} · ` : ''}
                  Nhận {formatDateTime(event.receivedAt)}
                  {event.conflictReason ? ` · ${event.conflictReason}` : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading" className="section-title">
          Hành động của người hỗ trợ
        </h2>
        {alert.actions.length === 0 ? (
          <p className="field__hint">Chưa có ai thao tác trên cảnh báo này.</p>
        ) : (
          <ul className="action-log">
            {alert.actions.map((action) => (
              <li key={action.id}>{describeAlertAction(action)}</li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recipients-heading">
        <h2 id="recipients-heading" className="section-title">
          Người nhận cảnh báo
        </h2>
        {alert.recipients.length === 0 ? (
          <p className="field__hint">Chưa có người nhận.</p>
        ) : (
          <ul className="recipient-list">
            {alert.recipients.map((recipient) => (
              <li key={recipient.userId} className="recipient-list__item">
                <span className="recipient-list__name">{recipient.displayName}</span>
                <span className="recipient-list__perms">
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
