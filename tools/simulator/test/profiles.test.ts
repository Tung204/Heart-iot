import test from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from '../src/app';
import { capture } from './capture';
import { findEvent, makeEnv, parseTelemetry, startMockServer } from './helpers';

test('T-sim-02: profile poor — mẫu quality không valid có heart_rate_bpm null, không dùng 0', async (t) => {
  const server = await startMockServer();
  t.after(async () => {
    await server.close();
  });

  const io = capture();
  const code = await runCli(
    ['telemetry', '--count', '6', '--interval-ms', '0', '--profile', 'poor'],
    makeEnv(server),
    io,
  );

  assert.equal(code, 0);
  assert.equal(server.requests.length, 6);

  let poorSamples = 0;
  let validSamples = 0;
  for (const request of server.requests) {
    const envelope = parseTelemetry(request);
    if (envelope.quality.heart_rate === 'poor_signal') {
      poorSamples += 1;
      assert.equal(envelope.metrics.heart_rate_bpm, null, 'quality poor phải đi với null');
    } else {
      validSamples += 1;
      assert.equal(envelope.quality.heart_rate, 'valid');
      assert.ok(envelope.metrics.heart_rate_bpm !== null);
    }
    assert.notEqual(envelope.metrics.heart_rate_bpm, 0, 'không được dùng 0 thay cho thiếu dữ liệu');
  }

  assert.equal(poorSamples, 4, '2/3 của 6 mẫu phải là poor_signal');
  assert.equal(validSamples, 2);

  const summary = findEvent(io.stdout, 'summary');
  assert.ok(summary);
  assert.equal(summary.sent, 6);
});

test('T-sim-03: profile gap — bỏ 3 mẫu liên tiếp, sequence nhảy, không gửi mẫu thiếu', async (t) => {
  const server = await startMockServer();
  t.after(async () => {
    await server.close();
  });

  const io = capture();
  const code = await runCli(
    ['telemetry', '--count', '10', '--interval-ms', '0', '--profile', 'gap'],
    makeEnv(server),
    io,
  );

  assert.equal(code, 0);
  assert.equal(server.requests.length, 7, '10 mẫu sinh ra, 3 mẫu bị bỏ');

  const sequences = server.requests.map((request) => parseTelemetry(request).sequence);
  assert.deepEqual(sequences, [1, 2, 6, 7, 8, 9, 10]);
  for (const missing of [3, 4, 5]) {
    assert.ok(!sequences.includes(missing), `sequence ${missing} không được gửi`);
  }

  const summary = findEvent(io.stdout, 'summary');
  assert.ok(summary);
  assert.equal(summary.generated, 10);
  assert.equal(summary.sent, 7);
  assert.equal(summary.skipped, 3);

  const boots = new Set(
    server.requests.map((request) => parseTelemetry(request).boot_id),
  );
  assert.equal(boots.size, 1, 'profile gap không đổi boot');
});

test('T-sim-04: profile reset — boot_id mới, steps về 0, sequence reset theo boot', async (t) => {
  const server = await startMockServer();
  t.after(async () => {
    await server.close();
  });

  const io = capture();
  const code = await runCli(
    ['telemetry', '--count', '6', '--interval-ms', '0', '--profile', 'reset'],
    makeEnv(server),
    io,
  );

  assert.equal(code, 0);
  assert.equal(server.requests.length, 6);

  const envelopes = server.requests.map((request) => parseTelemetry(request));
  const bootIds = envelopes.map((envelope) => envelope.boot_id);
  assert.equal(new Set(bootIds).size, 2, 'phải có đúng hai boot');

  const firstBoot = bootIds.slice(0, 3);
  const secondBoot = bootIds.slice(3);
  assert.equal(new Set(firstBoot).size, 1);
  assert.equal(new Set(secondBoot).size, 1);
  assert.notEqual(firstBoot[0], secondBoot[0]);

  const sequences = envelopes.map((envelope) => envelope.sequence);
  assert.deepEqual(sequences, [1, 2, 3, 1, 2, 3]);

  assert.ok(envelopes[2]!.metrics.steps_since_boot > 0);
  assert.equal(envelopes[3]!.metrics.steps_since_boot, 0, 'steps phải về 0 sau reboot');
  assert.ok(
    envelopes[4]!.metrics.steps_since_boot > envelopes[3]!.metrics.steps_since_boot,
    'steps tăng lại sau reboot',
  );

  const bootEvents = io.stdout
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as Record<string, any>)
    .filter((entry) => entry.event === 'boot');
  assert.equal(bootEvents.length, 1);
  assert.equal(bootEvents[0]!.boot_id, envelopes[3]!.boot_id);

  const summary = findEvent(io.stdout, 'summary');
  assert.ok(summary);
  assert.equal(summary.boots, 2);
});
