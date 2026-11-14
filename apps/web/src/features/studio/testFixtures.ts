import type { PreviewResult, PublicationSummary, StudioData, ViewConfig, ViewSummary } from '@annhien/contracts/studio';
import { errorEnvelope, mockResponse, SUBJECT, USER } from '../../test/utils';

/**
 * Fixture dùng chung cho test studio — dữ liệu khớp hợp đồng @annhien/contracts/studio.
 * Id cố định dạng uuid (idSchema = z.uuid()).
 */
export const STUDIO_VIEW_ID = '11111111-2222-4333-8444-555555555555';
export const PUB_1_ID = '66666666-7777-4888-8999-000000000001';
export const PUB_2_ID = '66666666-7777-4888-8999-000000000002';
export const SAMPLE_DEVICE_ID = '00000000-0000-4000-8000-000000000001';
export const SAMPLE_ALERT_ID = '00000000-0000-4000-8000-000000000002';
export const SAMPLE_TASK_ID = '00000000-0000-4000-8000-000000000003';

export const BASE_CONFIG: ViewConfig = {
  version: 1,
  layout: 'stack',
  widgets: [{ id: 'hr', type: 'metric', title: 'Nhịp tim', span: 1 }],
};

export function makeViewSummary(overrides: Partial<ViewSummary> = {}): ViewSummary {
  return {
    id: STUDIO_VIEW_ID,
    key: 'to-quan-hang-ngay',
    name: 'Tổng quan hằng ngày',
    scope: 'subject',
    ownerUserId: USER.id,
    subjectId: SUBJECT.id,
    status: 'draft',
    draftRevision: 3,
    draftDigest: 'digest-r3-aaaa',
    baseRevision: 1,
    currentPublication: null,
    updatedAt: '2026-11-14T10:00:00.000Z',
    createdAt: '2026-11-10T08:00:00.000Z',
    ...overrides,
  };
}

export const SAMPLE_DATA: StudioData = {
  subject: null,
  devices: [
    {
      id: SAMPLE_DEVICE_ID,
      label: 'Thiết bị mẫu (mô phỏng)',
      serial: 'SAMPLE-0001',
      online: true,
      freshness: 'live',
      lastSeenAt: '2026-11-14T09:00:00.000Z',
      batteryPercent: 85,
    },
  ],
  metrics: {
    heartRateBpm: 82,
    quality: 'valid',
    measuredAt: '2026-11-14T09:00:00.000Z',
    online: true,
    freshness: 'live',
  },
  series: [
    { measuredAt: '2026-11-14T08:00:00.000Z', heartRateBpm: 72, quality: 'valid' },
    { measuredAt: '2026-11-14T09:00:00.000Z', heartRateBpm: 82, quality: 'valid' },
  ],
  alerts: [
    {
      id: SAMPLE_ALERT_ID,
      type: 'fall',
      state: 'open',
      detectedAt: '2026-11-14T08:30:00.000Z',
    },
  ],
  summary: {
    windowStart: '2026-11-13T09:00:00.000Z',
    windowEnd: '2026-11-14T09:00:00.000Z',
    heartRateAvg: 76.5,
    heartRateMin: 70,
    heartRateMax: 90,
    alertsTotal: 2,
    alertsResolved: 1,
    lastSeenAt: '2026-11-14T09:00:00.000Z',
    source: 'synthetic',
  },
  tasks: [
    {
      id: SAMPLE_TASK_ID,
      kind: 'maintenance',
      title: 'Kiểm tra thiết bị',
      status: 'open',
      dueAt: null,
    },
  ],
  sample: true,
};

export const SUBJECT_DATA: StudioData = {
  ...SAMPLE_DATA,
  subject: {
    id: SUBJECT.id,
    displayName: SUBJECT.displayName,
    timezone: SUBJECT.timezone,
  },
  sample: false,
};

export function makePreview(overrides: Partial<PreviewResult> = {}): PreviewResult {
  return {
    digest: 'digest-r3-aaaa',
    view: makeViewSummary(),
    config: BASE_CONFIG,
    draftRevision: 3,
    dataMode: 'sample',
    subjectId: null,
    data: SAMPLE_DATA,
    warnings: [],
    checkedAt: '2026-11-14T10:00:00.000Z',
    ...overrides,
  };
}

export function makePublication(overrides: Partial<PublicationSummary> = {}): PublicationSummary {
  return {
    id: PUB_1_ID,
    viewId: STUDIO_VIEW_ID,
    revision: 1,
    digest: 'digest-r1-bbbb',
    status: 'superseded',
    publishedAt: '2026-11-13T08:00:00.000Z',
    note: null,
    approvedBy: { id: USER.id, displayName: USER.displayName },
    publishedBy: { id: USER.id, displayName: USER.displayName },
    ...overrides,
  };
}

export interface StudioState {
  view: ViewSummary;
  draftConfig: ViewConfig;
  draftDigest: string;
  publications: PublicationSummary[];
  calls: {
    drafts: unknown[];
    publishes: unknown[];
    rollbacks: unknown[];
    previews: unknown[];
  };
}

export function createStudioState(): StudioState {
  return {
    view: makeViewSummary(),
    draftConfig: BASE_CONFIG,
    draftDigest: 'digest-r3-aaaa',
    publications: [],
    calls: { drafts: [], publishes: [], rollbacks: [], previews: [] },
  };
}

export interface StudioHandlerOptions {
  publishError?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Fetch handler mô phỏng API studio cho trang chi tiết — có trạng thái:
 * PUT draft cập nhật config/draftRevision; preview trả config hiện tại;
 * publish/rollback ghi lại body để kiểm chứng.
 */
export function studioDetailHandler(state: StudioState, options: StudioHandlerOptions = {}) {
  return (url: string, init?: RequestInit): Response => {
    const u = url;
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;

    if (u.endsWith('/me')) return mockResponse({ user: USER });
    if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });

    if (u.endsWith(`/workspace-views/${STUDIO_VIEW_ID}/previews`) && method === 'POST') {
      const previewRequest = body as { draftRevision: number; previewSubjectId?: string };
      state.calls.previews.push(previewRequest);
      const isSubject = previewRequest.previewSubjectId === SUBJECT.id;
      return mockResponse({
        digest: state.draftDigest,
        view: state.view,
        config: state.draftConfig,
        draftRevision: state.view.draftRevision,
        dataMode: isSubject ? 'subject' : 'sample',
        subjectId: previewRequest.previewSubjectId ?? null,
        data: isSubject ? SUBJECT_DATA : SAMPLE_DATA,
        warnings: isSubject ? [] : ['Dữ liệu mẫu có nhãn — không phải dữ liệu đo từ thiết bị.'],
        checkedAt: '2026-11-14T10:00:00.000Z',
      });
    }

    if (u.endsWith(`/workspace-views/${STUDIO_VIEW_ID}/draft`) && method === 'PUT') {
      const draftInput = body as { config: ViewConfig; baseRevision: number };
      state.calls.drafts.push(draftInput);
      const nextRevision = state.view.draftRevision + 1;
      state.draftConfig = draftInput.config;
      state.view = {
        ...state.view,
        draftRevision: nextRevision,
        draftDigest: `digest-r${nextRevision}-cccc`,
        updatedAt: '2026-11-14T11:00:00.000Z',
      };
      return mockResponse(state.view);
    }

    if (u.endsWith(`/workspace-views/${STUDIO_VIEW_ID}/publications`) && method === 'POST') {
      const publishInput = body as { draftRevision: number; digest: string; baseRevision: number; note?: string };
      state.calls.publishes.push(publishInput);
      if (options.publishError) {
        return mockResponse(
          {
            code: options.publishError.code,
            message: options.publishError.message,
            requestId: 'test-req-stale',
            ...(options.publishError.details ? { details: options.publishError.details } : {}),
          },
          409,
        );
      }
      const revision = Math.max(...state.publications.map((item) => item.revision), 0) + 1;
      const publication = makePublication({
        id: `66666666-7777-4888-8999-${String(revision).padStart(12, '0')}`,
        revision,
        digest: publishInput.digest,
        status: 'active',
        publishedAt: '2026-11-14T12:00:00.000Z',
        note: publishInput.note ?? null,
      });
      state.publications = [
        publication,
        ...state.publications.map((item) => (item.status === 'active' ? { ...item, status: 'superseded' as const } : item)),
      ];
      state.view = {
        ...state.view,
        status: 'published',
        baseRevision: revision,
        currentPublication: publication,
        updatedAt: '2026-11-14T12:00:00.000Z',
      };
      return mockResponse({ publication, view: state.view });
    }

    if (u.endsWith(`/workspace-views/${STUDIO_VIEW_ID}/rollback`) && method === 'POST') {
      const rollbackInput = body as { publicationId: string };
      state.calls.rollbacks.push(rollbackInput);
      const revision = Math.max(...state.publications.map((item) => item.revision), 0) + 1;
      const publication = makePublication({
        id: `66666666-7777-4888-8999-${String(revision).padStart(12, '0')}`,
        revision,
        digest: `digest-r${revision}-dddd`,
        status: 'active',
        publishedAt: '2026-11-14T13:00:00.000Z',
      });
      state.publications = [
        publication,
        ...state.publications.map((item) => (item.status === 'active' ? { ...item, status: 'superseded' as const } : item)),
      ];
      state.view = {
        ...state.view,
        baseRevision: revision,
        currentPublication: publication,
        updatedAt: '2026-11-14T13:00:00.000Z',
      };
      return mockResponse({ publication, view: state.view });
    }

    if (u.endsWith(`/workspace-views/${STUDIO_VIEW_ID}/publications`) && method === 'GET') {
      return mockResponse({ items: state.publications });
    }

    if (u.endsWith(`/workspace-views/${STUDIO_VIEW_ID}`)) {
      return mockResponse(state.view);
    }

    return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
  };
}
