import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { API_PREFIX } from '@heart-iot/contracts';
import type { AppEnv } from './config/env';
import { requestIdMiddleware } from './common/request-id.middleware';
import { createOriginCheckMiddleware } from './common/origin-check.middleware';
import { securityHeadersMiddleware } from './common/security-headers.middleware';

export function configureApp(app: INestApplication, env: AppEnv): void {
  app.use(securityHeadersMiddleware);
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.use(createOriginCheckMiddleware(env));
  app.setGlobalPrefix(API_PREFIX.replace(/^\//, ''));
  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'If-Match', 'X-Request-Id', 'X-Device-Id', 'X-Device-Key'],
    exposedHeaders: ['ETag', 'X-Request-Id'],
  });
}
