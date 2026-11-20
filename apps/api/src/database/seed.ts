import { createHash } from 'node:crypto';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { hashPassword } from '../auth/password';
import { computePolicyDigest } from '../policy/policy.service';
import { addDays, isoWeekday } from '../common/local-date';
import { localDateKey } from '../measurements/insights';
import type { AppDb } from './database';
import {
  careLinks,
  careReminderCompletions,
  careReminderPeriods,
  careReminders,
  deviceAssignments,
  devices,
  emergencyContacts,
  incidentEvents,
  incidents,
  maintenanceTasks,
  notificationOutbox,
  policyConfigs,
  realtimeEvents,
  subjects,
  telemetry,
  users,
  type TelemetryQuality,
} from './schema';

/**
 * Dữ liệu demo TỔNG HỢP, không phải dữ liệu đo người thật.
 * Idempotent: chạy lại không nhân bản user/hồ sơ/thiết bị/sự kiện.
 * Không chứa secret thật; khóa thiết bị demo in ra để dùng với simulator.
 */
export const DEMO = {
  password: 'demo-heart-iot-2026',
  adminPassword: 'demo-admin-2026',
  deviceKey: 'demo-device-key-HEARTIOT-2026-001',
  owner: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'ba-an@demo.heart-iot.local',
    displayName: 'Trần Thị An',
  },
  caregiver: {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'minh@demo.heart-iot.local',
    displayName: 'Nguyễn Văn Minh',
  },
  admin: {
    id: '33333333-3333-4333-8333-333333333333',
    email: 'admin@demo.heart-iot.local',
    displayName: 'Quản trị hệ thống',
  },
  subjectAn: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    displayName: 'Bà Trần Thị An',
    timezone: 'Asia/Ho_Chi_Minh',
  },
  subjectBinh: {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    displayName: 'Ông Nguyễn Văn Bình',
    timezone: 'Asia/Ho_Chi_Minh',
  },
  careLinkId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  deviceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  assignmentId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  serial: 'AN-2026-001',
  openIncidentId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  cancelledIncidentId: 'f1111111-1111-4111-8111-111111111111',
  resolvedIncidentId: 'f2222222-2222-4222-8222-222222222222',
  // Lịch nhắc demo cho bà An — id cố định để seed idempotent.
  medicationReminderId: 'a1111111-1111-4111-8111-111111111111',
  walkReminderId: 'a2222222-2222-4222-8222-222222222222',
} as const;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

type SeedSummary = {
  users: number;
  subjects: number;
  devices: number;
  assignments: number;
  careLinks: number;
  telemetry: number;
  incidents: number;
  tasks: number;
  outbox: number;
  reminders: number;
  reminderCompletions: number;
};

export async function seedDemo(db: AppDb, now = new Date()): Promise<SeedSummary> {
  const passwordHash = await hashPassword(DEMO.password);
  const adminHash = await hashPassword(DEMO.adminPassword);

  await db
    .insert(users)
    .values([
      {
        id: DEMO.owner.id,
        email: DEMO.owner.email,
        emailNormalized: DEMO.owner.email,
        passwordHash,
        displayName: DEMO.owner.displayName,
      },
      {
        id: DEMO.caregiver.id,
        email: DEMO.caregiver.email,
        emailNormalized: DEMO.caregiver.email,
        passwordHash,
        displayName: DEMO.caregiver.displayName,
      },
      {
        id: DEMO.admin.id,
        email: DEMO.admin.email,
        emailNormalized: DEMO.admin.email,
        passwordHash: adminHash,
        displayName: DEMO.admin.displayName,
        role: 'admin',
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(subjects)
    .values([
      {
        id: DEMO.subjectAn.id,
        ownerUserId: DEMO.owner.id,
        displayName: DEMO.subjectAn.displayName,
        timezone: DEMO.subjectAn.timezone,
      },
      {
        id: DEMO.subjectBinh.id,
        ownerUserId: DEMO.caregiver.id,
        displayName: DEMO.subjectBinh.displayName,
        timezone: DEMO.subjectBinh.timezone,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(careLinks)
    .values({
      id: DEMO.careLinkId,
      subjectId: DEMO.subjectAn.id,
      caregiverUserId: DEMO.caregiver.id,
      invitedByUserId: DEMO.owner.id,
      permissions: {
        historyDays: 30,
        canReceiveAlerts: true,
        canAcknowledge: true,
        canResolve: false,
        canViewAi: true,
      },
      status: 'active',
      sharedFrom: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
      acceptedAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
    })
    .onConflictDoNothing();

  await db
    .insert(emergencyContacts)
    .values({
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      subjectId: DEMO.subjectAn.id,
      name: 'Người thân (demo)',
      relationship: 'Con trai',
      phone: '0900000000',
      isPrimary: true,
      createdByUserId: DEMO.owner.id,
    })
    .onConflictDoNothing();

  const deviceRows = await db
    .insert(devices)
    .values({
      id: DEMO.deviceId,
      serial: DEMO.serial,
      label: 'Vòng đeo tay của bà An',
      credentialHash: sha256(DEMO.deviceKey),
      firmwareVersion: '0.0.0-sim',
      lastSeenAt: now,
      lastBootId: 'boot-demo-open',
      status: 'active',
    })
    .onConflictDoNothing()
    .returning({ id: devices.id });

  await db
    .insert(deviceAssignments)
    .values({
      id: DEMO.assignmentId,
      deviceId: DEMO.deviceId,
      subjectId: DEMO.subjectAn.id,
      assignedByUserId: DEMO.owner.id,
      startedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    })
    .onConflictDoNothing();

  await seedPolicy(db);
  const telemetryInserted = await seedTelemetry(db, now);
  const incidentsInserted = await seedIncidents(db, now);
  const tasksInserted = await seedTasks(db, now);
  const outboxInserted = await seedNotifications(db, now);
  const remindersInserted = await seedReminders(db, now);
  await seedReminderPeriods(db, now);
  const reminderCompletionsInserted = await seedReminderCompletions(db, now);

  const [telemetryCount] = await db
    .select({ value: count() })
    .from(telemetry)
    .where(eq(telemetry.assignmentId, DEMO.assignmentId));

  return {
    users: 3,
    subjects: 2,
    devices: deviceRows.length,
    assignments: 1,
    careLinks: 1,
    telemetry: telemetryCount?.value ?? telemetryInserted,
    incidents: incidentsInserted,
    tasks: tasksInserted,
    outbox: outboxInserted,
    reminders: remindersInserted,
    reminderCompletions: reminderCompletionsInserted,
  };
}

/**
 * Policy demo khớp nhịp mẫu 5 phút của seed, để coverage/trạng thái thiết bị
 * không bị báo sai (mặc định 15 giây là cho firmware thật, không phải seed).
 */
async function seedPolicy(db: AppDb): Promise<void> {
  const existing = await db
    .select({ id: policyConfigs.id })
    .from(policyConfigs)
    .where(and(eq(policyConfigs.key, 'device_runtime'), eq(policyConfigs.status, 'active')))
    .limit(1);
  if (existing.length > 0) return;
  const value = {
    heartbeatIntervalSeconds: 300,
    offlineAfterSeconds: 900,
    dataFreshAfterSeconds: 600,
    lateEventMinutes: 5,
    maxTelemetryPerMinute: 60,
  };
  await db.insert(policyConfigs).values({
    key: 'device_runtime',
    scope: 'global',
    version: 1,
    status: 'active',
    value,
    digest: computePolicyDigest(value),
  });
}

async function seedTelemetry(db: AppDb, now: Date): Promise<number> {
  // Sửa dữ liệu seed cũ từng bị đánh dấu source='seed' (trước khi có quy ước source).
  await db.execute(sql`update telemetry set source = 'simulator' where source = 'seed'`);
  const existing = await db
    .select({ id: telemetry.id })
    .from(telemetry)
    .where(and(eq(telemetry.deviceId, DEMO.deviceId), eq(telemetry.messageId, 'seed-tel-0')))
    .limit(1);
  if (existing.length > 0) return 0;

  const start = now.getTime() - 6 * 24 * 60 * 60 * 1000;
  const intervalMs = 5 * 60 * 1000;
  const gapWindows: Array<[number, number]> = [
    [start + 18 * 60 * 60 * 1000, start + 20 * 60 * 60 * 1000],
    [start + 70 * 60 * 60 * 1000, start + 72 * 60 * 60 * 1000],
  ];
  const rows: Array<typeof telemetry.$inferInsert> = [];
  let steps = 0;
  let bootIndex = 0;
  let sequence = 0;
  let index = 0;

  for (let time = start; time <= now.getTime(); time += intervalMs) {
    if (gapWindows.some(([from, to]) => time >= from && time < to)) continue;
    const elapsedHours = (time - start) / (60 * 60 * 1000);
    if (Math.floor(elapsedHours / 24) !== bootIndex) {
      bootIndex = Math.floor(elapsedHours / 24);
      sequence = 0;
      // Boot mới: counter steps bắt đầu lại từ 0 (không giữ counter cũ).
      steps = 0;
    }
    sequence += 1;
    const quality: 'valid' | 'poor_signal' | 'not_worn' =
      index % 37 === 0 ? 'not_worn' : index % 19 === 0 ? 'poor_signal' : 'valid';
    const baseHr = 68 + Math.round(7 * Math.sin(elapsedHours / 3));
    const heartRate = quality === 'valid' ? baseHr + (index % 5) - 2 : null;
    // Người cao tuổi đi bộ nhẹ: ~1.000–1.500 bước/ngày, không tạo con số phi thực tế.
    const stepDelta = quality === 'not_worn' ? 0 : index % 9 === 0 ? 12 : 2;
    steps += stepDelta;
    const stepsSinceBoot = steps;

    const measuredAt = new Date(time);
    const qualityValue: TelemetryQuality = { heart_rate: quality, motion: 'valid' };
    const payload = {
      schema_version: '1.0',
      message_id: `seed-tel-${index}`,
      device_id: DEMO.deviceId,
      boot_id: `boot-demo-${bootIndex}`,
      sequence,
      measured_at: measuredAt.toISOString(),
      clock_status: 'synced',
      uptime_ms: (index % 288) * intervalMs,
      metrics: { heart_rate_bpm: heartRate, steps_since_boot: stepsSinceBoot },
      quality: qualityValue,
      battery_percent: 86 - (index % 12),
      firmware_version: '0.0.0-sim',
    };
    rows.push({
      messageId: payload.message_id,
      deviceId: DEMO.deviceId,
      assignmentId: DEMO.assignmentId,
      bootId: payload.boot_id,
      sequence,
      measuredAt,
      receivedAt: new Date(time + 2000),
      clockStatus: 'synced',
      uptimeMs: payload.uptime_ms,
      metrics: payload.metrics,
      quality: qualityValue,
      batteryPercent: payload.battery_percent,
      firmwareVersion: payload.firmware_version,
      isLate: false,
      payloadHash: sha256(JSON.stringify(payload)),
      // Dữ liệu demo phải được đánh dấu rõ là mô phỏng, không phải đo thật.
      source: 'simulator',
    });
    index += 1;
  }

  for (let offset = 0; offset < rows.length; offset += 250) {
    await db
      .insert(telemetry)
      .values(rows.slice(offset, offset + 250))
      .onConflictDoNothing();
  }
  return rows.length;
}

async function seedIncidents(db: AppDb, now: Date): Promise<number> {
  const existing = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(eq(incidents.id, DEMO.openIncidentId))
    .limit(1);
  if (existing.length > 0) return 0;

  const cancelledAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const resolvedAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const openAt = new Date(now.getTime() - 25 * 60 * 1000);

  await db.insert(incidents).values([
    {
      id: DEMO.cancelledIncidentId,
      subjectId: DEMO.subjectAn.id,
      assignmentId: DEMO.assignmentId,
      deviceId: DEMO.deviceId,
      deviceIncidentId: 'seed-incident-cancelled',
      type: 'fall',
      state: 'cancelled',
      lastRevision: 2,
      detectedAt: cancelledAt,
      lastEventAt: cancelledAt,
      cancelledAt,
      version: 2,
    },
    {
      id: DEMO.resolvedIncidentId,
      subjectId: DEMO.subjectAn.id,
      assignmentId: DEMO.assignmentId,
      deviceId: DEMO.deviceId,
      deviceIncidentId: 'seed-incident-resolved',
      type: 'fall',
      state: 'resolved',
      lastRevision: 3,
      detectedAt: resolvedAt,
      lastEventAt: resolvedAt,
      resolvedAt,
      resolvedByUserId: DEMO.owner.id,
      resolutionReason: 'Đã gọi điện và xác nhận bà An an toàn.',
      resolutionOutcome: 'supported',
      version: 3,
    },
    {
      id: DEMO.openIncidentId,
      subjectId: DEMO.subjectAn.id,
      assignmentId: DEMO.assignmentId,
      deviceId: DEMO.deviceId,
      deviceIncidentId: 'seed-incident-open',
      type: 'fall',
      state: 'open',
      lastRevision: 2,
      detectedAt: openAt,
      lastEventAt: openAt,
      version: 2,
    },
  ]);

  const evidence = {
    algorithm_version: 'sim-0.1',
    wear_location: 'wrist',
    motion_quality: 'valid',
    heart_rate_quality: 'valid',
    heart_rate_bpm: 76,
  };
  await db.insert(incidentEvents).values([
    {
      incidentId: DEMO.cancelledIncidentId,
      deviceId: DEMO.deviceId,
      messageId: 'seed-event-cancelled-1',
      eventRevision: 1,
      eventType: 'fall.candidate',
      payload: evidence,
      measuredAt: cancelledAt,
      receivedAt: cancelledAt,
      applied: true,
    },
    {
      incidentId: DEMO.cancelledIncidentId,
      deviceId: DEMO.deviceId,
      messageId: 'seed-event-cancelled-2',
      eventRevision: 2,
      eventType: 'fall.cancelled',
      payload: evidence,
      measuredAt: cancelledAt,
      receivedAt: cancelledAt,
      applied: true,
    },
    {
      incidentId: DEMO.resolvedIncidentId,
      deviceId: DEMO.deviceId,
      messageId: 'seed-event-resolved-1',
      eventRevision: 1,
      eventType: 'fall.candidate',
      payload: evidence,
      measuredAt: resolvedAt,
      receivedAt: resolvedAt,
      applied: true,
    },
    {
      incidentId: DEMO.resolvedIncidentId,
      deviceId: DEMO.deviceId,
      messageId: 'seed-event-resolved-2',
      eventRevision: 2,
      eventType: 'fall.confirmed',
      payload: evidence,
      measuredAt: resolvedAt,
      receivedAt: resolvedAt,
      applied: true,
    },
    {
      incidentId: DEMO.resolvedIncidentId,
      deviceId: DEMO.deviceId,
      messageId: 'seed-event-resolved-3',
      eventRevision: 3,
      eventType: 'user.cancel_requested',
      payload: { ...evidence, notes: 'Người nhà xác nhận đã hỗ trợ' },
      measuredAt: resolvedAt,
      receivedAt: resolvedAt,
      applied: true,
    },
    {
      incidentId: DEMO.openIncidentId,
      deviceId: DEMO.deviceId,
      messageId: 'seed-event-open-1',
      eventRevision: 1,
      eventType: 'fall.candidate',
      payload: evidence,
      measuredAt: openAt,
      receivedAt: openAt,
      applied: true,
    },
    {
      incidentId: DEMO.openIncidentId,
      deviceId: DEMO.deviceId,
      messageId: 'seed-event-open-2',
      eventRevision: 2,
      eventType: 'fall.confirmed',
      payload: evidence,
      measuredAt: openAt,
      receivedAt: openAt,
      applied: true,
    },
  ]);

  await db.insert(realtimeEvents).values({
    subjectId: DEMO.subjectAn.id,
    type: 'alert.updated',
    entityId: DEMO.openIncidentId,
    payload: {
      incidentId: DEMO.openIncidentId,
      subjectId: DEMO.subjectAn.id,
      state: 'open',
      version: 2,
      lastRevision: 2,
      occurredAt: openAt.toISOString(),
    },
    createdAt: openAt,
  });

  return 3;
}

async function seedTasks(db: AppDb, now: Date): Promise<number> {
  const existing = await db
    .select({ id: maintenanceTasks.id })
    .from(maintenanceTasks)
    .where(eq(maintenanceTasks.dedupeKey, 'seed-task-open'))
    .limit(1);
  if (existing.length > 0) return 0;
  await db.insert(maintenanceTasks).values([
    {
      deviceId: DEMO.deviceId,
      subjectId: DEMO.subjectAn.id,
      kind: 'signal_check',
      title: 'Kiểm tra tín hiệu vòng đeo tay tại nhà',
      status: 'open',
      priority: 2,
      dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      notes: 'Dữ liệu bị thiếu hai khoảng trong tuần. Kiểm tra Wi-Fi và sạc.',
      dedupeKey: 'seed-task-open',
    },
    {
      deviceId: DEMO.deviceId,
      subjectId: DEMO.subjectAn.id,
      kind: 'battery_check',
      title: 'Nhắc sạc thiết bị',
      status: 'done',
      priority: 1,
      notes: 'Đã nhắc qua ứng dụng.',
      dedupeKey: 'seed-task-done',
      closedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      closeReason: 'Đã sạc và xác nhận với người nhà.',
    },
  ]);
  return 2;
}

/**
 * Lịch nhắc demo cho bà An (FR-15 phần web). `startsOn` lùi 7 ngày để có
 * lịch sử cho tổng hợp tuân thủ; completion mẫu do `seedReminderCompletions`
 * thêm cho 3 ngày gần nhất, không đánh dấu hôm nay.
 * Idempotent nhờ id cố định + `onConflictDoNothing` (chạy lại không nhân bản).
 */
async function seedReminders(db: AppDb, now: Date): Promise<number> {
  const startsOn = addDays(localDateKey(now, DEMO.subjectAn.timezone), -7);
  const inserted = await db
    .insert(careReminders)
    .values([
      {
        id: DEMO.medicationReminderId,
        subjectId: DEMO.subjectAn.id,
        kind: 'medication',
        title: 'Uống thuốc huyết áp',
        // Gia đình tự đặt — không phải chỉ định do hệ thống sinh ra.
        note: 'Thuốc do gia đình tự đặt, không phải chỉ định của hệ thống',
        times: ['08:00'],
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        startsOn,
        endsOn: null,
        active: true,
      },
      {
        id: DEMO.walkReminderId,
        subjectId: DEMO.subjectAn.id,
        kind: 'activity',
        title: 'Đi bộ nhẹ buổi chiều',
        note: null,
        times: ['16:00'],
        weekdays: [1, 2, 3, 4, 5],
        startsOn,
        endsOn: null,
        active: true,
      },
    ])
    .onConflictDoNothing()
    .returning({ id: careReminders.id });
  return inserted.length;
}

/** Khoảng hiệu lực cho hai lịch demo; bỏ qua nếu đã có (kể cả migration backfill). */
async function seedReminderPeriods(db: AppDb, now: Date): Promise<void> {
  const startsOn = addDays(localDateKey(now, DEMO.subjectAn.timezone), -7);
  const existing = await db
    .select({ id: careReminderPeriods.id })
    .from(careReminderPeriods)
    .where(
      inArray(careReminderPeriods.reminderId, [
        DEMO.medicationReminderId,
        DEMO.walkReminderId,
      ]),
    )
    .limit(1);
  if (existing.length > 0) return;
  await db.insert(careReminderPeriods).values([
    { reminderId: DEMO.medicationReminderId, activeFrom: startsOn, activeTo: null },
    { reminderId: DEMO.walkReminderId, activeFrom: startsOn, activeTo: null },
  ]);
}

/**
 * Đánh dấu mẫu cho 3 ngày gần nhất. Chỉ ngày đúng thứ của lịch; hôm nay để
 * trống để trạng thái “hôm nay” vẫn là chưa đánh dấu khi mới seed.
 */
async function seedReminderCompletions(db: AppDb, now: Date): Promise<number> {
  const timezone = DEMO.subjectAn.timezone;
  const today = localDateKey(now, timezone);
  const existing = await db
    .select({
      id: careReminders.id,
      startsOn: careReminders.startsOn,
      endsOn: careReminders.endsOn,
    })
    .from(careReminders)
    .where(
      inArray(careReminders.id, [DEMO.medicationReminderId, DEMO.walkReminderId]),
    );
  const byId = new Map(existing.map((reminder) => [reminder.id, reminder]));
  const rows: Array<typeof careReminderCompletions.$inferInsert> = [];
  const medicationStatus = ['done', 'done', 'skipped'] as const;

  const covers = (reminderId: string, date: string): boolean => {
    const reminder = byId.get(reminderId);
    if (!reminder || date < reminder.startsOn) return false;
    return reminder.endsOn === null || date <= reminder.endsOn;
  };

  for (let offset = 1; offset <= 3; offset += 1) {
    const occurrenceDate = addDays(today, -offset);
    if (!covers(DEMO.medicationReminderId, occurrenceDate)) continue;
    const completedAt = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
    rows.push({
      reminderId: DEMO.medicationReminderId,
      subjectId: DEMO.subjectAn.id,
      occurrenceDate,
      scheduledTime: '08:00',
      status: medicationStatus[offset - 1] ?? 'done',
      completedByUserId: DEMO.owner.id,
      completedAt,
    });

    const weekday = isoWeekday(occurrenceDate);
    if (weekday >= 1 && weekday <= 5 && offset === 1 && covers(DEMO.walkReminderId, occurrenceDate)) {
      rows.push({
        reminderId: DEMO.walkReminderId,
        subjectId: DEMO.subjectAn.id,
        occurrenceDate,
        scheduledTime: '16:00',
        status: 'done',
        completedByUserId: DEMO.owner.id,
        completedAt,
      });
    }
  }

  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(careReminderCompletions)
    .values(rows)
    .onConflictDoNothing({
      target: [
        careReminderCompletions.reminderId,
        careReminderCompletions.occurrenceDate,
        careReminderCompletions.scheduledTime,
      ],
    })
    .returning({ id: careReminderCompletions.id });
  return inserted.length;
}

async function seedNotifications(db: AppDb, now: Date): Promise<number> {
  const existing = await db
    .select({ id: notificationOutbox.id })
    .from(notificationOutbox)
    .where(eq(notificationOutbox.dedupeKey, 'seed-open-alert-owner'))
    .limit(1);
  if (existing.length > 0) return 0;
  const sentAt = new Date(now.getTime() - 24 * 60 * 1000);
  await db.insert(notificationOutbox).values([
    {
      incidentId: DEMO.openIncidentId,
      revision: 2,
      recipientUserId: DEMO.owner.id,
      channel: 'in_app',
      status: 'sent',
      attempts: 1,
      sentAt,
      dedupeKey: 'seed-open-alert-owner',
    },
    {
      incidentId: DEMO.openIncidentId,
      revision: 2,
      recipientUserId: DEMO.caregiver.id,
      channel: 'in_app',
      status: 'sent',
      attempts: 1,
      sentAt,
      dedupeKey: 'seed-open-alert-caregiver',
    },
  ]);
  return 2;
}

export type { SeedSummary };
