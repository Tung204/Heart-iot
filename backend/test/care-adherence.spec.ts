import { eq } from 'drizzle-orm';
import { DEFAULT_CARE_PERMISSIONS, type CarePermissions } from '@heart-iot/contracts';
import { careAdherenceSchema, type CareAdherence } from '@heart-iot/contracts/reminders';
import {
  createAdmin,
  createModuleTestApp,
  registerUser,
  TEST_ORIGIN,
  type TestContext,
  type TestUser,
} from './test-app';
import { RemindersModule } from '../src/reminders/reminders.module';
import { MEASUREMENTS_NOT_SHARED_MESSAGE } from '../src/access/access.service';
import { addDays } from '../src/common/local-date';
import { localDateKey } from '../src/measurements/insights';
import {
  careLinks,
  careReminderPeriods,
  careReminders,
  subjects,
} from '../src/database/schema';
import { buildCareAdherence } from '../src/reminders/care-adherence';
import type { CareReminderRow } from '../src/database/schema';

const TZ = 'Asia/Ho_Chi_Minh';

function today(): string {
  return localDateKey(new Date(), TZ);
}

function reminderBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'medication',
    title: 'Uống thuốc huyết áp',
    note: null,
    times: ['00:00'],
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    startsOn: addDays(today(), -6),
    endsOn: null,
    active: true,
    ...overrides,
  };
}

describe('Tổng hợp tuân thủ chăm sóc (V9.1)', () => {
  let ctx: TestContext;
  let owner: TestUser;
  let caregiver: TestUser;
  let limitedCaregiver: TestUser;
  let outsider: TestUser;
  let admin: TestUser;
  let subjectId: string;

  beforeAll(async () => {
    ctx = await createModuleTestApp([RemindersModule]);
    owner = await registerUser(ctx.app, { displayName: 'Chủ hồ sơ' });
    caregiver = await registerUser(ctx.app, { displayName: 'Người thân xem số đo' });
    limitedCaregiver = await registerUser(ctx.app, { displayName: 'Người thân không xem số đo' });
    outsider = await registerUser(ctx.app, { displayName: 'Người ngoài' });
    admin = await createAdmin(ctx.app, { email: 'admin-adherence@example.test' });
    subjectId = await newSubject(owner.session.user.id, 'Bà An', TZ);
    await linkCaregiver(subjectId, caregiver.session.user.id, owner.session.user.id, {
      ...DEFAULT_CARE_PERMISSIONS,
    });
    await linkCaregiver(subjectId, limitedCaregiver.session.user.id, owner.session.user.id, {
      ...DEFAULT_CARE_PERMISSIONS,
      canViewMeasurements: false,
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  // Mỗi test tự tạo lịch riêng; xóa trước để chạy randomize không phụ thuộc thứ tự.
  beforeEach(async () => {
    await ctx.db.delete(careReminders).where(eq(careReminders.subjectId, subjectId));
  });

  async function newSubject(
    ownerUserId: string,
    displayName: string,
    timezone: string,
  ): Promise<string> {
    const rows = await ctx.db
      .insert(subjects)
      .values({ ownerUserId, displayName, timezone })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('Không tạo được hồ sơ kiểm thử.');
    return row.id;
  }

  async function linkCaregiver(
    targetSubjectId: string,
    caregiverUserId: string,
    ownerUserId: string,
    permissions: CarePermissions,
  ): Promise<void> {
    await ctx.db.insert(careLinks).values({
      subjectId: targetSubjectId,
      caregiverUserId,
      invitedByUserId: ownerUserId,
      permissions,
      status: 'active',
      sharedFrom: new Date(Date.now() - 20 * 24 * 3600 * 1000),
    });
  }

  function getAdherence(user: TestUser, targetSubjectId: string, days?: number) {
    const path = `/api/v1/subjects/${targetSubjectId}/care/adherence`;
    return user.agent
      .get(days === undefined ? path : `${path}?days=${days}`)
      .set('Origin', TEST_ORIGIN);
  }

  async function createReminder(overrides: Record<string, unknown> = {}) {
    const response = await owner.agent
      .post(`/api/v1/subjects/${subjectId}/reminders`)
      .set('Origin', TEST_ORIGIN)
      .send(reminderBody(overrides));
    expect(response.status).toBe(201);
    return response.body as { id: string };
  }

  async function complete(reminderId: string, date: string, status: 'done' | 'skipped') {
    return owner.agent
      .post(`/api/v1/subjects/${subjectId}/reminders/${reminderId}/completions`)
      .set('Origin', TEST_ORIGIN)
      .send({ date, time: '00:00', status });
  }

  it('tổng hợp 7 ngày: occurrence đã qua, done/skipped/pending và hai tỉ lệ', async () => {
    const reminder = await createReminder();
    const day1 = addDays(today(), -1);
    const day2 = addDays(today(), -2);
    const day3 = addDays(today(), -3);
    expect((await complete(reminder.id, day1, 'done')).status).toBe(200);
    expect((await complete(reminder.id, day2, 'done')).status).toBe(200);
    expect((await complete(reminder.id, day3, 'skipped')).status).toBe(200);

    const response = await getAdherence(owner, subjectId, 7);
    expect(response.status).toBe(200);
    const body: CareAdherence = careAdherenceSchema.parse(response.body);
    expect(body.days).toBe(7);
    expect(body.series).toHaveLength(7);
    expect(body.totals).toEqual({
      scheduled: 7,
      done: 2,
      skipped: 1,
      pending: 4,
      recordedPercent: 43,
      completionPercent: 67,
    });
    expect(body.reminders).toHaveLength(1);
    expect(body.reminders[0]).toMatchObject({
      reminderId: reminder.id,
      archived: false,
      scheduled: 7,
      done: 2,
      skipped: 1,
      pending: 4,
    });
    expect(body.from).toBe(addDays(today(), -6));
    expect(body.to).toBe(today());
  });

  it('caregiver có canViewMeasurements xem được; thiếu quyền 403; admin/ngoài 404', async () => {
    expect((await getAdherence(caregiver, subjectId, 7)).status).toBe(200);

    const limited = await getAdherence(limitedCaregiver, subjectId, 7);
    expect(limited.status).toBe(403);
    expect(limited.body.message).toBe(MEASUREMENTS_NOT_SHARED_MESSAGE);

    expect((await getAdherence(admin, subjectId, 7)).status).toBe(404);
    expect((await getAdherence(outsider, subjectId, 7)).status).toBe(404);
  });

  it('days mặc định 7, nhận 1..30, từ chối ngoài khoảng', async () => {
    expect((await getAdherence(owner, subjectId)).body.days).toBe(7);
    expect((await getAdherence(owner, subjectId, 1)).body.days).toBe(1);
    expect((await getAdherence(owner, subjectId, 30)).body.days).toBe(30);
    expect((await getAdherence(owner, subjectId, 0)).status).toBe(422);
    expect((await getAdherence(owner, subjectId, 31)).status).toBe(422);
  });

  it('lưu trữ giữ lịch sử trong tổng hợp và ẩn khỏi danh sách/hôm nay', async () => {
    const reminder = await createReminder();
    const yesterday = addDays(today(), -1);
    expect((await complete(reminder.id, yesterday, 'done')).status).toBe(200);

    const removed = await owner.agent
      .delete(`/api/v1/subjects/${subjectId}/reminders/${reminder.id}`)
      .set('Origin', TEST_ORIGIN);
    expect(removed.status).toBe(204);

    const list = await owner.agent
      .get(`/api/v1/subjects/${subjectId}/reminders`)
      .set('Origin', TEST_ORIGIN);
    expect(list.body.items.map((item: { id: string }) => item.id)).not.toContain(reminder.id);

    const response = await getAdherence(owner, subjectId, 7);
    expect(response.status).toBe(200);
    const archived = (response.body.reminders as CareAdherence['reminders']).find(
      (row) => row.reminderId === reminder.id,
    );
    expect(archived).toMatchObject({ archived: true, done: 1 });

    // Không sửa/đánh dấu lịch đã lưu trữ.
    const completeArchived = await complete(reminder.id, yesterday, 'done');
    expect(completeArchived.status).toBe(404);
  });

  it('tắt rồi bật lại không tạo khoảng trùng và không tính ngày đã tắt', async () => {
    const reminder = await createReminder({ startsOn: addDays(today(), -2) });
    const yesterday = addDays(today(), -1);
    expect((await complete(reminder.id, yesterday, 'done')).status).toBe(200);

    const off = await owner.agent
      .patch(`/api/v1/subjects/${subjectId}/reminders/${reminder.id}`)
      .set('Origin', TEST_ORIGIN)
      .send({ active: false });
    expect(off.status).toBe(200);
    const on = await owner.agent
      .patch(`/api/v1/subjects/${subjectId}/reminders/${reminder.id}`)
      .set('Origin', TEST_ORIGIN)
      .send({ active: true });
    expect(on.status).toBe(200);

    const periods = await ctx.db
      .select()
      .from(careReminderPeriods)
      .where(eq(careReminderPeriods.reminderId, reminder.id));
    expect(periods).toHaveLength(1);

    const response = await getAdherence(owner, subjectId, 7);
    const row = (response.body.reminders as CareAdherence['reminders']).find(
      (item) => item.reminderId === reminder.id,
    );
    // startsOn = hôm nay - 2 → 3 ngày (hôm nay -2, -1, hôm nay) đều trong khoảng đã mở lại.
    expect(row).toMatchObject({ scheduled: 3, done: 1 });
  });

  it('hồ sơ chưa có lịch trả chuỗi 0 và tỉ lệ null', async () => {
    const emptySubject = await newSubject(owner.session.user.id, 'Hồ sơ trống', TZ);
    const response = await getAdherence(owner, emptySubject, 7);
    expect(response.status).toBe(200);
    expect(response.body.totals).toEqual({
      scheduled: 0,
      done: 0,
      skipped: 0,
      pending: 0,
      recordedPercent: null,
      completionPercent: null,
    });
    expect(response.body.series).toHaveLength(7);
    expect(response.body.reminders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Hàm thuần: mốc tương lai, múi giờ, DST, khoảng hiệu lực
// ---------------------------------------------------------------------------

function row(overrides: Partial<CareReminderRow> = {}): CareReminderRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    kind: 'medication',
    title: 'Uống thuốc',
    note: null,
    times: ['08:00'],
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    startsOn: '2026-01-01',
    endsOn: null,
    active: true,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('buildCareAdherence — hàm thuần', () => {
  it('không tính occurrence tương lai trong hôm nay', () => {
    const input = {
      subjectId: row().subjectId,
      timezone: TZ,
      days: 1,
      now: new Date('2026-11-20T03:00:00.000Z'), // 10:00 Asia/Ho_Chi_Minh
      reminders: [row({ times: ['08:00', '20:00'] })],
      periods: [],
      completions: [],
    };
    const result = buildCareAdherence(input);
    expect(result.totals.scheduled).toBe(1);
    expect(result.totals.pending).toBe(1);
    expect(result.series[0]).toMatchObject({ scheduled: 1, pending: 1 });
  });

  it('tính ngày theo timezone hồ sơ (Tokyo qua nửa đêm UTC)', () => {
    const result = buildCareAdherence({
      subjectId: row().subjectId,
      timezone: 'Asia/Tokyo',
      days: 1,
      now: new Date('2026-11-20T16:30:00.000Z'), // 21/11 01:30 JST
      reminders: [row({ times: ['00:30'] })],
      periods: [],
      completions: [],
    });
    expect(result.to).toBe('2026-11-21');
    expect(result.series[0]).toMatchObject({ date: '2026-11-21', scheduled: 1, pending: 1 });
  });

  it('qua ngày đổi giờ DST vẫn giữ đúng số occurrence', () => {
    const result = buildCareAdherence({
      subjectId: row().subjectId,
      timezone: 'Europe/Paris',
      days: 3,
      now: new Date('2026-10-26T12:00:00.000Z'),
      reminders: [row({ startsOn: '2026-10-24' })],
      periods: [],
      completions: [],
    });
    // 24, 25 (trước đổi giờ), 26 (sau đổi giờ) — 08:00 mỗi ngày vẫn tính.
    expect(result.series.map((day) => day.scheduled)).toEqual([1, 1, 1]);
  });

  it('khoảng tắt/bật lại loại ngày không hiệu lực và giữ completion đúng ngày', () => {
    const result = buildCareAdherence({
      subjectId: row().subjectId,
      timezone: TZ,
      days: 5,
      now: new Date('2026-11-20T10:00:00.000Z'), // 17:00 Asia/Ho_Chi_Minh
      reminders: [row({ startsOn: '2026-11-16' })],
      periods: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          reminderId: row().id,
          activeFrom: '2026-11-16',
          activeTo: '2026-11-17',
          createdAt: new Date(),
        },
        {
          id: '33333333-3333-4333-8333-333333333333',
          reminderId: row().id,
          activeFrom: '2026-11-19',
          activeTo: null,
          createdAt: new Date(),
        },
      ],
      completions: [
        {
          reminderId: row().id,
          occurrenceDate: '2026-11-17',
          scheduledTime: '08:00',
          status: 'done',
        },
      ],
    });
    expect(result.series.map((day) => day.scheduled)).toEqual([1, 1, 0, 1, 1]);
    expect(result.totals.done).toBe(1);
    expect(result.totals.pending).toBe(3);
  });

  it('không có occurrence → tỉ lệ null, không phải 0%', () => {
    const result = buildCareAdherence({
      subjectId: row().subjectId,
      timezone: TZ,
      days: 7,
      now: new Date('2026-11-20T10:00:00.000Z'),
      reminders: [],
      periods: [],
      completions: [],
    });
    expect(result.totals.recordedPercent).toBeNull();
    expect(result.totals.completionPercent).toBeNull();
  });
});
