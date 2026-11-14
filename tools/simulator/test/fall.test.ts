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

test('T-sim-05: fall cancel — 2 event cùng incident_id, revision 1→2, đúng thứ tự', async (t) => {
  const server = await startMockServer();
  t.after(async () => {
    await server.close();
  });

  const io = capture();
  const code = await runCli(
    ['fall', '--mode', 'cancel', '--cancel-window-ms', '0'],
    makeEnv(server),
    io,
  );

  assert.equal(code, 0);
  assert.equal(server.requests.length, 2);
  assert.equal(server.requests[0]!.url, '/api/v1/ingest/events');

  const first = parseIncident(server.requests[0]!);
  const second = parseIncident(server.requests[1]!);

  assert.match(first.incident_id, /^sim-[0-9a-f-]{36}$/);
  assert.equal(first.incident_id, second.incident_id);
  assert.equal(first.event_revision, 1);
  assert.equal(second.event_revision, 2);
  assert.equal(first.event_type, 'fall.candidate');
  assert.equal(second.event_type, 'fall.cancelled');
  assert.ok(second.sequence > first.sequence, 'sequence phải tăng giữa hai bản tin');
  assert.equal(first.clock_status, 'synced');
  assert.ok(first.measured_at !== null);

  const summary = findEvent(io.stdout, 'summary');
  assert.ok(summary);
  assert.equal(summary.mode, 'cancel');
  assert.equal(summary.requests, 2);
  assert.equal(summary.accepted, 2);
  assert.equal(summary.incident_id, first.incident_id);
});

test('T-sim-06: fall confirm — server rejected thì exit code 1', async (t) => {
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
  const code = await runCli(
    ['fall', '--mode', 'confirm', '--cancel-window-ms', '0'],
    makeEnv(server),
    io,
  );

  assert.equal(code, 1);
  assert.equal(server.requests.length, 2);
  assert.match(io.stdout.join('\n'), /"ack_status":"rejected"/);
  assert.match(io.stderr.join('\n'), /không nhận được ACK accepted\/duplicate/);
});

test('T-sim-06b: fall confirm — gửi candidate rev1 rồi confirmed rev2 kèm evidence/version', async (t) => {
  const server = await startMockServer();
  t.after(async () => {
    await server.close();
  });

  const io = capture();
  const code = await runCli(
    ['fall', '--mode', 'confirm', '--cancel-window-ms', '0'],
    makeEnv(server),
    io,
  );

  assert.equal(code, 0);
  assert.equal(server.requests.length, 2);

  const candidate = parseIncident(server.requests[0]!);
  const confirmed = parseIncident(server.requests[1]!);
  assert.equal(candidate.incident_id, confirmed.incident_id);
  assert.equal(candidate.event_type, 'fall.candidate');
  assert.equal(candidate.event_revision, 1);
  assert.equal(confirmed.event_type, 'fall.confirmed');
  assert.equal(confirmed.event_revision, 2);
  assert.equal(confirmed.incident_type, 'fall');
  assert.equal(confirmed.evidence.algorithm_version, 'sim-rules-v1');
  assert.ok(confirmed.measured_at !== null);
});

test('T-sim-07: fall duplicate — cùng message_id và body giống hệt, ACK duplicate', async (t) => {
  const server = await startMockServer((request, index) => {
    const reply = acceptedReply(request);
    if (index === 1) {
      (reply.body as Record<string, unknown>).status = 'duplicate';
    }
    return reply;
  });
  t.after(async () => {
    await server.close();
  });

  const io = capture();
  const code = await runCli(['fall', '--mode', 'duplicate'], makeEnv(server), io);

  assert.equal(code, 0);
  assert.equal(server.requests.length, 2);
  assert.deepEqual(server.requests[0]!.body, server.requests[1]!.body);

  const first = parseIncident(server.requests[0]!);
  const second = parseIncident(server.requests[1]!);
  assert.equal(first.message_id, second.message_id);
  assert.equal(first.sequence, second.sequence);
  assert.equal(first.incident_id, second.incident_id);

  const output = io.stdout.join('\n');
  assert.match(output, /"ack_status":"accepted"/);
  assert.match(output, /"ack_status":"duplicate"/);
});

test('fall late — candidate clock unsynced/measured_at null, confirmed khi đã có giờ', async (t) => {
  const server = await startMockServer();
  t.after(async () => {
    await server.close();
  });

  const io = capture();
  const code = await runCli(
    ['fall', '--mode', 'late', '--cancel-window-ms', '0'],
    makeEnv(server),
    io,
  );

  assert.equal(code, 0);
  assert.equal(server.requests.length, 2);

  const candidate = parseIncident(server.requests[0]!);
  const confirmed = parseIncident(server.requests[1]!);
  assert.equal(candidate.clock_status, 'unsynced');
  assert.equal(candidate.measured_at, null);
  assert.equal(confirmed.clock_status, 'synced');
  assert.ok(confirmed.measured_at !== null);
  assert.equal(candidate.incident_id, confirmed.incident_id);
  assert.equal(confirmed.event_type, 'fall.confirmed');
});

test('fall sos — sos.confirmed revision 1, không chờ cửa sổ', async (t) => {
  const server = await startMockServer();
  t.after(async () => {
    await server.close();
  });

  const io = capture();
  const code = await runCli(['fall', '--mode', 'sos'], makeEnv(server), io);

  assert.equal(code, 0);
  assert.equal(server.requests.length, 1);

  const sos = parseIncident(server.requests[0]!);
  assert.equal(sos.event_type, 'sos.confirmed');
  assert.equal(sos.incident_type, 'sos');
  assert.equal(sos.event_revision, 1);
  assert.equal(sos.clock_status, 'synced');
});
