import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { DEFAULT_CARE_PERMISSIONS } from '@heart-iot/contracts';
import type { CarePermissions } from '@heart-iot/contracts';
import type { InvitationCreated } from '@heart-iot/contracts/care';
import { createInvitationSchema } from '@heart-iot/contracts/care';
import { Alert } from '../../components/Alert';
import { Button, ButtonLink } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { PageHeader } from '../../components/PageHeader';
import { StatusPill } from '../../components/StatusPill';
import { TextField } from '../../components/Field';
import { formatDateTime } from '../../lib/format';
import { getApiErrorMessage } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { zodFieldErrorMap } from '../../lib/validation';
import { SubjectContextLine } from '../subjects/SubjectSwitcher';
import { useSubjects } from '../subjects/useSubjects';
import { EmergencyContactsSection } from '../contacts/EmergencyContactsSection';
import {
  createInvitation,
  fetchCareLinks,
  fetchInvitations,
  revokeCareLink,
} from './api';
import '../../styles/people.css';
import './share.css';

const INVITATION_STATUS_LABELS = {
  pending: 'Đang chờ chấp nhận',
  accepted: 'Đã chấp nhận',
  expired: 'Đã hết hạn',
  revoked: 'Đã thu hồi',
} as const;

function describePermissions(permissions: CarePermissions): string {
  const parts: string[] = [];
  parts.push(
    permissions.canViewMeasurements === false
      ? 'không xem số đo'
      : `xem số đo ${permissions.historyDays} ngày`,
  );
  parts.push(permissions.canReceiveAlerts ? 'nhận cảnh báo' : 'không nhận cảnh báo');
  parts.push(permissions.canAcknowledge ? 'xác nhận hỗ trợ' : 'không xác nhận');
  parts.push(permissions.canResolve ? 'đóng cảnh báo' : 'không đóng cảnh báo');
  parts.push(permissions.canViewAi ? 'xem tóm tắt AI' : 'không xem AI');
  return parts.join(' · ');
}

/**
 * /app/subjects/:id/share — quản lý chia sẻ (chỉ chủ hồ sơ):
 * - Xác minh owner TRƯỚC khi gọi invitations/care-links: người thân không mở
 *   được trang này và không có request owner-only nào được gửi.
 * - Mời người thân qua email + nhóm quyền độc lập + hạn; `acceptUrl`/token chỉ
 *   hiển thị MỘT LẦN ngay sau khi tạo, có nút ẩn và cảnh báo không xem lại được.
 * - Nói rõ người được mời thấy gì; thu hồi quyền có xác nhận đúng người.
 * - `key` theo `:id` để đổi hồ sơ trên URL không mang token/form của hồ sơ cũ.
 */
export function SharePage() {
  const { id = '' } = useParams();
  return <SharePageContent key={id} subjectId={id} />;
}

function SharePageContent({ subjectId }: { subjectId: string }) {
  const queryClient = useQueryClient();
  const subjects = useSubjects();
  const subject = subjects.data?.find((item) => item.id === subjectId);
  const isOwner = subject?.role === 'owner';

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [historyDays, setHistoryDays] = useState(DEFAULT_CARE_PERMISSIONS.historyDays);
  const [canViewMeasurements, setCanViewMeasurements] = useState(
    DEFAULT_CARE_PERMISSIONS.canViewMeasurements,
  );
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
  const [revokeError, setRevokeError] = useState<string | null>(null);
  /** Link cần focus lại khi nút “Thu hồi quyền” được mount lại sau khi huỷ. */
  const pendingFocusRef = useRef<string | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const inviteButtonRef = useRef<HTMLButtonElement | null>(null);
  const revokeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const shareHeadingRef = useRef<HTMLHeadingElement | null>(null);

  // Owner gate: query chỉ chạy sau khi biết chắc người xem là chủ hồ sơ.
  const invitations = useQuery({
    queryKey: queryKeys.subjectInvitations(subjectId),
    queryFn: ({ signal }) => fetchInvitations(subjectId, signal),
    enabled: isOwner,
    staleTime: 15_000,
  });

  const careLinks = useQuery({
    queryKey: queryKeys.subjectCareLinks(subjectId),
    queryFn: ({ signal }) => fetchCareLinks(subjectId, signal),
    enabled: isOwner,
    staleTime: 15_000,
  });

  /** Heading của section liên hệ (section này còn dùng ở chi tiết cảnh báo). */
  const contactsHeading = () => document.getElementById('emergency-contacts-heading');

  // Xác nhận thu hồi mở ra thì focus vào “Hủy” (nhẹ nhất), để Escape dùng được ngay.
  useEffect(() => {
    if (revokingId) cancelButtonRef.current?.focus();
  }, [revokingId]);

  // Deep link `#contacts` phải đưa focus/scroll tới đúng heading liên hệ.
  useEffect(() => {
    if (!isOwner) return;
    if (window.location.hash !== '#contacts') return;
    contactsHeading()?.focus();
  }, [isOwner]);

  const create = useMutation({
    mutationFn: () =>
      createInvitation(subjectId, {
        email,
        permissions: {
          historyDays,
          canReceiveAlerts,
          canAcknowledge,
          canResolve,
          // Tắt số đo thì tắt luôn tóm tắt AI: AI đọc dữ liệu đo nên không thể
          // chia sẻ số đo qua đường khác.
          canViewAi: canViewMeasurements && canViewAi,
          canViewMeasurements,
        },
        expiresInHours,
      }),
    onSuccess: (result) => {
      setCreated(result);
      setCopied(false);
      setCopyError(false);
      setEmail('');
      setFieldErrors({ fields: {}, general: [] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjectInvitations(subjectId) });
    },
  });

  const revoke = useMutation({
    mutationFn: (linkId: string) => revokeCareLink(subjectId, linkId),
    onSuccess: () => {
      setRevokingId(null);
      setRevokeError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjectCareLinks(subjectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjectInvitations(subjectId) });
    },
    onError: (error) => setRevokeError(getApiErrorMessage(error)),
  });

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    const input = {
      email,
      permissions: {
        historyDays,
        canReceiveAlerts,
        canAcknowledge,
        canResolve,
        canViewAi: canViewMeasurements && canViewAi,
        canViewMeasurements,
      },
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
    // Lời mời cũ (và token của nó) không còn hiệu lực hiển thị khi tạo lời mời mới.
    setCreated(null);
    create.mutate();
  };

  const closeInvite = () => {
    setInviteOpen(false);
    setFieldErrors({ fields: {}, general: [] });
    inviteButtonRef.current?.focus();
  };

  const cancelRevoke = (linkId: string) => {
    pendingFocusRef.current = linkId;
    setRevokingId(null);
    setRevokeError(null);
  };

  const handleRevokeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || revoke.isPending) return;
    event.preventDefault();
    event.stopPropagation();
    if (revokingId) cancelRevoke(revokingId);
  };

  const jumpTo = (target: 'share' | 'contacts') => {
    const heading = target === 'share' ? shareHeadingRef.current : contactsHeading();
    heading?.focus();
    heading?.scrollIntoView({ block: 'start', behavior: 'smooth' });
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

  const pageHeader = (pinned?: typeof subject) => (
    <PageHeader
      title="Chia sẻ và liên hệ"
      context={pinned ? <SubjectContextLine scope="pinned" subject={pinned} /> : undefined}
    />
  );

  if (subjects.isPending) {
    return (
      <div className="stack people-page">
        {pageHeader()}
        <PageLoader label="Đang kiểm tra quyền hồ sơ…" />
      </div>
    );
  }
  if (subjects.isError) {
    return (
      <div className="stack people-page">
        {pageHeader()}
        <ErrorState
          headingLevel={2}
          title="Không tải được hồ sơ"
          message={getApiErrorMessage(subjects.error)}
          onRetry={() => void subjects.refetch()}
        />
      </div>
    );
  }
  if (!subject) {
    return (
      <div className="stack people-page">
        {pageHeader()}
        <EmptyState
          title="Không tìm thấy hồ sơ"
          description="Hồ sơ không tồn tại hoặc bạn không còn quyền truy cập."
          action={<ButtonLink to="/app/subjects">Về danh sách hồ sơ</ButtonLink>}
        />
      </div>
    );
  }
  if (!isOwner) {
    return (
      <div className="stack people-page">
        {pageHeader(subject)}
        <EmptyState
          title="Chỉ chủ hồ sơ quản lý chia sẻ"
          description="Bạn đang xem hồ sơ với quyền người thân nên không mở được phần chia sẻ. Liên hệ chủ hồ sơ nếu cần thay đổi quyền truy cập."
          action={<ButtonLink to="/app/subjects">Về danh sách hồ sơ</ButtonLink>}
        />
      </div>
    );
  }

  const inviteVisible = (v: boolean, yes: string, no: string) => (v ? yes : no);

  return (
    <div className="stack people-page">
      {pageHeader(subject)}

      <nav aria-label="Trong trang này">
        <ul className="people-jump">
          <li>
            <a
              className="people-jump__link"
              href="#share"
              onClick={(event) => {
                event.preventDefault();
                jumpTo('share');
              }}
            >
              Chia sẻ quyền
            </a>
          </li>
          <li>
            <a
              className="people-jump__link"
              href="#contacts"
              onClick={(event) => {
                event.preventDefault();
                jumpTo('contacts');
              }}
            >
              Liên hệ khẩn cấp
            </a>
          </li>
        </ul>
      </nav>

      <section id="share" aria-labelledby="share-heading" className="share-block">
        <div className="share-block__head">
          <h2 id="share-heading" className="page-section__title" tabIndex={-1} ref={shareHeadingRef}>
            Chia sẻ quyền
          </h2>
          <Button
            ref={inviteButtonRef}
            variant={inviteOpen ? 'secondary' : 'primary'}
            aria-expanded={inviteOpen}
            aria-controls={inviteOpen ? 'invite-form' : undefined}
            onClick={() => (inviteOpen ? closeInvite() : setInviteOpen(true))}
          >
            {inviteOpen ? 'Đóng form mời' : 'Mời người thân'}
          </Button>
        </div>

        <h3 className="share-subhead">Người đang xem cùng</h3>
        {careLinks.isPending ? (
          <PageLoader label="Đang tải danh sách người thân…" />
        ) : careLinks.isError ? (
          <ErrorState
            headingLevel={3}
            title="Không tải được danh sách người thân"
            message={getApiErrorMessage(careLinks.error)}
            onRetry={() => void careLinks.refetch()}
          />
        ) : careLinks.data.items.length === 0 ? (
          <p className="people-meta">
            Chưa có ai xem cùng hồ sơ này. Sau khi người được mời chấp nhận, họ xuất hiện tại đây và
            bạn có thể thu hồi quyền bất kỳ lúc nào.
          </p>
        ) : (
          <ul className="people-list" aria-label="Người thân đang xem cùng">
            {careLinks.data.items.map((link) => (
              <li key={link.id} className="people-row">
                <div className="people-row__identity">
                  <p className="people-row__name">{link.caregiver.displayName}</p>
                  <p className="people-row__meta">
                    <span>{link.caregiver.email}</span>
                    <span aria-hidden="true">·</span>
                    <span>{describePermissions(link.permissions)}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      từ {formatDateTime(link.sharedFrom)}
                      {link.revokedAt ? ` · thu hồi ${formatDateTime(link.revokedAt)}` : ''}
                    </span>
                  </p>
                </div>
                <div className="people-row__actions">
                  {link.status === 'active' ? (
                    revokingId === link.id ? (
                      <div
                        className="people-confirm"
                        role="group"
                        aria-label={`Xác nhận thu hồi quyền của ${link.caregiver.displayName}`}
                        onKeyDown={handleRevokeKeyDown}
                      >
                        <p className="people-confirm__text">
                          Thu hồi quyền của <strong>{link.caregiver.displayName}</strong>? Quyền mất
                          ngay lập tức và stream của họ đóng. Bản CSV họ đã tải về thì không thu hồi
                          được.
                        </p>
                        <div className="people-confirm__actions">
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={revoke.isPending}
                            onClick={() => revoke.mutate(link.id)}
                          >
                            {revoke.isPending ? 'Đang thu hồi…' : 'Xác nhận thu hồi'}
                          </Button>
                          <Button
                            ref={cancelButtonRef}
                            variant="subtle"
                            size="sm"
                            disabled={revoke.isPending}
                            onClick={() => cancelRevoke(link.id)}
                          >
                            Hủy
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        ref={(element) => {
                          if (!element) return;
                          revokeTriggerRef.current = element;
                          if (pendingFocusRef.current === link.id) {
                            pendingFocusRef.current = null;
                            element.focus();
                          }
                        }}
                        variant="danger-quiet"
                        size="sm"
                        onClick={() => {
                          setRevokeError(null);
                          setRevokingId(link.id);
                        }}
                        aria-label={`Thu hồi quyền của ${link.caregiver.displayName}`}
                      >
                        Thu hồi quyền
                      </Button>
                    )
                  ) : (
                    <StatusPill tone="neutral">Đã thu hồi</StatusPill>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {revokeError ? <Alert tone="error">{revokeError}</Alert> : null}

        {inviteOpen ? (
          <div id="invite-form" className="people-surface share-invite">
            <h3 className="people-surface__title">Mời người thân</h3>
            <form className="people-form" onSubmit={handleCreate} noValidate>
              <TextField
                id="invite-email"
                label="Email người được mời"
                type="email"
                required
                value={email}
                error={fieldErrors.fields.email}
                hint="Người được mời cần đăng ký tài khoản bằng đúng email này để chấp nhận lời mời."
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="off"
              />

              <fieldset className="share-perms">
                <legend className="field__label">Quyền của người được mời</legend>

                <div className="share-perms__group">
                  <h4 className="share-perms__title">Số đo và AI</h4>
                  <label className="share-check">
                    <input
                      type="checkbox"
                      checked={canViewMeasurements}
                      aria-describedby="invite-measurements-hint"
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setCanViewMeasurements(checked);
                        // AI tóm tắt từ dữ liệu đo: không cho bật khi đã tắt quyền số đo.
                        if (!checked) setCanViewAi(false);
                      }}
                    />
                    Cho phép xem số đo và lịch sử
                  </label>
                  <p id="invite-measurements-hint" className="field__hint">
                    Gồm nhịp tim, số bước chân, lịch sử đo và tệp CSV tải về. Tắt mục này thì
                    người được mời chỉ thấy cảnh báo, trạng thái kết nối và pin của thiết bị.
                  </p>
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
                      disabled={!canViewMeasurements}
                      aria-describedby="invite-history-days-hint"
                      onChange={(event) => setHistoryDays(Number(event.target.value))}
                    />
                    <p id="invite-history-days-hint" className="field__hint">
                      {canViewMeasurements
                        ? 'Chỉ áp dụng cho dữ liệu đo; người được mời không xem được dữ liệu trước thời điểm họ chấp nhận.'
                        : 'Không áp dụng vì bạn không chia sẻ số đo và lịch sử.'}
                    </p>
                  </div>
                  <label className="share-check">
                    <input
                      type="checkbox"
                      checked={canViewAi}
                      disabled={!canViewMeasurements}
                      onChange={(event) => setCanViewAi(event.target.checked)}
                    />
                    Xem tóm tắt AI
                    {!canViewMeasurements ? (
                      <span className="field__hint"> (cần bật quyền xem số đo)</span>
                    ) : null}
                  </label>
                </div>

                <div className="share-perms__group">
                  <h4 className="share-perms__title">Cảnh báo và hỗ trợ</h4>
                  <label className="share-check">
                    <input
                      type="checkbox"
                      checked={canReceiveAlerts}
                      onChange={(event) => setCanReceiveAlerts(event.target.checked)}
                    />
                    Nhận cảnh báo
                  </label>
                  <label className="share-check">
                    <input
                      type="checkbox"
                      checked={canAcknowledge}
                      onChange={(event) => setCanAcknowledge(event.target.checked)}
                    />
                    Xác nhận đang hỗ trợ
                  </label>
                  <label className="share-check">
                    <input
                      type="checkbox"
                      checked={canResolve}
                      onChange={(event) => setCanResolve(event.target.checked)}
                    />
                    Đóng cảnh báo
                  </label>
                  <p className="field__hint">
                    Ba quyền này độc lập: nhận cảnh báo không tự cho phép xác nhận hay đóng cảnh
                    báo.
                  </p>
                </div>
              </fieldset>

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
                <p className="field__hint">1–720 giờ. Sau hạn này liên kết mời không dùng được.</p>
              </div>

              <div className="share-visibility">
                <p className="people-meta--strong">Người được mời sẽ thấy</p>
                <ul className="share-visibility__list">
                  {canViewMeasurements ? (
                    <>
                      <li>Nhịp tim, trạng thái kết nối và pin thiết bị.</li>
                      <li>Lịch sử đo {historyDays} ngày và tệp CSV tải về.</li>
                    </>
                  ) : (
                    <li>Chỉ cảnh báo, trạng thái kết nối và pin — không thấy số đo.</li>
                  )}
                  {canViewMeasurements && canViewAi ? <li>Tóm tắt AI từ dữ liệu đo.</li> : null}
                  <li>
                    {inviteVisible(
                      canReceiveAlerts,
                      'Cảnh báo của hồ sơ này.',
                      'Không nhận cảnh báo.',
                    )}{' '}
                    {inviteVisible(
                      canAcknowledge,
                      'Có thể xác nhận đang hỗ trợ.',
                      'Không thể xác nhận hỗ trợ.',
                    )}{' '}
                    {inviteVisible(canResolve, 'Có thể đóng cảnh báo.', 'Không thể đóng cảnh báo.')}
                  </li>
                </ul>
                <p className="people-meta">
                  Họ không thấy email, mật khẩu hay phiên đăng nhập của bạn, và không xem được dữ
                  liệu trước thời điểm họ chấp nhận. Bản CSV đã tải về vẫn còn sau khi bạn thu hồi
                  quyền.
                </p>
              </div>

              {create.isError ? (
                <Alert tone="error">{getApiErrorMessage(create.error)}</Alert>
              ) : null}

              <div className="people-form__actions">
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? 'Đang tạo lời mời…' : 'Tạo lời mời'}
                </Button>
                <Button
                  variant="subtle"
                  type="button"
                  disabled={create.isPending}
                  onClick={closeInvite}
                >
                  Hủy
                </Button>
              </div>
            </form>
          </div>
        ) : null}

        {created ? (
          <Alert tone="success" title="Đã tạo lời mời" className="share-created">
            <p>
              Gửi đường dẫn dưới đây cho <strong>{created.invitation.email}</strong>. API chỉ tạo
              liên kết, chưa gửi email — bạn cần tự gửi.
            </p>
            <p className="share-created__url people-code">{created.acceptUrl}</p>
            <p className="field__hint share-created__token">
              Mã lời mời (chỉ hiển thị lần này): <span className="people-code">{created.token}</span>
            </p>
            <div className="people-actions">
              <Button variant="secondary" size="sm" onClick={copyAcceptUrl}>
                {copied ? 'Đã sao chép' : 'Sao chép đường dẫn'}
              </Button>
              <Button variant="subtle" size="sm" onClick={() => setCreated(null)}>
                Ẩn đường dẫn và mã
              </Button>
            </div>
            {copyError ? (
              <p className="field__hint" role="status">
                Trình duyệt không cho phép sao chép tự động. Hãy chọn và sao chép đường dẫn trong
                ô phía trên.
              </p>
            ) : null}
            <p className="field__hint">
              Đường dẫn và mã chỉ hiển thị đúng một lần này — hãy gửi và lưu ngay. Khi ẩn hoặc
              đóng, không xem lại được; khi đó chỉ có thể tạo lời mời mới.
            </p>
          </Alert>
        ) : null}

        <h3 className="share-subhead">Lời mời đã gửi</h3>
        {invitations.isPending ? (
          <PageLoader label="Đang tải lời mời…" />
        ) : invitations.isError ? (
          <ErrorState
            headingLevel={3}
            title="Không tải được lời mời"
            message={getApiErrorMessage(invitations.error)}
            onRetry={() => void invitations.refetch()}
          />
        ) : invitations.data.items.length === 0 ? (
          <p className="people-meta">
            Chưa gửi lời mời nào. Lời mời bạn tạo hiển thị tại đây kèm trạng thái và hạn dùng.
          </p>
        ) : (
          <ul className="people-list" aria-label="Lời mời đã gửi">
            {invitations.data.items.map((invitation) => (
              <li key={invitation.id} className="people-row">
                <div className="people-row__identity">
                  <p className="people-row__name">{invitation.email}</p>
                  <p className="people-row__meta">
                    <span>{describePermissions(invitation.permissions)}</span>
                    <span aria-hidden="true">·</span>
                    <span>hết hạn {formatDateTime(invitation.expiresAt)}</span>
                  </p>
                </div>
                <div className="people-row__actions">
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
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div id="contacts" className="share-contacts">
        {/* Sau phần chia sẻ: chủ hồ sơ quản lý người sẽ được gọi khi có cảnh báo.
            Section tự có H2 `Liên hệ khẩn cấp` (id emergency-contacts-heading). */}
        <EmergencyContactsSection subjectId={subjectId} />
      </div>

      <p>
        <ButtonLink to="/app/subjects" variant="subtle" size="sm">
          ← Về danh sách hồ sơ
        </ButtonLink>
      </p>
    </div>
  );
}
