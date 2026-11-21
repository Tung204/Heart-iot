import { Inject, Injectable } from '@nestjs/common';
import type { AppDb } from '../database/database';
import { DB } from '../database/database';
import { auditLogs } from '../database/schema';
import { currentRequestId } from '../common/request-context';

export type AuditActorKind = 'user' | 'device' | 'system' | 'ai';

export type AuditEntry = {
  actorUserId?: string | null;
  actorKind: AuditActorKind;
  action: string;
  targetType: string;
  targetId?: string | null;
  outcome: 'success' | 'failed' | 'denied' | 'conflict';
  /** Chỉ metadata đã lọc: không chứa payload sức khỏe, token, mật khẩu, prompt riêng tư. */
  metadata?: Record<string, unknown>;
  requestId?: string;
};

type AuditInserter = { insert: AppDb['insert'] };
export type DbExecutor = AppDb | AuditInserter;

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  async record(entry: AuditEntry, executor: DbExecutor = this.db): Promise<void> {
    await (executor as AuditInserter).insert(auditLogs).values({
      actorUserId: entry.actorUserId ?? null,
      actorKind: entry.actorKind,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      outcome: entry.outcome,
      requestId: entry.requestId ?? currentRequestId() ?? null,
      metadata: entry.metadata ?? {},
    });
  }
}
