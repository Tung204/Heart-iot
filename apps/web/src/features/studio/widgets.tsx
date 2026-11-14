import type { StudioData, StudioWidget, ViewConfig } from '@annhien/contracts/studio';
import { ALERT_STATE_LABELS, ALERT_TYPE_LABELS } from '../alerts/labels';
import { formatDateTime } from '../../lib/format';
import { FRESHNESS_LABELS, QUALITY_LABELS, TASK_STATUS_LABELS } from './labels';
import './studio.css';

/**
 * Render dữ liệu preview/published theo config — dùng chung cho trang chi tiết
 * (draft → preview) và trang xem dữ liệu. Chỉ hiển thị trường có trong dữ liệu,
 * không bịa thêm; không render HTML từ model/JSON người dùng (chỉ text).
 */

function readNumberOption(widget: StudioWidget, key: string, fallback: number): number {
  const value = widget.options?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Badge nguồn dữ liệu — bắt buộc có khi render preview/data. */
export function DataModeBadge({ sample, subjectName }: { sample: boolean; subjectName?: string }) {
  return sample ? (
    <span className="pill pill--sand studio-datamode">Dữ liệu mẫu</span>
  ) : (
    <span className="pill pill--teal studio-datamode">
      Dữ liệu thật{subjectName ? ` · ${subjectName}` : ''}
    </span>
  );
}

function MetricBody({ widget, data }: { widget: StudioWidget; data: StudioData }) {
  const metrics = data.metrics;
  const field = widget.options?.field;
  if (field === 'batteryPercent') {
    const device = data.devices.find((item) => item.batteryPercent !== null);
    return (
      <div className="studio-metric">
        <p className="studio-metric__value">
          {device?.batteryPercent !== undefined && device?.batteryPercent !== null
            ? `${device.batteryPercent}%`
            : 'Chưa có thông tin'}
        </p>
        <p className="studio-metric__label">
          Pin thiết bị{device ? ` · ${device.label}` : ''}
        </p>
      </div>
    );
  }
  return (
    <div className="studio-metric">
      <p className="studio-metric__value">
        {metrics?.heartRateBpm !== null && metrics?.heartRateBpm !== undefined
          ? `${metrics.heartRateBpm} bpm`
          : 'Chưa có mẫu'}
      </p>
      <p className="studio-metric__label">
        {metrics
          ? `${QUALITY_LABELS[metrics.quality]} · ${FRESHNESS_LABELS[metrics.freshness]} · ${formatDateTime(metrics.measuredAt)}`
          : 'Chưa có dữ liệu đo'}
      </p>
    </div>
  );
}

function ChartBody({ widget, data }: { widget: StudioWidget; data: StudioData }) {
  const limit = readNumberOption(widget, 'points', 30);
  const points = data.series.filter((point) => point.heartRateBpm !== null).slice(-limit);
  if (points.length === 0) {
    return <p className="studio-widget__empty">Chưa có điểm dữ liệu để vẽ biểu đồ.</p>;
  }

  const values = points.map((point) => point.heartRateBpm as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const W = 640;
  const H = 220;
  const PAD_L = 40;
  const PAD_R = 12;
  const PAD_T = 14;
  const PAD_B = 30;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const x = (index: number) => PAD_L + (index * innerW) / Math.max(1, points.length - 1);
  const y = (value: number) => PAD_T + innerH - ((value - (min - range * 0.1)) / (range * 1.2)) * innerH;
  const polyline = points.map((point, index) => `${x(index)},${y(point.heartRateBpm as number)}`).join(' ');

  const first = points.at(0);
  const last = points.at(-1);
  if (!first || !last) return <p className="studio-widget__empty">Chưa có điểm dữ liệu để vẽ biểu đồ.</p>;

  const firstTime = formatDateTime(first.measuredAt);
  const lastTime = formatDateTime(last.measuredAt);

  return (
    <div>
      <svg
        className="studio-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Biểu đồ ${widget.title}: từ ${firstTime} đến ${lastTime}`}
      >
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + innerH} className="studio-chart__axis" />
        <line x1={PAD_L} y1={PAD_T + innerH} x2={W - PAD_R} y2={PAD_T + innerH} className="studio-chart__axis" />
        <text x={PAD_L - 6} y={PAD_T + 4} textAnchor="end" className="studio-chart__label">
          {max}
        </text>
        <text x={PAD_L - 6} y={PAD_T + innerH} textAnchor="end" className="studio-chart__label">
          {min}
        </text>
        <text x={PAD_L} y={H - 8} className="studio-chart__label">
          {firstTime}
        </text>
        <text x={W - PAD_R} y={H - 8} textAnchor="end" className="studio-chart__label">
          {lastTime}
        </text>
        <polyline points={polyline} fill="none" className="studio-chart__line" />
      </svg>
      <div className="studio-table-wrap">
        <table className="studio-table">
          <caption className="studio-table__caption">Bảng dữ liệu thay thế cho biểu đồ</caption>
          <thead>
            <tr>
              <th scope="col">Thời điểm</th>
              <th scope="col">Nhịp tim (bpm)</th>
              <th scope="col">Chất lượng</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point, index) => (
              <tr key={`${point.measuredAt}-${index}`}>
                <td>{formatDateTime(point.measuredAt)}</td>
                <td>{point.heartRateBpm}</td>
                <td>{QUALITY_LABELS[point.quality]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AlertsBody({ widget, data }: { widget: StudioWidget; data: StudioData }) {
  const limit = Math.min(readNumberOption(widget, 'limit', 10), 10);
  const includeResolved = widget.options?.includeResolved === true;
  const items = includeResolved
    ? data.alerts
    : data.alerts.filter((alert) => alert.state !== 'resolved' && alert.state !== 'cancelled');
  if (items.length === 0) {
    return <p className="studio-widget__empty">Không có cảnh báo.</p>;
  }
  return (
    <ul className="studio-list">
      {items.slice(0, limit).map((alert) => (
        <li key={alert.id} className="studio-list__item">
          <span className="studio-list__title">
            {ALERT_TYPE_LABELS[alert.type]} · {ALERT_STATE_LABELS[alert.state]}
          </span>
          <span className="studio-list__meta">{formatDateTime(alert.detectedAt)}</span>
        </li>
      ))}
    </ul>
  );
}

function SummaryBody({ data }: { data: StudioData }) {
  const summary = data.summary;
  if (!summary) return <p className="studio-widget__empty">Chưa có dữ liệu tổng hợp.</p>;
  const hr = (value: number | null) => (value === null ? '—' : `${value} bpm`);
  return (
    <dl className="studio-summary">
      <div>
        <dt>Khoảng thời gian</dt>
        <dd>
          {formatDateTime(summary.windowStart)} – {formatDateTime(summary.windowEnd)}
        </dd>
      </div>
      <div>
        <dt>Nhịp tim trung bình</dt>
        <dd>{hr(summary.heartRateAvg)}</dd>
      </div>
      <div>
        <dt>Nhịp tim thấp nhất</dt>
        <dd>{hr(summary.heartRateMin)}</dd>
      </div>
      <div>
        <dt>Nhịp tim cao nhất</dt>
        <dd>{hr(summary.heartRateMax)}</dd>
      </div>
      <div>
        <dt>Cảnh báo</dt>
        <dd>
          {summary.alertsTotal} cảnh báo · {summary.alertsResolved} đã đóng
        </dd>
      </div>
      <div>
        <dt>Nguồn</dt>
        <dd>{summary.source === 'synthetic' ? 'Dữ liệu mô phỏng' : 'Dữ liệu thiết bị'}</dd>
      </div>
      {summary.lastSeenAt ? (
        <div>
          <dt>Lần nhận dữ liệu gần nhất</dt>
          <dd>{formatDateTime(summary.lastSeenAt)}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function TasksBody({ widget, data }: { widget: StudioWidget; data: StudioData }) {
  const limit = readNumberOption(widget, 'limit', 10);
  if (data.tasks.length === 0) {
    return <p className="studio-widget__empty">Không có công việc.</p>;
  }
  return (
    <ul className="studio-list">
      {data.tasks.slice(0, limit).map((task) => (
        <li key={task.id} className="studio-list__item">
          <span className="studio-list__title">
            {task.title} · {TASK_STATUS_LABELS[task.status]}
          </span>
          <span className="studio-list__meta">
            {task.dueAt ? `Hạn ${formatDateTime(task.dueAt)}` : 'Không có hạn'}
          </span>
        </li>
      ))}
    </ul>
  );
}

function WidgetBody({ widget, data }: { widget: StudioWidget; data: StudioData }) {
  switch (widget.type) {
    case 'metric':
      return <MetricBody widget={widget} data={data} />;
    case 'chart':
      return <ChartBody widget={widget} data={data} />;
    case 'alerts':
      return <AlertsBody widget={widget} data={data} />;
    case 'summary':
      return <SummaryBody data={data} />;
    case 'tasks':
      return <TasksBody widget={widget} data={data} />;
  }
}

/** Preview của config trên một StudioData — bố cục theo layout stack|grid. */
export function WidgetPreview({ config, data }: { config: ViewConfig; data: StudioData }) {
  return (
    <div
      className={`studio-preview${config.layout === 'grid' ? ' studio-preview--grid' : ''}`}
      aria-label="Bản xem trước"
    >
      {config.widgets.map((widget) => (
        <section
          key={widget.id}
          className={`studio-widget studio-widget--span-${widget.span}`}
          aria-labelledby={`studio-widget-${widget.id}`}
        >
          <h3 id={`studio-widget-${widget.id}`} className="studio-widget__title">
            {widget.title}
          </h3>
          <WidgetBody widget={widget} data={data} />
        </section>
      ))}
    </div>
  );
}
