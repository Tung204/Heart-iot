import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createTestApp, loginUser, registerUser, TEST_ORIGIN, type TestContext, type TestUser } from './test-app';
import { auditLogs, sessions } from '../src/database/schema';

type SessionItem = {
  id: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
};

const API = '/api/v1';

/**
 * Cài đặt tài khoản (FR-01, NFR-05): đổi tên hiển thị, đổi mật khẩu giữ phiên
 * hiện tại, xem/thu hồi phiên đăng nhập khác. Id luôn lấy từ phiên phía server,
 * không tin id trong body.
 */
describe('Cài đặt tài khoản — hồ sơ, mật khẩu và phiên đăng nhập', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function listSessions(user: TestUser): Promise<SessionItem[]> {
    const response = await user.agent.get(`${API}/me/sessions`);
    expect(response.status).toBe(200);
    return response.body.items as SessionItem[];
  }

  async function auditFor(user: TestUser, action: string) {
    return ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.actorUserId, user.session.user.id))
      .then((rows) => rows.filter((row) => row.action === action));
  }

  it('chưa đăng nhập thì mọi endpoint cài đặt trả 401', async () => {
    const anon = request(ctx.app.getHttpServer());
    const responses = await Promise.all([
      anon.get(`${API}/me/sessions`),
      anon.patch(`${API}/me`).set('Origin', TEST_ORIGIN).send({ displayName: 'Tên mới' }),
      anon
        .post(`${API}/me/password`)
        .set('Origin', TEST_ORIGIN)
        .send({ currentPassword: 'mat-khau-demo-123', newPassword: 'mat-khau-moi-456' }),
      anon.delete(`${API}/me/sessions/${crypto.randomUUID()}`).set('Origin', TEST_ORIGIN),
      anon.post(`${API}/me/sessions/revoke-others`).set('Origin', TEST_ORIGIN),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('UNAUTHENTICATED');
    }
  });

  it('đổi tên hiển thị: trim, lưu thật, audit; tên rỗng/quá dài/khoá lạ bị 422', async () => {
    const user = await registerUser(ctx.app, { displayName: 'Bà An' });

    const ok = await user.agent
      .patch(`${API}/me`)
      .set('Origin', TEST_ORIGIN)
      .send({ displayName: '   Bà An Mới   ' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.displayName).toBe('Bà An Mới');
    expect(ok.body.user.id).toBe(user.session.user.id);

    const me = await user.agent.get(`${API}/me`);
    expect(me.status).toBe(200);
    expect(me.body.user.displayName).toBe('Bà An Mới');

    const logs = await auditFor(user, 'auth.profile_update');
    expect(logs).toHaveLength(1);
    expect(logs[0]?.outcome).toBe('success');
    expect(logs[0]?.targetId).toBe(user.session.user.id);
    // Audit không lưu tên cũ/mới (dữ liệu cá nhân), chỉ ghi trường đã đổi.
    expect(logs[0]?.metadata).toEqual({ field: 'displayName' });

    const blank = await user.agent
      .patch(`${API}/me`)
      .set('Origin', TEST_ORIGIN)
      .send({ displayName: '   ' });
    expect(blank.status).toBe(422);
    expect(blank.body.code).toBe('VALIDATION_FAILED');

    const tooLong = await user.agent
      .patch(`${API}/me`)
      .set('Origin', TEST_ORIGIN)
      .send({ displayName: 'a'.repeat(121) });
    expect(tooLong.status).toBe(422);

    const extraField = await user.agent
      .patch(`${API}/me`)
      .set('Origin', TEST_ORIGIN)
      .send({ displayName: 'Hợp lệ', role: 'admin' });
    expect(extraField.status).toBe(422);

    const after = await user.agent.get(`${API}/me`);
    expect(after.body.user.displayName).toBe('Bà An Mới');
    expect(after.body.user.role).toBe('user');
  });

  it('đổi mật khẩu: sai mật khẩu hiện tại → 400, mật khẩu cũ vẫn dùng được', async () => {
    const user = await registerUser(ctx.app);

    const wrong = await user.agent
      .post(`${API}/me/password`)
      .set('Origin', TEST_ORIGIN)
      .send({ currentPassword: 'sai-mat-khau-999', newPassword: 'mat-khau-moi-456' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('VALIDATION_FAILED');
    expect(wrong.body.message).toContain('Mật khẩu hiện tại');

    const stillOld = await loginUser(ctx.app, user.email, user.password);
    expect(stillOld.session.user.id).toBe(user.session.user.id);

    const logs = await auditFor(user, 'auth.password_change');
    expect(logs).toHaveLength(1);
    expect(logs[0]?.outcome).toBe('failed');
    expect(logs[0]?.metadata).toEqual({ reason: 'current_password_mismatch' });
  });

  it('đổi mật khẩu: mật khẩu mới trùng cũ → 400, quá ngắn → 422', async () => {
    const user = await registerUser(ctx.app);

    const same = await user.agent
      .post(`${API}/me/password`)
      .set('Origin', TEST_ORIGIN)
      .send({ currentPassword: user.password, newPassword: user.password });
    expect(same.status).toBe(400);
    expect(same.body.code).toBe('VALIDATION_FAILED');
    expect(same.body.message).toContain('khác mật khẩu hiện tại');

    const short = await user.agent
      .post(`${API}/me/password`)
      .set('Origin', TEST_ORIGIN)
      .send({ currentPassword: user.password, newPassword: 'ngan' });
    expect(short.status).toBe(422);
    expect(short.body.code).toBe('VALIDATION_FAILED');

    // Cả hai lần đều không đổi mật khẩu.
    await loginUser(ctx.app, user.email, user.password);
  });

  it('đổi mật khẩu thành công: giữ phiên hiện tại, thu hồi phiên khác, không ghi mật khẩu vào audit', async () => {
    const user = await registerUser(ctx.app);
    const second = await loginUser(ctx.app, user.email, user.password);
    expect(second.session.user.id).toBe(user.session.user.id);

    const before = await listSessions(user);
    expect(before).toHaveLength(2);

    const newPassword = 'mat-khau-moi-456';
    const changed = await user.agent
      .post(`${API}/me/password`)
      .set('Origin', TEST_ORIGIN)
      .send({ currentPassword: user.password, newPassword });
    expect(changed.status).toBe(204);

    // Phiên hiện tại vẫn dùng được (không bị đăng xuất).
    const currentMe = await user.agent.get(`${API}/me`);
    expect(currentMe.status).toBe(200);

    // Phiên khác bị thu hồi ngay.
    const otherMe = await second.agent.get(`${API}/me`);
    expect(otherMe.status).toBe(401);
    expect(otherMe.body.code).toBe('UNAUTHENTICATED');

    const after = await listSessions(user);
    expect(after).toHaveLength(1);
    expect(after[0]?.current).toBe(true);

    // Mật khẩu cũ không đăng nhập được; mật khẩu mới đăng nhập được.
    const oldLogin = await request(ctx.app.getHttpServer())
      .post(`${API}/auth/login`)
      .set('Origin', TEST_ORIGIN)
      .send({ email: user.email, password: user.password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await loginUser(ctx.app, user.email, newPassword);
    expect(newLogin.session.user.id).toBe(user.session.user.id);

    const logs = await auditFor(user, 'auth.password_change');
    expect(logs).toHaveLength(1);
    expect(logs[0]?.outcome).toBe('success');
    expect(logs[0]?.metadata).toEqual({ revokedSessions: 1 });
    const serialized = JSON.stringify(logs[0]);
    expect(serialized).not.toContain(user.password);
    expect(serialized).not.toContain(newPassword);
    expect(serialized).not.toContain('scrypt$');
  });

  it('GET /me/sessions: chỉ phiên còn hiệu lực của mình, không lộ token, mới nhất trước', async () => {
    const user = await registerUser(ctx.app);
    await loginUser(ctx.app, user.email, user.password);

    const first = await listSessions(user);
    expect(first).toHaveLength(2);
    expect(first.filter((item) => item.current)).toHaveLength(1);
    for (const item of first) {
      expect(Object.keys(item).sort()).toEqual(['createdAt', 'current', 'expiresAt', 'id']);
      expect(item).not.toHaveProperty('token');
      expect(item).not.toHaveProperty('tokenHash');
    }
    const createdTimes = first.map((item) => Date.parse(item.createdAt));
    expect(createdTimes).toEqual([...createdTimes].sort((a, b) => b - a));

    // Ghim phiên hiện tại về mốc cũ để kiểm thứ tự "mới nhất trước" không phụ thuộc độ phân giải đồng hồ.
    const current = first.find((item) => item.current);
    expect(current).toBeDefined();
    await ctx.db
      .update(sessions)
      .set({ createdAt: new Date('2020-01-01T00:00:00.000Z') })
      .where(eq(sessions.id, current!.id));

    const reordered = await listSessions(user);
    expect(reordered).toHaveLength(2);
    expect(reordered[1]?.id).toBe(current!.id);
    expect(Date.parse(reordered[0]!.createdAt)).toBeGreaterThan(
      Date.parse(reordered[1]!.createdAt),
    );

    // Phiên đã hết hạn không còn trong danh sách (đặt hạn phiên còn lại về quá khứ).
    const expiredId = reordered[0]!.id;
    await ctx.db
      .update(sessions)
      .set({ expiresAt: new Date('2020-01-02T00:00:00.000Z') })
      .where(eq(sessions.id, expiredId));
    const afterExpiry = await listSessions(user);
    expect(afterExpiry).toHaveLength(1);
    expect(afterExpiry[0]?.id).toBe(current!.id);
  });

  it('thu hồi phiên: phiên hiện tại → 400; phiên người khác/không tồn tại → 404; phiên mình → 204', async () => {
    const owner = await registerUser(ctx.app);
    const otherDevice = await loginUser(ctx.app, owner.email, owner.password);
    const stranger = await registerUser(ctx.app);

    const ownerSessions = await listSessions(owner);
    const current = ownerSessions.find((item) => item.current);
    const other = ownerSessions.find((item) => !item.current);
    expect(current).toBeDefined();
    expect(other).toBeDefined();

    const revokeCurrent = await owner.agent
      .delete(`${API}/me/sessions/${current!.id}`)
      .set('Origin', TEST_ORIGIN);
    expect(revokeCurrent.status).toBe(400);
    expect(revokeCurrent.body.code).toBe('VALIDATION_FAILED');
    expect(revokeCurrent.body.message).toContain('phiên đang dùng');

    // Không thu hồi được phiên của người khác, và phiên đó vẫn còn hiệu lực.
    const strangerSessions = await listSessions(stranger);
    const strangerSessionId = strangerSessions[0]!.id;
    const revokeStranger = await owner.agent
      .delete(`${API}/me/sessions/${strangerSessionId}`)
      .set('Origin', TEST_ORIGIN);
    expect(revokeStranger.status).toBe(404);
    expect(revokeStranger.body.code).toBe('NOT_FOUND');
    expect((await stranger.agent.get(`${API}/me`)).status).toBe(200);

    const missing = await owner.agent
      .delete(`${API}/me/sessions/${crypto.randomUUID()}`)
      .set('Origin', TEST_ORIGIN);
    expect(missing.status).toBe(404);

    const invalid = await owner.agent
      .delete(`${API}/me/sessions/khong-phai-uuid`)
      .set('Origin', TEST_ORIGIN);
    expect(invalid.status).toBe(422);

    const revoked = await owner.agent
      .delete(`${API}/me/sessions/${other!.id}`)
      .set('Origin', TEST_ORIGIN);
    expect(revoked.status).toBe(204);
    expect((await otherDevice.agent.get(`${API}/me`)).status).toBe(401);

    const remaining = await listSessions(owner);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(current!.id);

    const logs = await auditFor(owner, 'auth.session_revoke');
    expect(logs).toHaveLength(1);
    expect(logs[0]?.targetId).toBe(other!.id);
  });

  it('thu hồi tất cả phiên khác → 204, giữ phiên hiện tại, audit số lượng, gọi lại không lỗi', async () => {
    const user = await registerUser(ctx.app);
    const second = await loginUser(ctx.app, user.email, user.password);
    const third = await loginUser(ctx.app, user.email, user.password);
    expect(await listSessions(user)).toHaveLength(3);

    const revoked = await user.agent
      .post(`${API}/me/sessions/revoke-others`)
      .set('Origin', TEST_ORIGIN);
    expect(revoked.status).toBe(204);

    expect((await user.agent.get(`${API}/me`)).status).toBe(200);
    expect((await second.agent.get(`${API}/me`)).status).toBe(401);
    expect((await third.agent.get(`${API}/me`)).status).toBe(401);
    const remaining = await listSessions(user);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.current).toBe(true);

    const logs = await auditFor(user, 'auth.sessions_revoke_others');
    expect(logs).toHaveLength(1);
    expect(logs[0]?.metadata).toEqual({ revokedSessions: 2 });

    // Idempotent: không còn phiên nào khác để thu hồi.
    const again = await user.agent
      .post(`${API}/me/sessions/revoke-others`)
      .set('Origin', TEST_ORIGIN);
    expect(again.status).toBe(204);
    expect(await listSessions(user)).toHaveLength(1);
  });
});
