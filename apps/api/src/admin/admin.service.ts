import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, lte, max, or, type SQL } from 'drizzle-orm';
import { INCIDENT_OPEN_STATES, type UserSummary } from '@heart-iot/contracts';
import {
  adminOverviewSchema,
  adminUserListSchema,
  adminUserSummarySchema,
  auditListSchema,
  policyPreviewSchema,
  policyPublishSchema,
  policyStateSchema,
  type AdminOverview,
  type AdminUserList,
  type AdminUserQuery,
  type AdminUserSummary,
  type AuditList,
  type AuditQuery,
  type PolicyPreview,
  type PolicyPreviewRequest,
  type PolicyPublish,
  type PolicyPublishRequest,
  type PolicyState,
  type UpdateUserStatus,
} from '@heart-iot/contracts/admin';
import {
  DEFAULT_POLICY_VALUE,
  policyKeys,
  policyValueSchema,
  type PolicyKey,
  type PolicyValue,
} from '@heart-iot/contracts/policies';
import { DB, type AppDb } from '../database/database';
import {
  auditLogs,
  devices,
  incidents,
  maintenanceTasks,
  notificationOutbox,
  policyConfigs,
  sessions,
  subjects,
  users,
} from '../database/schema';import { AccessService } from '../access/access.service';
import { AuditService } from '../access/audit.service';
import { PolicyService, canonicalPolicyJson, computePolicyDigest } from '../policy/policy.service';
import { AppError } from '../common/app-error';
import { decodeCursor, encodeCursor } from '../common/pagination';
import { isUniqueViolation } from '../database/errors';
import { sha256 } from '../auth/password';

/**
 * AdminService — tài khoản, audit, policy động, tổng quan (wave 3 be-admin).
 *
 * Bất biến:
 * - Mọi phương thức kiểm `requireAdmin` trước khi đọc/ghi.
 * - Không trả passwordHash/tokenHash; danh sách user chỉ có trường đã công bố.
 * - Audit append-only: chỉ đọc, không sửa/xóa.
 * - Policy publish là CAS theo `expectedVersion` trong transaction `FOR UPDATE`;
 *   bản active cũ được chuyển sang trạng thái archive (enum schema hiện dùng
 *   `retired` vì `config_status` không có `archived`); không xóa lịch sử.
 * - Preview trả digest gắn với (value, expectedVersion); publish bắt buộc gửi lại
 *   `previewDigest`, thiếu/khác → 409, không ghi policy.
 * - Audit `policy.publish` (success và conflict) không chứa value đầy đủ: chỉ
 *   key/version/digest/lý do (+note).
 */

// Ngưỡng hợp lý cho maxTelemetryPerMinute — cảnh báo khi preview vượt ngoài.
export const REASONABLE_TELEMETRY_MIN = 10;
export const REASONABLE_TELEMETRY_MAX = 600;

type PolicyConfigRow = typeof policyConfigs.$inferSelect;

function approvalStale(message: string, details?: unknown): AppError {
  return new AppError('APPROVAL_STALE', message, 409, details);
}

/** Lý do 409 đã ghi trong details — dùng lại cho audit conflict. */
function staleReason(error: AppError): string {
  const details = error.details;
  if (details && typeof details === 'object' && 'reason' in details) {
    const reason = (details as { reason?: unknown }).reason;
    if (typeof reason === 'string' && reason.length > 0) return reason;
  }
  return 'version_mismatch';
}

function isPolicyKey(key: string): key is PolicyKey {
  return (policyKeys as readonly string[]).includes(key);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function toAdminUserSummary(row: {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  createdAt: Date;
}): AdminUserSummary {
  return adminUserSummarySchema.parse({
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  });
}

/** Cảnh báo khi preview policy — các cặp ngưỡng theo prompt, ngưỡng ghi ở hằng số trên. */
export function buildPolicyWarnings(value: PolicyValue): string[] {
  const warnings: string[] = [];
  if (value.offlineAfterSeconds < value.heartbeatIntervalSeconds) {
    warnings.push(
      `offlineAfterSeconds (${value.offlineAfterSeconds}s) nhỏ hơn heartbeatIntervalSeconds (${value.heartbeatIntervalSeconds}s): thiết bị có thể bị đánh dấu offline trước khi kịp gửi nhịp tim.`,
    );
  }
  if (value.dataFreshAfterSeconds > value.offlineAfterSeconds) {
    warnings.push(
      `dataFreshAfterSeconds (${value.dataFreshAfterSeconds}s) lớn hơn offlineAfterSeconds (${value.offlineAfterSeconds}s): dữ liệu có thể được coi là mới khi thiết bị đã offline.`,
    );
  }
  if (value.maxTelemetryPerMinute < REASONABLE_TELEMETRY_MIN) {
    warnings.push(
      `maxTelemetryPerMinute (${value.maxTelemetryPerMinute}) quá thấp (dưới ${REASONABLE_TELEMETRY_MIN}): thiết bị gửi hợp lệ có thể bị giới hạn lưu lượng.`,
    );
  }
  if (value.maxTelemetryPerMinute > REASONABLE_TELEMETRY_MAX) {
    warnings.push(
      `maxTelemetryPerMinute (${value.maxTelemetryPerMinute}) quá cao (trên ${REASONABLE_TELEMETRY_MAX}): lưu lượng lớn gây tải hệ thống.`,
    );
  }
  return warnings;
}

const POLICY_FIELDS = [
  'heartbeatIntervalSeconds',
  'offlineAfterSeconds',
  'dataFreshAfterSeconds',
  'lateEventMinutes',
  'maxTelemetryPerMinute',
] as const;

/**
 * Digest ràng buộc nội dung publish với đúng bản xem trước: sha256 của canonical JSON
 * (thứ tự khóa cố định theo schema) + phiên bản nền. Không chứa secret — policy vốn công khai.
 */
export function computePolicyPreviewDigest(value: PolicyValue, expectedVersion: number): string {
  return sha256(`${canonicalPolicyJson(value)}\nbase_version=${expectedVersion}`);
}

function policyDiff(from: PolicyValue, to: PolicyValue): Array<{ field: string; from: number; to: number }> {
  const entries: Array<{ field: string; from: number; to: number }> = [];
  for (const field of POLICY_FIELDS) {
    if (from[field] !== to[field]) {
      entries.push({ field, from: from[field], to: to[field] });
    }
  }
  return entries;
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly policy: PolicyService,
  ) {}

  // ---------------------------------------------------------------------------
  // Người dùng
  // ---------------------------------------------------------------------------

  async listUsers(user: UserSummary, query: AdminUserQuery): Promise<AdminUserList> {
    this.access.requireAdmin(user);

    const filters: Array<SQL | undefined> = [];
    if (query.query) {
      const pattern = `%${escapeLike(query.query)}%`;
      filters.push(or(ilike(users.email, pattern), ilike(users.displayName, pattern)));
    }
    if (query.status) filters.push(eq(users.status, query.status));
    if (query.cursor) filters.push(this.createdAtIdCursorFilter(users.createdAt, users.id, query.cursor));

    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(...filters.filter((item): item is SQL => item !== undefined)))
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const lastRow = page[page.length - 1];
    const nextCursor =
      hasMore && lastRow
        ? encodeCursor({ createdAt: lastRow.createdAt.toISOString(), id: lastRow.id })
        : null;
    return adminUserListSchema.parse({
      items: page.map(toAdminUserSummary),
      nextCursor,
    });
  }

  /** Filter phân trang chung cho thứ tự (createdAt desc, id desc). */
  private createdAtIdCursorFilter(
    createdAtColumn: typeof users.createdAt,
    idColumn: typeof users.id,
    cursorValue: string,
  ): SQL | undefined {
    const cursor = decodeCursor(cursorValue);
    const createdAtRaw = typeof cursor['createdAt'] === 'string' ? cursor['createdAt'] : null;
    const id = typeof cursor['id'] === 'string' ? cursor['id'] : null;
    if (!createdAtRaw || !id) throw AppError.validation('Cursor phân trang không hợp lệ.');
    const createdAt = new Date(createdAtRaw);
    if (Number.isNaN(createdAt.getTime())) throw AppError.validation('Cursor phân trang không hợp lệ.');
    return or(
      lt(createdAtColumn, createdAt),
      and(eq(createdAtColumn, createdAt), lt(idColumn, id)),
    );
  }

  /**
   * Đổi trạng thái tài khoản. Disable: cập nhật user + revoke mọi session đang
   * hoạt động trong cùng transaction; enable: chỉ cập nhật + audit, không tạo
   * session. Không tự disable chính mình. Không đổi role trong wave này.
   */
  async updateUserStatus(
    user: UserSummary,
    targetId: string,
    input: UpdateUserStatus,
  ): Promise<AdminUserSummary> {
    this.access.requireAdmin(user);
    if (targetId === user.id && input.status === 'disabled') {
      throw AppError.conflict('Không thể tự khóa tài khoản của chính mình.');
    }

    const updated = await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(users)
        .where(eq(users.id, targetId))
        .for('update')
        .limit(1);
      const target = rows[0];
      if (!target) throw AppError.notFound('Không tìm thấy tài khoản.');
      if (target.status === input.status) {
        throw AppError.conflict('Trạng thái tài khoản không thay đổi.', {
          status: target.status,
        });
      }

      const now = new Date();
      await tx
        .update(users)
        .set({ status: input.status, updatedAt: now })
        .where(eq(users.id, targetId));
      if (input.status === 'disabled') {
        await tx
          .update(sessions)
          .set({ revokedAt: now })
          .where(and(eq(sessions.userId, targetId), isNull(sessions.revokedAt)));
      }
      await this.audit.record(
        {
          actorUserId: user.id,
          actorKind: 'user',
          action: input.status === 'disabled' ? 'admin.user.disable' : 'admin.user.enable',
          targetType: 'user',
          targetId,
          outcome: 'success',
          metadata: input.reason ? { reason: input.reason } : {},
        },
        tx,
      );
      return { ...target, status: input.status };
    });

    return toAdminUserSummary(updated);
  }

  // ---------------------------------------------------------------------------
  // Audit
  // ---------------------------------------------------------------------------

  /** Chỉ đọc audit đã lưu; metadata trả nguyên bản (đã được lọc khi ghi). */
  async listAudit(user: UserSummary, query: AuditQuery): Promise<AuditList> {
    this.access.requireAdmin(user);

    const filters: Array<SQL | undefined> = [];
    if (query.actorUserId) filters.push(eq(auditLogs.actorUserId, query.actorUserId));
    if (query.action) filters.push(eq(auditLogs.action, query.action));
    if (query.targetType) filters.push(eq(auditLogs.targetType, query.targetType));
    if (query.targetId) filters.push(eq(auditLogs.targetId, query.targetId));
    if (query.from) filters.push(gte(auditLogs.createdAt, new Date(query.from)));
    if (query.to) filters.push(lte(auditLogs.createdAt, new Date(query.to)));
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const createdAtRaw = typeof cursor['createdAt'] === 'string' ? cursor['createdAt'] : null;
      const id = typeof cursor['id'] === 'number' ? cursor['id'] : null;
      if (!createdAtRaw || id === null) throw AppError.validation('Cursor phân trang không hợp lệ.');
      const createdAt = new Date(createdAtRaw);
      if (Number.isNaN(createdAt.getTime())) {
        throw AppError.validation('Cursor phân trang không hợp lệ.');
      }
      filters.push(
        or(
          lt(auditLogs.createdAt, createdAt),
          and(eq(auditLogs.createdAt, createdAt), lt(auditLogs.id, id)),
        ),
      );
    }

    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(and(...filters.filter((item): item is SQL => item !== undefined)))
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const lastRow = page[page.length - 1];
    const nextCursor =
      hasMore && lastRow
        ? encodeCursor({ createdAt: lastRow.createdAt.toISOString(), id: lastRow.id })
        : null;
    return auditListSchema.parse({
      items: page.map((row) => ({
        id: row.id,
        actorUserId: row.actorUserId,
        actorKind: row.actorKind,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        outcome: row.outcome,
        requestId: row.requestId,
        metadata: row.metadata ?? {},
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor,
    });
  }

  // ---------------------------------------------------------------------------
  // Policy động
  // ---------------------------------------------------------------------------

  async getPolicy(user: UserSummary, key: string): Promise<PolicyState> {
    this.access.requireAdmin(user);
    if (!isPolicyKey(key)) throw AppError.notFound('Không tìm thấy policy key này.');

    const rows = await this.db
      .select()
      .from(policyConfigs)
      .where(and(eq(policyConfigs.key, key), eq(policyConfigs.scope, 'global')))
      .orderBy(desc(policyConfigs.version))
      .limit(10);
    const activeRow = rows.find((row) => row.status === 'active') ?? null;
    const activeView = await this.policy.getActive(key);

    const updatedByIds = [
      ...new Set(
        rows
          .map((row) => row.updatedByUserId)
          .filter((value): value is string => value !== null),
      ),
    ];
    const userRows = updatedByIds.length
      ? await this.db
          .select({ id: users.id, displayName: users.displayName })
          .from(users)
          .where(inArray(users.id, updatedByIds))
      : [];
    const userById = new Map(userRows.map((row) => [row.id, row]));

    const toRef = (userId: string | null) => {
      if (!userId) return null;
      const row = userById.get(userId);
      return row ? { id: row.id, displayName: row.displayName } : null;
    };

    return policyStateSchema.parse({
      key,
      active: {
        version: activeView.version,
        value: activeView.value,
        digest: activeView.digest,
        source: activeView.source,
        updatedAt: activeRow ? activeRow.createdAt.toISOString() : null,
        updatedBy: activeRow ? toRef(activeRow.updatedByUserId) : null,
      },
      defaults: DEFAULT_POLICY_VALUE,
      history: rows.map((row) => ({
        version: row.version,
        status: row.status,
        digest: row.digest,
        updatedAt: row.createdAt.toISOString(),
        updatedBy: toRef(row.updatedByUserId),
      })),
    });
  }

  /** Preview: validate + digest + cảnh báo + diff với bản active; KHÔNG ghi DB. */
  async previewPolicy(
    user: UserSummary,
    key: string,
    input: PolicyPreviewRequest,
  ): Promise<PolicyPreview> {
    this.access.requireAdmin(user);
    if (!isPolicyKey(key)) throw AppError.notFound('Không tìm thấy policy key này.');

    // Pipe đã validate; parse lại để chắc chắn không có đường nào lọt giá trị lạ.
    const value = policyValueSchema.parse(input.value);
    const current = await this.policy.getActive(key);

    // Preview phải gắn với đúng phiên bản nền người vận hành đang xem.
    if (input.expectedVersion !== current.version) {
      throw approvalStale('Phiên bản policy đã thay đổi, hãy tải lại trước khi xem trước.', {
        reason: 'version_mismatch',
        currentVersion: current.version,
        currentDigest: current.digest,
      });
    }

    const digest = computePolicyPreviewDigest(value, input.expectedVersion);
    const warnings = buildPolicyWarnings(value);
    const effectiveDiff = policyDiff(current.value, value);

    return policyPreviewSchema.parse({
      valid: true,
      value,
      digest,
      expectedVersion: input.expectedVersion,
      warnings,
      effectiveDiff,
    });
  }

  /**
   * Publish CAS: phải gửi `previewDigest` đúng cho (value, expectedVersion), sau đó
   * expectedVersion phải bằng version active hiện tại. Thiếu/khác digest hoặc lệch
   * version → 409 APPROVAL_STALE, ghi audit conflict và KHÔNG ghi policy.
   * Archive bản active cũ (enum schema: `retired`), insert bản mới `active` với digest
   * canonical. Rollback = publish lại value cũ với version mới (lịch sử không bị xóa).
   */
  async publishPolicy(
    user: UserSummary,
    key: string,
    input: PolicyPublishRequest,
  ): Promise<PolicyPublish> {
    this.access.requireAdmin(user);
    if (!isPolicyKey(key)) throw AppError.notFound('Không tìm thấy policy key này.');

    const value = policyValueSchema.parse(input.value);
    const digest = computePolicyDigest(value);

    // Cổng 1 — nội dung: publish phải khớp đúng bản đã xem trước. Không đọc/ghi DB
    // trước khi qua cổng này, nên nội dung khác bản duyệt không thể tạo bản ghi mới.
    const previewDigest = input.previewDigest?.trim() ?? '';
    if (previewDigest !== computePolicyPreviewDigest(value, input.expectedVersion)) {
      const reason = previewDigest ? 'preview_mismatch' : 'preview_missing';
      await this.recordPublishConflict(user, key, input.expectedVersion, reason);
      throw approvalStale(
        'Nội dung đã thay đổi so với bản xem trước, hãy xem lại preview trước khi công bố.',
        { reason, expectedVersion: input.expectedVersion },
      );
    }

    let inserted: PolicyConfigRow;
    try {
      inserted = await this.db.transaction(async (tx) => {
        const activeRows = await tx
          .select()
          .from(policyConfigs)
          .where(
            and(
              eq(policyConfigs.key, key),
              eq(policyConfigs.scope, 'global'),
              eq(policyConfigs.status, 'active'),
            ),
          )
          .orderBy(desc(policyConfigs.version))
          .for('update')
          .limit(1);
        const activeRow = activeRows[0] ?? null;

        const currentVersion = activeRow?.version ?? 0;
        const currentDigest = activeRow?.digest ?? computePolicyDigest(DEFAULT_POLICY_VALUE);
        if (input.expectedVersion !== currentVersion) {
          throw approvalStale('Phiên bản policy đã thay đổi, hãy tải lại trước khi công bố.', {
            reason: 'version_mismatch',
            currentVersion,
            currentDigest,
          });
        }

        const maxRows = await tx
          .select({ m: max(policyConfigs.version) })
          .from(policyConfigs)
          .where(and(eq(policyConfigs.key, key), eq(policyConfigs.scope, 'global')));
        const version = (maxRows[0]?.m ?? 0) + 1;

        let row: PolicyConfigRow;
        try {
          const created = await tx
            .insert(policyConfigs)
            .values({
              key,
              scope: 'global',
              version,
              status: 'active',
              value,
              digest,
              updatedByUserId: user.id,
            })
            .returning();
          row = created[0] as PolicyConfigRow;
        } catch (error) {
          // Hai publish đồng thời khi chưa có bản active nào: unique (key, scope, version).
          if (isUniqueViolation(error)) {
            throw approvalStale('Phiên bản policy đã thay đổi trong lúc công bố, hãy thử lại.', {
              reason: 'publish_race',
              currentVersion,
            });
          }
          throw error;
        }
        if (!row) throw new Error('Không thể tạo bản policy mới.');

        if (activeRow) {
          // Archive bản active cũ; enum config_status không có 'archived' nên dùng 'retired'.
          await tx
            .update(policyConfigs)
            .set({ status: 'retired' })
            .where(eq(policyConfigs.id, activeRow.id));
        }
        await this.audit.record(
          {
            actorUserId: user.id,
            actorKind: 'user',
            action: 'policy.publish',
            targetType: 'policy',
            targetId: key,
            outcome: 'success',
            // Metadata không chứa value đầy đủ: chỉ key/version/digest (+note).
            metadata: { key, version, digest, ...(input.note ? { note: input.note } : {}) },
          },
          tx,
        );
        return row;
      });
    } catch (error) {
      // Transaction đã rollback (không có policy mới) — vẫn phải lưu audit conflict.
      if (error instanceof AppError && error.code === 'APPROVAL_STALE') {
        await this.recordPublishConflict(user, key, input.expectedVersion, staleReason(error));
      }
      throw error;
    }

    return policyPublishSchema.parse({
      key,
      version: inserted.version,
      digest: inserted.digest,
      status: 'active',
      publishedAt: inserted.createdAt.toISOString(),
      note: input.note ?? null,
    });
  }

  /** Audit publish thất bại: chỉ key/phiên bản nền/lý do — không chứa value hay secret. */
  private async recordPublishConflict(
    user: UserSummary,
    key: PolicyKey,
    expectedVersion: number,
    reason: string,
  ): Promise<void> {
    await this.audit.record({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'policy.publish',
      targetType: 'policy',
      targetId: key,
      outcome: 'conflict',
      metadata: { key, expectedVersion, reason },
    });
  }

  // ---------------------------------------------------------------------------
  // Tổng quan
  // ---------------------------------------------------------------------------

  async getOverview(user: UserSummary): Promise<AdminOverview> {
    this.access.requireAdmin(user);
    const policyView = await this.policy.getActive();
    const now = Date.now();

    const [activeUsers, disabledUsers, subjectsTotal, deviceRows, alertsOpen, tasksOpen, pendingOutbox, failedOutbox] =
      await Promise.all([
        this.db.select({ total: count() }).from(users).where(eq(users.status, 'active')),
        this.db.select({ total: count() }).from(users).where(eq(users.status, 'disabled')),
        this.db.select({ total: count() }).from(subjects).where(isNull(subjects.archivedAt)),
        this.db.select({ lastSeenAt: devices.lastSeenAt }).from(devices).where(eq(devices.status, 'active')),
        this.db
          .select({ total: count() })
          .from(incidents)
          .where(inArray(incidents.state, [...INCIDENT_OPEN_STATES])),
        this.db
          .select({ total: count() })
          .from(maintenanceTasks)
          .where(inArray(maintenanceTasks.status, ['open', 'in_progress'])),
        this.db
          .select({ total: count() })
          .from(notificationOutbox)
          .where(eq(notificationOutbox.status, 'pending')),
        this.db
          .select({ total: count() })
          .from(notificationOutbox)
          .where(eq(notificationOutbox.status, 'failed')),
      ]);

    const offlineAfterMs = policyView.value.offlineAfterSeconds * 1000;
    const online = deviceRows.filter(
      (row) => row.lastSeenAt !== null && now - row.lastSeenAt.getTime() <= offlineAfterMs,
    ).length;

    return adminOverviewSchema.parse({
      users: {
        active: Number(activeUsers[0]?.total ?? 0),
        disabled: Number(disabledUsers[0]?.total ?? 0),
      },
      subjects: { total: Number(subjectsTotal[0]?.total ?? 0) },
      devices: { online, offline: deviceRows.length - online },
      alerts: { open: Number(alertsOpen[0]?.total ?? 0) },
      tasks: { open: Number(tasksOpen[0]?.total ?? 0) },
      outbox: {
        pending: Number(pendingOutbox[0]?.total ?? 0),
        failed: Number(failedOutbox[0]?.total ?? 0),
      },
    });
  }
}
