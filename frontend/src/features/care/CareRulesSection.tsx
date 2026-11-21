import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_CARE_DIGEST_RULE_CONFIG,
  DEFAULT_INACTIVITY_RULE_CONFIG,
  type CareDigestRuleConfig,
  type CareRuleKind,
  type CareRulePreview,
  type InactivityRuleConfig,
} from '@heart-iot/contracts/care-rules';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';
import { TextField } from '../../components/Field';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { getApiErrorMessage } from '../../lib/api';
import { formatDayKey } from '../../lib/format';
import { queryKeys } from '../../lib/query';
import { fetchCareRule, previewCareRule, updateCareRule } from './api';

const WEEKDAYS = [
  { value: 1, label: 'T2' },
  { value: 2, label: 'T3' },
  { value: 3, label: 'T4' },
  { value: 4, label: 'T5' },
  { value: 5, label: 'T6' },
  { value: 6, label: 'T7' },
  { value: 7, label: 'CN' },
] as const;

function minutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function emptyInactivity(): InactivityRuleConfig {
  return {
    ...DEFAULT_INACTIVITY_RULE_CONFIG,
    weekdays: [...DEFAULT_INACTIVITY_RULE_CONFIG.weekdays],
  };
}

function PreviewList({ preview }: { preview: CareRulePreview }) {
  return (
    <div className="care-rule-preview" role="region" aria-label="Lịch kiểm tra 7 ngày tới">
      <p className="care-rule-preview__disclaimer">{preview.disclaimer}</p>
      <p className="care-rule-preview__summary">
        {preview.days.find((day) => day.applies)?.note ?? preview.days[0]?.note}
      </p>
      <ul className="care-rule-preview__list">
        {preview.days.map((day) => (
          <li key={`${day.date}-${day.time}`} className="care-rule-preview__day">
            <span className="care-rule-preview__date">{formatDayKey(day.date)}</span>
            <span className="care-rule-preview__time">{day.time}</span>
            <span className="care-rule-preview__spacer" aria-hidden="true" />
            <StatusPill tone={day.applies ? 'success' : 'neutral'}>
              {day.applies ? 'Sẽ kiểm tra' : 'Không áp dụng'}
            </StatusPill>
            {!day.applies ? <p className="care-rule-preview__note">{day.note}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Thẻ cấu hình một quy tắc. Chỉ render trong trang của chủ hồ sơ.
 * Preview luôn dùng cấu hình **đã lưu** trên server, không gửi form chưa lưu.
 */
function CareRuleCard({ subjectId, kind }: { subjectId: string; kind: CareRuleKind }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.careRule(subjectId, kind),
    queryFn: ({ signal }) => fetchCareRule(subjectId, kind, signal),
    staleTime: 30_000,
  });

  const [inactivity, setInactivity] = useState<InactivityRuleConfig>(emptyInactivity);
  const [digest, setDigest] = useState<CareDigestRuleConfig>({
    ...DEFAULT_CARE_DIGEST_RULE_CONFIG,
  });
  const [preview, setPreview] = useState<CareRulePreview | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data) return;
    if (query.data.kind === 'inactivity') setInactivity(query.data.config);
    else setDigest(query.data.config);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () =>
      updateCareRule(
        subjectId,
        kind,
        kind === 'inactivity' ? inactivity : digest,
      ),
    onSuccess: (data) => {
      if (data.kind === 'inactivity') setInactivity(data.config);
      else setDigest(data.config);
      setPreview(null);
      setSavedMessage('Đã lưu cấu hình.');
      void queryClient.invalidateQueries({ queryKey: queryKeys.careRulesAll(subjectId) });
    },
  });

  const runPreview = useMutation({
    mutationFn: () => previewCareRule(subjectId, kind),
    onSuccess: (data) => setPreview(data),
  });

  const validation =
    kind === 'inactivity'
      ? !inactivity.enabled
        ? null
        : inactivity.weekdays.length === 0
          ? 'Chọn ít nhất một ngày trong tuần.'
          : minutes(inactivity.windowStart) >= minutes(inactivity.windowEnd)
            ? 'Giờ kết thúc phải sau giờ bắt đầu.'
            : minutes(inactivity.windowEnd) + inactivity.graceMinutes > 24 * 60
              ? 'Giờ kết thúc cộng thời gian chờ không được vượt quá 24:00.'
              : null
      : null;

  if (query.isPending) {
    return (
      <article className="care-rule-card" aria-busy="true">
        <PageLoader label="Đang tải quy tắc…" />
      </article>
    );
  }
  if (query.isError) {
    return (
      <article className="care-rule-card">
        <ErrorState
          title="Không tải được quy tắc"
          message={getApiErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          headingLevel={3}
        />
      </article>
    );
  }

  const isInactivity = kind === 'inactivity';
  const enabled = isInactivity ? inactivity.enabled : digest.enabled;
  const title = isInactivity ? 'Nhắc vận động nhẹ' : 'Bản tin cuối ngày';
  const description = isInactivity
    ? 'Cuối khung giờ đã chọn, nếu chưa ghi nhận đủ vận động, hệ thống gửi một lời nhắc nhẹ. Không phải cảnh báo khẩn.'
    : 'Sau giờ đã chọn, hệ thống gửi bản tin tổng hợp việc chăm sóc và dữ liệu đã ghi nhận trong ngày.';

  return (
    <article className="care-rule-card" aria-labelledby={`care-rule-${kind}-title`}>
      <div className="care-rule-card__head">
        <div>
          <h3 id={`care-rule-${kind}-title`} className="care-rule-card__title">
            {title}
          </h3>
          <p className="care-rule-card__description">{description}</p>
        </div>
        <StatusPill tone={enabled ? 'success' : 'neutral'}>
          {enabled ? 'Đang bật' : 'Đang tắt'}
        </StatusPill>
      </div>

      <form
        className="care-rule-form"
        onSubmit={(event) => {
          event.preventDefault();
          setSavedMessage(null);
          if (!validation) save.mutate();
        }}
      >
        <label className="care-form__check">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => {
              setSavedMessage(null);
              if (isInactivity) setInactivity({ ...inactivity, enabled: event.target.checked });
              else setDigest({ ...digest, enabled: event.target.checked });
            }}
          />
          <span>{isInactivity ? 'Bật nhắc vận động' : 'Bật bản tin cuối ngày'}</span>
        </label>

        {isInactivity ? (
          <>
            <fieldset className="care-form__group">
              <legend className="field__label">Ngày áp dụng</legend>
              <div className="care-form__weekdays">
                {WEEKDAYS.map((day) => (
                  <label key={day.value} className="care-form__weekday">
                    <input
                      type="checkbox"
                      checked={inactivity.weekdays.includes(day.value)}
                      onChange={() => {
                        setSavedMessage(null);
                        const next = inactivity.weekdays.includes(day.value)
                          ? inactivity.weekdays.filter((value) => value !== day.value)
                          : [...inactivity.weekdays, day.value].sort((a, b) => a - b);
                        setInactivity({ ...inactivity, weekdays: next });
                      }}
                    />
                    <span>{day.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="care-form__grid">
              <TextField
                id={`${kind}-window-start`}
                label="Từ giờ"
                type="time"
                value={inactivity.windowStart}
                onChange={(event) => {
                  setSavedMessage(null);
                  setInactivity({ ...inactivity, windowStart: event.target.value });
                }}
              />
              <TextField
                id={`${kind}-window-end`}
                label="Đến giờ"
                type="time"
                value={inactivity.windowEnd}
                onChange={(event) => {
                  setSavedMessage(null);
                  setInactivity({ ...inactivity, windowEnd: event.target.value });
                }}
              />
              <TextField
                id={`${kind}-min-steps`}
                label="Số bước tối thiểu"
                type="number"
                min={0}
                max={100000}
                value={inactivity.minSteps}
                hint="Chỉ là ngưỡng nhắc nhẹ do bạn đặt, không phải mục tiêu y khoa."
                onChange={(event) => {
                  setSavedMessage(null);
                  setInactivity({ ...inactivity, minSteps: Number(event.target.value) });
                }}
              />
              <TextField
                id={`${kind}-grace`}
                label="Chờ thêm sau giờ kết thúc (phút)"
                type="number"
                min={0}
                max={240}
                value={inactivity.graceMinutes}
                onChange={(event) => {
                  setSavedMessage(null);
                  setInactivity({ ...inactivity, graceMinutes: Number(event.target.value) });
                }}
              />
            </div>
          </>
        ) : (
          <div className="care-form__grid">
            <TextField
              id={`${kind}-time`}
              label="Giờ gửi bản tin"
              type="time"
              value={digest.time}
              hint="Theo múi giờ của hồ sơ."
              onChange={(event) => {
                setSavedMessage(null);
                setDigest({ ...digest, time: event.target.value });
              }}
            />
          </div>
        )}

        {validation ? (
          <p className="field__error" role="alert">
            {validation}
          </p>
        ) : null}
        {save.isError ? (
          <Alert tone="error" title="Chưa lưu được quy tắc">
            {getApiErrorMessage(save.error, 'Không lưu được cấu hình.')}
          </Alert>
        ) : null}
        {savedMessage ? (
          <p className="care-rule-card__saved" role="status">
            {savedMessage}
          </p>
        ) : null}

        <div className="care-form__actions">
          <Button type="submit" disabled={save.isPending || Boolean(validation)}>
            {save.isPending ? 'Đang lưu…' : 'Lưu cấu hình'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={runPreview.isPending}
            onClick={() => runPreview.mutate()}
          >
            {runPreview.isPending ? 'Đang xem…' : 'Xem trước 7 ngày'}
          </Button>
        </div>
        <p className="care-rule-card__hint">
          Xem trước dùng cấu hình đã lưu; lưu thay đổi trước nếu bạn vừa sửa.
        </p>
        {runPreview.isError ? (
          <Alert tone="error" title="Chưa xem được lịch">
            {getApiErrorMessage(runPreview.error, 'Không tạo được bản xem trước.')}
          </Alert>
        ) : null}
        {preview ? <PreviewList preview={preview} /> : null}
      </form>
    </article>
  );
}

/**
 * V9.2 — cấu hình nhắc chủ động cho chủ hồ sơ.
 * Không hiện cho người thân: họ chỉ nhận thông báo theo quyền xem số đo.
 */
export function CareRulesSection({ subjectId }: { subjectId: string }) {
  return (
    <section className="care-section care-rules" aria-labelledby="care-rules-heading">
      <div className="care-section__head">
        <h2 id="care-rules-heading" className="care-section__title">
          Nhắc chủ động
        </h2>
        <p className="care-section__meta">Chỉ chủ hồ sơ thấy và sửa</p>
      </div>
      <p className="care-muted">
        Chỉ là nhắc nhẹ theo cài đặt của bạn, không phải cảnh báo khẩn. Mặc định tắt; bạn có
        thể bật và đổi giờ bất cứ lúc nào.
      </p>
      <div className="care-rules__grid">
        <CareRuleCard subjectId={subjectId} kind="inactivity" />
        <CareRuleCard subjectId={subjectId} kind="care_digest" />
      </div>
    </section>
  );
}
