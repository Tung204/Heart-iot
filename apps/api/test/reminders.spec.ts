import request from 'supertest';
import { and, count, eq } from 'drizzle-orm';
import { DEFAULT_CARE_PERMISSIONS, type CarePermissions } from '@heart-iot/contracts';
import { reminderSchema, type ReminderSummary } from '@heart-iot/contracts/reminders';
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
import { localDateKey } from '../src/measurements/insights';
import { careLinks, careReminderCompletions, careReminders, subjects } from '../src/database/schema';

/**
 * Lịch nhắc chăm sóc (FR-15 phần web):
 * - Chủ hồ sơ CRUD; caregiver có `canViewMeasurements` xem/today/đánh dấu nhưng
 *   403 khi tạo/sửa/xoá; caregiver thiếu quyền 403; admin/người ngoài 404.
 * - Validation times/weekdays/endsOn/title/note và không có trường liều lượng.
 * - Occurrence hôm nay theo timezone hồ sơ, đúng weekdays + startsOn/endsOn + active.
 * - Đánh dấu idempotent theo `(reminderId, date, time)`, ghi đè người/thời điểm,
 *   hoàn tác 204, không có đánh dấu → 404; đánh dấu ngày khác không lẫn.
 */

const MONDAY = '2026-11-16'; // ISO weekday 1
const TUESDAY = '2026-11-17'; // ISO weekday 2
const BEFORE_START_MONDAY = '2025-12-01';

function reminderBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'medication',
    title: 'Uống thuốc huyết áp',
    note: 'Thuốc do gia đình tự đặt',
    times: ['08:00', '20:00'],
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    startsOn: '2026-01-01',
    endsOn: null,
    active: true,
    ...overrides,
  };
}

describe('Nhắc chăm sóc — lịch nhắc + đánh dấu thực hiện (FR-15)', () => {
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
    admin = await createAdmin(ctx.app, { email: 'admin-reminders@example.test' });
    subjectId = await newSubject(owner.session.user.id, 'Bà An', 'Asia/Ho_Chi_Minh');
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

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

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

  function getReminders(user: TestUser, targetSubjectId: string) {
    return user.agent
      .get(`/api/v1/subjects/${targetSubjectId}/reminders`)
      .set('Origin', TEST_ORIGIN);
  }

  function getToday(user: TestUser, targetSubjectId: string, date?: string) {
    const path = `/api/v1/subjects/${targetSubjectId}/reminders/today`;
    return user.agent
      .get(date ? `${path}?date=${date}` : path)
      .set('Origin', TEST_ORIGIN);
  }

  function postReminder(user: TestUser, targetSubjectId: string, body: Record<string, unknown>) {
    return user.agent
      .post(`/api/v1/subjects/${targetSubjectId}/reminders`)
      .set('Origin', TEST_ORIGIN)
      .send(body);
  }

  function patchReminder(
    user: TestUser,
    targetSubjectId: string,
    reminderId: string,
    body: Record<string, unknown>,
  ) {
    return user.agent
      .patch(`/api/v1/subjects/${targetSubjectId}/reminders/${reminderId}`)
      .set('Origin', TEST_ORIGIN)
      .send(body);
  }

  function deleteReminder(user: TestUser, targetSubjectId: string, reminderId: string) {
    return user.agent
      .delete(`/api/v1/subjects/${targetSubjectId}/reminders/${reminderId}`)
      .set('Origin', TEST_ORIGIN);
  }

  function postCompletion(
    user: TestUser,
    targetSubjectId: string,
    reminderId: string,
    body: Record<string, unknown>,
  ) {
    return user.agent
      .post(`/api/v1/subjects/${targetSubjectId}/reminders/${reminderId}/completions`)
      .set('Origin', TEST_ORIGIN)
      .send(body);
  }

  function deleteCompletion(
    user: TestUser,
    targetSubjectId: string,
    reminderId: string,
    date: string,
    time: string,
  ) {
    return user.agent
      .delete(
        `/api/v1/subjects/${targetSubjectId}/reminders/${reminderId}/completions?date=${date}&time=${time}`,
      )
      .set('Origin', TEST_ORIGIN);
  }

  async function createReminderAsOwner(body: Record<string, unknown> = {}): Promise<ReminderSummary> {
    const response = await postReminder(owner, subjectId, reminderBody(body));
    expect(response.status).toBe(201);
    return reminderSchema.parse(response.body);
  }

  async function completionRowCount(reminderId: string): Promise<number> {
    const [row] = await ctx.db
      .select({ value: count() })
      .from(careReminderCompletions)
      .where(eq(careReminderCompletions.reminderId, reminderId));
    return row?.value ?? 0;
  }

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  it('chủ hồ sơ tạo, xem, sửa, xoá lịch nhắc', async () => {
    const created = await postReminder(owner, subjectId, reminderBody());
    expect(created.status).toBe(201);
    const reminder = reminderSchema.parse(created.body);
    expect(reminder).toMatchObject({
      subjectId,
      kind: 'medication',
      title: 'Uống thuốc huyết áp',
      note: 'Thuốc do gia đình tự đặt',
      times: ['08:00', '20:00'],
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      startsOn: '2026-01-01',
      endsOn: null,
      active: true,
    });
    expect(Number.isNaN(Date.parse(reminder.createdAt))).toBe(false);
    expect(Number.isNaN(Date.parse(reminder.updatedAt))).toBe(false);

    const list = await getReminders(owner, subjectId);
    expect(list.status).toBe(200);
    expect(list.body.items.map((item: ReminderSummary) => item.id)).toContain(reminder.id);

    const patched = await patchReminder(owner, subjectId, reminder.id, {
      title: 'Uống thuốc buổi sáng',
      times: ['07:30'],
      weekdays: [1, 3, 5],
      endsOn: '2026-12-31',
      active: false,
    });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({
      title: 'Uống thuốc buổi sáng',
      times: ['07:30'],
      weekdays: [1, 3, 5],
      endsOn: '2026-12-31',
      active: false,
    });

    // PATCH từng phần: chỉ gửi `note` vẫn giữ nguyên các trường khác.
    const noteOnly = await patchReminder(owner, subjectId, reminder.id, { note: 'Đổi ghi chú' });
    expect(noteOnly.status).toBe(200);
    expect(noteOnly.body).toMatchObject({
      note: 'Đổi ghi chú',
      title: 'Uống thuốc buổi sáng',
      times: ['07:30'],
    });

    const removed = await deleteReminder(owner, subjectId, reminder.id);
    expect(removed.status).toBe(204);
    const afterRemove = await getReminders(owner, subjectId);
    expect(afterRemove.body.items.map((item: ReminderSummary) => item.id)).not.toContain(
      reminder.id,
    );
    expect((await deleteReminder(owner, subjectId, reminder.id)).status).toBe(404);
  });

  it('danh sách sắp theo createdAt tăng dần', async () => {
    const first = await createReminderAsOwner({ title: 'Lịch thứ nhất' });
    const second = await createReminderAsOwner({ title: 'Lịch thứ hai' });
    // Ép mốc createdAt để thứ tự không phụ thuộc độ phân giải đồng hồ.
    await ctx.db
      .update(careReminders)
      .set({ createdAt: new Date('2026-01-01T00:00:00.000Z') })
      .where(eq(careReminders.id, second.id));
    await ctx.db
      .update(careReminders)
      .set({ createdAt: new Date('2026-01-02T00:00:00.000Z') })
      .where(eq(careReminders.id, first.id));

    const list = await getReminders(owner, subjectId);
    const ids = list.body.items.map((item: ReminderSummary) => item.id) as string[];
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));

    await ctx.db.delete(careReminders).where(eq(careReminders.id, first.id));
    await ctx.db.delete(careReminders).where(eq(careReminders.id, second.id));
  });

  it('từ chối dữ liệu không hợp lệ: times, weekdays, endsOn, độ dài, trường lạ', async () => {
    const cases: Array<{ label: string; body: Record<string, unknown> }> = [
      { label: 'times rỗng', body: reminderBody({ times: [] }) },
      {
        label: 'times quá 6 phần tử',
        body: reminderBody({ times: ['01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00'] }),
      },
      { label: 'times sai định dạng', body: reminderBody({ times: ['8:00'] }) },
      { label: 'times ngoài 24h', body: reminderBody({ times: ['24:00'] }) },
      { label: 'times trùng nhau', body: reminderBody({ times: ['08:00', '08:00'] }) },
      { label: 'times không tăng dần', body: reminderBody({ times: ['20:00', '08:00'] }) },
      { label: 'weekdays rỗng', body: reminderBody({ weekdays: [] }) },
      { label: 'weekdays ngoài 1..7', body: reminderBody({ weekdays: [0] }) },
      { label: 'weekdays quá 7', body: reminderBody({ weekdays: [1, 2, 3, 4, 5, 6, 7, 1] }) },
      { label: 'weekdays trùng', body: reminderBody({ weekdays: [2, 2] }) },
      { label: 'weekdays không tăng dần', body: reminderBody({ weekdays: [3, 2] }) },
      { label: 'endsOn trước startsOn', body: reminderBody({ endsOn: '2025-12-31' }) },
      { label: 'title quá ngắn', body: reminderBody({ title: 'A' }) },
      { label: 'note quá 500 ký tự', body: reminderBody({ note: 'x'.repeat(501) }) },
      { label: 'kind lạ', body: reminderBody({ kind: 'exercise' }) },
      { label: 'trường liều lượng (không có trong hợp đồng)', body: reminderBody({ dosage: '1 viên' }) },
    ];
    for (const testCase of cases) {
      const response = await postReminder(owner, subjectId, testCase.body);
      expect({ label: testCase.label, status: response.status }).toEqual({
        label: testCase.label,
        status: 422,
      });
      expect(response.body.code).toBe('VALIDATION_FAILED');
    }

    // PATCH rỗng và PATCH làm endsOn < startsOn hiện có đều bị từ chối.
    const reminder = await createReminderAsOwner({ startsOn: '2026-01-01' });
    expect((await patchReminder(owner, subjectId, reminder.id, {})).status).toBe(422);
    const inverted = await patchReminder(owner, subjectId, reminder.id, { endsOn: '2025-06-30' });
    expect(inverted.status).toBe(422);

    const removed = await deleteReminder(owner, subjectId, reminder.id);
    expect(removed.status).toBe(204);
  });

  it('không cho gắn lịch nhắc của hồ sơ khác qua đường dẫn sai', async () => {
    const reminder = await createReminderAsOwner();
    const otherSubjectId = await newSubject(owner.session.user.id, 'Hồ sơ khác', 'UTC');
    expect((await patchReminder(owner, otherSubjectId, reminder.id, { title: 'Đổi tên' })).status).toBe(
      404,
    );
    expect((await deleteReminder(owner, otherSubjectId, reminder.id)).status).toBe(404);
    await deleteReminder(owner, subjectId, reminder.id);
  });

  // -------------------------------------------------------------------------
  // Quyền
  // -------------------------------------------------------------------------

  it('caregiver có canViewMeasurements xem + đánh dấu nhưng không tạo/sửa/xoá', async () => {
    const reminder = await createReminderAsOwner({ times: ['08:00'], weekdays: [1, 2] });

    expect((await getReminders(caregiver, subjectId)).status).toBe(200);
    expect((await getToday(caregiver, subjectId, MONDAY)).status).toBe(200);
    expect((await postReminder(caregiver, subjectId, reminderBody())).status).toBe(403);
    expect(
      (await patchReminder(caregiver, subjectId, reminder.id, { title: 'Đổi tên' })).status,
    ).toBe(403);
    expect((await deleteReminder(caregiver, subjectId, reminder.id)).status).toBe(403);

    const completed = await postCompletion(caregiver, subjectId, reminder.id, {
      date: MONDAY,
      time: '08:00',
      status: 'done',
    });
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe('done');
    expect(completed.body.completedBy.userId).toBe(caregiver.session.user.id);
    expect((await deleteCompletion(caregiver, subjectId, reminder.id, MONDAY, '08:00')).status).toBe(
      204,
    );

    await deleteReminder(owner, subjectId, reminder.id);
  });

  it('caregiver thiếu quyền xem số đo bị 403 với thông điệp nghiệp vụ', async () => {
    const reminder = await createReminderAsOwner({ times: ['08:00'], weekdays: [1, 2] });

    const list = await getReminders(limitedCaregiver, subjectId);
    expect(list.status).toBe(403);
    expect(list.body.message).toBe(MEASUREMENTS_NOT_SHARED_MESSAGE);
    expect(list.body.details).toMatchObject({ reason: 'measurements_not_shared' });

    const today = await getToday(limitedCaregiver, subjectId, MONDAY);
    expect(today.status).toBe(403);
    expect(today.body.message).toBe(MEASUREMENTS_NOT_SHARED_MESSAGE);

    const completion = await postCompletion(limitedCaregiver, subjectId, reminder.id, {
      date: MONDAY,
      time: '08:00',
      status: 'done',
    });
    expect(completion.status).toBe(403);
    expect(completion.body.message).toBe(MEASUREMENTS_NOT_SHARED_MESSAGE);

    expect((await postReminder(limitedCaregiver, subjectId, reminderBody())).status).toBe(403);
    expect((await deleteReminder(limitedCaregiver, subjectId, reminder.id)).status).toBe(403);

    await deleteReminder(owner, subjectId, reminder.id);
  });

  it('người ngoài và admin không có link hồ sơ nhận 404', async () => {
    const reminder = await createReminderAsOwner();

    expect((await getReminders(outsider, subjectId)).status).toBe(404);
    expect((await getToday(outsider, subjectId, MONDAY)).status).toBe(404);
    expect((await getReminders(admin, subjectId)).status).toBe(404);
    expect((await postReminder(admin, subjectId, reminderBody())).status).toBe(404);
    expect((await patchReminder(admin, subjectId, reminder.id, { title: 'Đổi tên' })).status).toBe(
      404,
    );
    expect((await deleteReminder(admin, subjectId, reminder.id)).status).toBe(404);
    expect(
      (
        await postCompletion(admin, subjectId, reminder.id, {
          date: MONDAY,
          time: '08:00',
          status: 'done',
        })
      ).status,
    ).toBe(404);

    await deleteReminder(owner, subjectId, reminder.id);
  });

  // -------------------------------------------------------------------------
  // Occurrence hôm nay
  // -------------------------------------------------------------------------

  it('today chỉ sinh occurrence đúng weekdays, startsOn/endsOn và active', async () => {
    const subject = await newSubject(owner.session.user.id, 'Bà Bình', 'Asia/Ho_Chi_Minh');
    const included = await postReminder(
      owner,
      subject,
      reminderBody({ title: 'Lịch thứ Hai', times: ['08:00'], weekdays: [1], startsOn: '2026-01-01' }),
    );
    expect(included.status).toBe(201);
    const otherWeekday = await postReminder(
      owner,
      subject,
      reminderBody({ title: 'Lịch thứ Ba', times: ['08:00'], weekdays: [2], startsOn: '2026-01-01' }),
    );
    expect(otherWeekday.status).toBe(201);
    const startsAfter = await postReminder(
      owner,
      subject,
      reminderBody({ title: 'Bắt đầu sau', times: ['08:00'], weekdays: [1], startsOn: TUESDAY }),
    );
    expect(startsAfter.status).toBe(201);
    const endedBefore = await postReminder(
      owner,
      subject,
      reminderBody({
        title: 'Đã kết thúc',
        times: ['08:00'],
        weekdays: [1],
        startsOn: '2026-01-01',
        endsOn: '2026-11-15',
      }),
    );
    expect(endedBefore.status).toBe(201);
    const inactive = await postReminder(
      owner,
      subject,
      reminderBody({
        title: 'Đang tắt',
        times: ['08:00'],
        weekdays: [1],
        startsOn: '2026-01-01',
        active: false,
      }),
    );
    expect(inactive.status).toBe(201);

    const monday = await getToday(owner, subject, MONDAY);
    expect(monday.status).toBe(200);
    expect(monday.body).toMatchObject({ date: MONDAY, timezone: 'Asia/Ho_Chi_Minh' });
    expect(monday.body.items.map((item: { reminder: ReminderSummary }) => item.reminder.title)).toEqual([
      'Lịch thứ Hai',
    ]);
    expect(monday.body.items[0]).toMatchObject({
      time: '08:00',
      status: 'pending',
      completion: null,
    });

    // Ngày kế tiếp không lẫn occurrence của thứ Hai.
    const tuesday = await getToday(owner, subject, TUESDAY);
    expect(
      tuesday.body.items.map((item: { reminder: ReminderSummary }) => item.reminder.title),
    ).toEqual(['Lịch thứ Ba']);

    expect((await getToday(owner, subject, '2026-02-30')).status).toBe(422);
  });

  it('today sắp theo giờ rồi tiêu đề và dùng giờ của hồ sơ', async () => {
    const subject = await newSubject(owner.session.user.id, 'Bà Chi', 'Asia/Ho_Chi_Minh');
    const evening = await postReminder(
      owner,
      subject,
      reminderBody({ title: 'Uống thuốc tối', times: ['20:00'], weekdays: [1] }),
    );
    expect(evening.status).toBe(201);
    const morningB = await postReminder(
      owner,
      subject,
      reminderBody({ title: 'Đo huyết áp', times: ['08:00'], weekdays: [1] }),
    );
    expect(morningB.status).toBe(201);
    const morningA = await postReminder(
      owner,
      subject,
      reminderBody({ title: 'Uống thuốc sáng', times: ['08:00'], weekdays: [1] }),
    );
    expect(morningA.status).toBe(201);

    const today = await getToday(owner, subject, MONDAY);
    const items = today.body.items as Array<{ time: string; reminder: ReminderSummary }>;
    expect(items.map((item) => item.time)).toEqual(['08:00', '08:00', '20:00']);
    const sameTimeTitles = items.slice(0, 2).map((item) => item.reminder.title);
    expect(sameTimeTitles).toEqual(
      ['Đo huyết áp', 'Uống thuốc sáng'].sort((a, b) => a.localeCompare(b, 'vi')),
    );
  });

  it('today mặc định là ngày hiện tại theo timezone hồ sơ (Asia/Ho_Chi_Minh và UTC)', async () => {
    const hcmSubject = await newSubject(owner.session.user.id, 'Bà HCM', 'Asia/Ho_Chi_Minh');
    const utcSubject = await newSubject(owner.session.user.id, 'Ông UTC', 'UTC');

    const hcm = await getToday(owner, hcmSubject);
    expect(hcm.status).toBe(200);
    expect(hcm.body.date).toBe(localDateKey(new Date(), 'Asia/Ho_Chi_Minh'));
    expect(hcm.body.timezone).toBe('Asia/Ho_Chi_Minh');

    const utc = await getToday(owner, utcSubject);
    expect(utc.status).toBe(200);
    expect(utc.body.date).toBe(localDateKey(new Date(), 'UTC'));
    expect(utc.body.timezone).toBe('UTC');
  });

  // -------------------------------------------------------------------------
  // Đánh dấu đã thực hiện
  // -------------------------------------------------------------------------

  it('đánh dấu idempotent theo (reminder, date, time), ghi đè người/thời điểm, hoàn tác được', async () => {
    const reminder = await createReminderAsOwner({
      times: ['08:00', '09:00'],
      weekdays: [1, 2],
      startsOn: '2026-01-01',
    });

    const first = await postCompletion(owner, subjectId, reminder.id, {
      date: MONDAY,
      time: '08:00',
      status: 'done',
    });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      reminderId: reminder.id,
      date: MONDAY,
      time: '08:00',
      status: 'done',
      completedBy: { userId: owner.session.user.id, displayName: 'Chủ hồ sơ' },
    });
    expect(Number.isNaN(Date.parse(first.body.completedAt))).toBe(false);

    const afterFirst = await getToday(owner, subjectId, MONDAY);
    const morning = afterFirst.body.items.find(
      (item: { reminder: ReminderSummary; time: string }) =>
        item.reminder.id === reminder.id && item.time === '08:00',
    );
    expect(morning).toMatchObject({
      status: 'done',
      completion: {
        status: 'done',
        completedBy: { userId: owner.session.user.id, displayName: 'Chủ hồ sơ' },
      },
    });
    const later = afterFirst.body.items.find(
      (item: { reminder: ReminderSummary; time: string }) =>
        item.reminder.id === reminder.id && item.time === '09:00',
    );
    expect(later).toMatchObject({ status: 'pending', completion: null });

    // Ghi lại cùng khoá → ghi đè, không nhân bản.
    const second = await postCompletion(owner, subjectId, reminder.id, {
      date: MONDAY,
      time: '08:00',
      status: 'skipped',
    });
    expect(second.status).toBe(200);
    expect(second.body.status).toBe('skipped');
    expect(Date.parse(second.body.completedAt)).toBeGreaterThanOrEqual(
      Date.parse(first.body.completedAt),
    );
    expect(await completionRowCount(reminder.id)).toBe(1);

    // Người thân đánh dấu lại → cùng bản ghi, đổi người/thời điểm.
    const byCaregiver = await postCompletion(caregiver, subjectId, reminder.id, {
      date: MONDAY,
      time: '08:00',
      status: 'done',
    });
    expect(byCaregiver.status).toBe(200);
    expect(byCaregiver.body.completedBy).toMatchObject({
      userId: caregiver.session.user.id,
      displayName: 'Người thân xem số đo',
    });
    expect(await completionRowCount(reminder.id)).toBe(1);
    const afterCaregiver = await getToday(owner, subjectId, MONDAY);
    const updated = afterCaregiver.body.items.find(
      (item: { reminder: ReminderSummary; time: string }) =>
        item.reminder.id === reminder.id && item.time === '08:00',
    );
    expect(updated.completion.completedBy.userId).toBe(caregiver.session.user.id);

    // Đánh dấu của thứ Hai không lẫn sang thứ Ba.
    const tuesday = await getToday(owner, subjectId, TUESDAY);
    const tuesdayMorning = tuesday.body.items.find(
      (item: { reminder: ReminderSummary; time: string }) =>
        item.reminder.id === reminder.id && item.time === '08:00',
    );
    expect(tuesdayMorning).toMatchObject({ status: 'pending', completion: null });

    // Hoàn tác.
    expect((await deleteCompletion(owner, subjectId, reminder.id, MONDAY, '08:00')).status).toBe(204);
    expect(await completionRowCount(reminder.id)).toBe(0);
    const afterUndo = await getToday(owner, subjectId, MONDAY);
    const undone = afterUndo.body.items.find(
      (item: { reminder: ReminderSummary; time: string }) =>
        item.reminder.id === reminder.id && item.time === '08:00',
    );
    expect(undone).toMatchObject({ status: 'pending', completion: null });

    const missing = await deleteCompletion(owner, subjectId, reminder.id, MONDAY, '08:00');
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('NOT_FOUND');

    await deleteReminder(owner, subjectId, reminder.id);
  });

  it('từ chối đánh dấu ngoài lịch (giờ/ngày/ngày bắt đầu)', async () => {
    const reminder = await createReminderAsOwner({
      times: ['08:00'],
      weekdays: [1],
      startsOn: '2026-01-01',
      endsOn: '2026-12-31',
    });

    const wrongTime = await postCompletion(owner, subjectId, reminder.id, {
      date: MONDAY,
      time: '07:00',
      status: 'done',
    });
    expect(wrongTime.status).toBe(422);

    const wrongWeekday = await postCompletion(owner, subjectId, reminder.id, {
      date: TUESDAY,
      time: '08:00',
      status: 'done',
    });
    expect(wrongWeekday.status).toBe(422);

    const beforeStart = await postCompletion(owner, subjectId, reminder.id, {
      date: BEFORE_START_MONDAY,
      time: '08:00',
      status: 'done',
    });
    expect(beforeStart.status).toBe(422);

    const afterEnd = await postCompletion(owner, subjectId, reminder.id, {
      date: '2027-01-04',
      time: '08:00',
      status: 'done',
    });
    expect(afterEnd.status).toBe(422);

    const badStatus = await postCompletion(owner, subjectId, reminder.id, {
      date: MONDAY,
      time: '08:00',
      status: 'pending',
    });
    expect(badStatus.status).toBe(422);

    expect(await completionRowCount(reminder.id)).toBe(0);
    await deleteReminder(owner, subjectId, reminder.id);
  });

  it('lưu trữ lịch nhắc giữ đánh dấu và ẩn khỏi danh sách', async () => {
    const reminder = await createReminderAsOwner({ times: ['08:00'], weekdays: [1] });
    expect(
      (
        await postCompletion(owner, subjectId, reminder.id, {
          date: MONDAY,
          time: '08:00',
          status: 'done',
        })
      ).status,
    ).toBe(200);
    expect(await completionRowCount(reminder.id)).toBe(1);

    expect((await deleteReminder(owner, subjectId, reminder.id)).status).toBe(204);
    // Lưu trữ mềm: row + completion còn, nhưng không còn trong danh sách.
    expect(await completionRowCount(reminder.id)).toBe(1);
    const [archived] = await ctx.db
      .select()
      .from(careReminders)
      .where(eq(careReminders.id, reminder.id));
    expect(archived?.archivedAt).not.toBeNull();
    expect(archived?.active).toBe(false);
    const list = await getReminders(owner, subjectId);
    expect(list.body.items.map((item: ReminderSummary) => item.id)).not.toContain(reminder.id);
    // Gọi lưu trữ lần hai → 404, không giả vờ xoá lần nữa.
    expect((await deleteReminder(owner, subjectId, reminder.id)).status).toBe(404);
  });
});
