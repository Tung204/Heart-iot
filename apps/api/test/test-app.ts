import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication, Type } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import type { AuthSession } from '@annhien/contracts/auth';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { ENV, loadEnv, resetEnvCacheForTests } from '../src/config/env';
import { DB, DATABASE, type AppDb, type DatabaseHandle } from '../src/database/database';
import { users } from '../src/database/schema';
import { AuditModule } from '../src/access/audit.module';
import { AccessModule } from '../src/access/access.module';
import { AuthModule } from '../src/auth/auth.module';
import { SessionGuard } from '../src/auth/session.guard';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import { DatabaseModule } from '../src/database/database.module';

export const TEST_ORIGIN = 'http://localhost:5173';

export type TestContext = {
  app: INestApplication;
  db: AppDb;
  close: () => Promise<void>;
};

function prepareTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.PGLITE_MEMORY = 'true';
  process.env.WEB_ORIGIN = TEST_ORIGIN;
  delete process.env.DATABASE_URL;
  resetEnvCacheForTests();
}

async function buildTestApp(imports: Type<unknown>[]): Promise<TestContext> {
  prepareTestEnv();
  const moduleRef = await Test.createTestingModule({ imports }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  const env = app.get<AppEnvLike>(ENV);
  configureApp(app, env);
  await app.init();
  return {
    app,
    db: app.get<AppDb>(DB),
    close: async () => {
      await app.close();
    },
  };
}

export async function createTestApp(): Promise<TestContext> {
  return buildTestApp([AppModule]);
}

/**
 * Hạ tầng global giống AppModule cho test module rời: guard phiên + envelope lỗi.
 * Nhờ vậy module không phải tự đăng ký APP_GUARD/APP_FILTER (tránh chạy đôi khi
 * được import vào AppModule).
 */
@Module({
  imports: [AuthModule],
  providers: [
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
class TestInfraModule {}

/**
 * Dựng app kiểm thử cho một module miền, dùng chung DB/auth/access global.
 * Dùng trong worker để test module trước khi lead nối vào AppModule.
 */
export async function createModuleTestApp(
  moduleOrModules: Type<unknown> | Type<unknown>[],
): Promise<TestContext> {
  const modules = Array.isArray(moduleOrModules) ? moduleOrModules : [moduleOrModules];
  return buildTestApp([DatabaseModule, AuditModule, AccessModule, AuthModule, TestInfraModule, ...modules]);
}

type AppEnvLike = ReturnType<typeof loadEnv>;

export type TestUser = {
  agent: ReturnType<typeof request.agent>;
  session: AuthSession;
  email: string;
  password: string;
};

export async function registerUser(
  app: INestApplication,
  input?: { email?: string; password?: string; displayName?: string },
): Promise<TestUser> {
  const email = input?.email ?? `user-${crypto.randomUUID()}@example.test`;
  const password = input?.password ?? 'mat-khau-demo-123';
  const agent = request.agent(app.getHttpServer());
  const response = await agent
    .post('/api/v1/auth/register')
    .set('Origin', TEST_ORIGIN)
    .send({ email, password, displayName: input?.displayName ?? 'Người dùng kiểm thử' });
  if (response.status !== 201) {
    throw new Error(`Đăng ký thất bại (${response.status}): ${JSON.stringify(response.body)}`);
  }
  return { agent, session: response.body as AuthSession, email, password };
}

export async function loginUser(
  app: INestApplication,
  email: string,
  password: string,
): Promise<TestUser> {
  const agent = request.agent(app.getHttpServer());
  const response = await agent
    .post('/api/v1/auth/login')
    .set('Origin', TEST_ORIGIN)
    .send({ email, password });
  if (response.status !== 200) {
    throw new Error(`Đăng nhập thất bại (${response.status}): ${JSON.stringify(response.body)}`);
  }
  return { agent, session: response.body as AuthSession, email, password };
}

export async function createAdmin(app: INestApplication, input?: { email?: string }): Promise<TestUser> {
  const user = await registerUser(app, input);
  const db = app.get<AppDb>(DB);
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, user.session.user.id));
  return loginUser(app, user.email, user.password);
}
