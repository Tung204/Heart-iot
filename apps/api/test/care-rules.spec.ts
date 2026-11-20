import { and, eq } from 'drizzle-orm';
import { DEFAULT_CARE_PERMISSIONS } from '@heart-iot/contracts';
import { CareRulesModule } from '../src/care-rules/care-rules.module';
import { DB, type AppDb } from '../src/database/database';
import { careLinks, subjects, subjectRules } from '../src/database/schema';
import {
  createModuleTestApp,
  registerUser,
  type TestContext,
  type TestUser,
} from './test-app';

const PERMISSIONS = { ...DEFAULT_CARE_PERMISSIONS, canViewMeasurements: true };

describe('Quy tắc chăm sóc (V9.2)', () => {
  let ctx: TestContext;
  let db: AppDb;
  let owner: TestUser;
  let caregiver: TestUser;
  let outsider: TestUser;
  let subjectId: string;

  beforeAll(async () => {
    ctx = await createModuleTestApp([CareRulesModule]);
    db = ctx.app.get<AppDb>(DB);
    owner = await registerUser(ctx.app, { displayName: 'Chủ quy tắc' });
    caregiver = await registerUser(ctx.app, { displayName: 'Người thân quy tắc' });
    outsider = await registerUser(ctx.app, { displayName: 'Người ngoài' });
    const rows = await db
      .insert(subjects)
      .values({ ownerUserId: owner.session.user.id, displayName: 'Bà quy tắc' })
      .returning();
    subjectId = rows[0]!.id;
    await db.insert(careLinks).values({
      subjectId,
      caregiverUserId: caregiver.session.user.id,
      invitedByUserId: owner.session.user.id,
      permissions: PERMISSIONS,
      status: 'active',
      acceptedAt: new Date(),
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  const url = (kind: string) => `/api/v1/subjects/${subjectId}/care-rules/${kind}`;

  it('mặc định tắt, chỉ chủ hồ sơ đọc; caregiver 403, người ngoài 404', async () => {
    const response = await owner.agent.get(url('inactivity'));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      kind: 'inactivity',
      version: 0,
      source: 'default',
      config: {
        enabled: false,
        windowStart: '09:00',
        windowEnd: '18:00',
        minSteps: 50,
        graceMinutes: 30,
      },
    });
    expect(response.body.subjectId).toBe(subjectId);

    expect((await caregiver.agent.get(url('inactivity'))).status).toBe(403);
    expect((await outsider.agent.get(url('inactivity'))).status).toBe(404);
    expect((await owner.agent.get(url('unknown'))).status).toBe(422);
  });

  it('lưu cấu hình tạo version mới, chỉ một bản active', async () => {
    const first = await owner.agent.put(url('inactivity')).send({
      enabled: true,
      weekdays: [6, 2, 4],
      windowStart: '08:30',
      windowEnd: '17:00',
      minSteps: 120,
      graceMinutes: 20,
    });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      version: 1,
      source: 'database',
      config: {
        enabled: true,
        weekdays: [2, 4, 6],
        windowStart: '08:30',
        windowEnd: '17:00',
        minSteps: 120,
        graceMinutes: 20,
      },
    });

    const second = await owner.agent.put(url('inactivity')).send({
      enabled: false,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      windowStart: '09:00',
      windowEnd: '18:00',
      minSteps: 50,
      graceMinutes: 30,
    });
    expect(second.status).toBe(200);
    expect(second.body.version).toBe(2);
    expect(second.body.config.enabled).toBe(false);

    const rows = await db
      .select({ version: subjectRules.version, active: subjectRules.active })
      .from(subjectRules)
      .where(and(eq(subjectRules.subjectId, subjectId), eq(subjectRules.kind, 'inactivity')))
      .orderBy(subjectRules.version);
    expect(rows).toEqual([
      { version: 1, active: false },
      { version: 2, active: true },
    ]);
  });

  it('từ chối cấu hình sai và không tạo version', async () => {
    const before = await db
      .select({ id: subjectRules.id })
      .from(subjectRules)
      .where(eq(subjectRules.subjectId, subjectId));
    const response = await owner.agent.put(url('inactivity')).send({
      enabled: true,
      weekdays: [1],
      windowStart: '18:00',
      windowEnd: '09:00',
      minSteps: 50,
      graceMinutes: 30,
    });
    expect(response.status).toBe(422);
    const after = await db
      .select({ id: subjectRules.id })
      .from(subjectRules)
      .where(eq(subjectRules.subjectId, subjectId));
    expect(after).toHaveLength(before.length);
  });

  it('cấu hình bản tin cuối ngày độc lập và preview 7 ngày không ghi', async () => {
    const put = await owner.agent.put(url('care_digest')).send({ enabled: true, time: '19:30' });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({
      kind: 'care_digest',
      version: 1,
      config: { enabled: true, time: '19:30' },
    });

    const before = await db
      .select({ id: subjectRules.id })
      .from(subjectRules)
      .where(eq(subjectRules.subjectId, subjectId));
    const preview = await owner.agent.post(`${url('care_digest')}/previews`);
    expect(preview.status).toBe(200);
    expect(preview.body.kind).toBe('care_digest');
    expect(preview.body.days).toHaveLength(7);
    expect(preview.body.days[0]).toMatchObject({ time: '19:30', applies: true });
    expect(preview.body.disclaimer).toContain('không phải dự đoán sức khỏe');
    const after = await db
      .select({ id: subjectRules.id })
      .from(subjectRules)
      .where(eq(subjectRules.subjectId, subjectId));
    expect(after).toHaveLength(before.length);

    expect((await caregiver.agent.put(url('care_digest')).send({ enabled: false, time: '20:00' })).status).toBe(403);
    expect((await caregiver.agent.post(`${url('care_digest')}/previews`)).status).toBe(403);
  });
});
