import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { CreateSubjectInput, UpdateSubjectInput } from '@annhien/contracts/subjects';
import { Alert } from '../../components/Alert';
import { Button, ButtonLink } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { getApiErrorMessage } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { createSubject, updateSubject } from './api';
import { setActiveSubjectId } from './selection';
import { SubjectForm } from './SubjectForm';
import { useSubjects } from './useSubjects';

/**
 * /app/subjects — quản lý hồ sơ:
 * - Tạo hồ sơ (tên + múi giờ, mặc định Asia/Ho_Chi_Minh).
 * - Sửa tên hồ sơ mình sở hữu.
 * - Đi tới màn hình chia sẻ cho hồ sơ sở hữu.
 * - Vai trò (chủ/người thân) và quyền hiển thị rõ; không hiển thị dữ liệu sức khỏe.
 */
export function SubjectsPage() {
  const subjects = useSubjects();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (input: CreateSubjectInput) => createSubject(input),
    onSuccess: (created) => {
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjects });
      // Chọn ngay hồ sơ vừa tạo để dashboard hiển thị.
      setActiveSubjectId(created.id);
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSubjectInput }) =>
      updateSubject(id, input),
    onSuccess: () => {
      setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.subjects });
    },
  });

  if (subjects.isPending) {
    return <PageLoader label="Đang tải danh sách hồ sơ…" />;
  }

  if (subjects.isError) {
    return (
      <ErrorState
        title="Không tải được danh sách hồ sơ"
        message="Kiểm tra kết nối với máy chủ và thử lại."
        onRetry={() => void subjects.refetch()}
      />
    );
  }

  const items = subjects.data;

  return (
    <div className="stack">
      <header>
        <h1 className="page-title">Hồ sơ người được theo dõi</h1>
        <p className="page-lead">
          Tạo hồ sơ cho người cần theo dõi, sửa tên và mời người thân cùng xem.
        </p>
      </header>

      {items.length === 0 ? (
        <Card title="Tạo hồ sơ đầu tiên">
          {formError ? <Alert tone="error">{formError}</Alert> : null}
          <SubjectForm
            mode="create"
            pending={create.isPending}
            onSubmit={(values) => create.mutate(values)}
          />
        </Card>
      ) : (
        <>
          <section aria-labelledby="subject-list-heading">
            <h2 id="subject-list-heading" className="section-title">
              Danh sách hồ sơ
            </h2>
            <ul className="subject-list">
              {items.map((item) => (
                <li key={item.id} className="subject-list__item">
                  <div className="subject-list__info">
                    <p className="subject-list__name">
                      {item.displayName}
                      {item.role === 'caregiver' ? (
                        <StatusPill tone="sand" className="subject-list__badge">
                          Người thân xem hộ
                        </StatusPill>
                      ) : (
                        <StatusPill tone="teal" className="subject-list__badge">
                          Chủ hồ sơ
                        </StatusPill>
                      )}
                    </p>
                    <p className="subject-list__meta">
                      Múi giờ {item.timezone} · Xem lịch sử tối đa{' '}
                      {item.permissions.historyDays} ngày · Nhận cảnh báo:{' '}
                      {item.permissions.canReceiveAlerts ? 'có' : 'không'}
                    </p>
                  </div>
                  <div className="subject-list__actions">
                    {editingId === item.id ? (
                      <div className="subject-list__edit">
                        <SubjectForm
                          mode="edit"
                          initial={{ displayName: item.displayName, timezone: item.timezone }}
                          pending={update.isPending}
                          submitLabel="Lưu"
                          onCancel={() => setEditingId(null)}
                          onSubmit={(values) => update.mutate({ id: item.id, input: values })}
                        />
                        {update.isError ? (
                          <Alert tone="error">{getApiErrorMessage(update.error)}</Alert>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        {item.role === 'owner' ? (
                          <ButtonLink to={`/app/subjects/${item.id}/share`} variant="secondary" size="sm">
                            Chia sẻ
                          </ButtonLink>
                        ) : null}
                        {item.role === 'owner' ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingId(item.id)}
                            aria-label={`Sửa tên hồ sơ ${item.displayName}`}
                          >
                            Sửa tên
                          </Button>
                        ) : null}
                        <ButtonLink to="/app" variant="subtle" size="sm">
                          Xem tổng quan
                        </ButtonLink>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="subject-create-heading">
            <h2 id="subject-create-heading" className="section-title">
              Tạo hồ sơ mới
            </h2>
            <Card>
              {formError ? <Alert tone="error">{formError}</Alert> : null}
              <SubjectForm
                mode="create"
                pending={create.isPending}
                onSubmit={(values) => create.mutate(values)}
              />
            </Card>
          </section>
        </>
      )}

      <p className="subjects-page__note">
        Lưu ý: dữ liệu hiển thị trong ứng dụng là dữ liệu mô phỏng. Nếu bạn là người thân
        được mời xem hộ, quyền truy cập do chủ hồ sơ quyết định — hãy hỏi lại chủ hồ sơ nếu
        cần quyền khác.
        {' '}<Link to="/app">Về tổng quan</Link>
      </p>
    </div>
  );
}
