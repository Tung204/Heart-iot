/**
 * Kiểm thử outbox worker + API thông báo trong ứng dụng.
 * Yêu cầu: FR-06/07, NFR-01/06; finding R-01 (kiểm quyền lại trước khi gửi,
 * incident terminal làm cảnh báo cũ thành superseded).
 */
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import type { IncidentEnvelope } from '@annhien/contracts/telemetry';
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
import { createModuleTestApp, registerUser, type TestContext, type TestUser } from './test-app';

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
});
