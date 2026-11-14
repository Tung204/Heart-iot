import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import {
  hasCarePermission,
  OWNER_PERMISSIONS,
  type CarePermissions,
  type SubjectRole,
  type UserSummary,
} from '@annhien/contracts';
import { DB, type AppDb } from '../database/database';
import { careLinks, subjects, type SubjectRow } from '../database/schema';
import { AppError } from '../common/app-error';

export type SubjectAccess = {
  subject: SubjectRow;
  role: SubjectRole;
  permissions: CarePermissions;
  careLinkId: string | null;
  sharedFrom: Date | null;
};

export type AccessAction = 'receive_alerts' | 'acknowledge' | 'resolve' | 'view_ai';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AccessService {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  async resolve(userId: string, subjectId: string): Promise<SubjectAccess | null> {
    const subjectRows = await this.db
      .select()
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), isNull(subjects.archivedAt)))
      .limit(1);
    const subject = subjectRows[0];
    if (!subject) return null;

    if (subject.ownerUserId === userId) {
      return {
        subject,
        role: 'owner',
        permissions: OWNER_PERMISSIONS,
        careLinkId: null,
        sharedFrom: null,
      };
    }

    const linkRows = await this.db
      .select()
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
    const link = linkRows[0];
    if (!link) return null;

    return {
      subject,
      role: 'caregiver',
      permissions: link.permissions,
      careLinkId: link.id,
      sharedFrom: link.sharedFrom,
    };
  }

  /** Tài nguyên riêng tư: không có quyền thì trả 404 để tránh dò sự tồn tại. */
  async requireSubject(userId: string, subjectId: string): Promise<SubjectAccess> {
    const access = await this.resolve(userId, subjectId);
    if (!access) throw AppError.notFound('Không tìm thấy hồ sơ hoặc bạn không có quyền truy cập.');
    return access;
  }

  async requireAction(userId: string, subjectId: string, action: AccessAction): Promise<SubjectAccess> {
    const access = await this.requireSubject(userId, subjectId);
    this.assertAction(access, action);
    return access;
  }

  assertAction(access: SubjectAccess, action: AccessAction): void {
    if (access.role === 'owner') return;
    if (!hasCarePermission(access.permissions, action)) {
      throw AppError.forbidden('Quyền được chia sẻ không cho phép thao tác này.');
    }
  }

  /**
   * Giới hạn khoảng lịch sử theo quyền chia sẻ và thời điểm bắt đầu chia sẻ.
   * `from` sớm hơn mốc hiệu lực bị từ chối thay vì âm thầm cắt, để caller biết dữ liệu không được phép.
   */
  async requireHistory(
    userId: string,
    subjectId: string,
    from: Date | null | undefined,
  ): Promise<{ access: SubjectAccess; effectiveFrom: Date }> {
    const access = await this.requireSubject(userId, subjectId);
    const now = new Date();
    const permissionStart = new Date(now.getTime() - access.permissions.historyDays * DAY_MS);
    const sharedStart = access.sharedFrom ?? permissionStart;
    const effectiveFrom = new Date(Math.max(permissionStart.getTime(), sharedStart.getTime()));
    if (from && from.getTime() < effectiveFrom.getTime()) {
      throw AppError.forbidden('Khoảng thời gian yêu cầu vượt quá quyền xem lịch sử được chia sẻ.', {
        effectiveFrom: effectiveFrom.toISOString(),
      });
    }
    return { access, effectiveFrom };
  }

  async listAccessibleSubjects(userId: string): Promise<SubjectAccess[]> {
    const owned = await this.db
      .select()
      .from(subjects)
      .where(and(eq(subjects.ownerUserId, userId), isNull(subjects.archivedAt)));
    const shared = await this.db
      .select({ subject: subjects, link: careLinks })
      .from(careLinks)
      .innerJoin(subjects, eq(subjects.id, careLinks.subjectId))
      .where(
        and(
          eq(careLinks.caregiverUserId, userId),
          eq(careLinks.status, 'active'),
          isNull(careLinks.revokedAt),
          isNull(subjects.archivedAt),
        ),
      );

    const result: SubjectAccess[] = owned.map((subject) => ({
      subject,
      role: 'owner',
      permissions: OWNER_PERMISSIONS,
      careLinkId: null,
      sharedFrom: null,
    }));
    for (const row of shared) {
      result.push({
        subject: row.subject,
        role: 'caregiver',
        permissions: row.link.permissions,
        careLinkId: row.link.id,
        sharedFrom: row.link.sharedFrom,
      });
    }
    return result.sort((a, b) => a.subject.displayName.localeCompare(b.subject.displayName, 'vi'));
  }

  requireAdmin(user: UserSummary): void {
    if (user.role !== 'admin') throw AppError.forbidden('Chỉ quản trị viên được dùng chức năng này.');
  }
}
