import request from 'supertest';
import { eq } from 'drizzle-orm';
import { DEFAULT_CARE_PERMISSIONS, type CarePermissions } from '@heart-iot/contracts';
import {
  VISIT_REPORT_DISCLAIMER,
  VISIT_REPORT_MAX_DAYS,
  visitReportSchema,
  type VisitReport,
} from '@heart-iot/contracts/reports';
import {
  createAdmin,
  createModuleTestApp,
  registerUser,
  TEST_ORIGIN,
  type TestContext,
  type TestUser,
} from './test-app';
import { VisitReportModule } from '../src/visit-reports/visit-report.module';
import { PolicyModule } from '../src/policy/policy.module';
import { MEASUREMENTS_NOT_SHARED_MESSAGE } from '../src/access/access.service';
import { buildInsightDayWindows, localDateKey } from '../src/measurements/insights';
import { addDays, daysBetweenInclusive } from '../src/common/local-date';
import {
  careLinks,
  deviceAssignments,
  devices,
  incidents,
  subjects,
  telemetry,
} from '../src/database/schema';

/**
 * Phiếu đi khám (FR-16) + điểm chú ý (FR-22):
 * - Kỳ mặc định 30 ngày theo timezone hồ sơ, `to` tương lai kéo về hôm nay,
 *   kỳ dài bị cắt còn 92 ngày, `from > to` → 422.
 * - Áp `sharedFrom`/`historyDays` như các API đo: chỉ cắt phần vượt quyền; kỳ
 *   hoàn toàn trước mốc chia sẻ → 422.
 * - Coverage/gaps/incidents/attentionPoints tất định; simulated đánh dấu khi
 *   nguồn mẫu là mô phỏng; câu chữ không kết luận chẩn đoán.
 * - Quyền như measurements: thiếu `canViewMeasurements` 403, admin/người ngoài 404.
 */

const TZ_HCM = 'Asia/Ho_Chi_Minh';
const FORBIDDEN_DIAGNOSIS_WORDS = [
  'nguy hiểm',
  'suy tim',
  'bất thường',
  'chẩn đoán',
  'bệnh lý',
  'điều trị',
];

type Fixture = { subjectId: string; deviceId: string; assignmentId: string };

let serialCounter = 0;
const nextSerial = () => `REPORT-${String(++serialCounter).padStart(4, '0')}`;
const sequenceByDevice = new Map<string, number>();
const stepsByDevice = new Map<string, number>();

describe('Phiếu đi khám — visit-report (FR-16, FR-22)', () => {
  let ctx: TestContext;
  let owner: TestUser;
  let caregiver: TestUser;
  let limitedCaregiver: TestUser;
  let outsider: TestUser;
  let admin: TestUser;
  let fixture: Fixture;
  let reportWindows: ReturnType<typeof buildInsightDayWindows>;
  let today: string;

  const now = new Date();

  beforeAll(async () => {
    ctx = await createModuleTestApp([VisitReportModule, PolicyModule]);
    owner = await registerUser(ctx.app, { displayName: 'Chủ hồ sơ' });
    caregiver = await registerUser(ctx.app, { displayName: 'Người thân xem số đo' });
    limitedCaregiver = await registerUser(ctx.app, { displayName: 'Người thân không xem số đo' });
    outsider = await registerUser(ctx.app, { displayName: 'Người ngoài' });
    admin = await createAdmin(ctx.app, { email: 'admin-report@example.test' });

    // Kỳ kiểm thử 30 ngày đã kết thúc cách hôm nay 2 ngày → mọi mẫu đều ở quá khứ.
    reportWindows = buildInsightDayWindows(32, now, TZ_HCM).slice(0, 30);
    today = localDateKey(now, TZ_HCM);

    fixture = await createFixture('Bà An');
    await linkCaregiver(fixture.subjectId, caregiver.session.user.id, {
      ...DEFAULT_CARE_PERMISSIONS,
    });
    await linkCaregiver(fixture.subjectId, limitedCaregiver.session.user.id, {
      ...DEFAULT_CARE_PERMISSIONS,
      canViewMeasurements: false,
    });
    await seedMainFixture(fixture);
  });

  afterAll(async () => {
    await ctx.close();
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  async function createFixture(displayName: string): Promise<Fixture> {
    const subjectRows = await ctx.db
      .insert(subjects)
      .values({
        ownerUserId: owner.session.user.id,
        displayName,
        timezone: TZ_HCM,
      })
      .returning();
    const subject = subjectRows[0];
    if (!subject) throw new Error('Không tạo được hồ sơ kiểm thử.');
    const deviceRows = await ctx.db
      .insert(devices)
      .values({ serial: nextSerial(), label: 'Vòng tay đo', credentialHash: 'test-hash' })
      .returning();
    const device = deviceRows[0];
    if (!device) throw new Error('Không tạo được thiết bị kiểm thử.');
    const assignmentRows = await ctx.db
      .insert(deviceAssignments)
      .values({
        deviceId: device.id,
        subjectId: subject.id,
        assignedByUserId: owner.session.user.id,
        startedAt: new Date(now.getTime() - 400 * 24 * 3600 * 1000),
      })
      .returning();
    const assignment = assignmentRows[0];
    if (!assignment) throw new Error('Không tạo được assignment kiểm thử.');
    return { subjectId: subject.id, deviceId: device.id, assignmentId: assignment.id };
  }

  async function linkCaregiver(
    subjectId: string,
    caregiverUserId: string,
    permissions: CarePermissions,
  ): Promise<void> {
    await ctx.db.insert(careLinks).values({
      subjectId,
      caregiverUserId,
      invitedByUserId: owner.session.user.id,
      permissions,
      status: 'active',
      sharedFrom: new Date(now.getTime() - 20 * 24 * 3600 * 1000),
    });
  }

  async function insertSample(
    target: Fixture,
    measuredAt: Date,
    options: {
      heartRate?: number | null;
      stepDelta?: number;
      source?: string;
      motion?: 'valid' | 'sensor_error';
    } = {},
  ): Promise<void> {
    const heartRate = options.heartRate === undefined ? 80 : options.heartRate;
    const stepDelta = options.stepDelta ?? 100;
    const sequence = (sequenceByDevice.get(target.deviceId) ?? 0) + 1;
    sequenceByDevice.set(target.deviceId, sequence);
    const steps = (stepsByDevice.get(target.deviceId) ?? 0) + stepDelta;
    stepsByDevice.set(target.deviceId, steps);
    await ctx.db.insert(telemetry).values({
      messageId: crypto.randomUUID(),
      deviceId: target.deviceId,
      assignmentId: target.assignmentId,
      bootId: 'boot-report',
      sequence,
      measuredAt,
      receivedAt: measuredAt,
      clockStatus: 'synced',
      uptimeMs: sequence * 1000,
      metrics: { heart_rate_bpm: heartRate, steps_since_boot: steps },
      quality: {
        heart_rate: heartRate === null ? 'not_worn' : 'valid',
        motion: options.motion ?? 'valid',
      },
      batteryPercent: 80,
      firmwareVersion: '0.0.0-test',
      payloadHash: crypto.randomUUID(),
      source: options.source ?? 'http',
    });
  }

  async function insertIncident(
    target: Fixture,
    input: { type: 'fall' | 'sos'; state: 'open' | 'resolved'; at: Date },
  ): Promise<void> {
    await ctx.db.insert(incidents).values({
      subjectId: target.subjectId,
      assignmentId: target.assignmentId,
      deviceId: target.deviceId,
      deviceIncidentId: `report-incident-${crypto.randomUUID()}`,
      type: input.type,
      state: input.state,
      lastRevision: 1,
      detectedAt: input.at,
      lastEventAt: input.at,
    });
  }

  /** Dữ liệu chính: 29/30 ngày có mẫu, một ngày trống, một khoảng thiếu 12 giờ. */
  async function seedMainFixture(target: Fixture): Promise<void> {
    for (let index = 0; index < reportWindows.length; index += 1) {
      const window = reportWindows[index];
      if (!window || index === 20) continue; // ngày 20 không có mẫu
      const heartRates =
        index === 5
          ? [55, 56, 57]
          : index === 15
            ? [130, 131, 132]
            : index === 10
              ? [80, 81]
              : [70, 71, 72];
      const hours = index === 10 ? [8, 20] : [8, 12, 16];
      const stepDelta = index === 7 ? 5 : 100;
      for (let slot = 0; slot < hours.length; slot += 1) {
        const hour = hours[slot]!;
        const heartRate = heartRates[slot] ?? heartRates[heartRates.length - 1] ?? 80;
        const measuredAt = new Date(window.from.getTime() + hour * 3_600_000);
        await insertSample(target, measuredAt, { heartRate, stepDelta });
        // Mẫu thứ hai cùng cặp cách 30 giây: đủ gần để cộng delta bước.
        await insertSample(target, new Date(measuredAt.getTime() + 30_000), {
          heartRate,
          stepDelta,
        });
      }
    }

    // Sự cố: 2 ngã (1 open) + 1 SOS, nằm trong kỳ.
    await insertIncident(target, {
      type: 'fall',
      state: 'resolved',
      at: new Date(reportWindows[3]!.from.getTime() + 10 * 3_600_000),
    });
    await insertIncident(target, {
      type: 'sos',
      state: 'resolved',
      at: new Date(reportWindows[8]!.from.getTime() + 9 * 3_600_000),
    });
    await insertIncident(target, {
      type: 'fall',
      state: 'open',
      at: new Date(reportWindows[12]!.from.getTime() + 11 * 3_600_000),
    });
  }

  function getReport(user: TestUser, subjectId: string, query?: { from?: string; to?: string }) {
    const params = new URLSearchParams();
    if (query?.from) params.set('from', query.from);
    if (query?.to) params.set('to', query.to);
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    return user.agent
      .get(`/api/v1/subjects/${subjectId}/visit-report${suffix}`)
      .set('Origin', TEST_ORIGIN);
  }

  async function fetchMainReport(): Promise<VisitReport> {
    const response = await getReport(owner, fixture.subjectId, {
      from: reportWindows[0]!.date,
      to: reportWindows[29]!.date,
    });
    expect(response.status).toBe(200);
    return visitReportSchema.parse(response.body);
  }

  // -------------------------------------------------------------------------
  // Kỳ báo cáo
  // -------------------------------------------------------------------------

  it('mặc định 30 ngày gần nhất theo timezone hồ sơ', async () => {
    const response = await getReport(owner, fixture.subjectId);
    expect(response.status).toBe(200);
    const report = visitReportSchema.parse(response.body);
    expect(report.subject).toMatchObject({
      id: fixture.subjectId,
      displayName: 'Bà An',
      timezone: TZ_HCM,
    });
    expect(report.period).toEqual({
      from: addDays(today, -29),
      to: today,
      days: 30,
    });
    expect(Number.isNaN(Date.parse(report.generatedAt))).toBe(false);
    expect(report.disclaimer).toBe(VISIT_REPORT_DISCLAIMER);
  });

  it('kéo `to` tương lai về hôm nay và cắt kỳ dài còn 92 ngày', async () => {
    const future = await getReport(owner, fixture.subjectId, {
      to: addDays(today, 10),
    });
    expect(future.status).toBe(200);
    expect(future.body.period).toEqual({ from: addDays(today, -29), to: today, days: 30 });

    const clamped = await getReport(owner, fixture.subjectId, {
      from: addDays(today, -200),
      to: today,
    });
    expect(clamped.status).toBe(200);
    expect(clamped.body.period).toEqual({
      from: addDays(today, -(VISIT_REPORT_MAX_DAYS - 1)),
      to: today,
      days: VISIT_REPORT_MAX_DAYS,
    });

    const inverted = await getReport(owner, fixture.subjectId, {
      from: today,
      to: addDays(today, -3),
    });
    expect(inverted.status).toBe(422);

    const malformed = await getReport(owner, fixture.subjectId, { from: '16-11-2026' });
    expect(malformed.status).toBe(422);
  });

  // -------------------------------------------------------------------------
  // Số liệu tổng hợp
  // -------------------------------------------------------------------------

  it('tổng hợp coverage, khoảng thiếu, nhịp tim, bước và sự cố trong kỳ', async () => {
    const report = await fetchMainReport();

    expect(report.summary.measurementCount).toBe(172);
    expect(report.summary.daysWithData).toBe(29);
    expect(report.summary.coveragePercent).toBe(96.7);
    expect(report.summary.heartRate).toEqual({ avg: 72.8, min: 55, max: 132 });
    expect(report.summary.steps).toEqual({ total: 8315, avgPerDay: 277.2 });

    expect(report.summary.gaps.length).toBeGreaterThan(0);
    for (const gap of report.summary.gaps) {
      expect(gap.hours).toBeGreaterThanOrEqual(6);
      expect(Date.parse(gap.to)).toBeGreaterThan(Date.parse(gap.from));
    }
    // Khoảng thiếu 12 giờ của ngày có 2 mẫu cách xa.
    expect(report.summary.gaps.some((gap) => gap.hours === 12)).toBe(true);
    // Ngày trống hoàn toàn giữa kỳ → khoảng thiếu ~40 giờ.
    expect(report.summary.gaps.some((gap) => gap.hours >= 39 && gap.hours <= 40)).toBe(true);

    expect(report.incidents.total).toBe(3);
    expect(report.incidents.falls).toBe(2);
    expect(report.incidents.sos).toBe(1);
    expect(report.incidents.open).toBe(1);
    expect(report.incidents.items).toHaveLength(3);
    expect(report.incidents.items[0]).toMatchObject({ type: 'fall', state: 'open' });
    expect(report.simulated).toBe(false);
    expect(report.disclaimer).toBe(VISIT_REPORT_DISCLAIMER);
  });

  it('điểm chú ý: ngã → khoảng thiếu → nhịp tim → bước, tối đa 5, không kết luận bệnh', async () => {
    const report = await fetchMainReport();
    expect(report.attentionPoints).toHaveLength(5);
    expect(report.attentionPoints.map((point) => point.label)).toEqual([
      'Sự kiện ngã',
      'Khoảng thiếu dữ liệu dài nhất',
      'Nhịp tim thấp nhất theo ngày',
      'Nhịp tim cao nhất theo ngày',
      'Ngày ít bước nhất',
    ]);

    const [falls, gap, low, high, steps] = report.attentionPoints;
    expect(falls).toMatchObject({ date: reportWindows[12]!.date });
    expect(falls!.detail).toContain('2 lần ngã');
    expect(gap).toMatchObject({ date: reportWindows[19]!.date });
    expect(gap!.detail).toContain('40 giờ');
    expect(low).toMatchObject({ date: reportWindows[5]!.date });
    expect(low!.detail).toContain('55 bpm');
    expect(high).toMatchObject({ date: reportWindows[15]!.date });
    expect(high!.detail).toContain('132 bpm');
    expect(steps).toMatchObject({ date: reportWindows[7]!.date });
    expect(steps!.detail).toContain('15 bước');

    const text = JSON.stringify(report.attentionPoints).toLowerCase();
    for (const word of FORBIDDEN_DIAGNOSIS_WORDS) {
      expect(text).not.toContain(word);
    }
  });

  it('đánh dấu dữ liệu mô phỏng khi mẫu có nguồn simulator/synthetic', async () => {
    const target = await createFixture('Bà Mô phỏng');
    const window = reportWindows[29]!;
    const measuredAt = new Date(window.from.getTime() + 9 * 3_600_000);
    await insertSample(target, measuredAt, { source: 'simulator' });

    const response = await getReport(owner, target.subjectId, {
      from: window.date,
      to: window.date,
    });
    expect(response.status).toBe(200);
    expect(response.body.simulated).toBe(true);
    expect(response.body.period.days).toBe(1);
  });

  it('không bịa số liệu khi kỳ không có mẫu đo', async () => {
    const target = await createFixture('Bà Trống');
    const response = await getReport(owner, target.subjectId, {
      from: reportWindows[0]!.date,
      to: reportWindows[29]!.date,
    });
    expect(response.status).toBe(200);
    const report = visitReportSchema.parse(response.body);
    expect(report.summary.measurementCount).toBe(0);
    expect(report.summary.daysWithData).toBe(0);
    expect(report.summary.coveragePercent).toBe(0);
    expect(report.summary.heartRate).toBeNull();
    expect(report.summary.steps).toBeNull();
    expect(report.summary.gaps).toHaveLength(1);
    expect(report.incidents).toMatchObject({ total: 0, falls: 0, sos: 0, open: 0, items: [] });
    expect(report.attentionPoints).toEqual([
      {
        date: reportWindows[29]!.date,
        label: 'Độ phủ dữ liệu',
        detail: 'Dữ liệu có ở 0/30 ngày (0%); 30 ngày không có mẫu đo.',
      },
    ]);
  });

  it('nhịp tim null khi mẫu không hợp lệ nhưng vẫn đếm mẫu/ngày', async () => {
    const target = await createFixture('Bà Kém tín hiệu');
    const window = reportWindows[28]!;
    await insertSample(target, new Date(window.from.getTime() + 9 * 3_600_000), {
      heartRate: null,
    });
    const response = await getReport(owner, target.subjectId, {
      from: window.date,
      to: window.date,
    });
    expect(response.status).toBe(200);
    expect(response.body.summary.measurementCount).toBe(1);
    expect(response.body.summary.daysWithData).toBe(1);
    expect(response.body.summary.heartRate).toBeNull();
  });

  it('điểm chú ý giữ tối đa 5: độ phủ thấp bị bỏ khi đã đủ ưu tiên cao hơn', async () => {
    const target = await createFixture('Bà Thưa dữ liệu');
    const days = [24, 25, 26].map((index) => reportWindows[index]!);
    const heartRates = [60, 140, 80];
    for (let index = 0; index < days.length; index += 1) {
      const window = days[index]!;
      await insertSample(target, new Date(window.from.getTime() + 8 * 3_600_000), {
        heartRate: heartRates[index]!,
      });
      await insertSample(target, new Date(window.from.getTime() + 8 * 3_600_000 + 30_000), {
        heartRate: heartRates[index]!,
      });
    }
    await insertIncident(target, {
      type: 'fall',
      state: 'resolved',
      at: new Date(days[1]!.from.getTime() + 10 * 3_600_000),
    });

    const response = await getReport(owner, target.subjectId, {
      from: reportWindows[0]!.date,
      to: reportWindows[29]!.date,
    });
    expect(response.status).toBe(200);
    const report = visitReportSchema.parse(response.body);
    expect(report.summary.daysWithData).toBe(3);
    expect(report.summary.coveragePercent).toBe(10);
    expect(report.attentionPoints).toHaveLength(5);
    expect(report.attentionPoints.map((point) => point.label)).not.toContain('Độ phủ dữ liệu');
    expect(report.attentionPoints[0]!.label).toBe('Sự kiện ngã');
  });

  it('điểm chú ý có "Độ phủ dữ liệu" khi dữ liệu thưa và chưa đủ 5 điểm ưu tiên', async () => {
    const target = await createFixture('Bà Một ngày');
    const window = reportWindows[26]!;
    await insertSample(target, new Date(window.from.getTime() + 8 * 3_600_000), { heartRate: 75 });
    await insertSample(target, new Date(window.from.getTime() + 8 * 3_600_000 + 30_000), {
      heartRate: 75,
    });

    const response = await getReport(owner, target.subjectId, {
      from: reportWindows[0]!.date,
      to: reportWindows[29]!.date,
    });
    expect(response.status).toBe(200);
    const report = visitReportSchema.parse(response.body);
    const coveragePoint = report.attentionPoints.find(
      (point) => point.label === 'Độ phủ dữ liệu',
    );
    expect(coveragePoint).toMatchObject({ date: reportWindows[29]!.date });
    expect(coveragePoint!.detail).toContain('1/30 ngày (3,3%)');
    expect(coveragePoint!.detail).toContain('29 ngày không có mẫu đo');
  });

  // -------------------------------------------------------------------------
  // Quyền và cửa sổ chia sẻ
  // -------------------------------------------------------------------------

  it('quyền như measurements: caregiver xem được, thiếu quyền 403, admin/người ngoài 404', async () => {
    const caregiverView = await getReport(caregiver, fixture.subjectId);
    expect(caregiverView.status).toBe(200);

    const limited = await getReport(limitedCaregiver, fixture.subjectId);
    expect(limited.status).toBe(403);
    expect(limited.body.message).toBe(MEASUREMENTS_NOT_SHARED_MESSAGE);
    expect(limited.body.details).toMatchObject({ reason: 'measurements_not_shared' });

    expect((await getReport(outsider, fixture.subjectId)).status).toBe(404);
    expect((await getReport(admin, fixture.subjectId)).status).toBe(404);
  });

  it('cắt kỳ theo sharedFrom và historyDays, kỳ trước mốc chia sẻ → 422', async () => {
    const subjectId = fixture.subjectId;
    const sharedUser = await registerUser(ctx.app, { displayName: 'Người thân sharedFrom' });
    const sharedFrom = new Date(now.getTime() - 10 * 24 * 3600 * 1000);
    await ctx.db.insert(careLinks).values({
      subjectId,
      caregiverUserId: sharedUser.session.user.id,
      invitedByUserId: owner.session.user.id,
      permissions: { ...DEFAULT_CARE_PERMISSIONS, historyDays: 30 },
      status: 'active',
      sharedFrom,
    });

    const effectiveDate = localDateKey(sharedFrom, TZ_HCM);
    const expected = {
      from: effectiveDate,
      to: today,
      days: daysBetweenInclusive(effectiveDate, today),
    };
    const sharedReport = await getReport(sharedUser, subjectId);
    expect(sharedReport.status).toBe(200);
    expect(sharedReport.body.period).toEqual(expected);
    // Dữ liệu trước mốc chia sẻ bị cắt khỏi tổng hợp.
    expect(sharedReport.body.summary.daysWithData).toBeLessThan(29);

    const explicitEarlier = await getReport(sharedUser, subjectId, {
      from: addDays(today, -20),
      to: today,
    });
    expect(explicitEarlier.status).toBe(200);
    expect(explicitEarlier.body.period).toEqual(expected);

    const beforeShare = await getReport(sharedUser, subjectId, {
      from: addDays(today, -20),
      to: addDays(today, -15),
    });
    expect(beforeShare.status).toBe(422);

    const historyUser = await registerUser(ctx.app, { displayName: 'Người thân historyDays' });
    await ctx.db.insert(careLinks).values({
      subjectId,
      caregiverUserId: historyUser.session.user.id,
      invitedByUserId: owner.session.user.id,
      permissions: { ...DEFAULT_CARE_PERMISSIONS, historyDays: 7 },
      status: 'active',
      sharedFrom: new Date(now.getTime() - 100 * 24 * 3600 * 1000),
    });
    const historyReport = await getReport(historyUser, subjectId);
    expect(historyReport.status).toBe(200);
    const historyFrom = localDateKey(
      new Date(now.getTime() - 7 * 24 * 3600 * 1000),
      TZ_HCM,
    );
    expect(historyReport.body.period).toEqual({
      from: historyFrom,
      to: today,
      days: daysBetweenInclusive(historyFrom, today),
    });
  });

  it('admin không có link hồ sơ nhận 404 dù có dữ liệu', async () => {
    const rows = await ctx.db
      .select({ id: subjects.id })
      .from(subjects)
      .where(eq(subjects.id, fixture.subjectId));
    expect(rows).toHaveLength(1);
    expect((await getReport(admin, fixture.subjectId)).status).toBe(404);
  });
});
