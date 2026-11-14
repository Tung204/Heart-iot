import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { HistoryPage } from './HistoryPage';
import { errorEnvelope, mockResponse, renderPage, SUBJECT } from '../../test/utils';

// FR-05 / lịch sử đo — chưa có dữ liệu phải ghi rõ bằng chữ, không hiện số 0 giả.
describe('HistoryPage — chưa có dữ liệu', () => {
  it('khoảng không có mẫu hợp lệ → hiển thị "Chưa có dữ liệu" kèm hướng dẫn', async () => {
    renderPage(<HistoryPage />, (url) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.includes(`/subjects/${SUBJECT.id}/measurements`)) {
        return mockResponse({
          items: [],
          nextCursor: null,
          coverage: {
            from: '2026-11-13T09:00:00.000Z',
            to: '2026-11-14T09:00:00.000Z',
            expectedIntervalSeconds: 15,
            observedCount: 0,
            expectedCount: 5760,
            percent: 0,
          },
          gaps: [
            {
              from: '2026-11-13T09:00:00.000Z',
              to: '2026-11-14T09:00:00.000Z',
              reason: 'no_data',
            },
          ],
          excludedUnsyncedCount: 0,
        });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByText('Chưa có dữ liệu')).toBeInTheDocument();
    expect(
      screen.getByText(/Chưa nhận dữ liệu từ thiết bị trong khoảng thời gian này/),
    ).toBeInTheDocument();
    // Không có bảng/biểu đồ, không có số 0 mạo nhận dữ liệu.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem trạng thái thiết bị' })).toHaveAttribute(
      'href',
      '/app/devices',
    );
  });

  it('có mẫu đồng hồ chưa đồng bộ → nêu rõ số mẫu bị loại khỏi trục thời gian', async () => {
    renderPage(<HistoryPage />, (url) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.includes(`/subjects/${SUBJECT.id}/measurements`)) {
        return mockResponse({
          items: [],
          nextCursor: null,
          coverage: {
            from: '2026-11-13T09:00:00.000Z',
            to: '2026-11-14T09:00:00.000Z',
            expectedIntervalSeconds: 15,
            observedCount: 0,
            expectedCount: 5760,
            percent: 0,
          },
          gaps: [],
          excludedUnsyncedCount: 7,
        });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByText('Chưa có dữ liệu')).toBeInTheDocument();
    expect(screen.getByText(/7 mẫu đồng hồ chưa đồng bộ/)).toBeInTheDocument();
  });
});
