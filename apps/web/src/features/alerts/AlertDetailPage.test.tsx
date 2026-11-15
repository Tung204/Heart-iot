import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { AlertDetailPage } from './AlertDetailPage';
import {
  errorEnvelope,
  INCIDENT,
  mockResponse,
  SUBJECT,
  stubFetch,
  USER,
} from '../../test/utils';

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


const DETAIL = {
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
};

function detailHandler(overrides: Record<string, unknown> = {}) {
  return (url: string, init?: RequestInit) => {
    const u = url;
    if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
    if (u.includes(`/alerts/${INCIDENT.id}/acknowledge`) && init?.method === 'POST') {
      return mockResponse(errorEnvelope('Máy chủ đang bận.', 'INTERNAL'), 500);
    }
    if (u.includes(`/alerts/${INCIDENT.id}`)) {
      return mockResponse({ ...DETAIL, ...overrides });
    }
    return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
  };
}

// F-P1-2 / xác nhận thất bại không phải 409 phải có lỗi thân thiện, nút thử lại và giữ trạng thái.
describe('AlertDetailPage — xác nhận thất bại', () => {
  it('lỗi 500 → alert thân thiện + Thử lại, giữ nguyên trạng thái Đang mở', async () => {
    renderDetail(detailHandler());
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Tôi đang hỗ trợ' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Chưa gửi được xác nhận');
    expect(alert).toHaveTextContent('Máy chủ đang bận.');
    expect(within(alert).getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tôi đang hỗ trợ' })).toBeEnabled();
    expect(screen.getByText('Đang mở', { selector: '.pill' })).toBeInTheDocument();
  });

  it('đã acknowledged thì không hiện nút "Tôi đang hỗ trợ"', async () => {
    renderDetail(
      detailHandler({
        state: 'acknowledged',
        acknowledgedBy: { userId: USER.id, displayName: 'Trần Thị An' },
      }),
    );

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Đang có người hỗ trợ' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Tôi đang hỗ trợ' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Trần Thị An/)).toBeInTheDocument();
  });
});

// F-P2-4 / heading chi tiết cảnh báo phải tăng dần: H1 → H2, không nhảy H1 → H3.
describe('AlertDetailPage — cấp heading', () => {
  it('thẻ hành động dùng H2 sau H1, không còn H3 trước mục Diễn biến', async () => {
    renderDetail(detailHandler());

    expect(
      await screen.findByRole('heading', { level: 1, name: /Nghi ngã/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Cảnh báo cần hành động' }),
    ).toBeInTheDocument();

    const levels = screen
      .getAllByRole('heading')
      .map((heading) => Number(heading.tagName.slice(1)));
    expect(levels.slice(0, 2)).toEqual([1, 2]);
    expect(screen.getByRole('heading', { level: 2, name: 'Diễn biến sự kiện' })).toBeInTheDocument();
  });
});
