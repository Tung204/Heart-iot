import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from './api';

// NFR-02 / hợp đồng API — envelope lỗi { code, message, requestId } được parse đúng,
// lỗi mạng không bị nuốt, phản hồi lạ không làm vỡ UI.
describe('lib/api', () => {
  it('parse envelope lỗi { code, message, requestId } thành ApiError đầy đủ', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        text: async () =>
          JSON.stringify({
            code: 'CONFLICT',
            message: 'Email này đã được sử dụng.',
            requestId: 'req-123',
          }),
      })),
    );

    const error = await apiRequest('/auth/register').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(409);
    expect(apiError.code).toBe('CONFLICT');
    expect(apiError.requestId).toBe('req-123');
    expect(apiError.message).toBe('Email này đã được sử dụng.');
  });

  it('lỗi mạng trở thành ApiError code NETWORK_ERROR, giữ cause gốc', async () => {
    const networkCause = new TypeError('Failed to fetch');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw networkCause;
      }),
    );

    const error = await apiRequest('/me').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.code).toBe('NETWORK_ERROR');
    expect(apiError.status).toBe(0);
    expect(apiError.cause).toBe(networkCause);
  });

  it('phản hồi lỗi không đúng envelope → lỗi chung kèm status, không văng ngoại lệ lạ', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 502,
        text: async () => '<html>Bad Gateway</html>',
      })),
    );

    const error = await apiRequest('/me').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
    expect((error as ApiError).message).toContain('502');
  });

  it('204 trả undefined, 200 trả dữ liệu JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ user: { id: 'x' } }),
        }),
    );

    await expect(apiRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
    await expect(apiRequest('/me')).resolves.toEqual({ user: { id: 'x' } });
  });
});
