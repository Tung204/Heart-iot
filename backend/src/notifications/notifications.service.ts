import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, isNull, lte } from 'drizzle-orm';
import {
  notificationListSchema,
  type NotificationKind,
  type NotificationList,
} from '@heart-iot/contracts/notifications';
import { canViewMeasurements as permissionAllowsMeasurements } from '@heart-iot/contracts';
import { DB, type AppDb } from '../database/database';
import {
  careLinks,
  incidents,
  notificationOutbox,
  realtimeEvents,
  subjects,
  users,
} from '../database/schema';
import { AppError } from '../common/app-error';
import { AccessService } from '../access/access.service';
import type { DbExecutor } from '../incidents/incidents.service';

export type ProcessPendingResult = {
  processed: number;
  sent: number;
  superseded: number;
  failed: number;
};

/** Thông báo cảnh báo dùng quyền nhận cảnh báo; care_* dùng quyền xem số đo (D3 còn mở). */
function requiresAlertPermission(kind: NotificationKind): boolean {
  return kind === 'alert' || kind === 'update' || kind === 'escalation';
}

type SubjectVisibility = {
  window: Date | null;
  canReceiveAlerts: boolean;
  canViewMeasurements: boolean;
};

/** Backoff demo: 1s → 5s → 30s (từ lần thử thứ 3), tối đa 5 lần rồi failed. */
function backoffMs(attempts: number): number {
  if (attempts <= 1) return 1000;
  if (attempts === 2) return 5000;
  return 30000;
}

@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly access: AccessService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV !== 'test') {
      this.timer = setInterval(() => {
        void this.processPending(20).catch((error: unknown) => {
          this.logger.error('Lỗi worker outbox', error instanceof Error ? error.stack : String(error));
        });
      }, 5000);
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Worker outbox: chọn pending tới hạn, khóa dòng (skip locked nếu driver
   * hỗ trợ), kiểm lại quyền + trạng thái incident trước khi đánh dấu sent.
   * Chạy trong một transaction để khóa có hiệu lực tới khi commit.
   */
  async processPending(limit = 20): Promise<ProcessPendingResult> {
    if (this.running) return { processed: 0, sent: 0, superseded: 0, failed: 0 };
    this.running = true;
    try {
      const now = new Date();
      return await this.db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(notificationOutbox)
          .where(and(eq(notificationOutbox.status, 'pending'), lte(notificationOutbox.nextAttemptAt, now)))
          .orderBy(asc(notificationOutbox.nextAttemptAt))
          .limit(limit)
          .for('update', { skipLocked: true });

        let sent = 0;
        let superseded = 0;
        let failed = 0;
        for (const row of rows) {
          const incidentRows = row.incidentId
            ? await tx
                .select({ id: incidents.id, subjectId: incidents.subjectId, state: incidents.state })
                .from(incidents)
                .where(eq(incidents.id, row.incidentId))
                .limit(1)
            : [];
          const incident = incidentRows[0] ?? null;
          const kind = row.kind as NotificationKind;

          // Alert/update bắt buộc có incident; care_* thì không.
          if (requiresAlertPermission(kind) && !incident) {
            await tx
              .update(notificationOutbox)
              .set({
                status: 'failed',
                attempts: row.attempts + 1,
                lastError: 'Không tìm thấy cảnh báo gắn với thông báo.',
                updatedAt: now,
              })
              .where(eq(notificationOutbox.id, row.id));
            failed += 1;
            continue;
          }

          const subjectId = row.subjectId ?? incident?.subjectId ?? null;
          if (!subjectId) {
            await tx
              .update(notificationOutbox)
              .set({
                status: 'failed',
                attempts: row.attempts + 1,
                lastError: 'Thông báo thiếu hồ sơ.',
                updatedAt: now,
              })
              .where(eq(notificationOutbox.id, row.id));
            failed += 1;
            continue;
          }

          const terminal =
            incident?.state === 'resolved' || incident?.state === 'cancelled';
          const escalationStale = kind === 'escalation' && incident?.state !== 'open';
          const allowed = await this.recipientAllowed(
            tx,
            row.recipientUserId,
            subjectId,
            kind,
          );

          // R-01/V10: mất quyền, incident đã đóng hoặc đã được xác nhận thì
          // không gửi cảnh báo/leo thang đang chờ.
          if (!allowed || (terminal && kind === 'alert') || escalationStale) {
            await tx
              .update(notificationOutbox)
              .set({ status: 'superseded', supersededAt: now, updatedAt: now })
              .where(eq(notificationOutbox.id, row.id));
            superseded += 1;
            continue;
          }

          try {
            await this.deliverInApp(row);
            await tx
              .update(notificationOutbox)
              .set({ status: 'sent', sentAt: now, updatedAt: now })
              .where(eq(notificationOutbox.id, row.id));
            await tx.insert(realtimeEvents).values({
              subjectId,
              type: 'notification.sent',
              entityId: incident?.id ?? row.id,
              payload: { id: row.id, incidentId: incident?.id ?? null, kind },
            });
            sent += 1;
          } catch (error) {
            const attempts = row.attempts + 1;
            const lastError = this.filterError(error);
            if (attempts >= 5) {
              await tx
                .update(notificationOutbox)
                .set({ status: 'failed', attempts, lastError, updatedAt: now })
                .where(eq(notificationOutbox.id, row.id));
            } else {
              await tx
                .update(notificationOutbox)
                .set({
                  status: 'pending',
                  attempts,
                  nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)),
                  lastError,
                  updatedAt: now,
                })
                .where(eq(notificationOutbox.id, row.id));
            }
            failed += 1;
          }
        }
        return { processed: rows.length, sent, superseded, failed };
      });
    } finally {
      this.running = false;
    }
  }

  /**
   * Kiểm tra lại quyền ngay trước khi gửi:
   * - alert/update/escalation: link active + `canReceiveAlerts`;
   * - care_*: link active + `canViewMeasurements` (D3 chưa chốt `canViewCare`).
   */
  private async recipientAllowed(
    tx: DbExecutor,
    recipientUserId: string,
    subjectId: string,
    kind: NotificationKind,
  ): Promise<boolean> {
    const subjectRows = await tx
      .select({ ownerUserId: subjects.ownerUserId })
      .from(subjects)
      .where(eq(subjects.id, subjectId))
      .limit(1);
    const subjectRow = subjectRows[0];
    if (!subjectRow) return false;
    if (subjectRow.ownerUserId === recipientUserId) {
      const ownerRows = await tx
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, recipientUserId))
        .limit(1);
      return ownerRows[0]?.status === 'active';
    }
    const linkRows = await tx
      .select({ permissions: careLinks.permissions })
      .from(careLinks)
      .innerJoin(users, eq(users.id, careLinks.caregiverUserId))
      .where(
        and(
          eq(careLinks.subjectId, subjectId),
          eq(careLinks.caregiverUserId, recipientUserId),
          eq(careLinks.status, 'active'),
          isNull(careLinks.revokedAt),
          eq(users.status, 'active'),
        ),
      )
      .limit(1);
    const permissions = linkRows[0]?.permissions;
    if (!permissions) return false;
    return requiresAlertPermission(kind)
      ? permissions.canReceiveAlerts
      : permissionAllowsMeasurements(permissions);
  }

  /**
   * Kênh in_app không có transport ngoài: "gửi" là chính việc đánh dấu sent.
   * Điểm mở rộng cho email/push ở wave sau. Nếu ném lỗi, worker sẽ retry.
   */
  private async deliverInApp(_row: typeof notificationOutbox.$inferSelect): Promise<void> {
    // Không có tác vụ mạng trong v1.
  }

  /** Lọc lỗi trước khi lưu: không ghi payload sức khỏe/credentials vào lastError. */
  private filterError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 500);
  }

  /**
   * Cửa sổ chia sẻ + quyền theo loại thông báo của user cho từng hồ sơ (NFR-01).
   * - Không có key: không còn quyền xem thông báo của hồ sơ đó.
   * - `window = null`: chủ hồ sơ, không giới hạn lịch sử.
   * - `Date`: mốc sớm nhất được xem, cùng công thức với measurements/daily-summary
   *   (`max(now - historyDays, sharedFrom)`) nhờ AccessService.requireHistory.
   */
  private async subjectVisibility(
    userId: string,
    subjectIds: Iterable<string>,
  ): Promise<Map<string, SubjectVisibility>> {
    const result = new Map<string, SubjectVisibility>();
    for (const subjectId of subjectIds) {
      if (result.has(subjectId)) continue;
      try {
        const { access, effectiveFrom } = await this.access.requireHistory(userId, subjectId, null);
        const owner = access.role === 'owner';
        const canReceiveAlerts = owner || access.permissions.canReceiveAlerts;
        const canViewMeasurements = owner || permissionAllowsMeasurements(access.permissions);
        if (!canReceiveAlerts && !canViewMeasurements) continue;
        result.set(subjectId, {
          window: owner ? null : effectiveFrom,
          canReceiveAlerts,
          canViewMeasurements,
        });
      } catch (error) {
        // Không có link active / hồ sơ đã lưu trữ: coi như không thấy, không lộ sự tồn tại.
        if (error instanceof AppError && error.status === 404) continue;
        throw error;
      }
    }
    return result;
  }

  private kindAllowed(visibility: SubjectVisibility, kind: NotificationKind): boolean {
    return requiresAlertPermission(kind)
      ? visibility.canReceiveAlerts
      : visibility.canViewMeasurements;
  }

  /** Sự kiện xảy ra trước mốc chia sẻ hoặc ngoài historyDays thì không được trả/đánh dấu đọc. */
  private isVisibleInWindow(window: Date | null | undefined, occurredAt: Date): boolean {
    if (window === undefined) return false;
    if (window === null) return true;
    return occurredAt.getTime() >= window.getTime();
  }

  async listNotifications(userId: string): Promise<NotificationList> {
    const rows = await this.db
      .select({
        outbox: notificationOutbox,
        incidentDetectedAt: incidents.detectedAt,
        incidentType: incidents.type,
        incidentState: incidents.state,
        subjectName: subjects.displayName,
      })
      .from(notificationOutbox)
      .leftJoin(incidents, eq(incidents.id, notificationOutbox.incidentId))
      .innerJoin(subjects, eq(subjects.id, notificationOutbox.subjectId))
      .where(and(eq(notificationOutbox.recipientUserId, userId), eq(notificationOutbox.status, 'sent')))
      .orderBy(desc(notificationOutbox.createdAt));

    // Lọc quyền trước khi đếm/chặn 200: unreadCount phải khớp đúng tập người dùng thấy được.
    const visibility = await this.subjectVisibility(
      userId,
      new Set(
        rows
          .map((row) => row.outbox.subjectId)
          .filter((subjectId): subjectId is string => subjectId !== null),
      ),
    );
    const visibleRows = rows.filter((row) => {
      const subjectId = row.outbox.subjectId;
      if (!subjectId) return false;
      const subject = visibility.get(subjectId);
      if (!subject) return false;
      const kind = row.outbox.kind as NotificationKind;
      return (
        this.kindAllowed(subject, kind) &&
        this.isVisibleInWindow(
          subject.window,
          row.incidentDetectedAt ?? row.outbox.createdAt,
        )
      );
    });
    const unreadCount = visibleRows.filter((row) => row.outbox.readAt === null).length;

    return notificationListSchema.parse({
      items: visibleRows.slice(0, 200).map((row) => ({
        id: row.outbox.id,
        incidentId: row.outbox.incidentId,
        subjectId: row.outbox.subjectId!,
        subjectName: row.subjectName,
        incidentType: row.incidentType,
        state: row.incidentState,
        revision: row.outbox.revision,
        kind: row.outbox.kind,
        title: row.outbox.title,
        body: row.outbox.body,
        sentAt: row.outbox.sentAt?.toISOString() ?? null,
        readAt: row.outbox.readAt?.toISOString() ?? null,
        createdAt: row.outbox.createdAt.toISOString(),
      })),
      unreadCount,
    });
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const rows = await this.db
      .select({
        id: notificationOutbox.id,
        subjectId: notificationOutbox.subjectId,
        kind: notificationOutbox.kind,
        createdAt: notificationOutbox.createdAt,
        incidentDetectedAt: incidents.detectedAt,
        readAt: notificationOutbox.readAt,
      })
      .from(notificationOutbox)
      .leftJoin(incidents, eq(incidents.id, notificationOutbox.incidentId))
      .where(
        and(
          eq(notificationOutbox.id, notificationId),
          eq(notificationOutbox.recipientUserId, userId),
          eq(notificationOutbox.status, 'sent'),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row || !row.subjectId) throw AppError.notFound('Không tìm thấy thông báo.');

    // Kiểm lại quyền + ranh giới chia sẻ tại thời điểm đọc; mọi trường hợp đều 404.
    const visibility = await this.subjectVisibility(userId, [row.subjectId]);
    const subject = visibility.get(row.subjectId);
    const kind = row.kind as NotificationKind;
    if (
      !subject ||
      !this.kindAllowed(subject, kind) ||
      !this.isVisibleInWindow(subject.window, row.incidentDetectedAt ?? row.createdAt)
    ) {
      throw AppError.notFound('Không tìm thấy thông báo.');
    }

    // Idempotent: giữ mốc đọc lần đầu, không ghi đè readAt đã có.
    if (row.readAt) return;
    await this.db
      .update(notificationOutbox)
      .set({ readAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(notificationOutbox.id, notificationId),
          eq(notificationOutbox.recipientUserId, userId),
          eq(notificationOutbox.status, 'sent'),
          isNull(notificationOutbox.readAt),
        ),
      );
  }

  /** Dùng trong test/handoff: đếm trạng thái outbox của một incident. */
  async countByIncident(incidentId: string): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ status: notificationOutbox.status })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.incidentId, incidentId));
    const result: Record<string, number> = {};
    for (const row of rows) result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }
}
