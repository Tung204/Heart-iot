import { z } from 'zod';

/** Mã định danh dạng UUID v4 (server sinh). */
export const idSchema = z.uuid();
/** RFC 3339 có offset (ví dụ 2026-11-14T09:20:00Z). */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const isoDateSchema = z.iso.date();

export const SESSION_COOKIE = 'an_session';
export const API_PREFIX = '/api/v1';

export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'VALIDATION_FAILED',
  'RATE_LIMITED',
  'DEVICE_AUTH_FAILED',
  'DEVICE_NOT_CLAIMED',
  'TARGET_AMBIGUOUS',
  'APPROVAL_STALE',
  'CAPABILITY_DISABLED',
  'EFFECT_UNKNOWN',
  'AI_UNAVAILABLE',
  'INTERNAL',
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1),
  requestId: z.string().min(1),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const userRoleSchema = z.enum(['user', 'admin']);
export type UserRole = z.infer<typeof userRoleSchema>;
export const userStatusSchema = z.enum(['active', 'disabled']);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const userSummarySchema = z.object({
  id: idSchema,
  email: z.email(),
  displayName: z.string().min(1).max(120),
  role: userRoleSchema,
  status: userStatusSchema,
  createdAt: isoDateTimeSchema,
});
export type UserSummary = z.infer<typeof userSummarySchema>;

export const subjectRoleSchema = z.enum(['owner', 'caregiver']);
export type SubjectRole = z.infer<typeof subjectRoleSchema>;

export const carePermissionsSchema = z
  .object({
    historyDays: z.number().int().min(1).max(3650),
    canReceiveAlerts: z.boolean(),
    canAcknowledge: z.boolean(),
    canResolve: z.boolean(),
    canViewAi: z.boolean(),
  })
  .strict();
export type CarePermissions = z.infer<typeof carePermissionsSchema>;

export const DEFAULT_CARE_PERMISSIONS: CarePermissions = {
  historyDays: 30,
  canReceiveAlerts: true,
  canAcknowledge: true,
  canResolve: false,
  canViewAi: false,
};

export const OWNER_PERMISSIONS: CarePermissions = {
  historyDays: 3650,
  canReceiveAlerts: true,
  canAcknowledge: true,
  canResolve: true,
  canViewAi: true,
};

export function hasCarePermission(
  permissions: CarePermissions,
  action: 'receive_alerts' | 'acknowledge' | 'resolve' | 'view_ai',
): boolean {
  switch (action) {
    case 'receive_alerts':
      return permissions.canReceiveAlerts;
    case 'acknowledge':
      return permissions.canAcknowledge;
    case 'resolve':
      return permissions.canResolve;
    case 'view_ai':
      return permissions.canViewAi;
  }
}

export const heartRateQualitySchema = z.enum(['valid', 'poor_signal', 'not_worn', 'sensor_error']);
export type HeartRateQuality = z.infer<typeof heartRateQualitySchema>;
export const motionQualitySchema = z.enum(['valid', 'sensor_error']);
export type MotionQuality = z.infer<typeof motionQualitySchema>;

export const incidentTypeSchema = z.enum(['fall', 'sos']);
export type IncidentType = z.infer<typeof incidentTypeSchema>;
export const incidentStateSchema = z.enum([
  'suspected',
  'open',
  'acknowledged',
  'resolved',
  'cancelled',
  'unconfirmed',
]);
export type IncidentState = z.infer<typeof incidentStateSchema>;
export const INCIDENT_OPEN_STATES: readonly IncidentState[] = ['suspected', 'open', 'acknowledged'];

export const pageQuerySchema = z.object({
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export function pageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

export function zodDetails(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

/** Nhãn nguồn dữ liệu hiển thị trên UI, tránh nhầm dữ liệu mô phỏng với dữ liệu đo. */
export function isSyntheticDataSource(value: string): boolean {
  return value === 'simulator' || value === 'synthetic';
}
