import request from 'supertest';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { DEFAULT_CARE_PERMISSIONS } from '@annhien/contracts';
import type { TelemetryEnvelope } from '@annhien/contracts/telemetry';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import { DevicesModule } from '../src/devices/devices.module';
import { IngestModule } from '../src/ingest/ingest.module';
import { MeasurementsModule } from '../src/measurements/measurements.module';
import { PolicyModule } from '../src/policy/policy.module';
import { DB } from '../src/database/database';
import { careLinks, devices, subjects, telemetry, users } from '../src/database/schema';
import {
  createAdmin,
  createModuleTestApp,
  registerUser,
  TEST_ORIGIN,
  type TestContext,
  type TestUser,
} from './test-app';

/**
 * FR thiết bị: tạo thiết bị (admin), claim/release (chủ hồ sơ), xoay khóa,
 * cấp claim code mới, danh sách/trạng thái theo policy.
 */

/** Test-only: AppModule (lead sở hữu) đăng ký APP_FILTER; module test cần filter riêng. */
@Module({
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
class TestFiltersModule {}

let serialCounter = 0;
const nextSerial = () => `DEV-${String(++serialCounter).padStart(4, '0')}`;

async function createSubject(ctx: TestContext, ownerUserId: string, displayName = 'Bà An') {
  const rows = await ctx.db
    .insert(subjects)
    .values({ ownerUserId, displayName, timezone: 'Asia/Ho_Chi_Minh' })
    .returning();
  const subject = rows[0];
  if (!subject) throw new Error('Không tạo được subject.');
  return subject;
}

async function adminCreateDevice(ctx: TestContext, admin: TestUser, input?: { serial?: string; label?: string }) {
  const response = await admin.agent
    .post('/api/v1/admin/devices')
    .set('Origin', TEST_ORIGIN)
    .send({ serial: input?.serial ?? nextSerial(), label: input?.label ?? 'Vòng tay demo' });
  expect(response.status).toBe(201);
  return response.body as { device: { id: string; serial: string }; deviceKey: string; claimCode: string; claimCodeExpiresAt: string };
}

async function claimDevice(owner: TestUser, subjectId: string, claimCode: string) {
  return owner.agent
    .post(`/api/v1/subjects/${subjectId}/devices/claim`)
    .set('Origin', TEST_ORIGIN)
    .send({ claimCode });
}

function makeEnvelope(deviceId: string, overrides: Partial<TelemetryEnvelope> = {}): TelemetryEnvelope {
  return {
    schema_version: '1.0',
    message_id: crypto.randomUUID(),
    device_id: deviceId,
    boot_id: 'boot-a',
    sequence: 0,
    measured_at: new Date().toISOString(),
    clock_status: 'synced',
    uptime_ms: 60_000,
    metrics: { heart_rate_bpm: 72, steps_since_boot: 42 },
    quality: { heart_rate: 'valid', motion: 'valid' },
    battery_percent: 85,
    firmware_version: '0.1.0-demo',
    ...overrides,
  };
}

async function ingest(ctx: TestContext, deviceId: string, deviceKey: string, envelope: TelemetryEnvelope) {
  return request(ctx.app.getHttpServer())
    .post('/api/v1/ingest/telemetry')
    .set('x-device-id', deviceId)
    .set('x-device-key', deviceKey)
    .send(envelope);
}

describe('Thiết bị: tạo, claim, release, trạng thái', () => {
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

  it('admin tạo thiết bị trả khóa và claim code một lần; người thường bị 403; serial trùng bị 409', async () => {
    const created = await adminCreateDevice(ctx, admin);
    expect(created.deviceKey.length).toBeGreaterThanOrEqual(32);
    expect(created.claimCode).toHaveLength(9);
    expect(/^[A-Z2-9]{9}$/.test(created.claimCode)).toBe(true);
    const expiresInMs = new Date(created.claimCodeExpiresAt).getTime() - Date.now();
    expect(expiresInMs).toBeGreaterThan(10 * 60 * 1000);
    expect(expiresInMs).toBeLessThanOrEqual(15 * 60 * 1000);

    const denied = await owner.agent
      .post('/api/v1/admin/devices')
      .set('Origin', TEST_ORIGIN)
      .send({ serial: nextSerial(), label: 'Không được phép' });
    expect(denied.status).toBe(403);

    const duplicate = await admin.agent
      .post('/api/v1/admin/devices')
      .set('Origin', TEST_ORIGIN)
      .send({ serial: created.device.serial, label: 'Trùng serial' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('CONFLICT');
  });

  it('chủ hồ sơ claim; claim lại mã cũ / mã sai / mã hết hạn bị từ chối', async () => {
    const subject = await createSubject(ctx, owner.session.user.id);
    const created = await adminCreateDevice(ctx, admin);

    const ok = await claimDevice(owner, subject.id, created.claimCode);
    expect(ok.status).toBe(201);
    expect(ok.body.device.id).toBe(created.device.id);
    expect(ok.body.subjectId).toBe(subject.id);
    expect(ok.body.assignmentId).toBeTruthy();

    const again = await claimDevice(owner, subject.id, created.claimCode);
    expect(again.status).toBe(422);
    expect(again.body.code).toBe('VALIDATION_FAILED');

    const wrong = await claimDevice(owner, subject.id, 'AAAAAAAAA');
    expect(wrong.status).toBe(422);

    // Mã hết hạn: admin tạo mới rồi sửa hạn về quá khứ.
    const expired = await adminCreateDevice(ctx, admin);
    await ctx.db
      .update(devices)
      .set({ claimCodeExpiresAt: new Date(Date.now() - 60_000) })
      .where(eq(devices.id, expired.device.id));
    const claimExpired = await claimDevice(owner, subject.id, expired.claimCode);
    expect(claimExpired.status).toBe(422);
  });

  it('thiết bị đã gán thì chủ hồ sơ khác không claim được (409); người được chia sẻ không phải chủ bị 403', async () => {
    const subject1 = await createSubject(ctx, owner.session.user.id, 'Hồ sơ 1');
    const other = await registerUser(ctx.app, { displayName: 'Chủ khác' });
    const subject2 = await createSubject(ctx, other.session.user.id, 'Hồ sơ 2');

    const created = await adminCreateDevice(ctx, admin);
    const first = await claimDevice(owner, subject1.id, created.claimCode);
    expect(first.status).toBe(201);

    // Chủ hồ sơ 2 không claim được thiết bị đã gán.
    const conflict = await claimDevice(other, subject2.id, created.claimCode);
    expect(conflict.status).toBe(422);

    // Cấp claim code mới cho chính thiết bị đó, chủ hồ sơ 2 cố claim → 409.
    const newCodeRes = await admin.agent
      .post(`/api/v1/admin/devices/${created.device.id}/claim-code`)
      .set('Origin', TEST_ORIGIN);
    expect(newCodeRes.status).toBe(201);
    const secondTry = await claimDevice(other, subject2.id, newCodeRes.body.claimCode);
    expect(secondTry.status).toBe(409);
    expect(secondTry.body.code).toBe('CONFLICT');

    // Người được chia sẻ (caregiver) không phải chủ hồ sơ → 403.
    const caregiver = await registerUser(ctx.app, { displayName: 'Người thân' });
    await ctx.db.insert(careLinks).values({
      subjectId: subject2.id,
      caregiverUserId: caregiver.session.user.id,
      invitedByUserId: other.session.user.id,
      permissions: DEFAULT_CARE_PERMISSIONS,
      status: 'active',
    });
    const thirdCodeRes = await admin.agent
      .post(`/api/v1/admin/devices/${created.device.id}/claim-code`)
      .set('Origin', TEST_ORIGIN);
    const caregiverClaim = await claimDevice(caregiver, subject2.id, thirdCodeRes.body.claimCode);
    expect(caregiverClaim.status).toBe(403);
  });

  it('xoay khóa: khóa cũ bị 401, khóa mới gửi telemetry được', async () => {
    const subject = await createSubject(ctx, owner.session.user.id);
    const created = await adminCreateDevice(ctx, admin);
    const claimed = await claimDevice(owner, subject.id, created.claimCode);
    expect(claimed.status).toBe(201);

    const rotateRes = await admin.agent
      .post(`/api/v1/admin/devices/${created.device.id}/rotate-key`)
      .set('Origin', TEST_ORIGIN);
    expect(rotateRes.status).toBe(200);
    expect(rotateRes.body.deviceKey).toBeTruthy();

    const withOldKey = await ingest(ctx, created.device.id, created.deviceKey, makeEnvelope(created.device.id));
    expect(withOldKey.status).toBe(401);

    const withNewKey = await ingest(ctx, created.device.id, rotateRes.body.deviceKey, makeEnvelope(created.device.id));
    expect(withNewKey.status).toBe(202);
    expect(withNewKey.body.status).toBe('accepted');
  });

  it('release đóng assignment; dữ liệu cũ giữ nguyên; release lại không có assignment mở; người ngoài không release được', async () => {
    const subject = await createSubject(ctx, owner.session.user.id);
    const created = await adminCreateDevice(ctx, admin);
    const claimed = await claimDevice(owner, subject.id, created.claimCode);
    expect(claimed.status).toBe(201);

    await ingest(ctx, created.device.id, created.deviceKey, makeEnvelope(created.device.id));

    // Caregiver của hồ sơ không phải chủ → 403 khi assignment còn mở.
    const caregiver = await registerUser(ctx.app);
    await ctx.db.insert(careLinks).values({
      subjectId: subject.id,
      caregiverUserId: caregiver.session.user.id,
      invitedByUserId: owner.session.user.id,
      permissions: DEFAULT_CARE_PERMISSIONS,
      status: 'active',
    });
    const caregiverRelease = await caregiver.agent
      .post(`/api/v1/devices/${created.device.id}/release`)
      .set('Origin', TEST_ORIGIN)
      .send({});
    expect(caregiverRelease.status).toBe(403);

    const releaseRes = await owner.agent
      .post(`/api/v1/devices/${created.device.id}/release`)
      .set('Origin', TEST_ORIGIN)
      .send({ reason: 'Đổi vòng tay mới' });
    expect(releaseRes.status).toBe(200);
    expect(releaseRes.body.subjectId).toBe(subject.id);

    // Dữ liệu lịch sử vẫn gắn assignment cũ.
    const history = await ctx.db
      .select({ id: telemetry.id })
      .from(telemetry)
      .where(eq(telemetry.assignmentId, claimed.body.assignmentId));
    expect(history.length).toBe(1);

    // Không còn assignment mở → ingest trả rejected DEVICE_NOT_CLAIMED, không ghi thêm.
    const afterRelease = await ingest(ctx, created.device.id, created.deviceKey, makeEnvelope(created.device.id));
    expect(afterRelease.status).toBe(202);
    expect(afterRelease.body.status).toBe('rejected');
    expect(afterRelease.body.code).toBe('DEVICE_NOT_CLAIMED');
    const history2 = await ctx.db
      .select({ id: telemetry.id })
      .from(telemetry)
      .where(eq(telemetry.assignmentId, claimed.body.assignmentId));
    expect(history2.length).toBe(1);

    // Release lần hai → 404 (không có assignment mở).
    const secondRelease = await owner.agent
      .post(`/api/v1/devices/${created.device.id}/release`)
      .set('Origin', TEST_ORIGIN)
      .send({});
    expect(secondRelease.status).toBe(404);

    // Người dùng không liên quan → 404 (tài nguyên riêng tư).
    const stranger = await registerUser(ctx.app);
    const strangerRelease = await stranger.agent
      .post(`/api/v1/devices/${created.device.id}/release`)
      .set('Origin', TEST_ORIGIN)
      .send({});
    expect(strangerRelease.status).toBe(404);
  });

  it('admin xem danh sách thiết bị kèm assignment đang mở; danh sách hồ sơ + trạng thái theo policy', async () => {
    const subject = await createSubject(ctx, owner.session.user.id);
    const created = await adminCreateDevice(ctx, admin);
    const claimed = await claimDevice(owner, subject.id, created.claimCode);
    expect(claimed.status).toBe(201);

    const adminList = await admin.agent.get('/api/v1/admin/devices').set('Origin', TEST_ORIGIN);
    expect(adminList.status).toBe(200);
    const found = adminList.body.items.find((item: { id: string }) => item.id === created.device.id);
    expect(found.assignedSubjectId).toBe(subject.id);

    // Chưa có telemetry → freshness 'never', pin null.
    const statusBefore = await owner.agent.get(`/api/v1/subjects/${subject.id}/status`);
    expect(statusBefore.status).toBe(200);
    expect(statusBefore.body.devices).toHaveLength(1);
    expect(statusBefore.body.devices[0]).toMatchObject({
      deviceId: created.device.id,
      freshness: 'never',
      online: false,
      batteryPercent: null,
      clockStatus: 'unknown',
    });
    expect(statusBefore.body.policy.key).toBe('device_runtime');
    expect(statusBefore.body.policy.source).toBe('default');
    expect(statusBefore.body.policy.version).toBe(0);
    expect(statusBefore.body.asOf).toBeTruthy();

    // Sau khi gửi dữ liệu: online + live, pin và nhịp tim hiển thị.
    const measuredAt = new Date().toISOString();
    const ok = await ingest(ctx, created.device.id, created.deviceKey, makeEnvelope(created.device.id, { measured_at: measuredAt }));
    expect(ok.status).toBe(202);
    expect(ok.body.status).toBe('accepted');

    const statusAfter = await owner.agent.get(`/api/v1/subjects/${subject.id}/status`);
    expect(statusAfter.status).toBe(200);
    expect(statusAfter.body.devices[0]).toMatchObject({
      freshness: 'live',
      online: true,
      batteryPercent: 85,
      lastHeartRateBpm: 72,
      lastHeartRateQuality: 'valid',
      lastMeasuredAt: measuredAt,
      clockStatus: 'synced',
    });

    const devicesRes = await owner.agent.get(`/api/v1/subjects/${subject.id}/devices`);
    expect(devicesRes.status).toBe(200);
    expect(devicesRes.body.items).toHaveLength(1);
    expect(devicesRes.body.items[0].serial).toBe(created.device.serial);

    // Người ngoài không xem được hồ sơ → 404.
    const stranger = await registerUser(ctx.app);
    const strangerStatus = await stranger.agent.get(`/api/v1/subjects/${subject.id}/status`);
    expect(strangerStatus.status).toBe(404);
  });

  it('freshness offline/stale đúng theo policy khi dữ liệu cũ hoặc thiết bị im lặng', async () => {
    const subject = await createSubject(ctx, owner.session.user.id);
    const created = await adminCreateDevice(ctx, admin);
    const claimed = await claimDevice(owner, subject.id, created.claimCode);
    expect(claimed.status).toBe(201);

    // Dữ liệu đo cũ 90 giây (fresh sau 30s) nhưng thiết bị vừa gửi → stale.
    await ingest(
      ctx,
      created.device.id,
      created.deviceKey,
      makeEnvelope(created.device.id, {
        measured_at: new Date(Date.now() - 90_000).toISOString(),
      }),
    );
    const stale = await owner.agent.get(`/api/v1/subjects/${subject.id}/status`);
    expect(stale.body.devices[0].freshness).toBe('stale');
    expect(stale.body.devices[0].online).toBe(true);

    // Thiết bị im lặng 10 phút (> 45s) → offline.
    await ctx.db
      .update(devices)
      .set({ lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) })
      .where(eq(devices.id, created.device.id));
    const offline = await owner.agent.get(`/api/v1/subjects/${subject.id}/status`);
    expect(offline.body.devices[0].freshness).toBe('offline');
    expect(offline.body.devices[0].online).toBe(false);
  });

  it('mẫu đến trễ không thay mẫu mới: trạng thái lấy theo measured_at của mẫu mới nhất', async () => {
    const subject = await createSubject(ctx, owner.session.user.id);
    const created = await adminCreateDevice(ctx, admin);
    const claimed = await claimDevice(owner, subject.id, created.claimCode);
    expect(claimed.status).toBe(201);

    // Tương đương kịch bản QA 23:54 (mới) rồi 23:35 (cũ) đến trễ; dùng mốc
    // tương đối để mẫu "mới" không rơi vào tương lai (P1-1 chưa sửa).
    const now = Date.now();
    const newerMeasuredAt = new Date(now - 5_000).toISOString();
    const olderMeasuredAt = new Date(now - 19 * 60_000).toISOString();
    const newerMessageId = crypto.randomUUID();
    const olderMessageId = crypto.randomUUID();

    const newer = await ingest(
      ctx,
      created.device.id,
      created.deviceKey,
      makeEnvelope(created.device.id, {
        message_id: newerMessageId,
        sequence: 1,
        measured_at: newerMeasuredAt,
        metrics: { heart_rate_bpm: 70, steps_since_boot: 120 },
        battery_percent: 80,
      }),
    );
    expect(newer.status).toBe(202);
    expect(newer.body.status).toBe('accepted');

    // Mẫu cũ hơn được nhận sau (đến trễ) — không được thay mẫu mới.
    const olderLate = await ingest(
      ctx,
      created.device.id,
      created.deviceKey,
      makeEnvelope(created.device.id, {
        message_id: olderMessageId,
        sequence: 2,
        measured_at: olderMeasuredAt,
        metrics: { heart_rate_bpm: 50, steps_since_boot: 90 },
        battery_percent: 20,
      }),
    );
    expect(olderLate.status).toBe(202);
    expect(olderLate.body.status).toBe('accepted');
    const olderRows = await ctx.db
      .select({ isLate: telemetry.isLate })
      .from(telemetry)
      .where(eq(telemetry.messageId, olderMessageId));
    expect(olderRows[0]?.isLate).toBe(true);

    const status = await owner.agent.get(`/api/v1/subjects/${subject.id}/status`);
    expect(status.status).toBe(200);
    expect(status.body.devices[0]).toMatchObject({
      freshness: 'live',
      online: true,
      lastHeartRateBpm: 70,
      lastHeartRateQuality: 'valid',
      batteryPercent: 80,
      lastMeasuredAt: newerMeasuredAt,
      clockStatus: 'synced',
    });
  });

  it('không có mẫu synced hợp lệ: trả null/stale, không lấy giờ nhận làm giờ đo', async () => {
    const subject = await createSubject(ctx, owner.session.user.id);
    const created = await adminCreateDevice(ctx, admin);
    const claimed = await claimDevice(owner, subject.id, created.claimCode);
    expect(claimed.status).toBe(201);

    const unsynced = await ingest(
      ctx,
      created.device.id,
      created.deviceKey,
      makeEnvelope(created.device.id, {
        clock_status: 'unsynced',
        measured_at: null,
        battery_percent: 55,
      }),
    );
    expect(unsynced.status).toBe(202);
    expect(unsynced.body.status).toBe('accepted');

    const status = await owner.agent.get(`/api/v1/subjects/${subject.id}/status`);
    expect(status.status).toBe(200);
    expect(status.body.devices[0]).toMatchObject({
      online: true,
      freshness: 'stale',
      lastHeartRateBpm: null,
      lastMeasuredAt: null,
      batteryPercent: null,
      clockStatus: 'unknown',
    });
  });

  it('claim code mới thay thế code cũ: code cũ không còn dùng được', async () => {
    const subject = await createSubject(ctx, owner.session.user.id);
    const created = await adminCreateDevice(ctx, admin);

    const newCodeRes = await admin.agent
      .post(`/api/v1/admin/devices/${created.device.id}/claim-code`)
      .set('Origin', TEST_ORIGIN);
    expect(newCodeRes.status).toBe(201);
    expect(newCodeRes.body.claimCode).toHaveLength(9);

    const withOldCode = await claimDevice(owner, subject.id, created.claimCode);
    expect(withOldCode.status).toBe(422);

    const withNewCode = await claimDevice(owner, subject.id, newCodeRes.body.claimCode);
    expect(withNewCode.status).toBe(201);
    expect(withNewCode.body.device.id).toBe(created.device.id);
  });

  it('tài khoản admin bị thu hồi quyền không dùng được route admin', async () => {
    // Admin riêng cho test thu hồi: không đổi role fixture dùng chung của suite.
    const revocableAdmin = await createAdmin(ctx.app);
    const adminUserRow = await ctx.db
      .select()
      .from(users)
      .where(eq(users.id, revocableAdmin.session.user.id))
      .limit(1);
    const row = adminUserRow[0];
    expect(row).toBeTruthy();
    await ctx.db.update(users).set({ role: 'user' }).where(eq(users.id, row!.id));

    const denied = await revocableAdmin.agent
      .post('/api/v1/admin/devices')
      .set('Origin', TEST_ORIGIN)
      .send({ serial: nextSerial(), label: 'Sau khi thu hồi' });
    expect(denied.status).toBe(403);
  });
});
