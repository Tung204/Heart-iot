import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { TelemetryEnvelope } from '@annhien/contracts/telemetry';
import { DB, type AppDb } from '../database/database';
import { deviceAssignments, devices, telemetry, type AssignmentRow, type DeviceRow } from '../database/schema';
import { AppError } from '../common/app-error';
import { sha256 } from '../auth/password';
import { isUniqueViolation } from '../database/errors';
import { PolicyService } from '../policy/policy.service';
import { AuditService } from '../access/audit.service';
import { ENV, type AppEnv } from '../config/env';

/**
 * Ingest telemetry — lõi nghiệp vụ dùng chung cho HTTP và MQTT.
 *
 * Bất biến (docs/03, docs/04, docs/14 mục 5):
 * - unique (device_id, message_id): trùng cùng payload → `duplicate`; cùng id khác
 *   payload → 409 CONFLICT, không ghi đè.
 * - unique (device_id, boot_id, sequence): cùng khóa nhưng message_id khác →
 *   409 protocol conflict.
 * - Không có assignment đang mở → ack `rejected` DEVICE_NOT_CLAIMED, không ghi.
 * - Assignment được xác định theo **thời điểm đo**, không theo chủ hiện tại: mẫu
 *   nằm trong một assignment đã đóng vẫn thuộc chủ cũ; mẫu trước assignment đầu
 *   tiên hoặc rơi vào khoảng thiết bị chưa được gán bị lưu cách ly
 *   (`is_quarantined=true`), không chuyển sang hồ sơ mới (FR-03, T-03).
 * - `measured_at` vượt quá hiện tại + `MAX_CLOCK_SKEW_SECONDS` (đồng hồ thiết bị
 *   chạy nhanh) cũng bị cách ly; không đường đọc nào dùng mẫu cách ly.
 * - Mẫu `unsynced` (giờ đo null) vẫn ghi vào assignment đang mở nhưng không lên
 *   timeline; đây là dữ liệu "thiếu giờ", khác với cách ly.
 * - Cách ly trả 202 `accepted` + `code=QUARANTINED` để thiết bị không retry vô
 *   hạn, kèm audit/log protocol error không chứa chỉ số sức khỏe.
 *
 * payloadHash = sha256(JSON.stringify(envelope)): thiết bị phải gửi lại bản tin
 * byte-tương đương (cùng thứ tự khóa) để được tính là duplicate.
 */

export type QuarantineReason = 'clock_skew_future' | 'before_first_assignment' | 'outside_assignment';

export type IngestOutcome =
  | { kind: 'accepted'; receivedAt: Date; quarantineReason?: QuarantineReason }
  | { kind: 'duplicate'; receivedAt: Date }
  | {
      kind: 'rejected';
      code: 'DEVICE_NOT_CLAIMED';
      message: string;
      receivedAt: Date;
    };

@Injectable()
export class TelemetryIngestService {
  private readonly logger = new Logger(TelemetryIngestService.name);
  /** Rate limit đơn giản trong bộ nhớ theo device — chỉ bảo vệ một tiến trình. */
  private readonly rateWindows = new Map<string, number[]>();

  constructor(
    @Inject(DB) private readonly db: AppDb,
    @Inject(ENV) private readonly env: AppEnv,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
  ) {}

  async ingest(device: DeviceRow, envelope: TelemetryEnvelope, source: 'http' | 'mqtt'): Promise<IngestOutcome> {
    const policy = await this.policy.getActive();
    this.assertRateLimit(device.id, policy.value.maxTelemetryPerMinute);

    const receivedAt = new Date();
    const measuredAt = envelope.measured_at ? new Date(envelope.measured_at) : null;
    const assignments = await this.findAssignments(device.id);
    const openAssignment = assignments.find((row) => row.endedAt === null) ?? null;
    if (!openAssignment) {
      return {
        kind: 'rejected',
        code: 'DEVICE_NOT_CLAIMED',
        message: 'Thiết bị chưa được gán cho hồ sơ nào.',
        receivedAt,
      };
    }

    const resolution = resolveAssignmentForMeasuredAt({
      assignments,
      openAssignment,
      measuredAt,
      receivedAt,
      clockSkewMs: this.env.MAX_CLOCK_SKEW_SECONDS * 1000,
    });
    const { assignment, quarantineReason } = resolution;

    const payloadHash = sha256(JSON.stringify(envelope));
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
          isQuarantined: quarantineReason !== null,
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

        if (quarantineReason !== null) {
          // Bằng chứng protocol: chỉ id/thời gian/lý do, không ghi nhịp tim,
          // bước, pin hay bất kỳ chỉ số sức khỏe nào.
          await this.audit.record(
            {
              actorKind: 'device',
              action: 'telemetry.quarantined',
              targetType: 'device',
              targetId: device.id,
              outcome: 'failed',
              metadata: {
                messageId: envelope.message_id,
                bootId: envelope.boot_id,
                sequence: envelope.sequence,
                reason: quarantineReason,
                source,
                measuredAt: measuredAt?.toISOString() ?? null,
                clockSkewSeconds:
                  measuredAt !== null
                    ? Math.round((measuredAt.getTime() - receivedAt.getTime()) / 1000)
                    : null,
                assignmentId: assignment.id,
              },
            },
            tx,
          );
          this.logger.warn(
            `Telemetry cách ly: device=${device.id} message=${envelope.message_id} ` +
              `reason=${quarantineReason} skewSeconds=${
                measuredAt !== null
                  ? Math.round((measuredAt.getTime() - receivedAt.getTime()) / 1000)
                  : 'n/a'
              }`,
          );
        }

        return 'accepted' as const;
      });
      if (result === 'duplicate') return { kind: 'duplicate', receivedAt };
      return quarantineReason !== null
        ? { kind: 'accepted', receivedAt, quarantineReason }
        : { kind: 'accepted', receivedAt };
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

  /** Toàn bộ lịch sử gán của thiết bị, cũ→mới; assignment đang mở là `endedAt = null`. */
  private async findAssignments(deviceId: string): Promise<AssignmentRow[]> {
    return this.db
      .select()
      .from(deviceAssignments)
      .where(eq(deviceAssignments.deviceId, deviceId))
      .orderBy(asc(deviceAssignments.startedAt), asc(deviceAssignments.id));
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

type AssignmentResolution = {
  assignment: AssignmentRow;
  quarantineReason: QuarantineReason | null;
};

/**
 * Chọn assignment theo `measured_at` (docs/03: "dữ liệu được gán bằng lịch sử
 * assignment tại thời điểm xảy ra; không chắc thời gian thì cách ly").
 *
 * - Mẫu `unsynced` (không có giờ đo) ở lại assignment đang mở; đây là dữ liệu
 *   thiếu giờ, được đếm riêng ở đường đọc chứ không phải cách ly.
 * - Mẫu vượt hiện tại quá dung sai đồng hồ → cách ly `clock_skew_future`.
 * - Mẫu nằm trong một assignment (kể cả đã đóng) → gán đúng assignment đó, nên
 *   mẫu cũ không bao giờ chuyển sang chủ mới.
 * - Mẫu trước assignment đầu tiên hoặc rơi vào khoảng chưa gán → cách ly.
 * - Dung sai `clockSkewMs` chỉ nới ở sát biên bắt đầu/kết thúc assignment để
 *   đồng hồ thiết bị lệch vài chục giây không bị đẩy sang chủ khác.
 */
export function resolveAssignmentForMeasuredAt(input: {
  assignments: AssignmentRow[];
  openAssignment: AssignmentRow;
  measuredAt: Date | null;
  receivedAt: Date;
  clockSkewMs: number;
}): AssignmentResolution {
  const { assignments, openAssignment, measuredAt, receivedAt, clockSkewMs } = input;
  if (measuredAt === null) {
    return { assignment: openAssignment, quarantineReason: null };
  }
  if (measuredAt.getTime() > receivedAt.getTime() + clockSkewMs) {
    return { assignment: openAssignment, quarantineReason: 'clock_skew_future' };
  }

  const covered = findAssignmentCovering(assignments, measuredAt, clockSkewMs);
  if (covered) return { assignment: covered, quarantineReason: null };

  const first = assignments[0];
  const reason: QuarantineReason =
    first !== undefined && measuredAt.getTime() < first.startedAt.getTime() - clockSkewMs
      ? 'before_first_assignment'
      : 'outside_assignment';
  return { assignment: openAssignment, quarantineReason: reason };
}

/** Assignment chứa `instant`, ưu tiên khớp chính xác rồi mới nới dung sai ở biên. */
function findAssignmentCovering(
  assignments: AssignmentRow[],
  instant: Date,
  clockSkewMs: number,
): AssignmentRow | null {
  const time = instant.getTime();
  const exact = assignments.find(
    (assignment) =>
      time >= assignment.startedAt.getTime() &&
      (assignment.endedAt === null || time < assignment.endedAt.getTime()),
  );
  if (exact) return exact;

  // Đồng hồ thiết bị chậm hơn server một chút: mẫu ngay trước mốc bắt đầu.
  const nearStart = assignments.find(
    (assignment) =>
      time >= assignment.startedAt.getTime() - clockSkewMs &&
      time < assignment.startedAt.getTime(),
  );
  if (nearStart) return nearStart;

  // Mẫu ngay sau mốc kết thúc: giữ với chủ cũ thay vì đẩy sang assignment kế tiếp.
  for (let index = assignments.length - 1; index >= 0; index -= 1) {
    const assignment = assignments[index];
    if (!assignment?.endedAt) continue;
    if (
      time >= assignment.endedAt.getTime() &&
      time <= assignment.endedAt.getTime() + clockSkewMs
    ) {
      return assignment;
    }
  }
  return null;
}
