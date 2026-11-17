import { DeviceClient } from './client';
import { Args } from './args';
import {
  SimDevice,
  TELEMETRY_PROFILES,
  TelemetrySimulator,
  type TelemetryProfile,
} from './device';
import { loadEnv, type LoadedEnv } from './env';
import { buildIncidentEvent, createIncidentId } from './incident';
import { createConsoleIo, createSafeIo, jsonLine, type Io } from './io';
import { defaultSleep } from './queue';
import { SimulatorRuntime, isAccepted, type DeliveryResult } from './runtime';
import { DEFAULT_SEED } from './rng';
import type { IncidentEnvelope, IncidentEventType } from '@heart-iot/contracts/telemetry';
import type { IncidentType } from '@heart-iot/contracts';

/**
 * Cài đặt CLI thiết bị mô phỏng. `runCli` trả exit code thay vì gọi process.exit
 * để test được trong tiến trình; `cli.ts` là entry gán process.exitCode.
 */

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;

const ROOT_HELP = `Thiết bị mô phỏng An Nhiên — gửi telemetry/sự kiện vào API ingest.

Cách dùng:
  tsx src/cli.ts <command> [options]

Lệnh:
  telemetry   Gửi N mẫu telemetry theo profile (normal|poor|gap|reset)
  fall        Gửi chuỗi sự kiện té ngã (cancel|confirm|duplicate|late|sos)
  demo        Kịch bản demo: normal -> poor -> fall cancel -> normal có gap -> fall confirm
  help        In trợ giúp này

Biến môi trường:
  ANNHIEN_BASE_URL     mặc định http://localhost:3000/api/v1
  ANNHIEN_DEVICE_ID    bắt buộc cho lệnh gửi
  ANNHIEN_DEVICE_KEY   bắt buộc cho lệnh gửi (không bị in ra log)
  ANNHIEN_FIRMWARE     mặc định 0.0.0-sim

Chạy "tsx src/cli.ts <command> --help" để xem chi tiết từng lệnh.`;

const TELEMETRY_HELP = `Gửi telemetry tới POST /ingest/telemetry.

Cách dùng:
  tsx src/cli.ts telemetry [--count N] [--interval-ms M] [--profile P] [--seed S]

Tùy chọn:
  --count N        số mẫu sinh ra, 1..1000 (mặc định 5)
  --interval-ms M  thời gian thật giữa hai mẫu, 0..60000 (mặc định 1000)
  --profile P      normal | poor | gap | reset (mặc định normal)
                   normal: HR 68-82, quality valid, steps tăng, pin 80
                   poor:   2/3 mẫu quality poor_signal và heart_rate_bpm null
                   gap:    bỏ 3 mẫu liên tiếp (sequence vẫn tăng)
                   reset:  reboot sau 3 mẫu, boot_id mới, steps/sequence về đầu
  --seed S         seed số giả ngẫu nhiên, 0..2147483647 (mặc định ${DEFAULT_SEED})

Mỗi phản hồi được in thành một dòng JSON; cuối cùng là dòng tổng kết.`;

const FALL_HELP = `Gửi chuỗi sự kiện incident tới POST /ingest/events.

Cách dùng:
  tsx src/cli.ts fall [--mode M] [--cancel-window-ms W]

Tùy chọn:
  --mode M             cancel | confirm | duplicate | late | sos (mặc định cancel)
                       cancel:    candidate rev1 -> chờ cửa sổ -> cancelled rev2
                       confirm:   candidate rev1 -> chờ cửa sổ -> confirmed rev2
                       duplicate: gửi cùng confirmed hai lần y nguyên message_id
                       late:      candidate clock unsynced/measured_at null -> confirmed khi có giờ
                       sos:       sos.confirmed rev1, không chờ cửa sổ
  --cancel-window-ms W độ dài cửa sổ hủy, 0..60000 (mặc định 3000)

incident_id mới mỗi lần chạy (dạng sim-<uuid>), trừ mode duplicate dùng lại đúng
envelope đã gửi. Exit code 1 nếu server trả rejected hoặc gửi thất bại.`;

const DEMO_HELP = `Kịch bản demo trên API thật (không đăng nhập, chỉ gửi thiết bị):
  5 telemetry normal -> 3 poor -> fall candidate/cancelled
  -> 8 telemetry normal có gap -> fall candidate/confirmed

Cách dùng:
  tsx src/cli.ts demo [--fast]

Tùy chọn:
  --fast   giảm interval xuống 100ms và cửa sổ hủy xuống 200ms (dùng cho test)

Dừng và trả exit code 1 nếu có phản hồi rejected hoặc lỗi gửi.`;

interface DeviceCredentials {
  deviceId: string;
  deviceKey: string;
}

interface SendTally {
  sent: number;
  accepted: number;
  duplicate: number;
  rejected: number;
  failed: number;
}

function emptyTally(): SendTally {
  return { sent: 0, accepted: 0, duplicate: 0, rejected: 0, failed: 0 };
}

function tallyResult(tally: SendTally, result: DeliveryResult): void {
  tally.sent += 1;
  switch (result.ack?.status) {
    case 'accepted':
      tally.accepted += 1;
      break;
    case 'duplicate':
      tally.duplicate += 1;
      break;
    case 'rejected':
      tally.rejected += 1;
      break;
    default:
      tally.failed += 1;
      break;
  }
}

function tallyFailed(tally: SendTally): number {
  return tally.rejected + tally.failed;
}

function reportUsageErrors(io: Io, errors: readonly string[]): number {
  for (const message of errors) {
    io.err(`Lỗi: ${message}`);
  }
  return EXIT_USAGE;
}

function resolveCredentials(loaded: LoadedEnv, errors: string[]): DeviceCredentials | null {
  const { env } = loaded;
  errors.push(...loaded.problems);
  if (env.deviceId === null) {
    errors.push('thiếu ANNHIEN_DEVICE_ID (bắt buộc cho lệnh gửi)');
  }
  if (env.deviceKey === null) {
    errors.push('thiếu ANNHIEN_DEVICE_KEY (bắt buộc cho lệnh gửi)');
  } else if (env.deviceKey.length < 16) {
    errors.push('ANNHIEN_DEVICE_KEY phải dài tối thiểu 16 ký tự');
  }
  if (errors.length > 0 || env.deviceId === null || env.deviceKey === null) {
    return null;
  }
  return { deviceId: env.deviceId, deviceKey: env.deviceKey };
}

function createRuntime(loaded: LoadedEnv, credentials: DeviceCredentials, io: Io): SimulatorRuntime {
  const client = new DeviceClient({
    baseUrl: loaded.env.baseUrl,
    deviceId: credentials.deviceId,
    deviceKey: credentials.deviceKey,
  });
  return new SimulatorRuntime({ client, io });
}

async function runTelemetryCommand(
  args: readonly string[],
  loaded: LoadedEnv,
  io: Io,
): Promise<number> {
  const parsed = new Args(args);
  if (parsed.hasHelp()) {
    io.out(TELEMETRY_HELP);
    return EXIT_OK;
  }
  parsed.checkKnown(['count', 'interval-ms', 'profile', 'seed']);
  const count = parsed.int('count', 5, 1, 1000);
  const intervalMs = parsed.int('interval-ms', 1000, 0, 60_000);
  const profile = parsed.enum<TelemetryProfile>('profile', TELEMETRY_PROFILES, 'normal');
  const seed = parsed.int('seed', DEFAULT_SEED, 0, 2_147_483_647);
  if (parsed.errors.length > 0) {
    return reportUsageErrors(io, parsed.errors);
  }

  const errors: string[] = [];
  const credentials = resolveCredentials(loaded, errors);
  if (credentials === null) {
    return reportUsageErrors(io, errors);
  }

  const runtime = createRuntime(loaded, credentials, io);
  const device = new SimDevice({
    deviceId: credentials.deviceId,
    firmwareVersion: loaded.env.firmwareVersion,
  });
  const simulator = new TelemetrySimulator({ device, profile, intervalMs, seed });
  const tally = emptyTally();
  let skipped = 0;

  for (let index = 0; index < count; index += 1) {
    if (index > 0 && intervalMs > 0) {
      await defaultSleep(intervalMs);
    }
    const sample = simulator.next(Date.now());
    if (sample.rebooted) {
      io.out(
        jsonLine({
          event: 'boot',
          boot_id: sample.envelope.boot_id,
          sequence: sample.envelope.sequence,
          steps_since_boot: sample.envelope.metrics.steps_since_boot,
        }),
      );
    }
    if (!sample.shouldSend) {
      skipped += 1;
      continue;
    }
    tallyResult(tally, await runtime.sendTelemetry(sample.envelope));
  }

  io.out(
    jsonLine({
      event: 'summary',
      command: 'telemetry',
      profile,
      generated: count,
      sent: tally.sent,
      skipped,
      accepted: tally.accepted,
      duplicate: tally.duplicate,
      rejected: tally.rejected,
      failed: tally.failed,
      boots: device.bootCount,
      queue_dropped_telemetry: runtime.droppedTelemetry,
      device_id: credentials.deviceId,
    }),
  );

  return tallyFailed(tally) > 0 ? EXIT_FAILED : EXIT_OK;
}

const FALL_MODES = ['cancel', 'confirm', 'duplicate', 'late', 'sos'] as const;
type FallMode = (typeof FALL_MODES)[number];

interface FallEventInput {
  eventRevision: number;
  eventType: IncidentEventType;
  incidentType?: IncidentType;
  clockStatus?: 'synced' | 'unsynced';
  measuredAtMs?: number | null;
  notes: string;
  heartRateBpm?: number | null;
}

async function runFallCommand(
  args: readonly string[],
  loaded: LoadedEnv,
  io: Io,
): Promise<number> {
  const parsed = new Args(args);
  if (parsed.hasHelp()) {
    io.out(FALL_HELP);
    return EXIT_OK;
  }
  parsed.checkKnown(['mode', 'cancel-window-ms']);
  const mode = parsed.enum<FallMode>('mode', FALL_MODES, 'cancel');
  const windowMs = parsed.int('cancel-window-ms', 3000, 0, 60_000);
  if (parsed.errors.length > 0) {
    return reportUsageErrors(io, parsed.errors);
  }

  const errors: string[] = [];
  const credentials = resolveCredentials(loaded, errors);
  if (credentials === null) {
    return reportUsageErrors(io, errors);
  }

  const runtime = createRuntime(loaded, credentials, io);
  const device = new SimDevice({
    deviceId: credentials.deviceId,
    firmwareVersion: loaded.env.firmwareVersion,
  });
  const incidentId = createIncidentId();
  const results: DeliveryResult[] = [];
  const baseNotes = `simulator: fall ${mode}`;

  const sendEvent = async (input: FallEventInput): Promise<DeliveryResult> => {
    const envelope: IncidentEnvelope = buildIncidentEvent({
      device,
      incidentId,
      eventRevision: input.eventRevision,
      eventType: input.eventType,
      incidentType: input.incidentType,
      clockStatus: input.clockStatus,
      measuredAtMs: input.measuredAtMs,
      notes: input.notes,
      heartRateBpm: input.heartRateBpm,
    });
    const result = await runtime.sendIncident(envelope);
    results.push(result);
    return result;
  };

  switch (mode) {
    case 'cancel': {
      const candidate = await sendEvent({
        eventRevision: 1,
        eventType: 'fall.candidate',
        measuredAtMs: Date.now(),
        notes: `${baseNotes} candidate rev1`,
      });
      if (isAccepted(candidate)) {
        await defaultSleep(windowMs);
        device.elapse(windowMs);
        await sendEvent({
          eventRevision: 2,
          eventType: 'fall.cancelled',
          measuredAtMs: Date.now(),
          notes: `${baseNotes} cancelled rev2 sau cửa sổ ${windowMs}ms`,
        });
      }
      break;
    }
    case 'confirm': {
      const candidate = await sendEvent({
        eventRevision: 1,
        eventType: 'fall.candidate',
        measuredAtMs: Date.now(),
        notes: `${baseNotes} candidate rev1`,
      });
      if (isAccepted(candidate)) {
        await defaultSleep(windowMs);
        device.elapse(windowMs);
        await sendEvent({
          eventRevision: 2,
          eventType: 'fall.confirmed',
          measuredAtMs: Date.now(),
          notes: `${baseNotes} confirmed rev2 sau cửa sổ ${windowMs}ms, evidence ${'sim-rules-v1'}`,
          heartRateBpm: 79,
        });
      }
      break;
    }
    case 'duplicate': {
      const envelope = buildIncidentEvent({
        device,
        incidentId,
        eventRevision: 1,
        eventType: 'fall.confirmed',
        notes: `${baseNotes} confirmed gửi lặp y nguyên message_id`,
      });
      const first = await runtime.sendIncident(envelope);
      results.push(first);
      const second = await runtime.sendIncident(envelope);
      results.push(second);
      break;
    }
    case 'late': {
      const candidate = await sendEvent({
        eventRevision: 1,
        eventType: 'fall.candidate',
        clockStatus: 'unsynced',
        measuredAtMs: null,
        notes: `${baseNotes} candidate rev1 chưa có giờ tin cậy`,
      });
      if (isAccepted(candidate)) {
        await defaultSleep(windowMs);
        device.elapse(windowMs);
        await sendEvent({
          eventRevision: 2,
          eventType: 'fall.confirmed',
          clockStatus: 'synced',
          measuredAtMs: Date.now(),
          notes: `${baseNotes} confirmed rev2 sau khi đồng bộ giờ`,
          heartRateBpm: 77,
        });
      }
      break;
    }
    case 'sos': {
      await sendEvent({
        eventRevision: 1,
        eventType: 'sos.confirmed',
        incidentType: 'sos',
        measuredAtMs: Date.now(),
        notes: `${baseNotes} SOS không chờ cửa sổ hủy`,
      });
      break;
    }
  }

  const tally = emptyTally();
  for (const result of results) {
    tallyResult(tally, result);
  }
  const duplicateAcks = results.filter((result) => result.ack?.status === 'duplicate').length;

  io.out(
    jsonLine({
      event: 'summary',
      command: 'fall',
      mode,
      incident_id: incidentId,
      requests: results.length,
      accepted: tally.accepted,
      duplicate: tally.duplicate,
      duplicate_acks: duplicateAcks,
      rejected: tally.rejected,
      failed: tally.failed,
      boots: device.bootCount,
      device_id: credentials.deviceId,
    }),
  );

  const failed = results.length === 0 || results.some((result) => !isAccepted(result));
  if (failed) {
    io.err(`Lỗi: mode ${mode} không nhận được ACK accepted/duplicate cho mọi bản tin.`);
    return EXIT_FAILED;
  }
  return EXIT_OK;
}

interface DemoInput {
  fast: boolean;
}

async function runDemoCommand(
  args: readonly string[],
  loaded: LoadedEnv,
  io: Io,
): Promise<number> {
  const parsed = new Args(args);
  if (parsed.hasHelp()) {
    io.out(DEMO_HELP);
    return EXIT_OK;
  }
  parsed.checkKnown(['fast']);
  const fast = parsed.boolean('fast');
  if (parsed.errors.length > 0) {
    return reportUsageErrors(io, parsed.errors);
  }

  const errors: string[] = [];
  const credentials = resolveCredentials(loaded, errors);
  if (credentials === null) {
    return reportUsageErrors(io, errors);
  }

  const input: DemoInput = { fast };
  const intervalMs = fast ? 100 : 1000;
  const windowMs = fast ? 200 : 3000;

  const runtime = createRuntime(loaded, credentials, io);
  const device = new SimDevice({
    deviceId: credentials.deviceId,
    firmwareVersion: loaded.env.firmwareVersion,
  });
  const totals = emptyTally();
  let generated = 0;
  let skipped = 0;

  const sendSamples = async (profile: TelemetryProfile, count: number): Promise<boolean> => {
    const simulator = new TelemetrySimulator({
      device,
      profile,
      intervalMs,
      seed: DEFAULT_SEED + TELEMETRY_PROFILES.indexOf(profile),
    });
    for (let index = 0; index < count; index += 1) {
      if (index > 0 && intervalMs > 0) {
        await defaultSleep(intervalMs);
      }
      const sample = simulator.next(Date.now());
      generated += 1;
      if (sample.rebooted) {
        io.out(
          jsonLine({
            event: 'boot',
            boot_id: sample.envelope.boot_id,
            sequence: sample.envelope.sequence,
          }),
        );
      }
      if (!sample.shouldSend) {
        skipped += 1;
        continue;
      }
      const result = await runtime.sendTelemetry(sample.envelope);
      tallyResult(totals, result);
      if (!isAccepted(result)) {
        return false;
      }
    }
    return true;
  };

  const fallEvent = async (
    incidentId: string,
    eventRevision: number,
    eventType: IncidentEventType,
    notes: string,
  ): Promise<boolean> => {
    const envelope = buildIncidentEvent({
      device,
      incidentId,
      eventRevision,
      eventType,
      notes,
      measuredAtMs: Date.now(),
    });
    const result = await runtime.sendIncident(envelope);
    tallyResult(totals, result);
    return isAccepted(result);
  };

  let ok = await sendSamples('normal', 5);
  if (ok) {
    ok = await sendSamples('poor', 3);
  }

  const cancelIncidentId = createIncidentId();
  if (ok) {
    ok = await fallEvent(
      cancelIncidentId,
      1,
      'fall.candidate',
      'simulator demo candidate rev1 (sẽ hủy)',
    );
  }
  if (ok) {
    await defaultSleep(windowMs);
    device.elapse(windowMs);
    ok = await fallEvent(
      cancelIncidentId,
      2,
      'fall.cancelled',
      `simulator demo cancelled rev2 trong cửa sổ ${windowMs}ms`,
    );
  }

  if (ok) {
    ok = await sendSamples('gap', 11);
  }

  const confirmIncidentId = createIncidentId();
  if (ok) {
    ok = await fallEvent(
      confirmIncidentId,
      1,
      'fall.candidate',
      'simulator demo candidate rev1 (sẽ xác nhận)',
    );
  }
  if (ok) {
    await defaultSleep(windowMs);
    device.elapse(windowMs);
    ok = await fallEvent(
      confirmIncidentId,
      2,
      'fall.confirmed',
      `simulator demo confirmed rev2 sau cửa sổ ${windowMs}ms`,
    );
  }

  io.out(
    jsonLine({
      event: 'summary',
      command: 'demo',
      fast: input.fast,
      interval_ms: intervalMs,
      cancel_window_ms: windowMs,
      generated,
      sent: totals.sent,
      skipped,
      accepted: totals.accepted,
      duplicate: totals.duplicate,
      rejected: totals.rejected,
      failed: totals.failed,
      boots: device.bootCount,
      device_id: credentials.deviceId,
    }),
  );

  if (!ok || tallyFailed(totals) > 0) {
    io.err('Lỗi: demo dừng vì có bản tin bị rejected hoặc lỗi gửi.');
    return EXIT_FAILED;
  }
  return EXIT_OK;
}

export async function runCli(
  argv: readonly string[],
  source: Record<string, string | undefined>,
  rawIo: Io = createConsoleIo(),
): Promise<number> {
  const loaded = loadEnv(source);
  const io = createSafeIo(rawIo, [loaded.env.deviceKey]);

  const [command, ...rest] = argv;
  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    io.out(ROOT_HELP);
    return EXIT_OK;
  }

  try {
    switch (command) {
      case 'telemetry':
        return await runTelemetryCommand(rest, loaded, io);
      case 'fall':
        return await runFallCommand(rest, loaded, io);
      case 'demo':
        return await runDemoCommand(rest, loaded, io);
      default:
        io.err(`Lỗi: lệnh không hỗ trợ: "${command}"`);
        io.err('Chạy "tsx src/cli.ts --help" để xem danh sách lệnh.');
        return EXIT_USAGE;
    }
  } catch (error) {
    io.err(`Lỗi không mong đợi: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT_FAILED;
  }
}
