import {
  incidentEnvelopeSchema,
  telemetryEnvelopeSchema,
  type IncidentEnvelope,
  type TelemetryEnvelope,
} from '@heart-iot/contracts/telemetry';

/**
 * HTTP client gửi bản tin thiết bị tới API ingest.
 * - Header xác thực: `x-device-id`, `x-device-key` (không bao giờ ghi log).
 * - Validate payload bằng schema dùng chung trước khi gửi.
 * - Timeout 10s; lỗi mạng được trả về có cấu trúc, không ném ra khỏi client.
 */

export const DEFAULT_TIMEOUT_MS = 10_000;

export interface ClientResponse {
  /** 0 khi lỗi mạng/timeout, ngược lại là HTTP status. */
  status: number;
  /** Body JSON đã parse; `{ raw }` nếu không phải JSON; null nếu rỗng. */
  body: unknown;
  networkError?: string;
}

export class PayloadValidationError extends Error {
  readonly issues: string;

  constructor(label: string, detail: string) {
    super(`Payload ${label} không đúng hợp đồng: ${detail}`);
    this.name = 'PayloadValidationError';
    this.issues = detail;
  }
}

export interface DeviceClientOptions {
  baseUrl: string;
  deviceId: string;
  deviceKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class DeviceClient {
  private readonly baseUrl: string;
  private readonly deviceId: string;
  private readonly deviceKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DeviceClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.deviceId = options.deviceId;
    this.deviceKey = options.deviceKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl =
      options.fetchImpl ??
      ((input: string | URL | Request, init?: RequestInit) => globalThis.fetch(input, init));
  }

  async postTelemetry(envelope: TelemetryEnvelope): Promise<ClientResponse> {
    const parsed = telemetryEnvelopeSchema.safeParse(envelope);
    if (!parsed.success) {
      throw new PayloadValidationError('telemetry', summarizeIssues(parsed.error.issues));
    }
    return this.post('/ingest/telemetry', parsed.data);
  }

  async postIncident(envelope: IncidentEnvelope): Promise<ClientResponse> {
    const parsed = incidentEnvelopeSchema.safeParse(envelope);
    if (!parsed.success) {
      throw new PayloadValidationError('incident', summarizeIssues(parsed.error.issues));
    }
    return this.post('/ingest/events', parsed.data);
  }

  private async post(path: string, payload: unknown): Promise<ClientResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-device-id': this.deviceId,
          'x-device-key': this.deviceKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const text = await response.text();
      return { status: response.status, body: parseBody(text) };
    } catch (error) {
      return { status: 0, body: null, networkError: describeError(error, this.timeoutMs) };
    } finally {
      clearTimeout(timer);
    }
  }
}

function parseBody(text: string): unknown {
  if (text.length === 0) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

function describeError(error: unknown, timeoutMs: number): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return `quá thời gian chờ ${timeoutMs}ms`;
    }
    return error.message;
  }
  return String(error);
}

function summarizeIssues(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  return issues
    .slice(0, 5)
    .map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}
