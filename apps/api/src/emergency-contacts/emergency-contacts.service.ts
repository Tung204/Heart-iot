import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { SubjectRole, UserSummary } from '@annhien/contracts';
import {
  emergencyContactListSchema,
  emergencyContactSchema,
  type EmergencyContact,
  type EmergencyContactList,
  type EmergencyContactUpdate,
} from '@annhien/contracts/contacts';
import { DB, type AppDb } from '../database/database';
import { emergencyContacts } from '../database/schema';
import { AppError } from '../common/app-error';
import { isUniqueViolation } from '../database/errors';
import { AccessService } from '../access/access.service';
import { AuditService } from '../access/audit.service';

/** Giới hạn hợp đồng `emergencyContactListSchema.items.max(5)`; chặn ở API thay vì để UI tự đếm. */
export const MAX_EMERGENCY_CONTACTS = 5;

type ContactRow = typeof emergencyContacts.$inferSelect;
/** Executor dùng chung cho DB chính và transaction Drizzle. */
type DbExecutor = Parameters<Parameters<AppDb['transaction']>[0]>[0];

function toEmergencyContact(row: ContactRow): EmergencyContact {
  return {
    id: row.id,
    subjectId: row.subjectId,
    name: row.name,
    relationship: row.relationship,
    phone: row.phone,
    isPrimary: row.isPrimary,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Liên hệ khẩn cấp của hồ sơ (FR-09, NFR-01, NFR-05).
 *
 * Bất biến nghiệp vụ:
 * - Tối đa 5 liên hệ/hồ sơ.
 * - Luôn có đúng một liên hệ chính khi danh sách không rỗng; không cho bỏ cờ
 *   primary của liên hệ chính khi còn liên hệ khác (tránh danh sách không có ai để gọi).
 * - Chỉ chủ hồ sơ ghi; caregiver có `canReceiveAlerts` chỉ đọc.
 * - Số điện thoại là dữ liệu nhạy cảm: không đưa vào audit metadata/log/SSE.
 */
@Injectable()
export class EmergencyContactsService {
  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async list(user: UserSummary, subjectId: string): Promise<EmergencyContactList> {
    const access = await this.access.requireSubject(user.id, subjectId);
    // Người thân chỉ thấy liên hệ khi được chia sẻ quyền nhận cảnh báo (cùng điều kiện
    // để họ nhận được cảnh báo của hồ sơ); thiếu quyền → 403 thay vì 404 vì đã có link.
    this.access.assertAction(access, 'receive_alerts');
    const rows = await this.db
      .select()
      .from(emergencyContacts)
      .where(eq(emergencyContacts.subjectId, subjectId))
      .orderBy(
        desc(emergencyContacts.isPrimary),
        asc(emergencyContacts.createdAt),
        asc(emergencyContacts.id),
      );
    return emergencyContactListSchema.parse({ items: rows.map(toEmergencyContact) });
  }

  async create(
    user: UserSummary,
    subjectId: string,
    input: EmergencyContactUpdate,
  ): Promise<EmergencyContact> {
    const access = await this.access.requireSubject(user.id, subjectId);
    this.assertOwner(access.role, 'thêm liên hệ khẩn cấp');

    let created: ContactRow | null = null;
    try {
      created = await this.db.transaction(async (tx) => {
        // Đếm trong transaction để hai lần thêm đồng thời không vượt giới hạn.
        const existing = await tx
          .select({ id: emergencyContacts.id })
          .from(emergencyContacts)
          .where(eq(emergencyContacts.subjectId, subjectId));
        if (existing.length >= MAX_EMERGENCY_CONTACTS) {
          throw AppError.conflict(
            `Hồ sơ đã có ${MAX_EMERGENCY_CONTACTS} liên hệ khẩn cấp. Xóa bớt trước khi thêm liên hệ mới.`,
            { limit: MAX_EMERGENCY_CONTACTS },
          );
        }
        // Liên hệ đầu tiên luôn là chính; người dùng không phải chọn.
        const makePrimary = input.isPrimary || existing.length === 0;
        let previousPrimaryId: string | null = null;
        if (makePrimary) {
          previousPrimaryId = await this.findPrimaryId(tx, subjectId);
          await this.clearPrimary(tx, subjectId);
        }
        const rows = await tx
          .insert(emergencyContacts)
          .values({
            subjectId,
            name: input.name,
            relationship: input.relationship,
            phone: input.phone,
            isPrimary: makePrimary,
            createdByUserId: user.id,
          })
          .returning();
        const row = rows[0];
        if (!row) throw new Error('Không tạo được liên hệ khẩn cấp.');
        await this.audit.record(
          {
            actorUserId: user.id,
            actorKind: 'user',
            action: 'emergency_contact.create',
            targetType: 'emergency_contact',
            targetId: row.id,
            outcome: 'success',
            // Chỉ cờ nghiệp vụ — không ghi tên/số điện thoại.
            metadata: { subjectId, isPrimary: row.isPrimary },
          },
          tx,
        );
        if (row.isPrimary && previousPrimaryId && previousPrimaryId !== row.id) {
          await this.recordPrimaryChange(tx, user.id, subjectId, row.id, previousPrimaryId);
        }
        return row;
      });
    } catch (error) {
      throw this.translateConstraintError(error);
    }
    return emergencyContactSchema.parse(toEmergencyContact(created));
  }

  async update(
    user: UserSummary,
    subjectId: string,
    contactId: string,
    input: EmergencyContactUpdate,
  ): Promise<EmergencyContact> {
    const access = await this.access.requireSubject(user.id, subjectId);
    this.assertOwner(access.role, 'sửa liên hệ khẩn cấp');

    let updated: ContactRow | null = null;
    try {
      updated = await this.db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(emergencyContacts)
          .where(and(eq(emergencyContacts.id, contactId), eq(emergencyContacts.subjectId, subjectId)))
          .limit(1);
        const current = rows[0];
        if (!current) throw AppError.notFound('Không tìm thấy liên hệ khẩn cấp của hồ sơ này.');

        const total = await this.countContacts(tx, subjectId);
        // Không cho tự bỏ cờ chính khi còn liên hệ khác: hồ sơ phải luôn có một liên hệ chính.
        // Nếu chỉ còn một liên hệ thì giữ nguyên primary dù người dùng bỏ chọn.
        if (current.isPrimary && !input.isPrimary && total > 1) {
          throw new AppError(
            'VALIDATION_FAILED',
            'Hãy chọn liên hệ khác làm liên hệ chính trước khi bỏ đánh dấu liên hệ này.',
            400,
          );
        }
        const makePrimary = total === 1 ? true : input.isPrimary;
        let previousPrimaryId: string | null = null;
        if (makePrimary && !current.isPrimary) {
          previousPrimaryId = await this.findPrimaryId(tx, subjectId);
          await this.clearPrimary(tx, subjectId);
        }
        const changedRows = await tx
          .update(emergencyContacts)
          .set({
            name: input.name,
            relationship: input.relationship,
            phone: input.phone,
            isPrimary: makePrimary,
            updatedAt: new Date(),
          })
          .where(and(eq(emergencyContacts.id, contactId), eq(emergencyContacts.subjectId, subjectId)))
          .returning();
        const row = changedRows[0];
        if (!row) throw AppError.notFound('Không tìm thấy liên hệ khẩn cấp của hồ sơ này.');

        await this.audit.record(
          {
            actorUserId: user.id,
            actorKind: 'user',
            action: 'emergency_contact.update',
            targetType: 'emergency_contact',
            targetId: row.id,
            outcome: 'success',
            metadata: {
              subjectId,
              isPrimary: row.isPrimary,
              fields: ['name', 'relationship', 'phone', 'isPrimary'],
            },
          },
          tx,
        );
        if (row.isPrimary && !current.isPrimary) {
          await this.recordPrimaryChange(tx, user.id, subjectId, row.id, previousPrimaryId);
        }
        return row;
      });
    } catch (error) {
      throw this.translateConstraintError(error);
    }
    return emergencyContactSchema.parse(toEmergencyContact(updated));
  }

  async remove(user: UserSummary, subjectId: string, contactId: string): Promise<void> {
    const access = await this.access.requireSubject(user.id, subjectId);
    this.assertOwner(access.role, 'xóa liên hệ khẩn cấp');

    try {
      await this.db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(emergencyContacts)
          .where(and(eq(emergencyContacts.id, contactId), eq(emergencyContacts.subjectId, subjectId)))
          .limit(1);
        const current = rows[0];
        if (!current) throw AppError.notFound('Không tìm thấy liên hệ khẩn cấp của hồ sơ này.');

        await tx
          .delete(emergencyContacts)
          .where(and(eq(emergencyContacts.id, contactId), eq(emergencyContacts.subjectId, subjectId)));

        // Xóa liên hệ chính thì chọn liên hệ cũ nhất còn lại làm chính, không để hồ sơ mất liên hệ gọi.
        let promotedId: string | null = null;
        if (current.isPrimary) {
          const remaining = await tx
            .select({ id: emergencyContacts.id })
            .from(emergencyContacts)
            .where(eq(emergencyContacts.subjectId, subjectId))
            .orderBy(asc(emergencyContacts.createdAt), asc(emergencyContacts.id))
            .limit(1);
          promotedId = remaining[0]?.id ?? null;
          if (promotedId) {
            await tx
              .update(emergencyContacts)
              .set({ isPrimary: true, updatedAt: new Date() })
              .where(eq(emergencyContacts.id, promotedId));
          }
        }

        await this.audit.record(
          {
            actorUserId: user.id,
            actorKind: 'user',
            action: 'emergency_contact.delete',
            targetType: 'emergency_contact',
            targetId: contactId,
            outcome: 'success',
            metadata: { subjectId, wasPrimary: current.isPrimary },
          },
          tx,
        );
        if (promotedId) {
          await this.recordPrimaryChange(tx, user.id, subjectId, promotedId, current.id);
        }
      });
    } catch (error) {
      throw this.translateConstraintError(error);
    }
  }

  private assertOwner(role: SubjectRole, action: string): void {
    if (role !== 'owner') {
      throw AppError.forbidden(`Chỉ chủ hồ sơ được ${action}.`);
    }
  }

  private async findPrimaryId(executor: DbExecutor, subjectId: string): Promise<string | null> {
    const rows = await executor
      .select({ id: emergencyContacts.id })
      .from(emergencyContacts)
      .where(and(eq(emergencyContacts.subjectId, subjectId), eq(emergencyContacts.isPrimary, true)))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  private async clearPrimary(executor: DbExecutor, subjectId: string): Promise<void> {
    await executor
      .update(emergencyContacts)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(and(eq(emergencyContacts.subjectId, subjectId), eq(emergencyContacts.isPrimary, true)));
  }

  private async countContacts(executor: DbExecutor, subjectId: string): Promise<number> {
    const rows = await executor
      .select({ id: emergencyContacts.id })
      .from(emergencyContacts)
      .where(eq(emergencyContacts.subjectId, subjectId));
    return rows.length;
  }

  private async recordPrimaryChange(
    executor: DbExecutor,
    actorUserId: string,
    subjectId: string,
    newPrimaryId: string,
    previousPrimaryId: string | null = null,
  ): Promise<void> {
    await this.audit.record(
      {
        actorUserId,
        actorKind: 'user',
        action: 'emergency_contact.primary_change',
        targetType: 'emergency_contact',
        targetId: newPrimaryId,
        outcome: 'success',
        metadata: { subjectId, newPrimaryId, previousPrimaryId },
      },
      executor,
    );
  }

  /**
   * Unique partial index `emergency_contacts_primary_uq` là lớp chặn cuối khi hai
   * thao tác đổi primary chạy song song. Trả 409 thân thiện thay vì 500.
   */
  private translateConstraintError(error: unknown): unknown {
    if (isUniqueViolation(error)) {
      return AppError.conflict(
        'Liên hệ chính vừa được thay đổi ở nơi khác. Tải lại danh sách rồi thử lại.',
      );
    }
    return error;
  }
}
