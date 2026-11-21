import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query';
import { fetchSubjects } from './api';

/** Danh sách hồ sơ người dùng hiện tại (chưa phải dữ liệu sức khỏe). */
export function useSubjects() {
  return useQuery({
    queryKey: queryKeys.subjects,
    queryFn: ({ signal }) => fetchSubjects(signal),
    staleTime: 30_000,
  });
}
