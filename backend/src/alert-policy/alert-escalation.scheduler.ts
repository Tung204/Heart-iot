import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';
import {
  alertEscalationConfigSchema,
  type AlertEscalationConfig,
} from '@heart-iot/contracts/alert-policy';
import { DB, type AppDb } from '../database/database';
import {
  auditLogs,
  incidents,
  jobRuns,
  notificationOutbox,
  subjects,
  subjectRules,
} from '../database/schema';
import { AuditService } from '../access/audit.service';
import { listAlertRecipients } from '../incidents/alert-recipients';
import { listPushRecipientIds } from '../notifications/push-recipients';
import { ENV, type AppEnv } from '../config/env';

const JOB_KEY = 'alert_escalation';
const TICK_MS = 60_000;

export type AlertEscalationResult = {
  runKey: string;
  skipped: boolean;
  policies: number;
  incidents: number;
  notifications: number;
  skippedIncidents: number;
  failed: number;
};

/** Bậc cao nhất đã tới hạn; 0 nghĩa là chưa tới mốc nào. */
export function escalationLevelAt(
  detectedAt: Date,
  now: Date,
  steps: ReadonlyArray<{ afterMinutes: number }>,
): number {
  const elapsedMinutes = Math.floor((now.getTime() - detectedAt.getTime()) / 60_000);
  let level = 0;
  for (let index = 0; index < steps.length; index += 1) {
    if (elapsedMinutes >= steps[index]!.afterMinutes) level = index + 1;
  }
  return level;
}

type PolicyWithSubject = {
  rule: typeof subjectRules.$inferSelect;
  subject: typeof subjects.$inferSelect;
};

/**
 * V10a — leo thang cảnh báo trong ứng dụng.
 *
 * Chỉ incident `open` (D8 đề xuất, chưa chốt cho `suspected`). Mỗi bậc ghi
 * outbox `escalation` với dedupeKey theo incident/bậc/người nhận; worker
 * thông báo kiểm lại quyền và bỏ qua nếu cảnh báo đã được xác nhận/đóng.
 * Chạy một tiến trình; `job_runs.run_key` chỉ chống lặp cùng phút.
 */
@Injectable()
export class AlertEscalationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertEscalationScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: AppDb,
    @Inject(ENV) private readonly env: AppEnv,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        this.logger.error(
          'Lỗi scheduler leo thang cảnh báo',
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

  isScheduled(): boolean {
    return this.timer !== null;
  }

  async runOnce(now: Date = new Date()): Promise<AlertEscalationResult> {
    const runKey = `${JOB_KEY}:${now.toISOString().slice(0, 16)}`;
    const inserted = await this.db
      .insert(jobRuns)
      .values({ jobKey: JOB_KEY, runKey, startedAt: now, outcome: 'running', counters: {} })
      .onConflictDoNothing()
      .returning({ id: jobRuns.id });
    if (inserted.length === 0) {
      return {
        runKey,
        skipped: true,
        policies: 0,
        incidents: 0,
        notifications: 0,
        skippedIncidents: 0,
        failed: 0,
      };
    }

    const result: AlertEscalationResult = {
      runKey,
      skipped: false,
      policies: 0,
      incidents: 0,
      notifications: 0,
      skippedIncidents: 0,
      failed: 0,
    };

    try {
      for (const row of await this.activePolicies()) {
        const parsed = alertEscalationConfigSchema.safeParse(row.rule.config);
        if (!parsed.success || !parsed.data.enabled) continue;
        result.policies += 1;
        try {
          await this.processPolicy(row.subject, parsed.data, now, result);
        } catch (error) {
          result.failed += 1;
          this.logger.warn(
            `Không xử lý được chính sách cảnh báo của hồ sơ ${row.subject.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      await this.db
        .update(jobRuns)
        .set({
          finishedAt: new Date(),
          outcome: result.failed > 0 ? 'failed' : 'succeeded',
          counters: {
            policies: result.policies,
            incidents: result.incidents,
            notifications: result.notifications,
            skippedIncidents: result.skippedIncidents,
            failed: result.failed,
          },
        })
        .where(and(eq(jobRuns.jobKey, JOB_KEY), eq(jobRuns.runKey, runKey)));
      return result;
    } catch (error) {
      await this.db
        .update(jobRuns)
        .set({
          finishedAt: new Date(),
          outcome: 'failed',
          counters: { policies: result.policies, failed: result.failed + 1 },
        })
        .where(and(eq(jobRuns.jobKey, JOB_KEY), eq(jobRuns.runKey, runKey)));
      throw error;
    }
  }

  private async activePolicies(): Promise<PolicyWithSubject[]> {
    return this.db
      .select({ rule: subjectRules, subject: subjects })
      .from(subjectRules)
      .innerJoin(subjects, eq(subjects.id, subjectRules.subjectId))
      .where(
        and(
          eq(subjectRules.kind, 'alert_escalation'),
          eq(subjectRules.active, true),
          isNull(subjects.archivedAt),
        ),
      )
      .orderBy(asc(subjects.id));
  }

  private async processPolicy(
    subject: typeof subjects.$inferSelect,
    config: AlertEscalationConfig,
    now: Date,
    result: AlertEscalationResult,
  ): Promise<void> {
    const firstStep = config.steps[0];
    if (!firstStep) return;
    const cutoff = new Date(now.getTime() - firstStep.afterMinutes * 60_000);
    const openIncidents = await this.db
      .select({
        id: incidents.id,
        detectedAt: incidents.detectedAt,
        lastRevision: incidents.lastRevision,
      })
      .from(incidents)
      .where(
        and(
          eq(incidents.subjectId, subject.id),
          eq(incidents.state, 'open'),
          lte(incidents.detectedAt, cutoff),
        ),
      )
      .orderBy(asc(incidents.detectedAt))
      .limit(100);

    for (const incident of openIncidents) {
      const level = escalationLevelAt(incident.detectedAt, now, config.steps);
      if (level === 0) continue;
      result.incidents += 1;
      const created = await this.processIncident(
        subject.id,
        incident.id,
        level,
        config.steps[level - 1]!.afterMinutes,
        now,
      );
      if (created === 0) {
        result.skippedIncidents += 1;
      } else {
        result.notifications += created;
      }
    }
  }

  private async processIncident(
    subjectId: string,
    incidentId: string,
    level: number,
    afterMinutes: number,
    now: Date,
  ): Promise<number> {
    return this.db.transaction(async (tx) => {
      // Khóa incident để ack/đóng đồng thời không chen giữa lúc kiểm và ghi outbox.
      const incidentRows = await tx
        .select({ id: incidents.id, lastRevision: incidents.lastRevision, state: incidents.state })
        .from(incidents)
        .where(eq(incidents.id, incidentId))
        .for('update')
        .limit(1);
      const incident = incidentRows[0];
      if (!incident || incident.state !== 'open') return 0;

      const recipients = await listAlertRecipients(tx, subjectId);
      if (recipients.length === 0) {
        await this.auditNoRecipient(tx, subjectId, incidentId, level);
        return 0;
      }

      const pushRecipients = this.env.WEB_PUSH_ENABLED
        ? await listPushRecipientIds(
            tx,
            recipients.map((recipient) => recipient.userId),
          )
        : new Set<string>();
      let created = 0;
      for (const recipient of recipients) {
        const channels: Array<'in_app' | 'web_push'> = ['in_app'];
        if (pushRecipients.has(recipient.userId)) channels.push('web_push');
        for (const channel of channels) {
          const rows = await tx
            .insert(notificationOutbox)
            .values({
              subjectId,
              incidentId,
              revision: incident.lastRevision,
              recipientUserId: recipient.userId,
              kind: 'escalation',
              title: `Cảnh báo vẫn mở — nhắc lần ${level}`,
              body: `Cảnh báo đã mở ${afterMinutes} phút mà chưa được xác nhận. Mở ứng dụng để kiểm tra hoặc nhờ người hỗ trợ.`,
              channel,
              status: 'pending',
              attempts: 0,
              nextAttemptAt: now,
              dedupeKey: `${incidentId}:escalation:${level}:${recipient.userId}:${channel}`,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing({ target: notificationOutbox.dedupeKey })
            .returning({ id: notificationOutbox.id });
          created += rows.length;
        }
      }

      if (created > 0) {
        await this.audit.record(
          {
            actorKind: 'system',
            action: 'alert_escalation.notification',
            targetType: 'incident',
            targetId: incidentId,
            outcome: 'success',
            metadata: { subjectId, level, afterMinutes, deliveries: created },
          },
          tx,
        );
      }
      return created;
    });
  }

  /** Chỉ một audit/incident/bậc để tick 60 giây không làm đầy bảng. */
  private async auditNoRecipient(
    tx: Parameters<Parameters<AppDb['transaction']>[0]>[0],
    subjectId: string,
    incidentId: string,
    level: number,
  ): Promise<void> {
    const existing = await tx
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, 'alert_escalation.skipped'),
          eq(auditLogs.targetId, incidentId),
          sql`${auditLogs.metadata}->>'level' = ${String(level)}`,
          sql`${auditLogs.metadata}->>'reason' = 'no_recipient'`,
        ),
      )
      .limit(1);
    if (existing.length > 0) return;
    await this.audit.record(
      {
        actorKind: 'system',
        action: 'alert_escalation.skipped',
        targetType: 'incident',
        targetId: incidentId,
        outcome: 'success',
        metadata: { subjectId, level, reason: 'no_recipient' },
      },
      tx,
    );
  }
}
