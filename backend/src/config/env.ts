import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

export const ENV = Symbol('ENV');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1).optional(),
  PGLITE_DATA_DIR: z.string().min(1).default('.data/pglite'),
  PGLITE_MEMORY: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  MQTT_URL: z.string().min(1).optional(),
  MQTT_USERNAME: z.string().optional(),
  MQTT_PASSWORD: z.string().optional(),
  AI_BASE_URL: z.string().min(1).optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  /** Dung sai đồng hồ thiết bị: measured_at vượt quá now + ngưỡng này bị cách ly. */
  MAX_CLOCK_SKEW_SECONDS: z.coerce.number().int().min(0).max(3600).default(120),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),
  /**
   * Cửa sổ chờ kết quả cuối của ứng viên ngã (docs/03, docs/06): incident còn
   * `suspected` quá số phút này sẽ chuyển `unconfirmed` ("chưa xác định").
   * Chính sách demo 10 phút — CHƯA CHỐT, phải đánh giá lại trước dữ liệu thật.
   */
  SUSPECTED_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(120).default(10),
  /** Web Push tắt mặc định; bật phải có đủ VAPID và HTTPS ở phía trình duyệt. */
  WEB_PUSH_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  WEB_PUSH_VAPID_SUBJECT: z.string().min(1).optional(),
  WEB_PUSH_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  WEB_PUSH_VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  WEB_PUSH_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
  /**
   * Retention thủ công: mặc định TẮT. Bật phải cấu hình ít nhất một lớp dữ liệu;
   * không có giá trị ngày mặc định để tránh tự xóa dữ liệu khi người dùng chưa chốt.
   */
  RETENTION_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  RETENTION_TELEMETRY_DAYS: z.coerce.number().int().min(1).max(3650).optional(),
  RETENTION_NOTIFICATION_DAYS: z.coerce.number().int().min(1).max(3650).optional(),
  RETENTION_REALTIME_DAYS: z.coerce.number().int().min(1).max(3650).optional(),
  RETENTION_AI_SUMMARY_DAYS: z.coerce.number().int().min(1).max(3650).optional(),
}).superRefine((value, ctx) => {
  if (value.RETENTION_ENABLED) {
    const configured = [
      value.RETENTION_TELEMETRY_DAYS,
      value.RETENTION_NOTIFICATION_DAYS,
      value.RETENTION_REALTIME_DAYS,
      value.RETENTION_AI_SUMMARY_DAYS,
    ].some((days) => days !== undefined);
    if (!configured) {
      ctx.addIssue({
        code: 'custom',
        path: ['RETENTION_ENABLED'],
        message: 'Bật retention phải đặt ít nhất một RETENTION_*_DAYS.',
      });
    }
  }
  if (!value.WEB_PUSH_ENABLED) return;
  for (const key of [
    'WEB_PUSH_VAPID_SUBJECT',
    'WEB_PUSH_VAPID_PUBLIC_KEY',
    'WEB_PUSH_VAPID_PRIVATE_KEY',
  ] as const) {
    if (!value[key]) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: 'Bắt buộc khi WEB_PUSH_ENABLED=true.',
      });
    }
  }
  if (
    value.WEB_PUSH_VAPID_SUBJECT &&
    !/^(mailto:|https:\/\/)/.test(value.WEB_PUSH_VAPID_SUBJECT)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['WEB_PUSH_VAPID_SUBJECT'],
      message: 'Phải là mailto: hoặc https://.',
    });
  }
});

export type AppEnv = z.infer<typeof envSchema>;

/** Tìm thư mục gốc monorepo (chứa pnpm-workspace.yaml) từ cwd hoặc __dirname. */
export function findRepoRoot(start = process.cwd()): string {
  let current = resolve(start);
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return resolve(start);
}

let cached: AppEnv | null = null;

export function loadEnv(): AppEnv {
  if (cached) return cached;
  const repoRoot = findRepoRoot();
  for (const candidate of [resolve(process.cwd(), '.env'), resolve(repoRoot, '.env')]) {
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate, override: false, quiet: true });
      break;
    }
  }
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Cấu hình môi trường không hợp lệ: ${detail}`);
  }
  cached = parsed.data;
  return cached;
}

/** Chỉ dùng trong test: xóa cache để đọc lại biến môi trường vừa đặt. */
export function resetEnvCacheForTests(): void {
  cached = null;
}

export function pgliteDataDir(env: AppEnv): string {
  return resolve(findRepoRoot(), env.PGLITE_DATA_DIR);
}
