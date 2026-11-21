import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt } from 'drizzle-orm';
import type { Response } from 'express';
import { DB, type AppDb } from '../database/database';
import { realtimeEvents } from '../database/schema';
import { AccessService } from '../access/access.service';
import { AuthService } from '../auth/auth.service';
import { AppError } from '../common/app-error';

export type SseOptions = {
  pollMs?: number;
  maxDurationMs?: number;
  heartbeatMs?: number;
};

export const SSE_MAX_DURATION_MS = 5 * 60 * 1000;
export const SSE_HEARTBEAT_MS = 15000;
const MAX_EVENTS_PER_POLL = 500;
/**
 * Payload rỗng: client chỉ cần biết stream bị thu hồi. Không gửi lý do,
 * sessionId hay dữ liệu sức khỏe qua frame này.
 */
const SSE_REVOKED_FRAME = 'event: revoked\ndata: {}\n\n';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Stream SSE `GET /subjects/:id/events`.
 *
 * - cursor từ header Last-Event-ID hoặc query `cursor`, mặc định 0.
 * - Mỗi vòng pollMs: kiểm phiên hiện tại còn hiệu lực + tài khoản `active` và
 *   quyền hồ sơ; mất bất kỳ điều kiện nào → gửi `event: revoked` rồi đóng
 *   stream (thu hồi/khóa có hiệu lực ngay với stream đang mở, không chỉ với
 *   request mới). Phiên được kiểm theo nhịp poll, không theo từng event.
 * - Heartbeat `: ping` mỗi 15s; đóng sau tối đa 5 phút để client reconnect.
 * - `pollMs` là field công khai của service để test rút ngắn vòng lặp.
 */
@Injectable()
export class RealtimeService {
  /** Khoảng poll mặc định 1s; test có thể ghi đè trước khi mở stream. */
  pollMs = 1000;

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly access: AccessService,
    private readonly auth: AuthService,
  ) {}

  async stream(
    userId: string,
    subjectId: string,
    sessionId: string,
    res: Response,
    startCursor: number,
    options: SseOptions = {},
  ): Promise<void> {
    const pollMs = options.pollMs ?? this.pollMs;
    const maxDurationMs = options.maxDurationMs ?? SSE_MAX_DURATION_MS;
    const heartbeatMs = options.heartbeatMs ?? SSE_HEARTBEAT_MS;
    const startedAt = Date.now();
    let cursor = Math.max(0, Math.floor(startCursor));
    let lastHeartbeatAt = Date.now();

    try {
      while (Date.now() - startedAt < maxDurationMs) {
        if (res.writableEnded || res.destroyed) return;

        // Phiên bị revoke/hết hạn hoặc tài khoản bị khóa phải ngắt stream đang mở.
        // Một truy vấn mỗi vòng poll, không thêm truy vấn cho từng event.
        if (!(await this.auth.isSessionActive(sessionId))) {
          this.writeRevoked(res);
          return;
        }

        // Kiểm lại quyền mỗi vòng: thu hồi care link ngắt stream ngay.
        let subjectIdLocked: string;
        try {
          const access = await this.access.requireAction(userId, subjectId, 'receive_alerts');
          subjectIdLocked = access.subject.id;
        } catch (error) {
          if (error instanceof AppError) {
            this.writeRevoked(res);
          }
          return;
        }

        const rows = await this.db
          .select({ id: realtimeEvents.id, type: realtimeEvents.type, payload: realtimeEvents.payload })
          .from(realtimeEvents)
          .where(and(eq(realtimeEvents.subjectId, subjectIdLocked), gt(realtimeEvents.id, cursor)))
          .orderBy(asc(realtimeEvents.id))
          .limit(MAX_EVENTS_PER_POLL);

        for (const row of rows) {
          if (res.writableEnded || res.destroyed) return;
          res.write(`id: ${row.id}\nevent: ${row.type}\ndata: ${JSON.stringify(row.payload)}\n\n`);
          cursor = row.id;
        }

        if (Date.now() - lastHeartbeatAt >= heartbeatMs) {
          res.write(': ping\n\n');
          lastHeartbeatAt = Date.now();
        }

        await delay(pollMs);
      }
    } finally {
      if (!res.writableEnded && !res.destroyed) {
        res.end();
      }
    }
  }

  private writeRevoked(res: Response): void {
    if (res.writableEnded || res.destroyed) return;
    res.write(SSE_REVOKED_FRAME);
  }
}
