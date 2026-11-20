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

/** Cảnh báo mẫu hợp đồng @heart-iot/contracts/incidents. */
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

// ---------------------------------------------------------------------------
// v8 — lịch nhắc chăm sóc + phiếu đi khám (hợp đồng reminders/reports)
// ---------------------------------------------------------------------------

/** Lịch nhắc mẫu đúng `reminderSchema`; mọi ngày trong tuần, bắt đầu trước hôm nay. */
export const REMINDER = {
  id: 'a1a1a1a1-1111-4111-8111-111111111111',
  subjectId: SUBJECT.id,
  kind: 'medication' as const,
  title: 'Uống thuốc huyết áp',
  note: 'Thuốc do gia đình tự đặt, không phải chỉ định của hệ thống',
  times: ['08:00'],
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  startsOn: '2026-11-01',
  endsOn: null,
  active: true,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

export const ACTIVITY_REMINDER = {
  ...REMINDER,
  id: 'a2a2a2a2-2222-4222-8222-222222222222',
  kind: 'activity' as const,
  title: 'Đi bộ nhẹ buổi chiều',
  note: null,
  times: ['16:00'],
  weekdays: [1, 2, 3, 4, 5],
};

/** Tổng hợp tuân thủ 7 ngày mẫu — hai lịch, đủ done/skipped/pending. */
export const CARE_ADHERENCE_7 = {
  subjectId: SUBJECT.id,
  timezone: 'Asia/Ho_Chi_Minh',
  from: '2026-11-13',
  to: '2026-11-19',
  days: 7,
  totals: {
    scheduled: 12,
    done: 8,
    skipped: 1,
    pending: 3,
    recordedPercent: 75,
    completionPercent: 89,
  },
  series: [
    { date: '2026-11-13', scheduled: 2, done: 2, skipped: 0, pending: 0 },
    { date: '2026-11-14', scheduled: 1, done: 1, skipped: 0, pending: 0 },
    { date: '2026-11-15', scheduled: 1, done: 1, skipped: 0, pending: 0 },
    { date: '2026-11-16', scheduled: 2, done: 1, skipped: 1, pending: 0 },
    { date: '2026-11-17', scheduled: 2, done: 2, skipped: 0, pending: 0 },
    { date: '2026-11-18', scheduled: 2, done: 1, skipped: 0, pending: 1 },
    { date: '2026-11-19', scheduled: 2, done: 0, skipped: 0, pending: 2 },
  ],
  reminders: [
    {
      reminderId: REMINDER.id,
      title: REMINDER.title,
      kind: 'medication' as const,
      active: true,
      archived: false,
      scheduled: 7,
      done: 5,
      skipped: 1,
      pending: 1,
      recordedPercent: 86,
      completionPercent: 83,
    },
    {
      reminderId: ACTIVITY_REMINDER.id,
      title: ACTIVITY_REMINDER.title,
      kind: 'activity' as const,
      active: true,
      archived: false,
      scheduled: 5,
      done: 3,
      skipped: 0,
      pending: 2,
      recordedPercent: 60,
      completionPercent: 100,
    },
  ],
};

/** Tổng hợp 30 ngày cho test đổi range; chuỗi đúng 30 ngày cũ → mới. */
export function careAdherenceForDays(days: 7 | 30) {
  if (days === 7) return CARE_ADHERENCE_7;
  const end = Date.UTC(2026, 10, 19);
  const series = Array.from({ length: days }, (_, index) => {
    const date = new Date(end - (days - 1 - index) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const skipped = index % 10 === 0 ? 1 : 0;
    return {
      date,
      scheduled: 2,
      done: 1,
      skipped,
      pending: 1 - skipped,
    };
  });
  const totals = series.reduce(
    (sum, day) => ({
      scheduled: sum.scheduled + day.scheduled,
      done: sum.done + day.done,
      skipped: sum.skipped + day.skipped,
      pending: sum.pending + day.pending,
    }),
    { scheduled: 0, done: 0, skipped: 0, pending: 0 },
  );
  const recorded = totals.done + totals.skipped;
  return {
    subjectId: SUBJECT.id,
    timezone: 'Asia/Ho_Chi_Minh',
    from: series[0]!.date,
    to: series[series.length - 1]!.date,
    days,
    totals: {
      ...totals,
      recordedPercent: Math.round((100 * recorded) / totals.scheduled),
      completionPercent: Math.round((100 * totals.done) / recorded),
    },
    series,
    reminders: [
      {
        reminderId: REMINDER.id,
        title: REMINDER.title,
        kind: 'medication' as const,
        active: true,
        archived: false,
        ...totals,
        recordedPercent: Math.round((100 * recorded) / totals.scheduled),
        completionPercent: Math.round((100 * totals.done) / recorded),
      },
    ],
  };
}

/** GET /subjects/:id/reminders/today — hai occurrence còn chưa đánh dấu. */
export const REMINDER_DAY = {
  date: '2026-11-19',
  timezone: 'Asia/Ho_Chi_Minh',
  items: [
    { reminder: REMINDER, time: '08:00', status: 'pending' as const, completion: null },
    {
      reminder: ACTIVITY_REMINDER,
      time: '16:00',
      status: 'pending' as const,
      completion: null,
    },
  ],
};

/** Kết quả đánh dấu mẫu — dùng cho handler mặc định của completion. */
export function reminderCompletionResult(
  reminderId: string,
  time = '08:00',
  date = '2026-11-19',
  status: 'done' | 'skipped' = 'done',
) {
  return {
    reminderId,
    date,
    time,
    status,
    completedAt: '2026-11-19T01:00:00.000Z',
    completedBy: { userId: USER.id, displayName: USER.displayName },
  };
}

/** Phiếu đi khám mẫu đúng `visitReportSchema` (dữ liệu tổng hợp, simulated). */
export const VISIT_REPORT = {
  subject: {
    id: SUBJECT.id,
    displayName: SUBJECT.displayName,
    timezone: SUBJECT.timezone,
  },
  period: { from: '2026-10-21', to: '2026-11-19', days: 30 },
  generatedAt: '2026-11-19T05:01:32.789Z',
  summary: {
    measurementCount: 1681,
    daysWithData: 7,
    coveragePercent: 23.3,
    heartRate: { avg: 68.3, min: 59, max: 77 },
    steps: { total: 5056, avgPerDay: 168.5 },
    gaps: [
      {
        from: '2026-10-20T17:00:00.000Z',
        to: '2026-11-13T05:01:07.930Z',
        hours: 564,
      },
    ],
  },
  incidents: {
    total: 3,
    falls: 3,
    sos: 0,
    open: 1,
    items: [
      {
        id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        type: 'fall' as const,
        state: 'open' as const,
        detectedAt: '2026-11-19T04:36:07.930Z',
      },
      {
        id: 'f2222222-2222-4222-8222-222222222222',
        type: 'fall' as const,
        state: 'resolved' as const,
        detectedAt: '2026-11-17T05:01:07.930Z',
      },
    ],
  },
  attentionPoints: [
    {
      date: '2026-11-19',
      label: 'Sự kiện ngã',
      detail: 'Ghi nhận 3 lần ngã trong kỳ; lần gần nhất ngày 19/11/2026.',
    },
    {
      date: '2026-10-21',
      label: 'Khoảng thiếu dữ liệu dài nhất',
      detail: 'Thiếu mẫu đo 564 giờ, từ 2026-10-21 00:00 đến 2026-11-13 12:01.',
    },
    {
      date: '2026-11-14',
      label: 'Nhịp tim thấp nhất theo ngày',
      detail: 'Ngày 14/11/2026 ghi nhận nhịp tim thấp nhất 59 bpm trong các mẫu hợp lệ.',
    },
  ],
  simulated: true,
  disclaimer:
    'Phiếu chỉ tổng hợp số liệu tham khảo từ dữ liệu thiết bị, không thay thế việc khám hoặc chẩn đoán của bác sĩ.',
};

export interface CareApiOptions {
  reminders?: unknown;
  day?: unknown;
  adherence?: unknown;
  report?: unknown;
  /** Ghi đè phản hồi khi tạo lịch nhắc (mặc định trả REMINDER). */
  onCreate?: (init?: RequestInit) => Response | Promise<Response>;
  /** Ghi đè phản hồi khi sửa/xoá/đánh dấu. */
  onUpdate?: (init?: RequestInit) => Response | Promise<Response>;
  /** Ghi đè phản hồi tổng hợp tuân thủ (V9.1); mặc định trả fixture 7/30 ngày. */
  onAdherence?: (url: string, init?: RequestInit) => Response | Promise<Response>;
  onDelete?: (init?: RequestInit) => Response | Promise<Response>;
  onCompletion?: (url: string, init?: RequestInit) => Response | Promise<Response>;
}

/**
 * Handler mẫu cho 3 nhóm API của v8, không thay đổi hành vi handler cũ:
 * danh sách nhắc, occurrence hôm nay, completion và phiếu đi khám.
 * `onCreate`/`onCompletion`... cho phép test ghi lại body hoặc trả lỗi 422/500.
 */
export function careApiHandler(options: CareApiOptions = {}): FetchHandler {
  return (url, init) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    if (u.includes('/care/adherence')) {
      if (options.onAdherence) return options.onAdherence(u, init);
      const days = new URL(u, 'http://localhost').searchParams.get('days') === '30' ? 30 : 7;
      return mockResponse(options.adherence ?? careAdherenceForDays(days));
    }
    if (u.includes('/visit-report')) {
      return mockResponse(options.report ?? VISIT_REPORT);
    }
    if (u.includes('/completions')) {
      if (options.onCompletion) return options.onCompletion(u, init);
      if (method === 'DELETE') return mockResponse(undefined, 204);
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        date?: string;
        time?: string;
        status?: 'done' | 'skipped';
      };
      const match = /\/reminders\/([^/]+)\/completions/.exec(u);
      return mockResponse(
        reminderCompletionResult(
          match?.[1] ?? REMINDER.id,
          body.time ?? '08:00',
          body.date ?? REMINDER_DAY.date,
          body.status ?? 'done',
        ),
      );
    }
    if (u.endsWith('/reminders/today')) {
      return mockResponse(options.day ?? REMINDER_DAY);
    }
    if (u.endsWith('/reminders') && method === 'GET') {
      return mockResponse(options.reminders ?? { items: [REMINDER, ACTIVITY_REMINDER] });
    }
    if (u.endsWith('/reminders') && method === 'POST') {
      if (options.onCreate) return options.onCreate(init);
      return mockResponse(REMINDER, 201);
    }
    if (u.includes('/reminders/') && (method === 'PATCH' || method === 'DELETE')) {
      if (method === 'PATCH' && options.onUpdate) return options.onUpdate(init);
      if (method === 'DELETE') {
        if (options.onDelete) return options.onDelete(init);
        return mockResponse(undefined, 204);
      }
      return mockResponse(REMINDER);
    }
    return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
  };
}
