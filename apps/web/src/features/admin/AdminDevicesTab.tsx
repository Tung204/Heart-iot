import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { DeviceAdminSummary } from '@annhien/contracts/devices';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import type { PillTone } from '../../components/StatusPill';
import { getApiErrorMessage } from '../../lib/api';
import { formatDateTime, formatRelativeTime } from '../../lib/format';
import {
  adminQueryKeys,
  fetchAdminDevices,
  fetchPolicyState,
  issueAdminClaimCode,
  rotateAdminDeviceKey,
} from './api';
import './admin-devices.css';

const DEVICE_STATUS_LABELS: Record<string, string> = {
  active: 'Đã kích hoạt',
  disabled: 'Đã vô hiệu hóa',
};

const DEVICE_STATUS_TONES: Record<string, PillTone> = {
  active: 'teal',
  disabled: 'brick',
};

type ConnectionState = 'online' | 'offline' | 'never' | 'unknown';

const CONNECTION_LABELS: Record<ConnectionState, string> = {
  online: 'Trực tuyến',
  offline: 'Ngoại tuyến',
  never: 'Chưa từng kết nối',
  unknown: 'Chưa rõ kết nối',
};

const CONNECTION_TONES: Record<ConnectionState, PillTone> = {
  online: 'teal',
  offline: 'brick',
  never: 'neutral',
  unknown: 'neutral',
};

type OneTimeSecret = {
  kind: 'claim' | 'key';
  deviceId: string;
  deviceLabel: string;
  deviceSerial: string;
  value: string;
  expiresAt: string | null;
};

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Kết nối chỉ suy ra từ `lastSeenAt` và ngưỡng ngoại tuyến của policy đang áp dụng.
 * Không có policy thì trả `unknown` — không đoán trực tuyến/ngoại tuyến.
 */
function connectionState(
  lastSeenAt: string | null,
  offlineAfterSeconds: number | undefined,
  now = Date.now(),
): ConnectionState {
  if (!lastSeenAt) return 'never';
  if (offlineAfterSeconds === undefined) return 'unknown';
  const seen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seen)) return 'unknown';
  return now - seen <= offlineAfterSeconds * 1000 ? 'online' : 'offline';
}

function DeviceSecretPanel({
  secret,
  copyState,
  onCopy,
  onDismiss,
}: {
  secret: OneTimeSecret;
  copyState: CopyState;
  onCopy: () => void;
  onDismiss: () => void;
}) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isClaim = secret.kind === 'claim';

  // Đưa focus tới tiêu đề để người dùng bàn phím/screen reader biết vùng mã vừa xuất hiện.
  useEffect(() => {
    headingRef.current?.focus();
  }, [secret.kind, secret.value]);

  return (
    <section className="adm-device-secret" aria-labelledby={headingId}>
      <div className="adm-device-secret__head">
        <h2 id={headingId} className="section-title" tabIndex={-1} ref={headingRef}>
          {isClaim ? 'Mã gắn thiết bị mới' : 'Khóa thiết bị mới'}
        </h2>
        <StatusPill tone="sand">Chỉ hiển thị một lần</StatusPill>
      </div>
      <p className="adm-device-secret__lead">
        {isClaim ? 'Mã gắn thiết bị' : 'Khóa thiết bị'} cho{' '}
        <strong>{secret.deviceLabel || secret.deviceSerial}</strong>{' '}
        <span className="adm-device__serial">(serial {secret.deviceSerial})</span>.
      </p>
      <p className="adm-device-secret__value">
        <code>{secret.value}</code>
      </p>
      <div className="adm-device-secret__actions">
        <Button variant="secondary" size="sm" onClick={onCopy}>
          {copyState === 'copied'
            ? 'Đã sao chép'
            : isClaim
              ? 'Sao chép mã'
              : 'Sao chép khóa'}
        </Button>
        <Button variant="subtle" size="sm" onClick={onDismiss}>
          Tôi đã lưu, ẩn đi
        </Button>
      </div>
      {copyState === 'copied' ? (
        <p className="field__hint" role="status">
          Đã sao chép vào bộ nhớ tạm. Hãy dán vào nơi cần dùng rồi xóa khỏi bộ nhớ tạm.
        </p>
      ) : null}
      {copyState === 'failed' ? (
        <p className="field__hint" role="status">
          Trình duyệt không cho phép sao chép tự động. Hãy chọn nội dung trong ô trên và sao chép
          thủ công.
        </p>
      ) : null}
      {isClaim && secret.expiresAt ? (
        <p className="field__hint">Mã hết hạn lúc {formatDateTime(secret.expiresAt)}.</p>
      ) : null}
      <p className="adm-device-secret__warning">
        <strong>Không chia sẻ {isClaim ? 'mã này' : 'khóa này'} qua email, tin nhắn hay ảnh chụp màn hình.</strong>{' '}
        {isClaim
          ? 'Mã dùng một lần để gắn thiết bị vào hồ sơ.'
          : 'Thiết bị chỉ gửi được dữ liệu sau khi cấu hình khóa mới.'}{' '}
        Sau khi ẩn, không xem lại được — nếu mất phải tạo lại.
      </p>
    </section>
  );
}

/**
 * Tab Thiết bị trong Admin (FR-11):
 * - Đọc GET /admin/devices (serial, nhãn, trạng thái, hồ sơ đang gắn, firmware, lần thấy cuối).
 * - Tạo claim code / rotate key qua endpoint admin; mã và khóa chỉ hiển thị một lần.
 * - Không hiển thị nhịp tim hay bất kỳ dữ liệu sức khỏe nào; API admin cũng không trả các trường đó.
 */
export function AdminDevicesTab() {
  const [secret, setSecret] = useState<OneTimeSecret | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [rotateTargetId, setRotateTargetId] = useState<string | null>(null);

  const devices = useQuery({
    queryKey: adminQueryKeys.devices,
    queryFn: ({ signal }) => fetchAdminDevices(signal),
    staleTime: 15_000,
  });

  // Ngưỡng offline của policy giúp nhãn kết nối khớp với tổng quan admin.
  const policy = useQuery({
    queryKey: adminQueryKeys.policy('device_runtime'),
    queryFn: ({ signal }) => fetchPolicyState('device_runtime', signal),
    staleTime: 60_000,
  });

  const issueClaim = useMutation({
    mutationFn: (device: DeviceAdminSummary) => issueAdminClaimCode(device.id),
    onSuccess: (result, device) => {
      setSecret({
        kind: 'claim',
        deviceId: device.id,
        deviceLabel: device.label,
        deviceSerial: device.serial,
        value: result.claimCode,
        expiresAt: result.expiresAt,
      });
      setCopyState('idle');
    },
  });

  const rotate = useMutation({
    mutationFn: (device: DeviceAdminSummary) => rotateAdminDeviceKey(device.id),
    onSuccess: (result, device) => {
      setSecret({
        kind: 'key',
        deviceId: device.id,
        deviceLabel: device.label,
        deviceSerial: device.serial,
        value: result.deviceKey,
        expiresAt: null,
      });
      setCopyState('idle');
      setRotateTargetId(null);
    },
  });

  const handleCopy = () => {
    if (!secret) return;
    if (!navigator.clipboard?.writeText) {
      setCopyState('failed');
      return;
    }
    void navigator.clipboard
      .writeText(secret.value)
      .then(() => setCopyState('copied'))
      .catch(() => setCopyState('failed'));
  };

  const handleDismissSecret = () => {
    setSecret(null);
    setCopyState('idle');
  };

  const startClaimCode = (device: DeviceAdminSummary) => {
    issueClaim.reset();
    rotate.reset();
    setRotateTargetId(null);
    issueClaim.mutate(device);
  };

  const startRotateConfirm = (device: DeviceAdminSummary) => {
    issueClaim.reset();
    rotate.reset();
    setRotateTargetId(device.id);
  };

  if (devices.isPending) return <PageLoader label="Đang tải danh sách thiết bị…" />;
  if (devices.isError) {
    return (
      <ErrorState
        title="Không tải được danh sách thiết bị"
        message={getApiErrorMessage(devices.error)}
        onRetry={() => void devices.refetch()}
      />
    );
  }

  const items = devices.data?.items ?? [];
  const offlineAfterSeconds = policy.data?.active.value.offlineAfterSeconds;

  return (
    <div className="stack">
      {secret ? (
        <DeviceSecretPanel
          secret={secret}
          copyState={copyState}
          onCopy={handleCopy}
          onDismiss={handleDismissSecret}
        />
      ) : null}

      {issueClaim.isError ? (
        <Alert tone="error" title="Không tạo được mã gắn thiết bị">
          {getApiErrorMessage(issueClaim.error)}
        </Alert>
      ) : null}
      {rotate.isError ? (
        <Alert tone="error" title="Không đổi được khóa thiết bị">
          {getApiErrorMessage(rotate.error)}
        </Alert>
      ) : null}

      <section aria-labelledby="admin-devices-heading">
        <div className="section-heading-row adm-device-toolbar">
          <h2 id="admin-devices-heading" className="section-title">
            Thiết bị đã đăng&nbsp;ký
          </h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void devices.refetch()}
            disabled={devices.isFetching}
          >
            {devices.isFetching ? 'Đang tải lại…' : 'Tải lại danh sách'}
          </Button>
        </div>
        <p className="field__hint">
          {policy.data
            ? `Kết nối tính theo policy v${policy.data.active.version}: ngoại tuyến sau ${policy.data.active.value.offlineAfterSeconds} giây không nhận dữ liệu.`
            : policy.isError
              ? 'Không tải được policy nên trang chỉ hiển thị lần thấy cuối, không kết luận trực tuyến/ngoại tuyến.'
              : 'Đang tải ngưỡng ngoại tuyến từ policy…'}
        </p>
        <p className="field__hint">
          Trang quản trị không hiển thị dữ liệu sức khỏe. API quản trị hiện chưa trả chỉ số pin;
          cột Pin ghi “chưa có thông tin” thay vì suy đoán.
        </p>

        {items.length === 0 ? (
          <EmptyState
            title="Chưa có thiết bị nào"
            description="Thiết bị được đăng ký qua quy trình triển khai sẽ xuất hiện tại đây để tạo mã gắn và đổi khóa."
          />
        ) : (
          <ul className="adm-device-list" aria-label="Danh sách thiết bị">
            {items.map((device) => {
              const connection = connectionState(device.lastSeenAt, offlineAfterSeconds);
              const statusLabel = DEVICE_STATUS_LABELS[device.status] ?? device.status;
              const statusTone = DEVICE_STATUS_TONES[device.status] ?? 'neutral';
              const relativeSeen = formatRelativeTime(device.lastSeenAt);
              const claimPending = issueClaim.isPending && issueClaim.variables?.id === device.id;
              const rotatePending = rotate.isPending && rotate.variables?.id === device.id;

              return (
                <li key={device.id} className="adm-device">
                  <div className="adm-device__head">
                    <div className="adm-device__identity">
                      <h3 className="adm-device__name">{device.label || device.serial}</h3>
                      <p className="adm-device__serial">
                        Serial <code>{device.serial}</code>
                      </p>
                    </div>
                    <div className="adm-device__pills">
                      <StatusPill tone={statusTone}>{statusLabel}</StatusPill>
                      <StatusPill tone={CONNECTION_TONES[connection]}>
                        {CONNECTION_LABELS[connection]}
                      </StatusPill>
                    </div>
                  </div>

                  <dl className="adm-device__facts">
                    <div>
                      <dt>Hồ sơ đang gắn</dt>
                      <dd>
                        {device.assignedSubjectId ? (
                          <code className="adm-device__id" title={device.assignedSubjectId}>
                            {device.assignedSubjectId}
                          </code>
                        ) : (
                          'Chưa gắn hồ sơ'
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Firmware</dt>
                      <dd>{device.firmwareVersion ?? 'Chưa báo cáo'}</dd>
                    </div>
                    <div>
                      <dt>Lần thấy cuối</dt>
                      <dd>
                        {device.lastSeenAt ? (
                          <>
                            {formatDateTime(device.lastSeenAt)}
                            {relativeSeen ? ` · ${relativeSeen}` : ''}
                          </>
                        ) : (
                          'Chưa từng kết nối'
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Pin</dt>
                      <dd>Chưa có thông tin pin</dd>
                    </div>
                  </dl>

                  <div className="adm-device__actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => startClaimCode(device)}
                      disabled={issueClaim.isPending || rotate.isPending}
                    >
                      {claimPending ? 'Đang tạo mã…' : 'Tạo mã gắn thiết bị'}
                    </Button>
                    {rotateTargetId === device.id ? (
                      <div
                        className="adm-device__confirm"
                        role="group"
                        aria-label={`Xác nhận đổi khóa cho thiết bị ${device.serial}`}
                      >
                        <p>
                          Đổi khóa sẽ khiến thiết bị đang dùng khóa cũ không gửi được dữ liệu cho
                          đến khi cấu hình khóa mới. Không thể hoàn tác.
                        </p>
                        <div className="adm-device__confirm-actions">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => rotate.mutate(device)}
                            disabled={rotate.isPending}
                          >
                            {rotatePending ? 'Đang đổi khóa…' : 'Xác nhận đổi khóa'}
                          </Button>
                          <Button
                            variant="subtle"
                            size="sm"
                            onClick={() => setRotateTargetId(null)}
                            disabled={rotate.isPending}
                          >
                            Hủy
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="danger-quiet"
                        size="sm"
                        onClick={() => startRotateConfirm(device)}
                        disabled={issueClaim.isPending || rotate.isPending}
                      >
                        Đổi khóa thiết bị
                      </Button>
                    )}
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
