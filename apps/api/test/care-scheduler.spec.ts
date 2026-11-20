import { and, eq } from 'drizzle-orm';
import { DEFAULT_CARE_PERMISSIONS } from '@heart-iot/contracts';
import { CareRulesModule } from '../src/care-rules/care-rules.module';
import { CareSchedulerService } from '../src/care-rules/care-scheduler.service';
import { NotificationService } from '../src/notifications/notifications.service';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { DB, type AppDb } from '../src/database/database';
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
} from '../src/database/schema';
import {
  createModuleTestApp,
  registerUser,
  type TestContext,
  type TestUser,
} from './test-app';

const PERMISSIONS = { ...DEFAULT_CARE_PERMISSIONS, canViewMeasurements: true };
const OWNER_ONLY = { ...DEFAULT_CARE_PERMISSIONS, canViewMeasurements: true };
const NOW = new Date('2026-11-20T11:10:00.000Z'); // 18:10 Asia/Ho_Chi_Minh
const DIGEST_NOW = new Date('2026-11-20T13:05:00.000Z'); // 20:05

describe('Scheduler chăm sóc (V9.2)', () => {
  let ctx: TestContext;
  let db: AppDb;
  let scheduler: CareSchedulerService;
  let notifications: NotificationService;
  let owner: TestUser;
  let caregiver: TestUser;
  let subjectId: string;
  let deviceId: string;
  let assignmentId: string;

  beforeAll(async () => {
    ctx = await createModuleTestApp([CareRulesModule, NotificationsModule]);
    db = ctx.app.get<AppDb>(DB);
    scheduler = ctx.app.get(CareSchedulerService);
    notifications = ctx.app.get(NotificationService);
    owner = await registerUser(ctx.app, { displayName: 'Chủ scheduler' });
    caregiver = await registerUser(ctx.app, { displayName: 'Người thân scheduler' });
    const subjectRows = await db
      .insert(subjects)
      .values({
        ownerUserId: owner.session.user.id,
        displayName: 'Bà scheduler',
        timezone: 'Asia/Ho_Chi_Minh',
      })
      .returning();
    subjectId = subjectRows[0]!.id;
    await db.insert(careLinks).values({
      subjectId,
      caregiverUserId: caregiver.session.user.id,
      invitedByUserId: owner.session.user.id,
      permissions: PERMISSIONS,
      status: 'active',
      acceptedAt: new Date(),
    });
    const deviceRows = await db
      .insert(devices)
      .values({
        serial: `SCHED-${crypto.randomUUID().slice(0, 8)}`,
        label: 'Thiết bị scheduler',
        credentialHash: 'hash',
        status: 'active',
        lastSeenAt: NOW,
      })
      .returning();
    deviceId = deviceRows[0]!.id;
    const assignmentRows = await db
      .insert(deviceAssignments)
      .values({
        deviceId,
        subjectId,
        assignedByUserId: owner.session.user.id,
        startedAt: new Date('2026-11-01T00:00:00Z'),
      })
      .returning();
    assignmentId = assignmentRows[0]!.id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await db.delete(notificationOutbox);
    await db.delete(jobRuns);
    await db.delete(auditLogs);
    await db.delete(subjectRules);
    await db.delete(telemetry);
    await db.delete(incidents);
    await db
      .update(devices)
      .set({ lastSeenAt: NOW })
      .where(eq(devices.id, deviceId));
    await db
      .update(careLinks)
      .set({ permissions: PERMISSIONS, status: 'active', revokedAt: null })
      .where(and(eq(careLinks.subjectId, subjectId), eq(careLinks.caregiverUserId, caregiver.session.user.id)));
  });

  async function setInactivity(overrides: Record<string, unknown> = {}) {
    const response = await owner.agent.put(`/api/v1/subjects/${subjectId}/care-rules/inactivity`).send({
      enabled: true,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      windowStart: '09:00',
      windowEnd: '18:00',
      minSteps: 50,
      graceMinutes: 30,
      ...overrides,
    });
    expect(response.status).toBe(200);
  }

  async function setDigest(overrides: Record<string, unknown> = {}) {
    const response = await owner.agent.put(`/api/v1/subjects/${subjectId}/care-rules/care_digest`).send({
      enabled: true,
      time: '20:00',
      ...overrides,
    });
    expect(response.status).toBe(200);
  }

  async function insertSample(
    measuredAt: string,
    steps: number,
    quality: { heart_rate: 'valid' | 'not_worn'; motion: 'valid' | 'sensor_error' } = {
      heart_rate: 'valid',
      motion: 'valid',
    },
  ) {
    await db.insert(telemetry).values({
      messageId: crypto.randomUUID(),
      deviceId,
      assignmentId,
      bootId: 'boot-sched',
      sequence: Math.floor(Date.parse(measuredAt) / 1000),
      measuredAt: new Date(measuredAt),
      receivedAt: NOW,
      clockStatus: 'synced',
      uptimeMs: 10_000,
      metrics: { heart_rate_bpm: 70, steps_since_boot: steps },
      quality,
      batteryPercent: 80,
      firmwareVersion: '0.1.0-test',
      isLate: false,
      isQuarantined: false,
      payloadHash: crypto.randomUUID(),
      source: 'test',
    });
  }

  async function insertTwoSamples(steps = 20) {
    await insertSample('2026-11-20T09:58:00.000Z', 0); // 16:58 local
    await insertSample('2026-11-20T09:59:00.000Z', steps); // 16:59 local
  }

  async function lastSkipReason(): Promise<string | null> {
    const rows = await db
      .select({ metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'care_rule.skipped'), eq(auditLogs.targetId, subjectId)))
      .orderBy(auditLogs.createdAt);
    return (rows[rows.length - 1]?.metadata as { reason?: string } | undefined)?.reason ?? null;
  }

  it('gửi nhắc nhẹ khi ít bước, một lần/ngày, không tạo incident', async () => {
    await setInactivity();
    await insertTwoSamples(20);

    const first = await scheduler.runOnce(NOW);
    expect(first.skipped).toBe(false);
    expect(first.inactivity).toBe(1);
    const pending = await db.select().from(notificationOutbox);
    expect(pending).toHaveLength(2); // owner + caregiver
    expect(pending[0]).toMatchObject({
      kind: 'care_rule',
      incidentId: null,
      title: 'Nhắc vận động nhẹ',
      status: 'pending',
    });
    expect(pending[0]?.body).toContain('không phải cảnh báo khẩn');

    const sent = await notifications.processPending(20);
    expect(sent.sent).toBe(2);
    const ownerList = await owner.agent.get('/api/v1/notifications');
    expect(ownerList.body.items.some((item: { kind: string }) => item.kind === 'care_rule')).toBe(true);
    expect(await db.select().from(incidents)).toHaveLength(0);

    // Phút kế tiếp vẫn trong grace: dedupe theo ngày/người nhận, không thêm bản ghi.
    const second = await scheduler.runOnce(new Date(NOW.getTime() + 60_000));
    expect(second.skipped).toBe(false);
    const after = await db.select().from(notificationOutbox);
    expect(after).toHaveLength(2);

    // Cùng phút: job_runs chặn xử lý lần hai.
    const sameMinute = await scheduler.runOnce(NOW);
    expect(sameMinute.skipped).toBe(true);
  });

  it('không gửi khi offline, not_worn, không mẫu, đủ bước', async () => {
    await setInactivity();
    await db.update(devices).set({ lastSeenAt: new Date(NOW.getTime() - 3600_000) }).where(eq(devices.id, deviceId));
    await scheduler.runOnce(NOW);
    expect(await db.select().from(notificationOutbox)).toHaveLength(0);
    expect(await lastSkipReason()).toBe('offline');

    await db.delete(auditLogs);
    await db
      .update(devices)
      .set({ lastSeenAt: new Date(NOW.getTime() + 60_000) })
      .where(eq(devices.id, deviceId));
    await insertSample('2026-11-20T10:00:00.000Z', 20, { heart_rate: 'not_worn', motion: 'valid' });
    await scheduler.runOnce(new Date(NOW.getTime() + 60_000));
    expect(await db.select().from(notificationOutbox)).toHaveLength(0);
    expect(await lastSkipReason()).toBe('not_worn');

    await db.delete(auditLogs);
    await db.delete(telemetry);
    await db
      .update(devices)
      .set({ lastSeenAt: new Date(NOW.getTime() + 120_000) })
      .where(eq(devices.id, deviceId));
    await scheduler.runOnce(new Date(NOW.getTime() + 120_000));
    expect(await db.select().from(notificationOutbox)).toHaveLength(0);
    expect(await lastSkipReason()).toBe('no_data');

    await db.delete(auditLogs);
    await insertTwoSamples(200);
    await db
      .update(devices)
      .set({ lastSeenAt: new Date(NOW.getTime() + 180_000) })
      .where(eq(devices.id, deviceId));
    await scheduler.runOnce(new Date(NOW.getTime() + 180_000));
    expect(await db.select().from(notificationOutbox)).toHaveLength(0);
    expect(await lastSkipReason()).toBe('enough_steps');
  });

  it('gửi bản tin cuối ngày bằng template, không có AI/incident', async () => {
    await setDigest();
    await insertTwoSamples(120);
    const result = await scheduler.runOnce(DIGEST_NOW);
    expect(result.digests).toBe(1);
    const rows = await db.select().from(notificationOutbox);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      kind: 'care_digest',
      title: 'Bản tin chăm sóc cuối ngày',
    });
    expect(rows[0]?.body).toContain('Bản tin chăm sóc ngày 20/11/2026.');
    expect(rows[0]?.body).toContain('Bước chân:');
    expect(rows[0]?.body).toContain('Cảnh báo đang mở: 0.');
    expect(await db.select().from(incidents)).toHaveLength(0);

    await scheduler.runOnce(new Date(DIGEST_NOW.getTime() + 60_000));
    expect(await db.select().from(notificationOutbox)).toHaveLength(2);
  });

  it('thu hồi quyền giữa lúc chờ → caregiver bị superseded', async () => {
    await setInactivity();
    await insertTwoSamples(20);
    await scheduler.runOnce(NOW);
    await db
      .update(careLinks)
      .set({ permissions: { ...PERMISSIONS, canViewMeasurements: false } })
      .where(and(eq(careLinks.subjectId, subjectId), eq(careLinks.caregiverUserId, caregiver.session.user.id)));
    await notifications.processPending(20);
    const rows = await db
      .select({ recipient: notificationOutbox.recipientUserId, status: notificationOutbox.status })
      .from(notificationOutbox);
    expect(rows.find((row) => row.recipient === owner.session.user.id)?.status).toBe('sent');
    expect(rows.find((row) => row.recipient === caregiver.session.user.id)?.status).toBe('superseded');
  });
});
