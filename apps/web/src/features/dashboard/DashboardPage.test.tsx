import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
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
      '/app',
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
      screen.getByRole('heading', { level: 1, name: /Tổng quan/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Đang tải dữ liệu tổng quan/)).not.toBeInTheDocument();
  });

  it('status/daily-summary đang tải → cảnh báo hiện ngay, mỗi vùng có loading riêng', async () => {
    renderApp(
      '/app',
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
    renderApp('/app', dashboardHandler({ alerts: serverError }));

    expect(await screen.findByText('Không tải được cảnh báo đang mở', {}, SLOW)).toBeInTheDocument();
    expect(await screen.findByText(/73 bpm/, {}, SLOW)).toBeInTheDocument();
    expect(screen.getByText(/1234 bước/)).toBeInTheDocument();
    expect(screen.getByText('Vòng tay')).toBeInTheDocument();
  });

  it('không có cảnh báo mở → ghi rõ bằng chữ, không hiện số 0 giả', async () => {
    renderApp(
      '/app',
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
      '/app',
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
