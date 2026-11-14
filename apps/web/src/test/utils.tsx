import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { appRoutes } from '../app/router';

export const USER = {
  id: '0f1d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b',
  email: 'con@example.com',
  displayName: 'Ngọc',
  role: 'user',
  status: 'active',
  createdAt: '2026-11-14T09:00:00.000Z',
};

export const SESSION = {
  user: USER,
  sessionExpiresAt: '2026-11-21T09:00:00.000Z',
};

export const SUBJECT = {
  id: '1f2d3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b',
  ownerUserId: '0f1d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b',
  displayName: 'Bà Năm',
  role: 'owner',
  timezone: 'Asia/Ho_Chi_Minh',
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

/** Cảnh báo mẫu hợp đồng @annhien/contracts/incidents. */
export const INCIDENT = {
  id: '2f3d4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b',
  subjectId: '1f2d3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b',
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

/** Trạng thái thiết bị mẫu hợp đồng measurements.subjectStatusResponseSchema. */
export const SUBJECT_STATUS = {
  devices: [
    {
      deviceId: '3f4d5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b',
      subjectId: '1f2d3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b',
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
    digest: 'demo-digest',
  },
  asOf: '2026-11-14T09:00:00.000Z',
};

/** Response giả cho api client — tránh phụ thuộc undici/jsdom Response. */
export function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  } as unknown as Response;
}

export function errorEnvelope(message: string, code = 'INTERNAL', requestId = 'test-req-1') {
  return { code, message, requestId };
}

export function me401Response() {
  return mockResponse(errorEnvelope('Chưa đăng nhập.', 'UNAUTHENTICATED'), 401);
}

export type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** Stub global fetch, trả về mock để kiểm tra số lần gọi và URL. */
export function stubFetch(handler: FetchHandler) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

/** Render toàn bộ ứng dụng với memory router (không cần server thật). */
export function renderApp(path: string, handler: FetchHandler) {
  const fetchMock = stubFetch(handler);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, fetchMock, queryClient, router };
}

/** Render một màn hình đơn lẻ với query client riêng (không qua AppShell). */
export function renderPage(ui: ReactElement, handler?: FetchHandler) {
  if (handler) stubFetch(handler);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}
