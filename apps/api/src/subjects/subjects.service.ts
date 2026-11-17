import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { OWNER_PERMISSIONS, type SubjectRole, type UserSummary } from '@heart-iot/contracts';
import {
  deletionRequestRecordedSchema,
  subjectDetailSchema,
  subjectListSchema,
  type ArchiveSubjectInput,
  type CreateSubjectInput,
  type DeletionRequestInput,
  type DeletionRequestRecorded,
  type SubjectDetail,
  type SubjectList,
  type SubjectSummary,
  type UpdateSubjectInput,
} from '@heart-iot/contracts/subjects';
import { DB, type AppDb } from '../database/database';
import { careLinks, realtimeEvents, subjects, type SubjectRow } from '../database/schema';
import { AppError } from '../common/app-error';
import { AccessService, type SubjectAccess } from '../access/access.service';
import { AuditService } from '../access/audit.service';

/**
 * Câu trả về cho UI khi mới ghi nhận yêu cầu xóa: không được gợi ý dữ liệu đã
 * bị xóa. Nêu rõ đây là ghi nhận thủ công và giới hạn của bản demo.
 */
const DELETION_REQUEST_NOTE =
  'Đã ghi nhận yêu cầu xóa vào nhật ký kiểm toán. Đây là ghi nhận thủ công: ' +
  'dữ liệu (số đo, cảnh báo, bản xuất, bản sao AI/cache và backup) chưa bị xóa. ' +
  'Bản demo chưa có quy trình xóa tự động; người triển khai cần xử lý theo chính sách lưu trữ đã chốt.';

/** Kiểm tra tên múi giờ IANA bằng Intl; tên không tồn tại ném RangeError. */
function isValidTimezone(timezone: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** So khớp tên xác nhận: trim + Unicode NFC + không phân biệt hoa/thường. */
function normalizeConfirmationName(value: string): string {
  return value.trim().normalize('NFC').toLowerCase();
}

function toSubjectSummary(access: SubjectAccess): SubjectSummary {
  return {
    id: access.subject.id,
    ownerUserId: access.subject.ownerUserId,
    displayName: access.subject.displayName,
    timezone: access.subject.timezone,
    role: access.role,
    permissions: access.permissions,
    sharedFrom: toIso(access.sharedFrom),
    createdAt: access.subject.createdAt.toISOString(),
  };
}

function toSubjectDetail(access: SubjectAccess): SubjectDetail {
  return { ...toSubjectSummary(access), archivedAt: toIso(access.subject.archivedAt) };
}

@Injectable()
export class SubjectsService {
  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async list(user: UserSummary): Promise<SubjectList> {
    const accesses = await this.access.listAccessibleSubjects(user.id);
    return subjectListSchema.parse({ items: accesses.map(toSubjectSummary) });
  }

  async create(user: UserSummary, input: CreateSubjectInput): Promise<SubjectDetail> {
    this.assertValidTimezone(input.timezone);
    const rows = await this.db
      .insert(subjects)
      .values({
        ownerUserId: user.id,
        displayName: input.displayName,
        timezone: input.timezone,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('Không tạo được hồ sơ.');
    await this.audit.record({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'subject.create',
      targetType: 'subject',
      targetId: row.id,
      outcome: 'success',
      metadata: { timezone: row.timezone },
    });
    const access: SubjectAccess = {
      subject: row,
      role: 'owner',
      permissions: OWNER_PERMISSIONS,
      careLinkId: null,
      sharedFrom: null,
    };
    return subjectDetailSchema.parse(toSubjectDetail(access));
  }

  async get(user: UserSummary, subjectId: string): Promise<SubjectDetail> {
    const access = await this.access.requireSubject(user.id, subjectId);
    return subjectDetailSchema.parse(toSubjectDetail(access));
  }

  async update(user: UserSummary, subjectId: string, input: UpdateSubjectInput): Promise<SubjectDetail> {
    const access = await this.access.requireSubject(user.id, subjectId);
    this.assertOwner(access.role);
    if (input.timezone !== undefined) this.assertValidTimezone(input.timezone);
    const rows = await this.db
      .update(subjects)
      .set({
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        updatedAt: new Date(),
      })
      .where(eq(subjects.id, subjectId))
      .returning();
    const row = rows[0];
    if (!row) throw AppError.notFound('Không tìm thấy hồ sơ.');
    const fields: string[] = [];
    if (input.displayName !== undefined) fields.push('displayName');
    if (input.timezone !== undefined) fields.push('timezone');
    await this.audit.record({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'subject.update',
      targetType: 'subject',
      targetId: row.id,
      outcome: 'success',
      metadata: { fields },
    });
    return subjectDetailSchema.parse(toSubjectDetail({ ...access, subject: row }));
  }

  /**
   * Lưu trữ hồ sơ (không xóa dữ liệu):
   * - chỉ chủ hồ sơ; người có care link đang hiệu lực nhận 403, người không có
   *   liên kết nhận 404 (không lộ sự tồn tại);
   * - `confirmationName` phải khớp displayName (trim/case-insensitive), sai → 400;
   * - hồ sơ đã lưu trữ → 409;
   * - set `archivedAt`, thu hồi mọi care link đang active + phát realtime
   *   `care.revoked` để stream đang mở đóng, ghi audit `subject.archive`.
   * Dữ liệu telemetry/cảnh báo giữ nguyên; chỉ quyền truy cập bị đóng.
   */
  async archive(user: UserSummary, subjectId: string, input: ArchiveSubjectInput): Promise<void> {
    const subject = await this.resolveSubjectForOwnerAction(
      user.id,
      subjectId,
      'Chỉ chủ hồ sơ được lưu trữ hồ sơ.',
    );
    if (subject.archivedAt) {
      throw AppError.conflict('Hồ sơ đã được lưu trữ trước đó.');
    }
    this.assertConfirmationName(subject.displayName, input.confirmationName);

    await this.db.transaction(async (tx) => {
      const now = new Date();
      const archived = await tx
        .update(subjects)
        .set({ archivedAt: now, updatedAt: now })
        .where(and(eq(subjects.id, subjectId), isNull(subjects.archivedAt)))
        .returning({ id: subjects.id });
      // Hai request archive đồng thời: request sau thấy 0 dòng → 409, không ghi đè mốc.
      if (archived.length === 0) {
        throw AppError.conflict('Hồ sơ đã được lưu trữ trước đó.');
      }

      const revokedLinks = await tx
        .update(careLinks)
        .set({ status: 'revoked', revokedAt: now })
        .where(
          and(
            eq(careLinks.subjectId, subjectId),
            eq(careLinks.status, 'active'),
            isNull(careLinks.revokedAt),
          ),
        )
        .returning({ id: careLinks.id, caregiverUserId: careLinks.caregiverUserId });

      for (const link of revokedLinks) {
        // Payload tối thiểu như luồng thu hồi thường: client chỉ cần đóng stream/cache.
        await tx.insert(realtimeEvents).values({
          subjectId,
          type: 'care.revoked',
          entityId: link.id,
          payload: { linkId: link.id, caregiverUserId: link.caregiverUserId },
        });
        await this.audit.record(
          {
            actorUserId: user.id,
            actorKind: 'user',
            action: 'care_link.revoke',
            targetType: 'care_link',
            targetId: link.id,
            outcome: 'success',
            metadata: { subjectId, caregiverUserId: link.caregiverUserId, cause: 'subject.archive' },
          },
          tx,
        );
      }

      await this.audit.record(
        {
          actorUserId: user.id,
          actorKind: 'user',
          action: 'subject.archive',
          targetType: 'subject',
          targetId: subjectId,
          outcome: 'success',
          // Chỉ lý do do chủ hồ sơ nhập + số liên kết bị thu hồi; không có số đo/tên người khác.
          metadata: { reason: input.reason, revokedCareLinks: revokedLinks.length },
        },
        tx,
      );
    });
  }

  /**
   * Ghi nhận yêu cầu xóa dữ liệu — CHỈ ghi audit, không xóa bảng/dữ liệu nào.
   * Chỉ chủ hồ sơ; trả 202 kèm `note` nói rõ dữ liệu chưa bị xóa.
   */
  async recordDeletionRequest(
    user: UserSummary,
    subjectId: string,
    input: DeletionRequestInput,
  ): Promise<DeletionRequestRecorded> {
    const subject = await this.resolveSubjectForOwnerAction(
      user.id,
      subjectId,
      'Chỉ chủ hồ sơ được ghi nhận yêu cầu xóa dữ liệu.',
    );
    this.assertConfirmationName(subject.displayName, input.confirmationName);

    const recordedAt = new Date();
    // Không tạo bảng mới: id của yêu cầu là UUID do server sinh và được lưu trong audit.
    const id = randomUUID();
    await this.audit.record({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'subject.deletion_request',
      targetType: 'subject',
      targetId: subjectId,
      outcome: 'success',
      metadata: {
        deletionRequestId: id,
        reason: input.reason,
        status: 'recorded',
        recordedAt: recordedAt.toISOString(),
      },
    });

    return deletionRequestRecordedSchema.parse({
      id,
      status: 'recorded',
      recordedAt: recordedAt.toISOString(),
      note: DELETION_REQUEST_NOTE,
    });
  }

  /**
   * Tìm hồ sơ cho thao tác chỉ-chủ-hồ-sơ, kể cả hồ sơ đã lưu trữ (để trả 409
   * thay vì 404 khi archive lần hai). Người không sở hữu: có care link đang
   * hiệu lực → 403, còn lại → 404.
   */
  private async resolveSubjectForOwnerAction(
    userId: string,
    subjectId: string,
    forbiddenMessage: string,
  ): Promise<SubjectRow> {
    const subjectRows = await this.db
      .select()
      .from(subjects)
      .where(eq(subjects.id, subjectId))
      .limit(1);
    const subject = subjectRows[0];
    if (!subject) throw AppError.notFound('Không tìm thấy hồ sơ.');

    if (subject.ownerUserId === userId) return subject;

    const linkRows = await this.db
      .select({ id: careLinks.id })
      .from(careLinks)
      .where(
        and(
          eq(careLinks.subjectId, subjectId),
          eq(careLinks.caregiverUserId, userId),
          eq(careLinks.status, 'active'),
          isNull(careLinks.revokedAt),
        ),
      )
      .limit(1);
    if (linkRows[0]) throw AppError.forbidden(forbiddenMessage);
    throw AppError.notFound('Không tìm thấy hồ sơ hoặc bạn không có quyền truy cập.');
  }

  private assertConfirmationName(displayName: string, confirmationName: string): void {
    if (normalizeConfirmationName(displayName) !== normalizeConfirmationName(confirmationName)) {
      // 400 (không phải 422): payload đúng schema nhưng tên xác nhận không khớp.
      throw new AppError(
        'VALIDATION_FAILED',
        'Tên xác nhận không khớp với tên hiển thị của hồ sơ.',
        400,
      );
    }
  }

  private assertOwner(role: SubjectRole): void {
    if (role !== 'owner') throw AppError.forbidden('Chỉ chủ hồ sơ được thực hiện thao tác này.');
  }

  private assertValidTimezone(timezone: string): void {
    if (!isValidTimezone(timezone)) {
      throw AppError.validation(`Múi giờ "${timezone}" không hợp lệ.`);
    }
  }
}
