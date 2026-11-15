import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { errorEnvelope, mockResponse, renderApp, SESSION, SUBJECT } from '../test/utils';

const SUBJECT_AI = {
  ...SUBJECT,
  permissions: { ...SUBJECT.permissions, canViewAi: true },
};

/** API tối thiểu cho route: danh sách hồ sơ + phiên. Phần thiếu trả 404 có kiểm soát. */
function routeHandler(url: string) {
  if (url.endsWith('/me')) return mockResponse(SESSION);
  if (url.endsWith('/subjects')) return mockResponse({ items: [SUBJECT_AI] });
  if (url.includes('/assistant/')) {
    return mockResponse(errorEnvelope('Chưa có tóm tắt.', 'NOT_FOUND'), 404);
  }
  return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
}

// v3 — `/app` mở không gian trợ lý (trung tâm); dashboard chi tiết ở `/app/overview`.
describe('router — trợ lý là mặc định của /app', () => {
  it('/app → trợ lý', async () => {
    renderApp('/app', routeHandler);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Trợ lý' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Quản lý hồ sơ/ }),
    ).toHaveAttribute('href', '/app/subjects');
  });

  it('/app/overview → tổng quan chi tiết', async () => {
    renderApp('/app/overview', routeHandler);

    expect(
      await screen.findByRole('heading', { level: 1, name: /Tổng quan/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: /Tổng quan/ }),
    ).not.toHaveTextContent('Trợ lý');
  });

  it('/app/assistant vẫn mở trợ lý (đường dẫn cũ không gãy)', async () => {
    renderApp('/app/assistant', routeHandler);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Trợ lý' }),
    ).toBeInTheDocument();
  });

  it('admin không có hồ sơ vào /app → chuyển tới /app/admin', async () => {
    const { router } = renderApp('/app', (url) => {
      if (url.endsWith('/me')) {
        return mockResponse({ user: { ...SESSION.user, role: 'admin' } });
      }
      if (url.endsWith('/subjects')) return mockResponse({ items: [] });
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    await waitFor(() => expect(router.state.location.pathname).toBe('/app/admin'));
  });
});
