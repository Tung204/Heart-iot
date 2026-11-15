import { Link } from 'react-router-dom';
import { isNotFoundError } from '../../lib/api';
import { setActiveSubjectId, useActiveSubjectId } from './selection';
import { useSubjects } from './useSubjects';

/**
 * Dòng ngữ cảnh hồ sơ cho Hôm nay — thay card "Hồ sơ đang xem" full-width.
 *
 * - Một hồ sơ: chỉ tên; hồ sơ được chia sẻ thêm vai trò nhỏ "Người thân".
 * - Nhiều hồ sơ: select nhỏ cùng hàng; chọn xong ghi lựa chọn dùng chung.
 * - Không nhãn "Hồ sơ đang xem", không link "Quản lý và chia sẻ" (đã có mục
 *   Người thân trong điều hướng).
 * - Giữ trạng thái đang tải/lỗi/rỗng bằng một câu ngắn để không mất ngữ cảnh.
 */
export function SubjectContextLine() {
  const subjects = useSubjects();
  const selectedId = useActiveSubjectId();

  if (subjects.isPending) {
    return (
      <p className="subject-context subject-context--muted" role="status" aria-busy="true">
        Đang tải hồ sơ…
      </p>
    );
  }

  if (subjects.isError) {
    // 404 là API hồ sơ chưa khả dụng, không phải lỗi mạng: không mời thử lại vô ích.
    if (isNotFoundError(subjects.error)) {
      return (
        <p className="subject-context subject-context--muted">
          Chưa kết nối được dữ liệu hồ sơ.
        </p>
      );
    }
    return (
      <p className="subject-context subject-context--muted">
        Không tải được danh sách hồ sơ.{' '}
        <button
          type="button"
          className="subject-context__retry"
          onClick={() => void subjects.refetch()}
        >
          Thử lại
        </button>
      </p>
    );
  }

  const items = subjects.data;
  if (items.length === 0) {
    return (
      <p className="subject-context subject-context--muted">
        Chưa có hồ sơ nào.{' '}
        <Link className="subject-context__link" to="/app/subjects">
          Tạo hồ sơ
        </Link>
      </p>
    );
  }

  // Lựa chọn cũ không còn quyền → hiệu lực là hồ sơ đầu, giống useActiveSubject.
  const selected = items.find((item) => item.id === selectedId) ?? items[0]!;

  if (items.length === 1) {
    return (
      <p className="subject-context">
        <span className="subject-context__name">{selected.displayName}</span>
        {selected.role === 'caregiver' ? (
          <span className="subject-context__role">Người thân</span>
        ) : null}
      </p>
    );
  }

  return (
    <p className="subject-context">
      <select
        className="subject-context__select"
        aria-label="Chọn hồ sơ"
        value={selected.id}
        onChange={(event) => setActiveSubjectId(event.target.value)}
      >
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.displayName}
            {item.role === 'caregiver' ? ' · người thân' : ''}
          </option>
        ))}
      </select>
    </p>
  );
}

/**
 * Tên cũ mà AppShell (base `08fd3b5`) còn gọi ở các trang khác; nhánh `v6-shell`
 * bỏ lời gọi này. Giữ export để nhánh app tự build/đứng riêng, nhưng không
 * render card hồ sơ ở trang nào nữa — Hôm nay dùng `SubjectContextLine`.
 */
export function SubjectSwitcher() {
  return null;
}
