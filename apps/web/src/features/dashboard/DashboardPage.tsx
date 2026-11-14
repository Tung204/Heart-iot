import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert } from '../../components/Alert';
import { ButtonLink } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { formatDateTime, formatRelativeTime, todayInTimeZone } from '../../lib/format';
import { getApiErrorMessage } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { useActiveSubject } from '../subjects/selection';
import { useSubjects } from '../subjects/useSubjects';
import { fetchDailySummary, fetchOpenAlerts, fetchSubjectStatus } from './api';

const FRESHNESS_LABELS = {
  live: 'Trực tuyến',
  stale: 'Chưa cập nhật gần đây',
  offline: 'Ngoại tuyến',
  never: 'Chưa từng kết nối',
} as const;

const FRESHNESS_TONES = {
  live: 'teal',
  stale: 'sand',
  offline: 'brick',
  never: 'neutral',
} as const;

const HR_QUALITY_LABELS = {
  valid: 'tín hiệu tốt',
  poor_signal: 'tín hiệu kém',
  not_worn: 'không đeo',
  sensor_error: 'lỗi cảm biến',
} as const;

/**
 * /app — tổng quan hồ sơ đang xem (thay AppHomePage wave 1):
 * trạng thái thiết bị, cảnh báo đang mở, lần đo gần nhất, tổng hợp hôm nay.
 * - Không hiện số 0 giả: thiếu dữ liệu ghi rõ "chưa có".
 * - HR chỉ hiển thị khi có mẫu hợp lệ.
 * - Nguồn mô phỏng luôn được ghi nhãn.
 */
export function DashboardPage() {
  const subjects = useSubjects();
  const activeSubject = useActiveSubject(subjects.data);

  const subjectId = activeSubject?.id ?? null;
  const timezone = activeSubject?.timezone ?? 'Asia/Ho_Chi_Minh';
  const today = todayInTimeZone(timezone);

  const status = useQuery({
    queryKey: subjectId ? queryKeys.subjectStatus(subjectId) : ['subjects', 'none', 'status'],
    queryFn: ({ signal }) => (subjectId ? fetchSubjectStatus(subjectId, signal) : null),
    enabled: Boolean(subjectId),
    staleTime: 15_000,
  });

  const summary = useQuery({
    queryKey: subjectId
      ? queryKeys.dailySummary(subjectId, today)
      : ['subjects', 'none', 'daily-summary', today],
    queryFn: ({ signal }) => (subjectId ? fetchDailySummary(subjectId, today, signal) : null),
    enabled: Boolean(subjectId),
    staleTime: 30_000,
  });

  const openAlerts = useQuery({
    queryKey: subjectId
      ? queryKeys.dashboardOpenAlerts(subjectId)
      : ['subjects', 'none', 'alerts', 'dashboard'],
    queryFn: ({ signal }) => (subjectId ? fetchOpenAlerts(subjectId, 5, signal) : null),
    enabled: Boolean(subjectId),
    staleTime: 15_000,
  });

  if (!activeSubject && !subjects.isPending && !subjects.isError) {
    return (
      <EmptyState
        title="Chưa có hồ sơ nào"
        description="Tạo hồ sơ cho người cần theo dõi để bắt đầu nhận dữ liệu và mời người thân cùng xem."
        action={<ButtonLink to="/app/subjects">Tạo hồ sơ</ButtonLink>}
      />
    );
  }

  const anyError = status.isError || summary.isError || openAlerts.isError;
  const anyPending = status.isPending || summary.isPending || openAlerts.isPending;

  return (
    <div className="stack">
      <header>
        <h1 className="page-title">
          Tổng quan{activeSubject ? ` — ${activeSubject.displayName}` : ''}
        </h1>
        <p className="page-lead">
          Tình trạng thiết bị, dữ liệu mới nhất và cảnh báo đang mở của hồ sơ đang xem.
        </p>
      </header>

      {anyPending ? <PageLoader label="Đang tải dữ liệu tổng quan…" /> : null}
      {anyError ? (
        <ErrorState
          title="Không tải được dữ liệu tổng quan"
          message={
            getApiErrorMessage(status.error ?? summary.error ?? openAlerts.error) +
            ' Kiểm tra kết nối và thử lại.'
          }
          onRetry={() => {
            void status.refetch();
            void summary.refetch();
            void openAlerts.refetch();
          }}
        />
      ) : null}

      {!anyPending && !anyError ? (
        <>
          <section aria-labelledby="device-status-heading" className="card-grid">
            <h2 id="device-status-heading" className="visually-hidden">
              Trạng thái thiết bị
            </h2>
            {status.data?.devices.length ? (
              status.data.devices.map((device) => (
                <Card key={device.deviceId} title={`Thiết bị ${device.label || device.serial}`}>
                  <p className="metric-line">
                    <StatusPill tone={FRESHNESS_TONES[device.freshness]}>
                      {FRESHNESS_LABELS[device.freshness]}
                    </StatusPill>
                    {device.lastSeenAt ? (
                      <span className="metric-line__note">
                        lần nhận cuối {formatRelativeTime(device.lastSeenAt)}
                      </span>
                    ) : null}
                  </p>
                  <p className="metric-line">
                    Nhịp tim gần nhất:{' '}
                    {device.lastHeartRateBpm !== null &&
                    device.lastHeartRateQuality === 'valid' ? (
                      <strong>{device.lastHeartRateBpm} bpm</strong>
                    ) : (
                      'chưa có mẫu hợp lệ'
                    )}
                    {device.lastHeartRateQuality && device.lastHeartRateQuality !== 'valid' ? (
                      <span className="metric-line__note">
                        {' '}
                        (tín hiệu {HR_QUALITY_LABELS[device.lastHeartRateQuality]})
                      </span>
                    ) : null}
                  </p>
                  <p className="metric-line">
                    Pin:{' '}
                    {device.batteryPercent !== null ? (
                      <strong>{device.batteryPercent}%</strong>
                    ) : (
                      'chưa có thông tin pin'
                    )}
                  </p>
                  {device.lastMeasuredAt ? (
                    <p className="metric-line">
                      Lần đo gần nhất: {formatDateTime(device.lastMeasuredAt)}
                    </p>
                  ) : (
                    <p className="metric-line">Lần đo gần nhất: chưa có dữ liệu từ thiết bị</p>
                  )}
                </Card>
              ))
            ) : (
              <Card title="Thiết bị">
                <p>
                  Chưa gắn thiết bị nào cho hồ sơ này.{' '}
                  <Link to="/app/devices">Gắn thiết bị</Link> để bắt đầu nhận dữ liệu.
                </p>
              </Card>
            )}
          </section>

          <section aria-labelledby="open-alerts-heading">
            <h2 id="open-alerts-heading" className="section-title">
              Cảnh báo đang mở
            </h2>
            {openAlerts.data && openAlerts.data.items.length > 0 ? (
              <ul className="alert-list">
                {openAlerts.data.items.map((item) => (
                  <li key={item.id} className="alert-row alert-row--high">
                    <div className="alert-row__main">
                      <p className="alert-row__title">
                        <Link to={`/app/alerts/${item.id}`}>
                          {item.type === 'sos' ? 'Yêu cầu trợ giúp' : 'Nghi ngã'} — cần chú ý
                        </Link>
                      </p>
                      <p className="alert-row__meta">
                        Phát hiện {formatDateTime(item.detectedAt)} ·{' '}
                        {item.acknowledgedBy
                          ? `đã xác nhận bởi ${item.acknowledgedBy.displayName}`
                          : 'chưa có người xác nhận'}
                      </p>
                    </div>
                    <StatusPill tone="brick">
                      {item.state === 'acknowledged' ? 'Đã xác nhận' : 'Đang mở'}
                    </StatusPill>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="field__hint">Không có cảnh báo đang mở.</p>
            )}
            <p>
              <Link to="/app/alerts">Xem tất cả cảnh báo →</Link>
            </p>
          </section>

          {summary.data ? (
            <section aria-labelledby="daily-summary-heading">
              <h2 id="daily-summary-heading" className="section-title">
                Tổng hợp hôm nay ({summary.data.date})
              </h2>
              <Card>
                {summary.data.source === 'synthetic' ? (
                  <p className="demo-notice">
                    <StatusPill tone="sand">Nguồn: dữ liệu mô phỏng</StatusPill>
                  </p>
                ) : null}
                <div className="metric-grid">
                  <div className="metric">
                    <p className="metric__label">Nhịp tim</p>
                    {summary.data.heartRate ? (
                      <p className="metric__value">
                        {Math.round(summary.data.heartRate.avg)} bpm
                        <span className="metric__sub">
                          {' '}
                          thấp {Math.round(summary.data.heartRate.min)} – cao{' '}
                          {Math.round(summary.data.heartRate.max)} ·{' '}
                          {summary.data.heartRate.validSamples} mẫu hợp lệ
                        </span>
                      </p>
                    ) : (
                      <p className="metric__value">Chưa có mẫu nhịp tim hợp lệ hôm nay</p>
                    )}
                  </div>
                  <div className="metric">
                    <p className="metric__label">Vận động</p>
                    <p className="metric__value">
                      {summary.data.steps.total} bước
                      <span className="metric__sub">
                        {' '}
                        ·{' '}
                        {summary.data.steps.completeness === 'complete'
                          ? 'đủ dữ liệu'
                          : summary.data.steps.completeness === 'partial'
                            ? 'dữ liệu một phần'
                            : 'chưa đủ dữ liệu'}
                      </span>
                    </p>
                  </div>
                  <div className="metric">
                    <p className="metric__label">Pin</p>
                    <p className="metric__value">
                      {summary.data.batteryPercent !== null
                        ? `${summary.data.batteryPercent}%`
                        : 'Chưa có thông tin pin'}
                    </p>
                  </div>
                  <div className="metric">
                    <p className="metric__label">Độ phủ dữ liệu</p>
                    <p className="metric__value">
                      {summary.data.coverage.percent}%
                      <span className="metric__sub">
                        {' '}
                        ({summary.data.coverage.observedCount}/
                        {summary.data.coverage.expectedCount} mẫu dự kiến)
                      </span>
                    </p>
                  </div>
                </div>
                <p className="metric-line">
                  Cảnh báo hôm nay: {summary.data.incidents.total} (đã đóng{' '}
                  {summary.data.incidents.resolved}) ·{' '}
                  {summary.data.lastSeenAt
                    ? `dữ liệu mới nhất ${formatRelativeTime(summary.data.lastSeenAt)}`
                    : 'chưa nhận dữ liệu từ thiết bị'}
                  {summary.data.gaps.length > 0
                    ? ` · ${summary.data.gaps.length} khoảng thiếu dữ liệu`
                    : ''}
                </p>
                <p>
                  <Link to="/app/history">Xem lịch sử và biểu đồ →</Link>
                </p>
              </Card>
            </section>
          ) : null}

          <Alert tone="info" title="Giới hạn của bản demo">
            Cảnh báo chỉ hiển thị khi trang web đang mở và kết nối với máy chủ. Bản demo không
            gửi thông báo khi đóng trình duyệt, không tự gọi cấp cứu, và toàn bộ dữ liệu là dữ
            liệu mô phỏng. Số liệu trên trang chỉ để kiểm thử, không dùng để chẩn đoán hay thay
            lời khuyên y tế.
          </Alert>
        </>
      ) : null}
    </div>
  );
}
