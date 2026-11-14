import { useMemo } from 'react';
import type { MeasurementGap } from '@annhien/contracts/measurements';
import { formatTime } from '../lib/format';

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

/** Làm tròn biên trục Y ra bội số của 10 để nhãn dễ đọc. */
function niceBounds(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 40, max: 160 };
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const min = Math.max(20, Math.floor((rawMin - 5) / 10) * 10);
  const max = Math.min(300, Math.ceil((rawMax + 5) / 10) * 10);
  return { min, max };
}

/**
 * Biểu đồ nhịp tim vẽ bằng SVG/CSS — không thêm thư viện biểu đồ.
 * - Trục X: thời gian (đầu/giữa/cuối khoảng), trục Y: bpm có nhãn giá trị.
 * - Khoảng thiếu dữ liệu được tô nền + liệt kê ở chú giải (chữ, không chỉ màu).
 * - Toàn bộ SVG là trang trí bổ trợ: bảng dữ liệu bên dưới là phương án thay thế
 *   cho trình đọc màn hình (ghi rõ trong aria-label).
 */
export function MeasurementChart({ points, gaps, range }: MeasurementChartProps) {
  const bounds = useMemo(() => niceBounds(points.map((p) => p.heartRateBpm)), [points]);
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const rangeStart = new Date(range.from).getTime();
  const rangeEnd = new Date(range.to).getTime();
  const spanMs = Math.max(1, rangeEnd - rangeStart);

  const xFor = (iso: string): number => {
    const t = new Date(iso).getTime();
    const ratio = (t - rangeStart) / spanMs;
    return MARGIN.left + Math.max(0, Math.min(1, ratio)) * plotWidth;
  };
  const yFor = (bpm: number): number => {
    const ratio = (bpm - bounds.min) / Math.max(1, bounds.max - bounds.min);
    return MARGIN.top + (1 - Math.max(0, Math.min(1, ratio))) * plotHeight;
  };

  const linePoints = points
    .map((p) => `${xFor(p.measuredAt).toFixed(1)},${yFor(p.heartRateBpm).toFixed(1)}`)
    .join(' ');

  const yTicks = [bounds.min, Math.round((bounds.min + bounds.max) / 2), bounds.max];
  const xTicks: Array<{ t: number; iso: string; anchor: 'start' | 'middle' | 'end' }> = [
    { t: rangeStart, iso: range.from, anchor: 'start' },
    { t: (rangeStart + rangeEnd) / 2, iso: new Date((rangeStart + rangeEnd) / 2).toISOString(), anchor: 'middle' },
    { t: rangeEnd, iso: range.to, anchor: 'end' },
  ];

  const gapRects = gaps
    .filter((gap) => new Date(gap.to).getTime() > rangeStart && new Date(gap.from).getTime() < rangeEnd)
    .map((gap) => {
      const from = xFor(gap.from);
      const to = xFor(gap.to);
      return {
        key: `${gap.from}-${gap.to}`,
        x: from,
        width: Math.max(2, to - from),
      };
    });

  return (
    <figure className="chart">
      <svg
        className="chart__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={
          points.length > 0
            ? `Biểu đồ nhịp tim: ${points.length} mẫu hợp lệ, thấp nhất ${bounds.min} nhịp/phút, cao nhất ${bounds.max} nhịp/phút. Chi tiết từng mẫu ở bảng dữ liệu bên dưới.`
            : 'Biểu đồ nhịp tim: chưa có mẫu hợp lệ để vẽ. Chi tiết ở bảng dữ liệu bên dưới.'
        }
      >
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
            {formatTime(tick.iso)}
          </text>
        ))}

        {/* Đường + điểm dữ liệu */}
        {points.length > 1 ? (
          <polyline points={linePoints} fill="none" className="chart__line" />
        ) : null}
        {points.map((point) => (
          <circle
            key={point.measuredAt}
            cx={xFor(point.measuredAt)}
            cy={yFor(point.heartRateBpm)}
            r={points.length > 40 ? 2 : 3}
            className="chart__dot"
          >
            <title>
              {formatTime(point.measuredAt)}: {point.heartRateBpm} nhịp/phút
            </title>
          </circle>
        ))}

        {points.length === 0 ? (
          <text
            x={WIDTH / 2}
            y={HEIGHT / 2}
            textAnchor="middle"
            className="chart__empty"
          >
            Chưa có mẫu hợp lệ để vẽ biểu đồ
          </text>
        ) : null}
      </svg>
      <figcaption className="chart__caption">
        {gaps.length > 0
          ? `${gaps.length} khoảng thiếu dữ liệu (ô nền tô đậm trong biểu đồ). Bảng dữ liệu bên dưới liệt kê từng mẫu.`
          : 'Bảng dữ liệu bên dưới liệt kê từng mẫu đo.'}
      </figcaption>
    </figure>
  );
}
