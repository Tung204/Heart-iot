import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { UserSummary } from '@heart-iot/contracts';
import {
  careDigestRuleConfigSchema,
  careRuleKindSchema,
  DEFAULT_CARE_DIGEST_RULE_CONFIG,
  DEFAULT_INACTIVITY_RULE_CONFIG,
  inactivityRuleConfigSchema,
  type CareRuleKind,
  type CareRulePreview,
  type CareRuleView,
  type CareRuleConfig,
} from '@heart-iot/contracts/care-rules';
import { DB, type AppDb } from '../database/database';
import { subjects, subjectRules } from '../database/schema';
import { AccessService } from '../access/access.service';
import { AuditService } from '../access/audit.service';
import { AppError } from '../common/app-error';
import { buildDigestPreview, buildInactivityPreview } from './care-rule-schedule';

type RuleRow = typeof subjectRules.$inferSelect;

function defaultView(subjectId: string, kind: CareRuleKind): CareRuleView {
  if (kind === 'inactivity') {
    return {
      kind,
      subjectId,
      version: 0,
      source: 'default',
      updatedAt: null,
      config: { ...DEFAULT_INACTIVITY_RULE_CONFIG, weekdays: [...DEFAULT_INACTIVITY_RULE_CONFIG.weekdays] },
    };
  }
  return {
    kind,
    subjectId,
    version: 0,
    source: 'default',
    updatedAt: null,
    config: { ...DEFAULT_CARE_DIGEST_RULE_CONFIG },
  };
}

@Injectable()
export class CareRulesService {
  private readonly logger = new Logger(CareRulesService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /** Chỉ chủ hồ sơ được đọc/ghi cấu hình; người thân chỉ thấy nội dung chăm sóc. */
  async get(user: UserSummary, subjectId: string, kindRaw: string): Promise<CareRuleView> {
    const kind = careRuleKindSchema.parse(kindRaw);
    const access = await this.access.requireSubject(user.id, subjectId);
    this.assertOwner(access.role === 'owner');
    const row = await this.activeRow(subjectId, kind);
    return row ? this.toView(subjectId, kind, row) : defaultView(subjectId, kind);
  }

  async update(
    user: UserSummary,
    subjectId: string,
    kindRaw: string,
    input: unknown,
  ): Promise<CareRuleView> {
    const kind = careRuleKindSchema.parse(kindRaw);
    const access = await this.access.requireSubject(user.id, subjectId);
    this.assertOwner(access.role === 'owner');
    const config = this.parseConfig(kind, input);

    const row = await this.db.transaction(async (tx) => {
      // Khóa hồ sơ để hai lần lưu đồng thời không tạo hai bản active.
      await tx.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subjectId)).for('update');
      const versions = await tx
        .select({ version: subjectRules.version })
        .from(subjectRules)
        .where(and(eq(subjectRules.subjectId, subjectId), eq(subjectRules.kind, kind)))
        .orderBy(desc(subjectRules.version))
        .limit(1);
      const nextVersion = (versions[0]?.version ?? 0) + 1;
      await tx
        .update(subjectRules)
        .set({ active: false })
        .where(
          and(
            eq(subjectRules.subjectId, subjectId),
            eq(subjectRules.kind, kind),
            eq(subjectRules.active, true),
          ),
        );
      const inserted = await tx
        .insert(subjectRules)
        .values({
          subjectId,
          kind,
          version: nextVersion,
          config,
          active: true,
          createdByUserId: user.id,
        })
        .returning();
      const created = inserted[0];
      if (!created) throw new Error('Không lưu được quy tắc chăm sóc.');
      await this.audit.record(
        {
          actorUserId: user.id,
          actorKind: 'user',
          action: 'care_rule.update',
          targetType: 'subject_rule',
          targetId: created.id,
          outcome: 'success',
          metadata: { subjectId, kind, version: created.version, enabled: config.enabled },
        },
        tx,
      );
      return created;
    });
    return this.toView(subjectId, kind, row);
  }

  async preview(user: UserSummary, subjectId: string, kindRaw: string): Promise<CareRulePreview> {
    const kind = careRuleKindSchema.parse(kindRaw);
    const access = await this.access.requireSubject(user.id, subjectId);
    this.assertOwner(access.role === 'owner');
    const row = await this.activeRow(subjectId, kind);
    const view = row ? this.toView(subjectId, kind, row) : defaultView(subjectId, kind);
    const now = new Date();
    if (view.kind === 'inactivity') {
      return buildInactivityPreview(view.config, now, access.subject.timezone);
    }
    return buildDigestPreview(view.config, now, access.subject.timezone);
  }

  /** Cho scheduler: đọc bản active, không kiểm quyền người dùng. */
  async effective(subjectId: string, kind: CareRuleKind): Promise<CareRuleView | null> {
    const row = await this.activeRow(subjectId, kind);
    return row ? this.toView(subjectId, kind, row) : null;
  }

  private async activeRow(subjectId: string, kind: CareRuleKind): Promise<RuleRow | null> {
    const rows = await this.db
      .select()
      .from(subjectRules)
      .where(
        and(
          eq(subjectRules.subjectId, subjectId),
          eq(subjectRules.kind, kind),
          eq(subjectRules.active, true),
        ),
      )
      .orderBy(desc(subjectRules.version))
      .limit(1);
    return rows[0] ?? null;
  }

  private toView(subjectId: string, kind: CareRuleKind, row: RuleRow): CareRuleView {
    const parsed =
      kind === 'inactivity'
        ? inactivityRuleConfigSchema.safeParse(row.config)
        : careDigestRuleConfigSchema.safeParse(row.config);
    if (!parsed.success) {
      // Dữ liệu cũ/hỏng không được làm sập trang; fallback về mặc định tắt.
      this.logger.warn(`Quy tắc ${kind} của hồ sơ ${subjectId} không hợp lệ, dùng mặc định tắt.`);
      return defaultView(subjectId, kind);
    }
    return {
      kind,
      subjectId,
      version: row.version,
      source: 'database',
      updatedAt: row.createdAt.toISOString(),
      config: parsed.data,
    } as CareRuleView;
  }

  private parseConfig(kind: CareRuleKind, input: unknown): CareRuleConfig {
    const parsed =
      kind === 'inactivity'
        ? inactivityRuleConfigSchema.safeParse(input)
        : careDigestRuleConfigSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.validation('Cấu hình quy tắc chăm sóc không hợp lệ.', {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    if (kind === 'inactivity') {
      // Chuẩn hoá thứ tự ngày để UI/seed ổn định; logic không phụ thuộc thứ tự.
      const config = parsed.data as { weekdays: number[] };
      return { ...config, weekdays: [...config.weekdays].sort((a, b) => a - b) } as CareRuleConfig;
    }
    return parsed.data;
  }

  private assertOwner(isOwner: boolean): void {
    if (!isOwner) {
      throw AppError.forbidden('Chỉ chủ hồ sơ được thay đổi quy tắc chăm sóc.');
    }
  }
}
