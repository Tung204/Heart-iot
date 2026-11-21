import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { and, eq, inArray, lt } from 'drizzle-orm';
import { DB, type AppDb } from '../database/database';
import {
  aiSummaries,
  jobRuns,
  notificationOutbox,
  realtimeEvents,
  telemetry,
} from '../database/schema';
import { ENV, type AppEnv } from '../config/env';
import { AuditService } from '../access/audit.service';

const JOB_KEY = 'retention';
const TICK_MS = 3_600_000;
const BATCH_SIZE = 500;

type DbTx = Parameters<Parameters<AppDb['transaction']>[0]>[0];

export type RetentionCounts = {
  telemetry: number;
  notifications: number;
  realtime: number;
  aiSummaries: number;
};

export type RetentionRunResult = {
  runKey: string;
  skipped: boolean;
  disabled: boolean;
  deleted: RetentionCounts;
};

const EMPTY_COUNTS: RetentionCounts = {
  telemetry: 0,
  notifications: 0,
  realtime: 0,
  aiSummaries: 0,
};

/**
 * Retention dữ liệu theo tuổi — **mặc định tắt**, không có ngày mặc định.
 *
 * Chỉ xóa các lớp đã cấu hình qua `RETENTION_*_DAYS`:
 * - `telemetry`: mẫu đo cũ theo `received_at`;
 * - `notification_outbox`: bản ghi đã kết thúc (`sent`/`failed`/`superseded`);
 * - `realtime_events`: sự kiện SSE cũ;
 * - `ai_summaries`: tóm tắt AI cũ.
 *
 * Không xóa hồ sơ, incident, audit, cấu hình, care link hay backup. Đây không
 * thay quy trình `deletion-requests`/xóa cứng toàn bộ dữ liệu (D5 chưa chốt).
 * Job chạy một lần/ngày theo UTC, giả định một tiến trình; `job_runs` chỉ chống
 * chạy lặp trong cùng ngày, chưa có advisory lock.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: AppDb,
    @Inject(ENV) private readonly env: AppEnv,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test' || !this.env.RETENTION_ENABLED) return;
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        this.logger.error(
          'Lỗi job retention',
          error instanceof Error ? error.stack : String(error),
        );
      });
    }, TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Quan sát/test: job nền có bật không (luôn false khi NODE_ENV=test). */
  isScheduled(): boolean {
    return this.timer !== null;
  }

  async runOnce(now: Date = new Date()): Promise<RetentionRunResult> {
    const runKey = `${JOB_KEY}:${now.toISOString().slice(0, 10)}`;
    if (!this.env.RETENTION_ENABLED || !this.hasConfiguredDays()) {
      return { runKey, skipped: true, disabled: true, deleted: { ...EMPTY_COUNTS } };
    }

    const inserted = await this.db
      .insert(jobRuns)
      .values({ jobKey: JOB_KEY, runKey, startedAt: now, outcome: 'running', counters: {} })
      .onConflictDoNothing()
      .returning({ id: jobRuns.id });
    if (inserted.length === 0) {
      return { runKey, skipped: true, disabled: false, deleted: { ...EMPTY_COUNTS } };
    }

    const result: RetentionRunResult = {
      runKey,
      skipped: false,
      disabled: false,
      deleted: { ...EMPTY_COUNTS },
    };

    try {
      const deleted = await this.db.transaction(async (tx) => {
        const counts: RetentionCounts = { ...EMPTY_COUNTS };
        const cutoffs: Record<string, string> = {};

        if (this.env.RETENTION_TELEMETRY_DAYS !== undefined) {
          const cutoff = daysAgo(now, this.env.RETENTION_TELEMETRY_DAYS);
          cutoffs.telemetry = cutoff.toISOString();
          counts.telemetry = await purgeTelemetry(tx, cutoff);
        }
        if (this.env.RETENTION_NOTIFICATION_DAYS !== undefined) {
          const cutoff = daysAgo(now, this.env.RETENTION_NOTIFICATION_DAYS);
          cutoffs.notifications = cutoff.toISOString();
          counts.notifications = await purgeNotifications(tx, cutoff);
        }
        if (this.env.RETENTION_REALTIME_DAYS !== undefined) {
          const cutoff = daysAgo(now, this.env.RETENTION_REALTIME_DAYS);
          cutoffs.realtime = cutoff.toISOString();
          counts.realtime = await purgeRealtime(tx, cutoff);
        }
        if (this.env.RETENTION_AI_SUMMARY_DAYS !== undefined) {
          const cutoff = daysAgo(now, this.env.RETENTION_AI_SUMMARY_DAYS);
          cutoffs.aiSummaries = cutoff.toISOString();
          counts.aiSummaries = await purgeAiSummaries(tx, cutoff);
        }

        await this.audit.record(
          {
            actorKind: 'system',
            action: 'retention.purge',
            targetType: 'system',
            targetId: runKey,
            outcome: 'success',
            metadata: { runKey, cutoffs, deleted: counts },
          },
          tx,
        );
        return counts;
      });

      result.deleted = deleted;
      await this.db
        .update(jobRuns)
        .set({
          finishedAt: new Date(),
          outcome: 'succeeded',
          counters: {
            telemetry: deleted.telemetry,
            notifications: deleted.notifications,
            realtime: deleted.realtime,
            aiSummaries: deleted.aiSummaries,
          },
        })
        .where(and(eq(jobRuns.jobKey, JOB_KEY), eq(jobRuns.runKey, runKey)));
      return result;
    } catch (error) {
      await this.db
        .update(jobRuns)
        .set({ finishedAt: new Date(), outcome: 'failed', counters: {} })
        .where(and(eq(jobRuns.jobKey, JOB_KEY), eq(jobRuns.runKey, runKey)));
      throw error;
    }
  }

  private hasConfiguredDays(): boolean {
    return [
      this.env.RETENTION_TELEMETRY_DAYS,
      this.env.RETENTION_NOTIFICATION_DAYS,
      this.env.RETENTION_REALTIME_DAYS,
      this.env.RETENTION_AI_SUMMARY_DAYS,
    ].some((days) => days !== undefined);
  }
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

async function purgeTelemetry(tx: DbTx, cutoff: Date): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await tx
      .select({ id: telemetry.id })
      .from(telemetry)
      .where(lt(telemetry.receivedAt, cutoff))
      .limit(BATCH_SIZE);
    if (rows.length === 0) return total;
    const deleted = await tx
      .delete(telemetry)
      .where(inArray(telemetry.id, rows.map((row) => row.id)))
      .returning({ id: telemetry.id });
    total += deleted.length;
    if (deleted.length < BATCH_SIZE) return total;
  }
}

async function purgeNotifications(tx: DbTx, cutoff: Date): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await tx
      .select({ id: notificationOutbox.id })
      .from(notificationOutbox)
      .where(
        and(
          inArray(notificationOutbox.status, ['sent', 'failed', 'superseded']),
          lt(notificationOutbox.createdAt, cutoff),
        ),
      )
      .limit(BATCH_SIZE);
    if (rows.length === 0) return total;
    const deleted = await tx
      .delete(notificationOutbox)
      .where(inArray(notificationOutbox.id, rows.map((row) => row.id)))
      .returning({ id: notificationOutbox.id });
    total += deleted.length;
    if (deleted.length < BATCH_SIZE) return total;
  }
}

async function purgeRealtime(tx: DbTx, cutoff: Date): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await tx
      .select({ id: realtimeEvents.id })
      .from(realtimeEvents)
      .where(lt(realtimeEvents.createdAt, cutoff))
      .limit(BATCH_SIZE);
    if (rows.length === 0) return total;
    const deleted = await tx
      .delete(realtimeEvents)
      .where(inArray(realtimeEvents.id, rows.map((row) => row.id)))
      .returning({ id: realtimeEvents.id });
    total += deleted.length;
    if (deleted.length < BATCH_SIZE) return total;
  }
}

async function purgeAiSummaries(tx: DbTx, cutoff: Date): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await tx
      .select({ id: aiSummaries.id })
      .from(aiSummaries)
      .where(lt(aiSummaries.createdAt, cutoff))
      .limit(BATCH_SIZE);
    if (rows.length === 0) return total;
    const deleted = await tx
      .delete(aiSummaries)
      .where(inArray(aiSummaries.id, rows.map((row) => row.id)))
      .returning({ id: aiSummaries.id });
    total += deleted.length;
    if (deleted.length < BATCH_SIZE) return total;
  }
}
