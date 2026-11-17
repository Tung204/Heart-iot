import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ENV, pgliteDataDir, type AppEnv } from '../src/config/env';
import { AccessService } from '../src/access/access.service';
import type { AppDb } from '../src/database/database';
import { NotificationService } from '../src/notifications/notifications.service';
import { createModuleTestApp } from './test-app';
import { assertHermeticEnv, TEST_ORIGIN } from './test-env';

/**
 * Guard cho chính hạ tầng test (Q-02):
 * - `.env` thật không được đọc;
 * - app test dùng PGlite memory và không có cấu hình MQTT/AI/DB thật;
 * - timer outbox tắt khi NODE_ENV=test.
 */
describe('Hạ tầng test hermetic', () => {
  it('loadEnv bỏ qua .env thật khi chạy test', () => {
    const dir = mkdtempSync(join(tmpdir(), 'heart-iot-env-guard-'));
    const originalCwd = process.cwd();
    try {
      writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages: []\n', 'utf8');
      writeFileSync(
        join(dir, '.env'),
        [
          'DATABASE_URL=postgres://real-db.invalid:5432/heartiot',
          'MQTT_URL=mqtt://real-broker.invalid:1883',
          'AI_BASE_URL=https://ai.invalid/v1',
          'AI_API_KEY=secret-should-not-be-read',
          'AI_MODEL=real-model',
        ].join('\n'),
        'utf8',
      );
      process.chdir(dir);
      jest.resetModules();
      const envModule = require('../src/config/env') as typeof import('../src/config/env');
      const env = envModule.loadEnv();
      expect(env.NODE_ENV).toBe('test');
      expect(env.PGLITE_MEMORY).toBe(true);
      expect(env.DATABASE_URL).toBeUndefined();
      expect(env.MQTT_URL).toBeUndefined();
      expect(env.AI_BASE_URL).toBeUndefined();
      expect(env.AI_API_KEY).toBeUndefined();
      expect(env.AI_MODEL).toBeUndefined();
    } finally {
      process.chdir(originalCwd);
      jest.resetModules();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('guard từ chối cấu hình DB/MQTT/AI thật', () => {
    expect(() => assertHermeticEnv({ NODE_ENV: 'test', PGLITE_MEMORY: true })).not.toThrow();
    expect(() =>
      assertHermeticEnv({
        NODE_ENV: 'test',
        PGLITE_MEMORY: true,
        DATABASE_URL: 'postgres://real.invalid/heartiot',
      }),
    ).toThrow(/DATABASE_URL/);
    expect(() =>
      assertHermeticEnv({
        NODE_ENV: 'test',
        PGLITE_MEMORY: true,
        MQTT_URL: 'mqtt://real.invalid:1883',
      }),
    ).toThrow(/MQTT_URL/);
    expect(() =>
      assertHermeticEnv({
        NODE_ENV: 'test',
        PGLITE_MEMORY: true,
        AI_BASE_URL: 'https://ai.invalid/v1',
      }),
    ).toThrow(/AI_BASE_URL/);
    expect(() => assertHermeticEnv({ NODE_ENV: 'production', PGLITE_MEMORY: true })).toThrow(
      /NODE_ENV=test/,
    );
    expect(() => assertHermeticEnv({ NODE_ENV: 'test', PGLITE_MEMORY: false })).toThrow(
      /PGLITE_MEMORY/,
    );
  });

  it('app test dùng PGlite memory, không tạo thư mục DB thật', async () => {
    const ctx = await createModuleTestApp([]);
    try {
      const env = ctx.app.get<AppEnv>(ENV);
      expect(env.WEB_ORIGIN).toBe(TEST_ORIGIN);
      expect(env.DATABASE_URL).toBeUndefined();
      expect(env.MQTT_URL).toBeUndefined();
      expect(env.AI_BASE_URL).toBeUndefined();
      expect(existsSync(pgliteDataDir(env))).toBe(false);
    } finally {
      await ctx.close();
    }
  });

  it('outbox timer không chạy khi NODE_ENV=test; destroy an toàn', () => {
    const service = new NotificationService({} as AppDb, {} as AccessService);
    service.onModuleInit();
    expect((service as unknown as { timer: NodeJS.Timeout | null }).timer).toBeNull();
    service.onModuleDestroy();
    expect((service as unknown as { timer: NodeJS.Timeout | null }).timer).toBeNull();
  });
});
