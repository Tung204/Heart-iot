import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Mock server `node:http` cho test — không gọi API thật.
 * Ghi mọi request (method/url/header/body) để kiểm hợp đồng và thứ tự gửi.
 */

export interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  rawBody: string;
}

export interface MockReply {
  status: number;
  body: unknown;
}

export type MockHandler = (request: RecordedRequest, index: number) => MockReply;

export interface MockServer {
  baseUrl: string;
  requests: RecordedRequest[];
  setHandler(handler: MockHandler): void;
  close(): Promise<void>;
}

export async function startMockServer(handler?: MockHandler): Promise<MockServer> {
  const requests: RecordedRequest[] = [];
  let current: MockHandler =
    handler ??
    ((request) => ({
      status: 202,
      body: {
        status: 'accepted',
        sourceMessageId: (request.body as { message_id?: string } | null)?.message_id ?? 'unknown',
        receivedAt: new Date().toISOString(),
        incidentId: null,
        acceptedRevision: null,
        code: null,
        message: null,
      },
    }));

  const server = createServer((req, res) => {
    let rawBody = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      rawBody += chunk;
    });
    req.on('end', () => {
      let body: unknown = null;
      try {
        body = rawBody.length > 0 ? (JSON.parse(rawBody) as unknown) : null;
      } catch {
        body = rawBody;
      }
      const recorded: RecordedRequest = {
        method: req.method ?? 'GET',
        url: req.url ?? '/',
        headers: req.headers,
        body,
        rawBody,
      };
      requests.push(recorded);
      const reply = current(recorded, requests.length - 1);
      res.statusCode = reply.status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(reply.body));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}/api/v1`,
    requests,
    setHandler: (next: MockHandler) => {
      current = next;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
