/**
 * Đọc cấu hình từ biến môi trường cho CLI thiết bị mô phỏng.
 * Không đọc/ghi file `.env`; người chạy tự export biến hoặc dùng script của workspace.
 */

export const DEFAULT_BASE_URL = 'http://localhost:3000/api/v1';
export const DEFAULT_FIRMWARE = '0.0.0-sim';

export interface SimulatorEnv {
  baseUrl: string;
  deviceId: string | null;
  deviceKey: string | null;
  firmwareVersion: string;
}

export interface LoadedEnv {
  env: SimulatorEnv;
  /** Lỗi cấu hình môi trường, CLI trả exit code 2. */
  problems: string[];
}

function optionalTrim(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function loadEnv(source: Record<string, string | undefined>): LoadedEnv {
  const problems: string[] = [];

  const baseUrl = stripTrailingSlash(optionalTrim(source.HEART_IOT_BASE_URL) ?? DEFAULT_BASE_URL);
  if (!/^https?:\/\/[^/\s]+/i.test(baseUrl)) {
    problems.push(`HEART_IOT_BASE_URL không hợp lệ: "${baseUrl}" (cần dạng http://host:port/api/v1)`);
  }

  const deviceId = optionalTrim(source.HEART_IOT_DEVICE_ID);
  if (deviceId !== null && deviceId.length > 128) {
    problems.push('HEART_IOT_DEVICE_ID tối đa 128 ký tự');
  }

  const deviceKey = optionalTrim(source.HEART_IOT_DEVICE_KEY);
  if (deviceKey !== null && deviceKey.length > 256) {
    problems.push('HEART_IOT_DEVICE_KEY tối đa 256 ký tự');
  }

  const firmwareVersion = optionalTrim(source.HEART_IOT_FIRMWARE) ?? DEFAULT_FIRMWARE;
  if (firmwareVersion.length > 64) {
    problems.push('HEART_IOT_FIRMWARE tối đa 64 ký tự');
  }

  return { env: { baseUrl, deviceId, deviceKey, firmwareVersion }, problems };
}
