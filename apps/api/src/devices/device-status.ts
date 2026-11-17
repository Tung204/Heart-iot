import type { DeviceStatus } from '@heart-iot/contracts/telemetry';
import type { PolicyValue } from '@heart-iot/contracts/policies';
import type { DeviceRow, TelemetryRow } from '../database/schema';

/**
 * Trạng thái online/freshness của thiết bị theo policy:
 * - online: last_seen_at trong vòng `offlineAfterSeconds` (trạng thái kết nối hiện tại).
 * - freshness: 'live' khi bản đo gần nhất trong `dataFreshAfterSeconds`;
 *   'stale' khi còn online nhưng dữ liệu cũ hoặc chưa có mẫu trong cửa sổ được phép;
 *   'offline' khi vượt timeout; 'never' khi chưa từng thấy thiết bị.
 *
 * `visibleFrom` là mốc sớm nhất người xem được phép thấy (người thân: mốc chia sẻ/lịch sử).
 * Khi đó `lastRow` đã được lọc theo `measured_at >= visibleFrom`; không có mẫu trong cửa sổ
 * thì mọi trường số đo là null và `clockStatus='unknown'`. `lastSeenAt` chỉ được trả khi chính
 * mốc nhận cuối không sớm hơn `visibleFrom`, để không lộ lịch sử kết nối trước khi chia sẻ.
 * Cờ `online` vẫn theo `last_seen_at` vì là trạng thái kết nối hiện tại, không phải số đo sức khỏe.
 * Chủ hồ sơ truyền `null` để giữ nguyên hành vi cũ.
 *
 * `healthDataVisible=false` (người thân không được chủ hồ sơ chia sẻ quyền xem số đo):
 * - `lastHeartRateBpm`, `lastHeartRateQuality`, `lastMeasuredAt` luôn `null`;
 * - `freshness` chỉ phản ánh kết nối (`last_seen_at`/`online`), **không** dùng mẫu cũ để tính
 *   “live”/“stale” — không suy ra dữ liệu sức khỏe từ mẫu bị ẩn;
 * - `batteryPercent`/`firmwareVersion`/`online` vẫn có thể hiển thị vì là trạng thái thiết bị,
 *   nhưng `clockStatus='unknown'` để không tiết lộ nhịp nhận số đo.
 */
export function computeDeviceStatus(
  device: DeviceRow,
  subjectId: string,
  policy: PolicyValue,
  lastRow: Pick<
    TelemetryRow,
    'measuredAt' | 'clockStatus' | 'metrics' | 'quality' | 'batteryPercent' | 'firmwareVersion'
  > | null,
  now: Date = new Date(),
  visibleFrom: Date | null = null,
  healthDataVisible = true,
): DeviceStatus {
  const nowMs = now.getTime();
  const lastSeenAt = device.lastSeenAt ?? null;
  const online =
    lastSeenAt !== null && nowMs - lastSeenAt.getTime() <= policy.offlineAfterSeconds * 1000;

  const canExposeLastSeenAt =
    visibleFrom === null ||
    (lastSeenAt !== null && lastSeenAt.getTime() >= visibleFrom.getTime());

  if (!healthDataVisible) {
    // Chỉ tính freshness từ kết nối, không đọc `lastRow` (mẫu sức khỏe bị ẩn).
    const freshness: DeviceStatus['freshness'] =
      lastSeenAt === null ? 'never' : online ? 'live' : 'offline';
    return {
      deviceId: device.id,
      subjectId,
      serial: device.serial,
      label: device.label,
      online,
      lastSeenAt: canExposeLastSeenAt && lastSeenAt ? lastSeenAt.toISOString() : null,
      freshness,
      lastHeartRateBpm: null,
      lastHeartRateQuality: null,
      lastMeasuredAt: null,
      batteryPercent: lastRow?.batteryPercent ?? null,
      firmwareVersion: device.firmwareVersion ?? lastRow?.firmwareVersion ?? null,
      clockStatus: 'unknown',
      healthDataVisible: false,
    };
  }

  let freshness: DeviceStatus['freshness'];
  if (lastSeenAt === null) {
    freshness = 'never';
  } else if (!online) {
    freshness = 'offline';
  } else {
    const lastMeasuredAt = lastRow?.measuredAt ?? null;
    freshness =
      lastMeasuredAt !== null && nowMs - lastMeasuredAt.getTime() <= policy.dataFreshAfterSeconds * 1000
        ? 'live'
        : 'stale';
  }

  return {
    deviceId: device.id,
    subjectId,
    serial: device.serial,
    label: device.label,
    online,
    lastSeenAt: canExposeLastSeenAt && lastSeenAt ? lastSeenAt.toISOString() : null,
    freshness,
    lastHeartRateBpm: lastRow?.metrics.heart_rate_bpm ?? null,
    lastHeartRateQuality: lastRow?.quality.heart_rate ?? null,
    lastMeasuredAt: lastRow?.measuredAt ? lastRow.measuredAt.toISOString() : null,
    batteryPercent: lastRow?.batteryPercent ?? null,
    firmwareVersion: device.firmwareVersion ?? lastRow?.firmwareVersion ?? null,
    clockStatus: lastRow ? (lastRow.clockStatus as DeviceStatus['clockStatus']) : 'unknown',
    healthDataVisible: true,
  };
}
