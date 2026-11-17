import request from 'supertest';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { OWNER_PERMISSIONS } from '@heart-iot/contracts';
import {
  deletionRequestRecordedSchema,
  subjectDetailSchema,
} from '@heart-iot/contracts/subjects';
import { createModuleTestApp, createAdmin, registerUser, TEST_ORIGIN, type TestContext, type TestUser } from './test-app';
import { SubjectsModule } from '../src/subjects/subjects.module';
import { CareModule } from '../src/care/care.module';
import { DevicesModule } from '../src/devices/devices.module';
import { IncidentsModule } from '../src/incidents/incidents.module';
import { PolicyModule } from '../src/policy/policy.module';
import { RealtimeModule } from '../src/realtime/realtime.module';
import { SessionGuard } from '../src/auth/session.guard';
import { AuthModule } from '../src/auth/auth.module';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import { DB, type AppDb } from '../src/database/database';
import {
  auditLogs,
  careLinks,
  deviceAssignments,
  devices,
  realtimeEvents,
  subjects,
  telemetry,
} from '../src/database/schema';

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
    ctx = await createModuleTestApp([
      PolicyModule,
      SubjectsModule,
      CareModule,
      DevicesModule,
      IncidentsModule,
      RealtimeModule,
      GuardInfraModule,
    ]);
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

  // ---------------------------------------------------------------------------
  // FR-14: lưu trữ hồ sơ (archive) và ghi nhận yêu cầu xóa dữ liệu
  // ---------------------------------------------------------------------------

  async function addCareLink(owner: TestUser, caregiver: TestUser, subjectId: string) {
    const rows = await ctx.db
      .insert(careLinks)
      .values({
        subjectId,
        caregiverUserId: caregiver.session.user.id,
        invitedByUserId: owner.session.user.id,
        permissions: {
          historyDays: 30,
          canReceiveAlerts: true,
          canAcknowledge: true,
          canResolve: false,
          canViewAi: false,
        },
        status: 'active',
        sharedFrom: new Date(),
        acceptedAt: new Date(),
      })
      .returning();
    const link = rows[0];
    if (!link) throw new Error('Không tạo được care link test.');
    return link;
  }

  /** Dữ liệu thô để chứng minh archive/deletion-request không xóa telemetry. */
  async function addTelemetry(owner: TestUser, subjectId: string) {
    const deviceRows = await ctx.db
      .insert(devices)
      .values({
        serial: `ARCH-${crypto.randomUUID()}`,
        label: 'Vòng tay kiểm thử lưu trữ',
        credentialHash: 'hash-test',
      })
      .returning();
    const device = deviceRows[0];
    if (!device) throw new Error('Không tạo được thiết bị test.');
    const assignmentRows = await ctx.db
      .insert(deviceAssignments)
      .values({
        deviceId: device.id,
        subjectId,
        assignedByUserId: owner.session.user.id,
        startedAt: new Date(Date.now() - 60_000),
      })
      .returning();
    const assignment = assignmentRows[0];
    if (!assignment) throw new Error('Không tạo được assignment test.');
    const telemetryRows = await ctx.db
      .insert(telemetry)
      .values({
        messageId: crypto.randomUUID(),
        deviceId: device.id,
        assignmentId: assignment.id,
        bootId: 'boot-archive-test',
        sequence: 1,
        measuredAt: new Date(),
        clockStatus: 'synced',
        uptimeMs: 1_000,
        metrics: { heart_rate_bpm: 70, steps_since_boot: 25 },
        quality: { heart_rate: 'valid', motion: 'valid' },
        batteryPercent: 80,
        firmwareVersion: '0.1.0-test',
        payloadHash: `hash-${crypto.randomUUID()}`,
        source: 'test',
      })
      .returning();
    const row = telemetryRows[0];
    if (!row) throw new Error('Không tạo được telemetry test.');
    return row;
  }

  async function countTelemetry(subjectId: string): Promise<number> {
    const assignmentRows = await ctx.db
      .select({ id: deviceAssignments.id })
      .from(deviceAssignments)
      .where(eq(deviceAssignments.subjectId, subjectId));
    if (assignmentRows.length === 0) return 0;
    let total = 0;
    for (const assignment of assignmentRows) {
      const rows = await ctx.db
        .select({ id: telemetry.id })
        .from(telemetry)
        .where(eq(telemetry.assignmentId, assignment.id));
      total += rows.length;
    }
    return total;
  }

  async function postArchive(user: TestUser, subjectId: string, body: Record<string, unknown>) {
    return user.agent
      .post(`/api/v1/subjects/${subjectId}/archive`)
      .set('Origin', TEST_ORIGIN)
      .send(body);
  }

  async function postDeletionRequest(user: TestUser, subjectId: string, body: Record<string, unknown>) {
    return user.agent
      .post(`/api/v1/subjects/${subjectId}/deletion-requests`)
      .set('Origin', TEST_ORIGIN)
      .send(body);
  }

  it('FR-14: owner archive → 204, thu hồi care link, audit, telemetry giữ nguyên; hồ sơ biến khỏi mọi đường đọc', async () => {
    const owner = await registerUser(ctx.app);
    const created = await createSubject(owner, { displayName: 'Bà An' });
    const id = created.body.id as string;
    const caregiver = await registerUser(ctx.app);
    const link = await addCareLink(owner, caregiver, id);
    await addTelemetry(owner, id);
    expect(await countTelemetry(id)).toBe(1);

    // Chưa archive: caregiver xem được, status/alerts trả 200.
    expect((await caregiver.agent.get(`/api/v1/subjects/${id}`)).status).toBe(200);
    expect((await caregiver.agent.get(`/api/v1/subjects/${id}/status`)).status).toBe(200);
    expect((await caregiver.agent.get(`/api/v1/subjects/${id}/alerts`)).status).toBe(200);

    // Tên xác nhận trim + không phân biệt hoa/thường vẫn khớp.
    const archived = await postArchive(owner, id, {
      reason: 'Người được theo dõi đã chuyển sang cơ sở khác, cần đóng hồ sơ demo.',
      confirmationName: '  bà AN  ',
    });
    expect(archived.status).toBe(204);
    expect(archived.text).toBe('');

    // archivedAt được đặt; telemetry KHÔNG bị xóa.
    const subjectRows = await ctx.db.select().from(subjects).where(eq(subjects.id, id));
    expect(subjectRows[0]?.archivedAt).toBeInstanceOf(Date);
    expect(await countTelemetry(id)).toBe(1);

    // Care link bị thu hồi + có realtime care.revoked để stream đang mở đóng.
    const linkRows = await ctx.db.select().from(careLinks).where(eq(careLinks.id, link.id));
    expect(linkRows[0]?.status).toBe('revoked');
    expect(linkRows[0]?.revokedAt).toBeInstanceOf(Date);
    const events = await ctx.db
      .select()
      .from(realtimeEvents)
      .where(eq(realtimeEvents.subjectId, id));
    expect(events.some((event) => event.type === 'care.revoked')).toBe(true);

    // Audit archive có reason; audit thu hồi care link có cause; không chứa số đo.
    const archiveLogs = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'subject.archive'));
    const archiveLog = archiveLogs.find((log) => log.targetId === id);
    expect(archiveLog).toBeTruthy();
    expect(archiveLog?.actorUserId).toBe(owner.session.user.id);
    expect(archiveLog?.metadata).toMatchObject({
      reason: 'Người được theo dõi đã chuyển sang cơ sở khác, cần đóng hồ sơ demo.',
      revokedCareLinks: 1,
    });
    expect(JSON.stringify(archiveLog?.metadata)).not.toContain('heart_rate');

    const revokeLogs = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'care_link.revoke'));
    const revokeLog = revokeLogs.find((log) => log.targetId === link.id);
    expect(revokeLog?.metadata).toMatchObject({ subjectId: id, cause: 'subject.archive' });

    // Owner: danh sách rỗng, chi tiết/status/alerts/SSE đều 404.
    const ownerList = await owner.agent.get('/api/v1/subjects');
    expect(ownerList.body.items).toHaveLength(0);
    expect((await owner.agent.get(`/api/v1/subjects/${id}`)).status).toBe(404);
    expect((await owner.agent.get(`/api/v1/subjects/${id}/status`)).status).toBe(404);
    expect((await owner.agent.get(`/api/v1/subjects/${id}/alerts`)).status).toBe(404);
    expect((await owner.agent.get(`/api/v1/subjects/${id}/events`)).status).toBe(404);

    // Caregiver: mất quyền ngay sau archive trên mọi đường đọc.
    const caregiverList = await caregiver.agent.get('/api/v1/subjects');
    expect(caregiverList.body.items).toHaveLength(0);
    expect((await caregiver.agent.get(`/api/v1/subjects/${id}`)).status).toBe(404);
    expect((await caregiver.agent.get(`/api/v1/subjects/${id}/status`)).status).toBe(404);
    expect((await caregiver.agent.get(`/api/v1/subjects/${id}/alerts`)).status).toBe(404);
    expect((await caregiver.agent.get(`/api/v1/subjects/${id}/events`)).status).toBe(404);
  });

  it('FR-14: archive sai tên xác nhận → 400, lý do quá ngắn → 422, hồ sơ chưa bị lưu trữ', async () => {
    const owner = await registerUser(ctx.app);
    const created = await createSubject(owner, { displayName: 'Ông Bình' });
    const id = created.body.id as string;

    const wrongName = await postArchive(owner, id, {
      reason: 'Lý do hợp lệ cho thao tác lưu trữ thử.',
      confirmationName: 'Bà An',
    });
    expect(wrongName.status).toBe(400);
    expect(wrongName.body.code).toBe('VALIDATION_FAILED');

    const shortReason = await postArchive(owner, id, { reason: 'ab', confirmationName: 'Ông Bình' });
    expect(shortReason.status).toBe(422);

    const stillActive = await owner.agent.get(`/api/v1/subjects/${id}`);
    expect(stillActive.status).toBe(200);
    expect(stillActive.body.archivedAt).toBeNull();
  });

  it('FR-14: archive lần hai → 409; caregiver có link → 403, người ngoài → 404', async () => {
    const owner = await registerUser(ctx.app);
    const created = await createSubject(owner, { displayName: 'Bà An' });
    const id = created.body.id as string;
    const caregiver = await registerUser(ctx.app);
    await addCareLink(owner, caregiver, id);
    const stranger = await registerUser(ctx.app);
    const body = { reason: 'Đóng hồ sơ sau khi đã bàn giao thiết bị.', confirmationName: 'Bà An' };

    const caregiverArchive = await postArchive(caregiver, id, body);
    expect(caregiverArchive.status).toBe(403);
    expect(caregiverArchive.body.code).toBe('FORBIDDEN');

    const strangerArchive = await postArchive(stranger, id, body);
    expect(strangerArchive.status).toBe(404);
    expect(strangerArchive.body.code).toBe('NOT_FOUND');

    expect((await postArchive(owner, id, body)).status).toBe(204);
    const second = await postArchive(owner, id, body);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('CONFLICT');
  });

  it('FR-14: owner ghi nhận yêu cầu xóa → 202, không xóa dữ liệu, audit reason/status', async () => {
    const owner = await registerUser(ctx.app);
    const created = await createSubject(owner, { displayName: 'Bà An' });
    const id = created.body.id as string;
    await addTelemetry(owner, id);
    expect(await countTelemetry(id)).toBe(1);

    const response = await postDeletionRequest(owner, id, {
      reason: 'Gia đình yêu cầu xóa dữ liệu sau khi ngừng theo dõi (kiểm thử).',
      confirmationName: 'Bà An',
    });
    expect(response.status).toBe(202);
    const recorded = deletionRequestRecordedSchema.parse(response.body);
    expect(recorded.status).toBe('recorded');
    expect(recorded.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(recorded.note).toContain('chưa bị xóa');
    expect(recorded.note.toLowerCase()).toContain('thủ công');

    // Không xóa gì: telemetry còn nguyên, hồ sơ vẫn hoạt động và vẫn trong danh sách.
    expect(await countTelemetry(id)).toBe(1);
    const detail = await owner.agent.get(`/api/v1/subjects/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.archivedAt).toBeNull();
    const list = await owner.agent.get('/api/v1/subjects');
    expect(list.body.items.some((item: { id: string }) => item.id === id)).toBe(true);

    const logs = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'subject.deletion_request'));
    const log = logs.find((entry) => entry.targetId === id);
    expect(log).toBeTruthy();
    expect(log?.metadata).toMatchObject({
      deletionRequestId: recorded.id,
      reason: 'Gia đình yêu cầu xóa dữ liệu sau khi ngừng theo dõi (kiểm thử).',
      status: 'recorded',
    });
    expect(JSON.stringify(log?.metadata)).not.toContain('displayName');
    expect(JSON.stringify(log?.metadata)).not.toContain('heart_rate');
  });

  it('FR-14: yêu cầu xóa chỉ owner; caregiver 403, người ngoài 404, sai tên 400, lý do ngắn 422', async () => {
    const owner = await registerUser(ctx.app);
    const created = await createSubject(owner, { displayName: 'Bà An' });
    const id = created.body.id as string;
    const caregiver = await registerUser(ctx.app);
    await addCareLink(owner, caregiver, id);
    const stranger = await registerUser(ctx.app);
    const body = {
      reason: 'Yêu cầu xóa dữ liệu hợp lệ cho mục đích kiểm thử.',
      confirmationName: 'Bà An',
    };

    const caregiverRequest = await postDeletionRequest(caregiver, id, body);
    expect(caregiverRequest.status).toBe(403);

    const strangerRequest = await postDeletionRequest(stranger, id, body);
    expect(strangerRequest.status).toBe(404);

    const wrongName = await postDeletionRequest(owner, id, { ...body, confirmationName: 'Ông Bình' });
    expect(wrongName.status).toBe(400);

    const shortReason = await postDeletionRequest(owner, id, { ...body, reason: 'quá ngắn' });
    expect(shortReason.status).toBe(422);

    // Không có bản ghi nào được tạo cho các request thất bại.
    const logs = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'subject.deletion_request'));
    expect(logs.filter((entry) => entry.targetId === id)).toHaveLength(0);
  });
});
