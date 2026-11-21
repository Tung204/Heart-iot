import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Môi trường test hermetic:
 * - Không đọc `.env` thật (xem `stubs/dotenv.cjs` + moduleNameMapper trong jest.config).
 * - PGlite in-memory, không dùng PostgreSQL thật.
 * - Không có MQTT/AI endpoint để service không mở kết nối mạng.
 * - Timer outbox tự tắt vì `NODE_ENV=test` (NotificationService.onModuleInit).
 *
 * File này được nạp qua `setupFiles` trước khi test import module ứng dụng.
 */
export const TEST_ORIGIN = 'http://localhost:5173';

const TEST_TMP_ROOT = join(tmpdir(), 'heart-iot-api-tests');

/** Cấu hình môi trường trước `loadEnv`; gọi lại nhiều lần vẫn idempotent. */
export function prepareHermeticTestEnv(): void {
  const testDir = process.env.HEART_IOT_TEST_TMP ?? join(TEST_TMP_ROOT, String(process.pid));
  mkdirSync(testDir, { recursive: true });
  process.env.HEART_IOT_TEST_TMP = testDir;

  process.env.NODE_ENV = 'test';
  process.env.PGLITE_MEMORY = 'true';
  process.env.PGLITE_DATA_DIR = join(testDir, 'pglite');
  process.env.WEB_ORIGIN = TEST_ORIGIN;
  // Mốc thời gian hiển thị mặc định không phụ thuộc timezone máy chạy test.
  process.env.TZ = 'UTC';

  // Không để cấu hình thật trong shell rò vào test.
  const forbidden = [
    'DATABASE_URL',
    'MQTT_URL',
    'MQTT_USERNAME',
    'MQTT_PASSWORD',
    'AI_BASE_URL',
    'AI_API_KEY',
    'AI_MODEL',
    'AI_TIMEOUT_MS',
    'PORT',
    'SESSION_TTL_HOURS',
    'MAX_CLOCK_SKEW_SECONDS',
    'SUSPECTED_TIMEOUT_MINUTES',
    'WEB_PUSH_ENABLED',
    'WEB_PUSH_VAPID_SUBJECT',
    'WEB_PUSH_VAPID_PUBLIC_KEY',
    'WEB_PUSH_VAPID_PRIVATE_KEY',
    'WEB_PUSH_TTL_SECONDS',
    'RETENTION_ENABLED',
    'RETENTION_TELEMETRY_DAYS',
    'RETENTION_NOTIFICATION_DAYS',
    'RETENTION_REALTIME_DAYS',
    'RETENTION_AI_SUMMARY_DAYS',
    'RETENTION_ASSISTANT_DRAFT_DAYS',
  ];
  for (const key of forbidden) delete process.env[key];
}

export type HermeticEnvLike = {
  NODE_ENV?: string;
  PGLITE_MEMORY?: boolean;
  DATABASE_URL?: string;
  MQTT_URL?: string;
  AI_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
};

/** Chặn test chạy vào DB/MQTT/AI thật dù `.env` hoặc biến shell bị đặt. */
export function assertHermeticEnv(env: HermeticEnvLike): void {
  const leaked = [
    ['DATABASE_URL', env.DATABASE_URL],
    ['MQTT_URL', env.MQTT_URL],
    ['AI_BASE_URL', env.AI_BASE_URL],
    ['AI_API_KEY', env.AI_API_KEY],
    ['AI_MODEL', env.AI_MODEL],
  ]
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(([key]) => key);
  if (leaked.length > 0) {
    throw new Error(
      `Test phải hermetic nhưng env còn ${leaked.join(', ')}. ` +
        'Kiểm tra .env, shell hoặc setup test; test chỉ dùng PGlite memory và không gọi mạng.',
    );
  }
  if (env.NODE_ENV !== 'test') {
    throw new Error(`Test phải chạy với NODE_ENV=test, hiện tại là ${String(env.NODE_ENV)}.`);
  }
  if (env.PGLITE_MEMORY !== true) {
    throw new Error('Test phải chạy PGlite in-memory (PGLITE_MEMORY=true).');
  }
}
