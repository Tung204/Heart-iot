import request from 'supertest';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';
import type { TelemetryEnvelope } from '@heart-iot/contracts/telemetry';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import { DevicesModule } from '../src/devices/devices.module';
import { IngestModule } from '../src/ingest/ingest.module';
import { IncidentsModule } from '../src/incidents/incidents.module';
import { MeasurementsModule } from '../src/measurements/measurements.module';
import { CSV_HEADER } from '../src/measurements/measurements.service';
import { localDateKey } from '../src/measurements/insights';
import { PolicyModule } from '../src/policy/policy.module';
import { DB } from '../src/database/database';
import { auditLogs, careLinks, deviceAssignments, incidents, subjects, telemetry } from '../src/database/schema';
import {
  createAdmin,
  createModuleTestApp,
  registerUser,
  TEST_ORIGIN,
  type TestContext,
  type TestUser,
} from './test-app';

/**
 * FR đo lường: timeline snapshot, coverage/gap theo semantics v1, phân trang cursor,
 * daily-summary theo timezone hồ sơ, export CSV có audit.
 */

/** Test-only: AppModule (lead sở hữu) đăng ký APP_FILTER; module test cần filter riêng. */
@Module({
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
class TestFiltersModule {}

let serialCounter = 0;
const nextSerial = () => `DEV-${String(++serialCounter).padStart(4, '0')}`;

type Fixture = { subjectId: string; deviceId: string; deviceKey: string; assignmentId: string };

async function createSubject(ctx: TestContext, ownerUserId: string, displayName = 'Bà An') {
  const rows = await ctx.db
    .insert(subjects)
    .values({ ownerUserId, displayName, timezone: 'Asia/Ho_Chi_Minh' })
    .returning();
  const subject = rows[0];
  if (!subject) throw new Error('Không tạo được subject.');
  return subject;
}

async function createClaimedDevice(ctx: TestContext, admin: TestUser, owner: TestUser, displayName?: string): Promise<Fixture> {
  const subject = await createSubject(ctx, owner.session.user.id, displayName);
  const created = await admin.agent
    .post('/api/v1/admin/devices')
    .set('Origin', TEST_ORIGIN)
    .send({ serial: nextSerial(), label: 'Vòng tay đo' });
  expect(created.status).toBe(201);
  const claimed = await owner.agent
    .post(`/api/v1/subjects/${subject.id}/devices/claim`)
    .set('Origin', TEST_ORIGIN)
    .send({ claimCode: created.body.claimCode });
  expect(claimed.status).toBe(201);
  const assignmentId = claimed.body.assignmentId as string;
  // Test gửi mẫu lịch sử ngay sau khi claim: lùi mốc assignment để các mẫu đó
  // thật sự nằm trong assignment (mẫu trước assignment có test riêng bị cách ly).
  await ctx.db
    .update(deviceAssignments)
    .set({ startedAt: new Date(Date.now() - 35 * 24 * 3600 * 1000) })
    .where(eq(deviceAssignments.id, assignmentId));
  return {
    subjectId: subject.id,
    deviceId: created.body.device.id,
    deviceKey: created.body.deviceKey,
    assignmentId,
  };
}

function makeEnvelope(deviceId: string, overrides: Partial<TelemetryEnvelope> = {}): TelemetryEnvelope {
  return {
    schema_version: '1.0',
    message_id: crypto.randomUUID(),
    device_id: deviceId,
    boot_id: 'boot-meas',
    sequence: 0,
    measured_at: new Date().toISOString(),
    clock_status: 'synced',
    uptime_ms: 5_000,
    metrics: { heart_rate_bpm: 75, steps_since_boot: 10 },
    quality: { heart_rate: 'valid', motion: 'valid' },
    battery_percent: 60,
    firmware_version: '0.1.0-demo',
    ...overrides,
  };
}

async function send(ctx: TestContext, fixture: Fixture, envelope: TelemetryEnvelope): Promise<void> {
  const response = await sendRaw(ctx, fixture, envelope);
  expect(response.status).toBe(202);
  expect(response.body.status).toBe('accepted');
}

function sendRaw(ctx: TestContext, fixture: Fixture, envelope: TelemetryEnvelope) {
  return request(ctx.app.getHttpServer())
    .post('/api/v1/ingest/telemetry')
    .set('x-device-id', fixture.deviceId)
    .set('x-device-key', fixture.deviceKey)
    .send(envelope);
}

describe('Đo lường: measurements, daily-summary, export.csv', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let owner: TestUser;

  beforeAll(async () => {
    delete process.env.MQTT_URL;
    ctx = await createModuleTestApp([DevicesModule, IngestModule, IncidentsModule, MeasurementsModule, PolicyModule, TestFiltersModule]);
    admin = await createAdmin(ctx.app);
    owner = await registerUser(ctx.app, { displayName: 'Chủ hồ sơ' });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('timeline chỉ chứa snapshot có measured_at; coverage và phân trang cursor ổn định', async () => {
    const fixture = await createClaimedDevice(ctx, admin, owner);
    const base = Date.now() - 3600 * 1000;
    const times = [0, 1, 2, 3, 4].map((i) => new Date(base + i * 15_000).toISOString());
    for (let i = 0; i < times.length; i += 1) {
      await send(
        ctx,
        fixture,
        makeEnvelope(fixture.deviceId, {
          sequence: i,
          measured_at: times[i],
          metrics: { heart_rate_bpm: 70 + i, steps_since_boot: 10 * i },
        }),
      );
    }

    const from = new Date(base - 2_000).toISOString();
    const to = new Date(base + 75_000).toISOString();
    const response = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/measurements?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(5);
    for (let i = 1; i < response.body.items.length; i += 1) {
      expect(response.body.items[i].measuredAt >= response.body.items[i - 1].measuredAt).toBe(true);
    }
    expect(response.body.coverage).toMatchObject({
      expectedIntervalSeconds: 15,
      observedCount: 5,
      expectedCount: 5,
      percent: 100,
    });
    expect(response.body.gaps).toEqual([]);
    expect(response.body.excludedUnsyncedCount).toBe(0);
    expect(response.body.nextCursor).toBeNull();

    // Phân trang limit=2 qua 3 trang, không trùng, không sót.
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const page = await owner.agent.get(`/api/v1/subjects/${fixture.subjectId}/measurements?${query}`);
      expect(page.status).toBe(200);
      for (const item of page.body.items) seen.push(item.measuredAt);
      cursor = page.body.nextCursor;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(5);
    expect(seen).toEqual([...seen].sort());
  });

  it('khoảng thiếu dữ liệu tạo gap no_data; unsynced bị loại khỏi timeline và đếm riêng', async () => {
    const fixture = await createClaimedDevice(ctx, admin, owner);
    const base = Date.now() - 3600 * 1000;
    const t = (offsetSec: number) => new Date(base + offsetSec * 1000).toISOString();

    await send(ctx, fixture, makeEnvelope(fixture.deviceId, { sequence: 0, measured_at: t(0) }));
    await send(ctx, fixture, makeEnvelope(fixture.deviceId, { sequence: 1, measured_at: t(15) }));
    await send(ctx, fixture, makeEnvelope(fixture.deviceId, { sequence: 2, measured_at: t(30) }));
    await send(ctx, fixture, makeEnvelope(fixture.deviceId, { sequence: 3, measured_at: t(300) }));
    // Bản ghi không có đồng hồ tin cậy (đến ngay bây giờ).
    await send(ctx, fixture, makeEnvelope(fixture.deviceId, {
      sequence: 4,
      measured_at: null,
      clock_status: 'unsynced',
      metrics: { heart_rate_bpm: null, steps_since_boot: 999 },
      quality: { heart_rate: 'not_worn', motion: 'valid' },
    }));

    // Cửa sổ chứa các snapshot → gap giữa t+30 và t+300.
    const windowRes = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/measurements?from=${encodeURIComponent(t(-1))}&to=${encodeURIComponent(t(305))}`,
    );
    expect(windowRes.status).toBe(200);
    expect(windowRes.body.items).toHaveLength(4);
    expect(windowRes.body.gaps).toHaveLength(1);
    expect(windowRes.body.gaps[0]).toMatchObject({ from: t(30), to: t(300), reason: 'no_data' });

    // Cửa sổ chỉ có bản ghi unsynced (quanh "bây giờ"): không có mốc tin cậy → gap clock_unsynced.
    const nowFrom = new Date(Date.now() - 30_000).toISOString();
    const nowTo = new Date().toISOString();
    const unsyncedRes = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/measurements?from=${encodeURIComponent(nowFrom)}&to=${encodeURIComponent(nowTo)}`,
    );
    expect(unsyncedRes.status).toBe(200);
    expect(unsyncedRes.body.items).toHaveLength(0);
    expect(unsyncedRes.body.excludedUnsyncedCount).toBe(1);
    expect(unsyncedRes.body.coverage.observedCount).toBe(0);
    expect(unsyncedRes.body.gaps).toEqual([
      { from: nowFrom, to: nowTo, reason: 'clock_unsynced' },
    ]);
  });

  it('quyền: hồ sơ khác 404; khoảng ngoài quyền lịch sử của caregiver 403', async () => {
    const fixture = await createClaimedDevice(ctx, admin, owner);

    const stranger = await registerUser(ctx.app);
    const crossSubject = await stranger.agent.get(`/api/v1/subjects/${fixture.subjectId}/measurements`);
    expect(crossSubject.status).toBe(404);

    const caregiver = await registerUser(ctx.app);
    await ctx.db.insert(careLinks).values({
      subjectId: fixture.subjectId,
      caregiverUserId: caregiver.session.user.id,
      invitedByUserId: owner.session.user.id,
      permissions: { ...{ historyDays: 1, canReceiveAlerts: false, canAcknowledge: false, canResolve: false, canViewAi: false } },
      status: 'active',
      sharedFrom: new Date(Date.now() - 2 * 24 * 3600 * 1000),
    });

    const tooOldFrom = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const forbidden = await caregiver.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/measurements?from=${encodeURIComponent(tooOldFrom)}`,
    );
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    const allowed = await caregiver.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/measurements?from=${encodeURIComponent(new Date(Date.now() - 23 * 3600 * 1000).toISOString())}`,
    );
    expect(allowed.status).toBe(200);
  });

  it('caregiver thiếu canViewMeasurements: measurements/daily/export/insights 403 rõ nghĩa; cảnh báo vẫn 200; owner không đổi', async () => {
    const fixture = await createClaimedDevice(ctx, admin, owner, 'Hồ sơ tắt quyền số đo');
    await send(
      ctx,
      fixture,
      makeEnvelope(fixture.deviceId, {
        measured_at: new Date(Date.now() - 60_000).toISOString(),
        metrics: { heart_rate_bpm: 81, steps_since_boot: 120 },
      }),
    );

    const caregiver = await registerUser(ctx.app);
    await ctx.db.insert(careLinks).values({
      subjectId: fixture.subjectId,
      caregiverUserId: caregiver.session.user.id,
      invitedByUserId: owner.session.user.id,
      permissions: {
        historyDays: 7,
        canReceiveAlerts: true,
        canAcknowledge: false,
        canResolve: false,
        canViewAi: false,
        canViewMeasurements: false,
      },
      status: 'active',
      sharedFrom: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });

    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();
    const endpoints = [
      `/api/v1/subjects/${fixture.subjectId}/measurements?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      `/api/v1/subjects/${fixture.subjectId}/daily-summary?date=2026-11-13`,
      `/api/v1/subjects/${fixture.subjectId}/export.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      `/api/v1/subjects/${fixture.subjectId}/insights?days=7`,
    ];
    for (const path of endpoints) {
      const denied = await caregiver.agent.get(path);
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe('FORBIDDEN');
      // 403 nghiệp vụ, không phải 404 giả như thể hồ sơ không tồn tại.
      expect(denied.body.message).toBe('Chủ hồ sơ không chia sẻ số đo và lịch sử với bạn.');
      expect(denied.body.details).toMatchObject({ reason: 'measurements_not_shared' });
    }

    // Cảnh báo và trạng thái thiết bị vẫn theo quyền cũ, không bị chặn bởi quyền số đo.
    const alerts = await caregiver.agent.get(`/api/v1/subjects/${fixture.subjectId}/alerts`);
    expect(alerts.status).toBe(200);
    expect(alerts.body.items).toEqual([]);

    // Chủ hồ sơ không bị ảnh hưởng.
    const ownerList = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/measurements?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.items).toHaveLength(1);
    expect(ownerList.body.items[0].heartRateBpm).toBe(81);
    const ownerSummary = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/daily-summary?date=2026-11-13`,
    );
    expect(ownerSummary.status).toBe(200);
    const ownerInsights = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/insights?days=7`,
    );
    expect(ownerInsights.status).toBe(200);
  });

  it('link cũ thiếu canViewMeasurements vẫn xem được số đo (mặc định true, không migration)', async () => {
    const fixture = await createClaimedDevice(ctx, admin, owner, 'Hồ sơ link cũ');
    await send(
      ctx,
      fixture,
      makeEnvelope(fixture.deviceId, {
        measured_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    const caregiver = await registerUser(ctx.app);
    await ctx.db.insert(careLinks).values({
      subjectId: fixture.subjectId,
      caregiverUserId: caregiver.session.user.id,
      invitedByUserId: owner.session.user.id,
      // Không có `canViewMeasurements`: hành vi cũ là được xem số đo.
      permissions: {
        historyDays: 7,
        canReceiveAlerts: false,
        canAcknowledge: false,
        canResolve: false,
        canViewAi: false,
      },
      status: 'active',
      sharedFrom: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });

    const list = await caregiver.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/measurements?from=${encodeURIComponent(new Date(Date.now() - 60 * 60 * 1000).toISOString())}`,
    );
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    const insights = await caregiver.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/insights?days=7`,
    );
    expect(insights.status).toBe(200);
  });

  it('daily-summary: HR chỉ mẫu valid, steps delta trong boot, incidents và coverage', async () => {
    const fixture = await createClaimedDevice(ctx, admin, owner, 'Hồ sơ tổng hợp');
    // Ngày 2026-11-13 theo Asia/Ho_Chi_Minh = 2026-11-12T17:00Z → 2026-11-13T17:00Z.
    const dayTimes = ['2026-11-13T03:00:00Z', '2026-11-13T03:00:15Z', '2026-11-13T03:00:30Z'];
    const hr = [70, 80, 90];
    const steps = [100, 140, 190];
    for (let i = 0; i < dayTimes.length; i += 1) {
      await send(
        ctx,
        fixture,
        makeEnvelope(fixture.deviceId, {
          sequence: i,
          boot_id: 'boot-sum',
          measured_at: dayTimes[i],
          metrics: { heart_rate_bpm: hr[i]!, steps_since_boot: steps[i]! },
        }),
      );
    }
    await ctx.db.insert(incidents).values([
      {
        subjectId: fixture.subjectId,
        assignmentId: fixture.assignmentId,
        deviceId: fixture.deviceId,
        deviceIncidentId: 'inc-1',
        type: 'fall',
        state: 'open',
        lastRevision: 1,
        detectedAt: new Date('2026-11-13T04:00:00Z'),
      },
      {
        subjectId: fixture.subjectId,
        assignmentId: fixture.assignmentId,
        deviceId: fixture.deviceId,
        deviceIncidentId: 'inc-2',
        type: 'fall',
        state: 'resolved',
        lastRevision: 2,
        detectedAt: new Date('2026-11-13T04:30:00Z'),
      },
    ]);

    const response = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/daily-summary?date=2026-11-13`,
    );
    expect(response.status).toBe(200);
    expect(response.body.date).toBe('2026-11-13');
    expect(response.body.timezone).toBe('Asia/Ho_Chi_Minh');
    expect(response.body.heartRate).toEqual({ avg: 80, min: 70, max: 90, validSamples: 3, invalidSamples: 0 });
    expect(response.body.steps).toEqual({ total: 90, completeness: 'complete', notes: [] });
    expect(response.body.incidents).toEqual({ total: 2, resolved: 1 });
    expect(response.body.coverage.observedCount).toBe(3);
    expect(response.body.coverage.expectedCount).toBe(5760);
    expect(response.body.lastSeenAt).toBe('2026-11-13T03:00:30.000Z');
    expect(response.body.batteryPercent).toBe(60);
    expect(response.body.source).toBe('device');
  });

  it('daily-summary steps: khoảng mất dữ liệu dài → partial, không cộng bước bắc gap', async () => {
    const fixture = await createClaimedDevice(ctx, admin, owner, 'Hồ sơ bước qua gap');
    const points = [
      { at: '2026-11-13T03:00:00Z', steps: 100 },
      { at: '2026-11-13T03:00:15Z', steps: 120 },
      // Cách mốc trước 2h55 — dài hơn ngưỡng gap; delta 300 không được cộng.
      { at: '2026-11-13T06:00:00Z', steps: 420 },
      { at: '2026-11-13T06:00:15Z', steps: 440 },
    ];
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index]!;
      await send(
        ctx,
        fixture,
        makeEnvelope(fixture.deviceId, {
          sequence: index,
          boot_id: 'boot-gap-steps',
          measured_at: point.at,
          metrics: { heart_rate_bpm: 70, steps_since_boot: point.steps },
        }),
      );
    }

    const response = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/daily-summary?date=2026-11-13`,
    );
    expect(response.status).toBe(200);
    expect(response.body.steps.total).toBe(40);
    expect(response.body.steps.completeness).toBe('partial');
    expect(response.body.steps.notes.join(' ')).toMatch(/mất dữ liệu/i);
  });

  it('daily-summary: không mẫu HR hợp lệ → heartRate null; ngày tương lai bị 422', async () => {
    const fixture = await createClaimedDevice(ctx, admin, owner, 'Hồ sơ HR rỗng');
    for (let i = 0; i < 3; i += 1) {
      await send(
        ctx,
        fixture,
        makeEnvelope(fixture.deviceId, {
          sequence: i,
          boot_id: 'boot-hr',
          measured_at: `2026-11-13T05:0${i}:00Z`,
          metrics: { heart_rate_bpm: null, steps_since_boot: 10 * i },
          quality: { heart_rate: 'poor_signal', motion: 'valid' },
        }),
      );
    }
    const response = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/daily-summary?date=2026-11-13`,
    );
    expect(response.status).toBe(200);
    expect(response.body.heartRate).toBeNull();
    expect(response.body.steps.total).toBe(20);

    const future = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/daily-summary?date=${localDateKey(
        new Date(Date.now() + 2 * 24 * 3600 * 1000),
        'Asia/Ho_Chi_Minh',
      )}`,
    );
    expect(future.status).toBe(422);
  });

  it('daily-summary steps: reset counter không tạo số âm, đánh dấu partial; nhiều boot cộng riêng', async () => {
    // Boot có reset: 100 → 140 → 90 (reset) → 130.
    const resetFixture = await createClaimedDevice(ctx, admin, owner, 'Hồ sơ reset');
    const resetSteps = [100, 140, 90, 130];
    for (let i = 0; i < resetSteps.length; i += 1) {
      await send(
        ctx,
        resetFixture,
        makeEnvelope(resetFixture.deviceId, {
          sequence: i,
          boot_id: 'boot-r',
          measured_at: `2026-11-13T06:0${i}:00Z`,
          metrics: { heart_rate_bpm: null, steps_since_boot: resetSteps[i]! },
          quality: { heart_rate: 'sensor_error', motion: 'valid' },
        }),
      );
    }
    const resetRes = await owner.agent.get(
      `/api/v1/subjects/${resetFixture.subjectId}/daily-summary?date=2026-11-13`,
    );
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.steps.total).toBe(80);
    expect(resetRes.body.steps.completeness).toBe('partial');
    expect(resetRes.body.steps.notes.length).toBeGreaterThan(0);

    // Nhiều boot trong ngày: cộng delta từng boot, mẫu đầu boot không suy ra delta.
    const multiFixture = await createClaimedDevice(ctx, admin, owner, 'Hồ sơ nhiều boot');
    const multiRows: Array<{ boot: string; steps: number }> = [
      { boot: 'boot-a', steps: 100 },
      { boot: 'boot-a', steps: 140 },
      { boot: 'boot-b', steps: 0 },
      { boot: 'boot-b', steps: 30 },
    ];
    for (let i = 0; i < multiRows.length; i += 1) {
      await send(
        ctx,
        multiFixture,
        makeEnvelope(multiFixture.deviceId, {
          sequence: i,
          boot_id: multiRows[i]!.boot,
          measured_at: `2026-11-13T07:0${i}:00Z`,
          metrics: { heart_rate_bpm: null, steps_since_boot: multiRows[i]!.steps },
          quality: { heart_rate: 'sensor_error', motion: 'valid' },
        }),
      );
    }
    const multiRes = await owner.agent.get(
      `/api/v1/subjects/${multiFixture.subjectId}/daily-summary?date=2026-11-13`,
    );
    expect(multiRes.status).toBe(200);
    expect(multiRes.body.steps).toEqual({ total: 70, completeness: 'complete', notes: [] });
  });

  it('export.csv: đúng header, có BOM, có audit, từ chối khi không quyền', async () => {
    const fixture = await createClaimedDevice(ctx, admin, owner, 'Hồ sơ export');
    const base = Date.now() - 3600 * 1000;
    await send(ctx, fixture, makeEnvelope(fixture.deviceId, {
      sequence: 0,
      measured_at: new Date(base).toISOString(),
      metrics: { heart_rate_bpm: 66, steps_since_boot: 7 },
    }));
    await send(ctx, fixture, makeEnvelope(fixture.deviceId, {
      sequence: 1,
      measured_at: null,
      clock_status: 'unsynced',
      metrics: { heart_rate_bpm: null, steps_since_boot: 7 },
      quality: { heart_rate: 'not_worn', motion: 'valid' },
    }));

    const from = new Date(base - 2_000).toISOString();
    const to = new Date().toISOString();
    const response = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/export.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment');

    const text: string = response.text;
    expect(text.startsWith('\uFEFF')).toBe(true);
    const lines = text.replace(/^\uFEFF/, '').split('\r\n');
    expect(lines[0]).toBe(CSV_HEADER.join(','));
    expect(lines).toHaveLength(3); // header + 2 dòng dữ liệu
    const unsyncedLine = lines.find((line) => line.startsWith(','));
    expect(unsyncedLine).toBeTruthy(); // measured_at rỗng cho bản ghi unsynced
    const firstLine = lines[1];
    expect(firstLine).toBeTruthy();
    expect(firstLine).toContain('66');
    expect(firstLine!.endsWith(',false')).toBe(true); // is_synthetic=false

    const auditRows = await ctx.db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, 'measurement.export'),
          eq(auditLogs.targetId, fixture.subjectId),
        ),
      );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.targetId).toBe(fixture.subjectId);
    expect(auditRows[0]?.outcome).toBe('success');

    const stranger = await registerUser(ctx.app);
    const denied = await stranger.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/export.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    expect(denied.status).toBe(404);
  });

  it('mẫu tương lai: quá dung sai bị cách ly, trong dung sai chưa được tính; list/daily/export không vượt hiện tại', async () => {
    const fixture = await createClaimedDevice(ctx, admin, owner, 'Hồ sơ tương lai');
    const now = Date.now();
    const normalAt = new Date(now - 2 * 60 * 1000);
    await send(
      ctx,
      fixture,
      makeEnvelope(fixture.deviceId, {
        sequence: 0,
        measured_at: normalAt.toISOString(),
        metrics: { heart_rate_bpm: 72, steps_since_boot: 10 },
        battery_percent: 60,
      }),
    );

    // Vượt MAX_CLOCK_SKEW_SECONDS mặc định (120 s) → cách ly.
    const futureBeyond = new Date(now + 10 * 60 * 1000);
    const far = await sendRaw(
      ctx,
      fixture,
      makeEnvelope(fixture.deviceId, {
        sequence: 1,
        measured_at: futureBeyond.toISOString(),
        metrics: { heart_rate_bpm: 200, steps_since_boot: 9999 },
        battery_percent: 100,
      }),
    );
    expect(far.status).toBe(202);
    expect(far.body.code).toBe('QUARANTINED');

    // Trong dung sai đồng hồ: được lưu bình thường nhưng chưa được đọc cho tới
    // khi `now` đi qua measured_at.
    const futureWithin = new Date(now + 90 * 1000);
    const near = await sendRaw(
      ctx,
      fixture,
      makeEnvelope(fixture.deviceId, {
        sequence: 2,
        measured_at: futureWithin.toISOString(),
        metrics: { heart_rate_bpm: 180, steps_since_boot: 8888 },
        battery_percent: 99,
      }),
    );
    expect(near.status).toBe(202);
    expect(near.body.status).toBe('accepted');
    expect(near.body.code).toBeNull();

    const rows = await ctx.db
      .select()
      .from(telemetry)
      .where(eq(telemetry.deviceId, fixture.deviceId));
    const bySequence = new Map(rows.map((row) => [row.sequence, row]));
    expect(bySequence.get(1)?.isQuarantined).toBe(true);
    expect(bySequence.get(2)?.isQuarantined).toBe(false);

    const from = new Date(now - 3600 * 1000).toISOString();
    const to = new Date(now + 20 * 60 * 1000).toISOString();
    const list = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/measurements?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].measuredAt).toBe(normalAt.toISOString());
    expect(list.body.coverage.observedCount).toBe(1);
    expect(list.body.coverage.percent).toBeLessThanOrEqual(100);

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const summary = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/daily-summary?date=${today}`,
    );
    expect(summary.status).toBe(200);
    expect(summary.body.coverage.percent).toBeLessThanOrEqual(100);
    if (summary.body.lastSeenAt !== null) {
      expect(Date.parse(summary.body.lastSeenAt)).toBeLessThanOrEqual(Date.now());
    }
    expect(summary.body.heartRate?.max ?? null).not.toBe(200);
    expect(summary.body.steps.total).not.toBe(9999);
    expect(summary.body.batteryPercent).not.toBe(100);

    const csv = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/export.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    expect(csv.status).toBe(200);
    const csvLines = csv.text.replace(/^\uFEFF/, '').split('\r\n');
    expect(csvLines).toHaveLength(2);
    expect(csv.text).not.toContain(futureBeyond.toISOString());
    expect(csv.text).not.toContain(futureWithin.toISOString());
    expect(csvLines[1]?.startsWith(normalAt.toISOString())).toBe(true);
  });

  it('cursor không hợp lệ bị 422; khoảng > 31 ngày bị 422', async () => {
    const fixture = await createClaimedDevice(ctx, admin, owner);
    const badCursor = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/measurements?cursor=${encodeURIComponent('khong-hop-le')}`,
    );
    expect(badCursor.status).toBe(422);

    const tooLong = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/measurements?from=${encodeURIComponent(new Date(Date.now() - 32 * 24 * 3600 * 1000).toISOString())}`,
    );
    expect(tooLong.status).toBe(422);
  });
});
