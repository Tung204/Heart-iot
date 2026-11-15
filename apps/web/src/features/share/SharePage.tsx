import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { DEFAULT_CARE_PERMISSIONS } from '@annhien/contracts';
import type { CarePermissions } from '@annhien/contracts';
import type { InvitationCreated } from '@annhien/contracts/care';
import { createInvitationSchema } from '@annhien/contracts/care';
import { Alert } from '../../components/Alert';
import { Button, ButtonLink } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { TextField } from '../../components/Field';
import { formatDateTime } from '../../lib/format';
import { getApiErrorMessage, isNotFoundError } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { zodFieldErrorMap } from '../../lib/validation';
import { useSubjects } from '../subjects/useSubjects';
import { EmergencyContactsSection } from '../contacts/EmergencyContactsSection';
import {
  createInvitation,
  fetchCareLinks,
  fetchInvitations,
  revokeCareLink,
} from './api';

const INVITATION_STATUS_LABELS = {
  pending: 'Đang chờ chấp nhận',
  accepted: 'Đã chấp nhận',
  expired: 'Đã hết hạn',
  revoked: 'Đã thu hồi',
} as const;

function describePermissions(permissions: CarePermissions): string {
  const parts: string[] = [`xem ${permissions.historyDays} ngày lịch sử`];
  parts.push(permissions.canReceiveAlerts ? 'nhận cảnh báo' : 'không nhận cảnh báo');
  parts.push(permissions.canAcknowledge ? 'xác nhận' : 'không xác nhận');
  parts.push(permissions.canResolve ? 'đóng cảnh báo' : 'không đóng cảnh báo');
  parts.push(permissions.canViewAi ? 'xem tóm tắt AI' : 'không xem AI');
  return parts.join(' · ');
}

/**
 * /app/subjects/:id/share — quản lý chia sẻ (chỉ chủ hồ sơ):
 * - Mời người thân qua email + quyền + hạn; `acceptUrl`/token chỉ hiển thị
 *   MỘT LẦN ngay sau khi tạo, kèm cảnh báo không xem lại được.
 * - Danh sách lời mời + care link; thu hồi có xác nhận hai bước.
 * - Email đầy đủ chỉ hiển thị ở màn hình này (owner quản lý chia sẻ).
 */
export function SharePage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [historyDays, setHistoryDays] = useState(DEFAULT_CARE_PERMISSIONS.historyDays);
  const [canReceiveAlerts, setCanReceiveAlerts] = useState(DEFAULT_CARE_PERMISSIONS.canReceiveAlerts);
  const [canAcknowledge, setCanAcknowledge] = useState(DEFAULT_CARE_PERMISSIONS.canAcknowledge);
  const [canResolve, setCanResolve] = useState(DEFAULT_CARE_PERMISSIONS.canResolve);
  const [canViewAi, setCanViewAi] = useState(DEFAULT_CARE_PERMISSIONS.canViewAi);
  const [expiresInHours, setExpiresInHours] = useState(72);
  const [fieldErrors, setFieldErrors] = useState<{
    fields: Record<string, string>;
    general: string[];
  }>({ fields: {}, general: [] });
  const [created, setCreated] = useState<InvitationCreated | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const subjects = useSubjects();
  const subject = subjects.data?.find((item) => item.id === id);

  const invitations = useQuery({
    queryKey: queryKeys.subjectInvitations(id),
    queryFn: ({ signal }) => fetchInvitations(id, signal),
    staleTime: 15_000,
  });

  const careLinks = useQuery({
    queryKey: queryKeys.subjectCareLinks(id),
    queryFn: ({ signal }) => fetchCareLinks(id, signal),
    staleTime: 15_000,
  });

  const create = useMutation({
    mutationFn: () =>
      createInvitation(id, {
        email,
        permissions: {
          historyDays,
          canReceiveAlerts,
          canAcknowledge,
          canResolve,
          canViewAi,
        },
        expiresInHours,
      }),
    onSuccess: (result) => {
      setCreated(result);
      setEmail('');
      setFieldErrors({ fields: {}, general: [] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjectInvitations(id) });
    },
  });

  const revoke = useMutation({
    mutationFn: (linkId: string) => revokeCareLink(id, linkId),
    onSuccess: () => {
      setRevokingId(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjectCareLinks(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjectInvitations(id) });
    },
  });

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    const input = {
      email,
      permissions: { historyDays, canReceiveAlerts, canAcknowledge, canResolve, canViewAi },
      expiresInHours,
    };
    const parsed = createInvitationSchema.safeParse(input);
    if (!parsed.success) {
      setFieldErrors(
        zodFieldErrorMap(parsed.error, { email, expiresInHours }, {
          email: (issue, value) => {
            if (String(value ?? '').trim() === '') return 'Vui lòng nhập email người được mời.';
            return 'Email chưa hợp lệ.';
          },
          expiresInHours: () => 'Hạn lời mời không hợp lệ (1–720 giờ).',
          historyDays: () => 'Số ngày lịch sử không hợp lệ (1–3650).',
        }),
      );
      return;
    }
    setFieldErrors({ fields: {}, general: [] });
    setCreated(null);
    create.mutate();
  };

  const copyAcceptUrl = () => {
    if (!created) return;
    if (!navigator.clipboard?.writeText) {
      setCopied(false);
      setCopyError(true);
      return;
    }
    void navigator.clipboard
      .writeText(created.acceptUrl)
      .then(() => {
        setCopied(true);
        setCopyError(false);
      })
      .catch(() => {
        setCopied(false);
        setCopyError(true);
      });
  };

  if (subjects.isPending) return <PageLoader label="Đang kiểm tra quyền hồ sơ…" />;
  if (subjects.isError) {
    return (
      <ErrorState
        title="Không tải được hồ sơ"
        message={getApiErrorMessage(subjects.error)}
        onRetry={() => void subjects.refetch()}
      />
    );
  }
  if (!subject) {
    return (
      <EmptyState
        title="Không tìm thấy hồ sơ"
        description="Hồ sơ không tồn tại hoặc bạn không còn quyền truy cập."
        action={<ButtonLink to="/app/subjects">Về danh sách hồ sơ</ButtonLink>}
      />
    );
  }
  if (subject.role !== 'owner') {
    return (
      <EmptyState
        title="Chỉ chủ hồ sơ quản lý chia sẻ"
        description="Bạn đang xem hồ sơ với quyền người thân. Liên hệ chủ hồ sơ nếu cần thay đổi quyền truy cập."
        action={<ButtonLink to="/app/subjects">Về danh sách hồ sơ</ButtonLink>}
      />
    );
  }

  return (
    <div className="stack">
      <header>
        <h1 className="page-title">Chia sẻ với người thân</h1>
        <p className="page-lead">
          Mời người thân cùng xem dữ liệu và nhận cảnh báo. Chỉ chủ hồ sơ mời và thu hồi được;
          quyền có hiệu lực từ khi người được mời chấp nhận.
        </p>
      </header>

      {invitations.isError && isNotFoundError(invitations.error) ? (
        <Alert tone="info" title="Chưa có dữ liệu chia sẻ">
          API chia sẻ chưa khả dụng hoặc bạn không phải chủ hồ sơ này.
        </Alert>
      ) : null}

      <section aria-labelledby="invite-heading">
        <h2 id="invite-heading" className="section-title">
          Mời người thân
        </h2>
        <Card>
          <form className="invite-form" onSubmit={handleCreate} noValidate>
            <TextField
              id="invite-email"
              label="Email người được mời"
              type="email"
              required
              value={email}
              error={fieldErrors.fields.email}
              hint="Người được mời cần đăng ký tài khoản An Nhiên với email này để chấp nhận lời mời."
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="off"
            />
            <div className="invite-form__options">
              <div className="field">
                <label className="field__label" htmlFor="invite-history-days">
                  Số ngày lịch sử được xem
                </label>
                <input
                  id="invite-history-days"
                  className="field__input"
                  type="number"
                  min={1}
                  max={3650}
                  value={historyDays}
                  onChange={(event) => setHistoryDays(Number(event.target.value))}
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="invite-expires">
                  Hạn lời mời (giờ)
                </label>
                <input
                  id="invite-expires"
                  className="field__input"
                  type="number"
                  min={1}
                  max={720}
                  value={expiresInHours}
                  onChange={(event) => setExpiresInHours(Number(event.target.value))}
                />
              </div>
            </div>
            <fieldset className="invite-form__perms">
              <legend className="field__label">Quyền của người được mời</legend>
              {(
                [
                  ['canReceiveAlerts', 'Nhận cảnh báo', canReceiveAlerts, setCanReceiveAlerts],
                  ['canAcknowledge', 'Xác nhận đang hỗ trợ', canAcknowledge, setCanAcknowledge],
                  ['canResolve', 'Đóng cảnh báo', canResolve, setCanResolve],
                  ['canViewAi', 'Xem tóm tắt AI', canViewAi, setCanViewAi],
                ] as const
              ).map(([key, label, value, setter]) => (
                <label key={key} className="checkline">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(event) => setter(event.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            {create.isError ? (
              <Alert tone="error">{getApiErrorMessage(create.error)}</Alert>
            ) : null}
            <div>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Đang tạo lời mời…' : 'Tạo lời mời'}
              </Button>
            </div>
          </form>

          {created ? (
            <Alert tone="success" title="Đã tạo lời mời" className="invite-result">
              <p>
                Gửi đường dẫn dưới đây cho <strong>{created.invitation.email}</strong>:
              </p>
              <p className="invite-result__url">{created.acceptUrl}</p>
              <p className="field__hint invite-result__token">
                Mã lời mời (chỉ hiển thị lần này): {created.token}
              </p>
              <div className="invite-result__actions">
                <Button variant="secondary" size="sm" onClick={copyAcceptUrl}>
                  {copied ? 'Đã sao chép' : 'Sao chép đường dẫn'}
                </Button>
              </div>
              {copyError ? (
                <p className="field__hint" role="status">
                  Trình duyệt không cho phép sao chép tự động. Hãy chọn và sao chép đường dẫn
                  trong ô phía trên.
                </p>
              ) : null}
              <p className="field__hint">
                Đường dẫn và mã chỉ hiển thị đúng một lần này — hãy lưu ngay. Đóng thông báo
                này sẽ không xem lại được; khi đó chỉ có thể tạo lời mời mới.
              </p>
            </Alert>
          ) : null}
        </Card>
      </section>

      <section aria-labelledby="pending-heading">
        <h2 id="pending-heading" className="section-title">
          Lời mời đã gửi
        </h2>
        {invitations.isPending ? (
          <PageLoader label="Đang tải lời mời…" />
        ) : invitations.isError ? (
          <ErrorState
            title="Không tải được lời mời"
            message={getApiErrorMessage(invitations.error)}
            onRetry={() => void invitations.refetch()}
          />
        ) : invitations.data.items.length === 0 ? (
          <EmptyState title="Chưa gửi lời mời nào" description="Lời mời bạn tạo sẽ hiển thị tại đây kèm trạng thái." />
        ) : (
          <ul className="invite-list">
            {invitations.data.items.map((invitation) => (
              <li key={invitation.id} className="invite-list__item">
                <div>
                  <p className="invite-list__email">{invitation.email}</p>
                  <p className="invite-list__meta">
                    {describePermissions(invitation.permissions)} · hết hạn{' '}
                    {formatDateTime(invitation.expiresAt)}
                  </p>
                </div>
                <StatusPill
                  tone={
                    invitation.status === 'pending'
                      ? 'sand'
                      : invitation.status === 'accepted'
                        ? 'teal'
                        : 'neutral'
                  }
                >
                  {INVITATION_STATUS_LABELS[invitation.status]}
                </StatusPill>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="links-heading">
        <h2 id="links-heading" className="section-title">
          Người thân đang xem cùng
        </h2>
        {careLinks.isPending ? (
          <PageLoader label="Đang tải danh sách người thân…" />
        ) : careLinks.isError ? (
          <ErrorState
            title="Không tải được danh sách người thân"
            message={getApiErrorMessage(careLinks.error)}
            onRetry={() => void careLinks.refetch()}
          />
        ) : careLinks.data.items.length === 0 ? (
          <EmptyState
            title="Chưa có người thân xem cùng"
            description="Sau khi người được mời chấp nhận, họ sẽ xuất hiện tại đây và có thể thu hồi quyền bất kỳ lúc nào."
          />
        ) : (
          <ul className="invite-list">
            {careLinks.data.items.map((link) => (
              <li key={link.id} className="invite-list__item">
                <div>
                  <p className="invite-list__email">
                    {link.caregiver.displayName} · {link.caregiver.email}
                  </p>
                  <p className="invite-list__meta">
                    {describePermissions(link.permissions)} · từ{' '}
                    {formatDateTime(link.sharedFrom)}
                    {link.revokedAt ? ` · thu hồi ${formatDateTime(link.revokedAt)}` : ''}
                  </p>
                </div>
                {link.status === 'active' ? (
                  revokingId === link.id ? (
                    <div className="confirm-box" role="group" aria-label="Xác nhận thu hồi quyền">
                      <p>Thu hồi quyền của {link.caregiver.displayName}? Họ sẽ mất truy cập ngay lập tức.</p>
                      <div>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate(link.id)}
                        >
                          {revoke.isPending ? 'Đang thu hồi…' : 'Xác nhận thu hồi'}
                        </Button>
                        <Button
                          variant="subtle"
                          size="sm"
                          disabled={revoke.isPending}
                          onClick={() => setRevokingId(null)}
                        >
                          Hủy
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="danger" size="sm" onClick={() => setRevokingId(link.id)}>
                      Thu hồi quyền
                    </Button>
                  )
                ) : (
                  <StatusPill tone="neutral">Đã thu hồi</StatusPill>
                )}
              </li>
            ))}
          </ul>
        )}
        {revoke.isError ? <Alert tone="error">{getApiErrorMessage(revoke.error)}</Alert> : null}
      </section>

      {/* Sau phần chia sẻ: chủ hồ sơ quản lý người sẽ được gọi khi có cảnh báo. */}
      <EmergencyContactsSection subjectId={id} />

      <p>
        <ButtonLink to="/app/subjects" variant="subtle" size="sm">
          ← Về danh sách hồ sơ
        </ButtonLink>
      </p>
    </div>
  );
}
