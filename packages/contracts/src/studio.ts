import { z } from 'zod';
import {
  heartRateQualitySchema,
  idSchema,
  incidentStateSchema,
  incidentTypeSchema,
  isoDateTimeSchema,
} from './core';

/**
 * Studio workspace views — hợp đồng wave 2 be-studio.
 * Vòng đời: draft (sửa theo baseRevision) → preview (chỉ đọc, không ghi) → publish
 * (compare-and-set trên baseRevision + digest) → rollback (tạo publication mới).
 * Digest dùng `canonicalize` + sha256 ở phía API (contracts không phụ thuộc node:crypto
 * để web dùng được); `canonicalize` sort key đệ quy nên digest không phụ thuộc thứ tự key
 * client gửi, nhưng thứ tự widget trong mảng vẫn có nghĩa (thứ tự layout).
 */

export const widgetTypeSchema = z.enum(['metric', 'chart', 'alerts', 'summary', 'tasks']);
export type WidgetType = z.infer<typeof widgetTypeSchema>;

export const studioWidgetSchema = z
  .object({
    id: z.string().min(1).max(40).regex(/^[a-z0-9-]+$/, 'id widget chỉ gồm a-z, 0-9 và dấu gạch ngang'),
    type: widgetTypeSchema,
    title: z.string().min(1).max(80),
    span: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    options: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type StudioWidget = z.infer<typeof studioWidgetSchema>;

export const viewConfigSchema = z
  .object({
    version: z.literal(1),
    layout: z.enum(['stack', 'grid']),
    widgets: z.array(studioWidgetSchema).min(1).max(12),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.widgets.forEach((widget, index) => {
      if (seen.has(widget.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['widgets', index, 'id'],
          message: `Trùng id widget '${widget.id}'.`,
        });
      }
      seen.add(widget.id);
    });
  });
export type ViewConfig = z.infer<typeof viewConfigSchema>;

export const viewScopeSchema = z.enum(['user', 'subject', 'global']);
export type ViewScope = z.infer<typeof viewScopeSchema>;
export const viewStatusSchema = z.enum(['draft', 'published', 'archived']);
export type ViewStatus = z.infer<typeof viewStatusSchema>;
export const publicationStatusSchema = z.enum(['active', 'superseded', 'rolled_back']);
export type PublicationStatus = z.infer<typeof publicationStatusSchema>;

export const viewKeySchema = z.string().regex(/^[a-z0-9-]{2,40}$/);

export const createViewSchema = z
  .object({
    key: viewKeySchema,
    name: z.string().trim().min(1).max(120),
    scope: viewScopeSchema,
    subjectId: idSchema.optional(),
    config: viewConfigSchema,
  })
  .strict()
  .refine((value) => value.scope !== 'subject' || value.subjectId !== undefined, {
    message: 'Scope subject bắt buộc có subjectId.',
    path: ['subjectId'],
  })
  .refine((value) => value.scope === 'subject' || value.subjectId === undefined, {
    message: 'Chỉ scope subject mới nhận subjectId.',
    path: ['subjectId'],
  });
export type CreateViewInput = z.infer<typeof createViewSchema>;

export const updateDraftSchema = z
  .object({
    config: viewConfigSchema,
    baseRevision: z.number().int().min(0),
  })
  .strict();
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;

export const previewRequestSchema = z
  .object({
    draftRevision: z.number().int().min(1),
    previewSubjectId: idSchema.optional(),
  })
  .strict();
export type PreviewRequestInput = z.infer<typeof previewRequestSchema>;

export const publishViewSchema = z
  .object({
    draftRevision: z.number().int().min(1),
    digest: z.string().min(16).max(128),
    baseRevision: z.number().int().min(0),
    note: z.string().max(300).optional(),
  })
  .strict();
export type PublishViewInput = z.infer<typeof publishViewSchema>;

export const rollbackViewSchema = z
  .object({
    publicationId: idSchema,
    note: z.string().max(300).optional(),
  })
  .strict();
export type RollbackViewInput = z.infer<typeof rollbackViewSchema>;

/** Query của GET /workspace-views/:id/data; bỏ trống thì dùng subjectId của view (scope subject). */
export const viewDataQuerySchema = z.object({ subjectId: idSchema.optional() }).strict();
export type ViewDataQuery = z.infer<typeof viewDataQuerySchema>;

const userRefSchema = z
  .object({
    id: idSchema,
    displayName: z.string().min(1),
  })
  .strict();
export type UserRef = z.infer<typeof userRefSchema>;

export const publicationSummarySchema = z
  .object({
    id: idSchema,
    viewId: idSchema,
    revision: z.number().int().positive(),
    digest: z.string().min(1),
    status: publicationStatusSchema,
    publishedAt: isoDateTimeSchema,
    note: z.string().nullable(),
    approvedBy: userRefSchema,
    publishedBy: userRefSchema,
  })
  .strict();
export type PublicationSummary = z.infer<typeof publicationSummarySchema>;

export const viewSummarySchema = z
  .object({
    id: idSchema,
    key: viewKeySchema,
    name: z.string().min(1).max(120),
    scope: viewScopeSchema,
    ownerUserId: idSchema,
    subjectId: idSchema.nullable(),
    status: viewStatusSchema,
    draftRevision: z.number().int().min(0),
    draftDigest: z.string().nullable(),
    baseRevision: z.number().int().min(0),
    currentPublication: publicationSummarySchema.nullable(),
    updatedAt: isoDateTimeSchema,
    createdAt: isoDateTimeSchema,
  })
  .strict();
export type ViewSummary = z.infer<typeof viewSummarySchema>;

export const viewListSchema = z.object({ items: z.array(viewSummarySchema) });
export type ViewList = z.infer<typeof viewListSchema>;
export const publicationListSchema = z.object({ items: z.array(publicationSummarySchema) });
export type PublicationList = z.infer<typeof publicationListSchema>;

// ---------------------------------------------------------------------------
// Dữ liệu render cho preview/data endpoint — chỉ gồm trường cần render.
// ---------------------------------------------------------------------------

const studioDeviceSchema = z
  .object({
    id: idSchema,
    label: z.string().min(1),
    serial: z.string().min(1),
    online: z.boolean(),
    freshness: z.enum(['live', 'stale', 'offline', 'never']),
    lastSeenAt: isoDateTimeSchema.nullable(),
    batteryPercent: z.number().int().min(0).max(100).nullable(),
  })
  .strict();
export type StudioDevice = z.infer<typeof studioDeviceSchema>;

const studioPointSchema = z
  .object({
    measuredAt: isoDateTimeSchema,
    heartRateBpm: z.number().nullable(),
    quality: heartRateQualitySchema,
  })
  .strict();
export type StudioPoint = z.infer<typeof studioPointSchema>;

const studioAlertSchema = z
  .object({
    id: idSchema,
    type: incidentTypeSchema,
    state: incidentStateSchema,
    detectedAt: isoDateTimeSchema,
  })
  .strict();
export type StudioAlert = z.infer<typeof studioAlertSchema>;

const studioTaskSchema = z
  .object({
    id: idSchema,
    kind: z.string().min(1),
    title: z.string().min(1),
    status: z.enum(['open', 'in_progress', 'done', 'cancelled']),
    dueAt: isoDateTimeSchema.nullable(),
  })
  .strict();
export type StudioTask = z.infer<typeof studioTaskSchema>;

const studioSummarySchema = z
  .object({
    windowStart: isoDateTimeSchema,
    windowEnd: isoDateTimeSchema,
    heartRateAvg: z.number().nullable(),
    heartRateMin: z.number().nullable(),
    heartRateMax: z.number().nullable(),
    alertsTotal: z.number().int().min(0),
    alertsResolved: z.number().int().min(0),
    lastSeenAt: isoDateTimeSchema.nullable(),
    source: z.string().min(1),
  })
  .strict();
export type StudioSummary = z.infer<typeof studioSummarySchema>;

export const studioDataSchema = z
  .object({
    subject: z
      .object({
        id: idSchema,
        displayName: z.string().min(1),
        timezone: z.string().min(1),
      })
      .strict()
      .nullable(),
    devices: z.array(studioDeviceSchema),
    metrics: z
      .object({
        heartRateBpm: z.number().nullable(),
        quality: heartRateQualitySchema,
        measuredAt: isoDateTimeSchema,
        online: z.boolean(),
        freshness: z.enum(['live', 'stale', 'offline', 'never']),
      })
      .strict()
      .nullable(),
    series: z.array(studioPointSchema),
    alerts: z.array(studioAlertSchema),
    summary: studioSummarySchema.nullable(),
    tasks: z.array(studioTaskSchema),
    sample: z.boolean(),
  })
  .strict();
export type StudioData = z.infer<typeof studioDataSchema>;

export const previewResultSchema = z
  .object({
    digest: z.string().min(1),
    view: viewSummarySchema,
    config: viewConfigSchema,
    draftRevision: z.number().int().min(1),
    dataMode: z.enum(['sample', 'subject']),
    subjectId: idSchema.nullable(),
    data: studioDataSchema,
    warnings: z.array(z.string()),
    checkedAt: isoDateTimeSchema,
  })
  .strict();
export type PreviewResult = z.infer<typeof previewResultSchema>;

/** Kết quả publish/rollback: publication mới + view đã cập nhật. */
export const publishResultSchema = z
  .object({
    publication: publicationSummarySchema,
    view: viewSummarySchema,
  })
  .strict();
export type PublishResult = z.infer<typeof publishResultSchema>;
export const rollbackResultSchema = publishResultSchema;
export type RollbackResult = z.infer<typeof rollbackResultSchema>;

/** Dữ liệu render của GET /workspace-views/:id/data (luôn sample=false). */
export const viewDataSchema = z
  .object({
    view: viewSummarySchema,
    config: viewConfigSchema,
    digest: z.string().min(1),
    data: studioDataSchema,
    checkedAt: isoDateTimeSchema,
  })
  .strict();
export type ViewData = z.infer<typeof viewDataSchema>;

/**
 * Canonical JSON cho digest: sort key đệ quy, giữ thứ tự phần tử mảng
 * (thứ tự widget là thứ tự layout, có nghĩa).
 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function canonicalConfigJson(config: ViewConfig): string {
  return JSON.stringify(canonicalize(config));
}
