import test from 'node:test';
import assert from 'node:assert/strict';
import { DeviceClient } from '../src/client';
import { SimDevice, TelemetrySimulator } from '../src/device';
import { OutboxQueue, type QueueSettlement } from '../src/queue';
import { SimulatorRuntime } from '../src/runtime';
import { capture } from './capture';
import {
  TEST_DEVICE_ID,
  TEST_DEVICE_KEY,
  acceptedReply,
  makeEnv,
  startMockServer,
  type MockServer,
} from './helpers';

function createRuntime(server: MockServer, io: ReturnType<typeof capture>): SimulatorRuntime {
  const env = makeEnv(server);
  const client = new DeviceClient({
    baseUrl: env.HEART_IOT_BASE_URL!,
    deviceId: TEST_DEVICE_ID,
    deviceKey: TEST_DEVICE_KEY,
  });
  return new SimulatorRuntime({ client, io, backoffMs: [0], maxAttempts: 2 });
}

function sampleEnvelope() {
  const device = new SimDevice({ deviceId: TEST_DEVICE_ID, firmwareVersion: '0.0.0-sim-test' });
  return new TelemetrySimulator({ device, profile: 'normal', intervalMs: 0 }).next().envelope;
}

test('T-sim-08a: server trả 500 lần đầu — retry cùng message_id rồi accepted', async (t) => {
  const server = await startMockServer((request, index) => {
    if (index === 0) {
      return {
        status: 500,
        body: { code: 'INTERNAL', message: 'lỗi tạm thời', requestId: 'req-1' },
      };
    }
    return acceptedReply(request);
  });
  t.after(async () => {
    await server.close();
  });

  const io = capture();
  const runtime = createRuntime(server, io);
  const envelope = sampleEnvelope();
  const result = await runtime.sendTelemetry(envelope);

  assert.equal(result.kind, 'delivered');
  assert.equal(result.ack?.status, 'accepted');
  assert.equal(server.requests.length, 2);

  const firstBody = server.requests[0]!.body as { message_id: string };
  const secondBody = server.requests[1]!.body as { message_id: string };
  assert.equal(firstBody.message_id, envelope.message_id);
  assert.equal(secondBody.message_id, envelope.message_id);
  assert.deepEqual(server.requests[0]!.body, server.requests[1]!.body);

  assert.match(io.stdout.join('\n'), /"event":"retry"/);
});

test('T-sim-08b: 4xx không retry — một request, kết quả permanent', async (t) => {
  const server = await startMockServer(() => ({
    status: 422,
    body: { code: 'VALIDATION_FAILED', message: 'payload sai hợp đồng', requestId: 'req-2' },
  }));
  t.after(async () => {
    await server.close();
  });

  const io = capture();
  const runtime = createRuntime(server, io);
  const result = await runtime.sendTelemetry(sampleEnvelope());

  assert.equal(result.kind, 'permanent');
  assert.equal(server.requests.length, 1);
  assert.match(io.stderr.join('\n'), /VALIDATION_FAILED/);
});

test('T-sim-08c: payload sai schema bị chặn trước khi gửi mạng', async (t) => {
  const server = await startMockServer();
  t.after(async () => {
    await server.close();
  });

  const io = capture();
  const runtime = createRuntime(server, io);
  const envelope = sampleEnvelope();
  envelope.quality.heart_rate = 'poor_signal'; // HR vẫn có số -> schema phải từ chối

  const result = await runtime.sendTelemetry(envelope);

  assert.equal(result.kind, 'invalid');
  assert.equal(server.requests.length, 0);
  assert.match(io.stderr.join('\n'), /"event":"payload_invalid"/);
});

test('T-sim-08d: hàng đợi đầy — bỏ telemetry cũ nhất, đếm số mất, giữ incident', async () => {
  const dropped: string[] = [];
  const queue = new OutboxQueue({
    sender: async () => ({ outcome: 'permanent' as const, status: 400, body: null }),
    capacity: 2,
    onDropped: (item) => {
      dropped.push(item.messageId);
    },
  });

  queue.enqueue({ kind: 'telemetry', messageId: 't-1', payload: {} });
  queue.enqueue({ kind: 'incident', messageId: 'i-1', payload: {} });
  queue.enqueue({ kind: 'telemetry', messageId: 't-2', payload: {} });
  queue.enqueue({ kind: 'telemetry', messageId: 't-3', payload: {} });

  assert.deepEqual(
    queue.pending.map((item) => item.messageId),
    ['i-1', 't-3'],
    'incident được ưu tiên giữ lại',
  );
  assert.equal(queue.droppedTelemetry, 2);
  assert.equal(queue.droppedIncidents, 0);
  assert.deepEqual(dropped, ['t-1', 't-2']);
});

test('T-sim-08e: retry có giới hạn — bỏ bản tin sau maxAttempts', async () => {
  const settlements: QueueSettlement[] = [];
  const queue = new OutboxQueue({
    sender: async () => ({ outcome: 'retryable' as const, status: 0, error: 'mất mạng' }),
    maxAttempts: 2,
    backoffMs: [0],
    onSettled: (settlement) => {
      settlements.push(settlement);
    },
  });

  queue.enqueue({ kind: 'telemetry', messageId: 'm-1', payload: {} });
  await queue.flush();

  assert.equal(settlements.length, 1);
  const settled = settlements[0]!;
  assert.equal(settled.kind, 'abandoned');
  assert.equal(settled.item.attempts, 2);
  assert.equal(queue.size, 0);
});
