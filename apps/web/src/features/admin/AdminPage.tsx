import { useState } from 'react';
import type { FormEvent } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminUserSummary, AuditEntry, PolicyState } from '@annhien/contracts/admin';
import { policyValueSchema } from '@annhien/contracts/policies';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { TextField } from '../../components/Field';
import { formatDateTime } from '../../lib/format';
import { getApiErrorMessage, isApiError } from '../../lib/api';
import { zodFieldErrorMap } from '../../lib/validation';
import { useMe } from '../auth/useAuth';
import { AdminDevicesTab } from './AdminDevicesTab';
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
  { key: 'heartbeatIntervalSeconds', label: 'Chu kỳ nhịp tim (giây)' },
  { key: 'offlineAfterSeconds', label: 'Ngoại tuyến sau (giây)' },
  { key: 'dataFreshAfterSeconds', label: 'Dữ liệu tươi (giây)' },
  { key: 'lateEventMinutes', label: 'Sự kiện trễ (phút)' },
  { key: 'maxTelemetryPerMinute', label: 'Telemetry tối đa/phút' },
] as const;

type PolicyValue = Record<(typeof POLICY_FIELDS)[number]['key'], number>;

const POLICY_STATUS_LABELS = {
  draft: 'nháp',
  active: 'đang hoạt động',
  retired: 'đã thay thế',
} as const;

type Tab = 'overview' | 'users' | 'devices' | 'advanced';
type AdvancedView = 'policy' | 'audit';

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Tổng quan' },
  { value: 'users', label: 'Người dùng' },
  { value: 'devices', label: 'Thiết bị' },
  { value: 'advanced', label: 'Nâng cao' },
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
  const kpis = [
    { label: 'Người dùng hoạt động', value: data.users.active },
    { label: 'Thiết bị trực tuyến', value: data.devices.online },
    { label: 'Cảnh báo đang mở', value: data.alerts.open },
    { label: 'Thông báo lỗi', value: data.outbox.failed },
  ];
  const attention = [
    data.alerts.open > 0 ? `${data.alerts.open} cảnh báo đang mở` : null,
    data.devices.offline > 0 ? `${data.devices.offline} thiết bị ngoại tuyến` : null,
    data.outbox.failed > 0 ? `${data.outbox.failed} thông báo gửi lỗi` : null,
  ].filter((line): line is string => line !== null);

  return (
    <div className="stack adm-overview">
      <dl className="adm-kpis" aria-label="Số liệu tổng quan">
        {kpis.map((item) => (
          <div key={item.label} className="adm-kpi">
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>

      {attention.length > 0 ? (
        <section className="adm-attention" aria-labelledby="admin-attention-title">
          <h2 id="admin-attention-title" className="adm-attention__title">
            Cần chú ý
          </h2>
          <ul className="adm-attention__list">
            {attention.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}
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
          onChange={(event) => setSearch(event.target.value)}
          maxLength={120}
        />
        <div className="field">
          <label className="field__label" htmlFor="admin-user-status">
            Trạng thái
          </label>
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
          <table className="adm-table adm-table--users">
            <caption className="visually-hidden">Danh sách tài khoản</caption>
            <thead>
              <tr>
                <th scope="col">Người dùng</th>
                <th scope="col">Vai trò</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.id}>
                  <td data-label="Người dùng">
                    <span className="adm-user-name">{user.displayName}</span>
                    <span className="adm-user-email">{user.email}</span>
                  </td>
                  <td data-label="Vai trò">{USER_ROLE_LABELS[user.role]}</td>
                  <td data-label="Trạng thái">
                    <StatusPill tone={user.status === 'active' ? 'teal' : 'brick'}>
                      {USER_STATUS_LABELS[user.status]}
                    </StatusPill>
                  </td>
                  <td data-label="Hành động">
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

/** So sánh nội dung policy theo đúng các trường của schema (dùng để chặn publish khi form đã đổi). */
function samePolicyValue(a: PolicyValue, b: PolicyValue): boolean {
  return POLICY_FIELDS.every((field) => a[field.key] === b[field.key]);
}

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
    digest: string;
    expectedVersion: number;
    value: PolicyValue;
    warnings: string[];
    diff: { field: string; from: number | null; to: number | null }[];
  } | null>(null);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);
  const [staleInfo, setStaleInfo] = useState<{ kind: 'version' | 'content'; message: string } | null>(
    null,
  );

  const active = policy.data?.active;

  // Nạp giá trị active vào form khi policy tải xong (chỉ lần đầu cho mỗi version).
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null);
  if (active && loadedVersion !== active.version) {
    setLoadedVersion(active.version);
    setValue({ ...active.value });
    // Bản active đổi thì preview + digest cũ hết hiệu lực.
    setPreviewResult(null);
  }

  /**
   * Sửa nội dung sau preview → bỏ preview + digest cũ và tắt Phát hành. Đây là
   * ràng buộc phía UI; backend vẫn kiểm lại `previewDigest` trước khi ghi.
   */
  function clearPreview(): void {
    setPreviewResult(null);
    setPublishNotice(null);
    setStaleInfo((current) => (current?.kind === 'content' ? null : current));
    publish.reset();
  }

  const preview = useMutation({
    mutationFn: () => {
      if (!value || !active) throw new Error('Chưa đủ dữ liệu để xem trước.');
      const previewed = { ...value };
      return previewPolicy(POLICY_KEY, { value: previewed, expectedVersion: active.version }).then(
        (result) => ({ result, previewed }),
      );
    },
    onSuccess: ({ result, previewed }) => {
      setPreviewResult({
        valid: result.valid,
        digest: result.digest,
        expectedVersion: result.expectedVersion,
        value: previewed,
        warnings: result.warnings,
        diff: result.effectiveDiff.map((entry) => ({ ...entry })),
      });
      setPublishNotice(null);
    },
    onError: (error) => {
      // Preview dựa trên phiên bản nền cũ: không giữ preview của nội dung khác.
      if (isApiError(error) && error.code === 'APPROVAL_STALE') {
        setPreviewResult(null);
        const details = (error.details ?? {}) as { currentVersion?: unknown };
        setStaleInfo({
          kind: 'version',
          message: `Phiên bản chính sách đã thay đổi (hiện tại: v${String(details.currentVersion ?? '?')}). Hãy tải lại trước khi phát hành.`,
        });
      }
    },
  });

  const publish = useMutation({
    mutationFn: () => {
      // Chỉ phát hành đúng nội dung đã xem trước và digest server trả về cho nó.
      if (!value || !previewResult) {
        throw new Error('Cần xem trước đúng nội dung hiện tại trước khi phát hành.');
      }
      return publishPolicy(POLICY_KEY, {
        value,
        expectedVersion: previewResult.expectedVersion,
        previewDigest: previewResult.digest,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
    },
    onSuccess: (result) => {
      setPublishNotice(`Đã phát hành chính sách phiên bản ${result.version}.`);
      setPreviewResult(null);
      setStaleInfo(null);
      setNote('');
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.policy(POLICY_KEY) });
    },
    onError: (error) => {
      if (isApiError(error) && error.code === 'APPROVAL_STALE') {
        // Digest của preview cũ không còn dùng được: buộc xem lại trước khi phát hành.
        setPreviewResult(null);
        const details = (error.details ?? {}) as { currentVersion?: unknown; reason?: unknown };
        if (details.reason === 'preview_mismatch' || details.reason === 'preview_missing') {
          setStaleInfo({ kind: 'content', message: getApiErrorMessage(error) });
        } else {
          setStaleInfo({
            kind: 'version',
            message: `Phiên bản chính sách đã thay đổi (hiện tại: v${String(details.currentVersion ?? '?')}). Hãy tải lại trước khi phát hành.`,
          });
        }
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
    setStaleInfo(null);
    if (!validateValue()) return;
    preview.mutate();
  };

  // Phát hành chỉ khả dụng khi có preview hợp lệ cho đúng value + version hiện tại.
  const canPublish =
    value !== null &&
    previewResult !== null &&
    previewResult.valid &&
    previewResult.digest.length > 0 &&
    previewResult.expectedVersion === active?.version &&
    samePolicyValue(previewResult.value, value) &&
    !publish.isPending;

  const handlePublish = () => {
    setPublishNotice(null);
    setStaleInfo(null);
    if (!canPublish) return;
    if (!validateValue()) return;
    publish.mutate();
  };

  const handleReload = () => {
    // Tải lại phải xóa cả lỗi 409 và preview cũ, nếu không người vận hành thấy
    // thông báo cũ đi kèm dữ liệu mới.
    setStaleInfo(null);
    setPreviewResult(null);
    setPublishNotice(null);
    setLoadedVersion(null);
    publish.reset();
    preview.reset();
    void queryClient.invalidateQueries({ queryKey: adminQueryKeys.policy(POLICY_KEY) });
  };

  if (policy.isPending) return <PageLoader label="Đang tải chính sách…" />;
  if (policy.isError) {
    return (
      <ErrorState
        title="Không tải được chính sách"
        message={getApiErrorMessage(policy.error)}
        onRetry={() => void policy.refetch()}
      />
    );
  }
  const policyData = policy.data as PolicyState;
  const updatedMeta = policyData.active.updatedAt
    ? `cập nhật ${formatDateTime(policyData.active.updatedAt)}${
        policyData.active.updatedBy ? ` · ${policyData.active.updatedBy.displayName}` : ''
      }`
    : 'bản mặc định';

  return (
    <div className="stack">
      <section className="adm-panel" aria-labelledby="policy-heading">
        <div className="adm-panel__head">
          <h2 id="policy-heading" className="adm-panel__title">
            Chính sách thiết bị
          </h2>
          <p className="adm-panel__meta">
            Phiên bản {policyData.active.version} · {updatedMeta}
          </p>
        </div>

        {staleInfo ? (
          <Alert
            tone="warning"
            title={
              staleInfo.kind === 'version'
                ? 'Chính sách đã thay đổi'
                : 'Nội dung chưa khớp bản xem trước'
            }
          >
            {staleInfo.message}
            {staleInfo.kind === 'version' ? (
              <div className="adm-policy-inline-action">
                <Button variant="secondary" onClick={handleReload}>
                  Tải lại
                </Button>
              </div>
            ) : null}
          </Alert>
        ) : null}
        {publishNotice ? <Alert tone="success">{publishNotice}</Alert> : null}

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
                // Đổi nội dung là preview cũ hết hiệu lực — không để phát hành giá trị chưa duyệt.
                clearPreview();
              }}
            />
          ))}
          <div className="adm-policy-note-field">
            <TextField
              id="policy-note"
              label="Ghi chú phát hành"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
            />
          </div>
          <div className="adm-policy-actions">
            <Button variant="secondary" onClick={handlePreview} disabled={preview.isPending}>
              {preview.isPending ? 'Đang kiểm tra…' : 'Xem trước'}
            </Button>
            <Button onClick={handlePublish} disabled={!canPublish}>
              {publish.isPending ? 'Đang phát hành…' : 'Phát hành'}
            </Button>
          </div>
          {!canPublish ? <p className="adm-policy-hint">Xem trước để bật Phát hành.</p> : null}
        </form>

        {preview.isError && !staleInfo ? (
          <Alert tone="error" title="Không kiểm tra được">
            {getApiErrorMessage(preview.error)}
          </Alert>
        ) : null}
        {previewResult ? (
          <div className="adm-policy-preview">
            {previewResult.valid ? (
              <Alert tone="success" title="Giá trị hợp lệ">
                Có thể phát hành bản này.
              </Alert>
            ) : (
              <Alert tone="error" title="Giá trị không hợp lệ">
                Giá trị nhập chưa đạt điều kiện kiểm tra.
              </Alert>
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
      </section>

      <details className="adm-policy-history">
        <summary>Lịch sử phiên bản ({policyData.history.length})</summary>
        <div className="adm-policy-history__body">
          <p className="adm-policy-history__default">
            Chưa có bản phát hành:{' '}
            <Button
              variant="subtle"
              onClick={() => {
                setValue({ ...policyData.defaults });
                clearPreview();
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
                    v{entry.version} · {POLICY_STATUS_LABELS[entry.status]}
                  </span>
                  <span>
                    {formatDateTime(entry.updatedAt)}
                    {entry.updatedBy ? ` · ${entry.updatedBy.displayName}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
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
  const actorNames = new Map((actorOptions.data?.items ?? []).map((user) => [user.id, user.displayName]));

  const actorLabel = (entry: AuditEntry): string => {
    if (entry.actorKind !== 'user') {
      return entry.actorKind === 'device'
        ? 'Thiết bị'
        : entry.actorKind === 'ai'
          ? 'Trợ lý'
          : 'Hệ thống';
    }
    if (entry.actorUserId) {
      return actorNames.get(entry.actorUserId) ?? `Người dùng ${entry.actorUserId.slice(0, 8)}`;
    }
    return 'Người dùng';
  };

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
          onChange={(event) => setAction(event.target.value)}
          maxLength={120}
        />
        <div className="field">
          <label className="field__label" htmlFor="audit-actor">
            Người thực hiện
          </label>
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
        <PageLoader label="Đang tải nhật ký…" />
      ) : audit.isError ? (
        <ErrorState
          title="Không tải được nhật ký"
          message={getApiErrorMessage(audit.error)}
          onRetry={() => void audit.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState title="Không có bản ghi nhật ký" description="Thử bộ lọc khác." />
      ) : (
        <>
          <p className="adm-table-hint">Vuốt ngang để xem đủ cột.</p>
          <div className="adm-table-wrap">
            <table className="adm-table adm-table--audit">
              <caption className="visually-hidden">Nhật ký hoạt động</caption>
              <thead>
                <tr>
                  <th scope="col">Hành động</th>
                  <th scope="col">Người thực hiện</th>
                  <th scope="col">Kết quả</th>
                  <th scope="col">Thời gian</th>
                  <th scope="col">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <code className="adm-audit-action">{entry.action}</code>
                    </td>
                    <td>
                      <span>{actorLabel(entry)}</span>
                      {entry.targetId && entry.targetId !== entry.actorUserId ? (
                        <span className="adm-audit-target">
                          {entry.targetType} {entry.targetId.slice(0, 8)}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <StatusPill tone={AUDIT_OUTCOME_TONES[entry.outcome]}>
                        {AUDIT_OUTCOME_LABELS[entry.outcome]}
                      </StatusPill>
                    </td>
                    <td className="adm-table__nowrap">{formatDateTime(entry.createdAt)}</td>
                    <td>
                      {Object.keys(entry.metadata).length > 0 ? (
                        <details className="adm-audit-details">
                          <summary>Xem chi tiết</summary>
                          <pre>{JSON.stringify(entry.metadata, null, 2)}</pre>
                        </details>
                      ) : (
                        <span className="adm-table__note">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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

function AdvancedTab() {
  const [view, setView] = useState<AdvancedView>('policy');

  return (
    <div className="stack">
      <div className="adm-subtabs" role="group" aria-label="Mục nâng cao">
        <Button
          variant={view === 'policy' ? 'primary' : 'subtle'}
          aria-pressed={view === 'policy'}
          onClick={() => setView('policy')}
        >
          Chính sách
        </Button>
        <Button
          variant={view === 'audit' ? 'primary' : 'subtle'}
          aria-pressed={view === 'audit'}
          onClick={() => setView('audit')}
        >
          Nhật ký
        </Button>
      </div>
      {view === 'policy' ? <PolicyTab /> : <AuditTab />}
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
      <div className="stack admin-page">
        <header className="admin-page__head">
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
    <div className="stack admin-page">
      <header className="admin-page__head">
        <h1 className="page-title">Quản trị</h1>
        <p className="page-lead">Theo dõi hệ thống và xử lý tài khoản.</p>
      </header>

      <div className="adm-tabs" role="group" aria-label="Các mục quản trị">
        {TABS.map((option) => (
          <Button
            key={option.value}
            variant={tab === option.value ? 'primary' : 'subtle'}
            aria-pressed={tab === option.value}
            onClick={() => setTab(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {tab === 'overview' ? <OverviewTab /> : null}
      {tab === 'users' ? <UsersTab currentUserId={user.id} /> : null}
      {tab === 'devices' ? <AdminDevicesTab /> : null}
      {tab === 'advanced' ? <AdvancedTab /> : null}
    </div>
  );
}
