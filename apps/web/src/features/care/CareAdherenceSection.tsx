import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  CareAdherence,
  CareAdherenceDay,
  CareAdherenceReminder,
} from '@heart-iot/contracts/reminders';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { getApiErrorMessage, isApiError } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { fetchCareAdherence } from './api';
import { REMINDER_KIND_LABELS } from './labels';

type AdherenceRange = 7 | 30;

const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

/** Thứ theo ngày lịch `YYYY-MM-DD`; dùng UTC để không lệch ngày theo múi giờ máy. */
function weekdayShort(day: string): string {
  const [year, month, date] = day.split('-').map((value) => Number(value));
  if (!year || !month || !date) return '';
  return WEEKDAY_SHORT[new Date(Date.UTC(year, month - 1, date)).getUTCDay()] ?? '';
}

/** `DD/MM` từ ngày lịch; không dùng Date để tránh đổi ngày theo múi giờ. */
function shortDay(day: string): string {
  const [, month, date] = day.split('-');
  return month && date ? `${date}/${month}` : day;
}

function percentLabel(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

function isForbiddenError(error: unknown): boolean {
  return isApiError(error) && (error.status === 403 || error.code === 'FORBIDDEN');
}

function DayCell({ day }: { day: CareAdherenceDay }) {
  const empty = day.scheduled === 0;
  return (
    <li className={`care-adherence__day${empty ? ' care-adherence__day--empty' : ''}`}>
      <p className="care-adherence__day-head">
        {weekdayShort(day.date)} {shortDay(day.date)}
      </p>
      {empty ? (
        <>
          <p className="care-adherence__day-count">—</p>
          <p className="care-adherence__day-detail">Không có lịch</p>
        </>
      ) : (
        <>
          <p className="care-adherence__day-count">
            {day.done}/{day.scheduled} đã làm
          </p>
          <p className="care-adherence__day-detail">
            Bỏ qua {day.skipped} · Chưa ghi nhận {day.pending}
          </p>
        </>
      )}
    </li>
  );
}

type WeekGroup = {
  from: string;
  to: string;
  scheduled: number;
  done: number;
  skipped: number;
  pending: number;
};

/** Chia 30 ngày thành các nhóm 7 ngày liên tiếp (nhóm cuối có thể thiếu ngày). */
function groupWeeks(series: readonly CareAdherenceDay[]): WeekGroup[] {
  const groups: WeekGroup[] = [];
  for (let start = 0; start < series.length; start += 7) {
    const chunk = series.slice(start, start + 7);
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    if (!first || !last) continue;
    groups.push(
      chunk.reduce<WeekGroup>(
        (group, day) => ({
          ...group,
          scheduled: group.scheduled + day.scheduled,
          done: group.done + day.done,
          skipped: group.skipped + day.skipped,
          pending: group.pending + day.pending,
        }),
        {
          from: first.date,
          to: last.date,
          scheduled: 0,
          done: 0,
          skipped: 0,
          pending: 0,
        },
      ),
    );
  }
  return groups;
}

function ReminderCard({ reminder }: { reminder: CareAdherenceReminder }) {
  return (
    <li className="care-adherence__reminder">
      <div className="care-adherence__reminder-head">
        <h3 className="care-adherence__reminder-title">{reminder.title}</h3>
        <span className="care-adherence__kind">{REMINDER_KIND_LABELS[reminder.kind]}</span>
        {reminder.archived ? (
          <StatusPill tone="neutral">Đã lưu trữ</StatusPill>
        ) : reminder.active ? null : (
          <StatusPill tone="neutral">Đang tắt</StatusPill>
        )}
      </div>
      <p className="care-adherence__reminder-totals">
        Đã làm {reminder.done} · Bỏ qua {reminder.skipped} · Chưa ghi nhận {reminder.pending}
      </p>
      <p className="care-adherence__reminder-rates">
        Ghi nhận {percentLabel(reminder.recordedPercent)} · Hoàn thành{' '}
        {percentLabel(reminder.completionPercent)}
      </p>
    </li>
  );
}

function AdherenceBody({ data }: { data: CareAdherence }) {
  if (data.totals.scheduled === 0) {
    return (
      <EmptyState
        headingLevel={3}
        title={`Chưa có lịch nhắc trong ${data.days} ngày`}
        description="Khi lịch nhắc đến ngày, số việc đã làm, bỏ qua và chưa ghi nhận sẽ xuất hiện ở đây."
      />
    );
  }

  return (
    <>
      <div className="care-adherence__summary">
        <p className="care-adherence__totals">
          Đã làm {data.totals.done} · Bỏ qua {data.totals.skipped} · Chưa ghi nhận{' '}
          {data.totals.pending}
        </p>
        <p className="care-adherence__rates">
          Ghi nhận {percentLabel(data.totals.recordedPercent)} · Hoàn thành{' '}
          {percentLabel(data.totals.completionPercent)}
        </p>
        <p className="care-adherence__explain">
          Chưa ghi nhận nghĩa là chưa có ai đánh dấu, không phải chưa làm.
        </p>
      </div>

      {data.days === 7 ? (
        <ul className="care-adherence__days" aria-label="Từng ngày trong 7 ngày">
          {data.series.map((day) => (
            <DayCell key={day.date} day={day} />
          ))}
        </ul>
      ) : (
        <ul className="care-adherence__weeks" aria-label="Từng tuần trong 30 ngày">
          {groupWeeks(data.series).map((group, index) => (
            <li key={group.from} className="care-adherence__week">
              <p className="care-adherence__week-label">
                Tuần {index + 1} · {shortDay(group.from)}–{shortDay(group.to)}
              </p>
              <p className="care-adherence__week-totals">
                {group.scheduled === 0
                  ? 'Không có lịch trong tuần này'
                  : `Đã làm ${group.done} · Bỏ qua ${group.skipped} · Chưa ghi nhận ${group.pending}`}
              </p>
            </li>
          ))}
        </ul>
      )}

      {data.reminders.length > 0 ? (
        <ul className="care-adherence__reminders" aria-label="Tổng hợp theo lịch nhắc">
          {data.reminders.map((reminder) => (
            <ReminderCard key={reminder.reminderId} reminder={reminder} />
          ))}
        </ul>
      ) : null}
    </>
  );
}

/**
 * Tổng hợp tuân thủ 7/30 ngày (V9.1) — chỉ đọc.
 *
 * Quyền do server quyết định; component chỉ được gắn khi `canViewMeasurements`.
 * "Chưa ghi nhận" không bị gọi là "quên" hay "không làm"; hai tỉ lệ tách biệt,
 * `null` hiển thị "—" thay vì 0%.
 */
export function CareAdherenceSection({
  subjectId,
  isOwner,
  onCreate,
}: {
  subjectId: string;
  isOwner: boolean;
  onCreate: () => void;
}) {
  const [days, setDays] = useState<AdherenceRange>(7);
  const query = useQuery({
    queryKey: queryKeys.careAdherence(subjectId, days),
    queryFn: ({ signal }) => fetchCareAdherence(subjectId, days, signal),
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });

  const busy = query.isFetching;
  const forbidden = query.isError && isForbiddenError(query.error);

  return (
    <section
      className="care-section care-adherence"
      aria-labelledby="care-adherence-heading"
      aria-busy={busy}
    >
      <div className="care-section__head care-adherence__head">
        <div>
          <h2 id="care-adherence-heading" className="care-section__title">
            Tổng hợp chăm sóc
          </h2>
          <p className="care-section__meta">{days} ngày gần đây</p>
        </div>
        <div
          className="care-adherence__ranges"
          role="group"
          aria-label="Khoảng thời gian tổng hợp"
        >
          <Button
            size="sm"
            variant={days === 7 ? 'primary' : 'secondary'}
            aria-pressed={days === 7}
            onClick={() => setDays(7)}
          >
            7 ngày
          </Button>
          <Button
            size="sm"
            variant={days === 30 ? 'primary' : 'secondary'}
            aria-pressed={days === 30}
            onClick={() => setDays(30)}
          >
            30 ngày
          </Button>
        </div>
      </div>

      {query.isPending ? (
        <PageLoader label="Đang tải tổng hợp chăm sóc…" />
      ) : forbidden ? (
        <EmptyState
          headingLevel={3}
          title="Chủ hồ sơ không chia sẻ tổng hợp chăm sóc"
          description="Bạn cần quyền xem số đo của hồ sơ này để xem tổng hợp. Liên hệ chủ hồ sơ nếu cần."
        />
      ) : query.isError ? (
        <ErrorState
          headingLevel={3}
          title="Không tải được tổng hợp chăm sóc"
          message={getApiErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : query.data ? (
        <>
          <AdherenceBody data={query.data} />
          {query.data.totals.scheduled === 0 && isOwner ? (
            <div className="care-adherence__empty-action">
              <Button onClick={onCreate}>Tạo lịch nhắc</Button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
