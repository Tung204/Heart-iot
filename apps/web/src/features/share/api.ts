import {
  careLinkListSchema,
  careLinkSummarySchema,
  invitationCreatedSchema,
  invitationListSchema,
  publicInvitationSchema,
  createInvitationSchema,
  type CareLinkList,
  type CareLinkSummary,
  type CreateInvitationInput,
  type InvitationCreated,
  type InvitationList,
  type PublicInvitation,
} from '@annhien/contracts/care';
import { apiRequest, parseResponse } from '../../lib/api';

/** GET /subjects/:id/invitations — lời mời của hồ sơ (chỉ chủ hồ sơ). */
export async function fetchInvitations(
  subjectId: string,
  signal?: AbortSignal,
): Promise<InvitationList> {
  const data = await apiRequest<unknown>(`/subjects/${subjectId}/invitations`, { signal });
  return parseResponse(invitationListSchema, data);
}

/**
 * POST /subjects/:id/invitations — tạo lời mời.
 * `token` + `acceptUrl` chỉ trả đúng một lần trong kết quả này.
 */
export async function createInvitation(
  subjectId: string,
  input: CreateInvitationInput,
): Promise<InvitationCreated> {
  const data = await apiRequest<unknown>(`/subjects/${subjectId}/invitations`, {
    method: 'POST',
    body: input,
  });
  return parseResponse(invitationCreatedSchema, data);
}

/** GET /subjects/:id/care-links — người thân đang/đã được chia sẻ (chỉ chủ hồ sơ). */
export async function fetchCareLinks(
  subjectId: string,
  signal?: AbortSignal,
): Promise<CareLinkList> {
  const data = await apiRequest<unknown>(`/subjects/${subjectId}/care-links`, { signal });
  return parseResponse(careLinkListSchema, data);
}

/** DELETE /subjects/:id/care-links/:linkId — thu hồi quyền (204). */
export async function revokeCareLink(subjectId: string, linkId: string): Promise<void> {
  await apiRequest<void>(`/subjects/${subjectId}/care-links/${linkId}`, { method: 'DELETE' });
}

/** GET /invitations/:token — preview công khai (không có email người được mời). */
export async function fetchPublicInvitation(
  token: string,
  signal?: AbortSignal,
): Promise<PublicInvitation> {
  const data = await apiRequest<unknown>(`/invitations/${encodeURIComponent(token)}`, { signal });
  return parseResponse(publicInvitationSchema, data);
}

/** POST /invitations/:token/accept — chấp nhận lời mời, trả care link mới. */
export async function acceptInvitation(token: string): Promise<CareLinkSummary> {
  const data = await apiRequest<unknown>(`/invitations/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
  });
  return parseResponse(careLinkSummarySchema, data);
}

export { createInvitationSchema };
