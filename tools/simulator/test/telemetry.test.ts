import test from 'node:test';
import assert from 'node:assert/strict';
import { telemetryEnvelopeSchema } from '@annhien/contracts/telemetry';
import { runCli } from '../src/app';
import { capture } from './capture';
import {
  TEST_DEVICE_ID,
  TEST_DEVICE_KEY,
  TEST_FIRMWARE,
  findEvent,
  makeEnv,
  parseTelemetry,
  startMockServer,
} from './helpers';

test('T-sim-01: telemetry gửi đúng header/body, schema parse, sequence tăng', async (t) => {
  const server = await startMockServer();
  t.after(async () => {
    await server.close();
  });

  const io = capture();
  const env = makeEnv(server);
  const code = await runCli(['telemetry', '--count', '3', '--interval-ms', '0'], env, io);

  assert.equal(code, 0);
  assert.equal(server.requests.length, 3);

  const sequences: number[] = [];
  let previousMeasuredAt = 0;

  for (const request of server.requests) {
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/api/v1/ingest/telemetry');
    assert.equal(request.headers['x-device-id'], TEST_DEVICE_ID);
    assert.equal(request.headers['x-device-key'], TEST_DEVICE_KEY);
    assert.equal(request.headers['content-type'], 'application/json');

    // Payload phải parse được bằng đúng schema dùng chung trước khi tới server.
    const schemaResult = telemetryEnvelopeSchema.safeParse(request.body);
    assert.ok(schemaResult.success, 'body không khớp telemetryEnvelopeSchema');

    const envelope = parseTelemetry(request);
    assert.equal(envelope.schema_version, '1.0');
    assert.equal(envelope.device_id, TEST_DEVICE_ID);
    assert.equal(envelope.clock_status, 'synced');
    assert.equal(envelope.firmware_version, TEST_FIRMWARE);
    assert.equal(envelope.quality.heart_rate, 'valid');
    assert.equal(envelope.quality.motion, 'valid');
    assert.equal(envelope.battery_percent, 80);
    assert.ok(envelope.metrics.heart_rate_bpm !== null);
    assert.ok(envelope.metrics.heart_rate_bpm >= 68 && envelope.metrics.heart_rate_bpm <= 82);
    assert.match(envelope.boot_id, /^sim-boot-/);
    assert.match(envelope.measured_at ?? '', /^\d{4}-\d{2}-\d{2}T.*Z$/);

    const measuredAt = Date.parse(envelope.measured_at ?? '');
    assert.ok(measuredAt >= previousMeasuredAt, 'measured_at phải không lùi');
    previousMeasuredAt = measuredAt;
    sequences.push(envelope.sequence);
  }

  assert.deepEqual(sequences, [1, 2, 3]);

  const summary = findEvent(io.stdout, 'summary');
  assert.ok(summary);
  assert.equal(summary.sent, 3);
  assert.equal(summary.accepted, 3);
  assert.equal(summary.rejected, 0);
  assert.equal(summary.generated, 3);
  assert.equal(io.stderr.length, 0);
});
