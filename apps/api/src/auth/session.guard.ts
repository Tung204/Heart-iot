import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SESSION_COOKIE, type UserSummary } from '@annhien/contracts';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './auth.decorators';
import { AppError } from '../common/app-error';
import { setActorUserId } from '../common/request-context';

export type AuthenticatedRequest = Request & {
  user?: UserSummary;
  sessionId?: string;
  sessionExpiresAt?: Date;
};

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const token = cookies?.[SESSION_COOKIE];
    if (!token) throw AppError.unauthenticated();

    const session = await this.auth.resolveSession(token);
    if (!session) throw AppError.unauthenticated('Phiên đăng nhập đã hết hạn.');

    request.user = session.user;
    request.sessionId = session.sessionId;
    request.sessionExpiresAt = session.expiresAt;
    setActorUserId(session.user.id);
    return true;
  }
}
