import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StudioViewDataPage } from './StudioViewDataPage';
import { errorEnvelope, mockResponse, stubFetch, SUBJECT } from '../../test/utils';
import { makePublication, makeViewSummary, STUDIO_VIEW_ID } from './testFixtures';

function renderData(handler: (url: string, init?: RequestInit) => Response) {
  stubFetch((url, init) => handler(String(url), init));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/app/studio/${STUDIO_VIEW_ID}/data`]}>
        <Routes>
          <Route path="/app/studio/:id/data" element={<StudioViewDataPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const PUBLISHED_VIEW = makeViewSummary({
  status: 'published',
  currentPublication: makePublication({ revision: 2, digest: 'digest-r2-eeee', status: 'active' }),
});

// Wave 3 studio — trang xem dữ liệu bản công bố.
describe('StudioViewDataPage — render published', () => {
  it('view chưa công bố → thông báo rõ, không gọi GET data', async () => {
    let dataCalls = 0;
    renderData((url) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.includes('/data')) {
        dataCalls += 1;
        return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
      }
      if (u.endsWith(`/workspace-views/${STUDIO_VIEW_ID}`)) {
        return mockResponse(makeViewSummary());
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByText('View chưa được công bố')).toBeInTheDocument();
    expect(
      screen.getByText(/Không có bản công bố để hiển thị dữ liệu thật/),
    ).toBeInTheDocument();
    expect(dataCalls).toBe(0);
  });

  it('view subject đã công bố → tự lấy data với subjectId của view, hiện badge "Dữ liệu thật"', async () => {
    const dataUrls: string[] = [];
    renderData((url) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.includes('/data')) {
        dataUrls.push(u);
        return mockResponse({
          view: PUBLISHED_VIEW,
          config: {
            version: 1,
            layout: 'stack',
            widgets: [{ id: 'hr', type: 'metric', title: 'Nhịp tim', span: 1 }],
          },
          digest: 'digest-r2-eeee',
          data: {
            subject: { id: SUBJECT.id, displayName: SUBJECT.displayName, timezone: SUBJECT.timezone },
            devices: [],
            metrics: {
              heartRateBpm: 75,
              quality: 'valid',
              measuredAt: '2026-11-14T09:00:00.000Z',
              online: true,
              freshness: 'live',
            },
            series: [],
            alerts: [],
            summary: null,
            tasks: [],
            sample: false,
          },
          checkedAt: '2026-11-14T10:00:00.000Z',
        });
      }
      if (u.endsWith(`/workspace-views/${STUDIO_VIEW_ID}`)) {
        return mockResponse(PUBLISHED_VIEW);
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    // Widget config của bản công bố được render + badge dữ liệu thật.
    expect(await screen.findByText('Dữ liệu thật · Bà Năm')).toBeInTheDocument();
    expect(screen.getByText('75 bpm')).toBeInTheDocument();
    expect(dataUrls).toHaveLength(1);
    expect(dataUrls[0]).toContain(`subjectId=${encodeURIComponent(SUBJECT.id)}`);
  });

  it('view cá nhân (scope user) → bắt buộc chọn hồ sơ trước khi gọi data', async () => {
    let dataCalls = 0;
    renderData((url) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.includes('/data')) {
        dataCalls += 1;
        return mockResponse(errorEnvelope('Thiếu subjectId.', 'VALIDATION_FAILED'), 422);
      }
      if (u.endsWith(`/workspace-views/${STUDIO_VIEW_ID}`)) {
        return mockResponse(
          makeViewSummary({
            scope: 'user',
            subjectId: null,
            status: 'published',
            currentPublication: makePublication({ revision: 2, digest: 'digest-r2-eeee', status: 'active' }),
          }),
        );
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    expect(await screen.findByText('Chưa chọn hồ sơ')).toBeInTheDocument();
    expect(dataCalls).toBe(0);

    await user.selectOptions(screen.getByLabelText(/Hồ sơ dữ liệu/), SUBJECT.id);
    expect(await screen.findByText('Không tải được dữ liệu view')).toBeInTheDocument();
    expect(dataCalls).toBe(1);
  });
});
