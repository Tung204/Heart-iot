import { useState } from 'react';
import type { FormEvent } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminUserSummary, AuditEntry, PolicyState } from '@annhien/contracts/admin';
import { policyValueSchema } from '@annhien/contracts/policies';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { TextField } from '../../components/Field';
import { formatDateTime, formatShortDate } from '../../lib/format';
import { getApiErrorMessage, isApiError, isConflictError } from '../../lib/api';
import { zodFieldErrorMap } from '../../lib/validation';
import { useMe } from '../auth/useAuth';
import {
  adminQueryKeys,
  fetchAdminAudit,
  fetchAdminOverview,
  fetchAdminUsers,
  fetchPolicyState,
  previewPolicy,
  publishPolicy,
  updateUserStatus,
} from './api';

const USER_STATUS_LABELS = { active: 'Hoạt động', disabled: 'Đã khóa' } as const;
const USER_ROLE_LABELS = { user: 'Người dùng', admin: 'Quản trị' } as const;
const AUDIT_OUTCOME_LABELS = {
  success: 'Thành công',
  failed: 'Thất bại',
  denied: 'Từ chối',
  conflict: 'Xung đột',
} as const;
const AUDIT_OUTCOME_TONES: Record<keyof typeof AUDIT_OUTCOME_LABELS, 'teal' | 'brick' | 'sand' | 'neutral'> = {
  success: 'teal',
  failed: 'brick',
  denied: 'sand',
  conflict: 'neutral',
};

const POLICY_FIELDS = [
  { key: 'heartbeatIntervalSeconds', label: 'Chu kỳ gửi nhịp tim (giây)' },
  { key: 'offlineAfterSeconds', label: 'Ngưỡng ngoại tuyến (giây)' },
  { key: 'dataFreshAfterSeconds', label: 'Dữ liệu tươi sau (giây)' },
  { key: 'lateEventMinutes', label: 'Sự kiện trễ sau (phút)' },
  { key: 'maxTelemetryPerMinute', label: 'Tối đa telemetry/phút' },
] as const;

type PolicyValue = Record<(typeof POLICY_FIELDS)[number]['key'], number>;

type Tab = 'overview' | 'users' | 'policy' | 'audit';

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Tổng quan' },
  { value: 'users', label: 'Người dùng' },
  { value: 'policy', label: 'Chính sách thiết bị' },
  { value: 'audit', label: 'Audit' },
];

function OverviewTab() {
  const overview = useQuery({
    queryKey: adminQueryKeys.overview,
    queryFn: ({ signal }) => fetchAdminOverview(signal),
    staleTime: 30_000,
  });

  if (overview.isPending) return <PageLoader label="Đang tải tổng quan…" />;
  if (overview.isError) {
    return (
      <ErrorState
        title="Không tải được tổng quan"
        message={getApiErrorMessage(overview.error)}
        onRetry={() => void overview.refetch()}
      />
    );
  }
  const data = overview.data;
  const groups = [
    {
      title: 'Tài khoản',
      items: [
        { label: 'Người dùng đang hoạt động', value: data.users.active },
        { label: 'Người dùng đã khóa', value: data.users.disabled },
      ],
    },
    {
      title: 'Hồ sơ và thiết bị',
      items: [
        { label: 'Hồ sơ', value: data.subjects.total },
        { label: 'Thiết bị trực tuyến', value: data.devices.online },
        { label: 'Thiết bị ngoại tuyến', value: data.devices.offline },
      ],
    },
    {
      title: 'Vận hành',
      items: [
        { label: 'Cảnh báo đang mở', value: data.alerts.open },
        { label: 'Công việc đang mở', value: data.tasks.open },
        { label: 'Thông báo đang chờ gửi', value: data.outbox.pending },
        { label: 'Thông báo gửi lỗi', value: data.outbox.failed },
      ],
    },
  ];

  return (
    <div className="adm-stat-groups" aria-label="Số liệu tổng quan">
      {groups.map((group) => (
        <section key={group.title} className="adm-stat-group">
          <h2 className="adm-stat-group__title">{group.title}</h2>
          <dl className="adm-stat-list">
            {group.items.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [target, setTarget] = useState<AdminUserSummary | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const users = useInfiniteQuery({
    queryKey: adminQueryKeys.users(appliedSearch, statusFilter || null),
    queryFn: ({ signal, pageParam }) =>
      fetchAdminUsers(
        {
          query: appliedSearch || undefined,
          status: statusFilter || undefined,
          cursor: pageParam,
          limit: 20,
        },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
  });

  const updateStatus = useMutation({
    mutationFn: () => {
      if (!target) throw new Error('Chưa chọn tài khoản.');
      const nextStatus = target.status === 'active' ? 'disabled' : 'active';
      return updateUserStatus(target.id, { status: nextStatus, reason: reason.trim() });
    },
    onSuccess: (updated) => {
      setNotice(
        `Đã ${updated.status === 'disabled' ? 'tạm khóa' : 'kích hoạt'} tài khoản ${updated.displayName}.`,
      );
      setTarget(null);
      setReason('');
      setReasonError(null);
      void queryClient.invalidateQueries({
        queryKey: adminQueryKeys.users(appliedSearch, statusFilter || null),
      });
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.overview });
    },
  });

  const pages = users.data?.pages ?? [];
  const items = pages.flatMap((page) => page?.items ?? []);
  const nextCursor = pages.at(-1)?.nextCursor ?? null;

  const handleStatusSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (reason.trim() === '') {
      setReasonError('Vui lòng nhập lý do thay đổi trạng thái.');
      return;
    }
    if (reason.trim().length > 500) {
      setReasonError('Lý do quá dài (tối đa 500 ký tự).');
      return;
    }
    setReasonError(null);
    updateStatus.mutate();
  };

  return (
    <div className="stack">
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {updateStatus.isError ? (
        <Alert tone="error" title="Không đổi được trạng thái">
          {getApiErrorMessage(updateStatus.error)}
        </Alert>
      ) : null}

      <form
        className="adm-filter-form"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedSearch(search.trim());
        }}
      >
        <TextField
          id="admin-user-search"
          label="Tìm người dùng"
          value={search}
          hint="Tìm theo email hoặc tên hiển thị."
          onChange={(event) => setSearch(event.target.value)}
          maxLength={120}
        />
        <div className="field">
          <label className="field__label" htmlFor="admin-user-status">Trạng thái</label>
          <select
            id="admin-user-status"
            className="field__input"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">Tất cả</option>
            <option value="active">Hoạt động</option>
            <option value="disabled">Đã khóa</option>
          </select>
          <p className="field__hint">Bao gồm cả tài khoản đã khóa.</p>
        </div>
        <Button type="submit" variant="secondary">
          Lọc
        </Button>
      </form>

      {users.isPending ? (
        <PageLoader label="Đang tải danh sách người dùng…" />
      ) : users.isError ? (
        <ErrorState
          title="Không tải được danh sách người dùng"
          message={getApiErrorMessage(users.error)}
          onRetry={() => void users.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState title="Không tìm thấy người dùng" description="Thử từ khóa hoặc bộ lọc khác." />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <caption className="adm-table__caption">Danh sách tài khoản</caption>
            <thead>
              <tr>
                <th scope="col">Người dùng</th>
                <th scope="col">Vai trò</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Tạo</th>
                <th scope="col">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.id}>
                  <td>
                    <span className="adm-user-name">{user.displayName}</span>
                    <span className="adm-user-email">{user.email}</span>
                  </td>
                  <td>{USER_ROLE_LABELS[user.role]}</td>
                  <td>
                    <StatusPill tone={user.status === 'active' ? 'teal' : 'brick'}>
                      {USER_STATUS_LABELS[user.status]}
                    </StatusPill>
                  </td>
                  <td>{formatShortDate(user.createdAt)}</td>
                  <td>
                    {target?.id === user.id ? (
                      <form className="adm-confirm" onSubmit={handleStatusSubmit} noValidate>
                        <div className="field">
                          <label className="field__label" htmlFor={`status-reason-${user.id}`}>
                            Lý do <span className="field__required" aria-hidden="true"> *</span>
                          </label>
                          <textarea
                            id={`status-reason-${user.id}`}
                            className={`field__input${reasonError ? ' field__input--error' : ''}`}
                            aria-invalid={reasonError ? true : undefined}
                            rows={2}
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            maxLength={600}
                          />
                          {reasonError ? (
                            <p className="field__error" role="alert">
                              {reasonError}
                            </p>
                          ) : null}
                        </div>
                        <div className="adm-confirm__actions">
                          <Button
                            type="submit"
                            variant={target.status === 'active' ? 'danger' : 'primary'}
                            size="sm"
                            disabled={updateStatus.isPending}
                          >
                            {updateStatus.isPending
                              ? 'Đang xử lý…'
                              : target.status === 'active'
                                ? 'Xác nhận tạm khóa'
                                : 'Xác nhận kích hoạt'}
                          </Button>
                          <Button
                            variant="subtle"
                            size="sm"
                            disabled={updateStatus.isPending}
                            onClick={() => {
                              setTarget(null);
                              setReason('');
                              setReasonError(null);
                            }}
                          >
                            Hủy
                          </Button>
                        </div>
                      </form>
                    ) : user.id === currentUserId ? (
                      <span className="adm-table__note">Không thể tự khóa chính mình</span>
                    ) : (
                      <Button
                        variant={user.status === 'active' ? 'danger-quiet' : 'secondary'}
                        size="sm"
                        onClick={() => {
                          setTarget(user);
                          setReason('');
                          setReasonError(null);
                        }}
                      >
                        {user.status === 'active' ? 'Tạm khóa' : 'Kích hoạt'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor ? (
        <div className="adm-load-more">
          <Button variant="secondary" onClick={() => void users.fetchNextPage()} disabled={users.isFetchingNextPage}>
            {users.isFetchingNextPage ? 'Đang tải…' : 'Tải thêm'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const POLICY_KEY = 'device_runtime';

function PolicyTab() {
  const queryClient = useQueryClient();
  const policy = useQuery({
    queryKey: adminQueryKeys.policy(POLICY_KEY),
    queryFn: ({ signal }) => fetchPolicyState(POLICY_KEY, signal),
  });

  const [value, setValue] = useState<PolicyValue | null>(null);
  const [note, setNote] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [previewResult, setPreviewResult] = useState<{
    valid: boolean;
    warnings: string[];
    diff: { field: string; from: number | null; to: number | null }[];
  } | null>(null);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);
  const [staleInfo, setStaleInfo] = useState<string | null>(null);

  const active = policy.data?.active;

  // Nạp giá trị active vào form khi policy tải xong (chỉ lần đầu cho mỗi version).
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null);
  if (active && loadedVersion !== active.version) {
    setLoadedVersion(active.version);
    setValue({ ...active.value });
    setPreviewResult(null);
  }

  const preview = useMutation({
    mutationFn: () => {
      if (!value) throw new Error('Chưa nhập giá trị.');
      return previewPolicy(POLICY_KEY, { value });
    },
    onSuccess: (result) => {
      setPreviewResult({
        valid: result.valid,
        warnings: result.warnings,
        diff: result.effectiveDiff.map((entry) => ({ ...entry })),
      });
      setPublishNotice(null);
    },
  });

  const publish = useMutation({
    mutationFn: () => {
      if (!value || !active) throw new Error('Chưa đủ dữ liệu để phát hành.');
      return publishPolicy(POLICY_KEY, {
        value,
        expectedVersion: active.version,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
    },
    onSuccess: (result) => {
      setPublishNotice(`Đã phát hành policy phiên bản ${result.version}.`);
      setPreviewResult(null);
      setNote('');
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.policy(POLICY_KEY) });
    },
    onError: (error) => {
      if (isApiError(error) && error.code === 'APPROVAL_STALE') {
        const details = (error.details ?? {}) as { currentVersion?: unknown };
        setStaleInfo(
          `Phiên bản policy đã thay đổi (hiện tại: v${String(details.currentVersion ?? '?')}). Hãy tải lại trước khi công bố.`,
        );
      }
    },
  });

  const validateValue = (): boolean => {
    if (!value) return false;
    const parsed = policyValueSchema.safeParse(value);
    if (!parsed.success) {
      const mapped = zodFieldErrorMap(
        parsed.error,
        { ...value },
        POLICY_FIELDS.reduce<Record<string, (issue: import('zod').ZodIssue) => string>>(
          (acc, field) => {
            acc[field.key] = (issue) => {
              const min = 'minimum' in issue ? issue.minimum : undefined;
              const max = 'maximum' in issue ? issue.maximum : undefined;
              return `${field.label}: ${typeof min === 'number' && typeof max === 'number' ? `từ ${min} đến ${max}` : 'giá trị không hợp lệ'}.`;
            };
            return acc;
          },
          {},
        ),
      );
      setFieldErrors(mapped.fields);
      return false;
    }
    setFieldErrors({});
    return true;
  };

  const handlePreview = () => {
    setPublishNotice(null);
    if (!validateValue()) return;
    preview.mutate();
  };

  const handlePublish = () => {
    setPublishNotice(null);
    setStaleInfo(null);
    if (!validateValue()) return;
    publish.mutate();
  };

  const handleReload = () => {
    setStaleInfo(null);
    setPreviewResult(null);
    setLoadedVersion(null);
    void queryClient.invalidateQueries({ queryKey: adminQueryKeys.policy(POLICY_KEY) });
  };

  if (policy.isPending) return <PageLoader label="Đang tải policy…" />;
  if (policy.isError) {
    return (
      <ErrorState
        title="Không tải được policy"
        message={getApiErrorMessage(policy.error)}
        onRetry={() => void policy.refetch()}
      />
    );
  }
  const policyData = policy.data as PolicyState;

  return (
    <div className="stack">
      {staleInfo ? (
        <Alert tone="warning" title="Policy đã thay đổi">
          {staleInfo}
          <div style={{ marginTop: '0.75rem' }}>
            <Button variant="secondary" size="sm" onClick={handleReload}>
              Tải lại
            </Button>
          </div>
        </Alert>
      ) : null}
      {publishNotice ? <Alert tone="success">{publishNotice}</Alert> : null}

      <Card
        title="Chính sách vận hành thiết bị"
        description={`Mã ${POLICY_KEY} · đang áp dụng phiên bản ${policyData.active.version} (nguồn ${policyData.active.source})${policyData.active.updatedAt ? ` · cập nhật ${formatDateTime(policyData.active.updatedAt)}` : ''}${policyData.active.updatedBy ? ` · bởi ${policyData.active.updatedBy.displayName}` : ''}`}
      >
        <p className="adm-policy-note">
          Sửa giá trị rồi <strong>Xem trước</strong> (chỉ kiểm tra, không ghi) trước khi{' '}
          <strong>Phát hành</strong>. Không có nút rollback trực tiếp: để quay lại giá trị cũ, chọn
          lịch sử bên dưới, nhập lại giá trị rồi phát hành bản mới.
        </p>
        <form className="adm-policy-form" onSubmit={(event) => event.preventDefault()} noValidate>
          {POLICY_FIELDS.map((field) => (
            <TextField
              key={field.key}
              id={`policy-${field.key}`}
              label={field.label}
              type="number"
              value={value ? String(value[field.key]) : ''}
              error={fieldErrors[field.key]}
              onChange={(event) => {
                const next = Number(event.target.value);
                setValue((current) => (current ? { ...current, [field.key]: next } : current));
              }}
            />
          ))}
          <div className="adm-policy-note-field">
            <TextField
              id="policy-note"
              label="Ghi chú phát hành (tùy chọn)"
              value={note}
              hint="Tối đa 500 ký tự."
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
            />
          </div>
          <div className="adm-policy-actions">
            <Button variant="secondary" onClick={handlePreview} disabled={preview.isPending}>
              {preview.isPending ? 'Đang kiểm tra…' : 'Xem trước'}
            </Button>
            <Button onClick={handlePublish} disabled={publish.isPending}>
              {publish.isPending ? 'Đang phát hành…' : 'Phát hành'}
            </Button>
          </div>
        </form>
        {preview.isError ? (
          <Alert tone="error" title="Không kiểm tra được">
            {getApiErrorMessage(preview.error)}
          </Alert>
        ) : null}
        {previewResult ? (
          <div className="adm-policy-preview">
            {previewResult.valid ? (
              <Alert tone="success" title="Giá trị hợp lệ">
                Preview không ghi gì vào hệ thống.
              </Alert>
            ) : (
              <Alert tone="error" title="Giá trị không hợp lệ">Giá trị nhập chưa đạt điều kiện kiểm tra.</Alert>
            )}
            {previewResult.warnings.length > 0 ? (
              <Alert tone="warning" title="Cảnh báo khi áp dụng">
                <ul>
                  {previewResult.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
            {previewResult.diff.length > 0 ? (
              <div className="adm-policy-diff">
                <p className="adm-policy-diff__title">Thay đổi so với bản đang hoạt động</p>
                <ul>
                  {previewResult.diff.map((entry) => (
                    <li key={entry.field}>
                      <code>{entry.field}</code>: {String(entry.from)} → {String(entry.to)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        {publish.isError && !staleInfo ? (
          <Alert tone="error" title="Không phát hành được">
            {getApiErrorMessage(publish.error)}
          </Alert>
        ) : null}
      </Card>

      <section aria-labelledby="policy-history-heading">
        <h2 id="policy-history-heading" className="section-title">
          Lịch sử phiên bản
        </h2>
        <p>
          Giá trị mặc định (dùng khi chưa có bản phát hành):{' '}
          <Button
            variant="subtle"
            size="sm"
            onClick={() => {
              setValue({ ...policyData.defaults });
              setPreviewResult(null);
            }}
          >
            Điền giá trị mặc định
          </Button>
        </p>
        {policyData.history.length === 0 ? (
          <EmptyState title="Chưa có bản phát hành nào" />
        ) : (
          <ul className="adm-history-list">
            {policyData.history.map((entry) => (
              <li key={entry.version} className="adm-history-row">
                <span>
                  v{entry.version} · {entry.status === 'active' ? 'đang hoạt động' : entry.status}
                </span>
                <span>
                  {formatDateTime(entry.updatedAt)}
                  {entry.updatedBy ? ` · ${entry.updatedBy.displayName}` : ''}
                </span>
                <span className="adm-history-digest">digest {entry.digest.slice(0, 12)}…</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AuditTab() {
  const [action, setAction] = useState('');
  const [appliedAction, setAppliedAction] = useState('');
  const [actorUserId, setActorUserId] = useState('');

  // Danh sách người dùng cho bộ lọc actor (chỉ tải trong tab audit).
  const actorOptions = useQuery({
    queryKey: ['admin', 'users', 'actor-options'],
    queryFn: ({ signal }) => fetchAdminUsers({ limit: 100 }, signal),
    staleTime: 60_000,
  });

  const audit = useInfiniteQuery({
    queryKey: adminQueryKeys.audit(appliedAction, actorUserId || null),
    queryFn: ({ signal, pageParam }) =>
      fetchAdminAudit(
        {
          action: appliedAction || undefined,
          actorUserId: actorUserId || undefined,
          cursor: pageParam,
          limit: 20,
        },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
  });

  const pages = audit.data?.pages ?? [];
  const items = pages.flatMap((page) => page?.items ?? []);
  const nextCursor = pages.at(-1)?.nextCursor ?? null;

  return (
    <div className="stack">
      <form
        className="adm-filter-form"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedAction(action.trim());
        }}
      >
        <TextField
          id="audit-action"
          label="Hành động"
          value={action}
          hint="Ví dụ: workspace_view.publish. Bỏ trống để xem tất cả."
          onChange={(event) => setAction(event.target.value)}
          maxLength={120}
        />
        <div className="field">
          <label className="field__label" htmlFor="audit-actor">Người thực hiện</label>
          <p className="field__hint">Bỏ trống để xem mọi người thực hiện.</p>
          <select
            id="audit-actor"
            className="field__input"
            value={actorUserId}
            onChange={(event) => setActorUserId(event.target.value)}
          >
            <option value="">Tất cả</option>
            {(actorOptions.data?.items ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName} ({user.email})
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">
          Lọc
        </Button>
      </form>

      {audit.isPending ? (
        <PageLoader label="Đang tải audit…" />
      ) : audit.isError ? (
        <ErrorState
          title="Không tải được audit"
          message={getApiErrorMessage(audit.error)}
          onRetry={() => void audit.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState title="Không có bản ghi audit" description="Thử bộ lọc khác." />
      ) : (
        <ul className="adm-audit-list" aria-label="Nhật ký audit">
          {items.map((entry: AuditEntry) => (
            <li key={entry.id} className="adm-audit-row">
              <div className="adm-audit-row__main">
                <p className="adm-audit-row__title">
                  <code>{entry.action}</code>
                  <StatusPill tone={AUDIT_OUTCOME_TONES[entry.outcome]}>
                    {AUDIT_OUTCOME_LABELS[entry.outcome]}
                  </StatusPill>
                </p>
                <p className="adm-audit-row__meta">
                  {formatDateTime(entry.createdAt)} ·{' '}
                  {entry.actorKind === 'user' ? 'người dùng' : 'hệ thống'}
                  {entry.actorUserId ? ` ${entry.actorUserId.slice(0, 8)}` : ''}
                  {entry.targetId && entry.targetId !== entry.actorUserId
                    ? ` · ${entry.targetType} ${entry.targetId.slice(0, 8)}`
                    : ''}
                </p>
              </div>
              {Object.keys(entry.metadata).length > 0 ? (
                <details className="adm-audit-details">
                  <summary>Chi tiết kỹ thuật</summary>
                  <pre>{JSON.stringify(entry.metadata, null, 2)}</pre>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {nextCursor ? (
        <div className="adm-load-more">
          <Button
            variant="secondary"
            onClick={() => void audit.fetchNextPage()}
            disabled={audit.isFetchingNextPage}
          >
            {audit.isFetchingNextPage ? 'Đang tải…' : 'Tải thêm'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * /app/admin — quản trị (chỉ role admin).
 * Người không phải admin: thông báo "Không có quyền", KHÔNG gọi bất kỳ API admin nào
 * (mọi query trong các tab chỉ chạy khi đã xác nhận admin).
 */
export function AdminPage() {
  const me = useMe();
  const [tab, setTab] = useState<Tab>('overview');

  if (me.isPending) return <PageLoader label="Đang kiểm tra quyền…" />;
  if (me.isError) {
    return (
      <ErrorState
        title="Không kiểm tra được phiên"
        message={getApiErrorMessage(me.error)}
        onRetry={() => void me.refetch()}
      />
    );
  }
  const user = me.data?.user;
  if (!user || user.role !== 'admin') {
    return (
      <div className="stack">
        <header>
          <h1 className="page-title">Quản trị</h1>
        </header>
        <Alert tone="error" title="Không có quyền truy cập">
          Trang quản trị chỉ dành cho tài khoản quản trị viên. Không có dữ liệu quản trị nào được
          tải cho tài khoản này.
        </Alert>
      </div>
    );
  }

  return (
    <div className="stack">
      <header>
        <h1 className="page-title">Quản trị</h1>
        <p className="page-lead">
          Tài khoản, audit, chính sách động và tổng quan hệ thống. Mọi thay đổi đều được ghi audit.
        </p>
      </header>

      <div className="adm-tabs" role="group" aria-label="Các mục quản trị">
        {TABS.map((option) => (
          <Button
            key={option.value}
            variant={tab === option.value ? 'primary' : 'subtle'}
            size="sm"
            aria-pressed={tab === option.value}
            onClick={() => setTab(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {tab === 'overview' ? <OverviewTab /> : null}
      {tab === 'users' ? <UsersTab currentUserId={user.id} /> : null}
      {tab === 'policy' ? <PolicyTab /> : null}
      {tab === 'audit' ? <AuditTab /> : null}
    </div>
  );
}
