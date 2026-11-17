import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchInsights } from './api';

export const INSIGHT_RANGES = [7, 14, 30] as const;
export type InsightRangeDays = (typeof INSIGHT_RANGES)[number];

/**
 * Key cục bộ của feature insights. `lib/query.ts` do lead sở hữu nên chưa thêm
 * vào registry chung; lead có thể chuyển sang `queryKeys.insights` khi nối.
 */
export function insightsQueryKey(subjectId: string | null, days: InsightRangeDays) {
  return ['subjects', subjectId, 'insights', days] as const;
}

/**
 * Xu hướng theo khoảng ngày. `keepPreviousData` giữ số liệu cũ trong lúc tải
 * khoảng mới để card không nhấp nháy; `isFetching` báo đang cập nhật.
 */
export function useInsights(subjectId: string | null, days: InsightRangeDays) {
  return useQuery({
    queryKey: insightsQueryKey(subjectId, days),
    queryFn: ({ signal }) => {
      if (!subjectId) throw new Error('Chưa chọn hồ sơ.');
      return fetchInsights(subjectId, days, signal);
    },
    enabled: Boolean(subjectId),
    // Dữ liệu sức khỏe không cache quá 30 giây (quy ước lib/query.ts).
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}
