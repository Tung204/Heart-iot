import type { DeviceStatus } from '@annhien/contracts/telemetry';
import type { PolicyValue } from '@annhien/contracts/policies';
import type { DeviceRow, TelemetryRow } from '../database/schema';

/**
 * Trạng thái online/freshness của thiết bị theo policy:
 * - online: last_seen_at trong vòng `offlineAfterSeconds`.
 * - freshness: 'live' khi bản đo gần nhất trong `dataFreshAfterSeconds`;
 *   'stale' khi còn online nhưng dữ liệu cũ; 'offline' khi vượt timeout;
 *   'never' khi chưa từng thấy thiết bị.
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
): DeviceStatus {
  const nowMs = now.getTime();
  const lastSeenAt = device.lastSeenAt ?? null;
  const online =
    lastSeenAt !== null && nowMs - lastSeenAt.getTime() <= policy.offlineAfterSeconds * 1000;

  let freshness: DeviceStatus['freshness'];
  if (lastSeenAt === null) {
    freshness = 'never';
  } else if (nowMs - lastSeenAt.getTime() > policy.offlineAfterSeconds * 1000) {
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
    lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
    freshness,
    lastHeartRateBpm: lastRow?.metrics.heart_rate_bpm ?? null,
    lastHeartRateQuality: lastRow?.quality.heart_rate ?? null,
    lastMeasuredAt: lastRow?.measuredAt ? lastRow.measuredAt.toISOString() : null,
    batteryPercent: lastRow?.batteryPercent ?? null,
    firmwareVersion: device.firmwareVersion ?? lastRow?.firmwareVersion ?? null,
    clockStatus: lastRow ? (lastRow.clockStatus as DeviceStatus['clockStatus']) : 'unknown',
  };
}
