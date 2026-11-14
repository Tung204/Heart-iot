import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { TelemetryEnvelope } from '@annhien/contracts/telemetry';
import { DB, type AppDb } from '../database/database';
import { deviceAssignments, devices, telemetry, type AssignmentRow, type DeviceRow } from '../database/schema';
import { AppError } from '../common/app-error';
import { sha256 } from '../auth/password';
import { isUniqueViolation } from '../database/errors';
import { PolicyService } from '../policy/policy.service';

/**
 * Ingest telemetry — lõi nghiệp vụ dùng chung cho HTTP và MQTT.
 *
 * Bất biến (docs/04, docs/14 mục 5):
 * - unique (device_id, message_id): trùng cùng payload → `duplicate`; cùng id khác
 *   payload → 409 CONFLICT, không ghi đè.
 * - unique (device_id, boot_id, sequence): cùng khóa nhưng message_id khác →
 *   409 protocol conflict.
 * - Không có assignment đang mở → ack `rejected` DEVICE_NOT_CLAIMED, không ghi.
 * - `isQuarantined` = false vì đã xác định assignment; trường hợp đổi chủ khi còn
 *   bản tin chưa gửi chưa được giải quyết (R-02/R-03 vẫn mở, ghi rõ trong handoff).
 *
 * payloadHash = sha256(JSON.stringify(envelope)): thiết bị phải gửi lại bản tin
 * byte-tương đương (cùng thứ tự khóa) để được tính là duplicate.
 */

export type IngestOutcome =
  | { kind: 'accepted'; receivedAt: Date }
  | { kind: 'duplicate'; receivedAt: Date }
  | {
      kind: 'rejected';
      code: 'DEVICE_NOT_CLAIMED';
      message: string;
      receivedAt: Date;
    };

@Injectable()
export class TelemetryIngestService {
  /** Rate limit đơn giản trong bộ nhớ theo device — chỉ bảo vệ một tiến trình. */
  private readonly rateWindows = new Map<string, number[]>();

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly policy: PolicyService,
  ) {}

  async ingest(device: DeviceRow, envelope: TelemetryEnvelope, source: 'http' | 'mqtt'): Promise<IngestOutcome> {
    const policy = await this.policy.getActive();
    this.assertRateLimit(device.id, policy.value.maxTelemetryPerMinute);

    const receivedAt = new Date();
    const assignment = await this.findOpenAssignment(device.id);
    if (!assignment) {
      return {
        kind: 'rejected',
        code: 'DEVICE_NOT_CLAIMED',
        message: 'Thiết bị chưa được gán cho hồ sơ nào.',
        receivedAt,
      };
    }

    const payloadHash = sha256(JSON.stringify(envelope));
    const measuredAt = envelope.measured_at ? new Date(envelope.measured_at) : null;
    const isLate =
      measuredAt !== null &&
      receivedAt.getTime() - measuredAt.getTime() > policy.value.lateEventMinutes * 60_000;

    try {
      const result = await this.db.transaction(async (tx) => {
        const sameMessage = await tx
          .select({ id: telemetry.id, payloadHash: telemetry.payloadHash })
          .from(telemetry)
          .where(and(eq(telemetry.deviceId, device.id), eq(telemetry.messageId, envelope.message_id)))
          .limit(1);
        if (sameMessage.length > 0) {
          const existing = sameMessage[0];
          if (!existing) throw new Error('Không đọc được bản tin trùng.');
          if (existing.payloadHash === payloadHash) {
            await tx
              .update(devices)
              .set({ lastSeenAt: receivedAt, updatedAt: receivedAt })
              .where(eq(devices.id, device.id));
            return 'duplicate' as const;
          }
          throw AppError.conflict('message_id đã tồn tại với payload khác.', {
            kind: 'message_id_conflict',
            messageId: envelope.message_id,
          });
        }

        const sameSequence = await tx
          .select({ id: telemetry.id, messageId: telemetry.messageId })
          .from(telemetry)
          .where(
            and(
              eq(telemetry.deviceId, device.id),
              eq(telemetry.bootId, envelope.boot_id),
              eq(telemetry.sequence, envelope.sequence),
            ),
          )
          .limit(1);
        if (sameSequence.length > 0) {
          const existing = sameSequence[0];
          if (!existing) throw new Error('Không đọc được bản tin trùng sequence.');
          throw AppError.conflict(
            'sequence đã được dùng bởi message_id khác trong cùng boot.',
            {
              kind: 'sequence_conflict',
              bootId: envelope.boot_id,
              sequence: envelope.sequence,
              existingMessageId: existing.messageId,
            },
          );
        }

        await tx.insert(telemetry).values({
          messageId: envelope.message_id,
          deviceId: device.id,
          assignmentId: assignment.id,
          bootId: envelope.boot_id,
          sequence: envelope.sequence,
          measuredAt,
          receivedAt,
          clockStatus: envelope.clock_status,
          uptimeMs: envelope.uptime_ms,
          metrics: envelope.metrics,
          quality: envelope.quality,
          batteryPercent: envelope.battery_percent,
          firmwareVersion: envelope.firmware_version,
          isLate,
          isQuarantined: false,
          payloadHash,
          source,
        });
        await tx
          .update(devices)
          .set({
            lastSeenAt: receivedAt,
            lastBootId: envelope.boot_id,
            firmwareVersion: envelope.firmware_version,
            updatedAt: receivedAt,
          })
          .where(eq(devices.id, device.id));
        return 'accepted' as const;
      });
      return result === 'duplicate' ? { kind: 'duplicate', receivedAt } : { kind: 'accepted', receivedAt };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return this.classifyRace(device, envelope, payloadHash, receivedAt);
      }
      throw error;
    }
  }

  /** Hai request ghi song song cùng vượt qua SELECT: unique index bắt lỗi, phân loại lại. */
  private async classifyRace(
    device: DeviceRow,
    envelope: TelemetryEnvelope,
    payloadHash: string,
    receivedAt: Date,
  ): Promise<IngestOutcome> {
    const sameMessage = await this.db
      .select({ payloadHash: telemetry.payloadHash })
      .from(telemetry)
      .where(and(eq(telemetry.deviceId, device.id), eq(telemetry.messageId, envelope.message_id)))
      .limit(1);
    if (sameMessage.length > 0) {
      const existing = sameMessage[0];
      if (existing && existing.payloadHash === payloadHash) return { kind: 'duplicate', receivedAt };
      throw AppError.conflict('message_id đã tồn tại với payload khác.', {
        kind: 'message_id_conflict',
        messageId: envelope.message_id,
      });
    }
    const sameSequence = await this.db
      .select({ messageId: telemetry.messageId })
      .from(telemetry)
      .where(
        and(
          eq(telemetry.deviceId, device.id),
          eq(telemetry.bootId, envelope.boot_id),
          eq(telemetry.sequence, envelope.sequence),
        ),
      )
      .limit(1);
    if (sameSequence.length > 0) {
      const existing = sameSequence[0];
      throw AppError.conflict('sequence đã được dùng bởi message_id khác trong cùng boot.', {
        kind: 'sequence_conflict',
        bootId: envelope.boot_id,
        sequence: envelope.sequence,
        existingMessageId: existing?.messageId ?? null,
      });
    }
    throw AppError.conflict('Xung đột ghi telemetry không xác định.', {
      messageId: envelope.message_id,
    });
  }

  private async findOpenAssignment(deviceId: string): Promise<AssignmentRow | null> {
    const rows = await this.db
      .select()
      .from(deviceAssignments)
      .where(and(eq(deviceAssignments.deviceId, deviceId), isNull(deviceAssignments.endedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Cửa sổ trượt 60 giây trong bộ nhớ; giới hạn từ policy maxTelemetryPerMinute. */
  private assertRateLimit(deviceId: string, maxPerMinute: number): void {
    const now = Date.now();
    let window = this.rateWindows.get(deviceId);
    if (!window) {
      window = [];
      this.rateWindows.set(deviceId, window);
    }
    while (window.length > 0 && now - (window[0] ?? 0) >= 60_000) window.shift();
    if (window.length >= maxPerMinute) {
      throw AppError.rateLimited(`Vượt giới hạn telemetry: tối đa ${maxPerMinute} bản tin mỗi phút.`);
    }
    window.push(now);
  }
}
