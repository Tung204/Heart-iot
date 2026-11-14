import request from 'supertest';
import { createTestApp, registerUser, TEST_ORIGIN, type TestContext } from './test-app';

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
});
