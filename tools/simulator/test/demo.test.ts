import test from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from '../src/app';
import { capture } from './capture';
import {
  acceptedReply,
  findEvent,
  makeEnv,
  parseIncident,
  rejectedReply,
  startMockServer,
} from './helpers';

test('demo --fast: chạy đúng kịch bản và exit code 0', async (t) => {
  const server = await startMockServer();
  t.after(async () => {
    await server.close();
  });

  const io = capture();
  const code = await runCli(['demo', '--fast'], makeEnv(server), io);

  assert.equal(code, 0);
  // 5 normal + 3 poor + 8 gửi trong 11 mẫu gap = 16 telemetry
  // + 2 event huỷ + 2 event xác nhận = 20 request
  assert.equal(server.requests.length, 20);

  const telemetry = server.requests.filter((request) => request.url.endsWith('/ingest/telemetry'));
  const events = server.requests.filter((request) => request.url.endsWith('/ingest/events'));
  assert.equal(telemetry.length, 16);
  assert.equal(events.length, 4);

  // 5 normal + 3 poor + 11 gap = 19 mẫu sinh ra, 3 mẫu bị bỏ
  const summary = findEvent(io.stdout, 'summary');
  assert.ok(summary);
  assert.equal(summary.command, 'demo');
  assert.equal(summary.generated, 19);
  assert.equal(summary.skipped, 3);
  assert.equal(summary.sent, 20);
  assert.equal(summary.accepted, 20);
  assert.equal(summary.rejected, 0);
  assert.equal(summary.fast, true);

  const incidents = events.map((request) => parseIncident(request));
  const cancelId = incidents[0]!.incident_id;
  const confirmId = incidents[2]!.incident_id;
  assert.notEqual(cancelId, confirmId);
  assert.equal(incidents[0]!.event_type, 'fall.candidate');
  assert.equal(incidents[1]!.event_type, 'fall.cancelled');
  assert.equal(incidents[1]!.incident_id, cancelId);
  assert.equal(incidents[2]!.event_type, 'fall.candidate');
  assert.equal(incidents[3]!.event_type, 'fall.confirmed');
  assert.equal(incidents[3]!.incident_id, confirmId);
});

test('demo --fast: có ack rejected thì exit code 1 và nêu lỗi', async (t) => {
  const server = await startMockServer((request) => {
    const body = request.body as { event_type?: string } | null;
    if (body !== null && body.event_type === 'fall.confirmed') {
      return rejectedReply(request, 'CONFLICT', 'revision đã bị đóng');
    }
    return acceptedReply(request);
  });
  t.after(async () => {
    await server.close();
  });

  const io = capture();
  const code = await runCli(['demo', '--fast'], makeEnv(server), io);

  assert.equal(code, 1);
  assert.match(io.stdout.join('\n'), /"ack_status":"rejected"/);
  assert.match(io.stderr.join('\n'), /demo dừng vì có bản tin bị rejected/);
});
