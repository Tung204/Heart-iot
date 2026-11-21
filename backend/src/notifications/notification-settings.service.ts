import { Inject, Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  notificationPreferencesSchema,
  pushSubscriptionListSchema,
  pushSubscriptionViewSchema,
  type NotificationPreferences,
  type NotificationPreferencesUpdate,
  type PushSubscriptionInput,
  type PushSubscriptionList,
  type PushSubscriptionView,
} from '@heart-iot/contracts/notification-preferences';
import { DB, type AppDb } from '../database/database';
import { notificationPreferences, pushSubscriptions } from '../database/schema';
import { AuditService } from '../access/audit.service';
import { AppError } from '../common/app-error';
import { ENV, type AppEnv } from '../config/env';
import { isUniqueViolation } from '../database/errors';

const MAX_SUBSCRIPTIONS = 20;

function assertSafePushEndpoint(endpoint: string): void {
  const url = new URL(endpoint);
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  // Chặn SSRF cơ bản: endpoint push phải là hostname công khai, không phải IP/localhost.
  if (
    isIP(host) !== 0 ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw AppError.validation('Endpoint push không hợp lệ.');
  }
}

function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host.slice(0, 255);
  } catch {
    return 'unknown';
  }
}

@Injectable()
export class NotificationSettingsService {
  constructor(
    @Inject(DB) private readonly db: AppDb,
    @Inject(ENV) private readonly env: AppEnv,
    private readonly audit: AuditService,
  ) {}

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const rows = await this.db
      .select({ webPushEnabled: notificationPreferences.webPushEnabled })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);
    return notificationPreferencesSchema.parse({
      inApp: true,
      webPush: rows[0]?.webPushEnabled ?? false,
      webPushAvailable: this.env.WEB_PUSH_ENABLED,
      webPushPublicKey: this.env.WEB_PUSH_ENABLED
        ? (this.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? null)
        : null,
    });
  }

  async updatePreferences(
    userId: string,
    input: NotificationPreferencesUpdate,
  ): Promise<NotificationPreferences> {
    if (input.webPush && !this.env.WEB_PUSH_ENABLED) {
      throw AppError.conflict('Web Push chưa được bật trên máy chủ.');
    }
    const now = new Date();
    await this.db
      .insert(notificationPreferences)
      .values({ userId, webPushEnabled: input.webPush, updatedAt: now })
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: { webPushEnabled: input.webPush, updatedAt: now },
      });
    await this.audit.record({
      actorUserId: userId,
      actorKind: 'user',
      action: 'notification_preferences.update',
      targetType: 'user',
      targetId: userId,
      outcome: 'success',
      metadata: { webPush: input.webPush },
    });
    return this.getPreferences(userId);
  }

  async listSubscriptions(userId: string): Promise<PushSubscriptionList> {
    const rows = await this.db
      .select({
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
        createdAt: pushSubscriptions.createdAt,
        lastUsedAt: pushSubscriptions.lastUsedAt,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .orderBy(desc(pushSubscriptions.createdAt));
    return pushSubscriptionListSchema.parse({
      available: this.env.WEB_PUSH_ENABLED,
      items: rows.map((row) => this.toView(row)),
    });
  }

  async addSubscription(
    userId: string,
    input: PushSubscriptionInput,
    userAgent: string | undefined,
  ): Promise<PushSubscriptionView> {
    if (!this.env.WEB_PUSH_ENABLED) {
      throw AppError.conflict('Web Push chưa được bật trên máy chủ.');
    }
    assertSafePushEndpoint(input.endpoint);
    const existing = await this.db
      .select({ id: pushSubscriptions.id, userId: pushSubscriptions.userId })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, input.endpoint))
      .limit(1);
    const found = existing[0];
    if (found && found.userId !== userId) {
      // Endpoint là capability URL của một trình duyệt; không chuyển chủ âm thầm.
      throw AppError.conflict('Không thể đăng ký thiết bị nhận thông báo này.');
    }
    if (found) {
      const updated = await this.db
        .update(pushSubscriptions)
        .set({
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: userAgent?.slice(0, 300) ?? null,
          updatedAt: new Date(),
        })
        .where(eq(pushSubscriptions.id, found.id))
        .returning();
      const row = updated[0]!;
      await this.audit.record({
        actorUserId: userId,
        actorKind: 'user',
        action: 'push_subscription.update',
        targetType: 'push_subscription',
        targetId: row.id,
        outcome: 'success',
        metadata: { host: endpointHost(input.endpoint) },
      });
      return this.toView(row);
    }

    const counts = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    if ((counts[0]?.count ?? 0) >= MAX_SUBSCRIPTIONS) {
      throw AppError.conflict('Đã đạt giới hạn thiết bị nhận thông báo.');
    }

    try {
      const inserted = await this.db
        .insert(pushSubscriptions)
        .values({
          userId,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: userAgent?.slice(0, 300) ?? null,
        })
        .returning();
      const row = inserted[0]!;
      await this.audit.record({
        actorUserId: userId,
        actorKind: 'user',
        action: 'push_subscription.add',
        targetType: 'push_subscription',
        targetId: row.id,
        outcome: 'success',
        metadata: { host: endpointHost(input.endpoint) },
      });
      return this.toView(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict('Không thể đăng ký thiết bị nhận thông báo này.');
      }
      throw error;
    }
  }

  async removeSubscription(userId: string, subscriptionId: string): Promise<void> {
    const rows = await this.db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.id, subscriptionId),
          eq(pushSubscriptions.userId, userId),
        ),
      )
      .returning({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint });
    const row = rows[0];
    if (!row) throw AppError.notFound('Không tìm thấy thiết bị nhận thông báo.');
    await this.audit.record({
      actorUserId: userId,
      actorKind: 'user',
      action: 'push_subscription.remove',
      targetType: 'push_subscription',
      targetId: row.id,
      outcome: 'success',
      metadata: { host: endpointHost(row.endpoint) },
    });
  }

  private toView(row: {
    id: string;
    endpoint: string;
    createdAt: Date;
    lastUsedAt: Date | null;
  }): PushSubscriptionView {
    return pushSubscriptionViewSchema.parse({
      id: row.id,
      endpointHost: endpointHost(row.endpoint),
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    });
  }
}
