import { expect, test, type Page } from '@playwright/test';

// E2E cho trang lịch sử (QA v2 P1-1/P1-2) — mock API bằng page.route, không cần API thật.
// Dữ liệu mẫu khớp hợp đồng @heart-iot/contracts; 1.681 dòng chia 4 trang 500/500/500/181.

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

const TOTAL_POINTS = 1681;
const PAGE_SIZE = 500;
const BASE_MEASURED_AT = Date.UTC(2026, 10, 14, 9, 0, 0);

function measurementPoint(index: number) {
  const measuredAt = new Date(BASE_MEASURED_AT - index * 15_000).toISOString();
  return {
    measuredAt,
    receivedAt: measuredAt,
    heartRateBpm: 60 + (index % 40),
    heartRateQuality: index % 97 === 0 ? 'poor_signal' : 'valid',
    motionQuality: 'valid',
    stepsSinceBoot: 100_000 + index,
    batteryPercent: 80,
    isLate: index % 211 === 0,
    isQuarantined: false,
  };
}

/** Trang dữ liệu theo offset trong cursor `offset-<n>` — không cần DB thật. */
function measurementsPage(offset: number) {
  const end = Math.min(offset + PAGE_SIZE, TOTAL_POINTS);
  const items = Array.from({ length: Math.max(0, end - offset) }, (_, i) =>
    measurementPoint(offset + i),
  );
  return {
    items,
    nextCursor: end < TOTAL_POINTS ? `offset-${end}` : null,
    coverage: {
      from: new Date(BASE_MEASURED_AT - 7 * 24 * 3600 * 1000).toISOString(),
      to: new Date(BASE_MEASURED_AT).toISOString(),
      expectedIntervalSeconds: 15,
      observedCount: TOTAL_POINTS,
      expectedCount: 40_320,
      percent: 4.2,
    },
    gaps: [],
    excludedUnsyncedCount: 0,
  };
}

/**
 * Mock API tối thiểu để vào /app/history. Trả về bộ đếm request `/measurements`
 * để test khẳng định không refetch sau khi đồng hồ chạy qua mốc 60 giây.
 */
async function mockApi(page: Page) {
  const counters = { measurements: 0, urls: [] as string[] };
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/v1/me') {
      return route.fulfill({ json: { user: USER } });
    }
    if (path === '/api/v1/subjects') {
      return route.fulfill({ json: { items: [SUBJECT] } });
    }
    if (path === `/api/v1/subjects/${SUBJECT.id}/measurements`) {
      counters.measurements += 1;
      counters.urls.push(route.request().url());
      const cursor = url.searchParams.get('cursor');
      const offset = cursor ? Number(/^offset-(\d+)$/.exec(cursor)?.[1] ?? 0) : 0;
      return route.fulfill({ json: measurementsPage(offset) });
    }
    if (path.endsWith('/events')) {
      return route.fulfill({ contentType: 'text/event-stream', body: ': ping\n\n' });
    }
    return route.fulfill({
      status: 404,
      json: { code: 'NOT_FOUND', message: 'Không tìm thấy.', requestId: 'e2e-history' },
    });
  });
  return counters;
}

test('lịch sử giữ nguyên trang đã tải sau 60 giây, không refetch', async ({ page }) => {
  // Đồng hồ giả để tua qua mốc tick 60 s mà không phải chờ thật.
  await page.clock.install();
  const counters = await mockApi(page);
  await page.goto('/app/history');

  const table = page.getByRole('table');
  await expect(table).toContainText('Đang hiển thị 10/500 dòng');
  await expect(table.locator('tbody tr')).toHaveCount(10);

  // v4: một nút duy nhất mở thêm 50 dòng đã tải (10 → 60), không gọi máy chủ.
  await page.getByRole('button', { name: 'Hiện thêm 50 dòng' }).click();
  await expect(table).toContainText('Đang hiển thị 60/500 dòng');
  await expect(table.locator('tbody tr')).toHaveCount(60);

  const callsBefore = counters.measurements;
  const urlsBefore = [...counters.urls];
  // Dev + StrictMode có thể gửi lặp request đầu tiên (unmount/remount) với cùng
  // from/to; điều cốt lõi là sau 60 giây không tăng thêm request nào.
  expect(callsBefore).toBeGreaterThanOrEqual(1);
  expect(new Set(urlsBefore).size).toBe(1);

  await page.clock.fastForward(61_000);

  // Không có request mới (cùng from/to) và danh sách đã tải vẫn còn nguyên.
  await expect(table).toContainText('Đang hiển thị 60/500 dòng');
  await expect(table.locator('tbody tr')).toHaveCount(60);
  expect(counters.measurements).toBe(callsBefore);
  expect(counters.urls).toEqual(urlsBefore);
});

test('một nút Hiện thêm 50 dòng mỗi bước, dừng ở trần 400 dòng và chỉ dẫn CSV', async ({ page }) => {
  await mockApi(page);
  await page.goto('/app/history');

  const table = page.getByRole('table');
  await expect(table).toContainText('Đang hiển thị 10/500 dòng');
  await expect(table.locator('tbody tr')).toHaveCount(10);

  // v4 chỉ còn một nút “Hiện thêm N dòng”; không có “Hiện tất cả”/“Hiện tới 400 dòng”.
  const more = page.getByRole('button', { name: 'Hiện thêm 50 dòng' });
  await expect(more).toBeVisible();
  await expect(page.getByRole('button', { name: /Hiện tất cả|Hiện tới/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Tải thêm từ máy chủ/ })).toHaveCount(0);

  await more.click();
  await expect(table).toContainText('Đang hiển thị 60/500 dòng');
  await expect(table.locator('tbody tr')).toHaveCount(60);

  // 8 bước 50 dòng: 10 → 60 → … → 400 (trần v4), không render thêm dòng nào.
  for (let step = 0; step < 7; step += 1) {
    await page.getByRole('button', { name: /Hiện thêm \d+ dòng/ }).click();
  }
  await expect(table).toContainText('Đang hiển thị 400/500 dòng');
  await expect(table.locator('tbody tr')).toHaveCount(400);
  await expect(page.getByRole('button', { name: /Hiện thêm/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Tải thêm từ máy chủ/ })).toHaveCount(0);

  const hint = page.getByText(/Đã hiện tối đa 400\/500 dòng/);
  await expect(hint).toBeVisible();
  await expect(hint).toContainText(
    'Dùng nút “Tải CSV” ở trên để xem toàn bộ 500 dòng đã tải.',
  );
  const csv = page.getByRole('link', { name: 'Tải CSV' });
  await expect(csv).toHaveAttribute('href', /\/export\.csv/);
  await expect(csv).toHaveAttribute('download', '');

  // Một biến thể danh sách (bảng desktop) + trần 400 dòng ⇒ DOM không phình như trước.
  const elementCount = await page.evaluate(() => document.querySelectorAll('*').length);
  expect(elementCount).toBeLessThan(5000);
  await expect(
    page.getByRole('list', { name: 'Dữ liệu đo trong khoảng đã chọn' }),
  ).toHaveCount(0);
});

test.describe('màn hình hẹp', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('chỉ render danh sách thẻ, không render bảng', async ({ page }) => {
    await mockApi(page);
    await page.goto('/app/history');

    await expect(
      page.getByRole('list', { name: 'Dữ liệu đo trong khoảng đã chọn' }),
    ).toBeVisible();
    await expect(page.locator('table.data-table')).toHaveCount(0);
  });
});
