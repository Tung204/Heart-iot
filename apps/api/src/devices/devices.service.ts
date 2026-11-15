import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm';
import type { UserSummary } from '@annhien/contracts';
import type {
  ClaimResult,
  CreateDeviceInput,
  DeviceAdminSummary,
  DeviceList,
  NewClaimCodeResult,
  ReleaseResult,
} from '@annhien/contracts/devices';
import type { DeviceStatus } from '@annhien/contracts/telemetry';
import type { SubjectStatusResponse } from '@annhien/contracts/measurements';
import { DB, type AppDb } from '../database/database';
import {
  deviceAssignments,
  devices,
  telemetry,
  type DeviceRow,
  type TelemetryRow,
} from '../database/schema';
import { AccessService } from '../access/access.service';
import { AuditService } from '../access/audit.service';
import { AppError } from '../common/app-error';
import { createOpaqueToken, sha256 } from '../auth/password';
import { isUniqueViolation } from '../database/errors';
import { PolicyService } from '../policy/policy.service';
import { generateClaimCode, CLAIM_CODE_TTL_MS } from './device-codes';
import { computeDeviceStatus } from './device-status';

export type LastTelemetryView = Pick<
  TelemetryRow,
  'measuredAt' | 'clockStatus' | 'metrics' | 'quality' | 'batteryPercent' | 'firmwareVersion'
> | null;

@Injectable()
export class DevicesService {
  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly policy: PolicyService,
  ) {}

  // ---------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------

  async createDevice(
    user: UserSummary,
    input: CreateDeviceInput,
  ): Promise<{
    device: DeviceAdminSummary;
    deviceKey: string;
    claimCode: string;
    claimCodeExpiresAt: Date;
  }> {
    this.access.requireAdmin(user);
    const deviceKey = createOpaqueToken(32);
    const claimCode = generateClaimCode();
    const claimCodeExpiresAt = new Date(Date.now() + CLAIM_CODE_TTL_MS);

    let created: DeviceRow | undefined;
    try {
      const rows = await this.db
        .insert(devices)
        .values({
          serial: input.serial,
          label: input.label.trim(),
          credentialHash: sha256(deviceKey),
          claimCodeHash: sha256(claimCode),
          claimCodeExpiresAt,
        })
        .returning();
      created = rows[0];
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict('Số serial này đã tồn tại.');
      }
      throw error;
    }
    if (!created) throw new Error('Không tạo được thiết bị.');

    await this.audit.record({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'device.create',
      targetType: 'device',
      targetId: created.id,
      outcome: 'success',
      metadata: { serial: created.serial },
    });

    return {
      device: toAdminSummary(created, null),
      deviceKey,
      claimCode,
      claimCodeExpiresAt,
    };
  }

  async listAdminDevices(user: UserSummary): Promise<DeviceList> {
    this.access.requireAdmin(user);
    const rows = await this.db
      .select({ device: devices, assignment: deviceAssignments })
      .from(devices)
      .leftJoin(
        deviceAssignments,
        and(eq(deviceAssignments.deviceId, devices.id), isNull(deviceAssignments.endedAt)),
      )
      .orderBy(asc(devices.createdAt));
    return {
      items: rows.map((row) => toAdminSummary(row.device, row.assignment?.subjectId ?? null)),
    };
  }

  async issueClaimCode(user: UserSummary, deviceId: string): Promise<NewClaimCodeResult> {
    this.access.requireAdmin(user);
    const device = await this.findDevice(deviceId);
    const claimCode = generateClaimCode();
    const expiresAt = new Date(Date.now() + CLAIM_CODE_TTL_MS);
    await this.db
      .update(devices)
      .set({ claimCodeHash: sha256(claimCode), claimCodeExpiresAt: expiresAt, updatedAt: new Date() })
      .where(eq(devices.id, device.id));
    await this.audit.record({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'device.claim_code_issued',
      targetType: 'device',
      targetId: device.id,
      outcome: 'success',
    });
    return { claimCode, expiresAt: expiresAt.toISOString() };
  }

  async rotateDeviceKey(user: UserSummary, deviceId: string): Promise<{ deviceKey: string }> {
    this.access.requireAdmin(user);
    const device = await this.findDevice(deviceId);
    const deviceKey = createOpaqueToken(32);
    await this.db
      .update(devices)
      .set({ credentialHash: sha256(deviceKey), updatedAt: new Date() })
      .where(eq(devices.id, device.id));
    await this.audit.record({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'device.rotate_key',
      targetType: 'device',
      targetId: device.id,
      outcome: 'success',
    });
    return { deviceKey };
  }

  // ---------------------------------------------------------------------------
  // Chủ hồ sơ
  // ---------------------------------------------------------------------------

  async claimDevice(user: UserSummary, subjectId: string, claimCode: string): Promise<ClaimResult> {
    const access = await this.access.requireSubject(user.id, subjectId);
    if (access.role !== 'owner') {
      throw AppError.forbidden('Chỉ chủ hồ sơ mới có thể gắn thiết bị.');
    }

    const claimCodeHash = sha256(claimCode);
    const rows = await this.db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.claimCodeHash, claimCodeHash),
          gt(devices.claimCodeExpiresAt, new Date()),
          eq(devices.status, 'active'),
        ),
      )
      .limit(1);
    const device = rows[0];
    if (!device) {
      throw AppError.validation('Mã xác nhận thiết bị không hợp lệ hoặc đã hết hạn.');
    }

    try {
      return await this.db.transaction(async (tx) => {
        const open = await tx
          .select({ id: deviceAssignments.id })
          .from(deviceAssignments)
          .where(
            and(eq(deviceAssignments.deviceId, device.id), isNull(deviceAssignments.endedAt)),
          )
          .limit(1);
        if (open.length > 0) {
          throw AppError.conflict('Thiết bị này đã được gán cho một hồ sơ khác.');
        }
        const inserted = await tx
          .insert(deviceAssignments)
          .values({ deviceId: device.id, subjectId, assignedByUserId: user.id })
          .returning();
        const assignment = inserted[0];
        if (!assignment) throw new Error('Không tạo được assignment.');
        await tx
          .update(devices)
          .set({ claimCodeHash: null, claimCodeExpiresAt: null, updatedAt: new Date() })
          .where(eq(devices.id, device.id));
        await this.audit.record(
          {
            actorUserId: user.id,
            actorKind: 'user',
            action: 'device.claim',
            targetType: 'device',
            targetId: device.id,
            outcome: 'success',
            metadata: { subjectId, assignmentId: assignment.id },
          },
          tx,
        );
        return {
          device: toAdminSummary(device, subjectId),
          assignmentId: assignment.id,
          subjectId,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict('Thiết bị này đã được gán cho một hồ sơ khác.');
      }
      throw error;
    }
  }

  async listSubjectDevices(user: UserSummary, subjectId: string): Promise<DeviceStatus[]> {
    const access = await this.access.requireSubject(user.id, subjectId);
    return this.loadSubjectDevices(access.subject.id);
  }

  async getSubjectStatus(user: UserSummary, subjectId: string): Promise<SubjectStatusResponse> {
    const access = await this.access.requireSubject(user.id, subjectId);
    const [policy, devicesStatus] = await Promise.all([
      this.policy.getActive(),
      this.loadSubjectDevices(access.subject.id),
    ]);
    return { devices: devicesStatus, policy, asOf: new Date().toISOString() };
  }

  async releaseDevice(
    user: UserSummary,
    deviceId: string,
    reason?: string,
  ): Promise<ReleaseResult> {
    const device = await this.findDevice(deviceId);
    const open = await this.db
      .select()
      .from(deviceAssignments)
      .where(and(eq(deviceAssignments.deviceId, device.id), isNull(deviceAssignments.endedAt)))
      .limit(1);
    const assignment = open[0];
    if (!assignment) {
      throw AppError.notFound('Thiết bị không có phiên gán đang mở.');
    }

    const access = await this.access.requireSubject(user.id, assignment.subjectId);
    if (access.role !== 'owner') {
      throw AppError.forbidden('Chỉ chủ hồ sơ của thiết bị mới có thể tháo gán.');
    }

    const endedAt = new Date();
    await this.db
      .update(deviceAssignments)
      .set({ endedAt })
      .where(and(eq(deviceAssignments.id, assignment.id), isNull(deviceAssignments.endedAt)));
    await this.audit.record({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'device.release',
      targetType: 'device',
      targetId: device.id,
      outcome: 'success',
      metadata: {
        subjectId: assignment.subjectId,
        assignmentId: assignment.id,
        reason: reason?.trim() || null,
      },
    });
    return {
      assignmentId: assignment.id,
      deviceId: device.id,
      subjectId: assignment.subjectId,
      endedAt: endedAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Nội bộ
  // ---------------------------------------------------------------------------

  private async findDevice(deviceId: string): Promise<DeviceRow> {
    const rows = await this.db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
    const device = rows[0];
    if (!device) throw AppError.notFound('Không tìm thấy thiết bị.');
    return device;
  }

  /** Thiết bị đang gán cho hồ sơ + trạng thái online/freshness theo policy active. */
  private async loadSubjectDevices(subjectId: string): Promise<DeviceStatus[]> {
    const policy = await this.policy.getActive();
    const rows = await this.db
      .select({ device: devices, assignment: deviceAssignments })
      .from(deviceAssignments)
      .innerJoin(devices, eq(devices.id, deviceAssignments.deviceId))
      .where(and(eq(deviceAssignments.subjectId, subjectId), isNull(deviceAssignments.endedAt)))
      .orderBy(asc(devices.createdAt));

    const result: DeviceStatus[] = [];
    for (const row of rows) {
      const lastRow = await this.loadLastTelemetry(row.device.id, row.assignment.id);
      result.push(computeDeviceStatus(row.device, subjectId, policy.value, lastRow));
    }
    return result;
  }

  /**
   * Bản đo mới nhất theo giờ đo của mẫu đã đồng bộ giờ và không bị cách ly.
   * Sắp `measured_at desc nulls last, received_at desc, id desc` để mẫu đến trễ
   * không thay thế mẫu mới hơn. Bỏ mẫu thiếu `measured_at` vì không có mốc đo tin cậy.
   */
  private async loadLastTelemetry(deviceId: string, assignmentId: string): Promise<LastTelemetryView> {
    const rows = await this.db
      .select({
        measuredAt: telemetry.measuredAt,
        clockStatus: telemetry.clockStatus,
        metrics: telemetry.metrics,
        quality: telemetry.quality,
        batteryPercent: telemetry.batteryPercent,
        firmwareVersion: telemetry.firmwareVersion,
      })
      .from(telemetry)
      .where(
        and(
          eq(telemetry.deviceId, deviceId),
          eq(telemetry.assignmentId, assignmentId),
          eq(telemetry.clockStatus, 'synced'),
          eq(telemetry.isQuarantined, false),
          isNotNull(telemetry.measuredAt),
        ),
      )
      .orderBy(
        sql`${telemetry.measuredAt} desc nulls last, ${telemetry.receivedAt} desc, ${telemetry.id} desc`,
      )
      .limit(1);
    return rows[0] ?? null;
  }
}

function toAdminSummary(device: DeviceRow, assignedSubjectId: string | null): DeviceAdminSummary {
  return {
    id: device.id,
    serial: device.serial,
    label: device.label,
    status: device.status,
    firmwareVersion: device.firmwareVersion,
    lastSeenAt: device.lastSeenAt ? device.lastSeenAt.toISOString() : null,
    createdAt: device.createdAt.toISOString(),
    assignedSubjectId,
  };
}
