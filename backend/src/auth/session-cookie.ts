import type { Response } from 'express';
import { SESSION_COOKIE } from '@heart-iot/contracts';
import type { AppEnv } from '../config/env';

export function setSessionCookie(res: Response, token: string, expiresAt: Date, env: AppEnv): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response, env: AppEnv): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
  });
}
