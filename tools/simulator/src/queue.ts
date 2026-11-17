import { randomUUID } from 'node:crypto';
import { PayloadValidationError, type ClientResponse } from './client';

/**
 * Hàng đợi hữu hạn cho telemetry/sự kiện của thiết bị mô phỏng.
 *
 * - Lỗi mạng, timeout, 5xx và 429: giữ lại, retry với backoff ngắn và **giữ nguyên
 *   `message_id`** (payload không bị dựng lại) nên server khử trùng đúng.
 * - 4xx khác: bỏ, không retry (lỗi hợp đồng/quyền).
 * - Khi đầy: ưu tiên bỏ mẫu telemetry cũ nhất, sự kiện chỉ bị bỏ khi không còn
 *   telemetry; mỗi lần bỏ đều đếm được để báo số mẫu mất.
 * - Hàng đợi chỉ nằm trong bộ nhớ: không bền qua process restart (ghi rõ ở README).
 */

export type QueueKind = 'telemetry' | 'incident';

export interface QueueItem {
  readonly id: string;
  readonly kind: QueueKind;
  readonly messageId: string;
  readonly payload: unknown;
  attempts: number;
  nextAttemptAt: number;
}

export interface EnqueueInput {
  kind: QueueKind;
  messageId: string;
  payload: unknown;
}

export interface RetryableResult {
  outcome: 'retryable';
  status?: number;
  body?: unknown;
  error?: string;
}

export type SenderResult =
  | { outcome: 'delivered'; status: number; body: unknown }
  | RetryableResult
  | { outcome: 'permanent'; status: number; body: unknown; error?: string }
  | { outcome: 'invalid'; error: string };

export type Sender = (item: QueueItem) => Promise<SenderResult>;

export type QueueSettlement =
  | { kind: 'delivered'; item: QueueItem; status: number; body: unknown }
  | { kind: 'permanent'; item: QueueItem; status: number; body: unknown; error: string | null }
  | { kind: 'invalid'; item: QueueItem; error: string }
  | { kind: 'abandoned'; item: QueueItem; error: string };

export interface QueueOptions {
  sender: Sender;
  capacity?: number;
  /** Backoff ngắn giữa các lần thử (ms). */
  backoffMs?: readonly number[];
  /** Tổng số lần thử tối đa cho một bản tin, gồm lần đầu. */
  maxAttempts?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onSettled?: (settlement: QueueSettlement) => void;
  onRetry?: (item: QueueItem, result: RetryableResult) => void;
  onDropped?: (item: QueueItem, reason: 'capacity') => void;
}

export const DEFAULT_CAPACITY = 50;
export const DEFAULT_BACKOFF_MS: readonly number[] = [200, 500, 1000];
export const DEFAULT_MAX_ATTEMPTS = 4;

export function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function classifyClientResponse(response: ClientResponse): SenderResult {
  if (response.networkError !== undefined) {
    return {
      outcome: 'retryable',
      status: 0,
      body: response.body,
      error: response.networkError,
    };
  }
  const { status } = response;
  if (status >= 200 && status < 300) {
    return { outcome: 'delivered', status, body: response.body };
  }
  if (status === 429 || status >= 500) {
    return {
      outcome: 'retryable',
      status,
      body: response.body,
      error: `HTTP ${status}`,
    };
  }
  if (status >= 400 && status < 500) {
    return {
      outcome: 'permanent',
      status,
      body: response.body,
      error: `HTTP ${status}`,
    };
  }
  return {
    outcome: 'permanent',
    status,
    body: response.body,
    error: `HTTP ${status} không mong đợi`,
  };
}

export class OutboxQueue {
  readonly capacity: number;

  private readonly items: QueueItem[] = [];
  private readonly sender: Sender;
  private readonly backoffMs: readonly number[];
  private readonly maxAttempts: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onSettled?: (settlement: QueueSettlement) => void;
  private readonly onRetry?: (item: QueueItem, result: RetryableResult) => void;
  private readonly onDropped?: (item: QueueItem, reason: 'capacity') => void;

  droppedTelemetry = 0;
  droppedIncidents = 0;

  constructor(options: QueueOptions) {
    this.sender = options.sender;
    this.capacity = options.capacity ?? DEFAULT_CAPACITY;
    this.backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
    this.onSettled = options.onSettled;
    this.onRetry = options.onRetry;
    this.onDropped = options.onDropped;
  }

  get pending(): readonly QueueItem[] {
    return [...this.items];
  }

  get size(): number {
    return this.items.length;
  }

  get droppedTotal(): number {
    return this.droppedTelemetry + this.droppedIncidents;
  }

  enqueue(input: EnqueueInput): QueueItem {
    while (this.items.length >= this.capacity && this.items.length > 0) {
      this.dropOne();
    }
    const item: QueueItem = {
      id: randomUUID(),
      kind: input.kind,
      messageId: input.messageId,
      payload: input.payload,
      attempts: 0,
      nextAttemptAt: this.now(),
    };
    this.items.push(item);
    return item;
  }

  /**
   * Gửi hết hàng đợi theo thứ tự FIFO. Retry tuần tự với backoff; bản tin lỗi
   * vĩnh viễn bị bỏ ngay khi nhận kết quả.
   */
  async flush(): Promise<void> {
    while (this.items.length > 0) {
      const item = this.items[0];
      if (item === undefined) {
        break;
      }
      const waitMs = item.nextAttemptAt - this.now();
      if (waitMs > 0) {
        await this.sleep(waitMs);
      }

      let result: SenderResult;
      try {
        result = await this.sender(item);
      } catch (error) {
        if (error instanceof PayloadValidationError) {
          result = { outcome: 'invalid', error: error.message };
        } else {
          result = {
            outcome: 'retryable',
            status: 0,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      if (result.outcome === 'retryable') {
        item.attempts += 1;
        if (item.attempts >= this.maxAttempts) {
          this.items.shift();
          this.emit({
            kind: 'abandoned',
            item,
            error: result.error ?? `bỏ sau ${item.attempts} lần thử`,
          });
          continue;
        }
        const backoffIndex = Math.min(item.attempts - 1, this.backoffMs.length - 1);
        const delay = this.backoffMs[backoffIndex] ?? 0;
        item.nextAttemptAt = this.now() + delay;
        this.onRetry?.(item, result);
        continue;
      }

      this.items.shift();
      if (result.outcome === 'delivered') {
        this.emit({ kind: 'delivered', item, status: result.status, body: result.body });
      } else if (result.outcome === 'permanent') {
        this.emit({
          kind: 'permanent',
          item,
          status: result.status,
          body: result.body,
          error: result.error ?? null,
        });
      } else {
        this.emit({ kind: 'invalid', item, error: result.error });
      }
    }
  }

  private dropOne(): void {
    const telemetryIndex = this.items.findIndex((item) => item.kind === 'telemetry');
    const dropIndex = telemetryIndex >= 0 ? telemetryIndex : 0;
    const [dropped] = this.items.splice(dropIndex, 1);
    if (dropped === undefined) {
      return;
    }
    if (dropped.kind === 'telemetry') {
      this.droppedTelemetry += 1;
    } else {
      this.droppedIncidents += 1;
    }
    this.onDropped?.(dropped, 'capacity');
  }

  private emit(settlement: QueueSettlement): void {
    this.onSettled?.(settlement);
  }
}
