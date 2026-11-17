import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, isNull, lte } from 'drizzle-orm';
import { notificationListSchema, type NotificationList } from '@heart-iot/contracts/notifications';
import { DB, type AppDb } from '../database/database';
import {
  careLinks,
  incidents,
  notificationOutbox,
  realtimeEvents,
  subjects,
} from '../database/schema';
import { AppError } from '../common/app-error';
import { AccessService } from '../access/access.service';
import type { DbExecutor } from '../incidents/incidents.service';
import { outboxKind } from '../incidents/incidents.service';

export type ProcessPendingResult = {
  processed: number;
  sent: number;
  superseded: number;
  failed: number;
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
          const incidentRows = await tx
            .select({ id: incidents.id, subjectId: incidents.subjectId, state: incidents.state })
            .from(incidents)
            .where(eq(incidents.id, row.incidentId))
            .limit(1);
          const incident = incidentRows[0];
          if (!incident) continue; // không thể xảy ra (FK cascade), phòng thủ

          const kind = outboxKind(row.dedupeKey);
          const terminal = incident.state === 'resolved' || incident.state === 'cancelled';
          const allowed = await this.recipientAllowed(tx, row.recipientUserId, incident.subjectId);

          // R-01: mất quyền hoặc incident đã đóng mà cảnh báo mở chưa gửi → superseded.
          if (!allowed || (terminal && kind === 'alert')) {
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
              subjectId: incident.subjectId,
              type: 'notification.sent',
              entityId: incident.id,
              payload: { id: row.id, incidentId: incident.id },
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

  /** Kiểm tra lại quyền ngay trước khi gửi (chủ hồ sơ hoặc link active + canReceiveAlerts). */
  private async recipientAllowed(
    tx: DbExecutor,
    recipientUserId: string,
    subjectId: string,
  ): Promise<boolean> {
    const subjectRows = await tx
      .select({ ownerUserId: subjects.ownerUserId })
      .from(subjects)
      .where(eq(subjects.id, subjectId))
      .limit(1);
    const subjectRow = subjectRows[0];
    if (!subjectRow) return false;
    if (subjectRow.ownerUserId === recipientUserId) return true;
    const linkRows = await tx
      .select({ permissions: careLinks.permissions })
      .from(careLinks)
      .where(
        and(
          eq(careLinks.subjectId, subjectId),
          eq(careLinks.caregiverUserId, recipientUserId),
          eq(careLinks.status, 'active'),
          isNull(careLinks.revokedAt),
        ),
      )
      .limit(1);
    return linkRows[0]?.permissions.canReceiveAlerts ?? false;
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
   * Cửa sổ chia sẻ **hiện tại** của user cho từng hồ sơ (NFR-01).
   * - Không có key: không còn quyền xem thông báo của hồ sơ đó.
   * - `null`: chủ hồ sơ, không giới hạn lịch sử.
   * - `Date`: mốc sớm nhất được xem, cùng công thức với measurements/daily-summary
   *   (`max(now - historyDays, sharedFrom)`) nhờ AccessService.requireHistory.
   */
  private async visibleWindows(
    userId: string,
    subjectIds: Iterable<string>,
  ): Promise<Map<string, Date | null>> {
    const windows = new Map<string, Date | null>();
    for (const subjectId of subjectIds) {
      if (windows.has(subjectId)) continue;
      try {
        const { access, effectiveFrom } = await this.access.requireHistory(userId, subjectId, null);
        // Thông báo là kênh cảnh báo: người thân phải còn quyền nhận cảnh báo.
        if (access.role !== 'owner' && !access.permissions.canReceiveAlerts) continue;
        windows.set(subjectId, access.role === 'owner' ? null : effectiveFrom);
      } catch (error) {
        // Không có link active / hồ sơ đã lưu trữ: coi như không thấy, không lộ sự tồn tại.
        if (error instanceof AppError && error.status === 404) continue;
        throw error;
      }
    }
    return windows;
  }

  /** Incident xảy ra trước mốc chia sẻ hoặc ngoài historyDays thì không được trả/đánh dấu đọc. */
  private isVisibleInWindow(window: Date | null | undefined, detectedAt: Date): boolean {
    if (window === undefined) return false;
    if (window === null) return true;
    return detectedAt.getTime() >= window.getTime();
  }

  async listNotifications(userId: string): Promise<NotificationList> {
    const rows = await this.db
      .select({
        outbox: notificationOutbox,
        incidentId: incidents.id,
        subjectId: incidents.subjectId,
        detectedAt: incidents.detectedAt,
        incidentType: incidents.type,
        state: incidents.state,
        subjectName: subjects.displayName,
      })
      .from(notificationOutbox)
      .innerJoin(incidents, eq(incidents.id, notificationOutbox.incidentId))
      .innerJoin(subjects, eq(subjects.id, incidents.subjectId))
      .where(and(eq(notificationOutbox.recipientUserId, userId), eq(notificationOutbox.status, 'sent')))
      .orderBy(desc(notificationOutbox.createdAt));

    // Lọc quyền trước khi đếm/chặn 200: unreadCount phải khớp đúng tập người dùng thấy được.
    const windows = await this.visibleWindows(
      userId,
      new Set(rows.map((row) => row.subjectId)),
    );
    const visibleRows = rows.filter((row) =>
      this.isVisibleInWindow(windows.get(row.subjectId), row.detectedAt),
    );
    const unreadCount = visibleRows.filter((row) => row.outbox.readAt === null).length;

    return notificationListSchema.parse({
      items: visibleRows.slice(0, 200).map((row) => ({
        id: row.outbox.id,
        incidentId: row.incidentId,
        subjectId: row.subjectId,
        subjectName: row.subjectName,
        incidentType: row.incidentType,
        state: row.state,
        revision: row.outbox.revision,
        kind: outboxKind(row.outbox.dedupeKey),
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
        subjectId: incidents.subjectId,
        detectedAt: incidents.detectedAt,
        readAt: notificationOutbox.readAt,
      })
      .from(notificationOutbox)
      .innerJoin(incidents, eq(incidents.id, notificationOutbox.incidentId))
      .where(
        and(
          eq(notificationOutbox.id, notificationId),
          eq(notificationOutbox.recipientUserId, userId),
          eq(notificationOutbox.status, 'sent'),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw AppError.notFound('Không tìm thấy thông báo.');

    // Kiểm lại quyền + ranh giới chia sẻ tại thời điểm đọc; mọi trường hợp đều 404.
    const windows = await this.visibleWindows(userId, [row.subjectId]);
    if (!this.isVisibleInWindow(windows.get(row.subjectId), row.detectedAt)) {
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
