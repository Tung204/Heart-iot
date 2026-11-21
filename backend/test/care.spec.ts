import request from 'supertest';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { DEFAULT_CARE_PERMISSIONS, type CarePermissions } from '@heart-iot/contracts';
import { careLinkSummarySchema, invitationCreatedSchema } from '@heart-iot/contracts/care';
import { createModuleTestApp, createAdmin, registerUser, TEST_ORIGIN, type TestContext, type TestUser } from './test-app';
import { SubjectsModule } from '../src/subjects/subjects.module';
import { CareModule } from '../src/care/care.module';
import { SessionGuard } from '../src/auth/session.guard';
import { AuthModule } from '../src/auth/auth.module';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import { sha256 } from '../src/auth/password';
import { DB, type AppDb } from '../src/database/database';
import { auditLogs, careLinks, invitations, realtimeEvents } from '../src/database/schema';

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

describe('Care — mời, chấp nhận, thu hồi chia sẻ (FR-02, NFR-01, NFR-05)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createModuleTestApp([SubjectsModule, CareModule, GuardInfraModule]);
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function createSubject(owner: TestUser, displayName: string) {
    const res = await owner.agent
      .post('/api/v1/subjects')
      .set('Origin', TEST_ORIGIN)
      .send({ displayName });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  async function inviteAndAccept(
    owner: TestUser,
    subjectId: string,
    email: string,
    caregiver: TestUser,
    permissions: CarePermissions = DEFAULT_CARE_PERMISSIONS,
  ) {
    const invite = await owner.agent
      .post(`/api/v1/subjects/${subjectId}/invitations`)
      .set('Origin', TEST_ORIGIN)
      .send({ email, permissions });
    expect(invite.status).toBe(201);
    const accept = await caregiver.agent
      .post(`/api/v1/invitations/${invite.body.token}/accept`)
      .set('Origin', TEST_ORIGIN)
      .send({});
    expect(accept.status).toBe(201);
    return { invite, accept };
  }

  it('mời → preview public không lộ email/dữ liệu sức khỏe → accept sai email 403, đúng email tạo link với đúng quyền', async () => {
    const owner = await registerUser(ctx.app, { displayName: 'Con trai' });
    const subject = await createSubject(owner, 'Bà An');
    const subjectId = subject.id;
    const caregiver = await registerUser(ctx.app);
    const permissions: CarePermissions = {
      historyDays: 7,
      canReceiveAlerts: true,
      canAcknowledge: true,
      canResolve: false,
      canViewAi: false,
      canViewMeasurements: true,
    };

    const invite = await owner.agent
      .post(`/api/v1/subjects/${subjectId}/invitations`)
      .set('Origin', TEST_ORIGIN)
      .send({ email: caregiver.email, permissions });
    expect(invite.status).toBe(201);
    const created = invitationCreatedSchema.parse(invite.body);
    const token = created.token;
    expect(created.acceptUrl).toContain(token);
    expect(created.invitation).toMatchObject({
      subjectId,
      email: caregiver.email,
      permissions,
      status: 'pending',
      acceptedAt: null,
      revokedAt: null,
    });

    // DB chỉ lưu hash, không lưu token thô
    const db = ctx.app.get<AppDb>(DB);
    const rows = await db.select().from(invitations).where(eq(invitations.subjectId, subjectId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(sha256(token));
    expect(rows[0]?.tokenHash).not.toBe(token);

    // Preview công khai: không phiên, không email, không dữ liệu sức khỏe
    const preview = await request(ctx.app.getHttpServer()).get(`/api/v1/invitations/${token}`);
    expect(preview.status).toBe(200);
    expect(preview.body).toEqual({
      subjectName: 'Bà An',
      inviterName: 'Con trai',
      permissions,
      expiresAt: created.invitation.expiresAt,
      status: 'pending',
    });
    expect(preview.body.email).toBeUndefined();
    expect(preview.body.heartRate).toBeUndefined();

    // Accept với tài khoản sai email → 403
    const wrongUser = await registerUser(ctx.app);
    const wrong = await wrongUser.agent
      .post(`/api/v1/invitations/${token}/accept`)
      .set('Origin', TEST_ORIGIN)
      .send({});
    expect(wrong.status).toBe(403);
    expect(wrong.body.code).toBe('FORBIDDEN');

    // Accept đúng email → tạo link
    const accept = await caregiver.agent
      .post(`/api/v1/invitations/${token}/accept`)
      .set('Origin', TEST_ORIGIN)
      .send({});
    expect(accept.status).toBe(201);
    const link = careLinkSummarySchema.parse(accept.body);
    expect(link).toMatchObject({
      subjectId,
      caregiver: { id: caregiver.session.user.id, email: caregiver.email },
      permissions,
      status: 'active',
      revokedAt: null,
    });

    // Caregiver xem được với đúng quyền giới hạn lịch sử
    const list = await caregiver.agent.get('/api/v1/subjects');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ id: subjectId, role: 'caregiver', permissions });
    expect(list.body.items[0].sharedFrom).toBeTruthy();
    const detail = await caregiver.agent.get(`/api/v1/subjects/${subjectId}`);
    expect(detail.status).toBe(200);

    // Owner xem danh sách invitation với email đầy đủ
    const listInv = await owner.agent.get(`/api/v1/subjects/${subjectId}/invitations`);
    expect(listInv.status).toBe(200);
    expect(listInv.body.items).toHaveLength(1);
    expect(listInv.body.items[0]).toMatchObject({ email: caregiver.email, status: 'accepted' });
    expect(listInv.body.items[0].acceptedAt).toBeTruthy();

    // Realtime event care.accepted cho subject
    const events = await db.select().from(realtimeEvents).where(eq(realtimeEvents.subjectId, subjectId));
    const acceptedEvent = events.find((event) => event.type === 'care.accepted');
    expect(acceptedEvent).toBeTruthy();
    expect(acceptedEvent?.payload).toEqual({
      linkId: link.id,
      caregiverUserId: caregiver.session.user.id,
    });

    // Token đã dùng → preview và accept đều 404
    const preview2 = await request(ctx.app.getHttpServer()).get(`/api/v1/invitations/${token}`);
    expect(preview2.status).toBe(404);
    const reaccept = await caregiver.agent
      .post(`/api/v1/invitations/${token}/accept`)
      .set('Origin', TEST_ORIGIN)
      .send({});
    expect(reaccept.status).toBe(404);
  });

  it('thu hồi → caregiver mất quyền ngay, owner vẫn xem, audit và realtime ghi nhận', async () => {
    const owner = await registerUser(ctx.app);
    const subject = await createSubject(owner, 'Ông Bảy');
    const subjectId = subject.id;
    const caregiver = await registerUser(ctx.app);
    await inviteAndAccept(owner, subjectId, caregiver.email, caregiver);

    const before = await caregiver.agent.get(`/api/v1/subjects/${subjectId}`);
    expect(before.status).toBe(200);

    const links = await owner.agent.get(`/api/v1/subjects/${subjectId}/care-links`);
    expect(links.status).toBe(200);
    expect(links.body.items).toHaveLength(1);
    const link = links.body.items[0] as { id: string };
    expect(link).toMatchObject({ caregiver: { id: caregiver.session.user.id }, status: 'active' });

    const revoke = await owner.agent
      .delete(`/api/v1/subjects/${subjectId}/care-links/${link.id}`)
      .set('Origin', TEST_ORIGIN);
    expect(revoke.status).toBe(204);

    const after = await caregiver.agent.get(`/api/v1/subjects/${subjectId}`);
    expect(after.status).toBe(404);
    const listAfter = await caregiver.agent.get('/api/v1/subjects');
    expect(listAfter.body.items).toHaveLength(0);

    const ownerView = await owner.agent.get(`/api/v1/subjects/${subjectId}`);
    expect(ownerView.status).toBe(200);

    const linksAfter = await owner.agent.get(`/api/v1/subjects/${subjectId}/care-links`);
    expect(linksAfter.body.items[0]).toMatchObject({
      status: 'revoked',
      revokedAt: expect.any(String),
    });

    const db = ctx.app.get<AppDb>(DB);
    const events = await db.select().from(realtimeEvents).where(eq(realtimeEvents.type, 'care.revoked'));
    expect(events).toHaveLength(1);
    expect(events[0]?.subjectId).toBe(subjectId);
    expect(events[0]?.payload).toEqual({ linkId: link.id, caregiverUserId: caregiver.session.user.id });

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, 'care_link.revoke'));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.outcome).toBe('success');
    expect(logs[0]?.actorUserId).toBe(owner.session.user.id);

    // Thu hồi link đã thu hồi → 404
    const again = await owner.agent
      .delete(`/api/v1/subjects/${subjectId}/care-links/${link.id}`)
      .set('Origin', TEST_ORIGIN);
    expect(again.status).toBe(404);
  });

  it('không tạo trùng invitation/link, không mời chính chủ, lời mời hết hạn bị từ chối', async () => {
    const owner = await registerUser(ctx.app);
    const subject = await createSubject(owner, 'Bà An');
    const subjectId = subject.id;
    const caregiver = await registerUser(ctx.app);
    const permissions: CarePermissions = DEFAULT_CARE_PERMISSIONS;

    const invite = () =>
      owner.agent
        .post(`/api/v1/subjects/${subjectId}/invitations`)
        .set('Origin', TEST_ORIGIN)
        .send({ email: caregiver.email, permissions });

    const first = await invite();
    expect(first.status).toBe(201);
    const duplicate = await invite();
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('CONFLICT');

    // Không mời chính chủ hồ sơ
    const self = await owner.agent
      .post(`/api/v1/subjects/${subjectId}/invitations`)
      .set('Origin', TEST_ORIGIN)
      .send({ email: owner.email, permissions });
    expect(self.status).toBe(422);

    // Sau khi chấp nhận, mời lại cùng email → 409 vì đã có link active
    const accept = await caregiver.agent
      .post(`/api/v1/invitations/${first.body.token}/accept`)
      .set('Origin', TEST_ORIGIN)
      .send({});
    expect(accept.status).toBe(201);
    const afterLink = await invite();
    expect(afterLink.status).toBe(409);

    // Lời mời hết hạn → preview và accept đều 404
    const db = ctx.app.get<AppDb>(DB);
    const lateUser = await registerUser(ctx.app);
    const late = await owner.agent
      .post(`/api/v1/subjects/${subjectId}/invitations`)
      .set('Origin', TEST_ORIGIN)
      .send({ email: lateUser.email, permissions });
    expect(late.status).toBe(201);
    await db
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(invitations.id, late.body.invitation.id));
    const previewLate = await request(ctx.app.getHttpServer()).get(`/api/v1/invitations/${late.body.token}`);
    expect(previewLate.status).toBe(404);
    const acceptLate = await lateUser.agent
      .post(`/api/v1/invitations/${late.body.token}/accept`)
      .set('Origin', TEST_ORIGIN)
      .send({});
    expect(acceptLate.status).toBe(404);
  });

  it('non-owner không mời/thu hồi được; người lạ nhận 404; admin không tự xem hồ sơ', async () => {
    const owner = await registerUser(ctx.app);
    const subject = await createSubject(owner, 'Bà An');
    const subjectId = subject.id;
    const caregiver = await registerUser(ctx.app);
    await inviteAndAccept(owner, subjectId, caregiver.email, caregiver);

    // Caregiver có quyền xem nhưng không phải owner
    const inviteByCaregiver = await caregiver.agent
      .post(`/api/v1/subjects/${subjectId}/invitations`)
      .set('Origin', TEST_ORIGIN)
      .send({ email: 'x@example.test', permissions: DEFAULT_CARE_PERMISSIONS });
    expect(inviteByCaregiver.status).toBe(403);

    const links = await owner.agent.get(`/api/v1/subjects/${subjectId}/care-links`);
    const linkId = links.body.items[0].id as string;
    const revokeByCaregiver = await caregiver.agent
      .delete(`/api/v1/subjects/${subjectId}/care-links/${linkId}`)
      .set('Origin', TEST_ORIGIN);
    expect(revokeByCaregiver.status).toBe(403);

    // Người lạ: không lộ sự tồn tại hồ sơ/liên kết
    const stranger = await registerUser(ctx.app);
    const inviteByStranger = await stranger.agent
      .post(`/api/v1/subjects/${subjectId}/invitations`)
      .set('Origin', TEST_ORIGIN)
      .send({ email: 'x@example.test', permissions: DEFAULT_CARE_PERMISSIONS });
    expect(inviteByStranger.status).toBe(404);
    const revokeByStranger = await stranger.agent
      .delete(`/api/v1/subjects/${subjectId}/care-links/${linkId}`)
      .set('Origin', TEST_ORIGIN);
    expect(revokeByStranger.status).toBe(404);

    // Owner của hồ sơ khác không thu hồi link hồ sơ này
    const otherOwner = await registerUser(ctx.app);
    const revokeByOtherOwner = await otherOwner.agent
      .delete(`/api/v1/subjects/${subjectId}/care-links/${linkId}`)
      .set('Origin', TEST_ORIGIN);
    expect(revokeByOtherOwner.status).toBe(404);

    // Admin không tự xem hồ sơ khi không có liên kết
    const admin = await createAdmin(ctx.app);
    const adminView = await admin.agent.get(`/api/v1/subjects/${subjectId}`);
    expect(adminView.status).toBe(404);
    const adminList = await admin.agent.get('/api/v1/subjects');
    expect(adminList.body.items).toHaveLength(0);
  });

  it('link/lời mời cũ thiếu canViewMeasurements được đọc là true (tương thích, không migration)', async () => {
    const owner = await registerUser(ctx.app);
    const subject = await createSubject(owner, 'Bà Tư');
    const caregiver = await registerUser(ctx.app);
    const db = ctx.app.get<AppDb>(DB);
    // Quyền của bản ghi tạo trước khi có trường `canViewMeasurements`.
    const legacyPermissions = {
      historyDays: 7,
      canReceiveAlerts: true,
      canAcknowledge: true,
      canResolve: false,
      canViewAi: false,
    };

    await db.insert(careLinks).values({
      subjectId: subject.id,
      caregiverUserId: caregiver.session.user.id,
      invitedByUserId: owner.session.user.id,
      permissions: legacyPermissions,
      status: 'active',
      sharedFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    // Đọc qua `GET /subjects` và `GET .../care-links`: luôn có trường với giá trị true.
    const list = await caregiver.agent.get('/api/v1/subjects');
    expect(list.status).toBe(200);
    expect(list.body.items[0].permissions).toEqual({
      ...legacyPermissions,
      canViewMeasurements: true,
    });
    const links = await owner.agent.get(`/api/v1/subjects/${subject.id}/care-links`);
    expect(links.status).toBe(200);
    expect(links.body.items[0].permissions.canViewMeasurements).toBe(true);

    // Lời mời gửi thiếu trường: schema điền true và lưu đủ trường vào jsonb.
    const invited = await registerUser(ctx.app);
    const created = await owner.agent
      .post(`/api/v1/subjects/${subject.id}/invitations`)
      .set('Origin', TEST_ORIGIN)
      .send({ email: invited.email, permissions: legacyPermissions });
    expect(created.status).toBe(201);
    expect(created.body.invitation.permissions).toEqual({
      ...legacyPermissions,
      canViewMeasurements: true,
    });
    const rows = await db
      .select()
      .from(invitations)
      .where(eq(invitations.id, created.body.invitation.id));
    expect(rows[0]?.permissions.canViewMeasurements).toBe(true);
  });

  it('không có phiên → 401 cho invitation/care-links; token sai → 404 (public)', async () => {
    const owner = await registerUser(ctx.app);
    const subject = await createSubject(owner, 'Bà An');
    const subjectId = subject.id;

    const noInv = await request(ctx.app.getHttpServer()).get(`/api/v1/subjects/${subjectId}/invitations`);
    expect(noInv.status).toBe(401);
    const noLinks = await request(ctx.app.getHttpServer()).get(`/api/v1/subjects/${subjectId}/care-links`);
    expect(noLinks.status).toBe(401);

    const bogus = await request(ctx.app.getHttpServer()).get('/api/v1/invitations/token-khong-ton-tai-xyz');
    expect(bogus.status).toBe(404);
    expect(bogus.body.code).toBe('NOT_FOUND');
  });
});
