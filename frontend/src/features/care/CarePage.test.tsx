import { describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CarePage } from './CarePage';
import {
  ACTIVITY_REMINDER,
  CARE_ADHERENCE_7,
  REMINDER,
  REMINDER_DAY,
  SESSION,
  SUBJECT,
  USER,
  careAdherenceForDays,
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

async function adherenceRegion() {
  return within(await screen.findByRole('region', { name: 'Tổng hợp chăm sóc' }));
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

    const adherence = await adherenceRegion();
    expect(adherence.getByText('Đã làm 8 · Bỏ qua 1 · Chưa ghi nhận 3')).toBeInTheDocument();
    expect(adherence.getByText('Ghi nhận 75% · Hoàn thành 89%')).toBeInTheDocument();
    expect(
      adherence.getByText('Chưa ghi nhận nghĩa là chưa có ai đánh dấu, không phải chưa làm.'),
    ).toBeInTheDocument();
    const days = within(adherence.getByRole('list', { name: 'Từng ngày trong 7 ngày' }));
    expect(days.getAllByRole('listitem')).toHaveLength(7);
    expect(days.getByText('T2 16/11')).toBeInTheDocument();
    expect(days.getAllByText('2/2 đã làm').length).toBeGreaterThan(0);
  });

  it('null tỉ lệ hiển thị —, không phải 0%', async () => {
    const nullRates = {
      ...CARE_ADHERENCE_7,
      totals: {
        ...CARE_ADHERENCE_7.totals,
        recordedPercent: null,
        completionPercent: null,
      },
    };
    renderPage(<CarePage />, careHandler(SUBJECT, { adherence: nullRates }));

    const adherence = await adherenceRegion();
    expect(adherence.getByText('Ghi nhận — · Hoàn thành —')).toBeInTheDocument();
    expect(adherence.queryByText('Ghi nhận 0% · Hoàn thành 0%')).not.toBeInTheDocument();
  });

  it('đổi 7 → 30 gọi days=30, hiện 5 nhóm tuần rồi đổi lại 7', async () => {
    const user = userEvent.setup();
    const requested: string[] = [];
    renderPage(
      <CarePage />,
      careHandler(SUBJECT, {
        onAdherence: (url) => {
          requested.push(String(url));
          const days = new URL(String(url), 'http://localhost').searchParams.get('days') === '30' ? 30 : 7;
          return mockResponse(careAdherenceForDays(days));
        },
      }),
    );

    const adherence = await adherenceRegion();
    const range = within(adherence.getByRole('group', { name: 'Khoảng thời gian tổng hợp' }));
    await user.click(range.getByRole('button', { name: '30 ngày' }));

    await waitFor(() => expect(requested.some((url) => url.includes('days=30'))).toBe(true));
    const weeks = within(await adherence.findByRole('list', { name: 'Từng tuần trong 30 ngày' }));
    expect(weeks.getAllByRole('listitem')).toHaveLength(5);
    expect(adherence.getByText('30 ngày gần đây')).toBeInTheDocument();
    expect(range.getByRole('button', { name: '30 ngày' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(adherence.queryByRole('list', { name: 'Từng ngày trong 7 ngày' })).not.toBeInTheDocument();

    await user.click(range.getByRole('button', { name: '7 ngày' }));
    expect(
      await adherence.findByRole('list', { name: 'Từng ngày trong 7 ngày' }),
    ).toBeInTheDocument();
    expect(range.getByRole('button', { name: '7 ngày' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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
    expect(screen.queryByRole('heading', { level: 2, name: 'Nhắc chủ động' })).not.toBeInTheDocument();
    const adherence = await adherenceRegion();
    expect(adherence.getByText('Đã làm 8 · Bỏ qua 1 · Chưa ghi nhận 3')).toBeInTheDocument();
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
      if (
        u.includes('/reminders') ||
        u.includes('/care/adherence') ||
        u.includes('/visit-report')
      ) {
        calls.push(u);
      }
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

describe('CarePage — tổng hợp tuân thủ', () => {
  it('đánh dấu hôm nay làm mới tổng hợp', async () => {
    const user = userEvent.setup();
    let adherenceCalls = 0;
    renderPage(
      <CarePage />,
      careHandler(SUBJECT, {
        onAdherence: () => {
          adherenceCalls += 1;
          return mockResponse(CARE_ADHERENCE_7);
        },
      }),
    );

    await adherenceRegion();
    const before = adherenceCalls;
    const today = await todayRegion();
    await user.click((await today.findAllByRole('button', { name: 'Đã thực hiện' }))[0]!);
    await waitFor(() => expect(adherenceCalls).toBeGreaterThan(before));
  });

  it('lịch đã lưu trữ có pill, vẫn hiện số liệu và không có nút sửa/xoá', async () => {
    const archived = {
      ...CARE_ADHERENCE_7,
      reminders: [
        {
          ...CARE_ADHERENCE_7.reminders[0],
          reminderId: 'a3a3a3a3-3333-4333-8333-333333333333',
          title: 'Lịch đã lưu trữ',
          active: false,
          archived: true,
          scheduled: 3,
          done: 2,
          skipped: 0,
          pending: 1,
          recordedPercent: 67,
          completionPercent: 100,
        },
      ],
    };
    renderPage(<CarePage />, careHandler(SUBJECT, { adherence: archived }));

    const adherence = await adherenceRegion();
    const title = adherence.getByRole('heading', { level: 3, name: 'Lịch đã lưu trữ' });
    const card = title.closest('li');
    expect(card).not.toBeNull();
    expect(within(card!).getByText('Đã lưu trữ')).toBeInTheDocument();
    expect(within(card!).getByText('Đã làm 2 · Bỏ qua 0 · Chưa ghi nhận 1')).toBeInTheDocument();
    expect(within(card!).queryByRole('button')).not.toBeInTheDocument();
  });

  it('403 hiện câu quyền, không có nút Thử lại và không gọi lại', async () => {
    let calls = 0;
    renderPage(
      <CarePage />,
      careHandler(SUBJECT, {
        onAdherence: () => {
          calls += 1;
          return mockResponse(errorEnvelope('Không có quyền xem.', 'FORBIDDEN'), 403);
        },
      }),
    );

    const adherence = await adherenceRegion();
    expect(
      await adherence.findByText('Chủ hồ sơ không chia sẻ tổng hợp chăm sóc'),
    ).toBeInTheDocument();
    expect(adherence.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
    expect(calls).toBe(1);
  });

  it('500 hiện ErrorState và Thử lại gọi lại', async () => {
    const user = userEvent.setup();
    let calls = 0;
    renderPage(
      <CarePage />,
      careHandler(SUBJECT, {
        onAdherence: () => {
          calls += 1;
          if (calls === 1) {
            return mockResponse(errorEnvelope('Máy chủ lỗi.', 'INTERNAL'), 500);
          }
          return mockResponse(CARE_ADHERENCE_7);
        },
      }),
    );

    const adherence = await adherenceRegion();
    expect(
      await adherence.findByText('Không tải được tổng hợp chăm sóc'),
    ).toBeInTheDocument();
    await user.click(adherence.getByRole('button', { name: 'Thử lại' }));
    expect(await adherence.findByText('Đã làm 8 · Bỏ qua 1 · Chưa ghi nhận 3')).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('empty state cho owner có nút tạo mở form, không hiện bảng 0', async () => {
    const user = userEvent.setup();
    const empty = {
      ...CARE_ADHERENCE_7,
      totals: {
        scheduled: 0,
        done: 0,
        skipped: 0,
        pending: 0,
        recordedPercent: null,
        completionPercent: null,
      },
      series: CARE_ADHERENCE_7.series.map((day) => ({
        ...day,
        scheduled: 0,
        done: 0,
        skipped: 0,
        pending: 0,
      })),
      reminders: [],
    };
    renderPage(<CarePage />, careHandler(SUBJECT, { adherence: empty }));

    const adherence = await adherenceRegion();
    expect(
      await adherence.findByText('Chưa có lịch nhắc trong 7 ngày'),
    ).toBeInTheDocument();
    expect(adherence.queryByText('Đã làm 0 · Bỏ qua 0 · Chưa ghi nhận 0')).not.toBeInTheDocument();

    await user.click(adherence.getByRole('button', { name: 'Tạo lịch nhắc' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Tạo lịch nhắc' }),
    ).toBeInTheDocument();
  });

  it('loading có aria-busy và skeleton, sau đó hiện số liệu', async () => {
    let resolveAdherence!: (response: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      resolveAdherence = resolve;
    });
    renderPage(
      <CarePage />,
      careHandler(SUBJECT, { onAdherence: () => gate }),
    );

    const section = await screen.findByRole('region', { name: 'Tổng hợp chăm sóc' });
    expect(section).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Đang tải tổng hợp chăm sóc…')).toBeInTheDocument();

    await act(async () => {
      resolveAdherence(mockResponse(CARE_ADHERENCE_7));
      await gate;
    });
    expect(await screen.findByText('Đã làm 8 · Bỏ qua 1 · Chưa ghi nhận 3')).toBeInTheDocument();
    await waitFor(() => expect(section).toHaveAttribute('aria-busy', 'false'));
  });
});
