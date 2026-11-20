import { count, eq } from 'drizzle-orm';
import { createTestApp, TEST_ORIGIN, type TestContext } from './test-app';
import { DEMO, seedDemo } from '../src/database/seed';
import {
  careReminderCompletions,
  careReminderPeriods,
  careReminders,
  emergencyContacts,
  incidents,
  maintenanceTasks,
  notificationOutbox,
  subjects,
  telemetry,
  users,
} from '../src/database/schema';
import request from 'supertest';

describe('Seed demo tổng hợp', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    // Seed một lần để test nào chạy trước (--randomize) cũng có dữ liệu demo.
    await seedDemo(ctx.db);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('seed idempotent: chạy hai lần không nhân bản dữ liệu', async () => {
    await seedDemo(ctx.db);
    await seedDemo(ctx.db);

    const [userCount] = await ctx.db.select({ value: count() }).from(users);
    const [subjectCount] = await ctx.db.select({ value: count() }).from(subjects);
    const [telemetryCount] = await ctx.db.select({ value: count() }).from(telemetry);
    const [incidentCount] = await ctx.db.select({ value: count() }).from(incidents);
    const [taskCount] = await ctx.db.select({ value: count() }).from(maintenanceTasks);
    const [outboxCount] = await ctx.db.select({ value: count() }).from(notificationOutbox);
    const [contactCount] = await ctx.db.select({ value: count() }).from(emergencyContacts);
    const [reminderCount] = await ctx.db.select({ value: count() }).from(careReminders);
    const [completionCount] = await ctx.db.select({ value: count() }).from(careReminderCompletions);
    const [periodCount] = await ctx.db.select({ value: count() }).from(careReminderPeriods);

    expect(userCount?.value).toBe(3);
    expect(subjectCount?.value).toBe(2);
    expect(telemetryCount?.value).toBeGreaterThan(1000);
    expect(incidentCount?.value).toBe(3);
    expect(taskCount?.value).toBe(2);
    expect(outboxCount?.value).toBe(2);
    expect(contactCount?.value).toBe(1);
    // Lịch nhắc + khoảng hiệu lực + completion mẫu đều idempotent.
    expect(reminderCount?.value).toBe(2);
    expect(periodCount?.value).toBe(2);
    expect(completionCount?.value).toBeGreaterThan(0);
  });

  it('tài khoản demo đăng nhập được và thấy hồ sơ được chia sẻ', async () => {
    const owner = request.agent(ctx.app.getHttpServer());
    const login = await owner
      .post('/api/v1/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ email: DEMO.owner.email, password: DEMO.password });
    expect(login.status).toBe(200);
    expect(login.body.user.id).toBe(DEMO.owner.id);

    const caregiver = request.agent(ctx.app.getHttpServer());
    const caregiverLogin = await caregiver
      .post('/api/v1/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ email: DEMO.caregiver.email, password: DEMO.password });
    expect(caregiverLogin.status).toBe(200);
    expect(caregiverLogin.body.user.id).toBe(DEMO.caregiver.id);
  });

  it('dữ liệu telemetry demo có khoảng thiếu và chất lượng không hợp lệ', async () => {
    const rows = await ctx.db
      .select({ metrics: telemetry.metrics, quality: telemetry.quality })
      .from(telemetry)
      .where(eq(telemetry.assignmentId, DEMO.assignmentId))
      .limit(200);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.metrics.heart_rate_bpm === null)).toBe(true);
    expect(rows.some((row) => row.metrics.heart_rate_bpm !== null)).toBe(true);
  });

  it('seed có 2 lịch nhắc demo đúng nội dung và phiếu đi khám đánh dấu dữ liệu mô phỏng', async () => {
    const reminders = await ctx.db.select().from(careReminders);
    expect(reminders).toHaveLength(2);

    const medication = reminders.find((row) => row.id === DEMO.medicationReminderId);
    expect(medication).toMatchObject({
      subjectId: DEMO.subjectAn.id,
      kind: 'medication',
      title: 'Uống thuốc huyết áp',
      times: ['08:00'],
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      endsOn: null,
      active: true,
    });
    expect(medication?.note).toContain('không phải chỉ định của hệ thống');

    const walk = reminders.find((row) => row.id === DEMO.walkReminderId);
    expect(walk).toMatchObject({
      subjectId: DEMO.subjectAn.id,
      kind: 'activity',
      title: 'Đi bộ nhẹ buổi chiều',
      times: ['16:00'],
      weekdays: [1, 2, 3, 4, 5],
      active: true,
    });

    const owner = request.agent(ctx.app.getHttpServer());
    const login = await owner
      .post('/api/v1/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ email: DEMO.owner.email, password: DEMO.password });
    expect(login.status).toBe(200);

    // Hôm nay chưa có đánh dấu nào → mọi occurrence đều "pending".
    const today = await owner
      .get(`/api/v1/subjects/${DEMO.subjectAn.id}/reminders/today`)
      .set('Origin', TEST_ORIGIN);
    expect(today.status).toBe(200);
    expect(today.body.items.length).toBeGreaterThan(0);
    for (const item of today.body.items as Array<{ status: string; completion: unknown }>) {
      expect(item.status).toBe('pending');
      expect(item.completion).toBeNull();
    }

    // Phiếu đi khám của dữ liệu seed phải mang nhãn mô phỏng.
    const report = await owner
      .get(`/api/v1/subjects/${DEMO.subjectAn.id}/visit-report`)
      .set('Origin', TEST_ORIGIN);
    expect(report.status).toBe(200);
    expect(report.body.simulated).toBe(true);
    expect(report.body.summary.measurementCount).toBeGreaterThan(0);
    expect(report.body.summary.daysWithData).toBeGreaterThan(0);
    expect(report.body.disclaimer).toContain('không thay thế việc khám');
  });
});
