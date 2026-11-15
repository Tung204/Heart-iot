import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, notInArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { isSyntheticDataSource } from '@annhien/contracts';
import {
  ASSISTANT_DISCLAIMER,
  assistantSummarySchema,
  type AssistantAnswer,
  type AssistantAsk,
  type AssistantDataQuality,
  type AssistantFact,
  type AssistantSection,
  type AssistantSource,
  type AssistantSummary,
  type AssistantSummaryQuery,
} from '@annhien/contracts/assistant';
import type { MeasurementGapReason } from '@annhien/contracts/measurements';
import { DB, type AppDb } from '../database/database';
import {
  aiSummaries,
  deviceAssignments,
  incidents,
  maintenanceTasks,
  telemetry,
  type TelemetryRow,
} from '../database/schema';
import { AccessService } from '../access/access.service';
import { AuditService } from '../access/audit.service';
import { AppError } from '../common/app-error';
import { PolicyService } from '../policy/policy.service';
import {
  ASSISTANT_AI_ADAPTER,
  AssistantAdapterError,
  type AssistantAiAdapter,
  type AssistantChatMessage,
  type AssistantCompletion,
} from './assistant-adapter';
import { coverageCounts } from '../measurements/insights';

/**
 * Trợ lý AI — tóm tắt khoảng dữ liệu và hỏi đáp trên số liệu đã tổng hợp.
 * - Chỉ đọc DB trực tiếp (không import IncidentsService/ingest, không chặn đường cảnh báo).
 * - Kiểm quyền trước khi đọc và trước khi gửi dữ liệu tới model (requireHistory + view_ai).
 * - Chỉ gửi facts tổng hợp tới model: không email, không tên đầy đủ, không telemetry thô.
 * - Adapter lỗi/timeout/JSON sai → fallback template, không 500.
 * - Chỉ tổng hợp telemetry đã đồng bộ giờ (`clock_status='synced'`), không bị cách ly
 *   (`is_quarantined=false`) và có `measured_at` không vượt hiện tại; mẫu bị loại
 *   không vào số mẫu/nhịp tim/pin/bước và không được gửi tới model.
 */

const DEFAULT_WINDOW_MS = 7 * 24 * 3600 * 1000;
const MAX_WINDOW_MS = 31 * 24 * 3600 * 1000;
const ASK_WINDOW_MS = 7 * 24 * 3600 * 1000;

/**
 * Ngưỡng diễn đạt chất lượng dữ liệu. Không phải ngưỡng y khoa: chỉ dùng để
 * chọn câu chữ cảnh báo trong tóm tắt/câu trả lời, không chặn bất kỳ lượt đọc nào.
 */
const LOW_COVERAGE_PERCENT = 90;
const MANY_GAP_COUNT = 3;
/** Khoảng thiếu nếu hai mốc cách nhau quá 1,5 nhịp tim kỳ vọng (giống daily-summary). */
const GAP_THRESHOLD_FACTOR = 1.5;

const GAP_REASON_LABELS: Record<MeasurementGapReason, string> = {
  no_data: 'không có dữ liệu',
  clock_unsynced: 'đồng hồ chưa đồng bộ',
  quarantined: 'mẫu bị cách ly',
};

/** Giới hạn tần suất hỏi đáp: 10 câu / 5 phút / user, lưu trong bộ nhớ một tiến trình. */
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_BUCKETS_SOFT_MAX = 5000;

const ALERT_STATE_ORDER = ['open', 'acknowledged', 'resolved', 'cancelled', 'unconfirmed'] as const;

const ALERT_STATE_LABELS: Record<string, string> = {
  open: 'đang mở',
  acknowledged: 'đã xác nhận',
  resolved: 'đã xử lý',
  cancelled: 'đã hủy',
  unconfirmed: 'không xác nhận',
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  fall: 'Té ngã',
  sos: 'SOS',
};

const SECTION_KIND_LABELS: Record<string, string> = {
  measurements: 'Số liệu đo',
  alerts: 'Cảnh báo',
  tasks: 'Công việc bảo trì',
  note: 'Ghi chú',
};

export const OUT_OF_SCOPE_ANSWER =
  'Trợ lý chỉ tổng hợp số liệu đo được từ thiết bị, không đưa ra chẩn đoán, kê đơn hay dự đoán nguy cơ y khoa. Bạn có thể hỏi về số liệu nhịp tim, số mẫu đo, pin, cảnh báo hoặc công việc bảo trì trong khoảng thời gian được chia sẻ.';

export const AI_UNAVAILABLE_ANSWER =
  'Trợ lý AI hiện chưa sẵn sàng nên chưa thể trả lời câu hỏi. Bạn có thể xem tóm tắt số liệu đo trong mục Tóm tắt của hồ sơ, hoặc thử lại sau khi trợ lý được bật.';

export const NO_DATA_ANSWER =
  'Chưa có dữ liệu đo, cảnh báo hay công việc bảo trì nào trong khoảng trợ lý được phép đọc, nên tôi chưa thể trả lời câu hỏi này. Bạn có thể thử lại sau khi thiết bị gửi dữ liệu mới.';

const OUT_OF_SCOPE_PATTERNS = [
  'chẩn đoán',
  'chuẩn đoán',
  'bệnh',
  'kê đơn',
  'kê thuốc',
  'thuốc',
  'điều trị',
  'nguy cơ',
  'dự đoán',
  'tiên lượng',
  'diagnos',
  'prescri',
  'medic',
  'drug',
  'risk',
  'prognos',
  'disease',
];

const SUMMARY_SYSTEM_PROMPT = [
  'Bạn là trợ lý tóm tắt dữ liệu theo dõi sức khỏe của hệ thống An Nhiên.',
  'Quy tắc bắt buộc:',
  '- Chỉ dùng các facts được cung cấp; không bịa số, không ước đoán, không điền dữ liệu thiếu.',
  '- Thiếu dữ liệu thì ghi rõ "không có dữ liệu"; không thay bằng 0 hay giá trị giả định.',
  '- Phải đọc khối dataQuality. Khi observedCount < expectedCount hoặc gaps.count > 0, nêu rõ "chỉ từ X mẫu, độ phủ Y%, Z khoảng thiếu" trước khi nêu số trung bình; không mô tả "bình thường"/"ổn định" khi dữ liệu thiếu.',
  '- Khi dataQuality.synthetic = true, phải ghi rõ "dữ liệu mô phỏng". Nêu dataQuality.lastSeenAt nếu có.',
  '- Không chẩn đoán bệnh, không kê đơn thuốc, không dự đoán nguy cơ y khoa, không tư vấn y tế.',
  '- Trả lời bằng tiếng Việt.',
  '- Trả về đúng một JSON, không kèm văn bản nào khác, theo cấu trúc:',
  '{"headline": "<tối đa 1 câu>", "sections": [{"kind": "measurements" | "alerts" | "tasks" | "note", "title": "...", "body": "...", "facts": [{"label": "...", "value": "chuỗi hoặc số", "unit": "tùy chọn", "sourceRef": "measurements" | "incidents" | "maintenance_tasks" (tùy chọn)"}]}]}',
  '- "value" trong facts chỉ được lấy từ dữ liệu đã cho; chỉ là chuỗi hoặc số.',
].join('\n');

const ASK_SYSTEM_PROMPT = [
  'Bạn là trợ lý hỏi đáp về dữ liệu theo dõi sức khỏe của hệ thống An Nhiên.',
  'Quy tắc bắt buộc:',
  '- Chỉ trả lời dựa trên các facts được cung cấp; không bịa số, không suy đoán dữ liệu không có.',
  '- Phải đọc khối dataQuality: khi observedCount < expectedCount hoặc gaps.count > 0, nêu rõ "chỉ từ X mẫu, độ phủ Y%, Z khoảng thiếu" trước khi nêu số trung bình; không mô tả "bình thường"/"ổn định" khi dữ liệu thiếu.',
  '- Khi dataQuality.synthetic = true, phải ghi rõ "dữ liệu mô phỏng". Nêu dataQuality.lastSeenAt nếu có.',
  '- Không chẩn đoán bệnh, không kê đơn thuốc, không dự đoán nguy cơ y khoa, không tư vấn y tế.',
  '- Câu hỏi nằm ngoài dữ liệu được cung cấp thì từ chối lịch sự và gợi ý hỏi về số liệu (nhịp tim, số mẫu đo, pin, cảnh báo, công việc bảo trì).',
  '- Trả lời bằng tiếng Việt.',
  '- Trả về đúng một JSON, không kèm văn bản nào khác: {"answer": "..."}',
].join('\n');

/** Số liệu tổng hợp duy nhất được gửi tới model — không có tên/email/telemetry thô. */
export type FactsAggregate = {
  window: { from: string; to: string };
  samples: number;
  heartRate: { validSamples: number; min: number; avg: number; max: number } | null;
  batteryPercent: number | null;
  steps: number | null;
  alerts: {
    byState: Record<string, number>;
    latest: { type: string; state: string; detectedAt: string } | null;
  };
  tasks: { open: number; titles: string[] };
  /** Chất lượng dữ liệu: độ phủ, khoảng thiếu, lần nhận cuối, nguồn mô phỏng. */
  dataQuality: AssistantDataQuality;
};

const modelFactSchema = z.object({
  label: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  unit: z.string().max(20).optional(),
  sourceRef: z.string().max(40).optional(),
});

const modelSummaryResponseSchema = z
  .object({
    headline: z.string().min(1),
    sections: z
      .array(
        z.object({
          kind: z.enum(['measurements', 'alerts', 'tasks', 'note']),
          title: z.string().min(1),
          body: z.string(),
          facts: z.array(modelFactSchema).max(30).optional().default([]),
        }),
      )
      .min(1)
      .max(8),
  })
  .strict();

const modelAnswerResponseSchema = z.object({ answer: z.string().min(1) }).strict();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function sanitizeText(value: string, max: number): string {
  return truncate(stripHtml(value), max);
}

function isOutOfScopeQuestion(question: string): boolean {
  const normalized = question.toLowerCase();
  return OUT_OF_SCOPE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function parseModelJson(content: string): unknown {
  let text = content.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  return JSON.parse(text);
}

function toSafeFact(fact: z.infer<typeof modelFactSchema>): AssistantFact {
  let value: string | number;
  if (typeof fact.value === 'number') {
    value = fact.value;
  } else if (typeof fact.value === 'boolean') {
    value = fact.value ? 'Có' : 'Không';
  } else if (fact.value === null) {
    value = 'Không có dữ liệu';
  } else {
    value = sanitizeText(fact.value, 200) || '—';
  }
  const result: AssistantFact = {
    label: sanitizeText(fact.label, 200) || 'Thông tin',
    value,
  };
  const unit = fact.unit ? sanitizeText(fact.unit, 20) : undefined;
  const sourceRef = fact.sourceRef ? sanitizeText(fact.sourceRef, 40) : undefined;
  if (unit) result.unit = unit;
  if (sourceRef) result.sourceRef = sourceRef;
  return result;
}

function isIncompleteQuality(quality: AssistantDataQuality): boolean {
  return quality.observedCount < quality.expectedCount || quality.gaps.count > 0;
}

/** Câu cố định để template và guard AI cùng nói đúng một cách. */
function qualitySentence(quality: AssistantDataQuality): string {
  return `Chỉ từ ${quality.observedCount} mẫu, độ phủ ${quality.coveragePercent}%, ${quality.gaps.count} khoảng thiếu dữ liệu.`;
}

function gapReasonText(reasons: MeasurementGapReason[]): string {
  if (reasons.length === 0) return 'không rõ lý do';
  return reasons.map((reason) => GAP_REASON_LABELS[reason]).join(', ');
}

/** Khoảng thiếu theo cùng ngưỡng 1,5 nhịp tim kỳ vọng của daily-summary. */
function computeQualityGaps(
  from: Date,
  to: Date,
  intervalSeconds: number,
  measuredAts: Date[],
  unsyncedCount: number,
  quarantinedCount: number,
): AssistantDataQuality['gaps'] {
  if (to.getTime() <= from.getTime()) return { count: 0, reasons: [] };
  const reasons = new Set<MeasurementGapReason>();
  const mark = (reason: MeasurementGapReason): void => {
    reasons.add(reason);
  };
  const thresholdMs = intervalSeconds * 1000 * GAP_THRESHOLD_FACTOR;

  if (measuredAts.length === 0) {
    if (unsyncedCount > 0) mark('clock_unsynced');
    if (quarantinedCount > 0) mark('quarantined');
    // Không có mốc tin cậy và cũng không có mẫu bị loại: cả khoảng thiếu dữ liệu.
    if (reasons.size === 0) mark('no_data');
    return { count: 1, reasons: [...reasons] };
  }

  let count = 0;
  let previous: Date | null = null;
  for (const current of measuredAts) {
    const reference = previous ?? from;
    if (current.getTime() - reference.getTime() > thresholdMs) {
      count += 1;
      mark('no_data');
    }
    previous = current;
  }
  if (previous && to.getTime() - previous.getTime() > thresholdMs) {
    count += 1;
    mark('no_data');
  }
  return { count, reasons: [...reasons] };
}

function buildDataQuality(input: {
  from: Date;
  to: Date;
  intervalSeconds: number;
  measuredAts: Date[];
  unsyncedCount: number;
  quarantinedCount: number;
  heartRateValidSamples: number;
  synthetic: boolean;
}): AssistantDataQuality {
  const { from, to, intervalSeconds, measuredAts, synthetic } = input;
  const { percent, observedCount, expectedCount } = coverageCounts(
    from,
    to,
    intervalSeconds,
    measuredAts.length,
  );
  const gaps = computeQualityGaps(
    from,
    to,
    intervalSeconds,
    measuredAts,
    input.unsyncedCount,
    input.quarantinedCount,
  );
  const lastSeenAt =
    measuredAts.length > 0 ? measuredAts[measuredAts.length - 1]!.toISOString() : null;

  const limitations: string[] = [];
  if (observedCount === 0) {
    limitations.push(
      'Không có mẫu đo hợp lệ trong khoảng; không thể kết luận tình trạng sức khỏe từ dữ liệu thiếu.',
    );
  } else if (percent < LOW_COVERAGE_PERCENT) {
    limitations.push(
      `Độ phủ dữ liệu thấp (${percent}%): số liệu chỉ từ ${observedCount}/${expectedCount} mẫu kỳ vọng.`,
    );
  }
  if (gaps.count > 0) {
    limitations.push(
      `Có ${gaps.count} khoảng thiếu dữ liệu (${gapReasonText(gaps.reasons)}); không suy luận tình trạng trong các khoảng này.`,
    );
  }
  if (gaps.count >= MANY_GAP_COUNT) {
    limitations.push(
      'Dữ liệu thiếu ở nhiều khoảng nên chỉ đọc các số liệu như mô tả của các mẫu đã nhận, không phải toàn bộ khoảng.',
    );
  }
  if (synthetic) {
    limitations.push('Nguồn dữ liệu là mô phỏng, không phải số đo thật của người dùng.');
  }
  if (observedCount > 0 && input.heartRateValidSamples === 0) {
    limitations.push('Không có mẫu nhịp tim hợp lệ trong khoảng.');
  }
  if (input.quarantinedCount > 0) {
    limitations.push(`Đã loại ${input.quarantinedCount} mẫu bị cách ly khỏi tổng hợp.`);
  }

  return {
    coveragePercent: percent,
    observedCount,
    expectedCount,
    gaps,
    lastSeenAt,
    synthetic,
    limitations: limitations.slice(0, 10),
  };
}

/**
 * Guardrail hậu kiểm tối thiểu cho nội dung model: khi dữ liệu thiếu, không để
 * các câu "bình thường"/"ổn định" đi thẳng tới người đọc như một kết luận sức khỏe.
 */
const REASSURING_CLAIM_PATTERNS: Array<[RegExp, string]> = [
  [/ở mức bình thường/gi, 'chưa đủ dữ liệu để kết luận'],
  [/bình thường/gi, 'chưa đủ dữ liệu để kết luận'],
  [/ổn định/gi, 'chưa đủ dữ liệu để kết luận'],
];

function guardReassuringWording(text: string, quality: AssistantDataQuality): string {
  if (!isIncompleteQuality(quality)) return text;
  return REASSURING_CLAIM_PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    text,
  );
}

function answerWithQuality(answer: string, quality: AssistantDataQuality): string {
  const prefix: string[] = [];
  const incomplete = isIncompleteQuality(quality);
  if (incomplete) prefix.push(qualitySentence(quality));
  if (quality.synthetic) prefix.push('Dữ liệu mô phỏng.');
  if (prefix.length === 0) return answer;
  const normalized = answer.toLowerCase();
  const mentionsQuality =
    normalized.includes('độ phủ') &&
    (!incomplete || normalized.includes('khoảng thiếu')) &&
    (!quality.synthetic || normalized.includes('mô phỏng'));
  if (mentionsQuality) return answer;
  return truncate(`${prefix.join(' ')} ${answer}`, 4000);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class AssistantService {
  /** Bộ đếm tần suất hỏi đáp — trong bộ nhớ, phạm vi MỘT tiến trình. */
  private readonly askBuckets = new Map<string, number[]>();

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly policy: PolicyService,
    @Inject(ASSISTANT_AI_ADAPTER) private readonly ai: AssistantAiAdapter,
  ) {}

  // ---------------------------------------------------------------------------
  // GET /subjects/:id/assistant/summary
  // ---------------------------------------------------------------------------

  async getSummary(
    userId: string,
    subjectId: string,
    query: AssistantSummaryQuery,
  ): Promise<AssistantSummary> {
    const now = new Date();
    const to = query.to ? new Date(query.to) : now;
    let requestedFrom: Date | null = null;
    if (query.from) {
      requestedFrom = new Date(query.from);
      if (requestedFrom.getTime() >= to.getTime()) {
        throw AppError.validation('from phải sớm hơn to.');
      }
      if (to.getTime() - requestedFrom.getTime() > MAX_WINDOW_MS) {
        throw AppError.validation('Khoảng thời gian tối đa là 31 ngày.');
      }
    }

    // Kiểm quyền trước khi đọc dữ liệu: người ngoài → 404; from ngoài lịch sử
    // được chia sẻ → 403; caregiver thiếu view_ai → 403.
    const { access, effectiveFrom } = await this.access.requireHistory(
      userId,
      subjectId,
      requestedFrom,
    );
    this.access.assertAction(access, 'view_ai');

    // Không truyền from tường minh: mặc định 7 ngày nhưng không vượt quyền xem lịch sử.
    const from =
      requestedFrom ??
      new Date(Math.max(now.getTime() - DEFAULT_WINDOW_MS, effectiveFrom.getTime()));

    const aggregate = await this.gatherFacts(subjectId, from, to);
    const sources = this.buildSources(from, to);

    let summary: AssistantSummary;
    if (!this.ai.isConfigured()) {
      summary = this.templateSummary(
        subjectId,
        from,
        to,
        aggregate,
        sources,
        'Chưa cấu hình AI (AI_BASE_URL trống) nên dùng mẫu tóm tắt xác định từ số liệu đo.',
      );
    } else {
      try {
        const completion = await this.ai.complete([
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: this.summaryUserPrompt(from, to, aggregate) },
        ]);
        summary = this.buildAiSummary(subjectId, from, to, sources, completion, aggregate);
      } catch (error) {
        summary = this.templateSummary(
          subjectId,
          from,
          to,
          aggregate,
          sources,
          this.degradedReasonFor(error),
        );
      }
    }

    await this.persistSummary(subjectId, from, to, aggregate, summary);
    await this.audit.record({
      actorUserId: userId,
      actorKind: 'user',
      action: 'assistant.summary',
      targetType: 'subject',
      targetId: subjectId,
      outcome: 'success',
      // Chỉ metadata đã lọc: không chứa nội dung sức khỏe, không chứa prompt/API key.
      metadata: {
        periodStart: from.toISOString(),
        periodEnd: to.toISOString(),
        provider: summary.provider,
        status: summary.status,
      },
    });
    return summary;
  }

  // ---------------------------------------------------------------------------
  // POST /subjects/:id/assistant/ask
  // ---------------------------------------------------------------------------

  async ask(userId: string, subjectId: string, input: AssistantAsk): Promise<AssistantAnswer> {
    this.enforceRateLimit(userId);

    const now = new Date();
    // Cửa sổ 7 ngày nhưng không bắt đầu trước mốc chia sẻ: link vừa accept vẫn hỏi được
    // (cửa sổ ngắn hơn), không trả 403 chỉ vì sharedFrom mới.
    const { access, effectiveFrom } = await this.access.requireHistory(
      userId,
      subjectId,
      undefined,
    );
    this.access.assertAction(access, 'view_ai');
    const from = new Date(Math.max(now.getTime() - ASK_WINDOW_MS, effectiveFrom.getTime()));

    const sources = this.buildSources(from, now);

    // Câu hỏi ngoài dữ liệu (chẩn đoán, kê đơn, dự đoán nguy cơ): từ chối ngay,
    // không gọi model, không bịa số.
    if (isOutOfScopeQuestion(input.question)) {
      await this.auditAsk(userId, subjectId, 'template', 'degraded', 'question_out_of_scope');
      return {
        answer: OUT_OF_SCOPE_ANSWER,
        status: 'degraded',
        provider: 'template',
        model: null,
        disclaimer: ASSISTANT_DISCLAIMER,
        sources,
        degradedReason: 'Câu hỏi nằm ngoài phạm vi dữ liệu theo dõi của trợ lý.',
      };
    }

    const aggregate = await this.gatherFacts(subjectId, from, now);

    // Không có dữ liệu trong cửa sổ (có thể vì vừa được chia sẻ): trả lời trung thực bằng
    // mẫu xác định, không gọi model để tránh suy đoán/bịa số.
    const hasAnyData =
      aggregate.samples > 0 ||
      Object.keys(aggregate.alerts.byState).length > 0 ||
      aggregate.tasks.open > 0;
    if (!hasAnyData) {
      await this.auditAsk(userId, subjectId, 'template', 'degraded', 'no_data_in_window');
      return {
        answer: answerWithQuality(NO_DATA_ANSWER, aggregate.dataQuality),
        status: 'degraded',
        provider: 'template',
        model: null,
        disclaimer: ASSISTANT_DISCLAIMER,
        sources,
        dataQuality: aggregate.dataQuality,
        degradedReason:
          'Chưa có dữ liệu trong khoảng trợ lý được phép đọc nên không gọi AI để tránh suy đoán.',
      };
    }

    if (!this.ai.isConfigured()) {
      await this.auditAsk(userId, subjectId, 'template', 'degraded', 'ai_not_configured');
      return {
        answer: answerWithQuality(AI_UNAVAILABLE_ANSWER, aggregate.dataQuality),
        status: 'degraded',
        provider: 'template',
        model: null,
        disclaimer: ASSISTANT_DISCLAIMER,
        sources,
        dataQuality: aggregate.dataQuality,
        degradedReason: 'Chưa cấu hình AI (AI_BASE_URL trống) nên không thể trả lời câu hỏi.',
      };
    }

    try {
      const completion = await this.ai.complete([
        { role: 'system', content: ASK_SYSTEM_PROMPT },
        { role: 'user', content: this.askUserPrompt(input.question, from, now, aggregate) },
      ]);
      let parsed: unknown;
      try {
        parsed = parseModelJson(completion.content);
      } catch {
        throw new AssistantAdapterError(
          'invalid_response',
          'Câu trả lời của AI không phải JSON hợp lệ.',
        );
      }
      const parsedResult = modelAnswerResponseSchema.safeParse(parsed);
      if (!parsedResult.success) {
        throw new AssistantAdapterError(
          'invalid_response',
          'Câu trả lời của AI không đúng cấu trúc.',
        );
      }
      const answer = sanitizeText(
        guardReassuringWording(parsedResult.data.answer, aggregate.dataQuality),
        4000,
      );
      if (!answer) {
        throw new AssistantAdapterError('invalid_response', 'Câu trả lời của AI rỗng.');
      }
      await this.auditAsk(userId, subjectId, completion.provider, 'ready', null);
      return {
        answer: answerWithQuality(answer, aggregate.dataQuality),
        status: 'ready',
        provider: completion.provider,
        model: completion.model,
        disclaimer: ASSISTANT_DISCLAIMER,
        sources,
        dataQuality: aggregate.dataQuality,
      };
    } catch (error) {
      await this.auditAsk(userId, subjectId, 'template', 'degraded', this.degradedCodeFor(error));
      return {
        answer: answerWithQuality(AI_UNAVAILABLE_ANSWER, aggregate.dataQuality),
        status: 'degraded',
        provider: 'template',
        model: null,
        disclaimer: ASSISTANT_DISCLAIMER,
        sources,
        dataQuality: aggregate.dataQuality,
        degradedReason: this.degradedReasonFor(error),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Tổng hợp số liệu thật từ DB (chỉ đọc, không gọi service cảnh báo)
  // ---------------------------------------------------------------------------

  private async gatherFacts(subjectId: string, from: Date, to: Date): Promise<FactsAggregate> {
    const assignmentRows = await this.db
      .select({ id: deviceAssignments.id })
      .from(deviceAssignments)
      .where(eq(deviceAssignments.subjectId, subjectId));
    const assignmentIds = assignmentRows.map((row) => row.id);

    // Trần dữ liệu telemetry là hiện tại: client xin `to` xa hơn cũng không kéo
    // mẫu `measured_at` tương lai vào tổng hợp. Mẫu cách ly và mẫu chưa đồng bộ
    // giờ không phải số liệu tin cậy nên bị loại khỏi samples/HR/pin/bước.
    const telemetryTo = new Date(Math.min(to.getTime(), Date.now()));
    // Cùng policy/nhịp tim kỳ vọng với measurements/daily-summary để coverage khớp.
    const policy = await this.policy.getActive();
    const intervalSeconds = policy.value.heartbeatIntervalSeconds;

    const [telemetryRows, incidentRows, taskRows, unsyncedRows, quarantinedRows] = await Promise.all([
      assignmentIds.length === 0
        ? Promise.resolve([] as TelemetryRow[])
        : this.db
            .select()
            .from(telemetry)
            .where(
              and(
                inArray(telemetry.assignmentId, assignmentIds),
                eq(telemetry.isQuarantined, false),
                eq(telemetry.clockStatus, 'synced'),
                isNotNull(telemetry.measuredAt),
                gte(telemetry.measuredAt, from),
                lte(telemetry.measuredAt, telemetryTo),
              ),
            )
            .orderBy(asc(telemetry.measuredAt), asc(telemetry.id)),
      // suspected chưa được xác nhận nên không đưa vào trợ lý (giống danh sách cảnh báo).
      this.db
        .select()
        .from(incidents)
        .where(
          and(
            eq(incidents.subjectId, subjectId),
            gte(incidents.detectedAt, from),
            lte(incidents.detectedAt, to),
            notInArray(incidents.state, ['suspected']),
          ),
        )
        .orderBy(asc(incidents.detectedAt)),
      this.db
        .select()
        .from(maintenanceTasks)
        .where(
          and(
            eq(maintenanceTasks.subjectId, subjectId),
            inArray(maintenanceTasks.status, ['open', 'in_progress']),
          ),
        )
        .orderBy(asc(maintenanceTasks.createdAt)),
      // Mẫu chưa đồng bộ giờ/cách ly không vào tổng hợp nhưng cần cho lý do khoảng thiếu.
      assignmentIds.length === 0
        ? Promise.resolve([] as Array<{ id: string }>)
        : this.db
            .select({ id: telemetry.id })
            .from(telemetry)
            .where(
              and(
                inArray(telemetry.assignmentId, assignmentIds),
                eq(telemetry.isQuarantined, false),
                or(isNull(telemetry.measuredAt), eq(telemetry.clockStatus, 'unsynced')),
                gte(telemetry.receivedAt, from),
                lte(telemetry.receivedAt, telemetryTo),
              ),
            ),
      assignmentIds.length === 0
        ? Promise.resolve([] as Array<{ id: string }>)
        : this.db
            .select({ id: telemetry.id })
            .from(telemetry)
            .where(
              and(
                inArray(telemetry.assignmentId, assignmentIds),
                eq(telemetry.isQuarantined, true),
                gte(telemetry.measuredAt, from),
                lte(telemetry.measuredAt, telemetryTo),
              ),
            ),
    ]);

    // Nhịp tim: chỉ mẫu quality heart_rate = valid và có giá trị; không có → null.
    const hrValues: number[] = [];
    for (const row of telemetryRows) {
      if (row.quality.heart_rate === 'valid' && row.metrics.heart_rate_bpm !== null) {
        hrValues.push(row.metrics.heart_rate_bpm);
      }
    }
    const heartRate =
      hrValues.length === 0
        ? null
        : {
            validSamples: hrValues.length,
            min: round1(Math.min(...hrValues)),
            avg: round1(hrValues.reduce((acc, value) => acc + value, 0) / hrValues.length),
            max: round1(Math.max(...hrValues)),
          };

    const lastRow = telemetryRows[telemetryRows.length - 1];
    const batteryPercent = lastRow?.batteryPercent ?? null;

    // Số bước: tổng delta dương theo boot trong khoảng; không có mẫu → null.
    let steps: number | null = null;
    if (telemetryRows.length > 0) {
      let total = 0;
      const lastByBoot = new Map<string, number>();
      for (const row of telemetryRows) {
        const previous = lastByBoot.get(row.bootId);
        if (previous !== undefined) {
          const delta = row.metrics.steps_since_boot - previous;
          if (delta > 0) total += delta;
        }
        lastByBoot.set(row.bootId, row.metrics.steps_since_boot);
      }
      steps = total;
    }

    const byState: Record<string, number> = {};
    let latest: FactsAggregate['alerts']['latest'] = null;
    for (const row of incidentRows) {
      byState[row.state] = (byState[row.state] ?? 0) + 1;
      if (!latest || row.detectedAt.getTime() > new Date(latest.detectedAt).getTime()) {
        latest = {
          type: row.type,
          state: row.state,
          detectedAt: row.detectedAt.toISOString(),
        };
      }
    }

    const measuredAts = telemetryRows
      .map((row) => row.measuredAt)
      .filter((value): value is Date => value !== null);
    const synthetic = telemetryRows.some((row) => isSyntheticDataSource(row.source));
    const dataQuality = buildDataQuality({
      from,
      to: telemetryTo,
      intervalSeconds,
      measuredAts,
      unsyncedCount: unsyncedRows.length,
      quarantinedCount: quarantinedRows.length,
      heartRateValidSamples: heartRate?.validSamples ?? 0,
      synthetic,
    });

    return {
      window: { from: from.toISOString(), to: telemetryTo.toISOString() },
      samples: telemetryRows.length,
      heartRate,
      batteryPercent,
      steps,
      alerts: { byState, latest },
      tasks: {
        open: taskRows.length,
        titles: taskRows.slice(0, 5).map((row) => row.title.slice(0, 120)),
      },
      dataQuality,
    };
  }

  private buildSources(from: Date, to: Date): AssistantSource[] {
    return [
      { type: 'measurements', label: 'Dữ liệu đo đã tổng hợp', at: to.toISOString() },
      { type: 'incidents', label: 'Cảnh báo trong khoảng', at: to.toISOString() },
      { type: 'maintenance_tasks', label: 'Công việc bảo trì', at: to.toISOString() },
    ];
  }

  private measurementFacts(aggregate: FactsAggregate): AssistantFact[] {
    const facts: AssistantFact[] = [
      { label: 'Số mẫu đo', value: aggregate.samples, sourceRef: 'measurements' },
      {
        label: 'Độ phủ dữ liệu',
        value: aggregate.dataQuality.coveragePercent,
        unit: '%',
        sourceRef: 'measurements',
      },
      {
        label: 'Số khoảng thiếu dữ liệu',
        value: aggregate.dataQuality.gaps.count,
        sourceRef: 'measurements',
      },
      {
        label: 'Lần nhận cuối',
        value: aggregate.dataQuality.lastSeenAt ?? 'Không có',
        sourceRef: 'measurements',
      },
      {
        label: 'Nguồn dữ liệu',
        value: aggregate.dataQuality.synthetic ? 'Dữ liệu mô phỏng' : 'Dữ liệu thiết bị',
        sourceRef: 'measurements',
      },
    ];
    if (aggregate.heartRate) {
      facts.push(
        { label: 'Nhịp tim trung bình', value: aggregate.heartRate.avg, unit: 'bpm', sourceRef: 'measurements' },
        { label: 'Nhịp tim thấp nhất', value: aggregate.heartRate.min, unit: 'bpm', sourceRef: 'measurements' },
        { label: 'Nhịp tim cao nhất', value: aggregate.heartRate.max, unit: 'bpm', sourceRef: 'measurements' },
      );
    } else {
      facts.push({
        label: 'Nhịp tim',
        value: 'Không có mẫu hợp lệ trong khoảng',
        sourceRef: 'measurements',
      });
    }
    facts.push(
      aggregate.batteryPercent === null
        ? { label: 'Pin mẫu gần nhất', value: 'Không có dữ liệu', sourceRef: 'measurements' }
        : { label: 'Pin mẫu gần nhất', value: aggregate.batteryPercent, unit: '%', sourceRef: 'measurements' },
      aggregate.steps === null
        ? { label: 'Số bước ước tính', value: 'Không có dữ liệu', sourceRef: 'measurements' }
        : { label: 'Số bước ước tính', value: aggregate.steps, sourceRef: 'measurements' },
    );
    return facts;
  }

  private alertFacts(aggregate: FactsAggregate): AssistantFact[] {
    const total = Object.values(aggregate.alerts.byState).reduce((acc, count) => acc + count, 0);
    const facts: AssistantFact[] = [
      { label: 'Tổng cảnh báo', value: total, sourceRef: 'incidents' },
    ];
    for (const state of ALERT_STATE_ORDER) {
      const count = aggregate.alerts.byState[state] ?? 0;
      if (count > 0) {
        facts.push({
          label: `Cảnh báo ${ALERT_STATE_LABELS[state] ?? state}`,
          value: count,
          sourceRef: 'incidents',
        });
      }
    }
    const latest = aggregate.alerts.latest;
    facts.push(
      latest
        ? {
            label: 'Cảnh báo gần nhất',
            value: `${ALERT_TYPE_LABELS[latest.type] ?? latest.type} lúc ${latest.detectedAt} (${ALERT_STATE_LABELS[latest.state] ?? latest.state})`,
            sourceRef: 'incidents',
          }
        : { label: 'Cảnh báo gần nhất', value: 'Không có', sourceRef: 'incidents' },
    );
    return facts;
  }

  private taskFacts(aggregate: FactsAggregate): AssistantFact[] {
    return [
      {
        label: 'Công việc bảo trì đang mở',
        value: aggregate.tasks.open,
        sourceRef: 'maintenance_tasks',
      },
      {
        label: 'Công việc',
        value: aggregate.tasks.titles.length > 0 ? aggregate.tasks.titles.join('; ') : 'Không có',
        sourceRef: 'maintenance_tasks',
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // Template xác định (fallback khi không có AI / lỗi / timeout)
  // ---------------------------------------------------------------------------

  private templateSummary(
    subjectId: string,
    from: Date,
    to: Date,
    aggregate: FactsAggregate,
    sources: AssistantSource[],
    degradedReason: string,
  ): AssistantSummary {
    const fromLabel = from.toISOString().slice(0, 10);
    const toLabel = to.toISOString().slice(0, 10);
    const alertsTotal = Object.values(aggregate.alerts.byState).reduce(
      (acc, count) => acc + count,
      0,
    );
    const quality = aggregate.dataQuality;
    const incomplete = isIncompleteQuality(quality);
    const sourceLabel = quality.synthetic ? 'Dữ liệu mô phỏng' : 'Dữ liệu';

    let headline: string;
    if (aggregate.samples === 0) {
      headline = truncate(
        `${qualitySentence(quality)} Không có dữ liệu đo trong khoảng ${fromLabel} đến ${toLabel}.`,
        300,
      );
    } else {
      const parts = [
        `${sourceLabel} theo dõi ${fromLabel}–${toLabel}: ${aggregate.samples} mẫu đo`,
        `độ phủ ${quality.coveragePercent}%`,
      ];
      if (quality.gaps.count > 0) parts.push(`${quality.gaps.count} khoảng thiếu`);
      if (aggregate.heartRate) parts.push(`nhịp tim trung bình ${aggregate.heartRate.avg} bpm`);
      if (alertsTotal > 0) parts.push(`${alertsTotal} cảnh báo`);
      const prefix = incomplete ? `${qualitySentence(quality)} ` : '';
      headline = truncate(`${prefix}${parts.join(', ')}.`, 300);
    }

    const measurementBodyParts: string[] = [];
    if (aggregate.samples === 0) {
      measurementBodyParts.push(
        `Không có mẫu đo nào trong khoảng thời gian này (0/${quality.expectedCount} mẫu kỳ vọng, ${quality.gaps.count} khoảng thiếu dữ liệu).`,
      );
    } else {
      measurementBodyParts.push(
        `Có ${aggregate.samples}/${quality.expectedCount} mẫu đo, độ phủ ${quality.coveragePercent}%.`,
      );
      if (incomplete) {
        measurementBodyParts.push(
          `${qualitySentence(quality)} Các số dưới đây chỉ từ các mẫu đã nhận.`,
        );
      }
      if (quality.gaps.count > 0) {
        measurementBodyParts.push(`Khoảng thiếu: ${gapReasonText(quality.gaps.reasons)}.`);
      }
      if (quality.synthetic) {
        measurementBodyParts.push('Nguồn dữ liệu là mô phỏng, không phải số đo thật.');
      }
      if (quality.lastSeenAt) {
        measurementBodyParts.push(`Lần nhận cuối: ${quality.lastSeenAt}.`);
      }
      if (aggregate.heartRate) {
        measurementBodyParts.push(
          `Nhịp tim hợp lệ: ${aggregate.heartRate.validSamples} mẫu, trung bình ${aggregate.heartRate.avg} bpm (thấp nhất ${aggregate.heartRate.min}, cao nhất ${aggregate.heartRate.max}).`,
        );
      } else {
        measurementBodyParts.push('Không có mẫu nhịp tim hợp lệ để tổng hợp.');
      }
      measurementBodyParts.push(
        aggregate.batteryPercent === null
          ? 'Chưa có giá trị pin trong khoảng.'
          : `Pin ở mẫu gần nhất: ${aggregate.batteryPercent}%.`,
      );
      if (aggregate.steps !== null) {
        measurementBodyParts.push(`Số bước ước tính trong khoảng: ${aggregate.steps}.`);
      }
    }

    let alertsBody: string;
    if (alertsTotal === 0) {
      alertsBody = 'Không có cảnh báo nào trong khoảng.';
    } else {
      const parts = Object.entries(aggregate.alerts.byState).map(
        ([state, count]) => `${count} ${ALERT_STATE_LABELS[state] ?? state}`,
      );
      alertsBody = `${alertsTotal} cảnh báo trong khoảng (${parts.join(', ')}).`;
      const latest = aggregate.alerts.latest;
      if (latest) {
        alertsBody += ` Cảnh báo gần nhất: ${ALERT_TYPE_LABELS[latest.type] ?? latest.type} lúc ${latest.detectedAt} (${ALERT_STATE_LABELS[latest.state] ?? latest.state}).`;
      }
    }

    const tasksBody =
      aggregate.tasks.open === 0
        ? 'Không có công việc bảo trì đang mở.'
        : `Có ${aggregate.tasks.open} công việc bảo trì đang mở: ${aggregate.tasks.titles.join('; ')}.`;

    const sections: AssistantSection[] = [
      {
        kind: 'measurements',
        title: SECTION_KIND_LABELS['measurements']!,
        body: measurementBodyParts.join(' '),
        facts: this.measurementFacts(aggregate),
      },
      {
        kind: 'alerts',
        title: SECTION_KIND_LABELS['alerts']!,
        body: alertsBody,
        facts: this.alertFacts(aggregate),
      },
      {
        kind: 'tasks',
        title: SECTION_KIND_LABELS['tasks']!,
        body: tasksBody,
        facts: this.taskFacts(aggregate),
      },
      {
        kind: 'note',
        title: SECTION_KIND_LABELS['note']!,
        body: truncate(
          `${degradedReason}${quality.limitations.length > 0 ? ` Giới hạn dữ liệu: ${quality.limitations.join(' ')}` : ''} Bản tóm tắt này sinh từ mẫu xác định dựa trên số liệu đo, không qua mô hình AI.`,
          3000,
        ),
        facts: [],
      },
    ];

    return assistantSummarySchema.parse({
      subjectId,
      periodStart: from.toISOString(),
      periodEnd: to.toISOString(),
      generatedAt: new Date().toISOString(),
      status: 'degraded',
      provider: 'template',
      model: null,
      headline,
      sections,
      disclaimer: ASSISTANT_DISCLAIMER,
      sources,
      dataQuality: quality,
      degradedReason,
    });
  }

  // ---------------------------------------------------------------------------
  // AI path
  // ---------------------------------------------------------------------------

  private summaryUserPrompt(from: Date, to: Date, aggregate: FactsAggregate): string {
    return [
      `Khoảng thời gian: từ ${from.toISOString()} đến ${to.toISOString()}.`,
      'Hồ sơ: hồ sơ được theo dõi (không cung cấp tên).',
      'Dữ liệu tổng hợp duy nhất được dùng (không có dữ liệu thô nào khác):',
      JSON.stringify(aggregate, null, 2),
      'Đánh giá dataQuality: khi observedCount < expectedCount hoặc gaps.count > 0, phải nêu rõ "chỉ từ X mẫu, độ phủ Y%, Z khoảng thiếu" trước khi nêu số trung bình và không mô tả "bình thường"/"ổn định". Khi synthetic = true, ghi rõ "dữ liệu mô phỏng". Nêu lastSeenAt nếu có.',
      'Hãy viết bản tóm tắt bằng tiếng Việt theo đúng cấu trúc JSON đã nêu.',
    ].join('\n');
  }

  private askUserPrompt(
    question: string,
    from: Date,
    to: Date,
    aggregate: FactsAggregate,
  ): string {
    return [
      `Hồ sơ: hồ sơ được theo dõi (không cung cấp tên). Khoảng dữ liệu gần nhất: từ ${from.toISOString()} đến ${to.toISOString()}.`,
      `Câu hỏi: ${question}`,
      'Dữ liệu tổng hợp duy nhất được dùng:',
      JSON.stringify(aggregate, null, 2),
      'Đánh giá dataQuality: khi observedCount < expectedCount hoặc gaps.count > 0, phải nêu rõ "chỉ từ X mẫu, độ phủ Y%, Z khoảng thiếu" và không mô tả "bình thường"/"ổn định". Khi synthetic = true, ghi rõ "dữ liệu mô phỏng".',
      'Trả lời bằng tiếng Việt, chỉ dựa trên dữ liệu trên; trả về đúng JSON: {"answer": "..."}',
    ].join('\n');
  }

  private buildAiSummary(
    subjectId: string,
    from: Date,
    to: Date,
    sources: AssistantSource[],
    completion: AssistantCompletion,
    aggregate: FactsAggregate,
  ): AssistantSummary {
    let parsed: unknown;
    try {
      parsed = parseModelJson(completion.content);
    } catch {
      throw new AssistantAdapterError(
        'invalid_response',
        'Câu trả lời của AI không phải JSON hợp lệ.',
      );
    }
    const result = modelSummaryResponseSchema.safeParse(parsed);
    if (!result.success) {
      throw new AssistantAdapterError(
        'invalid_response',
        'Câu trả lời của AI không đúng cấu trúc.',
      );
    }
    const quality = aggregate.dataQuality;
    const incomplete = isIncompleteQuality(quality);
    const modelHeadline = sanitizeText(
      guardReassuringWording(result.data.headline, quality),
      300,
    );
    if (!modelHeadline) {
      throw new AssistantAdapterError('invalid_response', 'Tiêu đề tóm tắt của AI rỗng.');
    }
    // Bổ sung câu chất lượng dữ liệu xác định: model có thể bỏ sót trong câu chữ.
    const qualityPrefix: string[] = [];
    if (incomplete) qualityPrefix.push(qualitySentence(quality));
    if (quality.synthetic) qualityPrefix.push('Dữ liệu mô phỏng.');
    let headline = modelHeadline;
    if (qualityPrefix.length > 0) {
      headline = truncate(`${qualityPrefix.join(' ')} ${headline}`, 300);
    }
    const sections: AssistantSection[] = result.data.sections.map((section) => ({
      kind: section.kind,
      title: sanitizeText(section.title, 140) || SECTION_KIND_LABELS[section.kind]!,
      body:
        sanitizeText(guardReassuringWording(section.body, quality), 3000) ||
        'Không có nội dung.',
      facts: section.facts.map(toSafeFact),
    }));
    // Giữ câu chất lượng ở phần số liệu để người đọc thấy trước số trung bình.
    const measurements = sections.find((section) => section.kind === 'measurements');
    if (measurements) {
      const qualityNote = incomplete
        ? quality.synthetic
          ? `${qualitySentence(quality)} Dữ liệu mô phỏng.`
          : qualitySentence(quality)
        : quality.synthetic
          ? 'Dữ liệu mô phỏng.'
          : null;
      if (qualityNote) {
        measurements.body = truncate(`${qualityNote} ${measurements.body}`, 3000);
      }
    }
    return assistantSummarySchema.parse({
      subjectId,
      periodStart: from.toISOString(),
      periodEnd: to.toISOString(),
      generatedAt: new Date().toISOString(),
      status: 'ready',
      provider: completion.provider,
      model: completion.model,
      headline,
      sections,
      disclaimer: ASSISTANT_DISCLAIMER,
      sources,
      dataQuality: quality,
      degradedReason: null,
    });
  }

  private degradedReasonFor(error: unknown): string {
    if (error instanceof AssistantAdapterError) {
      switch (error.kind) {
        case 'timeout':
          return 'Hết thời gian chờ AI provider nên dùng mẫu tóm tắt xác định.';
        case 'invalid_response':
          return 'Câu trả lời của AI không đúng cấu trúc nên dùng mẫu tóm tắt xác định.';
        default:
          return 'Lỗi khi gọi AI provider nên dùng mẫu tóm tắt xác định.';
      }
    }
    return 'Lỗi khi gọi AI provider nên dùng mẫu tóm tắt xác định.';
  }

  private degradedCodeFor(error: unknown): string | null {
    if (error instanceof AssistantAdapterError) {
      if (error.kind === 'timeout') return 'adapter_timeout';
      if (error.kind === 'invalid_response') return 'model_response_invalid';
      return 'adapter_error';
    }
    return 'adapter_error';
  }

  // ---------------------------------------------------------------------------
  // Lưu vết và kiểm soát
  // ---------------------------------------------------------------------------

  private async persistSummary(
    subjectId: string,
    from: Date,
    to: Date,
    aggregate: FactsAggregate,
    summary: AssistantSummary,
  ): Promise<void> {
    await this.db.insert(aiSummaries).values({
      subjectId,
      periodStart: from,
      periodEnd: to,
      // Enum bảng không có 'degraded': degraded (fallback) lưu là 'failed'.
      status: summary.status === 'ready' ? 'ready' : 'failed',
      provider: summary.provider,
      model: summary.model,
      content: { headline: summary.headline, sections: summary.sections },
      aggregate,
      sourceRefs: summary.sources,
    });
  }

  private async auditAsk(
    userId: string,
    subjectId: string,
    provider: AssistantSummary['provider'],
    status: AssistantSummary['status'],
    degradedCode: string | null,
  ): Promise<void> {
    await this.audit.record({
      actorUserId: userId,
      actorKind: 'user',
      action: 'assistant.ask',
      targetType: 'subject',
      targetId: subjectId,
      outcome: 'success',
      metadata: {
        provider,
        status,
        ...(degradedCode ? { degradedReason: degradedCode } : {}),
      },
    });
  }

  private enforceRateLimit(userId: string): void {
    const now = Date.now();
    const recent = (this.askBuckets.get(userId) ?? []).filter(
      (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
    );
    if (recent.length >= RATE_LIMIT_MAX) {
      throw new AppError(
        'RATE_LIMITED',
        'Bạn đã gửi quá nhiều câu hỏi, vui lòng thử lại sau.',
        429,
        {
          windowSeconds: RATE_LIMIT_WINDOW_MS / 1000,
          maxPerWindow: RATE_LIMIT_MAX,
          // Giới hạn lưu trong bộ nhớ của MỘT tiến trình, không dùng chung giữa
          // nhiều instance; cần chốt giải pháp tập trung khi chạy nhiều tiến trình.
          scope: 'single_process_memory',
        },
      );
    }
    recent.push(now);
    this.askBuckets.set(userId, recent);
    if (this.askBuckets.size > RATE_LIMIT_BUCKETS_SOFT_MAX) {
      for (const [key, timestamps] of this.askBuckets) {
        if (timestamps.every((timestamp) => now - timestamp >= RATE_LIMIT_WINDOW_MS)) {
          this.askBuckets.delete(key);
        }
      }
    }
  }
}
