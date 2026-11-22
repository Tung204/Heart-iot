import request from 'supertest';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { and, asc, count, eq } from 'drizzle-orm';
import type { PolicyValue } from '@heart-iot/contracts/policies';
import {
  createModuleTestApp,
  createAdmin,
  registerUser,
  TEST_ORIGIN,
  type TestContext,
  type TestUser,
} from './test-app';
import { AdminModule } from '../src/admin/admin.module';
import { computePolicyPreviewDigest } from '../src/admin/admin.service';
import { PolicyModule } from '../src/policy/policy.module';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import {
  auditLogs,
  deviceAssignments,
  devices,
  incidents,
  maintenanceTasks,
  notificationOutbox,
  policyConfigs,
  sessions,
  subjects,
} from '../src/database/schema';

/**
 * Admin (wave 3 be-admin): users list/status (disable revoke session, không tự
 * disable), audit list (chỉ admin, filter, cursor), policy get/preview/publish
 * (CAS, không ghi ở preview, rollback bằng publish lại), overview.
 */

@Module({
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
class TestFiltersModule {}

let serialCounter = 0;
const nextSerial = () => `AD-${String(++serialCounter).padStart(4, '0')}`;
const nextKey = () => `dedupe-${crypto.randomUUID()}`;

const BASE_POLICY: PolicyValue = {
  heartbeatIntervalSeconds: 15,
  offlineAfterSeconds: 45,
  dataFreshAfterSeconds: 30,
  lateEventMinutes: 5,
  maxTelemetryPerMinute: 240,
};

function policyWith(patch: Partial<PolicyValue>): PolicyValue {
  return { ...BASE_POLICY, ...patch };
}

const POLICY_PATH = '/api/v1/admin/policies/device_runtime';

/** POST preview với phiên bản nền do người vận hành đang xem. */
function previewPolicy(actor: TestUser, value: PolicyValue, expectedVersion: number) {
  return actor.agent
    .post(`${POLICY_PATH}/previews`)
    .set('Origin', TEST_ORIGIN)
    .send({ value, expectedVersion });
}

/** PUT publish — body tùy ý để kiểm cả trường hợp thiếu/lệch digest. */
function publishPolicy(actor: TestUser, body: Record<string, unknown>) {
  return actor.agent.put(POLICY_PATH).set('Origin', TEST_ORIGIN).send(body);
}

async function readPolicy(actor: TestUser) {
  return actor.agent.get(POLICY_PATH).set('Origin', TEST_ORIGIN);
}

describe('Admin (wave 3 be-admin)', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let regular1: TestUser;
  let regular2: TestUser;
  let toDisable: TestUser;
  let subjectId: string;

  beforeAll(async () => {
    ctx = await createModuleTestApp([PolicyModule, AdminModule, TestFiltersModule]);
    admin = await createAdmin(ctx.app, { email: 'quan-tri-vien@example.test' });
    regular1 = await registerUser(ctx.app, { displayName: 'Người dùng thường A' });
    regular2 = await registerUser(ctx.app, { displayName: 'Người dùng thường B' });
    toDisable = await registerUser(ctx.app, { displayName: 'Tài khoản sắp khóa' });

    const subjectRows = await ctx.db
      .insert(subjects)
      .values({ ownerUserId: regular1.session.user.id, displayName: 'Hồ sơ tổng quan', timezone: 'Asia/Ho_Chi_Minh' })
      .returning();
    subjectId = subjectRows[0]!.id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  // Policy động là state toàn cục; reset trước mỗi test để T4/T5/T5b/T5c/T7
  // không phụ thuộc test nào đã publish trước đó.
  beforeEach(async () => {
    await ctx.db.delete(policyConfigs);
    await ctx.db.delete(auditLogs).where(eq(auditLogs.action, 'policy.publish'));
  });

  // ---------------------------------------------------------------------------
  // Người dùng
  // ---------------------------------------------------------------------------

  test('T1 (FR-11): admin xem danh sách user; user thường 403; không lộ hash/session', async () => {
    const forbidden = await regular1.agent.get('/api/v1/admin/users').set('Origin', TEST_ORIGIN);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    const res = await admin.agent.get('/api/v1/admin/users').set('Origin', TEST_ORIGIN);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    const ids = res.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(regular1.session.user.id);
    expect(ids).toContain(admin.session.user.id);

    for (const item of res.body.items as Record<string, unknown>[]) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('email');
      expect(item).toHaveProperty('displayName');
      expect(item).toHaveProperty('role');
      expect(item).toHaveProperty('status');
      expect(item).toHaveProperty('createdAt');
      expect(Object.keys(item).sort()).toEqual(
        ['createdAt', 'displayName', 'email', 'id', 'role', 'status'].sort(),
      );
    }
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('tokenHash');
    expect(raw).not.toContain('credentialHash');

    // Tìm kiếm theo tên hiển thị + lọc theo status.
    const search = await admin.agent
      .get(`/api/v1/admin/users?query=${encodeURIComponent('sắp khóa')}`)
      .set('Origin', TEST_ORIGIN);
    expect(search.status).toBe(200);
    expect(search.body.items.map((item: { id: string }) => item.id)).toEqual([
      toDisable.session.user.id,
    ]);

    const activeOnly = await admin.agent
      .get('/api/v1/admin/users?status=active')
      .set('Origin', TEST_ORIGIN);
    expect(activeOnly.status).toBe(200);
    expect(activeOnly.body.items.every((item: { status: string }) => item.status === 'active')).toBe(true);
  });

  test('T2 (FR-11): disable revoke session ngay + audit; không tự disable; enable lại', async () => {
    // Phiên cũ còn hoạt động trước khi khóa.
    const before = await toDisable.agent.get('/api/v1/me').set('Origin', TEST_ORIGIN);
    expect(before.status).toBe(200);

    const disable = await admin.agent
      .patch(`/api/v1/admin/users/${toDisable.session.user.id}/status`)
      .set('Origin', TEST_ORIGIN)
      .send({ status: 'disabled', reason: 'Nghi ngờ xâm nhập.' });
    expect(disable.status).toBe(200);
    expect(disable.body.status).toBe('disabled');

    // Mọi session đã bị revoke trong cùng transaction.
    const sessionRows = await ctx.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, toDisable.session.user.id));
    expect(sessionRows.length).toBeGreaterThan(0);
    expect(sessionRows.every((row) => row.revokedAt !== null)).toBe(true);

    // Request cũ 401 ngay.
    const after = await toDisable.agent.get('/api/v1/me').set('Origin', TEST_ORIGIN);
    expect(after.status).toBe(401);
    expect(after.body.code).toBe('UNAUTHENTICATED');

    // Đăng nhập lại cũng bị chặn vì tài khoản disabled.
    const relogin = await request.agent(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ email: toDisable.email, password: toDisable.password });
    expect(relogin.status).toBe(403);

    // Không tự disable chính mình.
    const selfDisable = await admin.agent
      .patch(`/api/v1/admin/users/${admin.session.user.id}/status`)
      .set('Origin', TEST_ORIGIN)
      .send({ status: 'disabled' });
    expect(selfDisable.status).toBe(409);

    // Enable lại: có audit, không tạo session mới.
    const sessionCountBefore = sessionRows.length;
    const enable = await admin.agent
      .patch(`/api/v1/admin/users/${toDisable.session.user.id}/status`)
      .set('Origin', TEST_ORIGIN)
      .send({ status: 'active', reason: 'Xác minh xong.' });
    expect(enable.status).toBe(200);
    expect(enable.body.status).toBe('active');
    const sessionRowsAfter = await ctx.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, toDisable.session.user.id));
    expect(sessionRowsAfter.length).toBe(sessionCountBefore);

    // Trạng thái không đổi → 409.
    const again = await admin.agent
      .patch(`/api/v1/admin/users/${toDisable.session.user.id}/status`)
      .set('Origin', TEST_ORIGIN)
      .send({ status: 'active' });
    expect(again.status).toBe(409);

    // Audit có đủ bản ghi disable + enable.
    const auditRows = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.targetId, toDisable.session.user.id));
    const actions = new Set(auditRows.map((row) => row.action));
    expect(actions.has('admin.user.disable')).toBe(true);
    expect(actions.has('admin.user.enable')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Audit
  // ---------------------------------------------------------------------------

  test('T3 (FR-11): audit list chỉ admin, filter action/actor, cursor phân trang, metadata nguyên bản', async () => {
    const now = Date.now();
    const actorId = regular1.session.user.id;
    const seeded = [];
    for (let index = 0; index < 3; index += 1) {
      const rows = await ctx.db
        .insert(auditLogs)
        .values({
          actorUserId: actorId,
          actorKind: 'user',
          action: `seed.audit.${index % 2}`,
          targetType: 'seed_target',
          targetId: `seed-target-${index}`,
          outcome: 'success',
          metadata: { index, label: `mục ${index}` },
          createdAt: new Date(now - index * 60_000),
        })
        .returning();
      seeded.push(rows[0]!.id);
    }

    const forbidden = await regular1.agent.get('/api/v1/admin/audit').set('Origin', TEST_ORIGIN);
    expect(forbidden.status).toBe(403);

    const byAction = await admin.agent
      .get('/api/v1/admin/audit?action=seed.audit.0')
      .set('Origin', TEST_ORIGIN);
    expect(byAction.status).toBe(200);
    expect(byAction.body.items.length).toBe(2);
    for (const item of byAction.body.items as Array<Record<string, unknown>>) {
      expect(item.action).toBe('seed.audit.0');
      expect(item.actorUserId).toBe(actorId);
      const metadata = item.metadata as { index: number; label: string };
      expect(typeof metadata.index).toBe('number');
      expect(typeof metadata.label).toBe('string');
    }

    const byActor = await admin.agent
      .get(`/api/v1/admin/audit?actorUserId=${actorId}&targetType=seed_target`)
      .set('Origin', TEST_ORIGIN);
    expect(byActor.status).toBe(200);
    expect(byActor.body.items.length).toBe(3);

    // Phân trang cursor (createdAt,id) desc.
    const page1 = await admin.agent
      .get('/api/v1/admin/audit?targetType=seed_target&limit=2')
      .set('Origin', TEST_ORIGIN);
    expect(page1.status).toBe(200);
    expect(page1.body.items.length).toBe(2);
    expect(page1.body.nextCursor).not.toBeNull();
    expect(page1.body.items[0].metadata.index).toBe(0);

    const page2 = await admin.agent
      .get(`/api/v1/admin/audit?targetType=seed_target&limit=2&cursor=${page1.body.nextCursor}`)
      .set('Origin', TEST_ORIGIN);
    expect(page2.status).toBe(200);
    expect(page2.body.items.length).toBe(1);
    const page1Ids = page1.body.items.map((item: { id: number }) => item.id);
    const page2Ids = page2.body.items.map((item: { id: number }) => item.id);
    expect(page1Ids.some((id: number) => page2Ids.includes(id))).toBe(false);
    expect([...page1Ids, ...page2Ids].sort((a: number, b: number) => b - a)).toEqual(
      [...seeded].sort((a, b) => b - a),
    );

    // Lọc theo khoảng thời gian: from sau bản ghi cũ nhất → không thấy bản cũ.
    const from = new Date(now - 90_000).toISOString();
    const byRange = await admin.agent
      .get(`/api/v1/admin/audit?targetType=seed_target&from=${from}`)
      .set('Origin', TEST_ORIGIN);
    expect(byRange.status).toBe(200);
    expect(byRange.body.items.length).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Policy động
  // ---------------------------------------------------------------------------

  test('T4 (FR-13): preview validate không ghi DB; digest gắn value + version nền; value sai 422; warning đúng cặp ngưỡng', async () => {
    const before = await ctx.db.select({ total: count() }).from(policyConfigs);

    const previewValue = policyWith({ heartbeatIntervalSeconds: 20 });
    const preview = await previewPolicy(admin, previewValue, 0);
    expect(preview.status).toBe(200);
    expect(preview.body.valid).toBe(true);
    expect(preview.body.value.heartbeatIntervalSeconds).toBe(20);
    expect(preview.body.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(preview.body.expectedVersion).toBe(0);
    expect(preview.body.effectiveDiff).toEqual([
      { field: 'heartbeatIntervalSeconds', from: 15, to: 20 },
    ]);
    // Chỉ trả các trường đã công bố của policy; digest là sha256 của canonical value
    // + version nền nên đổi version nền là đổi digest.
    expect(Object.keys(preview.body as Record<string, unknown>).sort()).toEqual(
      ['digest', 'effectiveDiff', 'expectedVersion', 'valid', 'value', 'warnings'].sort(),
    );
    expect(preview.body.digest).toBe(computePolicyPreviewDigest(previewValue, 0));
    expect(preview.body.digest).not.toBe(computePolicyPreviewDigest(previewValue, 1));
    const repeated = await previewPolicy(admin, previewValue, 0);
    expect(repeated.status).toBe(200);
    expect(repeated.body.digest).toBe(preview.body.digest);

    const after = await ctx.db.select({ total: count() }).from(policyConfigs);
    expect(after[0]?.total).toBe(before[0]?.total);

    // Bản nền lệch bản active → 409, không ghi DB.
    const staleBase = await previewPolicy(admin, previewValue, 1);
    expect(staleBase.status).toBe(409);
    expect(staleBase.body.code).toBe('APPROVAL_STALE');
    expect(staleBase.body.details.reason).toBe('version_mismatch');
    expect(staleBase.body.details.currentVersion).toBe(0);

    // Giá trị sai → 422.
    const invalid = await previewPolicy(admin, policyWith({ heartbeatIntervalSeconds: 4 }), 0);
    expect(invalid.status).toBe(422);
    expect(invalid.body.code).toBe('VALIDATION_FAILED');

    // Cảnh báo theo cặp ngưỡng.
    const warnOffline = await previewPolicy(
      admin,
      policyWith({ heartbeatIntervalSeconds: 60, offlineAfterSeconds: 30 }),
      0,
    );
    expect(warnOffline.status).toBe(200);
    expect(warnOffline.body.warnings.join('\n')).toContain('offlineAfterSeconds');

    const warnFresh = await previewPolicy(
      admin,
      policyWith({ offlineAfterSeconds: 45, dataFreshAfterSeconds: 120 }),
      0,
    );
    expect(warnFresh.status).toBe(200);
    expect(warnFresh.body.warnings.join('\n')).toContain('dataFreshAfterSeconds');

    const warnLow = await previewPolicy(admin, policyWith({ maxTelemetryPerMinute: 5 }), 0);
    expect(warnLow.status).toBe(200);
    expect(warnLow.body.warnings.join('\n')).toContain('quá thấp');

    const warnHigh = await previewPolicy(admin, policyWith({ maxTelemetryPerMinute: 5000 }), 0);
    expect(warnHigh.status).toBe(200);
    expect(warnHigh.body.warnings.join('\n')).toContain('quá cao');

    const notAdmin = await previewPolicy(regular1, BASE_POLICY, 0);
    expect(notAdmin.status).toBe(403);

    const afterAll = await ctx.db.select({ total: count() }).from(policyConfigs);
    expect(afterAll[0]?.total).toBe(before[0]?.total);
  });

  test('T5 (FR-13): publish CAS — version lệch 409; archive bản cũ; audit; history; rollback', async () => {
    // Trạng thái đầu: chưa có bản DB → active là default version 0.
    const initial = await admin.agent
      .get('/api/v1/admin/policies/device_runtime')
      .set('Origin', TEST_ORIGIN);
    expect(initial.status).toBe(200);
    expect(initial.body.key).toBe('device_runtime');
    expect(initial.body.active.version).toBe(0);
    expect(initial.body.active.source).toBe('default');
    expect(initial.body.defaults.heartbeatIntervalSeconds).toBe(15);
    expect(Array.isArray(initial.body.history)).toBe(true);

    const v1 = policyWith({ heartbeatIntervalSeconds: 20 });
    const v30 = policyWith({ heartbeatIntervalSeconds: 30 });
    // Preview cho cả hai giá trị trên cùng bản nền v0 (trước khi publish v1).
    const previewV1 = await previewPolicy(admin, v1, 0);
    const previewV30 = await previewPolicy(admin, v30, 0);
    expect(previewV1.status).toBe(200);
    expect(previewV30.status).toBe(200);

    const publish1 = await publishPolicy(admin, {
      value: v1,
      expectedVersion: 0,
      previewDigest: previewV1.body.digest,
    });
    expect(publish1.status).toBe(200);
    expect(publish1.body.version).toBe(1);
    expect(publish1.body.status).toBe('active');
    expect(publish1.body.digest).toMatch(/^[0-9a-f]{64}$/);

    const after1 = await admin.agent
      .get('/api/v1/admin/policies/device_runtime')
      .set('Origin', TEST_ORIGIN);
    expect(after1.body.active.version).toBe(1);
    expect(after1.body.active.source).toBe('database');
    expect(after1.body.active.value.heartbeatIntervalSeconds).toBe(20);
    expect(after1.body.history.length).toBe(1);
    expect(after1.body.history[0].version).toBe(1);

    // Version lệch → 409 APPROVAL_STALE kèm currentVersion/currentDigest (digest vẫn khớp
    // bản preview ở v0 nên lỗi đến từ CAS version).
    const stale = await publishPolicy(admin, {
      value: v30,
      expectedVersion: 0,
      previewDigest: previewV30.body.digest,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('APPROVAL_STALE');
    expect(stale.body.details.reason).toBe('version_mismatch');
    expect(stale.body.details.currentVersion).toBe(1);
    expect(stale.body.details.currentDigest).toBe(publish1.body.digest);

    // Publish v2 thành công → v1 bị archive (retired), không xóa.
    const previewV2 = await previewPolicy(admin, v30, 1);
    expect(previewV2.status).toBe(200);
    expect(previewV2.body.effectiveDiff).toEqual([
      { field: 'heartbeatIntervalSeconds', from: 20, to: 30 },
    ]);
    const publish2 = await publishPolicy(admin, {
      value: v30,
      expectedVersion: 1,
      previewDigest: previewV2.body.digest,
      note: 'Tăng tần suất nhịp tim.',
    });
    expect(publish2.status).toBe(200);
    expect(publish2.body.version).toBe(2);
    expect(publish2.body.note).toBe('Tăng tần suất nhịp tim.');

    const rows = await ctx.db
      .select()
      .from(policyConfigs)
      .where(eq(policyConfigs.key, 'device_runtime'))
      .orderBy(asc(policyConfigs.version));
    expect(rows.length).toBe(2);
    expect(rows.find((row) => row.version === 1)?.status).toBe('retired');
    expect(rows.find((row) => row.version === 2)?.status).toBe('active');

    // Audit policy.publish (success) không chứa value đầy đủ; 409 ở trên đã ghi conflict.
    const auditRows = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'policy.publish'));
    const successRows = auditRows.filter((row) => row.outcome === 'success');
    expect(successRows.length).toBe(2);
    for (const row of successRows) {
      const metadata = row.metadata as Record<string, unknown>;
      expect(metadata['key']).toBe('device_runtime');
      expect(typeof metadata['version']).toBe('number');
      expect(typeof metadata['digest']).toBe('string');
      expect(metadata['value']).toBeUndefined();
      expect(JSON.stringify(metadata)).not.toContain('heartbeatIntervalSeconds');
    }
    expect(auditRows.some((row) => row.outcome === 'conflict')).toBe(true);

    // History giữ 2 bản, rollback = publish lại value cũ với version mới.
    const after2 = await admin.agent
      .get('/api/v1/admin/policies/device_runtime')
      .set('Origin', TEST_ORIGIN);
    expect(after2.body.active.version).toBe(2);
    expect(after2.body.history.length).toBe(2);

    const previewRollback = await previewPolicy(admin, v1, 2);
    expect(previewRollback.status).toBe(200);
    const rollback = await publishPolicy(admin, {
      value: v1,
      expectedVersion: 2,
      previewDigest: previewRollback.body.digest,
      note: 'Rollback về v1.',
    });
    expect(rollback.status).toBe(200);
    expect(rollback.body.version).toBe(3);

    const after3 = await admin.agent
      .get('/api/v1/admin/policies/device_runtime')
      .set('Origin', TEST_ORIGIN);
    expect(after3.body.active.version).toBe(3);
    expect(after3.body.active.value.heartbeatIntervalSeconds).toBe(20);
    expect(after3.body.history.length).toBe(3);
    const rowsAfterRollback = await ctx.db
      .select()
      .from(policyConfigs)
      .where(eq(policyConfigs.key, 'device_runtime'));
    expect(rowsAfterRollback.length).toBe(3);

    // Key không hỗ trợ → 404.
    const unknown = await admin.agent
      .get('/api/v1/admin/policies/khong-co-key-nay')
      .set('Origin', TEST_ORIGIN);
    expect(unknown.status).toBe(404);
  });

  test('T5b (FR-13): publish thiếu previewDigest → 409, không ghi policy, audit conflict không lộ value', async () => {
    const state = await readPolicy(admin);
    const currentVersion = state.body.active.version as number;
    const before = await ctx.db.select({ total: count() }).from(policyConfigs);

    const missing = await publishPolicy(admin, {
      value: policyWith({ heartbeatIntervalSeconds: 22 }),
      expectedVersion: currentVersion,
    });
    expect(missing.status).toBe(409);
    expect(missing.body.code).toBe('APPROVAL_STALE');
    expect(missing.body.details.reason).toBe('preview_missing');
    expect(missing.body.message.toLowerCase()).toContain('nội dung đã thay đổi');
    expect(missing.body.message.toLowerCase()).toContain('xem lại preview');

    const after = await ctx.db.select({ total: count() }).from(policyConfigs);
    expect(after[0]?.total).toBe(before[0]?.total);
    const unchanged = await readPolicy(admin);
    expect(unchanged.body.active.version).toBe(currentVersion);
    expect(unchanged.body.active.value.heartbeatIntervalSeconds).toBe(
      state.body.active.value.heartbeatIntervalSeconds,
    );

    // Audit conflict chỉ có key/version nền/lý do — không có value hay secret.
    const conflicts = (
      await ctx.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, 'policy.publish'))
        .orderBy(asc(auditLogs.id))
    ).filter((row) => row.outcome === 'conflict');
    expect(conflicts.length).toBeGreaterThan(0);
    const last = conflicts[conflicts.length - 1]!;
    expect(last.targetType).toBe('policy');
    expect(last.targetId).toBe('device_runtime');
    const metadata = last.metadata as Record<string, unknown>;
    expect(metadata['reason']).toBe('preview_missing');
    expect(metadata['expectedVersion']).toBe(currentVersion);
    expect(metadata['value']).toBeUndefined();
    expect(JSON.stringify(metadata)).not.toContain('heartbeatIntervalSeconds');
    expect(JSON.stringify(last)).not.toContain('credentialHash');
  });

  test('T5c (FR-13): preview cũ + value mới → 409 nội dung đã thay đổi; digest gắn version nền', async () => {
    const state = await readPolicy(admin);
    const currentVersion = state.body.active.version as number;
    const previewed = policyWith({ heartbeatIntervalSeconds: 40 });
    const preview = await previewPolicy(admin, previewed, currentVersion);
    expect(preview.status).toBe(200);
    expect(preview.body.expectedVersion).toBe(currentVersion);

    const before = await ctx.db.select({ total: count() }).from(policyConfigs);
    const changed = policyWith({ heartbeatIntervalSeconds: 45 });
    const res = await publishPolicy(admin, {
      value: changed,
      expectedVersion: currentVersion,
      previewDigest: preview.body.digest,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('APPROVAL_STALE');
    expect(res.body.details.reason).toBe('preview_mismatch');
    expect(res.body.message.toLowerCase()).toContain('nội dung đã thay đổi');
    expect(res.body.message.toLowerCase()).toContain('xem lại preview');

    const after = await ctx.db.select({ total: count() }).from(policyConfigs);
    expect(after[0]?.total).toBe(before[0]?.total);
    expect((await readPolicy(admin)).body.active.version).toBe(currentVersion);

    // Digest của value cũ không dùng được cho phiên bản nền khác.
    const replay = await publishPolicy(admin, {
      value: previewed,
      expectedVersion: currentVersion + 1,
      previewDigest: preview.body.digest,
    });
    expect(replay.status).toBe(409);
    expect(replay.body.details.reason).toBe('preview_mismatch');
  });

  // ---------------------------------------------------------------------------
  // Tổng quan
  // ---------------------------------------------------------------------------

  test('T6 (FR-11): overview đếm đúng fixture; user thường 403', async () => {
    // Seed fixture: 2 thiết bị (1 online, 1 offline), 1 incident mở, 1 task mở,
    // outbox 1 pending + 1 failed; 1 user disabled.
    const deviceRows = await ctx.db
      .insert(devices)
      .values([
        { serial: nextSerial(), label: 'Thiết bị online', credentialHash: 'hash', status: 'active', lastSeenAt: new Date() },
        { serial: nextSerial(), label: 'Thiết bị offline', credentialHash: 'hash', status: 'active', lastSeenAt: new Date(Date.now() - 2 * 3600_000) },
      ])
      .returning();
    const deviceOnline = deviceRows[0]!;
    await ctx.db.insert(deviceAssignments).values({
      deviceId: deviceOnline.id,
      subjectId,
      assignedByUserId: regular1.session.user.id,
    });

    const incidentRows = await ctx.db
      .insert(incidents)
      .values({
        subjectId,
        assignmentId: (await ctx.db.select({ id: deviceAssignments.id }).from(deviceAssignments).where(eq(deviceAssignments.deviceId, deviceOnline.id)).limit(1))[0]!.id,
        deviceId: deviceOnline.id,
        deviceIncidentId: nextKey(),
        type: 'fall',
        state: 'open',
        lastRevision: 1,
        detectedAt: new Date(),
      })
      .returning();
    const incidentId = incidentRows[0]!.id;

    await ctx.db.insert(maintenanceTasks).values({
      deviceId: deviceOnline.id,
      subjectId,
      kind: 'signal_check',
      title: 'Task mở cho overview',
      status: 'open',
      priority: 1,
      dedupeKey: nextKey(),
    });
    await ctx.db.insert(notificationOutbox).values([
      {
        incidentId,
        revision: 1,
        recipientUserId: regular1.session.user.id,
        channel: 'in_app',
        status: 'pending',
        attempts: 0,
        dedupeKey: nextKey(),
      },
      {
        incidentId,
        revision: 1,
        recipientUserId: regular1.session.user.id,
        channel: 'in_app',
        status: 'failed',
        attempts: 2,
        dedupeKey: nextKey(),
      },
    ]);
    // User riêng cho fixture overview: T2 sở hữu `toDisable` và có thể chạy trước/sau.
    const overviewDisabled = await registerUser(ctx.app, { displayName: 'Tài khoản khóa cho overview' });
    await admin.agent
      .patch(`/api/v1/admin/users/${overviewDisabled.session.user.id}/status`)
      .set('Origin', TEST_ORIGIN)
      .send({ status: 'disabled', reason: 'Fixture overview.' });

    const forbidden = await regular1.agent.get('/api/v1/admin/overview').set('Origin', TEST_ORIGIN);
    expect(forbidden.status).toBe(403);

    const res = await admin.agent.get('/api/v1/admin/overview').set('Origin', TEST_ORIGIN);
    expect(res.status).toBe(200);
    // Active: admin, regular1, regular2, toDisable; disabled: user riêng của fixture này.
    expect(res.body.users).toEqual({ active: 4, disabled: 1 });
    expect(res.body.subjects).toEqual({ total: 1 });
    expect(res.body.devices).toEqual({ online: 1, offline: 1 });
    expect(res.body.alerts).toEqual({ open: 1 });
    expect(res.body.tasks).toEqual({ open: 1 });
    expect(res.body.outbox).toEqual({ pending: 1, failed: 1 });
  });

  test('V12: preview retention chỉ admin, mặc định tắt và không xóa', async () => {
    const forbidden = await regular1.agent
      .get('/api/v1/admin/retention/preview')
      .set('Origin', TEST_ORIGIN);
    expect(forbidden.status).toBe(403);

    const res = await admin.agent
      .get('/api/v1/admin/retention/preview')
      .set('Origin', TEST_ORIGIN);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      enabled: false,
      configured: false,
      totalWouldDelete: 0,
    });
    expect(res.body.layers).toHaveLength(5);
    for (const layer of res.body.layers) {
      expect(layer).toMatchObject({ days: null, cutoff: null, wouldDelete: 0 });
    }
  });

  // ---------------------------------------------------------------------------
  // Đồng thời
  // ---------------------------------------------------------------------------

  test('T7 (FR-13): hai publish đồng thời → một thành công, một 409, đúng một active', async () => {
    const before = await admin.agent
      .get('/api/v1/admin/policies/device_runtime')
      .set('Origin', TEST_ORIGIN);
    const currentVersion = before.body.active.version as number;

    const valueA = policyWith({ heartbeatIntervalSeconds: 25 });
    const valueB = policyWith({ heartbeatIntervalSeconds: 35 });
    // Cả hai admin đều preview trên cùng bản nền hiện tại trước khi publish đồng thời.
    const previewA = await previewPolicy(admin, valueA, currentVersion);
    const previewB = await previewPolicy(admin, valueB, currentVersion);
    expect(previewA.status).toBe(200);
    expect(previewB.status).toBe(200);
    const [resultA, resultB] = await Promise.all([
      publishPolicy(admin, {
        value: valueA,
        expectedVersion: currentVersion,
        previewDigest: previewA.body.digest,
      }),
      publishPolicy(admin, {
        value: valueB,
        expectedVersion: currentVersion,
        previewDigest: previewB.body.digest,
      }),
    ]);

    const statuses = [resultA.status, resultB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);
    const failed = resultA.status === 409 ? resultA : resultB;
    expect(failed.body.code).toBe('APPROVAL_STALE');
    expect(['version_mismatch', 'publish_race']).toContain(failed.body.details.reason);

    const activeRows = await ctx.db
      .select()
      .from(policyConfigs)
      .where(and(eq(policyConfigs.key, 'device_runtime'), eq(policyConfigs.status, 'active')));
    expect(activeRows.length).toBe(1);
    expect(activeRows[0]!.version).toBe(currentVersion + 1);
    const ok = resultA.status === 200 ? resultA : resultB;
    expect(ok.body.version).toBe(activeRows[0]!.version);
  });
});
