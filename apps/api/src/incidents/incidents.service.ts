import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
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
import { ENV, type AppEnv } from '../config/env';
import { resolveAssignmentForEventTime, type EventQuarantineReason } from './event-assignment';

/** Kiểu executor giao dịch: chấp nhận cả DB chính lẫn transaction. */
export type DbExecutor = Parameters<Parameters<AppDb['transaction']>[0]>[0];

export const CANCEL_REQUESTED_REASON = 'Thiết bị yêu cầu hủy sau khi đã xác nhận';
export const CANCEL_REQUESTED_OUTCOME = 'cancelled_by_user';

/**
 * Nhịp quét nền incident `suspected` quá hạn. Cố định (không cấu hình env) vì
 * đây chỉ là tần suất nội bộ, không phải chính sách nghiệp vụ; ngưỡng nghiệp vụ
 * là `SUSPECTED_TIMEOUT_MINUTES`.
 */
export const SUSPECTED_SWEEP_INTERVAL_MS = 60_000;

/** Kết quả một vòng quét suspected → unconfirmed (test + log vận hành). */
export type ExpireSuspectedResult = { scanned: number; transitioned: number };

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
      // Đã quá hạn chờ kết quả cuối: giữ bản ghi "chưa xác định" (không tự đổi
      // sang "đã hủy" khi thiết bị gửi hủy muộn).
      if (state === 'unconfirmed') return { state, applied: false, conflictReason: 'already_unconfirmed' };
      if (state === 'open' || state === 'acknowledged') {
        return { state, applied: false, conflictReason: 'already_confirmed' };
      }
      return { state, applied: false, conflictReason: 'terminal_state' };
    case 'fall.confirmed':
    case 'sos.confirmed':
      if (state === 'suspected') return { state: 'open', applied: true, conflictReason: null };
      // Kết quả cuối đến sau ngưỡng timeout vẫn phải mở cảnh báo: không được
      // âm thầm bỏ một ca ngã đã được thiết bị xác nhận (docs/03).
      if (state === 'unconfirmed') return { state: 'open', applied: true, conflictReason: null };
      if (state === 'open' || state === 'acknowledged') {
        return { state, applied: true, conflictReason: null };
      }
      return { state, applied: false, conflictReason: 'terminal_state' };
    case 'user.cancel_requested':
      if (state === 'suspected') return { state: 'cancelled', applied: true, conflictReason: null };
      if (state === 'unconfirmed') return { state, applied: false, conflictReason: 'already_unconfirmed' };
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

/**
 * Trạng thái không còn hoạt động với người xem lịch sử: resolved/cancelled/unconfirmed.
 * `unconfirmed` chưa từng được xác nhận nên cũng không phải trạng thái an toàn hiện tại.
 */
export function isHistoryClosedState(state: IncidentState): boolean {
  return state === 'resolved' || state === 'cancelled' || state === 'unconfirmed';
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
export class IncidentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IncidentsService.name);
  private timer: NodeJS.Timeout | null = null;
  private sweeping = false;

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: AppEnv,
  ) {}

  // ---------------------------------------------------------------------------
  // Vòng đời suspected → unconfirmed (candidate không có kết quả cuối)
  // ---------------------------------------------------------------------------

  /**
   * Bật quét nền khi chạy thật. Trong test luôn tắt (NODE_ENV=test); test gọi
   * `expireSuspectedAlerts()` thủ công để không phụ thuộc thời gian/interval.
   */
  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      void this.expireSuspectedAlerts().catch((error: unknown) => {
        this.logger.error(
          'Lỗi quét incident suspected quá hạn',
          error instanceof Error ? error.stack : String(error),
        );
      });
    }, SUSPECTED_SWEEP_INTERVAL_MS);
    // Không giữ tiến trình sống chỉ vì job nền (shutdown hooks vẫn clear).
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Quan sát/test: job nền có đang bật không (luôn false khi NODE_ENV=test). */
  isSweepScheduled(): boolean {
    return this.timer !== null;
  }

  /** Ngưỡng chờ kết quả cuối, đọc từ env (1..120 phút). */
  suspectedTimeoutMs(): number {
    return this.env.SUSPECTED_TIMEOUT_MINUTES * 60_000;
  }

  /**
   * Chuyển `suspected` quá hạn sang `unconfirmed` (docs/03 "Candidate không có
   * kết quả cuối", docs/06 "Chưa xác định").
   *
   * - Mốc so sánh là `lastEventAt` (giờ nhận phía server), không dùng
   *   `detectedAt` vì `measured_at` của thiết bị có thể trễ hoặc sai tương lai.
   * - Chỉ đụng incident còn `suspected`: confirmed/cancelled/resolved không đổi.
   * - Idempotent: khóa dòng + điều kiện `state='suspected'` ngay trong UPDATE;
   *   chạy lại (hoặc hai instance cùng chạy) không tạo thay đổi thứ hai.
   * - Không ghi `incident_events` (enum `incident_event_type` không có loại
   *   timeout; thêm sẽ phải migration), không phát SSE, không tạo outbox: đây là
   *   bản ghi "thiếu kết quả cuối", không phải cảnh báo mới cần xác nhận. Dấu
   *   vết nằm ở `audit_logs` (actorKind=system).
   */
  async expireSuspectedAlerts(now = new Date(), limit = 200): Promise<ExpireSuspectedResult> {
    if (this.sweeping) return { scanned: 0, transitioned: 0 };
    this.sweeping = true;
    try {
      const cutoff = new Date(now.getTime() - this.suspectedTimeoutMs());
      const rows = await this.db
        .select({ id: incidents.id })
        .from(incidents)
        .where(and(eq(incidents.state, 'suspected'), lte(incidents.lastEventAt, cutoff)))
        .orderBy(asc(incidents.lastEventAt))
        .limit(limit);

      let transitioned = 0;
      for (const row of rows) {
        const changed = await this.db.transaction(async (tx) => {
          const locked = (
            await tx.select().from(incidents).where(eq(incidents.id, row.id)).for('update').limit(1)
          )[0];
          // Đọc lại trong transaction: incident có thể vừa được confirmed/cancelled
          // hoặc vừa nhận sự kiện mới sau truy vấn chọn phía trên.
          if (!locked || locked.state !== 'suspected') return false;
          if (locked.lastEventAt.getTime() > cutoff.getTime()) return false;

          const updatedAt = new Date();
          const newVersion = locked.version + 1;
          await tx
            .update(incidents)
            .set({ state: 'unconfirmed', version: newVersion, updatedAt })
            .where(and(eq(incidents.id, locked.id), eq(incidents.state, 'suspected')));
          await this.audit.record(
            {
              actorKind: 'system',
              action: 'incident.suspected_timeout',
              targetType: 'incident',
              targetId: locked.id,
              outcome: 'success',
              metadata: {
                stateBefore: 'suspected',
                stateAfter: 'unconfirmed',
                versionBefore: locked.version,
                versionAfter: newVersion,
                timeoutMinutes: this.env.SUSPECTED_TIMEOUT_MINUTES,
                lastEventAt: locked.lastEventAt.toISOString(),
                cutoff: cutoff.toISOString(),
              },
            },
            tx,
          );
          return true;
        });
        if (changed) transitioned += 1;
      }
      return { scanned: rows.length, transitioned };
    } finally {
      this.sweeping = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Ingest sự kiện thiết bị
  // ---------------------------------------------------------------------------

  async ingestEvent(device: DeviceRow, envelope: IncidentEnvelope): Promise<IngestAck> {
    const receivedAt = new Date();
    const ackBase = { sourceMessageId: envelope.message_id, receivedAt: receivedAt.toISOString() };

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

      // 2) Xác định assignment theo thời điểm đo, không theo chủ đang mở hồ sơ.
      //    Thiết bị đã chuyển chủ vẫn có thể gửi sự kiện cũ thuộc assignment đã
      //    kết thúc; sự kiện không có mốc thời gian tin cậy bị cách ly thay vì
      //    mặc định gán cho chủ hiện tại (docs/03, docs/04, docs/08 T-03).
      const assignments = await tx
        .select()
        .from(deviceAssignments)
        .where(eq(deviceAssignments.deviceId, device.id))
        .orderBy(asc(deviceAssignments.startedAt), asc(deviceAssignments.id));
      if (assignments.length === 0) {
        await this.audit.record(
          {
            actorKind: 'device',
            action: 'incident.ingest',
            targetType: 'device',
            targetId: device.id,
            outcome: 'denied',
            metadata: {
              code: 'DEVICE_NOT_CLAIMED',
              messageId: envelope.message_id,
              incidentId: envelope.incident_id,
            },
          },
          tx,
        );
        return ingestAckSchema.parse({
          ...ackBase,
          status: 'rejected',
          incidentId: null,
          acceptedRevision: null,
          code: 'DEVICE_NOT_CLAIMED',
          message: 'Thiết bị chưa được gán vào hồ sơ nào.',
        });
      }

      const measuredAt = envelope.measured_at ? new Date(envelope.measured_at) : null;
      const resolution = resolveAssignmentForEventTime({
        assignments,
        measuredAt,
        receivedAt,
        clockSkewMs: this.env.MAX_CLOCK_SKEW_SECONDS * 1000,
      });
      if (resolution.kind === 'quarantined') {
        return this.quarantineEvent(tx, device, envelope, measuredAt, receivedAt, resolution.reason);
      }
      const assignment = resolution.assignment;

      // 3) Khóa/tạo incident theo namespace (device_id, device_incident_id).
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
        const detectedAt = measuredAt ?? receivedAt;
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

      // Incident đã lưu không đổi chủ. Nếu thời điểm đo chỉ ra hồ sơ khác,
      // không được ghi sự kiện mới vào incident cũ của chủ trước.
      if (incidentRow.subjectId !== assignment.subjectId) {
        return this.quarantineEvent(
          tx,
          device,
          envelope,
          measuredAt,
          receivedAt,
          'assignment_mismatch',
        );
      }

      const revision = envelope.event_revision;

      // 4) Revision cũ đến sau: không lùi trạng thái. Nếu revision này chưa có
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

      // 5) Cùng revision đã có sự kiện: so nội dung để trả duplicate hoặc từ chối.
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

      // 6) Áp dụng transition.
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

      // 7) Realtime: chỉ phát khi trạng thái không còn là suspected (không lộ
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

      // 8) Outbox trong cùng transaction.
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

  /**
   * Từ chối sự kiện không xác định được assignment an toàn. Chỉ ghi audit
   * `incident.quarantined` với id/thời gian/lý do; không tạo incident, outbox
   * hay SSE, và metadata không chứa evidence sức khỏe.
   */
  private async quarantineEvent(
    tx: DbExecutor,
    device: DeviceRow,
    envelope: IncidentEnvelope,
    measuredAt: Date | null,
    receivedAt: Date,
    reason: EventQuarantineReason,
  ): Promise<IngestAck> {
    await this.audit.record(
      {
        actorKind: 'device',
        action: 'incident.quarantined',
        targetType: 'device',
        targetId: device.id,
        outcome: 'failed',
        metadata: {
          messageId: envelope.message_id,
          bootId: envelope.boot_id,
          sequence: envelope.sequence,
          incidentId: envelope.incident_id,
          reason,
          measuredAt: measuredAt?.toISOString() ?? null,
          clockSkewSeconds:
            measuredAt === null
              ? null
              : Math.round((measuredAt.getTime() - receivedAt.getTime()) / 1000),
        },
      },
      tx,
    );
    this.logger.warn(
      `Sự kiện cách ly: device=${device.id} message=${envelope.message_id} reason=${reason}`,
    );
    return ingestAckSchema.parse({
      sourceMessageId: envelope.message_id,
      receivedAt: receivedAt.toISOString(),
      status: 'rejected',
      incidentId: null,
      acceptedRevision: null,
      code: 'QUARANTINED',
      message: 'Sự kiện không xác định được hồ sơ theo thời điểm đo nên đã được cách ly để kiểm tra.',
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
    // `requireHistory` cũng là `requireSubject`: không có quyền xem hồ sơ → 404.
    // Mốc hiệu lực = max(now - historyDays, sharedFrom); owner có cửa sổ rộng theo OWNER_PERMISSIONS.
    const { access, effectiveFrom } = await this.access.requireHistory(userId, subjectId, undefined);
    const isCaregiver = access.role !== 'owner';
    if (isCaregiver) {
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

    // Lịch sử đã đóng chỉ được đọc trong cửa sổ chia sẻ. Cảnh báo đang mở được giữ
    // vì là trạng thái an toàn hiện tại, nhưng đánh dấu `startedBeforeShare` để UI nói rõ.
    const historyFilter =
      isCaregiver && query.state === 'closed' ? gte(incidents.detectedAt, effectiveFrom) : undefined;

    const rows = await this.db
      .select()
      .from(incidents)
      .where(
        and(
          eq(incidents.subjectId, subjectId),
          inArray(incidents.state, states),
          historyFilter,
          cursorFilter ?? undefined,
        ),
      )
      .orderBy(desc(incidents.detectedAt), desc(incidents.id))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const items = await this.buildSummaries(page, isCaregiver ? effectiveFrom : null);
    const lastRow = page[page.length - 1];
    const nextCursor = hasMore && lastRow
      ? encodeCursor({ detectedAt: lastRow.detectedAt.toISOString(), id: lastRow.id })
      : null;
    return incidentListSchema.parse({ items, nextCursor });
  }

  async getAlert(userId: string, alertId: string): Promise<IncidentDetail> {
    const { incident, startedBeforeShare } = await this.loadVisibleIncident(userId, alertId);
    return this.buildDetail(incident, startedBeforeShare);
  }

  /**
   * 404 khi không tồn tại hoặc đang suspected; `unconfirmed` vẫn xem được (lịch sử kỹ thuật).
   * Với caregiver, cảnh báo đã đóng phát hiện trước mốc chia sẻ bị 403 (không lộ lý do kết thúc);
   * cảnh báo đang hoạt động trước mốc vẫn trả 200 kèm cờ `startedBeforeShare` vì là trạng thái
   * an toàn hiện tại.
   */
  private async loadVisibleIncident(
    userId: string,
    alertId: string,
    action?: 'acknowledge' | 'resolve',
  ): Promise<{ incident: IncidentRow; startedBeforeShare: boolean }> {
    const rows = await this.db.select().from(incidents).where(eq(incidents.id, alertId)).limit(1);
    const incidentRow = rows[0];
    if (!incidentRow || incidentRow.state === 'suspected') {
      throw AppError.notFound('Không tìm thấy cảnh báo.');
    }
    // `requireHistory(..., undefined)` trả mốc hiệu lực nhưng không từ chối chỉ vì mốc share mới.
    const { access, effectiveFrom } = await this.access.requireHistory(
      userId,
      incidentRow.subjectId,
      undefined,
    );
    if (action) {
      // Thao tác cần quyền rõ ràng: thiếu quyền trả 403 để UI phân biệt chính sách.
      this.access.assertAction(access, action);
    } else {
      // Nhất quán với list: có link nhưng thiếu quyền nhận cảnh báo → 403;
      // không có link thì requireSubject ở trên đã trả 404 (không lộ tồn tại).
      this.access.assertAction(access, 'receive_alerts');
    }
    const startedBeforeShare =
      access.role !== 'owner' && incidentRow.detectedAt.getTime() < effectiveFrom.getTime();
    if (startedBeforeShare && isHistoryClosedState(incidentRow.state)) {
      throw AppError.forbidden(
        'Cảnh báo này xảy ra trước thời điểm bạn được chia sẻ quyền xem lịch sử.',
        { effectiveFrom: effectiveFrom.toISOString() },
      );
    }
    return { incident: incidentRow, startedBeforeShare };
  }

  async acknowledgeAlert(
    userId: string,
    alertId: string,
    input: AcknowledgeAlert,
  ): Promise<IncidentDetail> {
    await this.loadVisibleIncident(userId, alertId, 'acknowledge');

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
    await this.loadVisibleIncident(userId, alertId, 'resolve');

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

  private async buildSummaries(rows: IncidentRow[], effectiveFrom: Date | null = null) {
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

    return rows.map((incident) => {
      // Caregiver: cảnh báo đang mở phát hiện trước mốc chia sẻ vẫn được trả (an toàn
      // hiện tại) nhưng phải đánh dấu để UI không trình bày như lịch sử được chia sẻ.
      const startedBeforeShare =
        effectiveFrom !== null && incident.detectedAt.getTime() < effectiveFrom.getTime();
      return this.toSummary(
        incident,
        deviceById.get(incident.id),
        acknowledgedBy.get(incident.id) ?? null,
        startedBeforeShare,
      );
    });
  }

  private toSummary(
    incident: IncidentRow,
    device: { id: string; label: string; serial: string } | undefined,
    acknowledgedBy: { userId: string; displayName: string } | null,
    startedBeforeShare = false,
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
      ...(startedBeforeShare ? { startedBeforeShare: true } : {}),
    };
  }

  private async buildDetail(
    incident: IncidentRow,
    startedBeforeShare = false,
  ): Promise<IncidentDetail> {
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

    const summary = this.toSummary(incident, device, acknowledgedBy, startedBeforeShare);
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
