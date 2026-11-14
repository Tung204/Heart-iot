import { randomUUID } from 'node:crypto';
import type { TelemetryEnvelope } from '@annhien/contracts/telemetry';
import { DEFAULT_SEED, createSeededRandom, randomInt } from './rng';

/**
 * Trạng thái thiết bị mô phỏng: boot_id, sequence, uptime, bước chân, pin.
 * `sequence` tăng chung cho mọi bản tin (telemetry và sự kiện) trong cùng boot,
 * đúng hợp đồng `docs/04-du-lieu-va-giao-tiep.md`.
 */

export const DEFAULT_BATTERY_PERCENT = 80;

export interface SimDeviceOptions {
  deviceId: string;
  firmwareVersion: string;
  batteryPercent?: number | null;
}

export class SimDevice {
  readonly deviceId: string;
  readonly firmwareVersion: string;
  batteryPercent: number | null;

  private boot: string;
  private seq: number;
  private uptime: number;
  private steps: number;

  /** Số boot đã mô phỏng (bắt đầu từ 1). */
  bootCount: number;

  constructor(options: SimDeviceOptions) {
    this.deviceId = options.deviceId;
    this.firmwareVersion = options.firmwareVersion;
    this.batteryPercent =
      options.batteryPercent === undefined ? DEFAULT_BATTERY_PERCENT : options.batteryPercent;
    this.boot = newBootId();
    this.seq = 1;
    this.uptime = 0;
    this.steps = 0;
    this.bootCount = 1;
  }

  get bootId(): string {
    return this.boot;
  }

  get sequence(): number {
    return this.seq;
  }

  get uptimeMs(): number {
    return this.uptime;
  }

  get stepsSinceBoot(): number {
    return this.steps;
  }

  addSteps(count: number): void {
    if (count > 0) {
      this.steps += count;
    }
  }

  /** Thời gian trôi qua mà không sinh bản tin (ví dụ chờ cửa sổ hủy). */
  elapse(deltaMs: number): void {
    this.uptime += Math.max(0, Math.trunc(deltaMs));
  }

  /** Ghi nhận đã sinh một bản tin: sequence tăng, uptime tăng theo thời gian chạy. */
  advance(deltaMs: number): void {
    this.seq += 1;
    this.elapse(deltaMs);
  }

  /** Mô phỏng reboot: boot mới, sequence và bộ đếm bước trở về đầu. */
  reboot(): void {
    this.boot = newBootId();
    this.seq = 1;
    this.uptime = 0;
    this.steps = 0;
    this.bootCount += 1;
  }
}

function newBootId(): string {
  return `sim-boot-${randomUUID()}`;
}

export const TELEMETRY_PROFILES = ['normal', 'poor', 'gap', 'reset'] as const;
export type TelemetryProfile = (typeof TELEMETRY_PROFILES)[number];

/** Mẫu gap: bỏ 3 mẫu liên tiếp bắt đầu từ mẫu thứ 3 (0-based index 2). */
export const GAP_START_INDEX = 2;
export const GAP_LENGTH = 3;
/** Reboot xảy ra trước mẫu thứ 4 (sau khi đã gửi 3 mẫu). */
export const RESET_AFTER_INDEX = 3;

export interface TelemetrySample {
  envelope: TelemetryEnvelope;
  /** false = mẫu bị bỏ để mô phỏng mất dữ liệu; sequence vẫn tăng. */
  shouldSend: boolean;
  skipReason: string | null;
  /** true = mẫu đầu tiên sau reboot (boot_id mới, sequence về 1). */
  rebooted: boolean;
}

export interface TelemetrySimulatorOptions {
  device: SimDevice;
  profile: TelemetryProfile;
  /** Khoảng thời gian giữa hai mẫu, dùng cho uptime_ms. */
  intervalMs: number;
  seed?: number;
}

export class TelemetrySimulator {
  private readonly device: SimDevice;
  private readonly profile: TelemetryProfile;
  private readonly intervalMs: number;
  private readonly rand: () => number;
  private index: number;

  constructor(options: TelemetrySimulatorOptions) {
    this.device = options.device;
    this.profile = options.profile;
    this.intervalMs = options.intervalMs;
    this.rand = createSeededRandom(options.seed ?? DEFAULT_SEED);
    this.index = 0;
  }

  /** Sinh mẫu kế tiếp. Không gửi gì; người gọi quyết định dựa trên `shouldSend`. */
  next(nowMs: number = Date.now()): TelemetrySample {
    let rebooted = false;
    if (this.profile === 'reset' && this.index === RESET_AFTER_INDEX) {
      this.device.reboot();
      rebooted = true;
    }

    const index = this.index;
    this.index += 1;

    const poorSignal = this.profile === 'poor' && index % 3 !== 0;
    const skipped =
      this.profile === 'gap' && index >= GAP_START_INDEX && index < GAP_START_INDEX + GAP_LENGTH;

    const heartRateBpm = poorSignal ? null : randomInt(this.rand, 68, 82);
    if (!rebooted) {
      this.device.addSteps(randomInt(this.rand, 7, 13));
    }

    const envelope: TelemetryEnvelope = {
      schema_version: '1.0',
      message_id: randomUUID(),
      device_id: this.device.deviceId,
      boot_id: this.device.bootId,
      sequence: this.device.sequence,
      measured_at: new Date(nowMs).toISOString(),
      clock_status: 'synced',
      uptime_ms: this.device.uptimeMs,
      metrics: {
        heart_rate_bpm: heartRateBpm,
        steps_since_boot: this.device.stepsSinceBoot,
      },
      quality: {
        heart_rate: poorSignal ? 'poor_signal' : 'valid',
        motion: 'valid',
      },
      battery_percent: this.device.batteryPercent,
      firmware_version: this.device.firmwareVersion,
    };

    this.device.advance(this.intervalMs);

    return {
      envelope,
      shouldSend: !skipped,
      skipReason: skipped ? 'profile_gap' : null,
      rebooted,
    };
  }
}
