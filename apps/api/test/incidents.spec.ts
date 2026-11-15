/**
 * Kiểm thử state machine incident + outbox + REST.
 * Fixture tạo trực tiếp bằng DB (không phụ thuộc module be-core/be-data).
 * Yêu cầu: FR-06, FR-07, FR-09, NFR-01, NFR-02; findings R-01, R-02.
 */
import request from 'supertest';
import { and, eq, inArray } from 'drizzle-orm';
import type { IncidentEnvelope } from '@annhien/contracts/telemetry';
import { DB, type AppDb } from '../src/database/database';
import {
  alertActions,
  auditLogs,
  careLinks,
  deviceAssignments,
  devices,
  incidentEvents,
  incidents,
  notificationOutbox,
  realtimeEvents,
  subjects,
} from '../src/database/schema';
import { sha256 } from '../src/auth/password';
import { loadEnv, resetEnvCacheForTests } from '../src/config/env';
import { DeviceAuthModule } from '../src/devices/device-auth.module';
import { IncidentsModule } from '../src/incidents/incidents.module';
import { IncidentsService } from '../src/incidents/incidents.service';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { RealtimeModule } from '../src/realtime/realtime.module';
import {
  createAdmin,
  createModuleTestApp,
  registerUser,
  type TestContext,
  type TestUser,
} from './test-app';

type CarePermissions = {
  historyDays: number;
  canReceiveAlerts: boolean;
  canAcknowledge: boolean;
  canResolve: boolean;
  canViewAi: boolean;
};

const FULL_PERMISSIONS: CarePermissions = {
  historyDays: 30,
  canReceiveAlerts: true,
  canAcknowledge: true,
  canResolve: false,
  canViewAi: false,
};

const NO_ALERT_PERMISSIONS: CarePermissions = {
  historyDays: 30,
  canReceiveAlerts: false,
  canAcknowledge: false,
  canResolve: false,
  canViewAi: false,
};

type AlertFixture = {
  owner: TestUser;
  ownerId: string;
  caregiver: TestUser;
  caregiverId: string;
  limited: TestUser;
  limitedId: string;
  outsider: TestUser;
  subjectId: string;
  deviceId: string;
  deviceKey: string;
};

let sequenceCounter = 0;
let fixtureCounter = 0;

async function createAlertFixture(ctx: TestContext): Promise<AlertFixture> {
  const db = ctx.app.get<AppDb>(DB);
  fixtureCounter += 1;
  const owner = await registerUser(ctx.app, { displayName: `Chủ hồ sơ ${fixtureCounter}` });
  const caregiver = await registerUser(ctx.app, { displayName: `Người thân ${fixtureCounter}` });
  const limited = await registerUser(ctx.app, { displayName: `Người thân hạn chế ${fixtureCounter}` });
  const outsider = await registerUser(ctx.app, { displayName: `Người ngoài ${fixtureCounter}` });

  const subjectRow = (
    await db
      .insert(subjects)
      .values({ ownerUserId: owner.session.user.id, displayName: `Người được theo dõi ${fixtureCounter}` })
      .returning()
  )[0]!;

  await db.insert(careLinks).values([
    {
      subjectId: subjectRow.id,
      caregiverUserId: caregiver.session.user.id,
      invitedByUserId: owner.session.user.id,
      permissions: FULL_PERMISSIONS,
      status: 'active',
      acceptedAt: new Date(),
    },
    {
      subjectId: subjectRow.id,
      caregiverUserId: limited.session.user.id,
      invitedByUserId: owner.session.user.id,
      permissions: NO_ALERT_PERMISSIONS,
      status: 'active',
      acceptedAt: new Date(),
    },
  ]);

  const deviceKey = `device-key-demo-${fixtureCounter}-1234567890`;
  const deviceRow = (
    await db
      .insert(devices)
      .values({
        serial: `DEV-${fixtureCounter}-${crypto.randomUUID().slice(0, 8)}`,
        label: 'Thiết bị đeo tay demo',
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
    limited,
    limitedId: limited.session.user.id,
    outsider,
    subjectId: subjectRow.id,
    deviceId: deviceRow.id,
    deviceKey,
  };
}

function makeEnvelope(fx: AlertFixture, overrides: Partial<IncidentEnvelope> = {}): IncidentEnvelope {
  sequenceCounter += 1;
  return {
    schema_version: '1.0',
    message_id: `msg-${crypto.randomUUID()}`,
    device_id: fx.deviceId,
    boot_id: 'boot-demo-1',
    sequence: sequenceCounter,
    measured_at: new Date().toISOString(),
    clock_status: 'synced',
    uptime_ms: 5000,
    firmware_version: '0.1.0-demo',
    incident_id: `incident-${fixtureCounter}-demo`,
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
  deviceId: string,
  deviceKey: string,
  envelope: IncidentEnvelope,
): Promise<request.Response> {
  return request(ctx.app.getHttpServer())
    .post('/api/v1/ingest/events')
    .set('x-device-id', deviceId)
    .set('x-device-key', deviceKey)
    .send(envelope);
}

async function openIncident(ctx: TestContext, fx: AlertFixture, localId: string) {
  const candidate = await postEvent(
    ctx,
    fx.deviceId,
    fx.deviceKey,
    makeEnvelope(fx, { incident_id: localId, event_type: 'fall.candidate', event_revision: 1 }),
  );
  expect(candidate.status).toBe(202);
  expect(candidate.body.status).toBe('accepted');
  const confirmed = await postEvent(
    ctx,
    fx.deviceId,
    fx.deviceKey,
    makeEnvelope(fx, { incident_id: localId, event_type: 'fall.confirmed', event_revision: 2 }),
  );
  expect(confirmed.status).toBe(202);
  expect(confirmed.body.status).toBe('accepted');
  return { incidentId: confirmed.body.incidentId as string };
}

/** Đẩy mốc nhận sự kiện cuối về quá khứ để mô phỏng "ứng viên quá hạn chờ kết quả cuối". */
async function backdateIncident(db: AppDb, incidentId: string, minutesAgo: number): Promise<void> {
  const at = new Date(Date.now() - minutesAgo * 60_000);
  await db
    .update(incidents)
    .set({ detectedAt: at, lastEventAt: at })
    .where(eq(incidents.id, incidentId));
}

describe('Incidents: state machine, outbox và REST (FR-06/07/09, NFR-01/02, R-01/R-02)', () => {
  let ctx: TestContext;
  let db: AppDb;

  beforeAll(async () => {
    ctx = await createModuleTestApp([IncidentsModule, NotificationsModule, RealtimeModule, DeviceAuthModule]);
    db = ctx.app.get<AppDb>(DB);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('T1: candidate tạo suspected và bị ẩn khỏi list/detail (FR-06)', async () => {
    const fx = await createAlertFixture(ctx);
    const res = await postEvent(ctx, fx.deviceId, fx.deviceKey, makeEnvelope(fx, { event_type: 'fall.candidate', event_revision: 1 }));
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'accepted', acceptedRevision: 1 });
    const incidentId = res.body.incidentId as string;
    expect(incidentId).toBeTruthy();

    const list = await fx.owner.agent.get(`/api/v1/subjects/${fx.subjectId}/alerts`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(0);

    const detail = await fx.owner.agent.get(`/api/v1/alerts/${incidentId}`);
    expect(detail.status).toBe(404);
    expect(detail.body.code).toBe('NOT_FOUND');
  });

  it('T2: confirmed mở alert; outbox có owner + caregiver đủ quyền, không có caregiver thiếu canReceiveAlerts (R-01)', async () => {
    const fx = await createAlertFixture(ctx);
    const { incidentId } = await openIncident(ctx, fx, 'incident-t2');

    const rows = await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.incidentId, incidentId));
    const byUser = new Map(rows.map((row) => [row.recipientUserId, row]));
    expect(byUser.has(fx.ownerId)).toBe(true);
    expect(byUser.has(fx.caregiverId)).toBe(true);
    expect(byUser.has(fx.limitedId)).toBe(false);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe('pending');
      expect(row.dedupeKey.endsWith(':alert')).toBe(true);
    }

    const list = await fx.caregiver.agent.get(`/api/v1/subjects/${fx.subjectId}/alerts`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ id: incidentId, state: 'open' });

    const limitedList = await fx.limited.agent.get(`/api/v1/subjects/${fx.subjectId}/alerts`);
    expect(limitedList.status).toBe(403);

    // Cùng ranh giới quyền: list và detail đều 403 khi có link nhưng thiếu quyền.
    const limitedDetail = await fx.limited.agent.get(`/api/v1/alerts/${incidentId}`);
    expect(limitedDetail.status).toBe(403);

    const outsiderList = await fx.outsider.agent.get(`/api/v1/subjects/${fx.subjectId}/alerts`);
    expect(outsiderList.status).toBe(404);

    // Người ngoài không có link: detail 404, không lộ cảnh báo có tồn tại.
    const outsiderDetail = await fx.outsider.agent.get(`/api/v1/alerts/${incidentId}`);
    expect(outsiderDetail.status).toBe(404);
  });

  it('T3: cancel trước confirmed đóng incident, không có alert; confirmed muộn không mở lại (FR-06, R-01)', async () => {
    const fx = await createAlertFixture(ctx);
    const localId = 'incident-t3';
    await postEvent(ctx, fx.deviceId, fx.deviceKey, makeEnvelope(fx, { incident_id: localId, event_type: 'fall.candidate', event_revision: 1 }));
    const cancel = await postEvent(
      ctx,
      fx.deviceId,
      fx.deviceKey,
      makeEnvelope(fx, { incident_id: localId, event_type: 'fall.cancelled', event_revision: 2 }),
    );
    expect(cancel.body.status).toBe('accepted');

    const closedList = await fx.owner.agent.get(`/api/v1/subjects/${fx.subjectId}/alerts?state=closed`);
    expect(closedList.status).toBe(200);
    expect(closedList.body.items).toHaveLength(1);
    expect(closedList.body.items[0].state).toBe('cancelled');

    const openList = await fx.owner.agent.get(`/api/v1/subjects/${fx.subjectId}/alerts`);
    expect(openList.body.items).toHaveLength(0);

    // Không có cảnh báo nào được lên lịch cho incident chưa bao giờ open.
    const outboxRows = await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.incidentId, closedList.body.items[0].id));
    expect(outboxRows).toHaveLength(0);

    const lateConfirmed = await postEvent(
      ctx,
      fx.deviceId,
      fx.deviceKey,
      makeEnvelope(fx, { incident_id: localId, event_type: 'fall.confirmed', event_revision: 3 }),
    );
    expect(lateConfirmed.body.status).toBe('accepted');

    const incidentRows = await db
      .select()
      .from(incidents)
      .where(and(eq(incidents.deviceId, fx.deviceId), eq(incidents.deviceIncidentId, localId)));
    expect(incidentRows).toHaveLength(1);
    expect(incidentRows[0]!.state).toBe('cancelled');

    const eventRows = await db
      .select()
      .from(incidentEvents)
      .where(and(eq(incidentEvents.incidentId, incidentRows[0]!.id), eq(incidentEvents.eventRevision, 3)));
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0]!.applied).toBe(false);
    expect(eventRows[0]!.conflictReason).toBe('terminal_state');
  });

  it('T4: confirmed đến trước, candidate muộn không lùi trạng thái (FR-06)', async () => {
    const fx = await createAlertFixture(ctx);
    const localId = 'incident-t4';
    const confirmed = await postEvent(
      ctx,
      fx.deviceId,
      fx.deviceKey,
      makeEnvelope(fx, { incident_id: localId, event_type: 'fall.confirmed', event_revision: 1 }),
    );
    expect(confirmed.body.status).toBe('accepted');
    const incidentId = confirmed.body.incidentId as string;

    const lateCandidate = await postEvent(
      ctx,
      fx.deviceId,
      fx.deviceKey,
      makeEnvelope(fx, { incident_id: localId, event_type: 'fall.candidate', event_revision: 2 }),
    );
    expect(lateCandidate.body.status).toBe('accepted');
    expect(lateCandidate.body.acceptedRevision).toBe(2);

    const incidentRows = await db.select().from(incidents).where(eq(incidents.id, incidentId));
    expect(incidentRows[0]!.state).toBe('open');
    expect(incidentRows[0]!.lastRevision).toBe(2);

    const eventRows = await db
      .select()
      .from(incidentEvents)
      .where(and(eq(incidentEvents.incidentId, incidentId), eq(incidentEvents.eventRevision, 2)));
    expect(eventRows[0]!.applied).toBe(false);
    expect(eventRows[0]!.conflictReason).toBe('candidate_on_existing');
  });

  it('T5: gửi lặp → duplicate, không nhân bản; revision cũ không lùi; cùng revision khác payload → rejected + audit (FR-06, NFR-02)', async () => {
    const fx = await createAlertFixture(ctx);
    const localId = 'incident-t5';
    const first = makeEnvelope(fx, { incident_id: localId, event_type: 'fall.candidate', event_revision: 1 });
    const res1 = await postEvent(ctx, fx.deviceId, fx.deviceKey, first);
    expect(res1.body.status).toBe('accepted');

    // Gửi lại đúng bản tin cũ.
    const resend = await postEvent(ctx, fx.deviceId, fx.deviceKey, first);
    expect(resend.status).toBe(202);
    expect(resend.body.status).toBe('duplicate');
    expect(resend.body.acceptedRevision).toBe(1);

    // Cùng message_id nhưng nội dung khác → CONFLICT, không được nuốt thành duplicate.
    const conflict = await postEvent(ctx, fx.deviceId, fx.deviceKey, {
      ...first,
      event_type: 'sos.confirmed',
      incident_type: 'sos',
    });
    expect(conflict.status).toBe(202);
    expect(conflict.body.status).toBe('rejected');
    expect(conflict.body.code).toBe('CONFLICT');

    const incidentRows = await db
      .select()
      .from(incidents)
      .where(and(eq(incidents.deviceId, fx.deviceId), eq(incidents.deviceIncidentId, localId)));
    expect(incidentRows).toHaveLength(1);
    const eventRows = await db
      .select()
      .from(incidentEvents)
      .where(eq(incidentEvents.incidentId, incidentRows[0]!.id));
    expect(eventRows).toHaveLength(1);

    await postEvent(
      ctx,
      fx.deviceId,
      fx.deviceKey,
      makeEnvelope(fx, { incident_id: localId, event_type: 'fall.confirmed', event_revision: 2 }),
    );

    // Revision cũ đến sau, ở slot revision chưa có sự kiện: lưu lịch sử, không lùi trạng thái.
    const gapId = 'incident-t5b';
    const gapOpen = await postEvent(
      ctx,
      fx.deviceId,
      fx.deviceKey,
      makeEnvelope(fx, { incident_id: gapId, event_type: 'fall.confirmed', event_revision: 3 }),
    );
    expect(gapOpen.body.status).toBe('accepted');

    const stale = await postEvent(
      ctx,
      fx.deviceId,
      fx.deviceKey,
      makeEnvelope(fx, { incident_id: gapId, event_type: 'fall.cancelled', event_revision: 1 }),
    );
    expect(stale.body.status).toBe('accepted');
    expect(stale.body.acceptedRevision).toBe(3);

    const afterStale = await db
      .select()
      .from(incidents)
      .where(and(eq(incidents.deviceId, fx.deviceId), eq(incidents.deviceIncidentId, gapId)));
    expect(afterStale[0]!.state).toBe('open');

    const staleEvent = await db
      .select()
      .from(incidentEvents)
      .where(eq(incidentEvents.messageId, stale.body.sourceMessageId));
    expect(staleEvent).toHaveLength(1);
    expect(staleEvent[0]!.applied).toBe(false);
    expect(staleEvent[0]!.conflictReason).toBe('stale_revision');

    // Cùng revision nhưng payload khác → rejected CONFLICT + audit.
    const conflicting = await postEvent(
      ctx,
      fx.deviceId,
      fx.deviceKey,
      makeEnvelope(fx, { incident_id: gapId, event_type: 'sos.confirmed', event_revision: 3 }),
    );
    expect(conflicting.status).toBe(202);
    expect(conflicting.body.status).toBe('rejected');
    expect(conflicting.body.code).toBe('CONFLICT');

    const auditRows = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'incident.ingest'), eq(auditLogs.outcome, 'conflict')));
    expect(auditRows.length).toBeGreaterThan(0);

    // Revision cũ đúng slot nhưng payload khác cũng bị từ chối thay vì ghi đè.
    const staleConflict = await postEvent(
      ctx,
      fx.deviceId,
      fx.deviceKey,
      makeEnvelope(fx, {
        incident_id: gapId,
        event_type: 'fall.cancelled',
        event_revision: 1,
        evidence: {
          algorithm_version: 'demo-2',
          wear_location: 'wrist',
          motion_quality: 'valid',
          heart_rate_quality: 'valid',
          heart_rate_bpm: null,
        },
      }),
    );
    expect(staleConflict.body.status).toBe('rejected');
    expect(staleConflict.body.code).toBe('CONFLICT');

    const finalEvents = await db
      .select()
      .from(incidentEvents)
      .where(eq(incidentEvents.incidentId, afterStale[0]!.id));
    // confirmed(rev3) + stale(rev1) = 2; các bản tin conflict không được ghi.
    expect(finalEvents).toHaveLength(2);
  });

  it('T6: hai thiết bị dùng cùng incident_id tạo incident riêng theo namespace (R-02)', async () => {
    const fx = await createAlertFixture(ctx);
    const subjectB = (
      await db
        .insert(subjects)
        .values({ ownerUserId: fx.ownerId, displayName: 'Hồ sơ thứ hai' })
        .returning()
    )[0]!;
    const deviceKeyB = `device-key-b-${crypto.randomUUID()}-1234567890`;
    const deviceB = (
      await db
        .insert(devices)
        .values({
          serial: `DEV-B-${crypto.randomUUID().slice(0, 8)}`,
          label: 'Thiết bị B',
          credentialHash: sha256(deviceKeyB),
          status: 'active',
        })
        .returning()
    )[0]!;
    await db.insert(deviceAssignments).values({
      deviceId: deviceB.id,
      subjectId: subjectB.id,
      assignedByUserId: fx.ownerId,
    });

    const localId = 'incident-t6-trung';
    const sharedMessageId = 'msg-t6-shared';
    const a = await postEvent(
      ctx,
      fx.deviceId,
      fx.deviceKey,
      makeEnvelope(fx, {
        message_id: sharedMessageId,
        incident_id: localId,
        event_type: 'fall.candidate',
        event_revision: 1,
      }),
    );
    expect(a.body.status).toBe('accepted');
    const incidentAId = a.body.incidentId as string;

    // Cùng message_id với thiết bị A: dedupe phải theo (device_id, message_id).
    const b = await postEvent(ctx, deviceB.id, deviceKeyB, {
      ...makeEnvelope(fx, {
        message_id: sharedMessageId,
        incident_id: localId,
        event_type: 'fall.confirmed',
        event_revision: 1,
      }),
      device_id: deviceB.id,
    });
    expect(b.status).toBe(202);
    expect(b.body.status).toBe('accepted');
    expect(b.body.incidentId).not.toBe(incidentAId);

    const rows = await db
      .select()
      .from(incidents)
      .where(eq(incidents.deviceIncidentId, localId));
    expect(rows).toHaveLength(2);
    const incidentA = rows.find((row) => row.deviceId === fx.deviceId);
    const incidentB = rows.find((row) => row.deviceId === deviceB.id);
    expect(incidentA!.state).toBe('suspected'); // không bị thiết bị B đổi
    expect(incidentA!.subjectId).toBe(fx.subjectId);
    expect(incidentB!.state).toBe('open');
    expect(incidentB!.subjectId).toBe(subjectB.id);
  });

  it('T7: acknowledge đúng version → applied; version cũ → 409 + action conflict; hai request đồng thời → 1 applied/1 conflict (FR-07)', async () => {
    const fx = await createAlertFixture(ctx);
    const { incidentId } = await openIncident(ctx, fx, 'incident-t7');

    const detail = await fx.owner.agent.get(`/api/v1/alerts/${incidentId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.version).toBe(2);

    const ok = await fx.owner.agent
      .post(`/api/v1/alerts/${incidentId}/acknowledge`)
      .send({ expectedVersion: 2 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ state: 'acknowledged', version: 3 });

    // Outbox có bản update cho người đã nhận.
    const updateRows = await db
      .select()
      .from(notificationOutbox)
      .where(and(eq(notificationOutbox.incidentId, incidentId), eq(notificationOutbox.status, 'pending')));
    expect(updateRows.some((row) => row.dedupeKey.endsWith(':update'))).toBe(true);

    const stale = await fx.caregiver.agent
      .post(`/api/v1/alerts/${incidentId}/acknowledge`)
      .send({ expectedVersion: 2 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('CONFLICT');
    expect(stale.body.details).toMatchObject({ currentVersion: 3 });

    const actions = await db
      .select()
      .from(alertActions)
      .where(eq(alertActions.incidentId, incidentId));
    expect(actions.filter((a) => a.outcome === 'applied')).toHaveLength(1);
    expect(actions.filter((a) => a.outcome === 'conflict')).toHaveLength(1);

    // Hai người xác nhận đồng thời trên incident mới.
    const { incidentId: incidentId2 } = await openIncident(ctx, fx, 'incident-t7b');
    const [r1, r2] = await Promise.all([
      fx.owner.agent.post(`/api/v1/alerts/${incidentId2}/acknowledge`).send({ expectedVersion: 2 }),
      fx.caregiver.agent.post(`/api/v1/alerts/${incidentId2}/acknowledge`).send({ expectedVersion: 2 }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const actions2 = await db
      .select()
      .from(alertActions)
      .where(eq(alertActions.incidentId, incidentId2));
    expect(actions2.filter((a) => a.outcome === 'applied')).toHaveLength(1);
    expect(actions2.filter((a) => a.outcome === 'conflict')).toHaveLength(1);
    expect(actions2).toHaveLength(2);
  });

  it('T8: caregiver thiếu canAcknowledge bị 403; admin không có link không tự xác nhận (FR-07, NFR-01)', async () => {
    const fx = await createAlertFixture(ctx);
    const { incidentId } = await openIncident(ctx, fx, 'incident-t8');

    const denied = await fx.limited.agent
      .post(`/api/v1/alerts/${incidentId}/acknowledge`)
      .send({ expectedVersion: 2 });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('FORBIDDEN');

    const admin = await createAdmin(ctx.app);
    const adminAttempt = await admin.agent
      .post(`/api/v1/alerts/${incidentId}/acknowledge`)
      .send({ expectedVersion: 2 });
    expect(adminAttempt.status).toBe(404);

    const incidentRows = await db.select().from(incidents).where(eq(incidents.id, incidentId));
    expect(incidentRows[0]!.state).toBe('open');
  });

  it('T9: resolve cần reason hợp lệ (422); thành công đóng + supersede pending; lần hai 409; audit (FR-07, R-01)', async () => {
    const fx = await createAlertFixture(ctx);
    const { incidentId } = await openIncident(ctx, fx, 'incident-t9');

    const badReason = await fx.owner.agent
      .post(`/api/v1/alerts/${incidentId}/resolve`)
      .send({ expectedVersion: 2, reason: 'ng', outcome: 'other' });
    expect(badReason.status).toBe(422);

    const badOutcome = await fx.owner.agent
      .post(`/api/v1/alerts/${incidentId}/resolve`)
      .send({ expectedVersion: 2, reason: 'Lý do hợp lệ', outcome: 'khong-co' });
    expect(badOutcome.status).toBe(422);

    const ok = await fx.owner.agent
      .post(`/api/v1/alerts/${incidentId}/resolve`)
      .send({ expectedVersion: 2, reason: 'Đã kiểm tra, người dùng an toàn', outcome: 'supported' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({
      state: 'resolved',
      version: 3,
      resolutionOutcome: 'supported',
      resolutionReason: 'Đã kiểm tra, người dùng an toàn',
    });

    // Cảnh báo cũ pending → superseded; bản update mới vẫn pending để worker gửi.
    const rows = await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.incidentId, incidentId));
    for (const row of rows) {
      if (row.dedupeKey.endsWith(':alert')) {
        expect(row.status).toBe('superseded');
        expect(row.supersededAt).not.toBeNull();
      } else {
        expect(row.status).toBe('pending');
      }
    }

    const second = await fx.owner.agent
      .post(`/api/v1/alerts/${incidentId}/resolve`)
      .send({ expectedVersion: 3, reason: 'Đóng lại lần nữa', outcome: 'other' });
    expect(second.status).toBe(409);

    const auditRows = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'incident.resolve'), eq(auditLogs.outcome, 'success')));
    expect(auditRows).toHaveLength(1);
    const conflictAudit = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'incident.resolve'), eq(auditLogs.outcome, 'conflict')));
    expect(conflictAudit.length).toBeGreaterThan(0);
  });

  it('T10: user.cancel_requested sau confirmed đóng incident với lý do hủy, không xóa lịch sử; sau terminal không mở lại (FR-06, R-01)', async () => {
    const fx = await createAlertFixture(ctx);
    const localId = 'incident-t10';
    const { incidentId } = await openIncident(ctx, fx, localId);

    const cancelReq = await postEvent(
      ctx,
      fx.deviceId,
      fx.deviceKey,
      makeEnvelope(fx, { incident_id: localId, event_type: 'user.cancel_requested', event_revision: 3 }),
    );
    expect(cancelReq.body.status).toBe('accepted');

    const detail = await fx.owner.agent.get(`/api/v1/alerts/${incidentId}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      state: 'resolved',
      resolutionOutcome: 'cancelled_by_user',
      resolutionReason: 'Thiết bị yêu cầu hủy sau khi đã xác nhận',
    });

    // Cảnh báo mở cũ pending → superseded (không gửi cảnh báo mở sau khi đóng).
    const rows = await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.incidentId, incidentId));
    for (const row of rows) {
      if (row.dedupeKey.endsWith(':alert')) expect(row.status).toBe('superseded');
    }

    // Terminal: confirmed/sos đến muộn không mở lại.
    const lateSos = await postEvent(
      ctx,
      fx.deviceId,
      fx.deviceKey,
      makeEnvelope(fx, { incident_id: localId, event_type: 'sos.confirmed', event_revision: 4 }),
    );
    expect(lateSos.body.status).toBe('accepted');
    const after = await db.select().from(incidents).where(eq(incidents.id, incidentId));
    expect(after[0]!.state).toBe('resolved');

    const eventRows = await db
      .select()
      .from(incidentEvents)
      .where(and(eq(incidentEvents.incidentId, incidentId), eq(incidentEvents.eventRevision, 4)));
    expect(eventRows[0]!.applied).toBe(false);
    expect(eventRows[0]!.conflictReason).toBe('terminal_state');
  });

  it('T11: sos.confirmed mở trực tiếp; caregiver đủ quyền thấy (FR-09)', async () => {
    const fx = await createAlertFixture(ctx);
    const sos = await postEvent(
      ctx,
      fx.deviceId,
      fx.deviceKey,
      makeEnvelope(fx, {
        incident_id: 'incident-sos-t11',
        event_type: 'sos.confirmed',
        event_revision: 1,
        incident_type: 'sos',
      }),
    );
    expect(sos.body.status).toBe('accepted');
    const incidentId = sos.body.incidentId as string;

    const list = await fx.caregiver.agent.get(`/api/v1/subjects/${fx.subjectId}/alerts`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ id: incidentId, state: 'open', type: 'sos' });
  });

  it('T12: thiết bị chưa được gán vào hồ sơ bị từ chối rõ ràng (DEVICE_NOT_CLAIMED)', async () => {
    const db2 = ctx.app.get<AppDb>(DB);
    const deviceKey = `device-key-unassigned-${crypto.randomUUID()}`;
    const [unassigned] = await db2
      .insert(devices)
      .values({
        serial: `DEV-UA-${crypto.randomUUID().slice(0, 8)}`,
        label: 'Thiết bị chưa gán',
        credentialHash: sha256(deviceKey),
        status: 'active',
      })
      .returning();

    const fx = await createAlertFixture(ctx);
    const res = await postEvent(
      ctx,
      unassigned!.id,
      deviceKey,
      makeEnvelope(fx, { device_id: unassigned!.id, event_type: 'fall.candidate', event_revision: 1 }),
    );
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'rejected', code: 'DEVICE_NOT_CLAIMED' });
    expect(res.body.incidentId).toBeNull();

    const auditRows = await db2
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'incident.ingest'), eq(auditLogs.outcome, 'denied')));
    expect(auditRows.length).toBeGreaterThan(0);
  });

  it('T13: suspected quá hạn → unconfirmed; hiện ở closed + detail; không event/SSE/outbox; quét lại idempotent (FR-06, docs/03)', async () => {
    const fx = await createAlertFixture(ctx);
    const service = ctx.app.get(IncidentsService);
    const candidate = await postEvent(
      ctx,
      fx.deviceId,
      fx.deviceKey,
      makeEnvelope(fx, { incident_id: 'incident-t13', event_type: 'fall.candidate', event_revision: 1 }),
    );
    expect(candidate.body.status).toBe('accepted');
    const incidentId = candidate.body.incidentId as string;

    // Chưa quá hạn: chưa có gì trong open/closed, chưa phát realtime.
    const before = await fx.owner.agent.get(`/api/v1/subjects/${fx.subjectId}/alerts?state=closed`);
    expect(before.body.items).toHaveLength(0);
    expect(await db.select().from(realtimeEvents).where(eq(realtimeEvents.entityId, incidentId))).toHaveLength(0);

    await backdateIncident(db, incidentId, 11);
    const sweep = await service.expireSuspectedAlerts();
    expect(sweep.transitioned).toBeGreaterThanOrEqual(1);

    const rows = await db.select().from(incidents).where(eq(incidents.id, incidentId));
    expect(rows[0]!.state).toBe('unconfirmed');
    expect(rows[0]!.version).toBe(2);
    expect(rows[0]!.resolvedAt).toBeNull();
    expect(rows[0]!.cancelledAt).toBeNull();

    // Không bịa incident event mới: enum event type không có loại timeout.
    const eventRows = await db
      .select()
      .from(incidentEvents)
      .where(eq(incidentEvents.incidentId, incidentId));
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0]!.eventType).toBe('fall.candidate');

    // Không SSE, không outbox: đây là bản ghi thiếu kết quả cuối, không phải cảnh báo mới.
    expect(await db.select().from(realtimeEvents).where(eq(realtimeEvents.entityId, incidentId))).toHaveLength(0);
    expect(
      await db.select().from(notificationOutbox).where(eq(notificationOutbox.incidentId, incidentId)),
    ).toHaveLength(0);

    // Dấu vết hệ thống nằm ở audit_logs.
    const timeoutAudits = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'incident.suspected_timeout'), eq(auditLogs.targetId, incidentId)));
    expect(timeoutAudits).toHaveLength(1);
    expect(timeoutAudits[0]!.actorKind).toBe('system');
    expect(timeoutAudits[0]!.outcome).toBe('success');
    expect(timeoutAudits[0]!.metadata).toMatchObject({
      stateBefore: 'suspected',
      stateAfter: 'unconfirmed',
      versionBefore: 1,
      versionAfter: 2,
      timeoutMinutes: 10,
    });

    // state=closed bao gồm unconfirmed; state=open không.
    const closed = await fx.owner.agent.get(`/api/v1/subjects/${fx.subjectId}/alerts?state=closed`);
    expect(closed.status).toBe(200);
    expect(closed.body.items).toHaveLength(1);
    expect(closed.body.items[0]).toMatchObject({ id: incidentId, state: 'unconfirmed' });
    const open = await fx.owner.agent.get(`/api/v1/subjects/${fx.subjectId}/alerts`);
    expect(open.body.items).toHaveLength(0);

    // Chi tiết mở được, không 404, giữ lịch sử kỹ thuật.
    const detail = await fx.owner.agent.get(`/api/v1/alerts/${incidentId}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ id: incidentId, state: 'unconfirmed', version: 2 });
    expect(detail.body.events).toHaveLength(1);
    expect(detail.body.actions).toHaveLength(0);

    // Quét lại: idempotent, không tăng version, không thêm audit.
    const again = await service.expireSuspectedAlerts();
    expect(again).toEqual({ scanned: 0, transitioned: 0 });
    const after = await db.select().from(incidents).where(eq(incidents.id, incidentId));
    expect(after[0]!.version).toBe(2);
    expect(
      await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.action, 'incident.suspected_timeout'), eq(auditLogs.targetId, incidentId))),
    ).toHaveLength(1);
  });

  it('T14: suspected mới chưa quá hạn vẫn suspected, không thấy trong list/detail; job nền tắt khi test (FR-06)', async () => {
    const fx = await createAlertFixture(ctx);
    const service = ctx.app.get(IncidentsService);

    // Test không chạy interval nền và dùng ngưỡng mặc định 10 phút.
    expect(service.isSweepScheduled()).toBe(false);
    expect(service.suspectedTimeoutMs()).toBe(10 * 60_000);

    const candidate = await postEvent(
      ctx,
      fx.deviceId,
      fx.deviceKey,
      makeEnvelope(fx, { incident_id: 'incident-t14', event_type: 'fall.candidate', event_revision: 1 }),
    );
    const incidentId = candidate.body.incidentId as string;

    const sweep = await service.expireSuspectedAlerts();
    expect(sweep.transitioned).toBe(0);

    const rows = await db.select().from(incidents).where(eq(incidents.id, incidentId));
    expect(rows[0]!.state).toBe('suspected');
    expect(rows[0]!.version).toBe(1);

    const open = await fx.owner.agent.get(`/api/v1/subjects/${fx.subjectId}/alerts`);
    expect(open.body.items).toHaveLength(0);
    const closed = await fx.owner.agent.get(`/api/v1/subjects/${fx.subjectId}/alerts?state=closed`);
    expect(closed.body.items).toHaveLength(0);
    const detail = await fx.owner.agent.get(`/api/v1/alerts/${incidentId}`);
    expect(detail.status).toBe(404);
    expect(detail.body.code).toBe('NOT_FOUND');
    expect(await db.select().from(realtimeEvents).where(eq(realtimeEvents.entityId, incidentId))).toHaveLength(0);
  });

  it('T15: quét không đổi incident đã confirmed/acknowledged/resolved/cancelled (FR-06)', async () => {
    const fx = await createAlertFixture(ctx);
    const service = ctx.app.get(IncidentsService);

    const { incidentId: acknowledgedId } = await openIncident(ctx, fx, 'incident-t15-ack');
    const ack = await fx.owner.agent
      .post(`/api/v1/alerts/${acknowledgedId}/acknowledge`)
      .send({ expectedVersion: 2 });
    expect(ack.status).toBe(200);
    expect(ack.body.state).toBe('acknowledged');

    const { incidentId: resolvedId } = await openIncident(ctx, fx, 'incident-t15-resolved');
    const resolved = await fx.owner.agent
      .post(`/api/v1/alerts/${resolvedId}/resolve`)
      .send({ expectedVersion: 2, reason: 'Đã kiểm tra, người dùng an toàn', outcome: 'supported' });
    expect(resolved.status).toBe(200);

    const cancelledCandidate = await postEvent(
      ctx,
      fx.deviceId,
      fx.deviceKey,
      makeEnvelope(fx, { incident_id: 'incident-t15-cancel', event_type: 'fall.candidate', event_revision: 1 }),
    );
    const cancelledId = cancelledCandidate.body.incidentId as string;
    await postEvent(
      ctx,
      fx.deviceId,
      fx.deviceKey,
      makeEnvelope(fx, { incident_id: 'incident-t15-cancel', event_type: 'fall.cancelled', event_revision: 2 }),
    );

    for (const id of [acknowledgedId, resolvedId, cancelledId]) {
      await backdateIncident(db, id, 45);
    }

    const sweep = await service.expireSuspectedAlerts();
    expect(sweep.transitioned).toBe(0);

    const rows = await db
      .select()
      .from(incidents)
      .where(and(eq(incidents.subjectId, fx.subjectId), inArray(incidents.id, [acknowledgedId, resolvedId, cancelledId])));
    const stateById = new Map(rows.map((row) => [row.id, row.state]));
    expect(stateById.get(acknowledgedId)).toBe('acknowledged');
    expect(stateById.get(resolvedId)).toBe('resolved');
    expect(stateById.get(cancelledId)).toBe('cancelled');

    const versions = new Map(rows.map((row) => [row.id, row.version]));
    expect(versions.get(acknowledgedId)).toBe(3);
    expect(versions.get(resolvedId)).toBe(3);
    expect(versions.get(cancelledId)).toBe(2);
  });

  it('T16: unconfirmed giữ nguyên ranh giới quyền và không cho xác nhận/đóng (NFR-01)', async () => {
    const fx = await createAlertFixture(ctx);
    const service = ctx.app.get(IncidentsService);
    const candidate = await postEvent(
      ctx,
      fx.deviceId,
      fx.deviceKey,
      makeEnvelope(fx, { incident_id: 'incident-t16', event_type: 'fall.candidate', event_revision: 1 }),
    );
    const incidentId = candidate.body.incidentId as string;
    await backdateIncident(db, incidentId, 30);
    await service.expireSuspectedAlerts();

    const ownerList = await fx.owner.agent.get(`/api/v1/subjects/${fx.subjectId}/alerts?state=closed`);
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.items).toHaveLength(1);

    // Người thân có canReceiveAlerts vẫn xem được lịch sử kỹ thuật.
    const caregiverList = await fx.caregiver.agent.get(`/api/v1/subjects/${fx.subjectId}/alerts?state=closed`);
    expect(caregiverList.status).toBe(200);
    expect(caregiverList.body.items).toHaveLength(1);
    const caregiverDetail = await fx.caregiver.agent.get(`/api/v1/alerts/${incidentId}`);
    expect(caregiverDetail.status).toBe(200);
    expect(caregiverDetail.body.state).toBe('unconfirmed');

    // Có link nhưng thiếu canReceiveAlerts → 403; không có link → 404.
    const limitedList = await fx.limited.agent.get(`/api/v1/subjects/${fx.subjectId}/alerts?state=closed`);
    expect(limitedList.status).toBe(403);
    const limitedDetail = await fx.limited.agent.get(`/api/v1/alerts/${incidentId}`);
    expect(limitedDetail.status).toBe(403);
    const outsiderDetail = await fx.outsider.agent.get(`/api/v1/alerts/${incidentId}`);
    expect(outsiderDetail.status).toBe(404);
    const admin = await createAdmin(ctx.app);
    expect((await admin.agent.get(`/api/v1/alerts/${incidentId}`)).status).toBe(404);

    // unconfirmed không phải trạng thái cần xử lý: ack/resolve trả 409, không đổi state.
    const ack = await fx.owner.agent
      .post(`/api/v1/alerts/${incidentId}/acknowledge`)
      .send({ expectedVersion: 2 });
    expect(ack.status).toBe(409);
    const resolve = await fx.owner.agent
      .post(`/api/v1/alerts/${incidentId}/resolve`)
      .send({ expectedVersion: 2, reason: 'Đóng ca chưa xác định', outcome: 'other' });
    expect(resolve.status).toBe(409);
    const after = await db.select().from(incidents).where(eq(incidents.id, incidentId));
    expect(after[0]!.state).toBe('unconfirmed');
    expect(after[0]!.version).toBe(2);
  });

  it('T17: confirmed đến sau khi đã unconfirmed vẫn mở cảnh báo, không âm thầm bỏ (docs/03)', async () => {
    const fx = await createAlertFixture(ctx);
    const service = ctx.app.get(IncidentsService);
    const localId = 'incident-t17';
    const candidate = await postEvent(
      ctx,
      fx.deviceId,
      fx.deviceKey,
      makeEnvelope(fx, { incident_id: localId, event_type: 'fall.candidate', event_revision: 1 }),
    );
    const incidentId = candidate.body.incidentId as string;
    await backdateIncident(db, incidentId, 20);
    await service.expireSuspectedAlerts();

    const confirmed = await postEvent(
      ctx,
      fx.deviceId,
      fx.deviceKey,
      makeEnvelope(fx, { incident_id: localId, event_type: 'fall.confirmed', event_revision: 2 }),
    );
    expect(confirmed.status).toBe(202);
    expect(confirmed.body.status).toBe('accepted');

    const rows = await db.select().from(incidents).where(eq(incidents.id, incidentId));
    expect(rows[0]!.state).toBe('open');
    expect(rows[0]!.version).toBe(3);

    const open = await fx.owner.agent.get(`/api/v1/subjects/${fx.subjectId}/alerts`);
    expect(open.body.items).toHaveLength(1);
    expect(open.body.items[0]).toMatchObject({ id: incidentId, state: 'open' });
    const closed = await fx.owner.agent.get(`/api/v1/subjects/${fx.subjectId}/alerts?state=closed`);
    expect(closed.body.items).toHaveLength(0);

    const outboxRows = await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.incidentId, incidentId));
    expect(outboxRows).toHaveLength(2);
    expect(outboxRows.every((row) => row.dedupeKey.endsWith(':alert'))).toBe(true);
  });

  it('T18: SUSPECTED_TIMEOUT_MINUTES ngoài 1..120 bị từ chối khi đọc cấu hình', () => {
    const previous = process.env.SUSPECTED_TIMEOUT_MINUTES;
    try {
      process.env.SUSPECTED_TIMEOUT_MINUTES = '121';
      resetEnvCacheForTests();
      expect(() => loadEnv()).toThrow(/SUSPECTED_TIMEOUT_MINUTES/);

      process.env.SUSPECTED_TIMEOUT_MINUTES = '0';
      resetEnvCacheForTests();
      expect(() => loadEnv()).toThrow(/SUSPECTED_TIMEOUT_MINUTES/);

      process.env.SUSPECTED_TIMEOUT_MINUTES = '30';
      resetEnvCacheForTests();
      expect(loadEnv().SUSPECTED_TIMEOUT_MINUTES).toBe(30);
    } finally {
      if (previous === undefined) delete process.env.SUSPECTED_TIMEOUT_MINUTES;
      else process.env.SUSPECTED_TIMEOUT_MINUTES = previous;
      resetEnvCacheForTests();
    }
  });
});
