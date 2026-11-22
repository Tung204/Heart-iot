import { eq } from 'drizzle-orm';
import { DEFAULT_CARE_PERMISSIONS } from '@heart-iot/contracts';
import { AssistantModule } from '../src/assistant/assistant.module';
import {
  assistantDrafts,
  auditLogs,
  careLinks,
  careReminders,
  subjects,
} from '../src/database/schema';
import {
  createModuleTestApp,
  registerUser,
  TEST_ORIGIN,
  type TestContext,
  type TestUser,
} from './test-app';

/**
 * FR-21 backend: trợ lý chỉ tạo NHÁP; xác nhận mới lưu lịch nhắc.
 * Kiểm ranh giới can thiệp, owner-only, preview không ghi, confirm idempotent,
 * hết hạn/hủy/digest sai không tạo dữ liệu nghiệp vụ.
 */

let subjectCounter = 0;

async function createSubject(ctx: TestContext, ownerUserId: string) {
  const rows = await ctx.db
    .insert(subjects)
    .values({
      ownerUserId,
      displayName: `Hồ sơ trợ lý ${++subjectCounter}`,
      timezone: 'Asia/Ho_Chi_Minh',
    })
    .returning();
  const subject = rows[0];
  if (!subject) throw new Error('Không tạo được subject.');
  return subject;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function draftBody(overrides: Record<string, unknown> = {}) {
  return {
    capability: 'care_reminder.create',
    input: {
      kind: 'medication',
      title: 'Uống thuốc huyết áp',
      note: 'Theo lịch bác sĩ đã dặn',
      times: ['08:00'],
      weekdays: [1, 2, 3, 4, 5],
      startsOn: today(),
      endsOn: null,
      active: true,
      ...overrides,
    },
  };
}

describe('Trợ lý — hành động có kiểm soát (FR-21)', () => {
  let ctx: TestContext;
  let owner: TestUser;
  let caregiver: TestUser;
  let outsider: TestUser;

  beforeAll(async () => {
    ctx = await createModuleTestApp([AssistantModule]);
    owner = await registerUser(ctx.app, { displayName: 'Chủ hồ sơ trợ lý' });
    caregiver = await registerUser(ctx.app, { displayName: 'Người thân trợ lý' });
    outsider = await registerUser(ctx.app, { displayName: 'Người ngoài' });
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function linkCaregiver(subjectId: string): Promise<void> {
    await ctx.db.insert(careLinks).values({
      subjectId,
      caregiverUserId: caregiver.session.user.id,
      invitedByUserId: owner.session.user.id,
      permissions: DEFAULT_CARE_PERMISSIONS,
      status: 'active',
      acceptedAt: new Date(),
    });
  }

  it('công bố rõ việc được/không được làm; caregiver thấy lịch nhắc không khả dụng', async () => {
    const subject = await createSubject(ctx, owner.session.user.id);
    await linkCaregiver(subject.id);

    const ownerResponse = await owner.agent
      .get(`/api/v1/subjects/${subject.id}/assistant/capabilities`)
      .set('Origin', TEST_ORIGIN);
    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body.can).toContainEqual(
      expect.objectContaining({ id: 'care_reminder.create', available: true }),
    );
    expect(ownerResponse.body.cannot.map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining(['alert.acknowledge', 'medical.diagnose', 'hardware.control']),
    );

    const caregiverResponse = await caregiver.agent
      .get(`/api/v1/subjects/${subject.id}/assistant/capabilities`)
      .set('Origin', TEST_ORIGIN);
    expect(caregiverResponse.status).toBe(200);
    expect(caregiverResponse.body.can[0]).toMatchObject({
      id: 'care_reminder.create',
      available: false,
    });
    expect(caregiverResponse.body.can[0].unavailableReason).toContain('Chỉ chủ hồ sơ');

    const outsiderResponse = await outsider.agent
      .get(`/api/v1/subjects/${subject.id}/assistant/capabilities`)
      .set('Origin', TEST_ORIGIN);
    expect(outsiderResponse.status).toBe(404);
  });

  it('tạo nháp không ghi lịch; xác nhận mới tạo đúng một lịch; xác nhận lặp không nhân đôi', async () => {
    const subject = await createSubject(ctx, owner.session.user.id);
    const created = await owner.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/drafts`)
      .set('Origin', TEST_ORIGIN)
      .send(draftBody());
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      subjectId: subject.id,
      capability: 'care_reminder.create',
      status: 'draft',
      result: null,
    });
    expect(created.body.preview.title).toBe('Uống thuốc huyết áp');
    expect(created.body.previewDigest).toMatch(/^[0-9a-f]{64}$/);

    const fetched = await owner.agent
      .get(`/api/v1/assistant/drafts/${created.body.id}`)
      .set('Origin', TEST_ORIGIN);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(created.body.id);
    const outsiderFetch = await outsider.agent
      .get(`/api/v1/assistant/drafts/${created.body.id}`)
      .set('Origin', TEST_ORIGIN);
    expect(outsiderFetch.status).toBe(404);

    expect(
      await ctx.db.select().from(careReminders).where(eq(careReminders.subjectId, subject.id)),
    ).toHaveLength(0);
    const createAudits = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'assistant.draft.create'));
    expect(createAudits.some((row) => row.targetId === created.body.id)).toBe(true);
    expect(createAudits.at(-1)?.metadata).not.toHaveProperty('title');
    expect(createAudits.at(-1)?.metadata).not.toHaveProperty('note');

    const confirmed = await owner.agent
      .post(`/api/v1/assistant/drafts/${created.body.id}/confirm`)
      .set('Origin', TEST_ORIGIN);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe('confirmed');
    expect(confirmed.body.result.type).toBe('care_reminder');

    const reminders = await ctx.db
      .select()
      .from(careReminders)
      .where(eq(careReminders.subjectId, subject.id));
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.id).toBe(confirmed.body.result.id);
    expect(reminders[0]).toMatchObject({
      kind: 'medication',
      title: 'Uống thuốc huyết áp',
      times: ['08:00'],
      active: true,
    });

    const confirmAudits = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'assistant.draft.confirm'));
    expect(confirmAudits.some((row) => row.targetId === created.body.id)).toBe(true);

    const repeated = await owner.agent
      .post(`/api/v1/assistant/drafts/${created.body.id}/confirm`)
      .set('Origin', TEST_ORIGIN);
    expect(repeated.status).toBe(200);
    expect(repeated.body.result.id).toBe(confirmed.body.result.id);
    expect(
      await ctx.db.select().from(careReminders).where(eq(careReminders.subjectId, subject.id)),
    ).toHaveLength(1);
  });

  it('caregiver không được tạo nháp; người ngoài không thấy hồ sơ', async () => {
    const subject = await createSubject(ctx, owner.session.user.id);
    await linkCaregiver(subject.id);

    const caregiverResponse = await caregiver.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/drafts`)
      .set('Origin', TEST_ORIGIN)
      .send(draftBody());
    expect(caregiverResponse.status).toBe(403);

    const outsiderResponse = await outsider.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/drafts`)
      .set('Origin', TEST_ORIGIN)
      .send(draftBody());
    expect(outsiderResponse.status).toBe(404);
    expect(
      await ctx.db.select().from(assistantDrafts).where(eq(assistantDrafts.subjectId, subject.id)),
    ).toHaveLength(0);
  });

  it('nháp hết hạn chuyển expired, confirm trả 409 và không tạo lịch', async () => {
    const subject = await createSubject(ctx, owner.session.user.id);
    const created = await owner.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/drafts`)
      .set('Origin', TEST_ORIGIN)
      .send(draftBody());
    expect(created.status).toBe(201);

    await ctx.db
      .update(assistantDrafts)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(assistantDrafts.id, created.body.id));

    const response = await owner.agent
      .post(`/api/v1/assistant/drafts/${created.body.id}/confirm`)
      .set('Origin', TEST_ORIGIN);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CONFLICT');

    const draft = await ctx.db
      .select()
      .from(assistantDrafts)
      .where(eq(assistantDrafts.id, created.body.id));
    expect(draft[0]?.status).toBe('expired');
    const editExpired = await owner.agent
      .patch(`/api/v1/assistant/drafts/${created.body.id}`)
      .set('Origin', TEST_ORIGIN)
      .send({ input: draftBody().input });
    expect(editExpired.status).toBe(409);
    expect(
      await ctx.db.select().from(careReminders).where(eq(careReminders.subjectId, subject.id)),
    ).toHaveLength(0);
  });

  it('hủy nháp và digest sai đều không tạo lịch', async () => {
    const subject = await createSubject(ctx, owner.session.user.id);

    const cancelledDraft = await owner.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/drafts`)
      .set('Origin', TEST_ORIGIN)
      .send(draftBody({ title: 'Đi bộ buổi sáng', kind: 'activity' }));
    const cancelled = await owner.agent
      .post(`/api/v1/assistant/drafts/${cancelledDraft.body.id}/cancel`)
      .set('Origin', TEST_ORIGIN);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('cancelled');
    const afterCancel = await owner.agent
      .post(`/api/v1/assistant/drafts/${cancelledDraft.body.id}/confirm`)
      .set('Origin', TEST_ORIGIN);
    expect(afterCancel.status).toBe(409);

    const tamperedDraft = await owner.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/drafts`)
      .set('Origin', TEST_ORIGIN)
      .send(draftBody({ title: 'Uống nước', kind: 'other' }));
    await ctx.db
      .update(assistantDrafts)
      .set({
        payload: {
          ...tamperedDraft.body.preview,
          title: 'Nội dung bị sửa sau preview',
        },
      })
      .where(eq(assistantDrafts.id, tamperedDraft.body.id));
    const afterTamper = await owner.agent
      .post(`/api/v1/assistant/drafts/${tamperedDraft.body.id}/confirm`)
      .set('Origin', TEST_ORIGIN);
    expect(afterTamper.status).toBe(409);

    expect(
      await ctx.db.select().from(careReminders).where(eq(careReminders.subjectId, subject.id)),
    ).toHaveLength(0);
  });

  it('nháp từ câu lệnh đơn giản vẫn không ghi lịch; sai liều bị 422; quyền giữ nguyên', async () => {
    const subject = await createSubject(ctx, owner.session.user.id);
    await linkCaregiver(subject.id);

    const created = await owner.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/drafts/from-text`)
      .set('Origin', TEST_ORIGIN)
      .send({ text: 'nhắc tôi uống thuốc lúc 8h sáng hằng ngày' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      status: 'draft',
      capability: 'care_reminder.create',
      preview: {
        kind: 'medication',
        title: 'uống thuốc',
        times: ['08:00'],
        weekdays: [1, 2, 3, 4, 5, 6, 7],
      },
    });
    expect(
      await ctx.db.select().from(careReminders).where(eq(careReminders.subjectId, subject.id)),
    ).toHaveLength(0);

    const audit = (
      await ctx.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, 'assistant.draft.create'))
    ).find((row) => row.targetId === created.body.id);
    expect(audit?.metadata).toMatchObject({ source: 'text_parser', parserVersion: 1 });
    expect(JSON.stringify(audit?.metadata)).not.toContain('uống thuốc');

    const caregiverResponse = await caregiver.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/drafts/from-text`)
      .set('Origin', TEST_ORIGIN)
      .send({ text: 'nhắc tôi đi bộ lúc 6h' });
    expect(caregiverResponse.status).toBe(403);
    const outsiderResponse = await outsider.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/drafts/from-text`)
      .set('Origin', TEST_ORIGIN)
      .send({ text: 'nhắc tôi đi bộ lúc 6h' });
    expect(outsiderResponse.status).toBe(404);

    const rejected = await owner.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/drafts/from-text`)
      .set('Origin', TEST_ORIGIN)
      .send({ text: 'nhắc tôi uống thuốc 2 viên lúc 8h' });
    expect(rejected.status).toBe(422);
    expect(rejected.body.code).toBe('VALIDATION_FAILED');

    const confirmed = await owner.agent
      .post(`/api/v1/assistant/drafts/${created.body.id}/confirm`)
      .set('Origin', TEST_ORIGIN);
    expect(confirmed.status).toBe(200);
    expect(
      await ctx.db.select().from(careReminders).where(eq(careReminders.subjectId, subject.id)),
    ).toHaveLength(1);
  });

  it('sửa nháp trước khi xác nhận dùng nội dung mới; caregiver/ngoài bị chặn', async () => {
    const subject = await createSubject(ctx, owner.session.user.id);
    await linkCaregiver(subject.id);
    const created = await owner.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/drafts`)
      .set('Origin', TEST_ORIGIN)
      .send(draftBody());
    expect(created.status).toBe(201);

    const base = draftBody();
    const updated = await owner.agent
      .patch(`/api/v1/assistant/drafts/${created.body.id}`)
      .set('Origin', TEST_ORIGIN)
      .send({
        input: {
          ...base.input,
          title: 'Uống thuốc huyết áp',
          times: ['09:15'],
          weekdays: [2, 3, 4, 5, 6],
        },
      });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      status: 'draft',
      preview: {
        title: 'Uống thuốc huyết áp',
        times: ['09:15'],
        weekdays: [2, 3, 4, 5, 6],
      },
    });
    expect(updated.body.previewDigest).not.toBe(created.body.previewDigest);
    expect(
      await ctx.db.select().from(careReminders).where(eq(careReminders.subjectId, subject.id)),
    ).toHaveLength(0);

    const editAudit = (
      await ctx.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, 'assistant.draft.update'))
    ).find((row) => row.targetId === created.body.id);
    expect(editAudit?.metadata).not.toHaveProperty('title');
    expect(editAudit?.metadata).not.toHaveProperty('note');

    const caregiverResponse = await caregiver.agent
      .patch(`/api/v1/assistant/drafts/${created.body.id}`)
      .set('Origin', TEST_ORIGIN)
      .send({ input: base.input });
    expect(caregiverResponse.status).toBe(404);
    const outsiderResponse = await outsider.agent
      .patch(`/api/v1/assistant/drafts/${created.body.id}`)
      .set('Origin', TEST_ORIGIN)
      .send({ input: base.input });
    expect(outsiderResponse.status).toBe(404);

    const confirmed = await owner.agent
      .post(`/api/v1/assistant/drafts/${created.body.id}/confirm`)
      .set('Origin', TEST_ORIGIN);
    expect(confirmed.status).toBe(200);
    const reminders = await ctx.db
      .select()
      .from(careReminders)
      .where(eq(careReminders.subjectId, subject.id));
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      title: 'Uống thuốc huyết áp',
      times: ['09:15'],
      weekdays: [2, 3, 4, 5, 6],
    });

    const afterConfirm = await owner.agent
      .patch(`/api/v1/assistant/drafts/${created.body.id}`)
      .set('Origin', TEST_ORIGIN)
      .send({ input: base.input });
    expect(afterConfirm.status).toBe(409);
  });

  it('liệt kê nháp đang chờ của chủ hồ sơ; loại nháp đã xác nhận/hết hạn', async () => {
    const subject = await createSubject(ctx, owner.session.user.id);
    await linkCaregiver(subject.id);

    const active = await owner.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/drafts`)
      .set('Origin', TEST_ORIGIN)
      .send(draftBody({ title: 'Đo huyết áp buổi sáng' }));
    expect(active.status).toBe(201);

    const confirmed = await owner.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/drafts`)
      .set('Origin', TEST_ORIGIN)
      .send(draftBody({ title: 'Uống thuốc buổi tối' }));
    expect(confirmed.status).toBe(201);
    expect(
      (
        await owner.agent
          .post(`/api/v1/assistant/drafts/${confirmed.body.id}/confirm`)
          .set('Origin', TEST_ORIGIN)
      ).status,
    ).toBe(200);

    const expired = await owner.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/drafts`)
      .set('Origin', TEST_ORIGIN)
      .send(draftBody({ title: 'Nháp đã hết hạn' }));
    expect(expired.status).toBe(201);
    await ctx.db
      .update(assistantDrafts)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(assistantDrafts.id, expired.body.id));

    const listed = await owner.agent
      .get(`/api/v1/subjects/${subject.id}/assistant/drafts?limit=10`)
      .set('Origin', TEST_ORIGIN);
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toMatchObject({
      id: active.body.id,
      status: 'draft',
      preview: { title: 'Đo huyết áp buổi sáng' },
    });

    const caregiverList = await caregiver.agent
      .get(`/api/v1/subjects/${subject.id}/assistant/drafts`)
      .set('Origin', TEST_ORIGIN);
    expect(caregiverList.status).toBe(403);
    const outsiderList = await outsider.agent
      .get(`/api/v1/subjects/${subject.id}/assistant/drafts`)
      .set('Origin', TEST_ORIGIN);
    expect(outsiderList.status).toBe(404);
  });

  it('requestKey lặp trả cùng nháp, không tạo trùng; khác nội dung bị 409', async () => {
    const subject = await createSubject(ctx, owner.session.user.id);
    const requestKey = crypto.randomUUID();
    const body = { ...draftBody(), requestKey };

    const first = await owner.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/drafts`)
      .set('Origin', TEST_ORIGIN)
      .send(body);
    expect(first.status).toBe(201);
    const retry = await owner.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/drafts`)
      .set('Origin', TEST_ORIGIN)
      .send(body);
    expect(retry.status).toBe(201);
    expect(retry.body.id).toBe(first.body.id);
    expect(retry.body.previewDigest).toBe(first.body.previewDigest);

    const drafts = await ctx.db
      .select()
      .from(assistantDrafts)
      .where(eq(assistantDrafts.subjectId, subject.id));
    expect(drafts).toHaveLength(1);
    const createAudits = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'assistant.draft.create'));
    expect(createAudits.filter((row) => row.targetId === first.body.id)).toHaveLength(1);

    const conflict = await owner.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/drafts`)
      .set('Origin', TEST_ORIGIN)
      .send({ ...draftBody({ title: 'Nội dung khác' }), requestKey });
    expect(conflict.status).toBe(409);
    expect(
      await ctx.db.select().from(assistantDrafts).where(eq(assistantDrafts.subjectId, subject.id)),
    ).toHaveLength(1);

    const textKey = crypto.randomUUID();
    const textBody = { text: 'nhắc tôi uống nước lúc 9h', requestKey: textKey };
    const textFirst = await owner.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/drafts/from-text`)
      .set('Origin', TEST_ORIGIN)
      .send(textBody);
    expect(textFirst.status).toBe(201);
    const textRetry = await owner.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/drafts/from-text`)
      .set('Origin', TEST_ORIGIN)
      .send(textBody);
    expect(textRetry.status).toBe(201);
    expect(textRetry.body.id).toBe(textFirst.body.id);
    expect(
      await ctx.db.select().from(assistantDrafts).where(eq(assistantDrafts.subjectId, subject.id)),
    ).toHaveLength(2);
  });
});
