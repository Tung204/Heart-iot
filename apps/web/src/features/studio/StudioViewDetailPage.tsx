import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PreviewResult, PublicationSummary, StudioWidget, ViewConfig } from '@heart-iot/contracts/studio';
import { canonicalConfigJson } from '@heart-iot/contracts/studio';
import { Alert } from '../../components/Alert';
import { Button, ButtonLink } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { PageHeader } from '../../components/PageHeader';
import { StatusPill } from '../../components/StatusPill';
import { TextField } from '../../components/Field';
import { formatDateTime } from '../../lib/format';
import { getApiErrorMessage, isApiError, isConflictError } from '../../lib/api';
import { useMe } from '../auth/useAuth';
import { SubjectContextLine } from '../subjects/SubjectSwitcher';
import { useSubjects } from '../subjects/useSubjects';
import {
  createPreview,
  fetchPublications,
  fetchWorkspaceView,
  publishView,
  rollbackView,
  studioQueryKeys,
  updateViewDraft,
} from './api';
import { emptyConfigFormErrors, nextWidgetId, validateConfigForm, type ConfigFormErrors } from './configForm';
import {
  PUBLICATION_STATUS_LABELS,
  PUBLICATION_STATUS_TONES,
  SCOPE_LABELS,
  VIEW_STATUS_LABELS,
  VIEW_STATUS_TONES,
  WIDGET_TYPE_LABELS,
  shortDigest,
} from './labels';
import { DataModeBadge, WidgetPreview } from './widgets';
import '../../styles/studio.css';

const MAX_WIDGETS = 12;

interface StaleDetails {
  currentDraftRevision?: unknown;
  currentDraftDigest?: unknown;
  currentBaseRevision?: unknown;
  currentRevision?: unknown;
}

function readStaleDetails(error: unknown): StaleDetails | null {
  if (isApiError(error) && error.details && typeof error.details === 'object') {
    return error.details as StaleDetails;
  }
  return null;
}

function staleLine(details: StaleDetails): string | null {
  const parts: string[] = [];
  if (details.currentDraftRevision !== undefined) parts.push(`draft hiện tại r${String(details.currentDraftRevision)}`);
  if (details.currentDraftDigest !== undefined) parts.push(`digest ${shortDigest(String(details.currentDraftDigest))}`);
  if (details.currentBaseRevision !== undefined) parts.push(`base r${String(details.currentBaseRevision)}`);
  if (details.currentRevision !== undefined) parts.push(`bản nền hiện tại r${String(details.currentRevision)}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * /app/studio/:id — soạn draft → xem trước → công bố → lịch sử/rollback.
 * - Config draft chỉ lấy được qua POST previews (GET view không trả config), nên
 *   trang tự preview (chế độ dữ liệu mẫu) để nạp config vào form soạn.
 * - Lưu draft là compare-and-set theo baseRevision; 409 → đề nghị tải lại, không ghi đè.
 * - Nút công bố chỉ bật sau khi preview thành công và draft không đổi từ lúc preview.
 * - 409 APPROVAL_STALE → hiện trạng thái hiện tại, không tự publish lại.
 */
export function StudioViewDetailPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const subjects = useSubjects();
  const queryClient = useQueryClient();

  const user = me.data?.user;

  const view = useQuery({
    queryKey: studioQueryKeys.view(id),
    queryFn: ({ signal }) => fetchWorkspaceView(id, signal),
    enabled: Boolean(id),
  });
  const publications = useQuery({
    queryKey: studioQueryKeys.publications(id),
    queryFn: ({ signal }) => fetchPublications(id, signal),
    enabled: Boolean(id),
  });

  const isAdmin = user?.role === 'admin';
  const manageable = view.data
    ? view.data.ownerUserId === user?.id || (view.data.scope === 'global' && isAdmin)
    : false;

  // --- Nạp config draft qua preview chế độ mẫu (đọc draftRevision hiện tại). ---
  const draftConfigQuery = useQuery({
    queryKey: ['studio', 'views', id, 'draft-config', view.data?.draftRevision ?? 0] as const,
    queryFn: ({ signal }) =>
      createPreview(id, { draftRevision: view.data?.draftRevision as number }, signal),
    enabled: Boolean(id) && manageable && (view.data?.draftRevision ?? 0) >= 1,
    staleTime: 0,
  });

  // --- Trạng thái form soạn ---
  const [draft, setDraft] = useState<ViewConfig | null>(null);
  const [optionsTexts, setOptionsTexts] = useState<string[]>([]);
  const [savedConfig, setSavedConfig] = useState<ViewConfig | null>(null);
  const [configErrors, setConfigErrors] = useState<ConfigFormErrors>(emptyConfigFormErrors());
  const [reloadToken, setReloadToken] = useState(0);
  const [previewSubjectId, setPreviewSubjectId] = useState('');
  const [note, setNote] = useState('');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);
  const [staleInfo, setStaleInfo] = useState<{ message: string; details: StaleDetails } | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<PublicationSummary | null>(null);
  const [rollbackNotice, setRollbackNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!draftConfigQuery.data) return;
    const config = draftConfigQuery.data.config;
    setDraft(config);
    setOptionsTexts(config.widgets.map((widget) => (widget.options ? JSON.stringify(widget.options, null, 2) : '')));
    setSavedConfig(config);
    setConfigErrors(emptyConfigFormErrors());
  }, [draftConfigQuery.data?.digest, reloadToken]);

  const formResult = draft ? validateConfigForm(draft.layout, draft.widgets, optionsTexts) : null;
  const dirty = Boolean(
    draft &&
      savedConfig &&
      formResult?.config &&
      canonicalConfigJson(formResult.config) !== canonicalConfigJson(savedConfig),
  );

  // --- Preview hiển thị: kết quả chủ động (có thể chọn hồ sơ) hoặc nạp tự động. ---
  const preview = useMutation({
    mutationFn: () =>
      createPreview(id, {
        draftRevision: view.data?.draftRevision as number,
        ...(previewSubjectId ? { previewSubjectId } : {}),
      }),
  });
  // Không dán dữ liệu của hồ sơ A dưới nhãn hồ sơ B: chỉ dùng preview khi đúng
  // nguồn đang chọn, ngược lại hiện bản tự động (dữ liệu mẫu có nhãn).
  const previewMatchesSource = preview.data
    ? (preview.data.subjectId ?? '') === previewSubjectId
    : false;
  const shownPreview: PreviewResult | null = previewMatchesSource
    ? preview.data ?? null
    : draftConfigQuery.data ?? null;

  const saveDraft = useMutation({
    mutationFn: () => {
      if (!formResult?.config || !view.data) throw new Error('Chưa đủ dữ liệu để lưu.');
      return updateViewDraft(id, { config: formResult.config, baseRevision: view.data.baseRevision });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(studioQueryKeys.view(id), updated);
      setSavedConfig(formResult?.config ?? null);
      setSaveNotice(`Đã lưu bản nháp r${updated.draftRevision}.`);
      // Draft đổi → preview cũ (kể cả theo hồ sơ) không còn là bản đang soạn.
      preview.reset();
      void queryClient.invalidateQueries({ queryKey: studioQueryKeys.views });
    },
    onError: (error) => {
      if (!isConflictError(error)) return;
      const details = readStaleDetails(error);
      setStaleInfo({
        message: getApiErrorMessage(error, 'Bản nền đã thay đổi, hãy tải lại.'),
        details: details ?? {},
      });
    },
  });

  const publish = useMutation({
    mutationFn: () => {
      const current = shownPreview;
      if (!current || !view.data) throw new Error('Chưa có preview để công bố.');
      return publishView(id, {
        draftRevision: current.draftRevision,
        digest: current.digest,
        baseRevision: view.data.baseRevision,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(studioQueryKeys.view(id), result.view);
      setPublishNotice(
        `Đã công bố bản r${result.publication.revision} — bản đang hoạt động cũ (nếu có) đã được thay thế.`,
      );
      setNote('');
      void queryClient.invalidateQueries({ queryKey: studioQueryKeys.publications(id) });
      void queryClient.invalidateQueries({ queryKey: studioQueryKeys.views });
    },
    onError: (error) => {
      if (isApiError(error) && error.code === 'APPROVAL_STALE') {
        setStaleInfo({
          message: getApiErrorMessage(error, 'Bản đã duyệt không còn khớp trạng thái hiện tại.'),
          details: readStaleDetails(error) ?? {},
        });
      } else {
        setPublishNotice(null);
      }
    },
  });

  const rollback = useMutation({
    mutationFn: () => {
      if (!rollbackTarget) throw new Error('Chưa chọn bản để rollback.');
      return rollbackView(id, { publicationId: rollbackTarget.id });
    },
    onSuccess: (result) => {
      setRollbackTarget(null);
      setRollbackNotice(
        `Đã rollback về bản r${rollbackTarget?.revision ?? '?'} — tạo bản mới r${result.publication.revision}. Lịch sử vẫn giữ đầy đủ.`,
      );
      queryClient.setQueryData(studioQueryKeys.view(id), result.view);
      void queryClient.invalidateQueries({ queryKey: studioQueryKeys.publications(id) });
      void queryClient.invalidateQueries({ queryKey: studioQueryKeys.views });
    },
  });

  const handleReload = () => {
    setStaleInfo(null);
    setRollbackNotice(null);
    setPublishNotice(null);
    setSaveNotice(null);
    setReloadToken((token) => token + 1);
    void view.refetch();
    void publications.refetch();
  };

  // --- Thao tác form widget ---
  const updateWidget = (index: number, patch: Partial<StudioWidget>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            widgets: current.widgets.map((widget, i) => (i === index ? { ...widget, ...patch } : widget)),
          }
        : current,
    );
  };

  const addWidget = () => {
    setDraft((current) => {
      if (!current || current.widgets.length >= MAX_WIDGETS) return current;
      return {
        ...current,
        widgets: [...current.widgets, { id: nextWidgetId(current.widgets), type: 'metric', title: '', span: 1 }],
      };
    });
    setOptionsTexts((texts) => [...texts, '']);
  };

  const removeWidget = (index: number) => {
    setDraft((current) =>
      current ? { ...current, widgets: current.widgets.filter((_, i) => i !== index) } : current,
    );
    setOptionsTexts((texts) => texts.filter((_, i) => i !== index));
  };

  const moveWidget = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    setDraft((current) => {
      if (!current || target < 0 || target >= current.widgets.length) return current;
      const widgets = [...current.widgets];
      const moving = widgets[index];
      const other = widgets[target];
      if (!moving || !other) return current;
      widgets[index] = other;
      widgets[target] = moving;
      return { ...current, widgets };
    });
    setOptionsTexts((texts) => {
      if (target < 0 || target >= texts.length) return texts;
      const next = [...texts];
      const moving = next[index];
      const other = next[target];
      if (moving === undefined || other === undefined) return texts;
      next[index] = other;
      next[target] = moving;
      return next;
    });
  };

  const handleSave = () => {
    setSaveNotice(null);
    setStaleInfo(null);
    if (!formResult || !formResult.config) {
      setConfigErrors(formResult?.errors ?? emptyConfigFormErrors());
      return;
    }
    setConfigErrors(emptyConfigFormErrors());
    saveDraft.mutate();
  };

  const handlePreview = () => {
    if (dirty) return;
    preview.mutate();
  };

  const publishEnabled = Boolean(
    shownPreview &&
      view.data &&
      shownPreview.draftRevision === view.data.draftRevision &&
      formResult?.config &&
      !dirty,
  );

  // --- Render ---
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

  // View scope subject ghim theo đối tượng của view (subjectId từ API view). Tên
  // lấy từ danh sách hồ sơ API — không hard-code, không cho đổi tự do ở đây.
  const viewSubject =
    viewData.scope === 'subject'
      ? (subjects.data?.find((item) => item.id === viewData.subjectId) ?? null)
      : null;
  const subjectContext = viewSubject ? (
    <SubjectContextLine scope="pinned" subject={viewSubject} />
  ) : null;

  const breadcrumb = (
    <nav className="studio-breadcrumb" aria-label="Đường dẫn">
      <Link to="/app">Về Hôm nay</Link>
      <span aria-hidden="true">›</span>
      <Link to="/app/studio">Studio</Link>
    </nav>
  );

  const publication = viewData.currentPublication;

  if (!manageable) {
    return (
      <div className="studio-page">
        {breadcrumb}
        <PageHeader title={viewData.name} context={subjectContext} />
        <p className="studio-meta-line">
          View {SCOPE_LABELS[viewData.scope]} — bạn chỉ có quyền xem bản đã công bố.
        </p>
        <Card title="Thông tin view">
          <p>
            Mã view <code className="studio-mono">{viewData.key}</code> ·{' '}
            {VIEW_STATUS_LABELS[viewData.status]}
          </p>
          {publication ? (
            <div className="studio-inline-action">
              <ButtonLink to={`/app/studio/${id}/data`}>Xem dữ liệu</ButtonLink>
            </div>
          ) : (
            <Alert tone="info">View chưa có bản công bố.</Alert>
          )}
        </Card>
      </div>
    );
  }

  const widgetErrors = configErrors.widgets;
  const summarySource = shownPreview?.data.summary?.source;

  return (
    <div className="studio-page">
      {breadcrumb}
      <PageHeader
        title={viewData.name}
        context={subjectContext}
        actions={
          publication ? (
            <ButtonLink to={`/app/studio/${id}/data`} variant="secondary">
              Xem dữ liệu đã công bố
            </ButtonLink>
          ) : null
        }
      />
      <p className="studio-meta-line">
        <span>
          Key <code className="studio-mono">{viewData.key}</code>
        </span>
        <StatusPill tone="neutral">{SCOPE_LABELS[viewData.scope]}</StatusPill>
        <StatusPill tone={VIEW_STATUS_TONES[viewData.status]}>
          {VIEW_STATUS_LABELS[viewData.status]}
        </StatusPill>
        <span>
          Bản nháp r{viewData.draftRevision}
          {publication ? ` · Công bố r${publication.revision}` : ' · Chưa công bố'}
        </span>
      </p>

      {/* Dải quy trình là điều hướng trong trang, không phải wizard bắt buộc. */}
      <ol className="studio-steps" aria-label="Quy trình làm view">
        <li>
          <a href="#draft-heading">1. Soạn nháp</a>
        </li>
        <li>
          <a href="#preview-heading">2. Xem trước</a>
        </li>
        <li>
          <a href="#publish-heading">3. Công bố</a>
        </li>
      </ol>

      {staleInfo ? (
        <Alert tone="warning" title="Bản đã thay đổi ở máy chủ">
          <p>{staleInfo.message}</p>
          {staleLine(staleInfo.details) ? <p>Trạng thái hiện tại: {staleLine(staleInfo.details)}</p> : null}
          <p>Hãy tải lại để xem bản mới nhất — dữ liệu của bạn không bị ghi đè.</p>
          <div className="studio-inline-action">
            <Button variant="secondary" size="sm" onClick={handleReload}>
              Tải lại
            </Button>
          </div>
        </Alert>
      ) : null}
      {saveNotice ? <Alert tone="success">{saveNotice}</Alert> : null}
      {publishNotice ? <Alert tone="success">{publishNotice}</Alert> : null}
      {rollbackNotice ? <Alert tone="success">{rollbackNotice}</Alert> : null}

      <div className="studio-workbench">
        <section className="studio-column" aria-labelledby="draft-heading">
          <h2 id="draft-heading" className="studio-section-title">
            Soạn nháp · lần sửa r{viewData.draftRevision}
          </h2>

          {draftConfigQuery.isError ? (
            <ErrorState
              title="Không nạp được config bản nháp"
              message={getApiErrorMessage(draftConfigQuery.error)}
              onRetry={() => void draftConfigQuery.refetch()}
            />
          ) : !draft ? (
            <PageLoader label="Đang nạp bản nháp…" />
          ) : (
            <div className="studio-editor">
              <div className="field studio-layout-field">
                <label className="field__label" htmlFor="studio-layout">
                  Bố cục
                </label>
                <select
                  id="studio-layout"
                  className="field__input"
                  aria-invalid={configErrors.layout ? true : undefined}
                  value={draft.layout}
                  onChange={(event) =>
                    setDraft((current) => (current ? { ...current, layout: event.target.value as 'stack' | 'grid' } : current))
                  }
                >
                  <option value="stack">Một cột</option>
                  <option value="grid">Lưới nhiều cột</option>
                </select>
                {configErrors.layout ? (
                  <p className="field__error" role="alert">
                    {configErrors.layout}
                  </p>
                ) : null}
              </div>

              <ol className="studio-widget-list">
                {draft.widgets.map((widget, index) => {
                  const errors = widgetErrors[index] ?? null;
                  return (
                    <li key={`${widget.id}-${index}`} className="studio-widget-editor">
                      <div className="studio-widget-editor__head">
                        <p className="studio-widget-editor__label">
                          Widget {index + 1} · {WIDGET_TYPE_LABELS[widget.type]}
                        </p>
                        <div className="studio-widget-editor__actions">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={index === 0}
                            aria-label={`Chuyển widget ${widget.title || index + 1} lên trên`}
                            onClick={() => moveWidget(index, -1)}
                          >
                            ↑ Lên
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={index === draft.widgets.length - 1}
                            aria-label={`Chuyển widget ${widget.title || index + 1} xuống dưới`}
                            onClick={() => moveWidget(index, 1)}
                          >
                            ↓ Xuống
                          </Button>
                          <Button
                            variant="danger-quiet"
                            size="sm"
                            aria-label={`Xóa widget ${widget.title || index + 1}`}
                            onClick={() => removeWidget(index)}
                          >
                            Xóa
                          </Button>
                        </div>
                      </div>
                      <div className="studio-widget-editor__fields">
                        <TextField
                          id={`widget-${index}-id`}
                          label="Mã widget"
                          required
                          value={widget.id}
                          error={errors?.id}
                          hint="Chỉ a-z, 0-9 và gạch ngang, tối đa 40 ký tự."
                          onChange={(event) => updateWidget(index, { id: event.target.value.toLowerCase() })}
                          maxLength={40}
                          spellCheck={false}
                        />
                        <div className="field">
                          <label className="field__label" htmlFor={`widget-${index}-type`}>
                            Loại
                          </label>
                          <select
                            id={`widget-${index}-type`}
                            className="field__input"
                            value={widget.type}
                            onChange={(event) =>
                              updateWidget(index, { type: event.target.value as StudioWidget['type'] })
                            }
                          >
                            <option value="metric">Chỉ số</option>
                            <option value="chart">Biểu đồ</option>
                            <option value="alerts">Cảnh báo</option>
                            <option value="summary">Tổng hợp</option>
                            <option value="tasks">Công việc</option>
                          </select>
                        </div>
                        <TextField
                          id={`widget-${index}-title`}
                          label="Tiêu đề"
                          required
                          value={widget.title}
                          error={errors?.title}
                          onChange={(event) => updateWidget(index, { title: event.target.value })}
                          maxLength={80}
                        />
                        <div className="field">
                          <label className="field__label" htmlFor={`widget-${index}-span`}>
                            Độ rộng
                          </label>
                          <select
                            id={`widget-${index}-span`}
                            className="field__input"
                            value={widget.span}
                            onChange={(event) =>
                              updateWidget(index, { span: Number(event.target.value) as 1 | 2 | 3 })
                            }
                          >
                            <option value={1}>1 — hẹp</option>
                            <option value={2}>2 — vừa</option>
                            <option value={3}>3 — rộng</option>
                          </select>
                        </div>
                        <div className="field studio-widget-editor__options">
                          <label className="field__label" htmlFor={`widget-${index}-options`}>
                            Options (JSON, tùy chọn)
                          </label>
                          <p className="field__hint" id={`widget-${index}-options-hint`}>
                            Ví dụ: <code>{'{"limit": 5}'}</code>. Để trống nếu không cần.
                          </p>
                          <textarea
                            id={`widget-${index}-options`}
                            className={`field__input${errors?.options ? ' field__input--error' : ''}`}
                            aria-invalid={errors?.options ? true : undefined}
                            aria-describedby={`widget-${index}-options-hint`}
                            rows={2}
                            value={optionsTexts[index] ?? ''}
                            onChange={(event) =>
                              setOptionsTexts((texts) => texts.map((text, i) => (i === index ? event.target.value : text)))
                            }
                            spellCheck={false}
                          />
                          {errors?.options ? (
                            <p className="field__error" role="alert">
                              {errors.options}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {configErrors.general.length > 0 ? (
                <Alert tone="error" title="Config chưa hợp lệ">
                  {configErrors.general.join(' ')}
                </Alert>
              ) : null}
              {saveDraft.isError && !staleInfo ? (
                <Alert tone="error">{getApiErrorMessage(saveDraft.error)}</Alert>
              ) : null}

              <div className="studio-actions-row">
                <Button
                  variant="secondary"
                  onClick={addWidget}
                  disabled={draft.widgets.length >= MAX_WIDGETS}
                >
                  Thêm widget ({draft.widgets.length}/{MAX_WIDGETS})
                </Button>
                <Button onClick={handleSave} disabled={saveDraft.isPending}>
                  {saveDraft.isPending ? 'Đang lưu…' : 'Lưu bản nháp'}
                </Button>
              </div>
            </div>
          )}
        </section>

        <div className="studio-column">
          <section aria-labelledby="preview-heading">
            <h2 id="preview-heading" className="studio-section-title">
              Xem trước
            </h2>
            <Card>
              <p className="studio-preview__note">
                Chỉ xem trước — không ghi dữ liệu nghiệp vụ. Chọn hồ sơ bạn có quyền để xem bản
                nháp với dữ liệu hồ sơ; mặc định là dữ liệu mẫu có nhãn.
              </p>
              <div className="studio-actions-row studio-preview__controls">
                <div className="field">
                  <label className="field__label" htmlFor="preview-subject">
                    Xem trước với hồ sơ (tùy chọn)
                  </label>
                  <select
                    id="preview-subject"
                    className="field__input"
                    value={previewSubjectId}
                    onChange={(event) => {
                      setPreviewSubjectId(event.target.value);
                      // Đổi nguồn thì bỏ kết quả cũ để không hiện dữ liệu A dưới nhãn B.
                      preview.reset();
                    }}
                  >
                    <option value="">Dữ liệu mẫu</option>
                    {(subjects.data ?? []).map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  variant="secondary"
                  onClick={handlePreview}
                  disabled={preview.isPending || draftConfigQuery.isPending}
                >
                  {preview.isPending ? 'Đang xem trước…' : 'Xem trước'}
                </Button>
              </div>
              {dirty ? (
                <Alert tone="info">
                  Bạn có thay đổi chưa lưu — hãy lưu bản nháp rồi xem trước để preview khớp với bản đã lưu.
                </Alert>
              ) : null}
              {preview.isError ? (
                <Alert tone="error" title="Không tạo được preview">
                  {getApiErrorMessage(preview.error)}
                </Alert>
              ) : null}
              {shownPreview ? (
                <div className="studio-preview-block">
                  <div className="studio-data-head">
                    <DataModeBadge
                      sample={shownPreview.data.sample}
                      subjectName={shownPreview.data.subject?.displayName}
                      synthetic={!shownPreview.data.sample && summarySource === 'synthetic'}
                    />
                    <span className="studio-datamode studio-datamode--note">
                      Draft r{shownPreview.draftRevision} · digest {shortDigest(shownPreview.digest)} · kiểm{' '}
                      {formatDateTime(shownPreview.checkedAt)}
                    </span>
                  </div>
                  {shownPreview.warnings.length > 0 ? (
                    <Alert tone="warning" title="Lưu ý khi preview">
                      <ul className="studio-warning-list">
                        {shownPreview.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </Alert>
                  ) : null}
                  <WidgetPreview config={shownPreview.config} data={shownPreview.data} />
                </div>
              ) : null}
            </Card>
          </section>

          <section aria-labelledby="publish-heading">
            <h2 id="publish-heading" className="studio-section-title">
              Công bố
            </h2>
            <Card>
              <p className="studio-preview__note">
                Công bố thay bản đang chạy bằng bản nháp đã lưu. Bản cũ vẫn nằm trong lịch sử để đối
                chiếu hoặc quay lại.
              </p>
              <TextField
                id="publish-note"
                label="Ghi chú (tùy chọn)"
                value={note}
                hint="Tối đa 300 ký tự — ghi lý do công bố để dễ truy vết."
                onChange={(event) => setNote(event.target.value)}
                maxLength={300}
              />
              <p className="studio-publish-state">
                {publishEnabled
                  ? 'Bản xem trước hiện tại khớp với draft đã lưu — sẵn sàng công bố.'
                  : 'Nút công bố chỉ bật sau khi xem trước thành công và draft không đổi từ lúc preview.'}
              </p>
              <Button onClick={() => publish.mutate()} disabled={!publishEnabled || publish.isPending}>
                {publish.isPending ? 'Đang công bố…' : 'Công bố bản nháp'}
              </Button>
              {publish.isError && !staleInfo ? (
                <Alert tone="error" title="Không công bố được">
                  {getApiErrorMessage(publish.error)}
                </Alert>
              ) : null}
            </Card>
          </section>
        </div>
      </div>

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="studio-section-title">
          Lịch sử công bố
        </h2>
        {publications.isPending ? (
          <PageLoader label="Đang tải lịch sử…" />
        ) : publications.isError ? (
          <ErrorState
            title="Không tải được lịch sử công bố"
            message={getApiErrorMessage(publications.error)}
            onRetry={() => void publications.refetch()}
          />
        ) : (publications.data?.items ?? []).length === 0 ? (
          <EmptyState title="Chưa có bản công bố nào" />
        ) : (
          <ul className="studio-publication-list">
            {(publications.data?.items ?? []).map((item) => (
              <li key={item.id} className="studio-publication">
                <div className="studio-publication__main">
                  <p className="studio-publication__title">
                    Bản r{item.revision}
                    <StatusPill tone={PUBLICATION_STATUS_TONES[item.status]}>
                      {PUBLICATION_STATUS_LABELS[item.status]}
                    </StatusPill>
                  </p>
                  <p className="studio-publication__meta">
                    Công bố {formatDateTime(item.publishedAt)} · digest{' '}
                    {shortDigest(item.digest)}
                    {item.note ? ` · ${item.note}` : ''}
                  </p>
                  <p className="studio-publication__meta">
                    Duyệt: {item.approvedBy.displayName} · Công bố: {item.publishedBy.displayName}
                  </p>
                </div>
                {item.status !== 'active' ? (
                  rollbackTarget?.id === item.id ? (
                    <div
                      className="studio-confirm"
                      role="group"
                      aria-label={`Xác nhận rollback bản r${item.revision}`}
                    >
                      <p>
                        Rollback về bản r{item.revision}? Rollback tạo bản công bố MỚI chứa config của
                        bản này — lịch sử giữ nguyên, không xóa bản nào.
                      </p>
                      <div className="studio-actions-row">
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={rollback.isPending}
                          onClick={() => rollback.mutate()}
                        >
                          {rollback.isPending ? 'Đang rollback…' : 'Xác nhận rollback'}
                        </Button>
                        <Button
                          variant="subtle"
                          size="sm"
                          disabled={rollback.isPending}
                          onClick={() => setRollbackTarget(null)}
                        >
                          Hủy
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => setRollbackTarget(item)}>
                      Rollback
                    </Button>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {rollback.isError ? (
          <Alert tone="error" title="Không rollback được">
            {getApiErrorMessage(rollback.error)}
          </Alert>
        ) : null}
      </section>
    </div>
  );
}
