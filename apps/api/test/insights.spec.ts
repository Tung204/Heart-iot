import request from 'supertest';
import type { TelemetryEnvelope } from '@annhien/contracts/telemetry';
import { insightsResponseSchema } from '@annhien/contracts/insights';
import { DEFAULT_CARE_PERMISSIONS } from '@annhien/contracts';
import { DevicesModule } from '../src/devices/devices.module';
import { IngestModule } from '../src/ingest/ingest.module';
import { MeasurementsModule } from '../src/measurements/measurements.module';
import { coverageCounts } from '../src/measurements/insights';
import { PolicyModule } from '../src/policy/policy.module';
import { careLinks, incidents, subjects, telemetry } from '../src/database/schema';
import {
  createAdmin,
  createModuleTestApp,
  registerUser,
  TEST_ORIGIN,
  type TestContext,
  type TestUser,
} from './test-app';

/**
 * Xu hướng 7/14/30 ngày (FR-05):
 * - đúng số ngày, thứ tự cũ→mới, hôm nay chỉ tính tới hiện tại;
 * - ngày thiếu mẫu: heartRate null, bước unavailable, coverage 0/0 (không số 0 giả);
 * - chỉ mẫu heart_rate = valid; bước theo delta từng boot (reset/gap → partial);
 * - mốc chia sẻ/historyDays cắt dữ liệu, ngày trước mốc vẫn trả về dạng rỗng;
 * - synthetic được ghi nhãn; 1 query telemetry + 1 query incidents cho cả cửa sổ.
 */

const UTC = 'UTC';

let serialCounter = 0;
const nextSerial = () => `DEV-INS-${String(++serialCounter).padStart(4, '0')}`;

type Fixture = { subjectId: string; deviceId: string; deviceKey: string; assignmentId: string };

async function createSubject(
  ctx: TestContext,
  ownerUserId: string,
  timezone = UTC,
  displayName = 'Bà An',
) {
  const rows = await ctx.db
    .insert(subjects)
    .values({ ownerUserId, displayName, timezone })
    .returning();
  const subject = rows[0];
  if (!subject) throw new Error('Không tạo được subject.');
  return subject;
}

async function createClaimedDevice(
  ctx: TestContext,
  admin: TestUser,
  owner: TestUser,
  timezone = UTC,
): Promise<Fixture> {
  const subject = await createSubject(ctx, owner.session.user.id, timezone);
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
  return {
    subjectId: subject.id,
    deviceId: created.body.device.id,
    deviceKey: created.body.deviceKey,
    assignmentId: claimed.body.assignmentId,
  };
}

function makeEnvelope(
  deviceId: string,
  overrides: Partial<TelemetryEnvelope> = {},
): TelemetryEnvelope {
  return {
    schema_version: '1.0',
    message_id: crypto.randomUUID(),
    device_id: deviceId,
    boot_id: 'boot-ins',
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

async function send(
  ctx: TestContext,
  fixture: Fixture,
  envelope: TelemetryEnvelope,
): Promise<void> {
  const response = await request(ctx.app.getHttpServer())
    .post('/api/v1/ingest/telemetry')
    .set('x-device-id', fixture.deviceId)
    .set('x-device-key', fixture.deviceKey)
    .send(envelope);
  expect(response.status).toBe(202);
  expect(response.body.status).toBe('accepted');
}

/** Ngày UTC YYYY-MM-DD — test tự tính, không dùng helper của implementation. */
function utcDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: UTC,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function addDays(date: string, offset: number): string {
  const [year, month, day] = date.split('-').map((value) => Number(value));
  return new Date(Date.UTC(year!, month! - 1, day! + offset)).toISOString().slice(0, 10);
}

function utcMidnight(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function at(date: string, time: string): string {
  return `${date}T${time}Z`;
}

type InsightDayBody = {
  date: string;
  hasData: boolean;
  source: string;
  heartRate: null | { avg: number; min: number; max: number; validSamples: number };
  steps: { total: number; completeness: string };
  coverage: { percent: number; observedCount: number; expectedCount: number };
  incidents: { total: number; resolved: number };
};

function dayByDate(body: { days: InsightDayBody[] }, date: string): InsightDayBody {
  const found = body.days.find((day) => day.date === date);
  if (!found) throw new Error(`Không có ngày ${date} trong response.`);
  return found;
}

describe('Xu hướng: GET /subjects/:id/insights', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let owner: TestUser;
  let today: string;

  beforeAll(async () => {
    delete process.env.MQTT_URL;
    ctx = await createModuleTestApp([
      DevicesModule,
      IngestModule,
      MeasurementsModule,
      PolicyModule,
    ]);
    admin = await createAdmin(ctx.app);
    owner = await registerUser(ctx.app, { displayName: 'Chủ hồ sơ' });
    today = utcDate(new Date());
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('mặc định 7 ngày: đúng số ngày, thứ tự cũ→mới, hôm nay chỉ tính tới hiện tại', async () => {
    const fixture = await createClaimedDevice(ctx, admin, owner);
    const dayStart = utcMidnight(today);
    const now = new Date();
    const todaySample = new Date(
      dayStart.getTime() + Math.max(1, Math.floor((now.getTime() - dayStart.getTime()) / 2)),
    );
    await send(
      ctx,
      fixture,
      makeEnvelope(fixture.deviceId, {
        sequence: 0,
        measured_at: todaySample.toISOString(),
        metrics: { heart_rate_bpm: 72, steps_since_boot: 10 },
      }),
    );
    const twoDaysAgo = addDays(today, -2);
    await send(
      ctx,
      fixture,
      makeEnvelope(fixture.deviceId, {
        sequence: 1,
        measured_at: at(twoDaysAgo, '10:00:00'),
        metrics: { heart_rate_bpm: 68, steps_since_boot: 100 },
      }),
    );

    const response = await owner.agent.get(`/api/v1/subjects/${fixture.subjectId}/insights`);
    expect(response.status).toBe(200);
    expect(insightsResponseSchema.safeParse(response.body).success).toBe(true);

    expect(response.body.subjectId).toBe(fixture.subjectId);
    expect(response.body.timezone).toBe(UTC);
    expect(response.body.days).toHaveLength(7);
    const expectedDates = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
    expect(response.body.days.map((day: { date: string }) => day.date)).toEqual(expectedDates);
    expect(response.body.from).toBe(utcMidnight(expectedDates[0]!).toISOString());
    const toMs = new Date(response.body.to).getTime();
    expect(toMs).toBeLessThanOrEqual(Date.now());
    expect(Date.now() - toMs).toBeLessThan(5_000);

    const todayDay = dayByDate(response.body, today);
    expect(todayDay.hasData).toBe(true);
    expect(todayDay.heartRate).toMatchObject({ validSamples: 1 });
    expect(todayDay.coverage.observedCount).toBe(1);
    expect(todayDay.coverage.expectedCount).toBeGreaterThan(0);
    expect(todayDay.coverage.percent).toBeGreaterThan(0);
    expect(todayDay.coverage.percent).toBeLessThanOrEqual(100);
    // Chỉ một mốc của boot → không suy ra delta bước.
    expect(todayDay.steps).toEqual({ total: 0, completeness: 'partial' });

    const twoDaysAgoDay = dayByDate(response.body, twoDaysAgo);
    expect(twoDaysAgoDay.hasData).toBe(true);
    expect(twoDaysAgoDay.heartRate).toEqual({
      avg: 68,
      min: 68,
      max: 68,
      validSamples: 1,
    });
    // Ngày đủ 24 giờ với heartbeat 15s → 5760 snapshot kỳ vọng.
    expect(twoDaysAgoDay.coverage.expectedCount).toBe(5760);

    // Ngày không có mẫu nhưng vẫn trong quyền xem: expected theo policy, không số 0 giả.
    const missing = dayByDate(response.body, addDays(today, -1));
    expect(missing).toEqual({
      date: addDays(today, -1),
      hasData: false,
      source: 'device',
      heartRate: null,
      steps: { total: 0, completeness: 'unavailable' },
      coverage: { percent: 0, observedCount: 0, expectedCount: 5760 },
      incidents: { total: 0, resolved: 0 },
    });

    expect(response.body.summary).toMatchObject({
      dataDays: 2,
      totalSteps: 0,
      syntheticDays: 0,
      incidentsTotal: 0,
      incidentsResolved: 0,
    });
    expect(response.body.notes.length).toBeLessThanOrEqual(3);
    expect(response.body.notes.join(' ')).toMatch(/5\/7 ngày không có mẫu đo/);
  });

  it('ngày theo timezone hồ sơ (Asia/Ho_Chi_Minh), không theo ngày UTC của máy chủ', async () => {
    const fixture = await createClaimedDevice(ctx, admin, owner, 'Asia/Ho_Chi_Minh');
    const localToday = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const yesterday = addDays(localToday, -1);
    // 00:00:01 +07 nằm ở ngày UTC hôm trước; đúng phải thuộc ngày local hôm qua.
    await send(ctx, fixture, makeEnvelope(fixture.deviceId, {
      sequence: 0,
      boot_id: 'boot-tz',
      measured_at: `${yesterday}T00:00:01+07:00`,
      metrics: { heart_rate_bpm: 61, steps_since_boot: 0 },
    }));
    await send(ctx, fixture, makeEnvelope(fixture.deviceId, {
      sequence: 1,
      boot_id: 'boot-tz',
      measured_at: `${yesterday}T23:59:59+07:00`,
      metrics: { heart_rate_bpm: 63, steps_since_boot: 10 },
    }));

    const response = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/insights?days=7`,
    );
    expect(response.status).toBe(200);
    expect(response.body.timezone).toBe('Asia/Ho_Chi_Minh');
    expect(response.body.days[response.body.days.length - 1].date).toBe(localToday);

    const yesterdayDay = dayByDate(response.body, yesterday);
    expect(yesterdayDay.hasData).toBe(true);
    expect(yesterdayDay.heartRate).toEqual({ avg: 62, min: 61, max: 63, validSamples: 2 });
    expect(yesterdayDay.coverage.expectedCount).toBe(5760);
    expect(dayByDate(response.body, addDays(localToday, -2)).hasData).toBe(false);
  });

  it('days=14/30 trả đúng số ngày; days ngoài 7..30 hoặc tham số lạ → 400', async () => {
    const fixture = await createClaimedDevice(ctx, admin, owner);

    for (const days of [14, 30]) {
      const response = await owner.agent.get(
        `/api/v1/subjects/${fixture.subjectId}/insights?days=${days}`,
      );
      expect(response.status).toBe(200);
      expect(response.body.days).toHaveLength(days);
      expect(response.body.days[0].date).toBe(addDays(today, -(days - 1)));
      expect(response.body.days[days - 1].date).toBe(today);
      expect(response.body.from).toBe(
        utcMidnight(addDays(today, -(days - 1))).toISOString(),
      );
    }

    for (const days of [6, 31, 0, -1]) {
      const response = await owner.agent.get(
        `/api/v1/subjects/${fixture.subjectId}/insights?days=${days}`,
      );
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
    }

    const notNumber = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/insights?days=abc`,
    );
    expect(notNumber.status).toBe(400);

    const unknownParam = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/insights?days=7&foo=1`,
    );
    expect(unknownParam.status).toBe(400);
  });

  it('quyền: chưa đăng nhập 401, người ngoài 404, caregiver trước sharedFrom/historyDays bị cắt (không 403)', async () => {
    const fixture = await createClaimedDevice(ctx, admin, owner);
    const now = new Date();
    const dayStart = utcMidnight(today);
    const todaySample = new Date(
      dayStart.getTime() + Math.max(1, Math.floor((now.getTime() - dayStart.getTime()) / 2)),
    );
    const fourDaysAgo = addDays(today, -4);
    await send(
      ctx,
      fixture,
      makeEnvelope(fixture.deviceId, {
        sequence: 0,
        boot_id: 'boot-share-1',
        measured_at: at(fourDaysAgo, '10:00:00'),
        metrics: { heart_rate_bpm: 120, steps_since_boot: 10 },
      }),
    );
    await send(
      ctx,
      fixture,
      makeEnvelope(fixture.deviceId, {
        sequence: 1,
        boot_id: 'boot-share-2',
        measured_at: todaySample.toISOString(),
        metrics: { heart_rate_bpm: 80, steps_since_boot: 10 },
      }),
    );
    // Incident trước mốc chia sẻ và incident hôm nay.
    await ctx.db.insert(incidents).values([
      {
        subjectId: fixture.subjectId,
        assignmentId: fixture.assignmentId,
        deviceId: fixture.deviceId,
        deviceIncidentId: 'inc-before-share',
        type: 'fall',
        state: 'open',
        lastRevision: 1,
        detectedAt: new Date(at(fourDaysAgo, '11:00:00')),
      },
      {
        subjectId: fixture.subjectId,
        assignmentId: fixture.assignmentId,
        deviceId: fixture.deviceId,
        deviceIncidentId: 'inc-today',
        type: 'sos',
        state: 'resolved',
        lastRevision: 2,
        detectedAt: new Date(todaySample.getTime() - 1_000),
      },
    ]);

    // 1) Chưa đăng nhập → 401.
    const anonymous = await request(ctx.app.getHttpServer()).get(
      `/api/v1/subjects/${fixture.subjectId}/insights`,
    );
    expect(anonymous.status).toBe(401);

    // 2) Người không có link → 404 (không dò tồn tại hồ sơ).
    const stranger = await registerUser(ctx.app);
    const outsider = await stranger.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/insights`,
    );
    expect(outsider.status).toBe(404);

    // 3) Caregiver: sharedFrom = 12:00 của ngày today-2, historyDays 30.
    const caregiver = await registerUser(ctx.app);
    const sharedFrom = new Date(utcMidnight(addDays(today, -2)).getTime() + 12 * 3600 * 1000);
    await ctx.db.insert(careLinks).values({
      subjectId: fixture.subjectId,
      caregiverUserId: caregiver.session.user.id,
      invitedByUserId: owner.session.user.id,
      permissions: { ...DEFAULT_CARE_PERMISSIONS, historyDays: 30 },
      status: 'active',
      sharedFrom,
    });

    const response = await caregiver.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/insights?days=7`,
    );
    expect(response.status).toBe(200);
    expect(response.body.days).toHaveLength(7);
    expect(insightsResponseSchema.safeParse(response.body).success).toBe(true);

    // Ngày hoàn toàn trước mốc chia sẻ: rỗng, coverage 0/0, không lộ mẫu/incident.
    for (let offset = -6; offset <= -3; offset += 1) {
      const hidden = dayByDate(response.body, addDays(today, offset));
      expect(hidden).toMatchObject({
        hasData: false,
        heartRate: null,
        steps: { total: 0, completeness: 'unavailable' },
        coverage: { percent: 0, observedCount: 0, expectedCount: 0 },
        incidents: { total: 0, resolved: 0 },
      });
    }

    // Ngày có mốc chia sẻ ở giữa: chỉ tính từ 12:00 → 12 giờ / 15 giây = 2880.
    const sharedDay = dayByDate(response.body, addDays(today, -2));
    expect(sharedDay.hasData).toBe(false);
    expect(sharedDay.coverage).toEqual({
      percent: 0,
      observedCount: 0,
      expectedCount: 2880,
    });

    // Mẫu HR 120 của ngày today-4 không được rò rỉ vào tổng hợp.
    expect(response.body.summary.avgHeartRate).toBe(80);
    expect(dayByDate(response.body, today).incidents).toEqual({ total: 1, resolved: 1 });
    expect(response.body.summary.incidentsTotal).toBe(1);

    // 4) historyDays = 1 cắt thêm: today-2 trở về trước rỗng dù sharedFrom cũ.
    const shortHistory = await registerUser(ctx.app);
    await ctx.db.insert(careLinks).values({
      subjectId: fixture.subjectId,
      caregiverUserId: shortHistory.session.user.id,
      invitedByUserId: owner.session.user.id,
      permissions: { ...DEFAULT_CARE_PERMISSIONS, historyDays: 1 },
      status: 'active',
      sharedFrom: new Date(Date.now() - 10 * 24 * 3600 * 1000),
    });
    const short = await shortHistory.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/insights?days=7`,
    );
    expect(short.status).toBe(200);
    expect(dayByDate(short.body, addDays(today, -2)).coverage).toEqual({
      percent: 0,
      observedCount: 0,
      expectedCount: 0,
    });
    expect(dayByDate(short.body, today).hasData).toBe(true);
  });

  it('nhịp tim chỉ mẫu valid; synthetic được ghi nhãn; incidents theo detectedAt', async () => {
    const fixture = await createClaimedDevice(ctx, admin, owner);
    const dayStart = utcMidnight(today);
    const now = new Date();
    const firstToday = new Date(
      dayStart.getTime() + Math.max(1, Math.floor((now.getTime() - dayStart.getTime()) / 3)),
    );
    const secondToday = new Date(firstToday.getTime() + 1_000);
    const thirdToday = new Date(firstToday.getTime() + 2_000);
    const fourthToday = new Date(firstToday.getTime() + 3_000);

    await send(ctx, fixture, makeEnvelope(fixture.deviceId, {
      sequence: 0,
      boot_id: 'boot-hr',
      measured_at: firstToday.toISOString(),
      metrics: { heart_rate_bpm: 70, steps_since_boot: 10 },
    }));
    await send(ctx, fixture, makeEnvelope(fixture.deviceId, {
      sequence: 1,
      boot_id: 'boot-hr',
      measured_at: secondToday.toISOString(),
      metrics: { heart_rate_bpm: 90, steps_since_boot: 20 },
    }));
    await send(ctx, fixture, makeEnvelope(fixture.deviceId, {
      sequence: 2,
      boot_id: 'boot-hr',
      measured_at: thirdToday.toISOString(),
      metrics: { heart_rate_bpm: null, steps_since_boot: 30 },
      quality: { heart_rate: 'poor_signal', motion: 'valid' },
    }));
    await send(ctx, fixture, makeEnvelope(fixture.deviceId, {
      sequence: 3,
      boot_id: 'boot-hr',
      measured_at: fourthToday.toISOString(),
      metrics: { heart_rate_bpm: null, steps_since_boot: 40 },
      quality: { heart_rate: 'not_worn', motion: 'valid' },
    }));

    // Ngày có mẫu nhưng không mẫu nhịp tim hợp lệ → heartRate null.
    const yesterday = addDays(today, -1);
    await send(ctx, fixture, makeEnvelope(fixture.deviceId, {
      sequence: 0,
      boot_id: 'boot-no-hr',
      measured_at: at(yesterday, '09:00:00'),
      metrics: { heart_rate_bpm: null, steps_since_boot: 5 },
      quality: { heart_rate: 'sensor_error', motion: 'valid' },
    }));

    // Mẫu ghi thẳng DB với source mô phỏng (ingest HTTP luôn ghi 'http').
    const syntheticDay = addDays(today, -2);
    await ctx.db.insert(telemetry).values({
      messageId: crypto.randomUUID(),
      deviceId: fixture.deviceId,
      assignmentId: fixture.assignmentId,
      bootId: 'boot-synthetic',
      sequence: 0,
      measuredAt: new Date(at(syntheticDay, '10:00:00')),
      receivedAt: new Date(),
      clockStatus: 'synced',
      uptimeMs: 1_000,
      metrics: { heart_rate_bpm: 55, steps_since_boot: 10 },
      quality: { heart_rate: 'valid', motion: 'valid' },
      batteryPercent: 50,
      firmwareVersion: '0.1.0-demo',
      isLate: false,
      isQuarantined: false,
      payloadHash: 'synthetic-hash-insights',
      source: 'simulator',
    });

    await ctx.db.insert(incidents).values([
      {
        subjectId: fixture.subjectId,
        assignmentId: fixture.assignmentId,
        deviceId: fixture.deviceId,
        deviceIncidentId: 'inc-open',
        type: 'fall',
        state: 'open',
        lastRevision: 1,
        detectedAt: new Date(firstToday.getTime() - 2_000),
      },
      {
        subjectId: fixture.subjectId,
        assignmentId: fixture.assignmentId,
        deviceId: fixture.deviceId,
        deviceIncidentId: 'inc-resolved',
        type: 'fall',
        state: 'resolved',
        lastRevision: 2,
        detectedAt: new Date(firstToday.getTime() - 1_000),
      },
      {
        subjectId: fixture.subjectId,
        assignmentId: fixture.assignmentId,
        deviceId: fixture.deviceId,
        deviceIncidentId: 'inc-yesterday',
        type: 'sos',
        state: 'open',
        lastRevision: 1,
        detectedAt: new Date(at(yesterday, '09:30:00')),
      },
    ]);

    const response = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/insights?days=7`,
    );
    expect(response.status).toBe(200);
    expect(insightsResponseSchema.safeParse(response.body).success).toBe(true);

    const todayDay = dayByDate(response.body, today);
    expect(todayDay.heartRate).toEqual({ avg: 80, min: 70, max: 90, validSamples: 2 });
    expect(todayDay.incidents).toEqual({ total: 2, resolved: 1 });
    expect(todayDay.source).toBe('device');

    const noHrDay = dayByDate(response.body, yesterday);
    expect(noHrDay.hasData).toBe(true);
    expect(noHrDay.heartRate).toBeNull();
    expect(noHrDay.incidents).toEqual({ total: 1, resolved: 0 });

    const synthetic = dayByDate(response.body, syntheticDay);
    expect(synthetic.hasData).toBe(true);
    expect(synthetic.source).toBe('synthetic');
    expect(synthetic.heartRate).toEqual({ avg: 55, min: 55, max: 55, validSamples: 1 });

    expect(response.body.summary).toMatchObject({
      dataDays: 3,
      avgHeartRate: 71.7,
      incidentsTotal: 3,
      incidentsResolved: 1,
      syntheticDays: 1,
    });
    expect(response.body.notes.join(' ')).toMatch(/dữ liệu mô phỏng/);
    // `notes` tối đa 3 câu: ngày thiếu mẫu + mô phỏng + bước một phần đã đủ ngân sách.
    expect(response.body.notes.length).toBeLessThanOrEqual(3);
  });

  it('bước: cộng delta từng boot, reset counter/gap → partial, không mẫu tin cậy → unavailable', async () => {
    const fixture = await createClaimedDevice(ctx, admin, owner);
    const sequence = new Map<string, number>();
    const push = async (boot: string, measuredAt: string, steps: number, motion: 'valid' | 'sensor_error' = 'valid') => {
      const next = sequence.get(boot) ?? 0;
      sequence.set(boot, next + 1);
      await send(ctx, fixture, makeEnvelope(fixture.deviceId, {
        sequence: next,
        boot_id: boot,
        measured_at: measuredAt,
        metrics: { heart_rate_bpm: null, steps_since_boot: steps },
        quality: { heart_rate: 'sensor_error', motion },
      }));
    };

    // today-6: không có mẫu → unavailable.
    const day6 = addDays(today, -6);
    // today-5: motion sensor_error → không tin cậy, unavailable dù có mẫu.
    const day5 = addDays(today, -5);
    await push('boot-sensor', at(day5, '01:00:00'), 10, 'sensor_error');
    await push('boot-sensor', at(day5, '01:15:00'), 100, 'sensor_error');
    // today-4: chỉ một mốc → không suy ra delta, partial.
    const day4 = addDays(today, -4);
    await push('boot-single', at(day4, '01:00:00'), 500);
    // today-3: gap > 4 nhịp tim (60s) → bỏ đoạn nhảy, vẫn cộng phần trước, partial.
    const day3 = addDays(today, -3);
    await push('boot-gap', at(day3, '02:00:00'), 20);
    await push('boot-gap', at(day3, '02:00:15'), 50);
    await push('boot-gap', at(day3, '02:00:30'), 60);
    await push('boot-gap', at(day3, '02:10:30'), 500);
    // today-2: đổi boot (reset hợp lệ) → cộng delta trong từng boot, complete.
    const day2 = addDays(today, -2);
    await push('boot-x', at(day2, '03:00:00'), 100);
    await push('boot-x', at(day2, '03:00:15'), 140);
    await push('boot-y', at(day2, '03:00:30'), 10);
    await push('boot-y', at(day2, '03:00:45'), 30);
    // today-1: counter giảm trong cùng boot → bỏ delta âm, partial.
    const day1 = addDays(today, -1);
    await push('boot-reset', at(day1, '04:00:00'), 100);
    await push('boot-reset', at(day1, '04:00:15'), 140);
    await push('boot-reset', at(day1, '04:00:30'), 90);
    await push('boot-reset', at(day1, '04:00:45'), 130);

    const response = await owner.agent.get(
      `/api/v1/subjects/${fixture.subjectId}/insights?days=7`,
    );
    expect(response.status).toBe(200);
    expect(insightsResponseSchema.safeParse(response.body).success).toBe(true);

    expect(dayByDate(response.body, day6).steps).toEqual({
      total: 0,
      completeness: 'unavailable',
    });
    expect(dayByDate(response.body, day5).steps).toEqual({
      total: 0,
      completeness: 'unavailable',
    });
    expect(dayByDate(response.body, day4).steps).toEqual({
      total: 0,
      completeness: 'partial',
    });
    expect(dayByDate(response.body, day3).steps).toEqual({
      total: 40,
      completeness: 'partial',
    });
    expect(dayByDate(response.body, day2).steps).toEqual({
      total: 60,
      completeness: 'complete',
    });
    expect(dayByDate(response.body, day1).steps).toEqual({
      total: 80,
      completeness: 'partial',
    });
    expect(response.body.summary.totalSteps).toBe(180);
    expect(response.body.notes.join(' ')).toMatch(/ước tính một phần/);
    expect(response.body.summary.dataDays).toBe(5);
  });

  it('helper coverage dùng đúng công thức policy (24h/15s → 5760; tối thiểu 1)', () => {
    const start = new Date('2026-11-13T00:00:00.000Z');
    const end = new Date('2026-11-14T00:00:00.000Z');
    expect(coverageCounts(start, end, 15, 0)).toEqual({
      percent: 0,
      observedCount: 0,
      expectedCount: 5760,
    });
    expect(coverageCounts(start, end, 15, 2880)).toEqual({
      percent: 50,
      observedCount: 2880,
      expectedCount: 5760,
    });
    expect(coverageCounts(start, new Date(start.getTime() + 1_000), 15, 0).expectedCount).toBe(1);
    expect(coverageCounts(start, end, 15, 10_000).percent).toBe(100);
  });
});
