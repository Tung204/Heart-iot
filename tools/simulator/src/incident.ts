import { randomUUID } from 'node:crypto';
import type { IncidentType } from '@heart-iot/contracts';
import type { IncidentEnvelope, IncidentEventType } from '@heart-iot/contracts/telemetry';
import type { SimDevice } from './device';

/**
 * Dựng envelope sự kiện incident theo `incidentEnvelopeSchema`.
 * `incident_id` do thiết bị sinh, duy nhất trong namespace của thiết bị:
 * dạng `sim-<uuid>` để phân biệt dữ liệu mô phỏng.
 */

export const SIM_ALGORITHM_VERSION = 'sim-rules-v1';

export function createIncidentId(): string {
  return `sim-${randomUUID()}`;
}

export interface IncidentEventInput {
  device: SimDevice;
  incidentId: string;
  eventRevision: number;
  eventType: IncidentEventType;
  incidentType?: IncidentType;
  clockStatus?: 'synced' | 'unsynced';
  measuredAtMs?: number | null;
  notes: string;
  heartRateBpm?: number | null;
  heartRateQuality?: 'valid' | 'poor_signal' | 'not_worn' | 'sensor_error';
}

export function buildIncidentEvent(input: IncidentEventInput): IncidentEnvelope {
  const clockStatus = input.clockStatus ?? 'synced';
  const measuredAt =
    clockStatus === 'unsynced'
      ? null
      : new Date(input.measuredAtMs ?? Date.now()).toISOString();
  const heartRateBpm = input.heartRateBpm === undefined ? 76 : input.heartRateBpm;
  const heartRateQuality = input.heartRateQuality ?? 'valid';

  const envelope: IncidentEnvelope = {
    schema_version: '1.0',
    message_id: randomUUID(),
    device_id: input.device.deviceId,
    boot_id: input.device.bootId,
    sequence: input.device.sequence,
    measured_at: measuredAt,
    clock_status: clockStatus,
    uptime_ms: input.device.uptimeMs,
    firmware_version: input.device.firmwareVersion,
    incident_id: input.incidentId,
    event_revision: input.eventRevision,
    event_type: input.eventType,
    incident_type: input.incidentType ?? 'fall',
    evidence: {
      algorithm_version: SIM_ALGORITHM_VERSION,
      wear_location: 'wrist',
      motion_quality: 'valid',
      heart_rate_quality: heartRateQuality,
      heart_rate_bpm: heartRateBpm,
      notes: input.notes,
    },
  };

  input.device.advance(0);
  return envelope;
}
