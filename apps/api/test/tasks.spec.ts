import request from 'supertest';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { DEFAULT_CARE_PERMISSIONS } from '@annhien/contracts';
import {
  createModuleTestApp,
  createAdmin,
  registerUser,
  TEST_ORIGIN,
  type TestContext,
  type TestUser,
} from './test-app';
import { MaintenanceModule } from '../src/maintenance/maintenance.module';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import {
  auditLogs,
  careLinks,
  deviceAssignments,
  devices,
  maintenanceTasks,
  subjects,
} from '../src/database/schema';

/**
 * Maintenance tasks (wave 3 be-admin): GET /maintenance-tasks (quyền theo hồ sơ,
 * sắp xếp priority desc / dueAt asc null cuối, phân trang cursor) và
 * POST /maintenance-tasks/:id/close (owner/admin, 409 khi đã đóng, audit).
 * Wave này không sinh task định kỳ — test chỉ đọc và đóng task đã seed.
 */

@Module({
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
class TestFiltersModule {}

let serialCounter = 0;
const nextSerial = () => `MT-${String(++serialCounter).padStart(4, '0')}`;
const nextKey = () => `task-key-${crypto.randomUUID()}`;

type TaskFixture = {
  deviceId: string;
  subjectId: string | null;
  kind: string;
  title: string;
  status: 'open' | 'in_progress' | 'done' | 'cancelled';
  priority: number;
  dueAt: Date | null;
};

async function seedTask(ctx: TestContext, fixture: TaskFixture): Promise<string> {
  const rows = await ctx.db
    .insert(maintenanceTasks)
    .values({
      deviceId: fixture.deviceId,
      subjectId: fixture.subjectId,
      kind: fixture.kind,
      title: fixture.title,
      status: fixture.status,
      priority: fixture.priority,
      dueAt: fixture.dueAt,
      dedupeKey: nextKey(),
      ...(fixture.status === 'done'
        ? { closedAt: new Date(Date.now() - 3600_000), closeReason: 'Đã hoàn tất.' }
        : {}),
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('Không tạo được task.');
  return row.id;
}

async function seedDevice(ctx: TestContext, ownerUserId: string, subjectId: string | null): Promise<string> {
  const deviceRows = await ctx.db
    .insert(devices)
    .values({ serial: nextSerial(), label: 'Vòng tay demo', credentialHash: 'hash-demo', status: 'active' })
    .returning();
  const device = deviceRows[0];
  if (!device) throw new Error('Không tạo được device.');
  if (subjectId) {
    await ctx.db
      .insert(deviceAssignments)
      .values({ deviceId: device.id, subjectId, assignedByUserId: ownerUserId });
  }
  return device.id;
}

describe('Maintenance tasks (wave 3 be-admin)', () => {
  let ctx: TestContext;
  let owner: TestUser;
  let caregiver: TestUser;
  let limited: TestUser;
  let outsider: TestUser;
  let admin: TestUser;
  let subjectId: string;
  let deviceId: string;
  let secondDeviceId: string;
  let taskHighDue: string;
  let taskHighNoDue: string;
  let taskMid: string;
  let taskLow: string;
  let closedTask: string;
  let unlinkedTask: string;
  let secondDeviceTask: string;

  beforeAll(async () => {
    ctx = await createModuleTestApp([MaintenanceModule, TestFiltersModule]);
    owner = await registerUser(ctx.app, { displayName: 'Chủ hồ sơ' });
    caregiver = await registerUser(ctx.app, { displayName: 'Người thân A' });
    limited = await registerUser(ctx.app, { displayName: 'Người thân B' });
    outsider = await registerUser(ctx.app, { displayName: 'Người ngoài' });
    admin = await createAdmin(ctx.app);

    const subjectRows = await ctx.db
      .insert(subjects)
      .values({ ownerUserId: owner.session.user.id, displayName: 'Bà An', timezone: 'Asia/Ho_Chi_Minh' })
      .returning();
    const subject = subjectRows[0];
    if (!subject) throw new Error('Không tạo được subject.');
    subjectId = subject.id;

    const linkBase = {
      subjectId,
      invitedByUserId: owner.session.user.id,
      status: 'active' as const,
      sharedFrom: new Date(),
    };
    await ctx.db.insert(careLinks).values([
      {
        ...linkBase,
        caregiverUserId: caregiver.session.user.id,
        permissions: { ...DEFAULT_CARE_PERMISSIONS, canReceiveAlerts: true },
      },
      {
        ...linkBase,
        caregiverUserId: limited.session.user.id,
        permissions: { ...DEFAULT_CARE_PERMISSIONS, canReceiveAlerts: false },
      },
    ]);

    deviceId = await seedDevice(ctx, owner.session.user.id, subjectId);
    secondDeviceId = await seedDevice(ctx, owner.session.user.id, subjectId);
    const tomorrow = new Date(Date.now() + 24 * 3600_000);

    taskHighDue = await seedTask(ctx, {
      deviceId,
      subjectId,
      kind: 'signal_check',
      title: 'Kiểm tra tín hiệu (ưu tiên cao, có hạn)',
      status: 'open',
      priority: 3,
      dueAt: tomorrow,
    });
    taskHighNoDue = await seedTask(ctx, {
      deviceId,
      subjectId,
      kind: 'battery_check',
      title: 'Kiểm tra pin (ưu tiên cao, không hạn)',
      status: 'open',
      priority: 3,
      dueAt: null,
    });
    taskMid = await seedTask(ctx, {
      deviceId,
      subjectId,
      kind: 'firmware_check',
      title: 'Kiểm tra firmware',
      status: 'open',
      priority: 2,
      dueAt: null,
    });
    taskLow = await seedTask(ctx, {
      deviceId,
      subjectId,
      kind: 'clean_check',
      title: 'Vệ sinh thiết bị',
      status: 'open',
      priority: 1,
      dueAt: new Date(Date.now() + 48 * 3600_000),
    });
    closedTask = await seedTask(ctx, {
      deviceId,
      subjectId,
      kind: 'battery_check',
      title: 'Nhắc sạc (đã xong)',
      status: 'done',
      priority: 1,
      dueAt: null,
    });
    unlinkedTask = await seedTask(ctx, {
      deviceId,
      subjectId: null,
      kind: 'fleet_check',
      title: 'Rà soát đội thiết bị (toàn hệ thống)',
      status: 'open',
      priority: 5,
      dueAt: null,
    });
    secondDeviceTask = await seedTask(ctx, {
      deviceId: secondDeviceId,
      subjectId,
      kind: 'signal_check',
      title: 'Kiểm tra tín hiệu thiết bị hai',
      status: 'open',
      priority: 1,
      dueAt: null,
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  test('T1 (FR-11): chủ hồ sơ xem task open của hồ sơ mình, sắp priority desc, dueAt asc null cuối', async () => {
    const res = await owner.agent.get('/api/v1/maintenance-tasks').set('Origin', TEST_ORIGIN);
    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([
      taskHighDue,
      taskHighNoDue,
      taskMid,
      taskLow,
      secondDeviceTask,
    ]);
    expect(res.body.nextCursor).toBeNull();
    // Không thấy task đã đóng (mặc định status=open) và task không gắn subject.
    expect(res.body.items.some((item: { id: string }) => item.id === closedTask)).toBe(false);
    expect(res.body.items.some((item: { id: string }) => item.id === unlinkedTask)).toBe(false);
  });

  test('T2 (FR-11): lọc status=closed / all và deviceId', async () => {
    const closedRes = await owner.agent
      .get('/api/v1/maintenance-tasks?status=closed')
      .set('Origin', TEST_ORIGIN);
    expect(closedRes.status).toBe(200);
    expect(closedRes.body.items.map((item: { id: string }) => item.id)).toEqual([closedTask]);

    const allRes = await owner.agent
      .get('/api/v1/maintenance-tasks?status=all')
      .set('Origin', TEST_ORIGIN);
    expect(allRes.status).toBe(200);
    const allIds = allRes.body.items.map((item: { id: string }) => item.id);
    expect(allIds).toContain(closedTask);
    expect(allIds).toContain(taskLow);
    expect(allIds).not.toContain(unlinkedTask);

    const deviceRes = await owner.agent
      .get(`/api/v1/maintenance-tasks?deviceId=${secondDeviceId}`)
      .set('Origin', TEST_ORIGIN);
    expect(deviceRes.status).toBe(200);
    expect(deviceRes.body.items.map((item: { id: string }) => item.id)).toEqual([secondDeviceTask]);
  });

  test('T3 (FR-02): caregiver cần canReceiveAlerts; thiếu quyền 403; người ngoài 404', async () => {
    const caregiverRes = await caregiver.agent
      .get(`/api/v1/maintenance-tasks?subjectId=${subjectId}`)
      .set('Origin', TEST_ORIGIN);
    expect(caregiverRes.status).toBe(200);
    expect(caregiverRes.body.items.some((item: { id: string }) => item.id === taskLow)).toBe(true);

    const limitedRes = await limited.agent
      .get(`/api/v1/maintenance-tasks?subjectId=${subjectId}`)
      .set('Origin', TEST_ORIGIN);
    expect(limitedRes.status).toBe(403);
    expect(limitedRes.body.code).toBe('FORBIDDEN');

    const outsiderRes = await outsider.agent
      .get(`/api/v1/maintenance-tasks?subjectId=${subjectId}`)
      .set('Origin', TEST_ORIGIN);
    expect(outsiderRes.status).toBe(404);
    expect(outsiderRes.body.code).toBe('NOT_FOUND');
  });

  test('T4 (FR-11): admin không có link → 404 khi lọc subjectId; không lọc thì chỉ thấy task không gắn subject', async () => {
    const bySubject = await admin.agent
      .get(`/api/v1/maintenance-tasks?subjectId=${subjectId}`)
      .set('Origin', TEST_ORIGIN);
    expect(bySubject.status).toBe(404);

    const all = await admin.agent.get('/api/v1/maintenance-tasks').set('Origin', TEST_ORIGIN);
    expect(all.status).toBe(200);
    expect(all.body.items.map((item: { id: string }) => item.id)).toEqual([unlinkedTask]);
  });

  test('T5 (FR-11): owner đóng task; đóng lại 409; reason sai độ dài 422; có audit', async () => {
    const closeRes = await owner.agent
      .post(`/api/v1/maintenance-tasks/${taskLow}/close`)
      .set('Origin', TEST_ORIGIN)
      .send({ reason: 'Đã kiểm tra và xử lý xong.' });
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.id).toBe(taskLow);
    expect(closeRes.body.status).toBe('done');
    expect(closeRes.body.closedAt).not.toBeNull();
    expect(closeRes.body.closeReason).toBe('Đã kiểm tra và xử lý xong.');

    const auditRows = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, taskLow));
    const closeAudit = auditRows.find((row) => row.action === 'maintenance_task.close');
    expect(closeAudit).toBeDefined();
    expect(closeAudit?.outcome).toBe('success');

    const again = await owner.agent
      .post(`/api/v1/maintenance-tasks/${taskLow}/close`)
      .set('Origin', TEST_ORIGIN)
      .send({ reason: 'Đóng lần nữa.' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('CONFLICT');

    const short = await owner.agent
      .post(`/api/v1/maintenance-tasks/${taskMid}/close`)
      .set('Origin', TEST_ORIGIN)
      .send({ reason: 'ab' });
    expect(short.status).toBe(422);
    expect(short.body.code).toBe('VALIDATION_FAILED');
  });

  test('T6 (FR-02): chỉ owner hoặc admin đóng được task', async () => {
    const caregiverRes = await caregiver.agent
      .post(`/api/v1/maintenance-tasks/${taskMid}/close`)
      .set('Origin', TEST_ORIGIN)
      .send({ reason: 'Người thân cố đóng.' });
    expect(caregiverRes.status).toBe(403);

    const outsiderRes = await outsider.agent
      .post(`/api/v1/maintenance-tasks/${taskMid}/close`)
      .set('Origin', TEST_ORIGIN)
      .send({ reason: 'Người ngoài cố đóng.' });
    expect(outsiderRes.status).toBe(404);

    const adminRes = await admin.agent
      .post(`/api/v1/maintenance-tasks/${unlinkedTask}/close`)
      .set('Origin', TEST_ORIGIN)
      .send({ reason: 'Rà soát xong, đóng theo chính sách.' });
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.status).toBe('done');

    const ownerRes = await owner.agent
      .post(`/api/v1/maintenance-tasks/${taskMid}/close`)
      .set('Origin', TEST_ORIGIN)
      .send({ reason: 'Chủ hồ sơ đóng sau khi xử lý.' });
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.status).toBe('done');
  });

  test('T7 (FR-11): phân trang cursor theo thứ tự sắp xếp', async () => {
    const first = await owner.agent
      .get(`/api/v1/maintenance-tasks?subjectId=${subjectId}&limit=2`)
      .set('Origin', TEST_ORIGIN);
    expect(first.status).toBe(200);
    expect(first.body.items.length).toBe(2);
    expect(first.body.nextCursor).not.toBeNull();

    const second = await owner.agent
      .get(`/api/v1/maintenance-tasks?subjectId=${subjectId}&limit=2&cursor=${first.body.nextCursor}`)
      .set('Origin', TEST_ORIGIN);
    expect(second.status).toBe(200);

    const firstIds = first.body.items.map((item: { id: string }) => item.id);
    const secondIds = second.body.items.map((item: { id: string }) => item.id);
    expect(firstIds.some((id: string) => secondIds.includes(id))).toBe(false);
    expect(firstIds.length + secondIds.length).toBeGreaterThanOrEqual(3);

    const badCursor = await owner.agent
      .get('/api/v1/maintenance-tasks?cursor=%%%khong-hop-le')
      .set('Origin', TEST_ORIGIN);
    expect(badCursor.status).toBe(422);
  });
});
