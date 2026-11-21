import { and, eq } from 'drizzle-orm';
import { DEFAULT_CARE_PERMISSIONS } from '@heart-iot/contracts';
import { AlertPolicyModule } from '../src/alert-policy/alert-policy.module';
import { DB, type AppDb } from '../src/database/database';
import { auditLogs, careLinks, subjects, subjectRules } from '../src/database/schema';
import {
  createModuleTestApp,
  registerUser,
  type TestContext,
  type TestUser,
} from './test-app';

const PERMISSIONS = { ...DEFAULT_CARE_PERMISSIONS, canViewMeasurements: true };

describe('Chính sách leo thang cảnh báo (V10)', () => {
  let ctx: TestContext;
  let db: AppDb;
  let owner: TestUser;
  let caregiver: TestUser;
  let limited: TestUser;
  let outsider: TestUser;
  let subjectId: string;

  beforeAll(async () => {
    ctx = await createModuleTestApp([AlertPolicyModule]);
    db = ctx.app.get<AppDb>(DB);
    owner = await registerUser(ctx.app, { displayName: 'Chủ chính sách' });
    caregiver = await registerUser(ctx.app, { displayName: 'Người thân chính sách' });
    limited = await registerUser(ctx.app, { displayName: 'Người thân không nhận cảnh báo' });
    outsider = await registerUser(ctx.app, { displayName: 'Người ngoài chính sách' });
    const rows = await db
      .insert(subjects)
      .values({ ownerUserId: owner.session.user.id, displayName: 'Bà chính sách' })
      .returning();
    subjectId = rows[0]!.id;
    await db.insert(careLinks).values([
      {
        subjectId,
        caregiverUserId: caregiver.session.user.id,
        invitedByUserId: owner.session.user.id,
        permissions: PERMISSIONS,
        status: 'active',
        acceptedAt: new Date(),
      },
      {
        subjectId,
        caregiverUserId: limited.session.user.id,
        invitedByUserId: owner.session.user.id,
        permissions: { ...PERMISSIONS, canReceiveAlerts: false },
        status: 'active',
        acceptedAt: new Date(),
      },
    ]);
  });

  afterAll(async () => {
    await ctx.close();
  });

  const url = () => `/api/v1/subjects/${subjectId}/alert-policy`;

  it('mặc định tắt, chỉ chủ hồ sơ đọc; caregiver 403, người ngoài 404', async () => {
    const response = await owner.agent.get(url());
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      subjectId,
      version: 0,
      source: 'default',
      config: {
        enabled: false,
        steps: [{ afterMinutes: 10 }, { afterMinutes: 20 }, { afterMinutes: 30 }],
      },
    });

    expect((await caregiver.agent.get(url())).status).toBe(403);
    expect((await outsider.agent.get(url())).status).toBe(404);

    const preview = await owner.agent.post(`${url()}/previews`);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ enabled: false });
    expect(preview.body.steps).toHaveLength(3);
    expect(preview.body.steps[0]).toMatchObject({
      level: 1,
      afterMinutes: 10,
      channel: 'in_app',
    });
    expect(preview.body.disclaimer).toContain('không tự gọi cấp cứu');
    expect(preview.body.recipientCount).toBe(2);
    expect(preview.body.recipients.map((recipient: { userId: string }) => recipient.userId).sort()).toEqual(
      [owner.session.user.id, caregiver.session.user.id].sort(),
    );
    expect(preview.body.recipients.some((recipient: { userId: string }) => recipient.userId === limited.session.user.id)).toBe(false);
    expect(preview.body.warnings).toContain('Chính sách đang tắt; sẽ không gửi nhắc lại.');
  });

  it('lưu cấu hình bật và preview phản ánh bản đã lưu, không ghi thêm', async () => {
    const put = await owner.agent.put(url()).send({
      enabled: true,
      steps: [{ afterMinutes: 5 }, { afterMinutes: 15 }],
    });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({
      subjectId,
      version: 1,
      source: 'database',
      config: { enabled: true, steps: [{ afterMinutes: 5 }, { afterMinutes: 15 }] },
    });

    const rows = await db
      .select({ id: subjectRules.id, active: subjectRules.active })
      .from(subjectRules)
      .where(and(eq(subjectRules.subjectId, subjectId), eq(subjectRules.kind, 'alert_escalation')));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.active).toBe(true);

    const before = rows.length;
    const preview = await owner.agent.post(`${url()}/previews`);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ enabled: true });
    expect(preview.body.steps.map((step: { afterMinutes: number }) => step.afterMinutes)).toEqual([
      5, 15,
    ]);
    expect(preview.body.steps[0].note).toContain('sau 5 phút');
    expect(preview.body.recipientCount).toBe(2);
    expect(preview.body.warnings).toEqual([]);

    const after = await db
      .select({ id: subjectRules.id })
      .from(subjectRules)
      .where(and(eq(subjectRules.subjectId, subjectId), eq(subjectRules.kind, 'alert_escalation')));
    expect(after).toHaveLength(before);

    const audit = await db
      .select({ action: auditLogs.action, metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(eq(auditLogs.action, 'alert_policy.update'));
    expect(audit.length).toBeGreaterThanOrEqual(1);
    expect(audit[0]?.metadata).toMatchObject({ subjectId, enabled: true, steps: [5, 15] });

    expect((await caregiver.agent.put(url()).send({ enabled: false, steps: [{ afterMinutes: 10 }] })).status).toBe(403);
  });

  it('từ chối mốc trùng/giảm dần, quá 3 bậc và trường lạ', async () => {
    const before = await db.select({ id: subjectRules.id }).from(subjectRules);
    const invalid = [
      { enabled: true, steps: [] },
      { enabled: true, steps: [{ afterMinutes: 0 }] },
      { enabled: true, steps: [{ afterMinutes: 10 }, { afterMinutes: 10 }] },
      { enabled: true, steps: [{ afterMinutes: 20 }, { afterMinutes: 10 }] },
      {
        enabled: true,
        steps: [
          { afterMinutes: 5 },
          { afterMinutes: 10 },
          { afterMinutes: 15 },
          { afterMinutes: 20 },
        ],
      },
      { enabled: true, steps: [{ afterMinutes: 10 }], channel: 'sms' },
    ];
    for (const body of invalid) {
      const response = await owner.agent.put(url()).send(body);
      expect(response.status).toBe(422);
    }
    const after = await db.select({ id: subjectRules.id }).from(subjectRules);
    expect(after).toHaveLength(before.length);
  });

  it('lưu lần hai tạo version mới và chỉ một bản active', async () => {
    const second = await owner.agent.put(url()).send({
      enabled: true,
      steps: [{ afterMinutes: 10 }, { afterMinutes: 20 }, { afterMinutes: 30 }],
    });
    expect(second.status).toBe(200);
    expect(second.body.version).toBe(2);
    expect(second.body.config.steps.map((step: { afterMinutes: number }) => step.afterMinutes)).toEqual([
      10, 20, 30,
    ]);

    const rows = await db
      .select({ version: subjectRules.version, active: subjectRules.active })
      .from(subjectRules)
      .where(and(eq(subjectRules.subjectId, subjectId), eq(subjectRules.kind, 'alert_escalation')))
      .orderBy(subjectRules.version);
    expect(rows).toEqual([
      { version: 1, active: false },
      { version: 2, active: true },
    ]);
  });
});
