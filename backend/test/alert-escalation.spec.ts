import { and, eq } from 'drizzle-orm';
import { DEFAULT_CARE_PERMISSIONS } from '@heart-iot/contracts';
import { AlertPolicyModule } from '../src/alert-policy/alert-policy.module';
import {
  AlertEscalationScheduler,
  escalationLevelAt,
} from '../src/alert-policy/alert-escalation.scheduler';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { NotificationService } from '../src/notifications/notifications.service';
import { DB, type AppDb } from '../src/database/database';
import { ENV, type AppEnv } from '../src/config/env';
import {
  auditLogs,
  careLinks,
  deviceAssignments,
  devices,
  incidents,
  jobRuns,
  notificationOutbox,
  notificationPreferences,
  pushSubscriptions,
  subjectRules,
  subjects,
  users,
} from '../src/database/schema';
import {
  createModuleTestApp,
  registerUser,
  type TestContext,
  type TestUser,
} from './test-app';

const PERMISSIONS = { ...DEFAULT_CARE_PERMISSIONS, canViewMeasurements: true };
const BASE = new Date('2026-11-21T10:00:00.000Z');

describe('Leo thang cảnh báo trong ứng dụng (V10a)', () => {
  let ctx: TestContext;
  let db: AppDb;
  let scheduler: AlertEscalationScheduler;
  let notifications: NotificationService;
  let owner: TestUser;
  let caregiver: TestUser;
  let subjectId: string;
  let deviceId: string;
  let assignmentId: string;

  beforeAll(async () => {
    ctx = await createModuleTestApp([AlertPolicyModule, NotificationsModule]);
    db = ctx.app.get<AppDb>(DB);
    scheduler = ctx.app.get(AlertEscalationScheduler);
    notifications = ctx.app.get(NotificationService);
    owner = await registerUser(ctx.app, { displayName: 'Chủ leo thang' });
    caregiver = await registerUser(ctx.app, { displayName: 'Người thân leo thang' });
    const subjectRows = await db
      .insert(subjects)
      .values({
        ownerUserId: owner.session.user.id,
        displayName: 'Bà leo thang',
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
      acceptedAt: BASE,
    });
    const deviceRows = await db
      .insert(devices)
      .values({
        serial: `ALERT-${crypto.randomUUID().slice(0, 8)}`,
        label: 'Thiết bị leo thang',
        credentialHash: 'hash',
        status: 'active',
        lastSeenAt: BASE,
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
    await db.delete(auditLogs);
    await db.delete(jobRuns);
    await db.delete(incidents);
    await db.delete(subjectRules);
    await db.update(users).set({ status: 'active' });
    await db
      .update(careLinks)
      .set({ permissions: PERMISSIONS, status: 'active', revokedAt: null })
      .where(
        and(eq(careLinks.subjectId, subjectId), eq(careLinks.caregiverUserId, caregiver.session.user.id)),
      );
  });

  const policyUrl = () => `/api/v1/subjects/${subjectId}/alert-policy`;

  async function enablePolicy(steps: number[] = [10, 20, 30]) {
    const response = await owner.agent.put(policyUrl()).send({
      enabled: true,
      steps: steps.map((afterMinutes) => ({ afterMinutes })),
    });
    expect(response.status).toBe(200);
    return response.body as { version: number };
  }

  async function insertIncident(
    detectedAt: Date,
    state: 'open' | 'acknowledged' | 'suspected' = 'open',
  ): Promise<string> {
    const rows = await db
      .insert(incidents)
      .values({
        subjectId,
        assignmentId,
        deviceId,
        deviceIncidentId: crypto.randomUUID(),
        type: 'fall',
        state,
        lastRevision: 1,
        detectedAt,
        lastEventAt: detectedAt,
      })
      .returning({ id: incidents.id });
    return rows[0]!.id;
  }

  async function escalationRows() {
    return db
      .select({
        id: notificationOutbox.id,
        recipientUserId: notificationOutbox.recipientUserId,
        dedupeKey: notificationOutbox.dedupeKey,
        title: notificationOutbox.title,
        revision: notificationOutbox.revision,
      })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.kind, 'escalation'))
      .orderBy(notificationOutbox.createdAt);
  }

  it('chỉ gửi sau mốc, mỗi bậc một lần cho chủ hồ sơ + người thân', async () => {
    await enablePolicy([10, 20, 30]);
    const incidentId = await insertIncident(BASE);

    const early = await scheduler.runOnce(new Date('2026-11-21T10:09:00.000Z'));
    expect(early.notifications).toBe(0);
    expect(await escalationRows()).toHaveLength(0);

    const first = await scheduler.runOnce(new Date('2026-11-21T10:10:00.000Z'));
    expect(first).toMatchObject({ policies: 1, incidents: 1, notifications: 2, skippedIncidents: 0 });
    const levelOne = await escalationRows();
    expect(levelOne).toHaveLength(2);
    expect(new Set(levelOne.map((row) => row.recipientUserId))).toEqual(
      new Set([owner.session.user.id, caregiver.session.user.id]),
    );
    expect(levelOne[0]).toMatchObject({ revision: 1 });
    expect(levelOne[0]?.title).toContain('nhắc lần 1');
    expect(levelOne.every((row) => row.dedupeKey.includes(`${incidentId}:escalation:1:`))).toBe(true);

    const duplicate = await scheduler.runOnce(new Date('2026-11-21T10:11:00.000Z'));
    expect(duplicate.notifications).toBe(0);
    expect(duplicate.skippedIncidents).toBe(1);
    expect(await escalationRows()).toHaveLength(2);

    const second = await scheduler.runOnce(new Date('2026-11-21T10:20:00.000Z'));
    expect(second.notifications).toBe(2);
    const all = await escalationRows();
    expect(all).toHaveLength(4);
    expect(all.filter((row) => row.title?.includes('nhắc lần 2'))).toHaveLength(2);

    const ack = await db
      .update(incidents)
      .set({ state: 'acknowledged', version: 2 })
      .where(eq(incidents.id, incidentId))
      .returning({ id: incidents.id });
    expect(ack).toHaveLength(1);
    const afterAck = await scheduler.runOnce(new Date('2026-11-21T10:30:00.000Z'));
    expect(afterAck.notifications).toBe(0);
    expect(afterAck.incidents).toBe(0);
    expect(await escalationRows()).toHaveLength(4);
  });

  it('chỉ leo thang incident open; suspected/acknowledged không gửi', async () => {
    await enablePolicy([10]);
    await insertIncident(BASE, 'suspected');
    await insertIncident(BASE, 'acknowledged');

    const result = await scheduler.runOnce(new Date('2026-11-21T10:30:00.000Z'));
    expect(result).toMatchObject({ policies: 1, incidents: 0, notifications: 0 });
    expect(await escalationRows()).toHaveLength(0);
  });

  it('chọn bậc cao nhất khi scheduler bỏ lỡ các mốc trước', async () => {
    await enablePolicy([10, 20, 30]);
    await insertIncident(BASE);

    const result = await scheduler.runOnce(new Date('2026-11-21T10:35:00.000Z'));
    expect(result.notifications).toBe(2);
    const rows = await escalationRows();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.title?.includes('nhắc lần 3'))).toBe(true);
    expect(rows.every((row) => row.dedupeKey.includes(':escalation:3:'))).toBe(true);
  });

  it('không có người nhận: không gửi và chỉ audit một lần cho mỗi bậc', async () => {
    await enablePolicy([10]);
    await insertIncident(BASE);
    await db.update(users).set({ status: 'disabled' }).where(eq(users.id, owner.session.user.id));
    await db
      .update(careLinks)
      .set({ permissions: { ...PERMISSIONS, canReceiveAlerts: false } })
      .where(eq(careLinks.subjectId, subjectId));

    const first = await scheduler.runOnce(new Date('2026-11-21T10:10:00.000Z'));
    expect(first.notifications).toBe(0);
    expect(await escalationRows()).toHaveLength(0);
    const audits = await db
      .select({ id: auditLogs.id, metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(eq(auditLogs.action, 'alert_escalation.skipped'));
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).toMatchObject({ level: 1, reason: 'no_recipient' });

    await scheduler.runOnce(new Date('2026-11-21T10:11:00.000Z'));
    const again = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.action, 'alert_escalation.skipped'));
    expect(again).toHaveLength(1);
  });

  it('bỏ qua người thân đã tắt canReceiveAlerts', async () => {
    await enablePolicy([10]);
    await insertIncident(BASE);
    await db
      .update(careLinks)
      .set({ permissions: { ...PERMISSIONS, canReceiveAlerts: false } })
      .where(eq(careLinks.subjectId, subjectId));

    const result = await scheduler.runOnce(new Date('2026-11-21T10:10:00.000Z'));
    expect(result.notifications).toBe(1);
    const rows = await escalationRows();
    expect(rows.map((row) => row.recipientUserId)).toEqual([owner.session.user.id]);
  });

  it('worker không gửi escalation đang chờ nếu incident đã được xác nhận', async () => {
    await enablePolicy([10]);
    const incidentId = await insertIncident(BASE);
    await scheduler.runOnce(new Date('2026-11-21T10:10:00.000Z'));
    expect(await escalationRows()).toHaveLength(2);

    await db.update(incidents).set({ state: 'acknowledged' }).where(eq(incidents.id, incidentId));
    const processed = await notifications.processPending();
    expect(processed.superseded).toBe(2);
    const rows = await db
      .select({ status: notificationOutbox.status })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.kind, 'escalation'));
    expect(rows.every((row) => row.status === 'superseded')).toBe(true);
  });

  it('tắt chính sách đánh dấu superseded các nhắc leo thang đang chờ', async () => {
    await enablePolicy([10]);
    await insertIncident(BASE);
    await scheduler.runOnce(new Date('2026-11-21T10:10:00.000Z'));
    expect(await escalationRows()).toHaveLength(2);

    const response = await owner.agent.put(policyUrl()).send({
      enabled: false,
      steps: [{ afterMinutes: 10 }],
    });
    expect(response.status).toBe(200);
    const rows = await db
      .select({ status: notificationOutbox.status, supersededAt: notificationOutbox.supersededAt })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.kind, 'escalation'));
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === 'superseded' && row.supersededAt !== null)).toBe(true);
  });

  it('chính sách tắt không tạo thông báo', async () => {
    const response = await owner.agent.put(policyUrl()).send({
      enabled: false,
      steps: [{ afterMinutes: 10 }],
    });
    expect(response.status).toBe(200);
    await insertIncident(BASE);

    const result = await scheduler.runOnce(new Date('2026-11-21T11:00:00.000Z'));
    expect(result).toMatchObject({ policies: 0, incidents: 0, notifications: 0 });
    expect(await escalationRows()).toHaveLength(0);
  });

  it('người nhận bật Web Push + có subscription nhận thêm outbox web_push cho từng bậc', async () => {
    await db.insert(notificationPreferences).values({
      userId: owner.session.user.id,
      webPushEnabled: true,
    });
    await db.insert(pushSubscriptions).values({
      userId: owner.session.user.id,
      endpoint: `https://push.example.test/send/${crypto.randomUUID()}`,
      p256dh: 'BL7ELU24fJTAlH5Kyl8N6BDCac8u9li_U5PIwG963MOvdYs9s7LSzj8x_7v7RFdLZ9Eap50PiiyF5K0TDAis7t0',
      auth: 'juarI8x__VnHvsOgfeAPHg',
    });
    const env = ctx.app.get<AppEnv>(ENV);
    (env as { WEB_PUSH_ENABLED: boolean }).WEB_PUSH_ENABLED = true;
    try {
      await enablePolicy([10]);
      const incidentId = await insertIncident(BASE);
      const result = await scheduler.runOnce(new Date('2026-11-21T10:10:00.000Z'));
      expect(result).toMatchObject({ policies: 1, incidents: 1, notifications: 3 });
      const rows = await db
        .select({
          recipientUserId: notificationOutbox.recipientUserId,
          channel: notificationOutbox.channel,
          dedupeKey: notificationOutbox.dedupeKey,
        })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.incidentId, incidentId));
      expect(rows.filter((row) => row.channel === 'web_push')).toEqual([
        expect.objectContaining({
          recipientUserId: owner.session.user.id,
          dedupeKey: `${incidentId}:escalation:1:${owner.session.user.id}:web_push`,
        }),
      ]);
      expect(rows.filter((row) => row.channel === 'in_app')).toHaveLength(2);
    } finally {
      (env as { WEB_PUSH_ENABLED: boolean }).WEB_PUSH_ENABLED = false;
    }
  });

  it('tính bậc theo phút, không phụ thuộc giây lẻ', () => {
    const steps = [{ afterMinutes: 10 }, { afterMinutes: 20 }, { afterMinutes: 30 }];
    expect(escalationLevelAt(BASE, new Date('2026-11-21T10:09:59.999Z'), steps)).toBe(0);
    expect(escalationLevelAt(BASE, new Date('2026-11-21T10:10:00.000Z'), steps)).toBe(1);
    expect(escalationLevelAt(BASE, new Date('2026-11-21T10:29:59.999Z'), steps)).toBe(2);
    expect(escalationLevelAt(BASE, new Date('2026-11-21T10:30:00.000Z'), steps)).toBe(3);
  });
});
