import { memo, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { HeartRateQuality } from '@annhien/contracts';
import type { MeasurementGap, MeasurementsResponse } from '@annhien/contracts/measurements';
import { ButtonLink } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { MeasurementChart, type ChartPoint } from '../../components/MeasurementChart';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { Button } from '../../components/Button';
import { clampRangeToHistoryDays, formatCompactDateTime, formatDateTime } from '../../lib/format';
import { getApiErrorMessage, isApiError } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { useActiveSubject } from '../subjects/selection';
import { useSubjects } from '../subjects/useSubjects';
import { exportCsvUrl, fetchMeasurements } from './api';

type RangeKey = '24h' | '7d' | '30d';
type Measurement = MeasurementsResponse['items'][number];

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

/** Số dòng hiện thêm mỗi lần bấm — đủ nhỏ để phản hồi dưới ngưỡng INP ở máy yếu. */
const VISIBLE_STEP = 50;

/**
 * Trần số dòng render mỗi lần. "Hiện tất cả" 1.681 dòng từng khoá main thread ~11,6 s
 * trên mobile (QA v2, P1-2). Toàn bộ dữ liệu vẫn xem được bằng CSV.
 */
const MAX_VISIBLE_ROWS = 400;

const INITIAL_VISIBLE_ROWS = 20;

const MINUTE_MS = 60_000;

/** Cùng breakpoint với `table-wrap--history` / `measurement-cards` trong layout.css. */
const COMPACT_VIEWPORT_QUERY = '(max-width: 767px)';

/** Theo dõi breakpoint để chỉ render MỘT biến thể bảng hoặc thẻ. */
function useMediaQuery(query: string): boolean {
  const supportsMediaQuery = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function';

  const [matches, setMatches] = useState(() => (supportsMediaQuery() ? window.matchMedia(query).matches : false));

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
        {item.isLate ? <StatusPill tone="sand">Nhận trễ</StatusPill> : null}{' '}
        {item.measuredAt === null ? (
          <StatusPill tone="neutral">Đồng hồ chưa đồng bộ</StatusPill>
        ) : null}
      </td>
    </tr>
  );
});

const MeasurementCardItem = memo(function MeasurementCardItem({ item }: { item: Measurement }) {
  return (
    <li className="measurement-card">
      <div className="measurement-card__head">
        <p className="measurement-card__time">
          {item.measuredAt ? formatCompactDateTime(item.measuredAt) : 'Không rõ giờ đo'}
        </p>
        {item.isLate ? <StatusPill tone="sand">Nhận trễ</StatusPill> : null}
        {item.measuredAt === null ? <StatusPill tone="neutral">Chưa đồng bộ</StatusPill> : null}
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
 * - Bảng dữ liệu + biểu đồ SVG có nhãn trục; bảng là phương án cho screen reader.
 * - Đánh dấu khoảng thiếu, mẫu nhận trễ, đồng hồ chưa đồng bộ.
 * - Không có dữ liệu → ghi rõ "Chưa có dữ liệu", không hiện số 0 giả.
 * - Cửa sổ thời gian cố định theo lần chọn khoảng: không refetch/reset trang mỗi phút.
 */
export function HistoryPage() {
  const subjects = useSubjects();
  const activeSubject = useActiveSubject(subjects.data);
  const [rangeKey, setRangeKey] = useState<RangeKey>('24h');
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

  const rangeOption =
    RANGE_OPTIONS.find((option) => option.key === rangeKey) ?? RANGE_OPTIONS[0]!;
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

  // Đổi khoảng (đã xử lý ở selectRange) hoặc đổi hồ sơ thì quay về cửa sổ 20 dòng đầu.
  useEffect(() => {
    setVisibleRows(INITIAL_VISIBLE_ROWS);
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
    enabled: Boolean(activeSubject) && canViewMeasurements,
    staleTime: 30_000,
    // Lịch sử là ảnh chụp theo khoảng, không phải bảng realtime: không refetch định kỳ
    // và không tải lại cả 4 trang khi quay lại tab. Người dùng bấm "Cập nhật khoảng".
    refetchOnWindowFocus: false,
  });

  const selectRange = (key: RangeKey) => {
    setRangeKey(key);
    setRangeAnchor(Date.now());
    setVisibleRows(INITIAL_VISIBLE_ROWS);
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
  const measurementsForbidden =
    measurements.isError && isForbiddenError(measurements.error);

  if (!activeSubject && !subjects.isPending && !subjects.isError) {
    return (
      <EmptyState
        title="Chưa có hồ sơ để xem lịch sử"
        description="Tạo hồ sơ cho người cần theo dõi hoặc chọn hồ sơ ở đầu trang."
        action={<ButtonLink to="/app/subjects">Tạo hồ sơ</ButtonLink>}
      />
    );
  }

  if (activeSubject && !canViewMeasurements) {
    return (
      <div className="stack">
        <nav aria-label="Đường dẫn">
          <Link to="/app/overview" className="breadcrumb">
            ← Sức khỏe
          </Link>
        </nav>
        <header>
          <h1 className="page-title">Lịch sử đo</h1>
        </header>
        <MeasurementsNotShared />
      </div>
    );
  }

  return (
    <div className="stack">
      <nav aria-label="Đường dẫn">
        <Link to="/app/overview" className="breadcrumb">
          ← Sức khỏe
        </Link>
      </nav>
      <header>
        <h1 className="page-title">Lịch sử đo</h1>
      </header>

      {measurementsForbidden ? null : (
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
                  onClick={() => selectRange(option.key)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <Button variant="subtle" size="sm" onClick={refreshWindow}>
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
        </div>
      )}

      {activeSubject ? (
        <p className="field__hint">
          Quyền hiện tại cho phép xem tối đa {historyDays} ngày.
        </p>
      ) : null}

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
        measurementsForbidden ? (
          <MeasurementsNotShared />
        ) : (
          <ErrorState
            title="Không tải được dữ liệu đo"
            message={getApiErrorMessage(measurements.error)}
            onRetry={() => void measurements.refetch()}
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
          <p className="chart-hint-mobile">Vuốt ngang biểu đồ để xem đủ khoảng thời gian.</p>
          <MeasurementChart points={chartPoints} gaps={gaps} range={chartRange} />

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

          {/* Chỉ render một biến thể theo breakpoint: trước đây cả bảng và thẻ cùng
              render rồi CSS ẩn một bên, gấp đôi số DOM node và công render. */}
          {isCompactViewport ? (
            <ul className="measurement-cards" aria-label="Dữ liệu đo trong khoảng đã chọn">
              {visibleItems.map((item, index) => (
                <MeasurementCardItem
                  key={`card-${item.measuredAt ?? item.receivedAt}-${item.stepsSinceBoot}-${index}`}
                  item={item}
                />
              ))}
            </ul>
          ) : (
            <div
              className="table-wrap table-wrap--history"
              role="region"
              aria-label="Bảng dữ liệu đo"
              tabIndex={0}
            >
              <table className="data-table">
                <caption>
                  Bảng dữ liệu đo — thay thế cho biểu đồ. Đang hiển thị{' '}
                  {visibleItems.length}/{items.length} dòng.
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

          {hasHiddenRows ? (
            <div className="history-load-more">
              <Button
                variant="secondary"
                onClick={() =>
                  setVisibleRows((count) => Math.min(count + VISIBLE_STEP, MAX_VISIBLE_ROWS))
                }
              >
                Hiện thêm {Math.min(VISIBLE_STEP, items.length - visibleItems.length)} dòng
              </Button>
              {visibleLimit < MAX_VISIBLE_ROWS ? (
                <Button variant="subtle" onClick={() => setVisibleRows(MAX_VISIBLE_ROWS)}>
                  Hiện tới {MAX_VISIBLE_ROWS} dòng
                </Button>
              ) : null}
              <span className="field__hint">
                Đang hiện {visibleItems.length}/{items.length} dòng
              </span>
            </div>
          ) : null}

          {items.length > MAX_VISIBLE_ROWS ? (
            <p className="field__hint">
              {isCappedByWindow
                ? `Đã hiện tối đa ${MAX_VISIBLE_ROWS}/${items.length} dòng để trang phản hồi nhanh. `
                : `Trang chỉ hiện tối đa ${MAX_VISIBLE_ROWS} dòng mỗi lần. `}
              Dùng nút “Tải CSV” ở trên để xem toàn bộ {items.length} dòng đã tải.
            </p>
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

          <p className="field__hint">Dữ liệu hiển thị là dữ liệu mô phỏng.</p>
        </>
      )}
    </div>
  );
}