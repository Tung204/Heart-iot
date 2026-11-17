import { Global, Module } from '@nestjs/common';
import { ENV, loadEnv, type AppEnv } from '../config/env';
import { createDatabase, DATABASE, DB, DatabaseLifecycle, type DatabaseHandle } from './database';

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: (): AppEnv => loadEnv() },
    {
      provide: DATABASE,
      inject: [ENV],
      useFactory: async (env: AppEnv): Promise<DatabaseHandle> => createDatabase(env),
    },
    {
      provide: DB,
      inject: [DATABASE],
      useFactory: (handle: DatabaseHandle) => handle.db,
    },
    DatabaseLifecycle,
  ],
  exports: [ENV, DATABASE, DB],
})
export class DatabaseModule {}
