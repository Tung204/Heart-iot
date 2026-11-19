import { describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CarePage } from './CarePage';
import {
  ACTIVITY_REMINDER,
  REMINDER,
  REMINDER_DAY,
  SESSION,
  SUBJECT,
  USER,
  careApiHandler,
  errorEnvelope,
  mockResponse,
  renderPage,
  type CareApiOptions,
  type FetchHandler,
} from '../../test/utils';

const DISCLAIMER = 'Chỉ là nhắc việc bạn tự đặt, không thay tư vấn y tế.';

const CAREGIVER = {
  ...SUBJECT,
  role: 'caregiver' as const,
  permissions: { ...SUBJECT.permissions, canViewMeasurements: true },
};

function careHandler(
  subject: Record<string, unknown>,
  options: CareApiOptions = {},
): FetchHandler {
  const api = careApiHandler(options);
  return (url, init) => {
    const u = String(url);
    if (u.endsWith('/me')) return mockResponse(SESSION);
    if (u.endsWith('/subjects')) return mockResponse({ items: [subject] });
    return api(url, init);
  };
}

async function todayRegion() {
  return within(await screen.findByRole('region', { name: 'Hôm nay' }));
}

describe('CarePage — danh sách và quyền', () => {
  it('render danh sách lịch + hôm nay, một H1 và câu giới hạn chỉ một lần', async () => {
    renderPage(<CarePage />, careHandler(SUBJECT));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nhắc chăm sóc' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    const list = within(await screen.findByRole('region', { name: 'Lịch nhắc' }));
    expect(list.getByText('Uống thuốc huyết áp')).toBeInTheDocument();
    expect(list.getByText('Thuốc')).toBeInTheDocument();
    expect(list.getByText('Hằng ngày')).toBeInTheDocument();
    expect(list.getAllByText(/Từ 01\/11\/2026 · không đặt ngày kết thúc/).length).toBeGreaterThan(0);
    expect(list.getAllByText('Đang bật').length).toBeGreaterThan(0);
    expect(
      list.getByText('Thuốc do gia đình tự đặt, không phải chỉ định của hệ thống'),
    ).toBeInTheDocument();
    expect(list.getByText('Đi bộ nhẹ buổi chiều')).toBeInTheDocument();
    expect(list.getByText('T2, T3, T4, T5, T6')).toBeInTheDocument();

    const today = await todayRegion();
    expect(today.getByText('08:00')).toBeInTheDocument();
    expect(today.getAllByText('Uống thuốc huyết áp').length).toBeGreaterThan(0);
    expect(today.getAllByText('Chưa đánh dấu')).toHaveLength(2);

    expect(screen.getAllByText(DISCLAIMER)).toHaveLength(1);
  });

  it('chủ hồ sơ thấy nút tạo/sửa/xoá', async () => {
    renderPage(<CarePage />, careHandler(SUBJECT));

    expect(await screen.findByRole('button', { name: 'Tạo lịch nhắc' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sửa lịch nhắc Uống thuốc huyết áp' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xoá lịch nhắc Uống thuốc huyết áp' })).toBeInTheDocument();
  });

  it('người thân có quyền xem số đo không thấy nút tạo/sửa/xoá nhưng vẫn đánh dấu được', async () => {
    renderPage(<CarePage />, careHandler(CAREGIVER));

    expect((await screen.findAllByText('Uống thuốc huyết áp')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Tạo lịch nhắc' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sửa lịch nhắc/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Xoá lịch nhắc/ })).not.toBeInTheDocument();
    expect((await todayRegion()).getAllByRole('button', { name: 'Đã thực hiện' })).toHaveLength(2);
  });

  it('người thân thiếu quyền xem số đo → không gọi API nhắc và không lộ nội dung', async () => {
    const caregiverNoAccess = {
      ...CAREGIVER,
      permissions: { ...CAREGIVER.permissions, canViewMeasurements: false },
    };
    const calls: string[] = [];
    const api = careApiHandler();
    renderPage(<CarePage />, (url, init) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [caregiverNoAccess] });
      if (u.includes('/reminders') || u.includes('/visit-report')) calls.push(u);
      return api(url, init);
    });

    expect(
      await screen.findByText('Chủ hồ sơ không chia sẻ nhắc chăm sóc'),
    ).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    expect(screen.queryByText('Uống thuốc huyết áp')).not.toBeInTheDocument();
  });
});

describe('CarePage — tạo/sửa/xoá', () => {
  it('tạo thành công gửi POST đúng body đã sắp giờ/thứ', async () => {
    let posted: { url: string; body: Record<string, unknown> } | null = null;
    const user = userEvent.setup();
    renderPage(
      <CarePage />,
      careHandler(SUBJECT, {
        onCreate: (init) => {
          posted = {
            url: '/subjects',
            body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
          };
          return mockResponse(
            { ...REMINDER, title: 'Uống thuốc buổi sáng', times: ['08:00', '17:00'] },
            201,
          );
        },
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Tạo lịch nhắc' }));

    await user.selectOptions(screen.getByLabelText('Loại'), 'medication');
    await user.type(screen.getByLabelText(/Tiêu đề/), 'Uống thuốc buổi sáng');
    await user.type(screen.getByLabelText('Ghi chú'), 'Theo đơn của gia đình');
    await user.click(screen.getByRole('button', { name: 'Thêm giờ' }));
    fireEvent.change(screen.getByLabelText('Giờ nhắc 1'), { target: { value: '17:00' } });
    fireEvent.change(screen.getByLabelText('Giờ nhắc 2'), { target: { value: '08:00' } });
    await user.click(screen.getByRole('button', { name: 'Lưu lịch nhắc' }));

    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted!.body).toMatchObject({
      kind: 'medication',
      title: 'Uống thuốc buổi sáng',
      note: 'Theo đơn của gia đình',
      times: ['08:00', '17:00'],
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      endsOn: null,
      active: true,
    });
    // Form đóng sau khi lưu.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Lưu lịch nhắc' })).not.toBeInTheDocument(),
    );
  });

  it('lỗi 422 của server hiện theo trường', async () => {
    const user = userEvent.setup();
    renderPage(
      <CarePage />,
      careHandler(SUBJECT, {
        onCreate: () =>
          mockResponse(
            {
              code: 'VALIDATION_FAILED',
              message: 'Dữ liệu gửi lên không hợp lệ.',
              requestId: 'test-422',
              details: [{ path: 'title', message: 'Tiêu đề quá ngắn.' }],
            },
            422,
          ),
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Tạo lịch nhắc' }));
    await user.type(screen.getByLabelText(/Tiêu đề/), 'Uống thuốc');
    await user.click(screen.getByRole('button', { name: 'Lưu lịch nhắc' }));

    expect(await screen.findByText('Tiêu đề quá ngắn.')).toBeInTheDocument();
    // Form vẫn mở để sửa và gửi lại.
    expect(screen.getByRole('button', { name: 'Lưu lịch nhắc' })).toBeInTheDocument();
  });

  it('xoá có bước xác nhận rồi mới gọi DELETE', async () => {
    const user = userEvent.setup();
    const calls: Array<{ method?: string; url: string }> = [];
    renderPage(
      <CarePage />,
      careHandler(SUBJECT, {
        onDelete: (init) => {
          calls.push({ method: init?.method, url: 'delete' });
          return mockResponse(undefined, 204);
        },
      }),
    );

    await user.click(
      await screen.findByRole('button', { name: 'Xoá lịch nhắc Uống thuốc huyết áp' }),
    );
    expect(screen.getByText(/Xoá lịch nhắc này\?/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Xác nhận xoá' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.method).toBe('DELETE');
  });
});

describe('CarePage — hôm nay optimistic', () => {
  it('đánh dấu đã thực hiện hiện ngay, hoàn lại khi API 500 rồi tải lại', async () => {
    const user = userEvent.setup();
    let resolveResponse!: (response: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    let completionBody: Record<string, unknown> | null = null;

    renderPage(
      <CarePage />,
      careHandler(SUBJECT, {
        onCompletion: (_url, init) => {
          completionBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
          return gate;
        },
      }),
    );

    const today = await todayRegion();
    await user.click((await today.findAllByRole('button', { name: 'Đã thực hiện' }))[0]!);

    // Tối ưu trước: trạng thái và nút đổi ngay, chưa cần chờ server.
    expect(await today.findByText(/Đã thực hiện lúc/)).toBeInTheDocument();
    expect(today.getByRole('button', { name: 'Hoàn tác' })).toBeInTheDocument();

    await act(async () => {
      resolveResponse(mockResponse(errorEnvelope('Máy chủ lỗi.', 'INTERNAL'), 500));
      await gate;
    });

    await waitFor(() => {
      expect(screen.queryByText(/Đã thực hiện lúc/)).not.toBeInTheDocument();
    });
    expect(today.getAllByText('Chưa đánh dấu')).toHaveLength(2);
    expect(completionBody).toMatchObject({
      date: REMINDER_DAY.date,
      time: '08:00',
      status: 'done',
    });
  });

  it('hoàn tác gọi DELETE đúng ngày/giờ và trả hàng về chưa đánh dấu', async () => {
    const user = userEvent.setup();
    const deletedUrls: string[] = [];
    const doneDay = {
      ...REMINDER_DAY,
      items: [
        {
          reminder: ACTIVITY_REMINDER,
          time: '16:00',
          status: 'done',
          completion: {
            status: 'done',
            completedAt: '2026-11-19T01:00:00.000Z',
            completedBy: { userId: USER.id, displayName: USER.displayName },
          },
        },
      ],
    };

    let deleted = false;
    const options: CareApiOptions = {
      get day() {
        if (!deleted) return doneDay;
        return {
          ...doneDay,
          items: doneDay.items.map((item) => ({
            ...item,
            status: 'pending' as const,
            completion: null,
          })),
        };
      },
      onCompletion: (url, init) => {
        if (init?.method === 'DELETE') {
          deleted = true;
          deletedUrls.push(String(url));
          return mockResponse(undefined, 204);
        }
        return mockResponse(
          {
            reminderId: ACTIVITY_REMINDER.id,
            date: '2026-11-19',
            time: '16:00',
            status: 'done',
            completedAt: '2026-11-19T01:00:00.000Z',
            completedBy: { userId: USER.id, displayName: USER.displayName },
          },
        );
      },
    };

    renderPage(<CarePage />, careHandler(SUBJECT, options));

    const today = await todayRegion();
    await user.click(await today.findByRole('button', { name: 'Hoàn tác' }));

    expect(await today.findByText('Chưa đánh dấu')).toBeInTheDocument();
    await waitFor(() => expect(deletedUrls).toHaveLength(1));
    const deletedUrl = new URL(deletedUrls[0]!, 'http://localhost');
    expect(deletedUrl.pathname).toContain(
      `/subjects/${SUBJECT.id}/reminders/${ACTIVITY_REMINDER.id}/completions`,
    );
    expect(deletedUrl.searchParams.get('date')).toBe('2026-11-19');
    expect(deletedUrl.searchParams.get('time')).toBe('16:00');
  });
});
