import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { AssistantAnswer, AssistantDataQuality, AssistantSummary } from '@annhien/contracts/assistant';
import { ASSISTANT_DISCLAIMER } from '@annhien/contracts/assistant';
import { Alert } from '../../components/Alert';
import { Button, ButtonLink } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { formatDateTime, formatRelativeTime, formatShortDate } from '../../lib/format';
import { getApiErrorMessage, isApiError } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { zodFieldErrorMap } from '../../lib/validation';
import { fetchOpenAlerts, fetchSubjectStatus } from '../dashboard/api';
import { useMe } from '../auth/useAuth';
import { useActiveSubject } from '../subjects/selection';
import { useSubjects } from '../subjects/useSubjects';
import { askAssistant, assistantAskSchema, assistantQueryKeys, fetchAssistantSummary } from './api';

/**
 * Badge nguồn trả lời — chữ là tín hiệu chính, màu chỉ hỗ trợ.
 * status=degraded hoặc provider=template → bản theo mẫu xác định, không qua mô hình AI.
 */
export function ProviderBadge({ status, provider }: { status: 'ready' | 'degraded'; provider: string }) {
  const degraded = status === 'degraded' || provider === 'template';
  return degraded ? (
    <StatusPill tone="sand">Tóm tắt theo mẫu</StatusPill>
  ) : (
    <StatusPill tone="teal">AI</StatusPill>
  );
}

function SourcesList({ sources }: { sources: AssistantSummary['sources'] }) {
  if (sources.length === 0) return null;
  return (
    <div className="ai-sources">
      <p className="ai-sources__label">Nguồn số liệu</p>
      <ul className="ai-sources__list">
        {sources.map((source, index) => (
          <li key={`${source.label}-${index}`}>
            {source.label}
            {source.at ? ` · ${formatDateTime(source.at)}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 403 là trạng thái quyền, không phải lỗi kỹ thuật: không mời người dùng thử lại vô ích. */
function isForbiddenError(error: unknown): boolean {
  return isApiError(error) && (error.status === 403 || error.code === 'FORBIDDEN');
}

const MEASUREMENTS_NOT_SHARED_TITLE = 'Chủ hồ sơ không chia sẻ số đo';
const MEASUREMENTS_NOT_SHARED_TEXT =
  'Chủ hồ sơ không chia sẻ số đo và lịch sử với bạn, nên trợ lý không có dữ liệu để tổng hợp. Cảnh báo đang mở vẫn hiển thị nếu bạn có quyền nhận cảnh báo.';
const ALERTS_FORBIDDEN_TEXT =
  'Bạn không có quyền xem cảnh báo của hồ sơ này. Hãy nhờ chủ hồ sơ chia sẻ quyền nhận cảnh báo nếu cần.';

/** Nhãn lý do khoảng thiếu — chữ là tín hiệu chính, không chỉ dựa vào màu. */
const GAP_REASON_LABELS: Record<string, string> = {
  no_data: 'không có dữ liệu',
  clock_unsynced: 'đồng hồ chưa đồng bộ',
  quarantined: 'mẫu bị cách ly',
};

function gapReasonsText(reasons: AssistantDataQuality['gaps']['reasons']): string {
  if (reasons.length === 0) return 'không rõ lý do';
  return reasons.map((reason) => GAP_REASON_LABELS[reason] ?? reason).join(', ');
}

/**
 * Khối "Chất lượng dữ liệu" — độ phủ, số mẫu, khoảng thiếu, lần nhận cuối và nguồn.
 * Mọi trạng thái đều có nhãn chữ; màu chỉ hỗ trợ, không phải tín hiệu duy nhất.
 */
export function DataQualityPanel({ quality }: { quality: AssistantDataQuality }) {
  const incomplete = quality.observedCount < quality.expectedCount || quality.gaps.count > 0;
  return (
    <div className="ai-insight" role="group" aria-label="Chất lượng dữ liệu">
      <h3 className="ai-insight__title">Chất lượng dữ liệu</h3>
      <dl className="ai-facts">
        <div>
          <dt>Độ phủ dữ liệu</dt>
          <dd>
            {quality.coveragePercent}% · {quality.observedCount}/{quality.expectedCount} mẫu kỳ vọng
          </dd>
        </div>
        <div>
          <dt>Số mẫu đã nhận</dt>
          <dd>{quality.observedCount}</dd>
        </div>
        <div>
          <dt>Khoảng thiếu dữ liệu</dt>
          <dd>
            {quality.gaps.count === 0
              ? 'Không có khoảng thiếu'
              : `${quality.gaps.count} khoảng (${gapReasonsText(quality.gaps.reasons)})`}
          </dd>
        </div>
        <div>
          <dt>Lần nhận cuối</dt>
          <dd>{quality.lastSeenAt ? formatDateTime(quality.lastSeenAt) : 'Chưa có mẫu'}</dd>
        </div>
        <div>
          <dt>Nguồn dữ liệu</dt>
          <dd>{quality.synthetic ? 'Dữ liệu mô phỏng' : 'Dữ liệu thiết bị'}</dd>
        </div>
      </dl>
      {incomplete || quality.synthetic ? (
        <Alert
          tone="warning"
          title={quality.synthetic ? 'Dữ liệu mô phỏng' : 'Dữ liệu chưa đầy đủ'}
        >
          {quality.synthetic ? 'Đây là dữ liệu mô phỏng, không phải số đo thật. ' : null}
          {incomplete
            ? `Chỉ từ ${quality.observedCount} mẫu, độ phủ ${quality.coveragePercent}%, ${quality.gaps.count} khoảng thiếu.`
            : null}
        </Alert>
      ) : null}
      {quality.limitations.length > 0 ? (
        <ul className="ai-sources__list">
          {quality.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Dòng chất lượng ngắn trong bản tin đầu: đủ nhãn nguồn/độ phủ, chi tiết nằm trong <details>. */
function QualityLine({ quality }: { quality: AssistantDataQuality }) {
  const incomplete = quality.observedCount < quality.expectedCount || quality.gaps.count > 0;
  return (
    <p className="ai-quality-line">
      <StatusPill tone={quality.synthetic ? 'sand' : 'neutral'}>
        {quality.synthetic ? 'Dữ liệu mô phỏng' : 'Dữ liệu thiết bị'}
      </StatusPill>
      <span>
        Độ phủ {quality.coveragePercent}% · {quality.observedCount}/{quality.expectedCount} mẫu
        {incomplete
          ? ` · ${quality.gaps.count} khoảng thiếu`
          : ' · không có khoảng thiếu'}
      </span>
    </p>
  );
}

/** Disclaimer bắt buộc — mọi bản tóm tắt/câu trả lời đều hiển thị cùng một ranh giới. */
function Disclaimer() {
  return <p className="ai-disclaimer">{ASSISTANT_DISCLAIMER}</p>;
}

/** Đổi ISO trong câu do backend sinh sang định dạng người đọc, không đổi nội dung số liệu. */
function humanizeDates(text: string): string {
  return text
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, (iso) => formatDateTime(iso))
    .replace(
      /(\d{4})-(\d{2})-(\d{2})\s*[–-]\s*(\d{4})-(\d{2})-(\d{2})/g,
      (_match, y1, m1, d1, y2, m2, d2) => `${d1}/${m1}/${y1} – ${d2}/${m2}/${y2}`,
    )
    .replace(/(\d{4})-(\d{2})-(\d{2})/g, (_match, y, m, d) => `${d}/${m}/${y}`);
}

/**
 * Bản tin đầu chỉ hiện câu đầu tiên (thường là caveat độ phủ do backend sinh).
 * Toàn văn headline vẫn nằm trong <details>; không cắt số liệu khỏi nguồn.
 */
function splitHeadline(text: string): { short: string; full: string } {
  const full = humanizeDates(text)
    .replace(/^Dữ liệu (?:mô phỏng )?theo dõi .*?:\s*/i, '')
    .trim();
  const first = full.match(/^.+?[.!?](?=\s|$)/)?.[0]?.trim();
  return { short: first && first.length >= 40 ? first : full, full };
}

type SummaryFact = AssistantSummary['sections'][number]['facts'][number];

function findFact(summary: AssistantSummary, labels: string[]): SummaryFact | undefined {
  for (const section of summary.sections) {
    const fact = section.facts.find((item) => labels.includes(item.label));
    if (fact) return fact;
  }
  return undefined;
}

function factText(fact: SummaryFact | undefined): string {
  if (!fact) return '—';
  return `${String(fact.value)}${fact.unit ? ` ${fact.unit}` : ''}`;
}

function AnswerView({ answer }: { answer: AssistantAnswer }) {
  return (
    <div className="ai-answer assistant-msg assistant-msg--assistant">
      <div className="ai-answer__meta">
        <p className="assistant-msg__label">Trợ lý</p>
        <ProviderBadge status={answer.status} provider={answer.provider} />
        {answer.model ? <span className="ai-answer__model">mô hình {answer.model}</span> : null}
      </div>
      {answer.status === 'degraded' && answer.degradedReason ? (
        <Alert tone="warning" title="Trợ lý đang dùng bản theo mẫu">
          {answer.degradedReason}
        </Alert>
      ) : null}
      <p className="ai-answer__text">{answer.answer}</p>
      {answer.dataQuality ? <DataQualityPanel quality={answer.dataQuality} /> : null}
      <SourcesList sources={answer.sources} />
      <Disclaimer />
    </div>
  );
}

/** Câu hỏi gợi ý ngắn, bám dữ liệu trợ lý thực sự nhận được.
 * Nhãn hiển thị ngắn để vừa hàng gợi ý; câu hỏi đầy đủ vẫn được điền vào ô hỏi.
 */
const SUGGESTED_QUESTIONS = [
  { label: 'Nhịp tim?', question: 'Nhịp tim tuần này thế nào?' },
  { label: 'Cảnh báo?', question: 'Có cảnh báo nào đang mở không?' },
  { label: 'Pin?', question: 'Pin thiết bị gần nhất còn bao nhiêu?' },
];

type ConversationTurn = {
  id: string;
  question: string;
  answer: AssistantAnswer;
};

/**
 * Cột "Bối cảnh": chỉ đọc, không thay thế cảnh báo và không tự xác nhận/đóng.
 * `details` mở sẵn trên desktop; trên mobile thu gọn để hội thoại là trung tâm.
 */
function useWideContext(): boolean {
  const [wide, setWide] = useState(() =>
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 1024px)').matches
      : true,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(min-width: 1024px)');
    const onChange = (event: MediaQueryListEvent) => setWide(event.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);
  return wide;
}

function ContextPanel({ subjectId, subjectName, role, canViewMeasurements, canReceiveAlerts, historyDays }: {
  subjectId: string;
  subjectName: string;
  role: 'owner' | 'caregiver';
  canViewMeasurements: boolean;
  canReceiveAlerts: boolean;
  historyDays: number;
}) {
  const wide = useWideContext();
  const alerts = useQuery({
    queryKey: queryKeys.dashboardOpenAlerts(subjectId),
    queryFn: ({ signal }) => fetchOpenAlerts(subjectId, 20, signal),
    enabled: canReceiveAlerts,
    staleTime: 15_000,
  });
  const status = useQuery({
    queryKey: queryKeys.subjectStatus(subjectId),
    queryFn: ({ signal }) => fetchSubjectStatus(subjectId, signal),
    enabled: canViewMeasurements,
    staleTime: 15_000,
  });

  const alertItems = alerts.data?.items ?? [];
  const alertCount = `${alertItems.length}${alerts.data?.nextCursor ? '+' : ''}`;
  const devices = status.data?.devices ?? [];
  const latestSeen = devices.reduce<string | null>((latest, device) => {
    if (!device.lastSeenAt) return latest;
    if (!latest) return device.lastSeenAt;
    return new Date(device.lastSeenAt).getTime() > new Date(latest).getTime()
      ? device.lastSeenAt
      : latest;
  }, null);
  const latestSeenRelative = formatRelativeTime(latestSeen);

  return (
    <details className="assistant-context" open={wide}>
      <summary className="assistant-context__summary">
        <span className="assistant-context__summary-title">Bối cảnh</span>
        <span className="assistant-context__summary-meta">{subjectName}</span>
      </summary>
      <div className="assistant-context__body">
        <h2 id="assistant-context-heading" className="section-title assistant-context__title">
          Bối cảnh
        </h2>

        <section className="assistant-context__card" aria-labelledby="context-subject-heading">
          <h3 id="context-subject-heading" className="assistant-context__heading">
            Hồ sơ đang xem
          </h3>
          <p className="assistant-context__name">{subjectName}</p>
          <p className="assistant-context__meta">
            {role === 'owner' ? 'Bạn là chủ hồ sơ' : 'Bạn là người thân được chia sẻ quyền'}
            {role === 'caregiver' ? ` · lịch sử ${historyDays} ngày` : ''}
          </p>
          <Link className="assistant-context__link" to="/app/subjects">
            Quản lý hồ sơ
          </Link>
        </section>

        <section className="assistant-context__card" aria-labelledby="context-alerts-heading">
          <h3 id="context-alerts-heading" className="assistant-context__heading">
            Cảnh báo đang mở
          </h3>
          {!canReceiveAlerts ? (
            <p className="assistant-context__meta">{ALERTS_FORBIDDEN_TEXT}</p>
          ) : alerts.isPending ? (
            <p className="assistant-context__meta" role="status">
              Đang tải cảnh báo…
            </p>
          ) : alerts.isError && isForbiddenError(alerts.error) ? (
            <p className="assistant-context__meta">{ALERTS_FORBIDDEN_TEXT}</p>
          ) : alerts.isError ? (
            <>
              <p className="assistant-context__meta">Chưa tải được số cảnh báo đang mở.</p>
              <Button variant="subtle" size="sm" onClick={() => void alerts.refetch()}>
                Thử lại
              </Button>
            </>
          ) : alertItems.length === 0 ? (
            <p className="assistant-context__meta">Không có cảnh báo đang mở.</p>
          ) : (
            <>
              <p className="assistant-context__value">
                <StatusPill tone="brick">{alertCount} cảnh báo</StatusPill>
              </p>
              {alertItems[0] ? (
                <p className="assistant-context__meta">
                  Gần nhất:{' '}
                  <Link className="assistant-context__link" to={`/app/alerts/${alertItems[0].id}`}>
                    {alertItems[0].type === 'sos' ? 'Yêu cầu trợ giúp' : 'Nghi ngã'}
                  </Link>{' '}
                  · {formatDateTime(alertItems[0].detectedAt)}
                </p>
              ) : null}
            </>
          )}
          <Link className="assistant-context__link" to="/app/alerts">
            Xem tất cả cảnh báo
          </Link>
        </section>

        <section className="assistant-context__card" aria-labelledby="context-seen-heading">
          <h3 id="context-seen-heading" className="assistant-context__heading">
            Lần nhận dữ liệu cuối
          </h3>
          {!canViewMeasurements ? (
            <p className="assistant-context__meta">
              Chủ hồ sơ không chia sẻ số đo và thời điểm nhận dữ liệu với bạn.
            </p>
          ) : status.isPending ? (
            <p className="assistant-context__meta" role="status">
              Đang kiểm tra kết nối…
            </p>
          ) : status.isError ? (
            <>
              <p className="assistant-context__meta">Chưa có thông tin kết nối.</p>
              <Button variant="subtle" size="sm" onClick={() => void status.refetch()}>
                Thử lại
              </Button>
            </>
          ) : !latestSeen ? (
            <p className="assistant-context__meta">Chưa nhận dữ liệu từ thiết bị.</p>
          ) : (
            <p className="assistant-context__meta">
              {latestSeenRelative ? `${latestSeenRelative} · ` : ''}
              {formatDateTime(latestSeen)}
            </p>
          )}
        </section>

        <nav className="assistant-context__card" aria-labelledby="context-links-heading">
          <h3 id="context-links-heading" className="assistant-context__heading">
            Đi tới
          </h3>
          <ul className="assistant-links">
            <li>
              <Link to="/app/overview">Tổng quan</Link>
            </li>
            <li>
              <Link to="/app/history">Lịch sử đo</Link>
            </li>
            <li>
              <Link to="/app/alerts">Cảnh báo</Link>
            </li>
            <li>
              <Link to="/app/subjects">Hồ sơ</Link>
            </li>
            <li>
              <Link to="/app/devices">Thiết bị</Link>
            </li>
          </ul>
        </nav>

        <p className="assistant-context__note">
          Cảnh báo được tạo và cập nhật độc lập với trợ lý. Trợ lý không tự xác nhận hay đóng cảnh
          báo — hãy xử lý ở màn hình Cảnh báo.
        </p>
      </div>
    </details>
  );
}

/**
 * `/app` — không gian trợ lý (trung tâm sản phẩm).
 * - Chat-first: cột hội thoại là chính, cột "Bối cảnh" bên phải trên desktop và thu
 *   gọn trên mobile. Hội thoại giữ trong phiên: mỗi câu trả lời nối tiếp, không thay
 *   thế câu trước.
 * - Chỉ gọi API khi hồ sơ đang chọn có quyền xem AI (owner hoặc caregiver `canViewAi`);
 *   không có quyền → thông báo rõ, không gọi API.
 * - Tóm tắt 7 ngày mặc định; hỏi đáp 3..500 ký tự; 429 → thông báo giới hạn tần suất.
 * - Không hiển thị HTML từ câu trả lời (chỉ text, giữ xuống dòng); không có nút chẩn đoán.
 * - Cảnh báo vẫn độc lập: trợ lý không tự xác nhận/đóng, mọi hành động dẫn sang màn hình
 *   tương ứng để người dùng chủ động xử lý.
 */
export function AssistantPage() {
  const me = useMe();
  const subjects = useSubjects();
  const activeSubject = useActiveSubject(subjects.data);

  const aiSubjects = (subjects.data ?? []).filter(
    (subject) => subject.role === 'owner' || subject.permissions.canViewAi,
  );
  const allowedSubject =
    activeSubject && aiSubjects.some((subject) => subject.id === activeSubject.id)
      ? activeSubject
      : null;

  const summary = useQuery({
    queryKey: allowedSubject
      ? assistantQueryKeys.summary(allowedSubject.id)
      : ['assistant', 'none', 'summary'],
    queryFn: ({ signal }) =>
      allowedSubject ? fetchAssistantSummary(allowedSubject.id, signal) : null,
    enabled: Boolean(allowedSubject),
    staleTime: 30_000,
  });

  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [fieldErrors, setFieldErrors] = useState<{ fields: Record<string, string>; general: string[] }>({
    fields: {},
    general: [],
  });
  const subjectId = allowedSubject?.id ?? null;
  // Hội thoại thuộc về đúng một hồ sơ. SubjectSwitcher đổi hồ sơ mà không đổi
  // pathname, nên phải reset ngay trong render để không lộ câu trả lời của hồ sơ
  // cũ dưới hồ sơ mới (kể cả trước khi effect chạy).
  const [threadSubjectId, setThreadSubjectId] = useState(subjectId);
  if (threadSubjectId !== subjectId) {
    setThreadSubjectId(subjectId);
    setTurns([]);
    setQuestion('');
    setFieldErrors({ fields: {}, general: [] });
  }
  const currentSubjectIdRef = useRef(subjectId);
  currentSubjectIdRef.current = subjectId;
  const turnCounter = useRef(0);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const ask = useMutation({
    mutationFn: (input: { subjectId: string; question: string }) =>
      askAssistant(input.subjectId, { question: input.question }),
    onSuccess: (answer, input) => {
      // Hồ sơ đã đổi trong lúc chờ: bỏ kết quả của hồ sơ cũ, không append nhầm.
      if (input.subjectId !== currentSubjectIdRef.current) return;
      turnCounter.current += 1;
      setTurns((previous) => [
        ...previous,
        { id: `turn-${turnCounter.current}`, question: input.question, answer },
      ]);
      setQuestion('');
      setFieldErrors({ fields: {}, general: [] });
    },
  });

  // Reset trạng thái mutation của hồ sơ cũ sau khi render đã sạch; onSuccess ở
  // trên vẫn là lớp chặn cuối nếu phản hồi về muộn.
  useEffect(() => {
    ask.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  const askPending = ask.isPending && ask.variables?.subjectId === subjectId;
  const askError = ask.isError && ask.variables?.subjectId === subjectId ? ask.error : null;

  // Cuộn vừa đủ tới câu trả lời mới; block "nearest" không nhảy trang khi đã thấy.
  useEffect(() => {
    if (turns.length === 0 && !askPending) return;
    threadEndRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [turns.length, askPending]);

  // Admin không có hồ sơ: /app (trợ lý) không có dữ liệu để hiển thị. Đưa thẳng
  // về trang quản trị, giống hành vi cũ của tổng quan.
  if (me.data?.user.role === 'admin' && subjects.isSuccess && subjects.data.length === 0) {
    return <Navigate to="/app/admin" replace />;
  }

  if (subjects.isPending) {
    return <PageLoader label="Đang kiểm tra quyền…" />;
  }

  if (subjects.isError) {
    return (
      <div className="stack">
        <header>
          <h1 className="page-title">Trợ lý</h1>
        </header>
        <Alert tone="error" title="Không tải được danh sách hồ sơ">
          Kiểm tra kết nối rồi thử lại. Trợ lý không gọi API khi chưa xác định được quyền.
        </Alert>
        <div>
          <Button variant="secondary" onClick={() => void subjects.refetch()}>
            Thử lại
          </Button>
        </div>
      </div>
    );
  }

  if (!activeSubject) {
    return (
      <div className="stack">
        <header>
          <h1 className="page-title">Trợ lý</h1>
          <p className="page-lead">
            Hỏi về số liệu theo dõi, xem cảnh báo đang mở và mở nhanh các màn hình cần xử lý.
          </p>
        </header>
        <EmptyState
          title="Chưa có hồ sơ để dùng trợ lý"
          description="Tạo hồ sơ cho người cần theo dõi để trợ lý tổng hợp số liệu đo."
          action={<ButtonLink to="/app/subjects">Tạo hồ sơ</ButtonLink>}
        />
      </div>
    );
  }

  const handleAsk = (event: FormEvent) => {
    event.preventDefault();
    const parsed = assistantAskSchema.safeParse({ question });
    if (!parsed.success) {
      setFieldErrors(
        zodFieldErrorMap(parsed.error, { question }, {
          question: (issue, value) => {
            const text = String(value ?? '').trim();
            if (text === '') return 'Vui lòng nhập câu hỏi.';
            if (issue.code === 'too_small') return 'Câu hỏi quá ngắn (tối thiểu 3 ký tự).';
            if (issue.code === 'too_big') return 'Câu hỏi quá dài (tối đa 500 ký tự).';
            return 'Câu hỏi chưa hợp lệ.';
          },
        }),
      );
      return;
    }
    if (!allowedSubject) return;
    setFieldErrors({ fields: {}, general: [] });
    ask.mutate({ subjectId: allowedSubject.id, question: parsed.data.question });
  };

  if (!allowedSubject) {
    return (
      <div className="stack">
        <header>
          <h1 className="page-title">Trợ lý</h1>
          <p className="page-lead">
            Hỏi về số liệu theo dõi của người thân. Trợ lý không chẩn đoán, không kê đơn.
          </p>
        </header>
        <Alert tone="info" title="Hồ sơ đang chọn chưa bật trợ lý AI">
          {aiSubjects.length > 0 ? (
            <>
              Chọn hồ sơ khác ở đầu trang (chủ hồ sơ hoặc người thân được chia sẻ quyền xem AI) để
              dùng trợ lý.
            </>
          ) : (
            <>
              Bạn chưa có hồ sơ nào bật quyền xem AI. Chủ hồ sơ có thể bật <strong>canViewAi</strong>{' '}
              khi chia sẻ quyền theo dõi.
            </>
          )}
        </Alert>
        <div>
          <ButtonLink to="/app/subjects" variant="secondary">
            Quản lý hồ sơ
          </ButtonLink>
        </div>
      </div>
    );
  }

  const summaryData = summary.data;
  const noData = summaryData
    ? summaryData.sections.some((section) => section.body.includes('Không có mẫu đo nào'))
    : false;
  const headlineParts = summaryData ? splitHeadline(summaryData.headline) : null;
  const canViewMeasurements = allowedSubject.permissions.canViewMeasurements !== false;
  const summaryForbidden = summary.isError && isForbiddenError(summary.error);
  const askForbidden = askError !== null && isForbiddenError(askError);
  const questionsBlocked = summaryForbidden || askForbidden;

  return (
    <div className="stack assistant">
      <header className="assistant__header">
        <p className="assistant__eyebrow">Không gian trợ lý</p>
        <h1 className="page-title">Trợ lý</h1>
        <p className="page-lead">
          Hỏi về số liệu theo dõi của <strong>{allowedSubject.displayName}</strong>.
        </p>
      </header>

      <div className="assistant__layout">
        <div className="assistant__main">
          <Card className="assistant-chat">
            <div className="assistant-chat__head">
              <div>
                <h2 id="assistant-conversation-heading" className="section-title">
                  Hội thoại
                </h2>
                <p className="assistant-chat__hint">
                  Dữ liệu đã kiểm quyền · hội thoại trong phiên.
                </p>
              </div>
              {summaryForbidden ? null : (
                <Button variant="subtle" size="sm" onClick={() => void summary.refetch()}>
                  Làm mới
                </Button>
              )}
            </div>

            <div className="assistant-composer">
              <div className="ai-suggestions" aria-label="Gợi ý câu hỏi">
                {SUGGESTED_QUESTIONS.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    className="ai-suggestion"
                    title={suggestion.question}
                    onClick={() => setQuestion(suggestion.question)}
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
              <form className="ai-ask-form" onSubmit={handleAsk} noValidate>
                <div className="field assistant-composer__field">
                  <label className="field__label" htmlFor="assistant-question">
                    Câu hỏi <span className="field__required" aria-hidden="true"> *</span>
                  </label>
                  <p className="field__hint" id="assistant-question-hint">
                    3–500 ký tự · tối đa 10 câu hỏi mỗi 5 phút.
                  </p>
                </div>
                <div className="assistant-composer__row">
                  <textarea
                    id="assistant-question"
                    className={`field__input${fieldErrors.fields.question ? ' field__input--error' : ''}`}
                    aria-invalid={fieldErrors.fields.question ? true : undefined}
                    aria-describedby="assistant-question-hint"
                    placeholder="Nhập câu hỏi…"
                    rows={1}
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    maxLength={600}
                  />
                  <Button
                    type="submit"
                    aria-label={askPending ? 'Đang trả lời câu hỏi' : 'Gửi câu hỏi'}
                    disabled={askPending || questionsBlocked}
                  >
                    <span className="assistant-send__desktop">
                      {askPending ? 'Đang trả lời…' : 'Gửi câu hỏi'}
                    </span>
                    <span className="assistant-send__mobile" aria-hidden="true">
                      {askPending ? 'Đang gửi…' : 'Gửi'}
                    </span>
                  </Button>
                </div>
                {fieldErrors.fields.question ? (
                  <p className="field__error" role="alert">
                    {fieldErrors.fields.question}
                  </p>
                ) : null}
                {fieldErrors.general.length > 0 ? (
                  <p className="field__error" role="alert">
                    {fieldErrors.general.join(' ')}
                  </p>
                ) : null}
                {askError ? (
                  isForbiddenError(askError) ? (
                    <Alert tone="info" title={MEASUREMENTS_NOT_SHARED_TITLE}>
                      {MEASUREMENTS_NOT_SHARED_TEXT}
                    </Alert>
                  ) : isApiError(askError) && askError.code === 'RATE_LIMITED' ? (
                    <Alert tone="warning" title="Đã đạt giới hạn câu hỏi">
                      {getApiErrorMessage(askError)} Vui lòng thử lại sau vài phút.
                    </Alert>
                  ) : (
                    <Alert tone="error" title="Không trả lời được">
                      {getApiErrorMessage(askError)} Hãy thử lại.
                    </Alert>
                  )
                ) : null}
                {questionsBlocked ? (
                  <p className="field__hint">
                    Trợ lý cần quyền xem số đo để trả lời. Hãy nhờ chủ hồ sơ chia sẻ quyền này.
                  </p>
                ) : null}
              </form>
            </div>

            <div
              className="assistant-thread"
              role="log"
              aria-labelledby="assistant-conversation-heading"
              aria-busy={askPending}
            >
              {summary.isPending ? (
                <PageLoader label="Đang tổng hợp số liệu…" />
              ) : summary.isError && isForbiddenError(summary.error) ? (
                <div className="assistant-turn">
                  <div className="assistant-msg assistant-msg--assistant">
                    <p className="assistant-msg__label">Trợ lý</p>
                    <Alert tone="info" title={MEASUREMENTS_NOT_SHARED_TITLE}>
                      {MEASUREMENTS_NOT_SHARED_TEXT}
                    </Alert>
                  </div>
                </div>
              ) : summary.isError ? (
                <div className="assistant-turn">
                  <div className="assistant-msg assistant-msg--assistant">
                    <p className="assistant-msg__label">Trợ lý</p>
                    <Alert tone="error" title="Không tải được tóm tắt số liệu">
                      {getApiErrorMessage(summary.error)}
                    </Alert>
                    <div>
                      <Button variant="secondary" size="sm" onClick={() => void summary.refetch()}>
                        Thử lại
                      </Button>
                    </div>
                  </div>
                </div>
              ) : summaryData ? (
                <article className="assistant-turn">
                  <div className="assistant-msg assistant-msg--assistant">
                    <div className="assistant-msg__head">
                      <p className="assistant-msg__label">Trợ lý</p>
                      <ProviderBadge status={summaryData.status} provider={summaryData.provider} />
                      {summaryData.model ? (
                        <span className="ai-answer__model">mô hình {summaryData.model}</span>
                      ) : null}
                    </div>
                    <div className="ai-summary">
                      <div className="ai-summary__top">
                        <div>
                          <p className="ai-summary__period">
                            {formatShortDate(summaryData.periodStart)} –{' '}
                            {formatShortDate(summaryData.periodEnd)}
                          </p>
                          <p className="ai-summary__stamp">
                            Tạo lúc {formatDateTime(summaryData.generatedAt)} · 7 ngày gần nhất
                          </p>
                        </div>
                      </div>
                      <p className="ai-summary__headline">{headlineParts?.short}</p>
                      {noData ? (
                        <Alert tone="info" title="Chưa có đủ dữ liệu để tóm tắt">
                          Hồ sơ chưa có mẫu đo trong khoảng thời gian này — trợ lý không bịa số
                          liệu. Bạn có thể thử lại sau khi thiết bị gửi dữ liệu.
                        </Alert>
                      ) : null}
                      <div className="ai-stat-grid">
                        <div className="ai-stat">
                          <p className="ai-stat__label">Nhịp tim trung bình</p>
                          <p className="ai-stat__value">
                            {factText(findFact(summaryData, ['Nhịp tim trung bình', 'Trung bình']))}
                          </p>
                        </div>
                        <div className="ai-stat">
                          <p className="ai-stat__label">Mẫu đo</p>
                          <p className="ai-stat__value">
                            {factText(findFact(summaryData, ['Số mẫu đo', 'Số mẫu']))}
                          </p>
                        </div>
                        <div className="ai-stat">
                          <p className="ai-stat__label">Cảnh báo đang mở</p>
                          <p className="ai-stat__value">
                            {factText(findFact(summaryData, ['Cảnh báo đang mở']))}
                          </p>
                        </div>
                        <div className="ai-stat">
                          <p className="ai-stat__label">Pin gần nhất</p>
                          <p className="ai-stat__value">
                            {factText(findFact(summaryData, ['Pin mẫu gần nhất', 'Pin gần nhất']))}
                          </p>
                        </div>
                      </div>
                      {summaryData.dataQuality ? (
                        <QualityLine quality={summaryData.dataQuality} />
                      ) : null}
                      <details className="ai-details">
                        <summary>Chất lượng dữ liệu, nguồn và chi tiết số liệu</summary>
                        {summaryData.status === 'degraded' && summaryData.degradedReason ? (
                          <Alert tone="warning" title="Đang dùng bản theo mẫu">
                            {summaryData.degradedReason}
                          </Alert>
                        ) : null}
                        {summaryData.dataQuality ? (
                          <DataQualityPanel quality={summaryData.dataQuality} />
                        ) : null}
                        {headlineParts && headlineParts.full !== headlineParts.short ? (
                          <p className="ai-details__note">Bản tin đầy đủ: {headlineParts.full}</p>
                        ) : null}
                        <div className="ai-facts">
                          {summaryData.sections
                            .filter((section) => section.facts.length > 0)
                            .map((section) => (
                              <div key={`facts-${section.kind}`} className="ai-facts__group">
                                <h4>{section.title}</h4>
                                <dl>
                                  {section.facts.map((fact, index) => (
                                    <div key={`${fact.label}-${index}`}>
                                      <dt>{fact.label}</dt>
                                      <dd>
                                        {String(fact.value)}
                                        {fact.unit ? ` ${fact.unit}` : ''}
                                      </dd>
                                    </div>
                                  ))}
                                </dl>
                              </div>
                            ))}
                        </div>
                        <div className="ai-insights">
                          {summaryData.sections
                            .filter((section) => section.kind !== 'note')
                            .map((section) => (
                              <div key={`${section.kind}-${section.title}`} className="ai-insight">
                                <h3 className="ai-insight__title">{section.title}</h3>
                                <p className="ai-insight__body">{humanizeDates(section.body)}</p>
                              </div>
                            ))}
                        </div>
                        <SourcesList sources={summaryData.sources} />
                        {summaryData.sections.find((section) => section.kind === 'note') ? (
                          <p className="ai-details__note">
                            {humanizeDates(
                              summaryData.sections.find((section) => section.kind === 'note')
                                ?.body ?? '',
                            )}
                          </p>
                        ) : null}
                      </details>
                      <Disclaimer />
                    </div>
                  </div>
                </article>
              ) : null}

              {turns.map((turn) => (
                <article key={turn.id} className="assistant-turn">
                  <div className="assistant-msg assistant-msg--user">
                    <p className="assistant-msg__label">Bạn</p>
                    <p className="assistant-msg__text">{turn.question}</p>
                  </div>
                  <AnswerView answer={turn.answer} />
                </article>
              ))}

              {askPending && ask.variables ? (
                <div className="assistant-msg assistant-msg--assistant assistant-msg--pending">
                  <p className="assistant-msg__label">Trợ lý</p>
                  <p className="assistant-msg__text" role="status">
                    Đang trả lời…
                  </p>
                </div>
              ) : null}
              <div ref={threadEndRef} />
            </div>

          </Card>
        </div>

        <aside className="assistant__aside">
          <ContextPanel
            subjectId={allowedSubject.id}
            subjectName={allowedSubject.displayName}
            role={allowedSubject.role}
            canViewMeasurements={canViewMeasurements}
            canReceiveAlerts={
              allowedSubject.role === 'owner' || allowedSubject.permissions.canReceiveAlerts
            }
            historyDays={allowedSubject.permissions.historyDays}
          />
        </aside>
      </div>
    </div>
  );
}
