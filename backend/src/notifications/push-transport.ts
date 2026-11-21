import { Inject, Injectable } from '@nestjs/common';
import webpush from 'web-push';
import { ENV, type AppEnv } from '../config/env';

export const PUSH_TRANSPORT = Symbol('PUSH_TRANSPORT');

export type PushSubscriptionData = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

export interface PushTransport {
  send(subscription: PushSubscriptionData, payload: PushPayload): Promise<void>;
}

/** Lỗi transport kèm mã HTTP của push service để worker quyết định xoá subscription 404/410. */
export class PushTransportError extends Error {
  readonly statusCode: number | null;

  constructor(error: unknown) {
    const statusCode =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? Number((error as { statusCode: unknown }).statusCode)
        : NaN;
    super(
      Number.isInteger(statusCode) && statusCode > 0
        ? `Push service trả ${statusCode}.`
        : 'Không gửi được Web Push.',
    );
    this.name = 'PushTransportError';
    this.statusCode = Number.isInteger(statusCode) && statusCode > 0 ? statusCode : null;
  }
}

/**
 * Transport thật dùng web-push. Chỉ cấu hình VAPID ở lần gửi đầu tiên để app
 * vẫn khởi động được khi cờ tắt; test inject transport giả, không gọi mạng.
 */
@Injectable()
export class WebPushTransport implements PushTransport {
  private configured = false;

  constructor(@Inject(ENV) private readonly env: AppEnv) {}

  private configure(): void {
    if (this.configured) return;
    if (!this.env.WEB_PUSH_ENABLED) throw new PushTransportError(new Error('disabled'));
    const subject = this.env.WEB_PUSH_VAPID_SUBJECT;
    const publicKey = this.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    const privateKey = this.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    if (!subject || !publicKey || !privateKey) {
      throw new PushTransportError(new Error('missing_vapid'));
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.configured = true;
  }

  async send(subscription: PushSubscriptionData, payload: PushPayload): Promise<void> {
    this.configure();
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(payload),
        {
          TTL: this.env.WEB_PUSH_TTL_SECONDS,
          urgency: 'high',
        },
      );
    } catch (error) {
      throw new PushTransportError(error);
    }
  }
}
