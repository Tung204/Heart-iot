import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  incidentEnvelopeSchema,
  telemetryEnvelopeSchema,
  type IncidentEnvelope,
  type TelemetryEnvelope,
} from '@annhien/contracts/telemetry';
import type { RecordedRequest, MockServer } from './mock-server';

export type { MockHandler, MockReply, MockServer, RecordedRequest } from './mock-server';
export { startMockServer } from './mock-server';

export const TEST_DEVICE_ID = 'sim-device-1';
export const TEST_DEVICE_KEY = 'sim-device-key-0123456789abcdef';
export const TEST_FIRMWARE = '0.0.0-sim-test';

/** Ack `accepted` hợp lệ theo `ingestAckSchema`; incident trả UUID server. */
export function acceptedReply(request: RecordedRequest): {
  status: number;
  body: unknown;
} {
  const body = request.body as
    | { message_id?: string; incident_id?: string; event_revision?: number }
    | null;
  const isIncident = typeof body?.incident_id === 'string';
  return {
    status: 202,
    body: {
      status: 'accepted',
      sourceMessageId: typeof body?.message_id === 'string' ? body.message_id : 'unknown',
      receivedAt: new Date().toISOString(),
      incidentId: isIncident ? randomUUID() : null,
      acceptedRevision: isIncident ? (body?.event_revision ?? null) : null,
      code: null,
      message: null,
    },
  };
}

export function rejectedReply(
  request: RecordedRequest,
  code: string,
  message: string,
): { status: number; body: unknown } {
  const body = request.body as { message_id?: string; event_revision?: number } | null;
  return {
    status: 202,
    body: {
      status: 'rejected',
      sourceMessageId: typeof body?.message_id === 'string' ? body.message_id : 'unknown',
      receivedAt: new Date().toISOString(),
      incidentId: null,
      acceptedRevision: null,
      code,
      message,
    },
  };
}

export function makeEnv(server: MockServer, overrides: Record<string, string> = {}): Record<string, string> {
  return {
    ANNHIEN_BASE_URL: server.baseUrl,
    ANNHIEN_DEVICE_ID: TEST_DEVICE_ID,
    ANNHIEN_DEVICE_KEY: TEST_DEVICE_KEY,
    ANNHIEN_FIRMWARE: TEST_FIRMWARE,
    ...overrides,
  };
}

export function parseTelemetry(request: RecordedRequest): TelemetryEnvelope {
  const parsed = telemetryEnvelopeSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new Error(`Body không đúng telemetryEnvelopeSchema: ${JSON.stringify(parsed.error.issues)}`);
  }
  return parsed.data;
}

export function parseIncident(request: RecordedRequest): IncidentEnvelope {
  const parsed = incidentEnvelopeSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new Error(`Body không đúng incidentEnvelopeSchema: ${JSON.stringify(parsed.error.issues)}`);
  }
  return parsed.data;
}

/** Đọc các dòng JSON do CLI in ra để kiểm tổng kết/ACK. */
export function jsonEvents(lines: readonly string[]): Array<Record<string, any>> {
  return lines
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as Record<string, any>);
}

export function findEvent(lines: readonly string[], event: string): Record<string, any> | undefined {
  return jsonEvents(lines).find((entry) => entry.event === event);
}

export function jsonEventCount(lines: readonly string[], event: string): number {
  return jsonEvents(lines).filter((entry) => entry.event === event).length;
}

/**
 * Server đóng lại nhưng giữ URL — dùng để kiểm lỗi mạng (connection refused).
 * Có tạo server để lấy cổng trống rồi đóng ngay.
 */
export async function closedServerUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}/api/v1`;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return url;
}
