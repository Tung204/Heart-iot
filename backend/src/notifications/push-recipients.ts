import { and, eq, inArray } from 'drizzle-orm';
import type { AppDb } from '../database/database';
import { notificationPreferences, pushSubscriptions } from '../database/schema';

type Executor = Pick<AppDb, 'select'>;

/**
 * Người nhận Web Push trong một danh sách người nhận cảnh báo:
 * phải bật preference và có ít nhất một subscription còn lưu.
 * Quyền cảnh báo/hồ sơ vẫn do listAlertRecipients quyết định trước đó.
 */
export async function listPushRecipientIds(
  executor: Executor,
  recipientIds: string[],
): Promise<Set<string>> {
  if (recipientIds.length === 0) return new Set();
  const rows = await executor
    .select({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions)
    .innerJoin(
      notificationPreferences,
      eq(notificationPreferences.userId, pushSubscriptions.userId),
    )
    .where(
      and(
        inArray(pushSubscriptions.userId, recipientIds),
        eq(notificationPreferences.webPushEnabled, true),
      ),
    );
  return new Set(rows.map((row) => row.userId));
}
