import {
  authSessionSchema,
  changePasswordSchema,
  loginSchema,
  meSchema,
  registerSchema,
  sessionListSchema,
  updateProfileSchema,
  type AuthSession,
  type ChangePasswordInput,
  type LoginInput,
  type Me,
  type RegisterInput,
  type SessionSummary,
  type UpdateProfileInput,
} from '@heart-iot/contracts/auth';
import { apiRequest, parseResponse } from '../../lib/api';

/** GET /me — kiểm phiên hiện tại. */
export async function fetchMe(signal?: AbortSignal): Promise<Me> {
  const data = await apiRequest<unknown>('/me', { signal });
  return parseResponse(meSchema, data);
}

/** POST /auth/login — server set cookie phiên; trả về session. */
export async function login(input: LoginInput): Promise<AuthSession> {
  const data = await apiRequest<unknown>('/auth/login', { method: 'POST', body: input });
  return parseResponse(authSessionSchema, data);
}

/** POST /auth/register — tạo tài khoản và phiên mới. */
export async function register(input: RegisterInput): Promise<AuthSession> {
  const data = await apiRequest<unknown>('/auth/register', { method: 'POST', body: input });
  return parseResponse(authSessionSchema, data);
}

/** POST /auth/logout — trả 204; server xóa phiên và cookie. */
export async function logout(): Promise<void> {
  await apiRequest<void>('/auth/logout', { method: 'POST' });
}

/** PATCH /me — đổi tên hiển thị của chính mình; trả lại user sau khi lưu. */
export async function updateProfile(input: UpdateProfileInput): Promise<Me> {
  const data = await apiRequest<unknown>('/me', { method: 'PATCH', body: input });
  return parseResponse(meSchema, data);
}

/** POST /me/password — server giữ phiên hiện tại và thu hồi các phiên khác. */
export async function changePassword(input: ChangePasswordInput): Promise<void> {
  await apiRequest<void>('/me/password', { method: 'POST', body: input });
}

/** GET /me/sessions — phiên còn hiệu lực của chính mình, mới nhất trước. */
export async function fetchSessions(signal?: AbortSignal): Promise<SessionSummary[]> {
  const data = await apiRequest<unknown>('/me/sessions', { signal });
  return parseResponse(sessionListSchema, data).items;
}

/** DELETE /me/sessions/:id — thu hồi một phiên khác của chính mình. */
export async function revokeSession(sessionId: string): Promise<void> {
  await apiRequest<void>(`/me/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
}

/** POST /me/sessions/revoke-others — thu hồi tất cả trừ phiên hiện tại. */
export async function revokeOtherSessions(): Promise<void> {
  await apiRequest<void>('/me/sessions/revoke-others', { method: 'POST' });
}

export { changePasswordSchema, loginSchema, registerSchema, updateProfileSchema };
export type { ChangePasswordInput, LoginInput, RegisterInput, UpdateProfileInput };
