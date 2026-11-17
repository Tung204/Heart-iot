import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ViewSummary } from '@heart-iot/contracts/studio';
import { StudioViewDataPage } from './StudioViewDataPage';
import { errorEnvelope, mockResponse, stubFetch, SUBJECT } from '../../test/utils';
import { makePublication, makeViewSummary, STUDIO_VIEW_ID } from './testFixtures';

const ACTIVE_DIGEST = '60b44d26-active-r2';
const DRAFT_DIGEST = '588e41b8-draft-r3';

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
  draftRevision: 2,
  draftDigest: ACTIVE_DIGEST,
  baseRevision: 2,
  currentPublication: makePublication({ revision: 2, digest: ACTIVE_DIGEST, status: 'active' }),
});

const VIEW_DATA_PAYLOAD = {
  view: PUBLISHED_VIEW,
  config: {
    version: 1,
    layout: 'stack',
    widgets: [{ id: 'hr', type: 'metric', title: 'Nhịp tim QA', span: 1 }],
  },
  digest: ACTIVE_DIGEST,
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
};

function viewDataPayload(view: ViewSummary = PUBLISHED_VIEW) {
  return { ...VIEW_DATA_PAYLOAD, view };
}

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
      screen.getByText(/Không có bản công bố để hiển thị dữ liệu của hồ sơ/),
    ).toBeInTheDocument();
    expect(dataCalls).toBe(0);
  });

  it('view subject đã công bố → tự lấy data với subjectId của view, hiện badge "Dữ liệu hồ sơ"', async () => {
    const dataUrls: string[] = [];
    renderData((url) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.includes('/data')) {
        dataUrls.push(u);
        return mockResponse(VIEW_DATA_PAYLOAD);
      }
      if (u.endsWith(`/workspace-views/${STUDIO_VIEW_ID}`)) {
        return mockResponse(PUBLISHED_VIEW);
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    // Widget config của bản công bố được render + badge "Dữ liệu hồ sơ"
    // (D9: không dùng nhãn "Dữ liệu thật").
    expect(await screen.findByText('Dữ liệu hồ sơ · Bà Năm')).toBeInTheDocument();
    expect(screen.queryByText(/Dữ liệu thật/)).not.toBeInTheDocument();
    expect(screen.getByText('75 bpm')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nhịp tim QA' })).toBeInTheDocument();
    // Digest + revision hiển thị khớp bản công bố active trong payload.
    expect(screen.getByText(/Bản công bố r2 \(60b44d26…\)/)).toBeInTheDocument();
    expect(screen.queryByText('Bản nháp hiện tại chưa được công bố')).not.toBeInTheDocument();
    expect(dataUrls).toHaveLength(1);
    expect(dataUrls[0]).toContain(`subjectId=${encodeURIComponent(SUBJECT.id)}`);
  });

  it('owner có draft mới hơn active → chỉ render config/digest bản công bố; draft tách nhãn, không gọi là đã công bố', async () => {
    const draftNewerThanActive = makeViewSummary({
      status: 'published',
      draftRevision: 3,
      draftDigest: DRAFT_DIGEST,
      baseRevision: 2,
      currentPublication: makePublication({ revision: 2, digest: ACTIVE_DIGEST, status: 'active' }),
    });
    // Response /data dựng như người xem: không lộ draftDigest, digest = active.
    const dataView = makeViewSummary({
      status: 'published',
      draftRevision: 2,
      draftDigest: null,
      baseRevision: 2,
      currentPublication: makePublication({ revision: 2, digest: ACTIVE_DIGEST, status: 'active' }),
    });

    renderData((url) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.includes('/data')) return mockResponse(viewDataPayload(dataView));
      if (u.endsWith(`/workspace-views/${STUDIO_VIEW_ID}`)) return mockResponse(draftNewerThanActive);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    // Widget của bản công bố (không phải draft “lần 2”).
    expect(await screen.findByRole('heading', { name: 'Nhịp tim QA' })).toBeInTheDocument();
    expect(screen.queryByText('Nhịp tim QA lần 2')).not.toBeInTheDocument();
    // Chỉ hiện digest của bản công bố, không hiện digest draft.
    expect(screen.getByText(/Bản công bố r2 \(60b44d26…\)/)).toBeInTheDocument();
    expect(screen.queryByText(/588e41b8/)).not.toBeInTheDocument();
    // Draft được nêu rõ là chưa công bố + dẫn sang đường Xem trước.
    expect(screen.getByText('Bản nháp hiện tại chưa được công bố')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem trước bản nháp' })).toHaveAttribute(
      'href',
      `/app/studio/${STUDIO_VIEW_ID}`,
    );
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
            draftRevision: 2,
            draftDigest: ACTIVE_DIGEST,
            baseRevision: 2,
            currentPublication: makePublication({ revision: 2, digest: ACTIVE_DIGEST, status: 'active' }),
          }),
        );
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    expect(await screen.findByText('Chưa chọn hồ sơ')).toBeInTheDocument();
    expect(dataCalls).toBe(0);

    await user.selectOptions(screen.getByLabelText(/Dữ liệu của/), SUBJECT.id);
    expect(await screen.findByText('Không tải được dữ liệu view')).toBeInTheDocument();
    expect(dataCalls).toBe(1);
  });
});
