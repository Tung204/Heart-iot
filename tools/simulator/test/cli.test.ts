import test from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from '../src/app';
import { capture } from './capture';

test('help của từng lệnh trả exit code 0', async () => {
  const cases: Array<{ args: string[]; pattern: RegExp }> = [
    { args: [], pattern: /telemetry/ },
    { args: ['--help'], pattern: /HEART_IOT_DEVICE_KEY/ },
    { args: ['help'], pattern: /fall/ },
    { args: ['telemetry', '--help'], pattern: /--profile/ },
    { args: ['fall', '--help'], pattern: /--cancel-window-ms/ },
    { args: ['demo', '--help'], pattern: /--fast/ },
  ];

  for (const entry of cases) {
    const io = capture();
    const code = await runCli(entry.args, {}, io);
    assert.equal(code, 0, `help cho ${entry.args.join(' ') || '(root)'}`);
    assert.match(io.stdout.join('\n'), entry.pattern);
    assert.equal(io.stderr.length, 0);
  }
});

test('tham số sai trả exit code 2 và thông báo rõ', async () => {
  const cases: Array<{ args: string[]; pattern: RegExp }> = [
    { args: ['telemetry', '--count', '0'], pattern: /--count/ },
    { args: ['telemetry', '--count', 'abc'], pattern: /--count/ },
    { args: ['telemetry', '--profile', 'bogus'], pattern: /--profile/ },
    { args: ['telemetry', '--khong-co'], pattern: /không được hỗ trợ/ },
    { args: ['telemetry', 'thua'], pattern: /không được hỗ trợ/ },
    { args: ['fall', '--mode', 'nope'], pattern: /--mode/ },
    { args: ['fall', '--cancel-window-ms', '-1'], pattern: /--cancel-window-ms/ },
    { args: ['demo', '--slow'], pattern: /không được hỗ trợ/ },
  ];

  for (const entry of cases) {
    const io = capture();
    const code = await runCli(entry.args, {}, io);
    assert.equal(code, 2, `exit code cho ${entry.args.join(' ')}`);
    assert.match(io.stderr.join('\n'), entry.pattern);
  }
});

test('lệnh không hỗ trợ trả exit code 2', async () => {
  const io = capture();
  const code = await runCli(['khong-ton-tai'], {}, io);
  assert.equal(code, 2);
  assert.match(io.stderr.join('\n'), /lệnh không hỗ trợ/);
});

test('thiếu HEART_IOT_DEVICE_ID/KEY hoặc base URL sai trả exit code 2', async () => {
  const missing = capture();
  const missingCode = await runCli(['telemetry', '--count', '1'], {}, missing);
  assert.equal(missingCode, 2);
  assert.match(missing.stderr.join('\n'), /HEART_IOT_DEVICE_ID/);
  assert.match(missing.stderr.join('\n'), /HEART_IOT_DEVICE_KEY/);

  const badUrl = capture();
  const badUrlCode = await runCli(['telemetry', '--count', '1'], {
    HEART_IOT_BASE_URL: 'khong-phai-url',
    HEART_IOT_DEVICE_ID: 'sim-device-1',
    HEART_IOT_DEVICE_KEY: 'sim-device-key-0123456789abcdef',
  }, badUrl);
  assert.equal(badUrlCode, 2);
  assert.match(badUrl.stderr.join('\n'), /HEART_IOT_BASE_URL/);
});
