import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { LoginInput, RegisterInput } from '@annhien/contracts/auth';
import type { UserSummary } from '@annhien/contracts';
import { ENV, type AppEnv } from '../config/env';
import { DB } from '../database/database';
import type { AppDb } from '../database/database';
import { users, sessions } from '../database/schema';
import { AuditService } from '../access/audit.service';
import { AppError } from '../common/app-error';
import { createOpaqueToken, hashPassword, normalizeEmail, sha256, verifyPassword } from './password';
import { isUniqueViolation } from '../database/errors';

export type AuthenticatedSession = {
  sessionId: string;
  expiresAt: Date;
  user: UserSummary;
  tokenHash: string;
};

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly loginAttempts = new Map<string, { count: number; firstAt: number }>();

  constructor(
    @Inject(DB) private readonly db: AppDb,
    @Inject(ENV) private readonly env: AppEnv,
    private readonly audit: AuditService,
  ) {}

  async register(input: RegisterInput): Promise<{ token: string; expiresAt: Date; user: UserSummary }> {
    const emailNormalized = normalizeEmail(input.email);
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.emailNormalized, emailNormalized))
      .limit(1);
    if (existing.length > 0) {
      throw AppError.conflict('Email này đã được sử dụng.');
    }
    const passwordHash = await hashPassword(input.password);
    let created;
    try {
      const rows = await this.db
        .insert(users)
        .values({
          email: input.email.trim(),
          emailNormalized,
          passwordHash,
          displayName: input.displayName.trim(),
        })
        .returning();
      created = rows[0];
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict('Email này đã được sử dụng.');
      }
      throw error;
    }
    if (!created) throw new Error('Không tạo được tài khoản.');

    const session = await this.createSession(created.id);
    await this.audit.record({
      actorUserId: created.id,
      actorKind: 'user',
      action: 'auth.register',
      targetType: 'user',
      targetId: created.id,
      outcome: 'success',
    });
    return { token: session.token, expiresAt: session.expiresAt, user: toUserSummary(created) };
  }

  async login(input: LoginInput): Promise<{ token: string; expiresAt: Date; user: UserSummary }> {
    const emailNormalized = normalizeEmail(input.email);
    this.assertLoginRate(emailNormalized);
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.emailNormalized, emailNormalized))
      .limit(1);
    const user = rows[0];
    const valid = user ? await verifyPassword(input.password, user.passwordHash) : false;
    if (!user || !valid) {
      this.recordFailedLogin(emailNormalized);
      await this.audit.record({
        actorKind: 'user',
        action: 'auth.login',
        targetType: 'user',
        targetId: user?.id ?? null,
        outcome: 'failed',
        metadata: { emailNormalized },
      });
      throw AppError.unauthenticated('Email hoặc mật khẩu không đúng.');
    }
    if (user.status !== 'active') {
      throw AppError.forbidden('Tài khoản đang bị khóa.');
    }
    this.loginAttempts.delete(emailNormalized);
    const session = await this.createSession(user.id);
    await this.db.update(users).set({ updatedAt: new Date() }).where(eq(users.id, user.id));
    await this.audit.record({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'auth.login',
      targetType: 'user',
      targetId: user.id,
      outcome: 'success',
    });
    return { token: session.token, expiresAt: session.expiresAt, user: toUserSummary(user) };
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    const tokenHash = sha256(token);
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)));
  }

  async resolveSession(token: string): Promise<AuthenticatedSession | null> {
    const tokenHash = sha256(token);
    const rows = await this.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (row.user.status !== 'active') return null;
    return {
      sessionId: row.session.id,
      expiresAt: row.session.expiresAt,
      tokenHash,
      user: toUserSummary(row.user),
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
  }

  async deleteExpiredSessions(): Promise<void> {
    await this.db.delete(sessions).where(sql`expires_at < now() - interval '7 days'`);
  }

  private async createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_HOURS * 60 * 60 * 1000);
    await this.db.insert(sessions).values({ userId, tokenHash: sha256(token), expiresAt });
    return { token, expiresAt };
  }

  private assertLoginRate(emailNormalized: string): void {
    const entry = this.loginAttempts.get(emailNormalized);
    if (!entry) return;
    if (Date.now() - entry.firstAt > LOGIN_WINDOW_MS) {
      this.loginAttempts.delete(emailNormalized);
      return;
    }
    if (entry.count >= LOGIN_MAX_ATTEMPTS) {
      throw AppError.rateLimited('Quá nhiều lần đăng nhập sai. Thử lại sau 15 phút.');
    }
  }

  private recordFailedLogin(emailNormalized: string): void {
    const entry = this.loginAttempts.get(emailNormalized);
    if (!entry || Date.now() - entry.firstAt > LOGIN_WINDOW_MS) {
      this.loginAttempts.set(emailNormalized, { count: 1, firstAt: Date.now() });
      return;
    }
    entry.count += 1;
    this.logger.warn(`Đăng nhập sai cho ${emailNormalized}: ${entry.count} lần trong cửa sổ 15 phút`);
  }
}

export function toUserSummary(row: {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  createdAt: Date;
}): UserSummary {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}
