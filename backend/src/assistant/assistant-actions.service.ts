import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt } from 'drizzle-orm';
import {
  ASSISTANT_DRAFT_TTL_MINUTES,
  assistantCapabilitiesSchema,
  assistantDraftFromTextSchema,
  assistantDraftSchema,
  createAssistantDraftSchema,
  updateAssistantDraftSchema,
  type AssistantCapabilities,
  type AssistantDraft,
  type AssistantDraftFromTextInput,
  type CreateAssistantDraftInput,
  type UpdateAssistantDraftInput,
} from '@heart-iot/contracts/assistant';
import { type UserSummary } from '@heart-iot/contracts';
import { createReminderSchema, type CreateReminderInput } from '@heart-iot/contracts/reminders';
import { DB, type AppDb } from '../database/database';
import { assistantDrafts, type AssistantDraftRow } from '../database/schema';
import { AccessService } from '../access/access.service';
import { AuditService } from '../access/audit.service';
import { sha256 } from '../auth/password';
import { AppError } from '../common/app-error';
import { isUniqueViolation } from '../database/errors';
import { RemindersService, type RemindersTx } from '../reminders/reminders.service';
import { PARSER_VERSION, parseAssistantDraftText } from './assistant-draft-parser';

const CAPABILITY_ID = 'care_reminder.create' as const;
const RESULT_TYPE = 'care_reminder' as const;

const CAN: AssistantCapabilities['can'] = [
  {
    id: CAPABILITY_ID,
    label: 'Tạo nháp lịch nhắc chăm sóc',
    description:
      'Soạn lịch nhắc uống thuốc/sinh hoạt để bạn xem trước. Chỉ khi bạn bấm xác nhận mới lưu lịch; trợ lý không tự đặt liều hoặc nội dung y khoa.',
    requiresConfirmation: true,
    available: true,
    unavailableReason: null,
  },
];

/**
 * Việc trợ lý web không được tự làm. Danh sách này vừa là tài liệu sản phẩm,
 * vừa là contract để UI hiển thị ranh giới; backend vẫn kiểm quyền ở từng API.
 */
const CANNOT: AssistantCapabilities['cannot'] = [
  {
    id: 'alert.acknowledge',
    label: 'Tự xác nhận cảnh báo',
    reason: 'Chỉ người có quyền mới được xác nhận; trợ lý không thay người trực cảnh báo.',
  },
  {
    id: 'alert.resolve',
    label: 'Tự đóng cảnh báo',
    reason: 'Đóng cảnh báo cần người xử lý và lý do; không giao cho trợ lý.',
  },
  {
    id: 'alert.cancel',
    label: 'Hủy cảnh báo',
    reason: 'Hủy cảnh báo là quyết định nghiệp vụ, cần người có quyền thực hiện.',
  },
  {
    id: 'device.configure',
    label: 'Đổi cấu hình/ngưỡng thiết bị',
    reason: 'Trợ lý không điều khiển phần cứng hay đổi ngưỡng an toàn.',
  },
  {
    id: 'access.grant',
    label: 'Cấp hoặc thu quyền chia sẻ',
    reason: 'Quyền riêng tư do chủ hồ sơ quản lý, không tự động qua hội thoại.',
  },
  {
    id: 'data.delete',
    label: 'Xóa dữ liệu',
    reason: 'Xóa dữ liệu cần quy trình riêng và xác nhận của người có quyền.',
  },
  {
    id: 'medical.diagnose',
    label: 'Chẩn đoán bệnh',
    reason: 'Trợ lý chỉ tổng hợp số liệu, không phải công cụ chẩn đoán y khoa.',
  },
  {
    id: 'medical.prescribe',
    label: 'Kê đơn hoặc gợi ý liều thuốc',
    reason: 'Không kê đơn, không gợi ý liều; nội dung thuốc do người dùng tự nhập.',
  },
  {
    id: 'emergency.send',
    label: 'Tự gửi tin khẩn cấp',
    reason: 'Gửi thông báo khẩn thuộc đường cảnh báo, không phụ thuộc trợ lý.',
  },
  {
    id: 'hardware.control',
    label: 'Điều khiển thiết bị đeo',
    reason: 'Không có quyền điều khiển firmware/phần cứng từ trợ lý web.',
  },
];

type ConfirmOutcome =
  | { kind: 'ok'; row: AssistantDraftRow }
  | { kind: 'missing' }
  | { kind: 'expired'; row: AssistantDraftRow }
  | { kind: 'conflict'; message: string };

/**
 * Hành động có kiểm soát của trợ lý (FR-21).
 *
 * - `capabilities` công bố rõ việc được/không được làm.
 * - `createDraft` chỉ ghi bảng nháp; KHÔNG ghi care_reminders.
 * - `confirm` kiểm lại quyền, hạn, digest rồi tạo lịch trong cùng transaction
 *   với cập nhật nháp. Confirm lặp trả lại nháp đã xác nhận, không tạo trùng.
 * - Chỉ chủ hồ sơ; caregiver có link nhận 403, người ngoài 404.
 */
@Injectable()
export class AssistantActionsService {
  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly reminders: RemindersService,
  ) {}

  async capabilities(user: UserSummary, subjectId: string): Promise<AssistantCapabilities> {
    const access = await this.access.requireSubject(user.id, subjectId);
    const owner = access.role === 'owner';
    return assistantCapabilitiesSchema.parse({
      subjectId,
      can: CAN.map((capability) => ({
        ...capability,
        available: owner,
        unavailableReason: owner ? null : 'Chỉ chủ hồ sơ mới được tạo lịch nhắc.',
      })),
      cannot: CANNOT,
    });
  }

  async createDraft(
    user: UserSummary,
    subjectId: string,
    input: CreateAssistantDraftInput,
  ): Promise<AssistantDraft> {
    const access = await this.access.requireSubject(user.id, subjectId);
    if (access.role !== 'owner') {
      throw AppError.forbidden('Chỉ chủ hồ sơ mới được tạo nháp lịch nhắc.');
    }
    const parsed = createAssistantDraftSchema.parse(input);
    const payload = createReminderSchema.parse(parsed.input);
    return this.persistDraft(
      user,
      subjectId,
      parsed.capability,
      payload,
      { source: 'structured' },
      parsed.requestKey,
    );
  }

  /**
   * Nháp từ câu lệnh đơn giản. Parser thuần, không gọi LLM; raw text không
   * được lưu, chỉ payload đã parse nằm trong `assistant_drafts`.
   */
  async createDraftFromText(
    user: UserSummary,
    subjectId: string,
    input: AssistantDraftFromTextInput,
  ): Promise<AssistantDraft> {
    const access = await this.access.requireSubject(user.id, subjectId);
    if (access.role !== 'owner') {
      throw AppError.forbidden('Chỉ chủ hồ sơ mới được tạo nháp lịch nhắc.');
    }
    const parsed = assistantDraftFromTextSchema.parse(input);
    const payload = parseAssistantDraftText(parsed.text, {
      now: new Date(),
      timezone: access.subject.timezone,
    });
    return this.persistDraft(
      user,
      subjectId,
      CAPABILITY_ID,
      payload,
      { source: 'text_parser', parserVersion: PARSER_VERSION },
      parsed.requestKey,
    );
  }

  private async persistDraft(
    user: UserSummary,
    subjectId: string,
    capability: typeof CAPABILITY_ID,
    payload: CreateReminderInput,
    auditMetadata: Record<string, unknown>,
    requestKey?: string,
  ): Promise<AssistantDraft> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ASSISTANT_DRAFT_TTL_MINUTES * 60_000);
    const previewDigest = computeDraftDigest(capability, subjectId, payload);

    // Retry idempotent: cùng actor + requestKey + cùng digest trả lại nháp cũ,
    // kể cả nháp đã confirm/hủy/hết hạn; khác nội dung/khác hồ sơ → 409.
    if (requestKey) {
      const existing = await this.findDraftByRequestKey(user.id, requestKey);
      if (existing) {
        return this.resolveRequestKeyReplay(existing, subjectId, capability, previewDigest);
      }
    }

    try {
      const row = await this.db.transaction(async (tx) => {
        const rows = await tx
          .insert(assistantDrafts)
          .values({
            actorUserId: user.id,
            subjectId,
            capability,
            payload,
            previewDigest,
            requestKey: requestKey ?? null,
            expiresAt,
            status: 'draft',
          })
          .returning();
        const created = rows[0];
        if (!created) throw new Error('Không tạo được nháp trợ lý.');
        await this.audit.record(
          {
            actorUserId: user.id,
            actorKind: 'user',
            action: 'assistant.draft.create',
            targetType: 'assistant_draft',
            targetId: created.id,
            outcome: 'success',
            // Không ghi tiêu đề/ghi chú/liều thuốc/raw text vào audit.
            metadata: { capability, subjectId, previewDigest, ...auditMetadata },
          },
          tx,
        );
        return created;
      });
      return toDraft(row);
    } catch (error) {
      // Hai request cùng key chạy đồng thời: unique index chặn request thua;
      // đọc lại bản đã commit để trả cùng nháp thay vì tạo trùng.
      if (!requestKey || !isUniqueViolation(error)) throw error;
      const existing = await this.findDraftByRequestKey(user.id, requestKey);
      if (!existing) throw error;
      return this.resolveRequestKeyReplay(existing, subjectId, capability, previewDigest);
    }
  }

  private async findDraftByRequestKey(
    actorUserId: string,
    requestKey: string,
  ): Promise<AssistantDraftRow | null> {
    const rows = await this.db
      .select()
      .from(assistantDrafts)
      .where(
        and(
          eq(assistantDrafts.actorUserId, actorUserId),
          eq(assistantDrafts.requestKey, requestKey),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  private resolveRequestKeyReplay(
    existing: AssistantDraftRow,
    subjectId: string,
    capability: typeof CAPABILITY_ID,
    previewDigest: string,
  ): AssistantDraft {
    if (
      existing.subjectId !== subjectId ||
      existing.capability !== capability ||
      existing.previewDigest !== previewDigest
    ) {
      throw AppError.conflict(
        'requestKey đã được dùng cho một yêu cầu khác; hãy dùng khóa mới.',
      );
    }
    return toDraft(existing);
  }

  /**
   * Sửa nháp trước khi xác nhận. Chỉ chủ hồ sơ, chỉ trạng thái `draft`; cập nhật
   * payload + digest trong transaction, không ghi `care_reminders`. Nếu đã hết
   * hạn thì chuyển `expired` và trả 409. Confirm đồng thời sẽ thấy digest cũ và
   * bị chặn, nên không thể xác nhận nội dung vừa bị sửa.
   */
  async updateDraft(
    user: UserSummary,
    draftId: string,
    input: UpdateAssistantDraftInput,
  ): Promise<AssistantDraft> {
    const initial = await this.requireOwnedDraft(user, draftId);
    const access = await this.access.requireSubject(user.id, initial.subjectId);
    if (access.role !== 'owner') {
      throw AppError.forbidden('Chỉ chủ hồ sơ mới được sửa nháp này.');
    }
    const parsed = updateAssistantDraftSchema.parse(input);
    const payload = createReminderSchema.parse(parsed.input);
    const previewDigest = computeDraftDigest(CAPABILITY_ID, initial.subjectId, payload);
    const now = new Date();

    const outcome = await this.db.transaction(async (tx): Promise<ConfirmOutcome> => {
      const rows = await tx
        .select()
        .from(assistantDrafts)
        .where(and(eq(assistantDrafts.id, draftId), eq(assistantDrafts.actorUserId, user.id)))
        .for('update')
        .limit(1);
      const row = rows[0];
      if (!row) return { kind: 'missing' };
      if (row.status !== 'draft') {
        return {
          kind: 'conflict',
          message: `Nháp đang ở trạng thái ${row.status}, không thể sửa.`,
        };
      }
      if (row.expiresAt.getTime() <= now.getTime()) {
        const updated = await tx
          .update(assistantDrafts)
          .set({ status: 'expired', updatedAt: now })
          .where(eq(assistantDrafts.id, row.id))
          .returning();
        return { kind: 'expired', row: updated[0] ?? row };
      }

      const updated = await tx
        .update(assistantDrafts)
        .set({ payload, previewDigest, updatedAt: now })
        .where(eq(assistantDrafts.id, row.id))
        .returning();
      const edited = updated[0];
      if (!edited) throw new Error('Không cập nhật được nháp.');
      await this.audit.record(
        {
          actorUserId: user.id,
          actorKind: 'user',
          action: 'assistant.draft.update',
          targetType: 'assistant_draft',
          targetId: edited.id,
          outcome: 'success',
          // Không ghi nội dung nháp vào audit.
          metadata: {
            capability: edited.capability,
            subjectId: edited.subjectId,
            previewDigest,
          },
        },
        tx,
      );
      return { kind: 'ok', row: edited };
    });

    if (outcome.kind === 'missing') throw AppError.notFound('Không tìm thấy nháp.');
    if (outcome.kind === 'expired') {
      throw AppError.conflict('Nháp đã hết hạn; hãy tạo nháp mới và xem lại trước khi lưu.');
    }
    if (outcome.kind === 'conflict') throw AppError.conflict(outcome.message);
    return toDraft(outcome.row);
  }

  /**
   * Nháp đang chờ của chủ hồ sơ, sớm hết hạn trước. Chỉ trả `draft` còn hạn;
   * nháp đã xác nhận/hủy/hết hạn không xuất hiện để UI không mời xác nhận lại.
   */
  async listActiveDrafts(
    user: UserSummary,
    subjectId: string,
    limit: number,
  ): Promise<AssistantDraft[]> {
    const access = await this.access.requireSubject(user.id, subjectId);
    if (access.role !== 'owner') {
      throw AppError.forbidden('Chỉ chủ hồ sơ mới được xem nháp lịch nhắc.');
    }
    const rows = await this.db
      .select()
      .from(assistantDrafts)
      .where(
        and(
          eq(assistantDrafts.actorUserId, user.id),
          eq(assistantDrafts.subjectId, subjectId),
          eq(assistantDrafts.status, 'draft'),
          gt(assistantDrafts.expiresAt, new Date()),
        ),
      )
      .orderBy(asc(assistantDrafts.expiresAt))
      .limit(limit);
    return rows.map(toDraft);
  }

  async getDraft(user: UserSummary, draftId: string): Promise<AssistantDraft> {
    const row = await this.requireOwnedDraft(user, draftId);
    await this.access.requireSubject(user.id, row.subjectId);
    return toDraft(row);
  }

  async confirm(user: UserSummary, draftId: string): Promise<AssistantDraft> {
    const initial = await this.requireOwnedDraft(user, draftId);
    const access = await this.access.requireSubject(user.id, initial.subjectId);
    if (access.role !== 'owner') {
      throw AppError.forbidden('Chỉ chủ hồ sơ mới được xác nhận nháp này.');
    }
    const payload = parseStoredPayload(initial);
    const expectedDigest = computeDraftDigest(initial.capability, initial.subjectId, payload);
    const now = new Date();

    const outcome = await this.db.transaction(async (tx): Promise<ConfirmOutcome> => {
      const lockedRows = await tx
        .select()
        .from(assistantDrafts)
        .where(and(eq(assistantDrafts.id, draftId), eq(assistantDrafts.actorUserId, user.id)))
        .for('update')
        .limit(1);
      const row = lockedRows[0];
      if (!row) return { kind: 'missing' };

      if (row.status === 'confirmed') return { kind: 'ok', row };
      if (row.status !== 'draft') {
        return {
          kind: 'conflict',
          message: `Nháp đang ở trạng thái ${row.status}, không thể xác nhận.`,
        };
      }
      if (row.expiresAt.getTime() <= now.getTime()) {
        const updated = await tx
          .update(assistantDrafts)
          .set({ status: 'expired', updatedAt: now })
          .where(eq(assistantDrafts.id, row.id))
          .returning();
        return { kind: 'expired', row: updated[0] ?? row };
      }

      const storedPayload = parseStoredPayload(row);
      const storedDigest = computeDraftDigest(row.capability, row.subjectId, storedPayload);
      if (storedDigest !== row.previewDigest || expectedDigest !== row.previewDigest) {
        return { kind: 'conflict', message: 'Nội dung nháp đã thay đổi hoặc không còn hợp lệ.' };
      }

      const reminder = await this.reminders.createWithTx(
        tx as RemindersTx,
        user,
        row.subjectId,
        storedPayload,
      );
      const updated = await tx
        .update(assistantDrafts)
        .set({
          status: 'confirmed',
          confirmedAt: now,
          confirmedByUserId: user.id,
          resultType: RESULT_TYPE,
          resultId: reminder.id,
          updatedAt: now,
        })
        .where(eq(assistantDrafts.id, row.id))
        .returning();
      const confirmed = updated[0];
      if (!confirmed) throw new Error('Không cập nhật được nháp đã xác nhận.');
      await this.audit.record(
        {
          actorUserId: user.id,
          actorKind: 'user',
          action: 'assistant.draft.confirm',
          targetType: 'assistant_draft',
          targetId: confirmed.id,
          outcome: 'success',
          metadata: {
            capability: confirmed.capability,
            subjectId: confirmed.subjectId,
            resultType: RESULT_TYPE,
            resultId: reminder.id,
          },
        },
        tx,
      );
      return { kind: 'ok', row: confirmed };
    });

    if (outcome.kind === 'missing') throw AppError.notFound('Không tìm thấy nháp.');
    if (outcome.kind === 'expired') {
      throw AppError.conflict('Nháp đã hết hạn; hãy tạo nháp mới và xem lại trước khi lưu.');
    }
    if (outcome.kind === 'conflict') throw AppError.conflict(outcome.message);
    return toDraft(outcome.row);
  }

  async cancel(user: UserSummary, draftId: string): Promise<AssistantDraft> {
    await this.requireOwnedDraft(user, draftId);
    const now = new Date();
    const outcome = await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(assistantDrafts)
        .where(and(eq(assistantDrafts.id, draftId), eq(assistantDrafts.actorUserId, user.id)))
        .for('update')
        .limit(1);
      const row = rows[0];
      if (!row) return { kind: 'missing' as const };
      if (row.status === 'confirmed') return { kind: 'conflict' as const };
      if (row.status === 'cancelled') return { kind: 'ok' as const, row };
      if (row.status === 'expired') return { kind: 'conflict' as const };
      if (row.expiresAt.getTime() <= now.getTime()) {
        const updated = await tx
          .update(assistantDrafts)
          .set({ status: 'expired', updatedAt: now })
          .where(eq(assistantDrafts.id, row.id))
          .returning();
        return { kind: 'expired' as const, row: updated[0] ?? row };
      }
      const updated = await tx
        .update(assistantDrafts)
        .set({ status: 'cancelled', updatedAt: now })
        .where(eq(assistantDrafts.id, row.id))
        .returning();
      const cancelled = updated[0];
      if (!cancelled) throw new Error('Không cập nhật được nháp.');
      await this.audit.record(
        {
          actorUserId: user.id,
          actorKind: 'user',
          action: 'assistant.draft.cancel',
          targetType: 'assistant_draft',
          targetId: cancelled.id,
          outcome: 'success',
          metadata: { capability: cancelled.capability, subjectId: cancelled.subjectId },
        },
        tx,
      );
      return { kind: 'ok' as const, row: cancelled };
    });

    if (outcome.kind === 'missing') throw AppError.notFound('Không tìm thấy nháp.');
    if (outcome.kind === 'expired') {
      throw AppError.conflict('Nháp đã hết hạn; không thể hủy.');
    }
    if (outcome.kind === 'conflict') {
      throw AppError.conflict('Nháp đã được xác nhận hoặc không còn ở trạng thái có thể hủy.');
    }
    return toDraft(outcome.row);
  }

  private async requireOwnedDraft(user: UserSummary, draftId: string): Promise<AssistantDraftRow> {
    const rows = await this.db
      .select()
      .from(assistantDrafts)
      .where(and(eq(assistantDrafts.id, draftId), eq(assistantDrafts.actorUserId, user.id)))
      .limit(1);
    const row = rows[0];
    if (!row) throw AppError.notFound('Không tìm thấy nháp.');
    return row;
  }
}

function parseStoredPayload(row: AssistantDraftRow): CreateReminderInput {
  const parsed = createReminderSchema.safeParse(row.payload);
  if (!parsed.success) {
    // Dữ liệu DB hỏng không được biến thành hành động ghi.
    throw AppError.conflict('Nội dung nháp không còn hợp lệ; hãy tạo nháp mới.');
  }
  return parsed.data;
}

function computeDraftDigest(
  capability: string,
  subjectId: string,
  input: CreateReminderInput,
): string {
  // Thứ tự khóa cố định, không phụ thuộc thứ tự field client gửi.
  return sha256(
    JSON.stringify({
      capability,
      subjectId,
      input: {
        kind: input.kind,
        title: input.title,
        note: input.note ?? null,
        times: input.times,
        weekdays: input.weekdays,
        startsOn: input.startsOn,
        endsOn: input.endsOn ?? null,
        active: input.active,
      },
    }),
  );
}

function toDraft(row: AssistantDraftRow): AssistantDraft {
  const preview = parseStoredPayload(row);
  return assistantDraftSchema.parse({
    id: row.id,
    subjectId: row.subjectId,
    capability: row.capability,
    status: row.status,
    preview,
    previewDigest: row.previewDigest,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    result:
      row.resultType === RESULT_TYPE && row.resultId
        ? { type: RESULT_TYPE, id: row.resultId }
        : null,
  });
}
