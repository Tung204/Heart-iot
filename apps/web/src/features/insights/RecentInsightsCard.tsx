import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { DailyInsight, InsightsResponse } from '@heart-iot/contracts/insights';
import { Button, ButtonLink } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { StatusPill } from '../../components/StatusPill';
import { getApiErrorMessage } from '../../lib/api';
import { INSIGHT_RANGES, useInsights, type InsightRangeDays } from './useInsights';
import './insights.css';

/**
 * Card "Xu hướng gần đây" trên dashboard (FR-05).
 *
 * - Bộ chọn 7/14/30 ngày bằng `aria-pressed`; mỗi lần đổi là đúng một query.
 * - Ngày không có dữ liệu hiển thị "—" (không vẽ 0), có chú thích bằng chữ.
 * - Có nhãn dữ liệu mô phỏng, dòng miễn trừ y tế và lối sang Lịch sử đo.
 * - Không suy diễn sức khỏe; mọi câu ghi chú lấy từ `notes` của API.
 */

function dateParts(date: string): { day: string; month: string; year: string } {
  const [year = '', month = '', day = ''] = date.split('-');
  return { day, month, year };
}

function formatDayShort(date: string): string {
  const { day, month } = dateParts(date);
  return `${day}/${month}`;
}

function formatDayFull(date: string): string {
  const { day, month, year } = dateParts(date);
  return `${day}/${month}/${year}`;
}

function dayAriaLabel(day: DailyInsight): string {
  const date = formatDayFull(day.date);
  if (!day.hasData) return `Ngày ${date}: chưa có dữ liệu`;
  if (!day.heartRate) return `Ngày ${date}: có lần đo nhưng không có nhịp tim hợp lệ`;
  return `Ngày ${date}: nhịp tim trung bình ${day.heartRate.avg} bpm, ${day.heartRate.validSamples} lần đo hợp lệ`;
}

function InsightChart({ data }: { data: InsightsResponse }) {
  const maxHeartRate = Math.max(
    1,
    ...data.days.map((day) => day.heartRate?.avg ?? 0),
  );
  return (
    <div className="insights-chart-block">
      <h3 className="insights-chart-block__title">Nhịp tim trung bình mỗi ngày (bpm)</h3>
      <div className="insights-chart__scroll">
        <ul className="insights-chart" aria-label="Nhịp tim trung bình theo ngày">
          {data.days.map((day) => {
            const average = day.heartRate?.avg ?? null;
            const height =
              average === null
                ? null
                : Math.max(4, Math.round((average / maxHeartRate) * 100));
            return (
              <li key={day.date} className="insights-chart__col" aria-label={dayAriaLabel(day)}>
                <span className="insights-chart__value" aria-hidden="true">
                  {average === null ? '—' : Math.round(average)}
                </span>
                <span className="insights-chart__track" aria-hidden="true">
                  {height === null ? (
                    <span className="insights-chart__missing">—</span>
                  ) : (
                    <span className="insights-chart__bar" style={{ height: `${height}%` }} />
                  )}
                </span>
                <time className="insights-chart__date" dateTime={day.date} aria-hidden="true">
                  {formatDayShort(day.date)}
                </time>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="insights-chart-block__caption">
        Ngày không có lần đo nhịp tim hợp lệ hiển thị “—” và không được nội suy thành 0.
      </p>
      <p className="insights-chart-block__hint">
        Cuộn ngang biểu đồ để xem thêm ngày.
      </p>
    </div>
  );
}

function InsightMetrics({ data }: { data: InsightsResponse }) {
  const validSamples = data.days.reduce(
    (total, day) => total + (day.heartRate?.validSamples ?? 0),
    0,
  );
  const stepsReliable = data.days.some((day) => day.steps.completeness !== 'unavailable');
  const partialStepDays = data.days.filter(
    (day) => day.steps.completeness === 'partial',
  ).length;

  return (
    <dl className="insights-metrics">
      <div className="insights-metric">
        <dt className="insights-metric__label">Nhịp tim trung bình {data.days.length} ngày</dt>
        <dd className="insights-metric__value">
          {data.summary.avgHeartRate !== null ? `${data.summary.avgHeartRate} bpm` : '—'}
          <span className="insights-metric__sub">
            {validSamples > 0 ? `${validSamples} lần đo hợp lệ` : 'chưa có lần đo hợp lệ'}
          </span>
        </dd>
      </div>
      <div className="insights-metric">
        <dt className="insights-metric__label">Tổng bước</dt>
        <dd className="insights-metric__value">
          {stepsReliable ? `${data.summary.totalSteps.toLocaleString('vi-VN')} bước` : '—'}
          <span className="insights-metric__sub">
            {!stepsReliable
              ? 'chưa đủ dữ liệu bước'
              : partialStepDays > 0
                ? `${partialStepDays} ngày ước tính một phần`
                : 'ước tính từ counter thiết bị'}
          </span>
        </dd>
      </div>
      <div className="insights-metric">
        <dt className="insights-metric__label">Ngày có dữ liệu</dt>
        <dd className="insights-metric__value">
          {data.summary.dataDays}/{data.days.length}
          <span className="insights-metric__sub">ngày có dữ liệu</span>
        </dd>
      </div>
      <div className="insights-metric">
        <dt className="insights-metric__label">Độ phủ trung bình</dt>
        <dd className="insights-metric__value">
          {data.summary.avgCoveragePercent}%
          <span className="insights-metric__sub">dữ liệu nhận được so với kỳ vọng</span>
        </dd>
      </div>
    </dl>
  );
}

export function RecentInsightsCard({ subjectId }: { subjectId: string | null }) {
  const [range, setRange] = useState<InsightRangeDays>(7);
  const query = useInsights(subjectId, range);

  if (!subjectId) return null;

  const data = query.data;
  const isEmpty = data ? data.summary.dataDays === 0 : false;

  return (
    <Card className="insights-card">
      <div className="insights-card__head">
        <div className="insights-card__heading">
          <h2 className="insights-card__title">Xu hướng gần đây</h2>
          <p className="insights-card__lead">
            Nhịp tim, vận động và dữ liệu nhận được theo ngày trong khoảng bạn chọn.
          </p>
        </div>
        <div className="segmented insights-card__range" role="group" aria-label="Khoảng thời gian xu hướng">
          {INSIGHT_RANGES.map((option) => (
            <button
              key={option}
              type="button"
              className={`segmented__item${range === option ? ' is-active' : ''}`}
              aria-pressed={range === option}
              onClick={() => setRange(option)}
            >
              {option} ngày
            </button>
          ))}
        </div>
      </div>

      {query.isPending ? (
        <p className="insights-card__status" role="status">
          Đang tải xu hướng…
        </p>
      ) : query.isError ? (
        <div className="insights-card__state" role="alert">
          <p className="insights-card__status">
            Không tải được xu hướng. {getApiErrorMessage(query.error)}
          </p>
          <div className="insights-card__actions">
            <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
              Thử lại
            </Button>
            <ButtonLink to="/app/history" variant="subtle" size="sm">
              Mở lịch sử đo
            </ButtonLink>
          </div>
        </div>
      ) : data ? (
        <>
          {data.summary.syntheticDays > 0 ? (
            <p className="insights-card__notice">
              <StatusPill tone="sand">Dữ liệu mô phỏng · không phải số đo thật</StatusPill>
            </p>
          ) : null}
          {query.isFetching ? (
            <p className="insights-card__status" role="status">
              Đang cập nhật xu hướng…
            </p>
          ) : null}

          {isEmpty ? (
            <EmptyState
              title="Chưa có dữ liệu xu hướng"
              description="Chưa nhận được lần đo nào trong khoảng này. Kiểm tra thiết bị đã gắn và đang gửi dữ liệu."
              action={
                <ButtonLink to="/app/history" variant="secondary" size="sm">
                  Mở lịch sử đo
                </ButtonLink>
              }
            />
          ) : (
            <>
              <InsightMetrics data={data} />
              <InsightChart data={data} />
              {data.notes.length > 0 ? (
                <ul className="insights-notes">
                  {data.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
              <div className="insights-card__footer">
                <Link to="/app/history">Xem lịch sử và biểu đồ →</Link>
              </div>
            </>
          )}

          <p className="insights-card__disclaimer">
            Chỉ để theo dõi, không thay thế tư vấn y tế.
          </p>
        </>
      ) : null}
    </Card>
  );
}
