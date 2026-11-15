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

// v4 — `/app` là Hôm nay; Sức khỏe chi tiết ở `/app/overview`, Lịch sử đo ở
// `/app/history`. Các đường dẫn cũ vẫn mở đúng màn để không gãy deep link.
describe('router — Hôm nay là mặc định của /app', () => {
  it('/app → Hôm nay, một lối Sức khỏe 7 ngày (lịch sử nằm trong Sức khỏe)', async () => {
    renderApp('/app', routeHandler);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hôm nay' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sức khỏe 7 ngày →' })).toHaveAttribute(
      'href',
      '/app/overview',
    );
    expect(screen.queryByRole('link', { name: /Lịch sử đo/ })).not.toBeInTheDocument();
  });

  it('/app/overview → Sức khỏe chi tiết, có đường về Hôm nay', async () => {
    renderApp('/app/overview', routeHandler);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sức khỏe' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Hôm nay' })).toHaveAttribute('href', '/app');
  });

  it('/app/assistant vẫn mở Hôm nay (đường dẫn cũ không gãy)', async () => {
    renderApp('/app/assistant', routeHandler);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hôm nay' }),
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
