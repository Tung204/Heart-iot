import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import type { UserSummary } from '@heart-iot/contracts';
import { canViewMeasurements, normalizeCarePermissions } from '@heart-iot/contracts';
import {
  careDigestRuleConfigSchema,
  type CareDigestRuleConfig,
  type InactivityRuleConfig,
  inactivityRuleConfigSchema,
} from '@heart-iot/contracts/care-rules';
import { DB, type AppDb } from '../database/database';
import {
  auditLogs,
  careLinks,
  deviceAssignments,
  devices,
  incidents,
  jobRuns,
  notificationOutbox,
  subjects,
  subjectRules,
  telemetry,
  users,
  type SubjectRow,
} from '../database/schema';
import { AuditService } from '../access/audit.service';
import { PolicyService } from '../policy/policy.service';
import { MeasurementsService } from '../measurements/measurements.service';
import { RemindersService } from '../reminders/reminders.service';
import { localDateKey } from '../measurements/insights';
import { formatDateVi } from '../common/local-date';
import {
  inactivityWindowUtc,
  isDigestDue,
  isInactivityDue,
  localTimeKey,
  sumStepsInRows,
} from './care-rule-schedule';

const JOB_KEY = 'care_scheduler';
const TICK_MS = 60_000;

export type CareSchedulerResult = {
  runKey: string;
  skipped: boolean;
  subjects: number;
  digests: number;
  inactivity: number;
  skippedRules: number;
  failed: number;
};

type RuleWithSubject = {
  rule: typeof subjectRules.$inferSelect;
  subject: SubjectRow;
};

/**
 * Scheduler V9.2 — một tick 60 giây, giả định **một tiến trình** cho demo.
 * Nếu chạy nhiều instance phải bổ sung advisory lock; hiện `job_runs.run_key`
 * chỉ chống chạy lại cùng phút trong cùng DB.
 *
 * Không tạo incident, không phát cảnh báo khẩn: chỉ ghi outbox `care_rule`/
 * `care_digest`; worker thông báo hiện có kiểm lại quyền trước khi gửi.
 */
@Injectable()
export class CareSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CareSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly audit: AuditService,
    private readonly policy: PolicyService,
    private readonly measurements: MeasurementsService,
    private readonly reminders: RemindersService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        this.logger.error(
          'Lỗi scheduler chăm sóc',
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

  /**
   * Chạy một tick với mốc thời gian tường minh. Gọi lại cùng phút trả
   * `skipped: true` và không xử lý gì; gọi ở phút kế tiếp vẫn không nhân đôi
   * thông báo nhờ dedupe_key theo ngày/người nhận.
   */
  async runOnce(now: Date = new Date()): Promise<CareSchedulerResult> {
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
        subjects: 0,
        digests: 0,
        inactivity: 0,
        skippedRules: 0,
        failed: 0,
      };
    }

    const result: CareSchedulerResult = {
      runKey,
      skipped: false,
      subjects: 0,
      digests: 0,
      inactivity: 0,
      skippedRules: 0,
      failed: 0,
    };

    try {
      const rules = await this.activeRules();
      const bySubject = new Map<string, RuleWithSubject[]>();
      for (const row of rules) {
        const list = bySubject.get(row.subject.id) ?? [];
        list.push(row);
        bySubject.set(row.subject.id, list);
      }

      for (const [subjectId, subjectRulesForSubject] of bySubject) {
        const subject = subjectRulesForSubject[0]?.subject;
        if (!subject) continue;
        result.subjects += 1;
        try {
          await this.processSubject(subject, subjectRulesForSubject, now, result);
        } catch (error) {
          result.failed += 1;
          this.logger.warn(
            `Không xử lý được quy tắc của hồ sơ ${subjectId}: ${
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
            subjects: result.subjects,
            digests: result.digests,
            inactivity: result.inactivity,
            skippedRules: result.skippedRules,
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
          counters: { subjects: result.subjects, failed: result.failed + 1 },
        })
        .where(and(eq(jobRuns.jobKey, JOB_KEY), eq(jobRuns.runKey, runKey)));
      throw error;
    }
  }

  private async activeRules(): Promise<RuleWithSubject[]> {
    return this.db
      .select({ rule: subjectRules, subject: subjects })
      .from(subjectRules)
      .innerJoin(subjects, eq(subjects.id, subjectRules.subjectId))
      .where(and(eq(subjectRules.active, true), isNull(subjects.archivedAt)))
      .orderBy(asc(subjects.id), asc(subjectRules.kind));
  }

  private async processSubject(
    subject: SubjectRow,
    rules: RuleWithSubject[],
    now: Date,
    result: CareSchedulerResult,
  ): Promise<void> {
    const timezone = subject.timezone;
    const date = localDateKey(now, timezone);
    const owner = await this.activeOwner(subject.ownerUserId);
    if (!owner) {
      await this.auditSkip(subject.id, 'care_rule', date, 'no_recipient');
      result.skippedRules += 1;
      return;
    }

    for (const { rule } of rules) {
      if (rule.kind === 'inactivity') {
        const parsed = inactivityRuleConfigSchema.safeParse(rule.config);
        if (!parsed.success || !isInactivityDue(parsed.data, now, timezone)) continue;
        const created = await this.processInactivity(subject, owner, parsed.data, date, now);
        if (created > 0) result.inactivity += 1;
        else result.skippedRules += 1;
      } else if (rule.kind === 'care_digest') {
        const parsed = careDigestRuleConfigSchema.safeParse(rule.config);
        if (!parsed.success || !isDigestDue(parsed.data, now, timezone)) continue;
        const created = await this.processDigest(subject, owner, parsed.data, date, now);
        if (created > 0) result.digests += 1;
        else result.skippedRules += 1;
      }
    }
  }

  private async processInactivity(
    subject: SubjectRow,
    owner: UserSummary,
    config: InactivityRuleConfig,
    date: string,
    now: Date,
  ): Promise<number> {
    const assignment = await this.openAssignment(subject.id);
    if (!assignment) {
      await this.auditSkip(subject.id, 'inactivity', date, 'no_device');
      return 0;
    }
    const policy = await this.policy.getActive();
    const lastSeen = assignment.device.lastSeenAt;
    if (!lastSeen || now.getTime() - lastSeen.getTime() > policy.value.offlineAfterSeconds * 1000) {
      await this.auditSkip(subject.id, 'inactivity', date, 'offline');
      return 0;
    }

  
    const window = inactivityWindowUtc(config, date, subject.timezone);
    const rows = await this.db
      .select({
        bootId: telemetry.bootId,
        measuredAt: telemetry.measuredAt,
        metrics: telemetry.metrics,
        quality: telemetry.quality,
      })
      .from(telemetry)
      .where(
        and(
          eq(telemetry.assignmentId, assignment.assignment.id),
          eq(telemetry.isQuarantined, false),
          isNotNull(telemetry.measuredAt),
          gte(telemetry.measuredAt, window.from),
          lte(telemetry.measuredAt, window.to),
        ),
      )
      .orderBy(asc(telemetry.measuredAt));
    if (rows.length === 0 || rows.every((row) => row.quality.motion === 'sensor_error')) {
      await this.auditSkip(subject.id, 'inactivity', date, 'no_data');
      return 0;
    }
    const latest = rows[rows.length - 1];
    if (latest?.quality.heart_rate === 'not_worn') {
      await this.auditSkip(subject.id, 'inactivity', date, 'not_worn');
      return 0;
    }
    const steps = sumStepsInRows(rows, policy.value.heartbeatIntervalSeconds * 4 * 1000);
    if (steps >= config.minSteps) {
      await this.auditSkip(subject.id, 'inactivity', date, 'enough_steps');
      return 0;
    }

    const recipients = await this.recipients(subject.id, owner.id);
    if (recipients.length === 0) {
      await this.auditSkip(subject.id, 'inactivity', date, 'no_recipient');
      return 0;
    }
    const title = 'Nhắc vận động nhẹ';
    const body = `Trong khung ${config.windowStart}–${config.windowEnd} hôm nay, hệ thống chưa ghi nhận đủ vận động theo cài đặt của bạn. Đây là nhắc nhẹ, không phải cảnh báo khẩn.`;
    const created = await this.enqueue(subject.id, recipients, date, 'care_rule', title, body, now);
    await this.auditNotification(subject.id, 'inactivity', date, created);
    return created;
  }

  private async processDigest(
    subject: SubjectRow,
    owner: UserSummary,
    config: CareDigestRuleConfig,
    date: string,
    now: Date,
  ): Promise<number> {
    const [day, summary, openIncidents] = await Promise.all([
      this.reminders.dayForSubject(subject.id, subject.timezone, date),
      this.measurements.dailySummary(owner.id, subject.id, date, now),
      this.db
        .select({ id: incidents.id })
        .from(incidents)
        .where(
          and(
            eq(incidents.subjectId, subject.id),
            inArray(incidents.state, ['open', 'acknowledged']),
          ),
        ),
    ]);

    const localTime = localTimeKey(now, subject.timezone);
    const items = day.items.filter((item) => item.time <= localTime);
    const done = items.filter((item) => item.status === 'done').length;
    const skipped = items.filter((item) => item.status === 'skipped').length;
    const pending = items.filter((item) => item.status === 'pending').length;

    const reminderLine =
      items.length === 0
        ? 'Hôm nay không có lịch nhắc đã tới giờ.'
        : `Việc đã ghi nhận: ${done + skipped}/${items.length} (đã làm ${done}, bỏ qua ${skipped}); chưa ghi nhận: ${pending}.`;
    const stepLine =
      summary.steps.completeness === 'unavailable'
        ? 'Bước chân: không có dữ liệu.'
        : `Bước chân: ${summary.steps.total} (${summary.steps.completeness === 'complete' ? 'đầy đủ' : 'một phần'}).`;
    const gapLine =
      summary.gaps.length > 0
        ? `Có ${summary.gaps.length} khoảng thiếu dữ liệu trong ngày.`
        : 'Không thấy khoảng thiếu dữ liệu trong ngày.';
    const sourceLine = summary.source === 'synthetic' ? 'Nguồn dữ liệu: mô phỏng.' : '';
    const body = [
      `Bản tin chăm sóc ngày ${formatDateVi(date)}.`,
      reminderLine,
      stepLine,
      gapLine,
      `Cảnh báo đang mở: ${openIncidents.length}.`,
      sourceLine,
    ]
      .filter(Boolean)
      .join('\n');

    const recipients = await this.recipients(subject.id, owner.id);
    if (recipients.length === 0) {
      await this.auditSkip(subject.id, 'care_digest', date, 'no_recipient');
      return 0;
    }
    const created = await this.enqueue(
      subject.id,
      recipients,
      date,
      'care_digest',
      'Bản tin chăm sóc cuối ngày',
      body,
      now,
    );
    await this.auditNotification(subject.id, 'care_digest', date, created);
    return created;
  }

  /** Chủ hồ sơ còn active; nếu không, không gửi thay người khác. */
  private async activeOwner(ownerUserId: string): Promise<UserSummary | null> {
    const rows = await this.db.select().from(users).where(eq(users.id, ownerUserId)).limit(1);
    const row = rows[0];
    if (!row || row.status !== 'active') return null;
    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      role: row.role,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async openAssignment(
    subjectId: string,
  ): Promise<{
    assignment: typeof deviceAssignments.$inferSelect;
    device: typeof devices.$inferSelect;
  } | null> {
    const rows = await this.db
      .select({ assignment: deviceAssignments, device: devices })
      .from(deviceAssignments)
      .innerJoin(devices, eq(devices.id, deviceAssignments.deviceId))
      .where(
        and(
          eq(deviceAssignments.subjectId, subjectId),
          isNull(deviceAssignments.endedAt),
          eq(devices.status, 'active'),
        ),
      )
      .orderBy(desc(deviceAssignments.startedAt))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Chủ hồ sơ + caregiver active còn `canViewMeasurements` (D3: dùng lại quyền này). */
  private async recipients(subjectId: string, ownerUserId: string): Promise<string[]> {
    const links = await this.db
      .select({ userId: careLinks.caregiverUserId, permissions: careLinks.permissions })
      .from(careLinks)
      .innerJoin(users, eq(users.id, careLinks.caregiverUserId))
      .where(
        and(
          eq(careLinks.subjectId, subjectId),
          eq(careLinks.status, 'active'),
          isNull(careLinks.revokedAt),
          eq(users.status, 'active'),
        ),
      );
    const result = new Set<string>();
    const owner = await this.db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, ownerUserId))
      .limit(1);
    if (owner[0]?.status === 'active') result.add(ownerUserId);
    for (const link of links) {
      if (canViewMeasurements(normalizeCarePermissions(link.permissions))) {
        result.add(link.userId);
      }
    }
    return [...result];
  }

  private async enqueue(
    subjectId: string,
    recipients: string[],
    date: string,
    kind: 'care_rule' | 'care_digest',
    title: string,
    body: string,
    now: Date,
  ): Promise<number> {
    let created = 0;
    for (const recipientUserId of recipients) {
      const dedupeKey = `care:${subjectId}:${date}:${recipientUserId}:in_app:${kind}`;
      const rows = await this.db
        .insert(notificationOutbox)
        .values({
          subjectId,
          incidentId: null,
          revision: null,
          recipientUserId,
          kind,
          title,
          body,
          channel: 'in_app',
          status: 'pending',
          attempts: 0,
          nextAttemptAt: now,
          dedupeKey,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: notificationOutbox.id });
      created += rows.length;
    }
    return created;
  }

  private async auditNotification(
    subjectId: string,
    kind: 'inactivity' | 'care_digest',
    date: string,
    recipients: number,
  ): Promise<void> {
    await this.audit.record({
      actorKind: 'system',
      action: 'care_rule.notification',
      targetType: 'subject',
      targetId: subjectId,
      outcome: 'success',
      metadata: { rule: kind, date, recipients },
    });
  }

  /** Chỉ ghi audit một lần/ngày/lý do để scheduler 60 giây không spam bảng audit. */
  private async auditSkip(
    subjectId: string,
    rule: string,
    date: string,
    reason: string,
  ): Promise<void> {
    const existing = await this.db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, 'care_rule.skipped'),
          eq(auditLogs.targetId, subjectId),
          sql`${auditLogs.metadata}->>'rule' = ${rule}`,
          sql`${auditLogs.metadata}->>'date' = ${date}`,
          sql`${auditLogs.metadata}->>'reason' = ${reason}`,
        ),
      )
      .limit(1);
    if (existing.length > 0) return;
    await this.audit.record({
      actorKind: 'system',
      action: 'care_rule.skipped',
      targetType: 'subject',
      targetId: subjectId,
      outcome: 'success',
      metadata: { rule, date, reason },
    });
  }
}
