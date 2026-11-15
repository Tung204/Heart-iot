import { expect, test, type Page } from '@playwright/test';

// E2E cho khu vực cảnh báo — mock API bằng page.route nên KHÔNG cần API thật chạy.
// Dữ liệu mẫu khớp hợp đồng @annhien/contracts (uuid v4, ISO-8601).

const USER = {
  id: '0f1d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b',
  email: 'con@example.com',
  displayName: 'Ngọc',
  role: 'user',
  status: 'active',
  createdAt: '2026-11-14T09:00:00.000Z',
};

const SUBJECT = {
  id: '1f2d3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b',
  ownerUserId: USER.id,
  displayName: 'Bà Năm',
  timezone: 'Asia/Ho_Chi_Minh',
  role: 'owner',
  permissions: {
    historyDays: 30,
    canReceiveAlerts: true,
    canAcknowledge: true,
    canResolve: true,
    canViewAi: false,
  },
  sharedFrom: null,
  createdAt: '2026-11-01T00:00:00.000Z',
};

const INCIDENT = {
  id: '2f3d4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b',
  subjectId: SUBJECT.id,
  device: {
    id: '3f4d5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b',
    label: 'Vòng tay',
    serial: 'SN-001',
  },
  type: 'fall',
  state: 'open',
  lastRevision: 1,
  detectedAt: '2026-11-14T08:00:00.000Z',
  lastEventAt: '2026-11-14T08:00:30.000Z',
  createdAt: '2026-11-14T08:00:30.000Z',
  cancelledAt: null,
  resolvedAt: null,
  resolutionReason: null,
  resolutionOutcome: null,
  version: 3,
  late: false,
  acknowledgedBy: null,
};

async function mockApi(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/v1/me') {
      return route.fulfill({ json: { user: USER } });
    }
    if (path === '/api/v1/subjects') {
      return route.fulfill({ json: { items: [SUBJECT] } });
    }
    if (path === `/api/v1/subjects/${SUBJECT.id}/alerts`) {
      return route.fulfill({ json: { items: [INCIDENT], nextCursor: null } });
    }
    if (path === `/api/v1/subjects/${SUBJECT.id}/status`) {
      return route.fulfill({
        json: {
          devices: [
            {
              deviceId: INCIDENT.device.id,
              subjectId: SUBJECT.id,
              serial: 'SN-001',
              label: 'Vòng tay',
              online: true,
              lastSeenAt: '2026-11-14T09:00:00.000Z',
              freshness: 'live',
              lastHeartRateBpm: 72,
              lastHeartRateQuality: 'valid',
              lastMeasuredAt: '2026-11-14T08:59:45.000Z',
              batteryPercent: 85,
              firmwareVersion: '0.9.0',
              clockStatus: 'synced',
            },
          ],
          policy: {
            key: 'device_runtime',
            version: 1,
            source: 'default',
            value: {
              heartbeatIntervalSeconds: 15,
              offlineAfterSeconds: 45,
              dataFreshAfterSeconds: 30,
              lateEventMinutes: 5,
              maxTelemetryPerMinute: 240,
            },
            digest: 'e2e-digest',
          },
          asOf: '2026-11-14T09:00:00.000Z',
        },
      });
    }
    if (path.includes('/daily-summary')) {
      return route.fulfill({
        json: {
          date: '2026-11-14',
          timezone: 'Asia/Ho_Chi_Minh',
          heartRate: { avg: 72.5, min: 64, max: 96, validSamples: 40, invalidSamples: 2 },
          steps: { total: 3210, completeness: 'partial', notes: [] },
          coverage: {
            from: '2026-11-13T17:00:00.000Z',
            to: '2026-11-14T17:00:00.000Z',
            expectedIntervalSeconds: 15,
            observedCount: 40,
            expectedCount: 5760,
            percent: 1,
          },
          gaps: [],
          incidents: { total: 1, resolved: 0 },
          lastSeenAt: '2026-11-14T09:00:00.000Z',
          batteryPercent: 85,
          source: 'synthetic',
        },
      });
    }
    if (path.endsWith('/events')) {
      // SSE: trả stream "rỗng" — browser tự mở lại theo backoff, không ảnh hưởng test.
      return route.fulfill({
        contentType: 'text/event-stream',
        body: ': ping\n\n',
      });
    }
    if (path === `/api/v1/alerts/${INCIDENT.id}`) {
      return route.fulfill({
        json: {
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
        },
      });
    }
    return route.fulfill({
      status: 404,
      json: { code: 'NOT_FOUND', message: 'Không tìm thấy.', requestId: 'e2e-1' },
    });
  });
}

test('danh sách cảnh báo hiển thị cảnh báo đang mở và đi tới chi tiết', async ({ page }) => {
  await mockApi(page);
  await page.goto('/app/alerts');

  await expect(page.getByRole('heading', { level: 1, name: 'Cảnh báo' })).toBeVisible();
  await expect(page.getByText('Nghi ngã — cần chú ý')).toBeVisible();
  await expect(page.getByText('chưa có người xác nhận')).toBeVisible();

  await page.getByRole('link', { name: /Nghi ngã — cần chú ý/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Nghi ngã/ })).toBeVisible();
  await expect(page.getByText('Diễn biến sự kiện')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tôi đang hỗ trợ' })).toBeVisible();
});

test('Sức khỏe hiển thị cảnh báo mở và đường dẫn về Hôm nay/lịch sử', async ({ page }) => {
  await mockApi(page);
  await page.goto('/app/overview');

  await expect(page).toHaveURL(/\/app\/overview$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sức khỏe' })).toBeVisible();
  // Đường dẫn quay lại màn Hôm nay (v4), không phải trợ lý/tổng quan v3.
  await expect(
    page
      .getByRole('navigation', { name: 'Đường dẫn' })
      .getByRole('link', { name: '← Hôm nay' }),
  ).toHaveAttribute('href', '/app');

  await expect(page.getByRole('heading', { name: 'Cảnh báo đang mở' })).toBeVisible();
  await expect(page.getByText('1 cần chú ý')).toBeVisible();
  await expect(page.getByText('chưa có người xác nhận')).toBeVisible();
  await expect(page.getByRole('link', { name: /Nghi ngã — cần chú ý/ })).toHaveAttribute(
    'href',
    `/app/alerts/${INCIDENT.id}`,
  );
  await expect(page.getByRole('link', { name: 'Xem tất cả cảnh báo →' })).toHaveAttribute(
    'href',
    '/app/alerts',
  );

  // Vùng tổng hợp hôm nay vẫn có số liệu và lối sang lịch sử đo.
  await expect(page.getByRole('heading', { name: 'Tổng hợp hôm nay' })).toBeVisible();
  await expect(page.getByText('73 bpm')).toBeVisible();
  await expect(page.getByText('3210 bước')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Xem lịch sử và biểu đồ →' })).toHaveAttribute(
    'href',
    '/app/history',
  );

  // Nav đầu tiên của khung là Hôm nay và trỏ về /app.
  await expect(
    page
      .getByRole('navigation', { name: 'Điều hướng ứng dụng' })
      .first()
      .getByRole('link', { name: 'Hôm nay' }),
  ).toHaveAttribute('href', '/app');
});
