import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type { IncidentSummary } from '@heart-iot/contracts/incidents';
import { Alert } from '../../components/Alert';
import { Button, ButtonLink } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { formatDateTime } from '../../lib/format';
import { getApiErrorMessage, isConflictError } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { useActiveSubject } from '../subjects/selection';
import { useSubjects } from '../subjects/useSubjects';
import { useUnreadNotifications } from '../notifications/useUnreadNotifications';
import { NotificationsPage } from '../notifications/NotificationsPage';
import { acknowledgeAlert, fetchAlerts } from './api';
import {
  ALERT_STATE_LABELS,
  ALERT_TYPE_LABELS,
  isActionableState,
  isHighSeverity,
} from './labels';
import '../../styles/alerts.css';

const PAGE_SIZE = 25;

type StateFilter = 'open' | 'closed';

/** Dấu "cần chú ý" — SVG nội bộ, không dùng emoji thay trạng thái. */
function AttentionIcon() {
  return (
    <svg
      className="alerts-row__flag"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3.5 3.5 19h17z" />
      <path d="M12 9v4.5M12 16.5v.1" />
    </svg>
  );
}

/**
 * `/app/alerts` — cảnh báo của đúng hồ sơ đang theo dõi, và hộp thông báo
 * toàn tài khoản ở `?view=notifications` (cùng trang, cùng URL).
 *
 * Hành vi nghiệp vụ giữ nguyên:
 * - Đọc theo subject đang chọn; thiếu quyền nhận cảnh báo thì giải thích và
 *   không gọi API biết chắc bị cấm.
 * - Xác nhận nhanh cần **cả** `canReceiveAlerts` và `canAcknowledge`; POST mang
 *   `expectedVersion` của bản ghi. 409 → tải lại danh sách, không tự đoán.
 * - Lỗi tải lại/SSE hỏng giữ danh sách đã có kèm mốc cập nhật, không xoá cảnh
 *   báo cũ thành "không có cảnh báo".
 * - Thông báo đã nhận không xác nhận/đóng cảnh báo; mỗi hàng mở đúng incident.
 */
export function AlertsPage() {
  const subjects = useSubjects();
  const activeSubject = useActiveSubject(subjects.data);
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const inbox = searchParams.get('view') === 'notifications';

  // Quay lại từ chi tiết giữ đúng nhóm đang xem (mở/đã đóng).
  const initialFilter: StateFilter =
    (location.state as { alertsFilter?: StateFilter } | null)?.alertsFilter === 'closed'
      ? 'closed'
      : 'open';
  const [stateFilter, setStateFilter] = useState<StateFilter>(initialFilter);
  const queryClient = useQueryClient();
  const [conflictAlertId, setConflictAlertId] = useState<string | null>(null);
  const [ackFailure, setAckFailure] = useState<{ alertId: string; message: string } | null>(
    null,
  );
  // Không xác nhận một chạm từ danh sách — mở bước hỏi lại trước khi gọi API.
  const [confirmingAlertId, setConfirmingAlertId] = useState<string | null>(null);

  const { unreadCount } = useUnreadNotifications();
  const viewerPermissions = activeSubject?.permissions ?? null;
  // Quyền nhận cảnh báo: chủ hồ sơ luôn nhận; người thân cần cờ canReceiveAlerts.
  const canReceiveAlerts = Boolean(
    activeSubject && (activeSubject.role === 'owner' || viewerPermissions?.canReceiveAlerts),
  );
  const canAcknowledge = canReceiveAlerts && Boolean(viewerPermissions?.canAcknowledge);

  const alerts = useInfiniteQuery({
    queryKey: queryKeys.subjectAlerts(activeSubject?.id ?? 'none', stateFilter),
    queryFn: ({ signal, pageParam }) =>
      activeSubject
        ? fetchAlerts(
            activeSubject.id,
            { state: stateFilter, cursor: pageParam, limit: PAGE_SIZE },
            signal,
          )
        : null,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: Boolean(activeSubject) && canReceiveAlerts && !inbox,
    staleTime: 15_000,
  });

  const acknowledge = useMutation({
    mutationFn: ({ alertId, version }: { alertId: string; version: number }) =>
      acknowledgeAlert(alertId, { expectedVersion: version }),
    onSuccess: () => {
      setConflictAlertId(null);
      setAckFailure(null);
      if (activeSubject) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.subjectAlerts(activeSubject.id, stateFilter),
        });
      }
    },
    onError: (error, variables) => {
      if (isConflictError(error)) {
        setAckFailure(null);
        setConflictAlertId(variables.alertId);
        // Tải lại ngay để phân biệt "đã có người xác nhận" với "dữ liệu cũ".
        void alerts.refetch();
        return;
      }
      // Lỗi mạng/5xx không được im lặng: hiện thông báo + giữ nguyên danh sách.
      setConflictAlertId(null);
      setAckFailure({ alertId: variables.alertId, message: getApiErrorMessage(error) });
    },
  });

  const items = alerts.data?.pages.flatMap((page) => page?.items ?? []) ?? [];
  const hasItems = items.length > 0;
  const updatedAt = alerts.dataUpdatedAt
    ? formatDateTime(new Date(alerts.dataUpdatedAt).toISOString())
    : null;
  const conflictAcknowledgedBy = conflictAlertId
    ? (items.find((item) => item.id === conflictAlertId)?.acknowledgedBy ?? null)
    : null;

  const handleAcknowledge = (item: IncidentSummary) => {
    setConfirmingAlertId(null);
    setConflictAlertId(null);
    setAckFailure(null);
    acknowledge.mutate({ alertId: item.id, version: item.version });
  };

  /** Chi tiết nhận ngữ cảnh quay lại để "Về danh sách" đúng chỗ đã đi. */
  const detailLinkState = inbox
    ? { alertsView: 'notifications' as const, alertsFilter: stateFilter }
    : { alertsView: 'alerts' as const, alertsFilter: stateFilter };

  return (
    <div className="alerts-page">
      <header className="alerts-page__head">
        <h1 className="page-title">Cảnh báo</h1>
        {inbox ? null : (
          <p className="alerts-page__lead">Cảnh báo chỉ cập nhật khi ứng dụng đang mở.</p>
        )}
      </header>

      <nav className="alerts-tabs" aria-label="Chế độ xem cảnh báo">
        <Link
          className="alerts-tabs__link"
          to="/app/alerts"
          aria-current={inbox ? undefined : 'page'}
        >
          Cảnh báo
        </Link>
        <Link
          className="alerts-tabs__link"
          to="/app/alerts?view=notifications"
          aria-current={inbox ? 'page' : undefined}
        >
          Thông báo đã nhận
          {unreadCount > 0 ? (
            <>
              <span className="alerts-tabs__count" aria-hidden="true">
                {unreadCount}
              </span>
              <span className="visually-hidden">, {unreadCount} chưa đọc</span>
            </>
          ) : null}
        </Link>
      </nav>

      {inbox ? (
        <NotificationsPage headingLevel={2} />
      ) : subjects.isError ? (
        <ErrorState
          title="Không tải được danh sách hồ sơ"
          headingLevel={2}
          message={getApiErrorMessage(subjects.error)}
          onRetry={() => void subjects.refetch()}
        />
      ) : subjects.isPending ? (
        <PageLoader label="Đang tải hồ sơ…" />
      ) : !activeSubject ? (
        <EmptyState
          title="Chưa có hồ sơ để xem cảnh báo"
          headingLevel={2}
          description="Tạo hồ sơ cho người cần theo dõi hoặc chọn hồ sơ ở đầu trang."
          action={<ButtonLink to="/app/subjects">Tạo hồ sơ</ButtonLink>}
        />
      ) : !canReceiveAlerts ? (
        <Alert tone="info" title="Bạn không có quyền xem cảnh báo của hồ sơ này">
          Chủ hồ sơ chưa chia sẻ quyền nhận cảnh báo với bạn. Liên hệ chủ hồ sơ nếu bạn cần
          theo dõi cảnh báo.
        </Alert>
      ) : (
        <>
          <div className="alerts-toolbar">
            <div className="alerts-filter" role="group" aria-label="Lọc cảnh báo theo trạng thái">
              <button
                type="button"
                className="alerts-filter__button"
                aria-pressed={stateFilter === 'open'}
                onClick={() => setStateFilter('open')}
              >
                Đang mở
              </button>
              <button
                type="button"
                className="alerts-filter__button"
                aria-pressed={stateFilter === 'closed'}
                onClick={() => setStateFilter('closed')}
              >
                Đã đóng
              </button>
            </div>
            {updatedAt && hasItems ? (
              <p className="alerts-updated">Cập nhật lúc {updatedAt}</p>
            ) : null}
          </div>

          {conflictAlertId ? (
            <Alert
              tone="warning"
              title={
                conflictAcknowledgedBy
                  ? 'Cảnh báo đã có người xác nhận'
                  : 'Danh sách có thể chưa cập nhật'
              }
            >
              {conflictAcknowledgedBy
                ? `${conflictAcknowledgedBy.displayName} đã xác nhận đang hỗ trợ cảnh báo này. Danh sách vừa được cập nhật — bạn không cần xác nhận lại.`
                : 'Cảnh báo đã thay đổi ở nơi khác trong lúc bạn thao tác. Danh sách dưới đây có thể cũ — hãy tải lại để xem trạng thái mới nhất.'}
              {!conflictAcknowledgedBy ? (
                <div>
                  <Button variant="secondary" size="sm" onClick={() => void alerts.refetch()}>
                    Tải lại danh sách
                  </Button>
                </div>
              ) : null}
            </Alert>
          ) : null}

          {ackFailure ? (
            <Alert tone="error" title="Chưa xác nhận được cảnh báo">
              {ackFailure.message} Cảnh báo vẫn giữ nguyên trạng thái. Kiểm tra kết nối và thử
              lại.
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={acknowledge.isPending}
                  onClick={() => {
                    const target = items.find((item) => item.id === ackFailure.alertId);
                    if (target) {
                      handleAcknowledge(target);
                    } else {
                      void alerts.refetch();
                    }
                  }}
                >
                  Thử lại
                </Button>
              </div>
            </Alert>
          ) : null}

          {alerts.isError && hasItems ? (
            <Alert tone="warning" announce="status" title="Không cập nhật được danh sách">
              Đang hiển thị cảnh báo đã tải{updatedAt ? ` lúc ${updatedAt}` : ''}.{' '}
              {getApiErrorMessage(alerts.error)}
              <div>
                <Button variant="secondary" size="sm" onClick={() => void alerts.refetch()}>
                  Thử lại
                </Button>
              </div>
            </Alert>
          ) : null}

          {alerts.isPending ? (
            <PageLoader label="Đang tải cảnh báo…" />
          ) : alerts.isError && !hasItems ? (
            <ErrorState
              title="Không tải được cảnh báo"
              headingLevel={2}
              message={getApiErrorMessage(alerts.error)}
              onRetry={() => void alerts.refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState
              title={
                stateFilter === 'open'
                  ? 'Không có cảnh báo đang mở'
                  : 'Không có cảnh báo đã đóng'
              }
              headingLevel={2}
              description={
                stateFilter === 'open'
                  ? 'Khi thiết bị phát hiện nghi ngã hoặc yêu cầu trợ giúp, cảnh báo sẽ xuất hiện tại đây.'
                  : 'Cảnh báo đã đóng/hủy hoặc chưa xác định do thiếu kết quả cuối sẽ được liệt kê tại đây khi có.'
              }
            />
          ) : (
            <>
              <ul
                className="alerts-list"
                aria-label={`Danh sách cảnh báo ${
                  stateFilter === 'open' ? 'đang mở' : 'đã đóng'
                }`}
              >
                {items.map((item) => {
                  const attention = isHighSeverity(item) && isActionableState(item.state);
                  const canAct = isActionableState(item.state) && item.state === 'open';
                  const awaitingSomeone = !item.acknowledgedBy;
                  return (
                    <li
                      key={item.id}
                      className={`alerts-row${attention ? ' alerts-row--attention' : ''}`}
                    >
                      <div className="alerts-row__main">
                        <p className="alerts-row__title">
                          <Link
                            className="alerts-row__link"
                            to={`/app/alerts/${item.id}`}
                            state={detailLinkState}
                          >
                            {attention ? <AttentionIcon /> : null}
                            {ALERT_TYPE_LABELS[item.type]}
                            {attention ? ' — cần chú ý' : ''}
                          </Link>
                        </p>
                        <p className="alerts-row__meta">
                          Phát hiện {formatDateTime(item.detectedAt)}
                          {item.late ? ' · nhận trễ' : ''}
                          {item.state === 'unconfirmed'
                            ? ' · thiết bị không gửi kết quả cuối'
                            : ''}
                          {item.acknowledgedBy ? (
                            <>
                              {' '}
                              · {ALERT_STATE_LABELS.acknowledged} bởi{' '}
                              {item.acknowledgedBy.displayName}
                            </>
                          ) : (
                            ' · chưa có người xác nhận'
                          )}
                        </p>
                        {item.resolutionReason ? (
                          <p className="alerts-row__meta">Kết quả: {item.resolutionReason}</p>
                        ) : null}
                        {item.startedBeforeShare ? (
                          <p className="alerts-row__hint">
                            Bắt đầu trước khi bạn được chia sẻ quyền — vẫn đang mở
                          </p>
                        ) : null}
                        {canAct && awaitingSomeone && !canAcknowledge ? (
                          <p className="alerts-row__hint">
                            Bạn không có quyền xác nhận cảnh báo này.
                          </p>
                        ) : null}
                      </div>
                      <div className="alerts-row__side">
                        <StatusPill
                          tone={
                            item.state === 'open'
                              ? 'brick'
                              : item.state === 'acknowledged'
                                ? 'teal'
                                : 'neutral'
                          }
                        >
                          {ALERT_STATE_LABELS[item.state]}
                        </StatusPill>
                        <div className="alerts-row__actions">
                          {canAct && awaitingSomeone && canAcknowledge ? (
                            confirmingAlertId === item.id ? (
                              <div
                                className="alerts-row__confirm"
                                role="group"
                                aria-label="Xác nhận hỗ trợ cảnh báo"
                              >
                                <p className="alerts-row__confirm-question">
                                  Bạn đã liên hệ và đang hỗ trợ?
                                </p>
                                <div className="alerts-row__confirm-actions">
                                  <Button
                                    size="sm"
                                    disabled={acknowledge.isPending}
                                    onClick={() => handleAcknowledge(item)}
                                  >
                                    Có, tôi đang hỗ trợ
                                  </Button>
                                  <Button
                                    variant="subtle"
                                    size="sm"
                                    disabled={acknowledge.isPending}
                                    onClick={() => setConfirmingAlertId(null)}
                                  >
                                    Hủy
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                variant="primary"
                                size="sm"
                                disabled={acknowledge.isPending}
                                onClick={() => setConfirmingAlertId(item.id)}
                              >
                                Tôi đang hỗ trợ
                              </Button>
                            )
                          ) : null}
                          <ButtonLink
                            to={`/app/alerts/${item.id}`}
                            state={detailLinkState}
                            variant="subtle"
                            size="sm"
                          >
                            Xem chi tiết
                          </ButtonLink>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {alerts.hasNextPage ? (
                <div className="alerts-page__more">
                  <Button
                    variant="secondary"
                    onClick={() => void alerts.fetchNextPage()}
                    disabled={alerts.isFetchingNextPage}
                  >
                    {alerts.isFetchingNextPage ? 'Đang tải…' : 'Tải thêm cảnh báo'}
                  </Button>
                </div>
              ) : null}
            </>
          )}

          <p className="alerts-page__lead">
            Thông báo chỉ trong ứng dụng: không gửi SMS và không tự gọi cấp cứu.
          </p>
        </>
      )}
    </div>
  );
}
