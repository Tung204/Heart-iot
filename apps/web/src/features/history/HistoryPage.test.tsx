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

// FR-02/FR-05 — caregiver mới accept: cửa sổ yêu cầu không được bắt đầu trước sharedFrom.
describe('HistoryPage — cửa sổ chia sẻ của người thân', () => {
  const emptyMeasurements = () =>
    ({
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
      excludedUnsyncedCount: 0,
    }) as const;

  const caregiver = (sharedFrom: string, historyDays: number) => ({
    ...SUBJECT,
    role: 'caregiver',
    sharedFrom,
    permissions: { ...SUBJECT.permissions, historyDays },
  });

  function renderWithSubject(subject: Record<string, unknown>, onMeasurements: (url: string) => void) {
    return renderPage(<HistoryPage />, (url) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [subject] });
      if (u.includes(`/subjects/${SUBJECT.id}/measurements`)) {
        onMeasurements(u);
        return mockResponse(emptyMeasurements());
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
  }

  it('sharedFrom trong 24 giờ: from và CSV bắt đầu tại sharedFrom, không gửi sớm hơn', async () => {
    const sharedFrom = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    const measurementUrls: string[] = [];
    renderWithSubject(caregiver(sharedFrom, 7), (url) => measurementUrls.push(url));

    expect(await screen.findByText('Chưa có dữ liệu')).toBeInTheDocument();
    expect(measurementUrls.length).toBeGreaterThan(0);

    const measurementUrl = new URL(measurementUrls[0]!, 'http://localhost');
    const from = new Date(measurementUrl.searchParams.get('from')!).getTime();
    expect(from).toBeGreaterThanOrEqual(new Date(sharedFrom).getTime());
    expect(from - new Date(sharedFrom).getTime()).toBeLessThan(5_000);
    expect(screen.getByText(/Dữ liệu chỉ bắt đầu từ/)).toBeInTheDocument();

    const csvLink = screen.getByRole('link', { name: 'Tải CSV' });
    const csvUrl = new URL(csvLink.getAttribute('href')!, 'http://localhost');
    expect(csvUrl.searchParams.get('from')).toBe(measurementUrl.searchParams.get('from'));
    expect(csvUrl.searchParams.get('to')).toBe(measurementUrl.searchParams.get('to'));
  });

  it('khoảng bao trùm trước sharedFrom bị disable kèm giải thích', async () => {
    const sharedFrom = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const measurementUrls: string[] = [];
    renderWithSubject(caregiver(sharedFrom, 7), (url) => measurementUrls.push(url));

    expect(await screen.findByText('Chưa có dữ liệu')).toBeInTheDocument();

    const sevenDays = screen.getByRole('button', { name: '7 ngày' });
    expect(sevenDays).toBeDisabled();
    expect(sevenDays.getAttribute('title')).toMatch(/Chỉ xem được dữ liệu từ/);

    const thirtyDays = screen.getByRole('button', { name: '30 ngày' });
    expect(thirtyDays).toBeDisabled();

    const twentyFourHours = screen.getByRole('button', { name: '24 giờ' });
    expect(twentyFourHours).toBeEnabled();

    // Khoảng 24 giờ vẫn nằm sau mốc chia sẻ nên from = now - 24h (> sharedFrom).
    const measurementUrl = new URL(measurementUrls[0]!, 'http://localhost');
    const from = new Date(measurementUrl.searchParams.get('from')!).getTime();
    expect(from).toBeGreaterThan(new Date(sharedFrom).getTime());
  });
});

// P1-2/P2-6 — quyền xem số đo tách khỏi quyền nhận cảnh báo: thiếu quyền là
// trạng thái nghiệp vụ, không hiện lỗi kỹ thuật và không gọi API dữ liệu.
describe('HistoryPage — thiếu quyền xem số đo', () => {
  const caregiverWithoutMeasurements = {
    ...SUBJECT,
    role: 'caregiver',
    sharedFrom: '2026-11-12T00:00:00.000Z',
    permissions: { ...SUBJECT.permissions, canViewMeasurements: false },
  };

  it('hồ sơ báo không chia sẻ số đo → thông báo quyền, không gọi measurements, không có CSV', async () => {
    const requested: string[] = [];
    renderPage(<HistoryPage />, (url) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [caregiverWithoutMeasurements] });
      if (u.includes('/measurements')) requested.push(u);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByText('Chủ hồ sơ không chia sẻ số đo')).toBeInTheDocument();
    expect(
      screen.getByText(/Chủ hồ sơ không chia sẻ số đo và lịch sử với bạn/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Không tải được dữ liệu đo')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tải CSV' })).not.toBeInTheDocument();
    expect(requested).toHaveLength(0);
  });

  it('API trả 403 (quyền vừa bị tắt) → cùng thông báo quyền, không hiện lỗi kỹ thuật', async () => {
    renderPage(<HistoryPage />, (url) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.includes('/measurements')) {
        return mockResponse(
          errorEnvelope('Chủ hồ sơ không chia sẻ số đo và lịch sử với bạn.', 'FORBIDDEN'),
          403,
        );
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(
      await screen.findByText('Chủ hồ sơ không chia sẻ số đo', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Không tải được dữ liệu đo')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tải CSV' })).not.toBeInTheDocument();
  });
});
