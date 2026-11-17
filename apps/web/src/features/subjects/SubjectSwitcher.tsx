import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SubjectSummary } from '@heart-iot/contracts/subjects';
import { isNotFoundError } from '../../lib/api';
import type { ContextScope } from '../../app/routeScope';
import { setActiveSubjectId, useActiveSubjectId } from './selection';
import { useSubjects } from './useSubjects';

interface SubjectContextLineProps {
  /** Quyết định bởi `app/routeScope.ts`; shell chỉ render `selected`. */
  scope?: ContextScope;
  /** Với `pinned`: đối tượng đã xác minh từ API/URL (trang tự truyền vào). */
  subject?: Pick<SubjectSummary, 'displayName' | 'role'>;
  /** Với `collection`: câu mô tả phạm vi danh sách. */
  collectionLabel?: string;
  className?: string;
}

const CONTEXT_LABEL = 'Người được theo dõi';

function RoleChip({ role }: { role?: 'owner' | 'caregiver' }) {
  if (role !== 'caregiver') return null;
  return <span className="subject-context__role">Người thân</span>;
}

function PinnedContext({
  subject,
  className,
}: {
  subject: Pick<SubjectSummary, 'displayName' | 'role'>;
  className?: string;
}) {
  return (
    <div className={`subject-context${className ? ` ${className}` : ''}`} role="group" aria-label={CONTEXT_LABEL}>
      <span className="subject-context__label">{'Theo dõi: '}</span>
      <span className="subject-context__name">{subject.displayName}</span>
      <RoleChip role={subject.role} />
    </div>
  );
}

/**
 * Dòng ngữ cảnh hồ sơ đang chọn — một dòng compact, không card full-width.
 * - Một hồ sơ: "Theo dõi: {tên}" (+ chip "Người thân" nếu được chia sẻ).
 * - Nhiều hồ sơ: select ≥44px, label "Người được theo dõi".
 * - Đổi hồ sơ: thông báo polite "Đang xem {tên}", không đọc lại khi polling.
 */
function SelectedContextLine({ className }: { className?: string }) {
  const subjects = useSubjects();
  const selectedId = useActiveSubjectId();
  const [announcement, setAnnouncement] = useState('');
  const previousId = useRef<string | null>(null);

  const items = subjects.data ?? [];
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const effectiveId = selected?.id ?? null;

  useEffect(() => {
    if (!effectiveId) {
      previousId.current = null;
      return;
    }
    if (previousId.current && previousId.current !== effectiveId && selected) {
      setAnnouncement(`Đang xem ${selected.displayName}`);
    }
    previousId.current = effectiveId;
  }, [effectiveId, selected]);

  if (subjects.isPending) {
    return (
      <p className={`subject-context subject-context--muted${className ? ` ${className}` : ''}`} role="status" aria-busy="true">
        Đang tải hồ sơ…
      </p>
    );
  }

  if (subjects.isError) {
    // 404 là API hồ sơ chưa khả dụng, không phải lỗi mạng: không mời thử lại vô ích.
    if (isNotFoundError(subjects.error)) {
      return (
        <p className={`subject-context subject-context--muted${className ? ` ${className}` : ''}`}>
          Chưa kết nối được dữ liệu hồ sơ.
        </p>
      );
    }
    return (
      <p className={`subject-context subject-context--muted${className ? ` ${className}` : ''}`}>
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

  if (items.length === 0) {
    return (
      <p className={`subject-context subject-context--muted${className ? ` ${className}` : ''}`}>
        Chưa có hồ sơ nào.{' '}
        <Link className="subject-context__link" to="/app/subjects">
          Tạo hồ sơ
        </Link>
      </p>
    );
  }

  if (items.length === 1 && selected) {
    return (
      <div className={`subject-context${className ? ` ${className}` : ''}`} role="group" aria-label={CONTEXT_LABEL}>
        <span className="subject-context__label">{'Theo dõi: '}</span>
        <span className="subject-context__name">{selected.displayName}</span>
        <RoleChip role={selected.role} />
        <span className="visually-hidden" aria-live="polite">
          {announcement}
        </span>
      </div>
    );
  }

  return (
    <div className={`subject-context${className ? ` ${className}` : ''}`} role="group" aria-label={CONTEXT_LABEL}>
      <label className="subject-context__label" htmlFor="active-subject-select">
        {'Theo dõi: '}
      </label>
      <select
        id="active-subject-select"
        className="subject-context__select"
        aria-label={CONTEXT_LABEL}
        value={selected?.id ?? ''}
        onChange={(event) => setActiveSubjectId(event.target.value)}
      >
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.displayName}
            {item.role === 'caregiver' ? ' · người thân' : ''}
          </option>
        ))}
      </select>
      <span className="visually-hidden" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}

export function SubjectContextLine({
  scope = 'selected',
  subject,
  collectionLabel = 'Các hồ sơ bạn có quyền xem',
  className,
}: SubjectContextLineProps) {
  if (scope === 'none') return null;

  if (scope === 'collection') {
    return (
      <p
        className={`subject-context subject-context--muted${className ? ` ${className}` : ''}`}
        role="group"
        aria-label={CONTEXT_LABEL}
      >
        {collectionLabel}
      </p>
    );
  }

  if (scope === 'pinned') {
    if (!subject) return null;
    return <PinnedContext subject={subject} className={className} />;
  }

  return <SelectedContextLine className={className} />;
}

/**
 * Tên cũ mà AppShell (base `08fd3b5`) còn gọi ở các trang khác. Giữ export để
 * nhánh app tự build/đứng riêng; từ v7 shell render dòng ngữ cảnh dùng chung,
 * component này không còn render card "Hồ sơ đang xem" ở trang nào.
 */
export function SubjectSwitcher() {
  return null;
}
