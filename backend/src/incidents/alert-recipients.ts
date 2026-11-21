import { and, eq, isNull } from 'drizzle-orm';
import type { AppDb } from '../database/database';
import { careLinks, subjects, users } from '../database/schema';

type Executor = Pick<AppDb, 'select'>;

export type AlertRecipient = { userId: string; displayName: string };

/**
 * Người nhận cảnh báo của một hồ sơ: chủ hồ sơ còn hoạt động + người thân
 * đang active và có `canReceiveAlerts`. Tài khoản bị khóa bị bỏ qua ngay từ
 * lúc xếp hàng; worker vẫn kiểm lại quyền trước khi gửi.
 */
export async function listAlertRecipients(
  executor: Executor,
  subjectId: string,
): Promise<AlertRecipient[]> {
  const subjectRows = await executor
    .select({ ownerUserId: subjects.ownerUserId })
    .from(subjects)
    .where(eq(subjects.id, subjectId))
    .limit(1);
  const subjectRow = subjectRows[0];
  if (!subjectRow) return [];

  const result = new Map<string, AlertRecipient>();
  const ownerRows = await executor
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(and(eq(users.id, subjectRow.ownerUserId), eq(users.status, 'active')))
    .limit(1);
  for (const owner of ownerRows) {
    result.set(owner.id, { userId: owner.id, displayName: owner.displayName });
  }

  const linkRows = await executor
    .select({
      userId: users.id,
      displayName: users.displayName,
      permissions: careLinks.permissions,
    })
    .from(careLinks)
    .innerJoin(users, eq(users.id, careLinks.caregiverUserId))
    .where(
      and(
        eq(careLinks.subjectId, subjectId),
        eq(careLinks.status, 'active'),
        isNull(careLinks.revokedAt),
        eq(users.status, 'active'),
      ),
    );
  for (const link of linkRows) {
    if (link.permissions.canReceiveAlerts) {
      result.set(link.userId, { userId: link.userId, displayName: link.displayName });
    }
  }
  return [...result.values()];
}
