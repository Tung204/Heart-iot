import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { OWNER_PERMISSIONS, type SubjectRole, type UserSummary } from '@annhien/contracts';
import {
  subjectDetailSchema,
  subjectListSchema,
  type CreateSubjectInput,
  type SubjectDetail,
  type SubjectList,
  type SubjectSummary,
  type UpdateSubjectInput,
} from '@annhien/contracts/subjects';
import { DB, type AppDb } from '../database/database';
import { subjects } from '../database/schema';
import { AppError } from '../common/app-error';
import { AccessService, type SubjectAccess } from '../access/access.service';
import { AuditService } from '../access/audit.service';

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

  private assertOwner(role: SubjectRole): void {
    if (role !== 'owner') throw AppError.forbidden('Chỉ chủ hồ sơ được thực hiện thao tác này.');
  }

  private assertValidTimezone(timezone: string): void {
    if (!isValidTimezone(timezone)) {
      throw AppError.validation(`Múi giờ "${timezone}" không hợp lệ.`);
    }
  }
}
