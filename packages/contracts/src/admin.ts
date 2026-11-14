import { z } from 'zod';
import { idSchema, isoDateTimeSchema, pageSchema, userRoleSchema, userStatusSchema } from './core';
import { DEFAULT_POLICY_VALUE, policyValueSchema, type PolicyValue } from './policies';

/**
 * Hợp đồng quản trị — wave 3 be-admin.
 *
 * Nguyên tắc chung:
 * - Mọi endpoint trong nhóm này chỉ admin (kiểm `requireAdmin` ở service trước khi
 *   đọc/ghi bất kỳ dữ liệu nào).
 * - Không trả `credentialHash`, `tokenHash`, cookie hay dữ liệu sức khỏe.
 * - Audit là append-only: chỉ đọc, không có endpoint sửa/xóa.
 */

// ---------------------------------------------------------------------------
// Người dùng
// ---------------------------------------------------------------------------

/** Danh sách tài khoản — không bao giờ chứa hash mật khẩu hay thông tin phiên. */
export const adminUserSummarySchema = z.object({
  id: idSchema,
  email: z.email(),
  displayName: z.string().min(1).max(120),
  role: userRoleSchema,
  status: userStatusSchema,
  createdAt: isoDateTimeSchema,
});
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

/** GET /admin/users — tìm theo email/tên, lọc status, phân trang (createdAt,id) desc. */
export const adminUserQuerySchema = z.object({
  query: z.string().trim().max(120).optional(),
  status: userStatusSchema.optional(),
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;

export const adminUserListSchema = pageSchema(adminUserSummarySchema);
export type AdminUserList = z.infer<typeof adminUserListSchema>;

/**
 * PATCH /admin/users/:id/status — đổi trạng thái tài khoản.
 * Wave này KHÔNG hỗ trợ đổi role: role không nằm trong schema.
 */
export const updateUserStatusSchema = z
  .object({
    status: userStatusSchema,
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export type UpdateUserStatus = z.infer<typeof updateUserStatusSchema>;

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export const auditOutcomeSchema = z.enum(['success', 'failed', 'denied', 'conflict']);
export type AuditOutcome = z.infer<typeof auditOutcomeSchema>;

export const auditEntrySchema = z.object({
  id: z.number().int().positive(),
  actorUserId: idSchema.nullable(),
  actorKind: z.enum(['user', 'device', 'system', 'ai']),
  action: z.string().min(1).max(200),
  targetType: z.string().min(1).max(120),
  targetId: z.string().max(200).nullable(),
  outcome: auditOutcomeSchema,
  requestId: z.string().max(100).nullable(),
  /** Metadata nguyên bản đã lọc khi ghi — không thêm dữ liệu sức khỏe khi đọc. */
  metadata: z.record(z.string(), z.unknown()),
  createdAt: isoDateTimeSchema,
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

/** GET /admin/audit — lọc + phân trang cursor (createdAt,id) desc. */
export const auditQuerySchema = z.object({
  actorUserId: idSchema.optional(),
  action: z.string().trim().min(1).max(120).optional(),
  targetType: z.string().trim().min(1).max(120).optional(),
  targetId: z.string().trim().min(1).max(200).optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const auditListSchema = pageSchema(auditEntrySchema);
export type AuditList = z.infer<typeof auditListSchema>;

// ---------------------------------------------------------------------------
// Policy động
// ---------------------------------------------------------------------------

/** POST /admin/policies/:key/previews — chỉ validate, không ghi DB. */
export const policyPreviewRequestSchema = z.object({ value: policyValueSchema }).strict();
export type PolicyPreviewRequest = z.infer<typeof policyPreviewRequestSchema>;

export const policyDiffEntrySchema = z.object({
  field: z.string().min(1),
  from: z.union([z.number(), z.null()]),
  to: z.union([z.number(), z.null()]),
});
export type PolicyDiffEntry = z.infer<typeof policyDiffEntrySchema>;

export const policyPreviewSchema = z.object({
  valid: z.boolean(),
  value: policyValueSchema.nullable(),
  digest: z.string().nullable(),
  warnings: z.array(z.string()),
  effectiveDiff: z.array(policyDiffEntrySchema),
});
export type PolicyPreview = z.infer<typeof policyPreviewSchema>;

/** PUT /admin/policies/:key — publish CAS theo expectedVersion. */
export const policyPublishRequestSchema = z
  .object({
    value: policyValueSchema,
    expectedVersion: z.number().int().nonnegative(),
    note: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export type PolicyPublishRequest = z.infer<typeof policyPublishRequestSchema>;

export const policyPublishSchema = z.object({
  key: z.string().min(1).max(80),
  version: z.number().int().positive(),
  digest: z.string().min(1),
  status: z.literal('active'),
  publishedAt: isoDateTimeSchema,
  note: z.string().max(500).nullable(),
});
export type PolicyPublish = z.infer<typeof policyPublishSchema>;

export const policyUserRefSchema = z.object({
  id: idSchema,
  displayName: z.string(),
});
export type PolicyUserRef = z.infer<typeof policyUserRefSchema>;

export const policyActiveSchema = z.object({
  version: z.number().int().nonnegative(),
  value: policyValueSchema,
  digest: z.string().min(1),
  source: z.enum(['default', 'database']),
  updatedAt: isoDateTimeSchema.nullable(),
  updatedBy: policyUserRefSchema.nullable(),
});
export type PolicyActive = z.infer<typeof policyActiveSchema>;

export const policyHistoryEntrySchema = z.object({
  version: z.number().int().positive(),
  status: z.enum(['draft', 'active', 'retired']),
  digest: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: policyUserRefSchema.nullable(),
});
export type PolicyHistoryEntry = z.infer<typeof policyHistoryEntrySchema>;

/** GET /admin/policies/:key — bản active + defaults + 10 phiên bản gần nhất. */
export const policyStateSchema = z.object({
  key: z.string().min(1).max(80),
  active: policyActiveSchema,
  defaults: policyValueSchema,
  history: z.array(policyHistoryEntrySchema).max(10),
});
export type PolicyState = z.infer<typeof policyStateSchema>;

// ---------------------------------------------------------------------------
// Tổng quan
// ---------------------------------------------------------------------------

export const adminOverviewSchema = z.object({
  users: z.object({
    active: z.number().int().nonnegative(),
    disabled: z.number().int().nonnegative(),
  }),
  subjects: z.object({ total: z.number().int().nonnegative() }),
  devices: z.object({
    online: z.number().int().nonnegative(),
    offline: z.number().int().nonnegative(),
  }),
  alerts: z.object({ open: z.number().int().nonnegative() }),
  tasks: z.object({ open: z.number().int().nonnegative() }),
  outbox: z.object({
    pending: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;

/** Giá trị mặc định dùng lại từ contracts/policies — một nguồn duy nhất. */
export const POLICY_DEFAULTS: PolicyValue = DEFAULT_POLICY_VALUE;
