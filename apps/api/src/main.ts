import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { ENV, type AppEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const env = app.get<AppEnv>(ENV);
  configureApp(app, env);
  app.enableShutdownHooks();
  await app.listen(env.PORT);
  Logger.log(`API Heart-iot chạy tại http://localhost:${env.PORT}/api/v1`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  console.error('Không khởi động được API:', error);
  process.exitCode = 1;
});
