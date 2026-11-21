import { eq } from 'drizzle-orm';
import { AuditService } from '../src/access/audit.service';
import { ENV, type AppEnv } from '../src/config/env';
import {
  aiSummaries,
  auditLogs,
  deviceAssignments,
  devices,
  notificationOutbox,
  realtimeEvents,
  subjects,
  telemetry,
} from '../src/database/schema';
import { RetentionService, type RetentionCounts } from '../src/retention/retention.service';
import { RetentionModule } from '../src/retention/retention.module';
import {
  createModuleTestApp,
  registerUser,
  type TestContext,
  type TestUser,
} from './test-app';

/**
 * Retention mặc định tắt, không có ngày mặc định; khi bật chỉ xóa đúng lớp
 * được cấu hình và đúng cutoff. Job chạy một lần/ngày nhờ job_runs.
 */

const NOW = new Date('2026-11-21T12:00:00.000Z');
const OLD = new Date('2026-10-01T12:00:00.000Z');
const NEW = new Date('2026-11-20T12:00:00.000Z');

const ZERO: RetentionCounts = { telemetry: 0, notifications: 0, realtime: 0, aiSummaries: 0 };

describe('Retention dữ liệu theo tuổi', () => {
  let ctx: TestContext;
  let owner: TestUser;
  let subjectId: string;
  let deviceId: string;
  let assignmentId: string;

  beforeAll(async () => {
    ctx = await createModuleTestApp([RetentionModule]);
    owner = await registerUser(ctx.app, { displayName: 'Chủ hồ sơ retention' });
    const subjectRows = await ctx.db
      .insert(subjects)
      .values({ ownerUserId: owner.session.user.id, displayName: 'Bà An', timezone: 'Asia/Ho_Chi_Minh' })
      .returning();
    subjectId = subjectRows[0]!.id;
    const deviceRows = await ctx.db
      .insert(devices)
      .values({ serial: 'RETENTION-001', label: 'Vòng tay', credentialHash: 'hash' })
      .returning();
    deviceId = deviceRows[0]!.id;
    const assignmentRows = await ctx.db
      .insert(deviceAssignments)
      .values({
        deviceId,
        subjectId,
        assignedByUserId: owner.session.user.id,
        startedAt: OLD,
      })
      .returning();
    assignmentId = assignmentRows[0]!.id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  function envWith(overrides: Partial<AppEnv>): AppEnv {
    return {
      ...ctx.app.get<AppEnv>(ENV),
      RETENTION_ENABLED: true,
      RETENTION_TELEMETRY_DAYS: 30,
      RETENTION_NOTIFICATION_DAYS: 30,
      RETENTION_REALTIME_DAYS: 30,
      RETENTION_AI_SUMMARY_DAYS: 30,
      ...overrides,
    };
  }

  async function seedRows(): Promise<void> {
    await ctx.db.insert(telemetry).values([
      {
        messageId: 'retention-old-telemetry',
        deviceId,
        assignmentId,
        bootId: 'boot-retention',
        sequence: 1,
        measuredAt: OLD,
        receivedAt: OLD,
        clockStatus: 'synced',
        uptimeMs: 1_000,
        metrics: { heart_rate_bpm: 70, steps_since_boot: 1 },
        quality: { heart_rate: 'valid', motion: 'valid' },
        firmwareVersion: 'test',
        payloadHash: 'old',
      },
      {
        messageId: 'retention-new-telemetry',
        deviceId,
        assignmentId,
        bootId: 'boot-retention',
        sequence: 2,
        measuredAt: NEW,
        receivedAt: NEW,
        clockStatus: 'synced',
        uptimeMs: 2_000,
        metrics: { heart_rate_bpm: 72, steps_since_boot: 2 },
        quality: { heart_rate: 'valid', motion: 'valid' },
        firmwareVersion: 'test',
        payloadHash: 'new',
      },
    ]);

    await ctx.db.insert(notificationOutbox).values([
      {
        subjectId,
        recipientUserId: owner.session.user.id,
        kind: 'care_digest',
        status: 'sent',
        dedupeKey: 'retention-old-sent',
        createdAt: OLD,
        updatedAt: OLD,
      },
      {
        subjectId,
        recipientUserId: owner.session.user.id,
        kind: 'care_digest',
        status: 'pending',
        dedupeKey: 'retention-old-pending',
        createdAt: OLD,
        updatedAt: OLD,
      },
      {
        subjectId,
        recipientUserId: owner.session.user.id,
        kind: 'care_digest',
        status: 'sent',
        dedupeKey: 'retention-new-sent',
        createdAt: NEW,
        updatedAt: NEW,
      },
    ]);

    await ctx.db.insert(realtimeEvents).values([
      { subjectId, type: 'retention.old', payload: {}, createdAt: OLD },
      { subjectId, type: 'retention.new', payload: {}, createdAt: NEW },
    ]);

    await ctx.db.insert(aiSummaries).values([
      {
        subjectId,
        periodStart: OLD,
        periodEnd: OLD,
        provider: 'template',
        content: {},
        aggregate: {},
        createdAt: OLD,
      },
      {
        subjectId,
        periodStart: NEW,
        periodEnd: NEW,
        provider: 'template',
        content: {},
        aggregate: {},
        createdAt: NEW,
      },
    ]);
  }

  it('mặc định tắt: không xóa dù có ngày cấu hình', async () => {
    await seedRows();
    const service = new RetentionService(
      ctx.db,
      envWith({ RETENTION_ENABLED: false }),
      ctx.app.get(AuditService),
    );
    const result = await service.runOnce(NOW);
    expect(result.disabled).toBe(true);
    expect(result.deleted).toEqual(ZERO);
    expect(await ctx.db.select().from(telemetry)).toHaveLength(2);
    expect(await ctx.db.select().from(notificationOutbox)).toHaveLength(3);
  });

  it('bật: chỉ xóa lớp cấu hình theo cutoff, giữ pending và chạy lại cùng ngày bị skip', async () => {
    const service = new RetentionService(
      ctx.db,
      envWith({}),
      ctx.app.get(AuditService),
    );
    const first = await service.runOnce(NOW);
    expect(first.skipped).toBe(false);
    expect(first.deleted).toEqual({
      telemetry: 1,
      notifications: 1,
      realtime: 1,
      aiSummaries: 1,
    });

    const telemetryRows = await ctx.db.select().from(telemetry);
    expect(telemetryRows.map((row) => row.messageId)).toEqual(['retention-new-telemetry']);
    const outboxRows = await ctx.db.select().from(notificationOutbox);
    expect(outboxRows.map((row) => row.dedupeKey).sort()).toEqual([
      'retention-new-sent',
      'retention-old-pending',
    ]);
    expect(await ctx.db.select().from(realtimeEvents)).toHaveLength(1);
    expect(await ctx.db.select().from(aiSummaries)).toHaveLength(1);

    const audits = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'retention.purge'));
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).toMatchObject({
      deleted: { telemetry: 1, notifications: 1, realtime: 1, aiSummaries: 1 },
    });

    const second = await service.runOnce(NOW);
    expect(second.skipped).toBe(true);
    expect(second.deleted).toEqual(ZERO);
    expect(await ctx.db.select().from(telemetry)).toHaveLength(1);
  });
});
