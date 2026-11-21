import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert } from '../../components/Alert';
import { Button, ButtonLink } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { TextField } from '../../components/Field';
import type { PillTone } from '../../components/StatusPill';
import { formatDateTime, formatRelativeTime } from '../../lib/format';
import { getApiErrorMessage } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { zodFieldErrorMap } from '../../lib/validation';
import { useActiveSubject } from '../subjects/selection';
import { useSubjects } from '../subjects/useSubjects';
import { claimDevice, claimDeviceSchema, fetchSubjectDevices, releaseDevice } from './api';
import '../../styles/people.css';
import './devices.css';

const FRESHNESS_LABELS = {
  live: 'Dữ liệu mới',
  stale: 'Chưa cập nhật gần đây',
  offline: 'Ngoại tuyến',
  never: 'Chưa từng kết nối',
} as const;

/**
 * Freshness chỉ dùng amber/neutral: offline/stale của thiết bị không phải sự cố
 * an toàn như incident nên không tô đỏ khẩn.
 */
const FRESHNESS_TONES: Record<keyof typeof FRESHNESS_LABELS, PillTone> = {
  live: 'success',
  stale: 'warning',
  offline: 'warning',
  never: 'neutral',
};

type FormErrors = { fields: Record<string, string>; general: string[] };
const EMPTY_FORM_ERRORS: FormErrors = { fields: {}, general: [] };

/**
 * /app/devices — thiết bị của hồ sơ đang xem:
 * - Chỉ chủ hồ sơ mới thấy/gửi claim & release; người thân chỉ đọc metadata theo
 *   quyền và không phát sinh request ghi.
 * - Nhịp tim chỉ hiện khi có quyền xem số đo; pin/trạng thái kết nối luôn có.
 * - Claim thành công chỉ báo “Đã gắn thiết bị”, KHÔNG hứa thiết bị đã trực tuyến.
 * - Đổi hồ sơ sẽ reset mã/lỗi/xác nhận; response muộn của hồ sơ cũ không ghi
 *   trạng thái sang hồ sơ mới.
 */
export function DevicesPage() {
  const subjects = useSubjects();
  const activeSubject = useActiveSubject(subjects.data);
  const queryClient = useQueryClient();
  const [claimCode, setClaimCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FormErrors>(EMPTY_FORM_ERRORS);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimNotice, setClaimNotice] = useState<string | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  /** Thiết bị cần focus lại khi nút “Tháo gắn” được mount lại sau khi huỷ. */
  const pendingFocusRef = useRef<string | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const claimInputRef = useRef<HTMLInputElement | null>(null);
  const releaseTriggerRef = useRef<HTMLButtonElement | null>(null);
  const currentSubjectId = activeSubject?.id ?? null;
  const activeSubjectIdRef = useRef<string | null>(currentSubjectId);
  activeSubjectIdRef.current = currentSubjectId;

  const isOwner = activeSubject?.role === 'owner';
  const canSeeMeasurements = activeSubject?.permissions.canViewMeasurements !== false;

  const devices = useQuery({
    queryKey: activeSubject
      ? queryKeys.subjectDevices(activeSubject.id)
      : (['subjects', 'none', 'devices'] as const),
    queryFn: ({ signal }) =>
      activeSubject ? fetchSubjectDevices(activeSubject.id, signal) : Promise.resolve(null),
    enabled: Boolean(activeSubject),
    staleTime: 15_000,
  });

  // Xác nhận tháo gắn mở ra thì focus vào “Hủy” để Escape dùng được ngay.
  useEffect(() => {
    if (releasingId) cancelButtonRef.current?.focus();
  }, [releasingId]);

  const claim = useMutation({
    mutationFn: ({ subjectId, code }: { subjectId: string; code: string }) =>
      claimDevice(subjectId, { claimCode: code }),
    onSuccess: (_result, { subjectId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjectDevices(subjectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjectStatus(subjectId) });
      // Response của hồ sơ cũ không được đổi form/thông báo của hồ sơ đang xem.
      if (activeSubjectIdRef.current !== subjectId) return;
      setClaimCode('');
      setClaimOpen(false);
      setFieldErrors(EMPTY_FORM_ERRORS);
      setClaimNotice(
        'Đã gắn thiết bị vào hồ sơ. Gắn thành công không có nghĩa thiết bị đang trực tuyến — trạng thái kết nối chỉ đổi khi thiết bị gửi dữ liệu đầu tiên.',
      );
    },
  });

  const release = useMutation({
    mutationFn: ({ deviceId }: { subjectId: string; deviceId: string }) =>
      releaseDevice(deviceId),
    onSuccess: (_result, { subjectId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjectDevices(subjectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjectStatus(subjectId) });
      if (activeSubjectIdRef.current !== subjectId) return;
      setReleasingId(null);
      setReleaseError(null);
    },
    onError: (error) => setReleaseError(getApiErrorMessage(error)),
  });

  // Đổi hồ sơ: bỏ mã đang nhập, lỗi, xác nhận và thông báo của hồ sơ trước —
  // kể cả lỗi của mutation đang bay từ hồ sơ cũ.
  useEffect(() => {
    setClaimCode('');
    setFieldErrors(EMPTY_FORM_ERRORS);
    setReleasingId(null);
    setClaimOpen(false);
    setClaimNotice(null);
    setReleaseError(null);
    claim.reset();
    release.reset();
  }, [currentSubjectId]);

  if (!activeSubject && !subjects.isPending && !subjects.isError) {
    return (
      <div className="stack people-page">
        <PageHeader
          title="Thiết bị"
          actions={
            <Link className="people-textlink" to="/app/tasks">
              Công việc bảo trì
            </Link>
          }
        />
        <EmptyState
          title="Chưa có hồ sơ để gắn thiết bị"
          description="Tạo hồ sơ cho người cần theo dõi hoặc chọn hồ sơ ở đầu trang."
          action={<ButtonLink to="/app/subjects">Tạo hồ sơ</ButtonLink>}
        />
      </div>
    );
  }

  const handleClaim = (event: FormEvent) => {
    event.preventDefault();
    if (!activeSubject || !isOwner) return;
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
      claimInputRef.current?.focus();
      return;
    }
    setFieldErrors(EMPTY_FORM_ERRORS);
    claim.mutate({ subjectId: activeSubject.id, code: claimCode });
  };

  const cancelRelease = (deviceId: string) => {
    pendingFocusRef.current = deviceId;
    setReleasingId(null);
  };

  const handleReleaseKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || release.isPending) return;
    event.preventDefault();
    event.stopPropagation();
    if (releasingId) cancelRelease(releasingId);
  };

  const items = devices.data?.items ?? [];
  const hasDevices = items.length > 0;
  const showClaimForm = isOwner && (claimOpen || !hasDevices);

  return (
    <div className="stack people-page">
      <PageHeader
        title="Thiết bị"
        actions={
          <Link className="people-textlink" to="/app/tasks">
            Công việc bảo trì
          </Link>
        }
      />

      <section aria-labelledby="device-list-heading" className="devices-block">
        <h2 id="device-list-heading" className="page-section__title">
          Thiết bị đang gắn
        </h2>
        {claimNotice ? <Alert tone="success">{claimNotice}</Alert> : null}
        {devices.isPending ? (
          <PageLoader label="Đang tải danh sách thiết bị…" />
        ) : devices.isError ? (
          <ErrorState
            headingLevel={2}
            title="Không tải được danh sách thiết bị"
            message={getApiErrorMessage(devices.error)}
            onRetry={() => void devices.refetch()}
          />
        ) : !hasDevices ? (
          <EmptyState
            headingLevel={3}
            title="Chưa gắn thiết bị nào"
            description={
              isOwner
                ? 'Dùng mã gắn trên thiết bị để kết nối. Thiết bị mới chỉ hiện trạng thái “Chưa từng kết nối” cho tới khi gửi dữ liệu đầu tiên.'
                : 'Chủ hồ sơ chưa gắn thiết bị. Liên hệ chủ hồ sơ nếu bạn cho rằng cần kiểm tra thiết bị.'
            }
          />
        ) : (
          <ul className="people-list" aria-label="Danh sách thiết bị">
            {items.map((device) => (
              <li key={device.deviceId} className="people-row">
                <div className="people-row__identity">
                  <p className="people-row__name">
                    <span>{device.label || device.serial}</span>
                    <StatusPill tone={FRESHNESS_TONES[device.freshness]}>
                      {FRESHNESS_LABELS[device.freshness]}
                    </StatusPill>
                  </p>
                  <dl className="people-kv">
                    <dt>Serial</dt>
                    <dd className="people-code">{device.serial}</dd>
                    <dt>Lần nhận cuối</dt>
                    <dd>
                      {device.lastSeenAt
                        ? `${formatDateTime(device.lastSeenAt)} (${formatRelativeTime(device.lastSeenAt)})`
                        : 'Chưa nhận dữ liệu'}
                    </dd>
                    <dt>Lần đo cuối</dt>
                    <dd>
                      {device.lastMeasuredAt
                        ? formatDateTime(device.lastMeasuredAt)
                        : 'Chưa có mẫu đo hợp lệ'}
                    </dd>
                    <dt>Pin</dt>
                    <dd>
                      {device.batteryPercent !== null
                        ? `${device.batteryPercent}%`
                        : 'Chưa có thông tin'}
                    </dd>
                    {canSeeMeasurements && device.healthDataVisible !== false ? (
                      <>
                        <dt>Nhịp tim gần nhất</dt>
                        <dd>
                          {device.lastHeartRateBpm !== null &&
                          device.lastHeartRateQuality === 'valid'
                            ? `${device.lastHeartRateBpm} bpm`
                            : 'Chưa có mẫu hợp lệ'}
                        </dd>
                      </>
                    ) : null}
                    <dt>Firmware</dt>
                    <dd>{device.firmwareVersion ?? 'Chưa báo phiên bản'}</dd>
                  </dl>
                </div>
                {isOwner ? (
                  <div className="people-row__actions">
                    {releasingId === device.deviceId ? (
                      <div
                        className="people-confirm"
                        role="group"
                        aria-label={`Xác nhận tháo gắn ${device.label || device.serial}`}
                        onKeyDown={handleReleaseKeyDown}
                      >
                        <p className="people-confirm__text">
                          Tháo gắn <strong>{device.label || device.serial}</strong>? Dữ liệu đo mới
                          sẽ dừng cập nhật và thiết bị không còn gắn với hồ sơ này.
                        </p>
                        <div className="people-confirm__actions">
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={release.isPending}
                            onClick={() =>
                              activeSubject &&
                              release.mutate({
                                subjectId: activeSubject.id,
                                deviceId: device.deviceId,
                              })
                            }
                          >
                            {release.isPending ? 'Đang tháo…' : 'Xác nhận tháo gắn'}
                          </Button>
                          <Button
                            ref={cancelButtonRef}
                            variant="subtle"
                            size="sm"
                            onClick={() => cancelRelease(device.deviceId)}
                            disabled={release.isPending}
                          >
                            Hủy
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        ref={(element) => {
                          if (!element) return;
                          releaseTriggerRef.current = element;
                          if (pendingFocusRef.current === device.deviceId) {
                            pendingFocusRef.current = null;
                            element.focus();
                          }
                        }}
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setReleaseError(null);
                          setReleasingId(device.deviceId);
                        }}
                        aria-label={`Tháo gắn ${device.label || device.serial}`}
                      >
                        Tháo gắn
                      </Button>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {releaseError ? <Alert tone="error">{releaseError}</Alert> : null}
        {!isOwner && hasDevices ? (
          <p className="people-meta">
            Bạn xem thiết bị với quyền người thân: chỉ đọc metadata và trạng thái kết nối. Việc
            gắn/tháo thiết bị do chủ hồ sơ thực hiện.
          </p>
        ) : null}
      </section>

      {isOwner ? (
        <section aria-labelledby="claim-heading" className="devices-block">
          <div className="devices-block__head">
            <h2 id="claim-heading" className="page-section__title">
              Gắn thiết bị mới
            </h2>
            {hasDevices && !claimOpen ? (
              <Button variant="secondary" onClick={() => setClaimOpen(true)}>
                Gắn thiết bị
              </Button>
            ) : null}
          </div>
          {showClaimForm ? (
            <div className="people-surface claim-form">
              <p className="people-meta">
                Mã 9 ký tự in trên thiết bị; dùng một lần và hết hạn sau 15 phút.
              </p>
              <form className="people-form" onSubmit={handleClaim} noValidate>
                <TextField
                  id="claim-code"
                  label="Mã gắn thiết bị"
                  required
                  ref={claimInputRef}
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
                <div className="people-form__actions">
                  <Button type="submit" disabled={claim.isPending || !activeSubject}>
                    {claim.isPending ? 'Đang gắn…' : 'Gắn thiết bị'}
                  </Button>
                  {hasDevices ? (
                    <Button
                      variant="subtle"
                      type="button"
                      disabled={claim.isPending}
                      onClick={() => {
                        setClaimOpen(false);
                        setClaimCode('');
                        setFieldErrors(EMPTY_FORM_ERRORS);
                      }}
                    >
                      Hủy
                    </Button>
                  ) : null}
                </div>
              </form>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
