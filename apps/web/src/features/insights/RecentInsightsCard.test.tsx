import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DailyInsight, InsightsResponse } from '@annhien/contracts/insights';
import {
  SUBJECT,
  errorEnvelope,
  mockResponse,
  renderPage,
  stubFetch,
} from '../../test/utils';
import { RecentInsightsCard } from './RecentInsightsCard';

/**
 * FR-05 — card xu hướng trên dashboard:
 * loading/empty/success/synthetic, đổi 7→30 gọi đúng query, ngày thiếu hiển thị "—",
 * accessible name cho biểu đồ, không crash khi giá trị null.
 */

function makeDay(overrides: Partial<DailyInsight> = {}): DailyInsight {
  return {
    date: '2026-11-14',
    hasData: true,
    source: 'device',
    heartRate: { avg: 72.5, min: 68, max: 78, validSamples: 3 },
    steps: { total: 1200, completeness: 'complete' },
    coverage: { percent: 12.5, observedCount: 720, expectedCount: 5760 },
    incidents: { total: 0, resolved: 0 },
    ...overrides,
  };
}

const EMPTY_DAY = makeDay({
  date: '2026-11-13',
  hasData: false,
  heartRate: null,
  steps: { total: 0, completeness: 'unavailable' },
  coverage: { percent: 0, observedCount: 0, expectedCount: 5760 },
});

function makeResponse(overrides: Partial<InsightsResponse> = {}): InsightsResponse {
  const days = [
    EMPTY_DAY,
    makeDay({ date: '2026-11-14' }),
    makeDay({ date: '2026-11-15', heartRate: { avg: 80, min: 80, max: 80, validSamples: 1 } }),
  ];
  return {
    subjectId: SUBJECT.id,
    timezone: 'Asia/Ho_Chi_Minh',
    from: '2026-11-12T17:00:00.000Z',
    to: '2026-11-15T10:00:00.000Z',
    days,
    summary: {
      dataDays: 2,
      avgHeartRate: 74.2,
      totalSteps: 2400,
      avgCoveragePercent: 12.5,
      incidentsTotal: 2,
      incidentsResolved: 1,
      syntheticDays: 0,
    },
    notes: ['Có 1/3 ngày không có mẫu đo; các ngày đó hiển thị "—" thay vì số 0.'],
    ...overrides,
  };
}

function emptyResponse(): InsightsResponse {
  return makeResponse({
    days: [EMPTY_DAY],
    summary: {
      dataDays: 0,
      avgHeartRate: null,
      totalSteps: 0,
      avgCoveragePercent: 0,
      incidentsTotal: 0,
      incidentsResolved: 0,
      syntheticDays: 0,
    },
    notes: ['Có 1/1 ngày không có mẫu đo; các ngày đó hiển thị "—" thay vì số 0.'],
  });
}

describe('RecentInsightsCard — trạng thái và dữ liệu', () => {
  it('đang tải → thông báo trạng thái, không render số liệu giả', async () => {
    renderPage(<RecentInsightsCard subjectId={SUBJECT.id} />, () =>
      new Promise<Response>(() => {
        /* giữ request treo để kiểm trạng thái tải */
      }),
    );

    expect(await screen.findByText('Đang tải xu hướng…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải xu hướng…');
    expect(
      screen.getByRole('group', { name: 'Khoảng thời gian xu hướng' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Nhịp tim trung bình theo ngày' })).toBeNull();
  });

  it('rỗng → có hành động sang Lịch sử đo và dòng miễn trừ y tế', async () => {
    renderPage(<RecentInsightsCard subjectId={SUBJECT.id} />, () =>
      mockResponse(emptyResponse()),
    );

    expect(await screen.findByText('Chưa có dữ liệu xu hướng')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở lịch sử đo' })).toHaveAttribute(
      'href',
      '/app/history',
    );
    expect(
      screen.getByText('Chỉ để theo dõi, không thay thế tư vấn y tế.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Nhịp tim trung bình theo ngày' })).toBeNull();
  });

  it('thành công → 4 chỉ số, biểu đồ có nhãn từng ngày, ngày thiếu hiển thị "—"', async () => {
    renderPage(<RecentInsightsCard subjectId={SUBJECT.id} />, () => mockResponse(makeResponse()));

    expect(await screen.findByText('74.2 bpm')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Xu hướng gần đây' })).toBeInTheDocument();
    expect(screen.getByText('2.400 bước')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByText('12.5%')).toBeInTheDocument();
    expect(screen.getByText(/Cảnh báo trong kỳ: 2 \(đã đóng 1\)/)).toBeInTheDocument();

    const chart = screen.getByRole('list', { name: 'Nhịp tim trung bình theo ngày' });
    const columns = within(chart).getAllByRole('listitem');
    expect(columns).toHaveLength(3);
    expect(columns[0]).toHaveAccessibleName('Ngày 13/11/2026: chưa có dữ liệu');
    expect(columns[1]).toHaveAccessibleName(
      'Ngày 14/11/2026: nhịp tim trung bình 72.5 bpm, 3 lần đo hợp lệ',
    );
    // Ngày thiếu hiển thị "—" (cả giá trị và cột), không vẽ cột 0.
    expect(within(columns[0]!).getAllByText('—').length).toBeGreaterThanOrEqual(1);
    expect(within(columns[0]!).queryByText('0')).toBeNull();

    expect(screen.getByText(/1\/3 ngày không có mẫu đo/)).toBeInTheDocument();
    expect(
      screen.getByText('Chỉ để theo dõi, không thay thế tư vấn y tế.'),
    ).toBeInTheDocument();
  });

  it('có mẫu mô phỏng → một nhãn nguồn "Dữ liệu mô phỏng · không phải số đo thật"', async () => {
    const response = makeResponse({
      days: [makeDay({ source: 'synthetic' })],
      summary: {
        dataDays: 1,
        avgHeartRate: 72.5,
        totalSteps: 1200,
        avgCoveragePercent: 12.5,
        incidentsTotal: 0,
        incidentsResolved: 0,
        syntheticDays: 1,
      },
    });
    renderPage(<RecentInsightsCard subjectId={SUBJECT.id} />, () => mockResponse(response));

    expect(
      await screen.findByText('Dữ liệu mô phỏng · không phải số đo thật'),
    ).toBeInTheDocument();
  });

  it('đổi 7→30 ngày gọi đúng query và cập nhật aria-pressed', async () => {
    const fetchMock = stubFetch((url) => {
      const days = new URL(url, 'http://localhost').searchParams.get('days');
      const count = Number(days ?? '7');
      const response = makeResponse({
        days: Array.from({ length: count }, (_, index) =>
          makeDay({ date: `2026-11-${String(index + 1).padStart(2, '0')}` }),
        ),
        summary: {
          dataDays: count,
          avgHeartRate: 72.5,
          totalSteps: 1200 * count,
          avgCoveragePercent: 12.5,
          incidentsTotal: 0,
          incidentsResolved: 0,
          syntheticDays: 0,
        },
        notes: [],
      });
      return mockResponse(response);
    });
    renderPage(<RecentInsightsCard subjectId={SUBJECT.id} />);

    const seven = await screen.findByRole('button', { name: '7 ngày' });
    await waitFor(() => expect(seven).toHaveAttribute('aria-pressed', 'true'));
    await screen.findByText('7/7');
    expect(fetchMock.mock.calls[0]?.[0]).toContain(`/subjects/${SUBJECT.id}/insights?days=7`);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '30 ngày' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '30 ngày' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('days=30'))).toBe(true),
    );
    await screen.findByText('30/30');
    expect(screen.getByRole('button', { name: '7 ngày' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('giá trị null (không lần đo hợp lệ) không làm crash và hiển thị "—"', async () => {
    const response = makeResponse({
      days: [
        makeDay({
          date: '2026-11-14',
          hasData: true,
          heartRate: null,
          steps: { total: 0, completeness: 'unavailable' },
          coverage: { percent: 0, observedCount: 4, expectedCount: 5760 },
        }),
      ],
      summary: {
        dataDays: 1,
        avgHeartRate: null,
        totalSteps: 0,
        avgCoveragePercent: 0.1,
        incidentsTotal: 0,
        incidentsResolved: 0,
        syntheticDays: 0,
      },
      notes: ['Có 1 ngày có mẫu đo nhưng không có nhịp tim hợp lệ.'],
    });
    renderPage(<RecentInsightsCard subjectId={SUBJECT.id} />, () => mockResponse(response));

    expect(await screen.findByText('Nhịp tim trung bình')).toBeInTheDocument();
    // Nhịp tim trung bình và tổng bước đều "—", không hiển thị 0 giả.
    const metrics = screen.getByText('Nhịp tim trung bình').closest('div');
    expect(metrics).not.toBeNull();
    expect(within(metrics!).getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Tổng bước').closest('div')).toHaveTextContent('chưa đủ dữ liệu bước');
    const chart = screen.getByRole('list', { name: 'Nhịp tim trung bình theo ngày' });
    expect(within(chart).getByRole('listitem')).toHaveAccessibleName(
      /có lần đo nhưng không có nhịp tim hợp lệ/,
    );
  });

  it('lỗi tải → thông báo, thử lại và lối sang Lịch sử; lỗi 404 không làm hỏng card', async () => {
    let calls = 0;
    const fetchMock = stubFetch(() => {
      calls += 1;
      if (calls === 1) {
        return mockResponse(errorEnvelope('Không tìm thấy hồ sơ.', 'NOT_FOUND'), 404);
      }
      return mockResponse(makeResponse());
    });
    renderPage(<RecentInsightsCard subjectId={SUBJECT.id} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không tải được xu hướng.');
    expect(within(alert).getByRole('link', { name: 'Mở lịch sử đo' })).toHaveAttribute(
      'href',
      '/app/history',
    );

    const user = userEvent.setup();
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('74.2 bpm')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('không có hồ sơ đang chọn → không render và không gọi API', () => {
    const fetchMock = stubFetch(() => mockResponse(makeResponse()));
    renderPage(<RecentInsightsCard subjectId={null} />);
    expect(screen.queryByRole('heading', { name: 'Xu hướng gần đây' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
