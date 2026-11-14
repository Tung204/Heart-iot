import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import {
  LATE_EVENT_MINUTES,
  alertUpdatedEventSchema,
  incidentDetailSchema,
  incidentListSchema,
  type AcknowledgeAlert,
  type AlertsQuery,
  type IncidentDetail,
  type IncidentList,
  type ResolveAlert,
} from '@annhien/contracts/incidents';
import {
  ingestAckSchema,
  type IncidentEnvelope,
  type IncidentEventType,
  type IngestAck,
} from '@annhien/contracts/telemetry';
import { OWNER_PERMISSIONS, type CarePermissions, type IncidentState } from '@annhien/contracts';
import { DB, type AppDb } from '../database/database';
import {
  alertActions,
  careLinks,
  deviceAssignments,
  devices,
  incidentEvents,
  incidents,
  notificationOutbox,
  realtimeEvents,
  subjects,
  users,
  type DeviceRow,
  type IncidentRow,
} from '../database/schema';
import { AccessService } from '../access/access.service';
import { AuditService } from '../access/audit.service';
import { AppError } from '../common/app-error';
import { isUniqueViolation } from '../database/errors';
import { sha256 } from '../auth/password';
import { decodeCursor, encodeCursor } from '../common/pagination';
import { currentRequestId } from '../common/request-context';

/** Kiểu executor giao dịch: chấp nhận cả DB chính lẫn transaction. */
export type DbExecutor = Parameters<Parameters<AppDb['transaction']>[0]>[0];

export const CANCEL_REQUESTED_REASON = 'Thiết bị yêu cầu hủy sau khi đã xác nhận';
export const CANCEL_REQUESTED_OUTCOME = 'cancelled_by_user';

export type AppliedTransition = {
  state: IncidentState;
  applied: boolean;
  conflictReason: string | null;
  resolutionReason?: string;
  resolutionOutcome?: string;
};

/**
 * Bảng chuyển trạng thái theo docs/03 + hợp đồng prompt.
 * Không bao giờ hạ cấp hoặc mở lại incident đã ở trạng thái terminal.
 */
export function applyTransition(state: IncidentState, eventType: IncidentEventType): AppliedTransition {
  switch (eventType) {
    case 'fall.candidate':
      // candidate chỉ có nghĩa khi tạo mới; incident đã tồn tại thì không đổi.
      if (state === 'suspected') return { state, applied: true, conflictReason: null };
      return { state, applied: false, conflictReason: 'candidate_on_existing' };
    case 'fall.cancelled':
      if (state === 'suspected') return { state: 'cancelled', applied: true, conflictReason: null };
      if (state === 'open' || state === 'acknowledged') {
        return { state, applied: false, conflictReason: 'already_confirmed' };
      }
      return { state, applied: false, conflictReason: 'terminal_state' };
    case 'fall.confirmed':
    case 'sos.confirmed':
      if (state === 'suspected') return { state: 'open', applied: true, conflictReason: null };
      if (state === 'open' || state === 'acknowledged') {
        return { state, applied: true, conflictReason: null };
      }
      return { state, applied: false, conflictReason: 'terminal_state' };
    case 'user.cancel_requested':
      if (state === 'suspected') return { state: 'cancelled', applied: true, conflictReason: null };
      if (state === 'open' || state === 'acknowledged') {
        return {
          state: 'resolved',
          applied: true,
          conflictReason: null,
          resolutionReason: CANCEL_REQUESTED_REASON,
          resolutionOutcome: CANCEL_REQUESTED_OUTCOME,
        };
      }
      return { state, applied: false, conflictReason: 'terminal_state' };
  }
}

export function isTerminalState(state: IncidentState): boolean {
  return state === 'resolved' || state === 'cancelled';
}

/** Sắp xếp khóa đệ quy để JSON.stringify ổn định bất kể thứ tự khóa của jsonb. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonical((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function normalizedTime(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

/** Vân tay nội dung sự kiện, không gồm định danh vận chuyển (message_id/boot_id/sequence). */
export function eventFingerprint(envelope: IncidentEnvelope): string {
  return sha256(
    JSON.stringify(
      canonical({
        event_revision: envelope.event_revision,
        event_type: envelope.event_type,
        incident_type: envelope.incident_type,
        measured_at: normalizedTime(envelope.measured_at),
        clock_status: envelope.clock_status,
        evidence: envelope.evidence,
      }),
    ),
  );
}

/** Vân tay của sự kiện đã lưu, tính lại từ dòng incident_events. */
function storedEventFingerprint(row: {
  eventRevision: number;
  eventType: string;
  measuredAt: Date | null;
  payload: unknown;
}): string {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  return sha256(
    JSON.stringify(
      canonical({
        event_revision: row.eventRevision,
        event_type: row.eventType,
        incident_type: payload['incident_type'] ?? null,
        measured_at: normalizedTime(row.measuredAt ? row.measuredAt.toISOString() : null),
        clock_status: payload['clock_status'] ?? null,
        evidence: payload['evidence'] ?? null,
      }),
    ),
  );
}

export function outboxKind(dedupeKey: string): 'alert' | 'update' {
  const parts = dedupeKey.split(':');
  const last = parts[parts.length - 1];
  return last === 'update' ? 'update' : 'alert';
}

@Injectable()
export class IncidentsService {
  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Ingest sự kiện thiết bị
  // ---------------------------------------------------------------------------

  async ingestEvent(device: DeviceRow, envelope: IncidentEnvelope): Promise<IngestAck> {
    const receivedAt = new Date();
    const ackBase = { sourceMessageId: envelope.message_id, receivedAt: receivedAt.toISOString() };

    const assignmentRows = await this.db
      .select()
      .from(deviceAssignments)
      .where(and(eq(deviceAssignments.deviceId, device.id), isNull(deviceAssignments.endedAt)))
      .limit(1);
    const assignment = assignmentRows[0];
    if (!assignment) {
      await this.audit.record({
        actorKind: 'device',
        action: 'incident.ingest',
        targetType: 'device',
        targetId: device.id,
        outcome: 'denied',
        metadata: { code: 'DEVICE_NOT_CLAIMED', messageId: envelope.message_id, incidentId: envelope.incident_id },
      });
      return ingestAckSchema.parse({
        ...ackBase,
        status: 'rejected',
        incidentId: null,
        acceptedRevision: null,
        code: 'DEVICE_NOT_CLAIMED',
        message: 'Thiết bị chưa được gán vào hồ sơ nào.',
      });
    }

    return this.db.transaction(async (tx) => {
      // 1) Bản tin này đã được lưu chưa? (unique device_id + message_id)
      const storedMessage = await tx
        .select({
          incidentId: incidentEvents.incidentId,
          eventRevision: incidentEvents.eventRevision,
          eventType: incidentEvents.eventType,
          measuredAt: incidentEvents.measuredAt,
          payload: incidentEvents.payload,
        })
        .from(incidentEvents)
        .where(
          and(
            eq(incidentEvents.deviceId, device.id),
            eq(incidentEvents.messageId, envelope.message_id),
          ),
        )
        .limit(1);
      if (storedMessage.length > 0) {
        const stored = storedMessage[0]!;
        // Cùng (device_id, message_id) nhưng khác nội dung là xung đột giao thức,
        // không được trả duplicate để thiết bị xóa bản tin khỏi hàng đợi.
        if (eventFingerprint(envelope) !== storedEventFingerprint(stored)) {
          await this.audit.record(
            {
              actorKind: 'device',
              action: 'incident.ingest',
              targetType: 'incident',
              targetId: stored.incidentId,
              outcome: 'conflict',
              metadata: { code: 'CONFLICT', messageId: envelope.message_id },
            },
            tx,
          );
          return ingestAckSchema.parse({
            ...ackBase,
            status: 'rejected',
            incidentId: null,
            acceptedRevision: null,
            code: 'CONFLICT',
            message: 'message_id đã được dùng cho một sự kiện khác nội dung.',
          });
        }
        return ingestAckSchema.parse({
          ...ackBase,
          status: 'duplicate',
          incidentId: stored.incidentId,
          acceptedRevision: stored.eventRevision,
          code: null,
          message: null,
        });
      }

      // 2) Khóa/tạo incident theo namespace (device_id, device_incident_id).
      let incidentRow = (
        await tx
          .select()
          .from(incidents)
          .where(and(eq(incidents.deviceId, device.id), eq(incidents.deviceIncidentId, envelope.incident_id)))
          .for('update')
          .limit(1)
      )[0];
      let created = false;
      if (!incidentRow) {
        const detectedAt = envelope.measured_at ? new Date(envelope.measured_at) : receivedAt;
        try {
          const inserted = await tx
            .insert(incidents)
            .values({
              subjectId: assignment.subjectId,
              assignmentId: assignment.id,
              deviceId: device.id,
              deviceIncidentId: envelope.incident_id,
              type: envelope.incident_type,
              state: 'suspected',
              lastRevision: envelope.event_revision,
              detectedAt,
              lastEventAt: receivedAt,
              version: 1,
            })
            .returning();
          incidentRow = inserted[0];
          created = true;
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          incidentRow = (
            await tx
              .select()
              .from(incidents)
              .where(and(eq(incidents.deviceId, device.id), eq(incidents.deviceIncidentId, envelope.incident_id)))
              .for('update')
              .limit(1)
          )[0];
          if (!incidentRow) throw error;
        }
      }
      if (!incidentRow) throw new Error('Không thể tạo hoặc đọc incident.');

      const revision = envelope.event_revision;

      // 3) Revision cũ đến sau: không lùi trạng thái. Nếu revision này chưa có
      //    sự kiện nào thì lưu lịch sử applied=false; nếu slot đã có (unique
      //    incidentId+eventRevision của schema) thì so nội dung: giống → accepted,
      //    khác → lỗi giao thức, từ chối + audit.
      if (!created && revision < incidentRow.lastRevision) {
        const slot = await tx
          .select()
          .from(incidentEvents)
          .where(and(eq(incidentEvents.incidentId, incidentRow.id), eq(incidentEvents.eventRevision, revision)))
          .limit(1);
        const slotRow = slot[0];
        if (!slotRow) {
          await this.insertEventRow(tx, incidentRow, envelope, receivedAt, false, 'stale_revision');
        } else if (eventFingerprint(envelope) !== storedEventFingerprint(slotRow)) {
          await this.audit.record(
            {
              actorKind: 'device',
              action: 'incident.ingest',
              targetType: 'incident',
              targetId: incidentRow.id,
              outcome: 'conflict',
              metadata: { code: 'CONFLICT', messageId: envelope.message_id, revision },
            },
            tx,
          );
          return ingestAckSchema.parse({
            ...ackBase,
            status: 'rejected',
            incidentId: null,
            acceptedRevision: null,
            code: 'CONFLICT',
            message: 'Hai bản tin khác nhau dùng chung incident_id + event_revision.',
          });
        }
        return ingestAckSchema.parse({
          ...ackBase,
          status: 'accepted',
          incidentId: incidentRow.id,
          acceptedRevision: incidentRow.lastRevision,
          code: null,
          message: null,
        });
      }

      // 4) Cùng revision đã có sự kiện: so nội dung để trả duplicate hoặc từ chối.
      if (!created && revision === incidentRow.lastRevision) {
        const existing = await tx
          .select()
          .from(incidentEvents)
          .where(and(eq(incidentEvents.incidentId, incidentRow.id), eq(incidentEvents.eventRevision, revision)))
          .limit(1);
        const existingRow = existing[0];
        if (existingRow) {
          const same = eventFingerprint(envelope) === storedEventFingerprint(existingRow);
          if (same) {
            return ingestAckSchema.parse({
              ...ackBase,
              status: 'duplicate',
              incidentId: incidentRow.id,
              acceptedRevision: revision,
              code: null,
              message: null,
            });
          }
          await this.audit.record(
            {
              actorKind: 'device',
              action: 'incident.ingest',
              targetType: 'incident',
              targetId: incidentRow.id,
              outcome: 'conflict',
              metadata: { code: 'CONFLICT', messageId: envelope.message_id, revision },
            },
            tx,
          );
          return ingestAckSchema.parse({
            ...ackBase,
            status: 'rejected',
            incidentId: null,
            acceptedRevision: null,
            code: 'CONFLICT',
            message: 'Hai bản tin khác nhau dùng chung incident_id + event_revision.',
          });
        }
        // Không có sự kiện ở revision này nhưng lastRevision bằng nhau:
        // vẫn áp dụng transition bên dưới, không nâng lastRevision.
      }

      // 5) Áp dụng transition.
      const transition = applyTransition(incidentRow.state, envelope.event_type);
      const stateChanged = transition.state !== incidentRow.state;
      const newVersion = stateChanged ? incidentRow.version + 1 : incidentRow.version;
      const newLastRevision = Math.max(incidentRow.lastRevision, revision);

      await this.insertEventRow(
        tx,
        incidentRow,
        envelope,
        receivedAt,
        transition.applied,
        transition.conflictReason,
      );

      const setPatch: Record<string, unknown> = {
        state: transition.state,
        version: newVersion,
        lastRevision: newLastRevision,
        lastEventAt: receivedAt,
        updatedAt: receivedAt,
      };
      if (stateChanged && transition.state === 'cancelled') {
        setPatch['cancelledAt'] = receivedAt;
      }
      if (stateChanged && transition.state === 'resolved') {
        setPatch['resolvedAt'] = receivedAt;
        setPatch['resolutionReason'] = transition.resolutionReason ?? null;
        setPatch['resolutionOutcome'] = transition.resolutionOutcome ?? null;
      }
      await tx.update(incidents).set(setPatch).where(eq(incidents.id, incidentRow.id));

      // 6) Realtime: chỉ phát khi trạng thái không còn là suspected (không lộ
      //    incident chưa xác nhận ra stream của người thân).
      const revisionChanged = created || revision > incidentRow.lastRevision;
      if ((stateChanged || revisionChanged) && transition.state !== 'suspected') {
        await this.writeAlertUpdated(tx, {
          incidentId: incidentRow.id,
          subjectId: incidentRow.subjectId,
          state: transition.state,
          version: newVersion,
          lastRevision: newLastRevision,
        });
      }

      // 7) Outbox trong cùng transaction.
      if (stateChanged && transition.state === 'open') {
        await this.createOutboxRows(tx, incidentRow.id, incidentRow.subjectId, newVersion, 'alert');
      }
      if (stateChanged && (transition.state === 'acknowledged' || transition.state === 'resolved')) {
        await this.createUpdateOutbox(tx, incidentRow.id, incidentRow.subjectId, newVersion);
      }
      if (stateChanged && isTerminalState(transition.state)) {
        await this.supersedePending(tx, incidentRow.id, newVersion);
      }

      return ingestAckSchema.parse({
        ...ackBase,
        status: 'accepted',
        incidentId: incidentRow.id,
        acceptedRevision: newLastRevision,
        code: null,
        message: null,
      });
    });
  }

  private async insertEventRow(
    tx: DbExecutor,
    incident: IncidentRow,
    envelope: IncidentEnvelope,
    receivedAt: Date,
    applied: boolean,
    conflictReason: string | null,
  ): Promise<void> {
    await tx.insert(incidentEvents).values({
      incidentId: incident.id,
      deviceId: incident.deviceId,
      messageId: envelope.message_id,
      eventRevision: envelope.event_revision,
      eventType: envelope.event_type,
      payload: { ...envelope },
      measuredAt: envelope.measured_at ? new Date(envelope.measured_at) : null,
      receivedAt,
      applied,
      conflictReason,
    });
  }

  private async writeAlertUpdated(
    tx: DbExecutor,
    input: {
      incidentId: string;
      subjectId: string;
      state: IncidentState;
      version: number;
      lastRevision: number;
    },
  ): Promise<void> {
    const payload = alertUpdatedEventSchema.parse({
      incidentId: input.incidentId,
      subjectId: input.subjectId,
      state: input.state,
      version: input.version,
      lastRevision: input.lastRevision,
      occurredAt: new Date().toISOString(),
    });
    await tx.insert(realtimeEvents).values({
      subjectId: input.subjectId,
      type: 'alert.updated',
      entityId: input.incidentId,
      payload,
    });
  }

  private async listAlertRecipients(
    tx: DbExecutor,
    subjectId: string,
  ): Promise<Array<{ userId: string; displayName: string }>> {
    const subjectRows = await tx
      .select({ ownerUserId: subjects.ownerUserId })
      .from(subjects)
      .where(eq(subjects.id, subjectId))
      .limit(1);
    const subjectRow = subjectRows[0];
    if (!subjectRow) return [];

    const result: Array<{ userId: string; displayName: string }> = [];
    const ownerRows = await tx
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, subjectRow.ownerUserId))
      .limit(1);
    if (ownerRows[0]) result.push({ userId: ownerRows[0].id, displayName: ownerRows[0].displayName });

    const linkRows = await tx
      .select({ caregiverUserId: careLinks.caregiverUserId, permissions: careLinks.permissions })
      .from(careLinks)
      .where(
        and(
          eq(careLinks.subjectId, subjectId),
          eq(careLinks.status, 'active'),
          isNull(careLinks.revokedAt),
        ),
      );
    const caregiverIds = linkRows
      .filter((link) => link.permissions.canReceiveAlerts)
      .map((link) => link.caregiverUserId);
    if (caregiverIds.length > 0) {
      const userRows = await tx
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, caregiverIds));
      for (const row of userRows) result.push({ userId: row.id, displayName: row.displayName });
    }
    return result;
  }

  private async createOutboxRows(
    tx: DbExecutor,
    incidentId: string,
    subjectId: string,
    revision: number,
    kind: 'alert' | 'update',
  ): Promise<void> {
    const recipients = await this.listAlertRecipients(tx, subjectId);
    for (const recipient of recipients) {
      await tx
        .insert(notificationOutbox)
        .values({
          incidentId,
          revision,
          recipientUserId: recipient.userId,
          channel: 'in_app',
          status: 'pending',
          attempts: 0,
          nextAttemptAt: new Date(),
          dedupeKey: `${incidentId}:${revision}:${recipient.userId}:in_app:${kind}`,
        })
        .onConflictDoNothing({ target: notificationOutbox.dedupeKey });
    }
  }

  /**
   * Cập nhật cho người đã nhận cảnh báo trước đó; nếu chưa ai nhận thì
   * gửi cho owner + người thân active có canReceiveAlerts.
   * `revision` dùng business version (tăng mỗi lần đổi trạng thái) để
   * dedupeKey phân biệt các lần cập nhật khác nhau.
   */
  private async createUpdateOutbox(
    tx: DbExecutor,
    incidentId: string,
    subjectId: string,
    revision: number,
  ): Promise<void> {
    const sentRows = await tx
      .select({ recipientUserId: notificationOutbox.recipientUserId })
      .from(notificationOutbox)
      .where(and(eq(notificationOutbox.incidentId, incidentId), eq(notificationOutbox.status, 'sent')));
    let recipientIds = [...new Set(sentRows.map((row) => row.recipientUserId))];
    if (recipientIds.length === 0) {
      recipientIds = (await this.listAlertRecipients(tx, subjectId)).map((r) => r.userId);
    }
    for (const recipientId of recipientIds) {
      await tx
        .insert(notificationOutbox)
        .values({
          incidentId,
          revision,
          recipientUserId: recipientId,
          channel: 'in_app',
          status: 'pending',
          attempts: 0,
          nextAttemptAt: new Date(),
          dedupeKey: `${incidentId}:${revision}:${recipientId}:in_app:update`,
        })
        .onConflictDoNothing({ target: notificationOutbox.dedupeKey });
    }
  }

  /**
   * R-01: khi incident đóng, mọi tác vụ chưa gửi cũ thành superseded để không
   * gửi cảnh báo mở sau khi đã đóng. Giữ lại bản update vừa tạo (revision mới).
   */
  private async supersedePending(
    tx: DbExecutor,
    incidentId: string,
    currentRevision: number,
  ): Promise<void> {
    const now = new Date();
    await tx
      .update(notificationOutbox)
      .set({ status: 'superseded', supersededAt: now, updatedAt: now })
      .where(
        and(
          eq(notificationOutbox.incidentId, incidentId),
          eq(notificationOutbox.status, 'pending'),
          or(
            sql`${notificationOutbox.dedupeKey} like '%:alert'`,
            lt(notificationOutbox.revision, currentRevision),
          ),
        ),
      );
  }

  // ---------------------------------------------------------------------------
  // Truy vấn và thao tác người dùng
  // ---------------------------------------------------------------------------

  async listAlerts(userId: string, subjectId: string, query: AlertsQuery): Promise<IncidentList> {
    const access = await this.access.requireSubject(userId, subjectId);
    if (access.role !== 'owner') {
      this.access.assertAction(access, 'receive_alerts');
    }
    const states: IncidentState[] =
      query.state === 'closed' ? ['resolved', 'cancelled', 'unconfirmed'] : ['open', 'acknowledged'];

    let cursorFilter = undefined;
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const detectedAt = typeof cursor['detectedAt'] === 'string' ? new Date(cursor['detectedAt']) : null;
      const id = typeof cursor['id'] === 'string' ? cursor['id'] : null;
      if (detectedAt && id) {
        cursorFilter = or(
          lt(incidents.detectedAt, detectedAt),
          and(eq(incidents.detectedAt, detectedAt), lt(incidents.id, id)),
        );
      }
    }

    const rows = await this.db
      .select()
      .from(incidents)
      .where(
        and(
          eq(incidents.subjectId, subjectId),
          inArray(incidents.state, states),
          cursorFilter ?? undefined,
        ),
      )
      .orderBy(desc(incidents.detectedAt), desc(incidents.id))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const items = await this.buildSummaries(page);
    const lastRow = page[page.length - 1];
    const nextCursor = hasMore && lastRow
      ? encodeCursor({ detectedAt: lastRow.detectedAt.toISOString(), id: lastRow.id })
      : null;
    return incidentListSchema.parse({ items, nextCursor });
  }

  async getAlert(userId: string, alertId: string): Promise<IncidentDetail> {
    const incidentRow = await this.loadVisibleIncident(userId, alertId);
    return this.buildDetail(incidentRow);
  }

  /** 404 khi không tồn tại hoặc đang suspected. */
  private async loadVisibleIncident(
    userId: string,
    alertId: string,
    action?: 'acknowledge' | 'resolve',
  ): Promise<IncidentRow> {
    const rows = await this.db.select().from(incidents).where(eq(incidents.id, alertId)).limit(1);
    const incidentRow = rows[0];
    if (!incidentRow || incidentRow.state === 'suspected') {
      throw AppError.notFound('Không tìm thấy cảnh báo.');
    }
    const access = await this.access.requireSubject(userId, incidentRow.subjectId);
    if (action) {
      // Thao tác cần quyền rõ ràng: thiếu quyền trả 403 để UI phân biệt chính sách.
      this.access.assertAction(access, action);
      return incidentRow;
    }
    // Nhất quán với list: có link nhưng thiếu quyền nhận cảnh báo → 403;
    // không có link thì requireSubject ở trên đã trả 404 (không lộ tồn tại).
    this.access.assertAction(access, 'receive_alerts');
    return incidentRow;
  }

  async acknowledgeAlert(
    userId: string,
    alertId: string,
    input: AcknowledgeAlert,
  ): Promise<IncidentDetail> {
    const incidentRow = await this.loadVisibleIncident(userId, alertId, 'acknowledge');

    let conflict: { value: { stateBefore: IncidentState; stateAfter: IncidentState } | null } = {
      value: null,
    };
    try {
      await this.db.transaction(async (tx) => {
        const locked = (
          await tx.select().from(incidents).where(eq(incidents.id, alertId)).for('update').limit(1)
        )[0];
        if (!locked || locked.state === 'suspected') {
          throw AppError.notFound('Không tìm thấy cảnh báo.');
        }
        if (locked.version !== input.expectedVersion) {
          conflict.value = { stateBefore: locked.state, stateAfter: locked.state };
          throw AppError.conflict('Phiên bản cảnh báo đã thay đổi, hãy tải lại.', {
            currentVersion: locked.version,
          });
        }
        if (locked.state !== 'open') {
          conflict.value = { stateBefore: locked.state, stateAfter: locked.state };
          throw AppError.conflict('Cảnh báo không còn ở trạng thái chờ xác nhận.', {
            state: locked.state,
          });
        }
        const newVersion = locked.version + 1;
        await tx
          .update(incidents)
          .set({ state: 'acknowledged', version: newVersion, updatedAt: new Date() })
          .where(eq(incidents.id, alertId));
        await tx.insert(alertActions).values({
          incidentId: alertId,
          actorUserId: userId,
          action: 'acknowledge',
          reason: null,
          outcome: 'applied',
          stateBefore: 'open',
          stateAfter: 'acknowledged',
          requestId: currentRequestId() ?? null,
        });
        await this.audit.record(
          {
            actorUserId: userId,
            actorKind: 'user',
            action: 'incident.acknowledge',
            targetType: 'incident',
            targetId: alertId,
            outcome: 'success',
          },
          tx,
        );
        await this.createUpdateOutbox(tx, alertId, locked.subjectId, newVersion);
        await this.writeAlertUpdated(tx, {
          incidentId: alertId,
          subjectId: locked.subjectId,
          state: 'acknowledged',
          version: newVersion,
          lastRevision: locked.lastRevision,
        });
      });
    } catch (error) {
      if (conflict.value) {
        await this.db.insert(alertActions).values({
          incidentId: alertId,
          actorUserId: userId,
          action: 'acknowledge',
          reason: null,
          outcome: 'conflict',
          stateBefore: conflict.value.stateBefore,
          stateAfter: conflict.value.stateAfter,
          requestId: currentRequestId() ?? null,
        });
        await this.audit.record({
          actorUserId: userId,
          actorKind: 'user',
          action: 'incident.acknowledge',
          targetType: 'incident',
          targetId: alertId,
          outcome: 'conflict',
        });
      }
      throw error;
    }
    return this.getAlert(userId, alertId);
  }

  async resolveAlert(userId: string, alertId: string, input: ResolveAlert): Promise<IncidentDetail> {
    const incidentRow = await this.loadVisibleIncident(userId, alertId, 'resolve');

    let conflict: { value: { stateBefore: IncidentState; stateAfter: IncidentState } | null } = {
      value: null,
    };
    try {
      await this.db.transaction(async (tx) => {
        const locked = (
          await tx.select().from(incidents).where(eq(incidents.id, alertId)).for('update').limit(1)
        )[0];
        if (!locked || locked.state === 'suspected') {
          throw AppError.notFound('Không tìm thấy cảnh báo.');
        }
        if (locked.version !== input.expectedVersion) {
          conflict.value = { stateBefore: locked.state, stateAfter: locked.state };
          throw AppError.conflict('Phiên bản cảnh báo đã thay đổi, hãy tải lại.', {
            currentVersion: locked.version,
          });
        }
        if (locked.state === 'resolved' || locked.state === 'cancelled') {
          conflict.value = { stateBefore: locked.state, stateAfter: locked.state };
          throw AppError.conflict('Cảnh báo đã được đóng trước đó.', { state: locked.state });
        }
        if (locked.state !== 'open' && locked.state !== 'acknowledged') {
          conflict.value = { stateBefore: locked.state, stateAfter: locked.state };
          throw AppError.conflict('Cảnh báo không thể đóng ở trạng thái hiện tại.', {
            state: locked.state,
          });
        }
        const now = new Date();
        const newVersion = locked.version + 1;
        await tx
          .update(incidents)
          .set({
            state: 'resolved',
            version: newVersion,
            resolvedAt: now,
            resolvedByUserId: userId,
            resolutionReason: input.reason,
            resolutionOutcome: input.outcome,
            updatedAt: now,
          })
          .where(eq(incidents.id, alertId));
        await tx.insert(alertActions).values({
          incidentId: alertId,
          actorUserId: userId,
          action: 'resolve',
          reason: input.reason,
          outcome: 'applied',
          stateBefore: locked.state,
          stateAfter: 'resolved',
          requestId: currentRequestId() ?? null,
        });
        await this.audit.record(
          {
            actorUserId: userId,
            actorKind: 'user',
            action: 'incident.resolve',
            targetType: 'incident',
            targetId: alertId,
            outcome: 'success',
            metadata: { outcome: input.outcome },
          },
          tx,
        );
        await this.createUpdateOutbox(tx, alertId, locked.subjectId, newVersion);
        await this.supersedePending(tx, alertId, newVersion);
        await this.writeAlertUpdated(tx, {
          incidentId: alertId,
          subjectId: locked.subjectId,
          state: 'resolved',
          version: newVersion,
          lastRevision: locked.lastRevision,
        });
      });
    } catch (error) {
      if (conflict.value) {
        await this.db.insert(alertActions).values({
          incidentId: alertId,
          actorUserId: userId,
          action: 'resolve',
          reason: input.reason,
          outcome: 'conflict',
          stateBefore: conflict.value.stateBefore,
          stateAfter: conflict.value.stateAfter,
          requestId: currentRequestId() ?? null,
        });
        await this.audit.record({
          actorUserId: userId,
          actorKind: 'user',
          action: 'incident.resolve',
          targetType: 'incident',
          targetId: alertId,
          outcome: 'conflict',
        });
      }
      throw error;
    }
    return this.getAlert(userId, alertId);
  }

  // ---------------------------------------------------------------------------
  // Dựng view
  // ---------------------------------------------------------------------------

  private async buildSummaries(rows: IncidentRow[]) {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const deviceRows = await this.db
      .select({ id: devices.id, label: devices.label, serial: devices.serial, incidentId: incidents.id })
      .from(incidents)
      .innerJoin(devices, eq(devices.id, incidents.deviceId))
      .where(inArray(incidents.id, ids));
    const deviceById = new Map(deviceRows.map((row) => [row.incidentId, row]));

    const actionRows = await this.db
      .select({ incidentId: alertActions.incidentId, user: users })
      .from(alertActions)
      .leftJoin(users, eq(users.id, alertActions.actorUserId))
      .where(and(inArray(alertActions.incidentId, ids), eq(alertActions.action, 'acknowledge'), eq(alertActions.outcome, 'applied')))
      .orderBy(desc(alertActions.createdAt));
    const acknowledgedBy = new Map<string, { userId: string; displayName: string }>();
    for (const row of actionRows) {
      if (!acknowledgedBy.has(row.incidentId) && row.user) {
        acknowledgedBy.set(row.incidentId, { userId: row.user.id, displayName: row.user.displayName });
      }
    }

    return rows.map((incident) => this.toSummary(incident, deviceById.get(incident.id), acknowledgedBy.get(incident.id) ?? null));
  }

  private toSummary(
    incident: IncidentRow,
    device: { id: string; label: string; serial: string } | undefined,
    acknowledgedBy: { userId: string; displayName: string } | null,
  ) {
    const late =
      incident.lastEventAt.getTime() - incident.detectedAt.getTime() > LATE_EVENT_MINUTES * 60 * 1000;
    return {
      id: incident.id,
      subjectId: incident.subjectId,
      device: {
        id: device?.id ?? incident.deviceId,
        label: device?.label ?? '',
        serial: device?.serial ?? '',
      },
      type: incident.type,
      state: incident.state,
      lastRevision: incident.lastRevision,
      detectedAt: incident.detectedAt.toISOString(),
      lastEventAt: incident.lastEventAt.toISOString(),
      createdAt: incident.createdAt.toISOString(),
      cancelledAt: incident.cancelledAt?.toISOString() ?? null,
      resolvedAt: incident.resolvedAt?.toISOString() ?? null,
      resolutionReason: incident.resolutionReason,
      resolutionOutcome: incident.resolutionOutcome,
      version: incident.version,
      late,
      acknowledgedBy,
    };
  }

  private async buildDetail(incident: IncidentRow): Promise<IncidentDetail> {
    const [deviceRows, eventRows, actionRows, outboxRows] = await Promise.all([
      this.db
        .select({ id: devices.id, label: devices.label, serial: devices.serial })
        .from(devices)
        .where(eq(devices.id, incident.deviceId))
        .limit(1),
      this.db
        .select()
        .from(incidentEvents)
        .where(eq(incidentEvents.incidentId, incident.id))
        .orderBy(asc(incidentEvents.eventRevision), asc(incidentEvents.receivedAt)),
      this.db
        .select({ action: alertActions, user: users })
        .from(alertActions)
        .leftJoin(users, eq(users.id, alertActions.actorUserId))
        .where(eq(alertActions.incidentId, incident.id))
        .orderBy(asc(alertActions.createdAt)),
      this.db
        .select({ recipientUserId: notificationOutbox.recipientUserId })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.incidentId, incident.id)),
    ]);

    const device = deviceRows[0];
    const acknowledgedAction = actionRows
      .filter((row) => row.action.action === 'acknowledge' && row.action.outcome === 'applied')
      .slice(-1)[0];
    const acknowledgedBy = acknowledgedAction?.user
      ? { userId: acknowledgedAction.user.id, displayName: acknowledgedAction.user.displayName }
      : null;

    const recipientIds = [...new Set(outboxRows.map((row) => row.recipientUserId))];
    const recipients = await this.buildRecipients(incident.subjectId, recipientIds);

    const summary = this.toSummary(incident, device, acknowledgedBy);
    return incidentDetailSchema.parse({
      ...summary,
      events: eventRows.map((event) => ({
        eventRevision: event.eventRevision,
        eventType: event.eventType,
        measuredAt: event.measuredAt?.toISOString() ?? null,
        receivedAt: event.receivedAt.toISOString(),
        applied: event.applied,
        conflictReason: event.conflictReason,
      })),
      actions: actionRows.map((row) => ({
        id: row.action.id,
        action: row.action.action,
        outcome: row.action.outcome,
        reason: row.action.reason,
        actor: row.user ? { id: row.user.id, displayName: row.user.displayName } : null,
        stateBefore: row.action.stateBefore,
        stateAfter: row.action.stateAfter,
        createdAt: row.action.createdAt.toISOString(),
      })),
      recipients,
    });
  }

  private async buildRecipients(
    subjectId: string,
    userIds: string[],
  ): Promise<Array<{ userId: string; displayName: string; permissions: CarePermissions }>> {
    if (userIds.length === 0) return [];
    const subjectRows = await this.db
      .select({ ownerUserId: subjects.ownerUserId })
      .from(subjects)
      .where(eq(subjects.id, subjectId))
      .limit(1);
    const ownerUserId = subjectRows[0]?.ownerUserId;

    const linkRows = await this.db
      .select()
      .from(careLinks)
      .where(and(eq(careLinks.subjectId, subjectId), inArray(careLinks.caregiverUserId, userIds)))
      .orderBy(desc(careLinks.createdAt));
    const linkByUser = new Map<string, (typeof linkRows)[number]>();
    for (const link of linkRows) {
      if (!linkByUser.has(link.caregiverUserId)) linkByUser.set(link.caregiverUserId, link);
    }

    const userRows = await this.db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, userIds));
    const userById = new Map(userRows.map((row) => [row.id, row]));

    const result: Array<{ userId: string; displayName: string; permissions: CarePermissions }> = [];
    for (const userId of userIds) {
      const user = userById.get(userId);
      if (!user) continue;
      if (userId === ownerUserId) {
        result.push({ userId, displayName: user.displayName, permissions: OWNER_PERMISSIONS });
        continue;
      }
      const link = linkByUser.get(userId);
      if (!link) continue; // người từng nhận nhưng không còn link → không liệt kê quyền hiện tại
      result.push({ userId, displayName: user.displayName, permissions: link.permissions });
    }
    return result;
  }
}
