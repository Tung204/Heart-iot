import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, ButtonLink } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { PageLoader } from '../../components/PageLoader';
import { formatDateTime, formatDayKey } from '../../lib/format';
import { getApiErrorMessage, isApiError } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { useActiveSubject } from '../subjects/selection';
import { useSubjects } from '../subjects/useSubjects';
import { fetchVisitReport } from './report-api';
import './report.css';

function isForbiddenError(error: unknown): boolean {
  return isApiError(error) && (error.status === 403 || error.code === 'FORBIDDEN');
}

function isValidationError(error: unknown): boolean {
  return isApiError(error) && (error.status === 422 || error.code === 'VALIDATION_FAILED');
}

/** Số nguyên có dấu phân cách nhóm theo vi-VN — chỉ để đọc, không đổi giá trị. */
const NUMBER_FORMAT = new Intl.NumberFormat('vi-VN');
const DECIMAL_FORMAT = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

/**
 * `/app/history/report` — phiếu theo dõi sức khỏe 1 trang A4 (FR-16 + FR-22).
 *
 * - Vào từ Lịch sử đo, giữ `from`/`to` đang xem (ngày địa phương YYYY-MM-DD).
 * - Chỉ gọi API khi có hồ sơ và `canViewMeasurements`; 403/422 hiện câu nghiệp
 *   vụ + đường về, không mời thử lại vô ích.
 * - In bằng `window.print()` và print CSS; không thêm thư viện PDF.
 * - Chỉ nêu số liệu + ngày, không kết luận y khoa; nhãn mô phỏng và disclaimer
 *   lấy nguyên văn từ API/hợp đồng.
 */
export function VisitReportPage() {
  const subjects = useSubjects();
  const activeSubject = useActiveSubject(subjects.data);
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from') ?? undefined;
  const to = searchParams.get('to') ?? undefined;

  const canView = activeSubject
    ? activeSubject.role === 'owner' || activeSubject.permissions.canViewMeasurements !== false
    : false;

  const report = useQuery({
    queryKey: activeSubject
      ? queryKeys.visitReport(activeSubject.id, { from, to })
      : (['subjects', 'none', 'visit-report', from ?? '', to ?? ''] as const),
    queryFn: ({ signal }) =>
      activeSubject
        ? fetchVisitReport(activeSubject.id, { from, to }, signal)
        : Promise.resolve(null),
    enabled: Boolean(activeSubject) && canView,
    staleTime: 30_000,
  });

  const backLink = (
    <Link to="/app/history" className="button button--subtle button--sm report-back">
      ← Lịch sử đo
    </Link>
  );

  if (subjects.isPending) {
    return (
      <div className="stack report-page">
        <PageHeader title="Phiếu theo dõi sức khỏe" breadcrumb={backLink} />
        <PageLoader label="Đang tải hồ sơ…" />
      </div>
    );
  }

  if (subjects.isError) {
    return (
      <div className="stack report-page">
        <PageHeader title="Phiếu theo dõi sức khỏe" breadcrumb={backLink} />
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
      <div className="stack report-page">
        <PageHeader title="Phiếu theo dõi sức khỏe" breadcrumb={backLink} />
        <EmptyState
          title="Chưa có hồ sơ để tạo phiếu"
          description="Tạo hồ sơ cho người cần theo dõi hoặc chọn hồ sơ ở đầu trang."
          action={<ButtonLink to="/app/subjects">Tạo hồ sơ</ButtonLink>}
        />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="stack report-page">
        <PageHeader title="Phiếu theo dõi sức khỏe" breadcrumb={backLink} />
        <EmptyState
          title="Chủ hồ sơ không chia sẻ số đo"
          description="Bạn chưa được xem số đo của hồ sơ này nên không tạo được phiếu theo dõi. Liên hệ chủ hồ sơ nếu cần."
          action={<ButtonLink to="/app/history">← Lịch sử đo</ButtonLink>}
        />
      </div>
    );
  }

  if (report.isPending) {
    return (
      <div className="stack report-page">
        <PageHeader title="Phiếu theo dõi sức khỏe" breadcrumb={backLink} />
        <PageLoader label="Đang tạo phiếu…" />
      </div>
    );
  }

  if (report.isError) {
    const forbidden = isForbiddenError(report.error);
    const validation = isValidationError(report.error);
    return (
      <div className="stack report-page">
        <PageHeader title="Phiếu theo dõi sức khỏe" breadcrumb={backLink} />
        <EmptyState
          title={
            forbidden
              ? 'Bạn không có quyền xem phiếu này'
              : validation
                ? 'Không tạo được phiếu cho khoảng ngày này'
                : 'Không tạo được phiếu'
          }
          description={getApiErrorMessage(
            report.error,
            'Kiểm tra kết nối với máy chủ và thử lại.',
          )}
          action={<ButtonLink to="/app/history">← Lịch sử đo</ButtonLink>}
        />
      </div>
    );
  }

  const data = report.data;
  if (!data) return null;

  const hr = data.summary.heartRate;
  const steps = data.summary.steps;
  const latestIncident = data.incidents.items
    .map((item) => item.detectedAt)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  return (
    <div className="stack report-page">
      <PageHeader
        title="Phiếu theo dõi sức khỏe"
        breadcrumb={backLink}
        actions={
          <div className="report-actions">
            <Button onClick={() => window.print()}>In / Lưu PDF</Button>
          </div>
        }
      />

      <article className="report-sheet" aria-labelledby="report-sheet-heading">
        <header className="report-sheet__head">
          <div>
            <p className="report-sheet__label">Hồ sơ</p>
            <h2 id="report-sheet-heading" className="report-sheet__subject">
              {data.subject.displayName}
            </h2>
          </div>
          <dl className="report-sheet__facts">
            <div>
              <dt>Kỳ báo cáo</dt>
              <dd>
                {formatDayKey(data.period.from)} – {formatDayKey(data.period.to)} ·{' '}
                {data.period.days} ngày
              </dd>
            </div>
            <div>
              <dt>Ngày xuất</dt>
              <dd>{formatDateTime(data.generatedAt)}</dd>
            </div>
          </dl>
        </header>

        {data.simulated ? (
          <p className="report-simulated" role="note">
            Dữ liệu mô phỏng
          </p>
        ) : null}

        <section className="report-section" aria-labelledby="report-summary-heading">
          <h2 id="report-summary-heading" className="report-section__title">
            Tổng hợp trong kỳ
          </h2>
          <dl className="report-metrics">
            <div className="report-metric">
              <dt>Số mẫu đo</dt>
              <dd>{NUMBER_FORMAT.format(data.summary.measurementCount)}</dd>
              <p className="report-metric__note">{data.summary.daysWithData} ngày có dữ liệu</p>
            </div>
            <div className="report-metric">
              <dt>Độ phủ dữ liệu</dt>
              <dd>{DECIMAL_FORMAT.format(data.summary.coveragePercent)}%</dd>
              <p className="report-metric__note">
                {data.summary.daysWithData}/{data.period.days} ngày có mẫu
              </p>
            </div>
            <div className="report-metric">
              <dt>Nhịp tim trung bình</dt>
              <dd>{hr ? `${Math.round(hr.avg)} bpm` : 'Chưa có dữ liệu'}</dd>
              <p className="report-metric__note">
                {hr
                  ? `Thấp nhất ${hr.min} · cao nhất ${hr.max} bpm`
                  : 'Không có mẫu nhịp tim hợp lệ trong kỳ'}
              </p>
            </div>
            <div className="report-metric">
              <dt>Tổng bước chân</dt>
              <dd>{steps ? NUMBER_FORMAT.format(steps.total) : 'Chưa có dữ liệu'}</dd>
              <p className="report-metric__note">
                {steps
                  ? `Trung bình ${DECIMAL_FORMAT.format(steps.avgPerDay)} bước/ngày`
                  : 'Không có dữ liệu bước trong kỳ'}
              </p>
            </div>
          </dl>
        </section>

        <div className="report-columns">
          <section className="report-section" aria-labelledby="report-gaps-heading">
            <h2 id="report-gaps-heading" className="report-section__title">
              Khoảng thiếu dữ liệu
            </h2>
            {data.summary.gaps.length === 0 ? (
              <p className="report-note">Không ghi nhận khoảng thiếu từ 6 giờ trong kỳ.</p>
            ) : (
              <ul className="report-list">
                {data.summary.gaps.map((gap) => (
                  <li key={`${gap.from}-${gap.to}`}>
                    {formatDateTime(gap.from)} → {formatDateTime(gap.to)} ·{' '}
                    {DECIMAL_FORMAT.format(gap.hours)} giờ
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="report-section" aria-labelledby="report-incidents-heading">
            <h2 id="report-incidents-heading" className="report-section__title">
              Cảnh báo ngã / SOS
            </h2>
            <dl className="report-facts">
              <div>
                <dt>Ngã</dt>
                <dd>{data.incidents.falls}</dd>
              </div>
              <div>
                <dt>SOS</dt>
                <dd>{data.incidents.sos}</dd>
              </div>
              <div>
                <dt>Đang mở</dt>
                <dd>{data.incidents.open}</dd>
              </div>
            </dl>
            <p className="report-note">
              {latestIncident
                ? `Mốc gần nhất: ${formatDateTime(latestIncident)}.`
                : 'Không ghi nhận cảnh báo ngã/SOS trong kỳ.'}
            </p>
          </section>
        </div>

        <section className="report-section" aria-labelledby="report-attention-heading">
          <h2 id="report-attention-heading" className="report-section__title">
            Điểm chú ý
          </h2>
          <p className="report-note report-note--emphasis">
            Chỉ nêu số liệu, không phải kết luận y khoa.
          </p>
          {data.attentionPoints.length === 0 ? (
            <p className="report-note">Không có điểm chú ý trong kỳ.</p>
          ) : (
            <ol className="report-attention">
              {data.attentionPoints.map((point, index) => (
                <li key={`${point.date}-${point.label}-${index}`}>
                  <p className="report-attention__title">
                    <strong>{point.label}</strong> · {formatDayKey(point.date)}
                  </p>
                  <p className="report-attention__detail">{point.detail}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <footer className="report-sheet__foot">
          <p>{data.disclaimer}</p>
          <p className="report-sheet__stamp">
            Xuất lúc {formatDateTime(data.generatedAt)} · {data.subject.timezone}
          </p>
        </footer>
      </article>
    </div>
  );
}
