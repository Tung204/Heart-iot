/**
 * V9.2a — thông báo theo hồ sơ (care_*) không cần incident.
 * Chỉ kiểm hạ tầng; chưa có scheduler/rule/bản tin tự động.
 */
import { and, eq } from 'drizzle-orm';
import { DEFAULT_CARE_PERMISSIONS } from '@heart-iot/contracts';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { NotificationService } from '../src/notifications/notifications.service';
import { DB, type AppDb } from '../src/database/database';
import {
  careLinks,
  notificationOutbox,
  subjects,
} from '../src/database/schema';
import {
  createModuleTestApp,
  registerUser,
  type TestContext,
  type TestUser,
} from './test-app';

const PERMISSIONS = {
  ...DEFAULT_CARE_PERMISSIONS,
  canViewMeasurements: true,
};

const LIMITED_PERMISSIONS = {
  ...DEFAULT_CARE_PERMISSIONS,
  canViewMeasurements: false,
  canReceiveAlerts: true,
};

describe('Thông báo theo hồ sơ (V9.2a)', () => {
  let ctx: TestContext;
  let db: AppDb;
  let service: NotificationService;
  let owner: TestUser;
  let caregiver: TestUser;
  let limited: TestUser;
  let subjectId: string;

  beforeAll(async () => {
    ctx = await createModuleTestApp([NotificationsModule]);
    db = ctx.app.get<AppDb>(DB);
    service = ctx.app.get(NotificationService);
    owner = await registerUser(ctx.app, { displayName: 'Chủ hồ sơ care' });
    caregiver = await registerUser(ctx.app, { displayName: 'Người thân care' });
    limited = await registerUser(ctx.app, { displayName: 'Người thân chỉ cảnh báo' });
    const rows = await db
      .insert(subjects)
      .values({ ownerUserId: owner.session.user.id, displayName: 'Bà care' })
      .returning();
    subjectId = rows[0]!.id;
    await db.insert(careLinks).values([
      {
        subjectId,
        caregiverUserId: caregiver.session.user.id,
        invitedByUserId: owner.session.user.id,
        permissions: PERMISSIONS,
        status: 'active',
        sharedFrom: new Date(Date.now() - 20 * 24 * 3600 * 1000),
        acceptedAt: new Date(),
      },
      {
        subjectId,
        caregiverUserId: limited.session.user.id,
        invitedByUserId: owner.session.user.id,
        permissions: LIMITED_PERMISSIONS,
        status: 'active',
        sharedFrom: new Date(Date.now() - 20 * 24 * 3600 * 1000),
        acceptedAt: new Date(),
      },
    ]);
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function insertCareNotification(overrides: {
    recipientUserId: string;
    status?: 'pending' | 'sent';
    createdAt?: Date;
    subject?: string | null;
    title?: string;
  }) {
    const rows = await db
      .insert(notificationOutbox)
      .values({
        subjectId: overrides.subject === undefined ? subjectId : overrides.subject,
        incidentId: null,
        revision: null,
        recipientUserId: overrides.recipientUserId,
        kind: 'care_digest',
        title: overrides.title ?? 'Bản tin chăm sóc cuối ngày',
        body: 'Hôm nay có 2 việc đã làm và 1 việc chưa ghi nhận.',
        channel: 'in_app',
        status: overrides.status ?? 'sent',
        attempts: 0,
        sentAt: overrides.status === 'pending' ? null : new Date(),
        createdAt: overrides.createdAt ?? new Date(),
        dedupeKey: crypto.randomUUID(),
      })
      .returning();
    return rows[0]!;
  }

  it('owner thấy thông báo care với incident null và title/body', async () => {
    const row = await insertCareNotification({ recipientUserId: owner.session.user.id });
    const response = await owner.agent.get('/api/v1/notifications');
    expect(response.status).toBe(200);
    const item = response.body.items.find((entry: { id: string }) => entry.id === row.id);
    expect(item).toMatchObject({
      id: row.id,
      incidentId: null,
      incidentType: null,
      state: null,
      revision: null,
      kind: 'care_digest',
      subjectId,
      subjectName: 'Bà care',
      title: 'Bản tin chăm sóc cuối ngày',
    });
    expect(typeof item.body).toBe('string');
  });

  it('caregiver có canViewMeasurements thấy và đánh dấu đọc được', async () => {
    const row = await insertCareNotification({ recipientUserId: caregiver.session.user.id });
    const list = await caregiver.agent.get('/api/v1/notifications');
    expect(list.status).toBe(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).toContain(row.id);

    const read = await caregiver.agent.post(`/api/v1/notifications/${row.id}/read`);
    expect(read.status).toBe(204);
    const after = await caregiver.agent.get('/api/v1/notifications');
    expect(
      after.body.items.find((item: { id: string }) => item.id === row.id)?.readAt,
    ).not.toBeNull();
  });

  it('caregiver thiếu canViewMeasurements không thấy care, markRead 404', async () => {
    const row = await insertCareNotification({ recipientUserId: limited.session.user.id });
    const list = await limited.agent.get('/api/v1/notifications');
    expect(list.status).toBe(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).not.toContain(row.id);

    const read = await limited.agent.post(`/api/v1/notifications/${row.id}/read`);
    expect(read.status).toBe(404);
  });

  it('care cũ trước sharedFrom bị ẩn, owner vẫn thấy', async () => {
    const caregiverSharedFrom = new Date(Date.now() - 60 * 60 * 1000);
    await db
      .update(careLinks)
      .set({ sharedFrom: caregiverSharedFrom })
      .where(
        and(
          eq(careLinks.subjectId, subjectId),
          eq(careLinks.caregiverUserId, caregiver.session.user.id),
        ),
      );
    const old = await insertCareNotification({
      recipientUserId: caregiver.session.user.id,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });
    const ownerOld = await insertCareNotification({
      recipientUserId: owner.session.user.id,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });
    const caregiverList = await caregiver.agent.get('/api/v1/notifications');
    expect(caregiverList.body.items.map((item: { id: string }) => item.id)).not.toContain(old.id);
    const ownerList = await owner.agent.get('/api/v1/notifications');
    expect(ownerList.body.items.map((item: { id: string }) => item.id)).toContain(ownerOld.id);
  });

  it('worker gửi care cho người đủ quyền, supersede người mất quyền, failed nếu thiếu hồ sơ', async () => {
    const ownerRow = await insertCareNotification({
      recipientUserId: owner.session.user.id,
      status: 'pending',
    });
    const caregiverRow = await insertCareNotification({
      recipientUserId: caregiver.session.user.id,
      status: 'pending',
    });
    const limitedRow = await insertCareNotification({
      recipientUserId: limited.session.user.id,
      status: 'pending',
    });
    const orphanRow = await insertCareNotification({
      recipientUserId: owner.session.user.id,
      status: 'pending',
      subject: null,
    });

    const result = await service.processPending(100);
    expect(result.sent).toBeGreaterThanOrEqual(2);
    expect(result.superseded).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBeGreaterThanOrEqual(1);

    const statuses = await db
      .select({ id: notificationOutbox.id, status: notificationOutbox.status })
      .from(notificationOutbox)
      .where(
        // Chỉ các row vừa tạo trong test này.
        and(
          eq(notificationOutbox.kind, 'care_digest'),
          eq(notificationOutbox.recipientUserId, owner.session.user.id),
        ),
      );
    expect(statuses.find((row) => row.id === ownerRow.id)?.status).toBe('sent');
    expect(statuses.find((row) => row.id === orphanRow.id)?.status).toBe('failed');
    const caregiverStatus = await db
      .select({ status: notificationOutbox.status })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, caregiverRow.id));
    expect(caregiverStatus[0]?.status).toBe('sent');
    const limitedStatus = await db
      .select({ status: notificationOutbox.status })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, limitedRow.id));
    expect(limitedStatus[0]?.status).toBe('superseded');
  });
});
