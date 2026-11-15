import request from 'supertest';
import { eq } from 'drizzle-orm';
import { DEFAULT_CARE_PERMISSIONS } from '@annhien/contracts';
import {
  createAdmin,
  createModuleTestApp,
  registerUser,
  TEST_ORIGIN,
  type TestContext,
  type TestUser,
} from './test-app';
import { MaintenanceModule } from '../src/maintenance/maintenance.module';
import {
  auditLogs,
  careLinks,
  deviceAssignments,
  devices,
  maintenanceTasks,
  subjects,
} from '../src/database/schema';

/**
 * POST /maintenance-tasks — chủ hồ sơ tạo việc bảo trì cho thiết bị đang gắn.
 *
 * Kiểm: phân quyền (owner 201, caregiver 403, người ngoài/admin 404, hồ sơ
 * archive 404), thiết bị phải đang gắn đúng hồ sơ (400), dueAt quá khứ (400)
 * nhưng cho sai số 1 phút, validation hợp đồng (422), audit không chứa ghi chú,
 * và task mới xuất hiện trong danh sách của chủ hồ sơ/người thân có quyền.
 */

let serialCounter = 0;
const nextSerial = () => `TC-${String(++serialCounter).padStart(4, '0')}`;

async function seedDevice(
  ctx: TestContext,
  ownerUserId: string,
  subjectId: string | null,
  options: { ended?: boolean } = {},
): Promise<string> {
  const deviceRows = await ctx.db
    .insert(devices)
    .values({
      serial: nextSerial(),
      label: 'Vòng tay demo',
      credentialHash: 'hash-demo',
      status: 'active',
    })
    .returning();
  const device = deviceRows[0];
  if (!device) throw new Error('Không tạo được device.');
  if (subjectId) {
    await ctx.db.insert(deviceAssignments).values({
      deviceId: device.id,
      subjectId,
      assignedByUserId: ownerUserId,
      ...(options.ended ? { endedAt: new Date() } : {}),
    });
  }
  return device.id;
}

describe('POST /maintenance-tasks — chủ hồ sơ tạo việc bảo trì', () => {
  let ctx: TestContext;
  let owner: TestUser;
  let caregiver: TestUser;
  let outsider: TestUser;
  let admin: TestUser;
  let subjectId: string;
  let otherSubjectId: string;
  let archivedSubjectId: string;
  let deviceId: string;
  let otherSubjectDeviceId: string;
  let releasedDeviceId: string;
  let unassignedDeviceId: string;

  beforeAll(async () => {
    ctx = await createModuleTestApp([MaintenanceModule]);
    owner = await registerUser(ctx.app, { displayName: 'Chủ hồ sơ' });
    caregiver = await registerUser(ctx.app, { displayName: 'Người thân' });
    outsider = await registerUser(ctx.app, { displayName: 'Người ngoài' });
    admin = await createAdmin(ctx.app);

    const subjectRows = await ctx.db
      .insert(subjects)
      .values([
        {
          ownerUserId: owner.session.user.id,
          displayName: 'Bà An',
          timezone: 'Asia/Ho_Chi_Minh',
        },
        {
          ownerUserId: owner.session.user.id,
          displayName: 'Ông Bình',
          timezone: 'Asia/Ho_Chi_Minh',
        },
        {
          ownerUserId: owner.session.user.id,
          displayName: 'Hồ sơ đã lưu trữ',
          timezone: 'Asia/Ho_Chi_Minh',
          archivedAt: new Date(),
        },
      ])
      .returning();
    const [subject, otherSubject, archivedSubject] = subjectRows;
    if (!subject || !otherSubject || !archivedSubject) throw new Error('Không tạo được subject.');
    subjectId = subject.id;
    otherSubjectId = otherSubject.id;
    archivedSubjectId = archivedSubject.id;

    await ctx.db.insert(careLinks).values({
      subjectId,
      caregiverUserId: caregiver.session.user.id,
      invitedByUserId: owner.session.user.id,
      permissions: { ...DEFAULT_CARE_PERMISSIONS, canReceiveAlerts: true },
      status: 'active',
      sharedFrom: new Date(),
    });

    deviceId = await seedDevice(ctx, owner.session.user.id, subjectId);
    otherSubjectDeviceId = await seedDevice(ctx, owner.session.user.id, otherSubjectId);
    releasedDeviceId = await seedDevice(ctx, owner.session.user.id, subjectId, { ended: true });
    unassignedDeviceId = await seedDevice(ctx, owner.session.user.id, null);
  });

  afterAll(async () => {
    await ctx.close();
  });

  function validBody(overrides: Record<string, unknown> = {}) {
    return {
      subjectId,
      deviceId,
      kind: 'battery_check',
      title: 'Thay pin vòng tay',
      priority: 60,
      ...overrides,
    };
  }

  test('T1 (FR-11): owner tạo thành công — trim, notes rỗng → null, dedupeKey manual:, audit, list', async () => {
    const dueAt = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();
    const res = await owner.agent
      .post('/api/v1/maintenance-tasks')
      .set('Origin', TEST_ORIGIN)
      .send(
        validBody({
          title: '  Thay pin vòng tay  ',
          priority: 60,
          dueAt,
          notes: '   ',
        }),
      );

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      deviceId,
      subjectId,
      kind: 'battery_check',
      title: 'Thay pin vòng tay',
      status: 'open',
      priority: 60,
      notes: null,
      closedAt: null,
      closeReason: null,
    });
    expect(typeof res.body.id).toBe('string');
    expect(new Date(res.body.dueAt).toISOString()).toBe(dueAt);

    const rows = await ctx.db
      .select()
      .from(maintenanceTasks)
      .where(eq(maintenanceTasks.id, res.body.id));
    const row = rows[0];
    expect(row).toBeDefined();
    expect(row?.status).toBe('open');
    expect(row?.dedupeKey).toMatch(/^manual:[0-9a-f-]{36}$/);
    expect(row?.notes).toBeNull();

    const audits = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, res.body.id));
    const createAudit = audits.find((entry) => entry.action === 'maintenance_task.create');
    expect(createAudit).toBeDefined();
    expect(createAudit?.outcome).toBe('success');
    expect(createAudit?.targetType).toBe('maintenance_task');
    // Không có ghi chú sức khỏe trong audit.
    expect(createAudit?.metadata).toEqual({ kind: 'battery_check', priority: 60, deviceId });

    const ownerList = await owner.agent
      .get(`/api/v1/maintenance-tasks?status=all&subjectId=${subjectId}`)
      .set('Origin', TEST_ORIGIN);
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.items.some((item: { id: string }) => item.id === res.body.id)).toBe(true);

    const caregiverList = await caregiver.agent
      .get(`/api/v1/maintenance-tasks?status=open&subjectId=${subjectId}`)
      .set('Origin', TEST_ORIGIN);
    expect(caregiverList.status).toBe(200);
    expect(caregiverList.body.items.some((item: { id: string }) => item.id === res.body.id)).toBe(
      true,
    );
  });

  test('T2 (FR-02): caregiver có link → 403; người ngoài/admin → 404; chưa đăng nhập → 401', async () => {
    const caregiverRes = await caregiver.agent
      .post('/api/v1/maintenance-tasks')
      .set('Origin', TEST_ORIGIN)
      .send(validBody({ title: 'Người thân tạo việc' }));
    expect(caregiverRes.status).toBe(403);
    expect(caregiverRes.body.code).toBe('FORBIDDEN');

    const outsiderRes = await outsider.agent
      .post('/api/v1/maintenance-tasks')
      .set('Origin', TEST_ORIGIN)
      .send(validBody({ title: 'Người ngoài tạo việc' }));
    expect(outsiderRes.status).toBe(404);
    expect(outsiderRes.body.code).toBe('NOT_FOUND');

    const adminRes = await admin.agent
      .post('/api/v1/maintenance-tasks')
      .set('Origin', TEST_ORIGIN)
      .send(validBody({ title: 'Admin tạo thay' }));
    expect(adminRes.status).toBe(404);
    expect(adminRes.body.code).toBe('NOT_FOUND');

    const anonymous = await request(ctx.app.getHttpServer())
      .post('/api/v1/maintenance-tasks')
      .set('Origin', TEST_ORIGIN)
      .send(validBody({ title: 'Không phiên tạo việc' }));
    expect(anonymous.status).toBe(401);
  });

  test('T3 (FR-03): thiết bị không đang gắn đúng hồ sơ → 400, không phải 500', async () => {
    const cases = [
      { deviceId: otherSubjectDeviceId, label: 'thiết bị của hồ sơ khác' },
      { deviceId: releasedDeviceId, label: 'thiết bị đã tháo gắn' },
      { deviceId: unassignedDeviceId, label: 'thiết bị chưa gắn hồ sơ' },
      { deviceId: crypto.randomUUID(), label: 'thiết bị không tồn tại' },
    ];
    for (const item of cases) {
      const res = await owner.agent
        .post('/api/v1/maintenance-tasks')
        .set('Origin', TEST_ORIGIN)
        .send(validBody({ title: 'Kiểm tra thiết bị lạ', deviceId: item.deviceId }));
      expect({ label: item.label, status: res.status }).toEqual({ label: item.label, status: 400 });
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(String(res.body.message)).toMatch(/gắn/i);
    }
  });

  test('T4 (FR-02): hồ sơ đã archive → 404, không tạo task', async () => {
    const archivedDeviceId = await seedDevice(ctx, owner.session.user.id, archivedSubjectId);
    const res = await owner.agent
      .post('/api/v1/maintenance-tasks')
      .set('Origin', TEST_ORIGIN)
      .send(
        validBody({
          subjectId: archivedSubjectId,
          deviceId: archivedDeviceId,
          title: 'Việc cho hồ sơ đã lưu trữ',
        }),
      );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');

    const rows = await ctx.db
      .select()
      .from(maintenanceTasks)
      .where(eq(maintenanceTasks.subjectId, archivedSubjectId));
    expect(rows).toHaveLength(0);
  });

  test('T5: dueAt quá khứ → 400; trong sai số 1 phút vẫn nhận', async () => {
    const past = new Date(Date.now() - 5 * 60_000).toISOString();
    const pastRes = await owner.agent
      .post('/api/v1/maintenance-tasks')
      .set('Origin', TEST_ORIGIN)
      .send(validBody({ title: 'Việc đã quá hạn', dueAt: past }));
    expect(pastRes.status).toBe(400);
    expect(pastRes.body.code).toBe('VALIDATION_FAILED');
    expect(String(pastRes.body.message)).toMatch(/Hạn xử lý/);

    const tolerance = new Date(Date.now() - 20_000).toISOString();
    const toleranceRes = await owner.agent
      .post('/api/v1/maintenance-tasks')
      .set('Origin', TEST_ORIGIN)
      .send(validBody({ title: 'Việc lệch đồng hồ nhẹ', dueAt: tolerance }));
    expect(toleranceRes.status).toBe(201);
  });

  test('T6 (contract): validation hợp đồng → 422, không ghi task', async () => {
    const before = await ctx.db.select().from(maintenanceTasks);
    const cases = [
      validBody({ title: 'Ba' }),
      validBody({ priority: 101 }),
      validBody({ kind: 'khong_ton_tai' }),
      validBody({ extra: true }),
      validBody({ notes: 'a'.repeat(2001) }),
      { deviceId, kind: 'maintenance', title: 'Thiếu hồ sơ', priority: 10 },
    ];
    for (const body of cases) {
      const res = await owner.agent
        .post('/api/v1/maintenance-tasks')
        .set('Origin', TEST_ORIGIN)
        .send(body);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    }
    const after = await ctx.db.select().from(maintenanceTasks);
    expect(after).toHaveLength(before.length);
  });
});
