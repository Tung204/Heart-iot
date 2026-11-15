import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { SubjectsPage } from './SubjectsPage';
import { setActiveSubjectId } from './selection';
import { errorEnvelope, mockResponse, renderPage, type FetchHandler } from '../../test/utils';

const OWNER_SUBJECT = {
  id: '1f2d3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b',
  ownerUserId: '0f1d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b',
  displayName: 'Bà Năm',
  timezone: 'Asia/Ho_Chi_Minh',
  role: 'owner',
  permissions: {
    historyDays: 30,
    canReceiveAlerts: true,
    canAcknowledge: true,
    canResolve: true,
    canViewAi: false,
  },
  sharedFrom: null,
  createdAt: '2026-11-01T00:00:00.000Z',
};

const SECOND_SUBJECT = {
  ...OWNER_SUBJECT,
  id: '2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d',
  displayName: 'Ông Bình',
};

const CAREGIVER_SUBJECT = {
  ...OWNER_SUBJECT,
  ownerUserId: '9f8d7a6b-5c4d-4e3f-8a9b-0c1d2e3f4a5b',
  displayName: 'Bà An',
  role: 'caregiver',
  permissions: { ...OWNER_SUBJECT.permissions, canResolve: false, canViewAi: false },
};

const DELETION_RESPONSE = {
  id: '4f5d6a7b-8c9d-4e0f-9a2b-3c4d5e6f7a8b',
  status: 'recorded',
  recordedAt: '2026-11-15T08:30:00.000Z',
  note:
    'Đã ghi nhận yêu cầu xóa vào nhật ký kiểm toán. Đây là ghi nhận thủ công: dữ liệu chưa bị xóa.',
};

type RecordedCall = { path: string; method: string; body: unknown };

function recordCalls(handler: (call: RecordedCall) => Response | undefined) {
  const calls: RecordedCall[] = [];
  const fetchHandler: FetchHandler = (url, init) => {
    const call: RecordedCall = {
      path: url.replace('/api/v1', ''),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    };
    calls.push(call);
    return (
      handler(call) ??
      mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404)
    );
  };
  return { calls, fetchHandler };
}

function subjectRow(name: string): HTMLElement {
  return screen.getByText(name, { exact: true }).closest('li') as HTMLElement;
}

/** Thao tác quản trị hồ sơ nằm trong “Thêm thao tác”; mở đúng thẻ trước khi bấm. */
async function openOwnerActions(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
): Promise<void> {
  await user.click(within(subjectRow(name)).getByText('Thêm thao tác'));
}

describe('SubjectsPage — lưu trữ và yêu cầu xóa dữ liệu (FR-14)', () => {
  it('mở form lưu trữ, chặn thiếu lý do/sai tên, gửi đúng body, chuyển hồ sơ sau khi thành công', async () => {
    let items = [OWNER_SUBJECT, SECOND_SUBJECT];
    const { calls, fetchHandler } = recordCalls((call) => {
      if (call.path === '/subjects' && call.method === 'GET') return mockResponse({ items });
      if (call.path === `/subjects/${OWNER_SUBJECT.id}/archive` && call.method === 'POST') {
        items = items.filter((item) => item.id !== OWNER_SUBJECT.id);
        return mockResponse(undefined, 204);
      }
      return undefined;
    });
    setActiveSubjectId(OWNER_SUBJECT.id);
    renderPage(<SubjectsPage />, fetchHandler);
    const user = userEvent.setup();

    await screen.findByText('Bà Năm');
    const row = subjectRow('Bà Năm');
    await openOwnerActions(user, 'Bà Năm');
    await user.click(within(row).getByRole('button', { name: 'Lưu trữ hồ sơ' }));

    expect(
      await screen.findByRole('heading', { name: 'Lưu trữ hồ sơ “Bà Năm”' }),
    ).toBeInTheDocument();
    // Copy nói rõ hậu quả và dữ liệu không bị xóa.
    expect(screen.getByText(/Hồ sơ biến khỏi danh sách/)).toBeInTheDocument();
    expect(screen.getByText(/không bị xóa/)).toBeInTheDocument();

    // Thiếu lý do + thiếu tên xác nhận → lỗi tại chỗ, không gọi API.
    await user.click(screen.getByRole('button', { name: 'Xác nhận lưu trữ' }));
    expect(await screen.findByText('Vui lòng nhập lý do lưu trữ.')).toBeInTheDocument();
    expect(
      await screen.findByText('Vui lòng gõ đúng tên hồ sơ để xác nhận.'),
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);

    // Sai tên xác nhận → lỗi, vẫn không gọi API.
    await user.type(
      screen.getByLabelText(/^Lý do lưu trữ/),
      'Đã bàn giao thiết bị cho cơ sở mới và ngừng theo dõi.',
    );
    await user.type(
      screen.getByLabelText(/^Gõ đúng tên “Bà Năm” để xác nhận/),
      'Ông Bình',
    );
    await user.click(screen.getByRole('button', { name: 'Xác nhận lưu trữ' }));
    expect(
      await screen.findByText('Tên xác nhận không khớp với “Bà Năm”.'),
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);

    // Đúng tên (trim) → POST đúng body, thông báo thành công, chuyển hồ sơ.
    const confirmInput = screen.getByLabelText(/^Gõ đúng tên “Bà Năm” để xác nhận/);
    await user.clear(confirmInput);
    await user.type(confirmInput, '  Bà Năm  ');
    await user.click(screen.getByRole('button', { name: 'Xác nhận lưu trữ' }));

    await waitFor(() => expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1));
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      reason: 'Đã bàn giao thiết bị cho cơ sở mới và ngừng theo dõi.',
      // Schema hợp đồng trim giá trị trước khi gửi.
      confirmationName: 'Bà Năm',
    });
    expect(await screen.findByText(/Hồ sơ không còn hiển thị/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Bà Năm', { exact: true })).not.toBeInTheDocument());
    expect(screen.getByText('Ông Bình', { exact: true })).toBeInTheDocument();
    expect(window.localStorage.getItem('an:active-subject-id')).toBe(SECOND_SUBJECT.id);
  });

  it('lưu trữ gặp 409 hiển thị thông báo và giữ form để người dùng tải lại', async () => {
    const { fetchHandler } = recordCalls((call) => {
      if (call.path === '/subjects' && call.method === 'GET') {
        return mockResponse({ items: [OWNER_SUBJECT] });
      }
      if (call.path === `/subjects/${OWNER_SUBJECT.id}/archive`) {
        return mockResponse(
          errorEnvelope('Hồ sơ đã được lưu trữ trước đó.', 'CONFLICT'),
          409,
        );
      }
      return undefined;
    });
    setActiveSubjectId(OWNER_SUBJECT.id);
    renderPage(<SubjectsPage />, fetchHandler);
    const user = userEvent.setup();

    await screen.findByText('Bà Năm');
    await openOwnerActions(user, 'Bà Năm');
    await user.click(
      within(subjectRow('Bà Năm')).getByRole('button', { name: 'Lưu trữ hồ sơ' }),
    );
    await user.type(
      screen.getByLabelText(/^Lý do lưu trữ/),
      'Muốn đóng hồ sơ nhưng phiên bản trên máy chủ đã khác.',
    );
    await user.type(screen.getByLabelText(/^Gõ đúng tên “Bà Năm” để xác nhận/), 'Bà Năm');
    await user.click(screen.getByRole('button', { name: 'Xác nhận lưu trữ' }));

    expect(
      await screen.findByText(/Hồ sơ đã được lưu trữ trước đó/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Lưu trữ hồ sơ “Bà Năm”' }),
    ).toBeInTheDocument();
  });

  it('ghi nhận yêu cầu xóa: copy nói rõ chưa xóa, validate 10 ký tự + tên, thành công giữ hồ sơ', async () => {
    const { calls, fetchHandler } = recordCalls((call) => {
      if (call.path === '/subjects' && call.method === 'GET') {
        return mockResponse({ items: [OWNER_SUBJECT] });
      }
      if (call.path === `/subjects/${OWNER_SUBJECT.id}/deletion-requests`) {
        return mockResponse(DELETION_RESPONSE, 202);
      }
      return undefined;
    });
    setActiveSubjectId(OWNER_SUBJECT.id);
    renderPage(<SubjectsPage />, fetchHandler);
    const user = userEvent.setup();

    await screen.findByText('Bà Năm');
    await openOwnerActions(user, 'Bà Năm');
    await user.click(
      within(subjectRow('Bà Năm')).getByRole('button', { name: 'Yêu cầu xóa dữ liệu' }),
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Ghi nhận yêu cầu xóa dữ liệu cho “Bà Năm”',
      }),
    ).toBeInTheDocument();
    // Thông điệp giới hạn: chưa xóa ngay, chưa có job xóa tự động.
    expect(
      screen.getByText(/Phiên bản hiện tại chưa có tác vụ xóa tự động hay thời hạn xử lý/),
    ).toBeInTheDocument();
    expect(screen.getByText('ghi nhận thủ công')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ghi nhận yêu cầu xóa' }));
    expect(await screen.findByText('Vui lòng nhập lý do yêu cầu xóa.')).toBeInTheDocument();
    expect(
      await screen.findByText('Vui lòng gõ đúng tên hồ sơ để xác nhận.'),
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);

    const reasonInput = screen.getByLabelText(/^Lý do yêu cầu xóa/);
    await user.type(reasonInput, 'ngắn');
    await user.type(
      screen.getByLabelText(/^Gõ đúng tên “Bà Năm” để xác nhận/),
      'Bà Năm',
    );
    await user.click(screen.getByRole('button', { name: 'Ghi nhận yêu cầu xóa' }));
    expect(
      await screen.findByText('Lý do cần ít nhất 10 ký tự.'),
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);

    await user.clear(reasonInput);
    await user.type(
      reasonInput,
      'Gia đình yêu cầu xóa dữ liệu sau khi ngừng theo dõi.',
    );
    await user.click(screen.getByRole('button', { name: 'Ghi nhận yêu cầu xóa' }));

    await waitFor(() => expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1));
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      reason: 'Gia đình yêu cầu xóa dữ liệu sau khi ngừng theo dõi.',
      confirmationName: 'Bà Năm',
    });
    expect(
      await screen.findByText('Đã ghi nhận yêu cầu xóa — dữ liệu chưa bị xóa'),
    ).toBeInTheDocument();
    expect(screen.getByText(DELETION_RESPONSE.note)).toBeInTheDocument();
    expect(screen.getByText(DELETION_RESPONSE.id)).toBeInTheDocument();
    // Hồ sơ vẫn còn: không có thao tác xóa dữ liệu nào được thực hiện.
    expect(screen.getByText('Bà Năm', { exact: true })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Ghi nhận yêu cầu xóa dữ liệu cho “Bà Năm”' }),
    ).not.toBeInTheDocument();
  });

  it('caregiver không thấy thao tác lưu trữ/yêu cầu xóa', async () => {
    setActiveSubjectId(CAREGIVER_SUBJECT.id);
    renderPage(<SubjectsPage />, (url) => {
      if (url.endsWith('/subjects')) return mockResponse({ items: [CAREGIVER_SUBJECT] });
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByText('Người thân xem hộ')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu trữ hồ sơ' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Yêu cầu xóa dữ liệu' }),
    ).not.toBeInTheDocument();
  });
});

describe('SubjectsPage — hàng gọn, thêm người và chọn hồ sơ', () => {
  const listOnly = (items: unknown[]) => (url: string) => {
    if (url.endsWith('/subjects')) return mockResponse({ items });
    return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
  };

  it('Xem sức khỏe đặt đúng hồ sơ làm hồ sơ đang xem trước khi điều hướng', async () => {
    setActiveSubjectId(OWNER_SUBJECT.id);
    renderPage(
      <>
        <SubjectsPage />
        <Routes>
          <Route path="/app/overview" element={<p>Trang Sức khỏe</p>} />
        </Routes>
      </>,
      listOnly([OWNER_SUBJECT, SECOND_SUBJECT]),
    );
    const user = userEvent.setup();

    await screen.findByText('Ông Bình', { exact: true });
    await user.click(
      within(subjectRow('Ông Bình')).getByRole('link', { name: 'Xem sức khỏe' }),
    );

    expect(await screen.findByText('Trang Sức khỏe')).toBeInTheDocument();
    expect(window.localStorage.getItem('an:active-subject-id')).toBe(SECOND_SUBJECT.id);
  });

  it('Thiết bị cũng đặt đúng hồ sơ làm hồ sơ đang xem', async () => {
    setActiveSubjectId(OWNER_SUBJECT.id);
    renderPage(
      <>
        <SubjectsPage />
        <Routes>
          <Route path="/app/devices" element={<p>Trang Thiết bị</p>} />
        </Routes>
      </>,
      listOnly([OWNER_SUBJECT, SECOND_SUBJECT]),
    );
    const user = userEvent.setup();

    await screen.findByText('Ông Bình', { exact: true });
    await user.click(within(subjectRow('Ông Bình')).getByRole('link', { name: 'Thiết bị' }));

    expect(await screen.findByText('Trang Thiết bị')).toBeInTheDocument();
    expect(window.localStorage.getItem('an:active-subject-id')).toBe(SECOND_SUBJECT.id);
  });

  it('form thêm người chỉ mở khi bấm nút, đóng lại được; không còn section tạo tách rời', async () => {
    renderPage(<SubjectsPage />, listOnly([OWNER_SUBJECT]));
    const user = userEvent.setup();

    await screen.findByText('Bà Năm', { exact: true });
    expect(screen.queryByLabelText(/^Tên hiển thị/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Thêm người' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Thêm người' }));
    expect(await screen.findByLabelText(/^Tên hiển thị/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đóng' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    await waitFor(() =>
      expect(screen.queryByLabelText(/^Tên hiển thị/)).not.toBeInTheDocument(),
    );
  });

  it('chưa có hồ sơ → câu gợi ý ngắn, vẫn mở được form thêm người', async () => {
    renderPage(<SubjectsPage />, listOnly([]));
    const user = userEvent.setup();

    expect(await screen.findByText(/Chưa có hồ sơ nào/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thêm người' }));
    expect(await screen.findByLabelText(/^Tên hiển thị/)).toBeInTheDocument();
  });
});
