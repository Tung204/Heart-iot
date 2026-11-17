import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { getApiErrorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import type { SessionSummary } from '@heart-iot/contracts/auth';
import { useRevokeOtherSessions, useRevokeSession, useSessions } from './useAccountSettings';

/**
 * Phiên đăng nhập: chỉ hiển thị phiên còn hiệu lực của chính mình (server trả),
 * đánh dấu "Thiết bị này" cho phiên hiện tại và cho thu hồi các phiên khác.
 * Phiên hiện tại không có nút thu hồi — kết thúc nó bằng “Đăng xuất”.
 * Xác nhận hai bước: Escape huỷ và trả focus về đúng nút đã mở.
 */
export function SessionsCard() {
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const pendingFocusRef = useRef<string | null>(null);
  const othersTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  // Xác nhận mở ra thì đưa focus vào “Hủy”: bàn phím/đọc màn hình thấy ngay và
  // Escape huỷ được (không đặt focus lên hành động phá huỷ).
  useEffect(() => {
    if (confirmId || confirmOthers) cancelButtonRef.current?.focus();
  }, [confirmId, confirmOthers]);

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
      onError: (error) =>
        setActionError(
          `${getApiErrorMessage(error)} Danh sách được tải lại để phản ánh trạng thái mới nhất.`,
        ),
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
      onError: (error) =>
        setActionError(
          `${getApiErrorMessage(error)} Danh sách được tải lại để phản ánh trạng thái mới nhất.`,
        ),
    });
  };

  const cancelConfirm = (sessionId?: string) => {
    if (sessionId) pendingFocusRef.current = sessionId;
    setConfirmId(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>, sessionId?: string) => {
    if (event.key !== 'Escape' || pending) return;
    event.preventDefault();
    event.stopPropagation();
    if (sessionId) {
      cancelConfirm(sessionId);
      return;
    }
    setConfirmOthers(false);
    othersTriggerRef.current?.focus();
  };

  return (
    <section className="people-settings-section" aria-labelledby="settings-sessions-heading">
      <div className="people-settings-section__head">
        <h2 id="settings-sessions-heading" className="people-settings-section__title">
          Phiên đăng nhập
        </h2>
        <p className="people-settings-section__lead">
          Mỗi thiết bị đăng nhập tạo một phiên. Hãy thu hồi phiên bạn không nhận ra.
        </p>
      </div>
      <div className="people-settings-section__body">
        {status ? <Alert tone="success">{status}</Alert> : null}
        {actionError ? (
          <Alert tone="error" title="Chưa thu hồi được phiên">
            {actionError}
          </Alert>
        ) : null}

        {sessions.isPending ? (
          <PageLoader label="Đang tải phiên đăng nhập…" />
        ) : sessions.isError ? (
          <>
            <Alert tone="error" title="Không tải được phiên đăng nhập">
              {getApiErrorMessage(sessions.error)} Kiểm tra kết nối và thử lại.
            </Alert>
            <div className="people-actions">
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
            headingLevel={3}
            title="Không có phiên đăng nhập nào"
            description="Phiên của bạn có thể đã hết hạn. Hãy đăng nhập lại."
          />
        ) : (
          <ul className="people-list" aria-label="Các phiên đăng nhập">
            {items.map((session) =>
              session.current ? (
                <CurrentSessionRow key={session.id} session={session} />
              ) : (
                <li key={session.id} className="people-row">
                  <div className="people-row__identity">
                    <p className="people-row__name">
                      <StatusPill tone="neutral">Thiết bị khác</StatusPill>
                    </p>
                    <dl className="people-kv">
                      <dt>Đăng nhập lúc</dt>
                      <dd>
                        <time dateTime={session.createdAt}>
                          {formatDateTime(session.createdAt)}
                        </time>
                      </dd>
                      <dt>Hết hạn</dt>
                      <dd>
                        <time dateTime={session.expiresAt}>
                          {formatDateTime(session.expiresAt)}
                        </time>
                      </dd>
                    </dl>
                  </div>
                  <div className="people-row__actions">
                    {confirmId === session.id ? (
                      <div
                        className="people-confirm"
                        role="group"
                        aria-label="Xác nhận thu hồi phiên"
                        onKeyDown={(event) => handleKeyDown(event, session.id)}
                      >
                        <p className="people-confirm__text">
                          Thu hồi phiên này? Thiết bị đó sẽ phải đăng nhập lại.
                        </p>
                        <div className="people-confirm__actions">
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={pending}
                            onClick={() => revokeOne(session.id)}
                          >
                            {pending ? 'Đang thu hồi…' : 'Xác nhận thu hồi'}
                          </Button>
                          <Button
                            ref={cancelButtonRef}
                            variant="subtle"
                            size="sm"
                            disabled={pending}
                            onClick={() => cancelConfirm(session.id)}
                          >
                            Hủy
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        ref={(element) => {
                          if (!element) return;
                          triggerRefs.current.set(session.id, element);
                          if (pendingFocusRef.current === session.id) {
                            pendingFocusRef.current = null;
                            element.focus();
                          }
                        }}
                        variant="secondary"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          setActionError(null);
                          setStatus(null);
                          setConfirmOthers(false);
                          setConfirmId(session.id);
                        }}
                        aria-label={`Thu hồi phiên đăng nhập lúc ${formatDateTime(session.createdAt)}`}
                      >
                        Thu hồi
                      </Button>
                    )}
                  </div>
                </li>
              ),
            )}
          </ul>
        )}

        {sessions.isSuccess && otherCount > 0 ? (
          <div className="settings-all-others">
            {confirmOthers ? (
              <div
                className="people-confirm"
                role="group"
                aria-label="Xác nhận thu hồi tất cả phiên khác"
                onKeyDown={(event) => handleKeyDown(event)}
              >
                <p className="people-confirm__text">
                  Thu hồi tất cả {otherCount} phiên khác? Các thiết bị đó sẽ phải đăng nhập lại.
                  Thiết bị này vẫn giữ đăng nhập.
                </p>
                <div className="people-confirm__actions">
                  <Button variant="danger" size="sm" disabled={pending} onClick={revokeAllOthers}>
                    {revokeOthers.isPending ? 'Đang thu hồi…' : 'Xác nhận thu hồi tất cả'}
                  </Button>
                  <Button
                    ref={cancelButtonRef}
                    variant="subtle"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      setConfirmOthers(false);
                      othersTriggerRef.current?.focus();
                    }}
                  >
                    Hủy
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                ref={othersTriggerRef}
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
      </div>
    </section>
  );
}

function CurrentSessionRow({ session }: { session: SessionSummary }) {
  return (
    <li className="people-row">
      <div className="people-row__identity">
        <p className="people-row__name">
          <StatusPill tone="success">Thiết bị này</StatusPill>
        </p>
        <dl className="people-kv">
          <dt>Đăng nhập lúc</dt>
          <dd>
            <time dateTime={session.createdAt}>{formatDateTime(session.createdAt)}</time>
          </dd>
          <dt>Hết hạn</dt>
          <dd>
            <time dateTime={session.expiresAt}>{formatDateTime(session.expiresAt)}</time>
          </dd>
        </dl>
      </div>
      <div className="people-row__actions">
        <p className="people-meta">
          Phiên bạn đang dùng. Dùng nút “Đăng xuất” trong menu tài khoản để kết thúc phiên này.
        </p>
      </div>
    </li>
  );
}
