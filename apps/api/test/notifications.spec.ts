/**
 * Kiểm thử outbox worker + API thông báo trong ứng dụng.
 * Yêu cầu: FR-06/07, NFR-01/06; finding R-01 (kiểm quyền lại trước khi gửi,
 * incident terminal làm cảnh báo cũ thành superseded).
 */
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import type { IncidentEnvelope } from '@annhien/contracts/telemetry';
import { AccessService } from '../src/access/access.service';
import { DB, type AppDb } from '../src/database/database';
import {
  careLinks,
  deviceAssignments,
  devices,
  incidents,
  notificationOutbox,
  realtimeEvents,
  subjects,
} from '../src/database/schema';
import { sha256 } from '../src/auth/password';
import { DeviceAuthModule } from '../src/devices/device-auth.module';
import { IncidentsModule } from '../src/incidents/incidents.module';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { NotificationService } from '../src/notifications/notifications.service';
import { RealtimeModule } from '../src/realtime/realtime.module';
import {
  createAdmin,
  createModuleTestApp,
  registerUser,
  type TestContext,
  type TestUser,
} from './test-app';

const DAY_MS = 24 * 60 * 60 * 1000;

const PERMISSIONS = {
  historyDays: 30,
  canReceiveAlerts: true,
  canAcknowledge: true,
  canResolve: false,
  canViewAi: false,
};

let sequenceCounter = 0;
let fixtureCounter = 0;

type NotificationFixture = {
  owner: TestUser;
  ownerId: string;
  caregiver: TestUser;
  caregiverId: string;
  subjectId: string;
  deviceId: string;
  deviceKey: string;
};

async function createNotificationFixture(ctx: TestContext): Promise<NotificationFixture> {
  const db = ctx.app.get<AppDb>(DB);
  fixtureCounter += 1;
  const owner = await registerUser(ctx.app, { displayName: `Chủ hồ sơ N${fixtureCounter}` });
  const caregiver = await registerUser(ctx.app, { displayName: `Người thân N${fixtureCounter}` });

  const subjectRow = (
    await db
      .insert(subjects)
      .values({ ownerUserId: owner.session.user.id, displayName: `Hồ sơ thông báo ${fixtureCounter}` })
      .returning()
  )[0]!;
  await db.insert(careLinks).values({
    subjectId: subjectRow.id,
    caregiverUserId: caregiver.session.user.id,
    invitedByUserId: owner.session.user.id,
    permissions: PERMISSIONS,
    status: 'active',
    acceptedAt: new Date(),
  });

  const deviceKey = `device-key-notif-${fixtureCounter}-1234567890`;
  const deviceRow = (
    await db
      .insert(devices)
      .values({
        serial: `DEV-N-${fixtureCounter}-${crypto.randomUUID().slice(0, 8)}`,
        label: 'Thiết bị thông báo demo',
        credentialHash: sha256(deviceKey),
        status: 'active',
      })
      .returning()
  )[0]!;
  await db.insert(deviceAssignments).values({
    deviceId: deviceRow.id,
    subjectId: subjectRow.id,
    assignedByUserId: owner.session.user.id,
  });

  return {
    owner,
    ownerId: owner.session.user.id,
    caregiver,
    caregiverId: caregiver.session.user.id,
    subjectId: subjectRow.id,
    deviceId: deviceRow.id,
    deviceKey,
  };
}

function makeEnvelope(fx: NotificationFixture, overrides: Partial<IncidentEnvelope> = {}): IncidentEnvelope {
  sequenceCounter += 1;
  return {
    schema_version: '1.0',
    message_id: `msg-${crypto.randomUUID()}`,
    device_id: fx.deviceId,
    boot_id: 'boot-notif-1',
    sequence: sequenceCounter,
    measured_at: new Date().toISOString(),
    clock_status: 'synced',
    uptime_ms: 5000,
    firmware_version: '0.1.0-demo',
    incident_id: `incident-notif-${fixtureCounter}`,
    event_revision: 1,
    event_type: 'fall.candidate',
    incident_type: 'fall',
    evidence: {
      algorithm_version: 'demo-1',
      wear_location: 'wrist',
      motion_quality: 'valid',
      heart_rate_quality: 'valid',
      heart_rate_bpm: null,
    },
    ...overrides,
  };
}

async function postEvent(
  ctx: TestContext,
  fx: NotificationFixture,
  envelope: IncidentEnvelope,
): Promise<request.Response> {
  return request(ctx.app.getHttpServer())
    .post('/api/v1/ingest/events')
    .set('x-device-id', fx.deviceId)
    .set('x-device-key', fx.deviceKey)
    .send(envelope);
}

async function openIncident(ctx: TestContext, fx: NotificationFixture, localId: string): Promise<string> {
  const candidate = await postEvent(
    ctx,
    fx,
    makeEnvelope(fx, { incident_id: localId, event_type: 'fall.candidate', event_revision: 1 }),
  );
  expect(candidate.body.status).toBe('accepted');
  const confirmed = await postEvent(
    ctx,
    fx,
    makeEnvelope(fx, { incident_id: localId, event_type: 'fall.confirmed', event_revision: 2 }),
  );
  expect(confirmed.body.status).toBe('accepted');
  return confirmed.body.incidentId as string;
}

async function incidentDetectedAt(db: AppDb, incidentId: string): Promise<Date> {
  const rows = await db.select({ detectedAt: incidents.detectedAt }).from(incidents).where(eq(incidents.id, incidentId));
  return rows[0]!.detectedAt;
}

async function revokeCaregiverLink(db: AppDb, fx: NotificationFixture): Promise<void> {
  await db
    .update(careLinks)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(and(eq(careLinks.subjectId, fx.subjectId), eq(careLinks.caregiverUserId, fx.caregiverId)));
}

async function addCaregiverLink(
  db: AppDb,
  fx: NotificationFixture,
  overrides: { sharedFrom?: Date; permissions?: typeof PERMISSIONS } = {},
): Promise<void> {
  await db.insert(careLinks).values({
    subjectId: fx.subjectId,
    caregiverUserId: fx.caregiverId,
    invitedByUserId: fx.ownerId,
    permissions: overrides.permissions ?? PERMISSIONS,
    status: 'active',
    sharedFrom: overrides.sharedFrom ?? new Date(),
    acceptedAt: new Date(),
  });
}

async function sentNotificationId(
  db: AppDb,
  incidentId: string,
  recipientUserId: string,
): Promise<string> {
  const rows = await db
    .select({ id: notificationOutbox.id })
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.incidentId, incidentId),
        eq(notificationOutbox.recipientUserId, recipientUserId),
        eq(notificationOutbox.status, 'sent'),
      ),
    );
  expect(rows).toHaveLength(1);
  return rows[0]!.id;
}

describe('Notifications: outbox worker + API trong ứng dụng (R-01, NFR-06)', () => {
  let ctx: TestContext;
  let db: AppDb;
  let service: NotificationService;

  beforeAll(async () => {
    ctx = await createModuleTestApp([IncidentsModule, NotificationsModule, RealtimeModule, DeviceAuthModule]);
    db = ctx.app.get<AppDb>(DB);
    service = ctx.app.get(NotificationService);
  });

  afterAll(async () => {
    await ctx.close();
  });

  // Outbox là state toàn cục; worker xử lý mọi hàng pending nên phải dọn trước
  // mỗi test để test retry/backoff không kéo hàng của test khác vào kết quả.
  beforeEach(async () => {
    await db.delete(notificationOutbox);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('N1: worker gửi thành công ghi sentAt + realtime; recipient mất quyền → superseded, không sent (R-01)', async () => {
    const fx = await createNotificationFixture(ctx);
    const incidentId = await openIncident(ctx, fx, 'incident-n1');

    // Thu hồi link của caregiver trước khi worker chạy.
    await db
      .update(careLinks)
      .set({ status: 'revoked', revokedAt: new Date() })
      .where(and(eq(careLinks.subjectId, fx.subjectId), eq(careLinks.caregiverUserId, fx.caregiverId)));

    const result = await service.processPending(20);
    expect(result.processed).toBe(2);
    expect(result.sent).toBe(1);
    expect(result.superseded).toBe(1);

    const rows = await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.incidentId, incidentId));
    const ownerRow = rows.find((row) => row.recipientUserId === fx.ownerId);
    const caregiverRow = rows.find((row) => row.recipientUserId === fx.caregiverId);
    expect(ownerRow!.status).toBe('sent');
    expect(ownerRow!.sentAt).not.toBeNull();
    expect(caregiverRow!.status).toBe('superseded');
    expect(caregiverRow!.sentAt).toBeNull();
    expect(caregiverRow!.supersededAt).not.toBeNull();

    const realtimeRows = await db
      .select()
      .from(realtimeEvents)
      .where(and(eq(realtimeEvents.subjectId, fx.subjectId), eq(realtimeEvents.type, 'notification.sent')));
    expect(realtimeRows).toHaveLength(1);
    expect(realtimeRows[0]!.payload).toMatchObject({ incidentId });
  });

  it('N2: incident terminal làm pending alert chưa gửi thành superseded (R-01)', async () => {
    const fx = await createNotificationFixture(ctx);
    const incidentId = await openIncident(ctx, fx, 'incident-n2');

    // Mô phỏng incident bị đóng bởi một tiến trình khác trước khi worker gửi.
    await db
      .update(incidents)
      .set({ state: 'resolved', resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(incidents.id, incidentId));

    const result = await service.processPending(20);
    expect(result.sent).toBe(0);
    expect(result.superseded).toBe(2);

    const rows = await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.incidentId, incidentId));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe('superseded');
      expect(row.sentAt).toBeNull();
    }
  });

  it('N3: danh sách thông báo chỉ chứa của mình; mark read giảm unreadCount; người khác đọc bị 404 (NFR-01)', async () => {
    const fx = await createNotificationFixture(ctx);
    const incidentId = await openIncident(ctx, fx, 'incident-n3');

    await service.processPending(20);
    // Cả owner lẫn caregiver đều có bản alert sent.
    const ownerRows = await db
      .select()
      .from(notificationOutbox)
      .where(and(eq(notificationOutbox.incidentId, incidentId), eq(notificationOutbox.status, 'sent')));
    expect(ownerRows).toHaveLength(2);

    const ownerList = await fx.owner.agent.get('/api/v1/notifications');
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.items).toHaveLength(1);
    expect(ownerList.body.unreadCount).toBe(1);
    expect(ownerList.body.items[0]).toMatchObject({
      subjectName: expect.any(String),
      kind: 'alert',
      state: 'open',
    });

    const caregiverList = await fx.caregiver.agent.get('/api/v1/notifications');
    expect(caregiverList.body.items).toHaveLength(1);
    expect(caregiverList.body.items[0].id).not.toBe(ownerList.body.items[0].id);
    expect(caregiverList.body.unreadCount).toBe(1);

    const notificationId = ownerList.body.items[0].id as string;
    const read = await fx.owner.agent.post(`/api/v1/notifications/${notificationId}/read`);
    expect(read.status).toBe(204);

    const afterRead = await fx.owner.agent.get('/api/v1/notifications');
    expect(afterRead.body.unreadCount).toBe(0);
    expect(afterRead.body.items[0].readAt).not.toBeNull();

    // Caregiver không đọc được thông báo của người khác.
    const foreignRead = await fx.caregiver.agent.post(`/api/v1/notifications/${notificationId}/read`);
    expect(foreignRead.status).toBe(404);

    // Thông báo không tồn tại → 404.
    const missing = await fx.owner.agent.post(`/api/v1/notifications/${crypto.randomUUID()}/read`);
    expect(missing.status).toBe(404);
  });

  it('N4: caregiver accept lại sau incident chỉ thấy thông báo trong cửa sổ chia sẻ mới; owner vẫn thấy (NFR-01)', async () => {
    const fx = await createNotificationFixture(ctx);
    const incidentId = await openIncident(ctx, fx, 'incident-n4a');
    await service.processPending(20);

    const caregiverNotificationId = await sentNotificationId(db, incidentId, fx.caregiverId);
    const ownerNotificationId = await sentNotificationId(db, incidentId, fx.ownerId);

    // Thu hồi link cũ rồi accept lại sau khi incident đã xảy ra → sharedFrom mới muộn hơn incident.
    await revokeCaregiverLink(db, fx);
    await addCaregiverLink(db, fx, { sharedFrom: new Date() });

    const caregiverList = await fx.caregiver.agent.get('/api/v1/notifications');
    expect(caregiverList.status).toBe(200);
    expect(caregiverList.body.items).toHaveLength(0);
    expect(caregiverList.body.unreadCount).toBe(0);

    const caregiverRead = await fx.caregiver.agent.post(
      `/api/v1/notifications/${caregiverNotificationId}/read`,
    );
    expect(caregiverRead.status).toBe(404);

    // Chủ hồ sơ không bị giới hạn bởi cửa sổ chia sẻ của người thân.
    const ownerList = await fx.owner.agent.get('/api/v1/notifications');
    expect(ownerList.body.items.map((item: { id: string }) => item.id)).toEqual([ownerNotificationId]);
    expect(ownerList.body.unreadCount).toBe(1);
  });

  it('N5: thu hồi care link → list rỗng, unread 0, markRead 404 (NFR-01)', async () => {
    const fx = await createNotificationFixture(ctx);
    const incidentId = await openIncident(ctx, fx, 'incident-n5');
    await service.processPending(20);
    const caregiverNotificationId = await sentNotificationId(db, incidentId, fx.caregiverId);

    await revokeCaregiverLink(db, fx);

    const list = await fx.caregiver.agent.get('/api/v1/notifications');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(0);
    expect(list.body.unreadCount).toBe(0);
    const read = await fx.caregiver.agent.post(`/api/v1/notifications/${caregiverNotificationId}/read`);
    expect(read.status).toBe(404);
  });

  it('N6: markRead idempotent — đọc lại giữ nguyên readAt lần đầu, vẫn 204 (P2-4)', async () => {
    const fx = await createNotificationFixture(ctx);
    const incidentId = await openIncident(ctx, fx, 'incident-n6');
    await service.processPending(20);
    const notificationId = await sentNotificationId(db, incidentId, fx.ownerId);

    const first = await fx.owner.agent.post(`/api/v1/notifications/${notificationId}/read`);
    expect(first.status).toBe(204);
    const firstList = await fx.owner.agent.get('/api/v1/notifications');
    const firstReadAt = firstList.body.items[0].readAt as string;
    expect(firstReadAt).not.toBeNull();
    expect(firstList.body.unreadCount).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 15));
    const second = await fx.owner.agent.post(`/api/v1/notifications/${notificationId}/read`);
    expect(second.status).toBe(204);
    const secondList = await fx.owner.agent.get('/api/v1/notifications');
    expect(secondList.body.items[0].readAt).toBe(firstReadAt);
    expect(secondList.body.unreadCount).toBe(0);
  });

  it('N7: ranh giới sharedFrom — incident trước mốc chia sẻ bị ẩn và không đọc được, đúng mốc thì thấy (P2-1)', async () => {
    const fx = await createNotificationFixture(ctx);
    const incidentId = await openIncident(ctx, fx, 'incident-n7');
    await service.processPending(20);
    const detectedAt = await incidentDetectedAt(db, incidentId);
    const notificationId = await sentNotificationId(db, incidentId, fx.caregiverId);

    // Đúng mốc chia sẻ: incident detectedAt >= sharedFrom → còn thấy.
    await db
      .update(careLinks)
      .set({ sharedFrom: detectedAt })
      .where(and(eq(careLinks.subjectId, fx.subjectId), eq(careLinks.caregiverUserId, fx.caregiverId)));
    const boundary = await fx.caregiver.agent.get('/api/v1/notifications');
    expect(boundary.body.items.map((item: { id: string }) => item.id)).toEqual([notificationId]);

    // Muộn hơn 1 ms: incident nằm trước mốc chia sẻ → không trả và markRead 404.
    await db
      .update(careLinks)
      .set({ sharedFrom: new Date(detectedAt.getTime() + 1) })
      .where(and(eq(careLinks.subjectId, fx.subjectId), eq(careLinks.caregiverUserId, fx.caregiverId)));
    const hidden = await fx.caregiver.agent.get('/api/v1/notifications');
    expect(hidden.body.items).toHaveLength(0);
    expect(hidden.body.unreadCount).toBe(0);
    const read = await fx.caregiver.agent.post(`/api/v1/notifications/${notificationId}/read`);
    expect(read.status).toBe(404);
  });

  it('N8: historyDays — incident ngoài cửa sổ không thấy; unreadCount chỉ tính tập được phép (P2-1)', async () => {
    const fx = await createNotificationFixture(ctx);
    const oldIncidentId = await openIncident(ctx, fx, 'incident-n8-old');
    const recentIncidentId = await openIncident(ctx, fx, 'incident-n8-recent');
    await service.processPending(20);

    // share từ 10 ngày trước, quyền chỉ xem 1 ngày → mốc hiệu lực = now - 1 ngày.
    await db
      .update(careLinks)
      .set({ permissions: { ...PERMISSIONS, historyDays: 1 }, sharedFrom: new Date(Date.now() - 10 * DAY_MS) })
      .where(and(eq(careLinks.subjectId, fx.subjectId), eq(careLinks.caregiverUserId, fx.caregiverId)));
    await db
      .update(incidents)
      .set({ detectedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(incidents.id, oldIncidentId));

    const oldNotificationId = await sentNotificationId(db, oldIncidentId, fx.caregiverId);
    const recentNotificationId = await sentNotificationId(db, recentIncidentId, fx.caregiverId);

    const caregiverList = await fx.caregiver.agent.get('/api/v1/notifications');
    expect(caregiverList.body.items.map((item: { id: string }) => item.id)).toEqual([recentNotificationId]);
    expect(caregiverList.body.unreadCount).toBe(1);

    const oldRead = await fx.caregiver.agent.post(`/api/v1/notifications/${oldNotificationId}/read`);
    expect(oldRead.status).toBe(404);
    const recentRead = await fx.caregiver.agent.post(
      `/api/v1/notifications/${recentNotificationId}/read`,
    );
    expect(recentRead.status).toBe(204);

    // Owner không bị giới hạn bởi historyDays của người thân.
    const ownerList = await fx.owner.agent.get('/api/v1/notifications');
    expect(ownerList.body.items).toHaveLength(2);
    expect(ownerList.body.unreadCount).toBe(2);
  });

  it('N9: link còn active nhưng mất quyền receive_alerts → không thấy/không đọc được (NFR-01)', async () => {
    const fx = await createNotificationFixture(ctx);
    const incidentId = await openIncident(ctx, fx, 'incident-n9');
    await service.processPending(20);
    const notificationId = await sentNotificationId(db, incidentId, fx.caregiverId);

    await db
      .update(careLinks)
      .set({ permissions: { ...PERMISSIONS, canReceiveAlerts: false } })
      .where(and(eq(careLinks.subjectId, fx.subjectId), eq(careLinks.caregiverUserId, fx.caregiverId)));

    const list = await fx.caregiver.agent.get('/api/v1/notifications');
    expect(list.body.items).toHaveLength(0);
    expect(list.body.unreadCount).toBe(0);
    const read = await fx.caregiver.agent.post(`/api/v1/notifications/${notificationId}/read`);
    expect(read.status).toBe(404);

    const ownerList = await fx.owner.agent.get('/api/v1/notifications');
    expect(ownerList.body.items).toHaveLength(1);
  });

  it('N10: admin không có link với hồ sơ → không thấy thông báo và markRead 404 (NFR-01)', async () => {
    const fx = await createNotificationFixture(ctx);
    const incidentId = await openIncident(ctx, fx, 'incident-n10');
    await service.processPending(20);
    const ownerNotificationId = await sentNotificationId(db, incidentId, fx.ownerId);

    const admin = await createAdmin(ctx.app, { email: `admin-notif-${crypto.randomUUID()}@example.test` });
    // Dữ liệu cũ/lỗi có thể trỏ outbox tới admin; quyền hiện tại vẫn phải chặn.
    const adminRow = (
      await db
        .insert(notificationOutbox)
        .values({
          incidentId,
          revision: 99,
          recipientUserId: admin.session.user.id,
          channel: 'in_app',
          status: 'sent',
          sentAt: new Date(),
          dedupeKey: `${incidentId}:99:${admin.session.user.id}:in_app:alert`,
        })
        .returning({ id: notificationOutbox.id })
    )[0]!;

    const list = await admin.agent.get('/api/v1/notifications');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(0);
    expect(list.body.unreadCount).toBe(0);

    const adminOwnRead = await admin.agent.post(`/api/v1/notifications/${adminRow.id}/read`);
    expect(adminOwnRead.status).toBe(404);
    const otherRead = await admin.agent.post(`/api/v1/notifications/${ownerNotificationId}/read`);
    expect(otherRead.status).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // T-07: retry/backoff/restart và incident đóng giữa vòng retry
  // ---------------------------------------------------------------------------

  it('N11 (T-07): retry + backoff 1s/5s/30s, restart nhặt lại pending, failed sau 5 lần', async () => {
    const fx = await createNotificationFixture(ctx);
    const incidentId = await openIncident(ctx, fx, 'incident-t07-retry');
    const base = new Date();

    // Chỉ fake Date để backoff xác định; timer/socket thật cho PGlite/supertest.
    jest.useFakeTimers({
      now: base,
      doNotFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'setImmediate',
        'clearImmediate',
        'nextTick',
        'queueMicrotask',
      ],
    });
    const deliverSpy = jest
      .spyOn(
        NotificationService.prototype as unknown as {
          deliverInApp: (row: typeof notificationOutbox.$inferSelect) => Promise<void>;
        },
        'deliverInApp',
      )
      .mockRejectedValue(new Error('in_app delivery failed'));

    const rowsForIncident = () =>
      db.select().from(notificationOutbox).where(eq(notificationOutbox.incidentId, incidentId));

    try {
      const first = await service.processPending(20);
      expect(first).toMatchObject({ processed: 2, sent: 0, superseded: 0, failed: 2 });
      let rows = await rowsForIncident();
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row).toMatchObject({
          status: 'pending',
          attempts: 1,
          sentAt: null,
          lastError: 'in_app delivery failed',
        });
        expect(row.nextAttemptAt.getTime() - base.getTime()).toBe(1000);
        expect(row.lastError).not.toContain(fx.deviceKey);
        expect(row.lastError).not.toContain(fx.owner.email);
        expect(row.lastError).not.toMatch(/heart_rate|bpm/i);
      }

      // "Restart" worker: instance mới trên cùng DB nhặt lại hàng pending đúng hạn.
      jest.setSystemTime(new Date(base.getTime() + 1000));
      const restarted = new NotificationService(db, ctx.app.get(AccessService));
      const second = await restarted.processPending(20);
      expect(second).toMatchObject({ processed: 2, sent: 0, superseded: 0, failed: 2 });
      rows = await rowsForIncident();
      for (const row of rows) {
        expect(row.attempts).toBe(2);
        expect(row.nextAttemptAt.getTime() - (base.getTime() + 1000)).toBe(5000);
      }

      jest.setSystemTime(new Date(base.getTime() + 6000));
      const third = await service.processPending(20);
      expect(third.failed).toBe(2);
      rows = await rowsForIncident();
      for (const row of rows) {
        expect(row.attempts).toBe(3);
        expect(row.nextAttemptAt.getTime() - (base.getTime() + 6000)).toBe(30000);
      }

      jest.setSystemTime(new Date(base.getTime() + 36_000));
      const fourth = await service.processPending(20);
      expect(fourth.failed).toBe(2);
      rows = await rowsForIncident();
      for (const row of rows) {
        expect(row.attempts).toBe(4);
        expect(row.nextAttemptAt.getTime() - (base.getTime() + 36_000)).toBe(30000);
      }

      jest.setSystemTime(new Date(base.getTime() + 66_000));
      const fifth = await service.processPending(20);
      expect(fifth).toMatchObject({ processed: 2, sent: 0, superseded: 0, failed: 2 });
      rows = await rowsForIncident();
      for (const row of rows) {
        expect(row).toMatchObject({
          status: 'failed',
          attempts: 5,
          sentAt: null,
          lastError: 'in_app delivery failed',
        });
      }

      // Đã failed thì không bị nhặt/gửi lại nữa, kể cả sau restart.
      jest.setSystemTime(new Date(base.getTime() + 24 * 60 * 60 * 1000));
      const afterFailed = await new NotificationService(db, ctx.app.get(AccessService)).processPending(20);
      expect(afterFailed.processed).toBe(0);
    } finally {
      deliverSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it('N12 (T-07): incident đóng giữa retry → alert pending thành superseded, không gửi', async () => {
    const fx = await createNotificationFixture(ctx);
    const incidentId = await openIncident(ctx, fx, 'incident-t07-close');
    const base = new Date();

    jest.useFakeTimers({
      now: base,
      doNotFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'setImmediate',
        'clearImmediate',
        'nextTick',
        'queueMicrotask',
      ],
    });
    const deliverSpy = jest
      .spyOn(
        NotificationService.prototype as unknown as {
          deliverInApp: (row: typeof notificationOutbox.$inferSelect) => Promise<void>;
        },
        'deliverInApp',
      )
      .mockRejectedValue(new Error('in_app delivery failed'));

    try {
      const first = await service.processPending(20);
      expect(first).toMatchObject({ processed: 2, sent: 0, failed: 2 });

      // Đóng incident sau lần thử đầu, trước khi hàng pending tới hạn retry.
      await db
        .update(incidents)
        .set({ state: 'resolved', resolvedAt: new Date(base.getTime() + 500), updatedAt: new Date() })
        .where(eq(incidents.id, incidentId));

      jest.setSystemTime(new Date(base.getTime() + 1000));
      const second = await service.processPending(20);
      expect(second).toMatchObject({ processed: 2, sent: 0, superseded: 2, failed: 0 });

      const rows = await db
        .select()
        .from(notificationOutbox)
        .where(eq(notificationOutbox.incidentId, incidentId));
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.status).toBe('superseded');
        expect(row.sentAt).toBeNull();
        expect(row.supersededAt).not.toBeNull();
      }
    } finally {
      deliverSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it('N13 (T-07): outbox timer không chạy trong test; destroy an toàn', () => {
    const idle = new NotificationService(db, ctx.app.get(AccessService));
    idle.onModuleInit();
    expect((idle as unknown as { timer: NodeJS.Timeout | null }).timer).toBeNull();
    idle.onModuleDestroy();
    expect((idle as unknown as { timer: NodeJS.Timeout | null }).timer).toBeNull();
  });

});
