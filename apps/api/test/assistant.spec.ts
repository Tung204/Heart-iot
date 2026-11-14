import request from 'supertest';
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { DEFAULT_CARE_PERMISSIONS } from '@annhien/contracts';
import type { CarePermissions } from '@annhien/contracts';
import { ASSISTANT_DISCLAIMER } from '@annhien/contracts/assistant';
import {
  ASSISTANT_AI_ADAPTER,
  AssistantAdapterError,
  type AssistantAiAdapter,
  type AssistantChatMessage,
  type AssistantCompletion,
} from '../src/assistant/assistant-adapter';
import { AssistantModule } from '../src/assistant/assistant.module';
import { AuditModule } from '../src/access/audit.module';
import { AccessModule } from '../src/access/access.module';
import { AuthModule } from '../src/auth/auth.module';
import { SessionGuard } from '../src/auth/session.guard';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import { DatabaseModule } from '../src/database/database.module';
import { DB, type AppDb } from '../src/database/database';
import { configureApp } from '../src/configure-app';
import { ENV, loadEnv, resetEnvCacheForTests } from '../src/config/env';
import {
  aiSummaries,
  auditLogs,
  careLinks,
  deviceAssignments,
  devices,
  incidents,
  maintenanceTasks,
  subjects,
  telemetry,
} from '../src/database/schema';
import {
  registerUser,
  TEST_ORIGIN,
  type TestContext,
  type TestUser,
} from './test-app';

/**
 * FR trợ lý AI (wave 2 be-ai): tóm tắt khoảng dữ liệu + hỏi đáp trên số liệu tổng hợp.
 * Kiểm quyền view_ai, fallback template, fake adapter (không gọi mạng thật),
 * an toàn dữ liệu gửi model, audit đã lọc, rate limit một tiến trình.
 */

@Module({
  imports: [AuthModule],
  providers: [
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
class LocalTestInfraModule {}

function prepareTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.PGLITE_MEMORY = 'true';
  process.env.WEB_ORIGIN = TEST_ORIGIN;
  delete process.env.DATABASE_URL;
  delete process.env.AI_BASE_URL;
  delete process.env.AI_API_KEY;
  delete process.env.AI_MODEL;
  delete process.env.MQTT_URL;
  resetEnvCacheForTests();
}

async function buildAssistantApp(adapter?: AssistantAiAdapter): Promise<TestContext> {
  prepareTestEnv();
  const builder = Test.createTestingModule({
    imports: [DatabaseModule, AuditModule, AccessModule, LocalTestInfraModule, AssistantModule],
  });
  if (adapter) {
    builder.overrideProvider(ASSISTANT_AI_ADAPTER).useValue(adapter);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  const env = app.get<ReturnType<typeof loadEnv>>(ENV);
  configureApp(app, env);
  await app.init();
  return {
    app,
    db: app.get<AppDb>(DB),
    close: async () => {
      await app.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures (ghi trực tiếp DB, không phụ thuộc module thiết bị/ingest)
// ---------------------------------------------------------------------------

let serialCounter = 0;
const nextSerial = () => `DEV-AI-${String(++serialCounter).padStart(4, '0')}`;

async function createSubject(ctx: TestContext, ownerUserId: string, displayName = 'Bà An') {
  const rows = await ctx.db
    .insert(subjects)
    .values({ ownerUserId, displayName, timezone: 'Asia/Ho_Chi_Minh' })
    .returning();
  const subject = rows[0];
  if (!subject) throw new Error('Không tạo được subject.');
  return subject;
}

async function createAssignment(ctx: TestContext, subjectId: string, assignedByUserId: string) {
  const deviceRows = await ctx.db
    .insert(devices)
    .values({
      serial: nextSerial(),
      label: 'Vòng tay đo',
      credentialHash: 'hash-test',
      status: 'active',
    })
    .returning();
  const device = deviceRows[0];
  if (!device) throw new Error('Không tạo được device.');
  const assignmentRows = await ctx.db
    .insert(deviceAssignments)
    .values({
      deviceId: device.id,
      subjectId,
      assignedByUserId,
      startedAt: new Date(),
    })
    .returning();
  const assignment = assignmentRows[0];
  if (!assignment) throw new Error('Không tạo được assignment.');
  return { deviceId: device.id, assignmentId: assignment.id };
}

type TelemetryInput = {
  measuredAt: Date;
  bootId?: string;
  sequence?: number;
  heartRateBpm?: number | null;
  heartRateQuality?: 'valid' | 'poor_signal' | 'not_worn' | 'sensor_error';
  stepsSinceBoot?: number;
  batteryPercent?: number | null;
};

async function insertTelemetry(
  ctx: TestContext,
  deviceId: string,
  assignmentId: string,
  input: TelemetryInput,
): Promise<void> {
  await ctx.db.insert(telemetry).values({
    messageId: crypto.randomUUID(),
    deviceId,
    assignmentId,
    bootId: input.bootId ?? 'boot-1',
    sequence: input.sequence ?? 0,
    measuredAt: input.measuredAt,
    receivedAt: new Date(),
    clockStatus: 'synced',
    uptimeMs: 5_000,
    metrics: {
      heart_rate_bpm: input.heartRateBpm ?? null,
      steps_since_boot: input.stepsSinceBoot ?? 0,
    },
    quality: { heart_rate: input.heartRateQuality ?? 'valid', motion: 'valid' },
    batteryPercent: input.batteryPercent ?? null,
    firmwareVersion: '0.1.0-test',
    isLate: false,
    isQuarantined: false,
    payloadHash: 'hash-test',
    source: 'test',
  });
}

async function insertIncident(
  ctx: TestContext,
  subjectId: string,
  assignmentId: string,
  deviceId: string,
  input: { type: 'fall' | 'sos'; state: string; detectedAt: Date },
): Promise<void> {
  await ctx.db.insert(incidents).values({
    subjectId,
    assignmentId,
    deviceId,
    deviceIncidentId: crypto.randomUUID(),
    type: input.type,
    state: input.state as 'open',
    lastRevision: 1,
    detectedAt: input.detectedAt,
    lastEventAt: input.detectedAt,
  });
}

async function insertTask(ctx: TestContext, subjectId: string, deviceId: string, title: string): Promise<void> {
  await ctx.db.insert(maintenanceTasks).values({
    deviceId,
    subjectId,
    kind: 'check',
    title,
    status: 'open',
    priority: 1,
    dedupeKey: crypto.randomUUID(),
  });
}

async function insertCareLink(
  ctx: TestContext,
  subjectId: string,
  caregiverUserId: string,
  invitedByUserId: string,
  permissions: CarePermissions,
  sharedFrom?: Date,
): Promise<void> {
  await ctx.db.insert(careLinks).values({
    subjectId,
    caregiverUserId,
    invitedByUserId,
    permissions,
    status: 'active',
    sharedFrom: sharedFrom ?? new Date(),
  });
}

// ---------------------------------------------------------------------------
// Fake adapter — không gọi mạng thật; phân biệt summary/ask qua nội dung prompt
// ---------------------------------------------------------------------------

type FakeMode = 'ok' | 'error' | 'timeout' | 'badJson';

class FakeAdapter implements AssistantAiAdapter {
  readonly calls: AssistantChatMessage[][] = [];
  configured: boolean;
  mode: FakeMode;
  readonly model: string;
  readonly answerSamples: number;

  constructor(opts: { configured?: boolean; mode?: FakeMode; model?: string; answerSamples?: number } = {}) {
    this.configured = opts.configured ?? true;
    this.mode = opts.mode ?? 'ok';
    this.model = opts.model ?? 'fake-model-1';
    this.answerSamples = opts.answerSamples ?? 4;
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async complete(messages: AssistantChatMessage[]): Promise<AssistantCompletion> {
    this.calls.push(messages);
    if (this.mode === 'error') throw new Error('provider exploded');
    if (this.mode === 'timeout') throw new AssistantAdapterError('timeout', 'Hết thời gian chờ.');
    if (this.mode === 'badJson') {
      return { content: 'đây không phải json {', provider: 'openai-compatible', model: this.model };
    }
    const userText = messages
      .filter((message) => message.role === 'user')
      .map((message) => message.content)
      .join('\n');
    if (userText.includes('Câu hỏi:')) {
      return {
        content: JSON.stringify({ answer: `Trong khoảng có ${this.answerSamples} mẫu đo.` }),
        provider: 'openai-compatible',
        model: this.model,
      };
    }
    return {
      content: JSON.stringify({
        headline: 'Tóm tắt: dữ liệu trong khoảng theo dõi ở mức bình thường.',
        sections: [
          {
            kind: 'measurements',
            title: 'Số liệu đo',
            body: 'Số mẫu và nhịp tim như dữ liệu đã cung cấp.',
            facts: [{ label: 'Số mẫu đo', value: 3, sourceRef: 'measurements' }],
          },
          {
            kind: 'alerts',
            title: 'Cảnh báo',
            body: 'Không có cảnh báo mới trong khoảng.',
            facts: [],
          },
        ],
      }),
      provider: 'openai-compatible',
      model: this.model,
    };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Trợ lý AI — không cấu hình AI (template fallback)', () => {
  let ctx: TestContext;
  let owner: TestUser;

  beforeAll(async () => {
    ctx = await buildAssistantApp();
    owner = await registerUser(ctx.app, {
      email: `ai-owner-${crypto.randomUUID()}@example.test`,
      displayName: 'Chủ hồ sơ AI',
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('owner xem summary: số liệu đúng fixture, template degraded, lưu ai_summaries', async () => {
    const subject = await createSubject(ctx, owner.session.user.id);
    const { deviceId, assignmentId } = await createAssignment(ctx, subject.id, owner.session.user.id);
    const base = Date.now() - 3 * 3600 * 1000;
    const inputs: TelemetryInput[] = [
      { measuredAt: new Date(base), sequence: 1, heartRateBpm: 70, stepsSinceBoot: 100 },
      { measuredAt: new Date(base + 900_000), sequence: 2, heartRateBpm: 80, stepsSinceBoot: 110 },
      { measuredAt: new Date(base + 1_800_000), sequence: 3, heartRateBpm: 90, stepsSinceBoot: 120 },
      {
        measuredAt: new Date(base + 2_700_000),
        sequence: 4,
        heartRateBpm: null,
        heartRateQuality: 'poor_signal',
        stepsSinceBoot: 130,
        batteryPercent: 55,
      },
    ];
    for (const input of inputs) {
      await insertTelemetry(ctx, deviceId, assignmentId, input);
    }

    const from = new Date(base - 60_000).toISOString();
    const to = new Date(base + 3_600_000).toISOString();
    // Thêm 1 cảnh báo đang mở + 1 công việc bảo trì trong khoảng.
    await insertIncident(ctx, subject.id, assignmentId, deviceId, {
      type: 'fall',
      state: 'open',
      detectedAt: new Date(base + 1_200_000),
    });
    await insertTask(ctx, subject.id, deviceId, 'Kiểm tra dây đeo vòng tay');
    const response = await owner.agent.get(
      `/api/v1/subjects/${subject.id}/assistant/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      subjectId: subject.id,
      status: 'degraded',
      provider: 'template',
      model: null,
      disclaimer: ASSISTANT_DISCLAIMER,
    });
    expect(response.body.degradedReason).toContain('AI_BASE_URL');
    expect(response.body.headline).toContain('4 mẫu đo');
    expect(response.body.headline).toContain('1 cảnh báo');

    const measurementSection = response.body.sections.find(
      (section: { kind: string }) => section.kind === 'measurements',
    );
    expect(measurementSection).toBeDefined();
    const factByLabel = new Map(
      measurementSection.facts.map((fact: { label: string; value: unknown }) => [fact.label, fact.value]),
    );
    expect(factByLabel.get('Số mẫu đo')).toBe(4);
    expect(factByLabel.get('Nhịp tim trung bình')).toBe(80);
    expect(factByLabel.get('Nhịp tim thấp nhất')).toBe(70);
    expect(factByLabel.get('Nhịp tim cao nhất')).toBe(90);
    expect(factByLabel.get('Pin mẫu gần nhất')).toBe(55);
    expect(factByLabel.get('Số bước ước tính')).toBe(30);
    const hrFact = measurementSection.facts.find((fact: { label: string }) => fact.label === 'Nhịp tim trung bình');
    expect(hrFact.unit).toBe('bpm');
    const batteryFact = measurementSection.facts.find((fact: { label: string }) => fact.label === 'Pin mẫu gần nhất');
    expect(batteryFact.unit).toBe('%');

    const alertsSection = response.body.sections.find(
      (section: { kind: string }) => section.kind === 'alerts',
    );
    expect(alertsSection).toBeDefined();
    const alertFactByLabel = new Map(
      alertsSection.facts.map((fact: { label: string; value: unknown }) => [fact.label, fact.value]),
    );
    expect(alertFactByLabel.get('Tổng cảnh báo')).toBe(1);
    expect(alertFactByLabel.get('Cảnh báo đang mở')).toBe(1);
    expect(alertsSection.body).toContain('Té ngã');

    const tasksSection = response.body.sections.find(
      (section: { kind: string }) => section.kind === 'tasks',
    );
    expect(tasksSection).toBeDefined();
    const taskFactByLabel = new Map(
      tasksSection.facts.map((fact: { label: string; value: unknown }) => [fact.label, fact.value]),
    );
    expect(taskFactByLabel.get('Công việc bảo trì đang mở')).toBe(1);
    expect(tasksSection.body).toContain('Kiểm tra dây đeo vòng tay');

    const stored = await ctx.db.select().from(aiSummaries).where(eq(aiSummaries.subjectId, subject.id));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ provider: 'template', model: null });
    const aggregate = stored[0]!.aggregate as {
      samples: number;
      heartRate: { avg: number; min: number; max: number } | null;
      batteryPercent: number | null;
      steps: number | null;
    };
    expect(aggregate.samples).toBe(4);
    expect(aggregate.heartRate).toMatchObject({ avg: 80, min: 70, max: 90 });
    expect(aggregate.batteryPercent).toBe(55);
    expect(aggregate.steps).toBe(30);
  });

  it('HR null khi không có mẫu hợp lệ; không bịa 0', async () => {
    const subject = await createSubject(ctx, owner.session.user.id, 'Bà Không HR');
    const { deviceId, assignmentId } = await createAssignment(ctx, subject.id, owner.session.user.id);
    const base = Date.now() - 3 * 3600 * 1000;
    await insertTelemetry(ctx, deviceId, assignmentId, {
      measuredAt: new Date(base),
      sequence: 1,
      heartRateBpm: null,
      heartRateQuality: 'poor_signal',
      stepsSinceBoot: 10,
    });
    await insertTelemetry(ctx, deviceId, assignmentId, {
      measuredAt: new Date(base + 900_000),
      sequence: 2,
      heartRateBpm: null,
      heartRateQuality: 'not_worn',
      stepsSinceBoot: 20,
    });

    const response = await owner.agent.get(`/api/v1/subjects/${subject.id}/assistant/summary`);
    expect(response.status).toBe(200);
    const measurementSection = response.body.sections.find(
      (section: { kind: string }) => section.kind === 'measurements',
    );
    const labels = measurementSection.facts.map((fact: { label: string }) => fact.label);
    expect(labels).toContain('Nhịp tim');
    expect(labels).not.toContain('Nhịp tim trung bình');
    const hrFact = measurementSection.facts.find((fact: { label: string }) => fact.label === 'Nhịp tim');
    expect(hrFact.value).toBe('Không có mẫu hợp lệ trong khoảng');

    const stored = await ctx.db.select().from(aiSummaries).where(eq(aiSummaries.subjectId, subject.id));
    expect(stored).toHaveLength(1);
    const aggregate = stored[0]!.aggregate as { heartRate: unknown };
    expect(aggregate.heartRate).toBeNull();
  });

  it('không cấu hình AI → không gọi adapter (không mạng), template + degraded', async () => {
    const adapter = ctx.app.get<AssistantAiAdapter>(ASSISTANT_AI_ADAPTER);
    const spy = jest.spyOn(adapter, 'complete');
    const subject = await createSubject(ctx, owner.session.user.id, 'Bà Không AI');

    const response = await owner.agent.get(`/api/v1/subjects/${subject.id}/assistant/summary`);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('degraded');
    expect(response.body.provider).toBe('template');
    expect(response.body.model).toBeNull();
    expect(response.body.degradedReason).toContain('AI_BASE_URL');
    expect(spy).not.toHaveBeenCalled();
    expect(adapter.isConfigured()).toBe(false);
    spy.mockRestore();
  });

  it('quyền: caregiver thiếu view_ai → 403; người ngoài → 404; from ngoài lịch sử → 403', async () => {
    const subject = await createSubject(ctx, owner.session.user.id, 'Bà Quyền');
    const caregiverNoAi = await registerUser(ctx.app, { displayName: 'Người thân không AI' });
    const caregiverAi = await registerUser(ctx.app, { displayName: 'Người thân có AI' });
    const stranger = await registerUser(ctx.app, { displayName: 'Người lạ' });

    const now = Date.now();
    await insertCareLink(ctx, subject.id, caregiverNoAi.session.user.id, owner.session.user.id, {
      ...DEFAULT_CARE_PERMISSIONS,
      canViewAi: false,
    });
    await insertCareLink(
      ctx,
      subject.id,
      caregiverAi.session.user.id,
      owner.session.user.id,
      { ...DEFAULT_CARE_PERMISSIONS, canViewAi: true, historyDays: 1 },
      new Date(now - 2 * 3600 * 1000),
    );

    const noAi = await caregiverNoAi.agent.get(`/api/v1/subjects/${subject.id}/assistant/summary`);
    expect(noAi.status).toBe(403);

    const outsider = await stranger.agent.get(`/api/v1/subjects/${subject.id}/assistant/summary`);
    expect(outsider.status).toBe(404);

    // from sớm hơn mốc hiệu lực chia sẻ → 403 (không âm thầm cắt).
    const tooOld = await caregiverAi.agent.get(
      `/api/v1/subjects/${subject.id}/assistant/summary?from=${encodeURIComponent(
        new Date(now - 3 * 3600 * 1000).toISOString(),
      )}`,
    );
    expect(tooOld.status).toBe(403);

    // from nằm trong lịch sử được chia sẻ → 200.
    const ok = await caregiverAi.agent.get(
      `/api/v1/subjects/${subject.id}/assistant/summary?from=${encodeURIComponent(
        new Date(now - 30 * 60 * 1000).toISOString(),
      )}`,
    );
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('degraded');

    // Câu hỏi cũng phải qua cùng kiểm quyền.
    const askNoAi = await caregiverNoAi.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/ask`)
      .send({ question: 'Nhịp tim trung bình là bao nhiêu?' });
    expect(askNoAi.status).toBe(403);
    const askOutsider = await stranger.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/ask`)
      .send({ question: 'Nhịp tim trung bình là bao nhiêu?' });
    expect(askOutsider.status).toBe(404);
  });

  it('câu hỏi đòi chẩn đoán/kê đơn → từ chối lịch sự, không gọi adapter, không bịa số', async () => {
    const adapter = ctx.app.get<AssistantAiAdapter>(ASSISTANT_AI_ADAPTER);
    const spy = jest.spyOn(adapter, 'complete');
    const subject = await createSubject(ctx, owner.session.user.id, 'Bà Từ Chối');

    const response = await owner.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/ask`)
      .send({ question: 'Bà có bị bệnh gì không? Hãy chẩn đoán giúp tôi.' });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('degraded');
    expect(response.body.provider).toBe('template');
    expect(response.body.model).toBeNull();
    expect(response.body.disclaimer).toBe(ASSISTANT_DISCLAIMER);
    expect(response.body.answer).toContain('không đưa ra chẩn đoán');
    expect(response.body.answer).toContain('hỏi về số liệu');
    expect(response.body.answer).toMatch(/nhịp tim/i);
    expect(response.body.degradedReason).toContain('ngoài phạm vi');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();

    // Câu hỏi ngắn hơn 3 ký tự → 422.
    const tooShort = await owner.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/ask`)
      .send({ question: 'ab' });
    expect(tooShort.status).toBe(422);
  });

  it('audit assistant.summary/ask: chỉ metadata đã lọc, không nội dung sức khỏe/secret', async () => {
    const subject = await createSubject(ctx, owner.session.user.id, 'Bà Audit');
    await owner.agent.get(`/api/v1/subjects/${subject.id}/assistant/summary`);
    await owner.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/ask`)
      .send({ question: 'Bà có bị bệnh gì không? Chẩn đoán giúp tôi.' });

    const summaryRows = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'assistant.summary'));
    expect(summaryRows.length).toBeGreaterThanOrEqual(1);
    const summaryMetadata = summaryRows[summaryRows.length - 1]!.metadata as Record<string, unknown>;
    expect(Object.keys(summaryMetadata).sort()).toEqual(['periodEnd', 'periodStart', 'provider', 'status']);
    const summaryText = JSON.stringify(summaryMetadata);
    expect(summaryText).not.toContain(owner.email);
    expect(summaryText).not.toContain('bpm');
    expect(summaryText).not.toContain('nhịp');
    expect(summaryText).not.toContain('Bearer');

    const askRows = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'assistant.ask'));
    expect(askRows.length).toBeGreaterThanOrEqual(1);
    const askMetadata = askRows[askRows.length - 1]!.metadata as Record<string, unknown>;
    expect(Object.keys(askMetadata).sort()).toEqual(['degradedReason', 'provider', 'status']);
    const askText = JSON.stringify(askMetadata);
    expect(askText).not.toContain('chẩn đoán');
    expect(askText).not.toContain('bệnh');
    expect(askText).not.toContain(owner.email);
  });

  it('rate limit 10 câu/5 phút (một tiến trình) → 429 từ câu thứ 11', async () => {
    const user = await registerUser(ctx.app, { displayName: 'Người hỏi nhiều' });
    const subject = await createSubject(ctx, user.session.user.id, 'Bà Hỏi Nhiều');

    for (let i = 0; i < 10; i += 1) {
      const response = await user.agent
        .post(`/api/v1/subjects/${subject.id}/assistant/ask`)
        .send({ question: 'Nhịp tim trung bình gần đây là bao nhiêu?' });
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('degraded');
    }
    const blocked = await user.agent
      .post(`/api/v1/subjects/${subject.id}/assistant/ask`)
      .send({ question: 'Số mẫu đo gần đây là bao nhiêu?' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(blocked.body.details).toMatchObject({ maxPerWindow: 10, scope: 'single_process_memory' });
  });

  it('hai request summary cùng lúc → cả hai 200, mỗi request một bản ghi ai_summaries', async () => {
    const subject = await createSubject(ctx, owner.session.user.id, 'Bà Song Song');
    const { deviceId, assignmentId } = await createAssignment(ctx, subject.id, owner.session.user.id);
    await insertTelemetry(ctx, deviceId, assignmentId, {
      measuredAt: new Date(Date.now() - 3600 * 1000),
      sequence: 1,
      heartRateBpm: 72,
      stepsSinceBoot: 5,
    });

    const [first, second] = await Promise.all([
      owner.agent.get(`/api/v1/subjects/${subject.id}/assistant/summary`),
      owner.agent.get(`/api/v1/subjects/${subject.id}/assistant/summary`),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const stored = await ctx.db.select().from(aiSummaries).where(eq(aiSummaries.subjectId, subject.id));
    expect(stored).toHaveLength(2);
  });

  it('khoảng thời gian không hợp lệ → 422', async () => {
    const subject = await createSubject(ctx, owner.session.user.id, 'Bà Window');
    const tooLong = await owner.agent.get(
      `/api/v1/subjects/${subject.id}/assistant/summary?from=${encodeURIComponent(
        new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString(),
      )}`,
    );
    expect(tooLong.status).toBe(422);
  });
});

describe('Trợ lý AI — fake adapter (không gọi mạng thật)', () => {
  let ctx: TestContext;
  let owner: TestUser;
  let fake: FakeAdapter;
  let subjectId: string;

  beforeAll(async () => {
    fake = new FakeAdapter({ mode: 'ok' });
    ctx = await buildAssistantApp(fake);
    owner = await registerUser(ctx.app, {
      email: `ai-fake-${crypto.randomUUID()}@example.test`,
      displayName: 'Chủ hồ sơ Fake AI',
    });
    const subject = await createSubject(ctx, owner.session.user.id, 'Bà Fake AI');
    subjectId = subject.id;
    const { deviceId, assignmentId } = await createAssignment(ctx, subject.id, owner.session.user.id);
    await insertTelemetry(ctx, deviceId, assignmentId, {
      measuredAt: new Date(Date.now() - 3600 * 1000),
      sequence: 1,
      heartRateBpm: 75,
      stepsSinceBoot: 12,
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('summary qua adapter: provider/model đúng, facts gửi model không chứa email/tên', async () => {
    const response = await owner.agent.get(`/api/v1/subjects/${subjectId}/assistant/summary`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ready',
      provider: 'openai-compatible',
      model: 'fake-model-1',
      disclaimer: ASSISTANT_DISCLAIMER,
      degradedReason: null,
    });
    expect(response.body.headline).toContain('Tóm tắt');
    expect(response.body.sections).toHaveLength(2);

    expect(fake.calls).toHaveLength(1);
    const sentToModel = JSON.stringify(fake.calls[0]);
    expect(sentToModel).not.toContain(owner.email);
    expect(sentToModel).not.toContain('Chủ hồ sơ Fake AI');
    expect(sentToModel).not.toContain('Bà Fake AI');
    expect(sentToModel).toContain('samples');
    expect(sentToModel).toContain('heartRate');
    expect(sentToModel).toContain('byState');

    const stored = await ctx.db.select().from(aiSummaries).where(eq(aiSummaries.subjectId, subjectId));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ provider: 'openai-compatible', model: 'fake-model-1', status: 'ready' });
    const content = stored[0]!.content as { headline: string };
    expect(content.headline).toContain('Tóm tắt');
  });

  it('ask qua adapter: trả lời dựa trên facts, provider/model đúng', async () => {
    const before = fake.calls.length;
    const response = await owner.agent
      .post(`/api/v1/subjects/${subjectId}/assistant/ask`)
      .send({ question: 'Số mẫu đo trong 7 ngày qua là bao nhiêu?' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ready',
      provider: 'openai-compatible',
      model: 'fake-model-1',
      disclaimer: ASSISTANT_DISCLAIMER,
    });
    expect(response.body.answer).toContain('mẫu đo');
    expect(fake.calls.length).toBe(before + 1);
  });

  it('câu hỏi chẩn đoán với AI sẵn sàng vẫn bị từ chối trước khi gọi adapter', async () => {
    const before = fake.calls.length;
    const response = await owner.agent
      .post(`/api/v1/subjects/${subjectId}/assistant/ask`)
      .send({ question: 'Kê đơn thuốc cho bà giúp tôi.' });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('degraded');
    expect(response.body.provider).toBe('template');
    expect(response.body.answer).toContain('không đưa ra chẩn đoán');
    expect(fake.calls.length).toBe(before);
  });

  it('adapter lỗi/timeout/JSON sai → fallback template, không 500, degradedReason có lý do', async () => {
    fake.mode = 'error';
    const errorResponse = await owner.agent.get(`/api/v1/subjects/${subjectId}/assistant/summary`);
    expect(errorResponse.status).toBe(200);
    expect(errorResponse.body.status).toBe('degraded');
    expect(errorResponse.body.provider).toBe('template');
    expect(errorResponse.body.model).toBeNull();
    expect(errorResponse.body.degradedReason).toContain('Lỗi khi gọi AI provider');
    expect(errorResponse.body.headline.length).toBeGreaterThan(0);

    fake.mode = 'timeout';
    const timeoutResponse = await owner.agent.get(`/api/v1/subjects/${subjectId}/assistant/summary`);
    expect(timeoutResponse.status).toBe(200);
    expect(timeoutResponse.body.status).toBe('degraded');
    expect(timeoutResponse.body.degradedReason).toContain('Hết thời gian chờ');

    fake.mode = 'badJson';
    const badJsonResponse = await owner.agent.get(`/api/v1/subjects/${subjectId}/assistant/summary`);
    expect(badJsonResponse.status).toBe(200);
    expect(badJsonResponse.body.status).toBe('degraded');
    expect(badJsonResponse.body.degradedReason).toContain('không đúng cấu trúc');

    const askBadJson = await owner.agent
      .post(`/api/v1/subjects/${subjectId}/assistant/ask`)
      .send({ question: 'Pin của thiết bị còn bao nhiêu phần trăm?' });
    expect(askBadJson.status).toBe(200);
    expect(askBadJson.body.status).toBe('degraded');
    expect(askBadJson.body.provider).toBe('template');
    expect(askBadJson.body.degradedReason).toContain('không đúng cấu trúc');

    // Bản ghi lưu vết của các lần fallback.
    const stored = await ctx.db.select().from(aiSummaries).where(eq(aiSummaries.subjectId, subjectId));
    expect(stored.length).toBeGreaterThanOrEqual(4);
    expect(stored.filter((row) => row.status === 'failed').length).toBeGreaterThanOrEqual(3);

    fake.mode = 'ok';
  });
});
