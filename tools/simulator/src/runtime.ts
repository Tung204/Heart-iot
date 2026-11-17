import {
  ingestAckSchema,
  type IncidentEnvelope,
  type IngestAck,
  type TelemetryEnvelope,
} from '@heart-iot/contracts/telemetry';
import type { DeviceClient } from './client';
import { jsonLine, type Io } from './io';
import {
  OutboxQueue,
  classifyClientResponse,
  type QueueItem,
  type QueueSettlement,
  type SenderResult,
} from './queue';

/**
 * Ghép client HTTP + hàng đợi hữu hạn, in mỗi phản hồi thành một dòng JSON,
 * và trả kết quả gửi đã chuẩn hóa cho các lệnh CLI.
 */

export interface DeliveryResult {
  kind: 'delivered' | 'permanent' | 'invalid' | 'abandoned';
  httpStatus: number;
  body: unknown;
  ack: IngestAck | null;
  error: string | null;
}

export function isAccepted(result: DeliveryResult): boolean {
  return (
    result.kind === 'delivered' &&
    (result.ack?.status === 'accepted' || result.ack?.status === 'duplicate')
  );
}

export function isDuplicate(result: DeliveryResult): boolean {
  return result.kind === 'delivered' && result.ack?.status === 'duplicate';
}

export interface RuntimeOptions {
  client: DeviceClient;
  io: Io;
  capacity?: number;
  backoffMs?: readonly number[];
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class SimulatorRuntime {
  private readonly client: DeviceClient;
  private readonly io: Io;
  private readonly queue: OutboxQueue;
  private readonly settlements = new Map<string, QueueSettlement>();
  private readonly maxAttempts: number;

  constructor(options: RuntimeOptions) {
    this.client = options.client;
    this.io = options.io;
    this.maxAttempts = options.maxAttempts ?? 4;
    this.queue = new OutboxQueue({
      sender: (item) => this.send(item),
      capacity: options.capacity,
      backoffMs: options.backoffMs,
      maxAttempts: options.maxAttempts,
      sleep: options.sleep,
      onSettled: (settlement) => {
        this.settlements.set(settlement.item.id, settlement);
        this.logSettlement(settlement);
      },
      onRetry: (item, result) => {
        this.io.out(
          jsonLine({
            event: 'retry',
            kind: item.kind,
            message_id: item.messageId,
            attempt: item.attempts,
            max_attempts: this.maxAttempts,
            http_status: result.status ?? null,
            error: result.error ?? null,
          }),
        );
      },
      onDropped: (item) => {
        this.io.err(
          jsonLine({
            event: 'queue_drop',
            kind: item.kind,
            message_id: item.messageId,
            dropped_telemetry_total: this.queue.droppedTelemetry,
            dropped_incident_total: this.queue.droppedIncidents,
          }),
        );
      },
    });
  }

  sendTelemetry(envelope: TelemetryEnvelope): Promise<DeliveryResult> {
    return this.dispatch('telemetry', envelope, envelope.message_id);
  }

  sendIncident(envelope: IncidentEnvelope): Promise<DeliveryResult> {
    return this.dispatch('incident', envelope, envelope.message_id);
  }

  /** Số mẫu telemetry đã bị bỏ vì hàng đợi đầy. */
  get droppedTelemetry(): number {
    return this.queue.droppedTelemetry;
  }

  get droppedIncidents(): number {
    return this.queue.droppedIncidents;
  }

  private async dispatch(
    kind: 'telemetry' | 'incident',
    payload: TelemetryEnvelope | IncidentEnvelope,
    messageId: string,
  ): Promise<DeliveryResult> {
    const item = this.queue.enqueue({ kind, messageId, payload });
    await this.queue.flush();
    const settlement = this.settlements.get(item.id);
    if (settlement === undefined) {
      return {
        kind: 'abandoned',
        httpStatus: 0,
        body: null,
        ack: null,
        error: 'không nhận được kết quả gửi',
      };
    }
    return toDeliveryResult(settlement);
  }

  private async send(item: QueueItem): Promise<SenderResult> {
    if (item.kind === 'telemetry') {
      const response = await this.client.postTelemetry(item.payload as TelemetryEnvelope);
      return classifyClientResponse(response);
    }
    const response = await this.client.postIncident(item.payload as IncidentEnvelope);
    return classifyClientResponse(response);
  }

  private logSettlement(settlement: QueueSettlement): void {
    if (settlement.kind === 'delivered') {
      const parsed = ingestAckSchema.safeParse(settlement.body);
      if (!parsed.success) {
        this.io.err(
          jsonLine({
            event: 'ack_invalid',
            kind: settlement.item.kind,
            message_id: settlement.item.messageId,
            http_status: settlement.status,
            error: 'body không đúng ingestAckSchema',
          }),
        );
        return;
      }
      const ack = parsed.data;
      this.io.out(
        jsonLine({
          event: 'ack',
          kind: settlement.item.kind,
          message_id: settlement.item.messageId,
          http_status: settlement.status,
          ack_status: ack.status,
          code: ack.code,
          incident_id: ack.incidentId,
          accepted_revision: ack.acceptedRevision,
          received_at: ack.receivedAt,
        }),
      );
      return;
    }

    if (settlement.kind === 'permanent') {
      this.io.err(
        jsonLine({
          event: 'ack',
          kind: settlement.item.kind,
          message_id: settlement.item.messageId,
          http_status: settlement.status,
          ack_status: 'rejected',
          error: describeErrorBody(settlement.body, settlement.error),
        }),
      );
      return;
    }

    if (settlement.kind === 'invalid') {
      this.io.err(
        jsonLine({
          event: 'payload_invalid',
          kind: settlement.item.kind,
          message_id: settlement.item.messageId,
          error: settlement.error,
        }),
      );
      return;
    }

    this.io.err(
      jsonLine({
        event: 'abandoned',
        kind: settlement.item.kind,
        message_id: settlement.item.messageId,
        attempts: settlement.item.attempts,
        error: settlement.error,
      }),
    );
  }
}

function toDeliveryResult(settlement: QueueSettlement): DeliveryResult {
  if (settlement.kind === 'delivered') {
    const parsed = ingestAckSchema.safeParse(settlement.body);
    if (!parsed.success) {
      return {
        kind: 'delivered',
        httpStatus: settlement.status,
        body: settlement.body,
        ack: null,
        error: 'ACK không đúng hợp đồng ingestAckSchema',
      };
    }
    const ack = parsed.data;
    return {
      kind: 'delivered',
      httpStatus: settlement.status,
      body: settlement.body,
      ack,
      error: ack.status === 'rejected' ? (ack.code ?? 'REJECTED') : null,
    };
  }

  if (settlement.kind === 'permanent') {
    return {
      kind: 'permanent',
      httpStatus: settlement.status,
      body: settlement.body,
      ack: null,
      error: describeErrorBody(settlement.body, settlement.error),
    };
  }

  if (settlement.kind === 'invalid') {
    return {
      kind: 'invalid',
      httpStatus: 0,
      body: null,
      ack: null,
      error: settlement.error,
    };
  }

  return {
    kind: 'abandoned',
    httpStatus: 0,
    body: null,
    ack: null,
    error: settlement.error,
  };
}

function describeErrorBody(body: unknown, fallback: string | null): string {
  if (body !== null && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const code = typeof record.code === 'string' ? record.code : null;
    const message = typeof record.message === 'string' ? record.message : null;
    if (code !== null && message !== null) {
      return `${code}: ${message}`;
    }
    if (code !== null) {
      return code;
    }
    if (message !== null) {
      return message;
    }
  }
  return fallback ?? 'lỗi không xác định';
}
