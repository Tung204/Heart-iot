import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import {
  sessionListSchema,
  type ChangePasswordInput,
  type LoginInput,
  type RegisterInput,
  type SessionList,
  type UpdateProfileInput,
} from '@heart-iot/contracts/auth';
import type { UserSummary } from '@heart-iot/contracts';
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
/** Khóa theo cặp IP + email: IP khác không thể khóa tài khoản của nạn nhân. */
const LOGIN_PAIR_MAX_ATTEMPTS = 10;
/** Chặn spray nhiều email từ cùng một IP; đây là ngưỡng demo, chưa hiệu chuẩn. */
const LOGIN_IP_MAX_ATTEMPTS = 30;
const LOGIN_MAX_TRACKED_KEYS = 20_000;

/**
 * Đổi mật khẩu dùng cùng ngưỡng/cửa sổ với login nhưng bucket riêng theo user id:
 * sai `currentPassword` 10 lần/15 phút sẽ bị 429 cho tới hết cửa sổ (kể cả khi
 * nhập đúng sau đó), tránh brute-force mật khẩu hiện tại từ một phiên bị chiếm.
 * Bucket tách khỏi login để không khóa đăng nhập của chính user hay user khác.
 */
const PASSWORD_CHANGE_WINDOW_MS = LOGIN_WINDOW_MS;
const PASSWORD_CHANGE_MAX_ATTEMPTS = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /**
   * Hai bucket trong bộ nhớ: cặp IP+email và IP. Không còn bucket toàn tài khoản
   * theo email, nên kẻ tấn công từ IP khác không thể khóa mật khẩu đúng của nạn nhân.
   * Chỉ đúng trong một tiến trình API; nhiều instance cần store chia sẻ.
   */
  private readonly loginPairAttempts = new Map<string, { count: number; firstAt: number }>();
  private readonly loginIpAttempts = new Map<string, { count: number; firstAt: number }>();
  /**
   * Bộ đếm trong bộ nhớ, chỉ đúng trong một tiến trình API. Demo một process
   * chấp nhận; khi chạy nhiều instance phải chuyển sang store chia sẻ (Redis/DB).
   */
  private readonly passwordChangeAttempts = new Map<string, { count: number; firstAt: number }>();

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

  async login(
    input: LoginInput,
    clientIp: string,
  ): Promise<{ token: string; expiresAt: Date; user: UserSummary }> {
    const emailNormalized = normalizeEmail(input.email);
    const ip = normalizeClientIp(clientIp);
    this.assertLoginIpRate(ip);
    // Giữ chỗ trước khi await DB/verify để burst song song không vượt ngưỡng.
    this.reserveLoginPair(ip, emailNormalized);
    let user: typeof users.$inferSelect | undefined;
    let valid: boolean;
    try {
      const rows = await this.db
        .select()
        .from(users)
        .where(eq(users.emailNormalized, emailNormalized))
        .limit(1);
      user = rows[0];
      valid = user ? await verifyPassword(input.password, user.passwordHash) : false;
    } catch (error) {
      this.releaseLoginPair(ip, emailNormalized);
      throw error;
    }
    if (!user || !valid) {
      this.recordFailedLogin(ip, emailNormalized);
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
      this.releaseLoginPair(ip, emailNormalized);
      throw AppError.forbidden('Tài khoản đang bị khóa.');
    }
    this.releaseLoginPair(ip, emailNormalized);
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
    // Đếm trước khi verify để nhiều request song song không vượt ngưỡng;
    // hết ngưỡng thì 429 trước khi đọc/kiểm mật khẩu, không đổi gì.
    this.reservePasswordChangeAttempt(userId);
    const rows = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = rows[0];
    if (!user) {
      this.passwordChangeAttempts.delete(userId);
      throw AppError.notFound('Không tìm thấy tài khoản.');
    }

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

    // Xác minh đúng currentPassword (kể cả khi newPassword trùng cũ) chứng minh
    // người dùng biết mật khẩu hiện tại → reset bộ đếm; đổi thành công cũng đi qua đây.
    this.passwordChangeAttempts.delete(userId);

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

  /**
   * Kiểm nhanh một phiên còn hiệu lực và tài khoản còn `active`.
   * Dùng cho vòng poll của stream đang mở (SSE); chỉ trả boolean, không log
   * token/sessionId và không ném lỗi nghiệp vụ.
   */
  async isSessionActive(sessionId: string): Promise<boolean> {
    const rows = await this.db
      .select({ status: users.status })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.id, sessionId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return rows[0]?.status === 'active';
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

  private assertLoginIpRate(ip: string): void {
    const now = Date.now();
    this.pruneLoginAttempts(this.loginIpAttempts, now);
    this.assertAttemptBucket(this.loginIpAttempts, ip, LOGIN_IP_MAX_ATTEMPTS, now);
  }

  /** Đếm trước khi verify: 10 request song song cũng chỉ có 10 lần được kiểm. */
  private reserveLoginPair(ip: string, emailNormalized: string): void {
    const now = Date.now();
    this.pruneLoginAttempts(this.loginPairAttempts, now);
    const key = loginPairKey(ip, emailNormalized);
    const entry = this.loginPairAttempts.get(key);
    if (!entry || now - entry.firstAt > LOGIN_WINDOW_MS) {
      this.loginPairAttempts.set(key, { count: 1, firstAt: now });
      return;
    }
    if (entry.count >= LOGIN_PAIR_MAX_ATTEMPTS) {
      throw AppError.rateLimited('Quá nhiều lần đăng nhập sai. Thử lại sau 15 phút.');
    }
    entry.count += 1;
  }

  private releaseLoginPair(ip: string, emailNormalized: string): void {
    this.loginPairAttempts.delete(loginPairKey(ip, emailNormalized));
  }

  /** Chỉ ghi IP sau khi verify thất bại; đăng nhập đúng không bị tính vào IP. */
  private recordFailedLogin(ip: string, emailNormalized: string): void {
    const count = this.recordAttempt(this.loginIpAttempts, ip, Date.now());
    this.logger.warn(
      `Đăng nhập sai cho ${emailNormalized} từ ${ip}: ${count} lần/IP trong cửa sổ 15 phút`,
    );
  }

  /** Xóa bucket hết hạn và chặn map phình vô hạn khi bị gửi email/IP rác. */
  private pruneLoginAttempts(
    bucket: Map<string, { count: number; firstAt: number }>,
    now: number,
  ): void {
    if (bucket.size < 1_000) return;
    for (const [key, entry] of bucket) {
      if (now - entry.firstAt > LOGIN_WINDOW_MS) bucket.delete(key);
    }
    while (bucket.size > LOGIN_MAX_TRACKED_KEYS) {
      const oldest = bucket.keys().next().value;
      if (oldest === undefined) break;
      bucket.delete(oldest);
    }
  }

  private assertAttemptBucket(
    bucket: Map<string, { count: number; firstAt: number }>,
    key: string,
    max: number,
    now: number,
  ): void {
    const entry = bucket.get(key);
    if (!entry) return;
    if (now - entry.firstAt > LOGIN_WINDOW_MS) {
      bucket.delete(key);
      return;
    }
    if (entry.count >= max) {
      throw AppError.rateLimited('Quá nhiều lần đăng nhập sai. Thử lại sau 15 phút.');
    }
  }

  private recordAttempt(
    bucket: Map<string, { count: number; firstAt: number }>,
    key: string,
    now: number,
  ): number {
    const entry = bucket.get(key);
    if (!entry || now - entry.firstAt > LOGIN_WINDOW_MS) {
      bucket.set(key, { count: 1, firstAt: now });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }

  /**
   * Cùng ngưỡng/cửa sổ với login nhưng bucket riêng theo user id và đếm trước khi
   * verify, nên 10 request song song cũng không vượt ngưỡng. Hết ngưỡng thì 429
   * trước khi kiểm mật khẩu (kể cả khi nhập đúng) cho tới hết cửa sổ. Không ghi
   * audit cho lần bị chặn để tránh khuếch đại ghi DB từ request 429 lặp lại; các
   * lần sai thực tế vẫn được audit.
   */
  private reservePasswordChangeAttempt(userId: string): void {
    const now = Date.now();
    const entry = this.passwordChangeAttempts.get(userId);
    if (!entry || now - entry.firstAt > PASSWORD_CHANGE_WINDOW_MS) {
      this.passwordChangeAttempts.set(userId, { count: 1, firstAt: now });
      return;
    }
    if (entry.count >= PASSWORD_CHANGE_MAX_ATTEMPTS) {
      throw AppError.rateLimited(
        'Quá nhiều lần nhập sai mật khẩu hiện tại. Thử lại sau 15 phút.',
      );
    }
    entry.count += 1;
  }
}

function normalizeClientIp(raw: string): string {
  const ip = raw.trim().toLowerCase();
  if (ip.startsWith('::ffff:')) return ip.slice('::ffff:'.length);
  return ip || 'unknown';
}

function loginPairKey(ip: string, emailNormalized: string): string {
  return `${ip}\n${emailNormalized}`;
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
