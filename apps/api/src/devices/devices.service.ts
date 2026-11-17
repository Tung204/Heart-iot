import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import type { UserSummary } from '@heart-iot/contracts';
import type {
  ClaimResult,
  CreateDeviceInput,
  DeviceAdminSummary,
  DeviceList,
  NewClaimCodeResult,
  ReleaseResult,
} from '@heart-iot/contracts/devices';
import type { DeviceStatus } from '@heart-iot/contracts/telemetry';
import type { SubjectStatusResponse } from '@heart-iot/contracts/measurements';
import { DB, type AppDb } from '../database/database';
import {
  deviceAssignments,
  devices,
  telemetry,
  type DeviceRow,
  type TelemetryRow,
} from '../database/schema';
import { AccessService, type SubjectAccess } from '../access/access.service';
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

  /**
   * Cấp claim code mới cho thiết bị **chưa gắn hồ sơ**.
   * Thiết bị đang có assignment mở phải bị từ chối 409 và giữ nguyên code cũ
   * (thường là `null` vì claim đã dùng code) — không tạo mã có thể dùng lại sau release.
   * Khóa dòng thiết bị trong transaction để hai request cấp mã không ghi đè lẫn nhau
   * và để request cấp mã thấy assignment do claim/release vừa commit.
   */
  async issueClaimCode(user: UserSummary, deviceId: string): Promise<NewClaimCodeResult> {
    this.access.requireAdmin(user);

    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(devices)
        .where(eq(devices.id, deviceId))
        .for('update')
        .limit(1);
      const device = rows[0];
      if (!device) throw AppError.notFound('Không tìm thấy thiết bị.');

      const open = await tx
        .select({ id: deviceAssignments.id })
        .from(deviceAssignments)
        .where(and(eq(deviceAssignments.deviceId, device.id), isNull(deviceAssignments.endedAt)))
        .limit(1);
      if (open.length > 0) {
        throw AppError.conflict('Thiết bị đang gắn hồ sơ; hãy gỡ trước khi tạo mã.', {
          code: 'DEVICE_ALREADY_ASSIGNED',
        });
      }

      const claimCode = generateClaimCode();
      const expiresAt = new Date(Date.now() + CLAIM_CODE_TTL_MS);
      await tx
        .update(devices)
        .set({
          claimCodeHash: sha256(claimCode),
          claimCodeExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(devices.id, device.id));
      await this.audit.record(
        {
          actorUserId: user.id,
          actorKind: 'user',
          action: 'device.claim_code_issued',
          targetType: 'device',
          targetId: device.id,
          outcome: 'success',
        },
        tx,
      );
      return { claimCode, expiresAt: expiresAt.toISOString() };
    });
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
    // `requireHistory(..., undefined)` không từ chối khoảng thời gian; nó chỉ tính
    // mốc hiệu lực `max(now - historyDays, sharedFrom)` dùng chung với lịch sử.
    const { access, effectiveFrom } = await this.access.requireHistory(
      user.id,
      subjectId,
      undefined,
    );
    return this.loadSubjectDevices(
      access.subject.id,
      this.statusVisibleFrom(access, effectiveFrom),
      this.access.canViewMeasurements(access),
    );
  }

  async getSubjectStatus(user: UserSummary, subjectId: string): Promise<SubjectStatusResponse> {
    const { access, effectiveFrom } = await this.access.requireHistory(
      user.id,
      subjectId,
      undefined,
    );
    const visibleFrom = this.statusVisibleFrom(access, effectiveFrom);
    // Người thân không có quyền xem số đo vẫn nhận được trạng thái kết nối/pin,
    // nhưng mọi trường số đo bị làm rỗng (`healthDataVisible=false`). Chủ hồ sơ luôn `true`.
    const healthDataVisible = this.access.canViewMeasurements(access);
    const [policy, devicesStatus] = await Promise.all([
      this.policy.getActive(),
      this.loadSubjectDevices(access.subject.id, visibleFrom, healthDataVisible),
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
    await this.db.transaction(async (tx) => {
      // Đóng đúng assignment đang mở đã đọc ở trên; release đồng thời khác sẽ
      // không khớp điều kiện `endedAt is null` và nhận 404 thay vì ghi đè.
      const closed = await tx
        .update(deviceAssignments)
        .set({ endedAt })
        .where(and(eq(deviceAssignments.id, assignment.id), isNull(deviceAssignments.endedAt)))
        .returning({ id: deviceAssignments.id });
      if (closed.length === 0) {
        throw AppError.notFound('Thiết bị không có phiên gán đang mở.');
      }
      // Claim code đang chờ (nếu có, kể cả dữ liệu cũ do lỗi trước đây) phải
      // mất hiệu lực khi thiết bị không còn gắn hồ sơ.
      await tx
        .update(devices)
        .set({ claimCodeHash: null, claimCodeExpiresAt: null, updatedAt: endedAt })
        .where(eq(devices.id, device.id));
      await this.audit.record(
        {
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
        },
        tx,
      );
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

  /**
   * Mốc sớm nhất được phép dùng cho trạng thái thiết bị. Chủ hồ sơ giữ nguyên hành vi cũ
   * (thấy cả mẫu trước mốc chia sẻ); người thân dùng đúng cửa sổ hiệu lực của lịch sử:
   * `max(now - permissions.historyDays, sharedFrom)`.
   */
  private statusVisibleFrom(access: SubjectAccess, effectiveFrom: Date): Date | null {
    return access.role === 'owner' ? null : effectiveFrom;
  }

  /**
   * Thiết bị đang gán cho hồ sơ + trạng thái online/freshness theo policy active.
   * `visibleFrom = null` nghĩa là không giới hạn (chủ hồ sơ).
   */
  private async loadSubjectDevices(
    subjectId: string,
    visibleFrom: Date | null,
    healthDataVisible = true,
  ): Promise<DeviceStatus[]> {
    const policy = await this.policy.getActive();
    const rows = await this.db
      .select({ device: devices, assignment: deviceAssignments })
      .from(deviceAssignments)
      .innerJoin(devices, eq(devices.id, deviceAssignments.deviceId))
      .where(and(eq(deviceAssignments.subjectId, subjectId), isNull(deviceAssignments.endedAt)))
      .orderBy(asc(devices.createdAt));

    const result: DeviceStatus[] = [];
    for (const row of rows) {
      const lastRow = await this.loadLastTelemetry(row.device.id, row.assignment.id, visibleFrom);
      result.push(
        computeDeviceStatus(
          row.device,
          subjectId,
          policy.value,
          lastRow,
          new Date(),
          visibleFrom,
          healthDataVisible,
        ),
      );
    }
    return result;
  }

  /**
   * Bản đo mới nhất theo giờ đo của mẫu đã đồng bộ giờ và không bị cách ly.
   * Sắp `measured_at desc nulls last, received_at desc, id desc` để mẫu đến trễ
   * không thay thế mẫu mới hơn. Bỏ mẫu thiếu `measured_at` vì không có mốc đo tin cậy.
   * `visibleFrom` giới hạn mẫu được phép dùng (`measured_at >= visibleFrom`) cho người thân;
   * không có mẫu trong cửa sổ thì trả `null` thay vì lấy mẫu trước mốc chia sẻ.
   */
  private async loadLastTelemetry(
    deviceId: string,
    assignmentId: string,
    visibleFrom: Date | null,
  ): Promise<LastTelemetryView> {
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
          visibleFrom ? gte(telemetry.measuredAt, visibleFrom) : undefined,
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
