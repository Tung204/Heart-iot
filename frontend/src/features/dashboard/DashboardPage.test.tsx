import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import {
  INCIDENT,
  SESSION,
  SUBJECT,
  SUBJECT_STATUS,
  errorEnvelope,
  mockResponse,
  renderApp,
  type FetchHandler,
} from '../../test/utils';

// P0 (review UX v2): cảnh báo đang mở là thông tin an toàn, phải render độc lập
// với query status/daily-summary. Ba vùng có loading/error riêng, không dùng
// loader/lỗi toàn trang che cảnh báo.

const SUMMARY = {
  date: '2026-11-14',
  timezone: 'Asia/Ho_Chi_Minh',
  heartRate: { avg: 73, min: 60, max: 88, validSamples: 100, invalidSamples: 2 },
  steps: { total: 1234, completeness: 'complete', notes: [] },
  coverage: {
    from: '2026-11-13T17:00:00.000Z',
    to: '2026-11-14T09:00:00.000Z',
    expectedIntervalSeconds: 15,
    observedCount: 100,
    expectedCount: 120,
    percent: 83.3,
  },
  gaps: [],
  incidents: { total: 1, resolved: 0 },
  lastSeenAt: '2026-11-14T09:00:00.000Z',
  batteryPercent: 85,
  source: 'synthetic',
};

const ALERTS = { items: [INCIDENT], nextCursor: null };

/** Không bao giờ trả về — mô phỏng request còn đang tải. */
const pending = () => new Promise<Response>(() => {});

const serverError = () =>
  mockResponse(errorEnvelope('Lỗi máy chủ nội bộ.', 'INTERNAL'), 500);

/** Toàn bộ suite chạy song song nên chờ rộng hơn mặc định 1s. */
const SLOW = { timeout: 5000 };

function dashboardHandler(overrides: {
  status?: () => Response | Promise<Response>;
  summary?: () => Response | Promise<Response>;
  alerts?: () => Response | Promise<Response>;
} = {}): FetchHandler {
  return (url) => {
    const u = String(url);
    if (u.endsWith('/me')) return mockResponse(SESSION);
    if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
    if (u.includes('/daily-summary')) return (overrides.summary ?? (() => mockResponse(SUMMARY)))();
    if (u.endsWith('/status')) return (overrides.status ?? (() => mockResponse(SUBJECT_STATUS)))();
    if (u.includes('/alerts')) return (overrides.alerts ?? (() => mockResponse(ALERTS)))();
    return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
  };
}

describe('DashboardPage — cảnh báo độc lập với dữ liệu tổng quan', () => {
  it('status/daily-summary lỗi 500 → cảnh báo đang mở vẫn hiển thị', async () => {
    renderApp(
      '/app/overview',
      dashboardHandler({ status: serverError, summary: serverError }),
    );

    expect(
      await screen.findByRole('link', { name: /Nghi ngã — cần chú ý/ }, SLOW),
    ).toBeInTheDocument();

    // Hai vùng kia báo lỗi riêng, không thay thế toàn trang.
    expect(
      await screen.findByText('Không tải được dữ liệu tổng quan', {}, SLOW),
    ).toBeInTheDocument();
    expect(screen.getByText('Không tải được trạng thái thiết bị')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Sức khỏe' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Hôm nay' })).toHaveAttribute('href', '/app');
    expect(screen.queryByText(/Đang tải dữ liệu tổng quan/)).not.toBeInTheDocument();
  });

  it('status/daily-summary đang tải → cảnh báo hiện ngay, mỗi vùng có loading riêng', async () => {
    renderApp(
      '/app/overview',
      dashboardHandler({ status: pending, summary: pending }),
    );

    expect(
      await screen.findByRole('link', { name: /Nghi ngã — cần chú ý/ }, SLOW),
    ).toBeInTheDocument();
    expect(screen.getByText('Đang tải dữ liệu tổng quan…')).toBeInTheDocument();
    expect(screen.getByText('Đang tải trạng thái thiết bị…')).toBeInTheDocument();
    // Vùng cảnh báo có dữ liệu thật, không phải trạng thái "đang tải".
    expect(screen.queryByText('Đang tải cảnh báo đang mở…')).not.toBeInTheDocument();
    expect(screen.getByText('Tổng hợp hôm nay')).toBeInTheDocument();
  });

  it('chỉ cảnh báo lỗi → tổng hợp hôm nay vẫn hiển thị số liệu', async () => {
    renderApp('/app/overview', dashboardHandler({ alerts: serverError }));

    expect(await screen.findByText('Không tải được cảnh báo đang mở', {}, SLOW)).toBeInTheDocument();
    expect(await screen.findByText(/73 bpm/, {}, SLOW)).toBeInTheDocument();
    expect(screen.getByText(/1234 bước/)).toBeInTheDocument();
    expect(screen.getByText('Vòng tay')).toBeInTheDocument();
    // R-12: bỏ ô số thứ tư khỏi màn chính và không lặp cách đếm cảnh báo.
    expect(screen.queryByText('Dữ liệu nhận được')).not.toBeInTheDocument();
    expect(screen.queryByText(/Cảnh báo hôm nay/)).not.toBeInTheDocument();
  });

  it('daily-summary source=synthetic → nhãn nguồn ngay cạnh khối Tổng hợp hôm nay', async () => {
    renderApp('/app/overview', dashboardHandler());

    const heading = await screen.findByRole('heading', { name: 'Tổng hợp hôm nay' }, SLOW);
    await screen.findByText(/73 bpm/, {}, SLOW);
    const section = heading.closest('section');
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText('Nguồn: dữ liệu mô phỏng')).toBeInTheDocument();
  });

  it('không có cảnh báo mở → ghi rõ bằng chữ, không hiện số 0 giả', async () => {
    renderApp(
      '/app/overview',
      dashboardHandler({ alerts: () => mockResponse({ items: [], nextCursor: null }) }),
    );

    expect(
      await screen.findByText(/Không có cảnh báo nào cần xử lý/, {}, SLOW),
    ).toBeInTheDocument();
    expect(screen.getByText('Không có cảnh báo')).toBeInTheDocument();
    expect(screen.queryByText(/\d+ cần chú ý/)).not.toBeInTheDocument();
  });

  it('chủ hồ sơ không chia sẻ số đo: summary 403 + status healthDataVisible=false → thông báo quyền, cảnh báo vẫn hiển thị', async () => {
    const forbidden = () =>
      mockResponse(
        errorEnvelope('Chủ hồ sơ không chia sẻ số đo và lịch sử với bạn.', 'FORBIDDEN'),
        403,
      );
    const redactedStatus = {
      ...SUBJECT_STATUS,
      devices: [
        {
          ...SUBJECT_STATUS.devices[0],
          healthDataVisible: false,
          lastHeartRateBpm: null,
          lastHeartRateQuality: null,
          lastMeasuredAt: null,
          batteryPercent: null,
          clockStatus: 'unknown',
          freshness: 'live',
        },
      ],
    };
    renderApp(
      '/app/overview',
      dashboardHandler({ status: () => mockResponse(redactedStatus), summary: forbidden }),
    );

    // Cảnh báo là thông tin an toàn: vẫn hiển thị dù vùng số đo bị chặn.
    expect(
      await screen.findByRole('link', { name: /Nghi ngã — cần chú ý/ }, SLOW),
    ).toBeInTheDocument();

    // Hai vùng (tổng hợp + thiết bị) báo trạng thái quyền bằng câu nghiệp vụ,
    // không hiện lỗi kỹ thuật và không vẽ số 0 mạo nhận dữ liệu.
    expect(
      (await screen.findAllByText('Chủ hồ sơ không chia sẻ số đo', {}, SLOW)).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('Không tải được dữ liệu tổng quan')).not.toBeInTheDocument();
    expect(screen.queryByText(/1234 bước/)).not.toBeInTheDocument();
    expect(screen.queryByText(/73 bpm/)).not.toBeInTheDocument();
    expect(screen.queryByText('chưa có mẫu hợp lệ')).not.toBeInTheDocument();
    expect(screen.queryByText('Lần đo gần nhất')).not.toBeInTheDocument();
  });
});

// v7 lane H — gác quyền đã biết + không số 0 giả.
describe('DashboardPage — quyền số đo và dữ liệu chưa đủ', () => {
  const caregiverWithoutMeasurements = {
    ...SUBJECT,
    role: 'caregiver',
    sharedFrom: '2026-11-12T00:00:00.000Z',
    permissions: { ...SUBJECT.permissions, canViewMeasurements: false },
  };

  it('biết trước không có quyền số đo → không gọi daily-summary/insights, cảnh báo vẫn hiển thị', async () => {
    const { fetchMock } = renderApp('/app/overview', (url) => {
      const u = String(url);
      if (u.endsWith('/me')) return mockResponse(SESSION);
      if (u.endsWith('/subjects')) return mockResponse({ items: [caregiverWithoutMeasurements] });
      if (u.endsWith('/status')) return mockResponse(SUBJECT_STATUS);
      if (u.includes('/alerts')) return mockResponse(ALERTS);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    // Cảnh báo là thông tin an toàn: hiển thị dù không có quyền số đo.
    expect(
      await screen.findByRole('link', { name: /Nghi ngã — cần chú ý/ }, SLOW),
    ).toBeInTheDocument();
    expect(await screen.findByText('Chủ hồ sơ không chia sẻ số đo', {}, SLOW)).toBeInTheDocument();

    // Không có link lịch sử/CSV và không render vùng xu hướng.
    expect(screen.queryByRole('link', { name: 'Lịch sử đo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Xem lịch sử/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Xu hướng gần đây' })).not.toBeInTheDocument();
    expect(screen.queryByText(/73 bpm/)).not.toBeInTheDocument();

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((u) => u.includes('/daily-summary'))).toBe(false);
    expect(urls.some((u) => u.includes('/insights'))).toBe(false);
    // Metadata thiết bị (kết nối/pin) vẫn được đọc: không phải dữ liệu số đo.
    expect(urls.some((u) => u.endsWith(`/subjects/${SUBJECT.id}/status`))).toBe(true);
  });

  it('chưa đủ dữ liệu bước / không có nhịp tim hợp lệ / pin null → không hiện số 0 giả', async () => {
    const sparseSummary = {
      ...SUMMARY,
      heartRate: null,
      steps: { total: 0, completeness: 'unavailable' as const, notes: [] },
      batteryPercent: null,
      gaps: [
        {
          from: '2026-11-13T17:00:00.000Z',
          to: '2026-11-14T09:00:00.000Z',
          reason: 'no_data' as const,
        },
      ],
    };
    renderApp(
      '/app/overview',
      dashboardHandler({ summary: () => mockResponse(sparseSummary) }),
    );

    expect(
      await screen.findByText('Chưa có lần đo nhịp tim hợp lệ hôm nay', {}, SLOW),
    ).toBeInTheDocument();
    expect(screen.getByText('chưa đủ dữ liệu bước')).toBeInTheDocument();
    expect(screen.queryByText(/0 bước/)).not.toBeInTheDocument();
    expect(screen.getByText('Chưa có thông tin pin')).toBeInTheDocument();
    expect(screen.getByText(/1 khoảng thiếu dữ liệu/)).toBeInTheDocument();
  });
});

// P3-04 (QA chốt v7) — thiếu `canReceiveAlerts` là trạng thái quyền, không phải lỗi:
// không gọi `/alerts`, không mời “Thử lại”, vẫn hiển thị số đo bình thường.
describe('DashboardPage — thiếu quyền nhận cảnh báo', () => {
  const measurementOnly = {
    ...SUBJECT,
    role: 'caregiver',
    sharedFrom: '2026-11-12T00:00:00.000Z',
    permissions: {
      ...SUBJECT.permissions,
      canViewMeasurements: true,
      canReceiveAlerts: false,
    },
  };

  it('measurement-only → 0 request /alerts, câu quyền, không nút Thử lại/link cảnh báo', async () => {
    const { fetchMock } = renderApp('/app/overview', (url) => {
      const u = String(url);
      if (u.endsWith('/me')) return mockResponse(SESSION);
      if (u.endsWith('/subjects')) return mockResponse({ items: [measurementOnly] });
      if (u.includes('/daily-summary')) return mockResponse(SUMMARY);
      if (u.endsWith('/status')) return mockResponse(SUBJECT_STATUS);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(
      await screen.findByText('Chủ hồ sơ không chia sẻ cảnh báo với bạn.', {}, SLOW),
    ).toBeInTheDocument();
    // Vùng số đo vẫn như cũ khi có `canViewMeasurements`.
    expect(await screen.findByText(/73 bpm/, {}, SLOW)).toBeInTheDocument();

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((u) => u.includes('/alerts'))).toBe(false);
    const alertsSection = screen
      .getByRole('heading', { name: 'Cảnh báo đang mở' })
      .closest('section');
    expect(alertsSection).not.toBeNull();
    const alerts = within(alertsSection as HTMLElement);
    expect(alerts.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
    expect(alerts.queryByRole('link', { name: /Xem tất cả cảnh báo/ })).not.toBeInTheDocument();
    expect(alerts.queryByText('Không tải được cảnh báo đang mở')).not.toBeInTheDocument();
    expect(alerts.queryByText('Đang tải cảnh báo đang mở…')).not.toBeInTheDocument();
  });

  it('owner → query cảnh báo chạy bình thường, vẫn có link xem tất cả', async () => {
    renderApp('/app/overview', dashboardHandler());

    expect(
      await screen.findByRole('link', { name: /Nghi ngã — cần chú ý/ }, SLOW),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Xem tất cả cảnh báo/ })).toHaveAttribute(
      'href',
      '/app/alerts',
    );
  });
});

// P3-05 (QA chốt v7) — mốc kết nối bị ẩn theo cửa sổ chia sẻ không được đọc thành
// “chưa từng kết nối” khi thiết bị vẫn trực tuyến.
describe('DashboardPage — mốc kết nối ẩn theo quyền chia sẻ', () => {
  it('healthDataVisible=false + lastSeenAt=null + freshness live → copy ẩn theo quyền', async () => {
    const redactedStatus = {
      ...SUBJECT_STATUS,
      devices: [
        {
          ...SUBJECT_STATUS.devices[0],
          healthDataVisible: false,
          lastSeenAt: null,
          lastMeasuredAt: null,
          freshness: 'live',
        },
      ],
    };
    renderApp(
      '/app/overview',
      dashboardHandler({ status: () => mockResponse(redactedStatus) }),
    );

    expect(
      await screen.findByText('mốc kết nối ẩn theo quyền chia sẻ', {}, SLOW),
    ).toBeInTheDocument();
    expect(screen.getByText('Trực tuyến')).toBeInTheDocument();
    expect(screen.queryByText('chưa từng kết nối')).not.toBeInTheDocument();
  });

  it('thiết bị bình thường lastSeenAt=null → giữ copy “chưa từng kết nối”', async () => {
    const neverStatus = {
      ...SUBJECT_STATUS,
      devices: [
        {
          ...SUBJECT_STATUS.devices[0],
          healthDataVisible: true,
          lastSeenAt: null,
          lastMeasuredAt: null,
          freshness: 'never',
        },
      ],
    };
    renderApp(
      '/app/overview',
      dashboardHandler({ status: () => mockResponse(neverStatus) }),
    );

    expect(await screen.findByText('chưa từng kết nối', {}, SLOW)).toBeInTheDocument();
    expect(
      screen.queryByText('mốc kết nối ẩn theo quyền chia sẻ'),
    ).not.toBeInTheDocument();
  });
});
