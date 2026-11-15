import request from 'supertest';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { count, desc, eq } from 'drizzle-orm';
import { DEFAULT_CARE_PERMISSIONS } from '@annhien/contracts';
import type { ViewConfig } from '@annhien/contracts/studio';
import {
  createModuleTestApp,
  createAdmin,
  registerUser,
  TEST_ORIGIN,
  type TestContext,
  type TestUser,
} from './test-app';
import { StudioModule } from '../src/studio/studio.module';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import { DB, type AppDb } from '../src/database/database';
import {
  auditLogs,
  careLinks,
  deviceAssignments,
  devices,
  incidents,
  maintenanceTasks,
  notificationOutbox,
  subjects,
  telemetry,
  viewPublications,
  workspaceViews,
} from '../src/database/schema';

/**
 * Studio workspace views (wave 2 be-studio): draft → preview (không ghi) → publish
 * (compare-and-set) → rollback; quyền owner/caregiver/admin/global.
 * Test dùng createModuleTestApp(StudioModule) + filter lỗi cục bộ (module test
 * không tự đăng ký APP_FILTER); guard phiên do @UseGuards(SessionGuard) trên controller.
 */

@Module({
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
class TestFiltersModule {}

let serialCounter = 0;
const nextSerial = () => `ST-${String(++serialCounter).padStart(4, '0')}`;

type ViewBody = {
  id: string;
  key: string;
  name: string;
  scope: 'user' | 'subject' | 'global';
  status: string;
  draftRevision: number;
  draftDigest: string | null;
  baseRevision: number;
  currentPublication: { id: string; revision: number; status: string; digest: string } | null;
  subjectId: string | null;
};

function makeConfig(widgets: ViewConfig['widgets'], layout: ViewConfig['layout'] = 'grid'): ViewConfig {
  return { version: 1, layout, widgets };
}

const DEFAULT_WIDGETS: ViewConfig['widgets'] = [
  { id: 'hr', type: 'metric', title: 'Nhịp tim', span: 1 },
  { id: 'chart-hr', type: 'chart', title: 'Biểu đồ 24h', span: 3 },
];

async function createView(agent: ReturnType<typeof request.agent>, body: object): Promise<request.Response> {
  return agent.post('/api/v1/workspace-views').set('Origin', TEST_ORIGIN).send(body);
}

async function createSubject(ctx: TestContext, ownerUserId: string, displayName = 'Bà An') {
  const rows = await ctx.db
    .insert(subjects)
    .values({ ownerUserId, displayName, timezone: 'Asia/Ho_Chi_Minh' })
    .returning();
  const subject = rows[0];
  if (!subject) throw new Error('Không tạo được subject.');
  return subject;
}

async function shareSubject(
  ctx: TestContext,
  owner: TestUser,
  subjectId: string,
  caregiver: TestUser,
) {
  await ctx.db.insert(careLinks).values({
    subjectId,
    caregiverUserId: caregiver.session.user.id,
    invitedByUserId: owner.session.user.id,
    permissions: DEFAULT_CARE_PERMISSIONS,
    status: 'active',
    sharedFrom: new Date(),
  });
}

async function seedDeviceWithTelemetry(
  ctx: TestContext,
  owner: TestUser,
  subjectId: string,
  heartRates: number[],
) {
  const deviceRows = await ctx.db
    .insert(devices)
    .values({
      serial: nextSerial(),
      label: 'Vòng tay đo',
      credentialHash: 'hash-demo',
      status: 'active',
      firmwareVersion: '0.1.0-demo',
      lastSeenAt: new Date(),
    })
    .returning();
  const device = deviceRows[0];
  if (!device) throw new Error('Không tạo được device.');
  const assignmentRows = await ctx.db
    .insert(deviceAssignments)
    .values({ deviceId: device.id, subjectId, assignedByUserId: owner.session.user.id })
    .returning();
  const assignment = assignmentRows[0];
  if (!assignment) throw new Error('Không tạo được assignment.');
  for (let index = 0; index < heartRates.length; index += 1) {
    const hr = heartRates[index] as number;
    const measuredAt = new Date(Date.now() - (heartRates.length - index) * 60_000);
    await ctx.db.insert(telemetry).values({
      messageId: crypto.randomUUID(),
      deviceId: device.id,
      assignmentId: assignment.id,
      bootId: 'boot-studio',
      sequence: index,
      measuredAt,
      receivedAt: measuredAt,
      clockStatus: 'synced',
      uptimeMs: 60_000,
      metrics: { heart_rate_bpm: hr, steps_since_boot: index * 10 },
      quality: { heart_rate: 'valid', motion: 'valid' },
      payloadHash: crypto.randomUUID(),
      source: 'http',
      firmwareVersion: '0.1.0-demo',
    });
  }
  return { deviceId: device.id, assignmentId: assignment.id };
}

type RawTelemetryInput = {
  measuredAt: Date;
  sequence: number;
  heartRateBpm: number | null;
  stepsSinceBoot?: number;
  batteryPercent?: number | null;
  heartRateQuality?: 'valid' | 'poor_signal';
  /** Mẫu bị cách ly (lệch giờ/ngoài assignment) — còn trong DB nhưng không được đọc. */
  isQuarantined?: boolean;
  /** Dữ liệu cũ `clock_status='unsynced'` có thể còn measured_at; không phải mốc tin cậy. */
  clockStatus?: 'synced' | 'unsynced';
};

/** Ghi một mẫu telemetry với cờ cách ly/tương lai/đồng hồ tuỳ ý — chỉ dùng cho test lọc. */
async function insertTelemetryRow(
  ctx: TestContext,
  deviceId: string,
  assignmentId: string,
  input: RawTelemetryInput,
): Promise<void> {
  await ctx.db.insert(telemetry).values({
    messageId: crypto.randomUUID(),
    deviceId,
    assignmentId,
    bootId: 'boot-studio',
    sequence: input.sequence,
    measuredAt: input.measuredAt,
    receivedAt: new Date(),
    clockStatus: input.clockStatus ?? 'synced',
    uptimeMs: 60_000,
    metrics: {
      heart_rate_bpm: input.heartRateBpm,
      steps_since_boot: input.stepsSinceBoot ?? 0,
    },
    quality: { heart_rate: input.heartRateQuality ?? 'valid', motion: 'valid' },
    batteryPercent: input.batteryPercent ?? null,
    payloadHash: crypto.randomUUID(),
    source: 'http',
    firmwareVersion: '0.1.0-demo',
    isQuarantined: input.isQuarantined ?? false,
  });
}

async function seedIncidentAndTask(ctx: TestContext, owner: TestUser, subjectId: string, deviceId: string, assignmentId: string) {
  const incidentRows = await ctx.db
    .insert(incidents)
    .values({
      subjectId,
      assignmentId,
      deviceId,
      deviceIncidentId: crypto.randomUUID(),
      type: 'fall',
      state: 'open',
      lastRevision: 1,
      detectedAt: new Date(),
      lastEventAt: new Date(),
      version: 1,
    })
    .returning();
  const incident = incidentRows[0];
  if (!incident) throw new Error('Không tạo được incident.');
  await ctx.db.insert(notificationOutbox).values({
    incidentId: incident.id,
    revision: 1,
    recipientUserId: owner.session.user.id,
    channel: 'in_app',
    dedupeKey: crypto.randomUUID(),
  });
  await ctx.db.insert(maintenanceTasks).values({
    deviceId,
    subjectId,
    kind: 'maintenance',
    title: 'Kiểm tra pin',
    status: 'open',
    priority: 1,
    dedupeKey: crypto.randomUUID(),
  });
}

async function businessCounts(db: AppDb) {
  const [a, b, c, d, e, f] = await Promise.all([
    db.select({ n: count() }).from(incidents),
    db.select({ n: count() }).from(notificationOutbox),
    db.select({ n: count() }).from(maintenanceTasks),
    db.select({ n: count() }).from(telemetry),
    db.select({ n: count() }).from(workspaceViews),
    db.select({ n: count() }).from(viewPublications),
  ]);
  return {
    incidents: a[0]?.n ?? 0,
    outbox: b[0]?.n ?? 0,
    tasks: c[0]?.n ?? 0,
    telemetry: d[0]?.n ?? 0,
    views: e[0]?.n ?? 0,
    publications: f[0]?.n ?? 0,
  };
}

describe('Studio workspace views — draft → preview → publish → rollback (FR-07)', () => {
  let ctx: TestContext;
  let owner: TestUser;

  beforeAll(async () => {
    ctx = await createModuleTestApp([StudioModule, TestFiltersModule]);
    owner = await registerUser(ctx.app, { displayName: 'Chủ hồ sơ' });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('T1: owner tạo view user; key trùng → 409; config sai (trùng id, >12 widget, type lạ) → 422', async () => {
    const res = await createView(owner.agent, {
      key: 'dashboard-ca-nhan',
      name: 'Dashboard cá nhân',
      scope: 'user',
      config: makeConfig(DEFAULT_WIDGETS),
    });
    expect(res.status).toBe(201);
    const view = res.body as ViewBody;
    expect(view.status).toBe('draft');
    expect(view.draftRevision).toBe(1);
    expect(view.draftDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(view.baseRevision).toBe(0);

    const duplicate = await createView(owner.agent, {
      key: 'dashboard-ca-nhan',
      name: 'Bản khác',
      scope: 'user',
      config: makeConfig(DEFAULT_WIDGETS),
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('CONFLICT');

    const dupId = await createView(owner.agent, {
      key: 'view-dup-id',
      name: 'Trùng id',
      scope: 'user',
      config: makeConfig([
        { id: 'hr', type: 'metric', title: 'A', span: 1 },
        { id: 'hr', type: 'metric', title: 'B', span: 2 },
      ]),
    });
    expect(dupId.status).toBe(422);

    const tooMany = await createView(owner.agent, {
      key: 'view-too-many',
      name: 'Quá nhiều',
      scope: 'user',
      config: makeConfig(
        Array.from({ length: 13 }, (_, i) => ({
          id: `w-${i}`,
          type: 'metric' as const,
          title: `Widget ${i}`,
          span: 1 as const,
        })),
      ),
    });
    expect(tooMany.status).toBe(422);

    const badType = await createView(owner.agent, {
      key: 'view-bad-type',
      name: 'Type lạ',
      scope: 'user',
      config: {
        version: 1,
        layout: 'grid',
        widgets: [{ id: 'x', type: 'map', title: 'X', span: 1 }],
      },
    });
    expect(badType.status).toBe(422);

    // Preview: option đúng khóa nhưng sai giá trị → 422 kèm warnings;
    // option lạ → chỉ cảnh báo, không chặn.
    const optBad = await createView(owner.agent, {
      key: 'view-opt-bad',
      name: 'Option sai',
      scope: 'user',
      config: makeConfig([
        { id: 'chart-hr', type: 'chart', title: 'Chart', span: 3, options: { points: 'nhieu' } },
      ]),
    });
    expect(optBad.status).toBe(201);
    const optBadPreview = await owner.agent
      .post(`/api/v1/workspace-views/${(optBad.body as ViewBody).id}/previews`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 1 });
    expect(optBadPreview.status).toBe(422);
    expect(optBadPreview.body.code).toBe('VALIDATION_FAILED');
    expect(Array.isArray(optBadPreview.body.details.warnings)).toBe(true);
    expect(optBadPreview.body.details.warnings.length).toBeGreaterThan(0);

    const optUnknown = await createView(owner.agent, {
      key: 'view-opt-unknown',
      name: 'Option lạ',
      scope: 'user',
      config: makeConfig([
        { id: 'hr', type: 'metric', title: 'HR', span: 1, options: { refreshSeconds: 30, theme: 'dark' } },
      ]),
    });
    expect(optUnknown.status).toBe(201);
    const optUnknownPreview = await owner.agent
      .post(`/api/v1/workspace-views/${(optUnknown.body as ViewBody).id}/previews`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 1 });
    expect(optUnknownPreview.status).toBe(200);
    expect(optUnknownPreview.body.warnings.some((w: string) => w.includes('theme'))).toBe(true);
  });

  it('T2: draft — baseRevision đúng tăng revision, lệch → 409; digest đổi khi sửa config, ổn định khi đổi thứ tự key', async () => {
    const created = await createView(owner.agent, {
      key: 'view-draft',
      name: 'View draft',
      scope: 'user',
      config: makeConfig(DEFAULT_WIDGETS),
    });
    expect(created.status).toBe(201);
    const viewId = (created.body as ViewBody).id;
    const digest1 = (created.body as ViewBody).draftDigest;

    const configB = makeConfig([
      { id: 'hr', type: 'metric', title: 'Nhịp tim (mới)', span: 2 },
      { id: 'chart-hr', type: 'chart', title: 'Biểu đồ 24h', span: 2 },
    ]);
    const update1 = await owner.agent
      .put(`/api/v1/workspace-views/${viewId}/draft`)
      .set('Origin', TEST_ORIGIN)
      .send({ config: configB, baseRevision: 0 });
    expect(update1.status).toBe(200);
    const after1 = update1.body as ViewBody;
    expect(after1.draftRevision).toBe(2);
    expect(after1.draftDigest).not.toBe(digest1);

    // Đổi thứ tự key trong object widget (không đổi nội dung) → digest ổn định.
    const configBReordered = makeConfig([
      { type: 'metric', span: 2, title: 'Nhịp tim (mới)', id: 'hr' },
      { title: 'Biểu đồ 24h', type: 'chart', id: 'chart-hr', span: 2 },
    ]);
    const update2 = await owner.agent
      .put(`/api/v1/workspace-views/${viewId}/draft`)
      .set('Origin', TEST_ORIGIN)
      .send({ config: configBReordered, baseRevision: 0 });
    expect(update2.status).toBe(200);
    const after2 = update2.body as ViewBody;
    expect(after2.draftRevision).toBe(3);
    expect(after2.draftDigest).toBe(after1.draftDigest);

    // Bản nền chưa từng publish nên baseRevision vẫn là 0; gửi 1 → 409.
    const stale = await owner.agent
      .put(`/api/v1/workspace-views/${viewId}/draft`)
      .set('Origin', TEST_ORIGIN)
      .send({ config: configB, baseRevision: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('CONFLICT');
    expect(stale.body.details).toEqual({ currentRevision: 0 });
  });

  it('T3: preview — draftRevision cũ → 409; sample khi không có subject; với subject có quyền → dữ liệu thật; không ghi bảng nghiệp vụ', async () => {
    const subject = await createSubject(ctx, owner.session.user.id);
    const { deviceId, assignmentId } = await seedDeviceWithTelemetry(ctx, owner, subject.id, [70, 80, 90]);
    await seedIncidentAndTask(ctx, owner, subject.id, deviceId, assignmentId);

    const created = await createView(owner.agent, {
      key: 'view-preview',
      name: 'View preview',
      scope: 'user',
      config: makeConfig(DEFAULT_WIDGETS),
    });
    expect(created.status).toBe(201);
    const viewId = (created.body as ViewBody).id;

    const before = await businessCounts(ctx.db);

    const sampleRes = await owner.agent
      .post(`/api/v1/workspace-views/${viewId}/previews`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 1 });
    expect(sampleRes.status).toBe(200);
    expect(sampleRes.body.dataMode).toBe('sample');
    expect(sampleRes.body.data.sample).toBe(true);
    expect(sampleRes.body.subjectId).toBeNull();

    const subjectRes = await owner.agent
      .post(`/api/v1/workspace-views/${viewId}/previews`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 1, previewSubjectId: subject.id });
    expect(subjectRes.status).toBe(200);
    expect(subjectRes.body.dataMode).toBe('subject');
    expect(subjectRes.body.data.sample).toBe(false);
    expect(subjectRes.body.data.metrics.heartRateBpm).toBe(90);
    expect(subjectRes.body.data.series).toHaveLength(3);
    expect(subjectRes.body.data.devices).toHaveLength(1);
    expect(subjectRes.body.data.alerts).toHaveLength(1);
    expect(subjectRes.body.data.tasks).toHaveLength(1);
    expect(subjectRes.body.data.summary.heartRateAvg).toBe(80);

    const staleDraft = await owner.agent
      .post(`/api/v1/workspace-views/${viewId}/previews`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 99 });
    expect(staleDraft.status).toBe(409);

    const after = await businessCounts(ctx.db);
    expect(after).toEqual(before);
  });

  it('T4: publish — digest sai/revision lệch → 409 APPROVAL_STALE; thành công tạo active, active cũ superseded, audit có bản ghi', async () => {
    const created = await createView(owner.agent, {
      key: 'view-publish',
      name: 'View publish',
      scope: 'user',
      config: makeConfig(DEFAULT_WIDGETS),
    });
    expect(created.status).toBe(201);
    const viewId = (created.body as ViewBody).id;
    const digest1 = (created.body as ViewBody).draftDigest as string;

    const badDigest = await owner.agent
      .post(`/api/v1/workspace-views/${viewId}/publications`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 1, digest: '0'.repeat(64), baseRevision: 0 });
    expect(badDigest.status).toBe(409);
    expect(badDigest.body.code).toBe('APPROVAL_STALE');

    const publish1 = await owner.agent
      .post(`/api/v1/workspace-views/${viewId}/publications`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 1, digest: digest1, baseRevision: 0, note: 'Bản đầu' });
    expect(publish1.status).toBe(201);
    expect(publish1.body.publication.revision).toBe(1);
    expect(publish1.body.publication.status).toBe('active');
    expect(publish1.body.view.baseRevision).toBe(1);
    expect(publish1.body.view.status).toBe('published');
    const publication1Id = publish1.body.publication.id as string;

    // Sửa draft từ nền 1, publish với baseRevision cũ → APPROVAL_STALE.
    const configB = makeConfig([
      { id: 'hr', type: 'metric', title: 'Nhịp tim v2', span: 1 },
      { id: 'chart-hr', type: 'chart', title: 'Biểu đồ 24h', span: 3 },
    ]);
    const update = await owner.agent
      .put(`/api/v1/workspace-views/${viewId}/draft`)
      .set('Origin', TEST_ORIGIN)
      .send({ config: configB, baseRevision: 1 });
    expect(update.status).toBe(200);
    const afterUpdate = update.body as ViewBody;
    expect(afterUpdate.draftRevision).toBe(2);

    const staleBase = await owner.agent
      .post(`/api/v1/workspace-views/${viewId}/publications`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 2, digest: afterUpdate.draftDigest, baseRevision: 0 });
    expect(staleBase.status).toBe(409);
    expect(staleBase.body.code).toBe('APPROVAL_STALE');
    expect(staleBase.body.details.currentBaseRevision).toBe(1);

    const publish2 = await owner.agent
      .post(`/api/v1/workspace-views/${viewId}/publications`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 2, digest: afterUpdate.draftDigest, baseRevision: 1 });
    expect(publish2.status).toBe(201);
    expect(publish2.body.publication.revision).toBe(2);
    expect(publish2.body.view.baseRevision).toBe(2);

    const publications = await owner.agent
      .get(`/api/v1/workspace-views/${viewId}/publications`)
      .set('Origin', TEST_ORIGIN);
    expect(publications.status).toBe(200);
    expect(publications.body.items).toHaveLength(2);
    const rev1 = publications.body.items.find((p: { id: string }) => p.id === publication1Id);
    expect(rev1.status).toBe('superseded');
    const rev2 = publications.body.items.find((p: { revision: number }) => p.revision === 2);
    expect(rev2.status).toBe('active');

    const auditRows = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'workspace_view.publish'));
    expect(auditRows.length).toBeGreaterThanOrEqual(2);
    // Metadata chỉ id/revision/digest, không có dữ liệu sức khỏe.
    for (const row of auditRows) {
      const metadata = row.metadata as Record<string, unknown>;
      expect(metadata.revision).toBeDefined();
      expect(metadata.digest).toBeDefined();
      expect(JSON.stringify(metadata)).not.toMatch(/heart|bpm/i);
    }
  });

  it('T5: hai publish đồng thời cùng digest/revision → một 201, một 409; chỉ một publication active', async () => {
    const created = await createView(owner.agent, {
      key: 'view-race',
      name: 'View race',
      scope: 'user',
      config: makeConfig(DEFAULT_WIDGETS),
    });
    expect(created.status).toBe(201);
    const viewId = (created.body as ViewBody).id;
    const digest = (created.body as ViewBody).draftDigest;

    const attempt = () =>
      owner.agent
        .post(`/api/v1/workspace-views/${viewId}/publications`)
        .set('Origin', TEST_ORIGIN)
        .send({ draftRevision: 1, digest, baseRevision: 0 });

    const [first, second] = await Promise.all([attempt(), attempt()]);
    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);
    const conflict = first.status === 409 ? first : second;
    expect(conflict.body.code).toBe('APPROVAL_STALE');

    const actives = await ctx.db
      .select()
      .from(viewPublications)
      .where(eq(viewPublications.status, 'active'));
    const viewActives = actives.filter((p) => p.viewId === viewId);
    expect(viewActives).toHaveLength(1);
    expect(viewActives[0]?.revision).toBe(1);
  });

  it('T6: caregiver đọc published subject view được (không thấy draft); sửa/draft/preview/publish bị chặn; view draft không lộ', async () => {
    const subject = await createSubject(ctx, owner.session.user.id, 'Bà Bảy');
    const caregiver = await registerUser(ctx.app, { displayName: 'Người chăm sóc' });
    await shareSubject(ctx, owner, subject.id, caregiver);
    const stranger = await registerUser(ctx.app);

    const created = await createView(owner.agent, {
      key: 'view-ba-bay',
      name: 'Dashboard bà Bảy',
      scope: 'subject',
      subjectId: subject.id,
      config: makeConfig(DEFAULT_WIDGETS),
    });
    expect(created.status).toBe(201);
    const viewId = (created.body as ViewBody).id;
    const digest = (created.body as ViewBody).draftDigest;

    // Chưa publish: caregiver không thấy.
    const caregiverGetDraft = await caregiver.agent
      .get(`/api/v1/workspace-views/${viewId}`)
      .set('Origin', TEST_ORIGIN);
    expect(caregiverGetDraft.status).toBe(404);

    // Stranger không thấy cả khi đã publish.
    const publish = await owner.agent
      .post(`/api/v1/workspace-views/${viewId}/publications`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 1, digest, baseRevision: 0 });
    expect(publish.status).toBe(201);

    const strangerGet = await stranger.agent
      .get(`/api/v1/workspace-views/${viewId}`)
      .set('Origin', TEST_ORIGIN);
    expect(strangerGet.status).toBe(404);

    const caregiverGet = await caregiver.agent
      .get(`/api/v1/workspace-views/${viewId}`)
      .set('Origin', TEST_ORIGIN);
    expect(caregiverGet.status).toBe(200);
    expect(caregiverGet.body.draftDigest).toBeNull();
    expect(caregiverGet.body.currentPublication).not.toBeNull();
    expect(caregiverGet.body.currentPublication.revision).toBe(1);

    const list = await caregiver.agent.get('/api/v1/workspace-views').set('Origin', TEST_ORIGIN);
    expect(list.status).toBe(200);
    const listed = list.body.items.find((v: ViewBody) => v.id === viewId);
    expect(listed).toBeDefined();
    expect(listed.draftDigest).toBeNull();

    // Sửa/preview/publish bị chặn.
    const draft = await caregiver.agent
      .put(`/api/v1/workspace-views/${viewId}/draft`)
      .set('Origin', TEST_ORIGIN)
      .send({ config: makeConfig(DEFAULT_WIDGETS), baseRevision: 1 });
    expect(draft.status).toBe(403);
    const preview = await caregiver.agent
      .post(`/api/v1/workspace-views/${viewId}/previews`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 1, previewSubjectId: subject.id });
    expect(preview.status).toBe(403);
    const caregiverPublish = await caregiver.agent
      .post(`/api/v1/workspace-views/${viewId}/publications`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 1, digest, baseRevision: 1 });
    expect(caregiverPublish.status).toBe(403);

    // Caregiver chỉ thấy publication active trong lịch sử.
    const publications = await caregiver.agent
      .get(`/api/v1/workspace-views/${viewId}/publications`)
      .set('Origin', TEST_ORIGIN);
    expect(publications.status).toBe(200);
    expect(publications.body.items).toHaveLength(1);
    expect(publications.body.items[0].status).toBe('active');
  });

  it('T7: global — user thường không tạo được; admin tạo/publish; user đọc published', async () => {
    const admin = await createAdmin(ctx.app, { email: `admin-studio-${crypto.randomUUID()}@example.test` });

    const userCreate = await createView(owner.agent, {
      key: 'global-user-view',
      name: 'Global user',
      scope: 'global',
      config: makeConfig(DEFAULT_WIDGETS),
    });
    expect(userCreate.status).toBe(403);

    const created = await createView(admin.agent, {
      key: 'global-admin-view',
      name: 'Global admin',
      scope: 'global',
      config: makeConfig(DEFAULT_WIDGETS),
    });
    expect(created.status).toBe(201);
    const viewId = (created.body as ViewBody).id;
    const digest = (created.body as ViewBody).draftDigest;

    // Chưa publish: user thường không thấy.
    const beforePublish = await owner.agent
      .get(`/api/v1/workspace-views/${viewId}`)
      .set('Origin', TEST_ORIGIN);
    expect(beforePublish.status).toBe(404);

    const publish = await admin.agent
      .post(`/api/v1/workspace-views/${viewId}/publications`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 1, digest, baseRevision: 0 });
    expect(publish.status).toBe(201);

    const userGet = await owner.agent
      .get(`/api/v1/workspace-views/${viewId}`)
      .set('Origin', TEST_ORIGIN);
    expect(userGet.status).toBe(200);
    expect(userGet.body.currentPublication).not.toBeNull();
    expect(userGet.body.draftDigest).toBeNull();

    const list = await owner.agent.get('/api/v1/workspace-views').set('Origin', TEST_ORIGIN);
    expect(list.body.items.some((v: ViewBody) => v.id === viewId)).toBe(true);

    // User thường không publish được global.
    const userPublish = await owner.agent
      .post(`/api/v1/workspace-views/${viewId}/publications`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 1, digest, baseRevision: 1 });
    expect(userPublish.status).toBe(403);
  });

  it('T8: rollback — tạo revision mới từ publication cũ, history đủ, active cũ superseded, không xóa publication', async () => {
    const created = await createView(owner.agent, {
      key: 'view-rollback',
      name: 'View rollback',
      scope: 'user',
      config: makeConfig([{ id: 'hr', type: 'metric', title: 'Phiên bản A', span: 1 }]),
    });
    expect(created.status).toBe(201);
    const viewId = (created.body as ViewBody).id;
    const digestA = (created.body as ViewBody).draftDigest as string;

    const publish1 = await owner.agent
      .post(`/api/v1/workspace-views/${viewId}/publications`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 1, digest: digestA, baseRevision: 0 });
    expect(publish1.status).toBe(201);
    const publication1Id = publish1.body.publication.id as string;

    const configB = makeConfig([{ id: 'hr', type: 'metric', title: 'Phiên bản B', span: 1 }]);
    const update = await owner.agent
      .put(`/api/v1/workspace-views/${viewId}/draft`)
      .set('Origin', TEST_ORIGIN)
      .send({ config: configB, baseRevision: 1 });
    expect(update.status).toBe(200);
    const afterUpdate = update.body as ViewBody;

    const publish2 = await owner.agent
      .post(`/api/v1/workspace-views/${viewId}/publications`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 2, digest: afterUpdate.draftDigest, baseRevision: 1 });
    expect(publish2.status).toBe(201);
    const publication2Id = publish2.body.publication.id as string;

    const rollback = await owner.agent
      .post(`/api/v1/workspace-views/${viewId}/rollback`)
      .set('Origin', TEST_ORIGIN)
      .send({ publicationId: publication1Id, note: 'Quay lại bản A' });
    expect(rollback.status).toBe(201);
    expect(rollback.body.publication.revision).toBe(3);
    expect(rollback.body.publication.status).toBe('active');
    expect(rollback.body.view.baseRevision).toBe(3);

    const publications = await owner.agent
      .get(`/api/v1/workspace-views/${viewId}/publications`)
      .set('Origin', TEST_ORIGIN);
    expect(publications.status).toBe(200);
    expect(publications.body.items).toHaveLength(3);
    const rev1 = publications.body.items.find((p: { id: string }) => p.id === publication1Id);
    const rev2 = publications.body.items.find((p: { id: string }) => p.id === publication2Id);
    const rev3 = publications.body.items.find((p: { revision: number }) => p.revision === 3);
    expect(rev1.status).toBe('superseded');
    expect(rev2.status).toBe('superseded');
    expect(rev3.status).toBe('active');
    expect(rev3.digest).toBe(digestA);

    const auditRows = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'workspace_view.rollback'));
    expect(auditRows.length).toBe(1);

    // Rollback tới publication đang active → 409.
    const rollbackActive = await owner.agent
      .post(`/api/v1/workspace-views/${viewId}/rollback`)
      .set('Origin', TEST_ORIGIN)
      .send({ publicationId: rev3.id });
    expect(rollbackActive.status).toBe(409);

    // Publication của view khác → 404.
    const other = await createView(owner.agent, {
      key: 'view-other',
      name: 'View khác',
      scope: 'user',
      config: makeConfig(DEFAULT_WIDGETS),
    });
    const rollbackOther = await owner.agent
      .post(`/api/v1/workspace-views/${(other.body as ViewBody).id}/rollback`)
      .set('Origin', TEST_ORIGIN)
      .send({ publicationId: publication1Id });
    expect(rollbackOther.status).toBe(404);
  });

  it('T9: data endpoint — chưa có publication active → 404 (không trả draft); đã publish → config/digest active; quyền subject và scope giữ nguyên; không ghi', async () => {
    const subject1 = await createSubject(ctx, owner.session.user.id, 'Bà Chín');
    const { deviceId, assignmentId } = await seedDeviceWithTelemetry(ctx, owner, subject1.id, [72, 75, 78]);
    await seedIncidentAndTask(ctx, owner, subject1.id, deviceId, assignmentId);
    const subject2 = await createSubject(ctx, owner.session.user.id, 'Ông Mười');
    const caregiver2 = await registerUser(ctx.app);
    await shareSubject(ctx, owner, subject2.id, caregiver2);
    const caregiver1 = await registerUser(ctx.app, { displayName: 'Người xem bà Chín' });
    await shareSubject(ctx, owner, subject1.id, caregiver1);

    const created = await createView(owner.agent, {
      key: 'view-data',
      name: 'View data',
      scope: 'subject',
      subjectId: subject1.id,
      config: makeConfig(DEFAULT_WIDGETS),
    });
    expect(created.status).toBe(201);
    const viewId = (created.body as ViewBody).id;
    const digest1 = (created.body as ViewBody).draftDigest as string;

    // View scope user không có subjectId mặc định → cần truyền subjectId.
    const userView = await createView(owner.agent, {
      key: 'view-data-user',
      name: 'View data user',
      scope: 'user',
      config: makeConfig(DEFAULT_WIDGETS),
    });
    expect(userView.status).toBe(201);
    const userViewId = (userView.body as ViewBody).id;
    const userViewDigest = (userView.body as ViewBody).draftDigest as string;

    // Chưa có publication active: owner và caregiver đều 404, không trả draftConfig.
    const ownerNoActive = await owner.agent
      .get(`/api/v1/workspace-views/${viewId}/data`)
      .set('Origin', TEST_ORIGIN);
    expect(ownerNoActive.status).toBe(404);
    expect(ownerNoActive.body.code).toBe('NOT_FOUND');
    expect(ownerNoActive.body.config).toBeUndefined();

    const caregiverNoActive = await caregiver1.agent
      .get(`/api/v1/workspace-views/${viewId}/data`)
      .set('Origin', TEST_ORIGIN);
    expect(caregiverNoActive.status).toBe(404);
    expect(caregiverNoActive.body.config).toBeUndefined();

    // Publish view subject + view user (để kiểm nhánh 422 thiếu subjectId).
    const publish = await owner.agent
      .post(`/api/v1/workspace-views/${viewId}/publications`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 1, digest: digest1, baseRevision: 0 });
    expect(publish.status).toBe(201);
    const publishUser = await owner.agent
      .post(`/api/v1/workspace-views/${userViewId}/publications`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 1, digest: userViewDigest, baseRevision: 0 });
    expect(publishUser.status).toBe(201);

    const before = await businessCounts(ctx.db);

    const dataRes = await owner.agent
      .get(`/api/v1/workspace-views/${viewId}/data`)
      .set('Origin', TEST_ORIGIN);
    expect(dataRes.status).toBe(200);
    // Config + digest là của publication active (r1 vừa công bố), view không lộ draft.
    expect(dataRes.body.digest).toBe(digest1);
    expect(dataRes.body.config.widgets[0].title).toBe('Nhịp tim');
    expect(dataRes.body.view.currentPublication.revision).toBe(1);
    expect(dataRes.body.view.currentPublication.digest).toBe(digest1);
    expect(dataRes.body.view.draftDigest).toBeNull();
    expect(dataRes.body.data.sample).toBe(false);
    expect(dataRes.body.data.metrics.heartRateBpm).toBe(78);
    expect(dataRes.body.data.series).toHaveLength(3);
    expect(dataRes.body.data.subject.id).toBe(subject1.id);

    // Caregiver có link tới subject1 → cùng bản công bố, cùng config/digest.
    const caregiverData = await caregiver1.agent
      .get(`/api/v1/workspace-views/${viewId}/data`)
      .set('Origin', TEST_ORIGIN);
    expect(caregiverData.status).toBe(200);
    expect(caregiverData.body.digest).toBe(digest1);
    expect(caregiverData.body.config).toEqual(dataRes.body.config);
    expect(caregiverData.body.view.currentPublication.revision).toBe(1);

    // Caregiver của hồ sơ khác không có link tới subject1 → 404.
    const forbiddenData = await caregiver2.agent
      .get(`/api/v1/workspace-views/${viewId}/data?subjectId=${subject1.id}`)
      .set('Origin', TEST_ORIGIN);
    expect(forbiddenData.status).toBe(404);

    // View scope user đã publish nhưng không có subjectId mặc định → 422.
    const noSubject = await owner.agent
      .get(`/api/v1/workspace-views/${userViewId}/data`)
      .set('Origin', TEST_ORIGIN);
    expect(noSubject.status).toBe(422);

    const after = await businessCounts(ctx.db);
    expect(after).toEqual(before);
  });

  it('T10: data/preview bỏ mẫu cách ly, mẫu tương lai và mẫu chưa đồng bộ giờ; metrics/series/summary/last values chỉ từ mẫu hợp lệ', async () => {
    const subject = await createSubject(ctx, owner.session.user.id, 'Bà Cách Ly Studio');
    const deviceRows = await ctx.db
      .insert(devices)
      .values({
        serial: nextSerial(),
        label: 'Vòng tay đo',
        credentialHash: 'hash-demo',
        status: 'active',
        firmwareVersion: '0.1.0-demo',
        lastSeenAt: new Date(),
      })
      .returning();
    const device = deviceRows[0];
    if (!device) throw new Error('Không tạo được device.');
    const assignmentRows = await ctx.db
      .insert(deviceAssignments)
      .values({ deviceId: device.id, subjectId: subject.id, assignedByUserId: owner.session.user.id })
      .returning();
    const assignment = assignmentRows[0];
    if (!assignment) throw new Error('Không tạo được assignment.');

    const nowMs = Date.now();
    const validMeasuredAt = [nowMs - 180_000, nowMs - 120_000, nowMs - 60_000].map(
      (value) => new Date(value),
    );
    const validHeartRates = [72, 75, 78];
    for (let index = 0; index < validHeartRates.length; index += 1) {
      await insertTelemetryRow(ctx, device.id, assignment.id, {
        measuredAt: validMeasuredAt[index]!,
        sequence: index,
        heartRateBpm: validHeartRates[index]!,
        stepsSinceBoot: 10 * (index + 1),
        batteryPercent: [60, 57, 55][index]!,
      });
    }
    // Mẫu bị cách ly: không được làm sai chart/metric/pin/"mới nhất".
    await insertTelemetryRow(ctx, device.id, assignment.id, {
      measuredAt: new Date(nowMs - 30_000),
      sequence: 10,
      heartRateBpm: 200,
      stepsSinceBoot: 9999,
      batteryPercent: 100,
      isQuarantined: true,
    });
    // Mẫu chưa bị cách ly nhưng ở tương lai: chỉ được đọc khi thời gian thật đi qua.
    await insertTelemetryRow(ctx, device.id, assignment.id, {
      measuredAt: new Date(nowMs + 3 * 3600 * 1000),
      sequence: 11,
      heartRateBpm: 199,
      stepsSinceBoot: 8888,
      batteryPercent: 99,
    });
    // Dữ liệu cũ `clock_status='unsynced'` có measured_at: giờ đo không tin cậy.
    await insertTelemetryRow(ctx, device.id, assignment.id, {
      measuredAt: new Date(nowMs - 45_000),
      sequence: 12,
      heartRateBpm: 150,
      stepsSinceBoot: 7777,
      batteryPercent: 90,
      clockStatus: 'unsynced',
    });

    const created = await createView(owner.agent, {
      key: 'view-cach-ly',
      name: 'View cách ly',
      scope: 'subject',
      subjectId: subject.id,
      config: makeConfig(DEFAULT_WIDGETS),
    });
    expect(created.status).toBe(201);
    const createdBody = created.body as ViewBody;
    const viewId = createdBody.id;
    const published = await owner.agent
      .post(`/api/v1/workspace-views/${viewId}/publications`)
      .set('Origin', TEST_ORIGIN)
      .send({
        draftRevision: createdBody.draftRevision,
        digest: createdBody.draftDigest,
        baseRevision: 0,
        note: 'Công bố view cách ly',
      });
    expect(published.status).toBe(201);

    const dataRes = await owner.agent
      .get(`/api/v1/workspace-views/${viewId}/data`)
      .set('Origin', TEST_ORIGIN);
    expect(dataRes.status).toBe(200);
    const lastValidIso = validMeasuredAt[2]!.toISOString();
    expect(dataRes.body.data.metrics).toMatchObject({
      heartRateBpm: 78,
      measuredAt: lastValidIso,
    });
    expect(dataRes.body.data.series.map((point: { heartRateBpm: number }) => point.heartRateBpm)).toEqual([
      72, 75, 78,
    ]);
    expect(dataRes.body.data.summary).toMatchObject({
      heartRateAvg: 75,
      heartRateMin: 72,
      heartRateMax: 78,
      lastSeenAt: lastValidIso,
    });
    expect(dataRes.body.data.devices).toHaveLength(1);
    expect(dataRes.body.data.devices[0]).toMatchObject({
      online: true,
      freshness: 'stale',
      batteryPercent: 55,
    });

    // Preview dùng chung đường đọc nên cũng không thấy mẫu bị loại.
    const previewRes = await owner.agent
      .post(`/api/v1/workspace-views/${viewId}/previews`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 1, previewSubjectId: subject.id });
    expect(previewRes.status).toBe(200);
    expect(previewRes.body.data.metrics.heartRateBpm).toBe(78);
    expect(previewRes.body.data.series).toHaveLength(3);
  });

  it('T11: mọi mẫu đều bị loại → data rỗng đúng hợp đồng, không bịa 0/giá trị trung bình', async () => {
    const subject = await createSubject(ctx, owner.session.user.id, 'Bà Studio Không Dữ Liệu');
    const deviceRows = await ctx.db
      .insert(devices)
      .values({
        serial: nextSerial(),
        label: 'Vòng tay đo',
        credentialHash: 'hash-demo',
        status: 'active',
        firmwareVersion: '0.1.0-demo',
        lastSeenAt: new Date(),
      })
      .returning();
    const device = deviceRows[0];
    if (!device) throw new Error('Không tạo được device.');
    const assignmentRows = await ctx.db
      .insert(deviceAssignments)
      .values({ deviceId: device.id, subjectId: subject.id, assignedByUserId: owner.session.user.id })
      .returning();
    const assignment = assignmentRows[0];
    if (!assignment) throw new Error('Không tạo được assignment.');

    const nowMs = Date.now();
    await insertTelemetryRow(ctx, device.id, assignment.id, {
      measuredAt: new Date(nowMs - 60_000),
      sequence: 1,
      heartRateBpm: 200,
      stepsSinceBoot: 9999,
      batteryPercent: 100,
      isQuarantined: true,
    });
    await insertTelemetryRow(ctx, device.id, assignment.id, {
      measuredAt: new Date(nowMs + 3 * 3600 * 1000),
      sequence: 2,
      heartRateBpm: 199,
      stepsSinceBoot: 8888,
      batteryPercent: 99,
    });
    await insertTelemetryRow(ctx, device.id, assignment.id, {
      measuredAt: new Date(nowMs - 45_000),
      sequence: 3,
      heartRateBpm: 150,
      stepsSinceBoot: 7777,
      batteryPercent: 90,
      clockStatus: 'unsynced',
    });

    const created = await createView(owner.agent, {
      key: 'view-khong-du-lieu',
      name: 'View không dữ liệu',
      scope: 'subject',
      subjectId: subject.id,
      config: makeConfig(DEFAULT_WIDGETS),
    });
    expect(created.status).toBe(201);
    const createdBody = created.body as ViewBody;
    const viewId = createdBody.id;
    const published = await owner.agent
      .post(`/api/v1/workspace-views/${viewId}/publications`)
      .set('Origin', TEST_ORIGIN)
      .send({
        draftRevision: createdBody.draftRevision,
        digest: createdBody.draftDigest,
        baseRevision: 0,
        note: 'Công bố view không dữ liệu',
      });
    expect(published.status).toBe(201);

    const dataRes = await owner.agent
      .get(`/api/v1/workspace-views/${viewId}/data`)
      .set('Origin', TEST_ORIGIN);
    expect(dataRes.status).toBe(200);
    expect(dataRes.body.data.sample).toBe(false);
    expect(dataRes.body.data.metrics).toBeNull();
    expect(dataRes.body.data.series).toEqual([]);
    expect(dataRes.body.data.summary).toMatchObject({
      heartRateAvg: null,
      heartRateMin: null,
      heartRateMax: null,
      lastSeenAt: null,
      alertsTotal: 0,
    });
    expect(dataRes.body.data.devices).toHaveLength(1);
    expect(dataRes.body.data.devices[0]).toMatchObject({
      online: true,
      freshness: 'stale',
      batteryPercent: null,
    });
  });

  it('T10: data endpoint — draft mới hơn active và sau rollback luôn trả config/digest của publication active cho owner và caregiver', async () => {
    const subject = await createSubject(ctx, owner.session.user.id, 'Bà Tám');
    await seedDeviceWithTelemetry(ctx, owner, subject.id, [70, 75, 80]);
    const caregiver = await registerUser(ctx.app, { displayName: 'Người xem bà Tám' });
    await shareSubject(ctx, owner, subject.id, caregiver);

    const configA = makeConfig([{ id: 'hr', type: 'metric', title: 'Nhịp tim QA', span: 1 }]);
    const created = await createView(owner.agent, {
      key: 'view-data-active',
      name: 'View data active',
      scope: 'subject',
      subjectId: subject.id,
      config: configA,
    });
    expect(created.status).toBe(201);
    const viewId = (created.body as ViewBody).id;
    const digestA = (created.body as ViewBody).draftDigest as string;

    const publishA = await owner.agent
      .post(`/api/v1/workspace-views/${viewId}/publications`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 1, digest: digestA, baseRevision: 0, note: 'Bản A' });
    expect(publishA.status).toBe(201);
    const publicationAId = publishA.body.publication.id as string;

    // Bản B được công bố → active r2.
    const configB = makeConfig([{ id: 'hr', type: 'metric', title: 'Nhịp tim QA lần 2', span: 1 }]);
    const updateB = await owner.agent
      .put(`/api/v1/workspace-views/${viewId}/draft`)
      .set('Origin', TEST_ORIGIN)
      .send({ config: configB, baseRevision: 1 });
    expect(updateB.status).toBe(200);
    const digestB = (updateB.body as ViewBody).draftDigest as string;
    const publishB = await owner.agent
      .post(`/api/v1/workspace-views/${viewId}/publications`)
      .set('Origin', TEST_ORIGIN)
      .send({ draftRevision: 2, digest: digestB, baseRevision: 1, note: 'Bản B' });
    expect(publishB.status).toBe(201);
    const publicationBId = publishB.body.publication.id as string;

    // Bản C mới hơn active nhưng chưa công bố.
    const configC = makeConfig([{ id: 'hr', type: 'metric', title: 'Nhịp tim QA lần 3', span: 1 }]);
    const updateC = await owner.agent
      .put(`/api/v1/workspace-views/${viewId}/draft`)
      .set('Origin', TEST_ORIGIN)
      .send({ config: configC, baseRevision: 2 });
    expect(updateC.status).toBe(200);
    const digestC = (updateC.body as ViewBody).draftDigest as string;
    expect(digestC).not.toBe(digestB);

    // Owner: GET view vẫn thấy draft C, nhưng /data chỉ trả bản công bố active r2 (B).
    const ownerView = await owner.agent
      .get(`/api/v1/workspace-views/${viewId}`)
      .set('Origin', TEST_ORIGIN);
    expect(ownerView.body.draftDigest).toBe(digestC);

    const ownerDataDraft = await owner.agent
      .get(`/api/v1/workspace-views/${viewId}/data`)
      .set('Origin', TEST_ORIGIN);
    expect(ownerDataDraft.status).toBe(200);
    expect(ownerDataDraft.body.config.widgets[0].title).toBe('Nhịp tim QA lần 2');
    expect(JSON.stringify(ownerDataDraft.body.config)).not.toContain('lần 3');
    expect(ownerDataDraft.body.digest).toBe(digestB);
    expect(ownerDataDraft.body.view.currentPublication).toMatchObject({
      id: publicationBId,
      revision: 2,
      digest: digestB,
      status: 'active',
    });
    expect(ownerDataDraft.body.view.draftDigest).toBeNull();

    // Caregiver (viewer) cũng thấy đúng bản active, không phải draft.
    const caregiverDataDraft = await caregiver.agent
      .get(`/api/v1/workspace-views/${viewId}/data`)
      .set('Origin', TEST_ORIGIN);
    expect(caregiverDataDraft.status).toBe(200);
    expect(caregiverDataDraft.body.config).toEqual(ownerDataDraft.body.config);
    expect(caregiverDataDraft.body.digest).toBe(digestB);

    // Rollback về bản A → publication mới r3 giữ config A; draft C vẫn còn nhưng
    // /data phải trả config A, không phải draft.
    const rollback = await owner.agent
      .post(`/api/v1/workspace-views/${viewId}/rollback`)
      .set('Origin', TEST_ORIGIN)
      .send({ publicationId: publicationAId, note: 'Quay lại bản A' });
    expect(rollback.status).toBe(201);
    expect(rollback.body.publication.revision).toBe(3);
    expect(rollback.body.publication.digest).toBe(digestA);
    expect(rollback.body.publication.status).toBe('active');

    const ownerDataRollback = await owner.agent
      .get(`/api/v1/workspace-views/${viewId}/data`)
      .set('Origin', TEST_ORIGIN);
    expect(ownerDataRollback.status).toBe(200);
    expect(ownerDataRollback.body.config.widgets[0].title).toBe('Nhịp tim QA');
    expect(JSON.stringify(ownerDataRollback.body.config)).not.toContain('lần');
    expect(ownerDataRollback.body.digest).toBe(digestA);
    expect(ownerDataRollback.body.view.currentPublication.revision).toBe(3);
    expect(ownerDataRollback.body.view.currentPublication.digest).toBe(digestA);

    const caregiverDataRollback = await caregiver.agent
      .get(`/api/v1/workspace-views/${viewId}/data`)
      .set('Origin', TEST_ORIGIN);
    expect(caregiverDataRollback.status).toBe(200);
    expect(caregiverDataRollback.body.config.widgets[0].title).toBe('Nhịp tim QA');
    expect(caregiverDataRollback.body.digest).toBe(digestA);
    expect(caregiverDataRollback.body.view.currentPublication.revision).toBe(3);
  });
});