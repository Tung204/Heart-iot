import { eq } from 'drizzle-orm';
import { AuditService } from '../src/access/audit.service';
import { ENV, type AppEnv } from '../src/config/env';
import {
  aiSummaries,
  assistantDrafts,
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

const ZERO: RetentionCounts = {
  telemetry: 0,
  notifications: 0,
  realtime: 0,
  aiSummaries: 0,
  assistantDrafts: 0,
};

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

  // Mỗi test tự có fixture riêng: randomize thứ tự test không được làm test
  // preview/purge phụ thuộc vào test chạy trước.
  beforeEach(async () => {
    await ctx.db.delete(assistantDrafts);
    await ctx.db.delete(aiSummaries);
    await ctx.db.delete(realtimeEvents);
    await ctx.db.delete(notificationOutbox);
    await ctx.db.delete(telemetry);
    await seedRows();
  });

  function envWith(overrides: Partial<AppEnv>): AppEnv {
    return {
      ...ctx.app.get<AppEnv>(ENV),
      RETENTION_ENABLED: true,
      RETENTION_TELEMETRY_DAYS: 30,
      RETENTION_NOTIFICATION_DAYS: 30,
      RETENTION_REALTIME_DAYS: 30,
      RETENTION_AI_SUMMARY_DAYS: 30,
      RETENTION_ASSISTANT_DRAFT_DAYS: 30,
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

    const digest = 'a'.repeat(64);
    await ctx.db.insert(assistantDrafts).values([
      {
        actorUserId: owner.session.user.id,
        subjectId,
        capability: 'care_reminder.create',
        payload: { title: 'Nháp cũ', kind: 'other', times: ['08:00'], weekdays: [1] },
        previewDigest: digest,
        status: 'confirmed',
        expiresAt: OLD,
        createdAt: OLD,
        updatedAt: OLD,
      },
      {
        actorUserId: owner.session.user.id,
        subjectId,
        capability: 'care_reminder.create',
        payload: { title: 'Nháp mới', kind: 'other', times: ['09:00'], weekdays: [1] },
        previewDigest: digest,
        status: 'draft',
        expiresAt: NEW,
        createdAt: NEW,
        updatedAt: NEW,
      },
      {
        // Dữ liệu bất thường: createdAt cũ nhưng chưa hết hạn — không được xóa.
        actorUserId: owner.session.user.id,
        subjectId,
        capability: 'care_reminder.create',
        payload: { title: 'Nháp còn hiệu lực', kind: 'other', times: ['10:00'], weekdays: [1] },
        previewDigest: digest,
        status: 'draft',
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        createdAt: OLD,
        updatedAt: OLD,
      },
    ]);
  }

  it('mặc định tắt: không xóa dù có ngày cấu hình', async () => {
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
    expect(await ctx.db.select().from(assistantDrafts)).toHaveLength(3);
  });

  it('preview chỉ đọc: đếm đúng từng lớp và không xóa dữ liệu', async () => {
    const service = new RetentionService(
      ctx.db,
      envWith({}),
      ctx.app.get(AuditService),
    );
    const preview = await service.preview(NOW);
    expect(preview).toMatchObject({
      enabled: true,
      configured: true,
      generatedAt: NOW.toISOString(),
      totalWouldDelete: 5,
    });
    expect(preview.layers.map((layer) => layer.layer)).toEqual([
      'telemetry',
      'notifications',
      'realtime',
      'aiSummaries',
      'assistantDrafts',
    ]);
    expect(preview.layers.map((layer) => layer.days)).toEqual([30, 30, 30, 30, 30]);
    expect(preview.layers.map((layer) => layer.wouldDelete)).toEqual([1, 1, 1, 1, 1]);
    expect(preview.layers[0]?.cutoff).toBe('2026-10-22T12:00:00.000Z');

    expect(await ctx.db.select().from(telemetry)).toHaveLength(2);
    expect(await ctx.db.select().from(notificationOutbox)).toHaveLength(3);
    expect(await ctx.db.select().from(realtimeEvents)).toHaveLength(2);
    expect(await ctx.db.select().from(aiSummaries)).toHaveLength(2);
    expect(await ctx.db.select().from(assistantDrafts)).toHaveLength(3);
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
      assistantDrafts: 1,
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
    expect(await ctx.db.select().from(assistantDrafts)).toHaveLength(2);

    const audits = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'retention.purge'));
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).toMatchObject({
      deleted: {
        telemetry: 1,
        notifications: 1,
        realtime: 1,
        aiSummaries: 1,
        assistantDrafts: 1,
      },
    });

    const second = await service.runOnce(NOW);
    expect(second.skipped).toBe(true);
    expect(second.deleted).toEqual(ZERO);
    expect(await ctx.db.select().from(telemetry)).toHaveLength(1);
  });
});
