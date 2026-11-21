import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { HistoryPage } from './HistoryPage';
import { todayInTimeZone } from '../../lib/format';
import { SUBJECT, mockResponse, renderPage } from '../../test/utils';

describe('HistoryPage — lối vào phiếu đi khám', () => {
  it('link “Phiếu đi khám” giữ đúng from/to đang xem (ngày địa phương)', async () => {
    const measurementUrls: string[] = [];
    renderPage(<HistoryPage />, (url) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.includes(`/subjects/${SUBJECT.id}/measurements`)) {
        measurementUrls.push(u);
        return mockResponse({
          items: [],
          nextCursor: null,
          coverage: {
            from: '2026-11-18T09:00:00.000Z',
            to: '2026-11-19T09:00:00.000Z',
            expectedIntervalSeconds: 15,
            observedCount: 0,
            expectedCount: 5760,
            percent: 0,
          },
          gaps: [],
          excludedUnsyncedCount: 0,
        });
      }
      return mockResponse({ code: 'NOT_FOUND', message: 'Không tìm thấy.', requestId: 't' }, 404);
    });

    expect(await screen.findByText('Chưa có dữ liệu')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Phiếu đi khám' });
    const href = link.getAttribute('href') ?? '';
    const reportUrl = new URL(href, 'http://localhost');
    expect(reportUrl.pathname).toBe('/app/history/report');

    const measurementUrl = new URL(measurementUrls[0]!, 'http://localhost');
    expect(reportUrl.searchParams.get('from')).toBe(
      todayInTimeZone(SUBJECT.timezone, new Date(measurementUrl.searchParams.get('from')!)),
    );
    expect(reportUrl.searchParams.get('to')).toBe(
      todayInTimeZone(SUBJECT.timezone, new Date(measurementUrl.searchParams.get('to')!)),
    );
  });
});
