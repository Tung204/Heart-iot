import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '../../components/Alert';
import { ButtonLink } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { formatDateTime } from '../../lib/format';
import { getApiErrorMessage } from '../../lib/api';
import { useSubjects } from '../subjects/useSubjects';
import { fetchViewData, fetchWorkspaceView, studioQueryKeys } from './api';
import { SCOPE_LABELS, shortDigest } from './labels';
import { DataModeBadge, WidgetPreview } from './widgets';

/**
 * /app/studio/:id/data — render bản ĐÃ CÔNG BỐ với dữ liệu thật (sample luôn false).
 * View chưa công bố → thông báo rõ, không giả lập dữ liệu.
 * Scope user/global cần chọn hồ sơ có quyền (query subjectId); scope subject
 * mặc định dùng subjectId của view.
 */
export function StudioViewDataPage() {
  const { id = '' } = useParams();
  const subjects = useSubjects();

  const view = useQuery({
    queryKey: studioQueryKeys.view(id),
    queryFn: ({ signal }) => fetchWorkspaceView(id, signal),
    enabled: Boolean(id),
  });

  const defaultSubjectId = view.data?.scope === 'subject' ? view.data.subjectId ?? '' : '';
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const effectiveSubjectId = selectedSubjectId ?? defaultSubjectId;

  const published = Boolean(view.data?.currentPublication);

  const data = useQuery({
    queryKey: studioQueryKeys.viewData(id, effectiveSubjectId),
    queryFn: ({ signal }) => fetchViewData(id, effectiveSubjectId || null, signal),
    enabled: Boolean(id) && published && Boolean(effectiveSubjectId),
    staleTime: 15_000,
  });

  if (view.isPending) return <PageLoader label="Đang tải view…" />;
  if (view.isError) {
    return (
      <ErrorState
        title="Không tải được view"
        message={getApiErrorMessage(view.error)}
        onRetry={() => void view.refetch()}
      />
    );
  }
  const viewData = view.data;
  if (!viewData) return null;

  if (!published) {
    return (
      <div className="stack">
        <header>
          <h1 className="page-title">{viewData.name}</h1>
        </header>
        <EmptyState
          title="View chưa được công bố"
          description="Không có bản công bố để hiển thị dữ liệu thật. Xem trước bản nháp rồi công bố ở trang quản lý view."
          action={<ButtonLink to={`/app/studio/${id}`}>Mở trang quản lý</ButtonLink>}
        />
      </div>
    );
  }

  const needsSubjectPick = !effectiveSubjectId;
  const scopeLacksSubject = viewData.scope === 'subject' && !effectiveSubjectId;

  return (
    <div className="stack">
      <header>
        <h1 className="page-title">{viewData.name}</h1>
        <p className="page-lead">
          Key <strong>{viewData.key}</strong>
          <StatusPill tone="neutral" className="studio-datamode">
            {SCOPE_LABELS[viewData.scope]}
          </StatusPill>
          <span className="studio-datamode">
            Bản công bố r{viewData.currentPublication?.revision} (
            {shortDigest(viewData.currentPublication?.digest ?? '')})
          </span>
        </p>
      </header>

      <div className="studio-actions-row">
        <Link to={`/app/studio/${id}`} className="button button--subtle button--sm">
          Về trang quản lý
        </Link>
      </div>

      {viewData.scope !== 'subject' ? (
        <div className="field">
          <label className="field__label" htmlFor="data-subject">
            Hồ sơ dữ liệu
          </label>
          <select
            id="data-subject"
            className="field__input"
            value={effectiveSubjectId}
            onChange={(event) => setSelectedSubjectId(event.target.value)}
          >
            <option value="">— Chọn hồ sơ —</option>
            {(subjects.data ?? []).map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.displayName}
              </option>
            ))}
          </select>
          {needsSubjectPick ? (
            <p className="field__hint">
              View cá nhân/toàn hệ thống cần chọn hồ sơ để lấy dữ liệu (chỉ hồ sơ bạn có quyền xem).
            </p>
          ) : null}
        </div>
      ) : null}

      {needsSubjectPick ? (
        scopeLacksSubject ? (
          <Alert tone="warning" title="View chưa gắn hồ sơ">
            View theo hồ sơ này không có hồ sơ kèm theo — không lấy được dữ liệu để hiển thị.
          </Alert>
        ) : (
          <Alert tone="info" title="Chưa chọn hồ sơ">
            Chọn hồ sơ ở trên để tải dữ liệu của view này.
          </Alert>
        )
      ) : null}

      {!needsSubjectPick && data.isPending ? (
        <PageLoader label="Đang tải dữ liệu view…" />
      ) : null}
      {!needsSubjectPick && data.isError ? (
        <ErrorState
          title="Không tải được dữ liệu view"
          message={getApiErrorMessage(data.error)}
          onRetry={() => void data.refetch()}
        />
      ) : null}
      {data.data ? (
        <Card description={`Kiểm tra lúc ${formatDateTime(data.data.checkedAt)} · digest ${shortDigest(data.data.digest)}`}>
          <DataModeBadge sample={data.data.data.sample} subjectName={data.data.data.subject?.displayName} />
          <div className="studio-preview" style={{ marginTop: '1rem' }}>
            <WidgetPreview config={data.data.config} data={data.data.data} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
