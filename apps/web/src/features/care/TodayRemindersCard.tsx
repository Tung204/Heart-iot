import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { SubjectSummary } from '@heart-iot/contracts/subjects';
import { Button } from '../../components/Button';
import { getApiErrorMessage } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { fetchTodayReminders } from './api';
import { useReminderCompletion } from './useReminderCompletion';
import './care.css';

const MAX_PREVIEW = 3;

/**
 * Thẻ "Nhắc hôm nay" trên Hôm nay — chỉ là lối vào nhanh, không phải nav mới.
 *
 * - Chỉ render khi có occurrence thật và người xem có quyền xem số đo
 *   (owner hoặc `canViewMeasurements`). Thiếu quyền/không có dữ liệu/lỗi tải
 *   thì không render thẻ và không gọi API bị cấm.
 * - Tối đa 3 việc còn chưa đánh dấu + link "Xem tất cả" sang `/app/care`.
 * - Đánh dấu "Đã thực hiện" tại chỗ dùng chung hook optimistic với trang Nhắc
 *   chăm sóc (cùng query key nên trạng thái đồng bộ giữa hai nơi).
 */
export function TodayRemindersCard({ subject }: { subject: SubjectSummary }) {
  const canView =
    subject.role === 'owner' || subject.permissions.canViewMeasurements !== false;

  const day = useQuery({
    queryKey: queryKeys.remindersToday(subject.id),
    queryFn: ({ signal }) => fetchTodayReminders(subject.id, signal),
    enabled: canView,
    staleTime: 15_000,
  });

  const completion = useReminderCompletion(subject.id);
  const items = day.data?.items ?? [];
  if (!canView || day.isPending || day.isError || items.length === 0) return null;

  const pending = items.filter((item) => item.status === 'pending');
  const preview = pending.slice(0, MAX_PREVIEW);
  const hiddenPending = pending.length - preview.length;

  return (
    <section className="care-today-card" aria-labelledby="today-care-heading">
      <div className="care-today-card__head">
        <h2 id="today-care-heading" className="care-today-card__title">
          Nhắc hôm nay
        </h2>
        <Link className="care-today-card__link" to="/app/care">
          Xem tất cả
        </Link>
      </div>

      {preview.length === 0 ? (
        <p className="care-today-card__empty">
          Hôm nay đã đánh dấu xong tất cả {items.length} việc theo lịch.
        </p>
      ) : (
        <ul className="care-today-card__list">
          {preview.map((occurrence) => {
            const busy = completion.isPending(occurrence.reminder.id, occurrence.time);
            return (
              <li
                key={`${occurrence.reminder.id}-${occurrence.time}`}
                className="care-today-card__item"
              >
                <p className="care-today-card__time">{occurrence.time}</p>
                <p className="care-today-card__name">{occurrence.reminder.title}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    completion.complete(occurrence.reminder, day.data.date, occurrence.time)
                  }
                  aria-label={`Đã thực hiện ${occurrence.reminder.title} lúc ${occurrence.time}`}
                >
                  Đã thực hiện
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {hiddenPending > 0 ? (
        <p className="care-today-card__more">Còn {hiddenPending} việc khác hôm nay.</p>
      ) : null}

      {completion.error ? (
        <p className="care-today-card__error" role="alert">
          {getApiErrorMessage(completion.error, 'Chưa đánh dấu được việc này.')}
        </p>
      ) : null}
    </section>
  );
}
