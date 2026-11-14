import { resolve } from 'node:path';
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import type { AppEnv } from '../config/env';
import { pgliteDataDir } from '../config/env';
import * as schema from './schema';

export const DATABASE = Symbol('DATABASE');
export const DB = Symbol('DB');

export type AppDb = NodePgDatabase<typeof schema>;
export type DatabaseHandle = {
  db: AppDb;
  kind: 'pglite' | 'postgres';
  close: () => Promise<void>;
};

const migrationsFolder = resolve(__dirname, '../../drizzle');

export async function createDatabase(env: AppEnv): Promise<DatabaseHandle> {
  if (env.DATABASE_URL) {
    const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder });
    return {
      db,
      kind: 'postgres',
      close: async () => {
        await pool.end();
      },
    };
  }

  const dataDir = env.PGLITE_MEMORY ? undefined : pgliteDataDir(env);
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  await client.waitReady;
  const db = drizzlePglite(client, { schema }) as unknown as AppDb;
  await migratePglite(db as never, { migrationsFolder });
  return {
    db,
    kind: 'pglite',
    close: async () => {
      await client.close();
    },
  };
}

@Injectable()
export class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly handle: DatabaseHandle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.handle.close();
  }
}
