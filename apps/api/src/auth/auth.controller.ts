import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { SESSION_COOKIE, type UserSummary } from '@annhien/contracts';
import { authSessionSchema, loginSchema, meSchema, registerSchema } from '@annhien/contracts/auth';
import type { LoginInput, RegisterInput } from '@annhien/contracts/auth';
import type { Request, Response } from 'express';
import { ENV, type AppEnv } from '../config/env';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './auth.decorators';
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
}
