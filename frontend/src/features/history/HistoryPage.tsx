import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import type { HeartRateQuality } from '@heart-iot/contracts';
import type { MeasurementGap, MeasurementsResponse } from '@heart-iot/contracts/measurements';
import { Button, ButtonLink } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { MeasurementChart, type ChartPoint } from '../../components/MeasurementChart';
import { PageHeader } from '../../components/PageHeader';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { clampRangeToHistoryDays, formatCompactDateTime, formatDateTime, todayInTimeZone } from '../../lib/format';
import { getApiErrorMessage, isApiError } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { useActiveSubject } from '../subjects/selection';
import { useSubjects } from '../subjects/useSubjects';
import { exportCsvUrl, fetchMeasurements } from './api';
import '../../styles/health.css';

type RangeKey = '24h' | '7d' | '30d';
type Measurement = MeasurementsResponse['items'][number];

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string; hours: number; days: number }> = [
  { key: '24h', label: '24 giờ', hours: 24, days: 1 },
  { key: '7d', label: '7 ngày', hours: 7 * 24, days: 7 },
  { key: '30d', label: '30 ngày', hours: 30 * 24, days: 30 },
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

/** Số dòng hiện thêm mỗi lần bấm — đủ nhỏ để phản hồi dưới ngưỡng INP ở máy yếu. */
const VISIBLE_STEP = 50;

/**
 * Trần số dòng render mỗi lần. "Hiện tất cả" 1.681 dòng từng khoá main thread ~11,6 s
 * trên mobile (QA v2, P1-2). Toàn bộ dữ liệu vẫn xem được bằng CSV.
 */
const MAX_VISIBLE_ROWS = 400;

const INITIAL_VISIBLE_ROWS = 10;

const MINUTE_MS = 60_000;

/** Cùng breakpoint với CSS `.history-cards` trong styles/health.css. */
const COMPACT_VIEWPORT_QUERY = '(max-width: 767px)';

/** Theo dõi breakpoint để chỉ render MỘT biến thể bảng hoặc danh sách. */
function useMediaQuery(query: string): boolean {
  const supportsMediaQuery = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function';

  const [matches, setMatches] = useState(() =>
    supportsMediaQuery() ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    if (!supportsMediaQuery()) return;
    const list = window.matchMedia(query);
    const update = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);

  return matches;
}

/** Lựa chọn khoảng nằm trong URL (`?days=1|7|30`) để back/forward không mất lựa chọn. */
function rangeKeyFromParam(value: string | null): RangeKey {
  if (value === '7') return '7d';
  if (value === '30') return '30d';
  return '24h';
}

const MeasurementTableRow = memo(function MeasurementTableRow({ item }: { item: Measurement }) {
  return (
    <tr>
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
      <td>{item.batteryPercent !== null ? `${item.batteryPercent}%` : 'chưa rõ'}</td>
      <td>
        <span className="history-flags">
          {item.isLate ? <StatusPill tone="warning">Nhận trễ</StatusPill> : null}
          {item.measuredAt === null ? (
            <StatusPill tone="neutral">Đồng hồ chưa đồng bộ</StatusPill>
          ) : null}
        </span>
      </td>
    </tr>
  );
});

const MeasurementCardItem = memo(function MeasurementCardItem({ item }: { item: Measurement }) {
  return (
    <li className="history-card">
      <div className="history-card__head">
        <p className="history-card__time">
          {item.measuredAt ? formatCompactDateTime(item.measuredAt) : 'Không rõ giờ đo'}
        </p>
        <span className="history-flags">
          {item.isLate ? <StatusPill tone="warning">Nhận trễ</StatusPill> : null}
          {item.measuredAt === null ? <StatusPill tone="neutral">Chưa đồng bộ</StatusPill> : null}
        </span>
      </div>
      <dl className="history-card__facts">
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
          <dd>{item.batteryPercent !== null ? `${item.batteryPercent}%` : 'chưa rõ'}</dd>
        </div>
      </dl>
    </li>
  );
});

/** 403 ở lịch sử đo là trạng thái quyền, không phải lỗi kỹ thuật. */
function isForbiddenError(error: unknown): boolean {
  return isApiError(error) && (error.status === 403 || error.code === 'FORBIDDEN');
}

/** Trạng thái quyền dùng chung cho trường hợp biết trước và trường hợp API trả 403. */
function MeasurementsNotShared() {
  return (
    <EmptyState
      title="Chủ hồ sơ không chia sẻ số đo"
      description="Chủ hồ sơ không chia sẻ số đo và lịch sử với bạn. Bạn vẫn nhận được cảnh báo nếu được cấp quyền; liên hệ chủ hồ sơ nếu cần xem lịch sử đo."
      action={<ButtonLink to="/app/overview">← Sức khỏe</ButtonLink>}
    />
  );
}

/**
 * /app/history — lịch sử đo trong khoảng 24h/7 ngày/30 ngày (giới hạn theo quyền).
 * - Bộ lọc khoảng nằm trong URL; quay lại trang vẫn giữ lựa chọn.
 * - from/to (và CSV) clamp theo historyDays + sharedFrom; server vẫn là chốt quyền.
 * - Biểu đồ SVG có nhãn trục; bảng/danh sách là phương án thay thế, một biến thể
 *   theo breakpoint. Đánh dấu khoảng thiếu, mẫu nhận trễ, đồng hồ chưa đồng bộ.
 * - Không có dữ liệu → ghi rõ "Chưa có dữ liệu", không hiện số 0 giả.
 * - Cửa sổ thời gian cố định theo lần chọn khoảng: không refetch/reset mỗi phút.
 */
export function HistoryPage() {
  const subjects = useSubjects();
  const activeSubject = useActiveSubject(subjects.data);
  const [searchParams, setSearchParams] = useSearchParams();
  const rangeKey = rangeKeyFromParam(searchParams.get('days'));
  const [visibleRows, setVisibleRows] = useState(INITIAL_VISIBLE_ROWS);
  const isCompactViewport = useMediaQuery(COMPACT_VIEWPORT_QUERY);

  // "Bây giờ" chỉ dùng cho nhãn/gợi ý và trạng thái nút theo thời gian — KHÔNG đưa
  // vào queryKey. Trước đây mỗi phút `now` đổi làm from/to đổi, useInfiniteQuery bỏ
  // toàn bộ pages đã tải và refetch ~112 kB/phút cho mỗi tab đang mở (QA v2, P1-1).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => window.clearInterval(timer);
  }, []);

  // Mốc cửa sổ dữ liệu: chỉ đổi khi người dùng chọn khoảng khác hoặc bấm
  // "Cập nhật khoảng". Nhờ vậy `from`/`to` (và queryKey) ổn định, trang đã tải
  // không bị mất khi đồng hồ chạy tiếp.
  const [rangeAnchor, setRangeAnchor] = useState(() => Date.now());

  const rangeOption = RANGE_OPTIONS.find((option) => option.key === rangeKey) ?? RANGE_OPTIONS[0]!;
  const historyDays = activeSubject?.permissions.historyDays ?? 1;
  // Link cũ thiếu `canViewMeasurements` được hiểu là `true` (server đã chuẩn hóa).
  const canViewMeasurements = activeSubject
    ? activeSubject.permissions.canViewMeasurements !== false
    : true;
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
        rangeAnchor - clampedHours * 3600 * 1000,
        rangeAnchor,
        historyDays,
        sharedFromMs,
      ),
    [rangeAnchor, clampedHours, historyDays, sharedFromMs],
  );

  // Đổi khoảng bằng back/forward (URL) hoặc đổi hồ sơ thì quay về 10 dòng đầu và
  // lấy mốc "bây giờ" mới. Bỏ qua lần chạy đầu để không đổi from/to ngay sau mount.
  const skipFirstRangeEffect = useRef(true);
  useEffect(() => {
    if (skipFirstRangeEffect.current) {
      skipFirstRangeEffect.current = false;
      return;
    }
    setRangeAnchor(Date.now());
    setVisibleRows(INITIAL_VISIBLE_ROWS);
  }, [rangeKey]);

  useEffect(() => {
    setVisibleRows(INITIAL_VISIBLE_ROWS);
  }, [activeSubject?.id]);

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
    enabled: Boolean(activeSubject) && canViewMeasurements,
    staleTime: 30_000,
    // Lịch sử là ảnh chụp theo khoảng, không phải bảng realtime: không refetch định kỳ
    // và không tải lại cả 4 trang khi quay lại tab. Người dùng bấm "Cập nhật khoảng".
    refetchOnWindowFocus: false,
  });

  const selectRange = (key: RangeKey) => {
    const option = RANGE_OPTIONS.find((item) => item.key === key) ?? RANGE_OPTIONS[0]!;
    setRangeAnchor(Date.now());
    setVisibleRows(INITIAL_VISIBLE_ROWS);
    // push (không replace) để nút Back của trình duyệt trả lại khoảng đã xem trước đó.
    const next = new URLSearchParams(searchParams);
    next.set('days', String(option.days));
    setSearchParams(next);
  };

  const refreshWindow = () => {
    setRangeAnchor(Date.now());
    setVisibleRows(INITIAL_VISIBLE_ROWS);
  };

  const pages = measurements.data?.pages;
  const items = useMemo(() => (pages ?? []).flatMap((page) => page?.items ?? []), [pages]);
  const chartPoints = useMemo(() => {
    const points: ChartPoint[] = [];
    for (const item of items) {
      if (
        item.measuredAt !== null &&
        item.heartRateBpm !== null &&
        item.heartRateQuality === 'valid'
      ) {
        points.push({ measuredAt: item.measuredAt, heartRateBpm: item.heartRateBpm });
      }
    }
    return points;
  }, [items]);
  // Object mới mỗi render sẽ vô hiệu hoá memo của MeasurementChart.
  const chartRange = useMemo(
    () => ({ from: new Date(from).toISOString(), to: new Date(to).toISOString() }),
    [from, to],
  );

  const coverage = pages?.[0]?.coverage;
  const gaps = pages?.[0]?.gaps ?? [];
  const unsynced = pages?.[0]?.excludedUnsyncedCount ?? 0;

  const isClamped = clampedHours < rangeOption.hours;
  const isShareClamped =
    sharedFromMs !== null && rangeAnchor - clampedHours * 3600 * 1000 < sharedFromMs;
  const visibleLimit = Math.min(visibleRows, MAX_VISIBLE_ROWS);
  const visibleItems = useMemo(() => items.slice(0, visibleLimit), [items, visibleLimit]);
  const hasHiddenRows = items.length > visibleItems.length;
  const isCappedByWindow = hasHiddenRows && visibleLimit >= MAX_VISIBLE_ROWS;
  // Một nút duy nhất: trước hết mở thêm dòng đã tải, khi đã hết dòng cục bộ mới
  // tải trang tiếp theo từ máy chủ. Tránh hai nút “Hiện thêm”/“Tải thêm” cạnh nhau.
  const canRevealMore = hasHiddenRows && visibleLimit < MAX_VISIBLE_ROWS;
  const canFetchMore =
    !canRevealMore && visibleLimit >= items.length && measurements.hasNextPage;
  const loadMore = () => {
    if (canRevealMore) {
      setVisibleRows((count) => Math.min(count + VISIBLE_STEP, MAX_VISIBLE_ROWS));
      return;
    }
    if (!canFetchMore) return;
    void measurements.fetchNextPage().then(() => {
      setVisibleRows((count) => Math.min(count + VISIBLE_STEP, MAX_VISIBLE_ROWS));
    });
  };
  const loadMoreLabel = canRevealMore
    ? `Hiện thêm ${Math.min(VISIBLE_STEP, items.length - visibleItems.length)} dòng`
    : measurements.isFetchingNextPage
      ? 'Đang tải…'
      : 'Tải thêm từ máy chủ';
  const measurementsForbidden = measurements.isError && isForbiddenError(measurements.error);
  const historyDisabled = RANGE_OPTIONS.filter((option) => option.hours > maxHours);

  const breadcrumb = (
    <Link to="/app/overview" className="button button--subtle button--sm health-back">
      ← Sức khỏe
    </Link>
  );

  if (subjects.isPending) {
    return (
      <div className="stack health-page">
        <PageHeader title="Lịch sử đo" breadcrumb={breadcrumb} />
        <PageLoader label="Đang tải hồ sơ…" />
      </div>
    );
  }

  if (subjects.isError) {
    return (
      <div className="stack health-page">
        <PageHeader title="Lịch sử đo" breadcrumb={breadcrumb} />
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
      <div className="stack health-page">
        <PageHeader title="Lịch sử đo" breadcrumb={breadcrumb} />
        <EmptyState
          title="Chưa có hồ sơ để xem lịch sử"
          description="Tạo hồ sơ cho người cần theo dõi hoặc chọn hồ sơ ở đầu trang."
          action={<ButtonLink to="/app/subjects">Tạo hồ sơ</ButtonLink>}
        />
      </div>
    );
  }

  if (activeSubject && !canViewMeasurements) {
    return (
      <div className="stack health-page">
        <PageHeader title="Lịch sử đo" breadcrumb={breadcrumb} />
        <MeasurementsNotShared />
      </div>
    );
  }

  return (
    <div className="stack health-page">
      <PageHeader title="Lịch sử đo" breadcrumb={breadcrumb} />

      {measurementsForbidden ? null : (
        <>
          <div className="history-toolbar">
            <div className="history-range" role="group" aria-label="Chọn khoảng thời gian">
              {RANGE_OPTIONS.map((option) => {
                const allowedByHistory = option.hours <= maxHours;
                // Khoảng đầy đủ bắt đầu trước mốc chia sẻ thì không xem được trọn vẹn:
                // disable kèm giải thích thay vì để người dùng gặp lỗi 403.
                const allowedByShare =
                  sharedFromMs === null || now - option.hours * 3600 * 1000 >= sharedFromMs;
                const allowed = allowedByHistory && allowedByShare;
                const isSelected = rangeKey === option.key;
                const disabledReason = !allowedByHistory
                  ? `Quyền chỉ cho xem ${historyDays} ngày`
                  : `Chỉ xem được dữ liệu từ ${activeSubject?.sharedFrom ? formatDateTime(activeSubject.sharedFrom) : 'mốc chia sẻ quyền'} — khoảng ${option.label} bắt đầu trước mốc này`;
                return (
                  <button
                    key={option.key}
                    type="button"
                    className={`history-range__item${isSelected ? ' is-active' : ''}`}
                    aria-pressed={isSelected}
                    disabled={!allowed && !isSelected}
                    title={allowed ? undefined : disabledReason}
                    onClick={() => selectRange(option.key)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="history-actions">
              <Button variant="secondary" size="sm" onClick={refreshWindow}>
                Cập nhật khoảng
              </Button>
              {activeSubject ? (
                <a
                  className="button button--secondary button--sm"
                  href={exportCsvUrl(activeSubject.id, from, to)}
                  download
                >
                  Tải CSV
                </a>
              ) : null}
              {activeSubject ? (
                <Link
                  className="button button--secondary button--sm"
                  to={`/app/history/report?${new URLSearchParams({
                    from: todayInTimeZone(activeSubject.timezone, new Date(from)),
                    to: todayInTimeZone(activeSubject.timezone, new Date(to)),
                  }).toString()}`}
                >
                  Phiếu đi khám
                </Link>
              ) : null}
            </div>
          </div>

          <p className="history-sim">Dữ liệu hiển thị là dữ liệu mô phỏng.</p>
        </>
      )}

      {isClamped && !measurementsForbidden ? (
        <p className="history-limit">
          Khoảng hiển thị được rút ngắn còn {clampedHours / 24} ngày theo quyền chia sẻ của bạn.
        </p>
      ) : null}

      {isShareClamped && activeSubject?.sharedFrom && !measurementsForbidden ? (
        <p className="history-limit">
          Dữ liệu chỉ bắt đầu từ {formatDateTime(activeSubject.sharedFrom)} — thời điểm bạn được
          chia sẻ quyền, nên khoảng đang xem ngắn hơn lựa chọn.
        </p>
      ) : null}

      {historyDisabled.length > 0 && !measurementsForbidden ? (
        <p className="history-limit">
          Quyền chia sẻ chỉ cho xem {historyDays} ngày gần nhất nên{' '}
          {historyDisabled.map((option) => option.label).join(', ')} không chọn được.
        </p>
      ) : null}

      {measurements.isPending ? (
        <PageLoader label="Đang tải dữ liệu đo…" />
      ) : measurements.isError ? (
        measurementsForbidden ? (
          <MeasurementsNotShared />
        ) : (
          <ErrorState
            title="Không tải được dữ liệu đo"
            message={getApiErrorMessage(measurements.error)}
            onRetry={() => void measurements.refetch()}
            headingLevel={2}
          />
        )
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
          <MeasurementChart points={chartPoints} gaps={gaps} range={chartRange} />

          <section className="history-coverage" aria-labelledby="history-coverage-heading">
            <h2 id="history-coverage-heading" className="history-h2">
              Độ phủ và khoảng thiếu
            </h2>
            <dl className="history-kv">
              <div>
                <dt>Độ phủ</dt>
                <dd>{coverage ? `${coverage.percent}%` : 'chưa rõ'}</dd>
              </div>
              <div>
                <dt>Mẫu đã nhận</dt>
                <dd>{coverage ? `${coverage.observedCount} mẫu` : 'chưa rõ'}</dd>
              </div>
              <div>
                <dt>Khoảng thiếu</dt>
                <dd>{gaps.length} khoảng</dd>
              </div>
              <div>
                <dt>Đồng hồ chưa đồng bộ</dt>
                <dd>
                  {unsynced > 0 ? `${unsynced} mẫu bị loại khỏi trục thời gian` : 'không có mẫu lệch'}
                </dd>
              </div>
            </dl>
            {gaps.length > 0 ? (
              <ul className="history-gaps">
                {gaps.map((gap) => (
                  <li key={`${gap.from}-${gap.to}`}>
                    {formatDateTime(gap.from)} → {formatDateTime(gap.to)} ·{' '}
                    {GAP_REASON_LABELS[gap.reason]}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {/* Chỉ render một biến thể theo breakpoint: không giữ hai cây DOM cùng chạy. */}
          {isCompactViewport ? (
            <ul className="history-cards" aria-label="Dữ liệu đo trong khoảng đã chọn">
              {visibleItems.map((item, index) => (
                <MeasurementCardItem
                  key={`card-${item.measuredAt ?? item.receivedAt}-${item.stepsSinceBoot}-${index}`}
                  item={item}
                />
              ))}
            </ul>
          ) : (
            <div
              className="history-table-wrap"
              role="region"
              aria-label="Bảng dữ liệu đo"
              tabIndex={0}
            >
              <table className="history-table">
                <caption>
                  Bảng dữ liệu đo. Đang hiển thị {visibleItems.length}/{items.length} dòng.
                  {items.length > MAX_VISIBLE_ROWS
                    ? ` Tối đa ${MAX_VISIBLE_ROWS} dòng mỗi lần; tải CSV để xem toàn bộ ${items.length} dòng.`
                    : ''}
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
                  {visibleItems.map((item, index) => (
                    <MeasurementTableRow
                      key={`${item.measuredAt ?? item.receivedAt}-${item.stepsSinceBoot}-${index}`}
                      item={item}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canRevealMore || canFetchMore ? (
            <div className="history-load-more">
              <Button
                variant="secondary"
                onClick={loadMore}
                disabled={measurements.isFetchingNextPage}
              >
                {loadMoreLabel}
              </Button>
            </div>
          ) : null}

          {items.length > MAX_VISIBLE_ROWS ? (
            <p className="history-limit">
              {isCappedByWindow
                ? `Đã hiện tối đa ${MAX_VISIBLE_ROWS}/${items.length} dòng để trang phản hồi nhanh. `
                : `Trang chỉ hiện tối đa ${MAX_VISIBLE_ROWS} dòng mỗi lần. `}
              Dùng nút “Tải CSV” ở trên để xem toàn bộ {items.length} dòng đã tải.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
