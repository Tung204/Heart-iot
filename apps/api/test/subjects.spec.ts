import request from 'supertest';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { OWNER_PERMISSIONS } from '@annhien/contracts';
import { subjectDetailSchema } from '@annhien/contracts/subjects';
import { createModuleTestApp, createAdmin, registerUser, TEST_ORIGIN, type TestContext, type TestUser } from './test-app';
import { SubjectsModule } from '../src/subjects/subjects.module';
import { CareModule } from '../src/care/care.module';
import { SessionGuard } from '../src/auth/session.guard';
import { AuthModule } from '../src/auth/auth.module';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import { DB, type AppDb } from '../src/database/database';
import { auditLogs, careLinks } from '../src/database/schema';

/**
 * `createModuleTestApp` không đăng ký APP_GUARD/APP_FILTER (chỉ có trong AppModule).
 * Module cục bộ này bù guard phiên + filter lỗi cho test module mà không sửa code nền.
 */
@Module({
  imports: [AuthModule],
  providers: [
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
class GuardInfraModule {}

describe('Subjects — hồ sơ và quyền xem (FR-02, NFR-01)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createModuleTestApp([SubjectsModule, CareModule, GuardInfraModule]);
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function createSubject(
    owner: TestUser,
    input: { displayName?: string; timezone?: string } = {},
  ) {
    return owner.agent
      .post('/api/v1/subjects')
      .set('Origin', TEST_ORIGIN)
      .send({
        displayName: input.displayName ?? 'Bà An',
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      });
  }

  it('tạo hồ sơ trả 201, danh sách và chi tiết đúng role owner (FR-02)', async () => {
    const owner = await registerUser(ctx.app);
    const created = await createSubject(owner, { displayName: 'Bà An' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      displayName: 'Bà An',
      timezone: 'Asia/Ho_Chi_Minh',
      role: 'owner',
      permissions: OWNER_PERMISSIONS,
      sharedFrom: null,
      archivedAt: null,
    });
    // Response phải khớp hợp đồng published
    const detail = subjectDetailSchema.parse(created.body);
    expect(detail.ownerUserId).toBe(owner.session.user.id);
    expect(typeof detail.createdAt).toBe('string');

    const list = await owner.agent.get('/api/v1/subjects');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ id: detail.id, role: 'owner' });

    const get = await owner.agent.get(`/api/v1/subjects/${detail.id}`);
    expect(get.status).toBe(200);
    expect(get.body).toMatchObject({ id: detail.id, displayName: 'Bà An' });
  });

  it('người không có liên kết nhận 404 và không thấy hồ sơ trong danh sách', async () => {
    const owner = await registerUser(ctx.app);
    const created = await createSubject(owner);
    const stranger = await registerUser(ctx.app);

    const list = await stranger.agent.get('/api/v1/subjects');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(0);

    const get = await stranger.agent.get(`/api/v1/subjects/${created.body.id}`);
    expect(get.status).toBe(404);
    expect(get.body.code).toBe('NOT_FOUND');
  });

  it('timezone không hợp lệ bị từ chối 422 khi tạo hồ sơ', async () => {
    const owner = await registerUser(ctx.app);
    const created = await createSubject(owner, { timezone: 'Asia/Khong_Ton_Tai' });
    expect(created.status).toBe(422);
    expect(created.body.code).toBe('VALIDATION_FAILED');
  });

  it('không có phiên → 401; origin lạ khi POST → 403', async () => {
    const owner = await registerUser(ctx.app);

    const noSession = await request(ctx.app.getHttpServer()).get('/api/v1/subjects');
    expect(noSession.status).toBe(401);
    expect(noSession.body.code).toBe('UNAUTHENTICATED');

    const badOrigin = await owner.agent
      .post('/api/v1/subjects')
      .set('Origin', 'https://evil.example')
      .send({ displayName: 'Bị chặn' });
    expect(badOrigin.status).toBe(403);
    expect(badOrigin.body.code).toBe('FORBIDDEN');
  });

  it('chủ hồ sơ cập nhật; body rỗng/timezone sai → 422; audit ghi subject.update', async () => {
    const owner = await registerUser(ctx.app);
    const created = await createSubject(owner, { displayName: 'Bà An' });
    const id = created.body.id as string;

    const empty = await owner.agent.patch(`/api/v1/subjects/${id}`).set('Origin', TEST_ORIGIN).send({});
    expect(empty.status).toBe(422);

    const badTz = await owner.agent
      .patch(`/api/v1/subjects/${id}`)
      .set('Origin', TEST_ORIGIN)
      .send({ timezone: 'Asia/Khong_Ton_Tai' });
    expect(badTz.status).toBe(422);

    const ok = await owner.agent
      .patch(`/api/v1/subjects/${id}`)
      .set('Origin', TEST_ORIGIN)
      .send({ displayName: 'Bà An (đã đổi)', timezone: 'Asia/Tokyo' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ displayName: 'Bà An (đã đổi)', timezone: 'Asia/Tokyo' });
    subjectDetailSchema.parse(ok.body);

    const db = ctx.app.get<AppDb>(DB);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, 'subject.update'));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.outcome).toBe('success');
    expect(logs[0]?.actorUserId).toBe(owner.session.user.id);
    expect(logs[0]?.targetId).toBe(id);
  });

  it('caregiver xem được nhưng không sửa (403); admin không xem hồ sơ khi không có liên kết (404)', async () => {
    const owner = await registerUser(ctx.app);
    const created = await createSubject(owner);
    const id = created.body.id as string;
    const caregiver = await registerUser(ctx.app);
    const db = ctx.app.get<AppDb>(DB);

    // Chèn care link trực tiếp để kiểm quyền caregiver không phụ thuộc luồng mời
    await db.insert(careLinks).values({
      subjectId: id,
      caregiverUserId: caregiver.session.user.id,
      invitedByUserId: owner.session.user.id,
      permissions: {
        historyDays: 7,
        canReceiveAlerts: true,
        canAcknowledge: true,
        canResolve: false,
        canViewAi: false,
      },
      status: 'active',
      sharedFrom: new Date(),
      acceptedAt: new Date(),
    });

    const view = await caregiver.agent.get(`/api/v1/subjects/${id}`);
    expect(view.status).toBe(200);
    expect(view.body.role).toBe('caregiver');
    expect(view.body.permissions.historyDays).toBe(7);

    const patch = await caregiver.agent
      .patch(`/api/v1/subjects/${id}`)
      .set('Origin', TEST_ORIGIN)
      .send({ displayName: 'Đổi trộm' });
    expect(patch.status).toBe(403);
    expect(patch.body.code).toBe('FORBIDDEN');

    const admin = await createAdmin(ctx.app);
    const adminView = await admin.agent.get(`/api/v1/subjects/${id}`);
    expect(adminView.status).toBe(404);
    const adminList = await admin.agent.get('/api/v1/subjects');
    expect(adminList.body.items).toHaveLength(0);
  });
});
