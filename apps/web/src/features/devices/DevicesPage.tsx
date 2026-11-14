import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/Alert';
import { Button, ButtonLink } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { TextField } from '../../components/Field';
import { formatDateTime, formatRelativeTime } from '../../lib/format';
import { getApiErrorMessage } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { zodFieldErrorMap } from '../../lib/validation';
import { useActiveSubject } from '../subjects/selection';
import { useSubjects } from '../subjects/useSubjects';
import { claimDevice, claimDeviceSchema, fetchSubjectDevices, releaseDevice } from './api';

const FRESHNESS_LABELS = {
  live: 'Trực tuyến',
  stale: 'Chưa cập nhật gần đây',
  offline: 'Ngoại tuyến',
  never: 'Chưa từng kết nối',
} as const;

const FRESHNESS_TONES = {
  live: 'teal',
  stale: 'sand',
  offline: 'brick',
  never: 'neutral',
} as const;

/**
 * /app/devices — quản lý thiết bị của hồ sơ đang xem:
 * - Trạng thái thiết bị (online/stale/offline/never + lần nhận cuối + pin).
 * - Nhập claim code để gắn thiết bị; tháo gắn có xác nhận hai bước.
 */
export function DevicesPage() {
  const subjects = useSubjects();
  const activeSubject = useActiveSubject(subjects.data);
  const queryClient = useQueryClient();
  const [claimCode, setClaimCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ fields: Record<string, string>; general: string[] }>({
    fields: {},
    general: [],
  });
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);

  const devices = useQuery({
    queryKey: activeSubject ? queryKeys.subjectDevices(activeSubject.id) : ['subjects', 'none', 'devices'],
    queryFn: ({ signal }) => (activeSubject ? fetchSubjectDevices(activeSubject.id, signal) : null),
    enabled: Boolean(activeSubject),
    staleTime: 15_000,
  });

  const claim = useMutation({
    mutationFn: () => {
      if (!activeSubject) throw new Error('Chưa chọn hồ sơ.');
      return claimDevice(activeSubject.id, { claimCode });
    },
    onSuccess: () => {
      setClaimCode('');
      setClaimOpen(false);
      setFieldErrors({ fields: {}, general: [] });
      if (activeSubject) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.subjectDevices(activeSubject.id) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.subjectStatus(activeSubject.id) });
      }
    },
  });

  const release = useMutation({
    mutationFn: (deviceId: string) => releaseDevice(deviceId),
    onSuccess: () => {
      setReleasingId(null);
      if (activeSubject) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.subjectDevices(activeSubject.id) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.subjectStatus(activeSubject.id) });
      }
    },
  });

  if (!activeSubject && !subjects.isPending && !subjects.isError) {
    return (
      <EmptyState
        title="Chưa có hồ sơ để gắn thiết bị"
        description="Tạo hồ sơ cho người cần theo dõi hoặc chọn hồ sơ ở đầu trang."
        action={<ButtonLink to="/app/subjects">Tạo hồ sơ</ButtonLink>}
      />
    );
  }

  const handleClaim = (event: FormEvent) => {
    event.preventDefault();
    const parsed = claimDeviceSchema.safeParse({ claimCode });
    if (!parsed.success) {
      setFieldErrors(
        zodFieldErrorMap(parsed.error, { claimCode }, {
          claimCode: (issue, value) => {
            if (String(value ?? '').trim() === '') return 'Vui lòng nhập mã gắn thiết bị.';
            if (issue.code === 'too_small') return 'Mã gắn thiết bị quá ngắn.';
            if (issue.code === 'too_big') return 'Mã gắn thiết bị quá dài.';
            return 'Mã gắn thiết bị chưa hợp lệ.';
          },
        }),
      );
      return;
    }
    setFieldErrors({ fields: {}, general: [] });
    claim.mutate();
  };

  const hasDevices = (devices.data?.items.length ?? 0) > 0;
  const showClaimForm = claimOpen || !hasDevices;

  return (
    <div className="stack">
      <header>
        <h1 className="page-title">Thiết bị</h1>
        <p className="page-lead">
          Trạng thái và quản lý thiết bị đeo của hồ sơ{' '}
          <strong>{activeSubject ? activeSubject.displayName : '—'}</strong>.
        </p>
      </header>

      <section aria-labelledby="device-list-heading">
        <h2 id="device-list-heading" className="section-title">
          Thiết bị đang gắn
        </h2>
        {devices.isPending ? (
          <PageLoader label="Đang tải danh sách thiết bị…" />
        ) : devices.isError ? (
          <ErrorState
            title="Không tải được danh sách thiết bị"
            message={getApiErrorMessage(devices.error)}
            onRetry={() => void devices.refetch()}
          />
        ) : devices.data && devices.data.items.length === 0 ? (
          <EmptyState
            title="Chưa gắn thiết bị nào"
            description="Dùng mã gắn thiết bị (claim code) nhận từ thiết bị đeo hoặc bộ dụng cụ để kết nối."
          />
        ) : (
          <ul className="device-list">
            {(devices.data?.items ?? []).map((device) => (
              <li key={device.deviceId} className="device-card">
                <div className="device-card__main">
                  <p className="device-card__title">
                    {device.label || device.serial}
                    <StatusPill tone={FRESHNESS_TONES[device.freshness]}>
                      {FRESHNESS_LABELS[device.freshness]}
                    </StatusPill>
                  </p>
                  <p className="device-card__meta">
                    Serial {device.serial}
                    {device.lastSeenAt
                      ? ` · lần nhận cuối ${formatDateTime(device.lastSeenAt)} (${formatRelativeTime(device.lastSeenAt)})`
                      : ' · chưa nhận dữ liệu'}
                    {device.firmwareVersion ? ` · firmware ${device.firmwareVersion}` : ''}
                  </p>
                  <p className="device-card__meta">
                    Nhịp tim gần nhất:{' '}
                    {device.lastHeartRateBpm !== null &&
                    device.lastHeartRateQuality === 'valid' ? (
                      <strong>{device.lastHeartRateBpm} bpm</strong>
                    ) : (
                      'chưa có mẫu hợp lệ'
                    )}{' '}
                    · Pin:{' '}
                    {device.batteryPercent !== null ? (
                      <strong>{device.batteryPercent}%</strong>
                    ) : (
                      'chưa có thông tin'
                    )}
                  </p>
                </div>
                <div className="device-card__actions">
                  {releasingId === device.deviceId ? (
                    <div className="confirm-box" role="group" aria-label="Xác nhận tháo gắn">
                      <p>Tháo gắn thiết bị này? Dữ liệu đo mới sẽ dừng cập nhật.</p>
                      <div>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={release.isPending}
                          onClick={() => release.mutate(device.deviceId)}
                        >
                          {release.isPending ? 'Đang tháo…' : 'Xác nhận tháo gắn'}
                        </Button>
                        <Button
                          variant="subtle"
                          size="sm"
                          onClick={() => setReleasingId(null)}
                          disabled={release.isPending}
                        >
                          Hủy
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => setReleasingId(device.deviceId)}>
                      Tháo gắn
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {release.isError ? (
          <Alert tone="error">{getApiErrorMessage(release.error)}</Alert>
        ) : null}
      </section>

      <section aria-labelledby="claim-heading">
        <div className="section-heading-row">
          <h2 id="claim-heading" className="section-title">
            Gắn thiết bị mới
          </h2>
          {hasDevices && !claimOpen ? (
            <Button variant="secondary" size="sm" onClick={() => setClaimOpen(true)}>
              Nhập mã gắn thiết bị
            </Button>
          ) : null}
        </div>
        {!showClaimForm ? (
          <p className="field__hint">
            Mỗi hồ sơ có thể gắn một thiết bị đeo. Tháo gắn thiết bị cũ trước khi gắn thiết bị
            khác.
          </p>
        ) : (
        <Card description="Nhập mã gắn thiết bị (9 ký tự, không dùng số 0/1) từ thiết bị đeo. Mã chỉ dùng được một lần và hết hạn sau 15 phút.">
          <form className="claim-form" onSubmit={handleClaim} noValidate>
            <TextField
              id="claim-code"
              label="Mã gắn thiết bị"
              required
              value={claimCode}
              error={fieldErrors.fields.claimCode}
              hint="Ví dụ: A3B7K9Q2W. Kiểm tra hướng dẫn đi kèm thiết bị nếu chưa có mã."
              onChange={(event) => setClaimCode(event.target.value.toUpperCase())}
              autoComplete="off"
              maxLength={128}
              spellCheck={false}
            />
            {claim.isError ? (
              <Alert tone="error">{getApiErrorMessage(claim.error)}</Alert>
            ) : null}
            {fieldErrors.general.length > 0 ? (
              <p className="field__error" role="alert">
                {fieldErrors.general.join(' ')}
              </p>
            ) : null}
            <div>
              <Button type="submit" disabled={claim.isPending || !activeSubject}>
                {claim.isPending ? 'Đang gắn…' : 'Gắn thiết bị'}
              </Button>
            </div>
          </form>
        </Card>
        )}
      </section>
    </div>
  );
}
