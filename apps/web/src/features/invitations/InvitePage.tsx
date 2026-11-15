import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Alert } from '../../components/Alert';
import { Button, ButtonLink } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { SkipLink } from '../../components/SkipLink';
import { formatDateTime } from '../../lib/format';
import { getApiErrorMessage, isNotFoundError, isUnauthorizedError } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { useMe } from '../auth/useAuth';
import { acceptInvitation, fetchPublicInvitation } from './api';
import type { PublicInvitation } from '@annhien/contracts/care';

function describePermissions(invitation: PublicInvitation): string {
  const parts: string[] = [`xem lịch sử tối đa ${invitation.permissions.historyDays} ngày`];
  parts.push(invitation.permissions.canReceiveAlerts ? 'nhận cảnh báo' : 'không nhận cảnh báo');
  parts.push(invitation.permissions.canAcknowledge ? 'xác nhận hỗ trợ' : 'không xác nhận');
  parts.push(invitation.permissions.canResolve ? 'đóng cảnh báo' : 'không đóng cảnh báo');
  parts.push(invitation.permissions.canViewAi ? 'xem tóm tắt AI' : 'không xem AI');
  return parts.join(' · ');
}

/**
 * Trang xem lời mời chia sẻ hồ sơ.
 * - GET /invitations/:token trả 404 → lời mời không hợp lệ/hết hạn/thu hồi.
 * - Không hiển thị email người được mời hay dữ liệu sức khỏe (hợp đồng preview).
 * - Chưa đăng nhập → nút "Đăng nhập để tiếp tục" (giữ next về trang lời mời).
 * - Đã đăng nhập → "Đồng ý tham gia"; sau khi chấp nhận mở /app và làm mới hồ sơ.
 */
export function InvitePage() {
  const { token = '' } = useParams();
  const me = useMe();
  const queryClient = useQueryClient();
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const invitation = useQuery({
    queryKey: queryKeys.invitation(token),
    queryFn: ({ signal }) => fetchPublicInvitation(token, signal),
    retry: false,
    staleTime: 30_000,
  });

  const accept = useMutation({
    mutationFn: () => acceptInvitation(token),
    onSuccess: () => {
      setAcceptError(null);
      // Hồ sơ mới xuất hiện trong danh sách — làm mới để shell/dashboard cập nhật.
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjects });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
    onError: (error) => setAcceptError(getApiErrorMessage(error)),
  });

  return (
    <div className="public">
      <SkipLink />
      <header className="auth-header">
        <Link to="/" className="brand">
          An Nhiên
        </Link>
      </header>
      <main id="main" tabIndex={-1} className="auth-main">
        <section className="auth-card" aria-labelledby="invite-title">
          {invitation.isPending ? (
            <PageLoader label="Đang kiểm tra lời mời…" />
          ) : invitation.isError ? (
            isNotFoundError(invitation.error) ? (
              <>
                <h1 id="invite-title" className="auth-card__title">
                  Lời mời không hợp lệ
                </h1>
                <Alert tone="warning">
                  Lời mời này không tồn tại hoặc đã hết hạn.
                </Alert>
                <p className="auth-footer">
                  <Link to="/">Về trang chủ</Link>
                </p>
              </>
            ) : (
              <ErrorState
                title="Không kiểm tra được lời mời"
                message="Không kết nối được máy chủ hoặc lời mời đang gặp lỗi. Hãy thử lại."
                onRetry={() => void invitation.refetch()}
              />
            )
          ) : invitation.isSuccess ? (
            <>
              <h1 id="invite-title" className="auth-card__title">
                Lời mời theo dõi
              </h1>
              <p className="auth-card__intro">
                {invitation.data.inviterName} mời bạn cùng theo dõi hồ sơ{' '}
                <strong>{invitation.data.subjectName}</strong>.
              </p>
              <div className="stack" style={{ gap: '0.75rem' }}>
                <p>
                  <strong>Quyền khi chấp nhận:</strong>{' '}
                  {describePermissions(invitation.data)}
                </p>
                <p>
                  <strong>Hết hạn:</strong> {formatDateTime(invitation.data.expiresAt)}
                </p>
              </div>
              <div style={{ marginTop: '1.5rem' }}>
                {me.isPending ? (
                  <p className="subject-switcher__hint">Đang kiểm tra trạng thái đăng nhập…</p>
                ) : me.isError && isUnauthorizedError(me.error) ? (
                  <div className="stack" style={{ gap: '0.75rem' }}>
                    <ButtonLink to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>
                      Đăng nhập để tiếp tục
                    </ButtonLink>
                    <p className="auth-footer" style={{ marginTop: 0 }}>
                      Chưa có tài khoản?{' '}
                      <Link
                        to={`/register?next=${encodeURIComponent(`/invite/${token}`)}`}
                      >
                        Tạo tài khoản mới
                      </Link>
                    </p>
                  </div>
                ) : me.isError ? (
                  <Alert tone="error">
                    Không xác định được trạng thái đăng nhập (không kết nối được máy chủ). Thử
                    lại sau.
                  </Alert>
                ) : accept.isSuccess ? (
                  <>
                    <Alert tone="success" title="Đã tham gia">
                      Bạn đã đồng ý lời mời.
                    </Alert>
                    <div style={{ marginTop: '1rem' }}>
                      <ButtonLink to="/app">Mở ứng dụng</ButtonLink>
                    </div>
                  </>
                ) : (
                  <div className="stack" style={{ gap: '0.75rem' }}>
                    <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
                      {accept.isPending ? 'Đang gửi…' : 'Đồng ý tham gia'}
                    </Button>
                    {acceptError ? (
                      <Alert tone="error" title="Chưa chấp nhận được lời mời">
                        {acceptError}
                      </Alert>
                    ) : null}
                  </div>
                )}
              </div>
              <p className="auth-note">Dữ liệu mô phỏng · không thay thế cấp cứu.</p>
            </>
          ) : null}
        </section>
      </main>
    </div>
  );
}
