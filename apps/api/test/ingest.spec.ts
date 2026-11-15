import request from 'supertest';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { eq, and } from 'drizzle-orm';
import { DEFAULT_POLICY_VALUE } from '@annhien/contracts/policies';
import type { TelemetryEnvelope } from '@annhien/contracts/telemetry';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import { DevicesModule } from '../src/devices/devices.module';
import { IngestModule } from '../src/ingest/ingest.module';
import { MqttIngestService } from '../src/ingest/mqtt-ingest.service';
import { MeasurementsModule } from '../src/measurements/measurements.module';
import { PolicyModule } from '../src/policy/policy.module';
import { computePolicyDigest } from '../src/policy/policy.service';
import { DB } from '../src/database/database';
import { policyConfigs, subjects, telemetry, deviceAssignments, auditLogs } from '../src/database/schema';
import {
  createAdmin,
  createModuleTestApp,
  registerUser,
  TEST_ORIGIN,
  type TestContext,
  type TestUser,
} from './test-app';

/**
 * FR ingest telemetry: chống trùng (message_id / boot+sequence), conflict 409,
 * rejected khi chưa gán, isLate, rate limit trong bộ nhớ, MQTT parser (không mở
 * kết nối thật).
 */

/** Test-only: AppModule (lead sở hữu) đăng ký APP_FILTER; module test cần filter riêng. */
@Module({
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
class TestFiltersModule {}

let serialCounter = 0;
const nextSerial = () => `DEV-${String(++serialCounter).padStart(4, '0')}`;

async function createSubject(ctx: TestContext, ownerUserId: string) {
  const rows = await ctx.db
    .insert(subjects)
    .values({ ownerUserId, displayName: 'Bà An', timezone: 'Asia/Ho_Chi_Minh' })
    .returning();
  const subject = rows[0];
  if (!subject) throw new Error('Không tạo được subject.');
  return subject;
}

type DeviceFixture = { deviceId: string; deviceKey: string };

/**
 * Thiết bị đã claim, với assignment bắt đầu từ 35 ngày trước: các test cũ gửi
 * mẫu lịch sử ngay sau khi claim; nếu không lùi mốc thì chúng đúng là "mẫu
 * trước assignment" và phải bị cách ly theo thiết kế mới.
 */
async function createClaimedDevice(
  ctx: TestContext,
  admin: TestUser,
  owner: TestUser,
): Promise<{ fixture: DeviceFixture; subjectId: string; assignmentId: string }> {
  const subject = await createSubject(ctx, owner.session.user.id);
  const created = await admin.agent
    .post('/api/v1/admin/devices')
    .set('Origin', TEST_ORIGIN)
    .send({ serial: nextSerial(), label: 'Vòng tay ingest' });
  expect(created.status).toBe(201);
  const claimed = await owner.agent
    .post(`/api/v1/subjects/${subject.id}/devices/claim`)
    .set('Origin', TEST_ORIGIN)
    .send({ claimCode: created.body.claimCode });
  expect(claimed.status).toBe(201);
  const assignmentId = claimed.body.assignmentId as string;
  await backdateAssignment(ctx, assignmentId, 35);
  return {
    fixture: { deviceId: created.body.device.id, deviceKey: created.body.deviceKey },
    subjectId: subject.id,
    assignmentId,
  };
}

async function backdateAssignment(
  ctx: TestContext,
  assignmentId: string,
  days: number,
): Promise<void> {
  await ctx.db
    .update(deviceAssignments)
    .set({ startedAt: new Date(Date.now() - days * 24 * 3600 * 1000) })
    .where(eq(deviceAssignments.id, assignmentId));
}

async function createUnclaimedDevice(ctx: TestContext, admin: TestUser): Promise<DeviceFixture> {
  const created = await admin.agent
    .post('/api/v1/admin/devices')
    .set('Origin', TEST_ORIGIN)
    .send({ serial: nextSerial(), label: 'Chưa gán' });
  expect(created.status).toBe(201);
  return { deviceId: created.body.device.id, deviceKey: created.body.deviceKey };
}

function makeEnvelope(deviceId: string, overrides: Partial<TelemetryEnvelope> = {}): TelemetryEnvelope {
  return {
    schema_version: '1.0',
    message_id: crypto.randomUUID(),
    device_id: deviceId,
    boot_id: 'boot-ingest',
    sequence: 0,
    measured_at: new Date().toISOString(),
    clock_status: 'synced',
    uptime_ms: 30_000,
    metrics: { heart_rate_bpm: 68, steps_since_boot: 5 },
    quality: { heart_rate: 'valid', motion: 'valid' },
    battery_percent: 60,
    firmware_version: '0.1.0-demo',
    ...overrides,
  };
}

function ingest(ctx: TestContext, fixture: DeviceFixture, envelope: TelemetryEnvelope) {
  return request(ctx.app.getHttpServer())
    .post('/api/v1/ingest/telemetry')
    .set('x-device-id', fixture.deviceId)
    .set('x-device-key', fixture.deviceKey)
    .send(envelope);
}

describe('Ingest telemetry', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let owner: TestUser;

  beforeAll(async () => {
    delete process.env.MQTT_URL;
    ctx = await createModuleTestApp([DevicesModule, IngestModule, MeasurementsModule, PolicyModule, TestFiltersModule]);
    admin = await createAdmin(ctx.app);
    owner = await registerUser(ctx.app, { displayName: 'Chủ hồ sơ' });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('telemetry hợp lệ → 202 accepted, DB có row đúng trường', async () => {
    const { fixture } = await createClaimedDevice(ctx, admin, owner);
    const envelope = makeEnvelope(fixture.deviceId, {
      measured_at: new Date().toISOString(),
      metrics: { heart_rate_bpm: 68, steps_since_boot: 12 },
    });

    const response = await ingest(ctx, fixture, envelope);
    expect(response.status).toBe(202);
    expect(response.body.status).toBe('accepted');
    expect(response.body.sourceMessageId).toBe(envelope.message_id);
    expect(response.body.receivedAt).toBeTruthy();

    const rows = await ctx.db
      .select()
      .from(telemetry)
      .where(eq(telemetry.deviceId, fixture.deviceId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      messageId: envelope.message_id,
      bootId: envelope.boot_id,
      sequence: 0,
      clockStatus: 'synced',
      isLate: false,
      isQuarantined: false,
      source: 'http',
      firmwareVersion: '0.1.0-demo',
    });
    expect(rows[0]?.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.metrics.heart_rate_bpm).toBe(68);
  });

  it('gửi lặp cùng message + payload → duplicate, không thêm row; cùng message khác payload → 409', async () => {
    const { fixture } = await createClaimedDevice(ctx, admin, owner);
    const envelope = makeEnvelope(fixture.deviceId);

    const first = await ingest(ctx, fixture, envelope);
    expect(first.status).toBe(202);
    expect(first.body.status).toBe('accepted');

    const duplicate = await ingest(ctx, fixture, envelope);
    expect(duplicate.status).toBe(202);
    expect(duplicate.body.status).toBe('duplicate');
    expect(duplicate.body.code).toBe('DUPLICATE');

    const count = await ctx.db
      .select({ id: telemetry.id })
      .from(telemetry)
      .where(eq(telemetry.deviceId, fixture.deviceId));
    expect(count).toHaveLength(1);

    const conflicting = await ingest(ctx, fixture, {
      ...envelope,
      metrics: { heart_rate_bpm: 99, steps_since_boot: 500 },
    });
    expect(conflicting.status).toBe(409);
    expect(conflicting.body.code).toBe('CONFLICT');
    expect(conflicting.body.details.kind).toBe('message_id_conflict');

    const countAfter = await ctx.db
      .select({ id: telemetry.id })
      .from(telemetry)
      .where(eq(telemetry.deviceId, fixture.deviceId));
    expect(countAfter).toHaveLength(1);
  });

  it('trùng (boot_id, sequence) nhưng message_id khác → 409 protocol conflict', async () => {
    const { fixture } = await createClaimedDevice(ctx, admin, owner);
    const first = makeEnvelope(fixture.deviceId, { sequence: 7 });
    const ok = await ingest(ctx, fixture, first);
    expect(ok.status).toBe(202);

    const conflicting = await ingest(ctx, fixture, makeEnvelope(fixture.deviceId, { sequence: 7 }));
    expect(conflicting.status).toBe(409);
    expect(conflicting.body.details.kind).toBe('sequence_conflict');
  });

  it('thiết bị chưa gán → 202 rejected DEVICE_NOT_CLAIMED, không tạo row', async () => {
    const fixture = await createUnclaimedDevice(ctx, admin);
    const response = await ingest(ctx, fixture, makeEnvelope(fixture.deviceId));
    expect(response.status).toBe(202);
    expect(response.body.status).toBe('rejected');
    expect(response.body.code).toBe('DEVICE_NOT_CLAIMED');

    const rows = await ctx.db
      .select({ id: telemetry.id })
      .from(telemetry)
      .where(eq(telemetry.deviceId, fixture.deviceId));
    expect(rows).toHaveLength(0);
  });

  it('sai khóa hoặc thiết bị không tồn tại → 401; device_id trong payload khác header → 403', async () => {
    const { fixture } = await createClaimedDevice(ctx, admin, owner);
    const envelope = makeEnvelope(fixture.deviceId);

    const wrongKey = await request(ctx.app.getHttpServer())
      .post('/api/v1/ingest/telemetry')
      .set('x-device-id', fixture.deviceId)
      .set('x-device-key', 'sai-khoa-hoan-toan-0000000000000000')
      .send(envelope);
    expect(wrongKey.status).toBe(401);
    expect(wrongKey.body.code).toBe('DEVICE_AUTH_FAILED');

    const unknownDevice = await request(ctx.app.getHttpServer())
      .post('/api/v1/ingest/telemetry')
      .set('x-device-id', crypto.randomUUID())
      .set('x-device-key', 'khoa-hop-le-nhung-thiet-bi-khong-ton-tai')
      .send(makeEnvelope(crypto.randomUUID()));
    expect(unknownDevice.status).toBe(401);

    const mismatch = await ingest(ctx, fixture, makeEnvelope(crypto.randomUUID()));
    expect(mismatch.status).toBe(403);
    expect(mismatch.body.code).toBe('FORBIDDEN');
  });

  it('measured_at null + clock_status unsynced được lưu, không bị gán giờ nhận làm giờ đo', async () => {
    const { fixture } = await createClaimedDevice(ctx, admin, owner);
    const envelope = makeEnvelope(fixture.deviceId, {
      measured_at: null,
      clock_status: 'unsynced',
      metrics: { heart_rate_bpm: null, steps_since_boot: 3 },
      quality: { heart_rate: 'not_worn', motion: 'valid' },
    });
    const response = await ingest(ctx, fixture, envelope);
    expect(response.status).toBe(202);
    expect(response.body.status).toBe('accepted');

    const rows = await ctx.db
      .select()
      .from(telemetry)
      .where(eq(telemetry.deviceId, fixture.deviceId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.measuredAt).toBeNull();
    expect(rows[0]?.clockStatus).toBe('unsynced');
    expect(rows[0]?.metrics.heart_rate_bpm).toBeNull();
  });

  it('envelope không hợp lệ bị 422; nhịp tim không hợp lệ phải null (schema chặn)', async () => {
    const { fixture } = await createClaimedDevice(ctx, admin, owner);
    const badHr = await ingest(ctx, fixture, makeEnvelope(fixture.deviceId, {
      quality: { heart_rate: 'poor_signal', motion: 'valid' },
      metrics: { heart_rate_bpm: 75, steps_since_boot: 1 },
    }));
    expect(badHr.status).toBe(422);
    expect(badHr.body.code).toBe('VALIDATION_FAILED');

    const badClock = await ingest(ctx, fixture, makeEnvelope(fixture.deviceId, {
      clock_status: 'unsynced',
    }));
    expect(badClock.status).toBe(422);
  });

  it('bản tin đến muộn quá lateEventMinutes bị đánh dấu isLate', async () => {
    const { fixture } = await createClaimedDevice(ctx, admin, owner);
    const lateEnvelope = makeEnvelope(fixture.deviceId, {
      measured_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });
    const response = await ingest(ctx, fixture, lateEnvelope);
    expect(response.status).toBe(202);

    const rows = await ctx.db
      .select()
      .from(telemetry)
      .where(eq(telemetry.deviceId, fixture.deviceId));
    expect(rows[0]?.isLate).toBe(true);
  });

  it('rate limit trong bộ nhớ: vượt maxTelemetryPerMinute → 429', async () => {
    const { fixture } = await createClaimedDevice(ctx, admin, owner);
    const value = { ...DEFAULT_POLICY_VALUE, maxTelemetryPerMinute: 1 };
    await ctx.db.insert(policyConfigs).values({
      key: 'device_runtime',
      scope: 'global',
      version: 1,
      status: 'active',
      value,
      digest: computePolicyDigest(value),
    });

    const first = await ingest(ctx, fixture, makeEnvelope(fixture.deviceId));
    expect(first.status).toBe(202);

    const second = await ingest(ctx, fixture, makeEnvelope(fixture.deviceId));
    expect(second.status).toBe(429);
    expect(second.body.code).toBe('RATE_LIMITED');

    // Dọn policy test để các test sau (thiết bị mới) dùng lại policy mặc định.
    await ctx.db.delete(policyConfigs);
  });

  it('clock_status synced nhưng measured_at null → 422, không ghi bản tin', async () => {
    const { fixture } = await createClaimedDevice(ctx, admin, owner);
    const response = await ingest(
      ctx,
      fixture,
      makeEnvelope(fixture.deviceId, { measured_at: null, clock_status: 'synced' }),
    );
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('VALIDATION_FAILED');

    const rows = await ctx.db
      .select({ id: telemetry.id })
      .from(telemetry)
      .where(eq(telemetry.deviceId, fixture.deviceId));
    expect(rows).toHaveLength(0);
  });

  it('measured_at vượt dung sai đồng hồ → 202 accepted + cách ly, có audit, không vào measurements', async () => {
    const { fixture, subjectId } = await createClaimedDevice(ctx, admin, owner);
    const futureAt = new Date(Date.now() + 10 * 60 * 1000);
    const envelope = makeEnvelope(fixture.deviceId, {
      measured_at: futureAt.toISOString(),
      metrics: { heart_rate_bpm: 200, steps_since_boot: 9999 },
      battery_percent: 100,
    });

    const response = await ingest(ctx, fixture, envelope);
    expect(response.status).toBe(202);
    expect(response.body.status).toBe('accepted');
    expect(response.body.code).toBe('QUARANTINED');

    const rows = await ctx.db
      .select()
      .from(telemetry)
      .where(eq(telemetry.deviceId, fixture.deviceId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      messageId: envelope.message_id,
      isQuarantined: true,
      clockStatus: 'synced',
    });
    expect(rows[0]?.measuredAt?.toISOString()).toBe(futureAt.toISOString());

    const auditRows = await ctx.db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, 'telemetry.quarantined'),
          eq(auditLogs.targetId, fixture.deviceId),
        ),
      );
    expect(auditRows).toHaveLength(1);
    const metadata = auditRows[0]?.metadata as Record<string, unknown>;
    expect(metadata).toMatchObject({
      messageId: envelope.message_id,
      reason: 'clock_skew_future',
    });
    // Bằng chứng protocol không chứa chỉ số sức khỏe.
    expect(JSON.stringify(metadata)).not.toMatch(/heart_rate|steps|battery/i);

    const list = await owner.agent.get(`/api/v1/subjects/${subjectId}/measurements`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(0);
    expect(list.body.coverage.observedCount).toBe(0);
    expect(list.body.gaps.every((gap: { reason: string }) => gap.reason !== 'quarantined')).toBe(true);
  });

  it('chuyển chủ: mẫu trước assignment bị cách ly, mẫu cũ vẫn thuộc chủ cũ, không sang chủ mới', async () => {
    const ownerB = await registerUser(ctx.app, { displayName: 'Chủ mới' });
    const subjectA = await createSubject(ctx, owner.session.user.id);
    const subjectB = await createSubject(ctx, ownerB.session.user.id);

    const created = await admin.agent
      .post('/api/v1/admin/devices')
      .set('Origin', TEST_ORIGIN)
      .send({ serial: nextSerial(), label: 'Vòng tay chuyển chủ' });
    expect(created.status).toBe(201);
    const deviceId = created.body.device.id as string;
    const fixture: DeviceFixture = { deviceId, deviceKey: created.body.deviceKey };

    const claimA = await owner.agent
      .post(`/api/v1/subjects/${subjectA.id}/devices/claim`)
      .set('Origin', TEST_ORIGIN)
      .send({ claimCode: created.body.claimCode });
    expect(claimA.status).toBe(201);
    const assignmentA = claimA.body.assignmentId as string;
    const now = Date.now();
    await ctx.db
      .update(deviceAssignments)
      .set({ startedAt: new Date(now - 3 * 3600 * 1000) })
      .where(eq(deviceAssignments.id, assignmentA));

    const insideA = makeEnvelope(deviceId, {
      sequence: 20,
      boot_id: 'boot-transfer',
      measured_at: new Date(now - 2 * 3600 * 1000).toISOString(),
      metrics: { heart_rate_bpm: 61, steps_since_boot: 100 },
    });
    const acceptedA = await ingest(ctx, fixture, insideA);
    expect(acceptedA.body.status).toBe('accepted');

    const released = await owner.agent
      .post(`/api/v1/devices/${deviceId}/release`)
      .set('Origin', TEST_ORIGIN)
      .send({ reason: 'chuyển chủ trong test' });
    expect(released.status).toBe(200);
    await ctx.db
      .update(deviceAssignments)
      .set({ endedAt: new Date(now - 3600 * 1000) })
      .where(eq(deviceAssignments.id, assignmentA));

    const newCode = await admin.agent
      .post(`/api/v1/admin/devices/${deviceId}/claim-code`)
      .set('Origin', TEST_ORIGIN);
    expect(newCode.status).toBe(201);
    const claimB = await ownerB.agent
      .post(`/api/v1/subjects/${subjectB.id}/devices/claim`)
      .set('Origin', TEST_ORIGIN)
      .send({ claimCode: newCode.body.claimCode });
    expect(claimB.status).toBe(201);
    const assignmentB = claimB.body.assignmentId as string;
    await ctx.db
      .update(deviceAssignments)
      .set({ startedAt: new Date(now - 30 * 60 * 1000) })
      .where(eq(deviceAssignments.id, assignmentB));

    const beforeAll = makeEnvelope(deviceId, {
      sequence: 21,
      boot_id: 'boot-transfer',
      measured_at: new Date(now - 4 * 3600 * 1000).toISOString(),
      metrics: { heart_rate_bpm: 55, steps_since_boot: 10 },
    });
    const between = makeEnvelope(deviceId, {
      sequence: 22,
      boot_id: 'boot-transfer',
      measured_at: new Date(now - 45 * 60 * 1000).toISOString(),
      metrics: { heart_rate_bpm: 57, steps_since_boot: 20 },
    });
    const insideB = makeEnvelope(deviceId, {
      sequence: 23,
      boot_id: 'boot-transfer',
      measured_at: new Date(now - 10 * 60 * 1000).toISOString(),
      metrics: { heart_rate_bpm: 63, steps_since_boot: 30 },
    });

    expect((await ingest(ctx, fixture, beforeAll)).body.code).toBe('QUARANTINED');
    expect((await ingest(ctx, fixture, between)).body.code).toBe('QUARANTINED');
    const acceptedB = await ingest(ctx, fixture, insideB);
    expect(acceptedB.body.status).toBe('accepted');
    expect(acceptedB.body.code).toBeNull();

    const rows = await ctx.db
      .select()
      .from(telemetry)
      .where(eq(telemetry.deviceId, deviceId));
    const byMessage = new Map(rows.map((row) => [row.messageId, row]));
    expect(byMessage.get(insideA.message_id)).toMatchObject({
      assignmentId: assignmentA,
      isQuarantined: false,
    });
    expect(byMessage.get(insideB.message_id)).toMatchObject({
      assignmentId: assignmentB,
      isQuarantined: false,
    });
    expect(byMessage.get(beforeAll.message_id)?.isQuarantined).toBe(true);
    expect(byMessage.get(between.message_id)?.isQuarantined).toBe(true);

    const from = new Date(now - 5 * 3600 * 1000).toISOString();
    const to = new Date(now + 60_000).toISOString();
    const listA = await owner.agent.get(
      `/api/v1/subjects/${subjectA.id}/measurements?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    expect(listA.status).toBe(200);
    expect(listA.body.items.map((item: { measuredAt: string }) => item.measuredAt)).toEqual([
      insideA.measured_at,
    ]);

    const listB = await ownerB.agent.get(
      `/api/v1/subjects/${subjectB.id}/measurements?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    expect(listB.status).toBe(200);
    expect(listB.body.items.map((item: { measuredAt: string }) => item.measuredAt)).toEqual([
      insideB.measured_at,
    ]);
  });

  it('MQTT parser: topic không khớp device_id bị bỏ; hợp lệ thì gọi chung service ingest', async () => {
    const { fixture } = await createClaimedDevice(ctx, admin, owner);
    const mqtt = ctx.app.get(MqttIngestService);

    const envelope = makeEnvelope(fixture.deviceId);
    const topic = `v1/devices/${fixture.deviceId}/telemetry`;

    // Topic hợp lệ + payload khớp → ingest như HTTP.
    const ok = await mqtt.handleIncoming(topic, JSON.stringify(envelope));
    expect(ok.status).toBe('ok');
    if (ok.status === 'ok') expect(ok.outcome.kind).toBe('accepted');

    const rows = await ctx.db
      .select({ source: telemetry.source })
      .from(telemetry)
      .where(eq(telemetry.deviceId, fixture.deviceId));
    expect(rows[0]?.source).toBe('mqtt');

    // Payload khai device_id khác topic → từ chối.
    const mismatch = await mqtt.handleIncoming(
      `v1/devices/${crypto.randomUUID()}/telemetry`,
      JSON.stringify(envelope),
    );
    expect(mismatch).toEqual({ status: 'ignored', reason: 'device_id_mismatch' });

    // Topic sai cấu trúc / payload không parse được.
    expect(await mqtt.handleIncoming('v1/devices/x/status', '{}')).toEqual({
      status: 'ignored',
      reason: 'invalid_topic',
    });
    expect(await mqtt.handleIncoming(topic, 'khong-phai-json')).toEqual({
      status: 'ignored',
      reason: 'invalid_payload',
    });
  });
});
