import {
  authSessionSchema,
  loginSchema,
  meSchema,
  registerSchema,
  type AuthSession,
  type LoginInput,
  type Me,
  type RegisterInput,
} from '@annhien/contracts/auth';
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

export { loginSchema, registerSchema };
export type { LoginInput, RegisterInput };
