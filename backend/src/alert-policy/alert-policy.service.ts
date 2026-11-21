import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { UserSummary } from '@heart-iot/contracts';
import {
  alertEscalationConfigSchema,
  DEFAULT_ALERT_ESCALATION_CONFIG,
  type AlertEscalationConfig,
  type AlertPolicyPreview,
  type AlertPolicyView,
} from '@heart-iot/contracts/alert-policy';
import { DB, type AppDb } from '../database/database';
import { notificationOutbox, subjects, subjectRules } from '../database/schema';
import { AccessService } from '../access/access.service';
import { AuditService } from '../access/audit.service';
import { AppError } from '../common/app-error';
import { listAlertRecipients } from '../incidents/alert-recipients';

const RULE_KIND = 'alert_escalation';

type RuleRow = typeof subjectRules.$inferSelect;

export function defaultAlertPolicyView(subjectId: string): AlertPolicyView {
  return {
    subjectId,
    version: 0,
    source: 'default',
    updatedAt: null,
    config: {
      enabled: DEFAULT_ALERT_ESCALATION_CONFIG.enabled,
      steps: DEFAULT_ALERT_ESCALATION_CONFIG.steps.map((step) => ({ ...step })),
    },
  };
}

export function buildAlertPolicyPreview(
  config: AlertEscalationConfig,
  now: Date,
  recipients: Array<{ userId: string; displayName: string }> = [],
): AlertPolicyPreview {
  const warnings: string[] = [];
  if (!config.enabled) {
    warnings.push('Chính sách đang tắt; sẽ không gửi nhắc lại.');
  }
  if (recipients.length === 0) {
    warnings.push('Hiện không có người nhận hợp lệ; bật chính sách cũng không gửi được nhắc nào.');
  }
  return {
    generatedAt: now.toISOString(),
    enabled: config.enabled,
    steps: config.steps.map((step, index) => ({
      level: index + 1,
      afterMinutes: step.afterMinutes,
      channel: 'in_app',
      note: config.enabled
        ? `Nếu cảnh báo vẫn mở sau ${step.afterMinutes} phút, gửi nhắc lại lần ${index + 1} trong ứng dụng.`
        : 'Chính sách đang tắt; sẽ không gửi nhắc lại.',
    })),
    recipients,
    recipientCount: recipients.length,
    warnings,
    disclaimer:
      'Chỉ gửi trong ứng dụng; không tự gọi cấp cứu, không gửi SMS và không thay thế cấp cứu.',
  };
}

@Injectable()
export class AlertPolicyService {
  private readonly logger = new Logger(AlertPolicyService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /** Chỉ chủ hồ sơ được đọc/ghi; người thân chỉ nhận thông báo, không sửa chính sách. */
  async get(user: UserSummary, subjectId: string): Promise<AlertPolicyView> {
    const access = await this.access.requireSubject(user.id, subjectId);
    this.assertOwner(access.role === 'owner');
    const row = await this.activeRow(subjectId);
    return row ? this.toView(subjectId, row) : defaultAlertPolicyView(subjectId);
  }

  async update(
    user: UserSummary,
    subjectId: string,
    input: unknown,
  ): Promise<AlertPolicyView> {
    const access = await this.access.requireSubject(user.id, subjectId);
    this.assertOwner(access.role === 'owner');
    const config = this.parseConfig(input);

    const row = await this.db.transaction(async (tx) => {
      // Cùng khóa hồ sơ với CareRulesService để hai lần lưu không tạo hai bản active.
      await tx
        .select({ id: subjects.id })
        .from(subjects)
        .where(eq(subjects.id, subjectId))
        .for('update');
      const versions = await tx
        .select({ version: subjectRules.version })
        .from(subjectRules)
        .where(and(eq(subjectRules.subjectId, subjectId), eq(subjectRules.kind, RULE_KIND)))
        .orderBy(desc(subjectRules.version))
        .limit(1);
      const nextVersion = (versions[0]?.version ?? 0) + 1;
      await tx
        .update(subjectRules)
        .set({ active: false })
        .where(
          and(
            eq(subjectRules.subjectId, subjectId),
            eq(subjectRules.kind, RULE_KIND),
            eq(subjectRules.active, true),
          ),
        );
      const inserted = await tx
        .insert(subjectRules)
        .values({
          subjectId,
          kind: RULE_KIND,
          version: nextVersion,
          config,
          active: true,
          createdByUserId: user.id,
        })
        .returning();
      const created = inserted[0];
      if (!created) throw new Error('Không lưu được chính sách cảnh báo.');
      if (!config.enabled) {
        // Tắt chính sách thì không giữ các nhắc leo thang đang chờ của hồ sơ.
        await tx
          .update(notificationOutbox)
          .set({ status: 'superseded', supersededAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(notificationOutbox.subjectId, subjectId),
              eq(notificationOutbox.kind, 'escalation'),
              eq(notificationOutbox.status, 'pending'),
            ),
          );
      }
      await this.audit.record(
        {
          actorUserId: user.id,
          actorKind: 'user',
          action: 'alert_policy.update',
          targetType: 'subject_rule',
          targetId: created.id,
          outcome: 'success',
          metadata: {
            subjectId,
            version: created.version,
            enabled: config.enabled,
            steps: config.steps.map((step) => step.afterMinutes),
          },
        },
        tx,
      );
      return created;
    });
    return this.toView(subjectId, row);
  }

  async preview(user: UserSummary, subjectId: string): Promise<AlertPolicyPreview> {
    const view = await this.get(user, subjectId);
    const recipients = await listAlertRecipients(this.db, subjectId);
    return buildAlertPolicyPreview(view.config, new Date(), recipients);
  }

  /** Cho scheduler/test: chỉ đọc bản active, không cần user. */
  async effective(subjectId: string): Promise<AlertPolicyView | null> {
    const row = await this.activeRow(subjectId);
    return row ? this.toView(subjectId, row) : null;
  }

  private async activeRow(subjectId: string): Promise<RuleRow | null> {
    const rows = await this.db
      .select()
      .from(subjectRules)
      .where(
        and(
          eq(subjectRules.subjectId, subjectId),
          eq(subjectRules.kind, RULE_KIND),
          eq(subjectRules.active, true),
        ),
      )
      .orderBy(desc(subjectRules.version))
      .limit(1);
    return rows[0] ?? null;
  }

  private toView(subjectId: string, row: RuleRow): AlertPolicyView {
    const parsed = alertEscalationConfigSchema.safeParse(row.config);
    if (!parsed.success) {
      this.logger.warn(
        `Chính sách cảnh báo của hồ sơ ${subjectId} không hợp lệ, dùng mặc định tắt.`,
      );
      return defaultAlertPolicyView(subjectId);
    }
    return {
      subjectId,
      version: row.version,
      source: 'database',
      updatedAt: row.createdAt.toISOString(),
      config: parsed.data,
    };
  }

  private parseConfig(input: unknown): AlertEscalationConfig {
    const parsed = alertEscalationConfigSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.validation('Chính sách cảnh báo không hợp lệ.', {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return parsed.data;
  }

  private assertOwner(isOwner: boolean): void {
    if (!isOwner) {
      throw AppError.forbidden('Chỉ chủ hồ sơ được thay đổi chính sách cảnh báo.');
    }
  }
}
