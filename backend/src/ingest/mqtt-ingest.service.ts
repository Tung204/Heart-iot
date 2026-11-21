import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { connect, type MqttClient } from 'mqtt';
import { z } from 'zod';
import {
  incidentEnvelopeSchema,
  telemetryEnvelopeSchema,
  type IncidentEnvelope,
  type IngestAck,
} from '@heart-iot/contracts/telemetry';
import { ENV, type AppEnv } from '../config/env';
import { DB, type AppDb } from '../database/database';
import { devices, type DeviceRow } from '../database/schema';
import { eq } from 'drizzle-orm';
import { IncidentsService } from '../incidents/incidents.service';
import { TelemetryIngestService, type IngestOutcome } from './telemetry-ingest.service';

/**
 * Adapter MQTT cho ingest telemetry + sự kiện cảnh báo — profile thử nghiệm.
 *
 * Giới hạn đã biết (ghi trong docs/04, infra/README.md):
 * - Chưa xác thực khóa thiết bị ở tầng ứng dụng: chỉ đối chiếu topic ↔ payload.device_id
 *   và yêu cầu thiết bị tồn tại/active. ACL broker (username = device_id) là lớp
 *   xác thực bắt buộc khi chạy thật; P0-1 vẫn mở.
 * - Chỉ publish ACK ứng dụng cho sự kiện (`v1/devices/{id}/acks`), không publish ACK
 *   cho telemetry; không retain sự kiện/ACK.
 * - Không kết nối khi MQTT_URL trống; unit test chỉ chạy parser/handler, không mở
 *   kết nối thật.
 */

const TELEMETRY_TOPIC_PATTERN = /^v1\/devices\/([^/]+)\/telemetry$/;
const EVENT_TOPIC_PATTERN = /^v1\/devices\/([^/]+)\/events$/;
const deviceIdSchema = z.uuid();

export function parseTelemetryTopic(topic: string): string | null {
  const match = TELEMETRY_TOPIC_PATTERN.exec(topic);
  return match?.[1] ?? null;
}

export function parseEventTopic(topic: string): string | null {
  const match = EVENT_TOPIC_PATTERN.exec(topic);
  return match?.[1] ?? null;
}

/** Topic ACK ứng dụng cho sự kiện; QoS 1, không retain. */
export function eventAckTopic(deviceId: string): string {
  return `v1/devices/${deviceId}/acks`;
}

export type MqttIgnoredReason =
  | 'invalid_topic'
  | 'invalid_payload'
  | 'device_id_mismatch'
  | 'device_not_found'
  | 'device_inactive';

export type MqttHandleResult =
  | { status: 'ok'; outcome: IngestOutcome }
  | { status: 'event'; ack: IngestAck }
  | { status: 'ignored'; reason: MqttIgnoredReason };

type ActiveDevice =
  | { device: DeviceRow }
  | { reason: Extract<MqttIgnoredReason, 'device_not_found' | 'device_inactive'> };

@Injectable()
export class MqttIngestService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MqttIngestService.name);
  private client: MqttClient | null = null;

  constructor(
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(DB) private readonly db: AppDb,
    private readonly ingest: TelemetryIngestService,
    private readonly incidents: IncidentsService,
  ) {}

  onModuleInit(): void {
    if (!this.env.MQTT_URL) return;
    const client = connect(this.env.MQTT_URL, {
      ...(this.env.MQTT_USERNAME !== undefined ? { username: this.env.MQTT_USERNAME } : {}),
      ...(this.env.MQTT_PASSWORD !== undefined ? { password: this.env.MQTT_PASSWORD } : {}),
    });
    this.client = client;
    client.on('connect', () => {
      client.subscribe(
        ['v1/devices/+/telemetry', 'v1/devices/+/events'],
        { qos: 1 },
        (error) => {
          if (error) this.logger.warn(`MQTT subscribe lỗi: ${error.message}`);
        },
      );
    });
    client.on('message', (topic, payload) => {
      void this.handleMessage(topic, payload.toString('utf8'))
        .then((result) => {
          if (result.status === 'ignored') {
            this.logger.warn(`MQTT bỏ bản tin (${result.reason}): topic=${topic}`);
          }
        })
        .catch((error: unknown) => {
          this.logger.warn(
            `MQTT xử lý bản tin lỗi: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    });
    client.on('error', (error) => {
      this.logger.warn(`MQTT lỗi kết nối: ${error.message}`);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (!client) return;
    await new Promise<void>((resolve) => {
      try {
        client.end(false, {}, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  /**
   * Xử lý một bản tin theo topic: telemetry hoặc sự kiện. Sự kiện được ACK sau
   * khi `IncidentsService.ingestEvent` commit; nếu publish ACK lỗi, thiết bị có
   * thể gửi lại và server trả `duplicate` nhờ idempotency.
   */
  async handleMessage(topic: string, rawPayload: string): Promise<MqttHandleResult> {
    const eventDeviceId = parseEventTopic(topic);
    if (eventDeviceId) {
      const result = await this.handleEventIncoming(topic, rawPayload);
      if (result.status === 'event') this.publishAck(eventDeviceId, result.ack);
      return result;
    }
    return this.handleIncoming(topic, rawPayload);
  }

  /**
   * Xử lý một bản tin telemetry. Tách riêng để unit test không cần broker.
   * Không tin device_id chỉ vì JSON hợp lệ: phải khớp topic và tồn tại trong DB.
   */
  async handleIncoming(topic: string, rawPayload: string): Promise<MqttHandleResult> {
    const topicDeviceId = parseTelemetryTopic(topic);
    if (!topicDeviceId) return { status: 'ignored', reason: 'invalid_topic' };
    if (!deviceIdSchema.safeParse(topicDeviceId).success) {
      return { status: 'ignored', reason: 'device_not_found' };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawPayload);
    } catch {
      return { status: 'ignored', reason: 'invalid_payload' };
    }
    const envelopeResult = telemetryEnvelopeSchema.safeParse(parsed);
    if (!envelopeResult.success) return { status: 'ignored', reason: 'invalid_payload' };
    const envelope = envelopeResult.data;
    if (envelope.device_id !== topicDeviceId) {
      return { status: 'ignored', reason: 'device_id_mismatch' };
    }

    const active = await this.findActiveDevice(topicDeviceId);
    if ('reason' in active) return { status: 'ignored', reason: active.reason };

    const outcome = await this.ingest.ingest(active.device, envelope, 'mqtt');
    return { status: 'ok', outcome };
  }

  /**
   * Xử lý một bản tin sự kiện fall/SOS. Dùng chung `IncidentsService` với HTTP để
   * giữ nguyên state machine, idempotency, quarantine và outbox.
   */
  async handleEventIncoming(topic: string, rawPayload: string): Promise<MqttHandleResult> {
    const topicDeviceId = parseEventTopic(topic);
    if (!topicDeviceId) return { status: 'ignored', reason: 'invalid_topic' };
    if (!deviceIdSchema.safeParse(topicDeviceId).success) {
      return { status: 'ignored', reason: 'device_not_found' };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawPayload);
    } catch {
      return { status: 'ignored', reason: 'invalid_payload' };
    }
    const envelopeResult = incidentEnvelopeSchema.safeParse(parsed);
    if (!envelopeResult.success) return { status: 'ignored', reason: 'invalid_payload' };
    const envelope: IncidentEnvelope = envelopeResult.data;
    if (envelope.device_id !== topicDeviceId) {
      return { status: 'ignored', reason: 'device_id_mismatch' };
    }

    const active = await this.findActiveDevice(topicDeviceId);
    if ('reason' in active) return { status: 'ignored', reason: active.reason };

    const ack = await this.incidents.ingestEvent(active.device, envelope);
    return { status: 'event', ack };
  }

  private async findActiveDevice(topicDeviceId: string): Promise<ActiveDevice> {
    const rows = await this.db
      .select()
      .from(devices)
      .where(eq(devices.id, topicDeviceId))
      .limit(1);
    const device = rows[0];
    if (!device) return { reason: 'device_not_found' };
    if (device.status !== 'active') return { reason: 'device_inactive' };
    return { device };
  }

  private publishAck(deviceId: string, ack: IngestAck): void {
    const client = this.client;
    if (!client) {
      this.logger.warn(`MQTT không có client để gửi ACK: device=${deviceId}`);
      return;
    }
    client.publish(eventAckTopic(deviceId), JSON.stringify(ack), { qos: 1, retain: false }, (error) => {
      if (error) this.logger.warn(`MQTT publish ACK lỗi: ${error.message}`);
    });
  }
}
