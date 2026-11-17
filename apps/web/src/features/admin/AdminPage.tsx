import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminUserSummary, AuditEntry, PolicyState } from '@heart-iot/contracts/admin';
import { policyValueSchema } from '@heart-iot/contracts/policies';
import { Alert } from '../../components/Alert';
import { Button, ButtonLink } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { PageHeader } from '../../components/PageHeader';
import { StatusPill } from '../../components/StatusPill';
import { TextField } from '../../components/Field';
import { formatDate, formatDateTime } from '../../lib/format';
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
import '../../styles/admin.css';

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

/**
 * Nhãn người đọc cho các action phổ biến. Mã gốc vẫn giữ trong `title` của
 * nhãn và trong phần chi tiết để đối chiếu log/API khi cần.
 */
const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Đăng nhập',
  'auth.register': 'Đăng ký tài khoản',
  'auth.profile_update': 'Cập nhật hồ sơ cá nhân',
  'auth.password_change': 'Đổi mật khẩu',
  'auth.session_revoke': 'Thu hồi phiên đăng nhập',
  'auth.sessions_revoke_others': 'Thu hồi các phiên khác',
  'assistant.ask': 'Hỏi trợ lý',
  'assistant.summary': 'Tóm tắt bằng trợ lý',
  'incident.acknowledge': 'Xác nhận cảnh báo',
  'incident.resolve': 'Kết thúc cảnh báo',
  'incident.ingest': 'Nhận sự kiện cảnh báo',
  'incident.quarantined': 'Cảnh báo bị cách ly',
  'admin.user.disable': 'Khóa tài khoản',
  'admin.user.enable': 'Kích hoạt tài khoản',
  'policy.publish': 'Phát hành chính sách',
  'device.create': 'Đăng ký thiết bị',
  'device.claim': 'Gắn thiết bị vào hồ sơ',
  'device.release': 'Gỡ thiết bị khỏi hồ sơ',
  'device.rotate_key': 'Đổi khóa thiết bị',
  'device.claim_code_issued': 'Cấp mã gắn thiết bị',
  'maintenance_task.create': 'Tạo việc bảo trì',
  'maintenance_task.close': 'Đóng việc bảo trì',
  'emergency_contact.create': 'Thêm liên hệ khẩn cấp',
  'emergency_contact.update': 'Cập nhật liên hệ khẩn cấp',
  'emergency_contact.delete': 'Xóa liên hệ khẩn cấp',
  'emergency_contact.primary_change': 'Đổi liên hệ chính',
  'workspace_view.create': 'Tạo màn hình Studio',
  'workspace_view.draft': 'Lưu nháp Studio',
  'workspace_view.preview': 'Xem trước Studio',
  'workspace_view.publish': 'Phát hành Studio',
  'workspace_view.rollback': 'Khôi phục Studio',
  'care_link.revoke': 'Thu hồi quyền xem',
  'subject.deletion_request': 'Yêu cầu xóa dữ liệu',
  'incident.suspected_timeout': 'Cảnh báo nghi ngờ quá hạn',
  'subject.create': 'Tạo hồ sơ',
  'subject.update': 'Cập nhật hồ sơ',
  'subject.archive': 'Lưu trữ hồ sơ',
  'invitation.create': 'Tạo lời mời',
  'invitation.accept': 'Nhận lời mời',
  'measurement.export': 'Xuất dữ liệu đo',
  'telemetry.quarantined': 'Dữ liệu telemetry bị cách ly',
};

/** Gợi ý mã hành động cho bộ lọc Nhật ký (datalist, không gọi API mới). */
const AUDIT_ACTION_SUGGESTIONS = [
  'auth.login',
  'assistant.summary',
  'incident.acknowledge',
  'admin.user.disable',
  'policy.publish',
  'device.claim',
] as const;

const AUDIT_TARGET_LABELS: Record<string, string> = {
  user: 'Tài khoản',
  subject: 'Hồ sơ',
  incident: 'Cảnh báo',
  device: 'Thiết bị',
  policy: 'Chính sách',
  invitation: 'Lời mời',
  session: 'Phiên',
  workspace_view: 'Màn hình',
  maintenance_task: 'Việc bảo trì',
  emergency_contact: 'Liên hệ',
  care_link: 'Chia sẻ',
};

function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

function auditTargetLabel(targetType: string): string {
  return AUDIT_TARGET_LABELS[targetType] ?? targetType;
}

const POLICY_FIELDS = [
  {
    key: 'heartbeatIntervalSeconds',
    label: 'Gửi nhịp tim mỗi (giây)',
    hint: 'Khoảng cách giữa hai mẫu nhịp tim do thiết bị gửi lên.',
    group: 'heartbeat',
  },
  {
    key: 'dataFreshAfterSeconds',
    label: 'Dữ liệu được coi là mới trong (giây)',
    hint: 'Dữ liệu cũ hơn mốc này hiển thị là chưa cập nhật, không phải dữ liệu trực tuyến.',
    group: 'heartbeat',
  },
  {
    key: 'offlineAfterSeconds',
    label: 'Ngoại tuyến khi không nhận dữ liệu (giây)',
    hint: 'Quá mốc này mà chưa nhận mẫu mới thì thiết bị được coi là ngoại tuyến.',
    group: 'connection',
  },
  {
    key: 'lateEventMinutes',
    label: 'Nhận sự kiện trễ trong (phút)',
    hint: 'Sự kiện cảnh báo đến muộn trong khoảng này vẫn được nhận và ghi rõ là trễ.',
    group: 'connection',
  },
  {
    key: 'maxTelemetryPerMinute',
    label: 'Giới hạn số mẫu mỗi phút',
    hint: 'Chặn thiết bị gửi vượt ngưỡng này trong một phút để bảo vệ hệ thống.',
    group: 'limits',
  },
] as const;

/** Nhóm field theo ý nghĩa vận hành — form dài nhưng không thành một khối số liệu. */
const POLICY_GROUPS = [
  {
    id: 'heartbeat',
    title: 'Nhịp gửi và độ mới của dữ liệu',
    description: 'Thiết bị gửi nhịp tim bao lâu một lần và dữ liệu còn được coi là mới trong bao lâu.',
  },
  {
    id: 'connection',
    title: 'Kết nối và sự kiện trễ',
    description: 'Khi nào một thiết bị bị coi là ngoại tuyến và sự kiện đến muộn còn được nhận.',
  },
  {
    id: 'limits',
    title: 'Giới hạn tải',
    description: 'Ngưỡng chặn thiết bị gửi quá nhiều mẫu.',
  },
] as const;

type PolicyValue = Record<(typeof POLICY_FIELDS)[number]['key'], number>;

const POLICY_STATUS_LABELS = {
  draft: 'nháp',
  active: 'đang hoạt động',
  retired: 'đã thay thế',
} as const;

/**
 * Năm mục nghiệp vụ, tên thật — không gom Chính sách/Nhật ký vào một mục “Nâng cao”.
 * URL canonical giữ đúng dạng cũ cho hai mục cuối: `?tab=advanced&view=policy|audit`.
 */
type Tab = 'overview' | 'users' | 'devices' | 'policy' | 'audit';

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Tổng quan' },
  { value: 'users', label: 'Người dùng' },
  { value: 'devices', label: 'Thiết bị' },
  { value: 'policy', label: 'Chính sách' },
  { value: 'audit', label: 'Nhật ký' },
];

/** Đọc tab từ query string; `?tab=advanced` (không kèm view) vẫn là Chính sách. */
function readTab(tabParam: string | null, viewParam: string | null): Tab {
  if (tabParam === 'users' || tabParam === 'devices') return tabParam;
  if (tabParam === 'advanced') return viewParam === 'audit' ? 'audit' : 'policy';
  // Link cũ chỉ có ?view=audit|policy, không có tab.
  if (viewParam === 'audit') return 'audit';
  if (viewParam === 'policy') return 'policy';
  return 'overview';
}

/** Query string canonical của từng mục — reload/back giữ đúng tab. */
function paramsForTab(next: Tab, current: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(current);
  switch (next) {
    case 'overview':
      params.delete('tab');
      params.delete('view');
      return params;
    case 'users':
    case 'devices':
      params.set('tab', next);
      params.delete('view');
      return params;
    case 'policy':
      params.set('tab', 'advanced');
      params.set('view', 'policy');
      return params;
    case 'audit':
      params.set('tab', 'advanced');
      params.set('view', 'audit');
      return params;
  }
}

/** Điều hướng tab bằng ArrowLeft/ArrowRight/Home/End (roving tabindex). */
function keyboardTabIndex(event: KeyboardEvent<HTMLElement>, index: number, count: number): number | null {
  switch (event.key) {
    case 'ArrowRight':
      return index === count - 1 ? 0 : index + 1;
    case 'ArrowLeft':
      return index === 0 ? count - 1 : index - 1;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/** Focus + cuộn phần tử vào tầm nhìn (jsdom không có scrollIntoView). */
function focusById(id: string): void {
  const element = document.getElementById(id);
  if (!element) return;
  element.focus();
  if (typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ block: 'center' });
  }
}

function OverviewTab({ onSelectTab }: { onSelectTab: (tab: Tab) => void }) {
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

  // Tín hiệu cần xử lý, ưu tiên thứ chưa hiện thành dòng số bên dưới.
  const attention = [
    data.outbox.failed > 0 ? `${data.outbox.failed} thông báo gửi lỗi` : null,
    data.outbox.pending > 0 ? `${data.outbox.pending} thông báo đang chờ gửi` : null,
    data.tasks.open > 0 ? `${data.tasks.open} công việc đang mở` : null,
    data.devices.offline > 0 ? `${data.devices.offline} thiết bị ngoại tuyến` : null,
    data.alerts.open > 0 ? `${data.alerts.open} cảnh báo đang mở` : null,
  ]
    .filter((line): line is string => line !== null)
    .slice(0, 3);

  // Toàn bộ số vận hành hiển thị thành hàng — không giấu phần lớn sau “chi tiết”.
  const operations = [
    {
      label: 'Tài khoản',
      value: `${data.users.active} đang hoạt động · ${data.users.disabled} đã khóa`,
    },
    { label: 'Hồ sơ', value: String(data.subjects.total) },
    {
      label: 'Thiết bị',
      value: `${data.devices.online} trực tuyến · ${data.devices.offline} ngoại tuyến`,
    },
    { label: 'Cảnh báo đang mở', value: String(data.alerts.open) },
    { label: 'Công việc đang mở', value: String(data.tasks.open) },
    {
      label: 'Thông báo',
      value: `${data.outbox.pending} chờ gửi · ${data.outbox.failed} gửi lỗi`,
    },
  ];

  return (
    <div className="admin-overview">
      {attention.length > 0 ? (
        <section className="admin-attention" aria-labelledby="admin-attention-title">
          <h2 id="admin-attention-title" className="admin-attention__title">
            Cần chú ý
          </h2>
          <ul className="admin-attention__list">
            {attention.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="admin-operations-title">
        <h2 id="admin-operations-title" className="admin-section-title">
          Số vận hành
        </h2>
        <dl className="admin-ops" aria-label="Chi tiết số vận hành">
          {operations.map((item) => (
            <div key={item.label} className="admin-ops__row">
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="admin-actions-title">
        <h2 id="admin-actions-title" className="admin-section-title">
          Đi thẳng tới việc cần làm
        </h2>
        <div className="admin-action-links">
          <Button variant="secondary" onClick={() => onSelectTab('users')}>
            Xem người dùng
          </Button>
          <Button variant="secondary" onClick={() => onSelectTab('devices')}>
            Xem thiết bị
          </Button>
          <Button variant="secondary" onClick={() => onSelectTab('policy')}>
            Sửa chính sách thiết bị
          </Button>
          <Button variant="secondary" onClick={() => onSelectTab('audit')}>
            Xem nhật ký
          </Button>
          <ButtonLink to="/app/tasks" variant="secondary">
            Công việc bảo trì
          </ButtonLink>
        </div>
      </section>
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
  // Phản hồi đặt NGOÀI bảng: thông báo thành công vẫn còn khi bộ lọc làm dòng
  // vừa đổi rời danh sách; lỗi PATCH cũng rộng đủ để đọc và nhận được focus.
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error';
    title?: string;
    message: string;
    userId: string;
  } | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  // Đổi trạng thái làm dòng rời bộ lọc đang bật → focus về vùng thông báo
  // (ổn định), không về nút sắp bị gỡ khỏi danh sách.
  const focusFeedbackAfterSuccess = useRef(false);
  const actionButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  // Hành động vừa đóng form: focus trả về đúng nút trong dòng, không phải BODY.
  const restoreFocusTo = useRef<string | null>(null);

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
      // Thông báo ở đầu tab (ngoài bảng) để không phụ thuộc việc dòng còn trong
      // danh sách hay bị bộ lọc loại ra sau khi tải lại.
      setFeedback({
        tone: 'success',
        userId: updated.id,
        message: `Đã ${updated.status === 'disabled' ? 'tạm khóa' : 'kích hoạt'} tài khoản ${updated.displayName}.`,
      });
      restoreFocusTo.current = updated.id;
      focusFeedbackAfterSuccess.current = statusFilter !== '' && statusFilter !== updated.status;
      setTarget(null);
      setReason('');
      setReasonError(null);
      void queryClient.invalidateQueries({
        queryKey: adminQueryKeys.users(appliedSearch, statusFilter || null),
      });
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.overview });
    },
    onError: (error) => {
      // Giữ form để thử lại; lỗi đặt ngoài bảng nên không bị bóp trong cột hành động.
      setFeedback({
        tone: 'error',
        title: 'Không đổi được trạng thái',
        message: getApiErrorMessage(error),
        userId: target?.id ?? '',
      });
    },
  });

  // Mở form xác nhận → focus vào ô lý do để gõ được ngay.
  useEffect(() => {
    if (target) reasonRef.current?.focus();
  }, [target]);

  // Đóng form (hủy hoặc xong) → trả focus về nút đã bấm trong dòng đó. Dòng đã
  // rời danh sách (bộ lọc) thì focus về vùng thông báo thay vì BODY.
  useEffect(() => {
    if (target) return;
    if (focusFeedbackAfterSuccess.current) {
      focusFeedbackAfterSuccess.current = false;
      restoreFocusTo.current = null;
      feedbackRef.current?.focus();
      return;
    }
    const id = restoreFocusTo.current;
    if (!id) return;
    restoreFocusTo.current = null;
    const button = actionButtonRefs.current.get(id);
    if (button) {
      button.focus();
      return;
    }
    feedbackRef.current?.focus();
  }, [target, feedback]);

  // Lỗi PATCH: cuộn + focus khối lỗi để người dùng thấy ngay, không rơi về BODY.
  useEffect(() => {
    if (feedback?.tone !== 'error') return;
    const node = feedbackRef.current;
    if (!node) return;
    node.focus();
    if (typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'center' });
    }
  }, [feedback]);

  const pages = users.data?.pages ?? [];
  const items = pages.flatMap((page) => page?.items ?? []);
  const nextCursor = pages.at(-1)?.nextCursor ?? null;

  const handleStatusSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (reason.trim() === '') {
      setReasonError('Vui lòng nhập lý do thay đổi trạng thái.');
      reasonRef.current?.focus();
      return;
    }
    if (reason.trim().length > 500) {
      setReasonError('Lý do quá dài (tối đa 500 ký tự).');
      reasonRef.current?.focus();
      return;
    }
    setReasonError(null);
    setFeedback(null);
    updateStatus.mutate();
  };

  return (
    <div className="admin-tab-body">
      <form
        className="admin-filter-form"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedSearch(search.trim());
        }}
      >
        <TextField
          id="admin-user-search"
          label="Tìm người dùng"
          hint="Tìm theo email hoặc tên hiển thị."
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
            aria-describedby="admin-user-status-hint"
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">Tất cả</option>
            <option value="active">Hoạt động</option>
            <option value="disabled">Đã khóa</option>
          </select>
          <p className="field__hint" id="admin-user-status-hint">
            “Tất cả” gồm cả tài khoản đã khóa.
          </p>
        </div>
        <Button type="submit" variant="secondary">
          Lọc
        </Button>
      </form>

      {/*
        Vùng phản hồi cố định đầu tab, ngoài bảng: thông báo thành công không
        biến mất khi dòng vừa đổi bị bộ lọc loại ra; lỗi PATCH đọc được đầy đủ.
      */}
      <div className="admin-user-feedback" ref={feedbackRef} tabIndex={-1}>
        {feedback?.tone === 'success' ? (
          <p className="admin-user-feedback__success" role="status">
            {feedback.message}
          </p>
        ) : null}
        {feedback?.tone === 'error' ? (
          <Alert tone="error" title={feedback.title}>
            {feedback.message}
          </Alert>
        ) : null}
      </div>

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
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--users">
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
                  <td>
                    <span className="admin-user-name">{user.displayName}</span>
                    <span className="admin-user-email">{user.email}</span>
                    <span className="admin-user-created">Tạo {formatDate(user.createdAt)}</span>
                  </td>
                  <td>
                    <span className="admin-cell-label" aria-hidden="true">
                      Vai trò
                    </span>
                    <span className="admin-cell-value">{USER_ROLE_LABELS[user.role]}</span>
                  </td>
                  <td>
                    <span className="admin-cell-label" aria-hidden="true">
                      Trạng thái
                    </span>
                    <span className="admin-cell-value">
                      <StatusPill tone={user.status === 'active' ? 'teal' : 'brick'}>
                        {USER_STATUS_LABELS[user.status]}
                      </StatusPill>
                    </span>
                  </td>
                  <td>
                    <span className="admin-cell-label" aria-hidden="true">
                      Hành động
                    </span>
                    <div className="admin-cell-value">
                    {target?.id === user.id ? (
                      <form className="admin-confirm" onSubmit={handleStatusSubmit} noValidate>
                        <div className="field">
                          <label className="field__label" htmlFor={`status-reason-${user.id}`}>
                            Lý do <span className="field__required" aria-hidden="true"> *</span>
                          </label>
                          <textarea
                            ref={reasonRef}
                            id={`status-reason-${user.id}`}
                            className={`field__input${reasonError ? ' field__input--error' : ''}`}
                            required
                            aria-required="true"
                            aria-invalid={reasonError ? true : undefined}
                            aria-describedby={
                              reasonError
                                ? `status-reason-error-${user.id} status-reason-hint-${user.id}`
                                : `status-reason-hint-${user.id}`
                            }
                            rows={2}
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            maxLength={500}
                          />
                          <p className="field__hint" id={`status-reason-hint-${user.id}`}>
                            Bắt buộc, tối đa 500 ký tự.
                          </p>
                          {reasonError ? (
                            <p
                              className="field__error"
                              id={`status-reason-error-${user.id}`}
                              role="alert"
                            >
                              {reasonError}
                            </p>
                          ) : null}
                        </div>
                        <div className="admin-confirm__actions">
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
                              restoreFocusTo.current = target.id;
                              setTarget(null);
                              setReason('');
                              setReasonError(null);
                              setFeedback(null);
                              updateStatus.reset();
                            }}
                          >
                            Hủy
                          </Button>
                        </div>
                      </form>
                    ) : user.id === currentUserId ? (
                      <span className="admin-table__note">Không thể tự khóa chính mình</span>
                    ) : (
                      <Button
                        ref={(element) => {
                          if (element) actionButtonRefs.current.set(user.id, element);
                          else actionButtonRefs.current.delete(user.id);
                        }}
                        variant={user.status === 'active' ? 'danger-quiet' : 'secondary'}
                        onClick={() => {
                          setFeedback(null);
                          updateStatus.reset();
                          setTarget(user);
                          setReason('');
                          setReasonError(null);
                        }}
                      >
                        {user.status === 'active' ? 'Tạm khóa' : 'Kích hoạt'}
                      </Button>
                    )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {items.length > 0 ? (
        <p className="admin-list-note">
          Đang hiện {items.length} tài khoản{nextCursor ? ' — còn trang sau' : ''}.
        </p>
      ) : null}

      {nextCursor ? (
        <div className="admin-load-more">
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
  const statusRef = useRef<HTMLDivElement | null>(null);
  const policyHeadingRef = useRef<HTMLHeadingElement | null>(null);

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

  // Lỗi 409: cuộn + focus cảnh báo (đặt ngay dưới nút vừa bấm) để người dùng
  // thấy ngay, không phải tự cuộn lên đầu panel.
  useEffect(() => {
    if (!staleInfo) return;
    const node = statusRef.current;
    if (!node) return;
    node.focus();
    if (typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'center' });
    }
  }, [staleInfo]);

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
              const range =
                typeof min === 'number' && typeof max === 'number'
                  ? `từ ${min} đến ${max}`
                  : typeof min === 'number'
                    ? `tối thiểu ${min}`
                    : typeof max === 'number'
                      ? `tối đa ${max}`
                      : 'giá trị không hợp lệ';
              return `${field.label}: ${range}.`;
            };
            return acc;
          },
          {},
        ),
      );
      setFieldErrors(mapped.fields);
      const firstInvalid = POLICY_FIELDS.find((field) => mapped.fields[field.key]);
      if (firstInvalid) focusById(`policy-${firstInvalid.key}`);
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
    // Tải lại phải xóa cả lỗi 409, preview cũ và lỗi field cũ, nếu không người
    // vận hành thấy thông báo cũ đi kèm dữ liệu mới.
    setStaleInfo(null);
    setPreviewResult(null);
    setPublishNotice(null);
    setFieldErrors({});
    setLoadedVersion(null);
    publish.reset();
    preview.reset();
    void queryClient.invalidateQueries({ queryKey: adminQueryKeys.policy(POLICY_KEY) });
    // Nút “Tải lại” biến mất cùng cảnh báo: trả focus về tiêu đề panel thay vì BODY.
    policyHeadingRef.current?.focus();
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
  const errorEntries = POLICY_FIELDS.flatMap((field) => {
    const message = fieldErrors[field.key];
    return message ? [{ key: field.key, message }] : [];
  });

  return (
    <div className="admin-tab-body">
      <section className="admin-panel" aria-labelledby="policy-heading">
        <div className="admin-panel__head">
          <h2 id="policy-heading" className="admin-panel__title" tabIndex={-1} ref={policyHeadingRef}>
            Chính sách thiết bị
          </h2>
          <p className="admin-panel__meta">
            Phiên bản {policyData.active.version} · {updatedMeta}
          </p>
        </div>

        <form className="admin-policy-form" onSubmit={(event) => event.preventDefault()} noValidate>
          {POLICY_GROUPS.map((group) => (
            <fieldset key={group.id} className="admin-policy-group">
              <legend className="admin-policy-group__legend">{group.title}</legend>
              <p className="admin-policy-group__desc">{group.description}</p>
              <div className="admin-policy-group__fields">
                {POLICY_FIELDS.filter((field) => field.group === group.id).map((field) => (
                  <TextField
                    key={field.key}
                    id={`policy-${field.key}`}
                    label={field.label}
                    hint={field.hint}
                    type="number"
                    value={value ? String(value[field.key]) : ''}
                    error={fieldErrors[field.key]}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      setValue((current) => (current ? { ...current, [field.key]: next } : current));
                      // Sửa giá trị là lỗi cũ của chính ô đó không còn đúng: xoá ngay
                      // (không bắt người dùng bấm “Xem trước” mới thấy trạng thái đúng).
                      setFieldErrors((current) => {
                        if (!(field.key in current)) return current;
                        const nextErrors = { ...current };
                        delete nextErrors[field.key];
                        return nextErrors;
                      });
                      // Đổi nội dung là preview cũ hết hiệu lực — không để phát hành giá trị chưa duyệt.
                      clearPreview();
                    }}
                  />
                ))}
              </div>
            </fieldset>
          ))}
          <div className="admin-policy-note-field">
            <TextField
              id="policy-note"
              label="Ghi chú phát hành"
              hint="Tùy chọn — nêu lý do thay đổi để người sau đối chiếu."
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
            />
          </div>
          <div className="admin-policy-actions">
            <Button variant="secondary" onClick={handlePreview} disabled={preview.isPending}>
              {preview.isPending ? 'Đang kiểm tra…' : 'Xem trước'}
            </Button>
            <Button onClick={handlePublish} disabled={!canPublish}>
              {publish.isPending ? 'Đang phát hành…' : 'Phát hành'}
            </Button>
          </div>
          {errorEntries.length > 0 ? (
            /*
              Tóm tắt lỗi KHÔNG dùng role="alert": mỗi ô lỗi (TextField) đã là
              alert, hai alert cùng nội dung khiến screen reader đọc lặp.
            */
            <div
              className="admin-policy-errors"
              role="group"
              aria-labelledby="policy-errors-title"
            >
              <p className="admin-policy-errors__title" id="policy-errors-title">
                {errorEntries.length} giá trị chưa hợp lệ. Sửa ô được đánh dấu rồi xem trước lại.
              </p>
              <ul>
                {errorEntries.map((entry) => (
                  <li key={entry.key}>
                    <a
                      href={`#policy-${entry.key}`}
                      onClick={(event) => {
                        event.preventDefault();
                        focusById(`policy-${entry.key}`);
                      }}
                    >
                      {entry.message}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {!canPublish ? <p className="admin-policy-hint">Xem trước để bật Phát hành.</p> : null}

          {/*
            Cảnh báo 409 / kết quả preview nằm ngay dưới nút vừa bấm để luôn ở
            trong tầm nhìn, thay vì ở đầu panel (ngoài màn hình trên mobile).
          */}
          <div className="admin-policy-status" ref={statusRef} tabIndex={-1}>
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
                  <div className="admin-policy-inline-action">
                    <Button variant="secondary" onClick={handleReload}>
                      Tải lại
                    </Button>
                  </div>
                ) : null}
              </Alert>
            ) : null}
            {publishNotice ? <Alert tone="success">{publishNotice}</Alert> : null}
            {preview.isError && !staleInfo ? (
              <Alert tone="error" title="Không kiểm tra được">
                {getApiErrorMessage(preview.error)}
              </Alert>
            ) : null}
            {publish.isError && !staleInfo ? (
              <Alert tone="error" title="Không phát hành được">
                {getApiErrorMessage(publish.error)}
              </Alert>
            ) : null}
            {previewResult ? (
              <div className="admin-policy-preview">
                {previewResult.valid ? (
                  <Alert tone="success" title="Giá trị hợp lệ">
                    Có thể phát hành bản này.
                  </Alert>
                ) : (
                  <Alert tone="error" title="Giá trị không hợp lệ">
                    Giá trị nhập chưa đạt điều kiện kiểm tra.
                  </Alert>
                )}
                <p className="admin-policy-preview__evidence">
                  Bản xem trước cho v{previewResult.expectedVersion} · digest{' '}
                  <code>{previewResult.digest.slice(0, 12)}</code> · không ghi dữ liệu
                </p>
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
                  <div className="admin-policy-diff">
                    <p className="admin-policy-diff__title">Thay đổi so với bản đang hoạt động</p>
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
          </div>
        </form>
      </section>

      <details className="admin-policy-history">
        <summary>Lịch sử phiên bản ({policyData.history.length})</summary>
        <div className="admin-policy-history__body">
          <p className="admin-policy-history__default">
            <span>Giá trị mặc định (dùng khi chưa có bản phát hành)</span>
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
            <ul className="admin-history-list">
              {policyData.history.map((entry) => (
                <li key={entry.version} className="admin-history-row">
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
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const toggleRefs = useRef(new Map<number, HTMLButtonElement>());
  // Đóng panel → trả focus về nút “Xem chi tiết” của đúng dòng.
  const restoreToggleTo = useRef<number | null>(null);
  const [tableOverflows, setTableOverflows] = useState(false);

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
  // Panel chi tiết nằm ngoài khung cuộn của bảng nên luôn đọc được ở mọi cỡ
  // màn hình; chỉ một bản ghi mở tại một thời điểm.
  const expandedEntry =
    expandedId === null ? null : items.find((entry) => entry.id === expandedId) ?? null;

  // Hint chỉ hiện khi bảng thật sự rộng hơn khung (768–1024px cũng có thể tràn
  // vì sidebar), không phụ thuộc riêng breakpoint 767px.
  useEffect(() => {
    const element = tableWrapRef.current;
    if (!element) {
      setTableOverflows(false);
      return;
    }
    const measure = () => setTableOverflows(element.scrollWidth - element.clientWidth > 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [items.length]);

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

  /**
   * Nhãn đối tượng bị tác động. Với hồ sơ, dùng tên nếu metadata của bản ghi
   * có kèm tên hiển thị; không có thì vẫn hiện id ngắn như trước.
   */
  const targetText = (entry: AuditEntry): string => {
    const typeLabel = auditTargetLabel(entry.targetType);
    const subjectName = entry.metadata.subjectName;
    if (entry.targetType === 'subject' && typeof subjectName === 'string' && subjectName.trim()) {
      return `${typeLabel} ${subjectName.trim()}`;
    }
    return `${typeLabel} ${entry.targetId ? entry.targetId.slice(0, 8) : ''}`.trim();
  };

  const closeDetail = (entryId: number) => {
    restoreToggleTo.current = entryId;
    setExpandedId(null);
  };

  const toggleDetail = (entryId: number) => {
    if (expandedId === entryId) {
      closeDetail(entryId);
      return;
    }
    setExpandedId(entryId);
  };

  // Mở panel → đưa focus vào panel (ngoài khung cuộn) để đọc được ngay.
  useEffect(() => {
    if (expandedEntry === null) return;
    const node = panelRef.current;
    if (!node) return;
    node.focus();
    if (typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'center' });
    }
  }, [expandedEntry?.id]);

  // Đóng panel → trả focus về nút của dòng vừa mở, không rơi về BODY.
  useEffect(() => {
    if (expandedId !== null) return;
    const entryId = restoreToggleTo.current;
    if (entryId === null) return;
    restoreToggleTo.current = null;
    toggleRefs.current.get(entryId)?.focus();
  }, [expandedId]);

  return (
    <div className="admin-tab-body">
      <h2 className="admin-section-title">Nhật ký hoạt động</h2>
      <form
        className="admin-filter-form"
        onSubmit={(event) => {
          event.preventDefault();
          setExpandedId(null);
          setAppliedAction(action.trim());
        }}
      >
        <TextField
          id="audit-action"
          label="Hành động"
          hint="Mã hành động, ví dụ auth.login hoặc assistant.summary."
          list="audit-action-suggestions"
          value={action}
          onChange={(event) => setAction(event.target.value)}
          maxLength={120}
        />
        <datalist id="audit-action-suggestions">
          {AUDIT_ACTION_SUGGESTIONS.map((code) => (
            <option key={code} value={code}>
              {auditActionLabel(code)}
            </option>
          ))}
        </datalist>
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
          {tableOverflows ? (
            <p className="admin-table-hint">Bảng rộng hơn khung — vuốt ngang để xem đủ cột.</p>
          ) : null}
          <div className="admin-table-wrap" ref={tableWrapRef}>
            <table className="admin-table admin-table--audit">
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
                {items.map((entry) => {
                  const hasMetadata = Object.keys(entry.metadata).length > 0;
                  const expanded = expandedId === entry.id;
                  return (
                    <tr key={entry.id}>
                      <td>
                        <span className="admin-cell-label" aria-hidden="true">
                          Hành động
                        </span>
                        <span className="admin-cell-value">
                          <code className="admin-audit-action" title={entry.action}>
                            {auditActionLabel(entry.action)}
                          </code>
                        </span>
                      </td>
                      <td>
                        <span className="admin-cell-label" aria-hidden="true">
                          Người thực hiện
                        </span>
                        <span className="admin-cell-value">
                          <span>{actorLabel(entry)}</span>
                          {entry.targetId && entry.targetId !== entry.actorUserId ? (
                            <span className="admin-audit-target" title={entry.targetId}>
                              {targetText(entry)}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td>
                        <span className="admin-cell-label" aria-hidden="true">
                          Kết quả
                        </span>
                        <span className="admin-cell-value">
                          <StatusPill tone={AUDIT_OUTCOME_TONES[entry.outcome]}>
                            {AUDIT_OUTCOME_LABELS[entry.outcome]}
                          </StatusPill>
                        </span>
                      </td>
                      <td>
                        <span className="admin-cell-label" aria-hidden="true">
                          Thời gian
                        </span>
                        <span className="admin-cell-value">{formatDateTime(entry.createdAt)}</span>
                      </td>
                      <td>
                        <span className="admin-cell-label" aria-hidden="true">
                          Chi tiết
                        </span>
                        <span className="admin-cell-value">
                          {hasMetadata ? (
                            <button
                              type="button"
                              ref={(element) => {
                                if (element) toggleRefs.current.set(entry.id, element);
                                else toggleRefs.current.delete(entry.id);
                              }}
                              className="button button--subtle button--sm admin-audit-toggle"
                              aria-expanded={expanded}
                              aria-controls={expanded ? 'audit-detail-panel' : undefined}
                              onClick={() => toggleDetail(entry.id)}
                            >
                              {expanded ? 'Ẩn chi tiết' : 'Xem chi tiết'}
                            </button>
                          ) : (
                            <span className="admin-table__note">—</span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/*
            Panel chi tiết full-width BÊN DƯỚI bảng, ngoài .admin-table-wrap: ở
            768/1024 bảng phải cuộn ngang, nếu để trong bảng thì mép trái panel
            bị cuộn khuất. JSON vẫn cuộn ngang trong panel, không bẻ từ.
          */}
          {expandedEntry ? (
            <section
              className="admin-audit-panel"
              id="audit-detail-panel"
              aria-labelledby="audit-detail-title"
              tabIndex={-1}
              ref={panelRef}
            >
              <div className="admin-audit-panel__head">
                <h3 className="admin-audit-panel__title" id="audit-detail-title">
                  Chi tiết nhật ký
                </h3>
                <Button variant="subtle" size="sm" onClick={() => closeDetail(expandedEntry.id)}>
                  Đóng chi tiết
                </Button>
              </div>
              <dl className="admin-audit-panel__meta">
                <div>
                  <dt>Hành động</dt>
                  <dd>
                    <code>{expandedEntry.action}</code> · {auditActionLabel(expandedEntry.action)}
                  </dd>
                </div>
                <div>
                  <dt>Người thực hiện</dt>
                  <dd>{actorLabel(expandedEntry)}</dd>
                </div>
                <div>
                  <dt>Kết quả</dt>
                  <dd>{AUDIT_OUTCOME_LABELS[expandedEntry.outcome]}</dd>
                </div>
                <div>
                  <dt>Thời gian</dt>
                  <dd>{formatDateTime(expandedEntry.createdAt)}</dd>
                </div>
                {expandedEntry.targetId ? (
                  <div>
                    <dt>Đối tượng</dt>
                    <dd>
                      {auditTargetLabel(expandedEntry.targetType)}{' '}
                      <code>{expandedEntry.targetId}</code>
                    </dd>
                  </div>
                ) : null}
              </dl>
              <pre tabIndex={0} aria-label="Metadata JSON của bản ghi">
                {JSON.stringify(expandedEntry.metadata, null, 2)}
              </pre>
            </section>
          ) : null}
        </>
      )}

      {nextCursor ? (
        <div className="admin-load-more">
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
 * Năm mục nghiệp vụ; Chính sách/Nhật ký giữ URL canonical cũ
 * `?tab=advanced&view=policy|audit` để reload/chia sẻ link/back không mất tab.
 */
export function AdminPage() {
  const me = useMe();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = readTab(searchParams.get('tab'), searchParams.get('view'));

  const selectTab = (next: Tab) => {
    setSearchParams(paramsForTab(next, searchParams));
  };

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
      <div className="admin-page">
        <PageHeader title="Quản trị" />
        <Alert tone="error" title="Không có quyền truy cập">
          Trang quản trị chỉ dành cho tài khoản quản trị viên. Không có dữ liệu quản trị nào được
          tải cho tài khoản này.
        </Alert>
      </div>
    );
  }

  const tabLabel = TABS.find((option) => option.value === tab)?.label ?? '';

  return (
    <div className="admin-page">
      <PageHeader title="Quản trị" />
      <p className="admin-page__lead">Theo dõi vận hành hệ thống, không xem dữ liệu sức khỏe.</p>

      <div className="admin-tabs" role="tablist" aria-label="Các mục quản trị">
        {TABS.map((option, index) => (
          <Button
            key={option.value}
            role="tab"
            id={`admin-tab-${option.value}`}
            className={`admin-tab${tab === option.value ? ' admin-tab--current' : ''}`}
            aria-selected={tab === option.value}
            aria-controls={tab === option.value ? `admin-panel-${option.value}` : undefined}
            tabIndex={tab === option.value ? 0 : -1}
            variant="subtle"
            onKeyDown={(event) => {
              const nextIndex = keyboardTabIndex(event, index, TABS.length);
              if (nextIndex === null) return;
              event.preventDefault();
              const next = TABS[nextIndex];
              if (!next) return;
              selectTab(next.value);
              document.getElementById(`admin-tab-${next.value}`)?.focus();
            }}
            onClick={() => selectTab(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div
        className="admin-panel-body"
        role="tabpanel"
        id={`admin-panel-${tab}`}
        aria-labelledby={`admin-tab-${tab}`}
      >
        <h2 className="visually-hidden">{tabLabel}</h2>
        {tab === 'overview' ? <OverviewTab onSelectTab={selectTab} /> : null}
        {tab === 'users' ? <UsersTab currentUserId={user.id} /> : null}
        {tab === 'devices' ? <AdminDevicesTab /> : null}
        {tab === 'policy' ? <PolicyTab /> : null}
        {tab === 'audit' ? <AuditTab /> : null}
      </div>
    </div>
  );
}
