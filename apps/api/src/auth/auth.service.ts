import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import {
  sessionListSchema,
  type ChangePasswordInput,
  type LoginInput,
  type RegisterInput,
  type SessionList,
  type UpdateProfileInput,
} from '@annhien/contracts/auth';
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

  /**
   * Đổi tên hiển thị của chính người đang đăng nhập.
   * Schema hợp đồng đã trim + giới hạn 1..120 ký tự; ở đây vẫn trim lần nữa
   * để service không phụ thuộc đường gọi (controller/AI tool đều đi qua đây).
   */
  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserSummary> {
    const rows = await this.db
      .update(users)
      .set({ displayName: input.displayName.trim(), updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    const row = rows[0];
    if (!row) throw AppError.notFound('Không tìm thấy tài khoản.');
    await this.audit.record({
      actorUserId: userId,
      actorKind: 'user',
      action: 'auth.profile_update',
      targetType: 'user',
      targetId: userId,
      outcome: 'success',
      metadata: { field: 'displayName' },
    });
    return toUserSummary(row);
  }

  /**
   * Đổi mật khẩu: xác minh mật khẩu hiện tại, lưu hash mới và thu hồi mọi phiên
   * khác trong cùng transaction — phiên đang dùng được giữ để không đăng xuất.
   * Không ghi mật khẩu/hash vào audit hay log.
   */
  async changePassword(
    userId: string,
    currentSessionId: string,
    input: ChangePasswordInput,
  ): Promise<{ revokedSessions: number }> {
    const rows = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = rows[0];
    if (!user) throw AppError.notFound('Không tìm thấy tài khoản.');

    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      await this.audit.record({
        actorUserId: userId,
        actorKind: 'user',
        action: 'auth.password_change',
        targetType: 'user',
        targetId: userId,
        outcome: 'failed',
        metadata: { reason: 'current_password_mismatch' },
      });
      // 400 (không phải 422): payload đúng hợp đồng, sai thông tin xác thực hiện tại.
      throw new AppError('VALIDATION_FAILED', 'Mật khẩu hiện tại không đúng.', 400);
    }

    // verify với hash hiện tại cũng bao trùm trường hợp chuỗi giống hệt.
    if (await verifyPassword(input.newPassword, user.passwordHash)) {
      await this.audit.record({
        actorUserId: userId,
        actorKind: 'user',
        action: 'auth.password_change',
        targetType: 'user',
        targetId: userId,
        outcome: 'failed',
        metadata: { reason: 'same_password' },
      });
      throw new AppError('VALIDATION_FAILED', 'Mật khẩu mới phải khác mật khẩu hiện tại.', 400);
    }

    const passwordHash = await hashPassword(input.newPassword);
    const revokedSessions = await this.db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
      const revoked = await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(sessions.userId, userId),
            isNull(sessions.revokedAt),
            ne(sessions.id, currentSessionId),
          ),
        )
        .returning({ id: sessions.id });
      await this.audit.record(
        {
          actorUserId: userId,
          actorKind: 'user',
          action: 'auth.password_change',
          targetType: 'user',
          targetId: userId,
          outcome: 'success',
          metadata: { revokedSessions: revoked.length },
        },
        tx,
      );
      return revoked.length;
    });
    return { revokedSessions };
  }

  /** Chỉ phiên còn hiệu lực của chính mình; mới nhất trước; không trả token. */
  async listSessions(userId: string, currentSessionId: string): Promise<SessionList> {
    const rows = await this.db
      .select({ id: sessions.id, createdAt: sessions.createdAt, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(sessions.createdAt), desc(sessions.id));
    return sessionListSchema.parse({
      items: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        current: row.id === currentSessionId,
      })),
    });
  }

  /**
   * Thu hồi một phiên của chính mình. Phiên hiện tại bị từ chối 400.
   * Phiên không thuộc mình hoặc không tồn tại → 404 (không lộ sự tồn tại).
   * Phiên đã thu hồi trước đó coi như đích idempotent: 204, không audit lặp.
   */
  async revokeOwnSession(
    userId: string,
    currentSessionId: string,
    sessionId: string,
  ): Promise<void> {
    if (sessionId === currentSessionId) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Không thể thu hồi phiên đang dùng. Dùng "Đăng xuất" nếu muốn kết thúc phiên này.',
        400,
      );
    }
    const rows = await this.db
      .select({ id: sessions.id, revokedAt: sessions.revokedAt })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
      .limit(1);
    const row = rows[0];
    if (!row) throw AppError.notFound('Không tìm thấy phiên đăng nhập.');
    if (row.revokedAt !== null) return;
    // Điều kiện revokedAt null ở UPDATE để hai request đồng thời không audit lặp.
    const revoked = await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    if (revoked.length === 0) return;
    await this.audit.record({
      actorUserId: userId,
      actorKind: 'user',
      action: 'auth.session_revoke',
      targetType: 'session',
      targetId: sessionId,
      outcome: 'success',
    });
  }

  /** Thu hồi tất cả phiên khác của chính mình; trả số phiên đã thu hồi. */
  async revokeOtherSessions(userId: string, currentSessionId: string): Promise<number> {
    const revoked = await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          ne(sessions.id, currentSessionId),
        ),
      )
      .returning({ id: sessions.id });
    await this.audit.record({
      actorUserId: userId,
      actorKind: 'user',
      action: 'auth.sessions_revoke_others',
      targetType: 'user',
      targetId: userId,
      outcome: 'success',
      metadata: { revokedSessions: revoked.length },
    });
    return revoked.length;
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
