import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { auditLogs } from '../src/database/schema';
import { AuthService } from '../src/auth/auth.service';
import { createTestApp, registerUser, TEST_ORIGIN, type TestContext, type TestUser } from './test-app';

const CHANGE_PASSWORD_PATH = '/api/v1/me/password';
const WRONG_CURRENT_PASSWORD = 'mat-khau-hien-tai-sai';
const NEW_PASSWORD = 'mat-khau-moi-123';
const THIRD_PASSWORD = 'mat-khau-moi-456';

type Agent = TestUser['agent'];

function changePasswordRequest(
  agent: Agent,
  currentPassword: string,
  newPassword: string = NEW_PASSWORD,
) {
  return agent
    .post(CHANGE_PASSWORD_PATH)
    .set('Origin', TEST_ORIGIN)
    .send({ currentPassword, newPassword });
}

function loginRequest(ctx: TestContext, email: string, password: string) {
  return request(ctx.app.getHttpServer())
    .post('/api/v1/auth/login')
    .set('Origin', TEST_ORIGIN)
    .send({ email, password });
}

describe('Auth, health và bảo vệ cookie', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('health công khai trả trạng thái DB và chế độ AI', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      database: 'up',
      ai: 'template_fallback',
    });
  });

  it('đăng ký tạo phiên, /me đọc được, đăng xuất thu hồi phiên', async () => {
    const user = await registerUser(ctx.app, { displayName: 'Bà An' });
    expect(user.session.user.displayName).toBe('Bà An');

    const me = await user.agent.get('/api/v1/me');
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.session.user.id);

    const logout = await user.agent.post('/api/v1/auth/logout').set('Origin', TEST_ORIGIN);
    expect(logout.status).toBe(204);

    const after = await user.agent.get('/api/v1/me');
    expect(after.status).toBe(401);
    expect(after.body.code).toBe('UNAUTHENTICATED');
    expect(after.body.requestId).toBeTruthy();
  });

  it('đăng nhập đúng trả phiên mới, sai mật khẩu bị từ chối', async () => {
    const user = await registerUser(ctx.app);
    const agent = request.agent(ctx.app.getHttpServer());

    const wrong = await agent
      .post('/api/v1/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ email: user.email, password: 'sai-mat-khau' });
    expect(wrong.status).toBe(401);

    const ok = await agent
      .post('/api/v1/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ email: user.email, password: user.password });
    expect(ok.status).toBe(200);
    expect(ok.body.user.id).toBe(user.session.user.id);
  });

  it('sai mật khẩu 10 lần từ cùng IP: lần 11 trả 429, kể cả mật khẩu đúng', async () => {
    const user = await registerUser(ctx.app, { displayName: 'Bà Phúc' });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await loginRequest(ctx, user.email, 'sai-mat-khau');
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('UNAUTHENTICATED');
    }
    const blocked = await loginRequest(ctx, user.email, user.password);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(JSON.stringify(blocked.body)).not.toContain(user.password);
  });

  it('IP khác không bị khóa bởi 10 lần sai của kẻ tấn công', async () => {
    const user = await registerUser(ctx.app, { displayName: 'Bà Quỳnh' });
    const auth = ctx.app.get(AuthService);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(
        auth.login({ email: user.email, password: 'sai-mat-khau' }, '198.51.100.10'),
      ).rejects.toMatchObject({ status: 401 });
    }
    await expect(
      auth.login({ email: user.email, password: user.password }, '198.51.100.10'),
    ).rejects.toMatchObject({ status: 429 });

    const fromOtherIp = await auth.login(
      { email: user.email, password: user.password },
      '198.51.100.11',
    );
    expect(fromOtherIp.user.id).toBe(user.session.user.id);
  });

  it('đăng nhập thành công xóa bộ đếm sai của cặp IP+email', async () => {
    const user = await registerUser(ctx.app, { displayName: 'Bà Rạng' });
    const auth = ctx.app.get(AuthService);
    const ip = '198.51.100.12';
    for (let attempt = 0; attempt < 9; attempt += 1) {
      await expect(
        auth.login({ email: user.email, password: 'sai-mat-khau' }, ip),
      ).rejects.toMatchObject({ status: 401 });
    }
    await expect(
      auth.login({ email: user.email, password: user.password }, ip),
    ).resolves.toMatchObject({ user: { id: user.session.user.id } });
    for (let attempt = 0; attempt < 9; attempt += 1) {
      await expect(
        auth.login({ email: user.email, password: 'sai-mat-khau' }, ip),
      ).rejects.toMatchObject({ status: 401 });
    }
  });

  it('burst song song không vượt ngưỡng 10 lần của cặp IP+email', async () => {
    const user = await registerUser(ctx.app, { displayName: 'Bà Sen' });
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => loginRequest(ctx, user.email, 'sai-mat-khau')),
    );
    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 401)).toHaveLength(10);
    expect(statuses.filter((status) => status === 429)).toHaveLength(10);
  });

  it('chặn spray nhiều email từ cùng một IP sau 30 lần sai', async () => {
    const auth = ctx.app.get(AuthService);
    const ip = '203.0.113.44';
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await expect(
        auth.login({ email: `spray-${attempt}@example.test`, password: 'sai-mat-khau' }, ip),
      ).rejects.toMatchObject({ status: 401 });
    }
    await expect(
      auth.login({ email: 'spray-final@example.test', password: 'sai-mat-khau' }, ip),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('email trùng bị từ chối với 409', async () => {
    const user = await registerUser(ctx.app);
    const response = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', TEST_ORIGIN)
      .send({ email: user.email, password: 'mat-khau-khac-123', displayName: 'Trùng' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CONFLICT');
  });

  it('từ chối thao tác ghi từ origin lạ (CSRF)', async () => {
    const response = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'x@example.test', password: 'bat-ky-mat-khau' });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('route không tồn tại trả envelope lỗi có requestId', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/api/v1/khong-ton-tai');
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
    expect(typeof response.body.requestId).toBe('string');
  });

  describe('giới hạn thử mật khẩu hiện tại khi đổi mật khẩu', () => {
    it('sai mật khẩu hiện tại 10 lần: lần 11 trả 429 và không đổi mật khẩu', async () => {
      const user = await registerUser(ctx.app, { displayName: 'Bà Bình' });

      for (let attempt = 0; attempt < 10; attempt += 1) {
        const response = await changePasswordRequest(user.agent, WRONG_CURRENT_PASSWORD);
        expect(response.status).toBe(400);
        expect(response.body.code).toBe('VALIDATION_FAILED');
        expect(JSON.stringify(response.body)).not.toMatch(/scrypt\$|passwordHash|password_hash/i);
      }

      // Nhập đúng sau khi đã đủ ngưỡng vẫn bị chặn cho tới hết cửa sổ (hành vi an toàn).
      const blocked = await changePasswordRequest(user.agent, user.password);
      expect(blocked.status).toBe(429);
      expect(blocked.body.code).toBe('RATE_LIMITED');
      expect(JSON.stringify(blocked.body)).not.toMatch(/scrypt\$|passwordHash|password_hash/i);

      // Mật khẩu cũ chưa bị đổi, và bucket đổi mật khẩu không khóa đăng nhập.
      const oldPasswordLogin = await loginRequest(ctx, user.email, user.password);
      expect(oldPasswordLogin.status).toBe(200);
      const newPasswordLogin = await loginRequest(ctx, user.email, NEW_PASSWORD);
      expect(newPasswordLogin.status).toBe(401);

      // Audit giữ đủ 10 lần sai, chỉ metadata lý do; không có mật khẩu/hash.
      const rows = await ctx.db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.actorUserId, user.session.user.id),
            eq(auditLogs.action, 'auth.password_change'),
          ),
        );
      expect(rows).toHaveLength(10);
      for (const row of rows) {
        expect(row.outcome).toBe('failed');
        expect(row.metadata).toMatchObject({ reason: 'current_password_mismatch' });
        expect(JSON.stringify(row.metadata)).not.toContain(user.password);
        expect(JSON.stringify(row.metadata)).not.toMatch(/scrypt\$/);
      }
    });

    it('hết cửa sổ 15 phút thì đổi được; mật khẩu mới dùng được', async () => {
      const user = await registerUser(ctx.app, { displayName: 'Bà Chi' });
      const base = Date.now();
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(base);
      try {
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const response = await changePasswordRequest(user.agent, WRONG_CURRENT_PASSWORD);
          expect(response.status).toBe(400);
        }
        expect((await changePasswordRequest(user.agent, user.password)).status).toBe(429);

        nowSpy.mockReturnValue(base + 15 * 60 * 1000 + 1);
        const changed = await changePasswordRequest(user.agent, user.password);
        expect(changed.status).toBe(204);
        expect(changed.text).toBe('');
      } finally {
        nowSpy.mockRestore();
      }

      expect((await loginRequest(ctx, user.email, user.password)).status).toBe(401);
      expect((await loginRequest(ctx, user.email, NEW_PASSWORD)).status).toBe(200);
    });

    it('đổi thành công reset bộ đếm trong cùng cửa sổ', async () => {
      const user = await registerUser(ctx.app, { displayName: 'Bà Dung' });

      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect((await changePasswordRequest(user.agent, WRONG_CURRENT_PASSWORD)).status).toBe(400);
      }
      expect((await changePasswordRequest(user.agent, user.password)).status).toBe(204);

      // Nếu không reset, lần sai thứ 6 trở đi của tổng 11 lần phải trả 429.
      for (let attempt = 0; attempt < 9; attempt += 1) {
        expect((await changePasswordRequest(user.agent, WRONG_CURRENT_PASSWORD)).status).toBe(400);
      }
      expect((await changePasswordRequest(user.agent, NEW_PASSWORD, THIRD_PASSWORD)).status).toBe(
        204,
      );

      expect((await loginRequest(ctx, user.email, THIRD_PASSWORD)).status).toBe(200);
    });

    it('bucket theo user id: user khác vẫn đổi mật khẩu được', async () => {
      const lockedUser = await registerUser(ctx.app, { displayName: 'Bà Em' });
      const otherUser = await registerUser(ctx.app, { displayName: 'Ông Hùng' });

      for (let attempt = 0; attempt < 10; attempt += 1) {
        expect(
          (await changePasswordRequest(lockedUser.agent, WRONG_CURRENT_PASSWORD)).status,
        ).toBe(400);
      }
      expect((await changePasswordRequest(lockedUser.agent, lockedUser.password)).status).toBe(429);

      const otherChanged = await changePasswordRequest(otherUser.agent, otherUser.password);
      expect(otherChanged.status).toBe(204);

      // Bucket đăng nhập (IP+email) tách khỏi bucket đổi mật khẩu (user id).
      expect((await loginRequest(ctx, lockedUser.email, lockedUser.password)).status).toBe(200);
    });

    it('request song song không vượt ngưỡng 10 lần', async () => {
      const user = await registerUser(ctx.app, { displayName: 'Bà Lan' });

      // Đếm trước khi verify nên burst song song cũng chỉ có đúng 10 lần được kiểm.
      const responses = await Promise.all(
        Array.from({ length: 20 }, () =>
          changePasswordRequest(user.agent, WRONG_CURRENT_PASSWORD),
        ),
      );
      const statuses = responses.map((response) => response.status);
      expect(statuses.filter((status) => status === 400)).toHaveLength(10);
      expect(statuses.filter((status) => status === 429)).toHaveLength(10);
    });

    it('response không lộ hash hay mật khẩu', async () => {
      const user = await registerUser(ctx.app, { displayName: 'Bà Hoa' });
      const me = await user.agent.get('/api/v1/me');
      const wrong = await changePasswordRequest(user.agent, WRONG_CURRENT_PASSWORD);
      const ok = await changePasswordRequest(user.agent, user.password);

      expect(me.status).toBe(200);
      expect(wrong.status).toBe(400);
      expect(ok.status).toBe(204);

      for (const text of [JSON.stringify(user.session), me.text, wrong.text, ok.text]) {
        expect(text).not.toContain(user.password);
        expect(text).not.toContain(NEW_PASSWORD);
        expect(text).not.toMatch(/scrypt\$/i);
        expect(text).not.toMatch(/passwordHash|password_hash/i);
      }
    });
  });
});
