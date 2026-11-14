import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { AlertDetailPage } from './AlertDetailPage';
import { errorEnvelope, INCIDENT, mockResponse, SUBJECT, stubFetch } from '../../test/utils';

function renderDetail(handler: (url: string, init?: RequestInit) => Response) {
  stubFetch((url, init) => handler(String(url), init));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/app/alerts/${INCIDENT.id}`]}>
        <Routes>
          <Route path="/app/alerts/:id" element={<AlertDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// FR-13 / chi tiết cảnh báo — xác nhận 409 → thông báo cạnh tranh + nút tải lại.
describe('AlertDetailPage — ack 409', () => {
  it('POST acknowledge trả 409 → hiển thị "đã thay đổi ở nơi khác" và nút tải lại', async () => {
    let ackCalls = 0;
    renderDetail((url, init) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.includes(`/alerts/${INCIDENT.id}/acknowledge`)) {
        ackCalls += 1;
        return mockResponse(
          errorEnvelope('Phiên bản cảnh báo đã cũ.', 'CONFLICT'),
          409,
        );
      }
      if (u.includes(`/alerts/${INCIDENT.id}`)) {
        return mockResponse({
          ...INCIDENT,
          events: [
            {
              eventRevision: 1,
              eventType: 'fall.confirmed',
              measuredAt: '2026-11-14T08:00:00.000Z',
              receivedAt: '2026-11-14T08:00:02.000Z',
              applied: true,
              conflictReason: null,
            },
          ],
          actions: [],
          recipients: [],
        });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    const ackButton = await screen.findByRole('button', { name: 'Tôi đang hỗ trợ' });
    await user.click(ackButton);

    expect(
      await screen.findByText('Cảnh báo đã thay đổi ở nơi khác'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải lại cảnh báo' })).toBeInTheDocument();
    expect(ackCalls).toBe(1);
    // Không đoán trạng thái mới — vẫn giữ trạng thái cũ cho tới khi người dùng tải lại.
    expect(screen.getByText('Đang mở')).toBeInTheDocument();
  });
});
