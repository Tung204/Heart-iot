import { useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { getApiErrorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import type { SessionSummary } from '@annhien/contracts/auth';
import { useRevokeOtherSessions, useRevokeSession, useSessions } from './useAccountSettings';

/**
 * Phiên đăng nhập: chỉ hiển thị phiên còn hiệu lực của chính mình (server trả),
 * đánh dấu "Thiết bị này" cho phiên hiện tại và cho thu hồi các phiên khác.
 * Không hiển thị token hay thông tin thiết bị do server không cung cấp.
 */
export function SessionsCard() {
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const pending = revoke.isPending || revokeOthers.isPending;
  const items = sessions.data ?? [];
  const otherCount = items.filter((item) => !item.current).length;

  const revokeOne = (sessionId: string) => {
    setActionError(null);
    setStatus(null);
    revoke.mutate(sessionId, {
      onSuccess: () => {
        setConfirmId(null);
        setStatus('Đã thu hồi phiên đăng nhập đã chọn. Thiết bị đó cần đăng nhập lại.');
      },
      onError: (error) => setActionError(getApiErrorMessage(error)),
    });
  };

  const revokeAllOthers = () => {
    setActionError(null);
    setStatus(null);
    revokeOthers.mutate(undefined, {
      onSuccess: () => {
        setConfirmOthers(false);
        setStatus('Đã thu hồi tất cả phiên đăng nhập khác. Chỉ thiết bị này còn đăng nhập.');
      },
      onError: (error) => setActionError(getApiErrorMessage(error)),
    });
  };

  return (
    <Card
      title="Phiên đăng nhập"
      description="Mỗi thiết bị đăng nhập tạo một phiên. Hãy thu hồi phiên bạn không nhận ra."
    >
      {status ? <Alert tone="success">{status}</Alert> : null}
      {actionError ? (
        <Alert tone="error" title="Chưa thu hồi được phiên">
          {actionError} Danh sách bên dưới được tải lại để phản ánh trạng thái mới nhất.
        </Alert>
      ) : null}

      {sessions.isPending ? (
        <PageLoader label="Đang tải phiên đăng nhập…" />
      ) : sessions.isError ? (
        <>
          <Alert tone="error" title="Không tải được phiên đăng nhập">
            {getApiErrorMessage(sessions.error)} Kiểm tra kết nối và thử lại.
          </Alert>
          <div className="settings-actions-row">
            <Button
              variant="secondary"
              onClick={() => void sessions.refetch()}
              disabled={sessions.isFetching}
            >
              {sessions.isFetching ? 'Đang thử lại…' : 'Thử lại'}
            </Button>
          </div>
        </>
      ) : items.length === 0 ? (
        <EmptyState
          title="Không có phiên đăng nhập nào"
          description="Phiên của bạn có thể đã hết hạn. Hãy đăng nhập lại."
        />
      ) : (
        <ul className="settings-sessions" aria-label="Các phiên đăng nhập">
          {items.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              pending={pending}
              confirming={confirmId === session.id}
              onAskConfirm={() => {
                setActionError(null);
                setStatus(null);
                setConfirmOthers(false);
                setConfirmId(session.id);
              }}
              onCancel={() => setConfirmId(null)}
              onConfirm={() => revokeOne(session.id)}
            />
          ))}
        </ul>
      )}

      {sessions.isSuccess && otherCount > 0 ? (
        <div className="settings-actions-row settings-actions-row--end">
          {confirmOthers ? (
            <div className="confirm-box" role="group" aria-label="Xác nhận thu hồi tất cả phiên khác">
              <p>
                Thu hồi tất cả {otherCount} phiên khác? Các thiết bị đó sẽ phải đăng nhập lại.
                Thiết bị này vẫn giữ đăng nhập.
              </p>
              <div>
                <Button variant="danger" size="sm" disabled={pending} onClick={revokeAllOthers}>
                  {revokeOthers.isPending ? 'Đang thu hồi…' : 'Xác nhận thu hồi tất cả'}
                </Button>
                <Button variant="subtle" size="sm" disabled={pending} onClick={() => setConfirmOthers(false)}>
                  Hủy
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => {
                setActionError(null);
                setStatus(null);
                setConfirmId(null);
                setConfirmOthers(true);
              }}
            >
              Thu hồi tất cả phiên khác
            </Button>
          )}
        </div>
      ) : null}
    </Card>
  );
}

interface SessionRowProps {
  session: SessionSummary;
  pending: boolean;
  confirming: boolean;
  onAskConfirm: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function SessionRow({
  session,
  pending,
  confirming,
  onAskConfirm,
  onCancel,
  onConfirm,
}: SessionRowProps) {
  return (
    <li className="settings-session">
      <div className="settings-session__main">
        <p className="settings-session__title">
          {session.current ? (
            <StatusPill tone="teal">Thiết bị này</StatusPill>
          ) : (
            <StatusPill tone="neutral">Thiết bị khác</StatusPill>
          )}
        </p>
        <p className="settings-session__meta">
          Đăng nhập lúc:{' '}
          <time dateTime={session.createdAt}>{formatDateTime(session.createdAt)}</time>
        </p>
        <p className="settings-session__meta">
          Hết hạn lúc: <time dateTime={session.expiresAt}>{formatDateTime(session.expiresAt)}</time>
        </p>
      </div>
      <div className="settings-session__actions">
        {session.current ? (
          <p className="settings-session__note">
            Phiên bạn đang dùng. Dùng “Đăng xuất” trong menu tài khoản để kết thúc phiên này.
          </p>
        ) : confirming ? (
          <div className="confirm-box" role="group" aria-label="Xác nhận thu hồi phiên">
            <p>Thu hồi phiên này? Thiết bị đó sẽ phải đăng nhập lại.</p>
            <div>
              <Button variant="danger" size="sm" disabled={pending} onClick={onConfirm}>
                {pending ? 'Đang thu hồi…' : 'Xác nhận thu hồi'}
              </Button>
              <Button variant="subtle" size="sm" disabled={pending} onClick={onCancel}>
                Hủy
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={onAskConfirm}
            aria-label={`Thu hồi phiên đăng nhập lúc ${formatDateTime(session.createdAt)}`}
          >
            Thu hồi
          </Button>
        )}
      </div>
    </li>
  );
}
