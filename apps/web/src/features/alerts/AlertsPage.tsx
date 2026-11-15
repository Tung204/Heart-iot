import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { IncidentSummary } from '@annhien/contracts/incidents';
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
import { acknowledgeAlert, fetchAlerts } from './api';
import {
  ALERT_STATE_LABELS,
  ALERT_TYPE_LABELS,
  isActionableState,
  isHighSeverity,
} from './labels';

const PAGE_SIZE = 25;

/**
 * /app/alerts — danh sách cảnh báo của hồ sơ đang xem.
 * - Mặc định lọc "đang mở"; phân trang cursor bằng nút "Tải thêm".
 * - Xác nhận nhanh trên từng dòng (dùng `version` của danh sách làm expectedVersion).
 * - Cạnh tranh (409) → thông báo rõ + nút tải lại, không tự đoán.
 * - Cảnh báo mức cao nổi bật bằng icon + chữ "cần chú ý", không chỉ màu.
 */
export function AlertsPage() {
  const subjects = useSubjects();
  const activeSubject = useActiveSubject(subjects.data);
  const [stateFilter, setStateFilter] = useState<'open' | 'closed'>('open');
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<string | null>(null);

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
    enabled: Boolean(activeSubject),
    staleTime: 15_000,
  });

  const acknowledge = useMutation({
    mutationFn: ({ alertId, version }: { alertId: string; version: number }) =>
      acknowledgeAlert(alertId, { expectedVersion: version }),
    onSuccess: () => {
      setConflict(null);
      if (activeSubject) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.subjectAlerts(activeSubject.id, stateFilter),
        });
      }
    },
    onError: (error) => {
      if (isConflictError(error)) {
        setConflict(
          'Cảnh báo đã thay đổi ở nơi khác. Danh sách dưới đây có thể cũ — hãy tải lại.',
        );
      }
    },
  });

  if (!activeSubject && !subjects.isPending && !subjects.isError) {
    return (
      <EmptyState
        title="Chưa có hồ sơ để xem cảnh báo"
        description="Tạo hồ sơ cho người cần theo dõi hoặc chọn hồ sơ ở đầu trang."
        action={<ButtonLink to="/app/subjects">Tạo hồ sơ</ButtonLink>}
      />
    );
  }

  const items = alerts.data?.pages.flatMap((page) => page?.items ?? []) ?? [];

  const handleAcknowledge = (item: IncidentSummary) => {
    setConflict(null);
    acknowledge.mutate({ alertId: item.id, version: item.version });
  };

  return (
    <div className="stack">
      <header>
        <h1 className="page-title">Cảnh báo</h1>
        <p className="page-lead">
          Cảnh báo của hồ sơ{' '}
          <strong>{activeSubject ? activeSubject.displayName : '—'}</strong>. Người thân có
          quyền sẽ nhận cảnh báo tương ứng theo cài đặt chia sẻ.
        </p>
      </header>

      <div className="segmented" role="group" aria-label="Lọc theo trạng thái">
        <button
          type="button"
          className={`segmented__item${stateFilter === 'open' ? ' is-active' : ''}`}
          aria-pressed={stateFilter === 'open'}
          onClick={() => setStateFilter('open')}
        >
          Đang mở
        </button>
        <button
          type="button"
          className={`segmented__item${stateFilter === 'closed' ? ' is-active' : ''}`}
          aria-pressed={stateFilter === 'closed'}
          onClick={() => setStateFilter('closed')}
        >
          Đã đóng
        </button>
      </div>

      {conflict ? (
        <Alert tone="warning" title="Danh sách có thể chưa cập nhật">
          {conflict}{' '}
          <Button variant="secondary" size="sm" onClick={() => void alerts.refetch()}>
            Tải lại danh sách
          </Button>
        </Alert>
      ) : null}

      {alerts.isPending ? (
        <PageLoader label="Đang tải cảnh báo…" />
      ) : alerts.isError ? (
        <ErrorState
          title="Không tải được cảnh báo"
          message={getApiErrorMessage(alerts.error)}
          onRetry={() => void alerts.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={
            stateFilter === 'open' ? 'Không có cảnh báo đang mở' : 'Không có cảnh báo đã đóng'
          }
          description={
            stateFilter === 'open'
              ? 'Khi thiết bị phát hiện nghi ngã hoặc yêu cầu trợ giúp, cảnh báo sẽ xuất hiện tại đây.'
              : 'Các cảnh báo đã đóng/hủy sẽ được liệt kê tại đây khi có.'
          }
        />
      ) : (
        <>
          <ul
            className="alert-list"
            aria-label={`Danh sách cảnh báo ${stateFilter === 'open' ? 'đang mở' : 'đã đóng'}`}
          >
            {items.map((item) => (
              <li
                key={item.id}
                className={`alert-row${isHighSeverity(item) ? ' alert-row--high' : ''}`}
              >
                <div className="alert-row__main">
                  <p className="alert-row__title">
                    {isHighSeverity(item) && isActionableState(item.state) ? (
                      <span className="alert-row__flag" aria-hidden="true">
                        ⚠
                      </span>
                    ) : null}
                    <Link to={`/app/alerts/${item.id}`}>
                      {ALERT_TYPE_LABELS[item.type]}
                      {isHighSeverity(item) && isActionableState(item.state)
                        ? ' — cần chú ý'
                        : ''}
                    </Link>
                  </p>
                  <p className="alert-row__meta">
                    {activeSubject?.displayName} · phát hiện {formatDateTime(item.detectedAt)}
                    {item.late ? ' · nhận trễ' : ''}
                    {item.acknowledgedBy ? (
                      <>
                        {' '}
                        · {ALERT_STATE_LABELS.acknowledged} bởi {item.acknowledgedBy.displayName}
                      </>
                    ) : (
                      ' · chưa có người xác nhận'
                    )}
                  </p>
                  {item.resolutionReason ? (
                    <p className="alert-row__reason">Kết quả: {item.resolutionReason}</p>
                  ) : null}
                  {item.startedBeforeShare ? (
                    <p className="field__hint">
                      Bắt đầu trước khi bạn được chia sẻ quyền — vẫn đang mở
                    </p>
                  ) : null}
                </div>
                <div className="alert-row__side">
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
                  <div className="alert-row__actions">
                    {isActionableState(item.state) ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={acknowledge.isPending}
                        onClick={() => handleAcknowledge(item)}
                      >
                        Xác nhận
                      </Button>
                    ) : null}
                    <ButtonLink to={`/app/alerts/${item.id}`} variant="subtle" size="sm">
                      Chi tiết
                    </ButtonLink>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {alerts.hasNextPage ? (
            <div className="alert-list__more">
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
    </div>
  );
}
