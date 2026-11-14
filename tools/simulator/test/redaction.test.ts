import test from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from '../src/app';
import { capture } from './capture';
import { closedServerUrl } from './helpers';

const SECRET_KEY = 'sim-secret-device-key-9f8e7d6c5b4a';

test('T-sim-09: không in device key ra stdout/stderr kể cả khi lỗi mạng', async () => {
  const baseUrl = await closedServerUrl();
  const io = capture();

  const code = await runCli(
    ['telemetry', '--count', '1', '--interval-ms', '0'],
    {
      ANNHIEN_BASE_URL: baseUrl,
      ANNHIEN_DEVICE_ID: 'sim-device-1',
      ANNHIEN_DEVICE_KEY: SECRET_KEY,
    },
    io,
  );

  assert.equal(code, 1, 'không gửi được thì phải exit code 1');

  const output = io.text();
  assert.ok(output.length > 0);
  assert.ok(!output.includes(SECRET_KEY), 'device key bị lộ trong output');
  assert.ok(!io.stdout.join('\n').includes(SECRET_KEY));
  assert.ok(!io.stderr.join('\n').includes(SECRET_KEY));
  assert.match(io.stderr.join('\n'), /"event":"abandoned"/);
});

test('lỗi tham số không in giá trị device key', async () => {
  const io = capture();
  const code = await runCli(
    ['telemetry', '--count', '0'],
    {
      ANNHIEN_DEVICE_ID: 'sim-device-1',
      ANNHIEN_DEVICE_KEY: SECRET_KEY,
    },
    io,
  );

  assert.equal(code, 2);
  assert.ok(!io.text().includes(SECRET_KEY));
});
