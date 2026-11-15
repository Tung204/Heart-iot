import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { SESSION_COOKIE, idSchema, type UserSummary } from '@annhien/contracts';
import {
  authSessionSchema,
  changePasswordSchema,
  loginSchema,
  meSchema,
  registerSchema,
  updateProfileSchema,
  type ChangePasswordInput,
  type LoginInput,
  type RegisterInput,
  type UpdateProfileInput,
} from '@annhien/contracts/auth';
import type { Request, Response } from 'express';
import { ENV, type AppEnv } from '../config/env';
import { AppError } from '../common/app-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './auth.decorators';
import type { AuthenticatedRequest } from './session.guard';
import { clearSessionCookie, setSessionCookie } from './session-cookie';

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: AppEnv,
  ) {}

  @Public()
  @Post('auth/register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.register(body);
    setSessionCookie(res, result.token, result.expiresAt, this.env);
    return authSessionSchema.parse({
      user: result.user,
      sessionExpiresAt: result.expiresAt.toISOString(),
    });
  }

  @Public()
  @Post('auth/login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(body);
    setSessionCookie(res, result.token, result.expiresAt, this.env);
    return authSessionSchema.parse({
      user: result.user,
      sessionExpiresAt: result.expiresAt.toISOString(),
    });
  }

  @Public()
  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    await this.auth.logout(cookies?.[SESSION_COOKIE]);
    clearSessionCookie(res, this.env);
  }

  @Get('me')
  me(@CurrentUser() user: UserSummary) {
    return meSchema.parse({ user });
  }

  /** PATCH /me — đổi tên hiển thị; id người dùng lấy từ phiên, không từ body. */
  @Patch('me')
  async updateProfile(
    @CurrentUser() user: UserSummary,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    const updated = await this.auth.updateProfile(user.id, body);
    return meSchema.parse({ user: updated });
  }

  /** POST /me/password — giữ phiên hiện tại, thu hồi mọi phiên khác. */
  @Post('me/password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: UserSummary,
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ): Promise<void> {
    await this.auth.changePassword(user.id, requireSessionId(req), body);
  }

  /** GET /me/sessions — chỉ phiên còn hiệu lực của chính mình, không trả token. */
  @Get('me/sessions')
  sessions(@CurrentUser() user: UserSummary, @Req() req: AuthenticatedRequest) {
    return this.auth.listSessions(user.id, requireSessionId(req));
  }

  /** DELETE /me/sessions/:id — thu hồi phiên khác của chính mình. */
  @Delete('me/sessions/:id')
  @HttpCode(204)
  async revokeSession(
    @CurrentUser() user: UserSummary,
    @Req() req: AuthenticatedRequest,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
  ): Promise<void> {
    await this.auth.revokeOwnSession(user.id, requireSessionId(req), id);
  }

  /** POST /me/sessions/revoke-others — thu hồi tất cả trừ phiên hiện tại. */
  @Post('me/sessions/revoke-others')
  @HttpCode(204)
  async revokeOtherSessions(
    @CurrentUser() user: UserSummary,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.auth.revokeOtherSessions(user.id, requireSessionId(req));
  }
}

/** SessionGuard luôn gắn sessionId; thiếu nghĩa là route bị đặt sai ngoài guard. */
function requireSessionId(req: AuthenticatedRequest): string {
  if (!req.sessionId) throw AppError.unauthenticated();
  return req.sessionId;
}
