import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistoryPage } from './HistoryPage';
import { errorEnvelope, mockResponse, renderPage, stubFetch, SUBJECT } from '../../test/utils';

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

// QA v2 P1-1/P1-2 — cửa sổ thời gian ổn định và danh sách dài có trần hiển thị.
describe('HistoryPage — không reset mỗi phút và giới hạn số dòng hiển thị', () => {
  afterEach(() => {
    vi.useRealTimers();
    // jsdom không có matchMedia; test mobile tự gắn và dọn lại.
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  /** Một mẫu đo hợp lệ; `index` càng lớn càng cũ để giữ thứ tự ổn định. */
  function measurementItem(index: number) {
    const measuredAt = new Date(Date.UTC(2026, 10, 14, 9, 0, 0) - index * 15_000).toISOString();
    return {
      measuredAt,
      receivedAt: measuredAt,
      heartRateBpm: 60 + (index % 30),
      heartRateQuality: 'valid',
      motionQuality: 'valid',
      stepsSinceBoot: 10_000 + index,
      batteryPercent: 80,
      isLate: false,
      isQuarantined: false,
    };
  }

  function measurementsPage(items: ReturnType<typeof measurementItem>[], nextCursor: string | null) {
    return {
      items,
      nextCursor,
      coverage: {
        from: '2026-11-13T09:00:00.000Z',
        to: '2026-11-14T09:00:00.000Z',
        expectedIntervalSeconds: 15,
        observedCount: items.length,
        expectedCount: 5760,
        percent: 50,
      },
      gaps: [],
      excludedUnsyncedCount: 0,
    };
  }

  /** Handler phân trang theo `cursor` (không có cursor = trang đầu). */
  function measurementsHandler(pages: Record<string, ReturnType<typeof measurementsPage>>) {
    return (url: string) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.includes(`/subjects/${SUBJECT.id}/measurements`)) {
        const parsed = new URL(u, 'http://localhost');
        const cursor = parsed.searchParams.get('cursor') ?? 'first';
        return mockResponse(pages[cursor] ?? measurementsPage([], null));
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    };
  }

  const captionOf = (table: HTMLElement) => table.querySelector('caption');

  it('sau 60 giây: giữ trang đã tải, không refetch, from/to không đổi', async () => {
    // Chỉ giả lập setInterval của tick “bây giờ”; setTimeout/waitFor giữ thật.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const user = userEvent.setup();
    const fetchMock = stubFetch(
      measurementsHandler({
        first: measurementsPage(Array.from({ length: 40 }, (_, i) => measurementItem(i)), 'p2'),
        p2: measurementsPage(Array.from({ length: 25 }, (_, i) => measurementItem(40 + i)), null),
      }),
    );
    renderPage(<HistoryPage />);

    const table = await screen.findByRole('table');
    expect(captionOf(table)).toHaveTextContent('Đang hiển thị 20/40 dòng');

    await user.click(screen.getByRole('button', { name: 'Tải thêm từ máy chủ' }));
    await waitFor(() => {
      expect(captionOf(screen.getByRole('table'))).toHaveTextContent(
        'Đang hiển thị 20/65 dòng',
      );
    });

    const measurementCalls = () =>
      fetchMock.mock.calls
        .map((call) => String(call[0]))
        .filter((url) => url.includes('/measurements'));
    const urlsBefore = measurementCalls();
    expect(urlsBefore).toHaveLength(2);

    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });

    // Không có request mới: mốc "bây giờ" chỉ đổi nhãn, không đổi queryKey.
    expect(measurementCalls()).toEqual(urlsBefore);
    expect(screen.getByRole('table')).toHaveTextContent('Đang hiển thị 20/65 dòng');
    expect(screen.getAllByRole('row')).toHaveLength(21);
  });

  it('hiện thêm theo bước 50 dòng và dừng ở trần 400 dòng, chỉ rõ CSV để xem toàn bộ', async () => {
    const user = userEvent.setup();
    renderPage(
      <HistoryPage />,
      measurementsHandler({
        first: measurementsPage(
          Array.from({ length: 450 }, (_, i) => measurementItem(i)),
          null,
        ),
      }),
    );

    const table = await screen.findByRole('table');
    expect(captionOf(table)).toHaveTextContent('Đang hiển thị 20/450 dòng');
    expect(screen.getAllByRole('row')).toHaveLength(21);

    await user.click(screen.getByRole('button', { name: 'Hiện thêm 50 dòng' }));
    expect(screen.getAllByRole('row')).toHaveLength(71);

    await user.click(screen.getByRole('button', { name: 'Hiện tới 400 dòng' }));
    expect(screen.getAllByRole('row')).toHaveLength(401);

    // Không còn lối "Hiện tất cả" gây long task ~10 s; phần còn lại xem bằng CSV.
    expect(screen.queryByRole('button', { name: /Hiện tất cả/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Dùng nút “Tải CSV” ở trên để xem toàn bộ 450 dòng đã tải/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tải CSV' }).getAttribute('href')).toContain(
      '/export.csv',
    );

    // Desktop chỉ render bảng, không render thêm danh sách thẻ.
    expect(
      screen.queryByRole('list', { name: 'Dữ liệu đo trong khoảng đã chọn' }),
    ).not.toBeInTheDocument();
  });

  it('màn hình hẹp chỉ render danh sách thẻ, không render bảng', async () => {
    // jsdom không cài matchMedia — gắn bản giả để mô phỏng màn hình hẹp 390 px.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) =>
        ({
          matches: query === '(max-width: 767px)',
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    });

    renderPage(
      <HistoryPage />,
      measurementsHandler({
        first: measurementsPage(Array.from({ length: 30 }, (_, i) => measurementItem(i)), null),
      }),
    );

    expect(
      await screen.findByRole('list', { name: 'Dữ liệu đo trong khoảng đã chọn' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
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