import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StudioViewDetailPage } from './StudioViewDetailPage';
import type { SubjectSummary } from '@heart-iot/contracts/subjects';
import { stubFetch, SUBJECT } from '../../test/utils';
import {
  createStudioState,
  makePublication,
  makeViewSummary,
  PUB_1_ID,
  PUB_2_ID,
  STUDIO_VIEW_ID,
  studioDetailHandler,
  type StudioHandlerOptions,
  type StudioState,
} from './testFixtures';

function renderDetail(state: StudioState, options?: StudioHandlerOptions) {
  stubFetch(studioDetailHandler(state, options));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/app/studio/${STUDIO_VIEW_ID}`]}>
        <Routes>
          <Route path="/app/studio/:id" element={<StudioViewDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Chờ trang nạp xong: form soạn hiển thị widget ban đầu. */
async function waitForEditor() {
  await screen.findByLabelText('Bố cục');
  await screen.findByDisplayValue('hr');
}

describe('StudioViewDetailPage — soạn config draft', () => {
  it('thêm widget, đổi thứ tự lên/xuống → PUT draft đúng thứ tự; xóa widget → config còn lại đúng', async () => {
    const state = createStudioState();
    renderDetail(state);
    const user = userEvent.setup();
    await waitForEditor();

    // Thêm widget thứ hai và đặt tiêu đề.
    await user.click(screen.getByRole('button', { name: /Thêm widget/ }));
    const titles = screen.getAllByLabelText(/^Tiêu đề/);
    expect(titles).toHaveLength(2);
    await user.type(titles[1]!, 'Biểu đồ nhịp tim');

    // Chuyển widget mới lên đầu.
    await user.click(screen.getByRole('button', { name: 'Chuyển widget Biểu đồ nhịp tim lên trên' }));

    // Lưu → body có widget-2 ở đầu, giữ nguyên thứ tự mảng (thứ tự layout có nghĩa).
    await user.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    await waitFor(() => expect(state.calls.drafts).toHaveLength(1));
    const firstDraft = state.calls.drafts[0] as { config: { widgets: { id: string; title: string }[] }; baseRevision: number };
    expect(firstDraft.baseRevision).toBe(1);
    expect(firstDraft.config.widgets.map((widget) => widget.id)).toEqual(['widget-2', 'hr']);
    expect(firstDraft.config.widgets[0]!.title).toBe('Biểu đồ nhịp tim');

    // Chờ form đồng bộ lại từ bản đã lưu (widget-2 lên đầu) rồi xóa widget ban đầu.
    await waitFor(() =>
      expect(screen.getAllByLabelText(/^Tiêu đề/)[0]).toHaveValue('Biểu đồ nhịp tim'),
    );
    await user.click(screen.getByRole('button', { name: 'Xóa widget Nhịp tim' }));
    await user.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    await waitFor(() => expect(state.calls.drafts).toHaveLength(2));
    const secondDraft = state.calls.drafts[1] as { config: { widgets: { id: string }[] } };
    expect(secondDraft.config.widgets.map((widget) => widget.id)).toEqual(['widget-2']);
  });

  it('options JSON sai → lỗi tại field, không gửi PUT draft', async () => {
    const state = createStudioState();
    renderDetail(state);
    const user = userEvent.setup();
    await waitForEditor();

    await user.type(screen.getByLabelText(/Options \(JSON/), '{{limit: 5');
    await user.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));

    expect(await screen.findByText('Options chưa phải JSON hợp lệ.')).toBeInTheDocument();
    expect(state.calls.drafts).toHaveLength(0);
  });

  it('options JSON hợp lệ → gửi kèm đối tượng options trong config', async () => {
    const state = createStudioState();
    renderDetail(state);
    const user = userEvent.setup();
    await waitForEditor();

    await user.type(screen.getByLabelText(/Options \(JSON/), '{{"limit": 5, "includeResolved": true}');
    await user.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));

    await waitFor(() => expect(state.calls.drafts).toHaveLength(1));
    const draftInput = state.calls.drafts[0] as { config: { widgets: { options?: Record<string, unknown> }[] } };
    expect(draftInput.config.widgets[0]!.options).toEqual({ limit: 5, includeResolved: true });
  });
});

describe('StudioViewDetailPage — preview', () => {
  it('preview mặc định hiện badge "Dữ liệu mẫu"; chọn hồ sơ → "Dữ liệu hồ sơ" + "Dữ liệu mô phỏng"', async () => {
    const state = createStudioState();
    renderDetail(state);
    const user = userEvent.setup();
    await waitForEditor();

    // Preview tự động (chế độ mẫu) khi nạp config draft — badge xuất hiện trong khung preview.
    expect(await screen.findByText('Dữ liệu mẫu', { selector: '.studio-datamode' })).toBeInTheDocument();

    // Chọn hồ sơ rồi xem trước → dữ liệu của hồ sơ, kèm nhãn mô phỏng khi
    // telemetry là tổng hợp (D9: không dùng "Dữ liệu thật").
    await user.selectOptions(screen.getByLabelText(/Xem trước với hồ sơ/), '1f2d3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b');
    await user.click(screen.getByRole('button', { name: 'Xem trước' }));

    expect(await screen.findByText('Dữ liệu hồ sơ · Bà Năm')).toBeInTheDocument();
    expect(screen.getByText('Dữ liệu mô phỏng')).toBeInTheDocument();
    expect(screen.queryByText(/Dữ liệu thật/)).not.toBeInTheDocument();
    const previews = state.calls.previews as { previewSubjectId?: string }[];
    expect(previews.at(-1)?.previewSubjectId).toBe('1f2d3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b');
  });

  it('draft chưa lưu → chặn xem trước bằng thông báo, không gọi POST previews', async () => {
    const state = createStudioState();
    renderDetail(state);
    const user = userEvent.setup();
    await waitForEditor();
    const previewCallsBefore = state.calls.previews.length;

    await user.clear(screen.getAllByLabelText(/^Tiêu đề/)[0]!);
    await user.type(screen.getAllByLabelText(/^Tiêu đề/)[0]!, 'Tiêu đề đã sửa');
    await user.click(screen.getByRole('button', { name: 'Xem trước' }));

    expect(
      await screen.findByText('Bạn có thay đổi chưa lưu — hãy lưu bản nháp rồi xem trước để preview khớp với bản đã lưu.'),
    ).toBeInTheDocument();
    expect(state.calls.previews).toHaveLength(previewCallsBefore);
  });
});

describe('StudioViewDetailPage — publish', () => {
  it('công bố gửi đúng draftRevision/digest/baseRevision từ preview và note', async () => {
    const state = createStudioState();
    renderDetail(state);
    const user = userEvent.setup();
    await waitForEditor();

    // Nút công bố bật sau khi preview tự động thành công.
    const publishButton = await screen.findByRole('button', { name: 'Công bố bản nháp' });
    expect(publishButton).not.toBeDisabled();

    await user.type(screen.getByLabelText(/Ghi chú/), 'Bản đầu tiên');
    await user.click(publishButton);

    await waitFor(() => expect(state.calls.publishes).toHaveLength(1));
    expect(state.calls.publishes[0]).toEqual({
      draftRevision: 3,
      digest: 'digest-r3-aaaa',
      baseRevision: 1,
      note: 'Bản đầu tiên',
    });
    expect(await screen.findByText(/Đã công bố bản r1/)).toBeInTheDocument();
  });

  it('409 APPROVAL_STALE → thông báo trạng thái hiện tại + nút tải lại, không tự publish lại', async () => {
    const state = createStudioState();
    renderDetail(state, {
      publishError: {
        code: 'APPROVAL_STALE',
        message: 'Bản đã duyệt không còn khớp trạng thái hiện tại, hãy preview lại.',
        details: {
          currentDraftRevision: 5,
          currentDraftDigest: 'digest-new-abcdef',
          currentBaseRevision: 2,
        },
      },
    });
    const user = userEvent.setup();
    await waitForEditor();

    const publishButton = await screen.findByRole('button', { name: 'Công bố bản nháp' });
    await user.click(publishButton);

    expect(
      await screen.findByText('Bản đã duyệt không còn khớp trạng thái hiện tại, hãy preview lại.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Trạng thái hiện tại: draft hiện tại r5 · digest digest-n… · base r2/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải lại' })).toBeInTheDocument();

    // Không tự gửi lại publish — chỉ đúng một lần gọi.
    expect(state.calls.publishes).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(state.calls.publishes).toHaveLength(1);
  });
});

describe('StudioViewDetailPage — rollback', () => {
  it('rollback cần xác nhận và gửi đúng publicationId', async () => {
    const state = createStudioState();
    state.publications = [
      makePublication({ id: PUB_2_ID, revision: 2, digest: 'digest-r2-eeee', status: 'active' }),
      makePublication({ id: PUB_1_ID, revision: 1, digest: 'digest-r1-bbbb', status: 'superseded' }),
    ];
    renderDetail(state);
    const user = userEvent.setup();
    await waitForEditor();

    // Chỉ bản không active mới có nút rollback.
    const rollbackButtons = await screen.findAllByRole('button', { name: 'Rollback' });
    expect(rollbackButtons).toHaveLength(1);

    // Bấm rollback → hộp xác nhận; chưa gửi gì.
    await user.click(rollbackButtons[0]!);
    expect(
      screen.getByText(/Rollback tạo bản công bố MỚI chứa config của bản này/),
    ).toBeInTheDocument();
    expect(state.calls.rollbacks).toHaveLength(0);

    // Xác nhận → gửi đúng publicationId của bản r1.
    await user.click(screen.getByRole('button', { name: 'Xác nhận rollback' }));
    await waitFor(() => expect(state.calls.rollbacks).toHaveLength(1));
    expect(state.calls.rollbacks[0]).toEqual({ publicationId: PUB_1_ID });
    expect(await screen.findByText(/Đã rollback về bản r1 — tạo bản mới r3/)).toBeInTheDocument();
  });
});

// P3-02 / Studio subject-scope phải có dòng nhận diện hồ sơ (pinned), lấy tên từ
// API chứ không hard-code; scope global/account không có dòng này.
describe('StudioViewDetailPage — dòng nhận diện hồ sơ', () => {
  it('scope subject → đúng một dòng "Theo dõi: {tên}" trên H1, không select tự do', async () => {
    // Tên khác fixture mặc định để chứng minh lấy từ API view + danh sách hồ sơ.
    const subjectFromApi: SubjectSummary = {
      ...SUBJECT,
      id: '9f8e7d6c-5b4a-4392-8170-0f1e2d3c4b5a',
      displayName: 'Bà Trần Thị An',
      role: 'owner' as const,
      permissions: { ...SUBJECT.permissions, canViewMeasurements: true },
    };
    const state = createStudioState();
    state.view = makeViewSummary({ subjectId: subjectFromApi.id });
    renderDetail(state, { subjects: [subjectFromApi] });
    await waitForEditor();

    const context = await screen.findByRole('group', { name: 'Người được theo dõi' });
    expect(context).toHaveTextContent('Theo dõi: Bà Trần Thị An');
    // Ghim theo view, không có select đổi hồ sơ tại đây.
    expect(within(context).queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'Người được theo dõi' })).toHaveLength(1);

    // Dòng ngữ cảnh đứng trước H1 của trang.
    const heading = screen.getByRole('heading', { level: 1, name: 'Tổng quan hằng ngày' });
    expect(
      context.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('scope global → không có dòng nhận diện hồ sơ', async () => {
    const state = createStudioState();
    state.view = makeViewSummary({ scope: 'global', subjectId: null, key: 'toan-he-thong' });
    renderDetail(state);
    await waitForEditor();

    // Chờ danh sách hồ sơ đã tải xong (option của select preview) rồi mới kết luận.
    await screen.findByRole('option', { name: 'Bà Năm' });
    expect(
      screen.queryByRole('group', { name: 'Người được theo dõi' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^Theo dõi:/)).not.toBeInTheDocument();
  });
});
