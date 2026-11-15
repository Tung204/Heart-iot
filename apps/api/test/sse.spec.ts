/**
 * Kiểm thử SSE realtime (FR-02, NFR-01, QA v2 admin ops P1-1):
 * - nhận `alert.updated` khi incident mở; reconnect bằng Last-Event-ID;
 * - thu hồi care link → `event: revoked` và stream đóng;
 * - admin khóa tài khoản hoặc phiên hết hạn → `event: revoked` (payload rỗng),
 *   stream đóng và không nhận alert mới sau đó;
 * - owner bình thường vẫn nhận event, không bị ngắt oan.
 */
import request from 'supertest';
import { eq } from 'drizzle-orm';
import type { AddressInfo } from 'node:net';
import type { IncidentEnvelope } from '@annhien/contracts/telemetry';
import { DB, type AppDb } from '../src/database/database';
import { careLinks, deviceAssignments, devices, sessions, subjects, users } from '../src/database/schema';
import { sha256 } from '../src/auth/password';
import { AdminModule } from '../src/admin/admin.module';
import { DeviceAuthModule } from '../src/devices/device-auth.module';
import { IncidentsModule } from '../src/incidents/incidents.module';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { PolicyModule } from '../src/policy/policy.module';
import { RealtimeModule } from '../src/realtime/realtime.module';
import { RealtimeService } from '../src/realtime/realtime.service';
import {
  createAdmin,
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

/** Chờ tối đa cho mỗi lần đọc SSE; poll 40ms nên bình thường trả về rất nhanh. */
const SSE_READ_TIMEOUT_MS = 8000;

let sequenceCounter = 0;
let baseUrl = '';

type SseFixture = {
  owner: TestUser;
  ownerPassword: string;
  caregiver: TestUser;
  caregiverPassword: string;
  subjectId: string;
  deviceId: string;
  deviceKey: string;
};

const OWNER_PASSWORD = 'mat-khau-owner-sse-123';
const CAREGIVER_PASSWORD = 'mat-khau-sse-123';

async function createSseFixture(ctx: TestContext): Promise<SseFixture> {
  const db = ctx.app.get<AppDb>(DB);
  const owner = await registerUser(ctx.app, {
    displayName: 'Chủ hồ sơ SSE',
    password: OWNER_PASSWORD,
  });
  const caregiver = await registerUser(ctx.app, {
    displayName: 'Người thân SSE',
    password: CAREGIVER_PASSWORD,
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
    ownerPassword: OWNER_PASSWORD,
    caregiver,
    caregiverPassword: CAREGIVER_PASSWORD,
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

/** Gửi cặp candidate + confirmed để sinh đúng một alert.updated và trả incidentId. */
async function postAlert(ctx: TestContext, fx: SseFixture, incidentId: string): Promise<string> {
  const candidate = await postEvent(
    ctx,
    fx,
    makeEnvelope(fx, { incident_id: incidentId, event_type: 'fall.candidate', event_revision: 1 }),
  );
  expect(candidate.body.status).toBe('accepted');
  const confirmed = await postEvent(
    ctx,
    fx,
    makeEnvelope(fx, { incident_id: incidentId, event_type: 'fall.confirmed', event_revision: 2 }),
  );
  expect(confirmed.body.status).toBe('accepted');
  return confirmed.body.incidentId as string;
}

/** Đăng nhập qua HTTP thật để lấy cookie phiên cho fetch SSE. */
async function loginCookie(ctx: TestContext, email: string, password: string): Promise<string> {
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

function eventsUrl(subjectId: string): string {
  return `${baseUrl}/api/v1/subjects/${subjectId}/events`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type SseClient = {
  text: () => string;
  readUntil: (predicate: (body: string) => boolean, label: string) => Promise<void>;
  readToEnd: () => Promise<void>;
  close: () => void;
};

/**
 * Mở SSE bằng fetch thật (supertest không đọc được stream) và đọc theo khung.
 * Mỗi lần read có timeout riêng để lỗi chỉ rõ đang chờ gì.
 */
async function openSse(url: string, cookie: string): Promise<SseClient> {
  const controller = new AbortController();
  const response = await fetch(url, {
    headers: { cookie, accept: 'text/event-stream' },
    signal: controller.signal,
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  expect(response.headers.get('cache-control')).toContain('no-cache');

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let body = '';

  const readChunk = async (label: string): Promise<boolean> => {
    const timer = setTimeout(() => controller.abort(), SSE_READ_TIMEOUT_MS);
    try {
      const chunk = await reader.read();
      if (chunk.done) return true;
      body += decoder.decode(chunk.value, { stream: true });
      return false;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error(`Hết thời gian chờ ${label}. Đã nhận:\n${body}`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    text: () => body,
    async readUntil(predicate, label) {
      while (!predicate(body)) {
        const done = await readChunk(label);
        if (done) throw new Error(`Stream đóng trước khi nhận ${label}. Đã nhận:\n${body}`);
      }
    },
    async readToEnd() {
      for (;;) {
        const done = await readChunk('stream đóng');
        if (done) return;
      }
    },
    close() {
      controller.abort();
    },
  };
}

describe('SSE realtime (FR-02, NFR-01)', () => {
  let ctx: TestContext;
  let db: AppDb;
  let admin: TestUser;

  beforeAll(async () => {
    ctx = await createModuleTestApp([
      IncidentsModule,
      NotificationsModule,
      RealtimeModule,
      DeviceAuthModule,
      PolicyModule,
      AdminModule,
    ]);
    db = ctx.app.get<AppDb>(DB);

    // SSE không đi qua supertest nên cần cổng thật, mở một lần cho cả file.
    await ctx.app.listen(0, '127.0.0.1');
    const address = ctx.app.getHttpServer().address() as AddressInfo | null;
    if (!address) throw new Error('Server test chưa lắng nghe cổng.');
    baseUrl = `http://127.0.0.1:${address.port}`;

    // Rút ngắn vòng poll để test không phải chờ 1s mỗi vòng.
    ctx.app.get(RealtimeService).pollMs = 40;
    admin = await createAdmin(ctx.app, { email: `admin-sse-${crypto.randomUUID()}@example.test` });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('S1: nhận alert.updated khi incident mở; thu hồi care link → revoked và đóng stream', async () => {
    const fx = await createSseFixture(ctx);
    const cookie = await loginCookie(ctx, fx.caregiver.email, fx.caregiverPassword);
    const client = await openSse(eventsUrl(fx.subjectId), cookie);
    try {
      const incidentId = await postAlert(ctx, fx, 'incident-sse-link-1');
      await client.readUntil(
        (body) =>
          body.includes('event: alert.updated') && body.includes(`"incidentId":"${incidentId}"`),
        'alert.updated',
      );

      // Thu hồi care link → stream gửi revoked rồi đóng.
      await db
        .update(careLinks)
        .set({ status: 'revoked', revokedAt: new Date() })
        .where(eq(careLinks.subjectId, fx.subjectId));

      await client.readUntil((body) => body.includes('event: revoked'), 'revoked');
      await client.readToEnd();

      expect(client.text()).toContain('id: '); // mỗi sự kiện có id để reconnect bằng Last-Event-ID

      // Không nhận alert mới sau khi stream đã đóng.
      const textAtClose = client.text();
      await postAlert(ctx, fx, 'incident-sse-link-2');
      expect(client.text()).toBe(textAtClose);
      expect(textAtClose).not.toContain('incident-sse-link-2');
    } finally {
      client.close();
    }
  });

  it('S2: admin khóa tài khoản → revoked, đóng stream, không nhận alert mới', async () => {
    const fx = await createSseFixture(ctx);
    const cookie = await loginCookie(ctx, fx.caregiver.email, fx.caregiverPassword);
    const client = await openSse(eventsUrl(fx.subjectId), cookie);
    try {
      // Stream đang hoạt động trước khi khóa.
      const firstIncident = await postAlert(ctx, fx, 'incident-sse-disable-1');
      await client.readUntil(
        (body) => body.includes(`"incidentId":"${firstIncident}"`),
        'alert trước khi khóa',
      );

      const disable = await admin.agent
        .patch(`/api/v1/admin/users/${fx.caregiver.session.user.id}/status`)
        .set('Origin', TEST_ORIGIN)
        .send({ status: 'disabled', reason: 'QA v2 admin ops P1-1.' });
      expect(disable.status).toBe(200);
      expect(disable.body.status).toBe('disabled');

      // Admin disable thu hồi mọi session trong cùng transaction.
      const sessionRows = await db
        .select({ id: sessions.id, revokedAt: sessions.revokedAt })
        .from(sessions)
        .where(eq(sessions.userId, fx.caregiver.session.user.id));
      expect(sessionRows.length).toBeGreaterThan(0);
      expect(sessionRows.every((row) => row.revokedAt !== null)).toBe(true);

      await client.readUntil(
        (body) => body.includes('event: revoked'),
        'revoked khi tài khoản bị khóa',
      );
      await client.readToEnd();

      const textAtClose = client.text();
      // Payload tối thiểu, không lộ sessionId hay dữ liệu sức khỏe.
      expect(textAtClose).toContain('event: revoked\ndata: {}\n\n');
      for (const row of sessionRows) {
        expect(textAtClose).not.toContain(row.id);
      }

      // Stream đã đóng: alert mới không thể tới người dùng vừa bị khóa.
      await postAlert(ctx, fx, 'incident-sse-disable-2');
      expect(client.text()).toBe(textAtClose);
      expect(textAtClose).not.toContain('incident-sse-disable-2');
    } finally {
      client.close();
    }
  });

  it('S3: phiên hết hạn giữa stream → revoked và đóng', async () => {
    const fx = await createSseFixture(ctx);
    const cookie = await loginCookie(ctx, fx.caregiver.email, fx.caregiverPassword);
    const client = await openSse(eventsUrl(fx.subjectId), cookie);
    try {
      const incidentId = await postAlert(ctx, fx, 'incident-sse-expire-1');
      await client.readUntil(
        (body) => body.includes(`"incidentId":"${incidentId}"`),
        'alert trước khi phiên hết hạn',
      );

      await db
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(sessions.userId, fx.caregiver.session.user.id));

      await client.readUntil(
        (body) => body.includes('event: revoked'),
        'revoked khi phiên hết hạn',
      );
      await client.readToEnd();
      expect(client.text()).toContain('event: revoked\ndata: {}\n\n');
    } finally {
      client.close();
    }
  });

  it('S4: tài khoản bị khóa trực tiếp (chưa revoke session) cũng bị ngắt stream', async () => {
    const fx = await createSseFixture(ctx);
    const cookie = await loginCookie(ctx, fx.caregiver.email, fx.caregiverPassword);
    const client = await openSse(eventsUrl(fx.subjectId), cookie);
    try {
      const incidentId = await postAlert(ctx, fx, 'incident-sse-status-1');
      await client.readUntil(
        (body) => body.includes(`"incidentId":"${incidentId}"`),
        'alert trước khi khóa status',
      );

      // Chỉ đổi status, không revoke session: vòng poll vẫn phải ngắt.
      await db
        .update(users)
        .set({ status: 'disabled', updatedAt: new Date() })
        .where(eq(users.id, fx.caregiver.session.user.id));

      await client.readUntil(
        (body) => body.includes('event: revoked'),
        'revoked khi tài khoản bị khóa trực tiếp',
      );
      await client.readToEnd();
    } finally {
      client.close();
    }
  });

  it('S5: owner bình thường vẫn nhận event, không bị ngắt oan', async () => {
    const fx = await createSseFixture(ctx);
    const cookie = await loginCookie(ctx, fx.owner.email, fx.ownerPassword);
    const client = await openSse(eventsUrl(fx.subjectId), cookie);
    try {
      const firstIncident = await postAlert(ctx, fx, 'incident-sse-owner-1');
      await client.readUntil(
        (body) => body.includes(`"incidentId":"${firstIncident}"`),
        'alert owner 1',
      );

      // Vài vòng poll không được sinh revoked khi phiên/tài khoản vẫn hợp lệ.
      await delay(200);
      expect(client.text()).not.toContain('event: revoked');

      const secondIncident = await postAlert(ctx, fx, 'incident-sse-owner-2');
      await client.readUntil(
        (body) => body.includes(`"incidentId":"${secondIncident}"`),
        'alert owner 2',
      );
      expect(client.text()).not.toContain('event: revoked');
    } finally {
      client.close();
    }
  });

  it('S6: không có phiên hoặc không có quyền hồ sơ → bị từ chối trước khi mở stream', async () => {
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
