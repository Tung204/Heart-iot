import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { AssistantAnswer, AssistantSummary } from '@annhien/contracts/assistant';
import { ASSISTANT_DISCLAIMER } from '@annhien/contracts/assistant';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { formatDateTime } from '../../lib/format';
import { getApiErrorMessage, isApiError } from '../../lib/api';
import { zodFieldErrorMap } from '../../lib/validation';
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

/** Disclaimer bắt buộc — mọi bản tóm tắt/câu trả lời đều hiển thị cùng một ranh giới. */
function Disclaimer() {
  return <p className="ai-disclaimer">{ASSISTANT_DISCLAIMER}</p>;
}

function AnswerView({ answer }: { answer: AssistantAnswer }) {
  return (
    <div className="ai-answer">
      <div className="ai-answer__meta">
        <ProviderBadge status={answer.status} provider={answer.provider} />
        {answer.model ? <span className="ai-answer__model">mô hình {answer.model}</span> : null}
      </div>
      {answer.status === 'degraded' && answer.degradedReason ? (
        <Alert tone="warning" title="Trợ lý đang dùng bản theo mẫu">
          {answer.degradedReason}
        </Alert>
      ) : null}
      <p className="ai-answer__text">{answer.answer}</p>
      <SourcesList sources={answer.sources} />
      <Disclaimer />
    </div>
  );
}

/**
 * /app/assistant — trợ lý tóm tắt số liệu theo dõi.
 * - Chỉ gọi API khi hồ sơ đang chọn có quyền xem AI (owner hoặc caregiver `canViewAi`);
 *   không có quyền → thông báo rõ, không gọi API.
 * - Tóm tắt 7 ngày mặc định; hỏi đáp 3..500 ký tự; 429 → thông báo giới hạn tần suất.
 * - Không hiển thị HTML từ câu trả lời (chỉ text, giữ xuống dòng); không có nút chẩn đoán.
 */
export function AssistantPage() {
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
  const [fieldErrors, setFieldErrors] = useState<{ fields: Record<string, string>; general: string[] }>({
    fields: {},
    general: [],
  });

  const ask = useMutation({
    mutationFn: () => {
      if (!allowedSubject) throw new Error('Chưa chọn hồ sơ có quyền xem AI.');
      return askAssistant(allowedSubject.id, { question });
    },
    onSuccess: () => {
      setQuestion('');
      setFieldErrors({ fields: {}, general: [] });
    },
  });

  if (!activeSubject && !subjects.isPending && !subjects.isError) {
    return (
      <EmptyState
        title="Chưa có hồ sơ để dùng trợ lý"
        description="Tạo hồ sơ cho người cần theo dõi để trợ lý tổng hợp số liệu đo."
      />
    );
  }

  if (subjects.isPending) {
    return <PageLoader label="Đang kiểm tra quyền…" />;
  }

  if (!allowedSubject) {
    return (
      <div className="stack">
        <header>
          <h1 className="page-title">Trợ lý</h1>
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
    setFieldErrors({ fields: {}, general: [] });
    ask.mutate();
  };

  const summaryData = summary.data;
  const noData = summaryData
    ? summaryData.sections.some((section) => section.body.includes('Không có mẫu đo nào'))
    : false;

  return (
    <div className="stack">
      <header>
        <h1 className="page-title">Trợ lý</h1>
        <p className="page-lead">
          Tổng hợp số liệu theo dõi của <strong>{allowedSubject.displayName}</strong> — 7 ngày gần
          nhất. Trợ lý không chẩn đoán, không kê đơn.
        </p>
      </header>

      <section aria-labelledby="assistant-summary-heading">
        <div className="ai-heading-row">
          <h2 id="assistant-summary-heading" className="section-title">
            Tóm tắt số liệu
          </h2>
          <Button variant="subtle" size="sm" onClick={() => void summary.refetch()}>
            Làm mới
          </Button>
        </div>
        {summary.isPending ? (
          <PageLoader label="Đang tổng hợp số liệu…" />
        ) : summary.isError ? (
          <ErrorState
            title="Không tải được tóm tắt"
            message={getApiErrorMessage(summary.error)}
            onRetry={() => void summary.refetch()}
          />
        ) : summaryData ? (
          <Card
            description={`Khoảng ${formatDateTime(summaryData.periodStart)} – ${formatDateTime(summaryData.periodEnd)} · tạo lúc ${formatDateTime(summaryData.generatedAt)}`}
          >
            <div className="ai-summary">
              <div className="ai-summary__meta">
                <ProviderBadge status={summaryData.status} provider={summaryData.provider} />
                {summaryData.model ? (
                  <span className="ai-answer__model">mô hình {summaryData.model}</span>
                ) : null}
              </div>
              {summaryData.status === 'degraded' && summaryData.degradedReason ? (
                <Alert tone="warning" title="Đang dùng bản theo mẫu">
                  {summaryData.degradedReason}
                </Alert>
              ) : null}
              {noData ? (
                <Alert tone="info" title="Chưa có đủ dữ liệu để tóm tắt">
                  Hồ sơ chưa có mẫu đo trong khoảng thời gian này — trợ lý không bịa số liệu.
                </Alert>
              ) : null}
              <p className="ai-summary__headline">{summaryData.headline}</p>
              {summaryData.sections.map((section) => (
                <div key={`${section.kind}-${section.title}`} className="ai-section">
                  <h3 className="ai-section__title">{section.title}</h3>
                  <p className="ai-section__body">{section.body}</p>
                  {section.facts.length > 0 ? (
                    <dl className="ai-facts">
                      {section.facts.map((fact, index) => (
                        <div key={`${fact.label}-${index}`}>
                          <dt>{fact.label}</dt>
                          <dd>
                            {String(fact.value)}
                            {fact.unit ? ` ${fact.unit}` : ''}
                            {fact.sourceRef ? (
                              <span className="ai-facts__ref"> nguồn {fact.sourceRef}</span>
                            ) : null}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </div>
              ))}
              <SourcesList sources={summaryData.sources} />
              <Disclaimer />
            </div>
          </Card>
        ) : null}
      </section>

      <section aria-labelledby="assistant-ask-heading">
        <h2 id="assistant-ask-heading" className="section-title">
          Hỏi về số liệu theo dõi
        </h2>
        <Card description="Câu hỏi chỉ xoay quanh số liệu đo đã được kiểm quyền. Câu hỏi chẩn đoán, kê đơn hoặc dự đoán nguy cơ sẽ bị từ chối.">
          <form className="ai-ask-form" onSubmit={handleAsk} noValidate>
            <div className="field">
              <label className="field__label" htmlFor="assistant-question">
                Câu hỏi <span className="field__required" aria-hidden="true"> *</span>
              </label>
              <p className="field__hint" id="assistant-question-hint">
                3–500 ký tự. Ví dụ: "Tuần này nhịp tim của bà thế nào?" — tối đa 10 câu hỏi mỗi 5 phút.
              </p>
              <textarea
                id="assistant-question"
                className={`field__input${fieldErrors.fields.question ? ' field__input--error' : ''}`}
                aria-invalid={fieldErrors.fields.question ? true : undefined}
                aria-describedby="assistant-question-hint"
                rows={3}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength={600}
              />
              {fieldErrors.fields.question ? (
                <p className="field__error" role="alert">
                  {fieldErrors.fields.question}
                </p>
              ) : null}
            </div>
            {fieldErrors.general.length > 0 ? (
              <p className="field__error" role="alert">
                {fieldErrors.general.join(' ')}
              </p>
            ) : null}
            {ask.isError ? (
              isApiError(ask.error) && ask.error.code === 'RATE_LIMITED' ? (
                <Alert tone="warning" title="Đã đạt giới hạn câu hỏi">
                  {getApiErrorMessage(ask.error)} Vui lòng thử lại sau vài phút.
                </Alert>
              ) : (
                <Alert tone="error" title="Không trả lời được">
                  {getApiErrorMessage(ask.error)} Hãy thử lại.
                </Alert>
              )
            ) : null}
            <div>
              <Button type="submit" disabled={ask.isPending}>
                {ask.isPending ? 'Đang trả lời…' : 'Gửi câu hỏi'}
              </Button>
            </div>
          </form>
          {ask.data ? <AnswerView answer={ask.data} /> : null}
        </Card>
      </section>
    </div>
  );
}
