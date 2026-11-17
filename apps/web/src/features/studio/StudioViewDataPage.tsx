import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '../../components/Alert';
import { ButtonLink } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { PageHeader } from '../../components/PageHeader';
import { StatusPill } from '../../components/StatusPill';
import { formatDateTime } from '../../lib/format';
import { getApiErrorMessage } from '../../lib/api';
import { useSubjects } from '../subjects/useSubjects';
import { fetchViewData, fetchWorkspaceView, studioQueryKeys } from './api';
import { SCOPE_LABELS, shortDigest } from './labels';
import { DataModeBadge, WidgetPreview } from './widgets';
import '../../styles/studio.css';

/**
 * /app/studio/:id/data — render **bản công bố đang hoạt động**.
 * API chỉ trả publication active, không trả draft config; draft chỉ xem qua
 * “Xem trước” ở trang quản lý, có nhãn riêng. View chưa công bố → thông báo rõ,
 * không lấp bằng dữ liệu mẫu.
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

  const breadcrumb = (
    <nav className="studio-breadcrumb" aria-label="Đường dẫn">
      <Link to="/app">Về Hôm nay</Link>
      <span aria-hidden="true">›</span>
      <Link to="/app/studio">Studio</Link>
      <span aria-hidden="true">›</span>
      <Link to={`/app/studio/${id}`}>{viewData.name}</Link>
    </nav>
  );

  if (!published) {
    return (
      <div className="studio-page">
        {breadcrumb}
        <PageHeader title={viewData.name} />
        <EmptyState
          title="View chưa được công bố"
          description="Không có bản công bố để hiển thị dữ liệu của hồ sơ. Xem trước bản nháp rồi công bố ở trang quản lý view."
          action={<ButtonLink to={`/app/studio/${id}`}>Mở trang quản lý</ButtonLink>}
        />
      </div>
    );
  }

  const needsSubjectPick = !effectiveSubjectId;
  const scopeLacksSubject = viewData.scope === 'subject' && !effectiveSubjectId;

  // Ưu tiên publication trong chính response dữ liệu: đó là bản mà config/digest
  // đang render, nên revision + digest trên trang luôn khớp payload.
  const dataPublication = data.data?.view.currentPublication ?? null;
  const publication = dataPublication ?? viewData.currentPublication;
  const publicationDigest = data.data?.digest ?? viewData.currentPublication?.digest ?? '';
  const renderedRevision =
    data.data?.view.currentPublication?.revision ?? publication?.revision ?? null;

  // Owner/admin nhận draftDigest từ GET view. Khác digest bản công bố nghĩa là
  // có bản nháp chưa công bố (ví dụ sau rollback) — nêu rõ, không trộn vào trang này.
  const hasUnpublishedDraft = Boolean(
    viewData.draftDigest &&
      viewData.currentPublication &&
      viewData.draftDigest !== viewData.currentPublication.digest,
  );

  const summarySource = data.data?.data.summary?.source;
  const subjectName = data.data?.data.subject?.displayName;

  return (
    <div className="studio-page">
      {breadcrumb}
      <PageHeader
        title={viewData.name}
        actions={
          <ButtonLink to={`/app/studio/${id}`} variant="secondary">
            Về trang quản lý
          </ButtonLink>
        }
      />
      <p className="studio-meta-line">
        Key <code className="studio-mono">{viewData.key}</code>
        <StatusPill tone="neutral">{SCOPE_LABELS[viewData.scope]}</StatusPill>
      </p>

      <section className="studio-publication-band" aria-labelledby="data-publication-title">
        <h2 id="data-publication-title" className="studio-section-title">
          Bản công bố r{publication?.revision} ({shortDigest(publicationDigest)})
        </h2>
        <p className="studio-section-lead">
          {publication?.publishedAt ? `Công bố ${formatDateTime(publication.publishedAt)} · ` : ''}
          {data.data ? `kiểm ${formatDateTime(data.data.checkedAt)} · ` : ''}
          render theo bản công bố r{renderedRevision}
        </p>
      </section>

      {hasUnpublishedDraft ? (
        <Alert tone="info" title="Bản nháp hiện tại chưa được công bố">
          <p>
            Trang này chỉ hiển thị bản công bố đang hoạt động (r{publication?.revision}). Bản nháp đã lưu
            có nội dung khác — dùng “Xem trước” ở trang quản lý để xem bản nháp với dữ liệu hồ sơ, và công
            bố khi đã duyệt.
          </p>
          <div className="studio-inline-action">
            <ButtonLink to={`/app/studio/${id}`} variant="secondary" size="sm">
              Xem trước bản nháp
            </ButtonLink>
          </div>
        </Alert>
      ) : null}

      {viewData.scope !== 'subject' ? (
        <div className="field studio-subject-picker">
          <label className="field__label" htmlFor="data-subject">
            Dữ liệu của
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
        <Card>
          <div className="studio-data-head">
            <DataModeBadge
              sample={data.data.data.sample}
              subjectName={subjectName}
              synthetic={!data.data.data.sample && summarySource === 'synthetic'}
            />
            <span className="studio-datamode studio-datamode--note">
              Bản công bố r{renderedRevision} · kiểm {formatDateTime(data.data.checkedAt)}
            </span>
          </div>
          <div className="studio-preview">
            <WidgetPreview config={data.data.config} data={data.data.data} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
