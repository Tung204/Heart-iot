import { memo, useMemo } from 'react';
import type { MeasurementGap } from '@annhien/contracts/measurements';
import { formatCompactDateTime, formatDate, formatTime } from '../lib/format';
import './MeasurementChart.css';

export interface ChartPoint {
  measuredAt: string;
  heartRateBpm: number;
}

interface MeasurementChartProps {
  points: ChartPoint[];
  gaps: MeasurementGap[];
  range: { from: string; to: string };
}

const WIDTH = 720;
const HEIGHT = 260;
const MARGIN = { top: 16, right: 16, bottom: 36, left: 52 };

/**
 * Trần số điểm vẽ. Khoảng 30 ngày có thể có ~8.640 điểm; giữ nguyên tất cả sẽ tạo
 * chuỗi polyline hàng trăm kB mỗi lần render mà mắt không phân biệt được trên
 * khung 720 px. Bảng dữ liệu bên dưới vẫn liệt kê đủ từng mẫu.
 */
const MAX_RENDER_POINTS = 2000;

/** Làm tròn biên trục Y ra bội số của 10 để nhãn dễ đọc. */
function computeBounds(points: ChartPoint[]): { min: number; max: number } {
  if (points.length === 0) return { min: 40, max: 160 };
  // `Math.min(...values)` tràn call stack khi mảng rất lớn — duyệt một lần bằng reduce.
  let rawMin = Number.POSITIVE_INFINITY;
  let rawMax = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (point.heartRateBpm < rawMin) rawMin = point.heartRateBpm;
    if (point.heartRateBpm > rawMax) rawMax = point.heartRateBpm;
  }
  const min = Math.max(20, Math.floor((rawMin - 5) / 10) * 10);
  const max = Math.min(300, Math.ceil((rawMax + 5) / 10) * 10);
  return { min, max };
}

/** Giữ tối đa `max` điểm, luôn giữ mẫu cuối để đường không bị hụt đầu mút. */
function downsample(points: ChartPoint[], max: number): ChartPoint[] {
  if (points.length <= max) return points;
  const stride = Math.ceil(points.length / max);
  const sampled: ChartPoint[] = [];
  for (let index = 0; index < points.length; index += stride) {
    sampled.push(points[index]!);
  }
  const last = points[points.length - 1]!;
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

/**
 * Biểu đồ nhịp tim vẽ bằng SVG/CSS — không thêm thư viện biểu đồ.
 * - Trục X: thời gian (đầu/giữa/cuối khoảng), trục Y: bpm có nhãn giá trị.
 * - Khoảng thiếu dữ liệu được tô nền + liệt kê ở chú giải (chữ, không chỉ màu).
 * - Toàn bộ SVG là trang trí bổ trợ: bảng dữ liệu bên dưới là phương án thay thế
 *   cho trình đọc màn hình (ghi rõ trong aria-label).
 */
export const MeasurementChart = memo(function MeasurementChart({
  points,
  gaps,
  range,
}: MeasurementChartProps) {
  // Mọi phép tính hình học gói trong một useMemo: chỉ chạy lại khi dữ liệu đổi,
  // không phải mỗi lần trang cha render (đổi số dòng hiển thị, tick đồng hồ…).
  const geometry = useMemo(() => {
    const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const rangeStart = new Date(range.from).getTime();
    const rangeEnd = new Date(range.to).getTime();
    const spanMs = Math.max(1, rangeEnd - rangeStart);
    const showDateOnAxis = spanMs > 12 * 3600 * 1000;
    const bounds = computeBounds(points);

    const xFor = (iso: string): number => {
      const t = new Date(iso).getTime();
      const ratio = (t - rangeStart) / spanMs;
      return MARGIN.left + Math.max(0, Math.min(1, ratio)) * plotWidth;
    };
    const yFor = (bpm: number): number => {
      const ratio = (bpm - bounds.min) / Math.max(1, bounds.max - bounds.min);
      return MARGIN.top + (1 - Math.max(0, Math.min(1, ratio))) * plotHeight;
    };

    const drawnPoints = downsample(points, MAX_RENDER_POINTS);
    const linePoints = drawnPoints
      .map((p) => `${xFor(p.measuredAt).toFixed(1)},${yFor(p.heartRateBpm).toFixed(1)}`)
      .join(' ');
    const areaPoints =
      drawnPoints.length > 1
        ? `${MARGIN.left},${MARGIN.top + plotHeight} ${linePoints} ${WIDTH - MARGIN.right},${MARGIN.top + plotHeight}`
        : '';

    const yTicks = [bounds.min, Math.round((bounds.min + bounds.max) / 2), bounds.max];
    const xTicks: Array<{ t: number; iso: string; anchor: 'start' | 'middle' | 'end' }> = [
      { t: rangeStart, iso: range.from, anchor: 'start' },
      {
        t: (rangeStart + rangeEnd) / 2,
        iso: new Date((rangeStart + rangeEnd) / 2).toISOString(),
        anchor: 'middle',
      },
      { t: rangeEnd, iso: range.to, anchor: 'end' },
    ];
    const gapRects = gaps
      .filter(
        (gap) =>
          new Date(gap.to).getTime() > rangeStart && new Date(gap.from).getTime() < rangeEnd,
      )
      .map((gap) => {
        const from = xFor(gap.from);
        const to = xFor(gap.to);
        return {
          key: `${gap.from}-${gap.to}`,
          x: from,
          width: Math.max(2, to - from),
        };
      });

    return {
      plotHeight,
      bounds,
      showDateOnAxis,
      xFor,
      yFor,
      drawnPoints,
      linePoints,
      areaPoints,
      yTicks,
      xTicks,
      gapRects,
    };
  }, [points, gaps, range.from, range.to]);

  const {
    plotHeight,
    bounds,
    showDateOnAxis,
    xFor,
    yFor,
    drawnPoints,
    linePoints,
    areaPoints,
    yTicks,
    xTicks,
    gapRects,
  } = geometry;

  const isDownsampled = drawnPoints.length < points.length;
  const ariaLabel =
    points.length > 0
      ? `Biểu đồ nhịp tim: ${points.length} mẫu hợp lệ${isDownsampled ? `, vẽ rút gọn còn ${drawnPoints.length} điểm` : ''}, thấp nhất ${bounds.min} nhịp/phút, cao nhất ${bounds.max} nhịp/phút. Chi tiết từng lần đo ở bảng/danh sách dữ liệu bên dưới.`
      : 'Biểu đồ nhịp tim: chưa có mẫu hợp lệ để vẽ. Chi tiết ở bảng/danh sách dữ liệu bên dưới.';

  return (
    <figure className="chart">
      <div
        className="chart__scroll"
        tabIndex={0}
        role="group"
        aria-label="Biểu đồ nhịp tim có thể cuộn ngang. Dùng phím mũi tên trái/phải để xem các mốc thời gian; bảng dữ liệu bên dưới liệt kê từng lần đo."
      >
        <svg className="chart__svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={ariaLabel}>
          {/* Khoảng thiếu dữ liệu */}
          {gapRects.map((rect) => (
            <rect
              key={rect.key}
              x={rect.x}
              y={MARGIN.top}
              width={rect.width}
              height={plotHeight}
              className="chart__gap"
            />
          ))}

          {/* Lưới + trục Y */}
          {yTicks.map((tick) => (
            <g key={`y-${tick}`}>
              <line
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={yFor(tick)}
                y2={yFor(tick)}
                className="chart__grid"
              />
              <text x={MARGIN.left - 8} y={yFor(tick) + 4} textAnchor="end" className="chart__tick">
                {tick}
              </text>
            </g>
          ))}
          <text
            x={12}
            y={MARGIN.top + plotHeight / 2}
            textAnchor="middle"
            className="chart__axis-label"
            transform={`rotate(-90 12 ${MARGIN.top + plotHeight / 2})`}
          >
            nhịp/phút
          </text>

          {/* Trục X */}
          {xTicks.map((tick) => (
            <text
              key={tick.t}
              x={xFor(tick.iso)}
              y={HEIGHT - 8}
              textAnchor={tick.anchor}
              className="chart__tick"
            >
              {showDateOnAxis ? formatCompactDateTime(tick.iso) : formatTime(tick.iso)}
            </text>
          ))}

          {/* Đường + điểm dữ liệu */}
          {areaPoints ? <polygon points={areaPoints} className="chart__area" /> : null}
          {drawnPoints.length > 1 ? (
            <polyline points={linePoints} fill="none" className="chart__line" />
          ) : null}
          {drawnPoints.length <= 40
            ? drawnPoints.map((point) => (
                <circle
                  key={point.measuredAt}
                  cx={xFor(point.measuredAt)}
                  cy={yFor(point.heartRateBpm)}
                  r={3}
                  className="chart__dot"
                >
                  <title>
                    {formatCompactDateTime(point.measuredAt)}: {point.heartRateBpm} nhịp/phút
                  </title>
                </circle>
              ))
            : null}

          {points.length === 0 ? (
            <text x={WIDTH / 2} y={HEIGHT / 2} textAnchor="middle" className="chart__empty">
              Chưa có mẫu hợp lệ để vẽ biểu đồ
            </text>
          ) : null}
        </svg>
      </div>
      <figcaption className="chart__caption">
        <span>
          {formatDate(range.from)} – {formatDate(range.to)}
          {gaps.length > 0
            ? ` · ${gaps.length} khoảng thiếu dữ liệu (ô nền tô đậm)`
            : ''}
          . Bảng/danh sách dữ liệu bên dưới liệt kê từng lần đo.
        </span>
      </figcaption>
    </figure>
  );
});
