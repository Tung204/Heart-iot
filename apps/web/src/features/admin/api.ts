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
  type AdminUserSummary,
  type AuditList,
  type AuditQuery,
  type PolicyPreview,
  type PolicyPublish,
  type PolicyState,
  type UpdateUserStatus,
} from '@annhien/contracts/admin';
import {
  deviceListSchema,
  newClaimCodeResponseSchema,
  rotateDeviceKeySchema,
  type DeviceList,
  type NewClaimCodeResult,
  type RotateDeviceKeyResult,
} from '@annhien/contracts/devices';
import { apiRequest, parseResponse } from '../../lib/api';

/**
 * API client quản trị (wave 4 fe-admin-ai) — mọi endpoint chỉ admin; không trả
 * hash/session/token. Query keys đặt ở đây vì lib/query.ts thuộc vùng worker khác.
 */
export const adminQueryKeys = {
  overview: ['admin', 'overview'] as const,
  users: (query: string, status: string | null) => ['admin', 'users', query, status ?? ''] as const,
  audit: (action: string, actorUserId: string | null) =>
    ['admin', 'audit', action, actorUserId ?? ''] as const,
  policy: (key: string) => ['admin', 'policies', key] as const,
  devices: ['admin', 'devices'] as const,
};

export interface AdminUserQueryParams {
  query?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

/** GET /admin/overview — tổng quan hệ thống. */
export async function fetchAdminOverview(signal?: AbortSignal): Promise<AdminOverview> {
  const data = await apiRequest<unknown>('/admin/overview', { signal });
  return parseResponse(adminOverviewSchema, data);
}

/** GET /admin/users — tìm kiếm + lọc + phân trang cursor. */
export async function fetchAdminUsers(
  params: AdminUserQueryParams = {},
  signal?: AbortSignal,
): Promise<AdminUserList> {
  const search = new URLSearchParams();
  search.set('limit', String(params.limit ?? 20));
  if (params.query) search.set('query', params.query);
  if (params.status) search.set('status', params.status);
  if (params.cursor) search.set('cursor', params.cursor);
  const data = await apiRequest<unknown>(`/admin/users?${search.toString()}`, { signal });
  return parseResponse(adminUserListSchema, data);
}

/** PATCH /admin/users/:id/status — tạm khóa/kích hoạt tài khoản (không đổi role). */
export async function updateUserStatus(
  targetId: string,
  input: UpdateUserStatus,
): Promise<AdminUserSummary> {
  const data = await apiRequest<unknown>(`/admin/users/${targetId}/status`, {
    method: 'PATCH',
    body: input,
  });
  return parseResponse(adminUserSummarySchema, data);
}

/** GET /admin/audit — bộ lọc + phân trang cursor. */
export async function fetchAdminAudit(
  params: Omit<AuditQuery, 'limit'> & { limit?: number } = {},
  signal?: AbortSignal,
): Promise<AuditList> {
  const search = new URLSearchParams();
  search.set('limit', String(params.limit ?? 20));
  if (params.action) search.set('action', params.action);
  if (params.actorUserId) search.set('actorUserId', params.actorUserId);
  if (params.targetType) search.set('targetType', params.targetType);
  if (params.cursor) search.set('cursor', params.cursor);
  const data = await apiRequest<unknown>(`/admin/audit?${search.toString()}`, { signal });
  return parseResponse(auditListSchema, data);
}

/** GET /admin/policies/:key — active + defaults + lịch sử 10 bản. */
export async function fetchPolicyState(key: string, signal?: AbortSignal): Promise<PolicyState> {
  const data = await apiRequest<unknown>(`/admin/policies/${key}`, { signal });
  return parseResponse(policyStateSchema, data);
}

/** POST /admin/policies/:key/previews — chỉ validate/sinh digest, không ghi DB. */
export async function previewPolicy(
  key: string,
  input: { value: unknown; expectedVersion: number },
): Promise<PolicyPreview> {
  const data = await apiRequest<unknown>(`/admin/policies/${key}/previews`, {
    method: 'POST',
    body: input,
  });
  return parseResponse(policyPreviewSchema, data);
}

/** GET /admin/devices — danh sách thiết bị cho vận hành; không trả khóa/mã. */
export async function fetchAdminDevices(signal?: AbortSignal): Promise<DeviceList> {
  const data = await apiRequest<unknown>('/admin/devices', { signal });
  return parseResponse(deviceListSchema, data);
}

/** POST /admin/devices/:id/claim-code — mã gắn thiết bị mới, chỉ trả một lần. */
export async function issueAdminClaimCode(deviceId: string): Promise<NewClaimCodeResult> {
  const data = await apiRequest<unknown>(`/admin/devices/${deviceId}/claim-code`, {
    method: 'POST',
  });
  return parseResponse(newClaimCodeResponseSchema, data);
}

/** POST /admin/devices/:id/rotate-key — khóa thiết bị mới, chỉ trả một lần. */
export async function rotateAdminDeviceKey(deviceId: string): Promise<RotateDeviceKeyResult> {
  const data = await apiRequest<unknown>(`/admin/devices/${deviceId}/rotate-key`, {
    method: 'POST',
  });
  return parseResponse(rotateDeviceKeySchema, data);
}

/**
 * PUT /admin/policies/:key — publish CAS theo expectedVersion + previewDigest;
 * 409 APPROVAL_STALE khi version lệch hoặc nội dung khác bản đã xem trước.
 */
export async function publishPolicy(
  key: string,
  input: { value: unknown; expectedVersion: number; previewDigest: string; note?: string },
): Promise<PolicyPublish> {
  const data = await apiRequest<unknown>(`/admin/policies/${key}`, {
    method: 'PUT',
    body: input,
  });
  return parseResponse(policyPublishSchema, data);
}
