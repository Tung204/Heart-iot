import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StudioViewsPage } from './StudioViewsPage';
import { errorEnvelope, mockResponse, renderPage, SUBJECT, USER } from '../../test/utils';
import { makeViewSummary, STUDIO_VIEW_ID } from './testFixtures';

// Wave 3 studio — danh sách view: trạng thái rỗng/lỗi + tạo view hợp lệ.
describe('StudioViewsPage — danh sách view', () => {
  it('danh sách rỗng → EmptyState và có nút "Tạo view"', async () => {
    renderPage(
      <StudioViewsPage />,
      (url) => {
        const u = url;
        if (u.endsWith('/me')) return mockResponse({ user: USER });
        if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
        if (u.endsWith('/workspace-views')) return mockResponse({ items: [] });
        return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
      },
    );

    expect(await screen.findByText('Chưa có view nào')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo view' })).toBeInTheDocument();
  });

  it('lỗi tải danh sách → ErrorState, bấm "Thử lại" gọi lại và hiển thị danh sách rỗng', async () => {
    let listCalls = 0;
    renderPage(<StudioViewsPage />, (url) => {
      const u = url;
      if (u.endsWith('/me')) return mockResponse({ user: USER });
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.endsWith('/workspace-views')) {
        listCalls += 1;
        if (listCalls === 1) {
          return mockResponse(errorEnvelope('Máy chủ đang bận.', 'INTERNAL'), 500);
        }
        return mockResponse({ items: [] });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    expect(await screen.findByText('Không tải được danh sách view')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('Chưa có view nào')).toBeInTheDocument();
    expect(listCalls).toBe(2);
  });

  it('danh sách hiển thị key/scope/trạng thái/publication; tạo view gửi đúng body', async () => {
    const posted: unknown[] = [];
    renderPage(<StudioViewsPage />, (url, init) => {
      const u = url;
      const method = init?.method ?? 'GET';
      if (u.endsWith('/me')) return mockResponse({ user: USER });
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.endsWith('/workspace-views') && method === 'POST') {
        posted.push(init?.body ? JSON.parse(String(init.body)) : null);
        return mockResponse(makeViewSummary({ id: '22222222-3333-4444-8555-666666666666' }), 201);
      }
      if (u.endsWith('/workspace-views')) {
        return mockResponse({
          items: [
            makeViewSummary({
              currentPublication: {
                id: '66666666-7777-4888-8999-000000000001',
                viewId: STUDIO_VIEW_ID,
                revision: 2,
                digest: 'abcdef1234567890',
                status: 'active',
                publishedAt: '2026-11-14T09:00:00.000Z',
                note: null,
                approvedBy: { id: USER.id, displayName: USER.displayName },
                publishedBy: { id: USER.id, displayName: USER.displayName },
              },
            }),
          ],
        });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    // Danh sách hiển thị thông tin view.
    expect(await screen.findByText('Tổng quan hằng ngày')).toBeInTheDocument();
    expect(screen.getByText(/to-quan-hang-ngay/)).toBeInTheDocument();
    expect(screen.getByText('Theo hồ sơ')).toBeInTheDocument();
    expect(screen.getByText(/đang công bố r2 \(abcdef12…\)/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quản lý' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem bản công bố' })).toBeInTheDocument();

    // Tạo view mới scope subject → body có subjectId của hồ sơ chủ.
    await user.click(screen.getByRole('button', { name: 'Tạo view' }));
    await user.type(screen.getByLabelText(/^Key/), 'view-moi');
    await user.type(screen.getByLabelText(/^Tên view/), 'View mới');
    await user.selectOptions(screen.getByLabelText(/Phạm vi/), 'subject');
    await user.selectOptions(screen.getByLabelText(/Hồ sơ/), SUBJECT.id);
    await user.click(screen.getByRole('button', { name: 'Tạo view' }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({
      key: 'view-moi',
      name: 'View mới',
      scope: 'subject',
      subjectId: SUBJECT.id,
      config: {
        version: 1,
        layout: 'stack',
        widgets: [{ id: 'widget-1', type: 'metric', title: 'Nhịp tim', span: 1 }],
      },
    });
  });

  it('key sai hợp đồng → lỗi field, không gọi POST', async () => {
    const posted: unknown[] = [];
    renderPage(<StudioViewsPage />, (url, init) => {
      const u = url;
      const method = init?.method ?? 'GET';
      if (u.endsWith('/me')) return mockResponse({ user: USER });
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.endsWith('/workspace-views') && method === 'POST') {
        posted.push(init?.body ? JSON.parse(String(init.body)) : null);
        return mockResponse(makeViewSummary(), 201);
      }
      if (u.endsWith('/workspace-views')) return mockResponse({ items: [] });
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await screen.findByText('Chưa có view nào');
    await user.click(screen.getByRole('button', { name: 'Tạo view' }));
    await user.type(screen.getByLabelText(/^Key/), 'KEY SAI');
    await user.type(screen.getByLabelText(/^Tên view/), 'View mới');
    await user.click(screen.getByRole('button', { name: 'Tạo view' }));

    expect(
      await screen.findByText('Key chỉ gồm chữ thường a-z, số 0-9 và dấu gạch ngang (2–40 ký tự).'),
    ).toBeInTheDocument();
    expect(posted).toHaveLength(0);
  });
});
