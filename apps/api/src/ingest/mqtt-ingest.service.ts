import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { connect, type MqttClient } from 'mqtt';
import { z } from 'zod';
import { telemetryEnvelopeSchema } from '@heart-iot/contracts/telemetry';
import { ENV, type AppEnv } from '../config/env';
import { DB, type AppDb } from '../database/database';
import { devices } from '../database/schema';
import { eq } from 'drizzle-orm';
import { TelemetryIngestService, type IngestOutcome } from './telemetry-ingest.service';

/**
 * Adapter MQTT cho ingest telemetry — wave 1.
 *
 * Giới hạn đã biết (ghi trong handoff):
 * - Không xác thực bằng khóa thiết bị trên MQTT: chỉ đối chiếu topic ↔ payload.device_id
 *   và yêu cầu thiết bị tồn tại/active. ACL broker buộc thiết bị chỉ publish topic của
 *   nó là phần chưa kiểm ở v1 (infra/mosquitto.conf chỉ là cấu hình mẫu).
 * - Không publish ACK ngược lại thiết bị trong wave này.
 * - Không kết nối khi MQTT_URL trống; unit test chỉ chạy parser, không mở kết nối thật.
 */

const TELEMETRY_TOPIC_PATTERN = /^v1\/devices\/([^/]+)\/telemetry$/;
const deviceIdSchema = z.uuid();

export function parseTelemetryTopic(topic: string): string | null {
  const match = TELEMETRY_TOPIC_PATTERN.exec(topic);
  return match?.[1] ?? null;
}

export type MqttHandleResult =
  | { status: 'ok'; outcome: IngestOutcome }
  | {
      status: 'ignored';
      reason:
        | 'invalid_topic'
        | 'invalid_payload'
        | 'device_id_mismatch'
        | 'device_not_found'
        | 'device_inactive';
    };

@Injectable()
export class MqttIngestService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MqttIngestService.name);
  private client: MqttClient | null = null;

  constructor(
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(DB) private readonly db: AppDb,
    private readonly ingest: TelemetryIngestService,
  ) {}

  onModuleInit(): void {
    if (!this.env.MQTT_URL) return;
    const client = connect(this.env.MQTT_URL, {
      ...(this.env.MQTT_USERNAME !== undefined ? { username: this.env.MQTT_USERNAME } : {}),
      ...(this.env.MQTT_PASSWORD !== undefined ? { password: this.env.MQTT_PASSWORD } : {}),
    });
    this.client = client;
    client.on('connect', () => {
      client.subscribe('v1/devices/+/telemetry', { qos: 1 }, (error) => {
        if (error) this.logger.warn(`MQTT subscribe lỗi: ${error.message}`);
      });
    });
    client.on('message', (topic, payload) => {
      void this.handleIncoming(topic, payload.toString('utf8'))
        .then((result) => {
          if (result.status === 'ignored') {
            this.logger.warn(`MQTT bỏ bản tin (${result.reason}): topic=${topic}`);
          }
        })
        .catch((error: unknown) => {
          this.logger.warn(`MQTT xử lý bản tin lỗi: ${error instanceof Error ? error.message : String(error)}`);
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
   * Xử lý một bản tin từ topic telemetry. Tách riêng để unit test không cần broker.
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

    const rows = await this.db.select().from(devices).where(eq(devices.id, topicDeviceId)).limit(1);
    const device = rows[0];
    if (!device) return { status: 'ignored', reason: 'device_not_found' };
    if (device.status !== 'active') return { status: 'ignored', reason: 'device_inactive' };

    const outcome = await this.ingest.ingest(device, envelope, 'mqtt');
    return { status: 'ok', outcome };
  }
}
