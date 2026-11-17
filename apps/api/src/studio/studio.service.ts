import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  max,
  sql,
} from 'drizzle-orm';
import { z } from 'zod';
import {
  INCIDENT_OPEN_STATES,
  hasCarePermission,
  isSyntheticDataSource,
  type UserSummary,
} from '@heart-iot/contracts';
import {
  canonicalConfigJson,
  type CreateViewInput,
  type PreviewRequestInput,
  type PreviewResult,
  type PublicationList,
  type PublicationSummary,
  type PublishResult,
  type PublishViewInput,
  type RollbackResult,
  type RollbackViewInput,
  type StudioData,
  type StudioSummary,
  type UpdateDraftInput,
  type ViewConfig,
  type ViewData,
  type ViewDataQuery,
  type ViewList,
  type ViewSummary,
  type WidgetType,
} from '@heart-iot/contracts/studio';
import { DB, type AppDb } from '../database/database';
import {
  deviceAssignments,
  devices,
  incidents,
  maintenanceTasks,
  telemetry,
  users,
  viewPublications,
  workspaceViews,
  type WorkspaceViewRow,
} from '../database/schema';
import { AccessService } from '../access/access.service';
import { AuditService } from '../access/audit.service';
import { AppError } from '../common/app-error';
import { sha256 } from '../auth/password';
import { PolicyService } from '../policy/policy.service';
import { computeDeviceStatus } from '../devices/device-status';
import { isUniqueViolation } from '../database/errors';

/**
 * Studio — workspace views draft → preview → publish → rollback (wave 2 be-studio).
 * - Digest = sha256(canonicalConfigJson) — một hàm duy nhất cho create/draft/preview/publish.
 * - Preview/data chỉ đọc DB qua query trực tiếp, không gọi endpoint nội bộ, không ghi
 *   incident/notification/task/telemetry/view; ghi duy nhất là audit `workspace_view.preview`.
 * - Publish là compare-and-set (draftRevision + digest + baseRevision) trong transaction
 *   với `FOR UPDATE`; hai publish đồng thời: một thành công, một 409 APPROVAL_STALE.
 * - Quyền theo hồ sơ qua AccessService; không dùng role toàn cục thay kiểm quyền hồ sơ
 *   (admin chỉ có quyền trên scope global, không mặc định xem view subject).
 * - Dữ liệu telemetry cho preview/data chỉ gồm mẫu đã đồng bộ giờ
 *   (`clock_status='synced'`), không bị cách ly (`is_quarantined=false`) và có
 *   `measured_at <= now`; mẫu bị loại không vào series/metric/summary/lastSeenAt.
 */

const PREVIEW_WINDOW_MS = 24 * 3600 * 1000;
const SERIES_LIMIT = 30;
const ALERTS_LIMIT = 10;
const TASKS_LIMIT = 10;

type ViewAccessKind = 'owner' | 'admin' | 'caregiver' | 'user' | 'none';
type PublicationRow = typeof viewPublications.$inferSelect;

/** Option được hỗ trợ theo từng widget type; khóa lạ chỉ cảnh báo, khóa đúng mà giá trị sai thì chặn (422). */
const WIDGET_OPTION_SPECS: Record<WidgetType, Record<string, z.ZodType>> = {
  metric: {
    field: z.enum(['heartRateBpm', 'batteryPercent']),
    refreshSeconds: z.number().int().min(5).max(3600),
  },
  chart: { points: z.number().int().min(1).max(30) },
  alerts: { limit: z.number().int().min(1).max(20), includeResolved: z.boolean() },
  summary: {},
  tasks: { limit: z.number().int().min(1).max(20) },
};

function approvalStale(message: string, details?: unknown): AppError {
  return new AppError('APPROVAL_STALE', message, 409, details);
}

const SAMPLE_DEVICE_ID = '00000000-0000-4000-8000-000000000001';
const SAMPLE_ALERT_ID = '00000000-0000-4000-8000-000000000002';
const SAMPLE_TASK_ID = '00000000-0000-4000-8000-000000000003';

@Injectable()
export class StudioService {
  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly policy: PolicyService,
  ) {}

  // ---------------------------------------------------------------------------
  // Digest
  // ---------------------------------------------------------------------------

  private computeDigest(config: ViewConfig): string {
    return sha256(canonicalConfigJson(config));
  }

  private validateWidgetOptions(config: ViewConfig): { warnings: string[]; errors: string[] } {
    const warnings: string[] = [];
    const errors: string[] = [];
    for (const widget of config.widgets) {
      const specs = WIDGET_OPTION_SPECS[widget.type];
      for (const [key, value] of Object.entries(widget.options ?? {})) {
        const spec = specs[key];
        if (!spec) {
          warnings.push(`Widget '${widget.id}': option '${key}' chưa được hỗ trợ, sẽ bỏ qua.`);
          continue;
        }
        if (!spec.safeParse(value).success) {
          errors.push(`Widget '${widget.id}': option '${key}' không hợp lệ.`);
        }
      }
    }
    return { warnings, errors };
  }

  // ---------------------------------------------------------------------------
  // Quyền xem/sửa
  // ---------------------------------------------------------------------------

  private async getViewOr404(id: string): Promise<WorkspaceViewRow> {
    const rows = await this.db
      .select()
      .from(workspaceViews)
      .where(eq(workspaceViews.id, id))
      .limit(1);
    const view = rows[0];
    if (!view) throw AppError.notFound('Không tìm thấy view hoặc bạn không có quyền truy cập.');
    return view;
  }

  private async resolveAccess(user: UserSummary, view: WorkspaceViewRow): Promise<ViewAccessKind> {
    if (view.ownerUserId === user.id) return 'owner';
    if (view.scope === 'subject' && view.subjectId) {
      const subjectAccess = await this.access.resolve(user.id, view.subjectId);
      if (!subjectAccess) return 'none';
      return subjectAccess.role === 'owner' ? 'owner' : 'caregiver';
    }
    if (view.scope === 'global') return user.role === 'admin' ? 'admin' : 'user';
    return 'none';
  }

  /** Chủ view (scope subject: chủ hồ sơ) hoặc admin với view global. */
  private canManage(user: UserSummary, view: WorkspaceViewRow, kind: ViewAccessKind): boolean {
    return kind === 'owner' || (view.scope === 'global' && user.role === 'admin');
  }

  // ---------------------------------------------------------------------------
  // Tổng hợp response
  // ---------------------------------------------------------------------------

  private async activePublication(viewId: string): Promise<PublicationRow | null> {
    const rows = await this.db
      .select()
      .from(viewPublications)
      .where(and(eq(viewPublications.viewId, viewId), eq(viewPublications.status, 'active')))
      .limit(1);
    return rows[0] ?? null;
  }

  private async toPublicationSummary(publication: PublicationRow): Promise<PublicationSummary> {
    const userRows = await this.db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, [publication.approvedByUserId, publication.publishedByUserId]));
    const nameById = new Map(userRows.map((row) => [row.id, row.displayName]));
    return {
      id: publication.id,
      viewId: publication.viewId,
      revision: publication.revision,
      digest: publication.digest,
      status: publication.status,
      publishedAt: publication.publishedAt.toISOString(),
      note: publication.note,
      approvedBy: {
        id: publication.approvedByUserId,
        displayName: nameById.get(publication.approvedByUserId) ?? '',
      },
      publishedBy: {
        id: publication.publishedByUserId,
        displayName: nameById.get(publication.publishedByUserId) ?? '',
      },
    };
  }

  /**
   * Người không phải editor chỉ thấy publication active: draftRevision/draftDigest
   * được che về baseRevision/null để không lộ bản nháp.
   * `activeOverride` cho phép caller đã đọc publication active dùng đúng bản đó
   * (tránh hai truy vấn lệch nhau khi có publish xen giữa).
   */
  private async buildViewSummary(
    view: WorkspaceViewRow,
    editor: boolean,
    activeOverride?: PublicationRow | null,
  ): Promise<ViewSummary> {
    const active = activeOverride === undefined ? await this.activePublication(view.id) : activeOverride;
    return {
      id: view.id,
      key: view.key,
      name: view.name,
      scope: view.scope,
      ownerUserId: view.ownerUserId,
      subjectId: view.subjectId,
      status: view.status,
      draftRevision: editor ? view.draftRevision : view.baseRevision,
      draftDigest: editor ? view.draftDigest : null,
      baseRevision: view.baseRevision,
      currentPublication: active ? await this.toPublicationSummary(active) : null,
      updatedAt: view.updatedAt.toISOString(),
      createdAt: view.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Dữ liệu render (dùng chung cho preview chế độ subject và GET :id/data)
  // ---------------------------------------------------------------------------

  /**
   * Dữ liệu render dùng chung cho preview và `GET :id/data`.
   * - Mốc dữ liệu lấy từ `AccessService.requireHistory`: caregiver chỉ thấy từ
   *   `sharedFrom` (đã kẹp theo `historyDays`), owner giữ cửa sổ 24h như trước.
   *   Truyền `from = null` vì đây là view mặc định, không phải yêu cầu một khoảng
   *   lịch sử cụ thể — link mới không bị 403 mà chỉ bị cắt cửa sổ.
   * - `windowStart = max(now - 24h, effectiveFrom)`, nên mọi truy vấn dùng
   *   `windowStart` đều đã bị cắt theo mốc chia sẻ. Các truy vấn không dùng
   *   `windowStart` (bản đo gần nhất theo thiết bị) cũng lọc `effectiveFrom`.
   * - Caregiver thiếu `canReceiveAlerts` vẫn xem được widget khác; riêng alerts
   *   và count trả rỗng/0, không 403 toàn view.
   */
  private async renderSubjectData(userId: string, subjectId: string): Promise<StudioData> {
    const { access, effectiveFrom } = await this.access.requireMeasurementsHistory(
      userId,
      subjectId,
      null,
    );
    const subject = access.subject;
    const policy = (await this.policy.getActive()).value;
    const now = new Date();
    const windowStart = new Date(
      Math.max(now.getTime() - PREVIEW_WINDOW_MS, effectiveFrom.getTime()),
    );
    const visibleFrom = access.role === 'owner' ? null : effectiveFrom;
    const canReceiveAlerts =
      access.role === 'owner' || hasCarePermission(access.permissions, 'receive_alerts');

    const assignments = await this.db
      .select()
      .from(deviceAssignments)
      .where(and(eq(deviceAssignments.subjectId, subjectId), isNull(deviceAssignments.endedAt)));
    const assignmentIds = assignments.map((row) => row.id);
    const deviceIds = assignments.map((row) => row.deviceId);

    const deviceRows = deviceIds.length
      ? await this.db.select().from(devices).where(inArray(devices.id, deviceIds))
      : [];

    // 30 điểm gần nhất trong 24h (cho chart), lấy desc rồi lật lại asc.
    // Chỉ mẫu đã đồng bộ giờ, không bị cách ly và không ở tương lai mới được
    // hiển thị/tổng hợp; mẫu cách ly hoặc lệch đồng hồ không được làm sai chart,
    // metric hay "dữ liệu mới nhất" của hồ sơ.
    const latestPoints = assignmentIds.length
      ? await this.db
          .select()
          .from(telemetry)
          .where(
            and(
              inArray(telemetry.assignmentId, assignmentIds),
              eq(telemetry.isQuarantined, false),
              eq(telemetry.clockStatus, 'synced'),
              isNotNull(telemetry.measuredAt),
              gte(telemetry.measuredAt, windowStart),
              lte(telemetry.measuredAt, now),
            ),
          )
          .orderBy(desc(telemetry.measuredAt), desc(telemetry.id))
          .limit(SERIES_LIMIT)
      : [];
    const series = [...latestPoints].reverse();

    // Bản đo gần nhất theo từng thiết bị để tính online/freshness; chỉ xét mẫu
    // đã đồng bộ giờ, không cách ly, đã xảy ra (không lấy mốc tương lai) và không
    // sớm hơn mốc chia sẻ của caregiver.
    const latestByDevice = assignmentIds.length
      ? await this.db
          .selectDistinctOn([telemetry.deviceId])
          .from(telemetry)
          .where(
            and(
              inArray(telemetry.assignmentId, assignmentIds),
              eq(telemetry.isQuarantined, false),
              eq(telemetry.clockStatus, 'synced'),
              isNotNull(telemetry.measuredAt),
              gte(telemetry.measuredAt, effectiveFrom),
              lte(telemetry.measuredAt, now),
            ),
          )
          .orderBy(asc(telemetry.deviceId), desc(telemetry.measuredAt), desc(telemetry.id))
      : [];
    const latestByDeviceId = new Map(latestByDevice.map((row) => [row.deviceId, row]));

    const devicesOut = deviceRows.map((device) => {
      const status = computeDeviceStatus(
        device,
        subjectId,
        policy,
        latestByDeviceId.get(device.id) ?? null,
        now,
        visibleFrom,
      );
      return {
        id: status.deviceId,
        label: status.label,
        serial: status.serial,
        online: status.online,
        freshness: status.freshness,
        lastSeenAt: status.lastSeenAt,
        batteryPercent: status.batteryPercent,
      };
    });

    const latestPoint = latestPoints[0];
    let metrics: StudioData['metrics'] = null;
    if (latestPoint) {
      const device = deviceRows.find((row) => row.id === latestPoint.deviceId);
      const status = device
        ? computeDeviceStatus(device, subjectId, policy, latestPoint)
        : null;
      metrics = {
        heartRateBpm: latestPoint.metrics.heart_rate_bpm,
        quality: latestPoint.quality.heart_rate,
        measuredAt: latestPoint.measuredAt ? latestPoint.measuredAt.toISOString() : now.toISOString(),
        online: status?.online ?? false,
        freshness: status?.freshness ?? 'never',
      };
    }

    // Cảnh báo cũng tính theo `detectedAt` và mốc chia sẻ: không lộ cảnh báo đã
    // xảy ra trước khi caregiver được chia sẻ. Studio không có cờ
    // `startedBeforeShare` trong hợp đồng nên cảnh báo đang mở trước mốc cũng
    // không hiển thị ở đây; trang Cảnh báo giữ trạng thái an toàn đó kèm cờ.
    // Caregiver thiếu `canReceiveAlerts` → không truy vấn, trả rỗng thay vì 403.
    const alertWindow = and(
      eq(incidents.subjectId, subjectId),
      gte(incidents.detectedAt, effectiveFrom),
      lte(incidents.detectedAt, now),
    );
    const alertRows = canReceiveAlerts
      ? await this.db
          .select()
          .from(incidents)
          .where(
            and(
              alertWindow,
              inArray(incidents.state, [...INCIDENT_OPEN_STATES, 'resolved', 'cancelled']),
            ),
          )
          .orderBy(desc(incidents.detectedAt), desc(incidents.id))
          .limit(ALERTS_LIMIT)
      : [];

    const [aggregateRow, alertsTotalRow, alertsResolvedRow, syntheticRow] = await Promise.all([
      assignmentIds.length
        ? this.db
            .select({
              avg: sql<number | null>`avg((${telemetry.metrics}->>'heart_rate_bpm')::float)`,
              min: sql<number | null>`min((${telemetry.metrics}->>'heart_rate_bpm')::float)`,
              max: sql<number | null>`max((${telemetry.metrics}->>'heart_rate_bpm')::float)`,
            })
            .from(telemetry)
            .where(
              and(
                inArray(telemetry.assignmentId, assignmentIds),
                eq(telemetry.isQuarantined, false),
                eq(telemetry.clockStatus, 'synced'),
                isNotNull(telemetry.measuredAt),
                gte(telemetry.measuredAt, windowStart),
                lte(telemetry.measuredAt, now),
                sql`(${telemetry.quality}->>'heart_rate') = 'valid'`,
              ),
            )
        : Promise.resolve([]),
      canReceiveAlerts
        ? this.db.select({ total: count() }).from(incidents).where(alertWindow)
        : Promise.resolve([{ total: 0 }]),
      canReceiveAlerts
        ? this.db
            .select({ resolved: count() })
            .from(incidents)
            .where(and(alertWindow, eq(incidents.state, 'resolved')))
        : Promise.resolve([{ resolved: 0 }]),
      assignmentIds.length
        ? this.db
            .select({ source: telemetry.source })
            .from(telemetry)
            .where(
              and(
                inArray(telemetry.assignmentId, assignmentIds),
                inArray(telemetry.source, ['simulator', 'synthetic']),
                eq(telemetry.isQuarantined, false),
                gte(telemetry.receivedAt, windowStart),
                lte(telemetry.receivedAt, now),
              ),
            )
            .limit(1)
        : Promise.resolve([]),
    ]);

    const aggregate = aggregateRow[0];
    const summary: StudioSummary = {
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
      heartRateAvg: aggregate ? round1(aggregate.avg) : null,
      heartRateMin: aggregate ? round1(aggregate.min) : null,
      heartRateMax: aggregate ? round1(aggregate.max) : null,
      alertsTotal: alertsTotalRow[0]?.total ?? 0,
      alertsResolved: alertsResolvedRow[0]?.resolved ?? 0,
      lastSeenAt: latestPoint?.measuredAt ? latestPoint.measuredAt.toISOString() : null,
      source: syntheticRow.some((row) => isSyntheticDataSource(row.source)) ? 'synthetic' : 'device',
    };

    const taskRows = await this.db
      .select()
      .from(maintenanceTasks)
      .where(eq(maintenanceTasks.subjectId, subjectId))
      .orderBy(desc(maintenanceTasks.createdAt))
      .limit(TASKS_LIMIT);

    return {
      subject: {
        id: subject.id,
        displayName: subject.displayName,
        timezone: subject.timezone,
      },
      devices: devicesOut,
      metrics,
      series: series
        .filter((row) => row.measuredAt !== null)
        .map((row) => ({
          measuredAt: (row.measuredAt as Date).toISOString(),
          heartRateBpm: row.metrics.heart_rate_bpm,
          quality: row.quality.heart_rate,
        })),
      alerts: alertRows.map((row) => ({
        id: row.id,
        type: row.type,
        state: row.state,
        detectedAt: row.detectedAt.toISOString(),
      })),
      summary,
      tasks: taskRows.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        status: row.status,
        dueAt: row.dueAt ? row.dueAt.toISOString() : null,
      })),
      sample: false,
    };
  }

  // ---------------------------------------------------------------------------
  // Nghiệp vụ
  // ---------------------------------------------------------------------------

  async list(user: UserSummary): Promise<ViewList> {
    const owned = await this.db
      .select()
      .from(workspaceViews)
      .where(eq(workspaceViews.ownerUserId, user.id))
      .orderBy(desc(workspaceViews.updatedAt));

    const accessible = await this.access.listAccessibleSubjects(user.id);
    const sharedSubjectIds = accessible
      .filter((item) => item.role === 'caregiver')
      .map((item) => item.subject.id);
    const shared = sharedSubjectIds.length
      ? await this.db
          .select()
          .from(workspaceViews)
          .where(
            and(
              inArray(workspaceViews.subjectId, sharedSubjectIds),
              eq(workspaceViews.status, 'published'),
            ),
          )
      : [];

    const globals = await this.db
      .select()
      .from(workspaceViews)
      .where(and(eq(workspaceViews.scope, 'global'), eq(workspaceViews.status, 'published')));

    const byId = new Map<string, WorkspaceViewRow>();
    for (const view of [...owned, ...shared, ...globals]) {
      if (!byId.has(view.id)) byId.set(view.id, view);
    }

    const items: ViewSummary[] = [];
    for (const view of byId.values()) {
      const editor = view.ownerUserId === user.id || (view.scope === 'global' && user.role === 'admin');
      items.push(await this.buildViewSummary(view, editor));
    }
    return { items };
  }

  async create(user: UserSummary, input: CreateViewInput): Promise<ViewSummary> {
    let subjectId: string | null = null;
    if (input.scope === 'subject') {
      const subjectAccess = await this.access.resolve(user.id, input.subjectId as string);
      if (!subjectAccess) {
        throw AppError.notFound('Không tìm thấy hồ sơ hoặc bạn không có quyền truy cập.');
      }
      if (subjectAccess.role !== 'owner') {
        throw AppError.forbidden('Chỉ chủ hồ sơ mới được tạo view cho hồ sơ đó.');
      }
      subjectId = input.subjectId as string;
    } else if (input.scope === 'global') {
      this.access.requireAdmin(user);
    }

    const digest = this.computeDigest(input.config);
    let row: WorkspaceViewRow;
    try {
      const inserted = await this.db
        .insert(workspaceViews)
        .values({
          key: input.key,
          name: input.name,
          scope: input.scope,
          ownerUserId: user.id,
          subjectId,
          status: 'draft',
          draftConfig: input.config,
          draftRevision: 1,
          draftDigest: digest,
          baseRevision: 0,
        })
        .returning();
      row = inserted[0] as WorkspaceViewRow;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict('Bạn đã có view với key này.', { key: input.key });
      }
      throw error;
    }

    await this.audit.record({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'workspace_view.create',
      targetType: 'workspace_view',
      targetId: row.id,
      outcome: 'success',
      metadata: { scope: input.scope, revision: 1, digest },
    });
    return this.buildViewSummary(row, true);
  }

  async get(user: UserSummary, id: string): Promise<ViewSummary> {
    const view = await this.getViewOr404(id);
    const kind = await this.resolveAccess(user, view);
    if (kind === 'none') {
      throw AppError.notFound('Không tìm thấy view hoặc bạn không có quyền truy cập.');
    }
    if (kind === 'caregiver' || kind === 'user') {
      if (view.status !== 'published') {
        throw AppError.notFound('Không tìm thấy view hoặc bạn không có quyền truy cập.');
      }
    }
    const editor = kind === 'owner' || kind === 'admin';
    return this.buildViewSummary(view, editor);
  }

  async updateDraft(user: UserSummary, id: string, input: UpdateDraftInput): Promise<ViewSummary> {
    const view = await this.getViewOr404(id);
    const kind = await this.resolveAccess(user, view);
    if (kind !== 'owner') {
      if (kind === 'none') {
        throw AppError.notFound('Không tìm thấy view hoặc bạn không có quyền truy cập.');
      }
      throw AppError.forbidden('Chỉ chủ view mới được sửa bản nháp.');
    }
    if (input.baseRevision !== view.baseRevision) {
      throw AppError.conflict('Bản nền đã thay đổi, hãy tải lại trước khi sửa.', {
        currentRevision: view.baseRevision,
      });
    }
    const revision = view.draftRevision + 1;
    const digest = this.computeDigest(input.config);
    await this.db
      .update(workspaceViews)
      .set({
        draftConfig: input.config,
        draftRevision: revision,
        draftDigest: digest,
        updatedAt: new Date(),
      })
      .where(eq(workspaceViews.id, id));
    await this.audit.record({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'workspace_view.draft',
      targetType: 'workspace_view',
      targetId: view.id,
      outcome: 'success',
      metadata: { revision, digest },
    });
    const updated = await this.getViewOr404(id);
    return this.buildViewSummary(updated, true);
  }

  async preview(user: UserSummary, id: string, input: PreviewRequestInput): Promise<PreviewResult> {
    const view = await this.getViewOr404(id);
    const kind = await this.resolveAccess(user, view);
    if (kind === 'none') {
      throw AppError.notFound('Không tìm thấy view hoặc bạn không có quyền truy cập.');
    }
    if (!this.canManage(user, view, kind)) {
      throw AppError.forbidden('Bạn không có quyền tạo preview cho view này.');
    }
    if (input.draftRevision !== view.draftRevision) {
      throw AppError.conflict('draftRevision đã cũ, hãy tải lại bản nháp.', {
        currentDraftRevision: view.draftRevision,
      });
    }

    const config = view.draftConfig;
    const digest = this.computeDigest(config);
    const { warnings, errors } = this.validateWidgetOptions(config);
    if (errors.length > 0) {
      throw AppError.validation('Cấu hình không render được, hãy kiểm tra option của widget.', {
        warnings: [...warnings, ...errors],
      });
    }

    let data: StudioData;
    let dataMode: 'sample' | 'subject';
    let subjectId: string | null = null;
    if (input.previewSubjectId) {
      subjectId = input.previewSubjectId;
      data = await this.renderSubjectData(user.id, subjectId);
      dataMode = 'subject';
    } else {
      data = buildSampleData();
      warnings.push('Dữ liệu mẫu có nhãn — không phải dữ liệu đo từ thiết bị.');
      dataMode = 'sample';
    }

    await this.audit.record({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'workspace_view.preview',
      targetType: 'workspace_view',
      targetId: view.id,
      outcome: 'success',
      metadata: { revision: view.draftRevision, digest, dataMode },
    });

    return {
      digest,
      view: await this.buildViewSummary(view, true),
      config,
      draftRevision: view.draftRevision,
      dataMode,
      subjectId,
      data,
      warnings,
      checkedAt: new Date().toISOString(),
    };
  }

  async publish(user: UserSummary, id: string, input: PublishViewInput): Promise<PublishResult> {
    const view = await this.getViewOr404(id);
    const kind = await this.resolveAccess(user, view);
    if (kind === 'none') {
      throw AppError.notFound('Không tìm thấy view hoặc bạn không có quyền truy cập.');
    }
    if (!this.canManage(user, view, kind)) {
      throw AppError.forbidden('Bạn không có quyền công bố view này.');
    }
    this.assertApprovalMatches(view, input);

    const publication = await this.db.transaction(async (tx) => {
      const lockedRows = await tx
        .select()
        .from(workspaceViews)
        .where(eq(workspaceViews.id, id))
        .for('update');
      const locked = lockedRows[0];
      if (!locked) throw AppError.notFound('Không tìm thấy view.');
      this.assertApprovalMatches(locked, input);

      const active = await tx
        .select()
        .from(viewPublications)
        .where(
          and(eq(viewPublications.viewId, id), eq(viewPublications.status, 'active')),
        )
        .for('update');
      const activeRow = active[0] ?? null;

      const maxRows = await tx
        .select({ m: max(viewPublications.revision) })
        .from(viewPublications)
        .where(eq(viewPublications.viewId, id));
      const revision = (maxRows[0]?.m ?? 0) + 1;

      let inserted: PublicationRow;
      try {
        const rows = await tx
          .insert(viewPublications)
          .values({
            viewId: id,
            revision,
            config: locked.draftConfig,
            digest: input.digest,
            approvedByUserId: user.id,
            publishedByUserId: user.id,
            status: 'active',
            previousPublicationId: activeRow?.id ?? null,
            note: input.note ?? null,
          })
          .returning();
        inserted = rows[0] as PublicationRow;
      } catch (error) {
        // Hai publish trùng revision dù đã khóa view: phòng thủ thêm bằng unique (view_id, revision).
        if (isUniqueViolation(error)) {
          throw approvalStale('Bản công bố đã thay đổi trong lúc xử lý, hãy preview lại.', {
            currentBaseRevision: locked.baseRevision,
          });
        }
        throw error;
      }

      if (activeRow) {
        await tx
          .update(viewPublications)
          .set({ status: 'superseded' })
          .where(eq(viewPublications.id, activeRow.id));
      }
      await tx
        .update(workspaceViews)
        .set({ status: 'published', baseRevision: revision, updatedAt: new Date() })
        .where(eq(workspaceViews.id, id));
      await this.audit.record(
        {
          actorUserId: user.id,
          actorKind: 'user',
          action: 'workspace_view.publish',
          targetType: 'workspace_view',
          targetId: id,
          outcome: 'success',
          metadata: { revision, digest: input.digest },
        },
        tx,
      );
      return inserted;
    });

    const updated = await this.getViewOr404(id);
    return {
      publication: await this.toPublicationSummary(publication),
      view: await this.buildViewSummary(updated, true),
    };
  }

  private assertApprovalMatches(view: WorkspaceViewRow, input: PublishViewInput): void {
    if (
      input.draftRevision !== view.draftRevision ||
      input.digest !== view.draftDigest ||
      input.baseRevision !== view.baseRevision
    ) {
      throw approvalStale('Bản đã duyệt không còn khớp trạng thái hiện tại, hãy preview lại.', {
        currentDraftRevision: view.draftRevision,
        currentDraftDigest: view.draftDigest,
        currentBaseRevision: view.baseRevision,
      });
    }
  }

  async rollback(user: UserSummary, id: string, input: RollbackViewInput): Promise<RollbackResult> {
    const view = await this.getViewOr404(id);
    const kind = await this.resolveAccess(user, view);
    if (kind === 'none') {
      throw AppError.notFound('Không tìm thấy view hoặc bạn không có quyền truy cập.');
    }
    if (!this.canManage(user, view, kind)) {
      throw AppError.forbidden('Bạn không có quyền rollback view này.');
    }

    const sourceRows = await this.db
      .select()
      .from(viewPublications)
      .where(
        and(
          eq(viewPublications.id, input.publicationId),
          eq(viewPublications.viewId, id),
        ),
      )
      .limit(1);
    const source = sourceRows[0];
    if (!source) {
      throw AppError.notFound('Không tìm thấy publication trong view này.');
    }
    if (source.status === 'active') {
      throw AppError.conflict('Publication này đang là bản hoạt động, không cần rollback.');
    }

    const publication = await this.db.transaction(async (tx) => {
      await tx
        .select()
        .from(workspaceViews)
        .where(eq(workspaceViews.id, id))
        .for('update');

      const active = await tx
        .select()
        .from(viewPublications)
        .where(
          and(eq(viewPublications.viewId, id), eq(viewPublications.status, 'active')),
        )
        .for('update');
      const activeRow = active[0] ?? null;

      const maxRows = await tx
        .select({ m: max(viewPublications.revision) })
        .from(viewPublications)
        .where(eq(viewPublications.viewId, id));
      const revision = (maxRows[0]?.m ?? 0) + 1;

      const rows = await tx
        .insert(viewPublications)
        .values({
          viewId: id,
          revision,
          config: source.config,
          digest: source.digest,
          approvedByUserId: user.id,
          publishedByUserId: user.id,
          status: 'active',
          previousPublicationId: activeRow?.id ?? null,
          note: input.note ?? null,
        })
        .returning();
      const inserted = rows[0] as PublicationRow;

      if (activeRow) {
        await tx
          .update(viewPublications)
          .set({ status: 'superseded' })
          .where(eq(viewPublications.id, activeRow.id));
      }
      await tx
        .update(workspaceViews)
        .set({ status: 'published', baseRevision: revision, updatedAt: new Date() })
        .where(eq(workspaceViews.id, id));
      await this.audit.record(
        {
          actorUserId: user.id,
          actorKind: 'user',
          action: 'workspace_view.rollback',
          targetType: 'workspace_view',
          targetId: id,
          outcome: 'success',
          metadata: { revision, digest: source.digest, sourcePublicationId: source.id },
        },
        tx,
      );
      return inserted;
    });

    const updated = await this.getViewOr404(id);
    return {
      publication: await this.toPublicationSummary(publication),
      view: await this.buildViewSummary(updated, true),
    };
  }

  async listPublications(user: UserSummary, id: string): Promise<PublicationList> {
    const view = await this.getViewOr404(id);
    const kind = await this.resolveAccess(user, view);
    if (kind === 'none') {
      throw AppError.notFound('Không tìm thấy view hoặc bạn không có quyền truy cập.');
    }
    const fullHistory = kind === 'owner' || kind === 'admin';
    const rows = await this.db
      .select()
      .from(viewPublications)
      .where(
        fullHistory
          ? eq(viewPublications.viewId, id)
          : and(
              eq(viewPublications.viewId, id),
              eq(viewPublications.status, 'active'),
            ),
      )
      .orderBy(desc(viewPublications.revision));
    const items: PublicationSummary[] = [];
    for (const row of rows) {
      items.push(await this.toPublicationSummary(row));
    }
    return { items };
  }

  /**
   * GET /workspace-views/:id/data — chỉ render **bản công bố đang hoạt động**.
   * - Owner/admin/viewer dùng chung một nhánh: config + digest lấy từ publication
   *   active, không bao giờ dùng `draftConfig` (kể cả khi draft mới hơn sau rollback).
   * - Chưa có publication active → 404, không trả bản nháp.
   * - `view` trong response dựng như người xem (không lộ draftRevision/draftDigest)
   *   để endpoint này chỉ mô tả một bản công bố; draft xem qua POST /previews.
   */
  async data(user: UserSummary, id: string, query: ViewDataQuery): Promise<ViewData> {
    const view = await this.getViewOr404(id);
    const kind = await this.resolveAccess(user, view);
    if (kind === 'none') {
      throw AppError.notFound('Không tìm thấy view hoặc bạn không có quyền truy cập.');
    }

    // Người xem chỉ thấy view đã công bố; owner/admin giữ nguyên quyền xem view
    // của mình nhưng vẫn cần một publication active để render dữ liệu.
    const editor = kind === 'owner' || kind === 'admin';
    if (!editor && view.status !== 'published') {
      throw AppError.notFound('Không tìm thấy view hoặc bạn không có quyền truy cập.');
    }
    const active = await this.activePublication(id);
    if (!active) {
      throw AppError.notFound('View chưa có bản công bố.');
    }

    const subjectId = query.subjectId ?? view.subjectId;
    if (!subjectId) {
      throw AppError.validation('View scope user/global cần truyền subjectId để lấy dữ liệu.');
    }
    // Kiểm quyền đọc hồ sơ; không có quyền → 404, không lộ tồn tại.
    const data = await this.renderSubjectData(user.id, subjectId);

    return {
      view: await this.buildViewSummary(view, false, active),
      config: active.config,
      digest: active.digest,
      data,
      checkedAt: new Date().toISOString(),
    };
  }
}

function round1(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

/** Dữ liệu mẫu tổng hợp, có nhãn rõ; không đọc DB, không chứa dữ liệu người thật. */
function buildSampleData(): StudioData {
  const now = new Date();
  const points = [72, 74, 71, 76, 78, 75, 80, 82].map((heartRateBpm, index) => ({
    measuredAt: new Date(now.getTime() - (8 - index) * 15_000).toISOString(),
    heartRateBpm,
    quality: 'valid' as const,
  }));
  return {
    subject: null,
    devices: [
      {
        id: SAMPLE_DEVICE_ID,
        label: 'Thiết bị mẫu (mô phỏng)',
        serial: 'SAMPLE-0001',
        online: true,
        freshness: 'live',
        lastSeenAt: now.toISOString(),
        batteryPercent: 85,
      },
    ],
    metrics: {
      heartRateBpm: 82,
      quality: 'valid',
      measuredAt: now.toISOString(),
      online: true,
      freshness: 'live',
    },
    series: points,
    alerts: [
      {
        id: SAMPLE_ALERT_ID,
        type: 'fall',
        state: 'resolved',
        detectedAt: new Date(now.getTime() - 3600_000).toISOString(),
      },
    ],
    summary: {
      windowStart: new Date(now.getTime() - PREVIEW_WINDOW_MS).toISOString(),
      windowEnd: now.toISOString(),
      heartRateAvg: 76,
      heartRateMin: 71,
      heartRateMax: 82,
      alertsTotal: 1,
      alertsResolved: 1,
      lastSeenAt: now.toISOString(),
      source: 'sample',
    },
    tasks: [
      {
        id: SAMPLE_TASK_ID,
        kind: 'maintenance',
        title: 'Thay pin thiết bị (nhiệm vụ mẫu)',
        status: 'open',
        dueAt: new Date(now.getTime() + 24 * 3600_000).toISOString(),
      },
    ],
    sample: true,
  };
}
