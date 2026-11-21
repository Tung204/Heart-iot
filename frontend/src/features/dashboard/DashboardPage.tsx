import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import { Alert } from '../../components/Alert';
import { Button, ButtonLink } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { formatDateTime, formatRelativeTime, todayInTimeZone } from '../../lib/format';
import { getApiErrorMessage, isApiError } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { useMe } from '../auth/useAuth';
import { RecentInsightsCard } from '../insights/RecentInsightsCard';
import { useActiveSubject } from '../subjects/selection';
import { useSubjects } from '../subjects/useSubjects';
import { fetchDailySummary, fetchOpenAlerts, fetchSubjectStatus } from './api';
import '../../styles/health.css';

const FRESHNESS_LABELS = {
  live: 'Trực tuyến',
  stale: 'Chưa cập nhật gần đây',
  offline: 'Ngoại tuyến',
  never: 'Chưa từng kết nối',
} as const;

/**
 * Freshness là tình trạng kết nối, không phải kết luận sức khỏe:
 * live dùng success (kết nối đã xác nhận), còn lại dùng cảnh báo trung tính.
 */
const FRESHNESS_TONES = {
  live: 'success',
  stale: 'warning',
  offline: 'warning',
  never: 'neutral',
} as const;

/** 403 là trạng thái quyền, không phải lỗi kỹ thuật: hiển thị thông điệp nghiệp vụ. */
function isForbiddenError(error: unknown): boolean {
  return isApiError(error) && (error.status === 403 || error.code === 'FORBIDDEN');
}

const MEASUREMENTS_NOT_SHARED_TITLE = 'Chủ hồ sơ không chia sẻ số đo';
const MEASUREMENTS_NOT_SHARED_TEXT =
  'Chủ hồ sơ không chia sẻ số đo và lịch sử với bạn. Cảnh báo đang mở vẫn hiển thị ở trên nếu bạn có quyền nhận cảnh báo.';

/** `YYYY-MM-DD` là ngày theo timezone hồ sơ — đổi sang dd/mm/yyyy không qua Date để không lệch múi giờ. */
function formatDayParts(date: string): string {
  const [year = '', month = '', day = ''] = date.split('-');
  return `${day}/${month}/${year}`;
}

/** Loading cục bộ của một vùng: không chiếm cả trang, không ghi số khi chưa có dữ liệu. */
function RegionLoading({ label }: { label: string }) {
  return (
    <p className="health-region__loading" role="status" aria-busy="true">
      {label}
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
      <div className="health-region__action">
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Thử lại
        </Button>
      </div>
    </Alert>
  );
}

/**
 * /app/overview — Sức khỏe của hồ sơ đang xem.
 * Thứ tự: H1 + Lịch sử đo → cảnh báo đang mở (vùng độc lập) → dữ liệu ngày →
 * xu hướng 7/14/30 → kết nối thiết bị.
 * - Cảnh báo không chờ daily-summary/AI: vùng alerts có loading/error riêng.
 * - Biết trước không có quyền số đo thì KHÔNG gọi daily-summary/insights, không
 *   hiện link lịch sử/CSV; chỉ còn vùng quyền + cảnh báo.
 * - Không hiện số 0 giả: thiếu dữ liệu ghi rõ chưa có; pin null là chưa biết.
 * - Nguồn mô phỏng và độ phủ/khoảng thiếu nằm ngay cạnh khối số liệu.
 */
export function DashboardPage() {
  const me = useMe();
  const subjects = useSubjects();
  const activeSubject = useActiveSubject(subjects.data);

  const subjectId = activeSubject?.id ?? null;
  const timezone = activeSubject?.timezone ?? 'Asia/Ho_Chi_Minh';
  const today = todayInTimeZone(timezone);
  // Link cũ thiếu `canViewMeasurements` được hiểu là `true` (server đã chuẩn hóa).
  const canViewMeasurements = activeSubject
    ? activeSubject.permissions.canViewMeasurements !== false
    : false;
  // Quyền nhận cảnh báo: chủ hồ sơ luôn nhận; người thân cần cờ `canReceiveAlerts`.
  // Thiếu quyền là trạng thái nghiệp vụ, không phải lỗi: không gọi `/alerts`.
  const canReceiveAlerts = activeSubject
    ? activeSubject.role === 'owner' || activeSubject.permissions.canReceiveAlerts === true
    : false;

  const status = useQuery({
    queryKey: subjectId ? queryKeys.subjectStatus(subjectId) : ['subjects', 'none', 'status'],
    queryFn: ({ signal }) => (subjectId ? fetchSubjectStatus(subjectId, signal) : null),
    enabled: Boolean(subjectId),
    staleTime: 15_000,
  });

  // Số đo: chỉ hỏi khi người xem thực sự có quyền, tránh request chắc chắn 403.
  const summary = useQuery({
    queryKey: subjectId
      ? queryKeys.dailySummary(subjectId, today)
      : ['subjects', 'none', 'daily-summary', today],
    queryFn: ({ signal }) => (subjectId ? fetchDailySummary(subjectId, today, signal) : null),
    enabled: Boolean(subjectId) && canViewMeasurements,
    staleTime: 30_000,
  });

  // Cảnh báo là thông tin an toàn: query độc lập với mọi vùng dữ liệu sức khỏe,
  // nhưng chỉ hỏi khi người xem có quyền nhận cảnh báo (tránh request chắc chắn 403).
  const openAlerts = useQuery({
    queryKey: subjectId
      ? queryKeys.dashboardOpenAlerts(subjectId)
      : ['subjects', 'none', 'alerts', 'dashboard'],
    queryFn: ({ signal }) => (subjectId ? fetchOpenAlerts(subjectId, 20, signal) : null),
    enabled: Boolean(subjectId) && canReceiveAlerts,
    staleTime: 15_000,
  });

  // Admin không theo dõi hồ sơ nào thì vào thẳng trang quản trị thay vì dashboard trống.
  if (me.data?.user.role === 'admin' && subjects.data && subjects.data.length === 0) {
    return <Navigate to="/app/admin" replace />;
  }

  if (subjects.isPending) {
    return (
      <div className="stack health-page">
        <PageHeader title="Sức khỏe" />
        <PageLoader label="Đang tải hồ sơ…" />
      </div>
    );
  }

  if (subjects.isError) {
    return (
      <div className="stack health-page">
        <PageHeader title="Sức khỏe" />
        <Alert tone="error" title="Không tải được danh sách hồ sơ">
          <p>{getApiErrorMessage(subjects.error)} Kiểm tra kết nối và thử lại.</p>
          <div className="health-region__action">
            <Button variant="secondary" size="sm" onClick={() => void subjects.refetch()}>
              Thử lại
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  if (!activeSubject) {
    return (
      <div className="stack health-page">
        <PageHeader title="Sức khỏe" />
        <EmptyState
          title="Chưa có hồ sơ nào"
          description="Tạo hồ sơ cho người cần theo dõi để bắt đầu nhận dữ liệu và mời người thân cùng xem."
          action={<ButtonLink to="/app/subjects">Tạo hồ sơ</ButtonLink>}
        />
      </div>
    );
  }

  const alertItems = openAlerts.data?.items ?? [];
  // Server trả `healthDataVisible=false` khi chủ hồ sơ không chia sẻ quyền xem số đo:
  // các trường số đo bị ẩn, không hiển thị như “chưa có mẫu”.
  const healthDataHidden =
    status.data?.devices.some((device) => device.healthDataVisible === false) ?? false;
  const measurementsBlocked = !canViewMeasurements || isForbiddenError(summary.error);

  return (
    <div className="stack health-page">
      <PageHeader
        title="Sức khỏe"
        breadcrumb={
          <Link to="/app" className="button button--subtle button--sm health-back health-back--today">
            ← Hôm nay
          </Link>
        }
        actions={
          canViewMeasurements ? (
            <ButtonLink to="/app/history" variant="secondary">
              Lịch sử đo
            </ButtonLink>
          ) : null
        }
      />

      {/* Vùng cảnh báo KHÔNG phụ thuộc status/daily-summary/insights. */}
      <section className="health-alerts" aria-labelledby="open-alerts-heading">
        <div className="health-region__head">
          <h2 id="open-alerts-heading" className="health-region__title">
            Cảnh báo đang mở
          </h2>
          {alertItems.length > 0 ? (
            <StatusPill tone="danger">{alertItems.length} cần chú ý</StatusPill>
          ) : canReceiveAlerts && openAlerts.isSuccess ? (
            <StatusPill tone="neutral">Không có cảnh báo</StatusPill>
          ) : null}
        </div>

        {!canReceiveAlerts ? (
          <p className="health-note">Chủ hồ sơ không chia sẻ cảnh báo với bạn.</p>
        ) : (
          <>
            {openAlerts.isPending ? <RegionLoading label="Đang tải cảnh báo đang mở…" /> : null}
            {openAlerts.isError ? (
              <RegionError
                title="Không tải được cảnh báo đang mở"
                error={openAlerts.error}
                onRetry={() => void openAlerts.refetch()}
              />
            ) : null}

            {alertItems.length > 0 ? (
              <ul className="health-rows">
                {alertItems.map((item) => (
                  <li key={item.id} className="health-row health-row--alert">
                    <div className="health-row__main">
                      <p className="health-row__title">
                        <Link to={`/app/alerts/${item.id}`}>
                          {item.type === 'sos' ? 'Yêu cầu trợ giúp' : 'Nghi ngã'} — cần chú ý
                        </Link>
                      </p>
                      <p className="health-row__meta">
                        <StatusPill tone={item.state === 'acknowledged' ? 'warning' : 'danger'}>
                          {item.state === 'acknowledged' ? 'Đã xác nhận' : 'Đang mở'}
                        </StatusPill>{' '}
                        Phát hiện {formatDateTime(item.detectedAt)} ·{' '}
                        {item.acknowledgedBy
                          ? `đã xác nhận bởi ${item.acknowledgedBy.displayName}`
                          : 'chưa có người xác nhận'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : openAlerts.isSuccess ? (
              <p className="health-note">
                Không có cảnh báo nào cần xử lý. Cảnh báo mới sẽ xuất hiện tại đây khi trang
                đang mở.
              </p>
            ) : null}

            <ButtonLink to="/app/alerts" variant="subtle" size="sm" className="health-more">
              Xem tất cả cảnh báo →
            </ButtonLink>
          </>
        )}
      </section>

      <div className="health-layout">
        <div className="health-layout__main">
          <section className="health-region" aria-labelledby="daily-summary-heading">
            <div className="health-region__head">
              <h2 id="daily-summary-heading" className="health-region__title">
                Tổng hợp hôm nay
              </h2>
            </div>

            {measurementsBlocked ? (
              <Alert tone="info" title={MEASUREMENTS_NOT_SHARED_TITLE}>
                <p>{MEASUREMENTS_NOT_SHARED_TEXT}</p>
              </Alert>
            ) : null}

            {!measurementsBlocked && summary.isPending ? (
              <RegionLoading label="Đang tải dữ liệu tổng quan…" />
            ) : null}
            {!measurementsBlocked && summary.isError ? (
              <RegionError
                title="Không tải được dữ liệu tổng quan"
                error={summary.error}
                onRetry={() => void summary.refetch()}
              />
            ) : null}

            {!measurementsBlocked && summary.data ? (
              <>
                <dl className="health-day">
                  <div className="health-day__cell">
                    <dt className="health-day__label">Nhịp tim trung bình</dt>
                    {summary.data.heartRate ? (
                      <>
                        <dd className="health-day__value">
                          {`${Math.round(summary.data.heartRate.avg)} bpm`}
                        </dd>
                        <dd className="health-day__sub">
                          thấp {Math.round(summary.data.heartRate.min)} – cao{' '}
                          {Math.round(summary.data.heartRate.max)} ·{' '}
                          {summary.data.heartRate.validSamples} lần đo hợp lệ
                        </dd>
                      </>
                    ) : (
                      <dd className="health-day__value health-day__value--missing">
                        Chưa có lần đo nhịp tim hợp lệ hôm nay
                      </dd>
                    )}
                  </div>

                  <div className="health-day__cell">
                    <dt className="health-day__label">Vận động</dt>
                    {summary.data.steps.completeness === 'unavailable' ? (
                      <>
                        <dd className="health-day__value health-day__value--missing">—</dd>
                        <dd className="health-day__sub">chưa đủ dữ liệu bước</dd>
                      </>
                    ) : (
                      <>
                        <dd className="health-day__value health-day__value--secondary">
                          {`${summary.data.steps.total} bước`}
                        </dd>
                        <dd className="health-day__sub">
                          {summary.data.steps.completeness === 'complete'
                            ? 'đủ dữ liệu'
                            : 'dữ liệu một phần'}
                        </dd>
                      </>
                    )}
                  </div>

                  <div className="health-day__cell">
                    <dt className="health-day__label">Pin</dt>
                    <dd className="health-day__value">
                      {summary.data.batteryPercent !== null ? (
                        `${summary.data.batteryPercent}%`
                      ) : (
                        <span className="health-day__value--missing">Chưa có thông tin pin</span>
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="health-region__foot">
                  <p className="health-coverage">
                    <span className="health-coverage__meta">
                      Ngày {formatDayParts(today)} theo giờ hồ sơ
                    </span>
                    {summary.data.source === 'synthetic' ? (
                      <>
                        {' · '}
                        <StatusPill tone="warning">Nguồn: dữ liệu mô phỏng</StatusPill>
                      </>
                    ) : null}
                    <br />
                    {summary.data.lastSeenAt
                      ? `Dữ liệu mới nhất ${formatRelativeTime(summary.data.lastSeenAt)} (${formatDateTime(summary.data.lastSeenAt)})`
                      : 'Chưa nhận dữ liệu từ thiết bị'}
                    {' · '}độ phủ {summary.data.coverage.percent}% (
                    {summary.data.coverage.observedCount} lần nhận)
                    {summary.data.gaps.length > 0
                      ? ` · ${summary.data.gaps.length} khoảng thiếu dữ liệu`
                      : ' · không có khoảng thiếu'}
                    .
                  </p>
                  <ButtonLink to="/app/history" variant="subtle" size="sm">
                    Xem lịch sử và biểu đồ →
                  </ButtonLink>
                </div>
              </>
            ) : null}
          </section>

          {!measurementsBlocked ? <RecentInsightsCard subjectId={subjectId} /> : null}
        </div>

        <aside className="health-layout__aside" aria-labelledby="device-status-heading">
          <div className="health-region__head">
            <h2 id="device-status-heading" className="health-region__title">
              Thiết bị
            </h2>
            <ButtonLink to="/app/devices" variant="subtle" size="sm">
              Quản lý
            </ButtonLink>
          </div>

          {status.isPending ? <RegionLoading label="Đang tải trạng thái thiết bị…" /> : null}
          {status.isError ? (
            <RegionError
              title="Không tải được trạng thái thiết bị"
              error={status.error}
              onRetry={() => void status.refetch()}
            />
          ) : null}

          {status.data ? (
            status.data.devices.length ? (
              <ul className="health-devices">
                {status.data.devices.map((device) => {
                  const hidden = device.healthDataVisible === false || !canViewMeasurements;
                  return (
                    <li key={device.deviceId} className="health-device">
                      <div className="health-device__head">
                        <p className="health-device__name">{device.label || device.serial}</p>
                        <StatusPill tone={FRESHNESS_TONES[device.freshness]}>
                          {FRESHNESS_LABELS[device.freshness]}
                        </StatusPill>
                      </div>
                      <dl className="health-kv">
                        <div>
                          <dt>Kết nối</dt>
                          <dd>
                            {device.lastSeenAt
                              ? `lần nhận cuối ${formatRelativeTime(device.lastSeenAt)}`
                              : device.healthDataVisible === false
                                ? 'mốc kết nối ẩn theo quyền chia sẻ'
                                : 'chưa từng kết nối'}
                          </dd>
                        </div>
                        <div>
                          <dt>Pin</dt>
                          <dd>
                            {device.batteryPercent !== null
                              ? `${device.batteryPercent}%`
                              : 'chưa có thông tin'}
                          </dd>
                        </div>
                        {hidden ? (
                          <div>
                            <dt>Số đo</dt>
                            <dd>Không được xem số đo của thiết bị này</dd>
                          </div>
                        ) : (
                          <div>
                            <dt>Lần đo gần nhất</dt>
                            <dd>
                              {device.lastMeasuredAt
                                ? formatDateTime(device.lastMeasuredAt)
                                : 'chưa có dữ liệu'}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="health-note">
                Chưa gắn thiết bị nào cho hồ sơ này. <Link to="/app/devices">Gắn thiết bị</Link> để
                bắt đầu nhận dữ liệu.
              </p>
            )
          ) : null}
          {healthDataHidden ? (
            <p className="health-note">
              Số đo của thiết bị đang được ẩn theo quyền chia sẻ của chủ hồ sơ.
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
