import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/Alert';
import { Button, ButtonLink } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { TextField } from '../../components/Field';
import { formatDateTime, formatRelativeTime } from '../../lib/format';
import { getApiErrorMessage } from '../../lib/api';
import { zodFieldErrorMap } from '../../lib/validation';
import { useMe } from '../auth/useAuth';
import { useSubjects } from '../subjects/useSubjects';
import { createWorkspaceView, createViewSchema, fetchWorkspaceViews, studioQueryKeys } from './api';
import { defaultViewConfig } from './configForm';
import {
  SCOPE_LABELS,
  VIEW_STATUS_LABELS,
  VIEW_STATUS_TONES,
  shortDigest,
} from './labels';

type Scope = 'user' | 'subject' | 'global';

/**
 * /app/studio — danh sách workspace view người dùng có quyền thấy:
 * - Cột: tên, key, scope, trạng thái, draftRevision, publication active, cập nhật.
 * - Tạo view mới (scope subject bắt buộc chọn hồ sơ mình làm chủ; global chỉ admin).
 * - Chỉ hiện hành động quản lý/công bố cho owner (hoặc admin với view global).
 */
export function StudioViewsPage() {
  const me = useMe();
  const subjects = useSubjects();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const user = me.data?.user;
  const isAdmin = user?.role === 'admin';

  const [creating, setCreating] = useState(false);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [scope, setScope] = useState<Scope>('user');
  const [subjectId, setSubjectId] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ fields: Record<string, string>; general: string[] }>({
    fields: {},
    general: [],
  });

  const views = useQuery({
    queryKey: studioQueryKeys.views,
    queryFn: ({ signal }) => fetchWorkspaceViews(signal),
  });

  const create = useMutation({
    mutationFn: () =>
      createWorkspaceView({
        key,
        name,
        scope,
        subjectId: scope === 'subject' ? subjectId : undefined,
        config: defaultViewConfig(),
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: studioQueryKeys.views });
      navigate(`/app/studio/${created.id}`);
    },
  });

  const ownedSubjects = (subjects.data ?? []).filter((item) => item.role === 'owner');

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    const parsed = createViewSchema.safeParse({
      key,
      name,
      scope,
      subjectId: scope === 'subject' ? subjectId : undefined,
      config: defaultViewConfig(),
    });
    if (!parsed.success) {
      setFieldErrors(
        zodFieldErrorMap(parsed.error, { key, name, scope, subjectId }, {
          key: (_issue, value) => {
            if (String(value ?? '').trim() === '') return 'Vui lòng nhập key cho view.';
            return 'Key chỉ gồm chữ thường a-z, số 0-9 và dấu gạch ngang (2–40 ký tự).';
          },
          name: (_issue, value) => {
            if (String(value ?? '').trim() === '') return 'Vui lòng nhập tên view.';
            return 'Tên view quá dài (tối đa 120 ký tự).';
          },
          subjectId: () => 'Vui lòng chọn hồ sơ cho view theo hồ sơ.',
        }),
      );
      return;
    }
    setFieldErrors({ fields: {}, general: [] });
    create.mutate();
  };

  const canManage = (ownerUserId: string, viewScope: string) =>
    viewScope === 'global' ? isAdmin : ownerUserId === user?.id;

  return (
    <div className="stack">
      <header>
        <h1 className="page-title">Studio</h1>
        <p className="page-lead">
          Tạo bố cục màn hình theo quy trình <strong>nháp → xem trước → công bố</strong>.
          Luôn xem trước trước khi áp dụng; dữ liệu mẫu có nhãn rõ ràng.
        </p>
      </header>

      <section aria-labelledby="view-list-heading">
        <div className="studio-actions-row">
          <h2 id="view-list-heading" className="section-title">
            View đã tạo
          </h2>
          <Button variant="secondary" onClick={() => setCreating((value) => !value)}>
            {creating ? 'Đóng form tạo view' : 'Tạo view'}
          </Button>
        </div>

        {creating ? (
          <Card
            title="Tạo view mới"
            description="Cấu hình ban đầu là một ô chỉ số nhịp tim — có thể sửa trong trang chi tiết sau khi tạo."
          >
            <form className="studio-create-form" onSubmit={handleCreate} noValidate>
              <TextField
                id="view-key"
                label="Key định danh"
                required
                value={key}
                error={fieldErrors.fields.key}
                hint="2–40 ký tự, chỉ chữ thường a-z, số 0-9 và dấu gạch ngang. Ví dụ: to-quan-hang-ngay."
                onChange={(event) => setKey(event.target.value.toLowerCase())}
                autoComplete="off"
                maxLength={40}
                spellCheck={false}
              />
              <TextField
                id="view-name"
                label="Tên view"
                required
                value={name}
                error={fieldErrors.fields.name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
              />
              <div className="field">
                <label className="field__label" htmlFor="view-scope">
                  Phạm vi
                </label>
                <select
                  id="view-scope"
                  className="field__input"
                  value={scope}
                  onChange={(event) => {
                    setScope(event.target.value as Scope);
                    setSubjectId('');
                  }}
                >
                  <option value="user">Cá nhân — chỉ mình xem và quản lý</option>
                  <option value="subject">Theo hồ sơ — người xem hồ sơ có quyền</option>
                  {isAdmin ? (
                    <option value="global">Toàn hệ thống — chỉ admin quản lý</option>
                  ) : null}
                </select>
              </div>
              {scope === 'subject' ? (
                <div className="field">
                  <label className="field__label" htmlFor="view-subject">
                    Hồ sơ <span className="field__required" aria-hidden="true"> *</span>
                  </label>
                  {ownedSubjects.length === 0 ? (
                    <p className="field__hint">
                      Bạn chưa là chủ hồ sơ nào — không thể tạo view theo hồ sơ.
                    </p>
                  ) : (
                    <select
                      id="view-subject"
                      className={`field__input${fieldErrors.fields.subjectId ? ' field__input--error' : ''}`}
                      aria-invalid={fieldErrors.fields.subjectId ? true : undefined}
                      value={subjectId}
                      onChange={(event) => setSubjectId(event.target.value)}
                    >
                      <option value="">— Chọn hồ sơ —</option>
                      {ownedSubjects.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.displayName}
                        </option>
                      ))}
                    </select>
                  )}
                  {fieldErrors.fields.subjectId ? (
                    <p className="field__error" id="view-subject-error" role="alert">
                      {fieldErrors.fields.subjectId}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {create.isError ? (
                <Alert tone="error">{getApiErrorMessage(create.error)}</Alert>
              ) : null}
              {fieldErrors.general.length > 0 ? (
                <p className="field__error" role="alert">
                  {fieldErrors.general.join(' ')}
                </p>
              ) : null}
              <div>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? 'Đang tạo…' : 'Tạo view'}
                </Button>
              </div>
            </form>
          </Card>
        ) : null}

        {views.isPending ? (
          <PageLoader label="Đang tải danh sách view…" />
        ) : views.isError ? (
          <ErrorState
            title="Không tải được danh sách view"
            message={getApiErrorMessage(views.error)}
            onRetry={() => void views.refetch()}
          />
        ) : (views.data?.items ?? []).length === 0 ? (
          <EmptyState
            title="Chưa có view nào"
            description="Tạo view đầu tiên để bắt đầu bố cục màn hình."
          />
        ) : (
          <ul className="studio-view-list">
            {(views.data?.items ?? []).map((view) => {
              const relative = formatRelativeTime(view.updatedAt);
              return (
                <li key={view.id} className="studio-view-row">
                  <div className="studio-view-row__main">
                    <p className="studio-view-row__title">
                      {view.name}
                      <StatusPill tone="neutral">{SCOPE_LABELS[view.scope]}</StatusPill>
                      <StatusPill tone={VIEW_STATUS_TONES[view.status]}>
                        {VIEW_STATUS_LABELS[view.status]}
                      </StatusPill>
                    </p>
                    <p className="studio-view-row__meta">
                      Key <strong>{view.key}</strong> · bản nháp r{view.draftRevision}
                      {view.currentPublication
                        ? ` · đang công bố r${view.currentPublication.revision} (${shortDigest(view.currentPublication.digest)})`
                        : ' · chưa công bố'}
                    </p>
                    <p className="studio-view-row__meta">
                      Cập nhật {formatDateTime(view.updatedAt)}
                      {relative ? ` (${relative})` : ''}
                    </p>
                  </div>
                  <div className="studio-view-row__actions">
                    {canManage(view.ownerUserId, view.scope) ? (
                      <ButtonLink to={`/app/studio/${view.id}`} variant="primary" size="sm">
                        Quản lý & công bố
                      </ButtonLink>
                    ) : null}
                    {view.currentPublication ? (
                      <ButtonLink to={`/app/studio/${view.id}/data`} variant="secondary" size="sm">
                        Xem
                      </ButtonLink>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
