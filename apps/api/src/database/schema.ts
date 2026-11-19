import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { CarePermissions } from '@heart-iot/contracts';
import type { DeviceStatus } from '@heart-iot/contracts/telemetry';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const happenedAt = (name: string) => timestamp(name, { withTimezone: true });

export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);
export const userStatusEnum = pgEnum('user_status', ['active', 'disabled']);
export const careLinkStatusEnum = pgEnum('care_link_status', ['active', 'revoked']);
export const incidentTypeEnum = pgEnum('incident_type', ['fall', 'sos']);
export const incidentStateEnum = pgEnum('incident_state', [
  'suspected',
  'open',
  'acknowledged',
  'resolved',
  'cancelled',
  'unconfirmed',
]);
export const incidentEventTypeEnum = pgEnum('incident_event_type', [
  'fall.candidate',
  'fall.cancelled',
  'fall.confirmed',
  'user.cancel_requested',
  'sos.confirmed',
]);
export const alertActionEnum = pgEnum('alert_action', ['acknowledge', 'resolve']);
export const alertActionOutcomeEnum = pgEnum('alert_action_outcome', ['applied', 'conflict', 'forbidden']);
export const outboxStatusEnum = pgEnum('outbox_status', [
  'pending',
  'sending',
  'sent',
  'failed',
  'superseded',
]);
export const actorKindEnum = pgEnum('actor_kind', ['user', 'device', 'system', 'ai']);
export const runStatusEnum = pgEnum('run_status', [
  'queued',
  'planning',
  'waiting_input',
  'waiting_approval',
  'running',
  'reconciling',
  'stopping',
  'suspended',
  'succeeded',
  'partially_succeeded',
  'failed',
  'cancelled',
]);
export const stepStatusEnum = pgEnum('step_status', [
  'pending',
  'waiting_input',
  'waiting_approval',
  'running',
  'waiting_retry',
  'suspended',
  'unknown',
  'succeeded',
  'failed',
  'skipped',
  'cancelled',
]);
export const maintenanceTaskStatusEnum = pgEnum('maintenance_task_status', [
  'open',
  'in_progress',
  'done',
  'cancelled',
]);
export const aiSummaryStatusEnum = pgEnum('ai_summary_status', ['ready', 'failed', 'superseded']);
export const viewScopeEnum = pgEnum('view_scope', ['user', 'subject', 'global']);
export const viewStatusEnum = pgEnum('view_status', ['draft', 'published', 'archived']);
export const publicationStatusEnum = pgEnum('publication_status', ['active', 'superseded', 'rolled_back']);
export const configStatusEnum = pgEnum('config_status', ['draft', 'active', 'retired']);

export type TelemetryMetrics = {
  heart_rate_bpm: number | null;
  steps_since_boot: number;
};
export type TelemetryQuality = {
  heart_rate: 'valid' | 'poor_signal' | 'not_worn' | 'sensor_error';
  motion: 'valid' | 'sensor_error';
};
export type IncidentEvidence = {
  algorithm_version: string;
  wear_location: string | null;
  motion_quality: 'valid' | 'sensor_error';
  heart_rate_quality: 'valid' | 'poor_signal' | 'not_worn' | 'sensor_error';
  heart_rate_bpm: number | null;
  notes?: string;
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    role: userRoleEnum('role').notNull().default('user'),
    status: userStatusEnum('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('users_email_normalized_uq').on(table.emailNormalized)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: happenedAt('revoked_at'),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_uq').on(table.tokenHash),
    index('sessions_user_idx').on(table.userId, table.expiresAt),
  ],
);

export const subjects = pgTable(
  'subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    displayName: text('display_name').notNull(),
    timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: happenedAt('archived_at'),
  },
  (table) => [index('subjects_owner_idx').on(table.ownerUserId)],
);

export const careLinks = pgTable(
  'care_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    caregiverUserId: uuid('caregiver_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    invitedByUserId: uuid('invited_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    permissions: jsonb('permissions').$type<CarePermissions>().notNull(),
    status: careLinkStatusEnum('status').notNull().default('active'),
    sharedFrom: timestamp('shared_from', { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: happenedAt('revoked_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('care_links_active_uq')
      .on(table.subjectId, table.caregiverUserId)
      .where(sql`revoked_at is null`),
    index('care_links_caregiver_idx').on(table.caregiverUserId, table.status),
  ],
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    tokenHash: text('token_hash').notNull(),
    permissions: jsonb('permissions').$type<CarePermissions>().notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: happenedAt('accepted_at'),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    revokedAt: happenedAt('revoked_at'),
  },
  (table) => [
    uniqueIndex('invitations_token_hash_uq').on(table.tokenHash),
    index('invitations_subject_idx').on(table.subjectId, table.expiresAt),
  ],
);

export const emergencyContacts = pgTable(
  'emergency_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    relationship: text('relationship').notNull(),
    phone: text('phone').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('emergency_contacts_subject_idx').on(table.subjectId),
    uniqueIndex('emergency_contacts_primary_uq')
      .on(table.subjectId)
      .where(sql`is_primary`),
  ],
);

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serial: text('serial').notNull(),
    label: text('label').notNull(),
    credentialHash: text('credential_hash').notNull(),
    claimCodeHash: text('claim_code_hash'),
    claimCodeExpiresAt: timestamp('claim_code_expires_at', { withTimezone: true }),
    firmwareVersion: text('firmware_version'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    lastBootId: text('last_boot_id'),
    status: text('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('devices_serial_uq').on(table.serial)],
);

export const deviceAssignments = pgTable(
  'device_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    assignedByUserId: uuid('assigned_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: happenedAt('ended_at'),
  },
  (table) => [
    uniqueIndex('device_assignments_open_uq').on(table.deviceId).where(sql`ended_at is null`),
    index('device_assignments_subject_idx').on(table.subjectId, table.startedAt),
  ],
);

export const telemetry = pgTable(
  'telemetry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: text('message_id').notNull(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => deviceAssignments.id, { onDelete: 'restrict' }),
    bootId: text('boot_id').notNull(),
    sequence: integer('sequence').notNull(),
    measuredAt: timestamp('measured_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    clockStatus: text('clock_status').notNull(),
    uptimeMs: bigint('uptime_ms', { mode: 'number' }).notNull(),
    metrics: jsonb('metrics').$type<TelemetryMetrics>().notNull(),
    quality: jsonb('quality').$type<TelemetryQuality>().notNull(),
    batteryPercent: integer('battery_percent'),
    firmwareVersion: text('firmware_version').notNull(),
    isLate: boolean('is_late').notNull().default(false),
    isQuarantined: boolean('is_quarantined').notNull().default(false),
    payloadHash: text('payload_hash').notNull(),
    source: text('source').notNull().default('http'),
  },
  (table) => [
    uniqueIndex('telemetry_message_uq').on(table.deviceId, table.messageId),
    uniqueIndex('telemetry_sequence_uq').on(table.deviceId, table.bootId, table.sequence),
    index('telemetry_assignment_time_idx').on(table.assignmentId, table.measuredAt),
    index('telemetry_received_idx').on(table.receivedAt),
  ],
);

export const incidents = pgTable(
  'incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => deviceAssignments.id, { onDelete: 'restrict' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    deviceIncidentId: text('device_incident_id').notNull(),
    type: incidentTypeEnum('type').notNull(),
    state: incidentStateEnum('state').notNull(),
    lastRevision: integer('last_revision').notNull(),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull(),
    lastEventAt: timestamp('last_event_at', { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: happenedAt('cancelled_at'),
    resolvedAt: happenedAt('resolved_at'),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    resolutionReason: text('resolution_reason'),
    resolutionOutcome: text('resolution_outcome'),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('incidents_device_local_uq').on(table.deviceId, table.deviceIncidentId),
    index('incidents_subject_state_idx').on(table.subjectId, table.state, table.detectedAt),
  ],
);

export const incidentEvents = pgTable(
  'incident_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    messageId: text('message_id').notNull(),
    eventRevision: integer('event_revision').notNull(),
    eventType: incidentEventTypeEnum('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    measuredAt: timestamp('measured_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    applied: boolean('applied').notNull().default(false),
    conflictReason: text('conflict_reason'),
  },
  (table) => [
    uniqueIndex('incident_events_revision_uq').on(table.incidentId, table.eventRevision),
    uniqueIndex('incident_events_message_uq').on(table.deviceId, table.messageId),
    index('incident_events_received_idx').on(table.receivedAt),
  ],
);

export const alertActions = pgTable(
  'alert_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: alertActionEnum('action').notNull(),
    reason: text('reason'),
    outcome: alertActionOutcomeEnum('outcome').notNull(),
    stateBefore: incidentStateEnum('state_before').notNull(),
    stateAfter: incidentStateEnum('state_after').notNull(),
    requestId: text('request_id'),
    createdAt: createdAt(),
  },
  (table) => [index('alert_actions_incident_idx').on(table.incidentId, table.createdAt)],
);

export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull().default('in_app'),
    status: outboxStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    sentAt: happenedAt('sent_at'),
    readAt: happenedAt('read_at'),
    supersededAt: happenedAt('superseded_at'),
    dedupeKey: text('dedupe_key').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('notification_outbox_dedupe_uq').on(table.dedupeKey),
    index('notification_outbox_due_idx').on(table.status, table.nextAttemptAt),
    index('notification_outbox_recipient_idx').on(table.recipientUserId, table.createdAt),
  ],
);

export const realtimeEvents = pgTable(
  'realtime_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    entityId: text('entity_id'),
    payload: jsonb('payload').notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [index('realtime_subject_idx').on(table.subjectId, table.id)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorKind: actorKindEnum('actor_kind').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    outcome: text('outcome').notNull(),
    requestId: text('request_id'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index('audit_logs_created_idx').on(table.createdAt),
    index('audit_logs_actor_idx').on(table.actorUserId, table.createdAt),
    index('audit_logs_target_idx').on(table.targetType, table.targetId),
  ],
);

export const delegations = pgTable(
  'delegations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scope: jsonb('scope').notNull(),
    capabilities: jsonb('capabilities').notNull(),
    limits: jsonb('limits').notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: happenedAt('revoked_at'),
  },
  (table) => [index('delegations_actor_idx').on(table.actorUserId)],
);

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    executionPrincipal: text('execution_principal').notNull().default('agent-runtime'),
    delegationId: uuid('delegation_id').references(() => delegations.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    status: runStatusEnum('status').notNull().default('queued'),
    planVersion: integer('plan_version').notNull().default(1),
    requestKey: text('request_key').notNull(),
    inputFingerprint: text('input_fingerprint').notNull(),
    input: jsonb('input').notNull(),
    result: jsonb('result'),
    errorCode: text('error_code'),
    cancelRequestedAt: happenedAt('cancel_requested_at'),
    rootExecutionId: uuid('root_execution_id'),
    parentRunId: uuid('parent_run_id'),
    causedByEventId: text('caused_by_event_id'),
    startedAt: happenedAt('started_at'),
    finishedAt: happenedAt('finished_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('agent_runs_request_uq').on(table.actorUserId, table.requestKey),
    index('agent_runs_status_idx').on(table.status, table.createdAt),
    index('agent_runs_actor_idx').on(table.actorUserId, table.createdAt),
  ],
);

export const runSteps = pgTable(
  'run_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    stepIndex: integer('step_index').notNull(),
    capabilityId: text('capability_id').notNull(),
    status: stepStatusEnum('status').notNull().default('pending'),
    input: jsonb('input').notNull().default({}),
    output: jsonb('output'),
    errorCode: text('error_code'),
    idempotencyKey: text('idempotency_key'),
    attemptCount: integer('attempt_count').notNull().default(0),
    createdAt: createdAt(),
    startedAt: happenedAt('started_at'),
    finishedAt: happenedAt('finished_at'),
  },
  (table) => [uniqueIndex('run_steps_index_uq').on(table.runId, table.stepIndex)],
);

export const stepAttempts = pgTable(
  'step_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stepId: uuid('step_id')
      .notNull()
      .references(() => runSteps.id, { onDelete: 'cascade' }),
    attemptNumber: integer('attempt_number').notNull(),
    status: text('status').notNull(),
    errorCode: text('error_code'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: happenedAt('finished_at'),
  },
  (table) => [uniqueIndex('step_attempts_uq').on(table.stepId, table.attemptNumber)],
);

export const aiSummaries = pgTable(
  'ai_summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    status: aiSummaryStatusEnum('status').notNull().default('ready'),
    provider: text('provider').notNull(),
    model: text('model'),
    content: jsonb('content').notNull(),
    aggregate: jsonb('aggregate').notNull(),
    sourceRefs: jsonb('source_refs').notNull().default([]),
    createdAt: createdAt(),
  },
  (table) => [index('ai_summaries_subject_idx').on(table.subjectId, table.periodEnd)],
);

export const maintenanceTasks = pgTable(
  'maintenance_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    status: maintenanceTaskStatusEnum('status').notNull().default('open'),
    priority: integer('priority').notNull().default(1),
    dueAt: happenedAt('due_at'),
    notes: text('notes'),
    createdByRunId: uuid('created_by_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    dedupeKey: text('dedupe_key').notNull(),
    assigneeUserId: uuid('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    closedAt: happenedAt('closed_at'),
    closeReason: text('close_reason'),
  },
  (table) => [
    uniqueIndex('maintenance_tasks_dedupe_uq').on(table.dedupeKey),
    index('maintenance_tasks_status_idx').on(table.status, table.createdAt),
  ],
);

/**
 * Lịch nhắc chăm sóc (FR-15 phần web). Giờ nhắc là giờ địa phương theo
 * `subjects.timezone`; KHÔNG có trường liều lượng hay nội dung y khoa tự sinh.
 * `starts_on`/`ends_on` là ngày địa phương dạng YYYY-MM-DD (kiểu date, không
 * phải timestamp) để so sánh ngày không lệ thuộc múi giờ máy chủ.
 */
export const careReminders = pgTable(
  'care_reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    note: text('note'),
    /** Mảng `HH:MM` tăng dần, 1..6 phần tử — contract `reminderTimesSchema`. */
    times: jsonb('times').$type<string[]>().notNull(),
    /** Mảng ISO weekday 1..7 tăng dần — contract `reminderWeekdaysSchema`. */
    weekdays: jsonb('weekdays').$type<number[]>().notNull(),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('care_reminders_subject_idx').on(table.subjectId, table.startsOn)],
);

/**
 * Đánh dấu đã thực hiện/bỏ qua một occurrence của lịch nhắc.
 * Khoá nghiệp vụ `(reminder_id, occurrence_date, scheduled_time)` là unique để
 * API ghi đè idempotent; xoá lịch nhắc xoá luôn đánh dấu (cascade).
 */
export const careReminderCompletions = pgTable(
  'care_reminder_completions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reminderId: uuid('reminder_id')
      .notNull()
      .references(() => careReminders.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    occurrenceDate: date('occurrence_date', { mode: 'string' }).notNull(),
    scheduledTime: text('scheduled_time').notNull(),
    /** `done` | `skipped` — chặn thêm bởi CHECK trong migration. */
    status: text('status').notNull(),
    /** Người bấm đánh dấu; tài khoản bị xoá thì null (không suy đoán người khác). */
    completedByUserId: uuid('completed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('care_reminder_completions_key_uq').on(
      table.reminderId,
      table.occurrenceDate,
      table.scheduledTime,
    ),
    index('care_reminder_completions_reminder_idx').on(table.reminderId, table.occurrenceDate),
    check(
      'care_reminder_completions_status_chk',
      sql`${table.status} in ('done', 'skipped')`,
    ),
    check(
      'care_reminder_completions_time_chk',
      sql`${table.scheduledTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`,
    ),
  ],
);

export type WorkspaceViewConfig = {
  version: 1;
  layout: 'stack' | 'grid';
  widgets: Array<{
    id: string;
    type: 'metric' | 'chart' | 'alerts' | 'summary' | 'tasks';
    title: string;
    span: 1 | 2 | 3;
    options?: Record<string, unknown>;
  }>;
};

export const workspaceViews = pgTable(
  'workspace_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    scope: viewScopeEnum('scope').notNull(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'cascade' }),
    schemaVersion: integer('schema_version').notNull().default(1),
    status: viewStatusEnum('status').notNull().default('draft'),
    draftConfig: jsonb('draft_config').$type<WorkspaceViewConfig>().notNull(),
    draftRevision: integer('draft_revision').notNull().default(0),
    draftDigest: text('draft_digest'),
    baseRevision: integer('base_revision').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('workspace_views_owner_key_uq').on(table.ownerUserId, table.key)],
);

export const viewPublications = pgTable(
  'view_publications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    viewId: uuid('view_id')
      .notNull()
      .references(() => workspaceViews.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    config: jsonb('config').$type<WorkspaceViewConfig>().notNull(),
    digest: text('digest').notNull(),
    approvedByUserId: uuid('approved_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    publishedByUserId: uuid('published_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: publicationStatusEnum('status').notNull().default('active'),
    previousPublicationId: uuid('previous_publication_id'),
    note: text('note'),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('view_publications_revision_uq').on(table.viewId, table.revision),
    index('view_publications_view_idx').on(table.viewId, table.publishedAt),
  ],
);

export const policyConfigs = pgTable(
  'policy_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    scope: text('scope').notNull().default('global'),
    version: integer('version').notNull(),
    status: configStatusEnum('status').notNull().default('draft'),
    value: jsonb('value').notNull(),
    digest: text('digest').notNull(),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('policy_configs_version_uq').on(table.key, table.scope, table.version),
    index('policy_configs_active_idx').on(table.key, table.status),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type SubjectRow = typeof subjects.$inferSelect;
export type CareLinkRow = typeof careLinks.$inferSelect;
export type DeviceRow = typeof devices.$inferSelect;
export type AssignmentRow = typeof deviceAssignments.$inferSelect;
export type TelemetryRow = typeof telemetry.$inferSelect;
export type IncidentRow = typeof incidents.$inferSelect;
export type CareReminderRow = typeof careReminders.$inferSelect;
export type CareReminderCompletionRow = typeof careReminderCompletions.$inferSelect;
export type AgentRunRow = typeof agentRuns.$inferSelect;
export type WorkspaceViewRow = typeof workspaceViews.$inferSelect;
export type DeviceStatusView = DeviceStatus;
