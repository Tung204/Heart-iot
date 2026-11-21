import { expect, test, type Page } from '@playwright/test';

// E2E cho màn Hôm nay (v4) — mock API bằng page.route, không cần API thật.
// `/app` là Hôm nay: trạng thái + ô hỏi; `/app/overview` là Sức khỏe.

const USER = {
  id: '0f1d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b',
  email: 'ba@example.com',
  displayName: 'Bà An',
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
    canViewAi: true,
    canViewMeasurements: true,
  },
  sharedFrom: null,
  createdAt: '2026-11-01T00:00:00.000Z',
};

const SUMMARY = {
  subjectId: SUBJECT.id,
  periodStart: '2026-11-07T00:00:00.000Z',
  periodEnd: '2026-11-14T00:00:00.000Z',
  generatedAt: '2026-11-14T10:00:00.000Z',
  status: 'degraded',
  provider: 'template',
  model: null,
  headline: 'Dữ liệu theo dõi 2026-11-07–2026-11-14: 120 mẫu đo, nhịp tim trung bình 75 bpm.',
  sections: [
    {
      kind: 'measurements',
      title: 'Số đo',
      body: 'Có 120 mẫu đo. Nhịp tim hợp lệ: 118 mẫu, trung bình 75 bpm.',
      facts: [
        { label: 'Trung bình', value: 75, unit: 'bpm' },
        { label: 'Số mẫu đo', value: 120, unit: 'mẫu' },
        { label: 'Cảnh báo đang mở', value: 1, unit: 'cảnh báo' },
        { label: 'Pin gần nhất', value: 85, unit: '%' },
      ],
    },
  ],
  disclaimer: 'Thông tin tổng hợp từ dữ liệu thiết bị, không phải chẩn đoán y khoa.',
  sources: [{ type: 'measurements', label: 'Telemetry 7 ngày', at: '2026-11-14T09:00:00.000Z' }],
  dataQuality: {
    coveragePercent: 16.7,
    observedCount: 120,
    expectedCount: 720,
    gaps: { count: 3, reasons: ['no_data'] },
    lastSeenAt: '2026-11-14T09:00:00.000Z',
    synthetic: true,
    limitations: ['Nguồn dữ liệu là mô phỏng, không phải số đo thật của người dùng.'],
  },
  degradedReason: 'Chưa cấu hình AI (AI_BASE_URL trống) nên dùng mẫu tóm tắt xác định từ số liệu đo.',
};

const INCIDENT = {
  id: '2f3d4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b',
  subjectId: SUBJECT.id,
  device: { id: '3f4d5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b', label: 'Vòng tay', serial: 'SN-001' },
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

const STATUS = {
  devices: [
    {
      deviceId: '3f4d5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b',
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
      healthDataVisible: true,
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
    digest: 'demo-digest',
  },
  asOf: '2026-11-14T09:00:00.000Z',
};

async function mockApi(page: Page) {
  let answerCount = 0;
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/v1/me') return route.fulfill({ json: { user: USER } });
    if (path === '/api/v1/subjects') return route.fulfill({ json: { items: [SUBJECT] } });
    if (path.endsWith('/assistant/summary')) return route.fulfill({ json: SUMMARY });
    if (path.endsWith('/assistant/ask')) {
      answerCount += 1;
      return route.fulfill({
        json: {
          answer: `Câu trả lời số ${answerCount}.`,
          status: 'degraded',
          provider: 'template',
          model: null,
          disclaimer: SUMMARY.disclaimer,
          sources: SUMMARY.sources,
          dataQuality: SUMMARY.dataQuality,
          degradedReason: SUMMARY.degradedReason,
        },
      });
    }
    if (path.endsWith('/status')) return route.fulfill({ json: STATUS });
    if (path.endsWith('/alerts')) {
      return route.fulfill({ json: { items: [INCIDENT], nextCursor: null } });
    }
    if (path.endsWith('/events')) {
      return route.fulfill({ contentType: 'text/event-stream', body: ': ping\n\n' });
    }
    return route.fulfill({
      status: 404,
      json: { code: 'NOT_FOUND', message: 'Không tìm thấy.', requestId: 'e2e-assistant' },
    });
  });
}

test('/app là Hôm nay: trạng thái cảnh báo, ô hỏi, không còn bối cảnh v3', async ({ page }) => {
  await mockApi(page);
  await page.goto('/app');

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Hôm nay' })).toBeVisible();

  // Thẻ trạng thái lấy từ cảnh báo đang mở, có lối sang danh sách cảnh báo.
  const status = page.getByRole('region', { name: 'Trạng thái hôm nay' });
  await expect(status).toContainText('Nghi ngã lúc');
  await expect(status).toContainText('1 cảnh báo đang mở.');
  await expect(status.getByRole('link', { name: 'Xem cảnh báo' })).toHaveAttribute(
    'href',
    '/app/alerts',
  );

  // Màn Hôm nay v4 không còn tóm tắt 7 ngày/bối cảnh của trợ lý v3.
  await expect(page.getByText('Tóm tắt theo mẫu')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Bối cảnh' })).toHaveCount(0);
  await expect(page.getByText(/Độ phủ/)).toHaveCount(0);
  await expect(page.getByText(/bản tin/i)).toHaveCount(0);

  // Ô hỏi + gợi ý ngắn; hội thoại chỉ xuất hiện sau câu hỏi đầu tiên.
  await expect(page.getByLabel(/^Câu hỏi/)).toBeVisible();
  const send = page.getByRole('button', { name: 'Gửi câu hỏi' });
  await expect(send).toBeEnabled();
  await expect(send).toHaveText('Gửi');
  // v7 đổi nhãn gợi ý theo design-system §5.4: gợi ý nêu phạm vi câu hỏi
  // ("Nhịp tim tuần này") thay cho nhãn ngắn v6 "Nhịp tim?"; bấm chỉ điền câu hỏi,
  // không tự gửi nên hội thoại vẫn chưa xuất hiện.
  const suggestion = page.getByRole('button', { name: 'Nhịp tim tuần này' });
  await expect(suggestion).toBeVisible();
  await expect(page.getByLabel(/^Câu hỏi/)).toHaveValue('');
  await suggestion.click();
  await expect(page.getByLabel(/^Câu hỏi/)).toHaveValue('Nhịp tim tuần này thế nào?');
  await expect(page.getByRole('log')).toHaveCount(0);

  // Lối sang Sức khỏe 7 ngày và ghi chú giới hạn của màn Hôm nay.
  await expect(page.getByRole('link', { name: 'Sức khỏe 7 ngày →' })).toHaveAttribute(
    'href',
    '/app/overview',
  );
  await expect(page.getByText('Dữ liệu mô phỏng · không thay thế cấp cứu.')).toHaveCount(1);
});

test('hỏi hai câu → hai câu trả lời nối tiếp, câu đầu vẫn còn', async ({ page }) => {
  await mockApi(page);
  await page.goto('/app');

  const composer = page.getByLabel(/^Câu hỏi/);
  await composer.fill('Nhịp tim tuần này thế nào?');
  await page.getByRole('button', { name: 'Gửi câu hỏi' }).click();
  await expect(page.getByText('Câu trả lời số 1.')).toBeVisible();

  await composer.fill('Pin thiết bị còn bao nhiêu?');
  await page.getByRole('button', { name: 'Gửi câu hỏi' }).click();
  await expect(page.getByText('Câu trả lời số 2.')).toBeVisible();

  const thread = page.getByRole('log', { name: 'Hội thoại' });
  await expect(thread.getByText('Câu trả lời số 1.')).toBeVisible();
  await expect(thread.getByText('Nhịp tim tuần này thế nào?')).toBeVisible();
  await expect(thread.getByText('Pin thiết bị còn bao nhiêu?')).toBeVisible();
});

test('từ /app/overview quay về Hôm nay bằng nav đầu tiên', async ({ page }) => {
  await mockApi(page);
  await page.goto('/app/overview');

  await expect(page.getByRole('heading', { level: 1, name: 'Sức khỏe' })).toBeVisible();

  const nav = page.getByRole('navigation', { name: 'Điều hướng ứng dụng' }).first();
  const today = nav.getByRole('link', { name: 'Hôm nay' });
  await expect(today).toHaveAttribute('href', '/app');
  await today.click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Hôm nay' })).toBeVisible();
});
