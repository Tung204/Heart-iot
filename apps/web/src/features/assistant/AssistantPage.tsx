import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { AssistantAnswer } from '@annhien/contracts/assistant';
import { Alert } from '../../components/Alert';
import { Button, ButtonLink } from '../../components/Button';
import { StatusPill } from '../../components/StatusPill';
import { formatDateTime, formatTime } from '../../lib/format';
import { getApiErrorMessage, isApiError } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { zodFieldErrorMap } from '../../lib/validation';
import { fetchOpenAlerts, fetchSubjectStatus } from '../dashboard/api';
import { ALERT_TYPE_LABELS } from '../alerts/labels';
import { toTelHref } from '../contacts/phone';
import { useEmergencyContacts } from '../contacts/useEmergencyContacts';
import { useMe } from '../auth/useAuth';
import { useActiveSubject } from '../subjects/selection';
import { useSubjects } from '../subjects/useSubjects';
import { SubjectSwitcher } from '../subjects/SubjectSwitcher';
import { askAssistant, assistantAskSchema } from './api';

/** Cùng cỡ danh sách với badge điều hướng để hai nơi dùng chung một lần tải. */
const OPEN_ALERTS_LIMIT = 20;

/** 403 là trạng thái quyền, không phải lỗi kỹ thuật: không mời người dùng thử lại vô ích. */
function isForbiddenError(error: unknown): boolean {
  return isApiError(error) && (error.status === 403 || error.code === 'FORBIDDEN');
}

const ALERTS_FORBIDDEN_TEXT = 'Bạn không có quyền xem cảnh báo của hồ sơ này.';
const MEASUREMENTS_FORBIDDEN_TEXT = 'Bạn chưa được xem số đo của hồ sơ này.';
const MEASUREMENTS_NOT_SHARED_TITLE = 'Chủ hồ sơ không chia sẻ số đo';
const MEASUREMENTS_NOT_SHARED_TEXT =
  'Bạn chưa được xem số đo của hồ sơ này nên chưa thể hỏi trợ lý.';
const TODAY_LIMIT_NOTE = 'Dữ liệu mô phỏng · không thay thế cấp cứu.';

/** Ngưỡng dự phòng khi policy chưa tải được; server vẫn quyết định freshness. */
const OFFLINE_FALLBACK_SECONDS = 300;

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

function SourcesList({ sources }: { sources: AssistantAnswer['sources'] }) {
  if (sources.length === 0) return null;
  return (
    <div className="today-answer__sources">
      <p className="today-answer__sources-label">Nguồn số liệu</p>
      <ul>
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

function AnswerView({ answer }: { answer: AssistantAnswer }) {
  return (
    <div className="assistant-msg assistant-msg--assistant">
      <div className="assistant-msg__head">
        <p className="assistant-msg__label">Trợ lý</p>
        <ProviderBadge status={answer.status} provider={answer.provider} />
        {answer.dataQuality?.synthetic ? (
          <StatusPill tone="sand">Dữ liệu mô phỏng</StatusPill>
        ) : null}
      </div>
      <p className="ai-answer__text">{answer.answer}</p>
      <p className="assistant-msg__disclaimer">{answer.disclaimer}</p>
      <SourcesList sources={answer.sources} />
    </div>
  );
}

/** Câu hỏi gợi ý ngắn; câu hỏi đầy đủ vẫn được điền vào ô hỏi khi bấm. */
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

type TodayStatus = {
  tone: 'calm' | 'alert' | 'muted' | 'error';
  text: string;
  /** Dòng phụ cho tín hiệu an toàn (ví dụ thiết bị ngoại tuyến) khi thẻ chính là cảnh báo. */
  detail?: string;
  action?: ReactNode;
};

/**
 * `/app` — Hôm nay: màn mặc định, chỉ trả lời bốn câu hỏi.
 * - Ai: tên hồ sơ đang xem (SubjectSwitcher).
 * - Hôm nay thế nào: một thẻ trạng thái ngắn từ status + cảnh báo đang mở.
 * - Cần làm gì: hành động chính ngay trong thẻ (xem cảnh báo, kiểm tra thiết bị).
 * - Hỏi ở đâu: ô hỏi trợ lý; hội thoại chỉ xuất hiện sau câu hỏi đầu tiên.
 *
 * Không gọi API tóm tắt 7 ngày ở màn đầu. Cảnh báo vẫn độc lập với trợ lý:
 * trợ lý không tự xác nhận/đóng cảnh báo.
 */
export function AssistantPage() {
  const me = useMe();
  const subjects = useSubjects();
  const activeSubject = useActiveSubject(subjects.data);
  const subjectId = activeSubject?.id ?? null;

  const canViewMeasurements = activeSubject
    ? activeSubject.permissions.canViewMeasurements !== false
    : false;
  const canReceiveAlerts = activeSubject
    ? activeSubject.role === 'owner' || activeSubject.permissions.canReceiveAlerts
    : false;
  const canUseAi = activeSubject
    ? activeSubject.role === 'owner' || activeSubject.permissions.canViewAi
    : false;

  const status = useQuery({
    queryKey: subjectId ? queryKeys.subjectStatus(subjectId) : ['subjects', 'none', 'status'],
    queryFn: ({ signal }) => (subjectId ? fetchSubjectStatus(subjectId, signal) : null),
    enabled: Boolean(subjectId) && canViewMeasurements,
    staleTime: 15_000,
  });

  const openAlerts = useQuery({
    queryKey: subjectId
      ? queryKeys.dashboardOpenAlerts(subjectId)
      : (['subjects', 'none', 'alerts', 'today'] as const),
    queryFn: ({ signal }) =>
      subjectId ? fetchOpenAlerts(subjectId, OPEN_ALERTS_LIMIT, signal) : null,
    enabled: Boolean(subjectId) && canReceiveAlerts,
    staleTime: 15_000,
  });

  // Chỉ tải liên hệ khi thật sự có cảnh báo mở và người xem có quyền nhận cảnh báo:
  // không thêm request vô ích cho màn Hôm nay bình thường.
  const openAlertItems = openAlerts.data?.items ?? [];
  const contacts = useEmergencyContacts(subjectId ?? '', {
    enabled: Boolean(subjectId) && canReceiveAlerts && openAlertItems.length > 0,
  });
  const primaryContact =
    contacts.data?.items.find((contact) => contact.isPrimary) ??
    contacts.data?.items[0] ??
    null;

  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [fieldErrors, setFieldErrors] = useState<{ fields: Record<string, string>; general: string[] }>({
    fields: {},
    general: [],
  });
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
  const askForbidden = askError !== null && isForbiddenError(askError);
  const askBlocked = !canUseAi || !canViewMeasurements || askForbidden;

  // Cuộn vừa đủ tới câu trả lời mới; block "nearest" không nhảy trang khi đã thấy.
  useEffect(() => {
    if (turns.length === 0 && !askPending) return;
    threadEndRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [turns.length, askPending]);

  // Admin không có hồ sơ: /app không có dữ liệu để hiển thị, về trang quản trị.
  if (me.data?.user.role === 'admin' && subjects.isSuccess && subjects.data.length === 0) {
    return <Navigate to="/app/admin" replace />;
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
    if (!subjectId) return;
    setFieldErrors({ fields: {}, general: [] });
    ask.mutate({ subjectId, question: parsed.data.question });
  };

  const devices = status.data?.devices ?? [];
  const healthDataHidden = devices.some((device) => device.healthDataVisible === false);
  const latestSeen = devices.reduce<string | null>((latest, device) => {
    if (!device.lastSeenAt) return latest;
    if (!latest) return device.lastSeenAt;
    return new Date(device.lastSeenAt).getTime() > new Date(latest).getTime()
      ? device.lastSeenAt
      : latest;
  }, null);

  /**
   * Thiết bị ngoại tuyến hoặc dữ liệu cũ hơn ngưỡng policy.
   * Dùng `asOf` của server làm mốc "bây giờ" để kết quả ổn định, không phụ thuộc
   * đồng hồ trình duyệt; freshness do server tính vẫn là tín hiệu chính.
   */
  const deviceWarning = (() => {
    if (!status.data || !canViewMeasurements || healthDataHidden) return null;
    const seenDevices = status.data.devices.filter((device) => device.lastSeenAt !== null);
    if (seenDevices.length === 0) return null;
    const thresholdSeconds =
      status.data.policy.value.offlineAfterSeconds ?? OFFLINE_FALLBACK_SECONDS;
    const asOfMs = new Date(status.data.asOf).getTime();
    const offline = status.data.devices.some(
      (device) =>
        device.online === false ||
        device.freshness === 'offline' ||
        device.freshness === 'stale' ||
        (device.lastSeenAt !== null &&
          asOfMs - new Date(device.lastSeenAt).getTime() > thresholdSeconds * 1000),
    );
    if (!offline) return null;
    const latest = seenDevices.reduce<string>((current, device) => {
      const seen = device.lastSeenAt as string;
      return new Date(seen).getTime() > new Date(current).getTime() ? seen : current;
    }, seenDevices[0]!.lastSeenAt as string);
    return `Thiết bị ngoại tuyến · dữ liệu cuối ${formatTime(latest)}`;
  })();

  /** Trạng thái đo khi không có cảnh báo nào cần báo (hoặc không xem được cảnh báo). */
  const measurementStatus = (): TodayStatus => {
    if (!canViewMeasurements || healthDataHidden) {
      return { tone: 'muted', text: MEASUREMENTS_FORBIDDEN_TEXT };
    }
    if (status.isPending) {
      return { tone: 'muted', text: 'Đang kiểm tra dữ liệu…' };
    }
    if (status.isError) {
      if (isForbiddenError(status.error)) {
        return { tone: 'muted', text: MEASUREMENTS_FORBIDDEN_TEXT };
      }
      return {
        tone: 'error',
        text: 'Chưa tải được tình trạng.',
        action: (
          <Button variant="secondary" size="sm" onClick={() => void status.refetch()}>
            Thử lại
          </Button>
        ),
      };
    }
    if (!latestSeen) {
      return {
        tone: 'muted',
        text: 'Chưa nhận dữ liệu từ thiết bị.',
        action: (
          <ButtonLink to="/app/devices" variant="secondary" size="sm">
            Kiểm tra thiết bị
          </ButtonLink>
        ),
      };
    }
    return {
      tone: 'calm',
      text: `Không có cảnh báo mở. Dữ liệu cập nhật ${formatDateTime(latestSeen)}.`,
    };
  };

  const buildStatus = (): TodayStatus => {
    // Thiếu quyền nhận cảnh báo là trạng thái quyền, không phải "không có cảnh báo".
    if (!canReceiveAlerts) {
      return { tone: 'muted', text: ALERTS_FORBIDDEN_TEXT };
    }
    if (openAlerts.isPending) {
      return { tone: 'muted', text: 'Đang kiểm tra cảnh báo…' };
    }
    if (openAlerts.isError) {
      if (isForbiddenError(openAlerts.error)) {
        return { tone: 'muted', text: ALERTS_FORBIDDEN_TEXT };
      }
      return {
        tone: 'error',
        text: 'Chưa tải được cảnh báo.',
        action: (
          <Button variant="secondary" size="sm" onClick={() => void openAlerts.refetch()}>
            Thử lại
          </Button>
        ),
      };
    }
    const count = openAlertItems.length;
    if (count > 0) {
      const first = openAlertItems[0]!;
      return {
        tone: 'alert',
        text: `${ALERT_TYPE_LABELS[first.type]} lúc ${formatTime(first.detectedAt)} · ${count}${
          openAlerts.data?.nextCursor ? '+' : ''
        } cảnh báo đang mở.`,
        detail: deviceWarning ?? undefined,
        action: (
          <div className="today-status__actions">
            {primaryContact ? (
              <a
                className="button button--primary button--md"
                href={toTelHref(primaryContact.phone)}
                aria-label={`Gọi ${primaryContact.name}`}
              >
                Gọi
              </a>
            ) : null}
            <ButtonLink to="/app/alerts" variant={primaryContact ? 'secondary' : 'primary'}>
              Xem cảnh báo
            </ButtonLink>
          </div>
        ),
      };
    }
    if (deviceWarning) {
      return {
        tone: 'alert',
        text: deviceWarning,
        action: (
          <ButtonLink to="/app/devices" variant="secondary" size="sm">
            Kiểm tra thiết bị
          </ButtonLink>
        ),
      };
    }
    return measurementStatus();
  };

  const statusCard = buildStatus();
  const hasConversation = turns.length > 0 || askPending || askError !== null;

  return (
    <div className="stack today">
      <header className="today__header">
        <h1 className="page-title">Hôm nay</h1>
      </header>

      <SubjectSwitcher />

      {!activeSubject ? null : (
        <>
          <section
            className={`today-status today-status--${statusCard.tone}`}
            aria-label="Trạng thái hôm nay"
          >
            <p className="today-status__text">{statusCard.text}</p>
            {statusCard.detail ? (
              <p className="today-status__detail">{statusCard.detail}</p>
            ) : null}
            {statusCard.action ? (
              <div className="today-status__action">{statusCard.action}</div>
            ) : null}
          </section>

          <section className="today-ask" aria-labelledby="today-ask-heading">
            <h2 id="today-ask-heading" className="visually-hidden">
              Hỏi về hồ sơ đang xem
            </h2>
            <form className="today-ask__form" onSubmit={handleAsk} noValidate>
              <label className="visually-hidden" htmlFor="assistant-question">
                Câu hỏi
              </label>
              <div className="today-ask__row">
                <textarea
                  id="assistant-question"
                  className={`field__input today-ask__input${fieldErrors.fields.question ? ' field__input--error' : ''}`}
                  aria-invalid={fieldErrors.fields.question ? true : undefined}
                  aria-describedby={
                    fieldErrors.fields.question ? 'assistant-question-error' : undefined
                  }
                  placeholder="Nhập câu hỏi…"
                  rows={1}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  maxLength={500}
                />
                <Button
                  type="submit"
                  aria-label={askPending ? 'Đang trả lời câu hỏi' : 'Gửi câu hỏi'}
                  disabled={askPending || askBlocked}
                >
                  {askPending ? 'Đang trả lời…' : 'Gửi'}
                </Button>
              </div>
              {fieldErrors.fields.question ? (
                <p className="field__error" id="assistant-question-error" role="alert">
                  {fieldErrors.fields.question}
                </p>
              ) : null}
              {fieldErrors.general.length > 0 ? (
                <p className="field__error" role="alert">
                  {fieldErrors.general.join(' ')}
                </p>
              ) : null}
              {!canUseAi ? (
                <p className="today-ask__hint">Trợ lý chưa được bật cho hồ sơ này.</p>
              ) : !canViewMeasurements ? (
                <p className="today-ask__hint">
                  Trợ lý cần quyền xem số đo để trả lời.
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
                    {getApiErrorMessage(askError)}
                  </Alert>
                )
              ) : null}
            </form>

            <div className="ai-suggestions today-ask__suggestions" aria-label="Gợi ý câu hỏi">
              {SUGGESTED_QUESTIONS.map((suggestion) => (
                <button
                  key={suggestion.label}
                  type="button"
                  className="ai-suggestion"
                  title={suggestion.question}
                  disabled={askBlocked}
                  onClick={() => setQuestion(suggestion.question)}
                >
                  {suggestion.label}
                </button>
              ))}
            </div>

            {hasConversation ? (
              <div className="assistant-thread today-thread" role="log" aria-label="Hội thoại">
                {turns.map((turn) => (
                  <article key={turn.id} className="assistant-turn">
                    <div className="assistant-msg assistant-msg--user">
                      <p className="assistant-msg__label">Bạn</p>
                      <p className="assistant-msg__text">{turn.question}</p>
                    </div>
                    <AnswerView answer={turn.answer} />
                  </article>
                ))}
                {askPending ? (
                  <div className="assistant-msg assistant-msg--assistant assistant-msg--pending">
                    <p className="assistant-msg__label">Trợ lý</p>
                    <p className="assistant-msg__text" role="status">
                      Đang trả lời…
                    </p>
                  </div>
                ) : null}
                <div ref={threadEndRef} />
              </div>
            ) : null}
          </section>

          <nav className="today-links" aria-label="Xem thêm">
            <Link className="today-links__item" to="/app/overview">
              Sức khỏe 7 ngày →
            </Link>
          </nav>
        </>
      )}

      <p className="today__note">{TODAY_LIMIT_NOTE}</p>
    </div>
  );
}
