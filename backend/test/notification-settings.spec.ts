import { eq } from 'drizzle-orm';
import { ENV, type AppEnv } from '../src/config/env';
import { DB, type AppDb } from '../src/database/database';
import { notificationPreferences, pushSubscriptions } from '../src/database/schema';
import { NotificationsModule } from '../src/notifications/notifications.module';
import {
  createModuleTestApp,
  registerUser,
  type TestContext,
  type TestUser,
} from './test-app';

const SUBSCRIPTION = {
  endpoint: 'https://push.example.test/send/abc-123',
  expirationTime: null,
  keys: {
    p256dh: 'BL7ELU24fJTAlH5Kyl8N6BDCac8u9li_U5PIwG963MOvdYs9s7LSzj8x_7v7RFdLZ9Eap50PiiyF5K0TDAis7t0',
    auth: 'juarI8x__VnHvsOgfeAPHg',
  },
};

describe('Tuỳ chọn thông báo và subscription Web Push', () => {
  let ctx: TestContext;
  let db: AppDb;
  let owner: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    ctx = await createModuleTestApp([NotificationsModule]);
    db = ctx.app.get<AppDb>(DB);
    owner = await registerUser(ctx.app, { displayName: 'Chủ nhận thông báo' });
    other = await registerUser(ctx.app, { displayName: 'Người khác' });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('mặc định in-app bật, Web Push tắt và không nhận subscription khi cờ tắt', async () => {
    const prefs = await owner.agent.get('/api/v1/me/notification-preferences');
    expect(prefs.status).toBe(200);
    expect(prefs.body).toEqual({
      inApp: true,
      webPush: false,
      webPushAvailable: false,
      webPushPublicKey: null,
    });

    const enable = await owner.agent
      .put('/api/v1/me/notification-preferences')
      .send({ webPush: true });
    expect(enable.status).toBe(409);

    const add = await owner.agent.post('/api/v1/me/push-subscriptions').send(SUBSCRIPTION);
    expect(add.status).toBe(409);

    const list = await owner.agent.get('/api/v1/me/push-subscriptions');
    expect(list.status).toBe(200);
    expect(list.body).toEqual({ available: false, items: [] });
  });

  it('bật cờ → lưu preference, đăng ký và xoá subscription; không trả endpoint/khóa', async () => {
    const env = ctx.app.get<AppEnv>(ENV);
    (env as { WEB_PUSH_ENABLED: boolean; WEB_PUSH_VAPID_PUBLIC_KEY?: string }).WEB_PUSH_ENABLED = true;
    (env as { WEB_PUSH_VAPID_PUBLIC_KEY?: string }).WEB_PUSH_VAPID_PUBLIC_KEY = 'test-public';

    const available = await owner.agent.get('/api/v1/me/notification-preferences');
    expect(available.body.webPushAvailable).toBe(true);

    const enabled = await owner.agent
      .put('/api/v1/me/notification-preferences')
      .send({ webPush: true });
    expect(enabled.status).toBe(200);
    expect(enabled.body).toMatchObject({
      inApp: true,
      webPush: true,
      webPushAvailable: true,
      webPushPublicKey: 'test-public',
    });
    const prefRows = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, owner.session.user.id));
    expect(prefRows[0]?.webPushEnabled).toBe(true);

    const added = await owner.agent
      .post('/api/v1/me/push-subscriptions')
      .set('user-agent', 'Test Browser/1.0')
      .send(SUBSCRIPTION);
    expect(added.status).toBe(201);
    expect(added.body).toEqual({
      id: expect.any(String),
      endpointHost: 'push.example.test',
      createdAt: expect.any(String),
      lastUsedAt: null,
    });
    expect(JSON.stringify(added.body)).not.toContain(SUBSCRIPTION.endpoint);
    expect(JSON.stringify(added.body)).not.toContain(SUBSCRIPTION.keys.p256dh);

    const listed = await owner.agent.get('/api/v1/me/push-subscriptions');
    expect(listed.status).toBe(200);
    expect(listed.body).toMatchObject({ available: true, items: [added.body] });

    // Cùng endpoint nhưng tài khoản khác không được chiếm.
    const conflict = await other.agent.post('/api/v1/me/push-subscriptions').send(SUBSCRIPTION);
    expect(conflict.status).toBe(409);

    // Không xoá được subscription của người khác.
    expect(
      (await other.agent.delete(`/api/v1/me/push-subscriptions/${added.body.id}`)).status,
    ).toBe(404);
    expect(
      (await owner.agent.delete(`/api/v1/me/push-subscriptions/${added.body.id}`)).status,
    ).toBe(204);
    expect((await db.select().from(pushSubscriptions)).length).toBe(0);
  });

  it('từ chối payload sai: inApp không tắt được, endpoint HTTP, khóa không phải base64url', async () => {
    const env = ctx.app.get<AppEnv>(ENV);
    (env as { WEB_PUSH_ENABLED: boolean }).WEB_PUSH_ENABLED = true;

    expect(
      (await owner.agent.put('/api/v1/me/notification-preferences').send({ inApp: false })).status,
    ).toBe(422);
    expect(
      (
        await owner.agent
          .post('/api/v1/me/push-subscriptions')
          .send({ ...SUBSCRIPTION, endpoint: 'http://push.example.test/send/abc' })
      ).status,
    ).toBe(422);
    expect(
      (
        await owner.agent
          .post('/api/v1/me/push-subscriptions')
          .send({ ...SUBSCRIPTION, keys: { p256dh: 'short', auth: 'short' } })
      ).status,
    ).toBe(422);
    expect(
      (await owner.agent.post('/api/v1/me/push-subscriptions').send({ ...SUBSCRIPTION, extra: 1 }))
        .status,
    ).toBe(422);
    expect(
      (
        await owner.agent
          .post('/api/v1/me/push-subscriptions')
          .send({ ...SUBSCRIPTION, endpoint: 'https://127.0.0.1/send/abc' })
      ).status,
    ).toBe(422);
  });
});
