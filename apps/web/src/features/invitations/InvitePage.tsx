import { useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { PublicInvitation } from '@heart-iot/contracts/care';
import { Alert } from '../../components/Alert';
import { Button, ButtonLink } from '../../components/Button';
import { PageLoader } from '../../components/PageLoader';
import { SkipLink } from '../../components/SkipLink';
import { formatDateTime } from '../../lib/format';
import {
  getApiErrorMessage,
  isApiError,
  isNotFoundError,
  isUnauthorizedError,
} from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { useMe } from '../auth/useAuth';
import { acceptInvitation, fetchPublicInvitation } from './api';
import '../../styles/auth.css';

/**
 * Token sai định dạng/thiếu ký tự trả 400/422 (VALIDATION_FAILED) từ API.
 * Đây là lỗi dữ liệu của link, KHÔNG phải “không kết nối được máy chủ” — không
 * được mời thử lại vì retry một lỗi cố định không thể thành công (v6 F01).
 */
function isInvalidTokenError(error: unknown): boolean {
  return (
    isApiError(error) &&
    (error.status === 400 || error.status === 422 || error.code === 'VALIDATION_FAILED')
  );
}

/** Quyền trong preview: chỉ khẳng định xem số đo khi contract thực sự cho phép. */
function permissionRows(invitation: PublicInvitation) {
  const permissions = invitation.permissions;
  return [
    {
      label: 'Số đo và lịch sử',
      value: permissions.canViewMeasurements
        ? `Xem số đo, tối đa ${permissions.historyDays} ngày`
        : 'Không được xem số đo và lịch sử',
    },
    {
      label: 'Cảnh báo',
      value: permissions.canReceiveAlerts ? 'Nhận cảnh báo' : 'Không nhận cảnh báo',
    },
    {
      label: 'Hỗ trợ',
      value: permissions.canAcknowledge ? 'Xác nhận hỗ trợ' : 'Không xác nhận hỗ trợ',
    },
    {
      label: 'Đóng cảnh báo',
      value: permissions.canResolve ? 'Có thể đóng cảnh báo' : 'Không đóng cảnh báo',
    },
    {
      label: 'Trợ lý AI',
      value: permissions.canViewAi
        ? 'Xem câu trả lời từ trợ lý AI'
        : 'Không xem câu trả lời từ trợ lý AI',
    },
  ];
}

/**
 * Trang xem lời mời chia sẻ hồ sơ.
 * - GET /invitations/:token trả 404 → lời mời không hợp lệ/hết hạn/thu hồi;
 *   400/422 → link sai định dạng (lỗi dữ liệu, không retry); 5xx/mạng → Thử lại.
 * - Không hiển thị email người được mời hay dữ liệu sức khỏe (hợp đồng preview).
 * - Chưa đăng nhập → "Đăng nhập để tiếp tục" (giữ next về trang lời mời).
 * - Đã đăng nhập → "Đồng ý tham gia"; sau khi chấp nhận mở /app.
 */
export function InvitePage() {
  const { token = '' } = useParams();
  // Đổi token phải bỏ lỗi/khoá accept của lời mời trước, không dán sang link mới.
  return <InviteView key={token} token={token} />;
}

function InviteView({ token }: { token: string }) {
  const me = useMe();
  const queryClient = useQueryClient();
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const acceptLock = useRef(false);
  const invitePath = `/invite/${token}`;

  const invitation = useQuery({
    queryKey: queryKeys.invitation(token),
    queryFn: ({ signal }) => fetchPublicInvitation(token, signal),
    retry: false,
    staleTime: 30_000,
  });

  const accept = useMutation({
    mutationFn: () => acceptInvitation(token),
    onSuccess: () => {
      acceptLock.current = false;
      setAcceptError(null);
      // Hồ sơ mới xuất hiện trong danh sách — làm mới để shell/dashboard cập nhật.
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjects });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
    onError: (error) => {
      acceptLock.current = false;
      setAcceptError(getApiErrorMessage(error));
    },
  });

  const acceptOnce = () => {
    if (acceptLock.current) return;
    acceptLock.current = true;
    accept.mutate();
  };

  let content: ReactNode;

  if (invitation.isPending) {
    content = (
      <>
        <h1 id="invite-title" className="auth-panel__title">
          Lời mời theo dõi
        </h1>
        <PageLoader label="Đang kiểm tra lời mời…" />
      </>
    );
  } else if (invitation.isError && isInvalidTokenError(invitation.error)) {
    content = (
      <>
        <h1 id="invite-title" className="auth-panel__title">
          Lời mời không hợp lệ
        </h1>
        <p className="auth-message">
          Link lời mời không đúng định dạng hoặc đã thiếu ký tự. Hãy kiểm tra lại link, hoặc nhờ
          người mời gửi lại lời mời mới.
        </p>
        <div className="invite-actions">
          <ButtonLink to="/">Về trang chủ</ButtonLink>
        </div>
      </>
    );
  } else if (invitation.isError && isNotFoundError(invitation.error)) {
    content = (
      <>
        <h1 id="invite-title" className="auth-panel__title">
          Lời mời không hợp lệ
        </h1>
        <p className="auth-message">
          Lời mời này không tồn tại, đã hết hạn hoặc đã được dùng. Hãy kiểm tra lại link hoặc nhờ
          người mời gửi lời mời mới.
        </p>
        <div className="invite-actions">
          <ButtonLink to="/">Về trang chủ</ButtonLink>
        </div>
      </>
    );
  } else if (invitation.isError) {
    content = (
      <>
        <h1 id="invite-title" className="auth-panel__title">
          Không kiểm tra được lời mời
        </h1>
        <p className="auth-message">
          Không kết nối được máy chủ hoặc lời mời đang gặp lỗi tạm thời. Hãy thử lại.
        </p>
        <div className="invite-actions">
          <Button onClick={() => void invitation.refetch()} disabled={invitation.isFetching}>
            {invitation.isFetching ? 'Đang thử lại…' : 'Thử lại'}
          </Button>
          <ButtonLink to="/" variant="secondary">
            Về trang chủ
          </ButtonLink>
        </div>
      </>
    );
  } else if (invitation.isSuccess) {
    const data = invitation.data;
    content = (
      <>
        <h1 id="invite-title" className="auth-panel__title">
          Lời mời theo dõi
        </h1>
        <p className="invite-intro">
          <strong>{data.inviterName}</strong> mời bạn theo dõi{' '}
          <strong>{data.subjectName}</strong> với vai trò <strong>Người thân</strong>.
        </p>
        <dl className="invite-facts">
          {permissionRows(data).map((row) => (
            <div className="invite-facts__row" key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
          <div className="invite-facts__row">
            <dt>Hết hạn</dt>
            <dd>{formatDateTime(data.expiresAt)}</dd>
          </div>
        </dl>

        <div className="invite-actions">
          {me.isPending ? (
            <p className="auth-status" role="status">
              Đang kiểm tra trạng thái đăng nhập…
            </p>
          ) : me.isError && isUnauthorizedError(me.error) ? (
            <>
              <ButtonLink to={`/login?next=${encodeURIComponent(invitePath)}`}>
                Đăng nhập để tiếp tục
              </ButtonLink>
              <p className="auth-switch">
                Chưa có tài khoản?{' '}
                <Link to={`/register?next=${encodeURIComponent(invitePath)}`}>
                  Tạo tài khoản mới
                </Link>
              </p>
            </>
          ) : me.isError ? (
            <>
              <Alert tone="warning" announce="status">
                Không xác định được trạng thái đăng nhập do không kết nối được máy chủ.
              </Alert>
              <Button variant="secondary" onClick={() => void me.refetch()}>
                Thử lại
              </Button>
            </>
          ) : accept.isSuccess ? (
            <>
              <Alert tone="success" title="Đã tham gia">
                Bạn đã đồng ý lời mời và có thể xem hồ sơ theo đúng quyền ở trên.
              </Alert>
              <ButtonLink to="/app">Mở ứng dụng</ButtonLink>
            </>
          ) : (
            <>
              <Button onClick={acceptOnce} disabled={accept.isPending}>
                {accept.isPending ? 'Đang gửi…' : 'Đồng ý tham gia'}
              </Button>
              {acceptError ? (
                <Alert tone="error" title="Chưa chấp nhận được lời mời">
                  {acceptError}
                </Alert>
              ) : null}
            </>
          )}
        </div>
      </>
    );
  } else {
    content = null;
  }

  return (
    <div className="auth-page">
      <SkipLink />
      <header className="auth-topbar">
        <div className="auth-topbar__inner">
          <Link to="/" className="brand">
            Theo dõi sức khỏe
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="auth-body">
        <div className="auth-columns auth-columns--single">
          <section className="auth-panel auth-panel--wide" aria-labelledby="invite-title">
            {content}
            <p className="auth-footnote">Dữ liệu mô phỏng · không thay thế cấp cứu.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
