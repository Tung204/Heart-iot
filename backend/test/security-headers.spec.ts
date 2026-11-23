import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, type TestContext } from './test-app';

const EXPECTED_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy':
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

function expectSecurityHeaders(response: request.Response): void {
  for (const [name, value] of Object.entries(EXPECTED_HEADERS)) {
    expect(response.headers[name]).toBe(value);
  }
}

describe('Security headers', () => {
  let ctx: TestContext;
  let app: INestApplication;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('gắn header cho response thành công và response lỗi', async () => {
    const health = await request(app.getHttpServer()).get('/api/v1/health');
    expect(health.status).toBe(200);
    expectSecurityHeaders(health);

    const unauthorized = await request(app.getHttpServer()).get('/api/v1/me');
    expect(unauthorized.status).toBe(401);
    expectSecurityHeaders(unauthorized);
  });
});
