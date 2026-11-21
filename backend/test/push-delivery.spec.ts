jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    sendNotification: jest.fn(),
    setVapidDetails: jest.fn(),
  },
}));

import { eq } from 'drizzle-orm';
import { ENV, type AppEnv } from '../src/config/env';
import { DB, type AppDb } from '../src/database/database';
import {
  notificationOutbox,
  notificationPreferences,
  pushSubscriptions,
  subjects,
} from '../src/database/schema';
import { NotificationService } from '../src/notifications/notifications.service';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { createModuleTestApp, registerUser, type TestContext, type TestUser } from './test-app';

const mockWebPush = jest.requireMock('web-push').default as {
  sendNotification: jest.Mock;
  setVapidDetails: jest.Mock;
};
const mockSendNotification = mockWebPush.sendNotification;
const mockSetVapidDetails = mockWebPush.setVapidDetails;

type PushFixture = {
  user: TestUser;
  subjectId: string;
  subscriptionId: string;
  outboxId: string;
};

describe('Worker gửi Web Push', () => {
  let ctx: TestContext;
  let db: AppDb;

  beforeAll(async () => {
    ctx = await createModuleTestApp([NotificationsModule]);
    db = ctx.app.get<AppDb>(DB);
    const env = ctx.app.get<AppEnv>(ENV);
    Object.assign(env, {
      WEB_PUSH_ENABLED: true,
      WEB_PUSH_VAPID_SUBJECT: 'mailto:test@example.test',
      WEB_PUSH_VAPID_PUBLIC_KEY: 'test-public-key',
      WEB_PUSH_VAPID_PRIVATE_KEY: 'test-private-key',
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(() => {
    mockSendNotification.mockReset();
    mockSetVapidDetails.mockReset();
  });

  async function createFixture(webPushEnabled = true): Promise<PushFixture> {
    const user = await registerUser(ctx.app, { displayName: 'Người nhận push' });
    const subject = (
      await db
        .insert(subjects)
        .values({ ownerUserId: user.session.user.id, displayName: 'Hồ sơ push' })
        .returning()
    )[0]!;
    await db.insert(notificationPreferences).values({
      userId: user.session.user.id,
      webPushEnabled,
    });
    const subscription = (
      await db
        .insert(pushSubscriptions)
        .values({
          userId: user.session.user.id,
          endpoint: `https://push.example.test/send/${crypto.randomUUID()}`,
          p256dh: 'BL7ELU24fJTAlH5Kyl8N6BDCac8u9li_U5PIwG963MOvdYs9s7LSzj8x_7v7RFdLZ9Eap50PiiyF5K0TDAis7t0',
          auth: 'juarI8x__VnHvsOgfeAPHg',
        })
        .returning()
    )[0]!;
    const outbox = (
      await db
        .insert(notificationOutbox)
        .values({
          subjectId: subject.id,
          recipientUserId: user.session.user.id,
          kind: 'care_rule',
          title: 'Nhắc uống thuốc',
          body: 'Đã đến giờ uống thuốc.',
          channel: 'web_push',
          status: 'pending',
          nextAttemptAt: new Date(),
          dedupeKey: `push-test:${crypto.randomUUID()}`,
        })
        .returning()
    )[0]!;
    return {
      user,
      subjectId: subject.id,
      subscriptionId: subscription.id,
      outboxId: outbox.id,
    };
  }

  it('gửi thành công → sent, cập nhật lastUsedAt, không lọt vào hộp thông báo in-app', async () => {
    mockSendNotification.mockResolvedValue({ statusCode: 201 });
    const fx = await createFixture();
    const service = ctx.app.get(NotificationService);

    const result = await service.processPending(20);
    expect(result).toMatchObject({ processed: 1, sent: 1, superseded: 0, failed: 0 });
    expect(mockSetVapidDetails).toHaveBeenCalledTimes(1);
    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    const [subscription, payload, options] = mockSendNotification.mock.calls[0]!;
    expect(subscription.endpoint).toContain('push.example.test');
    expect(JSON.parse(payload)).toMatchObject({
      title: 'Nhắc uống thuốc',
      body: 'Đã đến giờ uống thuốc.',
    });
    expect(options).toMatchObject({ TTL: 3600, urgency: 'high' });

    const rows = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, fx.outboxId));
    expect(rows[0]).toMatchObject({ status: 'sent', attempts: 0 });
    expect(rows[0]?.sentAt).not.toBeNull();
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, fx.subscriptionId));
    expect(subs[0]?.lastUsedAt).not.toBeNull();
    expect((await service.listNotifications(fx.user.session.user.id)).items).toHaveLength(0);
  });

  it('410 → xoá subscription và supersede row, không retry vô hạn', async () => {
    mockSendNotification.mockRejectedValue({ statusCode: 410 });
    const fx = await createFixture();
    const service = ctx.app.get(NotificationService);

    const result = await service.processPending(20);
    expect(result).toMatchObject({ processed: 1, sent: 0, superseded: 1, failed: 0 });
    const rows = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, fx.outboxId));
    expect(rows[0]?.status).toBe('superseded');
    expect(rows[0]?.attempts).toBe(0);
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, fx.subscriptionId));
    expect(subs).toHaveLength(0);
  });

  it('lỗi tạm thời → pending + backoff; preference tắt → supersede, không gọi push', async () => {
    mockSendNotification.mockRejectedValue({ statusCode: 503 });
    const fx = await createFixture();
    const service = ctx.app.get(NotificationService);

    const first = await service.processPending(20);
    expect(first).toMatchObject({ sent: 0, failed: 1 });
    let rows = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, fx.outboxId));
    expect(rows[0]).toMatchObject({ status: 'pending', attempts: 1 });
    expect(rows[0]?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() - 1000);

    await db
      .update(notificationPreferences)
      .set({ webPushEnabled: false })
      .where(eq(notificationPreferences.userId, fx.user.session.user.id));
    await db
      .update(notificationOutbox)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(notificationOutbox.id, fx.outboxId));
    mockSendNotification.mockClear();
    const second = await service.processPending(20);
    expect(second).toMatchObject({ sent: 0, superseded: 1 });
    expect(mockSendNotification).not.toHaveBeenCalled();
    rows = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, fx.outboxId));
    expect(rows[0]?.status).toBe('superseded');
  });
});
