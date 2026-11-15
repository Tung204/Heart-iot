import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import { Alert } from '../../components/Alert';
import { Button, ButtonLink } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { StatusPill } from '../../components/StatusPill';
import { formatDateTime, formatRelativeTime, todayInTimeZone } from '../../lib/format';
import { getApiErrorMessage, isApiError } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { useMe } from '../auth/useAuth';
import { RecentInsightsCard } from '../insights/RecentInsightsCard';
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

/** 403 là trạng thái quyền, không phải lỗi kỹ thuật: hiển thị thông điệp nghiệp vụ. */
function isForbiddenError(error: unknown): boolean {
  return isApiError(error) && (error.status === 403 || error.code === 'FORBIDDEN');
}

const MEASUREMENTS_NOT_SHARED_TITLE = 'Chủ hồ sơ không chia sẻ số đo';
const MEASUREMENTS_NOT_SHARED_TEXT =
  'Chủ hồ sơ không chia sẻ số đo và lịch sử với bạn. Cảnh báo đang mở vẫn hiển thị ở trên nếu bạn có quyền nhận cảnh báo.';

/** Loading cục bộ của một vùng: không chiếm cả trang, không ghi số khi chưa có dữ liệu. */
function RegionLoading({ label }: { label: string }) {
  return (
    <p className="dashboard-region__loading" role="status" aria-busy="true">
      <span className="dashboard-region__spinner" aria-hidden="true" />
      <span>{label}</span>
    </p>
  );
}

/** Lỗi cục bộ của một vùng: vùng khác (đặc biệt cảnh báo) vẫn hiển thị bình thường. */
function RegionError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <Alert tone="error" title={title}>
      <p>{getApiErrorMessage(error)} Kiểm tra kết nối và thử lại.</p>
      <div className="dashboard-region__action">
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Thử lại
        </Button>
      </div>
    </Alert>
  );
}

/**
 * /app — tổng quan hồ sơ đang xem:
 * cảnh báo đang mở là ưu tiên số một, sau đó là tổng hợp hôm nay và trạng thái thiết bị.
 * - Ba vùng tải độc lập: cảnh báo (an toàn) hiển thị ngay cả khi status/daily-summary
 *   đang tải hoặc lỗi; mỗi vùng có loading/error riêng, không dùng loader toàn trang.
 * - Không hiện số 0 giả: thiếu dữ liệu ghi rõ "chưa có".
 * - HR chỉ hiển thị khi có mẫu hợp lệ.
 * - Nguồn mô phỏng luôn được ghi nhãn.
 */
export function DashboardPage() {
  const me = useMe();
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
    queryFn: ({ signal }) => (subjectId ? fetchOpenAlerts(subjectId, 20, signal) : null),
    enabled: Boolean(subjectId),
    staleTime: 15_000,
  });

  // Admin không theo dõi hồ sơ nào thì vào thẳng trang quản trị thay vì dashboard trống.
  if (me.data?.user.role === 'admin' && subjects.data && subjects.data.length === 0) {
    return <Navigate to="/app/admin" replace />;
  }

  if (!activeSubject && !subjects.isPending && !subjects.isError) {
    return (
      <EmptyState
        title="Chưa có hồ sơ nào"
        description="Tạo hồ sơ cho người cần theo dõi để bắt đầu nhận dữ liệu và mời người thân cùng xem."
        action={<ButtonLink to="/app/subjects">Tạo hồ sơ</ButtonLink>}
      />
    );
  }

  const alertItems = openAlerts.data?.items ?? [];
  // Server trả `healthDataVisible=false` khi chủ hồ sơ không chia sẻ quyền xem số đo:
  // hiển thị thông báo quyền thay vì các dòng “chưa có mẫu”/số 0 mạo nhận dữ liệu.
  const healthDataHidden =
    status.data?.devices.some((device) => device.healthDataVisible === false) ?? false;

  return (
    <div className="stack dashboard">
      <nav aria-label="Đường dẫn">
        <Link to="/app" className="breadcrumb">
          ← Hôm nay
        </Link>
      </nav>

      <header className="dashboard__header">
        <h1 className="page-title">Sức khỏe</h1>
      </header>

      {/*
        Vùng cảnh báo KHÔNG phụ thuộc status/daily-summary: đây là thông tin an toàn,
        phải hiện ngay khi API alerts trả dữ liệu, kể cả khi vùng khác đang tải/lỗi.
      */}
      <section className="dashboard-alerts" aria-labelledby="open-alerts-heading">
        <div className="dashboard-section-head">
          <h2 id="open-alerts-heading" className="section-title">
            Cảnh báo đang mở
          </h2>
          {alertItems.length > 0 ? (
            <StatusPill tone="brick">{alertItems.length} cần chú ý</StatusPill>
          ) : openAlerts.isSuccess ? (
            <StatusPill tone="teal">Không có cảnh báo</StatusPill>
          ) : null}
        </div>
        {openAlerts.isPending ? <RegionLoading label="Đang tải cảnh báo đang mở…" /> : null}
        {openAlerts.isError ? (
          <RegionError
            title="Không tải được cảnh báo đang mở"
            error={openAlerts.error}
            onRetry={() => void openAlerts.refetch()}
          />
        ) : null}
        {alertItems.length > 0 ? (
          <ul className="alert-list">
            {alertItems.map((item) => (
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
        ) : openAlerts.isSuccess ? (
          <p className="dashboard-empty-note">
            Không có cảnh báo nào cần xử lý. Cảnh báo mới sẽ xuất hiện tại đây khi trang đang mở.
          </p>
        ) : null}
        <p className="dashboard-alerts__more">
          <Link to="/app/alerts">Xem tất cả cảnh báo →</Link>
        </p>
      </section>

      <div className="dashboard__grid">
        <section aria-labelledby="daily-summary-heading" className="dashboard__primary">
          <div className="dashboard-section-head">
            <h2 id="daily-summary-heading" className="section-title">
              Tổng hợp hôm nay
            </h2>
            {summary.data?.source === 'synthetic' ? (
              <StatusPill tone="sand">Nguồn: dữ liệu mô phỏng</StatusPill>
            ) : null}
          </div>
          {summary.isPending ? <RegionLoading label="Đang tải dữ liệu tổng quan…" /> : null}
          {summary.isError && isForbiddenError(summary.error) ? (
            <Alert tone="info" title={MEASUREMENTS_NOT_SHARED_TITLE}>
              <p>{MEASUREMENTS_NOT_SHARED_TEXT}</p>
            </Alert>
          ) : null}
          {summary.isError && !isForbiddenError(summary.error) ? (
            <RegionError
              title="Không tải được dữ liệu tổng quan"
              error={summary.error}
              onRetry={() => void summary.refetch()}
            />
          ) : null}
          {summary.data ? (
            <Card>
              <div className="metric-grid">
                <div className="metric">
                  <p className="metric__label">Nhịp tim trung bình hôm nay</p>
                  {summary.data.heartRate ? (
                    <p className="metric__value">
                      {Math.round(summary.data.heartRate.avg)} bpm
                      <span className="metric__sub">
                        thấp {Math.round(summary.data.heartRate.min)} – cao{' '}
                        {Math.round(summary.data.heartRate.max)} ·{' '}
                        {summary.data.heartRate.validSamples} lần đo hợp lệ
                      </span>
                    </p>
                  ) : (
                    <p className="metric__value">Chưa có lần đo nhịp tim hợp lệ hôm nay</p>
                  )}
                </div>
                <div className="metric">
                  <p className="metric__label">Vận động</p>
                  <p className="metric__value">
                    {summary.data.steps.total} bước
                    <span className="metric__sub">
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
              </div>
              <div className="dashboard-summary__footer">
                <p className="metric-line">
                  {summary.data.lastSeenAt
                    ? `Dữ liệu mới nhất ${formatRelativeTime(summary.data.lastSeenAt)}`
                    : 'Chưa nhận dữ liệu từ thiết bị'}
                  {' · '}dữ liệu nhận được {summary.data.coverage.percent}% (
                  {summary.data.coverage.observedCount} lần nhận)
                  {summary.data.gaps.length > 0
                    ? ` · ${summary.data.gaps.length} khoảng thiếu dữ liệu`
                    : ''}
                </p>
                <Link to="/app/history">Xem lịch sử và biểu đồ →</Link>
              </div>
            </Card>
          ) : null}
        </section>

        <aside className="dashboard__aside" aria-labelledby="device-status-heading">
          <div className="dashboard-section-head">
            <h2 id="device-status-heading" className="section-title">
              Thiết bị
            </h2>
            <Link to="/app/devices" className="dashboard-section-head__link">
              Quản lý
            </Link>
          </div>
          {status.isPending ? <RegionLoading label="Đang tải trạng thái thiết bị…" /> : null}
          {status.isError ? (
            <RegionError
              title="Không tải được trạng thái thiết bị"
              error={status.error}
              onRetry={() => void status.refetch()}
            />
          ) : null}
          {healthDataHidden ? (
            <Alert tone="info" title={MEASUREMENTS_NOT_SHARED_TITLE}>
              <p>{MEASUREMENTS_NOT_SHARED_TEXT}</p>
            </Alert>
          ) : null}
          {status.data ? (
            status.data.devices.length ? (
              status.data.devices.map((device) => (
                <Card key={device.deviceId} className="device-status-card">
                  <div className="device-status-card__head">
                    <p className="device-status-card__name">{device.label || device.serial}</p>
                    <StatusPill tone={FRESHNESS_TONES[device.freshness]}>
                      {FRESHNESS_LABELS[device.freshness]}
                    </StatusPill>
                  </div>
                  <dl className="status-list">
                    <div>
                      <dt>Kết nối</dt>
                      <dd>
                        {device.lastSeenAt
                          ? `lần nhận cuối ${formatRelativeTime(device.lastSeenAt)}`
                          : 'chưa từng kết nối'}
                      </dd>
                    </div>
                    {device.healthDataVisible === false ? null : (
                      <>
                        <div>
                          <dt>Pin</dt>
                          <dd>
                            {device.batteryPercent !== null
                              ? `${device.batteryPercent}%`
                              : 'chưa có thông tin'}
                          </dd>
                        </div>
                        <div>
                          <dt>Lần đo gần nhất</dt>
                          <dd>
                            {device.lastMeasuredAt
                              ? formatDateTime(device.lastMeasuredAt)
                              : 'chưa có dữ liệu'}
                          </dd>
                        </div>
                      </>
                    )}
                  </dl>
                </Card>
              ))
            ) : (
              <Card>
                <p>
                  Chưa gắn thiết bị nào cho hồ sơ này.{' '}
                  <Link to="/app/devices">Gắn thiết bị</Link> để bắt đầu nhận dữ liệu.
                </p>
              </Card>
            )
          ) : null}
        </aside>
      </div>

      <RecentInsightsCard subjectId={subjectId} />
    </div>
  );
}
