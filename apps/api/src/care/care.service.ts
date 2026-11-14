import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { SubjectRole, UserSummary } from '@annhien/contracts';
import {
  careLinkListSchema,
  careLinkSummarySchema,
  invitationCreatedSchema,
  invitationListSchema,
  publicInvitationSchema,
  type CareLinkSummary,
  type CreateInvitationInput,
  type InvitationCreated,
  type InvitationList,
  type InvitationStatus,
  type InvitationSummary,
  type PublicInvitation,
} from '@annhien/contracts/care';
import { DB, type AppDb } from '../database/database';
import { careLinks, invitations, realtimeEvents, subjects, users } from '../database/schema';
import type { CareLinkRow } from '../database/schema';
import { AppError } from '../common/app-error';
import { AccessService } from '../access/access.service';
import { AuditService } from '../access/audit.service';
import { normalizeEmail, sha256 } from '../auth/password';
import { toUserSummary } from '../auth/auth.service';
import { isUniqueViolation } from '../database/errors';
import { ENV, type AppEnv } from '../config/env';

type InvitationRow = typeof invitations.$inferSelect;

function invitationStatus(row: InvitationRow, now: Date): InvitationStatus {
  if (row.acceptedAt) return 'accepted';
  if (row.revokedAt) return 'revoked';
  if (row.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'pending';
}

function toInvitationSummary(row: InvitationRow, now = new Date()): InvitationSummary {
  return {
    id: row.id,
    subjectId: row.subjectId,
    email: row.email,
    permissions: row.permissions,
    status: invitationStatus(row, now),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

function toCareLinkSummary(link: CareLinkRow, caregiver: UserSummary): CareLinkSummary {
  return {
    id: link.id,
    subjectId: link.subjectId,
    caregiver,
    permissions: link.permissions,
    status: link.status,
    sharedFrom: link.sharedFrom.toISOString(),
    acceptedAt: link.acceptedAt ? link.acceptedAt.toISOString() : null,
    revokedAt: link.revokedAt ? link.revokedAt.toISOString() : null,
  };
}

@Injectable()
export class CareService {
  constructor(
    @Inject(DB) private readonly db: AppDb,
    @Inject(ENV) private readonly env: AppEnv,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async createInvitation(
    user: UserSummary,
    subjectId: string,
    input: CreateInvitationInput,
  ): Promise<InvitationCreated> {
    const access = await this.access.requireSubject(user.id, subjectId);
    this.assertOwner(access.role);
    const emailNormalized = normalizeEmail(input.email);

    const ownerRows = await this.db
      .select({ emailNormalized: users.emailNormalized })
      .from(users)
      .where(eq(users.id, access.subject.ownerUserId))
      .limit(1);
    if (ownerRows[0]?.emailNormalized === emailNormalized) {
      throw AppError.validation('Không thể mời chính chủ hồ sơ làm người chăm sóc.');
    }

    const activeLinkRows = await this.db
      .select({ id: careLinks.id })
      .from(careLinks)
      .innerJoin(users, eq(users.id, careLinks.caregiverUserId))
      .where(
        and(
          eq(careLinks.subjectId, subjectId),
          eq(users.emailNormalized, emailNormalized),
          eq(careLinks.status, 'active'),
          isNull(careLinks.revokedAt),
        ),
      )
      .limit(1);
    if (activeLinkRows[0]) {
      throw AppError.conflict('Đã có liên kết chăm sóc đang hiệu lực cho email này.');
    }

    const pendingRows = await this.db
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          eq(invitations.subjectId, subjectId),
          eq(invitations.emailNormalized, emailNormalized),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (pendingRows[0]) {
      throw AppError.conflict('Đã có lời mời còn hiệu lực cho email này.');
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000);
    const rows = await this.db
      .insert(invitations)
      .values({
        subjectId,
        email: input.email.trim(),
        emailNormalized,
        tokenHash,
        permissions: input.permissions,
        createdByUserId: user.id,
        expiresAt,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('Không tạo được lời mời.');
    await this.audit.record({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'invitation.create',
      targetType: 'invitation',
      targetId: row.id,
      outcome: 'success',
      metadata: { subjectId, expiresInHours: input.expiresInHours },
    });
    const invitation = toInvitationSummary(row);
    const created: InvitationCreated = {
      invitation,
      token,
      acceptUrl: `${this.env.WEB_ORIGIN}/invite/${token}`,
    };
    return invitationCreatedSchema.parse(created);
  }

  async listInvitations(user: UserSummary, subjectId: string): Promise<InvitationList> {
    const access = await this.access.requireSubject(user.id, subjectId);
    this.assertOwner(access.role);
    const rows = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.subjectId, subjectId))
      .orderBy(desc(invitations.createdAt));
    return invitationListSchema.parse({ items: rows.map((row) => toInvitationSummary(row)) });
  }

  /** Preview công khai: không lộ email người được mời, không có dữ liệu sức khỏe. */
  async getPublicInvitation(token: string): Promise<PublicInvitation> {
    const rows = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, sha256(token)))
      .limit(1);
    const invitation = rows[0];
    if (!invitation) throw AppError.notFound('Lời mời không tồn tại.');
    const status = invitationStatus(invitation, new Date());
    if (status !== 'pending') throw AppError.notFound('Lời mời không còn hiệu lực.');

    const subjectRows = await this.db
      .select({ displayName: subjects.displayName })
      .from(subjects)
      .where(and(eq(subjects.id, invitation.subjectId), isNull(subjects.archivedAt)))
      .limit(1);
    const inviterRows = await this.db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, invitation.createdByUserId))
      .limit(1);
    const subjectName = subjectRows[0]?.displayName;
    const inviterName = inviterRows[0]?.displayName;
    if (!subjectName || !inviterName) throw AppError.notFound('Lời mời không còn hiệu lực.');

    return publicInvitationSchema.parse({
      subjectName,
      inviterName,
      permissions: invitation.permissions,
      expiresAt: invitation.expiresAt.toISOString(),
      status,
    });
  }

  /**
   * Chấp nhận lời mời: token dùng một lần, email tài khoản phải khớp.
   * Transaction đánh dấu lời mời, tạo care link active và ghi realtime event.
   */
  async acceptInvitation(user: UserSummary, token: string): Promise<CareLinkSummary> {
    const tokenHash = sha256(token);
    const result = await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.tokenHash, tokenHash),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
            gt(invitations.expiresAt, new Date()),
          ),
        )
        .for('update')
        .limit(1);
      const invitation = rows[0];
      if (!invitation) throw AppError.notFound('Lời mời không tồn tại hoặc đã hết hạn.');
      if (invitation.emailNormalized !== normalizeEmail(user.email)) {
        throw AppError.forbidden('Tài khoản đăng nhập không khớp với email được mời.');
      }

      const subjectRows = await tx
        .select()
        .from(subjects)
        .where(and(eq(subjects.id, invitation.subjectId), isNull(subjects.archivedAt)))
        .limit(1);
      const subject = subjectRows[0];
      if (!subject) throw AppError.notFound('Hồ sơ không còn tồn tại.');
      if (subject.ownerUserId === user.id) {
        throw AppError.conflict('Chủ hồ sơ không thể tạo liên kết chăm sóc cho chính mình.');
      }

      const existingRows = await tx
        .select({ id: careLinks.id })
        .from(careLinks)
        .where(
          and(
            eq(careLinks.subjectId, invitation.subjectId),
            eq(careLinks.caregiverUserId, user.id),
            isNull(careLinks.revokedAt),
          ),
        )
        .limit(1);
      if (existingRows[0]) {
        throw AppError.conflict('Đã có liên kết chăm sóc cho hồ sơ này.');
      }

      const now = new Date();
      await tx
        .update(invitations)
        .set({ acceptedAt: now, acceptedByUserId: user.id })
        .where(eq(invitations.id, invitation.id));

      let link: CareLinkRow | undefined;
      try {
        const inserted = await tx
          .insert(careLinks)
          .values({
            subjectId: invitation.subjectId,
            caregiverUserId: user.id,
            invitedByUserId: invitation.createdByUserId,
            permissions: invitation.permissions,
            status: 'active',
            sharedFrom: now,
            acceptedAt: now,
          })
          .returning();
        link = inserted[0];
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw AppError.conflict('Đã có liên kết chăm sóc cho hồ sơ này.');
        }
        throw error;
      }
      if (!link) throw new Error('Không tạo được liên kết chăm sóc.');

      await tx.insert(realtimeEvents).values({
        subjectId: invitation.subjectId,
        type: 'care.accepted',
        entityId: link.id,
        payload: { linkId: link.id, caregiverUserId: user.id },
      });
      await this.audit.record(
        {
          actorUserId: user.id,
          actorKind: 'user',
          action: 'invitation.accept',
          targetType: 'invitation',
          targetId: invitation.id,
          outcome: 'success',
          metadata: { subjectId: invitation.subjectId, careLinkId: link.id },
        },
        tx,
      );
      return toCareLinkSummary(link, user);
    });
    return careLinkSummarySchema.parse(result);
  }

  /** Danh sách liên kết (gồm active và revoked) cho chủ hồ sơ, kèm thông tin người chăm sóc. */
  async listCareLinks(user: UserSummary, subjectId: string) {
    const access = await this.access.requireSubject(user.id, subjectId);
    this.assertOwner(access.role);
    const rows = await this.db
      .select({ link: careLinks, user: users })
      .from(careLinks)
      .innerJoin(users, eq(users.id, careLinks.caregiverUserId))
      .where(eq(careLinks.subjectId, subjectId))
      .orderBy(careLinks.createdAt);
    return careLinkListSchema.parse({
      items: rows.map((row) => toCareLinkSummary(row.link, toUserSummary(row.user))),
    });
  }

  /** Thu hồi: set revokedAt + realtime event; người bị thu hồi mất quyền ngay qua AccessService. */
  async revokeCareLink(user: UserSummary, subjectId: string, linkId: string): Promise<void> {
    const access = await this.access.requireSubject(user.id, subjectId);
    this.assertOwner(access.role);
    await this.db.transaction(async (tx) => {
      const now = new Date();
      const rows = await tx
        .update(careLinks)
        .set({ status: 'revoked', revokedAt: now })
        .where(
          and(
            eq(careLinks.id, linkId),
            eq(careLinks.subjectId, subjectId),
            isNull(careLinks.revokedAt),
          ),
        )
        .returning();
      const link = rows[0];
      if (!link) throw AppError.notFound('Không tìm thấy liên kết chia sẻ.');
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
          metadata: { subjectId, caregiverUserId: link.caregiverUserId },
        },
        tx,
      );
    });
  }

  private assertOwner(role: SubjectRole): void {
    if (role !== 'owner') throw AppError.forbidden('Chỉ chủ hồ sơ được quản lý chia sẻ.');
  }
}
