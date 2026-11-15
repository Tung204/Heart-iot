import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { HeartRateQuality } from '@annhien/contracts';
import type { MeasurementGap } from '@annhien/contracts/measurements';
import { ButtonLink } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { MeasurementChart, type ChartPoint } from '../../components/MeasurementChart';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { Button } from '../../components/Button';
import { clampRangeToHistoryDays, formatCompactDateTime, formatDateTime } from '../../lib/format';
import { getApiErrorMessage } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { useActiveSubject } from '../subjects/selection';
import { useSubjects } from '../subjects/useSubjects';
import { exportCsvUrl, fetchMeasurements } from './api';

type RangeKey = '24h' | '7d' | '30d';

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string; hours: number }> = [
  { key: '24h', label: '24 giờ', hours: 24 },
  { key: '7d', label: '7 ngày', hours: 7 * 24 },
  { key: '30d', label: '30 ngày', hours: 30 * 24 },
];

const GAP_REASON_LABELS: Record<MeasurementGap['reason'], string> = {
  no_data: 'không có dữ liệu',
  clock_unsynced: 'đồng hồ thiết bị chưa đồng bộ',
  quarantined: 'dữ liệu bị cách ly chờ kiểm tra',
};

const HR_QUALITY_LABELS: Record<HeartRateQuality, string> = {
  valid: 'hợp lệ',
  poor_signal: 'tín hiệu kém',
  not_worn: 'không đeo',
  sensor_error: 'lỗi cảm biến',
};

const PAGE_SIZE = 500;

/**
 * /app/history — lịch sử đo trong khoảng 24h/7 ngày/30 ngày (giới hạn theo quyền).
 * - Bảng dữ liệu + biểu đồ SVG có nhãn trục; bảng là phương án cho screen reader.
 * - Đánh dấu khoảng thiếu, mẫu nhận trễ, đồng hồ chưa đồng bộ.
 * - Không có dữ liệu → ghi rõ "Chưa có dữ liệu", không hiện số 0 giả.
 */
export function HistoryPage() {
  const subjects = useSubjects();
  const activeSubject = useActiveSubject(subjects.data);
  const [rangeKey, setRangeKey] = useState<RangeKey>('24h');
  const [visibleRows, setVisibleRows] = useState(20);

  // Mốc hiện tại được làm mới mỗi phút để cửa sổ 24h không bị "đóng băng".
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => setNow(Date.now()), [rangeKey]);
  const rangeOption =
    RANGE_OPTIONS.find((option) => option.key === rangeKey) ?? RANGE_OPTIONS[0]!;
  const historyDays = activeSubject?.permissions.historyDays ?? 1;
  const maxHours = historyDays * 24;
  // Người thân mới accept: dữ liệu chỉ được xem từ `sharedFrom`, không phải toàn bộ 24 giờ.
  const sharedFromMs =
    activeSubject?.role === 'caregiver' && activeSubject.sharedFrom
      ? new Date(activeSubject.sharedFrom).getTime()
      : null;
  const clampedHours = Math.min(rangeOption.hours, Math.max(24, maxHours));
  const { from, to } = useMemo(
    () =>
      clampRangeToHistoryDays(
        now - clampedHours * 3600 * 1000,
        now,
        historyDays,
        sharedFromMs,
      ),
    [now, clampedHours, historyDays, sharedFromMs],
  );

  useEffect(() => {
    setVisibleRows(20);
  }, [rangeKey, activeSubject?.id]);

  const measurements = useInfiniteQuery({
    queryKey: activeSubject
      ? queryKeys.measurements(activeSubject.id, { from, to })
      : ['subjects', 'none', 'measurements', from, to],
    queryFn: ({ signal, pageParam }) =>
      activeSubject
        ? fetchMeasurements(
            activeSubject.id,
            { from, to, cursor: pageParam, limit: PAGE_SIZE },
            signal,
          )
        : null,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: Boolean(activeSubject),
    staleTime: 30_000,
  });

  if (!activeSubject && !subjects.isPending && !subjects.isError) {
    return (
      <EmptyState
        title="Chưa có hồ sơ để xem lịch sử"
        description="Tạo hồ sơ cho người cần theo dõi hoặc chọn hồ sơ ở đầu trang."
        action={<ButtonLink to="/app/subjects">Tạo hồ sơ</ButtonLink>}
      />
    );
  }

  const pages = measurements.data?.pages ?? [];
  const items = pages.flatMap((page) => page?.items ?? []);
  const coverage = pages[0]?.coverage;
  const gaps = pages[0]?.gaps ?? [];
  const unsynced = pages[0]?.excludedUnsyncedCount ?? 0;

  const chartPoints: ChartPoint[] = items
    .filter(
      (item): item is typeof item & { measuredAt: string; heartRateBpm: number } =>
        item.measuredAt !== null &&
        item.heartRateBpm !== null &&
        item.heartRateQuality === 'valid',
    )
    .map((item) => ({ measuredAt: item.measuredAt, heartRateBpm: item.heartRateBpm }));

  const isClamped = clampedHours < rangeOption.hours;
  const isShareClamped =
    sharedFromMs !== null && now - clampedHours * 3600 * 1000 < sharedFromMs;
  const visibleItems = items.slice(0, visibleRows);
  const hasHiddenRows = items.length > visibleItems.length;

  return (
    <div className="stack">
      <header>
        <h1 className="page-title">Lịch sử đo lường</h1>
        <p className="page-lead">
          Dữ liệu của hồ sơ{' '}
          <strong>{activeSubject ? activeSubject.displayName : '—'}</strong> trong khoảng bạn
          chọn. Quyền hiện tại cho phép xem tối đa {historyDays} ngày.
        </p>
      </header>

      <div className="history-toolbar">
        <div className="segmented" role="group" aria-label="Chọn khoảng thời gian">
          {RANGE_OPTIONS.map((option) => {
            const allowedByHistory = option.hours <= maxHours;
            // Khoảng đầy đủ bắt đầu trước mốc chia sẻ thì không xem được trọn vẹn:
            // disable kèm giải thích thay vì để người dùng gặp lỗi 403.
            const allowedByShare =
              sharedFromMs === null || now - option.hours * 3600 * 1000 >= sharedFromMs;
            const allowed = allowedByHistory && allowedByShare;
            const disabledReason = !allowedByHistory
              ? `Quyền chỉ cho xem ${historyDays} ngày`
              : `Chỉ xem được dữ liệu từ ${activeSubject?.sharedFrom ? formatDateTime(activeSubject.sharedFrom) : 'mốc chia sẻ quyền'} — khoảng ${option.label} bắt đầu trước mốc này`;
            return (
              <button
                key={option.key}
                type="button"
                className={`segmented__item${rangeKey === option.key ? ' is-active' : ''}`}
                aria-pressed={rangeKey === option.key}
                disabled={!allowed}
                title={allowed ? undefined : disabledReason}
                onClick={() => setRangeKey(option.key)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {activeSubject ? (
          <a
            className="button button--secondary button--sm"
            href={exportCsvUrl(activeSubject.id, from, to)}
            download
          >
            Tải CSV
          </a>
        ) : null}
      </div>

      {isClamped ? (
        <p className="field__hint">
          Khoảng hiển thị được rút ngắn còn {clampedHours / 24} ngày theo quyền chia sẻ của
          bạn.
        </p>
      ) : null}

      {isShareClamped && activeSubject?.sharedFrom ? (
        <p className="field__hint">
          Dữ liệu chỉ bắt đầu từ {formatDateTime(activeSubject.sharedFrom)} — thời điểm bạn
          được chia sẻ quyền, nên khoảng đang xem ngắn hơn lựa chọn.
        </p>
      ) : null}

      {measurements.isPending ? (
        <PageLoader label="Đang tải dữ liệu đo…" />
      ) : measurements.isError ? (
        <ErrorState
          title="Không tải được dữ liệu đo"
          message={getApiErrorMessage(measurements.error)}
          onRetry={() => void measurements.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có dữ liệu"
          description={
            unsynced > 0
              ? `Trong khoảng này có ${unsynced} mẫu đồng hồ chưa đồng bộ (không đặt được lên trục thời gian) nhưng chưa có mẫu đo hợp lệ nào.`
              : 'Chưa nhận dữ liệu từ thiết bị trong khoảng thời gian này. Kiểm tra kết nối của thiết bị và thử lại sau.'
          }
          action={<ButtonLink to="/app/devices">Xem trạng thái thiết bị</ButtonLink>}
        />
      ) : (
        <>
          <p className="chart-hint-mobile">Vuốt ngang biểu đồ để xem đủ khoảng thời gian.</p>
          <MeasurementChart
            points={chartPoints}
            gaps={gaps}
            range={{ from: new Date(from).toISOString(), to: new Date(to).toISOString() }}
          />

          {coverage ? (
            <p className="metric-line">
              Độ phủ: {coverage.percent}% · {coverage.observedCount} mẫu đã nhận (mỗi{' '}
              {coverage.expectedIntervalSeconds}s) · {gaps.length} khoảng thiếu ·
              {unsynced > 0 ? ` ${unsynced} mẫu đồng hồ chưa đồng bộ bị loại khỏi trục thời gian` : ' không có mẫu lệch đồng hồ'}
            </p>
          ) : null}

          {gaps.length > 0 ? (
            <div className="gap-list" role="list" aria-label="Các khoảng thiếu dữ liệu">
              <p className="gap-list__title">Khoảng thiếu dữ liệu:</p>
              {gaps.map((gap) => (
                <p key={`${gap.from}-${gap.to}`} role="listitem">
                  {formatDateTime(gap.from)} → {formatDateTime(gap.to)} ·{' '}
                  {GAP_REASON_LABELS[gap.reason]}
                </p>
              ))}
            </div>
          ) : null}

          <div className="table-wrap table-wrap--history" role="region" aria-label="Bảng dữ liệu đo" tabIndex={0}>
            <table className="data-table">
              <caption>
                Bảng dữ liệu đo — thay thế cho biểu đồ. Đang hiển thị {visibleItems.length}/
                {items.length} dòng.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Thời điểm đo</th>
                  <th scope="col">Nhịp tim</th>
                  <th scope="col">Chất lượng</th>
                  <th scope="col">Bước (từ khởi động)</th>
                  <th scope="col">Pin</th>
                  <th scope="col">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => (
                  <tr key={`${item.measuredAt ?? item.receivedAt}-${item.stepsSinceBoot}`}>
                    <td>{item.measuredAt ? formatCompactDateTime(item.measuredAt) : 'Không rõ giờ đo'}</td>
                    <td>
                      {item.heartRateBpm !== null && item.heartRateQuality === 'valid' ? (
                        <strong>{item.heartRateBpm} bpm</strong>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {HR_QUALITY_LABELS[item.heartRateQuality]}
                      {item.isQuarantined ? ' · bị cách ly' : ''}
                    </td>
                    <td>{item.stepsSinceBoot}</td>
                    <td>
                      {item.batteryPercent !== null ? `${item.batteryPercent}%` : 'chưa rõ'}
                    </td>
                    <td>
                      {item.isLate ? <StatusPill tone="sand">Nhận trễ</StatusPill> : null}{' '}
                      {item.measuredAt === null ? (
                        <StatusPill tone="neutral">Đồng hồ chưa đồng bộ</StatusPill>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="measurement-cards" aria-label="Dữ liệu đo gần nhất">
            {visibleItems.map((item) => (
              <li
                key={`card-${item.measuredAt ?? item.receivedAt}-${item.stepsSinceBoot}`}
                className="measurement-card"
              >
                <div className="measurement-card__head">
                  <p className="measurement-card__time">
                    {item.measuredAt ? formatCompactDateTime(item.measuredAt) : 'Không rõ giờ đo'}
                  </p>
                  {item.isLate ? <StatusPill tone="sand">Nhận trễ</StatusPill> : null}
                  {item.measuredAt === null ? (
                    <StatusPill tone="neutral">Chưa đồng bộ</StatusPill>
                  ) : null}
                </div>
                <dl className="measurement-card__facts">
                  <div>
                    <dt>Nhịp tim</dt>
                    <dd>
                      {item.heartRateBpm !== null && item.heartRateQuality === 'valid' ? (
                        <strong>{item.heartRateBpm} bpm</strong>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Chất lượng</dt>
                    <dd>
                      {HR_QUALITY_LABELS[item.heartRateQuality]}
                      {item.isQuarantined ? ' · bị cách ly' : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Bước</dt>
                    <dd>{item.stepsSinceBoot}</dd>
                  </div>
                  <div>
                    <dt>Pin</dt>
                    <dd>
                      {item.batteryPercent !== null ? `${item.batteryPercent}%` : 'chưa rõ'}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          {hasHiddenRows ? (
            <div className="history-load-more">
              <Button variant="secondary" onClick={() => setVisibleRows((count) => count + 20)}>
                Hiện thêm 20 dòng
              </Button>
              <Button variant="subtle" onClick={() => setVisibleRows(items.length)}>
                Hiện tất cả {items.length} dòng
              </Button>
              <span className="field__hint">
                Đang hiện {visibleItems.length}/{items.length} dòng
              </span>
            </div>
          ) : null}

          {measurements.hasNextPage ? (
            <div>
              <Button
                variant="secondary"
                onClick={() => void measurements.fetchNextPage()}
                disabled={measurements.isFetchingNextPage}
              >
                {measurements.isFetchingNextPage ? 'Đang tải…' : 'Tải thêm từ máy chủ'}
              </Button>
            </div>
          ) : null}

          <p className="field__hint">
            Bản demo dùng dữ liệu mô phỏng. Số liệu trên trang không dùng để chẩn đoán hay thay
            lời khuyên y tế.{' '}
            <Link to="/app">Về tổng quan</Link>
          </p>
        </>
      )}
    </div>
  );
}
