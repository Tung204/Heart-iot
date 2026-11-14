/**
 * Kiểm thử SSE realtime: nhận alert.updated khi có incident mới;
 * thu hồi care link → nhận `event: revoked` và stream đóng.
 * Yêu cầu: FR-02, NFR-01; reconnect bằng Last-Event-ID.
 */
import request from 'supertest';
import { eq } from 'drizzle-orm';
import type { AddressInfo } from 'node:net';
import type { IncidentEnvelope } from '@annhien/contracts/telemetry';
import { DB, type AppDb } from '../src/database/database';
import { careLinks, deviceAssignments, devices, subjects } from '../src/database/schema';
import { sha256 } from '../src/auth/password';
import { DeviceAuthModule } from '../src/devices/device-auth.module';
import { IncidentsModule } from '../src/incidents/incidents.module';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { RealtimeModule } from '../src/realtime/realtime.module';
import { RealtimeService } from '../src/realtime/realtime.service';
import {
  createModuleTestApp,
  registerUser,
  TEST_ORIGIN,
  type TestContext,
  type TestUser,
} from './test-app';

const PERMISSIONS = {
  historyDays: 30,
  canReceiveAlerts: true,
  canAcknowledge: true,
  canResolve: false,
  canViewAi: false,
};

let sequenceCounter = 0;

type SseFixture = {
  owner: TestUser;
  caregiver: TestUser;
  caregiverPassword: string;
  subjectId: string;
  deviceId: string;
  deviceKey: string;
};

async function createSseFixture(ctx: TestContext): Promise<SseFixture> {
  const db = ctx.app.get<AppDb>(DB);
  const owner = await registerUser(ctx.app, { displayName: 'Chủ hồ sơ SSE' });
  const caregiverPassword = 'mat-khau-sse-123';
  const caregiver = await registerUser(ctx.app, {
    displayName: 'Người thân SSE',
    password: caregiverPassword,
  });

  const subjectRow = (
    await db
      .insert(subjects)
      .values({ ownerUserId: owner.session.user.id, displayName: 'Hồ sơ SSE' })
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

  const deviceKey = `device-key-sse-1234567890`;
  const deviceRow = (
    await db
      .insert(devices)
      .values({
        serial: `DEV-SSE-${crypto.randomUUID().slice(0, 8)}`,
        label: 'Thiết bị SSE',
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
    caregiver,
    caregiverPassword,
    subjectId: subjectRow.id,
    deviceId: deviceRow.id,
    deviceKey,
  };
}

function makeEnvelope(fx: SseFixture, overrides: Partial<IncidentEnvelope> = {}): IncidentEnvelope {
  sequenceCounter += 1;
  return {
    schema_version: '1.0',
    message_id: `msg-${crypto.randomUUID()}`,
    device_id: fx.deviceId,
    boot_id: 'boot-sse-1',
    sequence: sequenceCounter,
    measured_at: new Date().toISOString(),
    clock_status: 'synced',
    uptime_ms: 5000,
    firmware_version: '0.1.0-demo',
    incident_id: 'incident-sse',
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
  fx: SseFixture,
  envelope: IncidentEnvelope,
): Promise<request.Response> {
  return request(ctx.app.getHttpServer())
    .post('/api/v1/ingest/events')
    .set('x-device-id', fx.deviceId)
    .set('x-device-key', fx.deviceKey)
    .send(envelope);
}

/** Đăng nhập caregiver qua HTTP thật để lấy cookie phiên cho fetch. */
async function loginCookie(
  ctx: TestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request(ctx.app.getHttpServer())
    .post('/api/v1/auth/login')
    .set('Origin', TEST_ORIGIN)
    .send({ email, password });
  if (res.status !== 200) {
    throw new Error(`Đăng nhập thất bại (${res.status}): ${JSON.stringify(res.body)}`);
  }
  const setCookie = res.headers['set-cookie'] as unknown as string[] | undefined;
  if (!setCookie || setCookie.length === 0) throw new Error('Không nhận được cookie phiên.');
  return setCookie.map((item) => item.split(';')[0]).join('; ');
}

describe('SSE realtime (FR-02, NFR-01)', () => {
  let ctx: TestContext;
  let db: AppDb;

  beforeAll(async () => {
    ctx = await createModuleTestApp([IncidentsModule, NotificationsModule, RealtimeModule, DeviceAuthModule]);
    db = ctx.app.get<AppDb>(DB);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('S1: nhận alert.updated khi incident mở; thu hồi care link → revoked và stream đóng', async () => {
    const fx = await createSseFixture(ctx);
    const realtime = ctx.app.get(RealtimeService);
    realtime.pollMs = 40; // rút ngắn vòng lặp cho test

    // Lắng nghe cổng thật để dùng fetch (SSE không qua supertest).
    await ctx.app.listen(0, '127.0.0.1');

    const cookie = await loginCookie(ctx, fx.caregiver.email, fx.caregiverPassword);
    const address = ctx.app.getHttpServer().address() as AddressInfo | null;
    if (!address) throw new Error('Server test chưa lắng nghe cổng.');
    const url = `http://127.0.0.1:${address.port}/api/v1/subjects/${fx.subjectId}/events`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let sawAlertUpdated = false;
    let sawRevoked = false;
    let text = '';
    try {
      const response = await fetch(url, {
        headers: { cookie, accept: 'text/event-stream' },
        signal: controller.signal,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      expect(response.headers.get('cache-control')).toContain('no-cache');

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let text = '';

      // Phase 1: tạo incident sau khi stream đã mở, đợi nhận alert.updated thật.
      const candidate = await postEvent(
        ctx,
        fx,
        makeEnvelope(fx, { incident_id: 'incident-sse-1', event_type: 'fall.candidate', event_revision: 1 }),
      );
      expect(candidate.body.status).toBe('accepted');
      const confirmed = await postEvent(
        ctx,
        fx,
        makeEnvelope(fx, { incident_id: 'incident-sse-1', event_type: 'fall.confirmed', event_revision: 2 }),
      );
      expect(confirmed.body.status).toBe('accepted');
      const incidentId = confirmed.body.incidentId as string;

      let sawAlertUpdated = false;
      while (!sawAlertUpdated) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        sawAlertUpdated =
          text.includes('event: alert.updated') && text.includes(`"incidentId":"${incidentId}"`);
      }
      expect(sawAlertUpdated).toBe(true);

      // Phase 2: thu hồi care link → stream gửi revoked rồi đóng.
      await db
        .update(careLinks)
        .set({ status: 'revoked', revokedAt: new Date() })
        .where(eq(careLinks.subjectId, fx.subjectId));

      let sawRevoked = false;
      while (!sawRevoked) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        sawRevoked = text.includes('event: revoked');
      }

      expect(sawAlertUpdated).toBe(true);
      expect(sawRevoked).toBe(true);
      expect(text).toContain('id: '); // mỗi sự kiện có id để reconnect bằng Last-Event-ID
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error('SSE không hoàn tất trong 10 giây (timeout).');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  }, 15000);

  it('S2: không có phiên hoặc không có quyền hồ sơ → bị từ chối trước khi mở stream', async () => {
    const fx = await createSseFixture(ctx);
    const outsider = await registerUser(ctx.app, { displayName: 'Người ngoài SSE' });

    const noSession = await request(ctx.app.getHttpServer()).get(
      `/api/v1/subjects/${fx.subjectId}/events`,
    );
    expect(noSession.status).toBe(401);

    const forbidden = await outsider.agent.get(`/api/v1/subjects/${fx.subjectId}/events`);
    expect(forbidden.status).toBe(404);

    // Có link nhưng bị cấm nhận cảnh báo → 403, không mở stream.
    await db
      .update(careLinks)
      .set({ permissions: { ...PERMISSIONS, canReceiveAlerts: false } })
      .where(eq(careLinks.subjectId, fx.subjectId));
    const noAlertsPermission = await fx.caregiver.agent.get(
      `/api/v1/subjects/${fx.subjectId}/events`,
    );
    expect(noAlertsPermission.status).toBe(403);
  });
});
