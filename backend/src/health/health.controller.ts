import { Controller, Get, Inject } from '@nestjs/common';
import { healthStatusSchema } from '@heart-iot/contracts/health';
import { sql } from 'drizzle-orm';
import { DB, type AppDb } from '../database/database';
import { ENV, type AppEnv } from '../config/env';
import { Public } from '../auth/auth.decorators';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: AppDb,
    @Inject(ENV) private readonly env: AppEnv,
  ) {}

  @Public()
  @Get()
  async check() {
    let database: 'up' | 'down' = 'up';
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      database = 'down';
    }
    return healthStatusSchema.parse({
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      ai: this.env.AI_BASE_URL && this.env.AI_MODEL ? 'provider_configured' : 'template_fallback',
      version: '1.0.0',
    });
  }
}
