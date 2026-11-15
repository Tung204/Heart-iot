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
