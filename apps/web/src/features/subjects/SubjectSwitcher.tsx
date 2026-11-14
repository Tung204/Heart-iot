import { Link } from 'react-router-dom';
import { Alert } from '../../components/Alert';
import { Button, ButtonLink } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { isNotFoundError } from '../../lib/api';
import { useActiveSubjectId } from './selection';
import { setActiveSubjectId } from './selection';
import { useSubjects } from './useSubjects';

/**
 * Bộ chuyển hồ sơ trong khung ứng dụng.
 * - Lựa chọn dùng chung qua store (localStorage) để mọi trang nghiệp vụ
 *   biết hồ sơ đang xem.
 * - Danh sách rỗng → EmptyState + CTA tạo hồ sơ.
 * - Lỗi → Alert kèm nút thử lại, không hiển thị lỗi thô.
 */
export function SubjectSwitcher() {
  const subjects = useSubjects();
  const selectedId = useActiveSubjectId();

  if (subjects.isPending) {
    return (
      <div className="subject-switcher" role="status" aria-busy="true">
        <p className="subject-switcher__label">Hồ sơ đang xem</p>
        <p className="subject-switcher__hint">Đang tải danh sách hồ sơ…</p>
      </div>
    );
  }

  if (subjects.isError) {
    if (isNotFoundError(subjects.error)) {
      return (
        <Alert tone="info" title="Chưa kết nối được dữ liệu hồ sơ">
          API hồ sơ chưa khả dụng. Kiểm tra máy chủ đang chạy và thử lại.
        </Alert>
      );
    }
    return (
      <Alert tone="error" title="Không tải được danh sách hồ sơ">
        Kiểm tra kết nối với máy chủ và thử lại.
        <div style={{ marginTop: '0.75rem' }}>
          <Button variant="secondary" size="sm" onClick={() => void subjects.refetch()}>
            Thử lại
          </Button>
        </div>
      </Alert>
    );
  }

  const items = subjects.data;
  if (items.length === 0) {
    return (
      <EmptyState
        title="Chưa có hồ sơ nào"
        description="Tạo hồ sơ cho người cần theo dõi để bắt đầu nhận dữ liệu và mời người thân cùng xem."
        action={<ButtonLink to="/app/subjects">Tạo hồ sơ</ButtonLink>}
      />
    );
  }

  // Không có lựa chọn (hoặc lựa chọn cũ không còn quyền) thì hiển thị hồ sơ đầu tiên,
  // đúng với hồ sơ mà các trang đang dùng qua useActiveSubject.
  const effectiveSelected = items.some((item) => item.id === selectedId)
    ? selectedId
    : (items[0]?.id ?? null);

  const handleChange = (value: string) => {
    setActiveSubjectId(value === '' ? null : value);
  };

  return (
    <div className="subject-switcher">
      <label className="subject-switcher__label" htmlFor="subject-switch">
        Hồ sơ đang xem
      </label>
      <select
        id="subject-switch"
        className="subject-switcher__select"
        value={effectiveSelected ?? ''}
        onChange={(event) => handleChange(event.target.value)}
      >
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.displayName}
            {item.role === 'caregiver' ? ' (người thân)' : ''}
          </option>
        ))}
      </select>
      <div className="subject-switcher__foot">
        <Link className="subject-switcher__manage" to="/app/subjects">
          Quản lý hồ sơ và chia sẻ
        </Link>
      </div>
    </div>
  );
}
