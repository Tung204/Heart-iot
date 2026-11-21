import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssistantPage } from './AssistantPage';
import {
  REMINDER,
  REMINDER_DAY,
  SESSION,
  SUBJECT,
  SUBJECT_STATUS,
  mockResponse,
  renderPage,
  type FetchHandler,
} from '../../test/utils';

const DAY_WITH_FOUR = {
  ...REMINDER_DAY,
  items: ['08:00', '09:00', '10:00', '11:00'].map((time, index) => ({
    reminder: {
      ...REMINDER,
      id: `a${index + 1}a1a1a1-1111-4111-8111-111111111111`,
      title: `Nhắc việc ${index + 1}`,
      times: [time],
    },
    time,
    status: 'pending' as const,
    completion: null,
  })),
};

interface Calls {
  reminders: string[];
  completions: Array<Record<string, unknown>>;
}

function assistantHandler(
  subject: Record<string, unknown>,
  day: unknown,
  calls: Calls,
): FetchHandler {
  return (url, init) => {
    const u = String(url);
    if (u.endsWith('/me')) return mockResponse(SESSION);
    if (u.endsWith('/subjects')) return mockResponse({ items: [subject] });
    if (u.endsWith('/status')) return mockResponse(SUBJECT_STATUS);
    if (u.endsWith('/alerts')) return mockResponse({ items: [], nextCursor: null });
    if (u.endsWith('/reminders/today')) {
      calls.reminders.push(u);
      return mockResponse(day);
    }
    if (u.includes('/completions')) {
      calls.completions.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      const match = /\/reminders\/([^/]+)\/completions/.exec(u);
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        date: string;
        time: string;
        status: 'done' | 'skipped';
      };
      return mockResponse({
        reminderId: match?.[1] ?? REMINDER.id,
        date: body.date,
        time: body.time,
        status: body.status,
        completedAt: '2026-11-19T01:00:00.000Z',
        completedBy: { userId: SESSION.user.id, displayName: SESSION.user.displayName },
      });
    }
    return mockResponse({ code: 'NOT_FOUND', message: 'Không tìm thấy.', requestId: 't' }, 404);
  };
}

describe('AssistantPage — thẻ Nhắc hôm nay', () => {
  it('có occurrence → thẻ hiện tối đa 3 việc và đánh dấu tại chỗ gửi đúng body', async () => {
    const user = userEvent.setup();
    const calls: Calls = { reminders: [], completions: [] };
    renderPage(
      <AssistantPage />,
      assistantHandler(SUBJECT, DAY_WITH_FOUR, calls),
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Hôm nay' })).toBeInTheDocument();
    const card = await screen.findByRole('region', { name: 'Nhắc hôm nay' });
    expect(within(card).getAllByRole('listitem')).toHaveLength(3);
    expect(within(card).getByText('Nhắc việc 1')).toBeInTheDocument();
    expect(within(card).queryByText('Nhắc việc 4')).not.toBeInTheDocument();
    expect(within(card).getByText('Còn 1 việc khác hôm nay.')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Xem tất cả' })).toHaveAttribute(
      'href',
      '/app/care',
    );

    await user.click(
      within(card).getByRole('button', { name: 'Đã thực hiện Nhắc việc 1 lúc 08:00' }),
    );
    await waitFor(() => expect(calls.completions).toHaveLength(1));
    expect(calls.completions[0]).toMatchObject({
      date: REMINDER_DAY.date,
      time: '08:00',
      status: 'done',
    });
  });

  it('không có quyền xem số đo → không gọi API nhắc và không render thẻ', async () => {
    const calls: Calls = { reminders: [], completions: [] };
    const caregiverNoAccess = {
      ...SUBJECT,
      role: 'caregiver' as const,
      permissions: { ...SUBJECT.permissions, canViewMeasurements: false },
    };
    renderPage(
      <AssistantPage />,
      assistantHandler(caregiverNoAccess, DAY_WITH_FOUR, calls),
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Hôm nay' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Nhắc hôm nay' })).toBeNull());
    expect(calls.reminders).toHaveLength(0);
  });

  it('không có occurrence → không render thẻ, không lỗi', async () => {
    const calls: Calls = { reminders: [], completions: [] };
    renderPage(
      <AssistantPage />,
      assistantHandler(SUBJECT, { ...REMINDER_DAY, items: [] }, calls),
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Hôm nay' })).toBeInTheDocument();
    await waitFor(() => expect(calls.reminders).toHaveLength(1));
    expect(screen.queryByRole('heading', { name: 'Nhắc hôm nay' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Chưa đánh dấu/)).not.toBeInTheDocument();
  });
});
